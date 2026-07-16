// ============================================================================
// constants.js — cross-cutting tunables (colors, layout, animation timings)
// AI-specific constants live at the top of ai.js.
// All positioning assumes the fixed 800x600 native canvas.
// ============================================================================

const CANVAS_W = 800;
const CANVAS_H = 600;

// Board sizes offered in the menu. `radius` is the hex ring radius:
//   3x3x3 -> radius 2 -> 19 cells
//   4x4x4 -> radius 3 -> 37 cells
//   5x5x5 -> radius 4 -> 61 cells
const BOARD_SIZES = {
  '3x3x3': { label: '3x3x3', radius: 2 },
  '4x4x4': { label: '4x4x4', radius: 3 },
  '5x5x5': { label: '5x5x5', radius: 4 },
};

// Layout: reserve space at the top for the header (score / turn / mode label),
// and keep a margin so the board never touches the canvas edges. Cell size is
// derived from these + the board radius so the board always fits & centers.
const LAYOUT = {
  HEADER_H: 96,   // pixels reserved at top for header UI
  MARGIN: 28,     // min gap between board bounding box and canvas edges
};

// Faction identifiers.
const BUBBLES = 'bubbles';
const CRYSTALS = 'crystals';
const EMPTY = null;

// Modes & AI levels offered on the title screen.
const MODES = {
  ai: { key: 'ai', label: 'Play vs AI' },
  hotseat: { key: 'hotseat', label: 'Hot Seat' },
};
const AI_LEVELS = {
  easy: { key: 'easy', label: 'Easy' },
  normal: { key: 'normal', label: 'Normal' },
  hard: { key: 'hard', label: 'Hard' },
};

// Artificial "thinking" pause for AI moves so they don't feel jarring (ms).
const AI_DELAY = { MIN: 400, MAX: 600 };

// Start-of-game coin-flip ceremony: FLIP = spin/toss, REVEAL = settled result,
// END_PAUSE = hold on the final result before the board appears.
const CEREMONY = { FLIP: 1000, REVEAL: 720, TOSS_H: 64, SPINS: 5, END_PAUSE: 1000 };

// ---- Palette -------------------------------------------------------------
const COLORS = {
  bgTop: '#111826',
  bgBottom: '#0a0f18',

  headerText: '#e6eef8',
  headerSub: '#8aa0bd',

  // Empty hex cell
  cellFill: 'rgba(255, 255, 255, 0.035)',
  cellStroke: 'rgba(150, 180, 220, 0.28)',

  // Bubbles (soft, bluish, glossy)
  bubbleCore: '#4fb4ff',
  bubbleDeep: '#1c6fd6',
  bubbleShine: 'rgba(255, 255, 255, 0.9)',

  // Crystals (hard, reddish, faceted)
  crystalCore: '#ff5d6c',
  crystalDeep: '#b02436',
  crystalGlint: 'rgba(255, 255, 255, 0.95)',

  // Interaction highlights
  selectRing: '#ffe27a',
  cloneHint: 'rgba(120, 230, 160, 0.30)',   // distance-1 destinations
  jumpHint: 'rgba(120, 190, 255, 0.20)',    // distance-2 destinations
  hintStroke: 'rgba(255, 255, 255, 0.35)',

  // Board tray (physical plate under the grid) & carved cell wells
  tray1: '#1e2a3d',                       // tray surface, lit (top)
  tray2: '#131b29',                       // tray surface, shaded (bottom)
  trayRimLight: 'rgba(255, 255, 255, 0.10)',
  trayRimShadow: 'rgba(0, 0, 0, 0.50)',
  trayDropShadow: 'rgba(0, 0, 0, 0.55)',
  wellBase: '#0f1622',                    // recessed cell interior
  wellShadowTL: 'rgba(0, 0, 0, 0.55)',    // inner shadow, top-left
  wellLightBR: 'rgba(130, 170, 230, 0.12)', // interior wall catching light, bottom-right
  wellStroke: 'rgba(150, 180, 220, 0.16)',

  // Ambience
  glow: 'rgba(90, 150, 230, 0.13)',       // soft glow behind the board
  vignette: 'rgba(0, 0, 0, 0.42)',        // darkening toward canvas edges

  // Hover
  hoverFill: 'rgba(255, 255, 255, 0.08)',
  hoverStroke: 'rgba(255, 255, 255, 0.22)',

  // Menu / buttons
  btnFill: 'rgba(255, 255, 255, 0.045)',
  btnStroke: 'rgba(150, 180, 220, 0.30)',
  btnHoverFill: 'rgba(255, 255, 255, 0.09)',
  btnSelFill: 'rgba(79, 180, 255, 0.20)',
  btnSelStroke: '#4fb4ff',
  btnDisabledText: 'rgba(160, 180, 205, 0.35)',
  playFill: '#ffe27a',
  playText: '#1a1204',
  sectionLabel: '#8aa0bd',
};

// ---- Animation durations (ms) -------------------------------------------
const ANIM = {
  SPAWN: 460,        // token popping out of the cell center
  SPAWN_STAGGER: 80, // delay between successive starting tokens
  CLONE: 400,        // new token budding off and travelling to the destination
  JUMP: 480,         // token arcing from origin to destination
  CONVERT_LEAD: 260, // pause before the particle stream starts (token settling)
  CONVERT_STREAM: 820, // particle flow + resist/squeeze/shake then collapse+pop per token
};
