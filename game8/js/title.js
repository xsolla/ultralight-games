// ============================================================================
// title.js — титульный экран: название, выбор сложности, окно лучших результатов. Лежит поверх всей
// рамки (#title), за ним крутится сцена. Логотип Xsolla и кнопки звука и полного экрана даёт chrome.js.
//
// Сложность (CONFIG.DIFFICULTY) это шанс совсем случайного хода противника. Кнопка сложности ждёт,
// пока поле и ход успокоятся (если игрок вышел посреди хода), и запускает партию (Game.start).
// Выход из партии (кнопка выхода, Game.stop) возвращает сюда.
// ============================================================================

const Title = {
  LEVEL_NAME: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  el: null, bestEl: null,
  starting: false,

  init() {
    Title.el = document.getElementById('title');
    Title.bestEl = document.getElementById('best');

    const dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR), gems = document.getElementById('title-gems');
    for (const type of CONFIG.UI.TITLE.GEMS) {
      if (!CONFIG.MATCH3.TILES[type]) continue;
      const g = Crystals.sprite(type, CONFIG.UI.TITLE.GEM_R, dpr);
      g.canvas.style.width = g.canvas.style.height = g.size + 'px';
      gems.appendChild(g.canvas);
    }

    const levels = document.getElementById('title-levels');
    for (const level of CONFIG.DIFFICULTY.ORDER) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `level level-${level}`;
      b.textContent = Title.LEVEL_NAME[level];
      b.addEventListener('click', () => Title.pick(level));
      levels.appendChild(b);
    }
    document.getElementById('title-rules').textContent =
      `Drag crystals across the board to steer your car. Win: leave every rival behind. ` +
      `Lose: your car is wrecked or a rival gets more than ${CONFIG.RULES.LOSE_LEAD} rows ahead.`;
    document.getElementById('title-best').addEventListener('click', Title.openBest);
    document.getElementById('best-back').addEventListener('click', Title.closeBest);
  },

  show() {
    Title.closeBest();
    Title.el.classList.add('show');
    Chrome.setScreen('title');
  },

  hide() {
    Title.el.classList.remove('show');
    Chrome.setScreen('game');
  },

  async pick(level) {
    if (Title.starting) return;
    Title.starting = true;
    while (Board.animating || Game.state.busy) await Tween.wait(CONFIG.UI.TITLE.WAIT);   // вышли посреди хода: доиграть его за экраном
    Title.hide();
    Game.start(level);
    Title.starting = false;
  },

  // ---- лучшие результаты ----
  openBest() { Title.renderBest(); Title.bestEl.classList.add('show'); },
  closeBest() { if (Title.bestEl) Title.bestEl.classList.remove('show'); },

  turns: n => `${n} ${n === 1 ? 'turn' : 'turns'}`,
  ordinal(n) {                                              // 1st, 2nd, 3rd, 4th, 11th, 21st
    const a = n % 100, b = n % 10;
    return n + (a >= 11 && a <= 13 ? 'th' : b === 1 ? 'st' : b === 2 ? 'nd' : b === 3 ? 'rd' : 'th');
  },

  renderBest() {
    const list = document.getElementById('best-list');
    list.textContent = '';
    for (const level of CONFIG.DIFFICULTY.ORDER) {
      const d = Results.data[level], sec = document.createElement('section');
      sec.className = `best-level level-${level}`;
      const head = document.createElement('div');
      head.className = 'best-head';
      const rate = d.played ? `${Math.round(d.wins / d.played * 100)}% wins` : 'no games yet';
      head.innerHTML = `<b>${Title.LEVEL_NAME[level]}</b><span>${rate}</span>`;
      sec.appendChild(head);
      if (!d.best.length) {
        const p = document.createElement('p'); p.className = 'best-empty'; p.textContent = 'no wins yet';
        sec.appendChild(p);
      } else {
        const ol = document.createElement('ol');
        for (const r of d.best) {
          const li = document.createElement('li');
          li.innerHTML = `<b>${Title.turns(r.turns)}</b><span>HP ${r.hp}/${r.maxHp}</span>` +
            `<span>${new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>`;
          ol.appendChild(li);
        }
        sec.appendChild(ol);
      }
      list.appendChild(sec);
    }
    document.getElementById('best-note').textContent = Results.persists
      ? 'Fewer turns make a better win. Results are saved in this browser.'
      : 'Browser storage is unavailable: results will be lost when you close the page.';
  },
};
