// ============================================================================
// markers.js — значки над машинами: полоска HP и стрелка "следующий ход" (её открывает фиолетовый кристалл).
// Это спрайты-билборды: всегда смотрят в камеру и рисуются поверх всего (depthTest выключен).
// И красная аура вокруг противника на грани отрыва (RULES.LOSE_LEAD рядов впереди игрока, CONFIG.MARKERS.AURA).
// ============================================================================

const Markers = {
  arrowTex: {},      // текстуры стрелок по ходам: F, B, L, R, S
  auraTex: null,     // мягкое пятно ауры на дороге

  init() {
    for (const d of ['F', 'B', 'L', 'R', 'S']) Markers.arrowTex[d] = Markers.makeArrowTexture(d);
    const [c, g] = Util.canvas(128, 128), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    Markers.auraTex = new THREE.CanvasTexture(c);
  },

  // ---- HP ----
  makeHp(carHeight) {
    const M = CONFIG.MARKERS.HP;
    const [canvas] = Util.canvas(M.CANVAS_W, M.CANVAS_H);
    const tex = Util.canvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(M.W, M.H, 1);
    sprite.position.y = carHeight + M.Y;
    return { sprite, canvas, tex };
  },

  drawHp(car) {
    const M = CONFIG.MARKERS.HP, c = car.hpUi.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, c.width, c.height);
    const k = Math.max(0, car.hp / car.maxHp);
    g.fillStyle = k > M.MID_AT ? M.GOOD : k > M.LOW_AT ? M.MID : M.LOW;
    g.fillRect(2, 2, (c.width - 4) * k, c.height - 4);
    car.hpUi.tex.needsUpdate = true;
  },

  // ---- Намерение ----
  makeArrowTexture(dir) {
    const [c, g] = Util.canvas(64, 64);
    g.fillStyle = CONFIG.MARKERS.INTENT.COLOR; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    if (dir === 'S') { g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill(); return new THREE.CanvasTexture(c); }   // пропуск хода: точка
    g.translate(32, 32); g.rotate({ F: 0, R: Math.PI / 2, B: Math.PI, L: -Math.PI / 2 }[dir]);
    g.beginPath(); g.moveTo(0, -20); g.lineTo(16, 2); g.lineTo(6, 2); g.lineTo(6, 20); g.lineTo(-6, 20); g.lineTo(-6, 2); g.lineTo(-16, 2); g.closePath(); g.fill();
    return Util.canvasTexture(c);
  },

  makeIntent(carHeight) {
    const M = CONFIG.MARKERS.INTENT;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Markers.arrowTex.S, transparent: true, depthTest: false }));
    sprite.scale.set(M.SIZE, M.SIZE, 1);
    sprite.position.y = carHeight + M.Y;
    sprite.visible = false;
    return sprite;
  },

  setIntent(car, dir) { car.intent.material.map = Markers.arrowTex[dir]; },

  // ---- Аура ----
  // Оболочки: тот же кузов, раздутый во все стороны (слои SHELLS, внешний шире и бледнее), видна только
  // изнанка, поэтому вокруг машины светится контур, гаснущий наружу. Пятно на дороге под машиной.
  // Всё аддитивное и без тумана.
  makeAura(car) {
    const A = CONFIG.MARKERS.AURA;
    const mat = (opacity, extra) => new THREE.MeshBasicMaterial({ color: A.COLOR, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra });
    car.hull.geometry.computeBoundingBox();
    const box = car.hull.geometry.boundingBox, mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const shells = A.SHELLS.map(([pad, opacity]) => {
      const geo = car.hull.geometry.clone();
      geo.translate(-mid.x, -mid.y, -mid.z);
      geo.scale(1 + 2 * pad / size.x, 1 + 2 * pad / size.y, 1 + 2 * pad / size.z);
      geo.translate(mid.x, mid.y, mid.z);
      const shell = new THREE.Mesh(geo, mat(opacity, { side: THREE.BackSide }));
      shell.userData.opacity = opacity; shell.visible = false;
      car.body.add(shell);
      return shell;
    });
    // holder не повёрнут: поперёк дороги x (ширина машины size.z), вдоль z (длина size.x).
    // Дорога и заплатки развилок рисуются с polygonOffset (до -4), пятно выдвинуто сильнее, иначе дорога его закрывает.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.z * A.GROUND, size.x * A.GROUND),
      mat(A.GROUND_OPACITY, { map: Markers.auraTex, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = A.GROUND_Y;
    car.holder.add(ground);
    ground.visible = false;
    return { shells, ground };
  },

  // Показать или спрятать ауру, пока видна, она пульсирует
  updateAura(car, t, on) {
    const a = car.aura, A = CONFIG.MARKERS.AURA;
    a.ground.visible = on;
    for (const s of a.shells) s.visible = on;
    if (!on) return;
    const k = A.PULSE_MIN + (1 - A.PULSE_MIN) * (0.5 + 0.5 * Math.sin(t * A.PULSE_HZ * Math.PI * 2));
    for (const s of a.shells) s.material.opacity = s.userData.opacity * k;
    a.ground.material.opacity = A.GROUND_OPACITY * k;
  },
};
