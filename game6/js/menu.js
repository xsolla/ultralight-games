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
// The ship-select and records screens named for this file in CLAUDE.md §3 are
// not built yet. The records BUTTON is, and is inert — see the note in
// game.js's pressMenuButton.
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

  SHIP_Y: 282,           // hero hull centre
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

// The hull the next run will start on, flying in place: engine cycling, hull
// bobbing, its own accent colour bloomed behind it so it reads as lit rather
// than pasted onto the backdrop.
//
// START_SHIP, not game.player.ship — the player object still holds whatever
// hull the LAST run ended on, so drawing from it would show a ship the START
// button is not going to give you. The two read the same constant so the title
// screen cannot promise one hull and hand over another.
function drawMenuHero(ctx, game) {
  if (!Atlas.has('ships')) return;
  const idx = START_SHIP;
  const s = game.time / 1000;
  const y = MENU.SHIP_Y + MENU.SHIP_BOB * Math.sin(s * TAU * MENU.SHIP_BOB_HZ);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.30;
  ctx.drawImage(glowSprite(SHIPS[idx].color, GLOW_BLOOM),
                CANVAS_W / 2 - MENU.SHIP_GLOW_R, y - MENU.SHIP_GLOW_R,
                MENU.SHIP_GLOW_R * 2, MENU.SHIP_GLOW_R * 2);
  ctx.restore();

  // The idle flight cycle, driven off Game.time rather than a player's animMs:
  // the menu's ship is a picture, not an entity, and has no state of its own.
  const seq = FLIGHT_FRAMES.normal;
  const frame = seq[Math.floor(game.time / ANIM.SHIP_FRAME_MS) % seq.length];
  Atlas.drawShip(ctx, idx, frame, CANVAS_W / 2, y, MENU.SHIP_W);
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
