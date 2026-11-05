// ============================================================================
// music.js — фоновая музыка (CONFIG.MUSIC). У титульного экрана свой трек, в партии трек темы дороги
// (Theme.current), каждый играет по кругу. При смене экрана или темы старый трек затухает, новый нарастает
// (FADE); новый начинается сначала, если уже успел совсем затихнуть.
//
// Только обычные <audio> (new Audio), без fetch и Web Audio: так музыка работает и при запуске
// страницы как file://, где fetch запрещён, а Web Audio глушит "чужие" файлы.
//
// Звучит, только когда кнопка звука в состоянии "on" (chrome.js), вкладка видна и игрок уже нажал что-то
// на странице: до первого жеста браузеры звук не дают. Иначе всё на паузе и продолжится с того же места.
//
//   Music.init()       слушатели первого жеста и видимости вкладки
//   Music.update(dt)   каждый кадр (Main.frame, реальное время, не стоит на паузе игры): выбор трека и затухания
//   Music.sync()       запустить или остановить звук по состоянию (кнопка звука зовёт сама)
// ============================================================================

const Music = {
  tracks: {},        // имя файла -> { name, audio, k }: k это громкость затухания 0..1
  current: null,     // трек, который должен звучать
  unlocked: false,   // игрок уже нажимал на странице: браузер разрешает звук
  secret: false,     // пасхалка титульного экрана (Title.secret): вместо трека меню MUSIC.SECRET до конца сессии

  init() {
    const unlock = () => { Music.unlocked = true; Music.sync(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, true);
    document.addEventListener('visibilitychange', Music.sync);
  },

  // Трек по имени файла: элемент создаётся один раз и потом переиспользуется
  track(name) {
    if (!Music.tracks[name]) {
      const audio = new Audio();
      audio.loop = true; audio.preload = 'auto'; audio.volume = 0;
      audio.src = encodeURI(CONFIG.MUSIC.DIR + name);
      Music.tracks[name] = { name, audio, k: 0 };
    }
    return Music.tracks[name];
  },

  // В партии трек темы, на титульном экране (и пока партия не начата) трек меню или пасхалки
  wanted() {
    const M = CONFIG.MUSIC, inGame = Game.state.started && !(Title.el && Title.el.classList.contains('show'));
    return inGame && M.THEMES[Theme.current] || (Music.secret ? M.SECRET : M.MENU);
  },

  audible: () => Music.unlocked && Chrome.sound === 'on' && !document.hidden,

  update(dt) {
    const name = Music.wanted();
    if (!Music.current || Music.current.name !== name) {
      const t = Music.track(name);
      if (t.k === 0) t.audio.currentTime = 0;            // совсем затих: заново с начала
      Music.current = t;
      Music.sync();
    }
    const M = CONFIG.MUSIC, step = dt / M.FADE;
    for (const t of Object.values(Music.tracks)) {
      t.k = Util.clamp(t.k + (t === Music.current ? step : -step), 0, 1);
      t.audio.volume = M.VOLUME * t.k;
      if (t.k === 0 && t !== Music.current && !t.audio.paused) t.audio.pause();   // затих: больше не нужен
    }
  },

  // Играют текущий трек и те, что ещё затухают, если звук разрешён; иначе всё на паузе
  sync() {
    const on = Music.audible();
    for (const t of Object.values(Music.tracks)) {
      const play = on && (t === Music.current || t.k > 0);
      if (play && t.audio.paused) { const p = t.audio.play(); if (p && p.catch) p.catch(() => {}); }
      else if (!play && !t.audio.paused) t.audio.pause();
    }
  },
};
