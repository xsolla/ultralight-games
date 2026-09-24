// ============================================================================
// buildui.js — the in-run controls that are not the shared HUD buttons: the
// build button, the "tech spec" build popup it opens, and the behaviour menu a
// tapped ship raises (CLAUDE.md §11). Layout AND drawing, like menu.js: every
// rect comes from a pure function of its arguments, the painter draws from it
// and game.js hit-tests through it, so what is tapped is what was drawn. It
// never mutates state and never handles input.
//
// The popup's control ids are opaque strings; game.js dispatches on the rect's
// `kind` and `i`, never by parsing an id.
// ============================================================================

// ---- Palette: the tech-sheet look -------------------------------------------
const TECH = {
  panel: 'rgba(5, 13, 26, 0.95)',
  grid: 'rgba(127, 212, 255, 0.05)',
  gridFine: 'rgba(127, 212, 255, 0.07)',
  edge: 'rgba(127, 212, 255, 0.42)',
  bracket: '#7fd4ff',
  rule: 'rgba(127, 212, 255, 0.22)',
  label: '#6f86a8',
  text: '#dfe9f6',
  accent: '#7fd4ff',
  chip: 'rgba(127, 212, 255, 0.05)',
  chipHot: 'rgba(127, 212, 255, 0.12)',
  chipOn: 'rgba(127, 212, 255, 0.18)',
  chipEdge: 'rgba(127, 212, 255, 0.28)',
  chipEdgeOn: 'rgba(160, 228, 255, 0.85)',
  segOn: '#7fd4ff',
  segOff: 'rgba(127, 212, 255, 0.13)',
  go: '#6fe39a',
  scrim: 'rgba(2, 6, 14, 0.5)',
  btnTop: '#a9e7ff',
  btnBot: '#4bb4e6',
  btnTopHot: '#c9f2ff',
  btnBotHot: '#63c8f4',
  onBtn: '#04101c',
};

// ---- The build button ----------------------------------------------------------
function buildButtonRect() {
  const b = LAYOUT.BUILD_BTN;
  return { x: b.x, y: b.y, w: b.size, h: b.size };
}

function buildButtonAt(px, py) {
  const r = buildButtonRect(), k = 4;
  return px >= r.x - k && px <= r.x + r.w + k && py >= r.y - k && py <= r.y + r.h + k;
}

// ---- The build popup: geometry --------------------------------------------------
// All y values are offsets from the popup's top edge. The popup ends above the
// horizon, so the planet stays visible beneath it.
const POP = {
  X: 14, Y: 64, W: 332, H: 480,
  PAD: 12,
  CHAMFER: 12,
  HEAD_Y: 16, RULE1: 30,
  TAB_Y: 38, TAB_H: 28, TAB_GAP: 4,
  BP_Y: 76, BP_H: 128, BP_W: 132,         // the blueprint box
  RULE2: 214,
  ARM_Y: 224,                             // "ARMAMENT" label baseline
  GUN_Y: 234, GUN_H: 32, GUN_GAP: 4,
  STAT_Y: 282, STAT_ROW: 16,
  RULE3: 318,
  LVL_Y: 328, LVL_H: 28, LVL_W: 36, LVL_GAP: 5,
  COST_Y: 374,
  RULE4: 412,
  BTN_Y: 424, BTN_H: 42, CLOSE_W: 104,
  OPEN_MS: 140,                           // fade-in
};
const MEDIC_TAB = HULLS.length;           // the fourth hull tab is the healer
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

function popupRect() {
  return { x: POP.X, y: POP.Y, w: POP.W, h: POP.H };
}

// What the popup's current selection would order.
function selectedOrder(sel) {
  return sel.tab === MEDIC_TAB
    ? { kind: 'healer' }
    : { kind: 'ship', hull: sel.tab, gun: sel.gun, level: sel.level };
}

// Every pressable control, from the selection and the wave phase. `enabled` is
// what the painter dims and what the press honours — one source for both.
function popupControlRects(sel, phase, money) {
  const x0 = POP.X + POP.PAD, inner = POP.W - POP.PAD * 2;
  const rects = [];

  const tabs = HULLS.length + 1;
  const tw = (inner - (tabs - 1) * POP.TAB_GAP) / tabs;
  for (let i = 0; i < tabs; i++) {
    rects.push({ id: 'tab' + i, kind: 'tab', i,
                 x: x0 + i * (tw + POP.TAB_GAP), y: POP.Y + POP.TAB_Y, w: tw, h: POP.TAB_H,
                 enabled: i !== MEDIC_TAB || phase === 'break' });
  }

  if (sel.tab !== MEDIC_TAB) {
    const gw = (inner - (GUNS.length - 1) * POP.GUN_GAP) / GUNS.length;
    GUNS.forEach((g, i) => rects.push({
      id: 'gun' + i, kind: 'gun', i,
      x: x0 + i * (gw + POP.GUN_GAP), y: POP.Y + POP.GUN_Y, w: gw, h: POP.GUN_H,
      enabled: canMount(sel.tab, i),
    }));
    for (let l = 1; l <= GUN_LEVELS; l++) {
      rects.push({ id: 'lvl' + l, kind: 'lvl', i: l,
                   x: x0 + 44 + (l - 1) * (POP.LVL_W + POP.LVL_GAP), y: POP.Y + POP.LVL_Y,
                   w: POP.LVL_W, h: POP.LVL_H, enabled: true });
    }
  }

  const by = POP.Y + POP.BTN_Y;
  rects.push({ id: 'close', kind: 'close', x: x0, y: by, w: POP.CLOSE_W, h: POP.BTN_H, enabled: true });
  rects.push({ id: 'build', kind: 'build', x: x0 + POP.CLOSE_W + 8, y: by,
               w: inner - POP.CLOSE_W - 8, h: POP.BTN_H,
               enabled: !orderBlocker(selectedOrder(sel), phase, money) });
  return rects;
}

// The control under a point: its rect, the string 'inside' for the popup's own
// surface (the popup is modal, so that press is swallowed), or null outside it.
function popupHit(px, py, sel, phase, money) {
  for (const r of popupControlRects(sel, phase, money)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
  }
  const p = popupRect();
  return (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) ? 'inside' : null;
}

// ---- The behaviour menu: geometry -----------------------------------------------
// Anchored where the ship was when it was tapped rather than following it, so
// the options hold still under the finger while the ship flies on; a leader
// line keeps the two connected.
const BEH = { W: 212, H: 74, PAD: 8, BTN_H: 38, GAP: 6, OFFSET: 24, TOP_MIN: 58 };

function behaviourMenuRect(menu) {
  let y = menu.ay - BEH.OFFSET - BEH.H;
  if (y < BEH.TOP_MIN) y = menu.ay + BEH.OFFSET;
  const x = clamp(menu.ax - BEH.W / 2, 6, CANVAS_W - 6 - BEH.W);
  return { x, y, w: BEH.W, h: BEH.H };
}

function behaviourMenuRects(menu) {
  const m = behaviourMenuRect(menu);
  const bw = (BEH.W - BEH.PAD * 2 - BEH.GAP * (BEHAVIOURS.length - 1)) / BEHAVIOURS.length;
  return BEHAVIOURS.map((b, i) => ({
    id: 'beh' + i, kind: 'beh', key: b.key,
    x: m.x + BEH.PAD + i * (bw + BEH.GAP), y: m.y + m.h - BEH.PAD - BEH.BTN_H, w: bw, h: BEH.BTN_H,
  }));
}

function behaviourMenuHit(px, py, menu) {
  for (const r of behaviourMenuRects(menu)) {
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
  }
  const m = behaviourMenuRect(menu);
  return (px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h) ? 'inside' : null;
}

// ---- Drawing -------------------------------------------------------------------
function drawBuildUi(ctx, game) {
  if (game.menu) drawBehaviourMenu(ctx, game);
  drawBuildButton(ctx, game);
  if (game.popup) drawBuildPopup(ctx, game);
}

// A rectangle with its corners cut — the one shape the tech UI is made of.
// `mask` picks corners: 1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left.
function chamferPath(ctx, x, y, w, h, c, mask) {
  const m = mask === undefined ? 15 : mask;
  const tl = m & 1 ? c : 0, tr = m & 2 ? c : 0, br = m & 4 ? c : 0, bl = m & 8 ? c : 0;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.lineTo(x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.lineTo(x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.lineTo(x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.closePath();
}

// The Interceptor as a flat cyan silhouette, for the build button. Built once
// from the atlas with a 'source-in' fill — no pixels read back.
let silhouetteCache = null;
function shipSilhouette() {
  if (silhouetteCache || !SpriteKit.has('ships')) return silhouetteCache;
  const f = SpriteKit.SHIP_FRAMES[0];
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.hullH;                     // the hull only; the plume is not part of the icon
  const g = c.getContext('2d');
  g.drawImage(SpriteKit.imgs.ships, f.x[0], f.y, f.w, f.hullH, 0, 0, f.w, f.hullH);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = TECH.accent;
  g.fillRect(0, 0, f.w, f.hullH);
  silhouetteCache = c;
  return c;
}

function drawBuildButton(ctx, game) {
  const r = buildButtonRect();
  const hot = game.hover === 'build' || game.popup;
  ctx.save();
  chamferPath(ctx, r.x, r.y, r.w, r.h, 9, 1 | 4);
  ctx.fillStyle = hot ? 'rgba(12, 30, 54, 0.88)' : 'rgba(5, 13, 26, 0.78)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? TECH.chipEdgeOn : TECH.edge;
  ctx.stroke();

  // The silhouette, and the + that says "make one".
  const sil = shipSilhouette();
  if (sil) {
    const w = 22, h = w * sil.height / sil.width;
    ctx.globalAlpha = hot ? 1 : 0.88;
    ctx.drawImage(sil, r.x + r.w / 2 - w / 2 - 3, r.y + r.h / 2 - h / 2 + 2, w, h);
    ctx.globalAlpha = 1;
  }
  const px = r.x + r.w - 13, py = r.y + 13;
  ctx.strokeStyle = TECH.text;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py);
  ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5);
  ctx.stroke();

  // The queue: progress along the bottom edge, and a count once there is a wait.
  const q = game.yard.queue.length;
  if (q > 0) {
    const pw = (r.w - 12) * yardProgress(game.yard);
    ctx.fillStyle = TECH.segOff;
    ctx.fillRect(r.x + 6, r.y + r.h - 7, r.w - 12, 3);
    ctx.fillStyle = TECH.go;
    ctx.fillRect(r.x + 6, r.y + r.h - 7, pw, 3);
  }
  if (q > 1) {
    ctx.fillStyle = TECH.accent;
    ctx.font = `700 9px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('×' + q, r.x + 6, r.y + 10);
  }
  ctx.restore();
}

function drawBuildPopup(ctx, game) {
  const sel = game.sel;
  const phase = game.waves.phase;
  const order = selectedOrder(sel);
  const p = popupRect();
  const t = game.time;
  const a = Math.min(1, game.popupMs / POP.OPEN_MS);

  ctx.save();
  ctx.globalAlpha = a;
  // Knock the field back so the sheet reads as in front of it, not as part of it.
  ctx.fillStyle = TECH.scrim;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel, grid, edge and corner brackets.
  chamferPath(ctx, p.x, p.y, p.w, p.h, POP.CHAMFER);
  ctx.fillStyle = TECH.panel;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = TECH.grid;
  for (let gx = p.x + 6; gx < p.x + p.w; gx += 12) ctx.fillRect(gx, p.y, 1, p.h);
  for (let gy = p.y + 6; gy < p.y + p.h; gy += 12) ctx.fillRect(p.x, gy, p.w, 1);
  ctx.restore();
  chamferPath(ctx, p.x, p.y, p.w, p.h, POP.CHAMFER);
  ctx.lineWidth = 1;
  ctx.strokeStyle = TECH.edge;
  ctx.stroke();
  drawBrackets(ctx, p.x, p.y, p.w, p.h, POP.CHAMFER);

  // Header
  const x0 = p.x + POP.PAD, x1 = p.x + p.w - POP.PAD;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const blink = Math.floor(t / 520) % 2 === 0;
  ctx.fillStyle = blink ? TECH.go : 'rgba(111, 227, 154, 0.35)';
  ctx.fillRect(x0, p.y + POP.HEAD_Y - 3, 6, 6);
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = TECH.text;
  ctx.fillText('SHIPYARD', x0 + 12, p.y + POP.HEAD_Y);
  ctx.font = `500 10px ${MONO}`;
  ctx.fillStyle = TECH.label;
  ctx.fillText('// BUILD ORDER', x0 + 72, p.y + POP.HEAD_Y);
  ctx.textAlign = 'right';
  const q = game.yard.queue.length;
  ctx.fillStyle = q ? TECH.go : TECH.label;
  ctx.fillText(q ? 'QUEUE ' + q : 'YARD IDLE', x1, p.y + POP.HEAD_Y);
  rule(ctx, x0, x1, p.y + POP.RULE1);

  const rects = popupControlRects(sel, phase, game.money);
  const hover = game.hover;

  // Hull tabs
  for (const r of rects) {
    if (r.kind !== 'tab') continue;
    const on = sel.tab === r.i;
    drawChip(ctx, r, on, hover === 'pop:' + r.id, r.enabled);
    ctx.font = `700 8.5px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? TECH.text : r.enabled ? TECH.label : 'rgba(111, 134, 168, 0.45)';
    const name = r.i === MEDIC_TAB ? HEALER.short : HULLS[r.i].name.toUpperCase();
    ctx.fillText(name, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  }

  drawBlueprint(ctx, game, order, p, t);

  if (order.kind === 'ship') drawArmament(ctx, rects, sel, hover, p);
  else drawMedicNote(ctx, phase, p);

  drawCost(ctx, order, p);
  rule(ctx, x0, x1, p.y + POP.RULE4);

  // Buttons
  const blocker = orderBlocker(order, phase, game.money);
  for (const r of rects) {
    if (r.kind === 'close') drawGhostBtn(ctx, r, hover === 'pop:close', 'CLOSE');
    if (r.kind === 'build') drawBuildBtn(ctx, r, hover === 'pop:build', blocker, orderPrice(order));
  }
  ctx.restore();
}

// Short bright L's on each chamfer, the corner furniture of a spec sheet.
function drawBrackets(ctx, x, y, w, h, c) {
  const L = 10;
  ctx.save();
  ctx.strokeStyle = TECH.bracket;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y + c + L); ctx.lineTo(x, y + c); ctx.lineTo(x + c, y); ctx.lineTo(x + c + L, y);
  ctx.moveTo(x + w - c - L, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + c + L);
  ctx.moveTo(x + w, y + h - c - L); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + w - c - L, y + h);
  ctx.moveTo(x + c + L, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + h - c - L);
  ctx.stroke();
  ctx.restore();
}

function rule(ctx, x0, x1, y) {
  ctx.fillStyle = TECH.rule;
  ctx.fillRect(x0, y, x1 - x0, 1);
}

function drawChip(ctx, r, on, hot, enabled) {
  chamferPath(ctx, r.x, r.y, r.w, r.h, 5, 1 | 4);
  ctx.fillStyle = on ? TECH.chipOn : hot && enabled ? TECH.chipHot : TECH.chip;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = on ? TECH.chipEdgeOn : enabled ? TECH.chipEdge : 'rgba(127, 212, 255, 0.1)';
  ctx.stroke();
}

// The left box: the hull as a hologram on a fine grid, with dimension lines.
// The right side: name, role and the four stat bars.
function drawBlueprint(ctx, game, order, p, t) {
  const bx = p.x + POP.PAD, by = p.y + POP.BP_Y, bw = POP.BP_W, bh = POP.BP_H;
  const medic = order.kind === 'healer';
  const spec = medic ? HEALER : HULLS[order.hull];

  ctx.save();
  chamferPath(ctx, bx, by, bw, bh, 6, 1 | 4);
  ctx.fillStyle = 'rgba(127, 212, 255, 0.035)';
  ctx.fill();
  ctx.strokeStyle = TECH.chipEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = TECH.gridFine;
  for (let gx = bx + 4; gx < bx + bw; gx += 8) ctx.fillRect(gx, by, 1, bh);
  for (let gy = by + 4; gy < by + bh; gy += 8) ctx.fillRect(bx, gy, bw, 1);

  const cx = bx + bw / 2, cy = by + bh / 2 - 4;
  // Crosshair and a slowly turning range ring behind the hull.
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(bx, cy); ctx.lineTo(bx + bw, cy);
  ctx.moveTo(cx, by); ctx.lineTo(cx, by + bh);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t / 4000);
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.32)';
  ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
  ctx.restore();

  // The hull itself, large, with a cyan glow and the engine idling.
  const W = 50;
  if (SpriteKit.has('ships')) {
    const bob = Math.sin(t / 700) * 1.5;
    ctx.save();
    ctx.shadowColor = 'rgba(127, 212, 255, 0.55)';
    ctx.shadowBlur = 12;
    ctx.translate(cx, cy + bob);
    const frame = SpriteKit.shipFrame(t, false);
    if (medic) drawHealerSprite(ctx, frame, W);
    else SpriteKit.drawShip(ctx, spec.row, frame, 0, 0, W);
    ctx.restore();
    // Dimension lines: width under the hull, length at its left, in in-game px.
    const hullH = SpriteKit.hullHeight(spec.row, W);
    const gameW = spec.dispW * SIZE_SCALE.ship;
    const gameH = SpriteKit.hullHeight(spec.row, gameW);
    dimLine(ctx, cx - W / 2, by + bh - 12, cx + W / 2, by + bh - 12, 'W ' + gameW.toFixed(1));
    dimLine(ctx, bx + 12, cy - hullH / 2, bx + 12, cy + hullH / 2, 'L ' + gameH.toFixed(1), true);
  }
  // Scanlines over the whole box: the hologram's grain.
  ctx.fillStyle = 'rgba(127, 212, 255, 0.045)';
  for (let y = by; y < by + bh; y += 3) ctx.fillRect(bx, y, bw, 1);
  ctx.restore();

  // Right column
  const rx = bx + bw + 12, rw = p.x + p.w - POP.PAD - rx;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 15px ${FONT}`;
  ctx.fillStyle = TECH.text;
  ctx.fillText(spec.name.toUpperCase(), rx, by + 10);
  ctx.font = `600 8.5px ${MONO}`;
  ctx.fillStyle = TECH.accent;
  ctx.fillText(medic ? 'FIELD REPAIR TENDER' : spec.role, rx, by + 26);

  const stats = medic
    ? [['BUDGET', HEALER.hp / 30, HEALER.hp + ' HP'],
       ['REPAIR', HEALER.healRate / 20, HEALER.healRate + ' HP/s'],
       ['SPEED', HEALER.speed / 120, HEALER.speed + ' px/s'],
       ['BUILD', HEALER.buildMs / 5000, (HEALER.buildMs / 1000).toFixed(1) + ' s']]
    : [['HULL', spec.hp / 3, Math.round(spec.hp * BASE.HP) + ' HP'],
       ['SPEED', spec.speed / 120, spec.speed + ' px/s'],
       ['TURN', spec.turn / 360, spec.turn + ' °/s'],
       ['BUILD', spec.buildMs / 5000, (spec.buildMs / 1000).toFixed(1) + ' s']];
  stats.forEach(([label, frac, value], i) => statBar(ctx, rx, by + 48 + i * 20, rw, label, frac, value));
}

// One labelled 10-segment bar with its value at the right.
function statBar(ctx, x, y, w, label, frac, value) {
  ctx.font = `600 8px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = TECH.label;
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = TECH.text;
  ctx.fillText(value, x + w, y);
  const segs = 10, gap = 2, sy = y + 7, sw = (w - gap * (segs - 1)) / segs;
  const lit = Math.round(clamp(frac, 0, 1) * segs);
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i < lit ? TECH.segOn : TECH.segOff;
    ctx.fillRect(x + i * (sw + gap), sy, sw, 3);
  }
}

// A dimension line with end ticks and its label, like a drawing's callout.
function dimLine(ctx, x0, y0, x1, y1, label, vertical) {
  ctx.save();
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.55)';
  ctx.fillStyle = TECH.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  if (vertical) {
    ctx.moveTo(x0 - 3, y0); ctx.lineTo(x0 + 3, y0);
    ctx.moveTo(x1 - 3, y1); ctx.lineTo(x1 + 3, y1);
  } else {
    ctx.moveTo(x0, y0 - 3); ctx.lineTo(x0, y0 + 3);
    ctx.moveTo(x1, y1 - 3); ctx.lineTo(x1, y1 + 3);
  }
  ctx.stroke();
  ctx.font = `600 7.5px ${MONO}`;
  ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.translate(x0 + 7, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 0);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(label, (x0 + x1) / 2, y0 + 8);
  }
  ctx.restore();
}

// Gun chips, the selected gun's numbers, and the Mark pips.
function drawArmament(ctx, rects, sel, hover, p) {
  const x0 = p.x + POP.PAD, x1 = p.x + p.w - POP.PAD;
  rule(ctx, x0, x1, p.y + POP.RULE2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 9px ${MONO}`;
  ctx.fillStyle = TECH.label;
  ctx.fillText('ARMAMENT', x0, p.y + POP.ARM_Y);

  for (const r of rects) {
    if (r.kind !== 'gun') continue;
    const on = sel.gun === r.i;
    drawChip(ctx, r, on, hover === 'pop:' + r.id, r.enabled);
    ctx.save();
    ctx.globalAlpha *= r.enabled ? 1 : 0.4;
    if (SpriteKit.has('bullets')) {
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + 3);
      SpriteKit.drawBullet(ctx, GUNS[r.i].row, SpriteKit.bulletFrame(0), 6);
      ctx.restore();
    }
    ctx.font = `700 7.5px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? TECH.text : TECH.label;
    ctx.fillText(GUNS[r.i].short, r.x + r.w / 2, r.y + r.h - 7);
    ctx.restore();
    if (!r.enabled) drawLock(ctx, r.x + r.w - 8, r.y + 8);
  }

  // The selected gun at the selected Mark.
  const gi = sel.gun, lvl = sel.level, g = GUNS[gi];
  const shots = gunShots(gi, lvl);
  const pattern = g.pattern === 'fan' ? (shots > 1 ? shots + '× ' + g.spreadDeg + '° FAN' : 'SINGLE')
                : g.pattern === 'group' ? (shots > 1 ? shots + '× GROUP' : 'SINGLE')
                : 'GATLING ' + g.spreadDeg + '°';
  const cols = [
    [['RATE', (1000 / gunIntervalMs(gi, lvl)).toFixed(1) + ' /s'], ['PATTERN', pattern]],
    [['RANGE', Math.round(gunRange(gi)) + ' px'], ['VELOCITY', Math.round(gunBulletSpeed(gi)) + ' px/s']],
  ];
  const colW = (x1 - x0) / 2;
  cols.forEach((col, c) => col.forEach(([label, value], row) => {
    const y = p.y + POP.STAT_Y + row * POP.STAT_ROW;
    const x = x0 + c * colW;
    ctx.font = `600 8px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = TECH.label;
    ctx.fillText(label, x, y);
    ctx.font = `700 9.5px ${MONO}`;
    ctx.fillStyle = TECH.text;
    ctx.fillText(value, x + 56, y);
  }));

  rule(ctx, x0, x1, p.y + POP.RULE3);
  ctx.font = `700 9px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = TECH.label;
  ctx.fillText('MARK', x0, p.y + POP.LVL_Y + POP.LVL_H / 2);
  for (const r of rects) {
    if (r.kind !== 'lvl') continue;
    const on = r.i <= lvl;
    const cur = r.i === lvl;
    chamferPath(ctx, r.x, r.y, r.w, r.h, 5, 1 | 4);
    ctx.fillStyle = cur ? TECH.chipOn : on ? 'rgba(127, 212, 255, 0.09)' : hover === 'pop:' + r.id ? TECH.chipHot : TECH.chip;
    ctx.fill();
    ctx.strokeStyle = cur ? TECH.chipEdgeOn : TECH.chipEdge;
    ctx.stroke();
    ctx.font = `800 10px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? TECH.text : TECH.label;
    ctx.fillText(ROMAN[r.i - 1], r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  }
  ctx.textAlign = 'right';
  ctx.font = `700 9.5px ${MONO}`;
  ctx.fillStyle = TECH.accent;
  ctx.fillText('+$' + gunPrice(gi, lvl), x1, p.y + POP.LVL_Y + POP.LVL_H / 2);
}

// A small padlock: the Lightning Gun on a hull that cannot carry it.
function drawLock(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = TECH.label;
  ctx.fillStyle = TECH.label;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - 1.5, 2.4, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(x - 3.4, y - 1.5, 6.8, 5);
  ctx.restore();
}

function drawMedicNote(ctx, phase, p) {
  const x0 = p.x + POP.PAD, x1 = p.x + p.w - POP.PAD;
  rule(ctx, x0, x1, p.y + POP.RULE2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 9px ${MONO}`;
  ctx.fillStyle = TECH.label;
  ctx.fillText('ARMAMENT', x0, p.y + POP.ARM_Y);
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = TECH.text;
  ctx.fillText('NONE — REPAIR TENDER', x0, p.y + POP.ARM_Y + 22);
  const lines = [
    'Transfers its own hull to damaged ships,',
    'farthest from the planet first.',
    'Fades out once its budget is spent.',
  ];
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = TECH.label;
  lines.forEach((l, i) => ctx.fillText(l, x0, p.y + POP.ARM_Y + 44 + i * 15));
  ctx.font = `700 9.5px ${MONO}`;
  const open = phase === 'break';
  ctx.fillStyle = open ? TECH.go : COLORS.warn;
  ctx.fillText(open ? '● AVAILABLE NOW — BETWEEN WAVES' : '● LOCKED — WAVE IN PROGRESS', x0, p.y + POP.ARM_Y + 102);
}

function drawCost(ctx, order, p) {
  const x0 = p.x + POP.PAD, x1 = p.x + p.w - POP.PAD;
  const y = p.y + POP.COST_Y;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `600 8.5px ${MONO}`;
  ctx.fillStyle = TECH.label;
  if (order.kind === 'ship') {
    ctx.fillText('HULL $' + HULLS[order.hull].price + '  +  ARMAMENT $' + gunPrice(order.gun, order.level), x0, y);
  } else {
    ctx.fillText('TENDER $' + HEALER.price, x0, y);
  }
  ctx.fillText('BUILD TIME ' + (orderBuildMs(order) / 1000).toFixed(1) + ' s', x0, y + 18);
  ctx.textAlign = 'right';
  ctx.font = `600 8.5px ${MONO}`;
  ctx.fillText('TOTAL', x1, y - 1);
  ctx.font = `800 20px ${MONO}`;
  ctx.fillStyle = COLORS.money;
  ctx.fillText('$' + orderPrice(order), x1, y + 17);
}

function drawGhostBtn(ctx, r, hot, label) {
  chamferPath(ctx, r.x, r.y, r.w, r.h, 8, 1 | 4);
  ctx.fillStyle = hot ? TECH.chipHot : TECH.chip;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hot ? TECH.chipEdgeOn : TECH.chipEdge;
  ctx.stroke();
  ctx.font = `800 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hot ? TECH.text : TECH.accent;
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
}

// BUILD is the one filled surface on the sheet. Disabled, it goes flat and
// says why instead of the price.
function drawBuildBtn(ctx, r, hot, blocker, price) {
  ctx.save();
  if (!blocker) {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, hot ? TECH.btnTopHot : TECH.btnTop);
    g.addColorStop(1, hot ? TECH.btnBotHot : TECH.btnBot);
    ctx.shadowColor = 'rgba(127, 212, 255, 0.5)';
    ctx.shadowBlur = hot ? 18 : 10;
    chamferPath(ctx, r.x, r.y, r.w, r.h, 8, 1 | 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 13px ${MONO}`;
    ctx.fillStyle = TECH.onBtn;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BUILD  ·  $' + price, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  } else {
    chamferPath(ctx, r.x, r.y, r.w, r.h, 8, 1 | 4);
    ctx.fillStyle = 'rgba(255, 179, 71, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `800 11px ${MONO}`;
    ctx.fillStyle = COLORS.warn;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(blocker, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  }
  ctx.restore();
}

// ---- The behaviour menu --------------------------------------------------------
function drawBehaviourMenu(ctx, game) {
  const ship = game.ships.find((s) => s.id === game.menu.shipId);
  if (!ship) return;
  const m = behaviourMenuRect(game.menu);

  ctx.save();
  // Selection ring on the ship, and a leader line from it to the menu.
  const r = shipRadius(ship) + 6;
  ctx.strokeStyle = TECH.accent;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.lineDashOffset = -game.time / 60;
  ctx.beginPath(); ctx.arc(ship.x, ship.y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  const my = m.y > ship.y ? m.y : m.y + m.h;
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.4)';
  ctx.beginPath();
  ctx.moveTo(ship.x, ship.y + (my > ship.y ? r : -r));
  ctx.lineTo(clamp(ship.x, m.x + 10, m.x + m.w - 10), my);
  ctx.stroke();

  chamferPath(ctx, m.x, m.y, m.w, m.h, 8);
  ctx.fillStyle = TECH.panel;
  ctx.fill();
  ctx.strokeStyle = TECH.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawBrackets(ctx, m.x, m.y, m.w, m.h, 8);

  // Header: what this ship is and how it is holding up.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 8.5px ${MONO}`;
  ctx.fillStyle = TECH.text;
  ctx.fillText(HULLS[ship.hull].name.toUpperCase() + ' · ' + GUNS[ship.gun].short + ' MK ' + ROMAN[ship.level - 1],
               m.x + BEH.PAD, m.y + 13);
  ctx.textAlign = 'right';
  ctx.fillStyle = ship.hp / ship.maxHp > HP_BAR.MID ? COLORS.hpHigh : ship.hp / ship.maxHp > HP_BAR.LOW ? COLORS.hpMid : COLORS.hpLow;
  ctx.fillText(Math.ceil(ship.hp) + '/' + ship.maxHp, m.x + m.w - BEH.PAD, m.y + 13);

  for (const b of behaviourMenuRects(game.menu)) {
    const on = ship.behaviour === b.key;
    const hot = game.hover === 'beh:' + b.key;
    drawChip(ctx, b, on, hot, true);
    drawBehaviourIcon(ctx, b.key, b.x + b.w / 2, b.y + 13, on || hot);
    ctx.font = `700 8px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? TECH.text : TECH.label;
    ctx.fillText(BEHAVIOURS.find((x) => x.key === b.key).label, b.x + b.w / 2, b.y + b.h - 8);
  }
  ctx.restore();
}

// Aggressive: chevrons pointing out into space. Balanced: a crosshair.
// Defensive: a shield.
function drawBehaviourIcon(ctx, key, x, y, bright) {
  ctx.save();
  ctx.strokeStyle = bright ? TECH.accent : TECH.label;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (key === 'aggressive') {
    ctx.moveTo(x - 6, y + 1); ctx.lineTo(x, y - 5); ctx.lineTo(x + 6, y + 1);
    ctx.moveTo(x - 6, y + 6); ctx.lineTo(x, y); ctx.lineTo(x + 6, y + 6);
  } else if (key === 'balanced') {
    ctx.arc(x, y, 5, 0, TAU);
    ctx.moveTo(x - 8, y); ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 8);
  } else {
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 6, y - 4.5);
    ctx.lineTo(x + 5, y + 2);
    ctx.quadraticCurveTo(x + 3, y + 6, x, y + 7.5);
    ctx.quadraticCurveTo(x - 3, y + 6, x - 5, y + 2);
    ctx.lineTo(x - 6, y - 4.5);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}
