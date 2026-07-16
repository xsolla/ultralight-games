// ============================================================================
// menu.js — the title screen: a dominating Play button with the smaller,
// icon-illustrated settings tiles below it. No game logic here; game.js reads
// the selected values and starts a game.
//
// Buttons are rebuilt each frame from game.settings so the "selected" and
// "enabled" states always reflect current choices. game.js hit-tests against
// game.menuButtons (the list this module stores while drawing).
// ============================================================================

// Layout table (native 800x600 coords). Kept here as tunable constants.
const MENU = {
  titleY: 66,
  subtitleY: 102,

  // Play dominates: large, with its TOP at 1/3 of the canvas height.
  play: { w: 380, h: 96, top: Math.round(CANVAS_H / 3) },

  tileH: 52,
  sizeLabelY: 322,  sizeRowY: 338,  sizeTile: { w: 150, gap: 22 },
  modeLabelY: 404,  modeRowY: 420,  modeTile: { w: 200, gap: 28 },
  aiLabelY: 486,    aiRowY: 502,    aiTile: { w: 150, gap: 22 },

  footerY: 576,
};

// Build the button list from current settings. Each entry:
//   { group, value, label, rect:{x,y,w,h}, selected, enabled }
function buildMenuButtons(settings) {
  const buttons = [];

  const addRow = (items, cfg, rowY, isSelected, isEnabled) => {
    const total = items.length * cfg.w + (items.length - 1) * cfg.gap;
    let x = (CANVAS_W - total) / 2;
    for (const it of items) {
      buttons.push({
        group: it.group, value: it.value, label: it.label,
        rect: { x, y: rowY, w: cfg.w, h: MENU.tileH },
        selected: isSelected(it.value),
        enabled: isEnabled ? isEnabled(it.value) : true,
      });
      x += cfg.w + cfg.gap;
    }
  };

  // Big Play button first (drawn distinctly).
  buttons.push({
    group: 'play', value: 'play', label: 'Play',
    rect: { x: (CANVAS_W - MENU.play.w) / 2, y: MENU.play.top, w: MENU.play.w, h: MENU.play.h },
    selected: false, enabled: true,
  });

  addRow(
    Object.keys(BOARD_SIZES).map((k) => ({ group: 'size', value: k, label: BOARD_SIZES[k].label })),
    MENU.sizeTile, MENU.sizeRowY, (v) => settings.size === v
  );
  addRow(
    Object.values(MODES).map((m) => ({ group: 'mode', value: m.key, label: m.label })),
    MENU.modeTile, MENU.modeRowY, (v) => settings.mode === v
  );
  addRow(
    Object.values(AI_LEVELS).map((a) => ({ group: 'ai', value: a.key, label: a.label })),
    MENU.aiTile, MENU.aiRowY, (v) => settings.ai === v, () => settings.mode === 'ai'
  );

  return buttons;
}

function drawMenu(ctx, game) {
  drawBackground(ctx);
  drawAmbiance(ctx, AMBIANCE_MENU, game.time);

  // Title + tagline.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.headerText;
  ctx.font = '700 38px system-ui, sans-serif';
  const title = 'Xsolla Hexxagon';
  ctx.fillText(title, CANVAS_W / 2, MENU.titleY);

  const halfW = ctx.measureText(title).width / 2;
  placeBody(ctx, BUBBLES, CANVAS_W / 2 - halfW - 42, MENU.titleY - 4, 28, game.time, 0.2, 1, 1, 1);
  placeBody(ctx, CRYSTALS, CANVAS_W / 2 + halfW + 42, MENU.titleY - 4, 28, game.time, 0, 1, 1, 1);

  ctx.fillStyle = COLORS.headerSub;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Bubbles vs Crystals · clone, jump, convert', CANVAS_W / 2, MENU.subtitleY);

  // Buttons.
  const buttons = buildMenuButtons(game.settings);
  game.menuButtons = buttons;
  for (const b of buttons) {
    if (b.group === 'play') drawPlayButton(ctx, b);
    else drawOptionButton(ctx, b);
  }

  // Section labels (drawn above their rows).
  sectionLabel(ctx, 'BOARD SIZE', MENU.sizeLabelY);
  sectionLabel(ctx, 'MODE', MENU.modeLabelY);
  sectionLabel(ctx, 'AI DIFFICULTY', MENU.aiLabelY);

  // Footer hint reflecting the current selection.
  ctx.fillStyle = COLORS.headerSub;
  ctx.font = '13px system-ui, sans-serif';
  const modeTxt = game.settings.mode === 'ai'
    ? 'Play vs AI — ' + AI_LEVELS[game.settings.ai].label + ', faction & first move chosen at random'
    : 'Hot Seat — two players share this device';
  ctx.fillText(modeTxt, CANVAS_W / 2, MENU.footerY);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function sectionLabel(ctx, text, y) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.sectionLabel;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.save();
  ctx.letterSpacing = '2px';
  ctx.fillText(text, CANVAS_W / 2, y);
  ctx.restore();
}

// The dominating Play button: large, glowing, with a play-triangle icon.
function drawPlayButton(ctx, b) {
  const { x, y, w, h } = b.rect;
  ctx.save();
  ctx.shadowColor = 'rgba(255,226,122,0.45)';
  ctx.shadowBlur = 30;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = COLORS.playFill;
  ctx.fill();
  ctx.restore();

  const cx = x + w / 2, cy = y + h / 2;
  ctx.font = '700 34px system-ui, sans-serif';
  const textW = ctx.measureText('Play').width;
  const iconW = 26, gap = 14, combo = iconW + gap + textW, sx = cx - combo / 2;

  iconPlay(ctx, sx + iconW / 2, cy, 15, COLORS.playText);

  ctx.fillStyle = COLORS.playText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Play', sx + iconW + gap, cy + 1);
}

// A settings tile: an icon on top, a caption below.
function drawOptionButton(ctx, b) {
  const { x, y, w, h } = b.rect;
  roundRect(ctx, x, y, w, h, 12);

  let iconColor, textColor;
  if (!b.enabled) {
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,180,220,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    iconColor = textColor = COLORS.btnDisabledText;
  } else if (b.selected) {
    ctx.fillStyle = COLORS.btnSelFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.btnSelStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    iconColor = COLORS.btnSelStroke;
    textColor = COLORS.headerText;
  } else {
    ctx.fillStyle = COLORS.btnFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.btnStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    iconColor = COLORS.headerSub;
    textColor = COLORS.headerText;
  }

  drawTileIcon(ctx, b.group, b.value, x + w / 2, y + 18, 12, iconColor);

  ctx.fillStyle = textColor;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, x + w / 2, y + h - 15);
}

// Return the enabled button whose rect contains (px, py), or null.
function menuButtonAt(game, px, py) {
  for (const b of game.menuButtons || []) {
    if (!b.enabled) continue;
    const r = b.rect;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return b;
  }
  return null;
}

// ---- Icons -----------------------------------------------------------------
function drawTileIcon(ctx, group, value, cx, cy, s, color) {
  if (group === 'size') iconBoard(ctx, BOARD_SIZES[value].radius, cx, cy, s, color);
  else if (group === 'mode') (value === 'ai' ? iconRobot : iconHotseat)(ctx, cx, cy, s, color);
  else if (group === 'ai') iconBars(ctx, value, cx, cy, s, color);
}

// Board size: nested hexagons — more rings = bigger board (radius 2/3/4).
function iconBoard(ctx, radius, cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  for (let k = 1; k <= radius; k++) {
    tracePolygon(ctx, hexCorners(cx, cy, (s * k) / radius));
    ctx.stroke();
  }
}

// Play vs AI: a little robot head.
function iconRobot(ctx, cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - s * 0.8, cy - s * 0.45, s * 1.6, s * 1.15, s * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.45);
  ctx.lineTo(cx, cy - s * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.92, s * 0.12, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - s * 0.32, cy + s * 0.05, s * 0.15, 0, TAU);
  ctx.arc(cx + s * 0.32, cy + s * 0.05, s * 0.15, 0, TAU);
  ctx.fill();
}

// Hot Seat: two players side by side (head + shoulders).
function iconHotseat(ctx, cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (const dx of [-s * 0.48, s * 0.48]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy - s * 0.3, s * 0.3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + dx, cy + s * 0.85, s * 0.52, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
}

// AI difficulty: signal-strength bars (Easy 1, Normal 2, Hard 3 filled).
function iconBars(ctx, level, cx, cy, s, color) {
  const filled = level === 'easy' ? 1 : level === 'normal' ? 2 : 3;
  const heights = [s * 0.6, s * 0.95, s * 1.3];
  const bw = s * 0.34, gap = s * 0.22;
  const totalW = 3 * bw + 2 * gap;
  let x = cx - totalW / 2;
  const base = cy + s * 0.7;
  for (let i = 0; i < 3; i++) {
    const h = heights[i];
    roundRect(ctx, x, base - h, bw, h, bw * 0.3);
    if (i < filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    x += bw + gap;
  }
}

// Play triangle.
function iconPlay(ctx, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.7);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.7);
  ctx.lineTo(cx + s * 0.72, cy);
  ctx.closePath();
  ctx.fill();
}
