// ============================================================================
// help.js — окно "How to play" (кнопка "?" в колонке HUD, chrome.js). Две страницы без прокрутки:
//   1. что делает каждый цвет (список строится из CONFIG.MATCH3.TILES, значки те же, что на поле) и картинка
//      ходов: машина в середине сетки 3 x 3, стрелки в соседние клетки, у каждой кристалл или пара кристаллов,
//      которые туда ведут (одиночные цвета прямо, пары по диагонали). Кнопка "Page 2". Если страница не влезает
//      в рамку, картинка уменьшается (Help.fit);
//   2. ведение кристаллов, соперники, победа и поражение. Кнопка "Got it".
// "?" всегда открывает первую страницу. Окно лежит поверх всей рамки ниже кнопок, закрывается "Got it",
// кликом по фону, Esc и той же "?".
// Ход партии оно не останавливает: игра пошаговая, а поле под окном не нажать.
// ============================================================================

const Help = {
  // Что делает цвет: по id кристалла из CONFIG.MATCH3.TILES, в порядке показа (сначала ходы, ремонт последним)
  TILE_TEXT: {
    red:    ['Dash', 'Move one row forward. If a car is there, ram it.'],
    blue:   ['Brake', 'Drop one row back.'],
    yellow: ['Left', 'Shift one lane to the left.'],
    teal:   ['Right', 'Shift one lane to the right.'],
    purple: ['Scout dash', "Dash forward, then see every rival's next move above its car."],
    green:  ['Repair', () => `Restore ${CONFIG.RULES.HEAL} HP. Uses your turn.`],
  },
  el: null,
  current: 1,        // открытая страница

  init() {
    Help.el = document.getElementById('help');
    const tiles = document.getElementById('help-tiles'), dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    for (const [id, text] of Object.entries(Help.TILE_TEXT)) {
      const type = CONFIG.MATCH3.TILES.findIndex(t => t.id === id), t = CONFIG.MATCH3.TILES[type];
      if (!t) continue;
      const row = document.createElement('div');
      row.className = 'help-tile';
      const icon = Crystals.sprite(type, CONFIG.UI.HELP.ICON_R, dpr);
      icon.canvas.style.width = icon.canvas.style.height = icon.size + 'px';
      row.appendChild(icon.canvas);
      const desc = document.createElement('div');
      desc.innerHTML = `<b style="color:${t.color}">${text[0]}</b><span>${typeof text[1] === 'function' ? text[1]() : text[1]}</span>`;
      row.appendChild(desc);
      tiles.appendChild(row);
    }
    const D = CONFIG.MATCH3.DRAG, R = CONFIG.RULES;
    document.getElementById('help-drag').textContent =
      `Press a crystal and drag it around the board, straight or diagonally. Every crystal it passes swaps places with it. ` +
      `Let go, or wait ${D.TIME} seconds, and every line of ${CONFIG.MATCH3.MIN_MATCH} or more same-colored crystals clears, ` +
      `in any direction, diagonals included. Falling crystals can clear more lines.`;
    document.getElementById('help-rules').textContent =
      `After your move every rival moves. A ram costs the attacker ${R.RAM_DAMAGE_SELF} HP and the target ${R.RAM_DAMAGE_TARGET} HP; ` +
      `a car at 0 HP flies off the track. You win when no rival is in sight: all wrecked or at least ${R.WIN_BEHIND} rows behind. ` +
      `You lose if your car is wrecked or a rival gets more than ${R.LOSE_LEAD} rows ahead; a red glow marks a rival on that edge. ` +
      `A move with no lines wastes your turn.`;

    document.getElementById('help-next').addEventListener('click', () => Help.page(2));
    document.getElementById('help-close').addEventListener('click', Help.close);
    addEventListener('resize', () => { if (Help.isOpen()) Help.fit(); });
    Help.el.addEventListener('click', e => { if (e.target === Help.el) Help.close(); });   // клик по фону
    addEventListener('keydown', e => { if (e.key === 'Escape' && Help.isOpen()) { e.stopPropagation(); Help.close(); } }, true);
  },

  isOpen: () => !!Help.el && Help.el.classList.contains('show'),
  toggle() { if (Help.isOpen()) Help.close(); else Help.open(); },

  // "?" всегда открывает первую страницу
  open() {
    Help.el.classList.add('show');
    Chrome.btn.help.classList.add('active');
    Help.page(1);
  },

  page(n) {
    Help.current = n;
    document.getElementById('help-p1').hidden = n !== 1;
    document.getElementById('help-p2').hidden = n !== 2;
    Help.fit();
  },

  // Страницы не прокручиваются. Если страница не влезает по высоте: на первой сначала уменьшается картинка
  // ходов (до PIC_MIN), а если и этого мало (маленький экран), всё окно целиком масштабируется под высоту.
  fit() {
    const H = CONFIG.UI.HELP, box = document.getElementById('help-box'), cs = getComputedStyle(Help.el);
    const avail = Help.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    box.style.transform = '';
    if (Help.current === 1) {
      Help.drawMoves(H.PIC_MAX);
      const over = box.offsetHeight - avail;
      if (over > 0) Help.drawMoves(Math.max(H.PIC_MIN, H.PIC_MAX - over));
    }
    if (box.offsetHeight > avail) box.style.transform = `scale(${avail / box.offsetHeight})`;
  },

  close() {
    if (Help.el) Help.el.classList.remove('show');
    if (Chrome.btn.help) Chrome.btn.help.classList.remove('active');
  },

  // ---- картинка ходов ----
  // Машина в средней клетке, вокруг восемь клеток. В клетке кристалл (или пара), который туда ведёт, к нему стрелка.
  // size это сторона квадратной картинки в css-пикселях.
  drawMoves(size) {
    const cv = document.getElementById('help-moves'), H = CONFIG.UI.HELP;
    const dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    const w = Math.round(size), h = w, cw = w / 3, ch = h / 3;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const type = id => CONFIG.MATCH3.TILES.findIndex(t => t.id === id);
    const icon = (id, r) => Crystals.sprite(type(id), r, dpr);

    // дорога: асфальт, кромки, пунктир между полосами, тонкие границы рядов
    g.fillStyle = '#2d3340'; Help.round(g, 0, 0, w, h, 14); g.fill();
    g.save(); Help.round(g, 0, 0, w, h, 14); g.clip();
    for (let y = 0; y < h; y += 16) for (const x of [0, w - 6]) { g.fillStyle = (y / 16) % 2 ? '#e8e8e8' : '#d0392b'; g.fillRect(x, y, 6, 16); }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.setLineDash([12, 10]);
    for (const x of [cw, cw * 2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (const y of [ch, ch * 2]) { g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke(); }
    g.restore();

    // клетки: [колонка, ряд сверху, кристаллы]; одиночные цвета прямо, пары по диагонали
    const cells = [
      [1, 0, ['red']], [0, 1, ['yellow']], [2, 1, ['teal']], [1, 2, ['blue']],
      [0, 0, ['red', 'yellow']], [2, 0, ['red', 'teal']], [0, 2, ['blue', 'yellow']], [2, 2, ['blue', 'teal']],
    ];
    const cx = cw * 1.5, cy = ch * 1.5;
    for (const [c, r, ids] of cells) {
      const x = cw * (c + 0.5), y = ch * (r + 0.5);
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const start = Math.abs(ux) > Math.abs(uy) ? H.CAR_W / 2 + 6 : H.CAR_L / 2 + 6;
      const gap = ids.length > 1 ? H.PAIR_GAP : H.ARROW_GAP;
      Help.arrow(g, cx + ux * start, cy + uy * start, x - ux * gap, y - uy * gap, ids.length > 1);
      if (ids.length === 1) {
        const s = icon(ids[0], H.PIC_R);
        g.drawImage(s.canvas, x - s.size / 2, y - s.size / 2, s.size, s.size);
      } else {
        const a = icon(ids[0], H.PAIR_R), b = icon(ids[1], H.PAIR_R), off = H.PAIR_R + 5;
        g.drawImage(a.canvas, x - off - a.size / 2, y - a.size / 2, a.size, a.size);
        g.drawImage(b.canvas, x + off - b.size / 2, y - b.size / 2, b.size, b.size);
        g.fillStyle = '#fff'; g.font = '800 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('+', x, y + 1);
      }
    }
    Help.car(g, cx, cy, H.CAR_W, H.CAR_L);
  },

  // Стрелка от (x0, y0) к (x1, y1); диагональ (пара цветов) пунктиром
  arrow(g, x0, y0, x1, y1, dashed) {
    const a = Math.atan2(y1 - y0, x1 - x0), head = 9;
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [color, width] of [['rgba(0,0,0,0.55)', 5.5], ['#ffffff', 2.5]]) {
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width;
      g.setLineDash(dashed ? [5, 5] : []);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6); g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head);
      g.lineTo(x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head);
      g.closePath(); g.fill(); if (width > 3) g.stroke();
    }
    g.restore();
  },

  // Машина игрока сверху: кузов, стёкла, фары
  car(g, x, y, w, l) {
    const P = '#' + CONFIG.PLAYER.COLOR.toString(16).padStart(6, '0');
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.35)'; Help.round(g, x - w / 2 + 2, y - l / 2 + 3, w, l, 7); g.fill();     // тень
    g.fillStyle = P; Help.round(g, x - w / 2, y - l / 2, w, l, 7); g.fill();
    g.fillStyle = '#1b2333';
    Help.round(g, x - w / 2 + 5, y - l / 2 + 12, w - 10, 11, 3); g.fill();                              // лобовое
    Help.round(g, x - w / 2 + 5, y + l / 2 - 17, w - 10, 8, 3); g.fill();                               // заднее
    g.fillStyle = '#fff6c8';
    g.fillRect(x - w / 2 + 4, y - l / 2 + 1, 7, 3); g.fillRect(x + w / 2 - 11, y - l / 2 + 1, 7, 3);   // фары
    g.fillStyle = '#ff2a1a';
    g.fillRect(x - w / 2 + 4, y + l / 2 - 4, 7, 3); g.fillRect(x + w / 2 - 11, y + l / 2 - 4, 7, 3);   // стопы
    g.restore();
  },

  round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  },
};
