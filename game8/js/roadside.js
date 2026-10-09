// ============================================================================
// roadside.js — обочина: деревья, кусты, столбики, отбойник, фонари, рекламные щиты и "ветер".
// Всё это "скроллеры": объекты, которые едут на камеру, а позади камеры перескакивают далеко вперёд
// и снова едут. Именно они создают ощущение скорости (параллакс и частота мелькания).
//
// У скроллера логические координаты: lx поперёк дороги, z вдоль. На экран он попадает через Bend:
// x = lx + Bend.ox(z), разворот по Bend.yaw(z). Объекты, которые попали на полотно развилки, прячутся
// (Forks.hides). Числа и расстановка в CONFIG.ROADSIDE.
// ============================================================================

const Roadside = {
  list: [],          // { obj, lx, z, speedMul, yaw, onWrap, noHide }
  railMat: null,     // материал отбойника (развилки строят такой же)

  init() {
    const R = CONFIG.ROADSIDE, W = CONFIG.WORLD, ROAD_W = CONFIG.TRACK.ROAD_W, SPAN = W.SPAN;
    const { mat, box } = Util;
    const outsideX = () => (ROAD_W / 2 + R.SCATTER.NEAR + Math.random() * R.SCATTER.RANGE) * (Math.random() < 0.5 ? -1 : 1);
    const reroll = s => { s.lx = outsideX(); };

    const treeMats = [mat(0x2f7a3c), mat(0x3b8f45), mat(0x27683a)], trunkMat = mat(0x6b4a2a);
    const bushMat = mat(0x4f9a3c);
    const postMat = mat(0xeeeeee), postRed = mat(0xd23b3b);
    const railPostMat = mat(0x5a5f6a);
    const lampMat = mat(0x6d7480, { metalness: 0.5, roughness: 0.4 });
    Roadside.railMat = mat(0xb8bcc4, { metalness: 0.4, roughness: 0.5 });

    // ---- модели ----
    const makeTree = () => {
      const g = new THREE.Group();
      const trunk = box(0.35, 1.0, 0.35, trunkMat); trunk.position.y = 0.5; g.add(trunk);
      const tiers = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < tiers; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4 - i * 0.3, 2.6, 6), treeMats[Math.random() * 3 | 0]);
        cone.position.y = 1.8 + i * 1.3; cone.castShadow = true; g.add(cone);
      }
      g.scale.setScalar(R.TREES.SCALE + Math.random() * R.TREES.SCALE_RANGE);
      return g;
    };
    const makeBush = () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), bushMat);
      m.position.y = 0.55; m.castShadow = true; m.scale.set(1.3, 0.8, 1.1);
      return m;
    };
    const makePost = () => {
      const g = new THREE.Group();
      const p = box(0.12, 1.1, 0.12, postMat); p.position.y = 0.55; g.add(p);
      const r = box(0.14, 0.2, 0.14, postRed); r.position.y = 1.0; g.add(r);
      return g;
    };
    const makeRailPost = () => { const p = box(0.18, 0.75, 0.18, railPostMat); p.position.y = 0.37; return p; };
    const makeLamp = side => {
      const g = new THREE.Group();
      const pole = box(0.25, 8, 0.25, lampMat); pole.position.y = 4; g.add(pole);
      const arm = box(5, 0.2, 0.2, lampMat); arm.position.set(-side * 2.4, 7.9, 0); g.add(arm);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 0.8 }));
      bulb.position.set(-side * 4.6, 7.75, 0); g.add(bulb);
      return g;
    };
    const makeBillboard = (text, bg) => {
      const [c, g] = Util.canvas(512, 256);
      g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#fff'; g.font = 'bold 72px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 256, 128);
      const grp = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.2),
        [mat(0x222), mat(0x222), mat(0x222), mat(0x222), new THREE.MeshStandardMaterial({ map: Util.canvasTexture(c) }), mat(0x222)]);
      panel.position.y = 5.2; panel.castShadow = true; grp.add(panel);
      for (const s of [-1, 1]) { const p = box(0.3, 3.6, 0.3, lampMat); p.position.set(s * 2.6, 1.8, 0); grp.add(p); }
      return grp;
    };

    // ---- расстановка ----
    for (let i = 0; i < R.TREES.COUNT; i++) Roadside.add(makeTree(), -SPAN + Math.random() * SPAN, outsideX(), { onWrap: reroll });
    for (let i = 0; i < R.BUSHES.COUNT; i++) Roadside.add(makeBush(), -SPAN + Math.random() * SPAN, outsideX(), { onWrap: reroll });

    for (let i = 0; i < SPAN / R.POSTS.SPACING; i++) for (const s of [-1, 1])
      Roadside.add(makePost(), -i * R.POSTS.SPACING, s * (ROAD_W / 2 + R.POSTS.OFFSET), { yaw: true });

    // отбойник: стойки и сегменты между ними, каждый сегмент разворачивается по дороге
    const RL = R.RAIL;
    for (let i = 0; i < SPAN / RL.SPACING; i++) for (const s of [-1, 1]) {
      Roadside.add(makeRailPost(), -i * RL.SPACING, s * (ROAD_W / 2 + RL.OFFSET), { yaw: true });
      const seg = box(0.12, 0.35, RL.SEG_LEN, Roadside.railMat); seg.position.y = RL.Y;
      Roadside.add(seg, -i * RL.SPACING - RL.SPACING / 2, s * (ROAD_W / 2 + RL.OFFSET), { yaw: true });
    }

    for (let i = 0; i < SPAN / R.LAMPS.SPACING; i++) {
      const side = i % 2 ? 1 : -1;
      Roadside.add(makeLamp(side), -i * R.LAMPS.SPACING + R.LAMPS.Z0, side * (ROAD_W / 2 + R.LAMPS.OFFSET), { yaw: true });
    }

    R.BILLBOARDS.LIST.forEach(([text, bg], i) => {
      const side = i % 2 ? 1 : -1;
      Roadside.add(makeBillboard(text, bg), -i * R.BILLBOARDS.SPACING + R.BILLBOARDS.Z0, side * (ROAD_W / 2 + R.BILLBOARDS.OFFSET), { yaw: true });
    });

    // "ветер": полупрозрачные штрихи, летящие быстрее дороги
    const S = R.STREAKS;
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: S.OPACITY });
    for (let i = 0; i < S.COUNT; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, S.LENGTH), streakMat);
      m.position.y = S.Y + Math.random() * S.Y_RANGE;
      Roadside.add(m, -SPAN + Math.random() * SPAN, (Math.random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + S.LATERAL + Math.random() * S.LATERAL_RANGE),
        { speedMul: S.SPEED_MUL, noHide: true, onWrap: s => { s.obj.position.y = S.Y + Math.random() * S.Y_RANGE; } });
    }
  },

  add(obj, z, lx, { speedMul = 1, yaw = false, onWrap = null, noHide = false } = {}) {
    Stage.scene.add(obj);
    const s = { obj, lx, z, speedMul, yaw, onWrap, noHide };
    Roadside.list.push(s);
    return s;
  },

  update(dt) {
    const W = CONFIG.WORLD, anyFork = Forks.list.length > 0;
    for (const s of Roadside.list) {
      s.z += W.SPEED * s.speedMul * dt;
      if (s.z > W.Z_NEAR) { s.z -= W.SPAN; if (s.onWrap) s.onWrap(s); }
      s.obj.position.x = s.lx + Bend.ox(s.z);
      s.obj.position.z = s.z;
      if (s.yaw) s.obj.rotation.y = Bend.yaw(s.z);
      s.obj.visible = s.noHide || !anyFork || !Forks.hides(s);
    }
  },
};
