// ============================================================================
// weather.js — осадки темы (CONFIG.THEMES.*.WEATHER): снег (точки) или дождь (короткие штрихи).
// Частицы живут в коробке вокруг камеры (THEMES.FX.WEATHER_BOX) в мировых координатах, падают и едут на
// камеру вместе с миром (DRIFT доля WORLD.SPEED), а вылетев из коробки, появляются заново с другой стороны.
// Изгиб дороги на них не влияет: рядом с камерой дорога прямая, а дальше их прячет туман.
//
//   Weather.set(cfg)    включить осадки по описанию темы или выключить (null)
//   Weather.update(dt)  каждый кадр, после того как едет мир
// ============================================================================

const Weather = {
  cfg: null,
  snow: null, rain: null,   // { obj, pos (Float32Array), vel (Float32Array), n }
  t: 0,

  init() {
    const B = CONFIG.THEMES.FX.WEATHER_BOX, cap = type => Object.values(CONFIG.THEMES).reduce((m, th) => th && th.WEATHER && th.WEATHER.TYPE === type ? Math.max(m, th.WEATHER.COUNT) : m, 0);

    // снег: точки с мягкой круглой текстурой, размер в мировых единицах (уменьшается вдали)
    const sn = cap('snow');
    if (sn) {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(sn * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: Util.glowTexture([[0, 1], [0.5, 0.8], [1, 0]], 32), transparent: true, depthWrite: false, sizeAttenuation: true });
      const obj = new THREE.Points(geo, mat); obj.frustumCulled = false; obj.visible = false;
      Stage.scene.add(obj);
      Weather.snow = { obj, pos, vel: new Float32Array(sn * 2), n: sn, phase: new Float32Array(sn) };
    }
    // дождь: отрезки, каждый от точки капли назад по её скорости
    const rn = cap('rain');
    if (rn) {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(rn * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
      const obj = new THREE.LineSegments(geo, mat); obj.frustumCulled = false; obj.visible = false;
      Stage.scene.add(obj);
      Weather.rain = { obj, pos, vel: new Float32Array(rn), n: rn, head: new Float32Array(rn * 3) };
    }
    Weather.box = B;
  },

  // Случайная точка в коробке; top: появиться у верхнего края (а не где угодно по высоте)
  spawn(arr, i, top) {
    const B = Weather.box;
    arr[i] = (Math.random() * 2 - 1) * B.X;
    arr[i + 1] = top ? B.Y * (0.85 + Math.random() * 0.15) : Math.random() * B.Y;
    arr[i + 2] = B.Z_FAR + Math.random() * (B.Z_NEAR - B.Z_FAR);
  },

  set(cfg) {
    Weather.cfg = cfg;
    if (Weather.snow) Weather.snow.obj.visible = false;
    if (Weather.rain) Weather.rain.obj.visible = false;
    if (!cfg) return;
    if (cfg.TYPE === 'snow' && Weather.snow) {
      const s = Weather.snow, m = s.obj.material;
      m.color.setHex(cfg.COLOR); m.opacity = cfg.OPACITY; m.size = cfg.SIZE;
      s.obj.geometry.setDrawRange(0, cfg.COUNT);
      for (let i = 0; i < cfg.COUNT; i++) {
        Weather.spawn(s.pos, i * 3, false);
        s.vel[i * 2] = cfg.FALL + Math.random() * cfg.FALL_RANGE; s.vel[i * 2 + 1] = 0.5 + Math.random();
        s.phase[i] = Math.random() * Math.PI * 2;
      }
      s.obj.visible = true;
    }
    if (cfg.TYPE === 'rain' && Weather.rain) {
      const r = Weather.rain, m = r.obj.material;
      m.color.setHex(cfg.COLOR); m.opacity = cfg.OPACITY;
      r.obj.geometry.setDrawRange(0, cfg.COUNT * 2);
      for (let i = 0; i < cfg.COUNT; i++) { Weather.spawn(r.head, i * 3, false); r.vel[i] = cfg.FALL + Math.random() * cfg.FALL_RANGE; }
      r.obj.visible = true;
    }
    Weather.update(0);
  },

  update(dt) {
    const cfg = Weather.cfg, B = Weather.box;
    if (!cfg) return;
    Weather.t += dt;
    const drift = CONFIG.WORLD.SPEED * cfg.DRIFT;
    const wrap = (arr, i) => {                    // вылетела из коробки: заново сверху (или с дальнего края)
      if (arr[i + 1] < 0) Weather.spawn(arr, i, true);
      else if (arr[i + 2] > B.Z_NEAR) { Weather.spawn(arr, i, false); arr[i + 2] = B.Z_FAR; }
    };
    if (cfg.TYPE === 'snow') {
      const s = Weather.snow, p = s.pos;
      for (let i = 0; i < cfg.COUNT; i++) {
        const k = i * 3;
        p[k] += Math.sin(Weather.t * s.vel[i * 2 + 1] + s.phase[i]) * cfg.SWAY * dt;   // покачивание
        p[k + 1] -= s.vel[i * 2] * dt;
        p[k + 2] += drift * dt;
        wrap(p, k);
      }
      s.obj.geometry.attributes.position.needsUpdate = true;
    } else {
      const r = Weather.rain, h = r.head, p = r.pos;
      for (let i = 0; i < cfg.COUNT; i++) {
        const k = i * 3, v = r.vel[i];
        h[k] += cfg.SLANT * dt; h[k + 1] -= v * dt; h[k + 2] += drift * dt;
        if (h[k] > B.X) h[k] -= 2 * B.X;
        wrap(h, k);
        // штрих: от капли назад по скорости на LENGTH секунд пути
        const j = i * 6;
        p[j] = h[k]; p[j + 1] = h[k + 1]; p[j + 2] = h[k + 2];
        p[j + 3] = h[k] - cfg.SLANT * cfg.LENGTH; p[j + 4] = h[k + 1] + v * cfg.LENGTH; p[j + 5] = h[k + 2] - drift * cfg.LENGTH;
      }
      r.obj.geometry.attributes.position.needsUpdate = true;
    }
  },
};
