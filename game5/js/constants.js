// HELIX FALL — constants.js
// All tunable game settings live here.

const C = {

  // --- Canvas / Layout ---
  CANVAS_W: 405,
  CANVAS_H: 720,

  // --- Helix Tower ---
  TOWER_CX: 202.5,          // horizontal center
  TOWER_BALL_Y: 420,        // Y where ball sits (fixed on screen)
  TOWER_RADIUS_X: 120,      // horizontal radius of rings
  RING_SPACING: 80,         // vertical distance between rings
  RING_COUNT: 12,           // number of rings in pool
  RING_THICKNESS: 12,       // tube diameter at mid depth
  SEGMENT_COUNT: 12,        // number of segments per ring

  // --- 3D projection ---
  // Rings are horizontal circles seen by a camera above the tower. A ring's
  // vertical radius grows with its distance below the horizon, so the tower
  // recedes upward; rings near the horizon are nearly edge-on.
  RING_HORIZON_Y: 40,       // screen Y where a ring would appear perfectly flat
  RING_RY_MIN: 6,           // vertical radius at the horizon
  RING_RY_SLOPE: 0.042,     // extra vertical radius per px below the horizon
  // Near half of the ring projects larger than the far half. 0 = flat ellipse.
  RING_PERSPECTIVE: 0.28,
  RING_STEPS: 12,           // samples per segment when building the tube ribbon
  RING_SHADE_BACK: 0.38,    // lightness multiplier on the far side of the ring
  RING_SHADE_FRONT: 1.16,   // lightness multiplier on the near side
  RING_SPECULAR: 0.35,      // strength of the top-lit highlight along the tube

  // --- Ball ---
  BALL_RADIUS: 11,
  BALL_TRAIL_LENGTH: 22,    // number of trail positions stored
  // Screen angle the ball occupies on every ring's ellipse.
  // PI/2 == front of the tower (bottom of the ellipse, nearest the viewer),
  // which is directly below the ball's draw position. Collision and rendering
  // must agree on this or the hit test drifts away from what's on screen.
  BALL_ANGLE: Math.PI / 2,

  // --- Speed / Difficulty ---
  INITIAL_FALL_SPEED: 180,  // px per second
  MAX_FALL_SPEED: 600,
  SPEED_INCREMENT: 18,      // added every SPEED_INTERVAL ms
  SPEED_INTERVAL: 4000,     // ms between speed bumps

  // --- Gap / Segment sizes (in segments out of SEGMENT_COUNT) ---
  INITIAL_GAP_SIZE: 4,      // safe gap width in segments
  MIN_GAP_SIZE: 2,
  GAP_SHRINK_EVERY: 12,     // rings passed before gap shrinks

  // --- Deadly segments ---
  DEADLY_COUNT_NORMAL: 1,   // number of deadly arcs per ring (normal)
  DEADLY_COUNT_HARD: 2,

  // Hard mode: deadly segments drift
  HARD_DEADLY_DRIFT_SPEED: 0.4, // radians per second

  // --- Power-ups ---
  POWERUP_CHANCE: 0.18,         // probability a ring gets a power-up segment
  POWERUP_CHANCE_EASY: 0.28,
  POWERUP_CHANCE_HARD: 0.10,
  POWERUP_SLOW_DURATION: 4000,  // ms
  POWERUP_MULT_DURATION: 5000,  // ms
  POWERUP_SLOW_FACTOR: 0.45,    // multiplier applied to fall speed
  POWERUP_PURPLE_DURATION: 2000,  // ms
  POWERUP_PURPLE_SPEED_MULT: 5,   // speed multiplier

  // --- Scoring ---
  SCORE_PER_RING: 10,
  SCORE_NEAR_MISS_BONUS: 5,     // bonus for passing within 1 segment of deadly

  // --- Colors ---
  BG_TOP: '#05050f',
  BG_BOTTOM: '#0a0a2a',
  SAFE_COLOR: '#00e5ff',
  DEADLY_COLOR: '#ff1744',
  POWERUP_SHIELD_COLOR: '#69ff47',
  POWERUP_SLOW_COLOR: '#40c4ff',
  POWERUP_MULT_COLOR: '#ffd740',
  POWERUP_TEAL_COLOR: '#00ffcc',
  POWERUP_PURPLE_COLOR: '#b44dff',
  BALL_COLOR: '#ffffff',
  BALL_GLOW: '#ffe082',
  TRAIL_COLOR: '#ffe082',
  GAP_COLOR: '#111133',         // subtle fill for gap arcs (visual depth)

  // HSL bases [hue, sat%, light%] for depth-shaded ring tubes. Segments are lit
  // from the front, so their lightness is varied around these values.
  DEADLY_HSL:  [348, 100, 55],  // matches DEADLY_COLOR
  POWERUP_HSL: {
    shield: [108, 100, 64],     // matches POWERUP_SHIELD_COLOR
    slow:   [199, 100, 63],     // matches POWERUP_SLOW_COLOR
    mult:   [ 45, 100, 63],     // matches POWERUP_MULT_COLOR
    bonus:  [168, 100, 50],     // matches POWERUP_TEAL_COLOR
    purple: [270, 100, 60],     // matches POWERUP_PURPLE_COLOR
  },
  SAFE_LIGHTNESS: 58,           // base lightness of safe/hue-rotating segments

  // Hue rotation: ring color shifts as score climbs
  RING_HUE_START: 180,          // cyan
  RING_HUE_RANGE: 200,          // degrees of hue shift over lifetime
  RING_HUE_SCORE_SCALE: 0.4,    // hue degrees per point

  // --- Particles ---
  PARTICLE_COUNT_PASS: 14,
  PARTICLE_COUNT_DEATH: 30,
  PARTICLE_SPEED: 180,
  PARTICLE_LIFE: 0.55,          // seconds

  // --- Ring destruction ---
  // A ring the ball punches through bursts into one fragment per solid segment.
  DEBRIS_LIFE: 0.7,             // seconds a fragment survives
  DEBRIS_BURST_SPEED: 170,      // px/s outward from the tower axis
  DEBRIS_SPIN: 1.4,             // max radians/sec of tumble
  DEBRIS_DRAG: 0.94,            // velocity retained per 1/60 s
  DEBRIS_GRAVITY: 120,          // px/s² — fragments arc downward as they fly
  DEBRIS_GAS_INTERVAL: 0.14,    // seconds between gas puffs per fragment
  DEBRIS_GAS_WHILE: 0.4,        // only vent above this fraction of life left
  DEBRIS_MAX_PIECES: 64,        // hard cap so fast runs can't pile up

  // --- Screen shake ---
  SHAKE_HIT: 2.5,               // px — every ring the ball smashes through
  SHAKE_NEAR_MISS: 4,           // px
  SHAKE_DEATH: 12,
  SHAKE_DECAY: 8,               // decay per frame multiplier

  // --- HUD ---
  HUD_BTN_SIZE: 38,             // px square
  HUD_MARGIN: 10,
  HUD_FONT: 'bold 14px monospace',
  SCORE_FONT: 'bold 42px monospace',

  // --- Rotation ---
  ROTATE_SPEED_KB: 2.8,         // radians per second (keyboard)
  ROTATE_SPEED_TOUCH: 0.012,    // radians per px of swipe delta
  DRAG_CLICK_THRESHOLD: 6,      // px of pointer travel before a press stops counting as a tap

  // --- Difficulty presets (override base values) ---
  DIFFICULTY: {
    easy: {
      INITIAL_FALL_SPEED: 140,
      SPEED_INCREMENT: 10,
      INITIAL_GAP_SIZE: 5,
      DEADLY_COUNT: 1,
      POWERUP_CHANCE: 0.28,
    },
    normal: {
      INITIAL_FALL_SPEED: 180,
      SPEED_INCREMENT: 18,
      INITIAL_GAP_SIZE: 4,
      DEADLY_COUNT: 1,
      POWERUP_CHANCE: 0.18,
    },
    hard: {
      INITIAL_FALL_SPEED: 230,
      SPEED_INCREMENT: 26,
      INITIAL_GAP_SIZE: 3,
      DEADLY_COUNT: 2,
      POWERUP_CHANCE: 0.10,
    },
  },

  // --- Title screen ---
  TITLE_HELIX_SPEED: 0.6,       // rotation speed of preview helix
  TITLE_RING_COUNT: 8,

  // --- Misc ---
  GAMEOVER_DELAY: 800,          // ms before game-over screen appears
};
