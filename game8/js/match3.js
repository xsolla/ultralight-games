// ============================================================================
// match3.js — правила match-3 без интерфейса и без анимаций. Чистые функции над сеткой.
//
// Сетка это массив рядов, элемент это объект с полем type (индекс цвета в CONFIG.MATCH3.TILES) или null
// для пустого места. Сколько рядов и колонок, определяет сетка. Всё, что показывает и анимирует,
// живёт в board.js.
//
//   Match3.find(grid)             все клетки в линиях из MIN_MATCH и более одного цвета, [[r, c], ...]
//   Match3.hasMove(grid)          есть ли хоть один свап соседей, дающий линию
//   Match3.choose(counts)         какие цвета срабатывают по итогам цепочки (один или два)
//   Match3.generate(rows, cols)   новое поле из типов без готовых линий, но с ходом
// ============================================================================

const Match3 = {
  inside: (grid, r, c) => r >= 0 && r < grid.length && c >= 0 && c < grid[0].length,
  typeAt: (grid, r, c) => (Match3.inside(grid, r, c) && grid[r][c]) ? grid[r][c].type : -1,

  // Линии из MIN_MATCH и более в четырёх направлениях: горизонталь, вертикаль, две диагонали
  find(grid) {
    const M = CONFIG.MATCH3, hit = new Set(), cells = [];
    const mark = (r, c) => { const key = r * 1000 + c; if (!hit.has(key)) { hit.add(key); cells.push([r, c]); } };
    for (const [dr, dc] of M.DIRECTIONS) {
      for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) {
        const t = Match3.typeAt(grid, r, c);
        if (t < 0 || Match3.typeAt(grid, r - dr, c - dc) === t) continue;      // не начало линии
        let len = 1;
        while (Match3.typeAt(grid, r + dr * len, c + dc * len) === t) len++;
        if (len >= M.MIN_MATCH) for (let i = 0; i < len; i++) mark(r + dr * i, c + dc * i);
      }
    }
    return cells;
  },

  // Свап двух клеток прямо в сетке (меняются элементы массива, сами объекты не трогаются)
  swap(grid, r1, c1, r2, c2) {
    const t = grid[r1][c1]; grid[r1][c1] = grid[r2][c2]; grid[r2][c2] = t;
  },

  // Есть ли хоть один свап соседей по горизонтали или вертикали, после которого появляется линия
  hasMove(grid) {
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!Match3.inside(grid, r + dr, c + dc)) continue;
        Match3.swap(grid, r, c, r + dr, c + dc);
        const ok = Match3.find(grid).length > 0;
        Match3.swap(grid, r, c, r + dr, c + dc);
        if (ok) return true;
      }
    }
    return false;
  },

  randomType: () => Math.random() * CONFIG.MATCH3.TILES.length | 0,

  // Какие цвета срабатывают по итогам цепочки. counts[i] это сколько кружков цвета i схлопнулось.
  // Один цвет срабатывает один. Несколько: срабатывают два самых многочисленных одновременно.
  // Если на место в паре претендуют несколько равных, выбор случайный, но противоположные пары
  // (F и B, L и R) исключаются, пока есть другие. Возвращает { winners, candidates, landing }:
  // winners это один или два цвета, candidates это среди кого шёл случайный выбор (или null),
  // landing это на ком выбор остановился (для показа).
  choose(counts) {
    const M = CONFIG.MATCH3, cmd = t => M.TILES[t].command;
    const opposite = (a, b) => M.OPPOSITE[cmd(a)] === cmd(b);
    const pickOne = list => list[Math.random() * list.length | 0];
    const types = counts.map((n, i) => i).filter(i => counts[i] > 0);
    if (types.length <= 1) return { winners: types, candidates: null, landing: null };

    const max = Math.max(...types.map(t => counts[t]));
    const top = types.filter(t => counts[t] === max);
    if (top.length === 2) return { winners: top, candidates: null, landing: null };

    if (top.length >= 3) {                                     // равны три цвета и больше: случайная пара
      const pairs = [];
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) pairs.push([top[i], top[j]]);
      const good = pairs.filter(p => !opposite(p[0], p[1])), pool = good.length ? good : pairs;
      const pair = pickOne(pool);
      return { winners: pair, candidates: [...new Set(pool.flat())], landing: pair[0] };
    }

    const rest = types.filter(t => t !== top[0]);              // один лидер: ищем второго
    const second = Math.max(...rest.map(t => counts[t]));
    const tied = rest.filter(t => counts[t] === second);
    if (tied.length === 1) return { winners: [top[0], tied[0]], candidates: null, landing: null };
    const good = tied.filter(t => !opposite(top[0], t)), pool = good.length ? good : tied;
    const chosen = pickOne(pool);
    return { winners: [top[0], chosen], candidates: pool.length > 1 ? pool : null, landing: chosen };
  },

  // Поле типов rows x cols без готовых линий, но хотя бы с одним ходом
  generate(rows, cols) {
    const N = CONFIG.MATCH3.TILES.length, back = [[0, -1], [-1, 0], [-1, -1], [-1, 1]];
    for (let attempt = 0; attempt < 100; attempt++) {
      const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // цвета, которые достроили бы две соседние клетки назад по любому направлению до линии из трёх
        const banned = new Set();
        for (const [dr, dc] of back) {
          const a = Match3.typeAt(grid, r + dr, c + dc);
          if (a >= 0 && a === Match3.typeAt(grid, r + dr * 2, c + dc * 2)) banned.add(a);
        }
        const options = [...Array(N).keys()].filter(t => !banned.has(t));
        grid[r][c] = { type: options[Math.random() * options.length | 0] };
      }
      if (Match3.hasMove(grid)) return grid.map(row => row.map(t => t.type));
    }
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Match3.randomType()));   // запасной вариант
  },
};
