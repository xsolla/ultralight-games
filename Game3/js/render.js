// ============================================================================
// render.js — all canvas drawing. Reads board state, draws nothing else.
// Consumes hex.js for geometry. No rules/AI logic here.
// ============================================================================

function drawScene(ctx, game) {
  if (game.screen === 'menu') {
    drawMenu(ctx, game);
    return;
  }
  if (game.screen === 'ceremony') {
    drawCeremony(ctx, game);
    return;
  }
  // Background gradient + animated ambiance (god rays, dust, bokeh) sit BEHIND
  // the board; then a glow/vignette frames it, then the cached board plate
  // (tray + wells) is blitted on top so the board occludes the centre.
  const sx = ctx.canvas.width / CANVAS_W;
  const sy = ctx.canvas.height / CANVAS_H;
  drawBackground(ctx);
  drawAmbiance(ctx, AMBIANCE_GAME, game.time);
  drawGlowAndVignette(ctx, game.board);
  ctx.drawImage(getBoardPlate(game.board, sx, sy), 0, 0, CANVAS_W, CANVAS_H);

  drawHeader(ctx, game);
  drawHoverHighlight(ctx, game);
  drawHints(ctx, game);          // legal clone/jump destinations (breathing)
  drawTokens(ctx, game);         // settled tokens (bubbles float & shimmer)
  drawAnimations(ctx, game);     // spawn / clone / jump in flight
  drawSelection(ctx, game);      // ring around the selected token (breathing)
  if (game.gameOver) drawGameOver(ctx, game);
}

// ---- Board plate (offscreen cache: tray + wells + grain, transparent bg) ----
// Keyed by board identity + device scale. Background/ambiance are drawn live
// behind this each frame, so only the unchanging board itself is cached.
let _plateCanvas = null;
let _plateBoard = null;

function getBoardPlate(board, sx, sy) {
  const bw = Math.max(1, Math.round(CANVAS_W * sx));
  const bh = Math.max(1, Math.round(CANVAS_H * sy));
  if (_plateBoard === board && _plateCanvas &&
      _plateCanvas.width === bw && _plateCanvas.height === bh) {
    return _plateCanvas;
  }

  const c = document.createElement('canvas');
  c.width = bw;
  c.height = bh;
  const g = c.getContext('2d');
  g.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0);

  drawBoardTray(g, board);
  for (const cell of board.cells.values()) {
    const { x, y } = axialToPixel(cell.q, cell.r, board.size, board.origin);
    drawCellWell(g, x, y, board.size);
  }
  // Grain, clipped to the tray so it doesn't cover the transparent surround.
  const R = boardOuterRadius(board) + board.size * 0.4;
  const pts = flatTopHexCorners(board.origin.x, board.origin.y, R);
  g.save();
  roundedPolygon(g, pts, board.size * 0.85);
  g.clip();
  drawGrain(g);
  g.restore();

  _plateCanvas = c;
  _plateBoard = board;
  return c;
}

// Distance from the board center to the farthest cell corner.
function boardOuterRadius(board) {
  let maxD = 0;
  for (const cell of board.cells.values()) {
    const { x, y } = axialToPixel(cell.q, cell.r, board.size, board.origin);
    const d = Math.hypot(x - board.origin.x, y - board.origin.y);
    if (d > maxD) maxD = d;
  }
  return maxD + board.size;
}

function drawGlowAndVignette(g, board) {
  const cx = board.origin.x, cy = board.origin.y;
  const outer = boardOuterRadius(board);

  // Soft bluish glow behind the board.
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, outer * 1.15);
  glow.addColorStop(0, COLORS.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Vignette: transparent near the board, darkening toward the edges.
  const vig = g.createRadialGradient(cx, cy, outer * 0.85, cx, cy, 660);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, COLORS.vignette);
  g.fillStyle = vig;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// The physical plate the grid sits on: a rounded flat-top hexagon (its vertices
// align with the board's six corner cells), lit top-to-bottom, with a rim and a
// drop shadow so the board floats above the background.
function drawBoardTray(g, board) {
  const cx = board.origin.x, cy = board.origin.y;
  const R = boardOuterRadius(board) + board.size * 0.4;
  const pts = flatTopHexCorners(cx, cy, R);
  const cornerR = board.size * 0.85;

  // Drop shadow.
  g.save();
  g.shadowColor = COLORS.trayDropShadow;
  g.shadowBlur = 34;
  g.shadowOffsetY = 14;
  roundedPolygon(g, pts, cornerR);
  g.fillStyle = COLORS.tray2;
  g.fill();
  g.restore();

  // Lit surface.
  const grad = g.createLinearGradient(0, cy - R, 0, cy + R);
  grad.addColorStop(0, COLORS.tray1);
  grad.addColorStop(1, COLORS.tray2);
  roundedPolygon(g, pts, cornerR);
  g.fillStyle = grad;
  g.fill();

  // Bottom rim shadow, then top rim highlight (inset a hair) for a beveled edge.
  roundedPolygon(g, pts, cornerR);
  g.strokeStyle = COLORS.trayRimShadow;
  g.lineWidth = 3;
  g.stroke();
  roundedPolygon(g, flatTopHexCorners(cx, cy - 1.5, R - 2), cornerR);
  g.strokeStyle = COLORS.trayRimLight;
  g.lineWidth = 1.5;
  g.stroke();
}

// A carved cell "well": recessed interior with an inner shadow at the top-left
// and a light-catching wall at the bottom-right (light comes from top-left).
function drawCellWell(g, cx, cy, size) {
  const pts = hexCorners(cx, cy, size * 0.94);

  tracePolygon(g, pts);
  g.fillStyle = COLORS.wellBase;
  g.fill();

  g.save();
  tracePolygon(g, pts);
  g.clip();

  // Inner shadow, top-left.
  const sh = g.createLinearGradient(cx - size, cy - size, cx + size * 0.3, cy + size * 0.3);
  sh.addColorStop(0, COLORS.wellShadowTL);
  sh.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(cx - size, cy - size, size * 2, size * 2);

  // Light on the bottom-right interior wall.
  const li = g.createLinearGradient(cx + size, cy + size, cx - size * 0.3, cy - size * 0.3);
  li.addColorStop(0, COLORS.wellLightBR);
  li.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.fillStyle = li;
  g.fillRect(cx - size, cy - size, size * 2, size * 2);
  g.restore();

  // Thin grout outline.
  tracePolygon(g, pts);
  g.strokeStyle = COLORS.wellStroke;
  g.lineWidth = 1.25;
  g.stroke();
}

// Subtle film grain baked over the static layer to kill digital flatness.
function drawGrain(g) {
  const noise = document.createElement('canvas');
  noise.width = CANVAS_W;
  noise.height = CANVAS_H;
  const nctx = noise.getContext('2d');
  const img = nctx.createImageData(CANVAS_W, CANVAS_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);

  g.save();
  g.globalAlpha = 0.035;
  g.globalCompositeOperation = 'overlay';
  g.drawImage(noise, 0, 0);
  g.restore();
}

function drawGameOver(ctx, game) {
  // Dim the board.
  ctx.fillStyle = 'rgba(6, 10, 18, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cx = CANVAS_W / 2;
  ctx.textAlign = 'center';

  let title, color;
  if (game.winner === 'draw') {
    title = 'Draw';
    color = COLORS.headerText;
  } else {
    const isBub = game.winner === BUBBLES;
    title = (isBub ? 'Bubbles' : 'Crystals') + ' win';
    color = isBub ? COLORS.bubbleCore : COLORS.crystalCore;
  }

  ctx.fillStyle = color;
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, CANVAS_H / 2 - 30);

  ctx.fillStyle = COLORS.headerText;
  ctx.font = '18px system-ui, sans-serif';
  const sub = game.winner === 'draw'
    ? 'Equal tokens'
    : 'by ' + game.winMargin + ' token' + (game.winMargin === 1 ? '' : 's');
  ctx.fillText(sub, cx, CANVAS_H / 2 + 14);

  ctx.fillStyle = COLORS.headerSub;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Click to play again', cx, CANVAS_H / 2 + 48);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// ---- Coin-flip ceremony ----------------------------------------------------
// Reveals the randomised roles. The coin's two faces are the Bubble and Crystal
// tokens; it spins (squashing vertically as it rotates) and tosses, decelerating
// to land on the chosen faction.
function drawCeremony(ctx, game) {
  drawBackground(ctx);
  drawAmbiance(ctx, AMBIANCE_GAME, game.time);

  const c = game.ceremony;
  const toss = c.tosses[c.index];
  const t = game.time;
  const cx = CANVAS_W / 2, cy = 384;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Already-decided reveals, listed small at the top.
  for (let i = 0; i < c.index; i++) {
    const d = c.tosses[i];
    const yy = 56 + i * 24;
    ctx.fillStyle = COLORS.headerSub;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(d.result, cx, yy);
    ctx.fillStyle = d.target === BUBBLES ? COLORS.bubbleCore : COLORS.crystalCore;
    ctx.beginPath();
    ctx.arc(cx - ctx.measureText(d.result).width / 2 - 14, yy, 5, 0, TAU);
    ctx.fill();
  }

  // Short label ("AI side" / "First move").
  ctx.fillStyle = COLORS.headerText;
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText(toss.prompt, cx, 146);

  const coinSize = 196;
  if (c.phase === 'flip') {
    const p = Math.min(1, c.elapsed / CEREMONY.FLIP);
    // End on an even multiple of PI for Bubble (cos=+1), odd for Crystal (cos=-1).
    const finalAngle = (2 * CEREMONY.SPINS + (toss.target === BUBBLES ? 0 : 1)) * Math.PI;
    const angle = finalAngle * easeOutCubic(p);
    const cosv = Math.cos(angle);
    const sy = Math.max(0.05, Math.abs(cosv));
    const face = cosv >= 0 ? BUBBLES : CRYSTALS;
    const arc = Math.sin(Math.PI * p) * CEREMONY.TOSS_H;
    drawCoin(ctx, cx, cy - arc, coinSize, face, sy, t);
  } else {
    // 'reveal' (pop + expanding ring) or 'hold' (settled during the final pause).
    const settled = c.phase === 'hold';
    const p = Math.min(1, c.elapsed / CEREMONY.REVEAL);
    const fc = toss.target === BUBBLES ? COLORS.bubbleCore : COLORS.crystalCore;
    if (!settled) {
      const rp = easeOutCubic(Math.min(1, p * 1.6)); // celebratory ring
      ctx.save();
      ctx.globalAlpha = 1 - rp;
      ctx.strokeStyle = fc;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, coinSize * 0.6 + rp * 70, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    const pop = settled ? 1 : 1 + 0.12 * Math.sin(Math.min(1, p * 2.2) * Math.PI);
    drawCoin(ctx, cx, cy, coinSize * pop, toss.target, 1, t);
    ctx.fillStyle = fc;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(toss.result, cx, 544);
  }

  ctx.fillStyle = COLORS.headerSub;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('click to skip', cx, CANVAS_H - 28);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// A coin face (a faction token) squashed vertically by `sy` (the flip), with a
// bright edge sheen when it's near edge-on.
function drawCoin(ctx, cx, cy, size, faction, sy, t) {
  placeBody(ctx, faction, cx, cy, size, t, 0.3, 1, sy, 1);
  if (sy < 0.32) {
    ctx.save();
    ctx.globalAlpha = (0.32 - sy) / 0.32;
    ctx.strokeStyle = 'rgba(235,245,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.6, Math.max(1.5, size * 0.6 * sy), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHeader(ctx, game) {
  const { board } = game;
  const counts = countTokens(board);

  // Title / mode label
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.headerText;
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Xsolla Hexxagon', LAYOUT.MARGIN, 18);

  ctx.fillStyle = COLORS.headerSub;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(game.modeLabel || 'Board', LAYOUT.MARGIN, 46);

  // Turn indicator: colored dot + "<faction> to move".
  if (game.currentPlayer) {
    const isBub = game.currentPlayer === BUBBLES;
    const label = (isBub ? 'Bubbles' : 'Crystals') + ' to move';
    const tx = LAYOUT.MARGIN, ty = 68;
    ctx.beginPath();
    ctx.arc(tx + 6, ty + 7, 6, 0, Math.PI * 2);
    ctx.fillStyle = isBub ? COLORS.bubbleCore : COLORS.crystalCore;
    ctx.fill();
    ctx.fillStyle = COLORS.headerText;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(label, tx + 18, ty);
  }

  // Score pills (shifted left to leave room for the HUD button column).
  drawScorePill(ctx, CANVAS_W - LAYOUT.MARGIN - 146, 20, COLORS.bubbleCore, counts.bubbles);
  drawScorePill(ctx, CANVAS_W - LAYOUT.MARGIN - 250, 20, COLORS.crystalCore, counts.crystals);

  // HUD icon buttons, top-right corner: sound (3-state) above power (to menu).
  const bx = CANVAS_W - LAYOUT.MARGIN - 30;
  const soundRect = { x: bx, y: 16, w: 30, h: 30 };
  const powerRect = { x: bx, y: 52, w: 30, h: 30 };
  game.soundBtnRect = soundRect;
  game.powerBtnRect = powerRect;
  drawHudButton(ctx, soundRect);
  drawSoundIcon(ctx, soundRect.x + 15, soundRect.y + 15, 8, game.soundState);
  drawHudButton(ctx, powerRect);
  drawPowerIcon(ctx, powerRect.x + 15, powerRect.y + 15, 8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// Rounded-square HUD button background.
function drawHudButton(ctx, r) {
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = COLORS.btnFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.btnStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Power symbol: a ring with a gap at the top and a vertical bar through it.
function drawPowerIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = COLORS.headerSub;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.8, (-90 + 42) * Math.PI / 180, (-90 - 42) * Math.PI / 180 + TAU, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 1.05);
  ctx.lineTo(cx, cy - s * 0.05);
  ctx.stroke();
  ctx.restore();
}

// Sound button with three states: 'on' (speaker + waves), 'musicoff' (crossed
// note), 'off' (muted speaker with an X).
function drawSoundIcon(ctx, cx, cy, s, state) {
  const color = state === 'on' ? COLORS.headerText : COLORS.headerSub;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.6;

  if (state === 'musicoff') {
    // A musical note with a slash — music specifically off.
    const nx = cx - s * 0.15;
    ctx.beginPath();
    ctx.ellipse(nx - s * 0.28, cy + s * 0.5, s * 0.3, s * 0.22, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx, cy + s * 0.5);
    ctx.lineTo(nx, cy - s * 0.6);
    ctx.lineTo(nx + s * 0.5, cy - s * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, cy + s * 0.9);
    ctx.lineTo(cx + s * 0.9, cy - s * 0.9);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Speaker body (used by 'on' and 'off').
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy - s * 0.25);
  ctx.lineTo(cx - s * 0.5, cy - s * 0.25);
  ctx.lineTo(cx - s * 0.05, cy - s * 0.6);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.6);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.25);
  ctx.lineTo(cx - s * 0.85, cy + s * 0.25);
  ctx.closePath();
  ctx.fill();

  if (state === 'on') {
    ctx.beginPath();
    ctx.arc(cx - s * 0.05, cy, s * 0.55, -0.7, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - s * 0.05, cy, s * 0.95, -0.7, 0.7);
    ctx.stroke();
  } else { // 'off' — muted X
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.2, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.9, cy + s * 0.5);
    ctx.moveTo(cx + s * 0.9, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScorePill(ctx, x, y, color, value) {
  const w = 90, h = 40, r = 10;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 18, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.headerText;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x + 36, y + h / 2 + 1);
  ctx.textBaseline = 'top';
}

const TAU = Math.PI * 2;

// Draw all settled tokens. Cells currently "owned" by an in-flight animation
// are skipped here (drawAnimations renders them instead).
function drawTokens(ctx, game) {
  const board = game.board, t = game.time;
  const occ = game.occludedCells;
  for (const cell of board.cells.values()) {
    if (cell.owner === EMPTY) continue;
    if (occ && occ.has(hexKey(cell.q, cell.r))) continue;
    const { x, y } = axialToPixel(cell.q, cell.r, board.size, board.origin);
    if (cell.owner === BUBBLES) {
      // Bubbles are alive: they float (bob) and gently breathe (volume-preserving).
      const seed = cellSeed(cell.q, cell.r);
      const bob = Math.sin(t / 720 + seed * TAU) * board.size * 0.06;
      const breathe = 1 + 0.02 * Math.sin(t / 900 + seed * TAU);
      drawContactShadow(ctx, x, y, board.size, 1);
      placeBody(ctx, BUBBLES, x, y + bob, board.size, t, seed, breathe, 1 / breathe, 1);
    } else {
      drawContactShadow(ctx, x, y, board.size, 1);
      placeBody(ctx, CRYSTALS, x, y, board.size, t, 0, 1, 1, 1);
    }
  }
}

// Render in-flight move/spawn animations. Logical board state already updated;
// these are purely cosmetic and draw the animating cell in motion.
function drawAnimations(ctx, game) {
  const board = game.board, t = game.time, size = board.size;
  for (const a of game.animations) {
    if (a.type === 'convert') { drawConversion(ctx, game, a); continue; }
    if (a.elapsed <= 0) continue; // still in its start delay -> invisible
    const p = Math.min(1, a.elapsed / a.dur);
    const seed = cellSeed(a.to.q, a.to.r);
    const to = axialToPixel(a.to.q, a.to.r, size, board.origin);

    if (a.type === 'spawn') {
      // Pop out of the cell center with a little overshoot.
      const s = Math.max(0, easeOutBack(p));
      const alpha = Math.min(1, p * 2.2);
      drawContactShadow(ctx, to.x, to.y, size, s);
      placeBody(ctx, a.faction, to.x, to.y, size, t, seed, s, s, alpha);

    } else if (a.type === 'clone') {
      // A new token buds off the origin and travels to the destination, growing.
      const from = axialToPixel(a.from.q, a.from.r, size, board.origin);
      const e = easeInOutCubic(p);
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e;
      const s = 0.25 + 0.75 * easeOutCubic(p);
      drawContactShadow(ctx, x, y, size, s * 0.85);
      placeBody(ctx, a.faction, x, y, size, t, seed, s, s, 1);

    } else { // jump — a literal arcing leap
      const from = axialToPixel(a.from.q, a.from.r, size, board.origin);
      const e = easeInOutCubic(p);
      const gx = from.x + (to.x - from.x) * e;
      const gy = from.y + (to.y - from.y) * e;
      const arcN = Math.sin(Math.PI * p);         // 0 -> 1 -> 0 over the jump
      const airY = gy - arcN * size * 1.15;        // hop height
      const stretch = 1 + 0.16 * arcN;             // stretch vertically mid-air
      const squash = 1 - 0.12 * arcN;
      drawContactShadow(ctx, gx, gy, size, 1 - 0.55 * arcN);
      placeBody(ctx, a.faction, gx, airY, size, t, seed, squash, stretch, 1);
    }
  }
}

// Place a faction body at (cx,cy) with scale (sx,sy) and optional alpha.
function placeBody(ctx, faction, cx, cy, size, t, seed, sx, sy, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (faction === BUBBLES) drawBubbleBody(ctx, size, t, seed);
  else drawCrystalBody(ctx, size, t, seed);
  ctx.restore();
}

// Soft contact shadow grounding a token into its cell (light from top-left).
// `strength` in [0,1] scales darkness/size (a leaping token lifts off its shadow).
function drawContactShadow(ctx, cx, groundY, size, strength) {
  if (strength <= 0.02) return;
  const sx = cx + size * 0.06;
  const sy = groundY + size * 0.5;
  const rx = size * 0.62 * (0.6 + 0.4 * strength);
  const ry = rx * 0.42;
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
  grad.addColorStop(0, 'rgba(0,0,0,' + (0.45 * strength).toFixed(3) + ')');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// Deterministic per-cell pseudo-random in [0,1) so each bubble bobs/wobbles
// with its own phase, without storing per-token state.
function cellSeed(q, r) {
  const h = Math.sin(q * 127.1 + r * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
function easeInOutCubic(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
function easeOutBack(p) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// New-token pop curve: 10% -> 120% (overshoot) -> 100%.
function popScale(tp) {
  if (tp <= 0) return 0.1;
  if (tp >= 1) return 1.0;
  if (tp < 0.6) return 0.1 + (1.2 - 0.1) * easeOutCubic(tp / 0.6);
  return 1.2 + (1.0 - 1.2) * easeInOutCubic((tp - 0.6) / 0.4);
}

function factionParticleColor(faction) {
  return faction === BUBBLES ? '#8fd0ff' : '#ff7b86';
}

// Conversion: hold the enemy token during the lead-in, then stream particles
// from the landed token to each converted cell while the enemy shrinks out and
// the mover's token pops in. Occlusion keeps the static pass off these cells.
function drawConversion(ctx, game, a) {
  const board = game.board, t = game.time, size = board.size;
  const p = Math.min(1, a.elapsed / a.dur);
  const leadFrac = a.lead / a.dur;
  const streamP = leadFrac >= 1 ? 0 : clamp01((p - leadFrac) / (1 - leadFrac));
  const mover = a.faction;
  const enemy = OPPONENT[mover];
  const S = axialToPixel(a.from.q, a.from.r, size, board.origin);

  // Target tokens: the enemy resists first — squeezing and shaking as if
  // unwilling — for most of its window, then collapses as the mover pops in.
  const RESIST_END = 0.65; // fraction of the per-token window spent resisting
  for (const tg of a.targets) {
    const T = axialToPixel(tg.q, tg.r, size, board.origin);
    const seed = cellSeed(tg.q, tg.r);
    const tp = clamp01((streamP - tg.stagger) / (1 - tg.stagger));

    if (tp <= 0) {
      // Calm enemy, not yet touched by the stream.
      drawContactShadow(ctx, T.x, T.y, size, 1);
      placeBody(ctx, enemy, T.x, T.y, size, t, seed, 1, 1, 1);

    } else if (tp < RESIST_END) {
      // RESIST: old token trembles and squeezes, slowly compressed. No new token yet.
      const k = tp / RESIST_END;                     // 0..1 through the resist
      const base = 1 - 0.12 * k;                     // gradually compressed
      const amp = 0.05 + 0.15 * k;                   // squeeze grows more violent
      const sq = Math.sin(t / 46 + seed * TAU);
      const sx = base * (1 + amp * sq);
      const sy = base * (1 - amp * sq);              // opposite axes -> squeeze
      const shake = size * (0.015 + 0.055 * k);      // trembling grows
      const ox = shake * Math.sin(t / 30 + seed * 9);
      const oy = shake * Math.sin(t / 25 + seed * 5 + 1.3);
      drawContactShadow(ctx, T.x, T.y, size, 1);
      placeBody(ctx, enemy, T.x + ox, T.y + oy, size, t, seed, sx, sy, 1);

    } else {
      // COLLAPSE + POP: resistance breaks; old collapses, new token pops in.
      const u = (tp - RESIST_END) / (1 - RESIST_END); // 0..1
      const oldS = 1 - u * u * u;                     // ease-in shrink to 0
      const newS = popScale(u);                       // 10% -> 120% -> 100%
      const shake = size * 0.05 * (1 - u);            // last throes, fading
      const ox = shake * Math.sin(t / 28 + seed * 9);
      const oy = shake * Math.sin(t / 24 + seed * 5 + 1.3);
      drawContactShadow(ctx, T.x, T.y, size, Math.max(oldS, Math.min(1, newS)));
      if (oldS > 0.02) {
        const squash = 1 + 0.35 * u;                  // flattens as it gives in
        placeBody(ctx, enemy, T.x + ox, T.y + oy, size, t, seed, oldS * squash, oldS / squash, oldS);
      }
      placeBody(ctx, mover, T.x, T.y, size, t, seed, newS, newS, 1);
    }
  }

  // Particle streams (coloured by the converting faction), drawn on top.
  if (streamP > 0) {
    const env = streamP < 0.15 ? streamP / 0.15 : streamP > 0.85 ? (1 - streamP) / 0.15 : 1;
    const col = factionParticleColor(mover);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tg of a.targets) {
      const T = axialToPixel(tg.q, tg.r, size, board.origin);
      drawParticleStream(ctx, S, T, tg.particles, t, size, col, env);
    }
    ctx.restore();
  }
}

// A stream of dots and '+' signs from S to T, shaped as a cone with a cut-off
// top: narrow at the source, widening toward the target (a frustum).
function drawParticleStream(ctx, S, T, particles, t, size, color, env) {
  const dx = T.x - S.x, dy = T.y - S.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // along the stream
  const nx = -uy, ny = ux;              // perpendicular
  const topHalf = size * 0.05, baseHalf = size * 0.34; // narrow top -> wide base
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const part of particles) {
    const along = (part.phase + t * 0.0009 * part.speed) % 1;
    const half = topHalf + (baseHalf - topHalf) * along;
    const off = part.lateral * half;
    const bx = S.x + ux * len * along + nx * off;
    const by = S.y + uy * len * along + ny * off;
    let alpha = env;
    if (along < 0.12) alpha *= along / 0.12;
    else if (along > 0.9) alpha *= (1 - along) / 0.1;
    if (alpha <= 0.03) continue;
    ctx.globalAlpha = alpha;
    const ps = size * 0.06 * part.psize;
    if (part.plus) {
      ctx.lineWidth = Math.max(1, ps * 0.45);
      ctx.beginPath();
      ctx.moveTo(bx - ps, by); ctx.lineTo(bx + ps, by);
      ctx.moveTo(bx, by - ps); ctx.lineTo(bx, by + ps);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(bx, by, ps * 0.55, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Highlight the cell under the cursor (subtle) during the player's turn.
function drawHoverHighlight(ctx, game) {
  if (game.gameOver || !game.hoverCell) return;
  const board = game.board;
  const cell = getCell(board, game.hoverCell.q, game.hoverCell.r);
  if (!cell) return;
  const { x, y } = axialToPixel(cell.q, cell.r, board.size, board.origin);
  tracePolygon(ctx, hexCorners(x, y, board.size * 0.94));
  ctx.fillStyle = COLORS.hoverFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Highlight legal destinations for the selected token, distinguishing
// clone-range (distance 1) from jump-range (distance 2). Gently breathes.
function drawHints(ctx, game) {
  const board = game.board;
  const pulse = 0.5 + 0.5 * Math.sin(game.time / 380);
  ctx.save();
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  for (const d of game.legalDests) {
    const { x, y } = axialToPixel(d.q, d.r, board.size, board.origin);
    tracePolygon(ctx, hexCorners(x, y, board.size * 0.94));
    ctx.fillStyle = d.type === 'clone' ? COLORS.cloneHint : COLORS.jumpHint;
    ctx.fill();
    ctx.strokeStyle = COLORS.hintStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // A small centered marker: solid dot for clone, hollow ring for jump.
    const mr = board.size * (0.15 + 0.02 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, mr, 0, Math.PI * 2);
    if (d.type === 'clone') {
      ctx.fillStyle = COLORS.hintStroke;
      ctx.fill();
    } else {
      ctx.strokeStyle = COLORS.hintStroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Ring around the currently selected token, with a breathing glow.
function drawSelection(ctx, game) {
  if (!game.selected) return;
  const board = game.board;
  const { x, y } = axialToPixel(game.selected.q, game.selected.r, board.size, board.origin);
  const pulse = 0.5 + 0.5 * Math.sin(game.time / 300);
  ctx.save();
  ctx.shadowColor = COLORS.selectRing;
  ctx.shadowBlur = 8 + pulse * 12;
  tracePolygon(ctx, hexCorners(x, y, board.size * 0.98));
  ctx.strokeStyle = COLORS.selectRing;
  ctx.lineWidth = 3 + pulse * 1.5;
  ctx.stroke();
  ctx.restore();
}

// Bubble: a living, translucent soap bubble drawn centered at the origin.
// - wobbling outline (organic deformation over time)
// - faint blue interior so the board shows through (transparency)
// - rotating thin-film interference (iridescent sheen)
// - bright crisp rim + specular highlights + a soft outer halo
function drawBubbleBody(ctx, size, t, seed) {
  const r = size * 0.6;
  const ph = seed * TAU;

  // Organic wobble outline (two low harmonics drifting out of phase).
  const N = 40;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const wob = 1
      + 0.035 * Math.sin(3 * th + t / 520 + ph)
      + 0.022 * Math.sin(2 * th - t / 780 + ph * 1.7);
    pts.push({ x: Math.cos(th) * r * wob, y: Math.sin(th) * r * wob });
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < N; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };

  // Soft outer halo.
  ctx.save();
  ctx.shadowColor = 'rgba(120,190,255,0.55)';
  ctx.shadowBlur = size * 0.14;
  path();
  ctx.strokeStyle = 'rgba(150,205,255,0.30)';
  ctx.lineWidth = size * 0.045;
  ctx.stroke();
  ctx.restore();

  // Translucent interior + iridescence, clipped to the bubble.
  ctx.save();
  path();
  ctx.clip();

  const body = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r * 1.05);
  body.addColorStop(0, 'rgba(90,150,235,0.10)');
  body.addColorStop(0.6, 'rgba(70,135,225,0.16)');
  body.addColorStop(0.85, 'rgba(120,180,255,0.34)');
  body.addColorStop(1, 'rgba(185,222,255,0.52)');
  ctx.fillStyle = body;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);

  // Thin-film interference: rotating iridescent smears (additive screen blend).
  ctx.globalCompositeOperation = 'screen';
  const irid = [
    'rgba(120,255,235,0.20)', // cyan
    'rgba(255,150,235,0.18)', // magenta
    'rgba(255,235,150,0.18)', // gold
    'rgba(150,255,180,0.18)', // green
  ];
  for (let i = 0; i < irid.length; i++) {
    const a = t / 2600 + ph + i * (TAU / irid.length);
    const px = Math.cos(a) * r * 0.5;
    const py = Math.sin(a) * r * 0.5;
    const gr = ctx.createRadialGradient(px, py, 0, px, py, r * 0.85);
    gr.addColorStop(0, irid[i]);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  }
  ctx.restore();

  // Bright crisp rim.
  path();
  ctx.strokeStyle = 'rgba(225,242,255,0.85)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Specular highlights.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.4, r * 0.3, r * 0.18, -0.5, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.28, r * 0.26, r * 0.09, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.restore();
}

// Crystal: a luminous, translucent step-cut ruby (origin-centered).
// Structure: a bright inner "table" facet + 6 "crown" facets around it, each
// shaded with alternating brightness for a crystalline, non-flat look, over an
// inner glow so the stone reads luminous rather than dark. Idle behaviour:
// - gradually shifts its hue (kept in the red range)
// - a light flash sweeps its facets once in a while, plus a twinkling sparkle
function drawCrystalBody(ctx, size, t, seed) {
  const r = size * 0.66;
  const ph = seed * TAU;
  const H = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';

  // Gradual reddish colour shift.
  const shift = Math.sin(t / 2200 + ph);  // -1..1
  const hue = 353 + 14 * shift;           // deep crimson .. red-orange (stays red)
  const hueDeep = (hue - 8 + 360) % 360;

  const V = hexCorners(0, 0, r);          // outer silhouette vertices
  const inner = 0.5;
  const I = V.map((p) => ({ x: p.x * inner, y: p.y * inner })); // table vertices
  const lightAng = -2.356;                // light from top-left

  // Reddish halo.
  ctx.save();
  ctx.shadowColor = H(hue, 90, 55, 0.55);
  ctx.shadowBlur = size * 0.14;
  tracePolygon(ctx, V);
  ctx.strokeStyle = H(hue, 90, 62, 0.30);
  ctx.lineWidth = size * 0.05;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  tracePolygon(ctx, V);
  ctx.clip();

  // Inner glow — luminous body so the gem isn't a dark blob.
  const glow = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.05);
  glow.addColorStop(0, H(hue, 95, 66, 0.80));
  glow.addColorStop(0.65, H(hue, 92, 52, 0.64));
  glow.addColorStop(1, H(hueDeep, 88, 38, 0.52));
  ctx.fillStyle = glow;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);

  // Crown facets (trapezoids) — brightness varies by facing + alternates so
  // neighbours contrast and the cut sparkles instead of reading flat.
  for (let i = 0; i < 6; i++) {
    const a1 = V[i], a2 = V[(i + 1) % 6], b2 = I[(i + 1) % 6], b1 = I[i];
    const mx = (a1.x + a2.x) / 2, my = (a1.y + a2.y) / 2;
    const lit = 0.5 + 0.5 * Math.cos(Math.atan2(my, mx) - lightAng); // 0..1
    const L = 30 + 34 * lit + (i % 2 ? 7 : -7);
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.closePath();
    ctx.fillStyle = H(hue, 88, L, 0.55);
    ctx.fill();
  }

  // Table (top facet) — bright, with a soft top-left highlight.
  tracePolygon(ctx, I);
  ctx.fillStyle = H(hue, 85, 63, 0.6);
  ctx.fill();
  const tg = ctx.createRadialGradient(-r * 0.16, -r * 0.18, 0, -r * 0.16, -r * 0.18, r * 0.55);
  tg.addColorStop(0, 'rgba(255,240,242,0.5)');
  tg.addColorStop(1, 'rgba(255,240,242,0)');
  tracePolygon(ctx, I);
  ctx.fillStyle = tg;
  ctx.fill();

  // Light flash sweeping diagonally across the facets, once in a while.
  const period = 3200 + seed * 1600;
  const fp = ((t + seed * 4000) % period) / period;
  const flashFrac = 0.3;
  if (fp < flashFrac) {
    const a = fp / flashFrac;
    const ease = Math.sin(Math.PI * a);
    const dx = Math.SQRT1_2, dy = Math.SQRT1_2, s = r * 1.3;
    const g = ctx.createLinearGradient(-s * dx, -s * dy, s * dx, s * dy);
    g.addColorStop(Math.max(0, a - 0.16), 'rgba(255,235,240,0)');
    g.addColorStop(a, 'rgba(255,242,246,' + (0.7 * ease).toFixed(2) + ')');
    g.addColorStop(Math.min(1, a + 0.16), 'rgba(255,235,240,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
  }
  ctx.restore();

  // Bright cut lines: radial crown edges + the table outline.
  ctx.strokeStyle = H(hue, 100, 82, 0.38);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { ctx.moveTo(V[i].x, V[i].y); ctx.lineTo(I[i].x, I[i].y); }
  ctx.stroke();
  tracePolygon(ctx, I);
  ctx.stroke();

  // Crisp bright outline.
  tracePolygon(ctx, V);
  ctx.strokeStyle = H(hue, 100, 84, 0.75);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Twinkling sparkle on an upper facet.
  const twinkle = 0.55 + 0.45 * Math.sin(t / 480 + ph);
  const spx = -r * 0.4, spy = -r * 0.48, sl = r * 0.22;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(255,242,246,' + (0.7 * twinkle).toFixed(2) + ')';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(spx - sl, spy); ctx.lineTo(spx + sl, spy);
  ctx.moveTo(spx, spy - sl); ctx.lineTo(spx, spy + sl);
  ctx.stroke();
  ctx.restore();
}

// ---- small canvas helpers -----------------------------------------------

// Flat-top hexagon corners (vertices at 0°, 60°, ... 300°).
function flatTopHexCorners(cx, cy, radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return pts;
}

// A point `dist` away from `from`, heading toward `to`.
function trimPoint(from, to, dist) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
}

// Trace a polygon with rounded corners (radius clamped to half the shortest edge).
function roundedPolygon(ctx, pts, radius) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const r = Math.min(radius,
      Math.hypot(curr.x - prev.x, curr.y - prev.y) / 2,
      Math.hypot(curr.x - next.x, curr.y - next.y) / 2);
    const a = trimPoint(curr, prev, r);
    const b = trimPoint(curr, next, r);
    if (i === 0) ctx.moveTo(a.x, a.y);
    else ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(curr.x, curr.y, b.x, b.y);
  }
  ctx.closePath();
}

function tracePolygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
