// ============================================================================
// audio.js — Sound namespace: the game's background music and its sound
// effects. Copied from game6 and re-mapped (CLAUDE.md §10). Owns the <audio>
// elements, which track belongs where, the volume tweens between them, and the
// one-shot pools every sfx plays from. It is a READER of state, never an owner:
// game.js says a run began, a wave ended, or the title screen is up, and the
// sound button's three-state value arrives through applyState. No game state,
// no drawing.
//
// A TRACK IS A SLOT. The run's tracks take slots 0..RUN_SRCS.length-1 and the
// title takes TITLE_TRACK after them, so switchTo() never learns which kind it
// is holding. A run's tracks don't loop: each plays once, and when it ends a
// different one (never the one that just played) is chosen at random and
// takes over. Nothing about a run's music depends on what is happening in the
// game.
//
// AN SFX IS AN EVENT, not a file. Callers name what happened ('uiClick',
// 'shipLaunched') and never a path.
//
// HTMLAudioElement rather than Web Audio: the fetch+decode route is blocked by
// CORS on file://. The cost is iOS Safari, which ignores `volume` — every fade
// there degrades to a cut and nothing else changes.
//
// Every entry point is guarded, so a missing or blocked file yields silence
// rather than a broken run.
// ============================================================================

// ---- Tunable audio knobs ---------------------------------------------------
const AUDIO = {
  TITLE_SRC: 'assets/bgm/bgm_title.mp3',
  RUN_SRCS: ['assets/bgm/bgm_battle1.mp3', 'assets/bgm/bgm_battle2.mp3', 'assets/bgm/bgm_battle3.mp3'],
  VOLUME: 0.45,        // music level, 0..1 — under the game, not over it
  FADE_MS: 3000,       // ms for the run's music to leave when the title returns
  CROSSFADE_MS: 2000,  // ms for every other swap: old track out, new one in
  TICK_MS: 40,         // ms between volume steps — 25/s is below hearing a stair
  SFX_VOLUME: 0.85,    // master sfx level, 0..1; every row's `vol` scales this

  // ---- Sound effects ------------------------------------------------------
  // One row per sound EVENT. `src` is a single file, or the list a *_var* set
  // rolls between (pickVariant never repeats one twice running).
  //   pool  voices kept for the event, so a second copy can start before the
  //         first has finished.
  //   gap   ms of enforced silence before the same event may fire again.
  //   vol   0..1 on top of SFX_VOLUME.
  // Rows join as their events do.
  SFX: {
    // ---- Guns, one row per GUNS row, named by its `sfx` -----------------------
    // The quietest rows by a distance, and throttled: a fleet of twenty fires
    // dozens of volleys a second, and this has to sit under everything it is
    // being fired at rather than over it. The gap collapses a volley of
    // simultaneous triggers into one report.
    weaponSpark:     { src: 'assets/sfx/weapon_spark.mp3',     pool: 3, gap: 70, vol: 0.10 },
    weaponPlasma:    { src: 'assets/sfx/weapon_plasma.mp3',    pool: 3, gap: 70, vol: 0.10 },
    weaponDagger:    { src: 'assets/sfx/weapon_dagger.mp3',    pool: 3, gap: 70, vol: 0.10 },
    weaponFury:      { src: 'assets/sfx/weapon_fury.mp3',      pool: 3, gap: 90, vol: 0.08 },
    weaponLightning: { src: 'assets/sfx/weapon_lightning.mp3', pool: 3, gap: 90, vol: 0.10 },
    // Incoming fire sits above the fleet's own guns: it is the warning.
    enemyFire: { pool: 3, gap: 90, vol: 0.20, src: [
      'assets/sfx/enemy_fire_var1.mp3',
      'assets/sfx/enemy_fire_var2.mp3',
      'assets/sfx/enemy_fire_var3.mp3',
      'assets/sfx/enemy_fire_var4.mp3',
    ] },

    // ---- Deaths and damage (`enemy explosion.mp3` has a space; percent-encoded)
    enemyExplosion:  { src: 'assets/sfx/enemy%20explosion.mp3', pool: 4, gap: 55, vol: 0.50 },
    playerExplosion: { src: 'assets/sfx/player_explosion.mp3',  pool: 2, gap: 120, vol: 0.80 },
    playerHit:       { src: 'assets/sfx/player_ship_hit.mp3',   pool: 2, gap: 90, vol: 0.50 },
    collisionEnemy: { pool: 2, gap: 80, vol: 0.70, src: [
      'assets/sfx/collision_var1.mp3',
      'assets/sfx/collision_var2.mp3',
      'assets/sfx/collision_var3.mp3',
    ] },
    collisionAsteroid: { src: 'assets/sfx/collision_asteroid.mp3', pool: 2, gap: 80, vol: 0.80 },
    // The planet taking damage: the one resource the run is lost by, so it is
    // loud and it is never throttled into silence by a burst of other sounds.
    planetHit: { src: 'assets/sfx/weapon_level_down.mp3', pool: 2, gap: 120, vol: 0.85 },

    uiClick:  { src: 'assets/sfx/ui_click.mp3',     pool: 2, gap: 60, vol: 0.70 },
    uiHover:  { src: 'assets/sfx/ui_mouseover.mp3', pool: 2, gap: 40, vol: 0.35 },

    // Money leaving the account. The bonus pickup set, re-used: it is the sound
    // of a transaction, and the game has no other one.
    orderPlaced: { pool: 2, gap: 40, vol: 0.70, src: [
      'assets/sfx/bonus_taken_var1.mp3',
      'assets/sfx/bonus_taken_var2.mp3',
      'assets/sfx/bonus_taken_var3.mp3',
    ] },
    shipLaunched:     { src: 'assets/sfx/wingmen_appear.mp3',          pool: 2, gap: 120, vol: 0.60 },
    healerLaunched:   { src: 'assets/sfx/afterburners_activated.mp3',  pool: 1, gap: 0,   vol: 0.65 },
    behaviourChanged: { src: 'assets/sfx/ship_changed.mp3',            pool: 1, gap: 0,   vol: 0.70 },

    waveStart:    { src: 'assets/sfx/boss_wave_start_small.mp3',   pool: 1, gap: 0, vol: 0.80 },
    waveStartBig: { src: 'assets/sfx/boss_wave_start_large.mp3',   pool: 1, gap: 0, vol: 0.85 },
    waveCleared:  { src: 'assets/sfx/weapon_new_level_reached.mp3', pool: 1, gap: 0, vol: 0.80 },
  },
};

// The slot after the run's tracks.
const TITLE_TRACK = AUDIO.RUN_SRCS.length;

// ---- Sfx pool helpers ------------------------------------------------------
// Separate elements rather than one element rewound, because rewinding cuts the
// copy that is already sounding.
function makeSfxVoices(src, vol, n) {
  const els = [];
  for (let i = 0; i < n; i++) {
    try {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = Math.min(1, AUDIO.SFX_VOLUME * vol);
      a.load();
      els.push(a);
    } catch (e) { /* a file that will not build yields silence, not a throw */ }
  }
  return els;
}

// Which file of a *_var* set to play. Never the one that just played.
function pickVariant(pool) {
  const n = pool.vars.length;
  if (n < 2) return 0;
  if (pool.last < 0) return Math.floor(Math.random() * n);
  let v = Math.floor(Math.random() * (n - 1));
  if (v >= pool.last) v++;
  return v;
}

// A random index in [0, n), never `exclude`. Same shape as pickVariant, used
// for the run's music track rotation.
function pickOtherTrack(n, exclude) {
  if (n < 2) return 0;
  let v = Math.floor(Math.random() * (n - 1));
  if (v >= exclude) v++;
  return v;
}

const Sound = {
  tracks: [],       // slot -> HTMLAudioElement, or null if it wouldn't build
  current: -1,      // slot owning playback, or -1 for silence — also the record
                    // of what SHOULD be sounding, which lets resume() finish a
                    // start the autoplay policy refused
  fades: [],        // live volume tweens: { i, from, to, ms, start, stop }
  timer: null,      // the one interval driving every tween
  state: 'on',      // mirrors Game.soundState; see SOUND_CYCLE in constants.js
  inRun: false,
  runTrack: 0,      // which of RUN_SRCS the run is on
  pools: {},

  musicEnabled() { return this.state === 'on'; },
  sfxEnabled() { return this.state !== 'off'; },

  // One element per slot, all built on first use. Nothing is fetched until
  // warm() asks for it: the four files are ~14MB.
  ensureTracks() {
    if (this.tracks.length || typeof Audio === 'undefined') return;
    const srcs = AUDIO.RUN_SRCS.concat(AUDIO.TITLE_SRC);
    this.tracks = srcs.map((src, i) => {
      try {
        const a = new Audio(src);
        // The title loops forever; a run track plays once and hands off to
        // onRunTrackEnded, which picks the next one.
        a.loop = (i === TITLE_TRACK);
        a.preload = 'none';
        a.volume = AUDIO.VOLUME;
        if (i !== TITLE_TRACK) a.addEventListener('ended', () => this.onRunTrackEnded(i));
        return a;
      } catch (e) {
        return null;
      }
    });
  },

  // Begin buffering a slot before anything needs to hear it, so a crossfade has
  // something to cross into.
  warm(i) {
    const a = this.tracks[i];
    if (!a || a.preload !== 'none') return;
    a.preload = 'auto';
    try { a.load(); } catch (e) { /* ignore */ }
  },

  // Build every sfx pool and start it buffering. Eager, unlike the music: the
  // sfx set is small, and a click that fetches on first press arrives late.
  initSfx() {
    if (typeof Audio === 'undefined') return;
    for (const key of Object.keys(AUDIO.SFX)) {
      const row = AUDIO.SFX[key];
      const srcs = Array.isArray(row.src) ? row.src : [row.src];
      this.pools[key] = {
        vars: srcs.map((src) => ({ els: makeSfxVoices(src, row.vol, row.pool), idx: 0 })),
        last: -1,
        gap: row.gap,
        at: -1e9,
      };
    }
  },

  // Fire a one-shot. An unknown key, a muted button, or a file that would not
  // build all yield silence rather than throwing.
  play(key) {
    if (!this.sfxEnabled()) return;
    const pool = this.pools[key];
    if (!pool) return;
    // Throttled BEFORE a voice is chosen, so a collapsed burst does not also
    // walk the round-robin and rewind the copy that IS audible.
    const now = performance.now();
    if (now - pool.at < pool.gap) return;
    pool.at = now;

    const v = pickVariant(pool);
    pool.last = v;
    const sub = pool.vars[v];
    const a = sub.els[sub.idx];
    if (!a) return;
    sub.idx = (sub.idx + 1) % sub.els.length;
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  },

  // Cut every sfx still sounding — only the walk to 'off' calls this.
  hushSfx() {
    for (const key of Object.keys(this.pools)) {
      for (const sub of this.pools[key].vars) {
        for (const a of sub.els) {
          if (a.paused) continue;
          a.pause();
          try { a.currentTime = 0; } catch (e) { /* ignore */ }
        }
      }
    }
  },

  // ---- Public entry points -------------------------------------------------
  // A run begins on a random track. Anything still sounding (the title) is
  // crossed into rather than cut.
  startMusic() {
    this.inRun = true;
    this.runTrack = Math.floor(Math.random() * AUDIO.RUN_SRCS.length);
    this.switchTo(this.runTrack, this.sounding() ? AUDIO.CROSSFADE_MS : 0);
    for (let i = 0; i < AUDIO.RUN_SRCS.length; i++) this.warm(i);
  },

  // A run track reached its natural end (it doesn't loop): hand off to a
  // different one, chosen at random, never repeating the track that just
  // finished. Guarded against stale events from a track that was cut short
  // (e.g. the run ended) rather than left to finish.
  onRunTrackEnded(i) {
    if (!this.inRun || this.current !== i) return;
    this.runTrack = pickOtherTrack(AUDIO.RUN_SRCS.length, i);
    this.switchTo(this.runTrack, 0);
  },

  // The title screen is up: at page load, and again when a run hands back to
  // it. Leaving a RUN takes the long FADE_MS; out of silence it opens at once.
  startTitle() {
    this.inRun = false;
    this.switchTo(TITLE_TRACK, this.sounding() ? AUDIO.FADE_MS : 0);
  },

  // First-gesture hook: a page cannot play audio before the user has touched it,
  // so the title track asked for at load is often refused; this finishes it.
  resume() {
    if (this.current >= 0) this.playTrack(this.current);
  },

  // The sound button moved. Cut rather than fade: the button is an instruction.
  applyState(state) {
    this.state = state;
    if (!this.sfxEnabled()) this.hushSfx();
    if (!this.tracks.length) return;
    if (this.musicEnabled()) this.resume();
    else for (const a of this.tracks) if (a && !a.paused) a.pause();
  },

  // ---- Playback ------------------------------------------------------------
  sounding() {
    const a = this.current >= 0 ? this.tracks[this.current] : null;
    return !!a && !a.paused;
  },

  // Make `i` the track that owns playback, taking `ms` to get there; the
  // outgoing track leaves over the same window, so the two genuinely cross.
  switchTo(i, ms) {
    this.ensureTracks();
    this.warm(i);
    const prev = this.current;
    if (prev === i) {
      this.tween(i, AUDIO.VOLUME, ms, false);
      this.playTrack(i);
      return;
    }
    this.current = i;
    if (prev >= 0) this.tween(prev, 0, ms, true);
    const next = this.tracks[i];
    if (!next) return;
    if (ms > 0 && next.paused) next.volume = 0;
    this.tween(i, AUDIO.VOLUME, ms, false);
    this.playTrack(i);
  },

  playTrack(i) {
    const a = this.tracks[i];
    if (!a || !this.musicEnabled() || !a.paused) return;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  },

  silence(i) {
    const a = this.tracks[i];
    if (a) {
      a.pause();
      try { a.currentTime = 0; } catch (e) { /* ignore */ }
      a.volume = AUDIO.VOLUME;
    }
    if (this.current === i) this.current = -1;
  },

  // ---- Volume tweens -------------------------------------------------------
  tween(i, to, ms, stop) {
    const a = this.tracks[i];
    if (!a) return;
    this.dropFade(i);
    if (ms <= 0) {
      a.volume = to;
      if (stop) this.silence(i);
      return;
    }
    this.fades.push({ i, from: a.volume, to, ms, start: performance.now(), stop });
    this.runFades();
  },

  dropFade(i) {
    const at = this.fades.findIndex((f) => f.i === i);
    if (at >= 0) this.fades.splice(at, 1);
  },

  // One interval for every live tween. A TIMER rather than requestAnimationFrame
  // because rAF stops in a hidden tab, which would freeze a fade half-way.
  // Progress is read from the clock, so a throttled tick shortens the step count
  // and never the duration.
  runFades() {
    if (this.timer !== null) return;
    const step = () => {
      const now = performance.now();
      for (let n = this.fades.length - 1; n >= 0; n--) {
        const f = this.fades[n];
        const k = f.ms > 0 ? Math.min(1, (now - f.start) / f.ms) : 1;
        const a = this.tracks[f.i];
        // Equal-power, not linear: two linear ramps crossing at half volume dip
        // about 3dB in the middle of every swap.
        if (a) {
          const v = f.from * Math.cos(k * Math.PI / 2) + f.to * Math.sin(k * Math.PI / 2);
          a.volume = Math.max(0, Math.min(1, v));
        }
        if (k >= 1) {
          this.fades.splice(n, 1);
          if (f.stop) this.silence(f.i);
        }
      }
      if (!this.fades.length) { clearInterval(this.timer); this.timer = null; }
    };
    this.timer = setInterval(step, AUDIO.TICK_MS);
  },
};
