// ============================================================================
// theme.js — тема дороги: день, ночь, зима, дождь, рассвет (CONFIG.THEMES). Тема выбирается в начале каждой
// партии (Game.reset зовёт Theme.apply(Theme.next())): случайно из ORDER или та, что задана заранее
// (Theme.force; скрытая функция титульного экрана, title.js).
//
// Theme.apply перекрашивает уже построенный мир, ничего не пересоздавая: небо (цвет или градиент), туман,
// свет и солнце, землю и горы (stage.js), асфальт (road.js, forks.js), обочину, лампы и щиты (roadside.js),
// фары машин (cars.js), осадки (weather.js). Сам рисует звёзды (ночь) и солнце над горизонтом (рассвет):
// они держатся впереди камеры (Theme.update каждый кадр).
// ============================================================================

const Theme = {
  current: 'day',
  forced: null,      // тема следующей партии, если её задали заранее
  skyTex: {},        // градиенты неба по темам
  stars: null, sunDisc: null,

  init() {
    const FX = CONFIG.THEMES.FX, S = FX.STARS;
    // звёзды: точки на дуге далеко впереди, туман на них не действует
    const n = Math.max(...CONFIG.THEMES.ORDER.map(k => Theme.get(k).STARS)), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * Math.PI * 0.95, y = S.Y_MIN + Math.random() * (S.Y_MAX - S.Y_MIN);
      pos.set([Math.sin(a) * S.DIST, y, -Math.cos(a) * S.DIST], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    Theme.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: S.SIZE, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    Theme.stars.frustumCulled = false; Theme.stars.visible = false;
    // солнце над горизонтом: яркий диск с ореолом (обычное смешивание: на светлом небе сложение размылось бы в белое)
    Theme.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: Util.glowTexture([[0, 1], [0.22, 1], [0.27, 0.6], [0.5, 0.18], [1, 0]], 256),
      fog: false, transparent: true, depthWrite: false }));
    Theme.sunDisc.visible = false;
    Stage.scene.add(Theme.stars, Theme.sunDisc);
  },

  // Тема name, дополненная до полной значениями day (вложенные FOG, HEMI, SUN, ROAD сливаются по полям)
  get(name) {
    const day = CONFIG.THEMES.day, th = CONFIG.THEMES[name] || {}, out = { ...day, ...th };
    for (const k of ['FOG', 'HEMI', 'SUN', 'ROAD']) out[k] = { ...day[k], ...(th[k] || {}) };
    return out;
  },

  force(name) { if (CONFIG.THEMES[name]) Theme.forced = name; },

  // Тема новой партии: заданная заранее (один раз) или случайная
  next() {
    const name = Theme.forced || CONFIG.THEMES.ORDER[Math.random() * CONFIG.THEMES.ORDER.length | 0];
    Theme.forced = null;
    return name;
  },

  apply(name) {
    const th = Theme.get(name), scene = Stage.scene;
    Theme.current = name;
    scene.background = th.SKY_GRAD ? Theme.gradient(name, th.SKY_GRAD) : new THREE.Color(th.SKY);
    scene.fog.color.setHex(th.FOG.COLOR); scene.fog.near = th.FOG.NEAR; scene.fog.far = th.FOG.FAR;
    Stage.hemi.color.setHex(th.HEMI.SKY); Stage.hemi.groundColor.setHex(th.HEMI.GROUND); Stage.hemi.intensity = th.HEMI.INTENSITY;
    const sun = Stage.sun;
    sun.color.setHex(th.SUN.COLOR); sun.intensity = th.SUN.INTENSITY; sun.position.set(...th.SUN.POS); sun.castShadow = th.SUN.SHADOWS;
    Stage.groundMat.color.setHex(th.GROUND); Stage.mountainMat.color.setHex(th.MOUNTAINS);

    Road.applyTheme(th.ROAD);
    Forks.applyTheme(th);
    Roadside.applyTheme(th);
    Cars.applyTheme(th);
    Weather.set(th.WEATHER);

    Theme.stars.visible = th.STARS > 0;
    Theme.stars.geometry.setDrawRange(0, th.STARS);
    const D = th.SUN_DISC;
    Theme.sunDisc.visible = !!D;
    if (D) { Theme.sunDisc.material.color.setHex(D.COLOR); Theme.sunDisc.scale.setScalar(D.SIZE); Theme.sunDisc.position.set(0, D.Y, D.Z); }
    Theme.update();
  },

  // Вертикальный градиент неба на весь экран (фон сцены), один на тему
  gradient(name, stops) {
    if (!Theme.skyTex[name]) {
      const [c, g] = Util.canvas(4, 512), grad = g.createLinearGradient(0, 0, 0, 512);
      for (const [at, color] of stops) grad.addColorStop(at, color);
      g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
      Theme.skyTex[name] = Util.canvasTexture(c);
    }
    return Theme.skyTex[name];
  },

  // Звёзды и солнце держатся впереди камеры (по ширине идут за ней)
  update() {
    const x = Stage.camera.position.x;
    if (Theme.stars.visible) Theme.stars.position.x = x;
    if (Theme.sunDisc.visible) Theme.sunDisc.position.x = x;
  },
};
