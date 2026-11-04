// ============================================================================
// markers.js — значки над машинами: полоска HP и стрелка "следующий ход" (её открывает фиолетовый кристалл).
// Это спрайты-билборды: всегда смотрят в камеру и рисуются поверх всего (depthTest выключен).
// ============================================================================

const Markers = {
  arrowTex: {},      // текстуры стрелок по ходам: F, B, L, R, S

  init() {
    for (const d of ['F', 'B', 'L', 'R', 'S']) Markers.arrowTex[d] = Markers.makeArrowTexture(d);
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
};
