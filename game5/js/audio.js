// audio.js — Web Audio API sound/music generation

const GameAudio = (() => {
  let ctx = null;
  let musicNodes = {};
  let musicPlaying = false;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.25;
      musicGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playTone(freq, type, duration, gainVal, startDelay = 0, destination = null) {
    try {
      ensureCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration);
      osc.connect(g);
      g.connect(destination || sfxGain);
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

  // --- Ambient generative music ---
  // Simple arpeggio + drone

  let arpInterval = null;
  let droneOsc = null;
  let droneGain = null;
  let arpStep = 0;

  const SCALE = [130.81, 155.56, 174.61, 196.00, 220.00, 261.63, 311.13, 349.23];

  function startMusic() {
    if (musicPlaying) return;
    try {
      ensureCtx();
      musicPlaying = true;

      // Drone
      droneOsc = ctx.createOscillator();
      droneGain = ctx.createGain();
      droneOsc.type = 'sine';
      droneOsc.frequency.value = 65.41; // C2
      droneGain.gain.value = 0.18;
      droneOsc.connect(droneGain);
      droneGain.connect(musicGain);
      droneOsc.start();

      // Arpeggio via setInterval
      arpStep = 0;
      arpInterval = setInterval(() => {
        if (!musicPlaying) return;
        const freq = SCALE[arpStep % SCALE.length] * 2;
        playTone(freq, 'triangle', 0.18, 0.12, 0, musicGain);
        arpStep++;
      }, 280);

    } catch(e) {}
  }

  function stopMusic() {
    musicPlaying = false;
    try {
      if (droneOsc)   { droneOsc.stop(); droneOsc.disconnect(); droneOsc = null; }
      if (droneGain)  { droneGain.disconnect(); droneGain = null; }
      if (arpInterval) { clearInterval(arpInterval); arpInterval = null; }
    } catch(e) {}
  }

  function applyMode(mode) {
    // mode: 0=On, 1=MusicOff, 2=Off
    ensureCtx();
    if (mode === 0) {
      sfxGain.gain.value = 0.7;
      musicGain.gain.value = 0.25;
      if (!musicPlaying) startMusic();
    } else if (mode === 1) {
      sfxGain.gain.value = 0.7;
      musicGain.gain.value = 0;
      stopMusic();
    } else {
      sfxGain.gain.value = 0;
      musicGain.gain.value = 0;
      stopMusic();
    }
  }

  function stopGameMusic()  { stopMusic(); }

  return {
    sfxPass, sfxDeath, sfxPowerup, sfxNearMiss, sfxButtonClick,
    stopGameMusic, applyMode,
  };
})();
