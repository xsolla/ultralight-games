// ============================================================================
// audio.js — Sound namespace: the game's background music.
// Owns the <audio> elements, which track belongs where, and the volume tweens
// that move between them. It is a READER of state, never an owner: game.js
// says a run began, a hull changed, or the title screen is up, and the sound
// button's three-state value arrives through applyState. No game state, no
// drawing, no SFX yet — when those land they go here too, as the reference
// game's preloaded pools.
//
// A TRACK IS A SLOT, and the title screen's is the last one. The hulls take
// slots 0..SHIPS.length-1 and the title takes TITLE_TRACK after them, so
// switchTo() never learns which kind it is holding and the title screen gets
// the crossfade, the fade and the sound button for free.
//
// HTMLAudioElement rather than Web Audio, for the reason CLAUDE.md §2 gives:
// the fetch+decode route is blocked by CORS on file://, and this game must run
// from a double-clicked index.html. The cost is iOS Safari, which ignores the
// `volume` property — every fade there degrades to a cut, and nothing else
// changes.
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
};

// The slot after the hulls. A load-time read of SHIPS, which is legal because
// data.js is ahead of this file in index.html's load order — the same one
// exception SHOOTER_IDX in spawner.js takes.
const TITLE_TRACK = SHIPS.length;

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

  musicEnabled() { return this.state === 'on'; },

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
    if (this.current >= 0) this.play(this.current);
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
      this.play(i);
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
    this.play(i);
  },

  play(i) {
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
