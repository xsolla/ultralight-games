// ============================================================================
// game.js — правила и ход игры. Здесь живёт состояние партии (машины, ряды, ход) и вся логика:
// расстановка, планы врагов, перемещения, столкновения, выбывание, очередность ходов.
//
// Игра пошаговая и дискретная: у каждой машины есть ряд и полоса, анимации (через Tween) лишь
// показывают результат. Игровая логика не знает про изгиб дороги: она двигает car.holder в
// логических координатах сетки, а cars.js накладывает изгиб при отрисовке.
//
// Команды игрока (L влево, R вправо, F рывок вперёд, B торможение назад, S пропуск, V показать намерения)
// приходят из поля match-3 (board.js) и с клавиатуры (input.js, для отладки). Цифры (HP, урон, тайминги,
// шансы) в CONFIG.
// ============================================================================

const Game = {
  state: { playerRow: 0, cars: [], turn: 1, busy: false, reveal: false, log: '' },
  queue: [],            // команды игрока, ждущие своей очереди (одно схлопывание может дать несколько)

  // ---- сетка ----
  DIRS: { L: [0, -1], R: [0, 1], F: [1, 0], B: [-1, 0] },     // [изменение ряда, изменение полосы]
  cellX: lane => (lane - (CONFIG.TRACK.LANES - 1) / 2) * CONFIG.TRACK.LANE_W,
  cellZ: row => -(row - Game.state.playerRow) * CONFIG.TRACK.CELL_L,   // игрок всегда на z = 0, мир едет относительно него
  carAt: (row, lane) => Game.state.cars.find(c => c.alive && c.row === row && c.lane === lane),
  player: () => Game.state.cars[0],
  inBounds: (row, lane) => lane >= 0 && lane < CONFIG.TRACK.LANES && row >= 0 && row < CONFIG.TRACK.ROWS,

  // ---- старт ----
  spawnCar(type, color, row, lane, isPlayer) {
    const hp = isPlayer ? CONFIG.PLAYER.HP : CONFIG.ENEMIES.HP;
    const m = Cars.make(type, color);
    const car = { ...m, type, row, lane, isPlayer, hp, maxHp: hp, alive: true, phase: Math.random() * 7, plan: 'S', dx: 0, dz: 0, brakeT: 0, hazardT: 0 };
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
    S.cars.length = 0; S.playerRow = P.START_ROW; S.turn = 1; S.log = ''; S.reveal = false;
    Game.queue.length = 0;

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

  // ---- планы врагов ----
  planEnemies() {
    // билетики по весам: {S:2, L:1} -> ['S','S','L']
    const pool = Object.entries(CONFIG.ENEMIES.PLAN_WEIGHTS).flatMap(([d, w]) => Array(w).fill(d));
    for (const c of Game.state.cars) {
      if (c.isPlayer || !c.alive) continue;
      let d = pool[Math.random() * pool.length | 0];
      if (d !== 'S') {                                   // в стену не ходим
        const [dr, dl] = Game.DIRS[d];
        if (!Game.inBounds(c.row + dr, c.lane + dl)) d = 'S';
      }
      c.plan = d;
      Markers.setIntent(c, d);
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
  async doMove(car, dir) {
    if (dir === 'S') return;
    const T = CONFIG.TIMING, A = CONFIG.ANIM;
    if (dir === 'B') car.brakeT = T.BRAKE_LAMPS;
    const [dr, dl] = Game.DIRS[dir];
    const nr = car.row + dr, nl = car.lane + dl;
    if (!Game.inBounds(nr, nl)) { await Game.wiggle(car); return; }
    const other = Game.carAt(nr, nl);
    if (other) { await Game.collide(car, other); return; }
    car.row = nr; car.lane = nl;
    if (car.isPlayer) Game.state.playerRow = nr;
    const anims = [car.isPlayer ? Game.relayout(T.MOVE) : Game.moveTo(car, T.MOVE)];
    if (dir === 'L' || dir === 'R') anims.push(Game.lean(car, dir));
    if (car.isPlayer && dir === 'F') { Fx.fovBoost = CONFIG.FX.DASH_FOV; anims.push(Game.lunge(car, A.LUNGE.FORWARD)); }
    if (car.isPlayer && dir === 'B') anims.push(Game.lunge(car, A.LUNGE.BACK));
    await Promise.all(anims);
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

    Game.state.log = `${a.isPlayer ? 'Вы' : 'Противник'} таранит ${b.isPlayer ? 'вас' : 'противника'}!`;
    for (const c of [b, a]) if (c.hp <= 0 && c.alive) await Game.knockout(c);
  },

  // Машина с нулевым HP "улетает" с трассы
  async knockout(car) {
    const K = CONFIG.ANIM.KNOCKOUT, FX = CONFIG.FX;
    car.alive = false; car.intent.visible = false; car.hazardT = CONFIG.TIMING.HAZARD_KNOCKOUT;
    const side = car.lane === 0 ? -1 : car.lane === CONFIG.TRACK.LANES - 1 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const x0 = car.holder.position.x, z0 = car.holder.position.z;
    Fx.burst(new THREE.Vector3(x0, 1, z0), FX.BURST_KNOCKOUT); Fx.shake = FX.SHAKE_KNOCKOUT;
    Game.state.log = car.isPlayer ? 'Вы выбыли!' : 'Противник вылетел с трассы!';
    await Tween.run(CONFIG.TIMING.KNOCKOUT, k => {
      car.holder.position.set(x0 + side * K.SIDE * k, K.LIFT + K.HEIGHT * Math.sin(k * Math.PI) * (1 - k * K.HEIGHT_DECAY), z0 + K.FORWARD * k * k);
      car.body.rotation.set(k * K.SPIN_X * side, Math.PI / 2 + k * K.SPIN_Y, k * K.SPIN_Z);
    }, Util.linear);
    car.holder.visible = false;
  },

  // Ход противников: сначала все свободные перемещения одновременно, затем тараны по очереди
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
      if (other) await Game.collide(c, other);
      else { c.row += dr; c.lane += dl; await Game.moveTo(c, T.MOVE); }   // цель успела уехать
    }
    S.turn++;
    Game.planEnemies();
  },

  // ---- команды ----
  // Выполняет очередь команд игрока: каждая это полный ход (машина игрока, затем все противники)
  async drain() {
    const S = Game.state;
    if (S.busy) return;                       // уже идёт: он сам заберёт новые команды из очереди
    S.busy = true;
    try {
      while (Game.queue.length && Game.player().alive) {
        const dir = Game.queue.shift();
        S.log = '';
        await Game.doMove(Game.player(), dir);
        await Tween.wait(CONFIG.TIMING.AFTER_PLAYER_MOVE);
        await Game.enemiesTurn();
      }
    } catch (e) {
      S.log = 'Ошибка: ' + e.message; console.error(e);
    }
    if (!Game.player().alive) Game.queue.length = 0;
    S.busy = false;
    Hud.refresh();
  },

  // Занята ли игра ходом (идёт ход или есть команды в очереди). Пока занята, поле match-3 закрыто.
  isBusy: () => Game.state.busy || Game.queue.length > 0,

  // Единая точка входа команд: L R F B S это ходы, V показать намерения врагов (бесплатно, до их хода),
  // X начать заново. Команды дают кружки match-3 (board.js) и клавиши для отладки.
  act(a) {
    if (a === 'X') { Game.reset(); Board.reset(); return; }
    if (a === 'V') { Game.state.reveal = true; Game.showIntents(); Hud.refresh(); return; }
    const p = Game.player();
    if (!p || !p.alive || Game.queue.length >= CONFIG.RULES.COMMAND_QUEUE) return;
    Game.queue.push(a);
    Game.drain();
  },

  // ---- покадровое ----
  update(dt, t) {
    for (const c of Game.state.cars) Cars.update(c, dt, t, Game.state.busy);
  },

  // боковое положение игрока для камеры
  targetX() {
    const p = Game.player();
    return p && p.alive ? p.holder.position.x : 0;
  },
};
