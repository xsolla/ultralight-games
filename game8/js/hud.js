// ============================================================================
// hud.js — DOM-интерфейс вокруг 3D-сцены. Экран 9:16 заключён в рамку (css/styles.css) и разделён на
// три части: сверху сцена со строкой состояния, посередине разделитель с HP игрока, снизу бокс с полем
// match-3 (его рисует board.js).
//
// HP игрока это полоса в разделителе: цвет плавно идёт от зелёного к красному, а на 20% HP и ниже
// полоса красная и мигает (CONFIG.UI.HP_BAR).
//
// Когда за один ход (с каскадом) схлопнулось несколько цветов, вместо HP в разделителе показывается
// счётчик кристаллов по цветам (tallyShow). В конце цепочки он подсвечивает двух победителей (tallyPick),
// при случайном выборе показывает бегущую подсветку, и HP возвращается на место (tallyHide).
//
// Конец партии (showOver): окно поверх всей рамки с итогом (поражение или победа), сложностью, числом ходов,
// местом в лучших результатах и кнопками "Play again" и "Menu" (титульный экран). Все тексты игры на английском.
// ============================================================================

const Hud = {
  fps: 0,
  el: null,          // строка состояния поверх сцены
  errEl: null,
  overEl: null,      // окно конца партии
  // итоги партии (Game.state.over): заголовок и пояснение
  OVER_TEXT: {
    crash: () => ['Defeat', 'Your car was wrecked.'],
    escape: () => ['Defeat', `A rival broke away: it got more than ${CONFIG.RULES.LOSE_LEAD} rows ahead of you.`],
    win: () => ['Victory!', 'No rivals in sight: all of them are wrecked or left behind.'],
  },
  divider: null, hpFill: null, hpText: null,
  tallyItems: [],    // по одному элементу на цвет кристалла
  tallyCounts: [],   // числа, которые сейчас показывает счётчик

  init() {
    Hud.el = document.getElementById('hud');
    Hud.errEl = document.getElementById('err');
    Hud.divider = document.getElementById('divider');
    Hud.hpFill = document.getElementById('hp-fill');
    Hud.hpText = document.getElementById('hp-text');
    if (Hud.divider) Hud.divider.style.setProperty('--hp-blink', CONFIG.UI.HP_BAR.BLINK_PERIOD + 's');
    Hud.overEl = document.getElementById('over');
    const restart = document.getElementById('over-restart'), menu = document.getElementById('over-menu');
    if (restart) restart.addEventListener('click', () => Game.act('X'));
    if (menu) menu.addEventListener('click', () => Game.stop());

    // значки счётчика это те же кристаллы, что на поле (форма показывает команду)
    const tally = document.getElementById('tally'), dpr = Math.min(devicePixelRatio || 1, CONFIG.RENDER.MAX_DPR);
    if (tally) Hud.tallyItems = CONFIG.MATCH3.TILES.map((t, type) => {
      const el = document.createElement('div');
      el.className = 'tally-item';
      const icon = Crystals.sprite(type, CONFIG.MATCH3.TALLY.ICON_R, dpr);
      icon.canvas.style.width = icon.canvas.style.height = icon.size + 'px';
      el.appendChild(icon.canvas);
      el.insertAdjacentHTML('beforeend', '<b>0</b>');
      tally.appendChild(el);
      return el;
    });
  },

  // ---- Счётчик цветов (вместо HP, пока в цепочке больше одного цвета) ----
  // counts[i] это сколько кристаллов цвета i схлопнулось за цепочку. Дальше к счёту прибавляют кометы
  // (BoardFx.comet), долетая до значка своего цвета (tallyAdd).
  tallyShow(counts) {
    if (!Hud.divider) return;
    Hud.divider.classList.add('tally-mode');
    Hud.tallyCounts = counts.slice();
    Hud.tallyRender();
  },

  tallyAdd(type) {
    if (!Hud.tallyOn()) return;
    Hud.tallyCounts[type]++;
    Hud.tallyRender();
    const el = Hud.tallyItems[type];                              // вспышка значка: класс снимается и ставится заново
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  },

  tallyRender() {
    const counts = Hud.tallyCounts, max = Math.max(...counts);
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
    for (const el of Hud.tallyItems) el.classList.remove('lead', 'pick', 'win', 'hit');
  },

  tallyOn: () => !!Hud.divider && Hud.divider.classList.contains('tally-mode'),
  tallyIcon: type => Hud.tallyItems[type].querySelector('canvas'),      // значок-кристалл цвета type

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
    const foes = Game.foes(), lead = foes.length ? Math.max(...foes.map(Game.ahead)) : 0;
    Hud.el.textContent =
      `Turn ${S.turn}   row ${S.playerRow}/${CONFIG.TRACK.ROWS - 1}   rivals: ${foes.length}   leader ahead: ${lead}/${CONFIG.RULES.LOSE_LEAD}\n` +
      `${Title.LEVEL_NAME[S.level]}   intents: ${S.reveal ? 'shown' : 'hidden'}   ${Hud.fps} fps\n${S.log}`;
  },

  // ---- Конец партии ----
  // info = { turns, place, level }: сколько ходов, место среди лучших побед (results.js, -1 не попала), сложность
  showOver(reason, info) {
    if (!Hud.overEl) return;
    const [title, text] = Hud.OVER_TEXT[reason]();
    document.getElementById('over-title').textContent = title;
    document.getElementById('over-text').textContent = text;
    const note = document.getElementById('over-note');
    if (note) {
      const parts = info ? [Title.LEVEL_NAME[info.level], Title.turns(info.turns)] : [];
      if (info && info.place === 0) parts.push('new record!');
      else if (info && info.place > 0) parts.push(`${Title.ordinal(info.place + 1)} best result`);
      note.textContent = parts.join(' · ');
      note.classList.toggle('record', !!info && info.place === 0);
    }
    Hud.overEl.classList.toggle('win', reason === 'win');
    Hud.overEl.classList.add('show');
  },

  hideOver() { if (Hud.overEl) Hud.overEl.classList.remove('show', 'win'); },

  showError(message) {
    if (!Hud.errEl) return;
    Hud.errEl.style.display = 'block';
    Hud.errEl.textContent = message;
  },
};
