// ============================================================================
// board.js — поле match-3: рисует кристаллы на canvas, принимает клики, анимирует свап, схлопывание,
// падение и каскады. Правила (поиск линий, ходы, генерация) в match3.js, вид кристаллов в crystals.js,
// числа в CONFIG.MATCH3.
//
// Ход игрока: клик по кристаллу выделяет его, клик по соседнему (по горизонтали или вертикали) меняет их
// местами. Если линии нет, свап откатывается. Если есть, кристаллы схлопываются, пустоты заполняются
// падающими, новые линии (каскады) схлопываются дальше, пока поле не успокоится. Все схлопнутые за
// цепочку кристаллы считаются по цветам, и в конце:
//   - если схлопнулся один цвет, срабатывает его команда (CONFIG.MATCH3.TILES[].command);
//   - если цветов несколько, HP в разделителе заменяется счётчиком и ОДНОВРЕМЕННО срабатывают два цвета
//     с наибольшим числом кристаллов (Match3.choose, при равенстве случайный выбор через Hud.tallyPick).
// Как складываются две команды в одном ходе, описано в game.js (Game.doCommands).
//
// Ввод закрыт, пока идёт анимация поля или ход машин (Game.isBusy). Всё время идёт через Tween.
// Поле ROWS x COLS занимает весь бокс: клетка = высота / ROWS на ширину / COLS (COLS 0 значит столько колонок,
// чтобы клетка была почти квадратной).
// ============================================================================

const Board = {
  canvas: null, ctx: null,
  w: 0, h: 0, dpr: 1,       // размер в css-пикселях и плотность
  rows: 0, cols: 0, cw: 0, ch: 0,   // сетка и размер клетки
  radius: 0, sprites: null, // радиус кристалла и его картинки по типам (crystals.js)
  tiles: [],                // tiles[r][c] = { type, r, c, x, y, s, a, phase, period, seed } или null
  selected: null,
  animating: false,         // идёт анимация поля
  lockedShown: false,

  init() {
    Board.canvas = document.getElementById('board');
    Board.ctx = Board.canvas.getContext('2d');
    Board.rows = CONFIG.MATCH3.ROWS;
    new ResizeObserver(Board.layout).observe(Board.canvas);
    Board.canvas.addEventListener('pointerdown', Board.onPointer);
    Board.layout();
  },

  // ---- геометрия ----
  cellX: c => (c + 0.5) * Board.cw,
  cellY: r => (r + 0.5) * Board.ch,

  // Подогнать под размер canvas. Если число колонок изменилось, поле собирается заново.
  layout() {
    const cv = Board.canvas, rect = cv.getBoundingClientRect(), M = CONFIG.MATCH3;
    if (!rect.width || !rect.height) return;
    Board.w = rect.width; Board.h = rect.height;
    Board.dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    cv.width = Math.round(Board.w * Board.dpr); cv.height = Math.round(Board.h * Board.dpr);
    const cols = M.COLS || Math.max(M.MIN_MATCH + 1, Math.round(Board.w / (Board.h / Board.rows)));   // 0: клетка почти квадратная
    Board.ch = Board.h / Board.rows;
    Board.cw = Board.w / cols;
    Board.radius = Math.min(Board.cw, Board.ch) * M.TILE_SIZE / 2;
    Board.sprites = M.TILES.map((_, type) => Crystals.sprite(type, Board.radius, Board.dpr));   // картинки кристаллов под этот размер
    if (!Board.tiles.length || cols !== Board.cols) { Board.cols = cols; Board.build(); }
    else Board.snap();
  },

  // Поставить все кружки ровно в центры клеток
  snap() {
    for (const row of Board.tiles) for (const t of row) if (t) { t.x = Board.cellX(t.c); t.y = Board.cellY(t.r); t.s = 1; t.a = 1; }
  },

  // ---- сборка поля ----
  makeTile(type, r, c) {
    const S = CONFIG.MATCH3.CRYSTAL.SPARKLE;
    // phase, period и seed задают периодический блик этого кристалла (crystals.js)
    return { type, r, c, x: Board.cellX(c), y: Board.cellY(r), s: 1, a: 1,
      phase: Math.random() * (S.PERIOD + S.PERIOD_RANGE), period: S.PERIOD + Math.random() * S.PERIOD_RANGE, seed: Math.random() * 100 };
  },

  // Новое поле из матрицы типов (если не задана, случайное без готовых линий)
  build(types) {
    types = types || Match3.generate(Board.rows, Board.cols);
    Board.rows = types.length; Board.cols = types[0].length;
    Board.tiles = types.map((row, r) => row.map((type, c) => Board.makeTile(type, r, c)));
    Board.selected = null;
  },

  // Новая партия: другое поле, кружки "вырастают"
  async reset() {
    Board.selected = null;
    Hud.tallyHide();
    Board.animating = true;
    Board.build();
    await Board.popIn();
    Board.animating = false;
  },

  popIn() {
    const all = Board.tiles.flat();
    for (const t of all) { t.s = 0; t.a = 0; }
    return Tween.run(CONFIG.MATCH3.SHUFFLE, k => { for (const t of all) { t.s = k; t.a = k; } });
  },

  // ---- ввод ----
  locked: () => Board.animating || Game.isBusy(),

  onPointer(e) {
    const rect = Board.canvas.getBoundingClientRect();
    Board.click(Math.floor((e.clientY - rect.top) / Board.ch), Math.floor((e.clientX - rect.left) / Board.cw));
  },

  // Клик по клетке (ряд, колонка). Выделяет кружок, а второй клик по соседнему делает свап.
  click(r, c) {
    if (Board.locked() || !Match3.inside(Board.tiles, r, c)) return;
    const t = Board.tiles[r][c], sel = Board.selected;
    if (!t) return;
    if (!sel) { Board.selected = t; return; }
    if (sel === t) { Board.selected = null; return; }
    if (Math.abs(sel.r - t.r) + Math.abs(sel.c - t.c) === 1) { Board.selected = null; Board.trySwap(sel, t); return; }
    Board.selected = t;                                   // не сосед: выделение переходит на новый кружок
  },

  // ---- ход ----
  async trySwap(a, b) {
    Board.animating = true;
    await Board.swapAnim(a, b);
    let cells = Match3.find(Board.tiles);
    if (!cells.length) { await Board.swapAnim(a, b); Board.animating = false; return; }   // линии нет, откат

    // вся цепочка схлопываний (с каскадами) считается по цветам и даёт одну команду
    const counts = Array(CONFIG.MATCH3.TILES.length).fill(0), flights = [], spot = [0, 0, 0];
    while (cells.length) {
      Board.count(cells, counts, flights, spot);
      await Board.clearAnim(cells);
      await Board.refill();
      cells = Match3.find(Board.tiles);
    }
    await Promise.all(flights);                           // все кометы долетели до счётчика
    await Board.decide(counts, [spot[0] / spot[2], spot[1] / spot[2]]);
    if (!Match3.hasMove(Board.tiles)) await Board.reshuffle();
    Board.snap();
    Board.animating = false;
  },

  // Прибавить схлопывающиеся кружки к счёту по цветам. Как только цветов стало больше одного,
  // HP в разделителе заменяется счётчиком: то, что схлопнулось раньше, он показывает сразу, а из кристаллов
  // этого шага в него летят кометы (BoardFx.comet), каждая прибавляет 1. Их Promise копятся в flights.
  // В spot копятся [сумма x, сумма y, число] схлопнутых кристаллов: оттуда взлетает цвет, если он один.
  count(cells, counts, flights, spot) {
    const before = counts.slice();
    for (const [r, c] of cells) {
      const t = Board.tiles[r][c];
      counts[t.type]++; spot[0] += t.x; spot[1] += t.y; spot[2]++;
    }
    if (counts.filter(n => n > 0).length < 2) return;
    if (!Hud.tallyOn()) Hud.tallyShow(before);
    for (const [r, c] of cells) { const t = Board.tiles[r][c]; flights.push(BoardFx.comet(t.type, t.x, t.y)); }
  },

  // Итог цепочки: один цвет срабатывает сразу, а если цветов несколько, срабатывают два самых
  // многочисленных ОДНОВРЕМЕННО (Match3.choose). Если выбор случайный, счётчик это показывает.
  // Потом выбранные кристаллы взлетают из счётчика в сцену (BoardFx.reveal), HP возвращается, и, как только
  // они показались, команды уходят в игру одним ходом (кристаллы растворяются уже во время хода).
  // Если цвет был один, он так же взлетает, но из середины схлопнутых кристаллов (from, точка поля).
  async decide(counts, from) {
    const pick = Match3.choose(counts);
    if (!pick.winners.length) return;
    if (counts.filter(n => n > 0).length > 1) {
      if (pick.candidates) { Game.state.log = 'Поровну: случайный выбор'; Hud.refresh(); }
      await Hud.tallyPick(pick.candidates, pick.winners, pick.landing);
      const shown = BoardFx.reveal(pick.winners);         // берёт места значков, пока счётчик ещё виден
      Hud.tallyHide();
      await shown;
    } else await BoardFx.reveal(pick.winners, from);
    Game.play(pick.winners.map(t => CONFIG.MATCH3.TILES[t].command));
  },

  // ---- анимации ----
  swapAnim(a, b) {
    Match3.swap(Board.tiles, a.r, a.c, b.r, b.c);
    [a.r, b.r] = [b.r, a.r]; [a.c, b.c] = [b.c, a.c];
    const ax = a.x, ay = a.y, bx = b.x, by = b.y, ax1 = Board.cellX(a.c), ay1 = Board.cellY(a.r), bx1 = Board.cellX(b.c), by1 = Board.cellY(b.r);
    return Tween.run(CONFIG.MATCH3.SWAP, k => {
      a.x = ax + (ax1 - ax) * k; a.y = ay + (ay1 - ay) * k;
      b.x = bx + (bx1 - bx) * k; b.y = by + (by1 - by) * k;
    }, Util.easeInOut);
  },

  async clearAnim(cells) {
    const list = cells.map(([r, c]) => Board.tiles[r][c]);
    await Tween.run(CONFIG.MATCH3.CLEAR, k => { for (const t of list) { t.s = 1 - k; t.a = 1 - k; } }, Util.easeIn);
    for (const [r, c] of cells) Board.tiles[r][c] = null;
  },

  // Кружки над пустотами падают вниз, сверху по тем же колонкам падают новые
  refill() {
    const falls = [];
    for (let c = 0; c < Board.cols; c++) {
      let write = Board.rows - 1;
      for (let r = Board.rows - 1; r >= 0; r--) {
        const t = Board.tiles[r][c];
        if (!t) continue;
        if (r !== write) { Board.tiles[write][c] = t; Board.tiles[r][c] = null; t.r = write; falls.push(t); }
        write--;
      }
      for (let r = write; r >= 0; r--) {                                   // новые стоят столбиком над полем
        const t = Board.makeTile(Match3.randomType(), r, c);
        t.y = Board.cellY(-1 - (write - r));
        Board.tiles[r][c] = t; falls.push(t);
      }
    }
    const M = CONFIG.MATCH3;
    return Promise.all(falls.map(t => {
      const y0 = t.y, y1 = Board.cellY(t.r), dist = (y1 - y0) / Board.ch;
      return Tween.run(M.FALL_BASE + M.FALL_PER_CELL * dist, k => { t.y = y0 + (y1 - y0) * k; }, Util.easeIn);
    }));
  },

  // Нет ходов: кружки исчезают и поле собирается заново
  async reshuffle() {
    const all = Board.tiles.flat(), types = Match3.generate(Board.rows, Board.cols);
    await Tween.run(CONFIG.MATCH3.SHUFFLE / 2, k => { for (const t of all) { t.s = 1 - k; t.a = 1 - k; } });
    all.forEach(t => { t.type = types[t.r][t.c]; });
    await Tween.run(CONFIG.MATCH3.SHUFFLE / 2, k => { for (const t of all) { t.s = k; t.a = k; } });
  },

  // ---- отрисовка ----
  draw() {
    const M = CONFIG.MATCH3, g = Board.ctx;
    if (!g || !Board.w) return;
    g.setTransform(Board.dpr, 0, 0, Board.dpr, 0, 0);
    g.clearRect(0, 0, Board.w, Board.h);

    const locked = Board.locked();
    if (locked !== Board.lockedShown) { Board.lockedShown = locked; Board.canvas.style.opacity = locked ? M.LOCKED_ALPHA : 1; }

    const time = Main.simT;                              // время для бликов (стоит вместе с игрой на паузе)
    for (const row of Board.tiles) for (const t of row) {
      if (!t || t.s <= 0) continue;
      const sprite = Board.sprites && Board.sprites[t.type];
      if (!sprite) continue;
      const sel = t === Board.selected, scale = t.s * (sel ? M.SELECT_SCALE : 1), size = sprite.size * scale;
      g.globalAlpha = t.a;
      g.drawImage(sprite.canvas, t.x - size / 2, t.y - size / 2, size, size);      // кристалл
      Crystals.glint(g, t.x, t.y, Board.radius * scale, t, time);                  // периодический блик
      if (sel) {                                                                   // выделение: контур по форме кристалла
        Crystals.trace(g, t.type, t.x, t.y, Board.radius * scale * 1.12);
        g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = M.SELECT_RING; g.stroke();
      }
    }
    g.globalAlpha = 1;
  },
};
