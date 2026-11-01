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
  // [r, g, b] 0..255 -> [оттенок в градусах, насыщенность 0..1, светлота 0..1]
  hsl(c) {
    const [r, g, b] = c.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    if (!d) return [0, 0, l];
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
  },
  fromHsl(h, s, l) {
    const a = s * Math.min(l, 1 - l), k = n => (n + h / 30) % 12;
    return [0, 8, 4].map(n => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255));
  },
  // Тот же оттенок с заданной светлотой, насыщенность не ниже CRYSTAL.SATURATION: цвет не выцветает ни в светлом, ни в тёмном
  shade(c, l) {
    const [h, s] = Crystals.hsl(c);
    return Crystals.fromHsl(h, Math.max(s, CONFIG.MATCH3.CRYSTAL.SATURATION), l);
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

  // Путь многоугольника со скруглёнными углами радиуса rad (углы и выпуклые, и вогнутые, как у креста)
  round(g, pts, rad) {
    const n = pts.length, a = pts[n - 1], b = pts[0];
    g.beginPath();
    g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.arcTo(p[0], p[1], q[0], q[1], rad); }
    g.closePath();
  },

  // Путь контура кристалла типа type с центром (x, y) и радиусом r
  trace(g, type, x, y, r) {
    Crystals.round(g, Crystals.outline(type).map(([px, py]) => [x + px * r, y + py * r]), r * CONFIG.MATCH3.CRYSTAL.CORNER);
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

  // Прозрачный гранёный кристалл. Всё в насыщенных оттенках своего цвета (без белой и чёрной заливки):
  // цветное свечение вокруг (под телом стирается, чтобы тело оставалось прозрачным), тело прозрачнее в центре
  // и плотнее у края, грани по кольцу, свет, собравшийся на дальней стороне, площадка в центре, светлый
  // край со стороны света и мягкий блик. Углы скруглены.
  paint(g, type, R, glow, dpr) {
    const C = CONFIG.MATCH3.CRYSTAL, T = CONFIG.MATCH3.TILES[type], rgba = Crystals.rgba;
    const base = Crystals.rgb(T.color), tone = l => Crystals.shade(base, l);
    const deep = tone(C.TONES.DEEP), mid = tone(C.TONES.MID), light = tone(C.TONES.LIGHT), pale = tone(C.TONES.PALE);
    const L = C.LIGHT * Math.PI / 180, lx = Math.cos(L), ly = Math.sin(L);       // направление на свет
    const P = Crystals.outline(type).map(([x, y]) => [x * R, y * R]);
    const Q = P.map(([x, y]) => [x * C.INNER, y * C.INNER]);
    const n = P.length, ext = Math.max(...P.map(([x, y]) => Math.hypot(x, y)));
    const shape = (pts, k) => Crystals.round(g, pts, R * C.CORNER * k);
    const across = (a, b) => g.createLinearGradient(lx * ext * a, ly * ext * a, lx * ext * b, ly * ext * b);   // вдоль направления света

    // свечение: рисуется только тень фигуры (сама фигура сдвинута за край картинки), потом под телом стирается
    const off = (ext + glow) * 4;
    g.save();
    g.shadowColor = rgba(mid, C.GLOW_ALPHA); g.shadowBlur = glow * dpr; g.shadowOffsetX = off * dpr;
    g.translate(-off, 0); shape(P, 1); g.fillStyle = '#000'; g.fill();
    g.restore();
    g.save();
    g.globalCompositeOperation = 'destination-out'; shape(P, 1); g.fill();
    g.restore();

    g.save();
    shape(P, 1); g.clip();

    // тело: прозрачное в центре, плотное и глубокое у края
    const body = g.createRadialGradient(0, 0, 0, 0, 0, ext);
    body.addColorStop(0, rgba(mid, C.ALPHA_CORE));
    body.addColorStop(0.55, rgba(mid, (C.ALPHA_CORE + C.ALPHA_RIM) / 2));
    body.addColorStop(1, rgba(deep, C.ALPHA_RIM));
    g.fillStyle = body; g.fillRect(-ext, -ext, ext * 2, ext * 2);

    // грани по кольцу между внешним и внутренним контуром: к свету светлее, от света глубже
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], qa = Q[i], qb = Q[(i + 1) % n];
      const d = Math.cos(Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2) - L);     // насколько грань смотрит на свет
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(qb[0], qb[1]); g.lineTo(qa[0], qa[1]); g.closePath();
      g.fillStyle = d > 0 ? rgba(light, d * C.FACET_LIGHT) : rgba(deep, -d * C.FACET_DARK);
      g.fill();
    }

    // свет, прошедший сквозь кристалл, собирается на дальней от света стороне
    const cx = -lx * ext * 0.3, cy = -ly * ext * 0.3, caustic = g.createRadialGradient(cx, cy, 0, cx, cy, ext * 0.55);
    caustic.addColorStop(0, rgba(light, C.CAUSTIC)); caustic.addColorStop(1, rgba(light, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = caustic; g.fillRect(-ext, -ext, ext * 2, ext * 2);
    g.globalCompositeOperation = 'source-over';

    // площадка в центре: светлее к свету, почти прозрачная от него
    const table = across(C.INNER, -C.INNER);
    table.addColorStop(0, rgba(pale, 0.4)); table.addColorStop(1, rgba(mid, 0.04));
    shape(Q, C.INNER); g.fillStyle = table; g.fill();
    g.lineWidth = Math.max(0.6, R * 0.025); g.strokeStyle = rgba(pale, 0.4); g.stroke();

    // рёбра между гранями
    g.strokeStyle = rgba(pale, 0.22);
    g.beginPath(); for (let i = 0; i < n; i++) { g.moveTo(P[i][0], P[i][1]); g.lineTo(Q[i][0], Q[i][1]); } g.stroke();

    // край: изнутри фигуры (обрезан по контуру, поэтому мягкий), со стороны света почти белый
    const rim = across(1, -1);
    rim.addColorStop(0, 'rgba(255,255,255,0.9)'); rim.addColorStop(0.45, rgba(pale, 0.5)); rim.addColorStop(1, rgba(light, 0.3));
    shape(P, 1); g.lineWidth = R * C.RIM * 2; g.strokeStyle = rim; g.stroke();

    // мягкий блик: вытянутое пятно у вершины площадки, ближайшей к свету
    let best = 0, bd = -Infinity;
    Q.forEach(([x, y], i) => { const d = x * lx + y * ly; if (d > bd) { bd = d; best = i; } });
    const sr = R * C.SPECULAR;
    g.translate(Q[best][0] * 0.6, Q[best][1] * 0.6); g.rotate(L + Math.PI / 2); g.scale(1, 0.55);
    const spec = g.createRadialGradient(0, 0, 0, 0, 0, sr);
    spec.addColorStop(0, 'rgba(255,255,255,0.95)'); spec.addColorStop(0.35, 'rgba(255,255,255,0.45)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(0, 0, sr, 0, Math.PI * 2); g.fill();
    g.restore();
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
