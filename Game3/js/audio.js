// ============================================================================
// audio.js — sound effects (preloaded HTMLAudio pools, cached in memory) plus
// background music (streamed HTMLAudioElement).
//
// Every clip uses HTMLAudioElement so audio behaves identically under file://
// and http:// (the Web Audio fetch+decode route is blocked by CORS on file://).
// SFX are preloaded into a small per-sound pool and replayed by rewinding a
// cached element — never re-read from disc. Music streams and loops, plays only
// during a game, and fades out over MUSIC_FADE_MS when the player returns to
// the title screen.
//
// The 3-state sound button (Game.soundState) maps to:
//   'on'       — sfx + music
//   'musicoff' — sfx only (music muted)
//   'off'      — silent
//
// All entry points are guarded so a missing/blocked audio file simply yields
// no sound rather than breaking the game.
// ============================================================================

const AUDIO = {
  MUSIC_SRC: 'assets/bgm/hexx-bgm.mp3',
  MUSIC_VOLUME: 0.4,     // background music level (0..1)
  SFX_VOLUME: 0.85,      // master sfx level (0..1)
  MUSIC_FADE_MS: 3000,   // fade-out duration when leaving a game

  // Self-explanatory sfx file names -> logical event keys used in game.js.
  SFX: {
    ui_click: 'assets/sfx/ui_click.mp3',
    click_on_bubble: 'assets/sfx/click_on_bubble.mp3',
    click_on_crystal: 'assets/sfx/click_on_crystal.mp3',
    token_clone: 'assets/sfx/token_clone.mp3',
    token_jump: 'assets/sfx/token_jump.mp3',
    convert_to_bubbles: 'assets/sfx/convert_to_bubbles.mp3',
    convert_to_crystal: 'assets/sfx/convert_to_crystal.mp3',
    coin_flip_start: 'assets/sfx/coin_flip_start.mp3',
    coin_flip_result: 'assets/sfx/coin_flip_result.mp3',
  },
};

const Sound = {
  pools: {},           // event key -> { els: [HTMLAudioElement,...], idx }
  music: null,         // streamed HTMLAudioElement (looping)
  state: 'on',         // mirrors Game.soundState
  inGame: false,       // true between startMusic() and stopMusic()
  fadeRAF: null,       // active fade animation-frame handle

  // How many HTMLAudioElements to keep per sfx. A small pool lets the same
  // sound overlap (e.g. rapid clicks / a burst of conversions) without cutting
  // itself off; playback round-robins through the pool.
  POOL_SIZE: 4,

  // Preload every sound into memory and prepare the looping music element.
  // Called once from Game.init(). Uses HTMLAudioElement for BOTH sfx and music
  // so it works identically under file:// and http:// — the Web Audio route
  // (fetch + decodeAudioData) is blocked by CORS on file://, which silently
  // killed all sfx while HTMLAudio-based music kept playing.
  init() {
    for (const name of Object.keys(AUDIO.SFX)) {
      const els = [];
      for (let i = 0; i < this.POOL_SIZE; i++) {
        const a = new Audio(AUDIO.SFX[name]);
        a.preload = 'auto';   // buffer the clip into memory up front
        a.volume = AUDIO.SFX_VOLUME;
        try { a.load(); } catch (e) { /* ignore */ }
        els.push(a);
      }
      this.pools[name] = { els, idx: 0 };
    }

    try {
      this.music = new Audio(AUDIO.MUSIC_SRC);
      this.music.loop = true;
      this.music.preload = 'auto';
      this.music.volume = AUDIO.MUSIC_VOLUME;
    } catch (e) {
      this.music = null;
    }
  },

  // First-gesture hook. HTMLAudio only needs a user gesture for its first
  // playback, and every sfx/music play() is already triggered from a pointer
  // handler, so there's nothing to unlock here — kept as a stable entry point.
  resume() {},

  sfxEnabled() { return this.state !== 'off'; },
  musicEnabled() { return this.state === 'on'; },

  // Fire a one-shot sfx from its in-memory pool. `volume` is an optional 0..1
  // scale on top of the master sfx level. Replaying rewinds the cached element
  // rather than re-reading the file from disc.
  play(name, volume) {
    if (!this.sfxEnabled()) return;
    const pool = this.pools[name];
    if (!pool) return;
    const a = pool.els[pool.idx];
    pool.idx = (pool.idx + 1) % pool.els.length;
    try {
      a.volume = volume != null ? AUDIO.SFX_VOLUME * volume : AUDIO.SFX_VOLUME;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  },

  // Begin (or restart) background music for a game. No-op audio if music is
  // currently disabled, but we still record that a game is in progress so
  // toggling music back on resumes it.
  startMusic() {
    this.inGame = true;
    this.cancelFade();
    if (!this.music) return;
    this.music.volume = AUDIO.MUSIC_VOLUME;
    if (this.musicEnabled()) {
      try { this.music.currentTime = 0; } catch (e) { /* ignore */ }
      this.music.play().catch(() => {});
    }
  },

  // Leaving the game: fade the music out over MUSIC_FADE_MS, then stop it.
  stopMusic() {
    this.inGame = false;
    this.fade(AUDIO.MUSIC_FADE_MS, true);
  },

  // React to the sound button changing state.
  applyState(state) {
    this.state = state;
    if (!this.music) return;
    this.cancelFade();
    if (this.musicEnabled() && this.inGame) {
      this.music.volume = AUDIO.MUSIC_VOLUME;
      this.music.play().catch(() => {});
    } else {
      // Music not allowed right now — pause immediately (no fade).
      this.music.pause();
    }
  },

  // Linearly ramp music volume to 0 over `ms`; optionally pause + rewind at the
  // end. Driven by its own rAF so it's independent of the game loop.
  fade(ms, stopAtEnd) {
    if (!this.music || this.music.paused) return;
    this.cancelFade();
    const m = this.music;
    const startVol = m.volume;
    const start = performance.now();
    const step = (now) => {
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      m.volume = startVol * (1 - t);
      if (t < 1) {
        this.fadeRAF = requestAnimationFrame(step);
      } else {
        this.fadeRAF = null;
        if (stopAtEnd) {
          m.pause();
          try { m.currentTime = 0; } catch (e) { /* ignore */ }
        }
        m.volume = AUDIO.MUSIC_VOLUME; // restore for next play
      }
    };
    this.fadeRAF = requestAnimationFrame(step);
  },

  cancelFade() {
    if (this.fadeRAF) { cancelAnimationFrame(this.fadeRAF); this.fadeRAF = null; }
  },
};
