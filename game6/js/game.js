// ============================================================================
// game.js — the single Game object: state, input, canvas sizing, main loop.
// Owns mutable run state and screen transitions and nothing else; motion lives
// in player.js, drawing in render.js.
//
// Iteration 2 scope: starfield, one steerable ship, ship cycling, the turbo
// burst, and the five player weapons with the §7 armour counter driving their
// level. Enemies, collision and explosions have since landed; pickups and
// scoring have not.
// ============================================================================

// ---- Tunable ---------------------------------------------------------------
const SCROLL_EASE = 6;      // 1/s — how fast the starfield ramps in/out of turbo
const DT_CLAMP_MS = 100;    // a backgrounded tab must not teleport the ship
// How long the wreck burns before the run starts over. Comfortably longer than
// the explosion chain in explosions.js, so the restart never cuts it off.
const RESPAWN_MS  = 2100;

const Game = {
  canvas: null,
  ctx: null,
  lastTime: 0,
  time: 0,              // ms accumulator, drives twinkle and animation phase
  player: null,
  scrollMult: 1,        // eased starfield speed multiplier
  bullets: [],          // live player projectiles
  enemies: [],          // live enemies
  explosions: [],       // live death bursts, purely decorative
  runMs: 0,             // elapsed run time — the difficulty ramp's only input
  deathMs: 0,           // time since the ship was wrecked; drives the restart
  diffIdx: 1,           // index into DIFFICULTIES; 'normal' until menu.js exists
  spawn: { trickleMs: 0, waveMs: 0 },   // spawner timers (it holds no state)

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
    this.enemies.length = 0;
    this.explosions.length = 0;
    this.runMs = 0;
    this.deathMs = 0;
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
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
      this.noteInputKind(e);
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.active = false;
      this.pointerDown = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toLogical(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
      this.noteInputKind(e);
      // LMB is the trigger (§8). Holding it is all autofire is.
      if (e.button === 0) this.pointerDown = true;
    });
    const release = () => { this.pointerDown = false; };
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
      if (k === '[') damagePlayer(this.player);
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
    });
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
    updateBullets(this.bullets, dt);

    updateSpawner(this.spawn, dt, this.runMs, diff, this.player.x, this.enemies);
    updateEnemies(this.enemies, dt);

    // Resolve after everything has moved, so both sides of a test agree on the
    // frame. resolveBulletHits reconstructs each bullet's pre-move position
    // from the same dt, so it must run in the frame that moved them.
    //
    // Collision only reports what died; turning that into effects is this
    // loop's job, which is what keeps collide.js free of spawning.
    for (const e of resolveBulletHits(this.bullets, this.enemies, dt)) {
      explodeEnemy(this.explosions, e);
    }
    const rammed = resolvePlayerHits(this.player, this.enemies);
    if (rammed) explodeEnemy(this.explosions, rammed);

    this.updateDeath(dt);
    updateExplosions(this.explosions, dt);

    // Ease the starfield toward the turbo speed rather than snapping — the ramp
    // is most of what sells the burst.
    const target = this.player.turboMs > 0 ? PLAYER_TURBO_MULT : 1;
    this.scrollMult += (target - this.scrollMult) * (1 - Math.exp(-SCROLL_EASE * dt / 1000));
    Stars.update(dt, this.scrollMult);
  },

  // Out of armour is out of the run (CLAUDE.md §7). Checked here once a frame
  // rather than inside damagePlayer so that every damage source — enemy bodies,
  // the debug key, and enemy fire when it lands — reaches death the same way.
  updateDeath(dt) {
    if (this.player.hits <= 0 && killPlayer(this.player)) {
      explodeShip(this.explosions, this.player);
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
