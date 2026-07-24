// The Sound manager: preloaded HTMLAudio pools for sfx (round-robin played,
// so overlapping triggers of the same event never wait on a previous
// instance to finish or re-decode) + one looping music element swapped per
// active tileset. HTMLAudioElement throughout so it works identically under
// file:// and http:// (see CLAUDE.md Audio). No framework, no Web Audio API.
//
// Game.loop ticks Sound.update(dt) every frame regardless of screen, so a
// fade started on returning to the title screen always finishes even though
// nothing is being simulated there.

const Sound = {
  mode: 'on', // 'on' | 'music-off' | 'off' — cycled by the HUD audio button
  pools: {},
  poolIndex: {},
  music: null,
  musicKey: null, // tileset id currently loaded into `music`, or null
  fade: null, // { from, elapsed, duration } while fading music out

  init() {
    Object.keys(AUDIO.SFX).forEach((name) => {
      this.pools[name] = Array.from({ length: AUDIO.POOL_SIZE }, () => {
        const el = new Audio(AUDIO.SFX[name]);
        el.preload = 'auto';
        el.volume = AUDIO.SFX_VOLUME;
        el.load();
        return el;
      });
      this.poolIndex[name] = 0;
    });

    this.music = new Audio();
    this.music.loop = true;
    this.music.volume = 0;
  },

  // pitchStep (optional): bumps playbackRate slightly per cascade step so a
  // multi-step chain reads as escalating, not identical pops on repeat.
  play(name, pitchStep) {
    if (this.mode === 'off') return;
    const pool = this.pools[name];
    if (!pool) return;
    const el = pool[this.poolIndex[name]];
    this.poolIndex[name] = (this.poolIndex[name] + 1) % pool.length;
    el.currentTime = 0;
    el.playbackRate = pitchStep ? Math.min(1.8, 1 + pitchStep * 0.08) : 1;
    el.play().catch(() => {});
  },

  playMusicForTileset(tilesetId) {
    if (this.mode !== 'on') return;
    const src = AUDIO.MUSIC[tilesetId];
    if (!src) return;
    if (this.musicKey === tilesetId && !this.music.paused) {
      this.fade = null;
      this.music.volume = AUDIO.MUSIC_VOLUME;
      return;
    }
    this.fade = null;
    this.musicKey = tilesetId;
    this.music.src = src;
    this.music.currentTime = 0;
    this.music.volume = AUDIO.MUSIC_VOLUME;
    this.music.play().catch(() => {});
  },

  // fadeOut true: the "return to title screen" case — fades over
  // AUDIO.MUSIC_FADE_MS before stopping. false: an immediate cut (the HUD
  // audio button muting music).
  stopMusic(fadeOut) {
    if (!this.musicKey && this.music.paused) return;
    if (!fadeOut) {
      this.fade = null;
      this.music.pause();
      this.music.currentTime = 0;
      this.musicKey = null;
      return;
    }
    this.fade = { from: this.music.volume || AUDIO.MUSIC_VOLUME, elapsed: 0, duration: AUDIO.MUSIC_FADE_MS };
  },

  update(dt) {
    if (!this.fade) return;
    this.fade.elapsed += dt;
    const t = Math.min(1, this.fade.elapsed / this.fade.duration);
    this.music.volume = this.fade.from * (1 - t);
    if (t >= 1) {
      this.music.pause();
      this.music.currentTime = 0;
      this.musicKey = null;
      this.fade = null;
    }
  },

  // 'on' resumes/starts music for the given tileset (only meaningful while
  // in a HUD screen — Game passes null on the title screen); 'music-off'
  // and 'off' both cut music immediately.
  setMode(mode, tilesetId) {
    this.mode = mode;
    if (mode === 'on') {
      if (tilesetId) this.playMusicForTileset(tilesetId);
    } else {
      this.stopMusic(false);
    }
  },
};
