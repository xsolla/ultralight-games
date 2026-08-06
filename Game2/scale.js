(function () {
  var NATIVE_W = 800, NATIVE_H = 600, MAX_SCALE = 1.5;
  var root = document.getElementById('game-root');

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function fit() {
    // Windowed play caps the size so the game doesn't sprawl on a large monitor.
    // Fullscreen is an explicit request to fill the display, so the cap is lifted
    // there; the min() over both axes keeps 4:3 and letterboxes on wider screens.
    var cap = isFullscreen() ? Infinity : MAX_SCALE;
    var s = Math.min(window.innerWidth / NATIVE_W,
                     window.innerHeight / NATIVE_H,
                     cap);
    root.style.transform = 'scale(' + s + ')';
  }

  window.addEventListener('resize', fit);
  // This file is loaded before game.js, so these handlers run first and the new
  // transform is already applied when game.js re-measures the canvas.
  document.addEventListener('fullscreenchange', fit);
  document.addEventListener('webkitfullscreenchange', fit);
  fit();
})();
