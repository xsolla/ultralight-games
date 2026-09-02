// audio.js — Web Audio API sound/music generation

const GameAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(masterGain);

    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playTone(freq, type, duration, gainVal, startDelay = 0) {
    try {
      ensureCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    } catch(e) {}
  }

  function sfxPass() {
    playTone(880, 'sine', 0.12, 0.4);
    playTone(1200, 'sine', 0.08, 0.25, 0.06);
  }

  function sfxDeath() {
    playTone(220, 'sawtooth', 0.35, 0.6);
    playTone(110, 'sawtooth', 0.55, 0.5, 0.1);
    playTone(55,  'sine',     0.7,  0.4, 0.25);
  }

  function sfxPowerup(type) {
    if (type === 'shield') {
      playTone(660, 'sine', 0.1, 0.4);
      playTone(880, 'sine', 0.1, 0.35, 0.1);
      playTone(1100,'sine', 0.15,0.3, 0.2);
    } else if (type === 'slow') {
      playTone(440, 'sine', 0.2, 0.4);
      playTone(330, 'sine', 0.2, 0.3, 0.12);
    } else if (type === 'mult') {
      playTone(880,  'square', 0.07, 0.25);
      playTone(1100, 'square', 0.07, 0.2, 0.07);
      playTone(1320, 'square', 0.07, 0.15, 0.14);
      playTone(1760, 'sine',   0.12, 0.3, 0.21);
    } else if (type === 'bonus') {
      playTone(740,  'sine', 0.09, 0.35);
      playTone(1110, 'sine', 0.12, 0.3, 0.08);
      playTone(1480, 'sine', 0.16, 0.25, 0.16);
    } else if (type === 'purple') {
      playTone(520,  'triangle', 0.08, 0.4);
      playTone(780,  'triangle', 0.08, 0.35, 0.06);
      playTone(1040, 'sawtooth', 0.1, 0.3, 0.12);
      playTone(1560, 'sine',     0.15, 0.35, 0.2);
    }
  }

  function sfxNearMiss() {
    playTone(180, 'sine', 0.1, 0.3);
  }

  function sfxButtonClick() {
    playTone(660, 'sine', 0.06, 0.3);
  }

  // --- Background music ---
  //
  // Two streamed tracks. A run picks one at random; when it ends the run keeps
  // going on the other one, alternating for as long as the player survives.
  // Returning to the title screen fades out over BGM_FADE_SEC.
  //
  // Playback is bound to a run, not to the sound setting: `inRun` is true only
  // between startBgm() and fadeOutBgm(), so nothing can start music on the title
  // screen — not even toggling the sound button there.

  let tracks = [];
  let current = -1;        // index of the track that owns playback, or -1 for none
  let inRun = false;
  let fading = false;
  let fadeTimer = null;
  let soundMode = 0;       // mirrors HUD's mode; 0=On, 1=MusicOff, 2=Off

  function ensureTracks() {
    if (tracks.length || typeof Audio === 'undefined') return;
    try {
      tracks = C.BGM_TRACKS.map(src => {
        const a = new Audio(src);
        a.preload = 'auto';
        a.loop = false;          // 'ended' drives the switch to the other track
        a.volume = C.BGM_VOLUME;
        a.addEventListener('ended', () => {
          // Ignore a stale element's event: only the owning track advances, and
          // only while a run is actually in progress.
          if (!inRun || current < 0 || tracks[current] !== a) return;
          current = otherIndex(current);
          rewind(tracks[current]);
          syncPlayback();
        });
        return a;
      });
    } catch (e) { tracks = []; }
  }

  // "Another one" — a different track than `i`. Written for any count, not just two.
  function otherIndex(i) {
    if (tracks.length < 2) return 0;
    let n;
    do { n = Math.floor(Math.random() * tracks.length); } while (n === i);
    return n;
  }

  // Seeking before metadata has arrived can throw; a fresh element is at 0 anyway.
  function rewind(a) { try { a.currentTime = 0; } catch (e) {} }

  function cancelFade() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    fading = false;
  }

  function releaseTrack() {
    if (current >= 0 && tracks[current]) {
      const a = tracks[current];
      a.pause();
      rewind(a);
      a.volume = C.BGM_VOLUME;
    }
    current = -1;
  }

  // Brings the owning track in line with `inRun` and the sound mode. Pausing
  // rather than muting keeps the position, so MusicOff -> On resumes where it was.
  function syncPlayback() {
    if (current < 0 || !tracks[current]) return;
    const a = tracks[current];
    if (inRun && soundMode === 0) {
      if (!fading) a.volume = C.BGM_VOLUME;
      if (a.paused) {
        const p = a.play();
        // Rejects if the browser withholds playback (autoplay policy) or the file
        // is missing. Either way the game carries on silently.
        if (p && p.catch) p.catch(() => {});
      }
    } else if (!a.paused) {
      a.pause();
    }
  }

  // Called when a run begins. Picks a fresh random track, except when a run is
  // already sounding — restarting from the game-over panel keeps its music rather
  // than cutting to a new track mid-phrase.
  function startBgm() {
    ensureTracks();
    inRun = true;
    if (!tracks.length) return;

    const sounding = current >= 0 && !fading && !tracks[current].paused;
    if (!sounding) {
      cancelFade();
      if (current >= 0) releaseTrack();
      current = Math.floor(Math.random() * tracks.length);
      rewind(tracks[current]);
    }
    syncPlayback();
  }

  // Called when the player lands on the title screen.
  function fadeOutBgm(seconds) {
    inRun = false;
    if (current < 0 || !tracks[current]) { cancelFade(); return; }

    const a = tracks[current];
    if (a.paused) { cancelFade(); releaseTrack(); return; }   // music was already off

    cancelFade();
    fading = true;
    const from = a.volume || C.BGM_VOLUME;
    const dur = Math.max(1, (seconds || C.BGM_FADE_SEC) * 1000);
    const t0 = Date.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      a.volume = Math.max(0, from * (1 - k));
      if (k >= 1) { cancelFade(); releaseTrack(); }
    }, C.BGM_FADE_TICK_MS);
  }

  function applyMode(mode) {
    soundMode = mode;
    // mode: 0=On, 1=MusicOff, 2=Off
    try {
      ensureCtx();
      sfxGain.gain.value = (mode === 2) ? 0 : 0.7;
    } catch (e) {}
    ensureTracks();
    syncPlayback();
  }

  // Diagnostic view of the music state, for tests.
  function bgmState() {
    const a = current >= 0 ? tracks[current] : null;
    return {
      inRun, fading, current,
      volume: a ? a.volume : 0,
      paused: !a || a.paused,
      src: a ? a.src : null,
      count: tracks.length,
    };
  }

  return {
    sfxPass, sfxDeath, sfxPowerup, sfxNearMiss, sfxButtonClick,
    startBgm, fadeOutBgm, applyMode, bgmState,
  };
})();
