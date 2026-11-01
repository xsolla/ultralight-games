// ============================================================================
// hud.js — DOM-интерфейс вокруг 3D-сцены. Экран 9:16 заключён в рамку (css/styles.css) и разделён на
// три части: сверху сцена со строкой состояния, посередине разделитель с HP игрока, снизу бокс с полем
// match-3 (его рисует board.js).
//
// HP игрока это полоса в разделителе: цвет плавно идёт от зелёного к красному, а на 20% HP и ниже
// полоса красная и мигает (CONFIG.UI.HP_BAR).
//
// Когда за один свап (с каскадом) схлопнулось несколько цветов, вместо HP в разделителе показывается
// счётчик кружков по цветам (tallyShow). В конце цепочки он подсвечивает двух победителей (tallyPick),
// при случайном выборе показывает бегущую подсветку, и HP возвращается на место (tallyHide).
// ============================================================================

const Hud = {
  fps: 0,
  el: null,          // строка состояния поверх сцены
  errEl: null,
  divider: null, hpFill: null, hpText: null,
  tallyItems: [],    // по одному элементу на цвет кружка

  init() {
    Hud.el = document.getElementById('hud');
    Hud.errEl = document.getElementById('err');
    Hud.divider = document.getElementById('divider');
    Hud.hpFill = document.getElementById('hp-fill');
    Hud.hpText = document.getElementById('hp-text');
    if (Hud.divider) Hud.divider.style.setProperty('--hp-blink', CONFIG.UI.HP_BAR.BLINK_PERIOD + 's');

    const tally = document.getElementById('tally');
    if (tally) Hud.tallyItems = CONFIG.MATCH3.TILES.map(t => {
      const el = document.createElement('div');
      el.className = 'tally-item';
      el.innerHTML = `<i style="background:${t.color}"></i><b>0</b>`;
      tally.appendChild(el);
      return el;
    });
  },

  // ---- Счётчик цветов (вместо HP, пока в цепочке больше одного цвета) ----
  // counts[i] это сколько кружков цвета i схлопнулось за цепочку.
  tallyShow(counts) {
    if (!Hud.divider) return;
    Hud.divider.classList.add('tally-mode');
    const max = Math.max(...counts);
    Hud.tallyItems.forEach((el, i) => {
      el.querySelector('b').textContent = counts[i];
      el.classList.toggle('has', counts[i] > 0);
      el.classList.toggle('lead', counts[i] > 0 && counts[i] === max);
      el.classList.remove('pick', 'win');
    });
  },

  tallyHide() {
    if (!Hud.divider) return;
    Hud.divider.classList.remove('tally-mode');
    for (const el of Hud.tallyItems) el.classList.remove('lead', 'pick', 'win');
  },

  // Итог: срабатывают winners (один или два цвета). Если выбор был случайным (candidates), подсветка
  // бегает по кандидатам и замедляется на landing. Потом победители подсвечиваются на паузу.
  // Всё идёт через Tween.
  async tallyPick(candidates, winners, landing) {
    const T = CONFIG.MATCH3.TALLY, items = Hud.tallyItems;
    if (candidates && candidates.length > 1) {
      const w = candidates.indexOf(landing), n = candidates.length, steps = T.PICK_STEPS;
      const start = (((w - steps) % n) + n) % n;                 // чтобы на последнем шаге подсветка встала на landing
      let last = -1;
      await Tween.run(T.PICK_TIME, k => {
        const s = Math.min(steps, Math.floor(k * (steps + 1)));
        if (s === last) return;
        last = s;
        items.forEach((el, i) => el.classList.toggle('pick', i === candidates[(start + s) % n]));
      }, Util.easeOut);
    }
    items.forEach((el, i) => { el.classList.remove('pick', 'lead'); el.classList.toggle('win', winners.includes(i)); });
    await Tween.wait(T.HOLD);
  },

  // Полоса HP игрока. Зовётся сразу при изменении HP, а не раз в ход, чтобы удар был виден мгновенно.
  updateHp() {
    const p = Game.player(), B = CONFIG.UI.HP_BAR;
    if (!Hud.hpFill || !p) return;
    const frac = Util.clamp(p.hp / p.maxHp, 0, 1);
    const low = frac <= B.LOW_AT;
    // оттенок: HUE_FULL при полном HP, HUE_LOW при LOW_AT и ниже
    const hue = B.HUE_LOW + (B.HUE_FULL - B.HUE_LOW) * Util.clamp((frac - B.LOW_AT) / (1 - B.LOW_AT), 0, 1);
    Hud.hpFill.style.width = (frac * 100) + '%';
    Hud.hpFill.style.backgroundColor = `hsl(${hue.toFixed(0)} ${B.SATURATION}% ${B.LIGHTNESS}%)`;
    Hud.hpText.textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
    Hud.divider.classList.toggle('hp-low', low && p.hp > 0);
  },

  // Перерисовать строку состояния. Зовётся после каждого хода, смены намерений и раз в окно fps.
  refresh() {
    const S = Game.state, p = Game.player();
    if (!p) return;
    Hud.updateHp();
    if (!Hud.el) return;
    const alive = S.cars.filter(c => c.alive && !c.isPlayer).length;
    Hud.el.textContent =
      `Ход ${S.turn}   ряд ${S.playerRow}/${CONFIG.TRACK.ROWS - 1}   противников: ${alive}\n` +
      `Намерения: ${S.reveal ? 'показаны' : 'скрыты'}   ${Hud.fps} fps\n${S.log}`;
  },

  showError(message) {
    if (!Hud.errEl) return;
    Hud.errEl.style.display = 'block';
    Hud.errEl.textContent = message;
  },
};
