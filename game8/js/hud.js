// ============================================================================
// hud.js — DOM-интерфейс вокруг 3D-сцены. Экран 9:16 заключён в рамку (css/styles.css) и разделён на
// три части: сверху сцена со строкой состояния, посередине разделитель с HP игрока, снизу бокс с полем
// match-3 (его рисует board.js).
//
// HP игрока это полоса в разделителе: цвет плавно идёт от зелёного к красному, а на 20% HP и ниже
// полоса красная и мигает (CONFIG.UI.HP_BAR).
// ============================================================================

const Hud = {
  fps: 0,
  el: null,          // строка состояния поверх сцены
  errEl: null,
  divider: null, hpFill: null, hpText: null,

  init() {
    Hud.el = document.getElementById('hud');
    Hud.errEl = document.getElementById('err');
    Hud.divider = document.getElementById('divider');
    Hud.hpFill = document.getElementById('hp-fill');
    Hud.hpText = document.getElementById('hp-text');
    if (Hud.divider) Hud.divider.style.setProperty('--hp-blink', CONFIG.UI.HP_BAR.BLINK_PERIOD + 's');
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
