// ============================================================================
// menu.js — the title screen: its layout, its buttons' geometry, and its
// drawing. Reads state and draws it; never mutates game state and never handles
// input, exactly as render.js does not — game.js hit-tests through the layout
// functions here and owns every transition they lead to.
//
// It composes rather than owns: the starfield, god rays and bokeh are
// ambiance.js's, the hull sprites are atlas.js's, and the three shared HUD
// buttons are render.js's. What lives here is this screen's composition.
//
// It also owns the RECORDS CARD, the modal §3 names for this file. One card
// serves both of the places it is opened from — the end of a run and the title
// screen — differing only in its backdrop, its heading and its buttons, because
// it is showing the same table either way.
//
// Ship select, the last screen §3 names here, is still not built.
// ============================================================================

// ---- Layout ----------------------------------------------------------------
// All logical px on the 360x640 field. The vertical order is the order the
// player reads it in: what the game is, what they will fly, how hard it will
// be, and then the one control that starts it.
//
// BTN_W is the spine of the whole column — the difficulty row, START and HIGH
// SCORES are all exactly this wide and centred, so three controls of three
// different weights still line up as one stack.
const MENU = {
  // Mirrors the HUD button row: the wordmark's box is centred on the same y as
  // those buttons and inset by the same HUD_PAD from the opposite edge, which
  // is the symmetry branding.md §1 asks for ("logo and buttons sit
  // symmetrically") expressed in this game's own margin.
  LOGO_X: HUD_PAD,
  LOGO_Y: 16,
  LOGO_W: 84,

  TITLE_Y: 138,
  TITLE_SIZE: 44,
  TITLE_TRACK: 9,        // extra px between glyphs — see drawTracked
  TITLE_GLOW: 14,
  TITLE_PULSE_HZ: 0.13,  // the glow breathes; the type never moves
  SUB_Y: 176,
  SUB_SIZE: 16,
  SUB_TRACK: 7.2,
  RULE_Y: 196,           // hairline under the subtitle
  RULE_W: 132,

  // Centre of the LEAD hull; the wing's other two hang off it (MENU_WING).
  // Raised from the single-ship layout it replaces, because the flanks sit
  // lower than the lead and their plumes would otherwise reach the DIFFICULTY
  // label below.
  SHIP_Y: 268,
  // 56 against the 42-46 the same hulls fly at. CLAUDE.md §6 caps in-game
  // `dispW` at 48 because that is where the atlas sits at ~1:1 with the backing
  // store, and 56 is the 0.84-0.92x upscale that section names as the first
  // step past it. Taken deliberately and only here: this hull is the screen's
  // subject rather than a target to be read at speed, it is the only sprite on
  // a still frame, and the softening it costs is the width of the 1px outline
  // it is spent on. Nothing in SHIPS changes.
  SHIP_W: 56,
  SHIP_BOB: 5,           // px of vertical drift
  SHIP_BOB_HZ: 0.19,
  SHIP_GLOW_R: 78,       // the hull's own colour, bloomed behind it

  DIFF_LABEL_Y: 374,
  DIFF_Y: 388,
  DIFF_H: 34,
  DIFF_GAP: 8,

  START_Y: 452,
  START_H: 50,

  SCORES_Y: 520,
  SCORES_H: 40,

  BTN_W: 232,
  HINT_Y: 592,

  TRAFFIC_MARGIN: 40,    // px above/below the field a distant hull travels
};

// Hit slop, as HUD_BTN_SLOP is for the shared buttons. Capped at 3 rather than
// that one's 5 because the difficulty pills are only DIFF_GAP apart: at 4 the
// grown boxes of two neighbours would meet and the left one would win a tap
// aimed at the gap between them.
const MENU_BTN_SLOP = 3;

// ---- Skin ------------------------------------------------------------------
// Appearance only; the palette itself stays in constants.js. The accent is
// COLORS.armor, which is already this game's cyan, so the title screen and the
// armour bar are the same instrument speaking.
const MENU_SKIN = {
  RADIUS: 10,
  accent: COLORS.armor,
  accentDim: 'rgba(127, 212, 255, 0.62)',
  glow: 'rgba(127, 212, 255, 0.55)',
  // Unselected and secondary surfaces: barely there, so the one filled control
  // on the screen is unambiguously the one to press.
  fill: 'rgba(12, 24, 44, 0.55)',
  fillHover: 'rgba(26, 50, 84, 0.75)',
  stroke: 'rgba(127, 212, 255, 0.30)',
  strokeHover: 'rgba(168, 230, 255, 0.85)',
  strokeOn: 'rgba(168, 230, 255, 0.70)',
  // The two filled states — the chosen difficulty and START.
  pillOn: 'rgba(127, 212, 255, 0.90)',
  startTop: '#a9e7ff',
  startBot: '#4bb4e6',
  startTopHot: '#c9f2ff',
  startBotHot: '#63c8f4',
  // Text ON a filled surface. Near-black rather than the background colour: the
  // fill is bright enough that anything lighter loses its edges.
  onText: '#05101c',
};

// The whole roster on screen at once, flying as a WING rather than standing in
// a showroom line-up: the hull that will launch leads at the point, and the
// other two sit out to the sides and BEHIND it. That is the same shape the
// wingmen bonus flies (wingmen.js), so the title screen opens on a formation
// the game itself uses.
//
// Offsets are from the lead, which is at (CANVAS_W / 2, MENU.SHIP_Y). Slots are
// ordered BACK TO FRONT — the lead is last so it draws over its own wing.
//
// The flanks are smaller as well as further back. Two depth cues rather than
// one, because at this size a 14px difference on its own reads as "those ships
// are smaller", not "those ships are further away". At 42 they are also inside
// CLAUDE.md §6's 48px ceiling and drawing at native scale; only the lead spends
// the upscale, and its note is on MENU.SHIP_W above.
//
// `phase` desynchronises each hull's bob and engine cycle. Three identical
// plumes flickering in lockstep read as one animation played three times, which
// is the same reason no two members of a spawned formation share a spin phase.
const MENU_WING = [
  { dx: -68, dy: 24, w: 42, glowR: 52, glowA: 0.20, phase: 0.37 },
  { dx: 68,  dy: 24, w: 42, glowR: 52, glowA: 0.20, phase: 0.71 },
  { dx: 0,   dy: 0,  w: MENU.SHIP_W, glowR: MENU.SHIP_GLOW_R, glowA: 0.30, phase: 0 },
];

// ---- Records card ----------------------------------------------------------
// A modal over whatever it was opened from, centred on both axes. Sized to its
// contents rather than to the screen: it is a card, and a card that reached the
// edges would be a screen wearing a border.
const RECORDS = {
  W: 272,
  H: 244,
  RADIUS: 14,
  PAD: 18,
  HEAD_Y: 30,        // all offsets are from the card's own top edge
  DIFF_Y: 50,
  RULE_Y: 64,
  ROW_Y: 78,
  ROW_H: 32,
  ROW_GAP: 2,
  BTN_Y: 186,
  BTN_H: 40,
  BTN_GAP: 12,
  ONE_BTN_W: 140,    // the title screen's single OK
  // How far the backdrop is knocked back. Enough that the card is unambiguously
  // in front, not so much that the run behind it is erased — seeing where you
  // died is half of what makes the number mean anything.
  SCRIM: 'rgba(4, 8, 16, 0.72)',
};

const MENU_TITLE = 'SPACE';
const MENU_SUB = 'INTERCEPTOR';
const MENU_HINT = 'drag or WASD to fly · hold to fire';

// Distant hulls crossing far behind the ship. Three, small and dim, and there
// for depth: a starfield has no scale of its own, and a recognisable silhouette
// at 17px is what says both "these are ships" and "that one is a long way off".
//
// Tumbling rows only. The armed atlas's hulls have a nose and a heading
// (CLAUDE.md §6), so spinning one would read as a ship out of control rather
// than as distant traffic.
//
// Pure functions of time: no state, nothing to update, nothing to recycle.
const MENU_TRAFFIC = [
  { row: 2, w: 17, x: 0.17, phase: 0.00, hz: 0.021, spin: 11, a: 0.34 },
  { row: 4, w: 13, x: 0.83, phase: 0.42, hz: 0.016, spin: -8, a: 0.26 },
  { row: 0, w: 22, x: 0.62, phase: 0.74, hz: 0.012, spin: 6, a: 0.20 },
];
const MENU_TRAFFIC_FRAME_MS = 140;

// ---- Xsolla wordmark — VERBATIM from branding.md §1 ------------------------
// The repo's shared house element. Nothing in this block is a tuning knob, and
// the path data is transcribed rather than derived — re-derive it from that
// document if it ever changes, never from anything in this game.
//
// All five paths are filled 'evenodd': two of them need it and for the other
// three it is identical to nonzero, so one uniform call is both correct and
// simpler. The source clipPath is a no-op and is skipped, but its 4.53857
// y-offset is subtracted so a caller's `y` means the top of the visible art.
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
// Built once and cached — never per frame. The cache holds Path2D objects,
// which are independent of the game canvas, so a resize cannot invalidate them
// the way branding.md §5 warns a cached gradient can be.
let xsollaLogoCache = null;

// (x, y) is the top-left of the VISIBLE artwork; w is its width in logical px.
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

// ---- Button layout ---------------------------------------------------------
// A pure function of the constants above, for the same reason hudButtonRects is
// one: CLAUDE.md §5 has menu.js rebuild a Game.menuButtons list each frame so
// selected states cannot drift from the real state, and deriving the geometry
// instead removes the list that could drift. `selected` is not stored here at
// all — the painter reads game.diffIdx at the moment it draws, so there is no
// second copy of it to go stale and nothing to clear when the screen changes.
//
// `kind` is what the button IS and `i` is which difficulty it names, so game.js
// dispatches on a field rather than parsing an id string.
function menuButtonRects() {
  const x = (CANVAS_W - MENU.BTN_W) / 2;
  const n = DIFFICULTIES.length;
  const pillW = (MENU.BTN_W - (n - 1) * MENU.DIFF_GAP) / n;

  const rects = DIFFICULTIES.map((d, i) => ({
    id: 'diff' + i,
    kind: 'diff',
    i,
    x: x + i * (pillW + MENU.DIFF_GAP),
    y: MENU.DIFF_Y,
    w: pillW,
    h: MENU.DIFF_H,
  }));
  rects.push({ id: 'start', kind: 'start', x, y: MENU.START_Y, w: MENU.BTN_W, h: MENU.START_H });
  rects.push({ id: 'records', kind: 'records', x, y: MENU.SCORES_Y, w: MENU.BTN_W, h: MENU.SCORES_H });
  return rects;
}

// Which menu button is under a logical point, or null.
function menuButtonAt(px, py) {
  const k = MENU_BTN_SLOP;
  for (const r of menuButtonRects()) {
    if (px >= r.x - k && px <= r.x + r.w + k &&
        py >= r.y - k && py <= r.y + r.h + k) return r.id;
  }
  return null;
}

// ---- Drawing ---------------------------------------------------------------
// Back to front. The rays are volumetric light, so they lie OVER the distant
// traffic and under the hull they are lighting; the bokeh is the nearest layer
// of all and sits over everything except the type, which stays clear of it so
// nothing has to be read through a lens flare.
function drawMenu(ctx, game) {
  Stars.draw(ctx, game.time, 1);
  drawMenuTraffic(ctx, game.time);
  Rays.draw(ctx, game.time);
  drawMenuHero(ctx, game);
  Bokeh.draw(ctx, game.time);

  drawMenuTitle(ctx, game.time);
  drawXsollaLogo(ctx, MENU.LOGO_X, MENU.LOGO_Y, MENU.LOGO_W);
  drawMenuButtons(ctx, game);
  drawMenuHint(ctx);
  // Last, so they sit above everything — branding.md §2 requires the shared
  // buttons to stay on top even of an overlay.
  drawHudButtons(ctx, game);
}

function drawMenuTraffic(ctx, time) {
  if (!Atlas.has('aliens')) return;
  const s = time / 1000;
  const span = CANVAS_H + MENU.TRAFFIC_MARGIN * 2;
  const frame = ENEMY_FRAMES[Math.floor(time / MENU_TRAFFIC_FRAME_MS) % ENEMY_FRAMES.length];

  for (const t of MENU_TRAFFIC) {
    // Wrapped modulo rather than integrated, so a menu left open for an hour is
    // in exactly the state a freshly opened one would be.
    const u = (t.phase + s * t.hz) % 1;
    ctx.save();
    ctx.globalAlpha = t.a;
    ctx.translate(t.x * CANVAS_W, u * span - MENU.TRAFFIC_MARGIN);
    ctx.rotate(s * t.spin * DEG);
    Atlas.drawEnemy(ctx, 'aliens', t.row, frame, t.w);
    ctx.restore();
  }
}

// The whole roster, flying the wing laid out in MENU_WING.
//
// Which hull takes which slot is DERIVED, not listed: the lead is always the
// one START will launch and the flanks are whatever else the roster holds, so
// the same hull can never appear in two slots and this survives START_SHIP
// changing. The lead is START_SHIP rather than game.player.ship for the reason
// that constant exists — the player object still holds whatever hull the LAST
// run ended on, and drawing from it would show a ship START is not going to
// give you.
function drawMenuHero(ctx, game) {
  if (!Atlas.has('ships')) return;

  const flanks = [];
  for (let i = 0; i < SHIPS.length; i++) if (i !== START_SHIP) flanks.push(i);

  for (let i = 0; i < MENU_WING.length; i++) {
    const lead = i === MENU_WING.length - 1;
    const ship = lead ? START_SHIP : flanks[i];
    // Fewer hulls in the roster than slots in the wing: leave the slot empty
    // rather than repeating a hull to fill it.
    if (ship === undefined) continue;
    drawMenuShip(ctx, game.time, ship, MENU_WING[i]);
  }
}

// One hull of the wing: its accent colour bloomed behind it so it reads as lit
// rather than pasted onto the backdrop, then the hull itself.
//
// The idle flight cycle is driven off Game.time rather than a player's animMs:
// these are pictures, not entities, and have no state of their own.
function drawMenuShip(ctx, time, shipIdx, slot) {
  const x = CANVAS_W / 2 + slot.dx;
  const y = MENU.SHIP_Y + slot.dy + MENU.SHIP_BOB *
            Math.sin(((time / 1000) * MENU.SHIP_BOB_HZ + slot.phase) * TAU);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = slot.glowA;
  ctx.drawImage(glowSprite(SHIPS[shipIdx].color, GLOW_BLOOM),
                x - slot.glowR, y - slot.glowR, slot.glowR * 2, slot.glowR * 2);
  ctx.restore();

  const seq = FLIGHT_FRAMES.normal;
  const step = Math.floor(time / ANIM.SHIP_FRAME_MS + slot.phase * seq.length);
  Atlas.drawShip(ctx, shipIdx, seq[step % seq.length], x, y, slot.w);
}

function drawMenuTitle(ctx, time) {
  // The GLOW pulses; the type does not move and does not resize. This block is
  // the first thing on the screen that has to be read, and type that breathes
  // is type that is harder to read for no gain.
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

  // A hairline that fades out at both ends rather than stopping. A rule with
  // hard ends reads as a divider between two sections; this one reads as an
  // underline belonging to the words above it.
  const g = ctx.createLinearGradient(
    (CANVAS_W - MENU.RULE_W) / 2, 0, (CANVAS_W + MENU.RULE_W) / 2, 0);
  g.addColorStop(0, 'rgba(127, 212, 255, 0)');
  g.addColorStop(0.5, 'rgba(127, 212, 255, 0.45)');
  g.addColorStop(1, 'rgba(127, 212, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect((CANVAS_W - MENU.RULE_W) / 2, MENU.RULE_Y, MENU.RULE_W, 1);
}

function drawMenuButtons(ctx, game) {
  ctx.textBaseline = 'middle';
  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  drawTracked(ctx, 'DIFFICULTY', CANVAS_W / 2, MENU.DIFF_LABEL_Y, 2.4);

  for (const r of menuButtonRects()) {
    const hot = game.menuHover === r.id;
    if (r.kind === 'diff') drawDiffPill(ctx, r, game.diffIdx === r.i, hot);
    else if (r.kind === 'start') drawStartButton(ctx, r, hot);
    else drawGhostButton(ctx, r, hot, 'HIGH SCORES');
  }
}

// Selected is a FILL, not an outline or a tint. Three outlined pills with one
// of them slightly brighter is a state the player has to compare across to
// read; one filled pill among two empty ones is a state they can see.
function drawDiffPill(ctx, r, on, hot) {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, MENU_SKIN.RADIUS);
  ctx.fillStyle = on ? MENU_SKIN.pillOn : (hot ? MENU_SKIN.fillHover : MENU_SKIN.fill);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = on ? MENU_SKIN.strokeOn : (hot ? MENU_SKIN.strokeHover : MENU_SKIN.stroke);
  ctx.stroke();

  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = on ? MENU_SKIN.onText : (hot ? COLORS.hudText : COLORS.hudDim);
  drawTracked(ctx, DIFFICULTIES[r.i].label.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 + 0.5, 1.2);
}

// The only control on the screen with a surface and a glow, which is what makes
// it the obvious one to press without any word saying so.
function drawStartButton(ctx, r, hot) {
  // One small gradient per frame rather than a cached one. It is a single
  // 50px-tall ramp on an otherwise idle screen, and building it here sidesteps
  // branding.md §5's warning about holding a gradient across a canvas.width
  // assignment — there is nothing cached to invalidate.
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

// ---- Records card ----------------------------------------------------------
// Same pure-layout contract as the two above: derived from constants, never
// stored, so nothing outlives the screen that drew it.
//
// `from` decides the buttons, and it is passed in rather than read off Game so
// this stays a pure function of its arguments — the same reason hudButtonRects
// takes the screen.
function recordsCardRect() {
  return {
    x: (CANVAS_W - RECORDS.W) / 2,
    y: (CANVAS_H - RECORDS.H) / 2,
    w: RECORDS.W,
    h: RECORDS.H,
  };
}

function recordsButtonRects(from) {
  const card = recordsCardRect();
  const y = card.y + RECORDS.BTN_Y;
  const h = RECORDS.BTN_H;

  // Opened from the title, the card is pure information: there is nowhere to go
  // but back, so one button says so and is not dressed up as a choice.
  if (from === 'menu') {
    return [{
      id: 'ok', label: 'OK', primary: true,
      x: (CANVAS_W - RECORDS.ONE_BTN_W) / 2, y, w: RECORDS.ONE_BTN_W, h,
    }];
  }

  // At the end of a run there IS a choice, and the two are not equal weight:
  // "Try again" is what most players want next, so it takes the primary
  // surface and the right-hand side, where the thumb already is.
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
  // The backdrop is whatever the card was opened over. The title screen keeps
  // drifting behind it; a finished run is frozen, which is the picture of how
  // it ended and is exactly what should not move while its score is read.
  if (game.recordsFrom === 'menu') {
    drawMenu(ctx, game);
  } else {
    drawWorld(ctx, game);
    if (Atlas.ready) drawHud(ctx, game);
  }

  ctx.fillStyle = RECORDS.SCRIM;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawRecordsCard(ctx, game);

  // Re-drawn on top of the scrim. branding.md §2 requires the shared buttons to
  // stay live over a game-over dialog, and the backdrop's own copy of them is
  // now behind the knock-back.
  drawHudButtons(ctx, game);
}

function drawRecordsCard(ctx, game) {
  const card = recordsCardRect();
  const fromRun = game.recordsFrom !== 'menu';
  // The card opens for EVERY finished run, so which of the two things it is
  // saying has to be read off the result rather than assumed from the context.
  const newRecord = fromRun && game.newRank >= 0;
  const diff = DIFFICULTIES[game.diffIdx];
  const table = Scores.table(diff.key);

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

  // The heading is the news. Only a record earns the accent colour and the
  // word: a run that missed the table gets a plain statement in plain text,
  // because congratulating every run is how the phrase stops meaning anything.
  const heading = !fromRun ? 'HIGH SCORES'
                : newRecord ? 'NEW HIGH SCORE'
                : 'GAME OVER';
  ctx.font = `800 15px ${FONT}`;
  ctx.fillStyle = newRecord ? MENU_SKIN.accent : COLORS.hudText;
  drawTracked(ctx, heading, CANVAS_W / 2, card.y + RECORDS.HEAD_Y, 2.6);

  // Which table this is. Not decoration: the tables are per difficulty, so a
  // score that is a record here would not be one on the setting next to it.
  //
  // The run's own score joins it only when the table does not already show it.
  // A record is legible in its emphasised row a few pixels below, and the same
  // number printed twice on one small card invites the reader to look for the
  // difference between them.
  ctx.font = `700 9px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  const sub = diff.label.toUpperCase() +
              (fromRun && !newRecord ? ' · ' + game.finalScore : '');
  drawTracked(ctx, sub, CANVAS_W / 2, card.y + RECORDS.DIFF_Y, 2.2);

  const ruleW = card.w - RECORDS.PAD * 2;
  const g = ctx.createLinearGradient(card.x + RECORDS.PAD, 0, card.x + card.w - RECORDS.PAD, 0);
  g.addColorStop(0, 'rgba(127, 212, 255, 0)');
  g.addColorStop(0.5, 'rgba(127, 212, 255, 0.40)');
  g.addColorStop(1, 'rgba(127, 212, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(card.x + RECORDS.PAD, card.y + RECORDS.RULE_Y, ruleW, 1);

  // Always SCORES_KEPT rows, filled or not. A table that grows a row at a time
  // hides how many places there are to play for; an empty slot is an invitation.
  for (let i = 0; i < SCORES_KEPT; i++) {
    drawRecordRow(ctx, card, i, table[i],
                  fromRun && game.newRank === i, game.time);
  }

  for (const r of recordsButtonRects(game.recordsFrom)) {
    drawCardButton(ctx, r, game.menuHover === r.id);
  }
}

function drawRecordRow(ctx, card, i, score, isNew, time) {
  const x = card.x + RECORDS.PAD;
  const w = card.w - RECORDS.PAD * 2;
  const y = card.y + RECORDS.ROW_Y + i * (RECORDS.ROW_H + RECORDS.ROW_GAP);
  const mid = y + RECORDS.ROW_H / 2;

  if (isNew) {
    // The run's own row, filled — the same language the selected difficulty
    // pill speaks, so "this one is yours" needs no legend. It breathes slightly
    // because the card can open with the new row anywhere in the table, and the
    // eye has to find it rather than assume it is at the top.
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

  const filled = typeof score === 'number';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = isNew ? MENU_SKIN.onText : (filled ? MENU_SKIN.accentDim : COLORS.hudDim);
  ctx.fillText(String(i + 1), x + 12, mid);

  if (isNew) {
    ctx.font = `800 8px ${FONT}`;
    ctx.fillStyle = MENU_SKIN.onText;
    ctx.fillText('NEW', x + 28, mid + 0.5);
  }

  ctx.textAlign = 'right';
  ctx.font = `${filled ? 800 : 500} ${filled ? 17 : 15}px ${FONT}`;
  // An em dash for an unclaimed slot rather than a zero: zero is a score
  // somebody got, and three zeroes would read as three terrible runs.
  ctx.fillStyle = isNew ? MENU_SKIN.onText : (filled ? COLORS.hudText : COLORS.hudDim);
  ctx.fillText(filled ? String(score) : '—', x + w - 12, mid);
  ctx.textAlign = 'left';
}

// The card's own button. Its own function rather than the title screen's,
// because those are 232px wide and these are 112 — the same 17px label with 5px
// tracking would not fit "TRY AGAIN" inside one.
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
  ctx.strokeStyle = hot ? MENU_SKIN.strokeHover
                        : (r.primary ? MENU_SKIN.strokeOn : MENU_SKIN.stroke);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = r.primary ? MENU_SKIN.onText : (hot ? COLORS.hudText : MENU_SKIN.accentDim);
  drawTracked(ctx, r.label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, 2.2);
}

// Centred text with letter spacing, placed one glyph at a time.
//
// ctx.letterSpacing exists but is far too recent to rely on in a game that has
// to run off a file:// double-click on whatever browser is to hand, and wide
// tracking is most of what separates a drawn title from default system type.
// So the glyphs are positioned here instead, which also makes the centring
// exact — the accumulated width IS the measurement.
//
// Sets textAlign itself so a caller cannot leave it on 'center' and double up
// on the centring.
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
