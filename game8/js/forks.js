// ============================================================================
// forks.js — фейковые развилки.
//
// Ответвление — полноценная дорога той же ширины. Сначала она лежит под основной, потом плавно (по
// дуге, касательно) сдвигается вбок и продолжает загибаться наружу, пока не уйдёт за край кадра.
// Выглядит как расширение дороги с лишней полосой, из которого вырастает отдельная ветка.
//
//  - Основная дорога рисуется поверх (polygonOffset), поэтому пока ветки пересекаются, видна только
//    выступающая наружу полоса.
//  - Пока дороги слиты, красно-белая кромка и жёлтая линия основной дороги на этой стороне закрыты
//    асфальтовой заплаткой (cover). Когда между дорогами открывается клин травы, разметка возвращается.
//  - Ветку перегораживают наземные щиты, но дорога за ними продолжается.
//  - Выбрать ветку нельзя, игрок всегда остаётся на основной.
//
// Положение развилки задано абсолютной координатой пути u (Bend.odo), поэтому она сама приезжает из дали
// вместе с остальным миром. Развилка живёт в координатах "t вдоль ветки" и "a поперёк её оси", а на экран
// попадает через Bend. Формы и частота в CONFIG.FORK.
// ============================================================================

const Forks = (() => {
  const F = CONFIG.FORK, ROAD_W = CONFIG.TRACK.ROAD_W, CELL_L = CONFIG.TRACK.CELL_L, RAIL = CONFIG.ROADSIDE.RAIL, H = F.HIDE;

  // Боковое смещение оси ответвления от оси основной дороги на расстоянии t от начала развилки:
  // дуга с кривизной K до T1, потом с кривизной K2 пока наклон не дойдёт до S_MAX, дальше прямая.
  const S1 = F.K * F.T1;
  const T2 = F.T1 + (F.S_MAX - S1) / F.K2;
  const armC = t => {
    if (t <= 0) return 0;
    const c1 = 0.5 * F.K * F.T1 ** 2;
    if (t <= F.T1) return 0.5 * F.K * t * t;
    const d2 = T2 - F.T1, c2 = c1 + S1 * d2 + 0.5 * F.K2 * d2 * d2;
    if (t <= T2) { const d = t - F.T1; return c1 + S1 * d + 0.5 * F.K2 * d * d; }
    return c2 + F.S_MAX * (t - T2);
  };
  const armInner = t => armC(t) - ROAD_W / 2;     // кромки ответвления в координатах, где 0 = ось основной дороги
  const armOuter = t => armC(t) + ROAD_W / 2;
  // с этого t ветка отошла настолько, что между дорогами можно поставить свои отбойники
  let T_IN = 0; while (armInner(T_IN) < ROAD_W / 2 + H.CLOSE) T_IN++;
  // до этого t дороги слиты: внутренняя кромка ветки ещё не вышла за край основной дороги
  let T_OPEN = 0; while (armInner(T_OPEN) < ROAD_W / 2) T_OPEN++;

  // точка на ответвлении: t вдоль него, a поперёк от его оси (наружу +)
  const armX = (f, t, a) => f.side * (armC(t) + a) + Bend.ox(f.zf - t);
  const armYaw = (f, t) => -Math.atan((armX(f, t + 1, 0) - armX(f, t - 1, 0)) / 2);

  let armMat, coverMat, boardMats, boardDark, nextU = F.FIRST_AT;
  const gap = () => F.GAP + Math.random() * F.GAP_RANGE;

  // щит на двух коротких ножках прямо на земле
  function makeGroundBoard(i) {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.05, 0.16),
      [boardDark, boardDark, boardDark, boardDark, boardMats[i % boardMats.length], boardDark]);
    panel.position.y = 1.55; panel.castShadow = true; panel.receiveShadow = true; g.add(panel);
    for (const s of [-1, 1]) { const leg = Util.box(0.2, 0.55, 0.2, boardDark); leg.position.set(s * 1.3, 0.27, -0.05); g.add(leg); }
    return g;
  }

  // Лента между двумя боковыми кромками edge(f, t) -> [x1, x2] от t = 0 до tEnd. Каждый кадр вершины
  // пересчитываются относительно положения развилки f.zf и сдвигаются на Bend.ox.
  function makeStrip(material, tEnd, step, y, uvScale, edge) {
    const segs = Math.ceil(tEnd / step), n = segs + 1;
    const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    for (let j = 0; j < n; j++) {
      nor.set([0, 1, 0, 0, 1, 0], j * 6);
      uv.set([0, j * step * uvScale, 1, j * step * uvScale], j * 4);
      if (j < segs) { const a = 2 * j; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    const update = f => {
      for (let j = 0; j < n; j++) {
        const t = Math.min(tEnd, j * step), z = f.zf - t, o = Bend.ox(z), [x1, x2] = edge(f, t);
        pos.set([Math.min(x1, x2) + o, y, z, Math.max(x1, x2) + o, y, z], j * 6);
      }
      geo.attributes.position.needsUpdate = true;
    };
    return { mesh, update };
  }

  const api = {
    list: [],          // активные развилки

    init() {
      // ответвление едет вместе с миром, поэтому его текстура неподвижна (клон текстуры дороги)
      const armTex = Road.tex.clone(); armTex.needsUpdate = true; armTex.repeat.set(1, 1);
      armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: CONFIG.ROAD.ROUGHNESS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      // заплатка цвета асфальта поверх красно-белой кромки и жёлтой линии основной дороги
      coverMat = new THREE.MeshStandardMaterial({ color: F.COVER.COLOR, roughness: CONFIG.ROAD.ROUGHNESS, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      // щит с логотипом Xsolla: тёмный фон, светлая рамка, логотип по центру (одна текстура на все щиты)
      const B = F.BOARD, [c, g] = Util.canvas(512, 288), bgGrad = g.createLinearGradient(0, 0, 0, 288);
      bgGrad.addColorStop(0, B.BG2); bgGrad.addColorStop(1, B.BG);
      g.fillStyle = bgGrad; g.fillRect(0, 0, 512, 288);
      g.strokeStyle = B.FRAME; g.lineWidth = 10; g.strokeRect(14, 14, 484, 260);
      Chrome.drawLogo(g, (512 - B.LOGO_W) / 2, (288 - Chrome.logoHeight(B.LOGO_W)) / 2, B.LOGO_W);
      const t = Util.canvasTexture(c); t.anisotropy = 4;
      boardMats = [new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })];
      boardDark = Util.mat(0x23262c);
    },

    spawn(u) {
      const f = { u, side: Math.random() < 0.5 ? -1 : 1, zf: Bend.odo - u, objs: [] };
      f.arm = makeStrip(armMat, F.L, F.MESH_STEP, 0, 1 / CELL_L, (f, t) => [f.side * armInner(t), f.side * armOuter(t)]);
      // заплатка закрывает красно-белую кромку (0..0.3 от края) и жёлтую линию (0.45..0.57 от края)
      f.cover = makeStrip(coverMat, T_OPEN, F.COVER.STEP, F.COVER.Y, 1, f => [f.side * (ROAD_W / 2 + 0.01), f.side * (ROAD_W / 2 - F.COVER.EDGE)]);
      Stage.scene.add(f.arm.mesh, f.cover.mesh);

      // отбойники: наружная кромка с самого начала (продолжает отбойник основной дороги), внутренняя после расхождения
      const rail = (t, a) => {
        const seg = Util.box(0.12, 0.35, RAIL.SEG_LEN, Roadside.railMat);
        seg.position.y = RAIL.Y; seg.castShadow = false;
        Stage.scene.add(seg); f.objs.push({ obj: seg, t, a, jit: 0 });
      };
      for (let t = 0; t < F.L; t += RAIL.SPACING) rail(t, ROAD_W / 2 + RAIL.OFFSET);
      for (let t = T_IN; t < F.L; t += RAIL.SPACING) rail(t, -(ROAD_W / 2 + RAIL.OFFSET));

      // щиты, перегораживающие ответвление; ряды вразбежку, чтобы не было просветов
      let k = Math.random() * boardMats.length | 0;
      for (const [t, offs] of F.BOARD_ROWS) for (const a of offs) {
        const b = makeGroundBoard(k++); Stage.scene.add(b);
        f.objs.push({ obj: b, t: t + (Math.random() - 0.5) * 1.2, a, jit: (Math.random() - 0.5) * 0.2 });
      }
      api.list.push(f);
      return f;
    },

    remove(f) {
      for (const m of [f.arm.mesh, f.cover.mesh]) { Stage.scene.remove(m); m.geometry.dispose(); }
      for (const o of f.objs) { Stage.scene.remove(o.obj); o.obj.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
    },

    update() {
      const odo = Bend.odo;
      while (nextU - odo < -(F.L + 40)) nextU += gap();             // после перемотки пропускаем пройденные
      if (nextU - odo <= F.SPAWN_DIST) { api.spawn(nextU); nextU += gap(); }
      for (let i = api.list.length - 1; i >= 0; i--) {
        const f = api.list[i]; f.zf = odo - f.u;
        if (f.zf - F.L > CONFIG.WORLD.Z_NEAR + 6) { api.remove(f); api.list.splice(i, 1); continue; }
        f.arm.update(f); f.cover.update(f);
        for (const o of f.objs) {
          o.obj.position.x = armX(f, o.t, o.a); o.obj.position.z = f.zf - o.t;
          o.obj.rotation.y = armYaw(f, o.t) + o.jit;
        }
      }
    },

    // Объект обочины s оказался на полотне ответвления или на его кромке: его надо спрятать.
    hides(s) {
      for (const f of api.list) {
        const t = f.zf - s.z;
        if (t < 0 || t > F.L + 8) continue;
        const v = s.lx * f.side;
        if (v < ROAD_W / 2 - H.EDGE) continue;
        const inner = armInner(t), outer = armOuter(t);
        if (v > outer + H.MARGIN) continue;
        // между дорогами (клин травы) оставляем всё, кроме полосы отбойника основной дороги, пока ветка вплотную
        if (v >= inner - H.INNER_MARGIN || (v <= ROAD_W / 2 + H.RAIL_BAND && inner < ROAD_W / 2 + H.CLOSE)) return true;
      }
      return false;
    },
  };
  return api;
})();
