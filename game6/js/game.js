// ============================================================================
// game.js — the single Game object: state, input, canvas sizing, main loop.
// Owns mutable run state and screen transitions and nothing else; motion lives
// in player.js, drawing in render.js.
//
// Iteration 2 scope: starfield, one steerable ship, ship cycling, the turbo
// burst, and the five player weapons with the §7 armour counter driving their
// level. Enemies, collision, explosions and the five armed enemy types have
// since landed; pickups and scoring have not.
// ============================================================================

// ---- Tunable ---------------------------------------------------------------
const SCROLL_EASE = 6;      // 1/s — how fast the starfield ramps in/out of turbo
const DT_CLAMP_MS = 100;    // a backgrounded tab must not teleport the ship
// How long the wreck burns before the run starts over. Comfortably longer than
// the explosion chain in explosions.js, so the restart never cuts it off.
const RESPAWN_MS  = 2100;

// ---- Screen shake ----------------------------------------------------------
// Magnitudes are peak displacement in logical px on a 360x640 field, so 5 is
// about 1.4% of the width — enough to feel like a blow landing, small enough
// that the ship never leaves the finger that is steering it. Durations are
// short on purpose: a shake that outlasts the flash it accompanies stops being
// an impact and becomes a rumble.
const SHAKE_HIT_MS    = 260;
const SHAKE_HIT_MAG   = 5;
// Death gets roughly double both, because it is the one impact the player is
// not expected to keep playing through.
const SHAKE_DEATH_MS  = 620;
const SHAKE_DEATH_MAG = 10;

// ---- What a caught bonus does ----------------------------------------------
// One entry per BONUSES.kind. It lives here rather than in pickups.js because
// every one of these reaches into a different subsystem — the armour counter,
// the wing, the explosion list — and this file is the only one allowed to know
// about all of them. Same division as the collision resolvers: they report, the
// loop acts.
//
// `arg` is the index rolled when the bubble spawned, so the effect is exactly
// the one the player could see inside it. A new bonus is a row in BONUSES plus
// an entry here, never a branch in the update loop.
const BONUS_EFFECTS = {
  heal: (game) => healPlayer(game.player),

  // The trap. Routed through the ordinary damage path rather than by editing
  // `hits` directly, so it gets the same flash, the same shake and the same
  // grace period as being shot — and so it is ABSORBED during that grace, like
  // every other damage source. A trap that ignored invulnerability would punish
  // one mistake twice.
  harm: (game, arg, row) => {
    if (game.player.invulnMs > 0) return;
    damagePlayer(game.player);
    game.player.invulnMs = PLAYER_INVULN_MS;
    game.onPlayerHit(row.color, row.spark);
  },

  weapon: (game, arg) => setWeapon(game.player, arg),
  ship:   (game, arg) => setShip(game.player, arg),
  turbo:  (game) => startTurbo(game.player),
  wing:   (game) => spawnWingmen(game.wingmen, game.player),
};

const Game = {
  canvas: null,
  ctx: null,
  lastTime: 0,
  time: 0,              // ms accumulator, drives twinkle and animation phase
  player: null,
  scrollMult: 1,        // eased starfield speed multiplier
  bullets: [],          // live player projectiles
  // Incoming fire, on its own array. Two lists rather than one flagged list
  // because every consumer wants exactly one of them: player shots are tested
  // against enemies, enemy shots against the ship, and neither ever against the
  // other. Filtering one array per test would cost more than keeping two.
  enemyBullets: [],
  enemies: [],          // live enemies, armed and unarmed alike
  pickups: [],          // drifting bonus bubbles waiting to be caught
  wingmen: [],          // the escort, while a wing bonus is running
  explosions: [],       // live death bursts, purely decorative
  runMs: 0,             // elapsed run time — the difficulty ramp's only input
  deathMs: 0,           // time since the ship was wrecked; drives the restart
  // Screen shake. `shakeTotalMs` is kept alongside the countdown so the decay
  // curve is a fraction of THIS shake's own length rather than of a constant —
  // otherwise the long death shake and the short hit shake could not share one
  // easing function.
  shakeMs: 0,
  shakeTotalMs: 0,
  shakeMag: 0,
  diffIdx: 1,           // index into DIFFICULTIES; 'normal' until menu.js exists
  // Spawner timers — one per stream. It holds no state of its own.
  spawn: { trickleMs: 0, waveMs: 0, shooterMs: 0 },

  // ---- HUD ----
  soundState: 'on',     // 'on' | 'musicoff' | 'off'; see SOUND_CYCLE
  hudHover: null,       // id of the button under the pointer, or null
  // True from a pointerdown that landed on a button until it is released. While
  // it is set the ship does not follow the pointer at all, so dragging off a
  // button cannot fling the ship into the corner behind it.
  hudCapture: false,

  // Input state, read once per frame by updatePlayer().
  pointer: { x: CANVAS_W / 2, y: CANVAS_H / 2, active: false },
  keys: new Set(),
  pointerDown: false,
  // 'mouse' | 'touch' | 'key'. Touch players get no fire button, so the first
  // touch event permanently switches the gun to autofire (CLAUDE.md §8).
  lastInputKind: 'mouse',

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => this.resizeCanvas());
    // Entering/leaving fullscreen changes the viewport, so the 9:16 box changes
    // size and the backing store has to be rebuilt. The event can fire before
    // layout has settled on the new box, so re-measure next frame too.
    const onFullscreenChange = () => {
      this.resizeCanvas();
      requestAnimationFrame(() => this.resizeCanvas());
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    this.bindInput();

    Stars.init();
    this.resetRun(0);
    Atlas.load();

    requestAnimationFrame((t) => this.loop(t));
  },

  // Start a fresh run on `shipIdx`. Everything that carries run state is
  // cleared here, so there is exactly one place to extend when scoring and
  // pickups add their own.
  resetRun(shipIdx) {
    this.player = createPlayer(shipIdx);
    this.bullets.length = 0;
    this.enemyBullets.length = 0;
    this.enemies.length = 0;
    this.pickups.length = 0;
    this.wingmen.length = 0;
    this.explosions.length = 0;
    this.runMs = 0;
    this.deathMs = 0;
    this.shakeMs = 0;
    this.shakeTotalMs = 0;
    this.shakeMag = 0;
    this.scrollMult = 1;
    resetSpawner(this.spawn);
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
    // Sprites are downscaled by at most ~1.08x at the 3x cap, so a single
    // smoothed drawImage is enough — no mip chain needed.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  },

  // ---- Input --------------------------------------------------------------
  bindInput() {
    // One pointer path covers mouse and touch. On desktop the ship follows the
    // bare cursor with no button held, which keeps LMB free for the ship swap.
    this.canvas.addEventListener('pointermove', (e) => {
      const p = this.toLogical(e);
      this.noteInputKind(e);
      const over = hudButtonAt(p.x, p.y);
      this.hudHover = over;
      this.canvas.style.cursor = over ? 'pointer' : 'default';
      // The top corners belong to the HUD. A bare cursor resting on a button
      // must not drag the ship up there to meet it, and a drag that STARTED on
      // a button must not steer at all — both are the same rule, and both are
      // the §5 requirement that a button never swallows the ship's input read
      // from the other side.
      if (this.hudCapture || over) return;
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.active = false;
      this.pointerDown = false;
      this.hudHover = null;
      this.hudCapture = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toLogical(e);
      this.noteInputKind(e);

      // HUD FIRST, always (CLAUDE.md §5). The buttons sit over the playfield, so
      // a tap that hits one must not also steer or fire — hence the early
      // return rather than a flag checked later.
      const hit = hudButtonAt(p.x, p.y);
      if (hit) {
        this.hudCapture = true;
        this.hudHover = hit;
        this.pressHudButton(hit);
        return;
      }

      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
      // LMB is the trigger (§8). Holding it is all autofire is.
      if (e.button === 0) this.pointerDown = true;
    });
    const release = () => { this.pointerDown = false; this.hudCapture = false; };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

    // Nothing is bound to RMB, but a browser menu dropped over the playfield
    // mid-run would still eat the gesture that follows it.
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      // Scaffolding until pickups exist: these effects are all meant to arrive
      // from caught bonuses. Delete with drawControlHints().
      if (k === 'z') cycleShip(this.player);
      if (k === 'x') startTurbo(this.player);
      if (k === 'q') cycleWeapon(this.player);
      if (k === '[') this.debugDamage();
      if (k === ']') healPlayer(this.player);
      // Difficulty belongs on the title screen; 1/2/3 stand in until menu.js.
      if (k >= '1' && k <= '3') this.diffIdx = +k - 1;
      if (k === ' ') {
        this.keys.add(' ');
        e.preventDefault();   // Space scrolls the page otherwise.
      }
      if (MOVE_KEYS.has(k)) {
        // Keys take over from the pointer until the pointer moves again.
        this.pointer.active = false;
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    // Anything held while the window loses focus would otherwise stick down.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointerDown = false;
      this.hudCapture = false;
      this.hudHover = null;
    });
  },

  // ---- Bonuses ------------------------------------------------------------
  applyBonus(b) {
    const row = BONUSES[b.t];
    BONUS_EFFECTS[row.kind](this, b.arg, row);
  },

  // ---- Feedback -----------------------------------------------------------
  // Every way the player can be hurt funnels through here, so the flash and the
  // shake can never drift apart or be forgotten by a new damage source. Colours
  // are the SOURCE's; pass null when the source has none and explodeImpact
  // picks one (CLAUDE.md §7).
  //
  // Deliberately NOT inside damagePlayer: that is a pure function over the
  // counter in player.js, and spawning effects from it would put presentation
  // inside the armour model.
  onPlayerHit(color, spark) {
    explodeImpact(this.explosions, this.player.x, this.player.y, color, spark);
    this.shake(SHAKE_HIT_MS, SHAKE_HIT_MAG);
  },

  // Start a shake, unless a bigger one is already running. Bigger WINS OUTRIGHT
  // rather than adding: two hits in quick succession must not stack into
  // something that throws the playfield around, but a death landing on top of a
  // graze must not be damped down to the graze either.
  shake(ms, mag) {
    if (this.shakeMs > 0 && mag < this.shakeMag) return;
    this.shakeMs = ms;
    this.shakeTotalMs = ms;
    this.shakeMag = mag;
  },

  // ---- HUD ----------------------------------------------------------------
  // One press. Kept here rather than in render.js because every one of these is
  // a state transition, and render.js does not mutate state.
  pressHudButton(id) {
    if (id === 'sound') this.soundState = SOUND_CYCLE[this.soundState];
    else if (id === 'exit') this.endRun();
    else this.toggleFullscreen();
  },

  // branding.md §2 says exit returns to the title screen. There is no title
  // screen yet (CLAUDE.md §10), so this ends the run instead — the way game1's
  // exit does, and through the wreck rather than around it, so the button
  // produces feedback the player has already been taught to read. Rewire it to
  // the title when menu.js lands; nothing else here has to change.
  endRun() {
    if (this.player.dead || this.player.hits <= 0) return;
    this.player.hits = 0;
  },

  // Read live rather than tracked, so leaving by Esc or F11 keeps the glyph in
  // sync for free (branding.md §4).
  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  // Targets <html>, NOT the canvas: the UA stylesheet forces a fullscreen
  // element to 100% width and height, which would break the 9:16 CSS box in
  // styles.css that does all of this game's fitting. Fullscreening the root
  // makes the VIEWPORT the screen instead and leaves that box untouched.
  toggleFullscreen() {
    if (this.isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const r = exit.call(document); if (r && r.catch) r.catch(() => {}); }
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // Rejects when an embedding page withholds allow="fullscreen" (§5), so the
    // button is simply inert there rather than throwing.
    if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
  },

  // Scaffolding, and the one damage source in the game with no colour of its
  // own — which makes it the thing that exercises explodeImpact's random pick.
  // Goes with the rest of the debug keys.
  debugDamage() {
    if (this.player.dead) return;
    const before = this.player.hits;
    damagePlayer(this.player);
    if (this.player.hits < before) this.onPlayerHit(null, null);
  },

  // A pointer event's type decides whether the player needs a fire button.
  noteInputKind(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.lastInputKind = 'touch';
    else if (e.pointerType === 'mouse') this.lastInputKind = 'mouse';
  },

  // Whether the gun is firing this frame.
  isFiring() {
    // On touch there is no button to hold, so the gun simply always runs.
    if (this.lastInputKind === 'touch') return true;
    return this.pointerDown || this.keys.has(' ');
  },

  toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  },

  readInput() {
    const k = this.keys;
    let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    // Normalise diagonals so they aren't 1.41x faster than the cardinals.
    if (dx && dy) { const n = Math.SQRT1_2; dx *= n; dy *= n; }
    return { px: this.pointer.x, py: this.pointer.y, pointer: this.pointer.active, dx, dy };
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
    this.runMs += dt;
    const diff = DIFFICULTIES[this.diffIdx];

    // A wrecked ship neither flies nor fires, but the run carries on beneath
    // it: enemies keep coming and the stars keep scrolling while it burns.
    if (!this.player.dead) {
      // Move the ship before firing, so a volley leaves from where the hull
      // ended up this frame rather than trailing a frame behind it.
      updatePlayer(this.player, dt, this.readInput());
      updateWeapon(this.player, dt, this.isFiring(), this.bullets);
    }
    // The wing flies formation on wherever the ship just went, and shoots on the
    // player's own trigger — so it follows the same move-then-fire ordering.
    updateWingmen(this.wingmen, dt, this.player, this.isFiring(), this.bullets);

    updateSpawner(this.spawn, dt, this.runMs, diff, this.player.x, this.enemies);
    updateEnemies(this.enemies, dt);
    // Enemy guns run after their hulls have moved, for the same reason the
    // player's does above. This also steers the one type that steers, which is
    // why it comes after updateEnemies rather than before: that call is what
    // ages and culls the entity, and this one is what moves this one kind.
    updateShooters(this.enemies, dt, this.player, this.enemyBullets, diff);

    // Both projectile lists move here, after everything that could have added
    // to them this frame — so a shot fired this frame has already travelled
    // when the hit tests below reconstruct where it came from.
    updateBullets(this.bullets, dt);
    updateBullets(this.enemyBullets, dt);

    // Resolve after everything has moved, so both sides of a test agree on the
    // frame. Both bullet resolvers reconstruct each shot's pre-move position
    // from the same dt, so they must run in the frame that moved them.
    //
    // Collision only reports what died; turning that into effects is this
    // loop's job, which is what keeps collide.js free of spawning.
    for (const e of resolveBulletHits(this.bullets, this.enemies, dt)) {
      explodeEnemy(this.explosions, e);
      maybeDropBonus(this.pickups, e, diff);
    }
    // Incoming fire leaves no wreck to explode, but it does leave a mark on the
    // hull, in the colour of the particle that made it. Death is picked up by
    // updateDeath below like every other damage source.
    const shot = resolveEnemyBulletHits(this.player, this.enemyBullets, dt);
    if (shot) {
      const c = PARTICLE_COLORS[bulletWeapon(shot).row];
      this.onPlayerHit(c.color, c.spark);
    }

    const rammed = resolvePlayerHits(this.player, this.enemies);
    if (rammed) {
      explodeEnemy(this.explosions, rammed);
      // A ram kills the enemy too, so it drops like any other death.
      maybeDropBonus(this.pickups, rammed, diff);
      // The impact takes the rammer's colours, so a kill and a hit go off
      // together in the same hue and read as one collision rather than two
      // unrelated events.
      const t = ENEMY_TYPES[rammed.t];
      this.onPlayerHit(t.color, t.spark);
    }

    // Bonuses drift and are collected after all damage has resolved, so a heal
    // caught in the same frame as a hit lands on the counter the hit left.
    updatePickups(this.pickups, dt);
    for (const b of resolveCatches(this.player, this.pickups)) {
      this.applyBonus(b);
    }

    this.updateDeath(dt);
    updateExplosions(this.explosions, dt);

    this.shakeMs = Math.max(0, this.shakeMs - dt);

    // Ease the starfield toward the turbo speed rather than snapping — the ramp
    // is most of what sells the burst.
    const target = this.player.turboMs > 0 ? PLAYER_TURBO_MULT : 1;
    this.scrollMult += (target - this.scrollMult) * (1 - Math.exp(-SCROLL_EASE * dt / 1000));
    Stars.update(dt, this.scrollMult);
  },

  // Out of armour is out of the run (CLAUDE.md §7). Checked here once a frame
  // rather than inside damagePlayer so that every damage source — enemy bodies,
  // enemy fire, and the debug key — reaches death the same way.
  updateDeath(dt) {
    if (this.player.hits <= 0 && killPlayer(this.player)) {
      explodeShip(this.explosions, this.player);
      this.shake(SHAKE_DEATH_MS, SHAKE_DEATH_MAG);
    }
    if (!this.player.dead) return;

    this.deathMs += dt;
    // Scaffolding. The real flow is game-over card -> title -> records
    // (CLAUDE.md §7), which needs menu.js and scores.js; until those exist the
    // run simply starts again, on the same hull, once the wreck has burnt out.
    if (this.deathMs >= RESPAWN_MS) this.resetRun(this.player.ship);
  },
};

const MOVE_KEYS = new Set([
  'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

Game.init();
