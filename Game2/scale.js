(function () {
  var NATIVE_W = 800, NATIVE_H = 600, MAX_SCALE = 1.5;
  var root = document.getElementById('game-root');
  function fit() {
    var s = Math.min(window.innerWidth / NATIVE_W,
                     window.innerHeight / NATIVE_H,
                     MAX_SCALE);
    root.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();
})();
