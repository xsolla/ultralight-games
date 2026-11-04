// ============================================================================
// board.js — поле match-3: рисует кристаллы на canvas, принимает ведение кристалла, анимирует
// схлопывание, падение и каскады. Правила (поиск линий, генерация) в match3.js, вид кристаллов в
// crystals.js, числа в CONFIG.MATCH3.
//
// Ход игрока как в Puzzle & Dragons: взять кристалл (нажать) и вести его по полю. Каждый кристалл, в
// клетку которого он входит (по горизонтали, вертикали или диагонали, DRAG.DIAGONAL), меняется с ним
// местами. С первого шага идёт время (DRAG.TIME, кольцо вокруг взятого кристалла). Отпустил или время
// кончилось: линии схлопываются, пустоты заполняются падающими, новые линии (каскады) схлопываются
// дальше, пока поле не успокоится. Все схлопнутые за цепочку кристаллы считаются по цветам, и в конце:
//   - если схлопнулся один цвет, срабатывает его команда (CONFIG.MATCH3.TILES[].command);
//   - если цветов несколько, HP в разделителе заменяется счётчиком и ОДНОВРЕМЕННО срабатывают два цвета
//     с наибольшим числом кристаллов (Match3.choose, при равенстве случайный выбор через Hud.tallyPick);
//   - если линий нет вовсе, ход потрачен впустую (DRAG.EMPTY_SKIP), противники ходят.
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
  tiles: [],                // tiles[r][c] = { type, r, c, x, y, s, a, phase, period, seed, glide } или null
  drag: null,               // взятый кристалл: { tile, x, y, pointer, moved, left } или null
  animating: false,         // идёт анимация поля
  lockedShown: false,

  init() {
    const cv = Board.canvas = document.getElementById('board');
    Board.ctx = cv.getContext('2d');
    Board.rows = CONFIG.MATCH3.ROWS;
    new ResizeObserver(Board.layout).observe(cv);
    cv.addEventListener('pointerdown', Board.onDown);
    cv.addEventListener('pointermove', Board.onMove);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, Board.onUp);
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

  // Поставить все кристаллы ровно в центры клеток
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
    Board.drag = null;
  },

  // Новая партия: другое поле, кристаллы "вырастают"
  async reset() {
    Hud.tallyHide();
    Board.animating = true;
    Board.build();
    await Board.popIn();
    Board.animating = false;
  },

  popIn() {
    const all = Board.tiles.flat();
    for (const t of all) { t.s = 0; t.a = 0; }
    return Tween.run(CONFIG.MATCH3.POP_IN, k => { for (const t of all) { t.s = k; t.a = k; } });
  },

  // ---- ввод: ведение кристалла ----
  locked: () => Board.animating || Game.isBusy(),

  point(e) {
    const rect = Board.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  },

  onDown(e) {
    const [x, y] = Board.point(e);
    if (Board.pick(Math.floor(y / Board.ch), Math.floor(x / Board.cw), x, y, e.pointerId)) Board.canvas.setPointerCapture(e.pointerId);
  },
  onMove(e) { if (Board.drag && Board.drag.pointer === e.pointerId) Board.dragTo(...Board.point(e)); },
  onUp(e) { if (Board.drag && Board.drag.pointer === e.pointerId) Board.drop(); },

  // Взять кристалл в клетке (r, c), палец в точке (x, y)
  pick(r, c, x, y, pointer) {
    if (Board.locked() || Board.drag || !Match3.inside(Board.tiles, r, c) || !Board.tiles[r][c]) return false;
    Board.drag = { tile: Board.tiles[r][c], x, y, pointer, moved: false, left: 1 };
    return true;
  },

  // Палец в точке (x, y): взятый кристалл идёт за ним. В клетку он входит, только когда палец во внутренней
  // её части (DRAG.CAPTURE), так что, срезая угол, он не задевает соседей. Если палец проскочил несколько
  // клеток, кристалл проходит их по шагу, меняясь с каждым кристаллом на пути.
  dragTo(x, y) {
    const d = Board.drag, D = CONFIG.MATCH3.DRAG;
    d.x = Util.clamp(x, 0, Board.w); d.y = Util.clamp(y, 0, Board.h);
    const r = Util.clamp(Math.floor(d.y / Board.ch), 0, Board.rows - 1), c = Util.clamp(Math.floor(d.x / Board.cw), 0, Board.cols - 1);
    if (Math.abs(d.x - Board.cellX(c)) > Board.cw * D.CAPTURE / 2 || Math.abs(d.y - Board.cellY(r)) > Board.ch * D.CAPTURE / 2) return;
    while (d.tile.r !== r || d.tile.c !== c) {
      let dr = Math.sign(r - d.tile.r), dc = Math.sign(c - d.tile.c);
      if (!D.DIAGONAL && dr && dc) { if (Math.abs(r - d.tile.r) >= Math.abs(c - d.tile.c)) dc = 0; else dr = 0; }
      Board.shift(d.tile.r + dr, d.tile.c + dc);
    }
  },

  // Взятый кристалл переходит в клетку (r, c), кристалл оттуда переезжает на его место.
  // Первый шаг запускает время на ведение: кончилось, и кристалл отпускается сам.
  shift(r, c) {
    const d = Board.drag, t = d.tile, other = Board.tiles[r][c];
    Match3.swap(Board.tiles, t.r, t.c, r, c);
    other.r = t.r; other.c = t.c; t.r = r; t.c = c;
    Board.glide(other, CONFIG.MATCH3.DRAG.SWAP);
    if (d.moved) return;
    d.moved = true;
    Tween.run(CONFIG.MATCH3.DRAG.TIME, k => { d.left = 1 - k; }, Util.linear).then(() => { if (Board.drag === d) Board.drop(); });
  },

  // Отпустить: кристалл встаёт в свою клетку, и, если его вели, поле схлопывается
  async drop() {
    const d = Board.drag;
    Board.drag = null;
    Board.animating = true;
    d.tile.x = d.x; d.tile.y = d.y;
    await Board.glide(d.tile, CONFIG.MATCH3.DRAG.DROP);
    if (d.moved) await Board.resolve();
    Board.animating = false;
  },

  // Отладка без мыши: провести кристалл по клеткам path = [[r, c], ...] (первая клетка это взятый) и отпустить
  async swipe(path) {
    const [[r0, c0], ...rest] = path;
    if (!Board.pick(r0, c0, Board.cellX(c0), Board.cellY(r0), null)) return;
    for (const [r, c] of rest) Board.dragTo(Board.cellX(c), Board.cellY(r));
    await Board.drop();
  },

  // ---- ход ----
  // Поле после ведения: вся цепочка схлопываний (с каскадами) считается по цветам и даёт один ход
  // (одну или две команды). Нет ни одной линии: ход потрачен впустую (DRAG.EMPTY_SKIP).
  async resolve() {
    let cells = Match3.find(Board.tiles);
    if (!cells.length) { if (CONFIG.MATCH3.DRAG.EMPTY_SKIP) Game.play(['S']); return; }
    const counts = Array(CONFIG.MATCH3.TILES.length).fill(0), flights = [], spot = [0, 0, 0];
    while (cells.length) {
      Board.count(cells, counts, flights, spot);
      await Board.clearAnim(cells);
      await Board.refill();
      cells = Match3.find(Board.tiles);
    }
    await Promise.all(flights);                           // все кометы долетели до счётчика
    await Board.decide(counts, [spot[0] / spot[2], spot[1] / spot[2]]);
    Board.snap();
  },

  // Прибавить схлопывающиеся кристаллы к счёту по цветам. Как только цветов стало больше одного,
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
      if (pick.candidates) { Game.state.log = 'Tie: random pick'; Hud.refresh(); }
      await Hud.tallyPick(pick.candidates, pick.winners, pick.landing);
      const shown = BoardFx.reveal(pick.winners);         // берёт места значков, пока счётчик ещё виден
      Hud.tallyHide();
      await shown;
    } else await BoardFx.reveal(pick.winners, from);
    Game.play(pick.winners.flatMap(t => [...CONFIG.MATCH3.TILES[t].command]));   // у цвета может быть несколько команд
  },

  // ---- анимации ----
  // Кристалл едет из текущей точки в центр своей клетки. Новая поездка того же кристалла отменяет прежнюю.
  glide(t, dur) {
    const id = t.glide = (t.glide || 0) + 1, x0 = t.x, y0 = t.y, x1 = Board.cellX(t.c), y1 = Board.cellY(t.r);
    return Tween.run(dur, k => { if (t.glide === id) { t.x = x0 + (x1 - x0) * k; t.y = y0 + (y1 - y0) * k; } });
  },

  async clearAnim(cells) {
    const list = cells.map(([r, c]) => Board.tiles[r][c]);
    await Tween.run(CONFIG.MATCH3.CLEAR, k => { for (const t of list) { t.s = 1 - k; t.a = 1 - k; } }, Util.easeIn);
    for (const [r, c] of cells) Board.tiles[r][c] = null;
  },

  // Кристаллы над пустотами падают вниз, сверху по тем же колонкам падают новые
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

  // ---- отрисовка ----
  draw() {
    const M = CONFIG.MATCH3, g = Board.ctx;
    if (!g || !Board.w) return;
    g.setTransform(Board.dpr, 0, 0, Board.dpr, 0, 0);
    g.clearRect(0, 0, Board.w, Board.h);

    const locked = Board.locked();
    if (locked !== Board.lockedShown) { Board.lockedShown = locked; Board.canvas.style.opacity = locked ? M.LOCKED_ALPHA : 1; }

    const time = Main.simT, d = Board.drag;               // время для бликов (стоит вместе с игрой на паузе)
    for (const row of Board.tiles) for (const t of row) {
      if (!t || t.s <= 0 || (d && t === d.tile)) continue;
      Board.drawTile(t, t.x, t.y, t.s, t.a, time);
    }
    if (d) Board.drawHeld(d, time);
    g.globalAlpha = 1;
  },

  drawTile(t, x, y, scale, alpha, time) {
    const g = Board.ctx, sprite = Board.sprites && Board.sprites[t.type];
    if (!sprite) return;
    const size = sprite.size * scale;
    g.globalAlpha = alpha;
    g.drawImage(sprite.canvas, x - size / 2, y - size / 2, size, size);         // кристалл
    Crystals.glint(g, x, y, Board.radius * scale, t, time);                     // периодический блик
  },

  // Взятый кристалл: контур клетки, куда он ляжет, сам кристалл под пальцем и кольцо оставшегося времени
  drawHeld(d, time) {
    const g = Board.ctx, D = CONFIG.MATCH3.DRAG, T = D.TIMER, t = d.tile;
    g.globalAlpha = 1;
    Crystals.trace(g, t.type, Board.cellX(t.c), Board.cellY(t.r), Board.radius);
    g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = D.SLOT; g.stroke();
    Board.drawTile(t, d.x, d.y, D.HOLD_SCALE, D.HOLD_ALPHA, time);
    g.globalAlpha = 1;
    g.beginPath(); g.arc(d.x, d.y, Board.radius * T.R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.left);
    g.lineWidth = T.WIDTH; g.lineCap = 'round'; g.strokeStyle = d.left <= T.LOW_AT ? T.LOW : T.COLOR; g.stroke();
  },
};
