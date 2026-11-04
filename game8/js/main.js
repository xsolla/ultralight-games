// ============================================================================
// main.js — точка входа: собирает всё, запускает главный цикл. Грузится последним.
//
// Порядок инициализации важен: сцена -> изгиб -> дорога -> обочина -> развилки -> машины, значки,
// эффекты -> камера -> ввод -> титульный экран (партия начинается с выбором сложности). Порядок обновления в кадре (Main.update) тоже:
// мир едет, затем всё, что от него зависит.
// ============================================================================

const Main = {
  simT: 0,           // игровое время (идёт только когда игра не на паузе)
  last: 0,
  fpsAcc: 0, fpsN: 0,
  paused: false,     // отладочная пауза: мир стоит, но кадр рисуется

  boot() {
    Hud.init();
    Results.init();
    Chrome.init();
    if (typeof THREE === 'undefined') {
      Hud.showError('Could not load three.js from the CDN. Check your internet connection and reload the page.');
      return;
    }
    Stage.init(document.getElementById('view'));
    Bend.init();
    Road.init();
    Roadside.init();
    Forks.init();
    Cars.init();
    Markers.init();
    Fx.init();
    Rig.init();
    Input.init();
    Board.init();
    BoardFx.init();
    Title.init();
    Help.init();
    Game.reset();                                      // сцена с машинами за титульным экраном; партия начнётся с выбором сложности
    Title.show();

    Main.last = performance.now();
    requestAnimationFrame(Main.frame);
    if (CONFIG.DEBUG.EXPOSE) window.__dbg = Main.debugApi();
  },

  frame(now) {
    requestAnimationFrame(Main.frame);
    const dt = Math.min(0.05, (now - Main.last) / 1000); Main.last = now;
    if (!Main.paused) Main.update(dt);
    Stage.render();
    Board.draw();
    BoardFx.draw();

    Main.fpsAcc += dt; Main.fpsN++;
    if (Main.fpsAcc > CONFIG.UI.FPS_WINDOW) {
      Hud.fps = Math.round(Main.fpsN / Main.fpsAcc); Main.fpsAcc = 0; Main.fpsN = 0;
      Hud.refresh();
    }
  },

  // Один шаг мира длиной dt секунд
  update(dt) {
    Main.simT += dt;
    const t = Main.simT;
    Tween.update(dt);                                  // анимации ходов
    Bend.odo += CONFIG.WORLD.SPEED * dt;               // мир едет на игрока
    Bend.rebuild();                                    // таблицы изгиба на этот кадр
    Road.update(dt);                                   // дорога
    Forks.update();                                    // развилки
    Roadside.update(dt);                               // обочина
    Game.update(dt, t);                                // машины
    Fx.update(dt);                                     // искры, тряска, толчок угла обзора
    Rig.update(dt, t, Game.targetX());                 // камера
    BoardFx.update(dt);                                // кометы и искры поля match-3
  },

  // Отладка из консоли браузера: window.__dbg. Страница в панели предпросмотра может остановить
  // requestAnimationFrame, поэтому есть ручной прогон кадров step(n).
  debugApi() {
    return {
      CONFIG, G: Game.state, tweens: Tween.list, act: Game.act, camera: Stage.camera, scene: Stage.scene, Board, BoardFx, Match3, Game, AI, Title, Results, Chrome, Help,
      oxAt: Bend.ox, psiAt: Bend.psi, forks: Forks.list, spawnFork: Forks.spawn,
      pause: v => { Main.paused = v; },
      setOdo: v => { Bend.odo = v; }, getOdo: () => Bend.odo,
      step: async (n, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) { Main.update(dt); await Promise.resolve(); }
        Stage.render(); Board.draw(); BoardFx.draw(); Hud.refresh();
      },
    };
  },
};

Main.boot();
