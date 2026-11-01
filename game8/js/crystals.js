// ============================================================================
// crystals.js — внешний вид кружков match-3: прозрачные кристаллы. Форма показывает, что делает цвет:
// треугольник вершиной в сторону движения (рывок вверх, тормоз вниз, влево, вправо), октагон это
// показать намерения, крест это лечение. Какая форма у какого цвета, задано в CONFIG.MATCH3.TILES,
// внешний вид в CONFIG.MATCH3.CRYSTAL.
//
//   Crystals.sprite(type, R, dpr)   готовая картинка кристалла: { canvas, size } (size в css-пикселях)
//   Crystals.trace(g, type, x, y, r) путь контура кристалла в точке (x, y): для выделения
//   Crystals.glint(g, x, y, R, t, time)  периодический блик на кристалле-кружке t
//
// Кристалл рисуется один раз на тип и размер (картинкой), поэтому поле быстро перерисовывается.
// Блики рисуются поверх каждый кадр: у каждого кристалла свой период и своё время.
// ============================================================================

const Crystals = {
  // ---- цвет ----
  rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  },
  // k > 0 подмешивает белый, k < 0 чёрный
  tint(c, k) {
    const to = k > 0 ? 255 : 0, a = Math.abs(k);
    return c.map(v => Math.round(v + (to - v) * a));
  },
  rgba: (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`,

  // ---- форма ----
  // Внешний контур типа в единицах радиуса (центр в нуле, y вниз), вершины по кругу
  outline(type) {
    const T = CONFIG.MATCH3.TILES[type], C = CONFIG.MATCH3.CRYSTAL, S = C.SIZE[T.shape], pts = [];
    if (T.shape === 'triangle') {                       // равносторонний, вершина в сторону apex
      const a0 = T.apex * Math.PI / 180;
      for (let i = 0; i < 3; i++) { const a = a0 + i * 2 * Math.PI / 3; pts.push([Math.cos(a) * S, Math.sin(a) * S]); }
    } else if (T.shape === 'octagon') {                 // правильный, сторонами вверх, вниз и по бокам
      for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([Math.cos(a) * S, Math.sin(a) * S]); }
    } else {                                            // крест
      const w = C.CROSS_ARM;
      for (const [x, y] of [[-w, -1], [w, -1], [w, -w], [1, -w], [1, w], [w, w], [w, 1], [-w, 1], [-w, w], [-1, w], [-1, -w], [-w, -w]]) pts.push([x * S, y * S]);
    }
    return pts;
  },

  // Путь контура кристалла типа type с центром (x, y) и радиусом r
  trace(g, type, x, y, r) {
    g.beginPath();
    Crystals.outline(type).forEach(([px, py], i) => { i ? g.lineTo(x + px * r, y + py * r) : g.moveTo(x + px * r, y + py * r); });
    g.closePath();
  },

  // ---- картинка кристалла ----
  sprite(type, R, dpr) {
    const C = CONFIG.MATCH3.CRYSTAL, glow = R * C.GLOW, ext = R * Math.max(...Object.values(C.SIZE));
    const size = Math.ceil((ext + glow + 2) * 2);                   // одинаковый размер для всех типов, css-пиксели
    const [canvas, g] = Util.canvas(Math.round(size * dpr), Math.round(size * dpr));
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);
    Crystals.paint(g, type, R, glow, dpr);
    return { canvas, size };
  },

  // Прозрачный гранёный кристалл: свечение, тело с градиентом, граня по кольцу, светлая площадка в центре,
  // светлые рёбра со стороны света, обводка и маленький блик
  paint(g, type, R, glow, dpr) {
    const C = CONFIG.MATCH3.CRYSTAL, T = CONFIG.MATCH3.TILES[type], tint = Crystals.tint, rgba = Crystals.rgba;
    const base = Crystals.rgb(T.color), L = C.LIGHT * Math.PI / 180;
    const P = Crystals.outline(type).map(([x, y]) => [x * R, y * R]);
    const Q = P.map(([x, y]) => [x * C.INNER, y * C.INNER]);
    const n = P.length;
    const poly = pts => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };

    // мягкое цветное свечение вокруг
    g.save();
    g.shadowColor = rgba(base, 0.9); g.shadowBlur = glow * dpr;
    poly(P); g.fillStyle = rgba(base, C.ALPHA * 0.6); g.fill();
    g.restore();

    // тело: прозрачное, светлее слева сверху и темнее справа снизу
    const body = g.createLinearGradient(-R, -R, R, R);
    body.addColorStop(0, rgba(tint(base, 0.45), Math.min(1, C.ALPHA + 0.2)));
    body.addColorStop(1, rgba(tint(base, -0.35), C.ALPHA));
    poly(P); g.fillStyle = body; g.fill();

    // грани по кольцу между внешним и внутренним контуром: освещённые светлее, остальные темнее
    const lit = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], qa = Q[i], qb = Q[(i + 1) % n];
      const d = Math.cos(Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2) - L);     // насколько грань смотрит на свет
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(qb[0], qb[1]); g.lineTo(qa[0], qa[1]); g.closePath();
      g.fillStyle = d > 0 ? `rgba(255,255,255,${d * C.FACET_LIGHT})` : `rgba(0,0,0,${-d * C.FACET_DARK})`;
      g.fill();
      lit.push(d);
    }

    // внутренняя площадка
    const table = g.createLinearGradient(-R * C.INNER, -R * C.INNER, R * C.INNER, R * C.INNER);
    table.addColorStop(0, 'rgba(255,255,255,0.45)');
    table.addColorStop(1, rgba(base, 0.12));
    poly(Q); g.fillStyle = table; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineJoin = 'round'; g.stroke();

    // рёбра между гранями
    g.strokeStyle = 'rgba(255,255,255,0.38)'; g.lineWidth = 1;
    g.beginPath(); for (let i = 0; i < n; i++) { g.moveTo(P[i][0], P[i][1]); g.lineTo(Q[i][0], Q[i][1]); } g.stroke();

    // светлые рёбра там, где грань смотрит на свет
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.8; g.lineCap = 'round';
    for (let i = 0; i < n; i++) if (lit[i] > 0.55) { g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[(i + 1) % n][0], P[(i + 1) % n][1]); g.stroke(); }

    // обводка
    poly(P); g.strokeStyle = rgba(tint(base, 0.6), 0.95); g.lineWidth = 1.4; g.lineJoin = 'round'; g.stroke();

    // маленький блик у вершины внутренней площадки, обращённой к свету
    let best = 0, bd = -Infinity;
    Q.forEach(([x, y], i) => { const d = x * Math.cos(L) + y * Math.sin(L); if (d > bd) { bd = d; best = i; } });
    const sx = Q[best][0] * 0.6, sy = Q[best][1] * 0.6;
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(sx, sy, Math.max(1, R * 0.07), 0, Math.PI * 2); g.fill();
  },

  // ---- блик ----
  hash(n) { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); },

  // Периодический блик на кристалле t (поля phase, period, seed): короткая вспышка четырёхлучевой звёздочки
  // в случайном месте на кристалле. Вне вспышки ничего не рисует. R это текущий радиус с учётом масштаба.
  glint(g, x, y, R, t, time) {
    const S = CONFIG.MATCH3.CRYSTAL.SPARKLE;
    const cycle = (time + t.phase) / t.period, n = Math.floor(cycle);
    const k = (cycle - n) * t.period / S.DURATION;               // 0..1 во время вспышки, дальше пауза
    if (k >= 1) return;
    const s = Math.sin(k * Math.PI);                             // нарастает и гаснет
    const ang = Crystals.hash(n * 7.13 + t.seed) * Math.PI * 2, dist = (0.08 + 0.3 * Crystals.hash(n * 3.71 + t.seed * 1.7)) * R;
    const gx = x + Math.cos(ang) * dist, gy = y + Math.sin(ang) * dist, len = S.SIZE * R * s;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(gx, gy, 0, gx, gy, len * 0.8);
    halo.addColorStop(0, `rgba(255,255,255,${0.85 * s})`); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(gx, gy, len * 0.8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,255,255,${s})`; g.lineCap = 'round';
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(gx - len, gy); g.lineTo(gx + len, gy); g.moveTo(gx, gy - len); g.lineTo(gx, gy + len); g.stroke();
    const d = len * 0.5;
    g.lineWidth = 1; g.beginPath(); g.moveTo(gx - d, gy - d); g.lineTo(gx + d, gy + d); g.moveTo(gx - d, gy + d); g.lineTo(gx + d, gy - d); g.stroke();
    g.restore();
  },
};
