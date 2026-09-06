// ============================================================================
// audio.js — Sound namespace: the game's background music and its sound
// effects. Owns the <audio> elements, which track belongs where, the volume
// tweens that move between them, and the one-shot pools every sfx plays from.
// It is a READER of state, never an owner: game.js says a run began, a hull
// changed, or the title screen is up, and the sound button's three-state value
// arrives through applyState. No game state, no drawing.
//
// A TRACK IS A SLOT, and the title screen's is the last one. The hulls take
// slots 0..SHIPS.length-1 and the title takes TITLE_TRACK after them, so
// switchTo() never learns which kind it is holding and the title screen gets
// the crossfade, the fade and the sound button for free.
//
// AN SFX IS AN EVENT, not a file. Callers name what happened ('enemyExplosion',
// 'uiClick') and never a path, so a *_var* set that grows a fourth variant, or
// a sound that wants a different mix level, is a change in the AUDIO.SFX table
// and nowhere else.
//
// HTMLAudioElement rather than Web Audio, for the reason CLAUDE.md §2 gives:
// the fetch+decode route is blocked by CORS on file://, and this game must run
// from a double-clicked index.html. The cost is iOS Safari, which ignores the
// `volume` property — every fade there degrades to a cut and every per-sound
// mix level degrades to full, and nothing else changes.
//
// Every entry point is guarded, so a missing or blocked file yields silence
// rather than a broken run.
// ============================================================================

// ---- Tunable audio knobs ---------------------------------------------------
const AUDIO = {
  // The title screen's track. The hulls' live on their SHIPS rows, because a
  // hull owns its music; the title screen is not a row anywhere, so its own
  // track is the one that belongs here.
  TITLE_SRC: 'assets/bgm/bgm_title.mp3',
  VOLUME: 0.45,        // music level, 0..1 — under the game, not over it
  FADE_MS: 3000,       // ms for the run's music to leave when the title returns
  CROSSFADE_MS: 2000,  // ms for every other swap: old track out, new one in
  TICK_MS: 40,         // ms between volume steps — 25/s is below hearing a stair
  SFX_VOLUME: 0.85,    // master sfx level, 0..1; every row's `vol` scales this

  // ---- Sound effects ------------------------------------------------------
  // One row per sound EVENT. `src` is a single file, or the list a *_var* set
  // rolls between — the variants exist so a burst of the same event does not
  // sound like one clip played twice, and pickVariant() below never repeats.
  //
  // Every knob is spelled out on every row rather than defaulted, because this
  // table IS the game's mix and a defaulted number is one you cannot read off
  // the page:
  //   pool  voices kept for the event, so a second copy can start before the
  //         first has finished. 1 is right for anything that cannot overlap
  //         with itself — one ship, one wave, one turbo burst.
  //   gap   ms of enforced silence after a play before the same event may fire
  //         again. This is what stops a boss wave's kills or a Reaver chain's
  //         volley collapsing into a wall of noise. 0 where the event's own
  //         cadence already spaces it — a gun's `interval` is 150ms at the
  //         fastest, which is further apart than any throttle would put it.
  //   vol   0..1 on top of SFX_VOLUME. The mix in one column: the things that
  //         happen several times a second sit well under the ones that happen
  //         once a run.
  //
  // 'enemy explosion.mp3' is the one asset with a space in its name, so it is
  // percent-encoded here — a bare space in a URL is tolerated by most engines
  // and specified by none, and this file has to load off file:// too.
  SFX: {
    // ---- UI. Only the mouse hears the hover (see noteHover in game.js). ----
    uiClick:  { src: 'assets/sfx/ui_click.mp3',     pool: 2, gap: 60, vol: 0.70 },
    uiHover:  { src: 'assets/sfx/ui_mouseover.mp3', pool: 2, gap: 40, vol: 0.35 },

    // ---- The player's gun, one row per WEAPONS row, named by its `sfx`. ----
    // The quietest rows in the table by a distance, and they have to be: this is
    // the sound the player hears most, up to seven times a second for the whole
    // run, and it has to sit under everything it is being fired at rather than
    // over it. Halved from the 0.30 they shipped at, which still crowded the
    // kills the shots were earning.
    weaponSpark:     { src: 'assets/sfx/weapon_spark.mp3',     pool: 3, gap: 0, vol: 0.15 },
    weaponPlasma:    { src: 'assets/sfx/weapon_plasma.mp3',    pool: 3, gap: 0, vol: 0.15 },
    weaponDagger:    { src: 'assets/sfx/weapon_dagger.mp3',    pool: 3, gap: 0, vol: 0.15 },
    weaponFury:      { src: 'assets/sfx/weapon_fury.mp3',      pool: 3, gap: 0, vol: 0.15 },
    weaponLightning: { src: 'assets/sfx/weapon_lightning.mp3', pool: 3, gap: 0, vol: 0.15 },

    // Incoming fire. A Reaver chain is up to eight hulls each firing once a
    // second, and a boss wave has every armed type on the field at once, so
    // this is the throttled one: 70ms lets a genuine salvo read as several
    // shots and collapses a chain firing in lockstep into one.
    //
    // Still above the player's own gun even after coming down from 0.35: it is
    // the only warning a shot the player has to dodge gives, and a volley they
    // cannot hear over their own trigger is a volley they find out about when
    // it lands.
    enemyFire: { pool: 3, gap: 70, vol: 0.245, src: [
      'assets/sfx/enemy_fire_var1.mp3',
      'assets/sfx/enemy_fire_var2.mp3',
      'assets/sfx/enemy_fire_var3.mp3',
      'assets/sfx/enemy_fire_var4.mp3',
    ] },

    // ---- Deaths ------------------------------------------------------------
    // The deepest pool in the table: a level-5 fan clears a whole rank in one
    // volley, and those kills landing as one sound would flatten the best
    // moment the gun has.
    enemyExplosion:  { src: 'assets/sfx/enemy%20explosion.mp3', pool: 4, gap: 55, vol: 0.55 },
    playerExplosion: { src: 'assets/sfx/player_explosion.mp3',  pool: 1, gap: 0,  vol: 1.00 },

    // ---- The three damage sources (CLAUDE.md §7), one sound each -----------
    // Loud, and deliberately the loudest things in the table after the wreck:
    // an armour layer is the only resource in the game.
    playerHit:         { src: 'assets/sfx/player_ship_hit.mp3',   pool: 2, gap: 80, vol: 0.90 },
    collisionAsteroid: { src: 'assets/sfx/collision_asteroid.mp3', pool: 2, gap: 80, vol: 0.90 },
    collisionEnemy: { pool: 2, gap: 80, vol: 0.90, src: [
      'assets/sfx/collision_var1.mp3',
      'assets/sfx/collision_var2.mp3',
      'assets/sfx/collision_var3.mp3',
    ] },

    // ---- Bonuses -----------------------------------------------------------
    bonusTaken: { pool: 2, gap: 40, vol: 0.80, src: [
      'assets/sfx/bonus_taken_var1.mp3',
      'assets/sfx/bonus_taken_var2.mp3',
      'assets/sfx/bonus_taken_var3.mp3',
    ] },
    shipChanged:   { src: 'assets/sfx/ship_changed.mp3',           pool: 1, gap: 0, vol: 0.80 },
    turboOn:       { src: 'assets/sfx/afterburners_activated.mp3', pool: 1, gap: 0, vol: 0.70 },
    turboOff:      { src: 'assets/sfx/afterburners_deactivated.mp3', pool: 1, gap: 0, vol: 0.70 },
    wingmenAppear: { src: 'assets/sfx/wingmen_appear.mp3',         pool: 1, gap: 0, vol: 0.80 },

    // ---- The armour counter crossing a layer boundary ----------------------
    levelUp:   { src: 'assets/sfx/weapon_new_level_reached.mp3', pool: 1, gap: 0, vol: 0.90 },
    levelDown: { src: 'assets/sfx/weapon_level_down.mp3',        pool: 1, gap: 0, vol: 0.90 },

    // ---- Boss waves. `large` is the doubled milestone, `small` the single. --
    bossSmall: { src: 'assets/sfx/boss_wave_start_small.mp3', pool: 1, gap: 0, vol: 0.90 },
    bossLarge: { src: 'assets/sfx/boss_wave_start_large.mp3', pool: 1, gap: 0, vol: 0.90 },
  },
};

// The slot after the hulls. A load-time read of SHIPS, which is legal because
// data.js is ahead of this file in index.html's load order — the same one
// exception SHOOTER_IDX in spawner.js takes.
const TITLE_TRACK = SHIPS.length;

// ---- Sfx pool helpers ------------------------------------------------------
// One event's voices for a single file. Separate elements rather than one
// element rewound, because rewinding cuts the copy that is already sounding —
// which is exactly wrong for the events that arrive in bursts. preload='auto'
// plus load() is what actually gets the bytes, the same pairing warm() uses.
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

// Which file of a *_var* set to play. Never the one that just played: the whole
// reason three collision sounds shipped is that two hits in a row must not be
// identical, and a plain uniform roll repeats one time in three.
function pickVariant(pool) {
  const n = pool.vars.length;
  if (n < 2) return 0;
  if (pool.last < 0) return Math.floor(Math.random() * n);
  // Roll across the n-1 that are not `last`, then step over it — uniform over
  // exactly the choices that are not a repeat, rather than a reroll loop.
  let v = Math.floor(Math.random() * (n - 1));
  if (v >= pool.last) v++;
  return v;
}

const Sound = {
  tracks: [],       // slot -> HTMLAudioElement, or null if it wouldn't build
  current: -1,      // slot owning playback, or -1 for silence. This is also the
                    // record of what SHOULD be sounding, which is what lets
                    // resume() finish a start the autoplay policy refused.
  fades: [],        // live volume tweens: { i, from, to, ms, start, stop }
  timer: null,      // the one interval driving every tween
  state: 'on',      // mirrors Game.soundState; see SOUND_CYCLE in constants.js
  // True between startMusic() and startTitle(). It no longer decides whether
  // anything plays — the title has its own track now — only whether a HULL
  // change means anything, which outside a run it does not.
  inRun: false,
  // Sfx event key -> { vars: [{ els, idx }], last, gap, vol, at }. `at` is the
  // performance.now() of the last play, which is what `gap` is measured from.
  pools: {},

  musicEnabled() { return this.state === 'on'; },
  // 'musicoff' keeps the feedback and drops only the music, which is the whole
  // reason the button is three-state rather than a boolean (constants.js).
  sfxEnabled() { return this.state !== 'off'; },

  // One element per slot, all built on first use. Cheap: nothing is fetched
  // until warm() asks for it, which matters because the four files together are
  // ~14MB and only the title's is wanted at page load.
  ensureTracks() {
    if (this.tracks.length || typeof Audio === 'undefined') return;
    const srcs = SHIPS.map((s) => s.bgm).concat(AUDIO.TITLE_SRC);
    this.tracks = srcs.map((src) => {
      if (!src) return null;
      try {
        const a = new Audio(src);
        a.loop = true;      // a track runs for as long as its screen or hull does
        a.preload = 'none';
        a.volume = AUDIO.VOLUME;
        return a;
      } catch (e) {
        return null;
      }
    });
  },

  // Begin buffering a slot, before anything needs to hear it — so a crossfade
  // has something to cross into rather than two seconds of nothing.
  warm(i) {
    const a = this.tracks[i];
    if (!a || a.preload !== 'none') return;   // already warmed
    a.preload = 'auto';
    // Raising preload should be enough on its own, but load() is what actually
    // starts every engine fetching. Safe only because the guard above means
    // this can never run on a track that is already playing, which load() would
    // rewind out from under itself.
    try { a.load(); } catch (e) { /* ignore */ }
  },

  // ---- Sound effects -------------------------------------------------------
  // Build every pool and start it buffering. Called once from Game.init().
  //
  // Eager, unlike the music, and the asymmetry is a size one: the whole sfx set
  // is about a megabyte against the four tracks' fourteen, and a click that has
  // to fetch its file on the first press arrives after the button it belongs
  // to. Nothing here plays, so the autoplay gate is not involved.
  initSfx() {
    if (typeof Audio === 'undefined') return;
    for (const key of Object.keys(AUDIO.SFX)) {
      const row = AUDIO.SFX[key];
      const srcs = Array.isArray(row.src) ? row.src : [row.src];
      this.pools[key] = {
        vars: srcs.map((src) => ({ els: makeSfxVoices(src, row.vol, row.pool), idx: 0 })),
        last: -1,
        gap: row.gap,
        // Far enough in the past that the first play of the run is never
        // throttled, whatever performance.now() happens to read at page load.
        at: -1e9,
      };
    }
  },

  // Fire a one-shot. An unknown key, a muted button, or a file that would not
  // build all yield silence rather than throwing — the same guarantee every
  // entry point in this file gives, and the reason call sites never test
  // anything before calling.
  play(key) {
    if (!this.sfxEnabled()) return;
    const pool = this.pools[key];
    if (!pool) return;

    // Throttled BEFORE a voice is chosen, so a burst being collapsed does not
    // also walk the round-robin — otherwise the copy that IS audible gets
    // rewound out from under itself by the ones being dropped.
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
      // Rejects while the page is still untouched, or if the file is missing.
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  },

  // Cut every sfx still sounding. Only the walk to 'off' calls this: the button
  // is an instruction rather than a transition, and a three-second afterburner
  // still running after the player asked for silence reads as it not having
  // worked. Music is paused rather than rewound because it has a position worth
  // keeping; a one-shot does not.
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
  // A run begins on `shipIdx`. Out of silence the track opens at once — a run
  // whose first seconds were a ramp would be missing them. Anything still
  // sounding is crossed into instead of being cut, which is the usual case now
  // that the title has music of its own, and also covers a retry from the
  // game-over card onto a hull the last run did not end on.
  startMusic(shipIdx) {
    this.inRun = true;
    this.switchTo(shipIdx, this.sounding() ? AUDIO.CROSSFADE_MS : 0);
    // Buffer the hulls this run could swap to, now that there is a run to swap
    // during. After the switch, so the track being heard gets the bandwidth
    // first and the ones that might never be needed queue behind it.
    for (let i = 0; i < SHIPS.length; i++) this.warm(i);
  },

  // The title screen is up: at page load, and again when a run hands back to
  // it. One entry point for both, because the rule that separates them is the
  // same one startMusic uses — out of silence it opens at once, and over a
  // running track it crosses.
  //
  // The one asymmetry is deliberate and is the spec's: leaving a RUN for the
  // title takes the long FADE_MS, where every other swap takes CROSSFADE_MS.
  // The run's music still fades out over three seconds exactly as it did when
  // the title was silent — the title's track simply rises through it now
  // instead of three seconds of nothing.
  startTitle() {
    this.inRun = false;
    this.switchTo(TITLE_TRACK, this.sounding() ? AUDIO.FADE_MS : 0);
  },

  // First-gesture hook. A page cannot play audio before the user has touched
  // it, so the title track asked for at load is very often refused; this is
  // what finishes that start. `current` is the record of what should be
  // sounding, so this needs to know nothing about which screen is up.
  //
  // Idempotent, and ordered to stay that way: game.js arms it AFTER its own
  // input handlers, so a first gesture that happens to be START has already
  // begun the run's music by the time this runs, and it finds nothing to do
  // rather than flickering the title track in behind it.
  resume() {
    if (this.current >= 0) this.playTrack(this.current);
  },

  // The hull changed mid-run (a ship bonus). Catching the hull already being
  // flown swaps nothing, and switchTo treats that as the no-op it is, so the
  // music does not restart under a pickup that changed nothing.
  setShip(shipIdx) {
    if (!this.inRun) return;
    this.switchTo(shipIdx, AUDIO.CROSSFADE_MS);
  },

  // The sound button moved. Cut rather than fade: the button is an instruction,
  // not a transition. Pausing rather than stopping keeps the position, so
  // 'musicoff' -> 'on' picks the track up where it was left.
  applyState(state) {
    this.state = state;
    if (!this.sfxEnabled()) this.hushSfx();
    if (!this.tracks.length) return;   // nothing built yet; nothing to align
    if (this.musicEnabled()) this.resume();
    else for (const a of this.tracks) if (a && !a.paused) a.pause();
  },

  // ---- Playback ------------------------------------------------------------
  // Whether a track is audibly running right now, which is what decides between
  // an instant start and a crossfade.
  sounding() {
    const a = this.current >= 0 ? this.tracks[this.current] : null;
    return !!a && !a.paused;
  },

  // Make `i` the track that owns playback, taking `ms` to get there. The
  // outgoing track leaves over the same window, so the two genuinely cross
  // rather than one following the other.
  switchTo(i, ms) {
    this.ensureTracks();
    this.warm(i);
    const prev = this.current;
    if (prev === i) {
      // Already ours. The only tween that can be running on it is a fade-out
      // (left for the title, then came straight back), so undo that.
      this.tween(i, AUDIO.VOLUME, ms, false);
      this.playTrack(i);
      return;
    }
    this.current = i;
    if (prev >= 0) this.tween(prev, 0, ms, true);

    const next = this.tracks[i];
    if (!next) return;
    // Open at zero so the incoming track rises through the outgoing one. Only
    // when it is starting cold: a track caught mid-fade-out resumes from
    // wherever its volume had fallen to, which is what makes a swap-and-swap-
    // back sound continuous.
    if (ms > 0 && next.paused) next.volume = 0;
    this.tween(i, AUDIO.VOLUME, ms, false);
    this.playTrack(i);
  },

  // Music only — `play` above is the sfx entry point, and the two must not be
  // confused: this one takes a SLOT and that one takes an event key.
  playTrack(i) {
    const a = this.tracks[i];
    if (!a || !this.musicEnabled() || !a.paused) return;
    const p = a.play();
    // Rejects when the browser withholds playback (autoplay policy) or the file
    // is missing. Either way the game carries on silently.
    if (p && p.catch) p.catch(() => {});
  },

  // Release a track: stop it, rewind it, and hand back a volume the next start
  // can use as-is.
  silence(i) {
    const a = this.tracks[i];
    if (a) {
      a.pause();
      // Seeking before metadata has arrived can throw; a fresh element is at 0.
      try { a.currentTime = 0; } catch (e) { /* ignore */ }
      a.volume = AUDIO.VOLUME;
    }
    if (this.current === i) this.current = -1;
  },

  // ---- Volume tweens -------------------------------------------------------
  // Ramp one track from where it is to `to` over `ms`; `stop` releases it at
  // the end. One tween per track at most — a new one replaces whatever was
  // running, which is how a swap-back cancels the fade-out it interrupts.
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

  // One interval for every live tween, started on demand and cleared when the
  // last one ends. Its own clock rather than the game loop, so a fade started
  // as the run ends does not depend on a run still updating — and a TIMER
  // rather than requestAnimationFrame, which is the only reason the choice is
  // worth a comment: rAF stops in a hidden tab, so tabbing away during the
  // fade-out would freeze it half-faded and leave the music playing under the
  // title screen with nothing left to finish it. A throttled timer gets coarse,
  // but it still arrives.
  //
  // Progress is read from the CLOCK rather than counted in ticks, so a throttled
  // or a dropped tick shortens the fade's step count and never its duration.
  runFades() {
    if (this.timer !== null) return;
    const step = () => {
      const now = performance.now();
      for (let n = this.fades.length - 1; n >= 0; n--) {
        const f = this.fades[n];
        const k = f.ms > 0 ? Math.min(1, (now - f.start) / f.ms) : 1;
        const a = this.tracks[f.i];
        // Equal-power, not linear: two linear ramps crossing at half volume sum
        // to about 3dB below either track alone, and that dip in the middle of
        // every swap is exactly what a crossfade is supposed to hide. Clamped
        // because the curve overshoots its endpoints, and a volume outside
        // 0..1 throws.
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
