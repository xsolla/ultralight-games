// Cross-cutting tunables shared by every module. Plain globals (no build step).

const CANVAS_W = 800;
const CANVAS_H = 600;

// Layout margins around the well; side panel widths are derived at runtime
// so the well stays centered (see Board.computeLayout).
const LAYOUT = {
  TOP_MARGIN: 64,
  BOTTOM_MARGIN: 24,
  PANEL_GAP: 16,
};

const COLOR_IDS = ['red', 'blue', 'green', 'cyan', 'purple', 'yellow'];

const COLORS = {
  red: '#e5484d',
  blue: '#3b82f6',
  green: '#2ecc71',
  cyan: '#22d3ee',
  purple: '#b975f0',
  yellow: '#f2c94c',
};

const WELL = { COLS: 5, ROWS: 13 };

const TOKEN_VARIETY = { OPTIONS: [4, 5, 6], DEFAULT: 6 };

const PIECE = {
  LENGTH: 3,
  SPAWN_COL: 2,
  SPAWN_ROW: 0, // row of the piece's TOP token when it first spawns — fully inside the well
};

const FALL_SPEED = {
  BASE_MS: 800,
  RAMP_INTERVAL_SEC: 20,
  RAMP_STEP_MS: 40,
  MIN_MS: 200,
};

const SCORE = { TIER_SIZE: 3 };

// Garbage kicks in once a chain clears more than the *second* triplet
// (N > 3), not the third — Rules.garbageRowsFor(N) = floor((N-3)/3) once
// N > 3. So N=4,5 still send 0 (an extra triplet must fully complete
// first), N=6 sends 1, N=9 sends 2, N=12 sends 3.
const GARBAGE = { THRESHOLD: 3, STEP: 3 };

// Mouse/touch gesture tuning — a drag shorter than the threshold is treated
// as a click/tap instead of a swipe.
const INPUT = {
  SWIPE_THRESHOLD_PX: 24,
  DOUBLE_CLICK_MS: 320,
};

const ANIM = {
  FLASH_MS: 250, // matched tiles flash in place before exploding
  POPUP_MS: 650, // score "+x" pop-up float/fade duration

  PARTICLE_COUNT: 9, // burst particles per exploding tile
  PARTICLE_MS: 450, // base particle lifetime (randomized per-particle)
  PARTICLE_GRAVITY: 220, // px/s^2 pulling particles down as they drift

  // Gravity-fill speed: fast but not instant — duration scales with how far
  // a token has to fall, capped so long drops don't feel sluggish.
  FALL_BASE_MS: 90,
  FALL_PER_ROW_MS: 45,
  FALL_MAX_MS: 380,
};

// Sfx are preloaded/pooled (see js/audio.js) so playback never waits on a
// fresh decode; music is one track per tileset, swapped when a match starts
// and faded out over MUSIC_FADE_MS on return to the title screen.
const AUDIO = {
  POOL_SIZE: 4,
  SFX_VOLUME: 0.7,
  MUSIC_VOLUME: 0.45,
  MUSIC_FADE_MS: 3000,
  SFX: {
    ui_click: 'assets/sfx/uI_click.mp3',
    piece_rotate: 'assets/sfx/order_change.mp3',
    piece_lock: 'assets/sfx/tile_stop.mp3',
    match_pop: 'assets/sfx/explosion.mp3',
  },
  MUSIC: {
    crystals: 'assets/bgm/crystals_bgm.mp3',
    blobs: 'assets/bgm/blobs_bgm.mp3',
    dice: 'assets/bgm/dice_bgm.mp3',
    elements: 'assets/bgm/elements_bgm.mp3',
  },
};
