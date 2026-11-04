// ============================================================================
// ai.js — поведение противников. У каждого противника своё дерево поведения (behavior tree, AI.build),
// которое раз в ход выбирает план на следующий ход: L R F B или S. Планы выбираются после хода
// противников, до хода игрока, и их можно открыть (фиолетовый кристалл), поэтому при исполнении
// план не пересматривается (game.js, Game.enemiesTurn).
//
// Дерево: узлы проверяются сверху вниз, срабатывает первый удачный.
//   1. с шансом RANDOM_CHANCE совсем случайный ход по PLAN_WEIGHTS (может таранить своих): ручка сложности;
//   2. игрок в соседней клетке: с шансом ATTACK_CHANCE таран игрока;
//   3. обычный ход в свободную клетку по весам MOVE_WEIGHTS: вперёд чаще, а ход, который приближает к
//      игроку, ещё в CHASE раз чаще. Своих не таранит: клетки других противников и клетки, куда они уже
//      собрались, заняты. Если всё занято, остаётся пропуск;
// Во всех ходах (и совсем случайном): противник на ряду игрока или позади него назад не едет (AI.open).
//   4. некуда: стоит на месте.
// Числа в CONFIG.ENEMIES.AI.
//
// Узел это функция ctx => true (удача) или false. ctx = { car, plan, wild, taken }: машина, выбранный
// план, план совсем случайный, клетки, куда уже собрались другие противники (Set из AI.key).
// ============================================================================

const AI = {
  // ---- узлы ----
  select: (...kids) => ctx => kids.some(k => k(ctx)),             // первый удачный
  sequence: (...kids) => ctx => kids.every(k => k(ctx)),          // все по очереди, до первой неудачи
  chance: key => () => Math.random() < CONFIG.ENEMIES.AI[key],    // шанс читается из CONFIG при каждой проверке

  // Дерево поведения одного противника
  build: () => AI.select(
    AI.sequence(AI.chance('RANDOM_CHANCE'), AI.randomMove),
    AI.sequence(AI.playerNear, AI.chance('ATTACK_CHANCE'), AI.attack),
    AI.drive,
    AI.stay,
  ),

  // Выбрать план машине car. taken общий для всех противников за один ход.
  plan(car, taken) {
    const ctx = { car, plan: 'S', wild: false, taken };
    car.brain(ctx);
    car.plan = ctx.plan; car.wild = ctx.wild;
    if (ctx.plan !== 'S') taken.add(AI.key(...AI.target(car, ctx.plan)));
  },

  // ---- клетки ----
  key: (row, lane) => row * 100 + lane,
  target: (car, d) => [car.row + Game.DIRS[d][0], car.lane + Game.DIRS[d][1]],

  // ---- листья ----
  // Можно ли ехать в сторону d: клетка на трассе, и назад нельзя, если противник на ряду игрока или позади
  open: (car, d) => Game.inBounds(...AI.target(car, d)) && !(d === 'B' && car.row <= Game.state.playerRow),

  // Совсем случайный ход по билетикам PLAN_WEIGHTS, в стену не ходит, на машины не смотрит
  randomMove(ctx) {
    const pool = Object.entries(CONFIG.ENEMIES.PLAN_WEIGHTS).flatMap(([d, w]) => Array(w).fill(d));
    let d = pool[Math.random() * pool.length | 0];
    if (d !== 'S' && !AI.open(ctx.car, d)) d = 'S';
    ctx.plan = d; ctx.wild = true;
    return true;
  },

  // Игрок в соседней клетке (по горизонтали или вертикали): запомнить направление на него
  playerNear(ctx) {
    const p = Game.player();
    ctx.hit = p.alive && Object.keys(Game.DIRS).find(d => {
      const [r, l] = AI.target(ctx.car, d);
      return r === p.row && l === p.lane;
    });
    return !!ctx.hit;
  },

  attack(ctx) { ctx.plan = ctx.hit; return true; },

  // Обычный ход: случайный по весам среди свободных клеток (не стена, не машина, не чужая цель)
  drive(ctx) {
    const A = CONFIG.ENEMIES.AI, car = ctx.car, p = Game.player();
    const dist = (r, l) => Math.abs(r - p.row) + Math.abs(l - p.lane);
    const opts = [];
    for (const [d, w] of Object.entries(A.MOVE_WEIGHTS)) {
      if (d === 'S') { opts.push([d, w]); continue; }
      const [r, l] = AI.target(car, d);
      if (!AI.open(car, d) || Game.carAt(r, l) || ctx.taken.has(AI.key(r, l))) continue;
      opts.push([d, p.alive && dist(r, l) < dist(car.row, car.lane) ? w * A.CHASE : w]);
    }
    let roll = Math.random() * opts.reduce((s, o) => s + o[1], 0);
    for (const [d, w] of opts) if (w > 0 && (roll -= w) < 0) { ctx.plan = d; return true; }
    return false;
  },

  stay(ctx) { ctx.plan = 'S'; return true; },
};
