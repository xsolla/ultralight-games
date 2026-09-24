// ============================================================================
// menu.js — the title screen and the records card: their layout, their
// buttons' geometry, and their drawing. Reads state and draws it; never mutates
// game state and never handles input — game.js hit-tests through the layout
// functions here and owns every transition they lead to. Adapted from game6.
//
// It composes rather than owns: the starfield is ambiance.js's, the planet is
// planet.js's, and the three shared HUD buttons are render.js's.
// ============================================================================

// ---- Layout ------------------------------------------------------------------
// The planet is the title screen's hero: it fills the bottom exactly as it does
// in a run, so the menu and the game read as one place.
const MENU = {
  // Mirrors the HUD button row: centred on the same y as those buttons and
  // inset by the same HUD_PAD from the opposite edge (branding.md §1).
  LOGO_X: HUD_PAD,
  LOGO_Y: 16,
  LOGO_W: 84,

  TITLE_Y: 156,
  TITLE_SIZE: 42,
  TITLE_TRACK: 8,         // extra px between glyphs — see drawTracked
  TITLE_GLOW: 14,
  TITLE_PULSE_HZ: 0.13,   // the glow breathes; the type never moves
  SUB_Y: 194,
  SUB_SIZE: 16,
  SUB_TRACK: 9,
  RULE_Y: 214,            // hairline under the subtitle
  RULE_W: 150,

  START_Y: 356,
  START_H: 50,
  SCORES_Y: 420,
  SCORES_H: 40,
  BTN_W: 232,
  HINT_Y: 496,
};

// Hit slop, as HUD_BTN_SLOP is for the shared buttons.
const MENU_BTN_SLOP = 3;

// ---- Skin --------------------------------------------------------------------
const MENU_SKIN = {
  RADIUS: 10,
  accent: COLORS.accent,
  accentDim: 'rgba(127, 212, 255, 0.62)',
  glow: 'rgba(127, 212, 255, 0.55)',
  fill: 'rgba(12, 24, 44, 0.55)',
  fillHover: 'rgba(26, 50, 84, 0.75)',
  stroke: 'rgba(127, 212, 255, 0.30)',
  strokeHover: 'rgba(168, 230, 255, 0.85)',
  strokeOn: 'rgba(168, 230, 255, 0.70)',
  pillOn: 'rgba(127, 212, 255, 0.90)',
  startTop: '#a9e7ff',
  startBot: '#4bb4e6',
  startTopHot: '#c9f2ff',
  startBotHot: '#63c8f4',
  // Text ON a filled surface. Near-black rather than the background colour: the
  // fill is bright enough that anything lighter loses its edges.
  onText: '#05101c',
};

// ---- Records card --------------------------------------------------------------
const RECORDS = {
  W: 272,
  H: 244,
  RADIUS: 14,
  PAD: 18,
  HEAD_Y: 30,        // all offsets are from the card's own top edge
  SUB_Y: 50,
  RULE_Y: 64,
  ROW_Y: 78,
  ROW_H: 32,
  ROW_GAP: 2,
  BTN_Y: 186,
  BTN_H: 40,
  BTN_GAP: 12,
  ONE_BTN_W: 140,    // the title screen's single OK
  SCRIM: 'rgba(4, 8, 16, 0.72)',
};

const MENU_TITLE = 'PLANET';
const MENU_SUB = 'DEFENSE';
const MENU_HINT = 'build ships · give them orders · hold the line';

// ---- Xsolla wordmark — VERBATIM from branding.md §1, via game6 ----------------
// The repo's shared house element. Nothing in this block is a tuning knob.
// All five paths are filled 'evenodd'; the source clipPath is a no-op and is
// skipped, but its 4.53857 y-offset is subtracted so a caller's `y` means the
// top of the visible art.
const XSOLLA_LOGO_PATHS = [
  'M73.6664 4.53827C84.0077 4.53827 92.1272 12.6598 92.1272 22.9991C92.1272 33.3383 84.0077 41.4599 73.6664 41.4599C63.3271 41.4599 55.2078 33.3383 55.2078 22.9991C55.2078 12.6598 63.3272 4.53829 73.6664 4.53827ZM73.6664 11.6001C67.4629 11.6001 62.7728 16.4937 62.7728 22.9991C62.7728 29.5065 67.4629 34.398 73.6664 34.398C79.872 34.398 84.5622 29.5065 84.5622 22.9991C84.5622 16.4937 79.872 11.6001 73.6664 11.6001Z',
  'M18.0542 16.6417L26.3277 5.34541H35.0034L22.2521 22.2765L36.0119 40.6531H26.884L17.7546 28.3332L8.725 40.6531H0.00012207L13.5575 22.6895L0.605567 5.34541H9.68396L18.0542 16.6417Z',
  'M42.9917 15.4836L49.9509 24.2107C51.4643 26.1266 52.1706 27.9419 52.1706 29.9091C52.1706 31.8763 51.4643 33.6917 49.9509 35.6097L45.9669 40.6531H36.9893L45.1088 30.2622L38.1987 21.5865C36.7367 19.7712 36.0304 18.005 36.0304 16.1404C36.0304 14.2225 36.7367 12.4584 38.1987 10.6925L42.7391 5.34541H51.5156L42.9917 15.4836Z',
  'M118.379 40.6531H109.502L90.5358 5.34541H99.4151L118.379 40.6531Z',
  'M116.976 5.34541L131.944 33.2089L146.393 5.34541H151.688L169.997 40.6531H127.065L108.101 5.34541H116.976ZM139.348 34.0962H158.385L148.875 15.1397L139.348 34.0962Z',
];
const XSOLLA_LOGO_W = 169.997;    // artwork width in source units
const XSOLLA_LOGO_Y0 = 4.53857;   // artwork's top edge in source units
const XSOLLA_LOGO_FILL = '#80EAFF';
// Path2D objects are independent of the game canvas, so a resize cannot
// invalidate this cache the way branding.md §5 warns a cached gradient can be.
let xsollaLogoCache = null;

function drawXsollaLogo(ctx, x, y, w) {
  if (!xsollaLogoCache) xsollaLogoCache = XSOLLA_LOGO_PATHS.map((d) => new Path2D(d));
  const s = w / XSOLLA_LOGO_W;
  ctx.save();
  ctx.translate(x, y - XSOLLA_LOGO_Y0 * s);
  ctx.scale(s, s);
  ctx.fillStyle = XSOLLA_LOGO_FILL;
  for (const p of xsollaLogoCache) ctx.fill(p, 'evenodd');
  ctx.restore();
}

// ---- Button layout -------------------------------------------------------------
function menuButtonRects() {
  const x = (CANVAS_W - MENU.BTN_W) / 2;
  return [
    { id: 'start', kind: 'start', x, y: MENU.START_Y, w: MENU.BTN_W, h: MENU.START_H },
    { id: 'records', kind: 'records', x, y: MENU.SCORES_Y, w: MENU.BTN_W, h: MENU.SCORES_H },
  ];
}

function menuButtonAt(px, py) {
  const k = MENU_BTN_SLOP;
  for (const r of menuButtonRects()) {
    if (px >= r.x - k && px <= r.x + r.w + k &&
        py >= r.y - k && py <= r.y + r.h + k) return r.id;
  }
  return null;
}

// ---- Drawing -------------------------------------------------------------------
function drawMenu(ctx, game) {
  Stars.draw(ctx, game.time);
  Planet.draw(ctx, 1, game.time);
  drawMenuTitle(ctx, game.time);
  drawXsollaLogo(ctx, MENU.LOGO_X, MENU.LOGO_Y, MENU.LOGO_W);
  drawMenuButtons(ctx, game);
  drawMenuHint(ctx);
  drawHudButtons(ctx, game);
}

function drawMenuTitle(ctx, time) {
  // The GLOW pulses; the type does not move and does not resize.
  const pulse = 0.5 + 0.5 * Math.sin((time / 1000) * TAU * MENU.TITLE_PULSE_HZ);

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${MENU.TITLE_SIZE}px ${FONT}`;
  ctx.fillStyle = COLORS.hudText;
  ctx.shadowColor = MENU_SKIN.glow;
  ctx.shadowBlur = MENU.TITLE_GLOW * (0.7 + 0.3 * pulse);
  drawTracked(ctx, MENU_TITLE, CANVAS_W / 2, MENU.TITLE_Y, MENU.TITLE_TRACK);

  ctx.shadowBlur = 0;
  ctx.font = `600 ${MENU.SUB_SIZE}px ${FONT}`;
  ctx.fillStyle = MENU_SKIN.accent;
  drawTracked(ctx, MENU_SUB, CANVAS_W / 2, MENU.SUB_Y, MENU.SUB_TRACK);
  ctx.restore();

  // A hairline that fades out at both ends, so it reads as an underline rather
  // than as a divider.
  const g = ctx.createLinearGradient((CANVAS_W - MENU.RULE_W) / 2, 0, (CANVAS_W + MENU.RULE_W) / 2, 0);
  g.addColorStop(0, 'rgba(127, 212, 255, 0)');
  g.addColorStop(0.5, 'rgba(127, 212, 255, 0.45)');
  g.addColorStop(1, 'rgba(127, 212, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect((CANVAS_W - MENU.RULE_W) / 2, MENU.RULE_Y, MENU.RULE_W, 1);
}

function drawMenuButtons(ctx, game) {
  for (const r of menuButtonRects()) {
    const hot = game.hover === 'menu:' + r.id;
    if (r.kind === 'start') drawStartButton(ctx, r, hot);
    else drawGhostButton(ctx, r, hot, 'HIGH SCORES');
  }
}

// The only control on the screen with a surface and a glow, which is what makes
// it the obvious one to press without any word saying so.
function drawStartButton(ctx, r, hot) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, hot ? MENU_SKIN.startTopHot : MENU_SKIN.startTop);
  g.addColorStop(1, hot ? MENU_SKIN.startBotHot : MENU_SKIN.startBot);

  ctx.save();
  ctx.shadowColor = MENU_SKIN.glow;
  ctx.shadowBlur = hot ? 22 : 12;
  roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? MENU_SKIN.strokeHover : MENU_SKIN.strokeOn;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = `800 17px ${FONT}`;
  ctx.fillStyle = MENU_SKIN.onText;
  drawTracked(ctx, 'START', r.x + r.w / 2, r.y + r.h / 2 + 1, 5);
}

function drawGhostButton(ctx, r, hot, label) {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
  ctx.fillStyle = hot ? MENU_SKIN.fillHover : MENU_SKIN.fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? MENU_SKIN.strokeHover : MENU_SKIN.stroke;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = hot ? COLORS.hudText : MENU_SKIN.accentDim;
  drawTracked(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, 2.6);
}

function drawMenuHint(ctx) {
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(MENU_HINT, CANVAS_W / 2, MENU.HINT_Y);
}

// ---- Records card --------------------------------------------------------------
function recordsCardRect() {
  return {
    x: (CANVAS_W - RECORDS.W) / 2,
    y: (CANVAS_H - RECORDS.H) / 2,
    w: RECORDS.W,
    h: RECORDS.H,
  };
}

// Opened from the title, the card is information and has one way out. At the
// end of a run there is a choice, and TRY AGAIN takes the primary surface on the
// right, where the thumb already is.
function recordsButtonRects(from) {
  const card = recordsCardRect();
  const y = card.y + RECORDS.BTN_Y;
  const h = RECORDS.BTN_H;
  if (from === 'menu') {
    return [{ id: 'ok', label: 'OK', primary: true,
              x: (CANVAS_W - RECORDS.ONE_BTN_W) / 2, y, w: RECORDS.ONE_BTN_W, h }];
  }
  const inner = RECORDS.W - RECORDS.PAD * 2;
  const w = (inner - RECORDS.BTN_GAP) / 2;
  return [
    { id: 'title', label: 'TITLE', primary: false, x: card.x + RECORDS.PAD, y, w, h },
    { id: 'retry', label: 'TRY AGAIN', primary: true,
      x: card.x + RECORDS.PAD + w + RECORDS.BTN_GAP, y, w, h },
  ];
}

function recordsButtonAt(px, py, from) {
  const k = MENU_BTN_SLOP;
  for (const r of recordsButtonRects(from)) {
    if (px >= r.x - k && px <= r.x + r.w + k &&
        py >= r.y - k && py <= r.y + r.h + k) return r.id;
  }
  return null;
}

function drawRecords(ctx, game) {
  // The backdrop is whatever the card was opened over: the living title screen,
  // or the run it is reporting, frozen.
  if (game.recordsFrom === 'menu') {
    drawMenu(ctx, game);
  } else {
    drawWorld(ctx, game);
    drawHud(ctx, game);
  }
  ctx.fillStyle = RECORDS.SCRIM;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawRecordsCard(ctx, game);
  // Re-drawn on top of the scrim: branding.md §2 requires the shared buttons to
  // stay live over a game-over dialog.
  drawHudButtons(ctx, game);
}

function drawRecordsCard(ctx, game) {
  const card = recordsCardRect();
  const fromRun = game.recordsFrom !== 'menu';
  const newRecord = fromRun && game.newRank >= 0;
  const table = Scores.table();

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 26;
  roundRectPath(ctx, card.x, card.y, card.w, card.h, RECORDS.RADIUS);
  ctx.fillStyle = 'rgba(9, 18, 34, 0.96)';
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, card.x, card.y, card.w, card.h, RECORDS.RADIUS);
  ctx.lineWidth = 1;
  ctx.strokeStyle = MENU_SKIN.stroke;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  // The heading is the news. Only a record earns the accent colour.
  const heading = !fromRun ? 'HIGH SCORES'
                : newRecord ? 'NEW RECORD'
                : game.planetHp <= 0 ? 'PLANET LOST' : 'RUN ENDED';
  ctx.font = `800 15px ${FONT}`;
  ctx.fillStyle = newRecord ? MENU_SKIN.accent : COLORS.hudText;
  drawTracked(ctx, heading, CANVAS_W / 2, card.y + RECORDS.HEAD_Y, 2.6);

  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  const sub = fromRun ? 'WAVE ' + game.finalWave + ' · ' + game.kills + ' KILLS' : 'BEST WAVES';
  drawTracked(ctx, sub, CANVAS_W / 2, card.y + RECORDS.SUB_Y, 2.2);

  const ruleW = card.w - RECORDS.PAD * 2;
  const g = ctx.createLinearGradient(card.x + RECORDS.PAD, 0, card.x + card.w - RECORDS.PAD, 0);
  g.addColorStop(0, 'rgba(127, 212, 255, 0)');
  g.addColorStop(0.5, 'rgba(127, 212, 255, 0.40)');
  g.addColorStop(1, 'rgba(127, 212, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(card.x + RECORDS.PAD, card.y + RECORDS.RULE_Y, ruleW, 1);

  // Always SCORES_KEPT rows, filled or not: an empty slot is an invitation.
  for (let i = 0; i < SCORES_KEPT; i++) {
    drawRecordRow(ctx, card, i, table[i], fromRun && game.newRank === i, game.time);
  }
  for (const r of recordsButtonRects(game.recordsFrom)) {
    drawCardButton(ctx, r, game.hover === 'rec:' + r.id);
  }
}

function drawRecordRow(ctx, card, i, entry, isNew, time) {
  const x = card.x + RECORDS.PAD;
  const w = card.w - RECORDS.PAD * 2;
  const y = card.y + RECORDS.ROW_Y + i * (RECORDS.ROW_H + RECORDS.ROW_GAP);
  const mid = y + RECORDS.ROW_H / 2;

  if (isNew) {
    // The run's own row, filled, breathing slightly so the eye finds it.
    const pulse = 0.86 + 0.14 * Math.sin((time / 1000) * TAU * 0.6);
    ctx.save();
    ctx.globalAlpha = pulse;
    roundRectPath(ctx, x, y, w, RECORDS.ROW_H, 8);
    ctx.fillStyle = MENU_SKIN.pillOn;
    ctx.fill();
    ctx.restore();
  } else {
    roundRectPath(ctx, x, y, w, RECORDS.ROW_H, 8);
    ctx.fillStyle = 'rgba(127, 212, 255, 0.06)';
    ctx.fill();
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = isNew ? MENU_SKIN.onText : (entry ? MENU_SKIN.accentDim : COLORS.hudDim);
  ctx.fillText(String(i + 1), x + 12, mid);

  if (entry) {
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = isNew ? MENU_SKIN.onText : COLORS.hudDim;
    ctx.fillText(entry.kills + ' kills', x + 34, mid + 0.5);
  }

  ctx.textAlign = 'right';
  ctx.font = `${entry ? 800 : 500} ${entry ? 16 : 15}px ${FONT}`;
  // An em dash for an unclaimed slot: a zero would read as a terrible run.
  ctx.fillStyle = isNew ? MENU_SKIN.onText : (entry ? COLORS.hudText : COLORS.hudDim);
  ctx.fillText(entry ? 'WAVE ' + entry.wave : '—', x + w - 12, mid);
  ctx.textAlign = 'left';
}

function drawCardButton(ctx, r, hot) {
  if (r.primary) {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, hot ? MENU_SKIN.startTopHot : MENU_SKIN.startTop);
    g.addColorStop(1, hot ? MENU_SKIN.startBotHot : MENU_SKIN.startBot);
    ctx.save();
    ctx.shadowColor = MENU_SKIN.glow;
    ctx.shadowBlur = hot ? 18 : 10;
    roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else {
    roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
    ctx.fillStyle = hot ? MENU_SKIN.fillHover : MENU_SKIN.fill;
    ctx.fill();
  }
  roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? MENU_SKIN.strokeHover : (r.primary ? MENU_SKIN.strokeOn : MENU_SKIN.stroke);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = r.primary ? MENU_SKIN.onText : (hot ? COLORS.hudText : MENU_SKIN.accentDim);
  drawTracked(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, 2.2);
}

// Centred text with letter spacing, placed one glyph at a time. ctx.letterSpacing
// is too recent to rely on in a game that must run off a file:// double-click.
// Sets textAlign itself so a caller cannot leave it on 'center' and double up.
function drawTracked(ctx, text, cx, y, track) {
  ctx.textAlign = 'left';
  const chars = Array.from(text);
  let total = -track;   // no trailing gap after the last glyph
  for (const ch of chars) total += ctx.measureText(ch).width + track;
  let x = cx - total / 2;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + track;
  }
}
