// ============================================================================
// fx.js — эффекты: искры при ударах и две величины, которыми камера "бьётся": тряска и толчок угла
// обзора. Сами значения читает camera.js, а выставляют их game.js (удар, рывок).
//
//   Fx.burst(pos, n)    искры в логической точке pos (x поперёк дороги, z вдоль); изгиб учитывается
//   Fx.shake            сила тряски, сама затухает
//   Fx.fovBoost         прибавка к углу обзора (рывок), сама возвращается к нулю
// ============================================================================

const Fx = {
  shake: 0,
  fovBoost: 0,
  sparks: [],

  init() {
    const S = CONFIG.FX.SPARKS;
    const mat = new THREE.MeshBasicMaterial({ color: S.COLOR });
    for (let i = 0; i < S.COUNT; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(S.SIZE, S.SIZE, S.SIZE), mat);
      m.visible = false;
      Stage.scene.add(m);
      Fx.sparks.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  },

  burst(pos, n) {
    const S = CONFIG.FX.SPARKS;
    let k = 0;
    for (const s of Fx.sparks) {
      if (s.life > 0 || k >= n) continue;
      s.m.visible = true;
      s.m.position.copy(pos);
      s.m.position.x += Bend.ox(pos.z);
      s.life = S.LIFE + Math.random() * S.LIFE_RANGE;
      s.v.set((Math.random() - 0.5) * S.VX, S.VY + Math.random() * S.VY_RANGE, (Math.random() - 0.5) * S.VZ);
      k++;
    }
  },

  update(dt) {
    const S = CONFIG.FX.SPARKS, C = CONFIG.CAMERA;
    for (const s of Fx.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= S.GRAVITY * dt;
      s.v.z += CONFIG.WORLD.SPEED * S.DRIFT * dt;           // искры сносит назад вместе с дорогой
      s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < 0.05) { s.m.position.y = 0.05; s.v.y *= -S.BOUNCE; }
      s.m.scale.setScalar(Math.max(S.SCALE_MIN, s.life * S.SCALE_K));
      if (s.life <= 0) s.m.visible = false;
    }
    Fx.fovBoost += (0 - Fx.fovBoost) * Math.min(1, dt * C.FOV_RECOVER);
    Fx.shake = Math.max(0, Fx.shake - dt * C.SHAKE_DECAY);
  },
};
