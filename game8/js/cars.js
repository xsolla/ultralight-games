// ============================================================================
// cars.js — процедурные машины и их покадровое оживление. Моделей нет: каждая машина собирается из
// профиля кузова (CONFIG.CAR_TYPES), стёкол, колёс, расширителей арок, фар, габаритов и бамперов.
//
//   Cars.make(type, color)  -> { holder, body, hull, bodyMat, wheels, lamps, shadow, r, height }   (hull: меш кузова)
//   Cars.update(car, dt, t, busy)   каждый кадр: фонари, изгиб дороги, колёса, покачивание, пятно тени
//
// Иерархия: car.node (накладывает изгиб дороги) > car.holder (логическая позиция в сетке, её двигает
// Game) > car.body (локальные смещения анимаций: удар, подача, наклон). Игровая логика работает только
// с holder и body и об изгибе ничего не знает.
//
// Кузов: профиль со скруглёнными изломами выдавливается по ширине со скруглённым скосом, выше линии стёкол
// сужается к крыше, нормали сглаживаются по углу. Краска, стёкла и диски отражают небо темы (карта отражений
// рисуется в applyTheme). Вид в CONFIG.CAR_LOOK.
//
// Модельные размеры (фары, бамперы, колёса) живут здесь, баланс и профили кузовов в constants.js.
// ============================================================================

const Cars = {
  glassMat: null, tireMat: null, rimMat: null, headMat: null, darkMat: null, plateMat: null, glowTex: null,
  beamMat: null, headGlowMat: null,   // свет фар (полоса на дороге и ореол), общие для всех машин; яркость задаёт тема
  shadowMat: null,                    // мягкое пятно тени под машиной
  pmrem: null, envRT: null,           // карта отражений неба темы: одна цель рендера, перерисовывается в applyTheme

  init() {
    const FX = CONFIG.THEMES.FX, CL = CONFIG.CAR_LOOK;
    // полоса света фар: трапеция, расширяется вперёд и гаснет к дальнему концу (u = 0 у машины)
    const [bc, bg] = Util.canvas(256, 128), grad = bg.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    bg.filter = 'blur(7px)'; bg.fillStyle = grad;
    bg.beginPath(); bg.moveTo(8, 40); bg.lineTo(248, 8); bg.lineTo(248, 120); bg.lineTo(8, 88); bg.closePath(); bg.fill();
    const additive = { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false };
    Cars.beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), color: FX.BEAM.COLOR, ...additive,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });   // поверх дороги и заплаток развилок
    Cars.headGlowMat = new THREE.SpriteMaterial({ map: Util.glowTexture(), color: FX.HEAD_GLOW.COLOR, ...additive });

    Cars.pmrem = new THREE.PMREMGenerator(Stage.renderer);
    const G = CL.GLASS, R = CL.RIM;
    Cars.glassMat = new THREE.MeshPhysicalMaterial({ color: G.COLOR, roughness: G.ROUGHNESS, metalness: G.METALNESS, envMapIntensity: G.ENV });
    Cars.rimMat = new THREE.MeshStandardMaterial({ color: R.COLOR, roughness: R.ROUGHNESS, metalness: R.METALNESS, envMapIntensity: R.ENV });
    Cars.tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.92 });
    Cars.headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d8, emissive: 0xfff2b0, emissiveIntensity: 1.2 });
    Cars.darkMat = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.6 });
    Cars.plateMat = new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.5 });
    // текстура мягкого свечения фонарей
    const [c, g] = Util.canvas(64, 64), r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    Cars.glowTex = new THREE.CanvasTexture(c);
    // пятно тени: размытый скруглённый прямоугольник (u вдоль машины)
    const [sc, sg] = Util.canvas(256, 128);
    sg.filter = 'blur(14px)'; sg.fillStyle = '#000';
    sg.beginPath(); sg.roundRect(34, 30, 188, 68, 30); sg.fill();
    Cars.shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), color: 0x000000, transparent: true,
      opacity: CL.SHADOW.OPACITY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  },

  // ---- профиль кузова ----
  // Высота верхнего профиля в точке x
  topY(curve, x) {
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1];
      if (x >= a[0] && x <= b[0]) { const dx = b[0] - a[0]; return dx < 1e-9 ? a[1] : a[1] + (b[1] - a[1]) * (x - a[0]) / dx; }
    }
    return -Infinity;
  },

  // Профиль со скруглёнными изломами: каждый излом заменяется квадратичной кривой, которая начинается и кончается
  // на расстоянии до rad от вершины (не больше 0.45 соседнего отрезка). У крайних точек профиля излом образует
  // вертикальный торец (от днища yb), там радиус rEnd.
  roundCurve(curve, yb, rad, rEnd) {
    const pts = [[curve[0][0], yb], ...curve, [curve[curve.length - 1][0], yb]], out = [], N = CONFIG.CAR_LOOK.SHAPE.CORNER_STEPS;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1], b = pts[i + 1];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = i === 1 || i === pts.length - 2 ? rEnd : rad, da = Math.min(rr, la * 0.45), db = Math.min(rr, lb * 0.45);
      if (da < 1e-4 || db < 1e-4) { out.push(p); continue; }
      const pa = [p[0] + (a[0] - p[0]) * da / la, p[1] + (a[1] - p[1]) * da / la];
      const pb = [p[0] + (b[0] - p[0]) * db / lb, p[1] + (b[1] - p[1]) * db / lb];
      for (let k = 0; k <= N; k++) {
        const t = k / N, u = 1 - t;
        out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
      }
    }
    return out;
  },

  // Замкнутая фигура: нижняя линия yb и ломаная профиля сверху. Совпадающие точки и точки на прямой между
  // соседями выбрасываются: на них триангуляция может пропустить треугольник, и в стекле будет дыра.
  // chamfer: острые (меньше 95°) углы срезаются на это расстояние. Скос three у острого угла выходит короче
  // (длина ограничена), и стекло у такого угла ушло бы внутрь кузова.
  pathFrom(points, yb, chamfer = 0) {
    const raw = [[points[0][0], yb], ...points, [points[points.length - 1][0], yb]], pts = [];
    for (const p of raw) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) pts.push(p); }
    const nb = (arr, i) => [arr[(i + arr.length - 1) % arr.length], arr[(i + 1) % arr.length]];
    // точка выбрасывается, если отрезки от последней оставленной до неё и от неё до следующей почти на одной прямой
    // (синус угла меньше 1e-3), так что плавные кривые не теряют форму
    let kept = [];
    pts.forEach((p, i) => {
      const a = kept.length ? kept[kept.length - 1] : pts[pts.length - 1], b = pts[(i + 1) % pts.length];
      const ax = p[0] - a[0], ay = p[1] - a[1], bx = b[0] - p[0], by = b[1] - p[1];
      if (Math.abs(ax * by - ay * bx) > 1e-3 * Math.hypot(ax, ay) * Math.hypot(bx, by)) kept.push(p);
    });
    if (chamfer) kept = kept.flatMap((p, i) => {
      const [a, b] = nb(kept, i), ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if ((ax * bx + ay * by) / (la * lb) < Math.cos(THREE.MathUtils.degToRad(95))) return [p];
      const da = Math.min(chamfer, la * 0.3), db = Math.min(chamfer, lb * 0.3);
      return [[p[0] + ax * da / la, p[1] + ay * da / la], [p[0] + bx * db / lb, p[1] + by * db / lb]];
    });
    const s = new THREE.Shape();
    kept.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    s.closePath();
    return s;
  },

  // Полоса профиля между высотами yb..yt для стёкол, может распасться на несколько фигур
  bandShapes(curve, yb, yt, xr) {
    const xs = new Set();
    for (const p of curve) { xs.add(p[0]); xs.add(p[0] - 1e-3); xs.add(p[0] + 1e-3); }
    if (xr) { xs.add(xr[0]); xs.add(xr[1]); xs.add(xr[0] + 1e-3); xs.add(xr[1] - 1e-3); }
    const sorted = [...xs].sort((a, b) => a - b);
    const shapes = []; let run = [], prevX = null;
    const flush = () => { if (run.length >= 2) shapes.push(Cars.pathFrom(run, yb, 0.04)); run = []; };
    for (const x of sorted) {
      let y = Cars.topY(curve, x);
      if (xr && (x < xr[0] || x > xr[1])) y = -Infinity;
      // у верхней кромки (от yt - 0.1) стекло плавно уходит на 0.05 под профиль, иначе его скос, срезанный по yt,
      // пересекается со скосом крыши и выглядывает над ней
      const top = Math.min(y - 0.05 * Util.smooth((y - yt + 0.1) / 0.1), yt);
      if (y > yb + 1e-4) { if (!run.length && prevX !== null) run.push([prevX, yb]); run.push([x, top]); }
      else if (run.length) { run.push([x, yb]); flush(); }
      prevX = x;
    }
    flush();
    return shapes;
  },

  // Выдавливание по ширине (локальная z) на всю ширину w, со скруглённым скосом размера bevel
  extrude(shape, w, bevel, segments) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segments, curveSegments: 10 });
    geo.translate(0, 0, -(w - 2 * bevel) / 2);
    return geo;
  },

  // Сужение кузова к крыше: выше линии стёкол y0 ширина линейно уменьшается до (1 - taper) на высоте крыши y1.
  // Именно линейно: большие треугольники боков кузова и мелкие треугольники стёкол тогда лежат на одной
  // поверхности, а с плавной кривой кузов местами протыкает стекло.
  taper(geo, y0, y1, taper) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - taper * Util.clamp((p.getY(i) - y0) / (y1 - y0), 0, 1)));
  },

  // Расширитель арки над колёсами группы осей xs (близкие оси под одной аркой): полукольцо над осью,
  // выдавленное наружу от борта
  flare(xs, T, mat) {
    const F = CONFIG.CAR_LOOK.FLARE, ri = T.r * F.RI, ro = T.r * F.RO, a = -F.DOWN, xa = xs[0], xb = xs[xs.length - 1];
    const s = new THREE.Shape();
    s.absarc(xb, T.r, ro, a, Math.PI / 2, false);
    s.absarc(xa, T.r, ro, Math.PI / 2, Math.PI - a, false);
    s.absarc(xa, T.r, ri, Math.PI - a, Math.PI / 2, true);
    s.absarc(xb, T.r, ri, Math.PI / 2, a, true);
    s.closePath();
    const depth = T.ww / 2 + 0.02 + F.OUT + 0.06;   // от 0.06 внутри борта до OUT за наружной стороной шины
    const geo = new THREE.ExtrudeGeometry(s, { depth: depth - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 12 });
    Util.creaseNormals(geo, THREE.MathUtils.degToRad(CONFIG.CAR_LOOK.SHAPE.CREASE));
    const m = new THREE.Mesh(geo, mat); m.castShadow = true;
    return { mesh: m, depth };
  },

  // Колесо: шина со скруглёнными краями, диск со спицами и колпачком. spin крутится вокруг оси колеса (локальная y)
  wheel(T, s) {
    const r = T.r, hw = T.ww / 2, e = Math.min(0.08, hw * 0.4), ri = r * 0.62;
    const prof = [[ri, -hw], [r - e, -hw], [r - e * 0.3, -hw + e * 0.3], [r, -hw + e], [r, hw - e], [r - e * 0.3, hw - e * 0.3], [r - e, hw], [ri, hw]];
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 24), Cars.tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, T.ww - 0.06, 20), Cars.rimMat);
    const face = s * (hw - 0.03);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.17, r * 0.2, 0.06, 12), Cars.darkMat); hub.position.y = face + s * 0.03;
    spin.add(tire, rim, hub);
    for (let i = 0; i < 5; i++) {
      const ang = i / 5 * Math.PI * 2, len = ri * 0.82;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.075), Cars.darkMat);
      sp.position.set(Math.cos(ang) * len / 2, face + s * 0.012, Math.sin(ang) * len / 2); sp.rotation.y = -ang;
      spin.add(sp);
    }
    return spin;
  },

  // Фонари одной машины: свои материалы, чтобы яркостью управлять независимо у каждой машины
  makeLampMats() {
    const glow = color => new THREE.SpriteMaterial({ map: Cars.glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const L = CONFIG.LAMPS;
    return {
      tail: new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a2a, emissiveIntensity: L.TAIL_IDLE }),   // задние габариты и стопы
      stop: new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff2a2a, emissiveIntensity: 0 }),            // центральный стоп-сигнал
      amber: new THREE.MeshStandardMaterial({ color: 0x6a4a08, emissive: 0xffb020, emissiveIntensity: L.AMBER_IDLE }), // боковые габариты и поворотники
      glowRed: glow(0xff3030), glowAmber: glow(0xffb030),
    };
  },

  make(type, color) {
    const T = CONFIG.CAR_TYPES[type], CL = CONFIG.CAR_LOOK, S = CL.SHAPE, P = CL.PAINT;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: P.ROUGHNESS, metalness: P.METALNESS, clearcoat: P.CLEARCOAT,
      clearcoatRoughness: P.CLEARCOAT_ROUGHNESS, envMap: Cars.envRT && Cars.envRT.texture, envMapIntensity: P.ENV });
    const crease = THREE.MathUtils.degToRad(S.CREASE), bevel = S.BEVEL;
    const prof = Cars.roundCurve(T.curve, T.y0, S.ROUND, S.END_ROUND);
    const roofY = prof.reduce((m, p) => Math.max(m, p[1]), 0) + bevel, taper = T.taper ?? S.TAPER;

    // кузов: скруглённый профиль выдавливается по ширине со скруглённым скосом и сужается к крыше
    const bodyGeo = Cars.extrude(Cars.pathFrom(prof, T.y0), T.w, bevel, S.SEGMENTS);
    Cars.taper(bodyGeo, T.belt[0], roofY, taper); Util.creaseNormals(bodyGeo, crease);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true; body.receiveShadow = true; g.add(body);

    // стёкла: полоса того же профиля, чуть больше кузова во все стороны, так что видны и лобовое, и заднее
    const gap = 0.015;
    for (const sh of Cars.bandShapes(prof, T.belt[0], T.belt[1], T.glassX)) {
      const geo = new THREE.ExtrudeGeometry(sh, { depth: T.w - 2 * bevel + 2 * gap, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel + gap, bevelSegments: S.SEGMENTS });
      geo.translate(0, 0, -(T.w - 2 * bevel + 2 * gap) / 2);
      Cars.taper(geo, T.belt[0], roofY, taper); Util.creaseNormals(geo, crease);
      g.add(new THREE.Mesh(geo, Cars.glassMat));
    }

    // колёса и расширители арок (близкие оси под одной аркой)
    const wheels = [], groups = [];
    for (const wx of [...T.wheelsX].sort((a, b) => a - b)) {
      const last = groups[groups.length - 1];
      last && wx - last[last.length - 1] < 2 * T.r * CL.FLARE.RO ? last.push(wx) : groups.push([wx]);
    }
    for (const s of [-1, 1]) {
      for (const wx of T.wheelsX) {
        const wg = new THREE.Group(); wg.position.set(wx, T.r, s * (T.w / 2 + 0.02)); wg.rotation.x = Math.PI / 2;
        const spin = Cars.wheel(T, s); wg.add(spin); g.add(wg); wheels.push(spin);
      }
      for (const xs of groups) {
        const f = Cars.flare(xs, T, bodyMat);
        f.mesh.position.z = s > 0 ? T.w / 2 - 0.04 : -(T.w / 2 - 0.04) - f.depth;
        g.add(f.mesh);
      }
    }

    // фары, габариты, поворотники, стоп-сигналы
    const xF = T.curve[T.curve.length - 1][0], xR = T.curve[0][0];
    const yF = T.y0 + (T.curve[T.curve.length - 1][1] - T.y0) * 0.6, yR = T.y0 + (T.curve[0][1] - T.y0) * 0.6;
    const L = Cars.makeLampMats();
    const lamp = (m, w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    const glow = (m, x, y, z, s) => { const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(s, s, 1); g.add(sp); };
    // Торцы корпуса лежат на xF + bevel и xR - bevel. Всё навесное должно выступать минимум на 0.03,
    // иначе грани лежат в одной плоскости и мерцают (z-fighting).
    for (const s of [-1, 1]) {
      lamp(Cars.headMat, 0.12, 0.2, 0.42, xF + 0.07, yF, s * T.w * 0.3);                  // фары
      lamp(L.amber, 0.1, 0.14, 0.16, xF + 0.08, yF, s * (T.w * 0.5 - 0.1));                // передние поворотники
      lamp(L.tail, 0.1, 0.16, 0.34, xR - 0.07, yR, s * T.w * 0.3);                         // задние габариты и стопы
      glow(L.glowRed, xR - 0.22, yR, s * T.w * 0.3, 1.1);
      lamp(L.amber, 0.1, 0.14, 0.16, xR - 0.08, yR, s * (T.w * 0.5 - 0.1));                // задние поворотники
      glow(L.glowAmber, xR - 0.2, yR, s * (T.w * 0.5 - 0.05), 0.7);
      glow(L.glowAmber, xF + 0.2, yF, s * (T.w * 0.5 - 0.05), 0.7);
      lamp(L.amber, 0.26, 0.09, 0.07, xF - 0.7, T.y0 + 0.22, s * (T.w / 2 + 0.03));        // боковые габариты
      lamp(L.amber, 0.26, 0.09, 0.07, xR + 0.7, T.y0 + 0.22, s * (T.w / 2 + 0.03));
    }
    lamp(L.tail, 0.06, 0.045, T.w * 0.6 - 0.34, xR - 0.11, yR + 0.055, 0);                // световая полоса между фонарями
    lamp(Cars.plateMat, 0.05, 0.13, Math.min(0.5, T.w * 0.26), xR - 0.11, yR - 0.04, 0);  // номер
    lamp(L.stop, 0.08, 0.1, Math.min(0.7, T.w * 0.35), xR + 0.1, T.curve[0][1] + 0.12, 0);   // центральный стоп-сигнал
    glow(L.glowRed, xR - 0.1, T.curve[0][1] + 0.12, 0, 0.9);

    // зеркала у передней кромки боковых стёкол
    let xm = xF;
    while (xm > xR && Cars.topY(prof, xm) < T.belt[0] + 0.2) xm -= 0.02;
    for (const s of [-1, 1]) {
      const m = Util.box(0.16, 0.13, 0.24, bodyMat); m.position.set(xm - 0.14, T.belt[0] + 0.12, s * (T.w / 2 + 0.08)); g.add(m);
    }

    // свет фар (виден, когда тема включает фары): ореолы у фар и полоса света на дороге впереди
    const FX = CONFIG.THEMES.FX;
    for (const s of [-1, 1]) glow(Cars.headGlowMat, xF + 0.25, yF, s * T.w * 0.3, FX.HEAD_GLOW.SIZE);
    const beamGeo = new THREE.PlaneGeometry(FX.BEAM.LEN, T.w * FX.BEAM.WIDTH);
    beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(xF + FX.BEAM.LEN / 2 - 0.2, FX.BEAM.Y, 0);
    g.add(new THREE.Mesh(beamGeo, Cars.beamMat));

    // бамперы и спойлер
    const bf = Util.box(0.3, 0.22, T.w * 0.92, Cars.darkMat); bf.position.set(xF - 0.02, T.y0 + 0.08, 0); g.add(bf);
    const br = Util.box(0.3, 0.22, T.w * 0.92, Cars.darkMat); br.position.set(xR + 0.02, T.y0 + 0.08, 0); g.add(br);
    if (T.spoiler) {
      const sp = Util.box(0.55, 0.07, T.w * 0.95, Cars.darkMat); sp.position.set(xR + 0.25, T.curve[0][1] + 0.42, 0); g.add(sp);
      for (const s of [-1, 1]) { const p = Util.box(0.12, 0.42, 0.1, Cars.darkMat); p.position.set(xR + 0.3, T.curve[0][1] + 0.2, s * T.w * 0.35); g.add(p); }
    }

    g.rotation.y = Math.PI / 2;      // локальный +x (перёд) -> мировой -z (вперёд)
    const holder = new THREE.Group(); holder.add(g);

    // пятно тени на дороге: в holder (не наклоняется вместе с кузовом), идёт за смещениями кузова в update
    const SH = CL.SHADOW, shGeo = new THREE.PlaneGeometry(xF - xR + SH.PAD_L, T.w + SH.PAD_W);
    shGeo.rotateX(-Math.PI / 2); shGeo.rotateY(Math.PI / 2);   // u текстуры вдоль машины
    const shadow = new THREE.Mesh(shGeo, Cars.shadowMat); shadow.position.set(0, SH.Y, -(xF + xR) / 2); shadow.userData.z0 = -(xF + xR) / 2;
    holder.add(shadow);

    return { holder, body: g, hull: body, bodyMat, wheels, lamps: L, shadow, r: T.r, height: T.curve.reduce((m, p) => Math.max(m, p[1]), 0) };
  },

  // Фары по теме: 0 выключены (днём), иначе яркость полосы света и ореолов. Карта отражений из цветов темы.
  applyTheme(th) {
    Cars.beamMat.opacity = Cars.headGlowMat.opacity = th.HEADLIGHTS;
    Cars.beamMat.visible = Cars.headGlowMat.visible = th.HEADLIGHTS > 0;
    Cars.paintEnv(th);
  },

  // Карта отражений (равнопромежуточная проекция): зенит, горизонт, земля и пятно солнца; яркость неба по HEMI.INTENSITY.
  // Рисуется в ту же цель рендера, так что материалы, получившие envRT.texture раньше, видят новую тему.
  paintEnv(th) {
    const E = CONFIG.CAR_LOOK.ENV, W = E.W, H = W / 2, [c, g] = Util.canvas(W, H);
    const col = (hex, k) => { const v = new THREE.Color(hex).multiplyScalar(k); return `rgb(${[v.r, v.g, v.b].map(x => Math.min(255, x * 255 | 0))})`; };
    const k = Math.min(1, th.HEMI.INTENSITY);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, col(th.HEMI.SKY, E.SKY * k)); grad.addColorStop(0.47, col(th.FOG.COLOR, E.HORIZON * k));
    grad.addColorStop(0.53, col(th.HEMI.GROUND, E.GROUND * k)); grad.addColorStop(1, col(th.HEMI.GROUND, E.GROUND * k * 0.6));
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // солнце: направление на источник, перевод в координаты карты как у three (u = atan2(z, x), v = asin(y))
    const d = new THREE.Vector3(...th.SUN.POS).normalize();
    const u = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5, v = Math.asin(d.y) / Math.PI + 0.5;
    const sx = u * W, sy = (1 - v) * H, R = E.SUN_R, sg = g.createRadialGradient(sx, sy, 0, sx, sy, R * 2);
    sg.addColorStop(0, col(th.SUN.COLOR, E.SUN * Math.min(1, th.SUN.INTENSITY / 2))); sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg; g.fillRect(sx - R * 2, sy - R * 2, R * 4, R * 4);
    const tex = Util.canvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
    Cars.envRT = Cars.pmrem.fromEquirectangular(tex, Cars.envRT);
    tex.dispose();
    Cars.glassMat.envMap = Cars.rimMat.envMap = Cars.envRT.texture;
  },

  // Покадровое оживление машины. busy: идёт ли ход (тогда покачивание корпуса не мешает анимациям).
  update(car, dt, t, busy) {
    const A = CONFIG.ANIM.IDLE, TM = CONFIG.TIMING, LP = CONFIG.LAMPS;

    // фонари: стоп-сигналы при торможении, мигающая аварийка после удара
    car.brakeT = Math.max(0, car.brakeT - dt); car.hazardT = Math.max(0, car.hazardT - dt);
    const L = car.lamps, br = car.brakeT > 0 ? 1 : 0, hz = car.hazardT > 0 && Math.floor(t * TM.HAZARD_HZ) % 2 === 0 ? 1 : 0;
    L.tail.emissiveIntensity = LP.TAIL_IDLE + LP.TAIL_BRAKE * br; L.stop.emissiveIntensity = LP.STOP * br; L.glowRed.opacity = LP.GLOW_BRAKE * br;
    L.amber.emissiveIntensity = LP.AMBER_IDLE + LP.AMBER_HAZARD * hz; L.glowAmber.opacity = LP.GLOW_HAZARD * hz;

    // изгиб: жёстко поворачиваем машину вдоль дороги так, чтобы её центр попал в точку (x + ox(z), z)
    const hp = car.holder.position, th = Bend.yaw(hp.z), cs = Math.cos(th), sn = Math.sin(th);
    car.node.rotation.y = th;
    car.node.position.set(hp.x + Bend.ox(hp.z) - (hp.x * cs + hp.z * sn), 0, hp.z - (hp.z * cs - hp.x * sn));

    car.shadow.visible = car.alive;   // вылетающая машина отрывается от дороги
    if (!car.alive) return;
    const w = CONFIG.WORLD.SPEED / car.r * dt;
    for (const m of car.wheels) m.rotation.y += w;                   // колёса крутятся
    car.body.position.set(car.dx, A.BOB_AMP * Math.sin(t * A.BOB_FREQ + car.phase), car.dz);
    if (!busy) car.body.rotation.z = Math.sin(t * A.SWAY_FREQ + car.phase) * A.SWAY_AMP;
    // пятно тени идёт за кузовом по дороге (сдвиги и разворот в плоскости дороги, без наклонов)
    const yaw = car.body.rotation.y - Math.PI / 2, z0 = car.shadow.userData.z0;
    car.shadow.position.set(car.dx + Math.sin(yaw) * z0, CONFIG.CAR_LOOK.SHADOW.Y, car.dz + Math.cos(yaw) * z0);
    car.shadow.rotation.y = yaw;
  },
};
