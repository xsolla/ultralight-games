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
// How long the wreck burns before the title screen comes back. Comfortably
// longer than the explosion chain in explosions.js, so the return never cuts
// it off mid-blast.
const RESPAWN_MS  = 2100;

// ---- Scoring ---------------------------------------------------------------
// One point per second survived. The HUD's ECG beats on this same accumulator,
// so the heartbeat the player watches IS the point being earned — the readout
// is not decorating the score, it is showing it.
const SCORE_TICK_MS = 1000;
// How long the number stays enlarged after a gain, so a kill registers on a
// readout that is otherwise only moving once a second.
const SCORE_POP_MS = 260;

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

// ---- Matched-bonus payouts -------------------------------------------------
// A named weapon or hull bubble is an informed choice (CLAUDE.md §7): the player
// can see what is inside before flying at it. Which leaves one dead case — the
// bubble holding what they are ALREADY flying, where the swap is a no-op and the
// catch pays nothing. These are what it pays instead, in hits.
//
// The hull is worth double because catching your own is the rarer coincidence
// and the worse consolation: a matched weapon bubble is one of five, a matched
// hull one of three, and hull bubbles are scarcer to begin with (BONUSES `w` of
// 12 against 20). Paying both the same would make the rarer event the cheaper
// one.
const WEAPON_MATCH_HEAL = 1;   // hits, when the bubble holds the gun in hand
const SHIP_MATCH_HEAL   = 2;   // hits, when it holds the hull already flown

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

  // Both named bonuses fall back to armour when they name what is already in
  // hand. Decided HERE rather than in setWeapon/setShip because those are the
  // armour/weapon model and know nothing about bonuses — the debug keys and a
  // future menu call them too, and neither should hand out hits.
  weapon: (game, arg) => {
    if (arg === game.player.weapon) healPlayer(game.player, WEAPON_MATCH_HEAL);
    else setWeapon(game.player, arg);
  },

  // setShip is called either way: on a matching hull it swaps nothing but still
  // fires the swap flash, and a catch that produced no flash would read as
  // having failed. The heal is what it produces instead of a swap.
  ship: (game, arg) => {
    const same = arg === game.player.ship;
    setShip(game.player, arg);
    if (same) healPlayer(game.player, SHIP_MATCH_HEAL);
    // The music belongs to the hull, so it changes with it — a crossfade, since
    // this happens mid-flight and a cut would land like a mistake. Told rather
    // than polled, and told AFTER the swap so it reads the hull that is now
    // being flown; a same-hull catch is a no-op inside Sound.
    Sound.setShip(game.player.ship);
  },

  turbo:  (game) => startTurbo(game.player),
  wing:   (game) => spawnWingmen(game.wingmen, game.player),
};

const Game = {
  // 'menu' | 'playing' | 'records'. The rest of CLAUDE.md §5's list —
  // shipselect, paused, gameover — are not built yet; each arrives as a branch
  // here, in update() and in drawScene(), and nothing else has to learn of it.
  //
  // 'records' absorbed the gameover card: one card reports the run AND shows
  // the table, rather than a card that says how you did followed by a screen
  // that says the same thing in a list.
  screen: 'menu',
  recordsFrom: 'menu',  // 'menu' | 'gameover' — backdrop, heading and buttons
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
  asteroids: [],        // indestructible obstacles; on their own list because
                        // nothing that reads enemies ever wants one
  pickups: [],          // drifting bonus bubbles waiting to be caught
  wingmen: [],          // the escort, while a wing bonus is running
  explosions: [],       // live death bursts, purely decorative
  score: 0,             // this run's points
  // Counts UP toward SCORE_TICK_MS and wraps. Kept rather than derived from
  // runMs because it has to stop dead when the player does, and because the ECG
  // reads its phase straight off it.
  scoreMs: 0,
  scorePopMs: 0,        // counts down; drives the number's pop on a gain
  // Highest BOSS_SCORE_STEP milestone this run has crossed. Kept as the reached
  // index rather than as "points since the last one" so a single gain that
  // vaults a milestone still fires it exactly once.
  bossMilestone: 0,
  // The run's result, frozen the instant the run ended. `newRank` is the row it
  // took in the table, or -1 for a run that did not make it — which is what
  // decides whether there is a card to show at all.
  //
  // Frozen rather than read later because the score is still LIVE after the
  // ship is wrecked: bullets already in flight keep travelling and can still
  // kill things while the wreck burns, so a number read when the explosion
  // finishes is not the number the player died on.
  runOver: false,
  finalScore: 0,
  newRank: -1,
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
  // Spawner state — one countdown per stream, plus the boss queue, which is
  // filled by score rather than by a clock. spawner.js holds none of its own.
  spawn: { trickleMs: 0, waveMs: 0, shooterMs: 0, asteroidMs: 0, bossMs: 0, bossQueue: 0 },

  // ---- HUD ----
  soundState: 'on',     // 'on' | 'musicoff' | 'off'; see SOUND_CYCLE
  hudHover: null,       // id of the button under the pointer, or null
  menuHover: null,      // ...and the title screen's own, which never coexist:
                        // a pointer over a HUD button is over no menu button
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
    Rays.init();
    Bokeh.init();
    Scores.init();
    // A run is built up front even though the title screen is what opens, so
    // every reader of Game.player has something to read before the first START.
    this.resetRun(START_SHIP);
    Atlas.load();
    // The title screen opens with its own music. Asked for here even though a
    // page that has not been touched yet is usually refused permission to play
    // — the first gesture below is what finishes the start when it is, and this
    // is what plays immediately when it is not (an embed granted autoplay, or a
    // browser that already trusts this origin).
    Sound.startTitle();

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
    this.asteroids.length = 0;
    this.pickups.length = 0;
    this.wingmen.length = 0;
    this.explosions.length = 0;
    this.score = 0;
    this.scoreMs = 0;
    this.scorePopMs = 0;
    this.bossMilestone = 0;
    this.runOver = false;
    this.finalScore = 0;
    this.newRank = -1;
    this.runMs = 0;
    this.deathMs = 0;
    this.shakeMs = 0;
    this.shakeTotalMs = 0;
    this.shakeMag = 0;
    this.scrollMult = 1;
    resetSpawner(this.spawn);
  },

  // ---- Screens ------------------------------------------------------------
  // Begin a run on the hull the title screen was showing, at the difficulty its
  // picker was showing. Both are read from the same state the menu painted, so
  // what starts is by construction what the player saw.
  //
  // START_SHIP, never this.player.ship: that field is the hull the LAST run
  // ended on, which a ship bonus may have changed, and reading it here would
  // carry a mid-run swap into every run that followed.
  startRun() {
    this.resetRun(START_SHIP);
    this.screen = 'playing';
    this.menuHover = null;
    // Music is bound to the RUN, and this is one of the two places that bind
    // it. Started from a press, never from init(), so the browser's autoplay
    // gate is already open by the time the track is asked to play.
    Sound.startMusic(this.player.ship);
  },

  // Back to the title. Hover state is cleared on the way out because it is the
  // only thing here that a screen change could leave stale — CLAUDE.md §5 asks
  // for the button RECTS to be cleared too, but there are none to clear: both
  // layouts are pure functions, so nothing outlives the screen that drew it.
  toMenu() {
    this.screen = 'menu';
    this.menuHover = null;
    this.hudHover = null;
    this.hudCapture = false;
    // ...and the other end of it. Here rather than at the wreck: the game-over
    // card sits over the run it reports and is still part of it, so the run's
    // music carries through and hands over here — fading out over three
    // seconds, with the title's own track rising through the fade.
    Sound.startTitle();
  },

  // Open the records card over whatever is on screen now. `from` is 'menu' when
  // the title screen asked for it and 'gameover' when a run just ended, and it
  // is the only thing that differs between the two: same table, same card.
  openRecords(from) {
    this.screen = 'records';
    this.recordsFrom = from;
    this.menuHover = null;
    this.hudHover = null;
    this.hudCapture = false;
  },

  // Freeze the run's score and enter it in the table. Called at the INSTANT the
  // run ends — the frame the ship is wrecked, or the press of the exit button —
  // never when the wreck finishes burning, because the score is still moving in
  // between (see the note on runOver).
  //
  // Guarded so it can only happen once per run: pressing exit while the wreck
  // is still burning must not enter the same run twice.
  fixScore() {
    if (this.runOver) return;
    this.runOver = true;
    this.finalScore = this.score;
    this.newRank = Scores.submit(DIFFICULTIES[this.diffIdx].key, this.score);
  },

  // Where a finished run goes: the card, always. It used to open only for a
  // run that made the table, which left an ordinary run with no way to replay
  // without crossing the title screen first — and replaying is the thing a
  // player wants most at exactly that moment. The card reads as a result rather
  // than a celebration when there is no record; `newRank` of -1 is what it
  // reads to tell the difference, so nothing here has to say which it is.
  afterRun() {
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
      const over = hudButtonAt(p.x, p.y, this.screen);
      this.hudHover = over;

      // Neither the title screen nor the records card has a ship to steer, so
      // the whole pointer path is just hover. A HUD button wins over a screen
      // button beneath it, the same precedence the press below uses.
      //
      // Both share menuHover: they are never on screen at once, so one field
      // cannot be ambiguous and two would only give them a chance to disagree.
      if (this.screen === 'menu' || this.screen === 'records') {
        this.menuHover = over ? null : this.screenButtonAt(p.x, p.y);
        this.canvas.style.cursor = (over || this.menuHover) ? 'pointer' : 'default';
        return;
      }

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
      this.menuHover = null;
      this.hudCapture = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toLogical(e);
      this.noteInputKind(e);

      // HUD FIRST, always (CLAUDE.md §5). The buttons sit over the playfield, so
      // a tap that hits one must not also steer or fire — hence the early
      // return rather than a flag checked later.
      const hit = hudButtonAt(p.x, p.y, this.screen);
      if (hit) {
        this.hudCapture = true;
        this.hudHover = hit;
        this.pressHudButton(hit);
        return;
      }

      // Both non-run screens return either way, pressed or not: there is
      // nothing behind their buttons to steer or fire, so a tap on the backdrop
      // is not an input that has been missed. On the records card that is also
      // what makes it MODAL — a press outside it reaches nothing, including the
      // title screen still visible underneath.
      if (this.screen === 'menu' || this.screen === 'records') {
        const b = this.screenButtonAt(p.x, p.y);
        if (b) {
          this.menuHover = b;
          this.pressScreenButton(b);
        }
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

      // The records card's keys. Enter takes the primary button — the one the
      // card already shows as primary — and Escape always leaves.
      if (this.screen === 'records') {
        if (k === 'enter' || k === ' ') {
          this.pressRecordsButton(this.recordsFrom === 'menu' ? 'ok' : 'retry');
          e.preventDefault();
        } else if (k === 'escape') {
          this.pressRecordsButton(this.recordsFrom === 'menu' ? 'ok' : 'title');
        }
        return;
      }

      // The title screen's own keys, and an early return so none of the
      // run-only keys below can fire at a ship that is not flying yet.
      if (this.screen === 'menu') {
        if (k === 'enter' || k === ' ') {
          this.startRun();
          e.preventDefault();
        }
        // 1/2/3 pick a difficulty. Kept where the mid-run copy of it was not:
        // this one only reaches a control the player can already see and press,
        // and it changes nothing that is not shown on screen the instant after.
        if (k >= '1' && k <= '3') this.diffIdx = +k - 1;
        return;
      }

      // A run takes exactly two inputs from the keyboard: steer, and fire.
      // Everything else that used to be bound here — ship, weapon, turbo, heal,
      // damage, difficulty — was scaffolding from before the bonuses and the
      // title screen existed, and every one of those effects now has a real way
      // in. Nothing may be added back here that the player cannot also reach by
      // playing.
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
      this.menuHover = null;
    });

    // The browser will not let a page play audio until the user has touched it,
    // so the title music asked for in init() is usually refused; this is what
    // finishes it. LAST in this method on purpose: these fire after the
    // handlers above, so a first gesture that happens to be START has already
    // begun the RUN's music and Sound.resume() finds nothing left to do —
    // otherwise the title track would flicker in behind the run it just left.
    const firstGesture = () => Sound.resume();
    window.addEventListener('pointerdown', firstGesture, { once: true });
    window.addEventListener('keydown', firstGesture, { once: true });
  },

  // ---- Scoring ------------------------------------------------------------
  // Every gain goes through here so the readout's pop can never be forgotten by
  // a new source of points — the same reason onPlayerHit exists for damage.
  addScore(n) {
    this.score += n;
    this.scorePopMs = SCORE_POP_MS;

    // Boss milestones. Checked HERE, in the funnel every gain already passes
    // through, for the same reason the pop is: a future source of points cannot
    // forget to trigger one.
    //
    // Guarded on runOver because the score keeps climbing after the ship is
    // wrecked — shots already in flight go on killing things — and a run whose
    // result is fixed should not still be summoning encounters into its own
    // wreckage.
    if (this.runOver) return;
    const milestone = Math.floor(this.score / BOSS_SCORE_STEP);
    if (milestone > this.bossMilestone) {
      this.bossMilestone = milestone;
      queueBossWaves(this.spawn, bossWavesFor(milestone));
    }
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
    if (id === 'sound') {
      this.soundState = SOUND_CYCLE[this.soundState];
      // Game.soundState stays the single source of truth (constants.js);
      // audio.js is handed the new value rather than reaching for it.
      Sound.applyState(this.soundState);
    } else if (id === 'exit') this.endRun();
    else this.toggleFullscreen();
  },

  // branding.md §2: exit returns to the title screen. It used to end the run
  // through the wreck instead, because there was no title to return to; now
  // that menu.js exists it does what the spec says, and abandoning a run is no
  // longer dressed up as dying in one.
  //
  // The score still counts. Leaving early is a decision about the run, not a
  // way of not having played it, so it is fixed and entered exactly as a death
  // is — and a run good enough to make the table gets its card either way.
  endRun() {
    this.fixScore();
    this.afterRun();
  },

  // Which of the CURRENT screen's own buttons is under a point. One entry
  // point, so the hover path and the press path can never end up testing two
  // different layouts.
  screenButtonAt(px, py) {
    return this.screen === 'records'
      ? recordsButtonAt(px, py, this.recordsFrom)
      : menuButtonAt(px, py);
  },

  pressScreenButton(id) {
    if (this.screen === 'records') this.pressRecordsButton(id);
    else this.pressMenuButton(id);
  },

  // One press on the title screen. Here rather than in menu.js for the same
  // reason pressHudButton is here rather than in render.js: every one of these
  // is a state transition, and neither presentation module mutates state.
  pressMenuButton(id) {
    if (id === 'start') {
      this.startRun();
      return;
    }
    // The same card the end of a run raises, opened as a plain look at the
    // table — no run to report, so no row is emphasised and there is nowhere
    // to go but back.
    if (id === 'records') {
      this.openRecords('menu');
      return;
    }

    // Difficulty. Dispatched on the rect's own `kind`/`i` rather than by
    // parsing the id, so the ids stay opaque strings and a new row in
    // DIFFICULTIES needs no change here at all.
    const r = menuButtonRects().find((b) => b.id === id);
    if (r && r.kind === 'diff') this.diffIdx = r.i;
  },

  // 'retry' starts another run; 'title' and 'ok' are the same destination
  // wearing the label its context calls for.
  pressRecordsButton(id) {
    if (id === 'retry') this.startRun();
    else this.toMenu();
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
    // The title screen runs its own ambiance and nothing else: no run clock, no
    // spawner, no collision. The starfield keeps its in-game drift rate so the
    // menu and the run that follows read as one continuous flight rather than
    // as two different scenes.
    if (this.screen === 'menu') {
      Stars.update(dt, 1);
      Bokeh.update(dt);
      return;
    }

    // The card over the title keeps the title alive behind it. The card over a
    // finished run does not: the score is fixed, and so is the picture of how
    // it was earned.
    if (this.screen === 'records') {
      if (this.recordsFrom === 'menu') {
        Stars.update(dt, 1);
        Bokeh.update(dt);
      }
      return;
    }

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

    updateSpawner(this.spawn, dt, this.runMs, diff, this.player.x,
                  this.enemies, this.asteroids);
    updateEnemies(this.enemies, dt);
    updateAsteroids(this.asteroids, dt);
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
      // On top of that roll, never instead of it: the last link of a cleared
      // chain can drop twice. Ordered after it so the ceiling in pickups.js is
      // spent on the ordinary drop first, which is the one that keeps its
      // per-type odds honest.
      maybeDropChainBonus(this.pickups, e);
      this.addScore(ENEMY_TYPES[e.t].score);
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
      // A ram kills the enemy too, so it drops and scores like any other death.
      // It cost an armour layer to get, which is its own price.
      maybeDropBonus(this.pickups, rammed, diff);
      // Ramming the last link finishes the chain like anything else does, and
      // an armour layer is a steep enough price to have paid for it.
      maybeDropChainBonus(this.pickups, rammed);
      this.addScore(ENEMY_TYPES[rammed.t].score);
      // The impact takes the rammer's colours, so a kill and a hit go off
      // together in the same hue and read as one collision rather than two
      // unrelated events.
      const t = ENEMY_TYPES[rammed.t];
      this.onPlayerHit(t.color, t.spark);
    }

    // Rocks resolve after the enemies, so a frame that could go either way
    // spends its one armour layer on the thing that dies for it. The rock is
    // indestructible and will still be there next frame; the enemy will not.
    const struck = resolveAsteroidHits(this.player, this.asteroids);
    if (struck) {
      const t = ASTEROID_TYPES[struck.t];
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

    // One point per second, but only while there is someone alive to earn it —
    // and a WHILE, not an if, so a long frame pays out every tick that fell
    // inside it rather than swallowing the extras.
    if (!this.player.dead) {
      this.scoreMs += dt;
      while (this.scoreMs >= SCORE_TICK_MS) {
        this.scoreMs -= SCORE_TICK_MS;
        this.addScore(1);
      }
    }
    this.scorePopMs = Math.max(0, this.scorePopMs - dt);
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
      // The score is taken HERE, on the frame of the wreck, and only shown once
      // the wreck has finished burning below.
      this.fixScore();
    }
    if (!this.player.dead) return;

    this.deathMs += dt;
    // The wreck burns, then the run reports itself: the records card if it
    // earned one, the title if it did not.
    if (this.deathMs >= RESPAWN_MS) this.afterRun();
  },
};

const MOVE_KEYS = new Set([
  'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

Game.init();
