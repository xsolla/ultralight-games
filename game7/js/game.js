// ============================================================================
// game.js — the single Game object: run state, screens, input, canvas sizing,
// and the main loop. Owns mutable state and every transition and nothing else:
// flight lives in ships.js and healer.js, the rules in shipyard.js and
// spawner.js, drawing in render.js, buildui.js and menu.js.
// ============================================================================

// ---- Tunable ---------------------------------------------------------------
const DT_CLAMP_MS = 100;   // a backgrounded tab must not teleport the fleet
const SHIP_PICK_R = 24;    // px: a tap this close to a ship selects it (CLAUDE.md §8)

// Screen shake is for the planet only (CLAUDE.md §5): with dozens of ships
// trading fire, shaking on every ship hit would never stop. Peak displacement in
// logical px.
const SHAKE_HIT_MS    = 260;
const SHAKE_HIT_MAG   = 4;
const SHAKE_DEATH_MS  = 1400;
const SHAKE_DEATH_MAG = 9;
// How long the planet burns before the game-over card comes up — comfortably
// longer than the burst sweep in explodePlanet(), so the card never cuts it off.
const DEATH_MS = 3000;

const Game = {
  // 'menu' | 'playing' | 'records'. As in game6, the game-over card IS the
  // records card opened from a run: one card reports the run and shows the table.
  screen: 'menu',
  recordsFrom: 'menu',  // 'menu' | 'gameover' — backdrop, heading and buttons
  canvas: null,
  ctx: null,
  lastTime: 0,
  time: 0,              // ms accumulator, drives animation phase

  // ---- Run state ----
  money: 0,
  planetHp: PLANET.HP,
  kills: 0,
  ships: [],            // the fleet, medics included
  enemies: [],          // armed and unarmed alike; a chain's later links wait inside, inactive
  meteors: [],
  bullets: [],          // the fleet's shots
  // Incoming fire, on its own array: every consumer wants exactly one of the two.
  enemyBullets: [],
  explosions: [],       // bursts, purely decorative
  floaters: [],         // "+$3" pop-ups where kills paid out
  yard: { queue: [], ms: 0 },
  waves: { wave: 0, phase: 'break', ms: 0, spawnMs: 0, plan: [], next: 0 },
  // Planet shake. `shakeTotalMs` is kept so the decay is a fraction of THIS
  // shake's own length.
  shakeMs: 0,
  shakeTotalMs: 0,
  shakeMag: 0,
  // The planet has fallen and is burning; the card comes up after DEATH_MS.
  dying: false,
  dyingMs: 0,
  // The run's result, frozen the instant it ended. `newRank` is the row it took
  // in the table, or -1.
  runOver: false,
  finalWave: 0,
  newRank: -1,

  // ---- UI state ----
  // What the build popup has selected. Kept across orders AND runs, so repeating
  // a build is two taps (§7.2). `tab` is a hull index, or MEDIC_TAB.
  sel: { tab: 0, gun: 0, level: 1 },
  popup: false,
  popupMs: 0,           // time since the popup opened, for its fade-in
  menu: null,           // { shipId, ax, ay } while a ship's behaviour menu is open
  soundState: 'on',     // 'on' | 'musicoff' | 'off'; see SOUND_CYCLE
  // The control under the pointer, as '<layer>:<id>' ('hud:sound', 'pop:gun2',
  // 'beh:balanced', 'menu:start', 'rec:retry'), 'build', 'ship', or null. One
  // field for every layer: a pointer can only be over one thing, and the hit
  // order that decides which is the same one the press uses.
  hover: null,
  // The id the hover sound has already been played for — an EDGE, so a cursor
  // resting on a button does not retrigger it on every pointermove.
  hoverSfx: null,
  lastInputKind: 'mouse',

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    Stars.init();
    Planet.init();
    Scores.init();
    // Before any screen can be pressed: the click has to be buffered by then.
    Sound.initSfx();
    SpriteKit.load();

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => this.resizeCanvas());
    // The event can fire before layout has settled on the new box, so re-measure
    // next frame too (branding.md §4).
    const onFullscreenChange = () => {
      this.resizeCanvas();
      requestAnimationFrame(() => this.resizeCanvas());
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    this.bindInput();
    this.resetRun();
    // Usually refused until the first gesture; Sound.resume() finishes it.
    Sound.startTitle();

    requestAnimationFrame((t) => this.loop(t));
  },

  // Everything that carries run state is cleared here, so there is exactly one
  // place to extend when combat adds its own.
  resetRun() {
    this.money = ECONOMY.START_MONEY;
    this.planetHp = PLANET.HP;
    this.kills = 0;
    for (const list of [this.ships, this.enemies, this.meteors, this.bullets,
                        this.enemyBullets, this.explosions, this.floaters]) list.length = 0;
    resetShipyard(this.yard);
    resetWaves(this.waves);
    Planet.clearDamage();
    this.shakeMs = 0;
    this.dying = false;
    this.dyingMs = 0;
    this.runOver = false;
    this.finalWave = 0;
    this.newRank = -1;
    this.popup = false;
    this.menu = null;
  },

  // ---- Screens ------------------------------------------------------------
  startRun() {
    this.resetRun();
    this.screen = 'playing';
    this.hover = null;
    // Started from a press, never from init(), so the autoplay gate is open.
    Sound.startMusic();
  },

  toMenu() {
    this.screen = 'menu';
    this.hover = null;
    Sound.startTitle();
  },

  openRecords(from) {
    this.screen = 'records';
    this.recordsFrom = from;
    this.hover = null;
    this.popup = false;
    this.menu = null;
  },

  // Freeze the run's result and enter it in the table, once per run.
  fixResult() {
    if (this.runOver) return;
    this.runOver = true;
    this.finalWave = this.waves.wave;
    this.newRank = Scores.submit({ wave: this.finalWave, kills: this.kills });
  },

  // branding.md §2: exit returns to the title, through the records card. The
  // run still counts: leaving is a decision about the run, not a way of not
  // having played it.
  endRun() {
    this.fixResult();
    this.openRecords('gameover');
  },

  // ---- Canvas -------------------------------------------------------------
  // The element is CSS-sized by styles.css; the backing store is sized to the
  // real device pixels it covers so HUD text and vector art stay crisp.
  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const rect = this.canvas.getBoundingClientRect();
    const bw = Math.max(1, Math.round((rect.width || CANVAS_W) * dpr));
    const bh = Math.max(1, Math.round((rect.height || CANVAS_H) * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    // Setting width/height resets the context, so (re)apply the logical scale
    // and the smoothing mode every time.
    this.ctx.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    // The planet's layers are built per backing scale; it rebuilds in the
    // background and keeps drawing the old ones until the new ones are lit.
    Planet.resize(bw / CANVAS_W);
  },

  // ---- Input --------------------------------------------------------------
  bindInput() {
    this.canvas.addEventListener('pointermove', (e) => {
      const p = this.toLogical(e);
      this.noteInputKind(e);
      this.hover = this.hoverAt(p.x, p.y);
      this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
      this.noteHover(this.hover === 'ship' ? null : this.hover);
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.hoverSfx = null;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toLogical(e);
      this.noteInputKind(e);
      this.press(p.x, p.y);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (this.screen === 'records') {
        if (k === 'enter' || k === ' ') {
          this.pressRecordsButton(this.recordsFrom === 'menu' ? 'ok' : 'retry');
          e.preventDefault();
        } else if (k === 'escape') {
          this.pressRecordsButton(this.recordsFrom === 'menu' ? 'ok' : 'title');
        }
        return;
      }
      if (this.screen === 'menu') {
        if (k === 'enter' || k === ' ') { this.pressMenuButton('start'); e.preventDefault(); }
        return;
      }
      // In a run, Escape backs out of whatever is open, innermost first.
      if (k === 'escape') {
        if (this.popup) this.popup = false;
        else this.menu = null;
      }
    });
    window.addEventListener('blur', () => {
      this.hover = null;
      this.hoverSfx = null;
    });

    // The browser will not play audio until the user has touched the page, so
    // the title music asked for in init() is usually refused; this finishes it.
    // LAST on purpose: a first gesture that is START has already begun the
    // run's music by the time this runs, and it finds nothing left to do.
    const firstGesture = () => Sound.resume();
    window.addEventListener('pointerdown', firstGesture, { once: true });
    window.addEventListener('keydown', firstGesture, { once: true });
  },

  // What a pointer at (x, y) is over, in the same precedence press() uses —
  // shared buttons, then whatever is open, then the build button, then ships.
  hoverAt(x, y) {
    const hud = hudButtonAt(x, y, this.screen);
    if (hud) return 'hud:' + hud;
    if (this.screen === 'menu') {
      const b = menuButtonAt(x, y);
      if (b) return 'menu:' + b;
      const pt = planetButtonAt(x, y);
      return pt ? 'ptype:' + pt : null;
    }
    if (this.screen === 'records') {
      const b = recordsButtonAt(x, y, this.recordsFrom);
      return b ? 'rec:' + b : null;
    }
    if (this.popup) {
      const h = popupHit(x, y, this.sel, this.waves.phase, this.money);
      return h && h !== 'inside' && h.enabled ? 'pop:' + h.id : null;
    }
    if (this.menu) {
      const h = behaviourMenuHit(x, y, this.menu);
      if (h === 'inside') return null;
      if (h) return 'beh:' + h.key;
    }
    if (buildButtonAt(x, y)) return 'build';
    if (shipNear(this.ships, x, y, SHIP_PICK_R)) return 'ship';
    return null;
  },

  // One press. The shared HUD buttons come FIRST on every screen and return
  // early, so a tap on one never reaches anything beneath it.
  press(x, y) {
    const hud = hudButtonAt(x, y, this.screen);
    if (hud) { this.pressHudButton(hud); return; }
    if (this.screen === 'menu') {
      const b = menuButtonAt(x, y);
      if (b) { this.pressMenuButton(b); return; }
      const pt = planetButtonAt(x, y);
      if (pt) this.pressPlanetButton(pt);
      return;
    }
    if (this.screen === 'records') {
      const b = recordsButtonAt(x, y, this.recordsFrom);
      if (b) this.pressRecordsButton(b);
      return;
    }
    // A burning planet takes no more orders.
    if (this.dying) return;

    // The popup is modal: a press anywhere else does nothing.
    if (this.popup) {
      const h = popupHit(x, y, this.sel, this.waves.phase, this.money);
      if (h && h !== 'inside' && h.enabled) this.pressPopup(h);
      return;
    }
    if (this.menu) {
      const h = behaviourMenuHit(x, y, this.menu);
      if (h === 'inside') return;
      if (h) { this.setShipBehaviour(h.key); return; }
      // A tap outside closes the menu, and then counts as a fresh tap — so
      // tapping a second ship moves the menu to it in one go.
      this.menu = null;
    }
    if (buildButtonAt(x, y)) { this.openPopup(); return; }
    const s = shipNear(this.ships, x, y, SHIP_PICK_R);
    if (s) {
      this.menu = { shipId: s.id, ax: s.x, ay: s.y };
      Sound.play('uiClick');
    }
  },

  openPopup() {
    this.popup = true;
    this.popupMs = 0;
    this.menu = null;
    Sound.play('uiClick');
  },

  // Dispatched on the rect's kind and index, never by parsing its id.
  pressPopup(r) {
    const sel = this.sel;
    if (r.kind === 'build') { this.placeOrder(); return; }
    Sound.play('uiClick');
    if (r.kind === 'tab') {
      sel.tab = r.i;
      // A hull that cannot carry the selected gun falls back to the first one,
      // rather than leaving BUILD disabled for a reason off-screen.
      if (r.i !== MEDIC_TAB && !canMount(r.i, sel.gun)) sel.gun = 0;
    } else if (r.kind === 'gun') {
      sel.gun = r.i;
    } else if (r.kind === 'lvl') {
      sel.level = r.i;
    } else if (r.kind === 'close') {
      this.popup = false;
    }
  },

  // BUILD: pay, queue, close. orderBlocker is the same check the button's label
  // came from, so this can only refuse what the button already said it would.
  placeOrder() {
    const o = selectedOrder(this.sel);
    if (orderBlocker(o, this.waves.phase, this.money)) return;
    this.money -= orderPrice(o);
    this.yard.queue.push(o);
    Sound.play('orderPlaced');
    this.popup = false;
  },

  setShipBehaviour(key) {
    const s = this.ships.find((x) => x.id === this.menu.shipId);
    if (s && s.behaviour !== key) {
      setBehaviour(s, key);
      Sound.play('behaviourChanged');
    } else {
      Sound.play('uiClick');
    }
    this.menu = null;
  },

  // ---- HUD ----------------------------------------------------------------
  pressHudButton(id) {
    // FIRST, so a press that walks the sound button to 'off' still clicks on
    // the way out: the state it is heard under is the one pressed from.
    Sound.play('uiClick');
    if (id === 'sound') {
      this.soundState = SOUND_CYCLE[this.soundState];
      Sound.applyState(this.soundState);
    } else if (id === 'exit') {
      this.endRun();
    } else {
      this.toggleFullscreen();
    }
  },

  pressMenuButton(id) {
    Sound.play('uiClick');
    if (id === 'start') this.startRun();
    else if (id === 'records') this.openRecords('menu');
  },

  // The planet-type row: Planet is the same instance the run draws, so this
  // is the only place the choice needs to be applied.
  pressPlanetButton(key) {
    Sound.play('uiClick');
    Planet.setPalette(key);
  },

  // 'retry' starts another run; 'title' and 'ok' are the same destination
  // wearing the label its context calls for.
  pressRecordsButton(id) {
    Sound.play('uiClick');
    if (id === 'retry') this.startRun();
    else this.toMenu();
  },

  // Read live rather than tracked, so leaving by Esc or F11 keeps the glyph in
  // sync for free (branding.md §4).
  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  // Targets <html>, NOT the canvas: the UA stylesheet forces a fullscreen
  // element to 100% width and height, which would break the 9:16 CSS box.
  toggleFullscreen() {
    if (this.isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const r = exit.call(document); if (r && r.catch) r.catch(() => {}); }
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // Rejects when an embedding page withholds allow="fullscreen", so the
    // button is simply inert there rather than throwing.
    if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
  },

  // MOUSE ONLY. On touch there is no cursor to arrive anywhere, and the
  // pointermove a tap emits on its way to pointerdown would put this sound in
  // front of every click.
  noteHover(id) {
    if (id === this.hoverSfx) return;
    this.hoverSfx = id;
    if (id && this.lastInputKind === 'mouse') Sound.play('uiHover');
  },

  noteInputKind(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.lastInputKind = 'touch';
    else if (e.pointerType === 'mouse') this.lastInputKind = 'mouse';
  },

  toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  },

  // ---- Loop ---------------------------------------------------------------
  loop(timestamp) {
    const dt = this.lastTime ? Math.min(timestamp - this.lastTime, DT_CLAMP_MS) : 0;
    this.lastTime = timestamp;
    this.time += dt;
    this.update(dt);
    drawScene(this.ctx, this);
    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    // The sky and the planet live on every screen: the sun keeps orbiting over
    // the title and behind the records card alike.
    Stars.update(dt);
    Planet.update(dt);
    if (this.screen !== 'playing') return;

    if (this.popup) this.popupMs += dt;

    // Once the planet has fallen the clock and the shipyard stop; everything
    // already in the air plays out over the fire.
    if (!this.dying) {
      const w = updateWaves(this.waves, dt, this.enemies, this.meteors);
      if (w === 'waveStart') {
        Sound.play(this.waves.wave % WAVES.BIG_EVERY === 0 ? 'waveStartBig' : 'waveStart');
      } else if (w === 'waveClear') {
        Sound.play('waveCleared');
      }
      const done = updateShipyard(this.yard, dt);
      if (done) {
        this.ships.push(createShip(done));
        Sound.play(done.kind === 'healer' ? 'healerLaunched' : 'shipLaunched');
      }
    }

    // Movement first, then guns, so a volley leaves from where its hull ended up
    // this frame; then the bullets; then every hit test, against one agreed frame.
    updateEnemies(this.enemies, dt);
    updateMeteors(this.meteors, dt);
    const foes = this.enemies.concat(this.meteors);
    updateShooters(this.enemies, this.ships, dt, this.enemyBullets);
    updateShips(this.ships, dt, foes, this.bullets);
    updateHealers(this.ships, dt);
    updateBullets(this.bullets, dt);
    updateBullets(this.enemyBullets, dt);

    // Collision only reports; turning that into money, bursts, sound and shake
    // is this loop's job, which keeps collide.js free of all four.
    const ev = newCollisionEvents();
    resolveBulletHits(this.bullets, foes, ev);
    resolveEnemyBulletHits(this.enemyBullets, this.ships, ev);
    resolveRams(this.ships, foes, ev);
    resolvePlanetHits(foes, ev);
    this.applyCollisions(ev);

    // Out of hull is out of the fight. Medics are the exception: healer.js
    // fades them rather than blowing them up (§7.9).
    for (const s of this.ships) {
      if (s.kind === 'ship' && !s.dead && s.hp <= 0) {
        s.dead = true;
        explodeShip(this.explosions, s);
      }
    }
    for (const list of [this.ships, this.enemies, this.meteors]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    }
    // A menu for a ship that is gone closes with it (§11).
    if (this.menu && !this.ships.some((s) => s.id === this.menu.shipId)) this.menu = null;

    updateExplosions(this.explosions, dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].ms += dt;
      if (this.floaters[i].ms >= FLOAT_MS) this.floaters.splice(i, 1);
    }
    this.shakeMs = Math.max(0, this.shakeMs - dt);

    if (!this.dying && this.planetHp <= 0) this.losePlanet();
    if (this.dying) {
      this.dyingMs += dt;
      if (this.dyingMs >= DEATH_MS) this.openRecords('gameover');
    }
  },

  // The collision report, made into consequences.
  applyCollisions(ev) {
    for (const f of ev.kills) {
      const meteor = f.kind === 'meteor';
      const pay = (meteor ? METEOR_TYPES[f.t].reward : ENEMY_TYPES[f.t].reward) * BASE.KILL_REWARD;
      this.money += pay;
      this.kills++;
      this.floaters.push({ x: f.x, y: f.y - 8, text: '+$' + pay, color: COLORS.money, ms: 0 });
      if (meteor) explodeMeteor(this.explosions, f);
      else explodeEnemy(this.explosions, f);
    }
    // A mark on the hull in the colour of the particle that made it.
    for (const h of ev.shipHits) {
      const p = SpriteKit.PARTICLE_SPRITES[h.row];
      explodeImpact(this.explosions, h.x, h.y, p.color, p.spark);
      Sound.play('playerHit');
    }
    // Rams flash in the rammer's colours at the point of contact.
    for (const r of ev.rams) {
      const mx = (r.ship.x + r.foe.x) / 2, my = (r.ship.y + r.foe.y) / 2;
      if (r.foe.kind === 'meteor') {
        const a = SpriteKit.ASTEROID_SPRITES[METEOR_TYPES[r.foe.t].row];
        explodeImpact(this.explosions, mx, my, a.color, a.spark);
        Sound.play('collisionAsteroid');
      } else {
        const sp = SpriteKit.ENEMY_SPRITES[ENEMY_TYPES[r.foe.t].sprite];
        explodeImpact(this.explosions, mx, my, sp.color, sp.spark);
        Sound.play('collisionEnemy');
      }
    }
    // Bodies reaching the planet: it takes the damage, flashes, and the view
    // shakes. No reward — the kill credit is the fleet's, and this was a miss.
    for (const f of ev.planet) {
      const meteor = f.kind === 'meteor';
      if (!this.dying) {
        this.planetHp = Math.max(0, this.planetHp - (meteor ? METEOR_TYPES[f.t] : ENEMY_TYPES[f.t]).planetDmg);
      }
      Planet.hit(f.x, f.y);
      if (meteor) explodeMeteor(this.explosions, f);
      else explodeEnemy(this.explosions, f);
      this.shake(SHAKE_HIT_MS, SHAKE_HIT_MAG);
      Sound.play('planetHit');
    }
  },

  // The planet's HP ran out. The result is fixed HERE, on the frame it fell,
  // and only shown once the fire has had its moment.
  losePlanet() {
    this.dying = true;
    this.dyingMs = 0;
    this.popup = false;
    this.menu = null;
    this.fixResult();
    explodePlanet(this.explosions);
    this.shake(SHAKE_DEATH_MS, SHAKE_DEATH_MAG);
  },

  // Start a shake unless a bigger one is running. Bigger wins outright rather
  // than adding, so two hits in quick succession never stack into chaos.
  shake(ms, mag) {
    if (this.shakeMs > 0 && mag < this.shakeMag) return;
    this.shakeMs = ms;
    this.shakeTotalMs = ms;
    this.shakeMag = mag;
  },
};

Game.init();
