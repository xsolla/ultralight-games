// ============================================================================
// audio.js — Sound namespace: the run's background music.
// Owns the <audio> elements, which track belongs to which hull, and the volume
// tweens that move between them. It is a READER of state, never an owner:
// game.js says a run began, a hull changed, or the run handed back to the
// title, and the sound button's three-state value arrives through applyState.
// No game state, no drawing, no SFX yet — when those land they go here too,
// as the reference game's preloaded pools.
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
  VOLUME: 0.45,        // music level, 0..1 — under the game, not over it
  FADE_MS: 3000,       // ms to fade out when a run hands back to the title
  CROSSFADE_MS: 2000,  // ms for a mid-run hull swap: old track out, new one in
  TICK_MS: 40,         // ms between volume steps — 25/s is below hearing a stair
};

const Sound = {
  tracks: [],       // ship index -> HTMLAudioElement, or null if it wouldn't build
  current: -1,      // ship index owning playback, or -1 for silence
  fades: [],        // live volume tweens: { i, from, to, ms, start, stop }
  timer: null,      // the one interval driving every tween
  state: 'on',      // mirrors Game.soundState; see SOUND_CYCLE in constants.js
  // True only between startMusic() and fadeOutMusic(), which is what binds the
  // music to a RUN rather than to the sound setting: nothing can start a track
  // on the title screen, not even toggling the sound button there.
  inRun: false,

  musicEnabled() { return this.state === 'on'; },

  // One element per hull, built on the first run rather than at page load: the
  // three files together are ~10MB, and none of them is wanted until somebody
  // presses START. From then on all three are buffering, so the mid-run swap a
  // ship bonus causes has its track ready to cross into.
  ensureTracks() {
    if (this.tracks.length || typeof Audio === 'undefined') return;
    this.tracks = SHIPS.map((s) => {
      if (!s.bgm) return null;
      try {
        const a = new Audio(s.bgm);
        a.loop = true;      // a hull's track runs for as long as it is flown
        a.preload = 'auto';
        a.volume = AUDIO.VOLUME;
        return a;
      } catch (e) {
        return null;
      }
    });
  },

  // ---- Public entry points -------------------------------------------------
  // A run begins on `shipIdx`. Out of silence the track opens at once — the
  // fade in the spec is for LEAVING, and a run whose first seconds were a ramp
  // would be missing them. Anything still sounding is crossed into instead of
  // being cut: that is a retry from the game-over card, where the previous run
  // may have ended on a different hull and its music is still playing.
  startMusic(shipIdx) {
    this.inRun = true;
    this.switchTo(shipIdx, this.sounding() ? AUDIO.CROSSFADE_MS : 0);
  },

  // The hull changed mid-run (a ship bonus). Catching the hull already being
  // flown swaps nothing, and switchTo treats that as the no-op it is, so the
  // music does not restart under a pickup that changed nothing.
  setShip(shipIdx) {
    if (!this.inRun) return;
    this.switchTo(shipIdx, AUDIO.CROSSFADE_MS);
  },

  // The run handed back to the title screen.
  fadeOutMusic() {
    this.inRun = false;
    const i = this.current;
    if (i < 0) return;
    const a = this.tracks[i];
    // Already silent — the player has music turned off — so there is nothing
    // to fade and the track is simply released.
    if (!a || a.paused) { this.silence(i); return; }
    // `current` is deliberately left pointing at it until the fade finishes:
    // pressing START again mid-fade should catch this track on the way down
    // rather than find silence and open a second copy of it.
    this.tween(i, 0, AUDIO.FADE_MS, true);
  },

  // The sound button moved. Cut rather than fade: the button is an instruction,
  // not a transition. Pausing rather than stopping keeps the position, so
  // 'musicoff' -> 'on' picks the track up where it was left.
  applyState(state) {
    this.state = state;
    if (!this.tracks.length) return;   // no run yet; nothing to bring in line
    if (this.musicEnabled()) {
      if (this.inRun && this.current >= 0) this.play(this.current);
    } else {
      for (const a of this.tracks) if (a && !a.paused) a.pause();
    }
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
