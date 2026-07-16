// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

// Core / Figures
const INITIAL_CROWD            = 1;
const FIGURE_HEIGHT            = 44;    // px
const FIGURE_SPACING           = 17;    // px between anchor points
const MAX_FIGURES_PER_ROW      = 20;
const MAX_DISPLAY_FIGURES      = 240;
const CROWD_SPEED_X            = 350;   // px/s
const CROWD_Y                  = 490;   // feet baseline in 800x600 space
const RUN_ANIM_SPEED           = 8;     // rad/s
const LEG_SWING_AMP            = 0.45;
const ARM_SWING_AMP            = 0.10;
const BOB_AMPLITUDE            = 1.5;   // px

// 3/4 rear-view run cycle
const FIGURE_YAW        = 0.18;
const FIGURE_LEAN       = 0.05;
const LEG_LATERAL_SEP   = 0.07;
const ARM_LATERAL_SEP   = 0.11;
const FORESHORTEN_AMT   = 0.22;
const FORESHORTEN_SHADE = 0.70;
const LEG_LIFT_ANG      = 0.70;
const LEG_STRIDE_Y      = 0.10;
const LEG_KNEE_BEND     = 0.60;
const LEG_CONVERGE      = 0.25;
const ARM_OUT           = 0.35;
const ARM_ELBOW_FLEX    = 0.90;
const SPAWN_ANIM_MS            = 200;
const DESPAWN_ANIM_MS          = 180;
const SPAWN_STAGGER_MS         = 45;

// Crowd variety + depth (per-figure individuality so a crowd doesn't look cloned)
const CROWD_SIZE_MIN          = 0.90;  // per-figure height multiplier range
const CROWD_SIZE_RANGE        = 0.20;
const CROWD_TINT_MIN          = 0.85;  // per-figure brightness multiplier range
const CROWD_TINT_RANGE        = 0.30;
const CROWD_GAIT_MIN          = 0.92;  // per-figure run-cycle speed range
const CROWD_GAIT_RANGE        = 0.22;
const DEPTH_SCALE_FALLOFF     = 0.20;  // back rows render up to 20% smaller
const DEPTH_FADE_FALLOFF      = 0.25;  // back rows dim up to 25%
const SHADOW_ALPHA            = 0.22;  // ground-shadow opacity
const CROWD_JITTER            = 0.70;  // organic per-figure offset (× spacing, stable)
const LEADER_SIZE_BOOST       = 1.18;  // the "you" figure at crowd center
const LEADER_TINT_BOOST       = 1.15;

// Road & Gates
const ROAD_WIDTH                   = 600;
const GATE_HEIGHT                  = 70;
const GATE_ALPHA                   = 0.60;
// Depth fade: gates are opaque up close and fade toward a floor with distance,
// so the several gates stacked toward the horizon stop overlapping into mush.
const GATE_FADE_NEAR_WZ            = 4;     // fully opaque within this depth
const GATE_FADE_FAR_WZ             = 10;    // reaches the floor alpha by here
const GATE_FADE_MIN                = 0.15;  // far-gate alpha floor (still faintly visible)
const GATE_SCROLL_SPEED_INITIAL    = 360;
const GATE_SCROLL_SPEED_MAX        = 840;
const GATE_SPEED_ACCEL             = 5;
const GATE_SPAWN_DIST_WZ           = 2.5;
const SPLIT_GATE_CHANCE            = 0.75;
const GATE_WORLD_HEIGHT = 0.3;
const GATE_WORLD_DEPTH  = 0.04;
const GATE_SPAWN_WZ     = 10;

// Skyline
const BUILDING_PERIOD         = 1.1;
const BUILDING_SIDE_PHASE     = 0.55;
const BUILDING_FAR_WZ         = 14;
const BUILDING_NEAR_CULL      = 0.6;
const BUILDING_GAP_MIN        = 65;
const BUILDING_GAP_MAX        = 240;
const BUILDING_W_MIN          = 55;
const BUILDING_W_MAX          = 475;
const BUILDING_DEPTH          = 0.8;
const BUILDING_H_MIN          = 0.45;
const BUILDING_H_MAX          = 1.7;
const BUILDING_SKIP_CHANCE    = 0.16;
const BUILDING_FADE_MIN_A     = 0.32;
const BUILDING_DROP           = 0.18;
const BUILDING_SINK_FADE_WZ   = 2.6;
const BUILDING_WINDOW_NEAR_WZ = 5.0;
const BUILDING_WINDOW_ROWS    = 5;

// Math Complexity
const FRACTION_START_TIME      = 10;
const FRACTION_MAX_DENOM       = 8;
const FRACTION_CHANCE_INITIAL  = 0.20;
const FRACTION_CHANCE_PER_GATE = 0.05;
const FRACTION_CHANCE_MAX      = 1.0;
const FRACTION_REVERSE_CHANCE  = 0.35;

// Procedural balance
const TARGET_BASE      = 8;
const TARGET_CAP       = MAX_DISPLAY_FIGURES;
const TARGET_TAU       = 90;
const TARGET_BAND_FRAC = 0.18;
const STEP_MAX_FACTOR  = 1.6;
const STEP_MIN_FACTOR  = 0.55;
const GROW_ADD_MAX     = 60;
const SHRINK_SUB_MAX   = 30;
const MUL_INT_MAX      = 4;
const DIV_INT_MAX      = 6;
const BAD_SHRINK_LO    = 0.10;
const BAD_SHRINK_HI    = 0.60;

// Path Edge Falling
const EDGE_DANGER_WIDTH = 30;
const EDGE_FALL_RATE    = 20;
const FALL_ANIM_MS      = 400;
const EDGE_FALL_GRACE_S = 5;

// Rival Crowds
const RIVAL_START_TIME              = 8;
const RIVAL_SPAWN_INTERVAL_INITIAL  = 5000;
const RIVAL_SPAWN_INTERVAL_MIN      = 2000;
const RIVAL_SPAWN_INTERVAL_ACCEL    = -20;
const RIVAL_SPLIT_CHANCE            = 0.65;
const CLASH_ANIM_MS                 = 350;
const RIVAL_EVERY_N_GATES           = 6;
const RIVAL_FRAC_BASE               = 0.30;
const RIVAL_FRAC_RAMP               = 0.35;
const RIVAL_FRAC_RAMP_TIME          = 120;
const RIVAL_COUNT_JITTER            = 0.15;
const CLASH_MAX_DEBRIS              = 50;
const BLAST_ANIM_MS                 = 800;
const BLAST_SPEED                   = 320;
const BLAST_GRAVITY                 = 700;

// Score
const SCORE_SCALE           = 0.05;
const DIFFICULTY_SCALE_TIME = 60;
const START_SKIP_M          = 120;

// Audio
const SFX_VOLUME    = 0.6;
const BGM_VOLUME    = 0.45;
const MUSIC_FADE_MS = 3000;
const MUTE_KEY      = 'xsollaCrowdRun.mute.v1';

// Leaderboard
const HIGHSCORE_KEY   = 'xsollaCrowdRun.highscores.v1';
const HIGHSCORE_COUNT = 3;

// Title-screen auto-pilot
const DEMO_ERROR_CHANCE = 0.30;
const DEMO_DEADZONE     = 6;
const DEMO_MAX_TIME     = 75;

// Sky cosmetics
const STAR_COUNT       = 70;
const STAR_SKY_H       = 240;
const STAR_MIN_R       = 0.5;
const STAR_MAX_R       = 1.8;
const STAR_LIFE_MIN    = 2500;
const STAR_LIFE_MAX    = 8000;
const STAR_FADE_MS     = 1000;
const STAR_TWINKLE_MIN = 1.2;
const STAR_TWINKLE_MAX = 4.5;
const STAR_COLORS      = ['#ffffff', '#bcd2ff', '#fff0c4', '#ffd6e8', '#cffaff'];

const COMET_MIN_DELAY  = 7000;
const COMET_MAX_DELAY  = 12000;
const COMET_SPEED      = 200;
const COMET_EMIT_RATE  = 55;
const COMET_PART_LIFE  = 850;
const COMET_PART_DRIFT = 12;
const COMET_PART_MIN_SZ = 7;
const COMET_PART_MAX_SZ = 13;
const COMET_GLYPHS     = ['+', '.', '·', '+'];
const COMET_COLOR      = '#cfe6ff';

// Gate modifier "soap bubble" popup (the +2 / ×3 that flies off a taken gate)
const POP_DUR             = 1100;   // total popup lifetime (ms)
const POP_RISE            = 68;     // px the bubble drifts upward over its life
const POP_BUBBLE_R        = 34;     // bubble radius (px)
const POP_PART_EMIT_RATE  = 120;    // comet particles/sec at full fade-out
const POP_PART_LIFE       = 620;    // particle lifetime (ms)
const POP_PART_SPEED_MIN  = 45;     // outward burst speed (px/s)
const POP_PART_SPEED_MAX  = 165;
const POP_PART_DRAG       = 0.90;   // per-frame velocity damping (spread then settle)
const POP_PART_MIN_SZ     = 6;
const POP_PART_MAX_SZ     = 12;
const POP_GLYPHS          = ['+', '.', '·', '+'];

// ═══════════════════════════════════════════════════════════════════
//  COLOR SCHEME
// ═══════════════════════════════════════════════════════════════════
const COLORS = {
  gutter:       '#0e0e18',
  roadFar:      '#0f0f1c',
  roadNear:     '#1a1a2e',
  roadEdge:     '#2a2a44',
  dashFill:     '#3a3a60',
  dashGlow:     '#6666bb',
  edgeDanger:   'rgba(255, 55, 55, 0.09)',
  horizonGlow:  'rgba(80, 100, 220, 0.10)',

  playerStroke: '#4ab8d8',
  playerFill:   '#7ed8f0',

  rivalStroke:  '#e8613a',
  rivalFill:    '#f4845f',

  hudText:      '#dde0f0',
  hudAccent:    '#7ed8f0',

  gateGood:     '#4ade80',
  gateBad:      '#f87171',
  gateNeutral:  '#94a3b8',
  gateFraction: '#c084fc',

  buildingTop:    '#2c2c54',
  buildingFront:  '#20203c',
  buildingSide:   '#14142a',
  buildingEdge:   'rgba(60,64,110,0.55)',
  buildingRim:    'rgba(120,140,235,0.55)',
  buildingWindow: 'rgba(126,216,240,0.6)',
};

const _rgbCache = new Map();
function hexToRgb(hex) {
  let out = _rgbCache.get(hex);
  if (out) return out;
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  _rgbCache.set(hex, out);
  return out;
}

const _shadeCache = new Map();
function shadeHex(hex, mul) {
  const key = hex + mul;
  let out = _shadeCache.get(key);
  if (out) return out;
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = Math.round(parseInt(h.slice(0, 2), 16) * mul);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * mul);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * mul);
  out = `rgb(${r},${g},${b})`;
  _shadeCache.set(key, out);
  return out;
}

// Quantize to 0.02 steps so per-figure tint multipliers reuse a bounded set of
// shadeHex cache keys instead of one entry per continuous random value.
function q2(v) { return Math.round(v * 50) / 50; }

// Per-figure individuality: slight size / brightness / gait variation so a crowd
// reads as many people, not one sprite stamped N times. Shared by player + rivals.
function personVariety() {
  return {
    sizeMul:   q2(CROWD_SIZE_MIN + Math.random() * CROWD_SIZE_RANGE),
    tint:      q2(CROWD_TINT_MIN + Math.random() * CROWD_TINT_RANGE),
    gaitSpeed: CROWD_GAIT_MIN + Math.random() * CROWD_GAIT_RANGE,
    jx:        (Math.random() - 0.5) * CROWD_JITTER,
    jy:        (Math.random() - 0.5) * CROWD_JITTER,
  };
}

// Fog target rgb (BUILDING_FOG = #38477e), parsed once for facadeTone().
const _FOG_RGB = [0x38, 0x47, 0x7e];
// Shade a base hex by `mul`, then lerp toward fog by `fogAmt` (0..1). Returns rgb().
// Uncached on purpose: fogAmt is continuous per-frame, so a cache would grow unbounded.
function facadeTone(hex, mul, fogAmt) {
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  let r = parseInt(h.slice(0, 2), 16) * mul;
  let g = parseInt(h.slice(2, 4), 16) * mul;
  let b = parseInt(h.slice(4, 6), 16) * mul;
  r += (_FOG_RGB[0] - r) * fogAmt;
  g += (_FOG_RGB[1] - g) * fogAmt;
  b += (_FOG_RGB[2] - b) * fogAmt;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// Per-building base facade tones (dark synthwave): indigo, violet, blue, magenta, teal-blue.
const BUILDING_FRONTS = ['#20203c', '#241a38', '#1a2340', '#2a1b33', '#152838'];
// Neon accent palette (bands + rim glow), one picked per building.
const BUILDING_NEON   = ['#ff2d78', '#00ffe0', '#ffb300', '#9b59ff'];
// Atmospheric fog tint distant buildings recede into (dusk blue-violet, matches horizon glow hue).
const BUILDING_FOG    = '#38477e';
// Lit-window colors.
const WIN_COOL = '#7ed8f0';
const WIN_WARM = '#ffcf87';

// ═══════════════════════════════════════════════════════════════════
//  SKY DAY-CYCLE
//  The backdrop advances one phase each time the crowd meets a rival.
//  Order loops: night(black) → morning → day → evening → night → …
//  Each transition eases over SKY_TRANSITION_SEC seconds.
//  Per phase: top = zenith colour, horizon = glow band near the road
//  apex, stars = star visibility multiplier (1 = full night sky).
// ═══════════════════════════════════════════════════════════════════
const SKY_TRANSITION_SEC = 3;
const SKY_PHASES = [
  { name: 'night',   top: [6, 7, 14],    horizon: [14, 16, 30],    stars: 1.00 },
  { name: 'morning', top: [40, 55, 95],  horizon: [232, 150, 110], stars: 0.35 },
  { name: 'day',     top: [70, 130, 205],horizon: [188, 216, 250], stars: 0.00 },
  { name: 'evening', top: [58, 40, 86],  horizon: [240, 120, 70],  stars: 0.30 },
];

function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgbStr(c) {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
function shadeRgb(c, mul) {
  return [c[0] * mul, c[1] * mul, c[2] * mul];
}

// Interpolated backdrop for the current frame (eased blend from → to).
// `from` and `to` are concrete {top, horizon, stars} objects on skyCycle.
function currentSkyColors() {
  const sc = Game.skyCycle;
  if (sc.blend >= 1) return sc.to;
  const t = sc.blend * sc.blend * (3 - 2 * sc.blend); // smoothstep ease
  return {
    top:     lerpRgb(sc.from.top, sc.to.top, t),
    horizon: lerpRgb(sc.from.horizon, sc.to.horizon, t),
    stars:   sc.from.stars + (sc.to.stars - sc.from.stars) * t,
  };
}

// Advance one phase (called when the crowd meets a rival). Captures the
// current interpolated colours as the new "from" so a mid-transition
// trigger keeps easing smoothly instead of snapping.
function advanceSkyPhase() {
  const sc  = Game.skyCycle;
  const cur = currentSkyColors();
  sc.from  = { top: cur.top.slice(), horizon: cur.horizon.slice(), stars: cur.stars };
  sc.toIdx = (sc.toIdx + 1) % SKY_PHASES.length;
  sc.to    = SKY_PHASES[sc.toIdx];
  sc.blend = 0;
}

// Reset the day-cycle to the starting night phase (called on run reset).
function resetSkyCycle() {
  Game.skyCycle = {
    toIdx: 0,
    from:  SKY_PHASES[0],
    to:    SKY_PHASES[0],
    blend: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  PERSPECTIVE SETUP
// ═══════════════════════════════════════════════════════════════════
const CANVAS_W   = 800;
const CANVAS_H   = 600;
const VP_X       = CANVAS_W / 2;
const HORIZON_Y  = 35;
const PERSP_K    = CANVAS_H - HORIZON_Y;
const ROAD_HALF_W = ROAD_WIDTH / 2;

const ROAD_LEFT_BTM  = VP_X - ROAD_HALF_W;
const ROAD_RIGHT_BTM = VP_X + ROAD_HALF_W;

function roadAt(y) {
  const hw = ROAD_HALF_W * (y - HORIZON_Y) / PERSP_K;
  return { left: VP_X - hw, right: VP_X + hw, hw };
}

function wz2y(wz) {
  return HORIZON_Y + PERSP_K / wz;
}

// ═══════════════════════════════════════════════════════════════════
//  DASH PARAMETERS
// ═══════════════════════════════════════════════════════════════════
const DASH_PERIOD  = 2.2;
const DASH_LENGTH  = 0.85;
const DASH_MAX_WZ  = 40;
const DASH_W_FRAC  = 0.03;

const RELZ_CROWD = PERSP_K / (CROWD_Y - HORIZON_Y);

function computeWorldSpeed(scrollSpeed) {
  return scrollSpeed * (RELZ_CROWD * RELZ_CROWD) / PERSP_K;
}

// ═══════════════════════════════════════════════════════════════════
//  PARALLAX LAYERS  (far skyline silhouette + streaming roadside rails)
// ═══════════════════════════════════════════════════════════════════
// Far skyline: a distant tower silhouette sitting on the horizon, behind
// the mid-city buildings, scrolling slowly for a deep parallax read.
const FAR_SKYLINE_SPACING  = 44;   // px between distant towers
const FAR_SKYLINE_PARALLAX = 2.4;  // px of drift per unit cameraZ (slow)
const FAR_SKYLINE_MIN_H    = 8;
const FAR_SKYLINE_MAX_H    = 30;
const FAR_SKYLINE_ALPHA    = 0.42;

// Deterministic 0..1 hash for stable far-skyline tower shapes across frames.
function farHash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// ═══════════════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════════════
const Game = {
  state:       'title',
  scrollSpeed: GATE_SCROLL_SPEED_INITIAL,
  cameraZ:     0,
  runClock:    0,
  elapsed:     0,
  distancePx:  0,
  maxPossible: INITIAL_CROWD,

  crowd: {
    x:             VP_X,
    count:         INITIAL_CROWD,
    edgeFallAccum: 0,
    people: [{ phaseOffset: Math.random() * Math.PI * 2, scale: 1, scaleTarget: 1, spawnDelay: 0, spawnTimer: 99999, ...personVariety() }],
  },

  gates:        [],
  gatePopups:   [],
  nextSpawnZ:   0,
  gatesSpawned: 0,
  gatesPassed:  0,
  spawnTick:    0,
  rivals:       [],
  fallers:      [],
  debris:       [],

  highscores:   [],
  lastRank:     -1,

  sky: { stars: [], comet: null, cometTimer: 0, particles: [] },
  skyCycle: { toIdx: 0, from: SKY_PHASES[0], to: SKY_PHASES[0], blend: 1 },

  demo: { gateZ: null, targetX: VP_X },

  lastTime: null,
};

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Road surface
// ═══════════════════════════════════════════════════════════════════
function drawRoad(ctx) {
  // Dynamic day-cycle backdrop: zenith colour up top, warm/cool glow band
  // near the road apex, darkened toward the lower side gutters for depth.
  const skyC = currentSkyColors();
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyGrad.addColorStop(0,    rgbStr(skyC.top));
  skyGrad.addColorStop(0.12, rgbStr(skyC.horizon));
  skyGrad.addColorStop(1,    rgbStr(shadeRgb(skyC.horizon, 0.28)));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(VP_X, HORIZON_Y);
  ctx.lineTo(ROAD_RIGHT_BTM, CANVAS_H);
  ctx.lineTo(ROAD_LEFT_BTM,  CANVAS_H);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_H);
  grad.addColorStop(0,   COLORS.roadFar);
  grad.addColorStop(0.6, '#151528');
  grad.addColorStop(1,   COLORS.roadNear);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(VP_X, HORIZON_Y); ctx.lineTo(ROAD_LEFT_BTM,  CANVAS_H);
  ctx.moveTo(VP_X, HORIZON_Y); ctx.lineTo(ROAD_RIGHT_BTM, CANVAS_H);
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  SKY COSMETICS
// ═══════════════════════════════════════════════════════════════════
function skyRand(a, b) { return a + Math.random() * (b - a); }

function isSkyPoint(x, y) {
  if (y < HORIZON_Y) return true;
  const b = roadAt(y);
  return x < b.left || x > b.right;
}

function resetStar(star) {
  let x, y, tries = 0;
  do {
    x = skyRand(0, CANVAS_W);
    y = skyRand(0, STAR_SKY_H);
  } while (!isSkyPoint(x, y) && ++tries < 8);
  star.x         = x;
  star.y         = y;
  star.r         = skyRand(STAR_MIN_R, STAR_MAX_R);
  star.color     = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
  star.life      = skyRand(STAR_LIFE_MIN, STAR_LIFE_MAX);
  star.age       = 0;
  star.twPhase   = skyRand(0, Math.PI * 2);
  star.twSpeed   = skyRand(STAR_TWINKLE_MIN, STAR_TWINKLE_MAX);
}

function initSky() {
  const stars = Game.sky.stars;
  stars.length = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = {};
    resetStar(s);
    s.age = skyRand(0, s.life);
    stars.push(s);
  }
  Game.sky.comet     = null;
  Game.sky.particles.length = 0;
  Game.sky.cometTimer = skyRand(COMET_MIN_DELAY, COMET_MAX_DELAY);
}

function starEnvelope(age, life) {
  if (age < STAR_FADE_MS)        return age / STAR_FADE_MS;
  if (age > life - STAR_FADE_MS) return Math.max(0, (life - age) / STAR_FADE_MS);
  return 1;
}

function spawnComet() {
  const fromLeft = Math.random() < 0.5;
  const y0    = skyRand(15, STAR_SKY_H * 0.7);
  const slope = skyRand(0.15, 0.5);
  const vx    = (fromLeft ? 1 : -1) * COMET_SPEED;
  const vy     = slope * COMET_SPEED;
  Game.sky.comet = {
    x:  fromLeft ? -40 : CANVAS_W + 40,
    y:  y0,
    vx, vy,
    emitAccum: 0,
  };
  if (Game.state !== 'title') playSound('comet');
}

function emitCometParticle(c) {
  const ang   = Math.random() * Math.PI * 2;
  const drift = skyRand(0, COMET_PART_DRIFT);
  Game.sky.particles.push({
    x:     c.x + skyRand(-2, 2),
    y:     c.y + skyRand(-2, 2),
    vx:    Math.cos(ang) * drift,
    vy:    Math.sin(ang) * drift,
    glyph: COMET_GLYPHS[Math.floor(Math.random() * COMET_GLYPHS.length)],
    size:  skyRand(COMET_PART_MIN_SZ, COMET_PART_MAX_SZ),
    age:   0,
    ttl:   COMET_PART_LIFE * skyRand(0.7, 1.1),
  });
}

function updateSky(dt) {
  const sky = Game.sky;

  // Advance the day-cycle transition (eases over SKY_TRANSITION_SEC).
  const sc = Game.skyCycle;
  if (sc.blend < 1) sc.blend = Math.min(1, sc.blend + dt / SKY_TRANSITION_SEC);

  for (const s of sky.stars) {
    s.age     += dt * 1000;
    s.twPhase += dt * s.twSpeed;
    if (s.age >= s.life) resetStar(s);
  }

  if (sky.comet) {
    const c = sky.comet;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    c.emitAccum += dt * 1000;
    const interval = 1000 / COMET_EMIT_RATE;
    while (c.emitAccum >= interval) {
      c.emitAccum -= interval;
      emitCometParticle(c);
    }

    const margin = 50;
    if (c.x < -margin || c.x > CANVAS_W + margin || c.y > CANVAS_H + margin) {
      sky.comet = null;
    }
  } else {
    sky.cometTimer -= dt * 1000;
    if (sky.cometTimer <= 0) {
      spawnComet();
      sky.cometTimer = skyRand(COMET_MIN_DELAY, COMET_MAX_DELAY);
    }
  }

  const parts = sky.particles;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt * 1000;
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    if (p.age >= p.ttl) parts.splice(i, 1);
  }
}

function drawSky(ctx) {
  const sky = Game.sky;
  ctx.save();

  // Stars fade out as the sky brightens toward day (per-phase visibility).
  const starVis = currentSkyColors().stars;
  for (const s of sky.stars) {
    if (starVis <= 0.01) break;
    const env = starEnvelope(s.age, s.life);
    if (env <= 0) continue;
    const twinkle = 0.55 + 0.45 * Math.sin(s.twPhase);
    ctx.globalAlpha = env * twinkle * starVis;
    ctx.fillStyle   = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = COMET_COLOR;
  ctx.shadowColor  = COMET_COLOR;
  for (const p of sky.particles) {
    const t = p.age / p.ttl;
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.shadowBlur  = 3 * (1 - t);
    ctx.font        = `${Math.max(1, Math.round(p.size * (1 - 0.55 * t)))}px "Segoe UI", monospace`;
    ctx.fillText(p.glyph, p.x, p.y);
  }

  const c = sky.comet;
  if (c) {
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHorizonGlow(ctx) {
  const grad = ctx.createRadialGradient(VP_X, HORIZON_Y, 0, VP_X, HORIZON_Y, 220);
  grad.addColorStop(0,   COLORS.horizonGlow);
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(VP_X - 220, HORIZON_Y - 40, 440, 280);
  ctx.restore();
}

function drawCenterDashes(ctx) {
  const cz = Game.cameraZ;

  ctx.save();
  ctx.shadowColor = COLORS.dashGlow;
  ctx.shadowBlur  = 4;
  ctx.fillStyle   = COLORS.dashFill;

  const absZ_min = cz + 1.01;
  const absZ_max = cz + DASH_MAX_WZ;

  const k_min = Math.ceil(absZ_min / DASH_PERIOD);
  const k_max = Math.floor(absZ_max / DASH_PERIOD);

  for (let k = k_min; k <= k_max; k++) {
    const absNear = k * DASH_PERIOD;
    const absFar  = absNear + DASH_LENGTH;
    const relNear = absNear - cz;
    const relFar  = absFar  - cz;

    if (relNear <= 0 || relFar <= 0) continue;

    const yBottom = Math.min(wz2y(relNear), CANVAS_H);
    const yTop    = wz2y(relFar);

    if (yBottom <= HORIZON_Y) continue;

    const hwTop    = roadAt(yTop).hw    * DASH_W_FRAC;
    const hwBottom = roadAt(yBottom).hw * DASH_W_FRAC;

    ctx.beginPath();
    ctx.moveTo(VP_X - hwTop,    yTop);
    ctx.lineTo(VP_X + hwTop,    yTop);
    ctx.lineTo(VP_X + hwBottom, yBottom);
    ctx.lineTo(VP_X - hwBottom, yBottom);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// Distant skyline silhouette on the horizon, behind the mid-city buildings.
// Scrolls slowly (FAR_SKYLINE_PARALLAX) so it lags the fast foreground —
// the far end of the parallax stack. Tinted with the day-cycle horizon.
function drawFarSkyline(ctx) {
  const scroll = Game.cameraZ * FAR_SKYLINE_PARALLAX;
  const off    = ((scroll % FAR_SKYLINE_SPACING) + FAR_SKYLINE_SPACING) % FAR_SKYLINE_SPACING;
  const base   = Math.floor(scroll / FAR_SKYLINE_SPACING);
  const tint   = rgbStr(shadeRgb(currentSkyColors().horizon, 0.34));
  const cols   = Math.ceil(CANVAS_W / FAR_SKYLINE_SPACING) + 2;

  ctx.save();
  ctx.globalAlpha = FAR_SKYLINE_ALPHA;
  ctx.fillStyle   = tint;
  for (let i = -1; i <= cols; i++) {
    const idx = base + i;
    const x   = i * FAR_SKYLINE_SPACING - off;
    const w   = FAR_SKYLINE_SPACING * (0.55 + farHash(idx * 2.3) * 0.4);
    const h   = FAR_SKYLINE_MIN_H + farHash(idx) * (FAR_SKYLINE_MAX_H - FAR_SKYLINE_MIN_H);
    ctx.fillRect(x, HORIZON_Y - h, w, h); // towers rise from the horizon into the sky
  }
  ctx.restore();
}


function drawBuildings(ctx) {
  const cz = Game.cameraZ;
  const lerp = (a, b, t) => a + (b - a) * t;

  const list = [];
  for (const sideSign of [-1, 1]) {
    const phase    = sideSign > 0 ? BUILDING_SIDE_PHASE : 0;
    const saltBase = sideSign > 0 ? 100 : 200;
    const kMin = Math.ceil ((cz + BUILDING_NEAR_CULL - phase) / BUILDING_PERIOD);
    const kMax = Math.floor((cz + BUILDING_FAR_WZ   - phase) / BUILDING_PERIOD);
    for (let k = kMin; k <= kMax; k++) {
      if (buildingHash(k, saltBase + 1) < BUILDING_SKIP_CHANCE) continue;
      const relZ = k * BUILDING_PERIOD + phase - cz;
      if (relZ < BUILDING_NEAR_CULL || relZ > BUILDING_FAR_WZ) continue;
      const gap    = lerp(BUILDING_GAP_MIN, BUILDING_GAP_MAX, buildingHash(k, saltBase + 2));
      const width  = lerp(BUILDING_W_MIN,   BUILDING_W_MAX,   buildingHash(k, saltBase + 3));
      const height = lerp(BUILDING_H_MIN,   BUILDING_H_MAX,   buildingHash(k, saltBase + 4));
      // Per-building facade tone + neon accent (stable across frames via the hash).
      const front  = BUILDING_FRONTS[Math.floor(buildingHash(k, saltBase + 18) * BUILDING_FRONTS.length)];
      const neon   = BUILDING_NEON[Math.floor(buildingHash(k, saltBase + 8) * BUILDING_NEON.length)];
      list.push({ k, sideSign, saltBase, relZ, gap, width, height, front, neon });
    }
  }
  list.sort((a, b) => b.relZ - a.relZ);

  ctx.save();
  for (const b of list) {
    const relZf = b.relZ;
    const relZb = b.relZ + BUILDING_DEPTH;
    const innerX = b.sideSign * (ROAD_HALF_W + b.gap);
    const outerX = b.sideSign * (ROAD_HALF_W + b.gap + b.width);

    const dF = PERSP_K / relZf, dB = PERSP_K / relZb;
    const groundF = HORIZON_Y + (1 + BUILDING_DROP)            * dF;
    const groundB = HORIZON_Y + (1 + BUILDING_DROP)            * dB;
    const topF    = HORIZON_Y + (1 + BUILDING_DROP - b.height) * dF;
    const topB    = HORIZON_Y + (1 + BUILDING_DROP - b.height) * dB;
    const fInner = VP_X + innerX / relZf, fOuter = VP_X + outerX / relZf;
    const bInner = VP_X + innerX / relZb, bOuter = VP_X + outerX / relZb;

    const clamp01  = (x) => Math.max(0, Math.min(1, x));
    const farFade  = lerp(1, BUILDING_FADE_MIN_A, clamp01((b.relZ - BUILDING_NEAR_CULL) / (BUILDING_FAR_WZ - BUILDING_NEAR_CULL)));
    const sinkFade = clamp01((b.relZ - BUILDING_NEAR_CULL) / (BUILDING_SINK_FADE_WZ - BUILDING_NEAR_CULL));
    const fade     = farFade * sinkFade;
    ctx.globalAlpha = fade;

    // Atmospheric perspective: distant buildings recede into the dusk-blue fog tint.
    const fogAmt = clamp01((b.relZ - BUILDING_NEAR_CULL) / (BUILDING_FAR_WZ - BUILDING_NEAR_CULL)) * 0.6;

    // Roof: lit top face (base tone brightened), hazed with distance.
    ctx.fillStyle = facadeTone(b.front, 1.55, fogAmt);
    ctx.beginPath();
    ctx.moveTo(fInner, topF); ctx.lineTo(fOuter, topF);
    ctx.lineTo(bOuter, topB); ctx.lineTo(bInner, topB);
    ctx.closePath(); ctx.fill();

    // Road-facing side: darkened base tone, hazed.
    ctx.fillStyle = facadeTone(b.front, 0.62, fogAmt);
    ctx.beginPath();
    ctx.moveTo(fInner, groundF); ctx.lineTo(bInner, groundB);
    ctx.lineTo(bInner, topB);    ctx.lineTo(fInner, topF);
    ctx.closePath(); ctx.fill();

    const faceL = Math.min(fInner, fOuter);
    const faceW = Math.abs(fOuter - fInner);
    const faceH = groundF - topF;
    // Gradient facade: sky-bounce highlight at top, shadow at base, per-building tone + fog.
    const fGrad = ctx.createLinearGradient(0, topF, 0, groundF);
    fGrad.addColorStop(0,   facadeTone(b.front, 1.45, fogAmt));
    fGrad.addColorStop(0.6, facadeTone(b.front, 1.0,  fogAmt));
    fGrad.addColorStop(1,   facadeTone(b.front, 0.55, fogAmt));
    ctx.fillStyle = fGrad;
    ctx.fillRect(faceL, topF, faceW, faceH);

    // Neon accent bands on front face AND road-facing side face
    if (faceH > 20 && b.relZ < BUILDING_WINDOW_NEAR_WZ * 1.3) {
      const bandColor = b.neon;
      const numBands  = buildingHash(b.k, b.saltBase + 9) < 0.38 ? 2 : 1;
      const bandH     = Math.max(1.5, faceH * 0.028);
      const dt        = bandH / faceH;  // band thickness as a fraction of face height (0 = top, 1 = bottom)
      for (let bi = 0; bi < numBands; bi++) {
        // Front-face vertical position of this band (0 = top, 1 = bottom).
        const tFront = 0.16 + bi * 0.38 + buildingHash(b.k * 7 + bi, b.saltBase + 10) * 0.20;
        // Side-face position: for 2-band buildings it matches the front (one ribbon wrapping the
        // corner); for 1-band buildings it is deliberately offset by > 3 band-heights so the two
        // stripes read as clearly separate, not a broken ribbon.
        let tSide = tFront;
        if (numBands === 1) {
          const gap = Math.max(0.26, dt * 4) + buildingHash(b.k, b.saltBase + 23) * 0.08;
          tSide = tFront + gap;
        }

        // Front face band
        ctx.save();
        ctx.globalAlpha = fade * 0.82;
        ctx.fillStyle   = bandColor;
        ctx.shadowColor = bandColor;
        ctx.shadowBlur  = 10;
        ctx.fillRect(faceL, topF + faceH * tFront, faceW, bandH);
        ctx.restore();

        // Side face band: parallelogram strip. Uses the SAME top→bottom mapping as the front face
        // (y = top + (ground - top) * t) so a shared t produces a continuous wrap at the corner.
        if (Math.abs(bInner - fInner) > 3) {
          const tSide1 = tSide + dt;
          const yTL = topF + (groundF - topF) * tSide;   // near-inner edge, band top
          const yBL = topF + (groundF - topF) * tSide1;  // near-inner edge, band bottom
          const yTR = topB + (groundB - topB) * tSide;   // back edge, band top
          const yBR = topB + (groundB - topB) * tSide1;  // back edge, band bottom
          ctx.save();
          ctx.globalAlpha = fade * 0.68;
          ctx.fillStyle   = bandColor;
          ctx.shadowColor = bandColor;
          ctx.shadowBlur  = 8;
          ctx.beginPath();
          ctx.moveTo(fInner, yTL);
          ctx.lineTo(bInner, yTR);
          ctx.lineTo(bInner, yBR);
          ctx.lineTo(fInner, yBL);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    if (b.relZ < BUILDING_WINDOW_NEAR_WZ && faceH > 10) {
      const rows    = Math.max(2, Math.min(14, Math.round(b.height / 0.16)));
      const winFade = fade * (1 - b.relZ / BUILDING_WINDOW_NEAR_WZ);
      // Per-building occupancy: some towers mostly dark, some mostly lit (lit fraction 0.30..0.75).
      const litThresh = 0.30 + buildingHash(b.k, b.saltBase + 19) * 0.45;
      const near      = b.relZ < 2.2;   // only near buildings get the window bloom
      ctx.globalAlpha = winFade;

      if (faceW > 6) {
        const cols = Math.max(1, Math.min(6, Math.round(b.width / 32)));
        const litCol = Math.floor(buildingHash(b.k, b.saltBase + 20) * cols); // one always-lit "elevator" column
        const cw = faceW / cols, ch = faceH / rows, mx = cw * 0.30, my = ch * 0.32;
        if (near) ctx.shadowBlur = 4;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const isCol = c === litCol;
            if (!isCol && buildingHash(b.k * 131 + r * 13 + c, b.saltBase + 5) > litThresh) continue;
            const warm = buildingHash(b.k * 57 + r * 7 + c, b.saltBase + 21) < 0.30;
            ctx.fillStyle = warm ? WIN_WARM : WIN_COOL;
            if (near) ctx.shadowColor = ctx.fillStyle;
            ctx.fillRect(faceL + c * cw + mx, topF + r * ch + my, cw - 2 * mx, ch - 2 * my);
          }
        if (near) ctx.shadowBlur = 0;
      }

      if (Math.abs(fInner - bInner) > 4) {
        const sCols = 2 + Math.floor(buildingHash(b.k, b.saltBase + 6) * 2);
        const mu = 0.22, mv = 0.32;
        const px = (u)    => fInner + (bInner - fInner) * u;
        const py = (u, v) => {
          const yb = groundF + (groundB - groundF) * u;
          const yt = topF    + (topB    - topF)    * u;
          return yb + (yt - yb) * v;
        };
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < sCols; c++) {
            if (buildingHash(b.k * 131 + r * 13 + c, b.saltBase + 7) > litThresh) continue;
            const warm = buildingHash(b.k * 57 + r * 7 + c, b.saltBase + 22) < 0.30;
            ctx.fillStyle = warm ? WIN_WARM : WIN_COOL;
            const u0 = (c + mu) / sCols, u1 = (c + 1 - mu) / sCols;
            const v0 = (r + mv) / rows,  v1 = (r + 1 - mv) / rows;
            ctx.beginPath();
            ctx.moveTo(px(u0), py(u0, v0));
            ctx.lineTo(px(u1), py(u1, v0));
            ctx.lineTo(px(u1), py(u1, v1));
            ctx.lineTo(px(u0), py(u0, v1));
            ctx.closePath();
            ctx.fill();
          }
      }
      ctx.globalAlpha = fade;
    }

    ctx.strokeStyle = COLORS.buildingEdge;
    ctx.lineWidth   = Math.max(1, 1.2 / relZf);
    ctx.beginPath();
    ctx.moveTo(bInner, topB);   ctx.lineTo(fInner, topF);   ctx.lineTo(fOuter, topF);
    ctx.lineTo(bOuter, topB);
    ctx.moveTo(fOuter, topF);   ctx.lineTo(fOuter, groundF);
    ctx.moveTo(bInner, groundB); ctx.lineTo(bInner, topB);
    ctx.stroke();

    // Rim light on the near vertical edge, tinted with the building's neon accent.
    ctx.strokeStyle = b.neon;
    ctx.lineWidth   = Math.max(1, 2 / relZf);
    ctx.shadowColor = b.neon;
    ctx.shadowBlur  = 8 * fade;
    ctx.beginPath();
    ctx.moveTo(fInner, groundF); ctx.lineTo(fInner, topF);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Rooftop stepped setback
    if (buildingHash(b.k, b.saltBase + 11) > 0.38 && faceW > 14) {
      const sbW  = faceW * (0.28 + buildingHash(b.k, b.saltBase + 12) * 0.38);
      const sbH  = Math.max(3, faceH * (0.08 + buildingHash(b.k, b.saltBase + 13) * 0.14));
      const sbL2 = faceL + (faceW - sbW) * buildingHash(b.k, b.saltBase + 14);
      ctx.save();
      ctx.globalAlpha = fade;
      const sbGrad = ctx.createLinearGradient(0, topF - sbH, 0, topF);
      sbGrad.addColorStop(0, '#2a2a52');
      sbGrad.addColorStop(1, COLORS.buildingFront);
      ctx.fillStyle   = sbGrad;
      ctx.fillRect(sbL2, topF - sbH, sbW, sbH);
      ctx.strokeStyle = COLORS.buildingEdge;
      ctx.lineWidth   = Math.max(1, 1.2 / relZf);
      ctx.strokeRect(sbL2, topF - sbH, sbW, sbH);
      ctx.restore();
    }

    // Antenna on taller buildings with blinking red tip
    if (b.height > 0.85 && buildingHash(b.k, b.saltBase + 15) > 0.42) {
      const antX = faceL + faceW * (0.25 + buildingHash(b.k, b.saltBase + 16) * 0.5);
      const antH = Math.max(4, faceH * (0.10 + buildingHash(b.k, b.saltBase + 17) * 0.15));
      ctx.save();
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = '#4a4a7a';
      ctx.lineWidth   = Math.max(1, 1.5 / relZf);
      ctx.shadowColor = '#4a4a7a';
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.moveTo(antX, topF);
      ctx.lineTo(antX, topF - antH);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (Math.sin(performance.now() * 0.0022 + b.k * 2.4) > 0.08) {
        ctx.fillStyle   = '#ff4444';
        ctx.shadowColor = '#ff5555';
        ctx.shadowBlur  = 7;
        ctx.beginPath();
        ctx.arc(antX, topF - antH, Math.max(1, 2.5 / relZf), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawEdgeZones(ctx) {
  const grad = ctx.createLinearGradient(ROAD_LEFT_BTM, 0, ROAD_RIGHT_BTM, 0);
  grad.addColorStop(0,    COLORS.edgeDanger);
  grad.addColorStop(0.07, 'rgba(0,0,0,0)');
  grad.addColorStop(0.93, 'rgba(0,0,0,0)');
  grad.addColorStop(1,    COLORS.edgeDanger);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(VP_X, HORIZON_Y);
  ctx.lineTo(ROAD_RIGHT_BTM, CANVAS_H);
  ctx.lineTo(ROAD_LEFT_BTM,  CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  GATE HELPERS
// ═══════════════════════════════════════════════════════════════════

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildingHash(k, salt) {
  const s = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function currentFractionChance() {
  if (Game.elapsed < FRACTION_START_TIME) return 0;
  return Math.min(FRACTION_CHANCE_MAX,
                  FRACTION_CHANCE_INITIAL + FRACTION_CHANCE_PER_GATE * Game.gatesPassed);
}

function targetCount() {
  return TARGET_BASE + (TARGET_CAP - TARGET_BASE) * (1 - Math.exp(-Game.elapsed / TARGET_TAU));
}

function targetBand() {
  const t = targetCount();
  return { low: Math.floor(t * (1 - TARGET_BAND_FRAC)), high: Math.ceil(t * (1 + TARGET_BAND_FRAC)) };
}

function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

function bestFractionApprox(targetRatio, wantGrowth) {
  let best = null, bestErr = Infinity;
  for (let num = 2; num <= 9; num++) {
    for (let den = 2; den <= FRACTION_MAX_DENOM; den++) {
      if (num === den) continue;
      const val = num / den;
      if (wantGrowth ? val <= 1 : val >= 1) continue;
      const err = Math.abs(val - targetRatio);
      if (err < bestErr) { bestErr = err; best = { num, den }; }
    }
  }
  return best;
}

function maybeReverseFraction(op) {
  if (op.den <= 1 || (op.type !== 'MUL' && op.type !== 'DIV')) return op;
  if (Math.random() >= FRACTION_REVERSE_CHANCE) return op;
  if (op.num > FRACTION_MAX_DENOM) return op;
  return { type: op.type === 'MUL' ? 'DIV' : 'MUL', num: op.den, den: op.num };
}

function opTowardValue(cur, goal) {
  cur = Math.max(1, cur);
  const ratio = goal / cur;

  if (goal >= cur) {
    if (ratio >= 1.25 && Math.random() < 0.5) {
      if (Math.random() < currentFractionChance()) {
        const f = bestFractionApprox(ratio, true);
        if (f) return maybeReverseFraction({ type: 'MUL', num: f.num, den: f.den });
      }
      return { type: 'MUL', num: clampInt(ratio, 2, MUL_INT_MAX), den: 1 };
    }
    return { type: '+', num: clampInt(goal - cur, 2, GROW_ADD_MAX), den: 1 };
  }

  if (ratio <= 0.8 && Math.random() < 0.5) {
    if (Math.random() < currentFractionChance()) {
      const f = bestFractionApprox(ratio, false);
      if (f) return maybeReverseFraction({ type: 'DIV', num: f.den, den: f.num });
    }
    if (ratio <= 0.5) return { type: 'DIV', num: clampInt(1 / ratio, 2, DIV_INT_MAX), den: 1 };
  }
  return { type: '-', num: clampInt(cur - goal, 2, SHRINK_SUB_MAX), den: 1 };
}

function opsEqual(a, b) {
  return a.type === b.type && a.num === b.num && a.den === b.den;
}

function controllerGoal(mp) {
  const { low, high } = targetBand();
  if (mp < low)  return Math.min(targetCount(), mp * STEP_MAX_FACTOR);
  if (mp > high) return Math.max(targetCount(), mp * STEP_MIN_FACTOR);
  return randInt(low, high);
}

function enforceSurvival(op, mp) {
  if (op.type === '-') {
    const maxSub = mp - 1;
    if (maxSub < 1) return { type: '+', num: 2, den: 1 };
    op.num = Math.min(op.num, maxSub);
    return op;
  }
  if ((op.type === 'DIV' || op.type === 'MUL') && applyOp(mp, op) < 1) {
    return mp >= 2 ? { type: 'DIV', num: 2, den: 1 } : { type: '+', num: 2, den: 1 };
  }
  return op;
}

function makeBadSideOp(mp) {
  if (Math.random() < 0.6) {
    const targetVal = mp * (BAD_SHRINK_LO + Math.random() * (BAD_SHRINK_HI - BAD_SHRINK_LO));
    return opTowardValue(mp, Math.max(0, Math.floor(targetVal)));
  }
  return opTowardValue(mp, Math.floor(mp * (1 + Math.random() * 0.2)));
}

function opLabel(op) {
  const sym = { '+': '+', '-': '−', 'MUL': '×', 'DIV': '÷' }[op.type];
  return op.den > 1 ? `${sym}${op.num}/${op.den}` : `${sym}${op.num}`;
}

function opIsPositive(op) {
  if (op.type === '+')   return true;
  if (op.type === '-')   return false;
  if (op.type === 'MUL') return op.num > op.den;
  if (op.type === 'DIV') return op.den > op.num;
  return null;
}

function applyOp(count, op) {
  switch (op.type) {
    case '+':   return count + op.num;
    case '-':   return Math.max(0, count - op.num);
    case 'MUL': return Math.max(0, Math.floor(count * op.num / op.den));
    case 'DIV': return Math.max(0, Math.floor(count * op.den / op.num));
    default:    return count;
  }
}

function syncCrowdPeople(oldCount, newCount) {
  const crowd      = Game.crowd;
  const oldDisplay = Math.min(oldCount,  MAX_DISPLAY_FIGURES);
  const newDisplay = Math.min(newCount,  MAX_DISPLAY_FIGURES);

  if (newDisplay > oldDisplay) {
    for (let i = 0; i < newDisplay - oldDisplay; i++) {
      crowd.people.push({
        phaseOffset: Math.random() * Math.PI * 2,
        scale: 0, scaleTarget: 1,
        spawnDelay: i * SPAWN_STAGGER_MS, spawnTimer: 0,
        ...personVariety(),
      });
    }
  } else if (newDisplay < oldDisplay) {
    let toMark = oldDisplay - newDisplay, delay = 0;
    for (let i = crowd.people.length - 1; i >= 0 && toMark > 0; i--) {
      if (crowd.people[i].scaleTarget === 1) {
        crowd.people[i].scaleTarget = 0;
        crowd.people[i].spawnTimer  = 0;
        crowd.people[i].spawnDelay  = delay;
        delay += SPAWN_STAGGER_MS;
        toMark--;
      }
    }
  }
}

function applyGateSection(sec) {
  const crowd    = Game.crowd;
  const oldCount = crowd.count;
  crowd.count    = applyOp(oldCount, sec.op);
  syncCrowdPeople(oldCount, crowd.count);
  if (Game.state === 'running') {
    if      (crowd.count > oldCount) playSound('gatePositive');
    else if (crowd.count < oldCount) playSound('gateNegative');
  }
}

function updateCrowdAnimations(dt) {
  const ms     = dt * 1000;
  const people = Game.crowd.people;
  for (const p of people) {
    p.spawnTimer += ms;
    const t = Math.max(0, p.spawnTimer - p.spawnDelay);
    p.scale = p.scaleTarget === 1
      ? Math.min(1, t / SPAWN_ANIM_MS)
      : Math.max(0, 1 - t / DESPAWN_ANIM_MS);
  }
  Game.crowd.people = people.filter(p => !(p.scaleTarget === 0 && p.scale <= 0));
}

function spawnGate() {
  const absZ = Game.cameraZ + GATE_SPAWN_WZ;

  if (Game.gatesSpawned++ === 0) {
    const op = Math.random() < 0.5
      ? { type: '+',   num: randInt(5, 10), den: 1 }
      : { type: 'MUL', num: randInt(2, 4),  den: 1 };
    Game.maxPossible = applyOp(Game.maxPossible, op);
    return { absZ, sections: [{ side: 'full', op, positive: true }] };
  }

  const mp = Game.maxPossible;

  if (Math.random() < SPLIT_GATE_CHANCE) {
    let opGood = enforceSurvival(opTowardValue(mp, controllerGoal(mp)), mp);
    let opBad  = makeBadSideOp(mp);
    let tries = 0;
    while (opsEqual(opGood, opBad) && tries++ < 8) opBad = makeBadSideOp(mp);
    if (opsEqual(opGood, opBad)) {
      opBad = { type: opBad.type, num: opBad.num + 1, den: opBad.den };
      if (opBad.den > 1 && opBad.num === opBad.den) opBad.num++;
    }
    if (applyOp(mp, opBad) > applyOp(mp, opGood)) { const t = opGood; opGood = opBad; opBad = t; }
    Game.maxPossible = Math.max(applyOp(mp, opGood), applyOp(mp, opBad));

    const goodLeft = Math.random() < 0.5;
    return {
      absZ,
      sections: [
        { side: 'left',  op: goodLeft ? opGood : opBad,  positive: opIsPositive(goodLeft ? opGood : opBad)  },
        { side: 'right', op: goodLeft ? opBad  : opGood, positive: opIsPositive(goodLeft ? opBad  : opGood) },
      ],
    };
  }

  const op = enforceSurvival(opTowardValue(mp, controllerGoal(mp)), mp);
  Game.maxPossible = applyOp(mp, op);
  return { absZ, sections: [{ side: 'full', op, positive: opIsPositive(op) }] };
}

function drawGates(ctx) {
  for (const gate of Game.gates) {
    const relZ = gate.absZ - Game.cameraZ;
    if (relZ < 1.0 || relZ > GATE_SPAWN_WZ + 2) continue;

    // Distance fade — nearest gate stays solid, distant stacked gates go faint.
    const fadeT     = Math.max(0, Math.min(1, (relZ - GATE_FADE_NEAR_WZ) / (GATE_FADE_FAR_WZ - GATE_FADE_NEAR_WZ)));
    const depthFade = 1 - (1 - GATE_FADE_MIN) * fadeT;

    const hw   = ROAD_HALF_W / relZ;
    const yBot = Math.min(wz2y(relZ), CANVAS_H);
    const yTop = HORIZON_Y + (1 - GATE_WORLD_HEIGHT) * PERSP_K / relZ;
    const xL   = VP_X - hw;
    const xR   = VP_X + hw;

    if (yTop >= CANVAS_H || yBot <= HORIZON_Y) continue;

    const relZ2 = relZ + GATE_WORLD_DEPTH;
    const hw2   = ROAD_HALF_W / relZ2;
    const yTop2 = HORIZON_Y + (1 - GATE_WORLD_HEIGHT) * PERSP_K / relZ2;
    const xL2   = VP_X - hw2;
    const xR2   = VP_X + hw2;

    for (const sec of gate.sections) {
      let fxL, fxR, bxL, bxR;
      if (sec.side === 'full') {
        fxL = xL;   fxR = xR;   bxL = xL2;  bxR = xR2;
      } else if (sec.side === 'left') {
        fxL = xL;   fxR = VP_X; bxL = xL2;  bxR = VP_X;
      } else {
        fxL = VP_X; fxR = xR;   bxL = VP_X; bxR = xR2;
      }

      const color = sec.op.den > 1          ? COLORS.gateFraction :
                    sec.positive === true   ? COLORS.gateGood :
                    sec.positive === false  ? COLORS.gateBad  :
                    COLORS.gateNeutral;

      ctx.save();
      // Base face fill
      ctx.globalAlpha = GATE_ALPHA * depthFade;
      ctx.fillStyle   = color;
      ctx.fillRect(fxL, yTop, fxR - fxL, yBot - yTop);

      const lw = Math.max(2, 7 / relZ);

      // Inner rib glow: clip to face interior, stroke the border with large
      // shadowBlur — shadow bleeds inward from the ribs toward the center
      ctx.save();
      ctx.beginPath();
      ctx.rect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 48;
      ctx.globalAlpha = 0.85 * depthFade;
      ctx.strokeRect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 26;
      ctx.globalAlpha = 0.30 * depthFade;
      ctx.strokeRect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.restore();

      // Outer bloom + crisp bright edge
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.globalAlpha = 0.55 * depthFade;
      ctx.lineWidth   = lw * 3;
      ctx.shadowBlur  = 36;
      ctx.strokeRect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.globalAlpha = 1.0 * depthFade;
      ctx.lineWidth   = lw;
      ctx.shadowBlur  = 10;
      ctx.strokeRect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fxL, yTop);
      ctx.lineTo(fxR, yTop);
      ctx.lineTo(bxR, yTop2);
      ctx.lineTo(bxL, yTop2);
      ctx.closePath();
      ctx.globalAlpha = GATE_ALPHA * depthFade;
      ctx.fillStyle   = color;
      ctx.fill();
      ctx.globalAlpha = 0.22 * depthFade;
      ctx.fillStyle   = '#ffffff';
      ctx.fill();
      ctx.restore();

      const cx = (fxL + fxR) / 2;
      const cy = (yTop + yBot) / 2;
      const fs = Math.max(10, Math.round(50 / relZ));
      ctx.save();
      ctx.font         = `bold ${fs}px 'Segoe UI', monospace`;
      ctx.fillStyle    = '#ffffff';
      ctx.globalAlpha  = depthFade;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur   = 6;
      ctx.fillText(opLabel(sec.op), cx, cy);
      ctx.restore();
    }

    if (gate.sections.length === 2) {
      ctx.save();
      ctx.globalAlpha = depthFade;
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth   = Math.max(1, 1.5 / relZ);
      ctx.beginPath();
      ctx.moveTo(VP_X, yTop);
      ctx.lineTo(VP_X, yBot);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(VP_X, yTop);
      ctx.lineTo(VP_X, yTop2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// A translucent, colorful soap bubble: tinted glassy fill + iridescent rim +
// two specular highlights. `tint` biases the whole bubble green (positive) or
// red (negative); `alpha` is the overall opacity as it fades out.
function drawSoapBubble(ctx, cx, cy, r, tint, alpha) {
  const [tr, tg, tb] = hexToRgb(tint);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Glassy body — transparent core, tinted toward the rim.
  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  body.addColorStop(0,    `rgba(255,255,255,0.10)`);
  body.addColorStop(0.55, `rgba(${tr},${tg},${tb},0.14)`);
  body.addColorStop(0.85, `rgba(${tr},${tg},${tb},0.30)`);
  body.addColorStop(1,    `rgba(${tr},${tg},${tb},0.06)`);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // Iridescent rim.
  ctx.lineWidth   = 2;
  ctx.strokeStyle = `rgba(${tr},${tg},${tb},0.65)`;
  ctx.shadowColor = tint;
  ctx.shadowBlur  = 12;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Soft colored inner sheen along the lower-right arc (soap-film shimmer).
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, Math.PI * 0.15, Math.PI * 0.75);
  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = `rgba(255,255,255,0.28)`;
  ctx.stroke();

  // Bright specular highlight (top-left).
  ctx.beginPath();
  ctx.arc(cx - r * 0.34, cy - r * 0.36, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,0.85)`;
  ctx.fill();
  // Tiny secondary glint.
  ctx.beginPath();
  ctx.arc(cx - r * 0.05, cy - r * 0.5, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,0.6)`;
  ctx.fill();

  ctx.restore();
}

function drawGatePopups(ctx) {
  for (const p of Game.gatePopups) {
    const progress = Math.min(1, p.t / p.dur);   // 0 → 1
    const cx = p.x;
    const cy = p.y - POP_RISE * progress;

    // Comet-style particles spreading outward in all directions as it fades.
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = p.color;
    ctx.shadowColor  = p.color;
    const popFade = 1 - progress;   // particles never outshine the fading bubble
    for (const q of p.parts) {
      const t = q.age / q.ttl;
      ctx.globalAlpha = (1 - t) * 0.85 * popFade;
      ctx.shadowBlur  = 4 * (1 - t);
      ctx.font        = `${Math.max(1, Math.round(q.size * (1 - 0.5 * t)))}px "Segoe UI", monospace`;
      ctx.fillText(q.glyph, q.x, q.y);
    }
    ctx.restore();

    // The bubble + its enclosed modifier text (only while the bubble is alive).
    if (progress < 1) {
      const bubbleAlpha = 1 - progress;
      const r           = POP_BUBBLE_R * (1 + 0.14 * progress);   // gentle swell
      drawSoapBubble(ctx, cx, cy, r, p.color, bubbleAlpha);

      const fs = Math.round(30 * (1 - progress * 0.25));
      ctx.save();
      ctx.globalAlpha  = bubbleAlpha;
      ctx.font         = `bold ${fs}px 'Segoe UI', monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = p.color;
      ctx.shadowBlur   = 8;
      ctx.fillStyle    = '#ffffff';
      ctx.fillText(p.label, cx, cy);
      ctx.restore();
    }
  }
}

function drawFigure(ctx, x, y, phase, scale, stroke, fill, tint = 1) {
  const H = FIGURE_HEIGHT * scale;
  if (H < 1) return;

  // Per-figure brightness. Body/head use the tinted colors; far limbs stay
  // darker via the existing foreshorten shade, folded into one multiplier so
  // shadeHex still parses the original hex (never a pre-built rgb() string).
  const tStroke = tint === 1 ? stroke : shadeHex(stroke, tint);
  const tFill   = tint === 1 ? fill   : shadeHex(fill,   tint);

  const headR  = H * 0.14, neckLen = H * 0.05, torsoLen = H * 0.30;
  const uArmLen = H * 0.20, fArmLen = H * 0.17, uLegLen = H * 0.22, shinLen = H * 0.20;

  const p   = phase;
  const sL  = Math.sin(p);
  const sR  = Math.sin(p + Math.PI);
  const aL  = sR, aR = sL;
  const bob = Math.sin(2 * p) * BOB_AMPLITUDE * scale;

  const footBaseY = y + bob;
  const hipY      = footBaseY - uLegLen - shinLen;
  const legSpan   = LEG_LATERAL_SEP * H;
  const armSpan   = ARM_LATERAL_SEP * H;
  const hipLX     = x - legSpan, hipRX = x + legSpan;

  const yaw       = FIGURE_YAW;
  const shCX      = x + Math.sin(yaw) * torsoLen;
  const shoulderY = hipY - torsoLen + FIGURE_LEAN * H;
  const shLX      = shCX - armSpan, shRX = shCX + armSpan;
  const headCX    = shCX + Math.sin(yaw) * neckLen;
  const headCY    = shoulderY - neckLen - headR;

  const baseLW    = Math.max(1.2, 1.8 * scale);
  const farStroke = shadeHex(stroke, q2(tint * FORESHORTEN_SHADE));

  function seg(px, py, ex, ey, hx2, hy2, f, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(1, baseLW * f);
    ctx.beginPath();
    ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2);
    ctx.stroke();
  }

  function legJoints(hx, s) {
    const f    = 1 - FORESHORTEN_AMT * s;
    const uL   = uLegLen * f, shL = shinLen * f;
    const sw   = s * LEG_SWING_AMP;
    const bend = LEG_KNEE_BEND * Math.max(0, s);
    const kneeX = hx + (x - hx) * (LEG_CONVERGE * Math.max(0, s)) + Math.sin(yaw) * uL * 0.3;
    const kneeY = hipY - Math.sin(LEG_LIFT_ANG * sw) * uL;
    const footX = kneeX + Math.sin(yaw + bend) * shL * 0.5;
    const footY = kneeY + Math.cos(LEG_LIFT_ANG * sw + bend) * shL + LEG_STRIDE_Y * (-s) * H;
    return { px: hx, py: hipY, ex: kneeX, ey: kneeY, hx2: footX, hy2: footY, f };
  }

  function armJoints(sx, a) {
    const f    = 1 - FORESHORTEN_AMT * a * 0.6;
    const uA   = uArmLen * f, fA = fArmLen * f;
    const side = sx < shCX ? -1 : 1;
    const elbowX = sx + side * ARM_OUT * uA + Math.sin(yaw) * uA * 0.3;
    const elbowY = shoulderY + uA * 0.9;
    const handX  = elbowX + Math.sin(yaw + ARM_ELBOW_FLEX) * fA * 0.5 + side * ARM_OUT * 0.3 * fA;
    const handY  = elbowY + Math.cos(ARM_ELBOW_FLEX) * fA - ARM_SWING_AMP * H * a;
    return { px: sx, py: shoulderY, ex: elbowX, ey: elbowY, hx2: handX, hy2: handY, f };
  }

  const legA = legJoints(hipLX, sL), legB = legJoints(hipRX, sR);
  const armA = armJoints(shLX, aL),  armB = armJoints(shRX, aR);

  const legFar  = sL >= sR ? legA : legB, legNear = sL >= sR ? legB : legA;
  const armFar  = aL >= aR ? armA : armB, armNear = aL >= aR ? armB : armA;

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = tFill;

  seg(armFar.px, armFar.py, armFar.ex, armFar.ey, armFar.hx2, armFar.hy2, armFar.f, farStroke);
  seg(legFar.px, legFar.py, legFar.ex, legFar.ey, legFar.hx2, legFar.hy2, legFar.f, farStroke);

  ctx.strokeStyle = tStroke;
  ctx.lineWidth   = baseLW;
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(shCX, shoulderY);
  ctx.lineTo(headCX, headCY + headR);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  seg(legNear.px, legNear.py, legNear.ex, legNear.ey, legNear.hx2, legNear.hy2, legNear.f, tStroke);
  seg(armNear.px, armNear.py, armNear.ex, armNear.ey, armNear.hx2, armNear.hy2, armNear.f, tStroke);

  ctx.restore();
}

// Soft flattened ellipse under a figure's feet — grounds the crowd on the road.
function drawGroundShadow(ctx, x, y, scale) {
  const rx = FIGURE_HEIGHT * scale * 0.30;
  if (rx < 0.5) return;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
  ctx.beginPath();
  ctx.ellipse(x, y + FIGURE_HEIGHT * scale * 0.02, rx, rx * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Soft brand-cyan spotlight under the crowd's lead figure ("you"), so the player
// can read the front of their own crowd at a glance.
function drawLeaderGlow(ctx, x, y, scale) {
  const rx = FIGURE_HEIGHT * scale * 0.44;
  if (rx < 1) return;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(126,216,240,0.34)');
  g.addColorStop(1, 'rgba(126,216,240,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ringFormation(n, centerX, baseY, spacing) {
  const positions = [];
  if (n <= 0) return positions;

  positions.push({ x: centerX, y: baseY });

  let ring = 1;
  while (positions.length < n) {
    const r         = ring * spacing;
    const maxInRing = Math.max(6, Math.floor(2 * Math.PI * r / spacing));
    const inRing    = Math.min(maxInRing, n - positions.length);

    for (let i = 0; i < inRing; i++) {
      const angle = (i / maxInRing) * Math.PI * 2 - Math.PI / 2;
      positions.push({
        x: centerX + Math.cos(angle) * r,
        y: baseY   + Math.sin(angle) * r * 0.45,
      });
    }
    ring++;
  }
  return positions;
}

function getCrowdPositions() {
  return ringFormation(Game.crowd.people.length, Game.crowd.x, CROWD_Y, FIGURE_SPACING);
}

function drawCrowd(ctx) {
  const { crowd, runClock } = Game;
  if (crowd.people.length === 0) return;

  const positions = getCrowdPositions();

  // Index 0 is the crowd's center anchor ("you") — kept un-jittered + highlighted.
  // Everyone else gets a small stable offset so the pack reads organic, not ringed.
  const slots = positions
    .map((pos, i) => {
      const p = crowd.people[i];
      const leader = i === 0;
      const jpos = (p && !leader)
        ? { x: pos.x + (p.jx ?? 0) * FIGURE_SPACING, y: pos.y + (p.jy ?? 0) * FIGURE_SPACING * 0.45 }
        : pos;
      return { pos: jpos, p, leader };
    })
    .filter(s => s.p && s.p.scale > 0)
    .sort((a, b) => a.pos.y - b.pos.y);

  let minY = CROWD_Y;
  for (const s of slots) if (s.pos.y < minY) minY = s.pos.y;
  const backSpan = Math.max(1, CROWD_Y - minY);
  const depth = pos => Math.max(0, Math.min(1, (CROWD_Y - pos.y) / backSpan));

  // Pass 1: ground shadows (behind every figure so a near shadow never dims a far body)
  for (const { pos, p, leader } of slots) {
    const dz = depth(pos);
    drawGroundShadow(ctx, pos.x, pos.y,
      p.scale * (p.sizeMul ?? 1) * (leader ? LEADER_SIZE_BOOST : 1) * (1 - DEPTH_SCALE_FALLOFF * dz));
  }
  // Pass 2: figures (back rows smaller + dimmer, each with its own size / tint / gait)
  for (const { pos, p, leader } of slots) {
    const dz    = depth(pos);
    const scale = p.scale * (p.sizeMul ?? 1) * (leader ? LEADER_SIZE_BOOST : 1) * (1 - DEPTH_SCALE_FALLOFF * dz);
    const tint  = q2((p.tint ?? 1) * (leader ? LEADER_TINT_BOOST : 1) * (1 - DEPTH_FADE_FALLOFF * dz));
    if (leader) drawLeaderGlow(ctx, pos.x, pos.y, scale);
    drawFigure(ctx, pos.x, pos.y, runClock * (p.gaitSpeed ?? 1) + p.phaseOffset, scale,
               COLORS.playerStroke, COLORS.playerFill, tint);
  }
}

function scoreMeters() {
  return Math.floor(Game.distancePx * SCORE_SCALE);
}

function drawHUD(ctx) {
  ctx.save();
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 8;

  ctx.font      = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(scoreMeters() + ' m', 16, 12);

  ctx.font      = 'bold 40px "Segoe UI", sans-serif';
  ctx.fillStyle = COLORS.hudAccent;
  ctx.fillText(String(Game.crowd.count), 16, 46);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const Input = { left: false, right: false, mouseDown: false, mouseX: 0 };

const lbModal     = document.getElementById('leaderboardModal');
const lbList      = document.getElementById('leaderboardList');
const titleScreen = document.getElementById('titleScreen');
const titleList   = document.getElementById('titleScores');

function showTitle() { titleScreen.hidden = false; }
function hideTitle() { titleScreen.hidden = true;  }

// Power/exit button — only shown during active gameplay. Terminates the run and
// returns straight to the title screen, skipping the game-over score table.
const exitBtn = document.getElementById('exitBtn');
// Icon injected here (not inline in index.html) so the HTML file never contains
// both an <svg> and a <script> tag, which the mini-app validator flags as XSS.
if (exitBtn) {
  exitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L12 12"></path><path d="M7.5 6.5 a7 7 0 1 0 9 0"></path></svg>`;
}
function showExit() { if (exitBtn) exitBtn.hidden = false; }
function hideExit() { if (exitBtn) exitBtn.hidden = true;  }

function renderScoreRows(listEl, scores, highlightRank) {
  listEl.innerHTML = '';
  for (let i = 0; i < HIGHSCORE_COUNT; i++) {
    const li    = document.createElement('li');
    const has   = i < scores.length;
    const isNew = has && i === highlightRank;
    if (isNew) li.className = 'new';
    const val = has ? `${scores[i]} m${isNew ? '<span class="tag">NEW</span>' : ''}` : '-----';
    li.innerHTML = `<span class="rank">#${i + 1}</span><span class="score">${val}</span>`;
    listEl.appendChild(li);
  }
}

function renderTitleScores() { renderScoreRows(titleList, loadHighscores(), -1); }
function renderLeaderboard()  { renderScoreRows(lbList, Game.highscores, Game.lastRank); }

function openLeaderboard() {
  renderLeaderboard();
  lbModal.hidden = false;
  Game.state = 'leaderboard';
  Input.left = false; Input.right = false; Input.mouseDown = false;
}

function hideLeaderboard() { lbModal.hidden = true; }

document.getElementById('playBtn').addEventListener('click', () => { playSound('button'); startGame(); });
document.getElementById('titleBtn').addEventListener('click', () => { playSound('button'); hideLeaderboard(); startTitleDemo(); });
document.getElementById('playAgainBtn').addEventListener('click', () => { playSound('button'); hideLeaderboard(); startGame(); });
document.getElementById('soundBtn').addEventListener('click', () => { cycleMuteState(); playSound('button'); });
if (exitBtn) exitBtn.addEventListener('click', () => { playSound('button'); startTitleDemo(); });

function clientToCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (CANVAS_W / rect.width);
}

window.addEventListener('keydown', e => {
  if (Game.state === 'title') return;
  if (Game.state === 'leaderboard') return;
  if (Game.state === 'gameover') { openLeaderboard(); return; }
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  Input.left  = true;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') Input.right = true;
});
window.addEventListener('keyup', e => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  Input.left  = false;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') Input.right = false;
});

canvas.addEventListener('mousedown', e => {
  if (Game.state === 'title') return;
  if (Game.state === 'leaderboard') return;
  if (Game.state === 'gameover') { openLeaderboard(); return; }
  Input.mouseDown = true;
  Input.mouseX    = clientToCanvasX(e.clientX);
});
canvas.addEventListener('mousemove', e => {
  if (Input.mouseDown) Input.mouseX = clientToCanvasX(e.clientX);
});
window.addEventListener('mouseup', () => { Input.mouseDown = false; });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (Game.state === 'title') return;
  if (Game.state === 'leaderboard') return;
  if (Game.state === 'gameover') { openLeaderboard(); return; }
  Input.mouseDown = true;
  Input.mouseX    = clientToCanvasX(e.touches[0].clientX);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  Input.mouseX = clientToCanvasX(e.touches[0].clientX);
}, { passive: false });
canvas.addEventListener('touchend', () => { Input.mouseDown = false; });

function updateCrowd(dt) {
  const crowd = Game.crowd;

  let dir = 0;
  if (Input.left)  dir = -1;
  if (Input.right) dir =  1;
  if (!Input.left && !Input.right && Input.mouseDown) {
    const DEAD_ZONE = 5;
    if (Input.mouseX < crowd.x - DEAD_ZONE) dir = -1;
    if (Input.mouseX > crowd.x + DEAD_ZONE) dir =  1;
  }

  crowd.x += dir * CROWD_SPEED_X * dt;

  const bounds    = roadAt(CROWD_Y);
  const halfWidth = crowdHalfWidth();
  crowd.x = Math.max(bounds.left  + halfWidth,
             Math.min(bounds.right - halfWidth, crowd.x));

  return dir;
}

function crowdHalfWidth() {
  const positions = getCrowdPositions();
  let half = FIGURE_HEIGHT * 0.5;
  for (let i = 0; i < Game.crowd.people.length; i++) {
    const p = Game.crowd.people[i];
    if (!p || p.scaleTarget !== 1) continue;
    const pos = positions[i];
    if (pos) half = Math.max(half, Math.abs(pos.x - Game.crowd.x));
  }
  return half;
}

function crowdEdgeMargins() {
  const positions = getCrowdPositions();
  let left = Infinity, right = Infinity;
  for (let i = 0; i < Game.crowd.people.length; i++) {
    const p = Game.crowd.people[i];
    if (!p || p.scaleTarget !== 1) continue;
    const pos = positions[i];
    if (!pos) continue;
    const r = roadAt(pos.y);
    left  = Math.min(left,  pos.x - r.left);
    right = Math.min(right, r.right - pos.x);
  }
  return { left, right };
}

function updateEdgeFalling(dt, dir) {
  const crowd = Game.crowd;

  if (Game.elapsed < EDGE_FALL_GRACE_S) { crowd.edgeFallAccum = 0; return; }

  const { left, right } = crowdEdgeMargins();
  const hittingLeft  = dir < 0 && left  <= EDGE_DANGER_WIDTH;
  const hittingRight = dir > 0 && right <= EDGE_DANGER_WIDTH;

  if (!hittingLeft && !hittingRight) { crowd.edgeFallAccum = 0; return; }

  crowd.edgeFallAccum += EDGE_FALL_RATE * dt;
  while (crowd.edgeFallAccum >= 1.0 && crowd.count > 0) {
    crowd.edgeFallAccum -= 1.0;
    dropFigureOffEdge(hittingLeft ? -1 : 1);
  }
}

function dropFigureOffEdge(side) {
  const crowd    = Game.crowd;
  const oldCount = crowd.count;
  if (oldCount <= 0) return;
  const newCount = oldCount - 1;

  const oldDisplay = Math.min(oldCount, MAX_DISPLAY_FIGURES);
  const newDisplay = Math.min(newCount, MAX_DISPLAY_FIGURES);

  const positions = getCrowdPositions();
  let bestIdx = -1;
  let bestX   = side < 0 ? Infinity : -Infinity;
  for (let i = 0; i < crowd.people.length; i++) {
    const p = crowd.people[i];
    if (!p || p.scaleTarget !== 1) continue;
    const px = positions[i] ? positions[i].x : crowd.x;
    if (side < 0 ? px < bestX : px > bestX) { bestX = px; bestIdx = i; }
  }

  if (bestIdx !== -1) {
    const pos    = positions[bestIdx] || { x: crowd.x, y: CROWD_Y };
    const person = crowd.people[bestIdx];
    Game.fallers.push({
      x: pos.x + (Math.random() - 0.5) * FIGURE_SPACING,
      y: pos.y + (Math.random() - 0.5) * FIGURE_SPACING * 0.5,
      phaseOffset: person.phaseOffset,
      sizeMul: person.sizeMul ?? 1, tint: person.tint ?? 1, gaitSpeed: person.gaitSpeed ?? 1,
      side, t: 0,
    });
    if (newDisplay < oldDisplay) crowd.people.splice(bestIdx, 1);
  }

  crowd.count = newCount;
  playSound('fall');
}

function updateFallers(dt) {
  const ms = dt * 1000;
  for (const f of Game.fallers) f.t += ms;
  Game.fallers = Game.fallers.filter(f => f.t < FALL_ANIM_MS);
}

function drawFallers(ctx) {
  for (const f of Game.fallers) {
    const prog  = Math.min(1, f.t / FALL_ANIM_MS);
    const slide = prog * 130;
    const drop  = prog * prog * 70;
    const angle = prog * (Math.PI / 2) * f.side;
    ctx.save();
    ctx.globalAlpha = 1 - prog;
    ctx.translate(f.x + f.side * slide, f.y + drop);
    ctx.rotate(angle);
    drawFigure(ctx, 0, 0, f.phaseOffset, f.sizeMul ?? 1, COLORS.playerStroke, COLORS.playerFill, f.tint ?? 1);
    ctx.restore();
  }
}

function triggerGameOver() {
  if (Game.state === 'gameover' || Game.state === 'leaderboard') return;
  Game.state = 'gameover';
  hideExit();
  const res = saveHighscore(scoreMeters());
  Game.highscores = res.scores;
  Game.lastRank   = res.rank;
  playSound('gameover');
}

function loadHighscores() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIGHSCORE_KEY));
    if (!Array.isArray(arr)) return [];
    return arr.filter(n => typeof n === 'number' && isFinite(n))
              .sort((a, b) => b - a)
              .slice(0, HIGHSCORE_COUNT);
  } catch (e) { return []; }
}

function saveHighscore(score) {
  const scores = loadHighscores();
  scores.push(score);
  scores.sort((a, b) => b - a);
  const trimmed = scores.slice(0, HIGHSCORE_COUNT);
  const rank    = trimmed.indexOf(score);
  try { localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(trimmed)); } catch (e) {}
  return { scores: trimmed, rank };
}

function resetSim() {
  Game.scrollSpeed = GATE_SCROLL_SPEED_INITIAL;
  Game.cameraZ     = 0;
  Game.runClock    = 0;
  Game.elapsed     = 0;
  Game.distancePx  = 0;
  Game.gates        = [];
  Game.gatePopups   = [];
  Game.rivals       = [];
  Game.fallers      = [];
  Game.debris       = [];
  Game.nextSpawnZ   = 0;
  Game.gatesSpawned = 0;
  Game.gatesPassed  = 0;
  Game.spawnTick    = 0;

  Game.maxPossible         = INITIAL_CROWD;
  Game.crowd.x             = VP_X;
  Game.crowd.count         = INITIAL_CROWD;
  Game.crowd.edgeFallAccum = 0;
  Game.crowd.people        = [];
  for (let i = 0; i < INITIAL_CROWD; i++) {
    Game.crowd.people.push({
      phaseOffset: Math.random() * Math.PI * 2,
      scale: 1, scaleTarget: 1, spawnDelay: 0, spawnTimer: 99999,
      ...personVariety(),
    });
  }

  warmUpRoad();
  resetSkyCycle();

  Input.left = false; Input.right = false; Input.mouseDown = false;
  hideLeaderboard();
}

function warmUpRoad() {
  const skipPx        = START_SKIP_M / SCORE_SCALE;
  const targetCameraZ = skipPx * (RELZ_CROWD * RELZ_CROWD) / PERSP_K;

  while (Game.nextSpawnZ <= targetCameraZ) {
    Game.cameraZ    = Game.nextSpawnZ;
    Game.nextSpawnZ += GATE_SPAWN_DIST_WZ;
    Game.spawnTick++;
    if (Game.spawnTick % RIVAL_EVERY_N_GATES === 0) {
      const rival = spawnRival();
      if (rival) Game.rivals.push(rival);
      else       Game.gates.push(spawnGate());
    } else {
      Game.gates.push(spawnGate());
    }
  }
  Game.cameraZ = targetCameraZ;

  Game.gates  = Game.gates.filter(g  => (g.absZ - Game.cameraZ) > 0.9);
  Game.rivals = Game.rivals.filter(r => (r.absZ - Game.cameraZ) > 0.9);
}

function startGame() {
  resetSim();
  Game.state = 'running';
  hideTitle();
  hideLeaderboard();
  showExit();
  startMusic();
}

function startTitleDemo() {
  resetSim();
  Game.demo.gateZ   = null;
  Game.demo.targetX = VP_X;
  Game.state = 'title';
  renderTitleScores();
  showTitle();
  hideLeaderboard();
  hideExit();
  fadeOutMusic();
}

function chooseTargetX(gate, count) {
  const road = roadAt(CROWD_Y);
  if (gate.sections.length < 2) return VP_X;
  const L = gate.sections.find(s => s.side === 'left');
  const R = gate.sections.find(s => s.side === 'right');
  let pickLeft = applyOp(count, L.op) >= applyOp(count, R.op);
  if (Math.random() < DEMO_ERROR_CHANCE) pickLeft = !pickLeft;
  return pickLeft ? (road.left + VP_X) / 2 : (VP_X + road.right) / 2;
}

function demoSteer() {
  let g = null, best = Infinity;
  for (const gate of Game.gates) {
    if (gate.fired) continue;
    const relZ = gate.absZ - Game.cameraZ;
    if (relZ > RELZ_CROWD && relZ < best) { best = relZ; g = gate; }
  }
  if (g && g.absZ !== Game.demo.gateZ) {
    Game.demo.gateZ   = g.absZ;
    Game.demo.targetX = chooseTargetX(g, Game.crowd.count);
  }
  if (!g) Game.demo.targetX = VP_X;

  const tx = Game.demo.targetX;
  Input.left = Input.right = false;
  if      (Game.crowd.x < tx - DEMO_DEADZONE) Input.right = true;
  else if (Game.crowd.x > tx + DEMO_DEADZONE) Input.left  = true;
}

function drawGameOver(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 8, 15, 0.78)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 12;

  ctx.fillStyle = COLORS.gateBad;
  ctx.font      = 'bold 60px "Segoe UI", sans-serif';
  ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 60);

  ctx.fillStyle = COLORS.hudAccent;
  ctx.font      = 'bold 44px "Segoe UI", sans-serif';
  ctx.fillText(scoreMeters() + ' m', CANVAS_W / 2, CANVAS_H / 2 + 2);

  ctx.fillStyle = COLORS.hudText;
  ctx.font      = '20px "Segoe UI", sans-serif';
  ctx.fillText('Your crowd ran out!', CANVAS_W / 2, CANVAS_H / 2 + 44);

  ctx.fillStyle = COLORS.hudAccent;
  ctx.font      = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText('Click / tap / press a key for results', CANVAS_W / 2, CANVAS_H / 2 + 82);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════════════════════
const Sound = {
  ctx:         null,      // AudioContext — created on first user interaction
  bgm:         null,      // HTMLAudioElement for BGM (streaming)
  buffers:     {},        // id → AudioBuffer (decoded PCM held in RAM)
  _rawBuffers: {},        // id → ArrayBuffer (pre-fetched bytes, freed after decode)
  fadeRAF:     null,
  muteState:   'on',
  musicActive: false,
};

function initAudio() {
  Sound.bgm = new Audio('assets/bgm/XsollaCrowsdRunnerBGM.mp3');
  Sound.bgm.loop   = true;
  Sound.bgm.volume = 0;

  const files = {
    clash:        'assets/sfx/Fight_Explosion.mp3',
    comet:        'assets/sfx/Comet_Sound.mp3',
    button:       'assets/sfx/Button_Click.mp3',
    gatePositive: 'assets/sfx/Gate_Positive.mp3',
    gateNegative: 'assets/sfx/Gate_Negative.mp3',
  };
  // Pre-fetch all SFX bytes into RAM. AudioContext is created lazily on
  // first user interaction to satisfy the browser autoplay policy.
  for (const [id, url] of Object.entries(files)) {
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => { Sound._rawBuffers[id] = ab; })
      .catch(() => {});
  }

  const saved = localStorage.getItem(MUTE_KEY);
  Sound.muteState = (saved === 'musicOff' || saved === 'off') ? saved : 'on';
  updateSoundButton();
}

// Creates the AudioContext on first call and decodes all pre-fetched
// ArrayBuffers into AudioBuffers (raw PCM in RAM). Subsequent calls
// just resume a suspended context — no decoding, no I/O.
function _ensureCtx() {
  if (Sound.ctx) {
    if (Sound.ctx.state === 'suspended') Sound.ctx.resume();
    return Promise.resolve();
  }
  Sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const jobs = Object.entries(Sound._rawBuffers).map(([id, ab]) =>
    Sound.ctx.decodeAudioData(ab)
      .then(buf => { Sound.buffers[id] = buf; })
      .catch(() => {})
  );
  Sound._rawBuffers = {};   // free raw bytes — AudioBuffers are now the source
  return Promise.all(jobs);
}

function playSound(id) {
  if (Sound.muteState === 'off') return;
  _ensureCtx().then(() => {
    const buf = Sound.buffers[id];
    if (!buf) return;
    const src  = Sound.ctx.createBufferSource();
    const gain = Sound.ctx.createGain();
    src.buffer      = buf;
    gain.gain.value = SFX_VOLUME;
    src.connect(gain);
    gain.connect(Sound.ctx.destination);
    src.start(0);
  });
}

function startMusic() {
  Sound.musicActive = true;
  const bgm = Sound.bgm;
  if (!bgm) return;
  cancelMusicFade();
  if (Sound.muteState === 'on') {
    bgm.volume      = BGM_VOLUME;
    bgm.currentTime = 0;
    bgm.play().catch(() => {});
  }
}

function fadeOutMusic() {
  Sound.musicActive = false;
  const bgm = Sound.bgm;
  if (!bgm || bgm.paused) return;
  cancelMusicFade();
  const startVol = bgm.volume;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / MUSIC_FADE_MS);
    bgm.volume = startVol * (1 - t);
    if (t < 1) {
      Sound.fadeRAF = requestAnimationFrame(step);
    } else {
      bgm.pause();
      bgm.currentTime = 0;
      bgm.volume = BGM_VOLUME;
      Sound.fadeRAF = null;
    }
  };
  Sound.fadeRAF = requestAnimationFrame(step);
}

function cancelMusicFade() {
  if (Sound.fadeRAF) { cancelAnimationFrame(Sound.fadeRAF); Sound.fadeRAF = null; }
}

const SOUND_ICONS = {
  on: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 9 h3 l4 -3 v12 l-4 -3 h-3 z" fill="currentColor"/>
    <path d="M13 8.5 a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M16 6 a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,
  musicOff: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 18 v-9 l9 -2.5 v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="18" r="2.2" fill="currentColor"/>
    <circle cx="16" cy="15.5" r="2.2" fill="currentColor"/>
    <path d="M4 4 l16 16" stroke="#f87171" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,
  off: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 9 h3 l4 -3 v12 l-4 -3 h-3 z" fill="currentColor"/>
    <path d="M14 9 l6 6 M20 9 l-6 6" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
};
const SOUND_TITLES = { on: 'Sound: on', musicOff: 'Music muted (effects on)', off: 'Muted' };

function updateSoundButton() {
  const btn = document.getElementById('soundBtn');
  if (!btn) return;
  btn.innerHTML = SOUND_ICONS[Sound.muteState];
  btn.title     = SOUND_TITLES[Sound.muteState];
  btn.setAttribute('aria-label', SOUND_TITLES[Sound.muteState]);
}

function applyMuteState() {
  const bgm = Sound.bgm;
  if (!bgm) return;
  cancelMusicFade();
  if (Sound.muteState === 'on' && Sound.musicActive) {
    bgm.volume = BGM_VOLUME;
    if (bgm.paused) bgm.play().catch(() => {});
  } else {
    bgm.pause();
  }
}

function setMuteState(state) {
  Sound.muteState = state;
  try { localStorage.setItem(MUTE_KEY, state); } catch (e) {}
  applyMuteState();
  updateSoundButton();
}

function cycleMuteState() {
  const order = ['on', 'musicOff', 'off'];
  setMuteState(order[(order.indexOf(Sound.muteState) + 1) % order.length]);
}

// ═══════════════════════════════════════════════════════════════════
//  RIVAL CROWDS & COMBAT
// ═══════════════════════════════════════════════════════════════════

function spawnRival() {
  const mp = Game.maxPossible;
  if (mp < 2) return null;

  const frac = RIVAL_FRAC_BASE + RIVAL_FRAC_RAMP * Math.min(1, Game.elapsed / RIVAL_FRAC_RAMP_TIME);
  const jit  = 1 + (Math.random() * 2 - 1) * RIVAL_COUNT_JITTER;
  const count = Math.max(1, Math.min(mp - 1, Math.round(mp * frac * jit)));
  Game.maxPossible = mp - count;

  const shown  = Math.min(count, MAX_DISPLAY_FIGURES);
  const people = [];
  for (let i = 0; i < shown; i++) people.push({ phaseOffset: Math.random() * Math.PI * 2, ...personVariety() });
  return {
    absZ:     Game.cameraZ + GATE_SPAWN_WZ,
    x:        VP_X,
    count,
    people,
    runClock: Math.random() * Math.PI * 2,
    fought:   false,
  };
}

function rivalGeom(rival) {
  const relZ  = rival.absZ - Game.cameraZ;
  const y     = Math.min(wz2y(relZ), CANVAS_H);
  const scale = RELZ_CROWD / relZ;
  return { relZ, x: rival.x, y, scale };
}

function drawRivals(ctx) {
  for (const rival of Game.rivals) {
    const geo = rivalGeom(rival);
    if (geo.relZ <= 0.5 || geo.relZ > GATE_SPAWN_WZ + 2) continue;

    const positions = ringFormation(rival.people.length, geo.x, geo.y, FIGURE_SPACING * geo.scale);
    const jSpacing  = FIGURE_SPACING * geo.scale;

    const slots = positions
      .map((pos, i) => {
        const p = rival.people[i];
        const jpos = p
          ? { x: pos.x + (p.jx ?? 0) * jSpacing, y: pos.y + (p.jy ?? 0) * jSpacing * 0.45 }
          : pos;
        return { pos: jpos, p };
      })
      .filter(s => s.p)
      .sort((a, b) => a.pos.y - b.pos.y);

    let minY = geo.y;
    for (const s of slots) if (s.pos.y < minY) minY = s.pos.y;
    const backSpan = Math.max(1, geo.y - minY);
    const depth = pos => Math.max(0, Math.min(1, (geo.y - pos.y) / backSpan));

    for (const { pos, p } of slots) {
      const dz = depth(pos);
      drawGroundShadow(ctx, pos.x, pos.y, geo.scale * (p.sizeMul ?? 1) * (1 - DEPTH_SCALE_FALLOFF * dz));
    }

    let topY = geo.y;
    for (const { pos, p } of slots) {
      topY = Math.min(topY, pos.y);
      const dz    = depth(pos);
      const scale = geo.scale * (p.sizeMul ?? 1) * (1 - DEPTH_SCALE_FALLOFF * dz);
      const tint  = q2((p.tint ?? 1) * (1 - DEPTH_FADE_FALLOFF * dz));
      drawFigure(ctx, pos.x, pos.y, rival.runClock * (p.gaitSpeed ?? 1) + p.phaseOffset, scale,
                 COLORS.rivalStroke, COLORS.rivalFill, tint);
    }

    const fs = Math.max(11, Math.round(22 * geo.scale));
    ctx.save();
    ctx.font         = `bold ${fs}px "Segoe UI", sans-serif`;
    ctx.fillStyle    = COLORS.rivalStroke;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 6;
    ctx.fillText(String(rival.count), geo.x, topY - FIGURE_HEIGHT * geo.scale - 4);
    ctx.restore();
  }
}

function resolveRivalCombat(rival) {
  const crowd  = Game.crowd;
  const fought = Math.min(crowd.count, rival.count);
  const geo    = rivalGeom(rival);

  spawnBlast(fought, crowd.x, CROWD_Y,   1,         COLORS.playerStroke, COLORS.playerFill);
  spawnBlast(fought, geo.x,   geo.y,     geo.scale, COLORS.rivalStroke,  COLORS.rivalFill);

  applyPlayerLoss(fought);
  rival.count -= fought;
  rival.fought = true;

  // Meeting a rival crowd advances the sky one phase (eased over 3s).
  advanceSkyPhase();

  if (Game.state !== 'title') playSound('clash');
}

function applyPlayerLoss(amount) {
  const crowd      = Game.crowd;
  const oldCount   = crowd.count;
  const newCount   = Math.max(0, oldCount - amount);
  const oldDisplay = Math.min(oldCount, MAX_DISPLAY_FIGURES);
  const newDisplay = Math.min(newCount, MAX_DISPLAY_FIGURES);
  for (let k = 0; k < oldDisplay - newDisplay && crowd.people.length > 0; k++) crowd.people.pop();
  crowd.count = newCount;
}

function spawnBlast(deadCount, cx, cy, scale, stroke, fill) {
  const n = Math.min(deadCount, CLASH_MAX_DEBRIS);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = BLAST_SPEED * (0.5 + Math.random());
    Game.debris.push({
      x:  cx + (Math.random() - 0.5) * 40,
      y:  cy + (Math.random() - 0.5) * 30,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - BLAST_SPEED * 0.6,
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 18,
      scale,
      phaseOffset: Math.random() * Math.PI * 2,
      stroke, fill, t: 0,
    });
  }
}

function updateDebris(dt) {
  const ms = dt * 1000;
  for (const d of Game.debris) {
    d.x   += d.vx * dt;
    d.y   += d.vy * dt;
    d.vy  += BLAST_GRAVITY * dt;
    d.rot += d.vrot * dt;
    d.t   += ms;
  }
  Game.debris = Game.debris.filter(d => d.t < BLAST_ANIM_MS);
}

function drawDebris(ctx) {
  for (const d of Game.debris) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - d.t / BLAST_ANIM_MS);
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    drawFigure(ctx, 0, 0, d.phaseOffset, d.scale, d.stroke, d.fill);
    ctx.restore();
  }
}

function frame(timestamp) {
  if (!Game.lastTime) Game.lastTime = timestamp;
  const dt = Math.min((timestamp - Game.lastTime) / 1000, 0.1);
  Game.lastTime = timestamp;

  Game.runClock += dt * RUN_ANIM_SPEED;
  updateCrowdAnimations(dt);
  updateFallers(dt);
  updateDebris(dt);
  updateSky(dt);

  if (Game.state === 'running' || Game.state === 'title') {
    Game.elapsed += dt;

    if (Game.gatesPassed >= 1 && Game.scrollSpeed < GATE_SCROLL_SPEED_MAX) {
      Game.scrollSpeed = Math.min(GATE_SCROLL_SPEED_MAX, Game.scrollSpeed + GATE_SPEED_ACCEL * dt);
    }

    const worldSpeed = computeWorldSpeed(Game.scrollSpeed);
    Game.cameraZ    += worldSpeed * dt;
    Game.distancePx += Game.scrollSpeed * dt;

    if (Game.state === 'title') demoSteer();
    const dir = updateCrowd(dt);
    updateEdgeFalling(dt, dir);

    while (Game.cameraZ >= Game.nextSpawnZ) {
      Game.nextSpawnZ += GATE_SPAWN_DIST_WZ;
      Game.spawnTick++;
      if (Game.spawnTick % RIVAL_EVERY_N_GATES === 0) {
        const rival = spawnRival();
        if (rival) Game.rivals.push(rival);
        else       Game.gates.push(spawnGate());
      } else {
        Game.gates.push(spawnGate());
      }
    }
    Game.gates = Game.gates.filter(g => (g.absZ - Game.cameraZ) > 0.9);

    for (const gate of Game.gates) {
      if (gate.fired) continue;
      if ((gate.absZ - Game.cameraZ) > RELZ_CROWD) continue;
      const cx = Game.crowd.x;
      for (const sec of gate.sections) {
        if (sec.side === 'full' ||
            (sec.side === 'left'  && cx <  VP_X) ||
            (sec.side === 'right' && cx >= VP_X)) {
          applyGateSection(sec);
          // Spawn flying value popup at the gate's current screen position
          const relZ0 = gate.absZ - Game.cameraZ;
          const hw0   = ROAD_HALF_W / relZ0;
          const yT0   = HORIZON_Y + (1 - GATE_WORLD_HEIGHT) * PERSP_K / relZ0;
          const yB0   = Math.min(wz2y(relZ0), CANVAS_H);
          const pxL   = sec.side === 'right' ? VP_X      : VP_X - hw0;
          const pxR   = sec.side === 'left'  ? VP_X      : VP_X + hw0;
          const popColor = sec.op.den > 1        ? COLORS.gateFraction :
                           sec.positive === true  ? COLORS.gateGood :
                           sec.positive === false ? COLORS.gateBad  :
                           COLORS.gateNeutral;
          Game.gatePopups.push({
            x: (pxL + pxR) / 2,
            y: (yT0 + yB0) / 2,
            label: opLabel(sec.op),
            color: popColor,
            t: 0,
            dur: POP_DUR,
            parts: [],
            emitAccum: 0,
          });
          break;
        }
      }
      gate.fired = true;
      Game.gatesPassed++;
    }

    for (const rival of Game.rivals) {
      rival.runClock += dt * RUN_ANIM_SPEED;
      if (!rival.fought && (rival.absZ - Game.cameraZ) <= RELZ_CROWD) resolveRivalCombat(rival);
    }
    Game.rivals = Game.rivals.filter(r => !r.fought && (r.absZ - Game.cameraZ) > 0.9);

    if (Game.crowd.count <= 0) {
      if (Game.state === 'title') startTitleDemo();
      else                        triggerGameOver();
    }
    if (Game.state === 'title' && Game.elapsed > DEMO_MAX_TIME) startTitleDemo();
  }

  // Advance gate popups: emit comet particles radially (intensifying toward the
  // fade-out), then drift + damp them so they burst outward and settle.
  for (const p of Game.gatePopups) {
    p.t += dt * 1000;
    const progress = Math.min(1, p.t / p.dur);
    const cx = p.x;
    const cy = p.y - POP_RISE * progress;

    p.emitAccum += POP_PART_EMIT_RATE * dt * progress;
    while (p.emitAccum >= 1) {
      p.emitAccum -= 1;
      const ang = Math.random() * Math.PI * 2;
      const spd = POP_PART_SPEED_MIN + Math.random() * (POP_PART_SPEED_MAX - POP_PART_SPEED_MIN);
      p.parts.push({
        x:     cx + Math.cos(ang) * POP_BUBBLE_R * 0.6,
        y:     cy + Math.sin(ang) * POP_BUBBLE_R * 0.6,
        vx:    Math.cos(ang) * spd,
        vy:    Math.sin(ang) * spd,
        age:   0,
        ttl:   POP_PART_LIFE * (0.7 + Math.random() * 0.5),
        glyph: POP_GLYPHS[Math.floor(Math.random() * POP_GLYPHS.length)],
        size:  POP_PART_MIN_SZ + Math.random() * (POP_PART_MAX_SZ - POP_PART_MIN_SZ),
      });
    }

    const damp = Math.pow(POP_PART_DRAG, dt * 60);
    for (const q of p.parts) {
      q.age += dt * 1000;
      q.x   += q.vx * dt;
      q.y   += q.vy * dt;
      q.vx  *= damp;
      q.vy  *= damp;
    }
    p.parts = p.parts.filter(q => q.age < q.ttl);
  }
  // The bubble and every particle it emitted share one lifetime — when the
  // bubble is done the whole popup (leftover particles included) is removed,
  // so nothing lingers in the air.
  Game.gatePopups = Game.gatePopups.filter(p => p.t < p.dur);

  drawRoad(ctx);
  drawSky(ctx);
  drawFarSkyline(ctx);
  drawBuildings(ctx);
  drawHorizonGlow(ctx);
  drawCenterDashes(ctx);
  drawGates(ctx);
  drawGatePopups(ctx);
  drawRivals(ctx);
  drawEdgeZones(ctx);
  drawCrowd(ctx);
  drawFallers(ctx);
  drawDebris(ctx);
  if (Game.state !== 'title') drawHUD(ctx);
  if (Game.state === 'gameover' || Game.state === 'leaderboard') drawGameOver(ctx);

  requestAnimationFrame(frame);
}

initAudio();
initSky();
startTitleDemo();
requestAnimationFrame(frame);
