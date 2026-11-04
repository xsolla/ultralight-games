// ============================================================================
// game.js — правила и ход игры. Здесь живёт состояние партии (машины, ряды, ход) и вся логика:
// расстановка, планы врагов, перемещения, столкновения, выбывание, очередность ходов.
//
// Игра пошаговая и дискретная: у каждой машины есть ряд и полоса, анимации (через Tween) лишь
// показывают результат. Игровая логика не знает про изгиб дороги: она двигает car.holder в
// логических координатах сетки, а cars.js накладывает изгиб при отрисовке.
//
// Команды игрока (L влево, R вправо, F рывок вперёд, B торможение назад, S пропуск, H лечение, V показать
// намерения) приходят из поля match-3 (board.js) по одной или по нескольку сразу (фиолетовый кристалл это F и V)
// и с клавиатуры (input.js, для отладки). Две команды срабатывают одновременно: F+R диагональ вперёд-вправо, F+B или L+R дёргание на месте
// (со столкновением с соседом), H лечит во время хода. Цифры (HP, урон, тайминги, шансы) в CONFIG.
//
// Конец партии (state.over, проверка после каждого полного хода, Game.outcome):
//   - поражение: машина игрока разбита ('crash') или противник ушёл вперёд больше чем на RULES.LOSE_LEAD рядов
//     ('escape'). Противника, который уже на LOSE_LEAD рядов впереди, отмечает красная аура (markers.js);
//   - победа ('win'): игрок видит только свою машину, все противники разбиты или позади на RULES.WIN_BEHIND рядов и больше.
// Итог записывается в лучшие результаты (results.js). Партия начинается с титульного экрана (Game.start, сложность)
// и туда же возвращается кнопкой выхода (Game.stop); пока она не начата (state.started), ходы не принимаются.
// ============================================================================

const Game = {
  // started: партия идёт (false на титульном экране), level: сложность (CONFIG.DIFFICULTY)
  state: { playerRow: 0, cars: [], turn: 1, busy: false, reveal: false, over: null, started: false, level: 'hard', log: '' },
  queue: [],            // команды игрока, ждущие своей очереди (одно схлопывание может дать несколько)

  // ---- сетка ----
  DIRS: { L: [0, -1], R: [0, 1], F: [1, 0], B: [-1, 0] },     // [изменение ряда, изменение полосы]
  cellX: lane => (lane - (CONFIG.TRACK.LANES - 1) / 2) * CONFIG.TRACK.LANE_W,
  cellZ: row => -(row - Game.state.playerRow) * CONFIG.TRACK.CELL_L,   // игрок всегда на z = 0, мир едет относительно него
  carAt: (row, lane) => Game.state.cars.find(c => c.alive && c.row === row && c.lane === lane),
  player: () => Game.state.cars[0],
  inBounds: (row, lane) => lane >= 0 && lane < CONFIG.TRACK.LANES && row >= 0 && row < CONFIG.TRACK.ROWS,
  ahead: car => car.row - Game.state.playerRow,                                      // на сколько рядов впереди игрока
  foes: () => Game.state.cars.filter(c => c.alive && !c.isPlayer),
  atLimit: car => car.alive && !car.isPlayer && Game.ahead(car) >= CONFIG.RULES.LOSE_LEAD,   // ещё ряд вперёд, и он ушёл

  // ---- старт ----
  spawnCar(type, color, row, lane, isPlayer) {
    const hp = isPlayer ? CONFIG.PLAYER.HP : CONFIG.ENEMIES.HP;
    const m = Cars.make(type, color);
    const car = { ...m, type, row, lane, isPlayer, hp, maxHp: hp, alive: true, phase: Math.random() * 7, plan: 'S', wild: false, dx: 0, dz: 0, brakeT: 0, hazardT: 0 };
    if (!isPlayer) { car.brain = AI.build(); car.aura = Markers.makeAura(car); }   // своё дерево поведения (ai.js) и аура
    car.hpUi = Markers.makeHp(m.height); m.holder.add(car.hpUi.sprite); Markers.drawHp(car);
    car.intent = Markers.makeIntent(m.height); m.holder.add(car.intent);
    m.holder.position.set(Game.cellX(lane), 0, Game.cellZ(row));   // логическая позиция, изгиб накладывает car.node
    car.node = new THREE.Group(); car.node.add(m.holder);
    Stage.scene.add(car.node);
    Game.state.cars.push(car);
    return car;
  },

  reset() {
    const S = Game.state, P = CONFIG.PLAYER, E = CONFIG.ENEMIES;
    for (const c of S.cars) Stage.scene.remove(c.node);
    S.cars.length = 0; S.playerRow = P.START_ROW; S.turn = 1; S.log = ''; S.reveal = false; S.over = null;
    Game.queue.length = 0;
    Hud.hideOver();

    Game.spawnCar(P.TYPE, P.COLOR, P.START_ROW, P.START_LANE, true);
    const cells = [];
    for (let r = E.FIRST_ROW; r <= E.LAST_ROW; r++) for (let l = 0; l < CONFIG.TRACK.LANES; l++) cells.push([r, l]);
    for (let i = 0; i < E.COUNT && cells.length; i++) {
      const [r, l] = cells.splice(Math.random() * cells.length | 0, 1)[0];
      Game.spawnCar(E.TYPE_CYCLE[i % E.TYPE_CYCLE.length], E.COLORS[i % E.COLORS.length], r, l, false);
    }
    Game.planEnemies();
    Hud.refresh();
  },

  // Новая партия на сложности level (с титульного экрана): шанс совсем случайного хода противника
  start(level) {
    const S = Game.state;
    S.level = level;
    CONFIG.ENEMIES.AI.RANDOM_CHANCE = CONFIG.DIFFICULTY.LEVELS[level];
    S.started = true;
    Game.reset(); Board.reset();
  },

  // Выход на титульный экран (кнопка выхода). Начатый ход доигрывается за экраном, но итог не считается.
  stop() {
    const S = Game.state;
    S.started = false; S.reveal = false;
    Game.queue.length = 0;
    Game.showIntents();
    Hud.hideOver(); Hud.tallyHide();
    Title.show();
  },

  // ---- планы врагов ----
  // План на следующий ход выбирает дерево поведения каждого противника (ai.js). taken общий: два
  // противника не собираются в одну клетку.
  planEnemies() {
    const taken = new Set();
    for (const c of Game.state.cars) {
      if (c.isPlayer || !c.alive) continue;
      AI.plan(c, taken);
      Markers.setIntent(c, c.plan);
    }
    Game.showIntents();
  },

  showIntents() {
    const S = Game.state;
    for (const c of S.cars) c.intent.visible = S.reveal && c.alive && !c.isPlayer && c.row >= S.playerRow - CONFIG.TRACK.ROWS_BEHIND;
  },

  // ---- анимации перемещений ----
  moveCars(cars, dur) {
    const items = cars.filter(c => c.alive).map(c => ({ c, x0: c.holder.position.x, z0: c.holder.position.z, x1: Game.cellX(c.lane), z1: Game.cellZ(c.row) }));
    return Tween.run(dur, k => { for (const i of items) i.c.holder.position.set(i.x0 + (i.x1 - i.x0) * k, 0, i.z0 + (i.z1 - i.z0) * k); }, Util.easeInOut);
  },
  relayout(dur) { return Game.moveCars(Game.state.cars, dur); },        // сдвиг всего мира (ход игрока)
  moveTo(car, dur) { return Game.moveCars([car], dur); },               // перемещение одной машины

  lean(car, dir) {
    const A = CONFIG.ANIM.LEAN;
    return Tween.run(CONFIG.TIMING.LEAN, k => {
      const a = Math.sin(k * Math.PI) * (dir === 'L' ? 1 : -1);
      car.body.rotation.y = Math.PI / 2 + a * A.YAW; car.body.rotation.x = a * A.ROLL;
    }, Util.linear);
  },
  lunge(car, amt) {
    return Tween.run(CONFIG.TIMING.LUNGE, k => {
      car.dz = Math.sin(k * Math.PI) * amt;
      car.body.rotation.z = Math.sin(k * Math.PI) * amt * CONFIG.ANIM.LUNGE.ROLL;
    }, Util.linear);
  },
  wiggle(car) {
    const A = CONFIG.ANIM.WIGGLE;
    return Tween.run(CONFIG.TIMING.WIGGLE, k => { car.dx = Math.sin(k * Math.PI * A.CYCLES) * A.AMP * (1 - k); }, Util.linear);
  },

  // ---- ход машины ----
  // Лечение: +HP (не выше максимума) и зелёная вспышка корпуса. Тратит ход, как и любое действие, кроме V.
  async heal(car) {
    const F = CONFIG.FX.HEAL;
    car.hp = Math.min(car.maxHp, car.hp + CONFIG.RULES.HEAL);
    Markers.drawHp(car);
    if (car.isPlayer) Hud.updateHp();
    Game.state.log = `Repair: +${CONFIG.RULES.HEAL} HP`;
    car.bodyMat.emissive.setHex(F.COLOR);
    await Tween.run(CONFIG.TIMING.HEAL, k => { car.bodyMat.emissiveIntensity = F.INTENSITY * Math.sin(k * Math.PI); }, Util.linear);
    car.bodyMat.emissiveIntensity = 0;
  },

  // Дёрнуться в сторону dir и вернуться: машина остаётся на месте
  twitch(car, dir) {
    const [dr, dl] = Game.DIRS[dir], A = CONFIG.ANIM.TWITCH;
    if (dir === 'B') car.brakeT = CONFIG.TIMING.BRAKE_LAMPS;
    return Tween.run(CONFIG.TIMING.TWITCH, k => {
      const s = Math.sin(k * Math.PI);
      car.dx = dl * A.AMP * s; car.dz = -dr * A.AMP * s;               // вперёд это -z
    }, Util.linear);
  },

  // Шаг машины игрока по одному направлению или по диагонали (два направления, не противоположных).
  // Ячейка занята: таран. Стена: одиночный ход упирается, а диагональ скользит вдоль стены.
  async step(car, dirs) {
    const T = CONFIG.TIMING, A = CONFIG.ANIM, D = Game.DIRS;
    let dr = 0, dl = 0;
    for (const d of dirs) { dr += D[d][0]; dl += D[d][1]; }
    if (dirs.includes('B')) car.brakeT = T.BRAKE_LAMPS;
    const nr = car.row + dr, nl = car.lane + dl;
    if (!Game.inBounds(nr, nl)) {
      const free = dirs.filter(d => Game.inBounds(car.row + D[d][0], car.lane + D[d][1]));
      if (dirs.length > 1 && free.length === 1) { await Game.step(car, free); return; }   // скользим вдоль стены
      await Game.wiggle(car); return;
    }
    const other = Game.carAt(nr, nl);
    if (other) { await Game.collide(car, other); return; }
    car.row = nr; car.lane = nl;
    if (car.isPlayer) Game.state.playerRow = nr;
    const anims = [car.isPlayer ? Game.relayout(T.MOVE) : Game.moveTo(car, T.MOVE)];
    for (const d of dirs) if (d === 'L' || d === 'R') anims.push(Game.lean(car, d));
    if (car.isPlayer && dirs.includes('F')) { Fx.fovBoost = CONFIG.FX.DASH_FOV; anims.push(Game.lunge(car, A.LUNGE.FORWARD)); }
    if (car.isPlayer && dirs.includes('B')) anims.push(Game.lunge(car, A.LUNGE.BACK));
    await Promise.all(anims);
  },

  // Противоположные направления (рывок и тормоз, влево и вправо): машина остаётся на месте и дёргается
  // в обе стороны. Если там стоит противник, она с ним сталкивается, если стена, упирается.
  async jerk(car, d1, d2) {
    for (const d of [d1, d2]) {
      if (!car.alive) break;
      const [dr, dl] = Game.DIRS[d], nr = car.row + dr, nl = car.lane + dl;
      if (!Game.inBounds(nr, nl)) { await Game.wiggle(car); continue; }
      const other = Game.carAt(nr, nl);
      if (other) await Game.collide(car, other); else await Game.twitch(car, d);
    }
  },

  // Набор команд одного хода игрока (одна или две одновременно): направления складываются в вектор
  // (F+R диагональ вперёд-вправо и так далее), противоположные дёргаются на месте, H лечит параллельно.
  // V здесь не бывает: её обрабатывает play (раскрытие намерений).
  async doCommands(car, cmds) {
    const dirs = cmds.filter(c => 'FBLR'.includes(c)), jobs = [];
    if (cmds.includes('H')) jobs.push(Game.heal(car));
    if (dirs.length === 1) jobs.push(Game.step(car, dirs));
    else if (dirs.length === 2) {
      const opposite = CONFIG.MATCH3.OPPOSITE[dirs[0]] === dirs[1];
      jobs.push(opposite ? Game.jerk(car, dirs[0], dirs[1]) : Game.step(car, dirs));
    }
    await Promise.all(jobs);
  },

  // a таранит b: сближение, удар (искры, тряска, вспышка, урон), отскок, возможные вылеты
  async collide(a, b) {
    const T = CONFIG.TIMING, R = CONFIG.ANIM.RAM, FX = CONFIG.FX;
    const dx = Game.cellX(b.lane) - Game.cellX(a.lane), dz = Game.cellZ(b.row) - Game.cellZ(a.row);
    await Tween.run(T.RAM_APPROACH, k => { a.dx = dx * R.APPROACH * k; a.dz = dz * R.APPROACH * k; }, k => k * k);

    Fx.burst(new THREE.Vector3(Game.cellX(a.lane) + dx * R.HIT_AT, FX.HIT_HEIGHT, Game.cellZ(a.row) + dz * R.HIT_AT), FX.BURST_RAM);
    Fx.shake = FX.SHAKE_RAM;
    a.hazardT = b.hazardT = T.HAZARD_RAM;                         // аварийка у обоих
    a.hp -= CONFIG.RULES.RAM_DAMAGE_SELF; b.hp -= CONFIG.RULES.RAM_DAMAGE_TARGET;
    Markers.drawHp(a); Markers.drawHp(b);
    Hud.updateHp();                                               // полоса HP игрока в разделителе обновляется сразу
    for (const m of [a.bodyMat, b.bodyMat]) { m.emissive.setHex(0xffffff); m.emissiveIntensity = R.FLASH_INTENSITY; }
    Tween.run(T.RAM_FLASH, (k, raw) => { if (raw >= 1) for (const m of [a.bodyMat, b.bodyMat]) m.emissiveIntensity = 0; }, Util.linear);

    await Tween.run(T.RAM_RECOIL, k => {
      const r = 1 - k, s = Math.sin(k * Math.PI);
      a.dx = dx * R.APPROACH * r; a.dz = dz * R.APPROACH * r;
      b.dx = dx * R.RECOIL * s; b.dz = dz * R.RECOIL * s;
      b.body.rotation.z = Math.sin(k * Math.PI * 2) * R.WOBBLE * (1 - k);
    });

    Game.state.log = `${a.isPlayer ? 'You ram' : 'A rival rams'} ${b.isPlayer ? 'you' : 'a rival'}!`;
    for (const c of [b, a]) if (c.hp <= 0 && c.alive) await Game.knockout(c);
  },

  // Машина с нулевым HP "улетает" с трассы
  async knockout(car) {
    const K = CONFIG.ANIM.KNOCKOUT, FX = CONFIG.FX;
    car.alive = false; car.intent.visible = false; car.hazardT = CONFIG.TIMING.HAZARD_KNOCKOUT;
    const side = car.lane === 0 ? -1 : car.lane === CONFIG.TRACK.LANES - 1 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const x0 = car.holder.position.x, z0 = car.holder.position.z;
    Fx.burst(new THREE.Vector3(x0, 1, z0), FX.BURST_KNOCKOUT); Fx.shake = FX.SHAKE_KNOCKOUT;
    Game.state.log = car.isPlayer ? 'You are out!' : 'A rival flew off the track!';
    await Tween.run(CONFIG.TIMING.KNOCKOUT, k => {
      car.holder.position.set(x0 + side * K.SIDE * k, K.LIFT + K.HEIGHT * Math.sin(k * Math.PI) * (1 - k * K.HEIGHT_DECAY), z0 + K.FORWARD * k * k);
      car.body.rotation.set(k * K.SPIN_X * side, Math.PI / 2 + k * K.SPIN_Y, k * K.SPIN_Z);
    }, Util.linear);
    car.holder.visible = false;
  },

  // Противник ушёл в отрыв (поражение 'escape'): разгоняется и пропадает вдали. Аура горит до конца.
  async escape(car) {
    car.alive = false; car.escaped = true; car.intent.visible = false; car.hpUi.sprite.visible = false;
    Game.state.log = 'A rival broke away!';
    const z0 = car.holder.position.z;
    await Tween.run(CONFIG.TIMING.ESCAPE, k => { car.holder.position.z = z0 - CONFIG.ANIM.ESCAPE.DIST * k; }, Util.easeIn);
    car.holder.visible = false;
  },

  // Ход противников: сначала все свободные перемещения одновременно, затем тараны по очереди.
  // Своих противник не таранит: если в клетке плана оказался другой противник, он стоит на месте.
  // Таранить может только совсем случайный план (car.wild, ручка сложности AI.RANDOM_CHANCE).
  async enemiesTurn() {
    const T = CONFIG.TIMING, S = Game.state;
    const anims = [], rams = [];
    S.reveal = false;                       // намерения показываются до хода врагов, на следующий их ход надо открывать заново
    for (const c of S.cars) {
      if (c.isPlayer || !c.alive) continue;
      c.intent.visible = false;
      if (c.plan === 'S') continue;
      if (c.plan === 'B') c.brakeT = T.BRAKE_LAMPS;
      const [dr, dl] = Game.DIRS[c.plan], nr = c.row + dr, nl = c.lane + dl;
      if (!Game.inBounds(nr, nl)) { anims.push(Game.wiggle(c)); continue; }
      if (Game.carAt(nr, nl)) { rams.push(c); continue; }
      c.row = nr; c.lane = nl;
      anims.push(Game.moveTo(c, T.MOVE));
      if (c.plan === 'L' || c.plan === 'R') anims.push(Game.lean(c, c.plan));
    }
    await Promise.all(anims);
    for (const c of rams) {
      if (!c.alive) continue;
      const [dr, dl] = Game.DIRS[c.plan], other = Game.carAt(c.row + dr, c.lane + dl);
      if (other && !other.isPlayer && !c.wild) continue;                 // свой: ждёт
      if (other) await Game.collide(c, other);
      else { c.row += dr; c.lane += dl; await Game.moveTo(c, T.MOVE); }   // цель успела уехать
    }
    S.turn++;
    Game.planEnemies();
  },

  // ---- команды ----
  // Выполняет очередь ходов игрока: каждый это полный ход (машина игрока, затем все противники).
  // После каждого хода проверяется конец партии.
  async drain() {
    const S = Game.state;
    if (S.busy) return;                       // уже идёт: он сам заберёт новые ходы из очереди
    S.busy = true;
    try {
      while (Game.queue.length && !S.over) {
        const { steps, reveal } = Game.queue.shift();
        S.log = '';
        for (const [i, cmds] of steps.entries()) {               // шаги хода игрока по очереди (повтор команды)
          if (!Game.player().alive) break;
          if (i) await Tween.wait(CONFIG.TIMING.CHAIN_STEP);
          await Game.doCommands(Game.player(), cmds);
        }
        await Tween.wait(CONFIG.TIMING.AFTER_PLAYER_MOVE);
        await Game.enemiesTurn();
        if (reveal) { S.reveal = true; Game.showIntents(); }          // V вместе с ходом: открыть планы врагов на следующий ход
        const over = S.started && Game.outcome();                       // вышли в меню: итог не считается
        if (over) Game.end(over);
      }
    } catch (e) {
      S.log = 'Error: ' + e.message; console.error(e);
    }
    S.busy = false;
    Hud.refresh();
  },

  // Итог полного хода: 'crash', 'escape', 'win' или null (партия идёт). Поражение важнее победы.
  outcome() {
    const R = CONFIG.RULES, foes = Game.foes();
    if (!Game.player().alive) return 'crash';
    if (foes.some(c => Game.ahead(c) > R.LOSE_LEAD)) return 'escape';
    if (foes.every(c => -Game.ahead(c) >= R.WIN_BEHIND)) return 'win';
    return null;
  },

  // Конец партии: ходы больше не принимаются, поле закрыто, итог записан в лучшие результаты (results.js)
  // и показан экран итога (начать заново: X). Ушедший в отрыв противник разгоняется и пропадает вдали.
  end(reason) {
    const S = Game.state, p = Game.player(), turns = S.turn - 1;
    if (reason === 'escape') for (const c of Game.foes()) if (Game.ahead(c) > CONFIG.RULES.LOSE_LEAD) Game.escape(c);
    S.over = reason; S.reveal = false;
    Game.queue.length = 0;
    Game.showIntents();
    const place = Results.record(S.level, reason === 'win', turns, Math.max(0, p.hp), p.maxHp);
    Hud.showOver(reason, { turns, place, level: S.level });
  },

  // Занята ли игра (идёт ход, есть команды в очереди, партия окончена или не начата). Пока занята, поле match-3 закрыто.
  isBusy: () => Game.state.busy || Game.queue.length > 0 || !!Game.state.over || !Game.state.started,

  // Ход игрока из одной или двух команд, срабатывающих одновременно (их даёт поле match-3, см. board.js).
  // L R F B S H тратят ход. V показать намерения врагов: одна, она бесплатна и открывает планы сразу;
  // вместе с ходом она открывает планы врагов на СЛЕДУЮЩИЙ ход, когда ход уже сделан. Повтор команды
  // срабатывает ещё раз следующим шагом того же хода: фиолетовый (F V) с красным (F) это два рывка подряд,
  // а враги ходят один раз.
  play(cmds) {
    const p = Game.player();
    if (!p || !p.alive || Game.state.over || !Game.state.started) return;
    const reveal = cmds.includes('V'), left = cmds.filter(c => c !== 'V'), steps = [];
    while (left.length) {                                  // каждый шаг это набор разных команд, повторы уходят в следующий
      const step = [...new Set(left)];
      for (const c of step) left.splice(left.indexOf(c), 1);
      steps.push(step);
    }
    if (!steps.length) { Game.state.reveal = true; Game.showIntents(); Hud.refresh(); return; }
    if (Game.queue.length >= CONFIG.RULES.COMMAND_QUEUE) return;
    Game.queue.push({ steps, reveal });
    Game.drain();
  },

  // Одна команда (клавиатура для отладки и консоль): L R F B S H V, X начать заново. На титульном экране не работают.
  act(a) {
    if (!Game.state.started) return;
    if (a === 'X') { Game.reset(); Board.reset(); return; }
    Game.play([a]);
  },

  // ---- покадровое ----
  update(dt, t) {
    for (const c of Game.state.cars) {
      Cars.update(c, dt, t, Game.state.busy);
      if (c.aura) Markers.updateAura(c, t, Game.atLimit(c) || !!c.escaped);
    }
  },

  // боковое положение игрока для камеры
  targetX() {
    const p = Game.player();
    return p && p.alive ? p.holder.position.x : 0;
  },
};
