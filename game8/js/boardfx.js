// ============================================================================
// boardfx.js — эффекты поля match-3 поверх всего экрана: свой прозрачный canvas над рамкой #wrap, поэтому
// искры могут вылетать из поля в разделитель и в сцену. Работает, когда в цепочке несколько цветов:
//
//   BoardFx.comet(type, x, y)   из кристалла в точке (x, y) поля в значок его цвета в счётчике летит комета
//                               со шлейфом; долетев, прибавляет к счёту 1 (Hud.tallyAdd). Promise: долетела.
//   BoardFx.reveal(types, from) выбранные цвета взлетают из счётчика (или из точки поля from, если цвет был один)
//                               в сцену, вырастают, висят и растворяются, рассыпаясь искрами.
//                               Promise: показались (растворяются уже сами, пока идёт ход).
//
// Движение идёт от Tween и BoardFx.update(dt), поэтому паузится вместе с игрой. Числа в CONFIG.MATCH3.EFFECTS,
// оттенки те же, что у кристаллов (Crystals.shade).
// ============================================================================

const BoardFx = {
  canvas: null, ctx: null,
  w: 0, h: 0, dpr: 1,
  time: 0,
  comets: [], sparks: [], rings: [], reveals: [],
  palette: null,     // оттенки по цветам: { mid, light, pale }
  dots: null,        // мягкие светящиеся точки по цветам (картинки): головы комет, искры, ореолы
  dirty: false,      // на прошлом кадре что-то было нарисовано

  init() {
    const c = document.createElement('canvas');
    c.id = 'fx2d';
    document.getElementById('wrap').appendChild(c);
    BoardFx.canvas = c; BoardFx.ctx = c.getContext('2d');
    BoardFx.dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    const T = CONFIG.MATCH3.CRYSTAL.TONES;
    BoardFx.palette = CONFIG.MATCH3.TILES.map(t => {
      const b = Crystals.rgb(t.color);
      return { mid: Crystals.shade(b, T.MID), light: Crystals.shade(b, T.LIGHT), pale: Crystals.shade(b, T.PALE) };
    });
    BoardFx.dots = BoardFx.palette.map(p => BoardFx.dot(p));
    new ResizeObserver(BoardFx.layout).observe(c);
    BoardFx.layout();
  },

  layout() {
    const rect = BoardFx.canvas.getBoundingClientRect();
    BoardFx.w = rect.width; BoardFx.h = rect.height;
    BoardFx.canvas.width = Math.round(rect.width * BoardFx.dpr); BoardFx.canvas.height = Math.round(rect.height * BoardFx.dpr);
  },

  // Светящаяся точка: белая серединка, цветной ореол, мягкий край
  dot(p) {
    const n = 64, [canvas, g] = Util.canvas(n, n), h = n / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, Crystals.rgba(p.pale, 0.95));
    grad.addColorStop(0.4, Crystals.rgba(p.light, 0.45));
    grad.addColorStop(1, Crystals.rgba(p.mid, 0));
    g.fillStyle = grad; g.fillRect(0, 0, n, n);
    return canvas;
  },

  // ---- координаты (css-пиксели этого canvas) ----
  origin: () => BoardFx.canvas.getBoundingClientRect(),
  center(el) {
    const a = el.getBoundingClientRect(), o = BoardFx.origin();
    return [a.left + a.width / 2 - o.left, a.top + a.height / 2 - o.top];
  },
  fromBoard(x, y) {
    const a = Board.canvas.getBoundingClientRect(), o = BoardFx.origin();
    return [a.left - o.left + x, a.top - o.top + y];
  },

  // ---- искры ----
  // opt: gy ускорение по вертикали (вниз +), size и life множители
  spark(type, x, y, vx, vy, opt = {}) {
    const S = CONFIG.MATCH3.EFFECTS.SPARK;
    BoardFx.sparks.push({ type, x, y, vx, vy, gy: opt.gy ?? S.GRAVITY, age: 0,
      life: (S.LIFE + Math.random() * S.LIFE_RANGE) * (opt.life || 1), size: (S.SIZE + Math.random() * S.SIZE_RANGE) * (opt.size || 1) });
  },
  burst(type, x, y, n, speed = 1) {
    const S = CONFIG.MATCH3.EFFECTS.SPARK;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (S.SPEED + Math.random() * S.SPEED_RANGE) * speed;
      BoardFx.spark(type, x, y, Math.cos(a) * v, Math.sin(a) * v);
    }
  },

  // ---- кометы ----
  comet(type, x, y) {
    const E = CONFIG.MATCH3.EFFECTS.COMET;
    const [x0, y0] = BoardFx.fromBoard(x, y);
    const c = { type, x: x0, y: y0, trail: [], shed: 0, flying: false, done: false,
      side: (Math.random() < 0.5 ? -1 : 1) * (E.ARC + Math.random() * E.ARC_RANGE) };
    BoardFx.comets.push(c);
    const icon = Hud.tallyIcon(type);
    return Tween.wait(Math.random() * E.DELAY).then(() => {
      c.flying = true;
      BoardFx.burst(type, x0, y0, E.BURST, 0.7);
      return Tween.run(E.TIME + Math.random() * E.TIME_RANGE, k => {
        const [x1, y1] = BoardFx.center(icon);                          // цель берётся каждый кадр: значок может сдвинуться
        const dx = x1 - x0, dy = y1 - y0, u = 1 - k;
        const cx = (x0 + x1) / 2 - dy * c.side, cy = (y0 + y1) / 2 + dx * c.side;   // контрольная точка сбоку от прямой
        c.x = u * u * x0 + 2 * u * k * cx + k * k * x1;
        c.y = u * u * y0 + 2 * u * k * cy + k * k * y1;
      }, Util.easeIn);
    }).then(() => { c.flying = false; c.done = true; BoardFx.land(type, c.x, c.y); });
  },

  land(type, x, y) {
    const L = CONFIG.MATCH3.EFFECTS.LAND;
    Hud.tallyAdd(type);
    BoardFx.burst(type, x, y, L.SPARKS);
    BoardFx.rings.push({ type, x, y, age: 0 });
  },

  // ---- выбранные цвета ----
  // Взлетают из своих значков в счётчике, а если задано from (точка поля [x, y]), то оттуда и с размера
  // кристалла на поле: так показывается цвет, когда счётчика не было (схлопнулся один цвет).
  async reveal(types, from) {
    const E = CONFIG.MATCH3.EFFECTS.REVEAL, R = BoardFx.w * E.SIZE;
    const view = document.getElementById('view').getBoundingClientRect(), o = BoardFx.origin();
    const y1 = view.top - o.top + view.height * E.Y;
    const list = types.map((type, i) => {
      const sprite = Crystals.sprite(type, R, BoardFx.dpr);
      let x0, y0, w0;
      if (from) { [x0, y0] = BoardFx.fromBoard(from[0], from[1]); w0 = Board.sprites[type].size; }
      else { const icon = Hud.tallyIcon(type); [x0, y0] = BoardFx.center(icon); w0 = icon.getBoundingClientRect().width; }
      const x1 = BoardFx.w / 2 + (i - (types.length - 1) / 2) * E.GAP * BoardFx.w;
      const s0 = (w0 || 1) / sprite.size;                              // начинает с размера значка или кристалла на поле
      const soft = Util.canvas(sprite.canvas.width, sprite.canvas.height);  // сюда рисуется размытая копия при растворении
      return { type, sprite, soft, R, x0, y0, x1, y1, x: x0, y: y0, s: s0, s0, a: 1, blur: 0, flash: 0, glow: 0, phase: 'rise', emit: 0, born: BoardFx.time };
    });
    BoardFx.reveals.push(...list);
    await Promise.all(list.map(r => Tween.run(E.RISE, k => {
      r.x = r.x0 + (r.x1 - r.x0) * Util.easeInOut(k);
      r.y = r.y0 + (r.y1 - r.y0) * Util.easeOut(k);                    // вверх быстрее, чем вбок: путь дугой
      r.s = r.s0 + (1 - r.s0) * Util.easeOutBack(k);
      r.glow = k;
    }, Util.linear)));
    list.forEach(r => { r.phase = 'hold'; });
    await Tween.wait(E.HOLD);
    for (const r of list) BoardFx.dissolve(r);                         // не ждём: ход идёт, пока они растворяются
  },

  dissolve(r) {
    const E = CONFIG.MATCH3.EFFECTS.REVEAL;
    r.phase = 'dissolve';
    Tween.run(E.DISSOLVE, k => {
      r.a = 1 - Util.smooth(k);
      r.s = 1 + E.GROW * Util.easeOut(k);
      r.blur = E.BLUR * k * k;                                         // сначала чёткий, размывается к концу
      r.flash = E.FLASH * Math.sin(Math.min(1, k * 1.6) * Math.PI);    // вспыхивает светом в начале
      r.glow = 1 - k;
    }, Util.linear).then(() => { BoardFx.reveals.splice(BoardFx.reveals.indexOf(r), 1); });
  },

  // Где кристалл сейчас нарисован (с покачиванием)
  revealY: r => r.y + Math.sin((BoardFx.time - r.born) * CONFIG.MATCH3.EFFECTS.REVEAL.BOB_HZ * Math.PI * 2) * CONFIG.MATCH3.EFFECTS.REVEAL.BOB * r.glow,

  // ---- покадровое ----
  update(dt) {
    const FX = CONFIG.MATCH3.EFFECTS, C = FX.COMET, S = FX.SPARK, V = FX.REVEAL;
    BoardFx.time += dt;
    const now = BoardFx.time;

    for (const c of BoardFx.comets) {
      if (c.flying) {
        c.trail.push({ x: c.x, y: c.y, t: now });
        for (c.shed += dt * C.SHED; c.shed >= 1; c.shed--) BoardFx.spark(c.type, c.x, c.y, (Math.random() - 0.5) * S.SPEED, (Math.random() - 0.5) * S.SPEED, { size: 0.7 });
      }
      while (c.trail.length && now - c.trail[0].t > C.TRAIL) c.trail.shift();
    }
    BoardFx.comets = BoardFx.comets.filter(c => !c.done || c.trail.length);

    for (const r of BoardFx.reveals) {
      // при растворении искр тем больше, чем прозрачнее кристалл: он рассыпается, а не взрывается
      const rate = r.phase === 'rise' ? V.TRAIL : r.phase === 'dissolve' ? V.SPARKS * (0.2 + (1 - r.a)) : 0, y = BoardFx.revealY(r);
      for (r.emit += dt * rate; r.emit >= 1; r.emit--) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * r.R * r.s * 0.8, v = S.SPEED + Math.random() * S.SPEED_RANGE;
        if (r.phase === 'rise') BoardFx.spark(r.type, r.x + Math.cos(a) * d * 0.5, y + Math.sin(a) * d * 0.5, (Math.random() - 0.5) * S.SPEED, S.SPEED * 0.5);
        else BoardFx.spark(r.type, r.x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * v * 0.6, Math.sin(a) * v * 0.6 - S.SPEED, { gy: -S.GRAVITY * 0.5, size: 1.3, life: 1.6 });
      }
    }

    for (const p of BoardFx.sparks) {
      p.age += dt;
      const drag = Math.exp(-S.DRAG * dt);
      p.vx *= drag; p.vy = p.vy * drag + p.gy * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    BoardFx.sparks = BoardFx.sparks.filter(p => p.age < p.life);

    for (const r of BoardFx.rings) r.age += dt;
    BoardFx.rings = BoardFx.rings.filter(r => r.age < FX.LAND.RING_TIME);
  },

  draw() {
    const g = BoardFx.ctx, B = BoardFx, FX = CONFIG.MATCH3.EFFECTS, rgba = Crystals.rgba;
    if (!g || !B.w) return;
    const busy = B.comets.length || B.sparks.length || B.rings.length || B.reveals.length;
    if (!busy && !B.dirty) return;
    B.dirty = !!busy;
    g.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
    g.clearRect(0, 0, B.w, B.h);
    g.globalCompositeOperation = 'lighter';

    // выбранные цвета: лучи и ореол за кристаллом, сам кристалл (при растворении прозрачнее и размытее)
    for (const r of B.reveals) {
      const V = FX.REVEAL, p = B.palette[r.type], y = B.revealY(r), s = r.s;
      if (r.glow > 0) {
        const len = r.R * V.RAY_LEN * s, rot = B.time * V.RAY_SPEED;
        const grad = g.createRadialGradient(r.x, y, r.R * 0.3 * s, r.x, y, len);
        grad.addColorStop(0, rgba(p.pale, V.RAY_ALPHA * r.glow)); grad.addColorStop(1, rgba(p.light, 0));
        g.fillStyle = grad; g.beginPath();
        for (let i = 0; i < V.RAYS; i++) {
          const a = rot + i * Math.PI * 2 / V.RAYS, l = i % 2 ? len * 0.65 : len;   // лучи через один короче
          g.moveTo(r.x, y); g.arc(r.x, y, l, a - V.RAY_WIDTH, a + V.RAY_WIDTH); g.closePath();
        }
        g.fill();
        const hs = r.R * V.HALO * s;
        g.globalAlpha = V.HALO_ALPHA * r.glow;
        g.drawImage(B.dots[r.type], r.x - hs / 2, y - hs / 2, hs, hs);
        g.globalAlpha = 1;
      }
      // размытие делается на отдельном маленьком canvas: filter прямо на этом (большом, с масштабом) не срабатывает
      let img = r.sprite.canvas;
      if (r.blur > 0.3) {
        const [sc, sg] = r.soft;
        sg.clearRect(0, 0, sc.width, sc.height);
        sg.filter = `blur(${(r.blur * B.dpr / s).toFixed(1)}px)`; sg.drawImage(img, 0, 0); sg.filter = 'none';
        img = sc;
      }
      const size = r.sprite.size * s;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = r.a;
      g.drawImage(img, r.x - size / 2, y - size / 2, size, size);
      if (r.flash > 0) {                                               // вспышка: та же картинка ещё раз, светом
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = r.flash * r.a;
        g.drawImage(img, r.x - size / 2, y - size / 2, size, size);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
    }

    // кольца там, где кометы долетели
    for (const r of B.rings) {
      const k = r.age / FX.LAND.RING_TIME, p = B.palette[r.type];
      g.strokeStyle = rgba(p.pale, 1 - k); g.lineWidth = 2.5 * (1 - k) + 0.5;
      g.beginPath(); g.arc(r.x, r.y, FX.LAND.RING * Util.easeOut(k), 0, Math.PI * 2); g.stroke();
    }

    // шлейфы комет: густая цепочка мягких светящихся точек и тонкая светлая сердцевина, сужаются и гаснут к хвосту
    const W = FX.COMET.TRAIL_W, STEP = 2.5;
    for (const c of B.comets) {
      const p = B.palette[c.type], t = c.trail;
      for (let i = 1; i < t.length; i++) {
        const f0 = 1 - (B.time - t[i - 1].t) / FX.COMET.TRAIL, f1 = 1 - (B.time - t[i].t) / FX.COMET.TRAIL;
        if (f1 <= 0) continue;
        const dx = t[i].x - t[i - 1].x, dy = t[i].y - t[i - 1].y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP));
        for (let j = 0; j < n; j++) {
          const k = j / n, f = Math.max(0, f0 + (f1 - f0) * k), s = W * 3.2 * f;
          g.globalAlpha = 0.55 * f;
          g.drawImage(B.dots[c.type], t[i - 1].x + dx * k - s / 2, t[i - 1].y + dy * k - s / 2, s, s);
        }
        g.globalAlpha = 1;
        g.lineCap = 'butt';
        g.strokeStyle = rgba(p.pale, 0.85 * f1); g.lineWidth = W * 0.3 * f1;
        g.beginPath(); g.moveTo(t[i - 1].x, t[i - 1].y); g.lineTo(t[i].x, t[i].y); g.stroke();
      }
    }

    // искры
    for (const p of B.sparks) {
      const k = p.age / p.life, s = p.size * (1 - 0.5 * k);
      g.globalAlpha = 1 - k * k;
      g.drawImage(B.dots[p.type], p.x - s / 2, p.y - s / 2, s, s);
    }
    g.globalAlpha = 1;

    // головы комет: широкий цветной ореол и яркая серединка
    for (const c of B.comets) if (c.flying) {
      const s = FX.COMET.HEAD;
      g.globalAlpha = 0.6; g.drawImage(B.dots[c.type], c.x - s, c.y - s, s * 2, s * 2);
      g.globalAlpha = 1; g.drawImage(B.dots[c.type], c.x - s / 2, c.y - s / 2, s, s);
    }
    g.globalCompositeOperation = 'source-over';
  },
};
