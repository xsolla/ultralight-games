// ============================================================================
// input.js — клавиатура для отладки. Основной ввод это ведение кристаллов по полю match-3 (board.js). Клавиши
// (CONFIG.UI.KEYMAP) вызывают те же команды Game.act, что дают кристаллы: L R F B H, S пропуск, V, X (начать заново).
// ============================================================================

const Input = {
  init() {
    addEventListener('keydown', e => {
      if (e.repeat) return;
      const a = CONFIG.UI.KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (a) { e.preventDefault(); Game.act(a); }
    });
  },
};
