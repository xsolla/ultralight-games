// ============================================================================
// chrome.js — общие для игр портала элементы: логотип Xsolla (титульный экран, а на canvas, drawLogo, щиты на
// ветках развилок) и колонка кнопок
// справа сверху: звук, выход, полный экран. Значения скопированы из ../branding.md и ../buttons.md
// (это не импорт: игры деплоятся отдельно, копия держится одинаковой по этим файлам).
//
// Разметка SVG вставляется из JS, в index.html нет <svg> (валидатор мини-приложений считает <svg> рядом
// со <script> за XSS).
//
//   Звук: три состояния on -> musicoff -> off -> on (музыка и эффекты / только эффекты / тишина). Одно на
//         титульный экран и HUD, запоминается в localStorage (CONFIG.SOUND_KEY). Музыка (music.js) звучит
//         только в "on"; звуковых эффектов в игре пока нет.
//   Выход: только в HUD, возвращает на титульный экран (Game.stop). На титуле скрыт, полный экран встаёт
//          на его место (колонка flex, щель закрывается сама).
//   Полный экран: переключает <html>, состояние читается из document.fullscreenElement, так что Esc и
//          F11 тоже обновляют значок. Размеры пересчитывают ResizeObserver сцены и поля.
//   Помощь "?": только в HUD, четвёртая снизу (своя для этой игры, в ../buttons.md её нет): окно "How to play" (help.js).
// Кнопки лежат выше окна конца партии и титульного экрана (z-index), поэтому работают и там.
// ============================================================================

const Chrome = {
  LOGO_FILL: '#80EAFF',
  LOGO_PATHS: [
    // 1 (O) и 5 (A) с дырками, все пять рисуются evenodd
    'M73.6664 4.53827C84.0077 4.53827 92.1272 12.6598 92.1272 22.9991C92.1272 33.3383 84.0077 41.4599 73.6664 41.4599C63.3271 41.4599 55.2078 33.3383 55.2078 22.9991C55.2078 12.6598 63.3272 4.53829 73.6664 4.53827ZM73.6664 11.6001C67.4629 11.6001 62.7728 16.4937 62.7728 22.9991C62.7728 29.5065 67.4629 34.398 73.6664 34.398C79.872 34.398 84.5622 29.5065 84.5622 22.9991C84.5622 16.4937 79.872 11.6001 73.6664 11.6001Z',
    'M18.0542 16.6417L26.3277 5.34541H35.0034L22.2521 22.2765L36.0119 40.6531H26.884L17.7546 28.3332L8.725 40.6531H0.00012207L13.5575 22.6895L0.605567 5.34541H9.68396L18.0542 16.6417Z',
    'M42.9917 15.4836L49.9509 24.2107C51.4643 26.1266 52.1706 27.9419 52.1706 29.9091C52.1706 31.8763 51.4643 33.6917 49.9509 35.6097L45.9669 40.6531H36.9893L45.1088 30.2622L38.1987 21.5865C36.7367 19.7712 36.0304 18.005 36.0304 16.1404C36.0304 14.2225 36.7367 12.4584 38.1987 10.6925L42.7391 5.34541H51.5156L42.9917 15.4836Z',
    'M118.379 40.6531H109.502L90.5358 5.34541H99.4151L118.379 40.6531Z',
    'M116.976 5.34541L131.944 33.2089L146.393 5.34541H151.688L169.997 40.6531H127.065L108.101 5.34541H116.976ZM139.348 34.0962H158.385L148.875 15.1397L139.348 34.0962Z',
  ],

  // Значки: viewBox 30 на 30 при 30px, единица = пиксель (../buttons.md §3)
  ICONS: {
    on: '<path d="M8.2 13 H11 L14.6 10.2 V19.8 L11 17 H8.2 Z" fill="currentColor"/>' +
        '<path d="M17.965 12.165 A4.4 4.4 0 0 1 17.965 17.835" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M20.413 10.104 A7.6 7.6 0 0 1 20.413 19.896" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    off: '<path d="M8.2 13 H11 L14.6 10.2 V19.8 L11 17 H8.2 Z" fill="currentColor"/>' +
         '<path d="M16.6 11 L22.2 19 M22.2 11 L16.6 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    musicoff: '<ellipse cx="11.56" cy="19" rx="2.4" ry="1.76" transform="rotate(-22.918 11.56 19)" fill="currentColor"/>' +
              '<path d="M13.8 19 L13.8 10.2 L17.8 11.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<path d="M7.8 22.2 L22.2 7.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    exit: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
          '<path d="M19.282 10.244 A6.4 6.4 0 1 1 10.718 10.244"/><path d="M15 6.6 L15 14.6"/></g>',
    fsEnter: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
             '<path d="M11.96 8.6 H8.6 V11.96"/><path d="M18.04 8.6 H21.4 V11.96"/><path d="M18.04 21.4 H21.4 V18.04"/><path d="M11.96 21.4 H8.6 V18.04"/></g>',
    help: '<path d="M11.6 11.8 A3.4 3.4 0 1 1 16.6 14.8 C15.5 15.4 15 16.1 15 17.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="15" cy="21" r="1.15" fill="currentColor"/>',
    fsExit: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M8.6 11.96 H11.96 V8.6"/><path d="M21.4 11.96 H18.04 V8.6"/><path d="M21.4 18.04 H18.04 V21.4"/><path d="M8.6 18.04 H11.96 V21.4"/></g>',
  },
  SOUND_NEXT: { on: 'musicoff', musicoff: 'off', off: 'on' },
  SOUND_LABEL: { on: 'Sound: music and effects', musicoff: 'Sound: effects only', off: 'Sound off' },

  LOGO_W: 169.997,   // ширина рисунка в единицах исходника
  LOGO_Y0: 4.53857,  // верхний край рисунка в единицах исходника
  logoCache: null,   // Path2D логотипа, строятся один раз

  sound: 'on',
  btn: {},           // sound, exit, fullscreen, help

  // Логотип на canvas (../branding.md, "Canvas implementation"): (x, y) левый верх видимого рисунка, w ширина.
  // Нужен щитам на ветках развилок (forks.js).
  drawLogo(g, x, y, w) {
    if (!Chrome.logoCache) Chrome.logoCache = Chrome.LOGO_PATHS.map(d => new Path2D(d));
    const s = w / Chrome.LOGO_W;
    g.save();
    g.translate(x, y - Chrome.LOGO_Y0 * s);
    g.scale(s, s);
    g.fillStyle = Chrome.LOGO_FILL;
    for (const p of Chrome.logoCache) g.fill(p, 'evenodd');
    g.restore();
  },
  logoHeight: w => w * 36.9211 / Chrome.LOGO_W,    // высота видимого рисунка при ширине w

  init() {
    try { const s = localStorage.getItem(CONFIG.SOUND_KEY); if (Chrome.SOUND_NEXT[s]) Chrome.sound = s; } catch (e) { /* без хранилища: по умолчанию */ }

    const logo = document.getElementById('title-logo');
    if (logo) logo.innerHTML = `<svg viewBox="0 4.53857 169.997 36.9211" fill="none" aria-label="Xsolla" role="img">` +
      Chrome.LOGO_PATHS.map(d => `<path fill-rule="evenodd" clip-rule="evenodd" d="${d}" fill="${Chrome.LOGO_FILL}"/>`).join('') + '</svg>';

    const col = document.getElementById('chrome');
    for (const [name, action] of [['sound', Chrome.cycleSound], ['exit', () => Game.stop()], ['fullscreen', Chrome.toggleFullscreen], ['help', () => Help.toggle()]]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chrome-btn';
      b.addEventListener('click', e => { action(); b.blur(); e.stopPropagation(); });
      col.appendChild(b);
      Chrome.btn[name] = b;
    }
    Chrome.btn.exit.innerHTML = Chrome.svg(Chrome.ICONS.exit);    // значок выхода не меняется: рисуется один раз
    Chrome.label(Chrome.btn.exit, 'Exit to menu');
    Chrome.btn.help.innerHTML = Chrome.svg(Chrome.ICONS.help);
    Chrome.label(Chrome.btn.help, 'How to play');
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, Chrome.drawFullscreen);
    Chrome.drawSound(); Chrome.drawFullscreen();
  },

  label(b, text) { b.title = text; b.setAttribute('aria-label', text); },
  svg: inner => `<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">${inner}</svg>`,

  // Выход виден только в игре (на титульном экране выходить некуда)
  // В игре колонка над светлым небом сцены, ей нужна тёмная подложка (css: #chrome.on-scene)
  setScreen(screen) {
    Chrome.btn.exit.hidden = Chrome.btn.help.hidden = screen !== 'game';
    document.getElementById('chrome').classList.toggle('on-scene', screen === 'game');
  },

  cycleSound() {
    Chrome.sound = Chrome.SOUND_NEXT[Chrome.sound];
    try { localStorage.setItem(CONFIG.SOUND_KEY, Chrome.sound); } catch (e) { /* не запомнится, но работает */ }
    Chrome.drawSound();
    Music.sync();                                        // музыка звучит только в "on"
  },

  drawSound() {
    const b = Chrome.btn.sound;
    b.innerHTML = Chrome.svg(Chrome.ICONS[Chrome.sound]);
    b.classList.toggle('bright', Chrome.sound === 'on');         // яркий значок только у "on"
    Chrome.label(b, Chrome.SOUND_LABEL[Chrome.sound]);
  },

  isFullscreen: () => !!(document.fullscreenElement || document.webkitFullscreenElement),

  toggleFullscreen() {
    if (Chrome.isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }   // в iframe без allow="fullscreen" молча не сработает
  },

  drawFullscreen() {
    const b = Chrome.btn.fullscreen, on = Chrome.isFullscreen();
    b.innerHTML = Chrome.svg(on ? Chrome.ICONS.fsExit : Chrome.ICONS.fsEnter);
    Chrome.label(b, on ? 'Exit fullscreen' : 'Fullscreen');
  },
};
