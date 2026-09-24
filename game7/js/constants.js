// ============================================================================
// constants.js — cross-cutting tunables: canvas size, screen layout, palette,
// fonts, and the few shared math helpers. Anything only one subsystem tunes
// lives at the top of that subsystem instead (the planet's look in planet.js,
// patrol knobs in ships.js, the popup's geometry in buildui.js). Balance lives
// in data.js, never here.
// ============================================================================

const CANVAS_W = 360;
const CANVAS_H = 640;

// Backing store cap. devicePixelRatio is clamped to this, and styles.css caps
// the element at 540px wide, so the backing store never exceeds 1080x1920 — a
// 3x scale over logical space.
const MAX_DPR = 2;

// ---- Screen layout (CLAUDE.md §7.1) ------------------------------------------
// The planet is a disc centred below the screen and only its top cap shows.
// Space is everything above the horizon; the three behaviour zones are its
// thirds, so moving the horizon moves the zones with it.
const LAYOUT = {
  HORIZON: 560,        // y of the planet's top at screen centre (designer, 2026-09-24)
  PLANET_R: 490,       // logical px: 1.36x the screen width
  // The one build control (§11): a square over the planet, bottom right, clear
  // of the arc's highest point so the planet reads as a whole around it.
  BUILD_BTN: { x: 292, y: 572, size: 56 },
};
const PLANET_CX = CANVAS_W / 2;
const PLANET_CY = LAYOUT.HORIZON + LAYOUT.PLANET_R;
const ZONE_H = LAYOUT.HORIZON / 3;     // each behaviour zone's height, logical px

// §7.11: every entity with HP shows a bar over it while the game is being
// balanced. One switch, read only by render.js.
const SHOW_HP_BARS = true;

// ---- Palette -----------------------------------------------------------------
const COLORS = {
  // The field is uniformly dark top to bottom; the two stops are close on
  // purpose so the sky never reads as split into a lighter half and a darker one.
  bgTop: '#070b16',
  bgBottom: '#04060b',

  star: '255, 255, 255',       // "r, g, b" — alpha composed per star
  starWarm: '255, 232, 190',
  starCool: '190, 224, 255',

  hudText: '#e6eef8',
  hudDim: '#7d90ad',
  hudPanel: 'rgba(10, 18, 34, 0.55)',

  accent: '#7fd4ff',           // the game's cyan: UI chrome, selection, the tech popup
  money: '#ffd166',

  // HP bars: the fill walks green -> amber -> red by fraction (§7.11).
  hpHigh: '#6fe39a',
  hpMid: '#ffc857',
  hpLow: '#ff6b6b',
  hpTrack: 'rgba(6, 12, 24, 0.78)',

  warn: '#ffb347',
  bad: '#ff6b6b',
};

// Every piece of canvas text uses a system stack — no web fonts anywhere.
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// The tech popup's spec-sheet type. Still system fonts only.
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

// ---- Sound state -------------------------------------------------------------
// The HUD's sound button is THREE-state (branding.md §2): 'on' = music + sfx,
// 'musicoff' = sfx only, 'off' = silent.
const SOUND_CYCLE = { on: 'musicoff', musicoff: 'off', off: 'on' };

// ---- Shared math -------------------------------------------------------------
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function randRange(r) { return r[0] + Math.random() * (r[1] - r[0]); }            // r = [min, max)
function randInt(r) { return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)); }   // r = [min, max], inclusive
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
