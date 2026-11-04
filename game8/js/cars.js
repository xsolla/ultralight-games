// ============================================================================
// cars.js — процедурные машины и их покадровое оживление. Моделей нет: каждая машина собирается из
// профиля кузова (CONFIG.CAR_TYPES), стёкол, колёс, фар, габаритов и бамперов.
//
//   Cars.make(type, color)  -> { holder, body, hull, bodyMat, wheels, lamps, r, height }   (hull: меш кузова)
//   Cars.update(car, dt, t, busy)   каждый кадр: фонари, изгиб дороги, колёса, покачивание
//
// Иерархия: car.node (накладывает изгиб дороги) > car.holder (логическая позиция в сетке, её двигает
// Game) > car.body (локальные смещения анимаций: удар, подача, наклон). Игровая логика работает только
// с holder и body и об изгибе ничего не знает.
//
// Модельные размеры (фары, бамперы, колёса) живут здесь, баланс и профили кузовов в constants.js.
// ============================================================================

const Cars = {
  glassMat: null, tireMat: null, rimMat: null, headMat: null, darkMat: null, glowTex: null,
  beamMat: null, headGlowMat: null,   // свет фар (полоса на дороге и ореол), общие для всех машин; яркость задаёт тема

  init() {
    const FX = CONFIG.THEMES.FX;
    // полоса света фар: трапеция, расширяется вперёд и гаснет к дальнему концу (u = 0 у машины)
    const [bc, bg] = Util.canvas(256, 128), grad = bg.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    bg.filter = 'blur(7px)'; bg.fillStyle = grad;
    bg.beginPath(); bg.moveTo(8, 40); bg.lineTo(248, 8); bg.lineTo(248, 120); bg.lineTo(8, 88); bg.closePath(); bg.fill();
    const additive = { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false };
    Cars.beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), color: FX.BEAM.COLOR, ...additive,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });   // поверх дороги и заплаток развилок
    Cars.headGlowMat = new THREE.SpriteMaterial({ map: Util.glowTexture(), color: FX.HEAD_GLOW.COLOR, ...additive });

    Cars.glassMat = new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.25, metalness: 0.6, flatShading: true });
    Cars.tireMat = Util.mat(0x1d1f24, { roughness: 0.9 });
    Cars.rimMat = Util.mat(0xd5d8dd, { metalness: 0.5, roughness: 0.4 });
    Cars.headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d8, emissive: 0xfff2b0, emissiveIntensity: 1.2 });
    Cars.darkMat = Util.mat(0x2a2d33);
    // текстура мягкого свечения фонарей
    const [c, g] = Util.canvas(64, 64), r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    Cars.glowTex = new THREE.CanvasTexture(c);
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

  // Замкнутая фигура: нижняя линия yb и ломаная профиля сверху
  pathFrom(points, yb) {
    const s = new THREE.Shape();
    const pts = [[points[0][0], yb], ...points, [points[points.length - 1][0], yb]];
    let prev = null;
    for (const p of pts) {
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-5) continue;
      prev ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]);
      prev = p;
    }
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
    const flush = () => { if (run.length >= 2) shapes.push(Cars.pathFrom(run, yb)); run = []; };
    for (const x of sorted) {
      let y = Cars.topY(curve, x);
      if (xr && (x < xr[0] || x > xr[1])) y = -Infinity;
      if (y > yb + 1e-4) { if (!run.length && prevX !== null) run.push([prevX, yb]); run.push([x, Math.min(y, yt)]); }
      else if (run.length) { run.push([x, yb]); flush(); }
      prevX = x;
    }
    flush();
    return shapes;
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
    const T = CONFIG.CAR_TYPES[type];
    const g = new THREE.Group();
    const bodyMat = Util.mat(color, { roughness: 0.55, metalness: 0.15 });

    // кузов: профиль выдавливается по ширине со скосом
    const bevel = 0.1;
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(Cars.pathFrom(T.curve, T.y0),
      { depth: T.w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 }), bodyMat);
    body.geometry.translate(0, 0, -(T.w - 2 * bevel) / 2);
    body.castShadow = true; body.receiveShadow = true; g.add(body);

    // стёкла: вырезаются из того же профиля и чуть шире кузова
    for (const sh of Cars.bandShapes(T.curve, T.belt[0], T.belt[1], T.glassX)) {
      const glass = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: T.w + 0.05, bevelEnabled: false }), Cars.glassMat);
      glass.geometry.translate(0, 0, -(T.w + 0.05) / 2); g.add(glass);
    }

    // колёса
    const wheels = [];
    for (const wx of T.wheelsX) for (const s of [-1, 1]) {
      const wg = new THREE.Group(); wg.position.set(wx, T.r, s * (T.w / 2 + 0.02)); wg.rotation.x = Math.PI / 2;
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, T.ww, 10), Cars.tireMat); tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(T.r * 0.58, T.r * 0.58, T.ww + 0.04, 6), Cars.rimMat);
      wg.add(tire, rim); g.add(wg); wheels.push(tire, rim);
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
    lamp(L.stop, 0.08, 0.1, Math.min(0.7, T.w * 0.35), xR + 0.1, T.curve[0][1] + 0.12, 0);   // центральный стоп-сигнал
    glow(L.glowRed, xR - 0.1, T.curve[0][1] + 0.12, 0, 0.9);

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
    return { holder, body: g, hull: body, bodyMat, wheels, lamps: L, r: T.r, height: T.curve.reduce((m, p) => Math.max(m, p[1]), 0) };
  },

  // Фары по теме: 0 выключены (днём), иначе яркость полосы света и ореолов
  applyTheme(th) {
    Cars.beamMat.opacity = Cars.headGlowMat.opacity = th.HEADLIGHTS;
    Cars.beamMat.visible = Cars.headGlowMat.visible = th.HEADLIGHTS > 0;
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

    if (!car.alive) return;
    const w = CONFIG.WORLD.SPEED / car.r * dt;
    for (const m of car.wheels) m.rotation.y += w;                   // колёса крутятся
    car.body.position.set(car.dx, A.BOB_AMP * Math.sin(t * A.BOB_FREQ + car.phase), car.dz);
    if (!busy) car.body.rotation.z = Math.sin(t * A.SWAY_FREQ + car.phase) * A.SWAY_AMP;
  },
};
