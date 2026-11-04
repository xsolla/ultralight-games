// ============================================================================
// results.js — лучшие результаты: хранение и правило сравнения. Не рисует (окно рисует title.js) и не
// знает, как кончилась партия: ему отдают итог, он отвечает, каким местом тот встал.
//
// По каждой сложности (CONFIG.DIFFICULTY.ORDER): сколько партий сыграно, сколько побед и лучшие победы
// (CONFIG.RESULTS.KEPT штук) { turns, hp, maxHp, date }. Победа лучше, если за меньшее число ходов, при
// равенстве если осталось больше HP. Равная прежней не обгоняет её: повторить рекорд не значит побить.
//
// Один ключ в localStorage (CONFIG.RESULTS.KEY, у игр портала общий origin), и каждое обращение в try:
// в приватном режиме таблица живёт до конца сессии и не падает.
// ============================================================================

const Results = {
  data: {},          // { [level]: { played, wins, best: [...] } }
  persists: true,    // false после первого отказа хранилища

  init() {
    let raw = null;
    try { raw = localStorage.getItem(CONFIG.RESULTS.KEY); } catch (e) { Results.persists = false; }
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }   // испорчено: начинаем с чистого
    Results.data = Results.sanitise(parsed);
  },

  write() {
    if (!Results.persists) return;
    try { localStorage.setItem(CONFIG.RESULTS.KEY, JSON.stringify(Results.data)); } catch (e) { Results.persists = false; }
  },

  beats: (a, b) => a.turns < b.turns || (a.turns === b.turns && a.hp > b.hp),

  // Итог партии на сложности level. Возвращает место среди лучших побед (0 это первое) или -1.
  record(level, win, turns, hp, maxHp) {
    const d = Results.data[level];
    if (!d) return -1;
    d.played++;
    let place = -1;
    if (win) {
      d.wins++;
      const row = { turns, hp, maxHp, date: Date.now() };
      let i = 0;
      while (i < d.best.length && !Results.beats(row, d.best[i])) i++;
      if (i < CONFIG.RESULTS.KEPT) { d.best.splice(i, 0, row); d.best.length = Math.min(d.best.length, CONFIG.RESULTS.KEPT); place = i; }
    }
    Results.write();
    return place;
  },

  // То, что пришло из хранилища, приводится к безопасному виду: его мог править кто угодно
  sanitise(raw) {
    const num = (v, min) => (typeof v === 'number' && isFinite(v) && v >= min) ? Math.floor(v) : null;
    const out = {};
    for (const level of CONFIG.DIFFICULTY.ORDER) {
      const src = raw && typeof raw === 'object' ? raw[level] : null, d = src && typeof src === 'object' ? src : {};
      const best = (Array.isArray(d.best) ? d.best : [])
        .map(r => r && { turns: num(r.turns, 1), hp: num(r.hp, 0), maxHp: num(r.maxHp, 1), date: num(r.date, 0) })
        .filter(r => r && r.turns !== null && r.hp !== null && r.maxHp !== null && r.date !== null)
        .sort((a, b) => Results.beats(a, b) ? -1 : Results.beats(b, a) ? 1 : 0)
        .slice(0, CONFIG.RESULTS.KEPT);
      const wins = Math.max(num(d.wins, 0) || 0, best.length);
      out[level] = { played: Math.max(num(d.played, 0) || 0, wins), wins, best };
    }
    return out;
  },
};
