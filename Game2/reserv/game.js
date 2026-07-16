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
const CROWD_Y                  = 490;   // feet baseline in 800×600 space
const RUN_ANIM_SPEED           = 8;     // rad/s
const LEG_SWING_AMP            = 0.45;  // gain mapping leg stride driver → knee-lift angle
const ARM_SWING_AMP            = 0.10;  // ×FIGURE_HEIGHT — vertical hand-pump amplitude
const BOB_AMPLITUDE            = 1.5;   // px

// 3/4 rear-view run cycle (figures run forward, up the road)
const FIGURE_YAW        = 0.18;  // rad — constant 3/4 yaw of upper body vs hips
const FIGURE_LEAN       = 0.05;  // ×FIGURE_HEIGHT — forward (down-screen) lean of shoulders
const LEG_LATERAL_SEP   = 0.07;  // ×FIGURE_HEIGHT — half-gap between the two hips
const ARM_LATERAL_SEP   = 0.11;  // ×FIGURE_HEIGHT — half-gap between the two shoulders
const FORESHORTEN_AMT   = 0.22;  // 0..1 — near/far limb length + width modulation depth
const FORESHORTEN_SHADE = 0.70;  // multiply far-limb stroke RGB for depth shading
const LEG_LIFT_ANG      = 0.70;  // rad — maps stride driver to knee lift
const LEG_STRIDE_Y      = 0.10;  // ×FIGURE_HEIGHT — vertical foot travel (the depth scissor)
const LEG_KNEE_BEND     = 0.60;  // rad — extra knee flex on the lift half
const LEG_CONVERGE      = 0.25;  // 0..1 — lifted knee drifts toward centre
const ARM_OUT           = 0.35;  // ×upperArm — lateral elbow splay
const ARM_ELBOW_FLEX    = 0.90;  // rad — constant forearm bend
const SPAWN_ANIM_MS            = 200;
const DESPAWN_ANIM_MS          = 180;
const SPAWN_STAGGER_MS         = 45;   // ms delay between consecutive figure spawns/despawns

// Road & Gates
const ROAD_WIDTH                   = 600;  // px at bottom of canvas
const GATE_HEIGHT                  = 70;
const GATE_ALPHA                   = 0.60;
const GATE_SCROLL_SPEED_INITIAL    = 360;  // px/s equivalent at CROWD_Y depth
const GATE_SCROLL_SPEED_MAX        = 840;  // px/s — cap on the gradual speed-up
const GATE_SPEED_ACCEL             = 5;    // px/s added each second (ramp starts after first gate)
const GATE_SPAWN_DIST_WZ           = 2.5;  // world-Z distance between spawn slots
                                           // (distance-based: faster scroll → more frequent gates)
const SPLIT_GATE_CHANCE            = 0.75;
const GATE_WORLD_HEIGHT = 0.3;  // gate height as fraction of camera height (world units)
const GATE_WORLD_DEPTH  = 0.04;  // gate slab thickness in world-Z units
const GATE_SPAWN_WZ     = 10;    // world-Z distance ahead of camera where gates spawn — tune this to adjust how far away they appear

// Math Complexity
const FRACTION_START_TIME      = 10;    // seconds before mul/div can render as fractions
const FRACTION_MAX_DENOM       = 8;     // max denominator in a fraction
const FRACTION_CHANCE_INITIAL  = 0.20;  // fraction chance at FRACTION_START_TIME
const FRACTION_CHANCE_PER_GATE = 0.05;  // added to the chance per passed gate
const FRACTION_CHANCE_MAX      = 1.0;   // cap on fraction chance

// Procedural balance — hidden maxPossible target controller (bounds growth)
const TARGET_BASE      = 8;                   // runners — curve floor after the first gate
const TARGET_CAP       = MAX_DISPLAY_FIGURES; // soft ceiling (240); occasional overshoot is OK
const TARGET_TAU       = 90;                  // s — ramp time constant (~63% of cap at 90 s)
const TARGET_BAND_FRAC = 0.18;                // ± band around target where op direction is free
const STEP_MAX_FACTOR  = 1.6;                 // max single-gate growth × of maxPossible
const STEP_MIN_FACTOR  = 0.55;                // min single optimal-side result vs maxPossible
const GROW_ADD_MAX     = 60;                  // cap on +N operand
const SHRINK_SUB_MAX   = 30;                  // cap on −N operand
const MUL_INT_MAX      = 4;                   // cap on integer ×N
const DIV_INT_MAX      = 6;                   // cap on integer ÷N
const BAD_SHRINK_LO    = 0.10;                // split bad side may cut to as low as 10% of maxPossible
const BAD_SHRINK_HI    = 0.60;                // ...up to 60%

// Path Edge Falling
const EDGE_DANGER_WIDTH = 30;
const EDGE_FALL_RATE    = 20;     // figures/second lost while hugging the wall
const FALL_ANIM_MS      = 400;
const EDGE_FALL_GRACE_S = 5;

// Rival Crowds
const RIVAL_START_TIME              = 8;
const RIVAL_SPAWN_INTERVAL_INITIAL  = 5000;
const RIVAL_SPAWN_INTERVAL_MIN      = 2000;
const RIVAL_SPAWN_INTERVAL_ACCEL    = -20;
const RIVAL_SPLIT_CHANCE            = 0.65;
const CLASH_ANIM_MS                 = 350;
const RIVAL_EVERY_N_GATES           = 6;    // spawn a rival instead of every Nth gate (temp logic)
const RIVAL_FRAC_BASE               = 0.30; // unavoidable rival ≈ this fraction of maxPossible early
const RIVAL_FRAC_RAMP               = 0.35; // additional fraction added over time
const RIVAL_FRAC_RAMP_TIME          = 120;  // seconds to reach full rival fraction
const RIVAL_COUNT_JITTER            = 0.15; // ±15% random jitter on rival size
const CLASH_MAX_DEBRIS              = 50;   // cap on blown-away figures rendered per side
const BLAST_ANIM_MS                 = 800;  // how long dead runners fly before fading out
const BLAST_SPEED                   = 320;  // base outward blast speed (px/s)
const BLAST_GRAVITY                 = 700;  // downward accel on blasted figures (px/s²)

// Score
const SCORE_SCALE           = 0.05;
const DIFFICULTY_SCALE_TIME = 60;
const START_SKIP_M          = 120;  // m of road pre-rolled at start so gates are already in flight (this point reads as 0 m)

// Leaderboard (localStorage)
const HIGHSCORE_KEY   = 'xsollaCrowdRun.highscores.v1';
const HIGHSCORE_COUNT = 3;     // top-N results kept locally

// Title-screen auto-pilot (the "live" attract demo)
const DEMO_ERROR_CHANCE = 0.30; // chance the auto-pilot picks the WORSE split side
const DEMO_DEADZONE     = 6;    // px tolerance before the demo steers
const DEMO_MAX_TIME     = 75;   // s — soft cap; demo restarts for variety even if alive

// Sky cosmetics — purely decorative, no gameplay effect
const STAR_COUNT       = 70;     // simultaneous twinkling stars
const STAR_SKY_H       = 240;    // px — stars live in this top band only
const STAR_MIN_R       = 0.5;    // px star radius range
const STAR_MAX_R       = 1.8;
const STAR_LIFE_MIN    = 2500;   // ms a star lingers before fading out & relocating
const STAR_LIFE_MAX    = 8000;
const STAR_FADE_MS     = 1000;   // ms fade-in / fade-out at the ends of a star's life
const STAR_TWINKLE_MIN = 1.2;    // rad/s shimmer speed range
const STAR_TWINKLE_MAX = 4.5;
const STAR_COLORS      = ['#ffffff', '#bcd2ff', '#fff0c4', '#ffd6e8', '#cffaff']; // white + faint tints

const COMET_MIN_DELAY  = 7000;   // ms — random gap between comets
const COMET_MAX_DELAY  = 12000;
const COMET_SPEED      = 200;    // px/s head travel speed
const COMET_EMIT_RATE  = 55;     // tail particles emitted per second along the head's path
const COMET_PART_LIFE  = 850;    // ms a left-behind tail particle lives before fully fading
const COMET_PART_DRIFT = 12;     // px/s — max gentle drift of a settled particle (keeps the trail "alive")
const COMET_PART_MIN_SZ = 7;     // px tail glyph font-size range
const COMET_PART_MAX_SZ = 13;
const COMET_GLYPHS     = ['+', '.', '·', '+']; // dots & plus signs, picked at random per particle
const COMET_COLOR      = '#cfe6ff';

// ═══════════════════════════════════════════════════════════════════
//  COLOR SCHEME — dark background
// ═══════════════════════════════════════════════════════════════════
const COLORS = {
  gutter:       '#0e0e18',  // sides outside road
  roadFar:      '#0f0f1c',  // road color near horizon
  roadNear:     '#1a1a2e',  // road color near camera
  roadEdge:     '#2a2a44',  // road edge stripe
  dashFill:     '#3a3a60',  // center lane divider dashes
  dashGlow:     '#6666bb',  // glow behind dashes
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
  gateFraction: '#c084fc',  // purple — fraction gates hide their good/bad nature
};

// Darken a #rrggbb color by `mul` for far-side (shaded) limbs. Cached — only a
// couple of distinct colors ever pass through, so 240+ figures never re-parse.
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

// ═══════════════════════════════════════════════════════════════════
//  PERSPECTIVE SETUP
//
//  1-point perspective: road narrows to a vanishing point VP at the
//  top of the canvas and fans out to full ROAD_WIDTH at the bottom.
//
//  worldZ = depth from camera (in world units).
//    - worldZ = 1   →  screenY = CANVAS_H   (bottom — nearest)
//    - worldZ → ∞   →  screenY = HORIZON_Y  (vanishing point)
//
//  Mapping:  screenY = HORIZON_Y + PERSP_K / worldZ
//            worldZ  = PERSP_K   / (screenY - HORIZON_Y)
//
//  Road half-width at screenY:
//    hw(y) = ROAD_HALF_W * (y − HORIZON_Y) / PERSP_K
// ═══════════════════════════════════════════════════════════════════
const CANVAS_W   = 800;
const CANVAS_H   = 600;
const VP_X       = CANVAS_W / 2;   // 400 — symmetric, always center
const HORIZON_Y  = 35;             // vanishing point Y (near top of canvas)
const PERSP_K    = CANVAS_H - HORIZON_Y;   // 565
const ROAD_HALF_W = ROAD_WIDTH / 2;        // 300

// Road left x at bottom edge
const ROAD_LEFT_BTM  = VP_X - ROAD_HALF_W;   // 100
const ROAD_RIGHT_BTM = VP_X + ROAD_HALF_W;   // 700

/** Road bounds at a given screenY. Returns { left, right, hw }. */
function roadAt(y) {
  const hw = ROAD_HALF_W * (y - HORIZON_Y) / PERSP_K;
  return { left: VP_X - hw, right: VP_X + hw, hw };
}

/** World-Z to screenY. */
function wz2y(wz) {
  return HORIZON_Y + PERSP_K / wz;
}

// ═══════════════════════════════════════════════════════════════════
//  DASH (CENTER LANE DIVIDER) PARAMETERS
//
//  Dashes are defined in world-Z space. The camera scrolls forward,
//  so cameraZ increases over time. A dash at absolute world position
//  absZ has relative depth  relZ = absZ − cameraZ.
//
//  Screen position: y = wz2y(relZ).
//  As relZ → 0 the dash reaches the camera (bottom of screen).
//
//  World speed calibration: we want the screen speed at CROWD_Y to
//  equal GATE_SCROLL_SPEED_INITIAL.
//    dy/dt  = PERSP_K * worldSpeed / relZ²
//    relZ at CROWD_Y = PERSP_K / (CROWD_Y − HORIZON_Y)
//  → worldSpeed = GATE_SCROLL_SPEED * relZ_crowd² / PERSP_K
// ═══════════════════════════════════════════════════════════════════
const DASH_PERIOD  = 2.2;   // world units between dash leading edges
const DASH_LENGTH  = 0.85;  // world units of each dash stripe
const DASH_MAX_WZ  = 40;    // how far ahead to render dashes (world units)
const DASH_W_FRAC  = 0.03;  // dash width = this fraction of road hw at that y

// Minimum relZ shown — dashes closer than CROWD_Y are hidden by crowd
const RELZ_CROWD = PERSP_K / (CROWD_Y - HORIZON_Y);   // ≈ 1.25

/** Compute worldSpeed from the target scroll speed (px/s at CROWD_Y). */
function computeWorldSpeed(scrollSpeed) {
  return scrollSpeed * (RELZ_CROWD * RELZ_CROWD) / PERSP_K;
}

// ═══════════════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════════════
const Game = {
  state:       'title',  // 'title' | 'running' | 'gameover' | 'leaderboard'
  scrollSpeed: GATE_SCROLL_SPEED_INITIAL,  // px/s at crowd depth
  cameraZ:     0,       // accumulated world scroll
  runClock:    0,       // global animation clock (radians)
  elapsed:     0,       // seconds since run start (drives grace period etc.)
  distancePx:  0,       // total pixels scrolled at crowd depth → score (× SCORE_SCALE = meters)
  maxPossible: INITIAL_CROWD,  // hidden optimal-route count; drives bounded generation

  crowd: {
    x:             VP_X,
    count:         INITIAL_CROWD,
    edgeFallAccum: 0,     // fractional accumulator for edge falling
    people: [{ phaseOffset: Math.random() * Math.PI * 2, scale: 1, scaleTarget: 1, spawnDelay: 0, spawnTimer: 99999 }],
  },

  gates:        [],
  nextSpawnZ:   0,      // cameraZ at which the next spawn is due (0 → first gate spawns instantly)
  gatesSpawned: 0,      // total gates generated this run (first gate is always positive)
  gatesPassed:  0,      // gates the crowd has run through (drives fraction chance)
  spawnTick:    0,      // counts spawn slots; every RIVAL_EVERY_N_GATES-th is a rival
  rivals:       [],     // enemy crowds scrolling down the road
  fallers:      [],     // figures tumbling off the road edge
  debris:       [],     // dead runners blown away by combat

  highscores:   [],     // top-3 distances (m), shown in the leaderboard modal
  lastRank:     -1,     // index in highscores of this run's score (-1 if not top-3)

  sky: { stars: [], comet: null, cometTimer: 0, particles: [] },   // decorative stars + comet w/ particle tail

  demo: { gateZ: null, targetX: VP_X },   // title-screen auto-pilot: latched per-gate decision

  lastTime: null,
};

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Road surface
// ═══════════════════════════════════════════════════════════════════
function drawRoad(ctx) {
  // Gutter background
  ctx.fillStyle = COLORS.gutter;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Road trapezoid (triangle converging to VP at top)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(VP_X, HORIZON_Y);
  ctx.lineTo(ROAD_RIGHT_BTM, CANVAS_H);
  ctx.lineTo(ROAD_LEFT_BTM,  CANVAS_H);
  ctx.closePath();

  // Gradient: dark at horizon, slightly lighter near camera
  const grad = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_H);
  grad.addColorStop(0,   COLORS.roadFar);
  grad.addColorStop(0.6, '#151528');
  grad.addColorStop(1,   COLORS.roadNear);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Road edge stripes
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
//  SKY COSMETICS — twinkling stars + rare comet (purely decorative)
// ═══════════════════════════════════════════════════════════════════
function skyRand(a, b) { return a + Math.random() * (b - a); }

/** True if (x, y) sits in the sky (gutter / above the road), not on the road. */
function isSkyPoint(x, y) {
  if (y < HORIZON_Y) return true;
  const b = roadAt(y);
  return x < b.left || x > b.right;
}

/** (Re)seed a star at a fresh random sky position, colour and lifetime. */
function resetStar(star) {
  // Reject points that land on the road so stars only shimmer in the sky
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
    s.age = skyRand(0, s.life);   // stagger initial phases so they don't all pop together
    stars.push(s);
  }
  Game.sky.comet     = null;
  Game.sky.particles.length = 0;
  Game.sky.cometTimer = skyRand(COMET_MIN_DELAY, COMET_MAX_DELAY);
}

/** Star brightness envelope: fade in at birth, hold, fade out before relocating. */
function starEnvelope(age, life) {
  if (age < STAR_FADE_MS)        return age / STAR_FADE_MS;
  if (age > life - STAR_FADE_MS) return Math.max(0, (life - age) / STAR_FADE_MS);
  return 1;
}

function spawnComet() {
  // Enter from left or right edge at a random sky height, drift gently down-screen
  const fromLeft = Math.random() < 0.5;
  const y0    = skyRand(15, STAR_SKY_H * 0.7);
  const slope = skyRand(0.15, 0.5);   // downward tilt
  const vx    = (fromLeft ? 1 : -1) * COMET_SPEED;
  const vy     = slope * COMET_SPEED;
  Game.sky.comet = {
    x:  fromLeft ? -40 : CANVAS_W + 40,
    y:  y0,
    vx, vy,
    emitAccum: 0,   // ms accumulator for steady particle emission
  };
}

/** Drop one fading tail particle at the comet head's current position. */
function emitCometParticle(c) {
  const ang   = Math.random() * Math.PI * 2;
  const drift = skyRand(0, COMET_PART_DRIFT);
  Game.sky.particles.push({
    x:     c.x + skyRand(-2, 2),
    y:     c.y + skyRand(-2, 2),
    vx:    Math.cos(ang) * drift,    // gentle drift so the settled trail keeps breathing
    vy:    Math.sin(ang) * drift,
    glyph: COMET_GLYPHS[Math.floor(Math.random() * COMET_GLYPHS.length)],
    size:  skyRand(COMET_PART_MIN_SZ, COMET_PART_MAX_SZ),
    age:   0,
    ttl:   COMET_PART_LIFE * skyRand(0.7, 1.1),
  });
}

function updateSky(dt) {
  const sky = Game.sky;

  // Twinkle + lifecycle for every star
  for (const s of sky.stars) {
    s.age     += dt * 1000;
    s.twPhase += dt * s.twSpeed;
    if (s.age >= s.life) resetStar(s);
  }

  // Comet head: advance, emit trail particles, then retire when off-screen
  if (sky.comet) {
    const c = sky.comet;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Steady emission of particles along the path the head sweeps through
    c.emitAccum += dt * 1000;
    const interval = 1000 / COMET_EMIT_RATE;
    while (c.emitAccum >= interval) {
      c.emitAccum -= interval;
      emitCometParticle(c);
    }

    const margin = 50;
    if (c.x < -margin || c.x > CANVAS_W + margin || c.y > CANVAS_H + margin) {
      sky.comet = null;   // head gone; its particles linger and fade out below
    }
  } else {
    sky.cometTimer -= dt * 1000;
    if (sky.cometTimer <= 0) {
      spawnComet();
      sky.cometTimer = skyRand(COMET_MIN_DELAY, COMET_MAX_DELAY);
    }
  }

  // Tail particles live independently of the head — drift & fade, then expire
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

  // Stars
  for (const s of sky.stars) {
    const env = starEnvelope(s.age, s.life);
    if (env <= 0) continue;
    const twinkle = 0.55 + 0.45 * Math.sin(s.twPhase);
    ctx.globalAlpha = env * twinkle;
    ctx.fillStyle   = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Comet tail — particles left behind by the head, each fading on its own clock
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = COMET_COLOR;
  ctx.shadowColor  = COMET_COLOR;
  for (const p of sky.particles) {
    const t = p.age / p.ttl;                       // 0 fresh → 1 dead
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.shadowBlur  = 3 * (1 - t);
    ctx.font        = `${Math.max(1, Math.round(p.size * (1 - 0.55 * t)))}px "Segoe UI", monospace`;
    ctx.fillText(p.glyph, p.x, p.y);
  }

  // Comet head: a small bright glowing dot leading the trail
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

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Horizon atmospheric glow
// ═══════════════════════════════════════════════════════════════════
function drawHorizonGlow(ctx) {
  const grad = ctx.createRadialGradient(VP_X, HORIZON_Y, 0, VP_X, HORIZON_Y, 220);
  grad.addColorStop(0,   COLORS.horizonGlow);
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(VP_X - 220, HORIZON_Y - 40, 440, 280);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Center lane dashes (perspective-correct)
// ═══════════════════════════════════════════════════════════════════
function drawCenterDashes(ctx) {
  const cz = Game.cameraZ;

  ctx.save();
  ctx.shadowColor = COLORS.dashGlow;
  ctx.shadowBlur  = 4;
  ctx.fillStyle   = COLORS.dashFill;

  // Enumerate all dash stripes visible between the horizon and the
  // bottom of the canvas.  relZ = 1.0 maps to y = CANVAS_H exactly.
  const absZ_min = cz + 1.01;   // just above the near camera plane
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

    // Draw as a perspectively-correct trapezoid centered on VP_X
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

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Edge danger zone tint
// ═══════════════════════════════════════════════════════════════════
function drawEdgeZones(ctx) {
  // Horizontal gradient over the road trapezoid — red tint near edges
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

/** Chance that a multiply/divide gate renders as a fraction. Zero until
 *  FRACTION_START_TIME, then FRACTION_CHANCE_INITIAL growing by
 *  FRACTION_CHANCE_PER_GATE per gate already passed, capped at FRACTION_CHANCE_MAX. */
function currentFractionChance() {
  if (Game.elapsed < FRACTION_START_TIME) return 0;
  return Math.min(FRACTION_CHANCE_MAX,
                  FRACTION_CHANCE_INITIAL + FRACTION_CHANCE_PER_GATE * Game.gatesPassed);
}

// ── maxPossible target controller ────────────────────────────────
//  All operands are chosen so the optimal route tracks a saturating target
//  curve T(elapsed); growth is clamped per gate so the count can never run away.

/** Saturating target for the optimal-route count at the current time. */
function targetCount() {
  return TARGET_BASE + (TARGET_CAP - TARGET_BASE) * (1 - Math.exp(-Game.elapsed / TARGET_TAU));
}

/** Soft band around the target inside which op direction is left random. */
function targetBand() {
  const t = targetCount();
  return { low: Math.floor(t * (1 - TARGET_BAND_FRAC)), high: Math.ceil(t * (1 + TARGET_BAND_FRAC)) };
}

function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

/** Best num/den (num 2–9, den 2–FRACTION_MAX_DENOM, num≠den) whose value approximates
 *  targetRatio. wantGrowth → value (num/den) > 1; else < 1. May return null. */
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

/** Build a concrete op moving `cur` toward `goal`. Integer +/− stay integer; only
 *  ×/÷ may render as fractions (per currentFractionChance), with values steering toward goal. */
function opTowardValue(cur, goal) {
  cur = Math.max(1, cur);
  const ratio = goal / cur;

  if (goal >= cur) {
    // Growth: multiply (sometimes fractional) or add
    if (ratio >= 1.25 && Math.random() < 0.5) {
      if (Math.random() < currentFractionChance()) {
        const f = bestFractionApprox(ratio, true);          // value num/den > 1
        if (f) return { type: 'MUL', num: f.num, den: f.den };
      }
      return { type: 'MUL', num: clampInt(ratio, 2, MUL_INT_MAX), den: 1 };
    }
    return { type: '+', num: clampInt(goal - cur, 2, GROW_ADD_MAX), den: 1 };
  }

  // Shrink: divide (fractional for gentle cuts) or subtract
  if (ratio <= 0.8 && Math.random() < 0.5) {
    if (Math.random() < currentFractionChance()) {
      const f = bestFractionApprox(ratio, false);           // value num/den < 1
      // ÷N/D has value D/N, so map num→f.den, den→f.num to get value f.num/f.den ≈ ratio
      if (f) return { type: 'DIV', num: f.den, den: f.num };
    }
    if (ratio <= 0.5) return { type: 'DIV', num: clampInt(1 / ratio, 2, DIV_INT_MAX), den: 1 };
    // gentle integer cut → fall through to subtraction
  }
  return { type: '-', num: clampInt(cur - goal, 2, SHRINK_SUB_MAX), den: 1 };
}

/** Target value for the optimal side of a gate, based on band position. */
function controllerGoal(mp) {
  const { low, high } = targetBand();
  if (mp < low)  return Math.min(targetCount(), mp * STEP_MAX_FACTOR);   // grow toward band
  if (mp > high) return Math.max(targetCount(), mp * STEP_MIN_FACTOR);   // gentle shrink toward band
  return randInt(low, high);                                            // free direction within band
}

/** Clamp an op so an unavoidable / optimal side can never wipe the crowd (result ≥ 1). */
function enforceSurvival(op, mp) {
  if (op.type === '-') {
    const maxSub = mp - 1;
    if (maxSub < 1) return { type: '+', num: 2, den: 1 };   // can't subtract safely → small grow
    op.num = Math.min(op.num, maxSub);
    return op;
  }
  if (op.type === 'DIV' && applyOp(mp, op) < 1) {
    return mp >= 2 ? { type: 'DIV', num: 2, den: 1 } : { type: '+', num: 2, den: 1 };
  }
  return op;
}

/** A deliberately worse, dangerous (un-guardrailed) op for the losing side of a split. */
function makeBadSideOp(mp) {
  if (Math.random() < 0.6) {
    const targetVal = mp * (BAD_SHRINK_LO + Math.random() * (BAD_SHRINK_HI - BAD_SHRINK_LO));
    return opTowardValue(mp, Math.max(0, Math.floor(targetVal)));   // may be a near-wipe — intentional
  }
  return opTowardValue(mp, Math.floor(mp * (1 + Math.random() * 0.2)));  // weak growth trap
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

// ── Math operations ──────────────────────────────────────────────
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
    // Stagger new figures in one by one
    for (let i = 0; i < newDisplay - oldDisplay; i++) {
      crowd.people.push({
        phaseOffset: Math.random() * Math.PI * 2,
        scale: 0, scaleTarget: 1,
        spawnDelay: i * SPAWN_STAGGER_MS, spawnTimer: 0,
      });
    }
  } else if (newDisplay < oldDisplay) {
    // Stagger removal from the end
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
  // Remove fully gone figures
  Game.crowd.people = people.filter(p => !(p.scaleTarget === 0 && p.scale <= 0));
}

function spawnGate() {
  // absZ is the gate's fixed position in world space; it never changes.
  // The camera moves toward it, so relZ = absZ - cameraZ shrinks over time.
  const absZ = Game.cameraZ + GATE_SPAWN_WZ;

  // The first gate of a run is always a single positive gate — a safe, encouraging
  // start that can never trigger game over.
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
    // Ensure "good" really is the better side on maxPossible
    if (applyOp(mp, opBad) > applyOp(mp, opGood)) { const t = opGood; opGood = opBad; opBad = t; }
    Game.maxPossible = Math.max(applyOp(mp, opGood), applyOp(mp, opBad));  // optimal route takes better side

    const goodLeft = Math.random() < 0.5;
    return {
      absZ,
      sections: [
        { side: 'left',  op: goodLeft ? opGood : opBad,  positive: opIsPositive(goodLeft ? opGood : opBad)  },
        { side: 'right', op: goodLeft ? opBad  : opGood, positive: opIsPositive(goodLeft ? opBad  : opGood) },
      ],
    };
  }

  // Full gate — single unavoidable op, guardrailed so a perfect player always survives
  const op = enforceSurvival(opTowardValue(mp, controllerGoal(mp)), mp);
  Game.maxPossible = applyOp(mp, op);
  return { absZ, sections: [{ side: 'full', op, positive: opIsPositive(op) }] };
}

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Gates — 3D slabs in world-Z space
//
//  A gate is a vertical panel at a fixed world-Z (absZ).  Because
//  it is perpendicular to the travel direction, its left and right
//  screen-X edges are the same at every screen-Y — it projects as a
//  RECTANGLE, not a trapezoid.  Width and height both scale as 1/relZ.
//
//  Front face: VP_X ± ROAD_HALF_W/relZ, yTop → yBot
//  Top face:   connects front-top edge to back-top edge (relZ+depth)
// ═══════════════════════════════════════════════════════════════════
function drawGates(ctx) {
  for (const gate of Game.gates) {
    const relZ = gate.absZ - Game.cameraZ;
    if (relZ < 1.0 || relZ > GATE_SPAWN_WZ + 2) continue;

    // ── Front face geometry ───────────────────────
    const hw   = ROAD_HALF_W / relZ;
    const yBot = Math.min(wz2y(relZ), CANVAS_H);
    const yTop = HORIZON_Y + (1 - GATE_WORLD_HEIGHT) * PERSP_K / relZ;
    const xL   = VP_X - hw;
    const xR   = VP_X + hw;

    if (yTop >= CANVAS_H || yBot <= HORIZON_Y) continue;

    // ── Back face geometry (for top-slab face) ────
    const relZ2 = relZ + GATE_WORLD_DEPTH;
    const hw2   = ROAD_HALF_W / relZ2;
    const yTop2 = HORIZON_Y + (1 - GATE_WORLD_HEIGHT) * PERSP_K / relZ2;
    const xL2   = VP_X - hw2;
    const xR2   = VP_X + hw2;

    for (const sec of gate.sections) {
      // Section x-bounds on front and back face
      let fxL, fxR, bxL, bxR;
      if (sec.side === 'full') {
        fxL = xL;   fxR = xR;   bxL = xL2;  bxR = xR2;
      } else if (sec.side === 'left') {
        fxL = xL;   fxR = VP_X; bxL = xL2;  bxR = VP_X;
      } else {
        fxL = VP_X; fxR = xR;   bxL = VP_X; bxR = xR2;
      }

      // Fractions are deliberately purple — the player can't read good/bad at a glance
      const color = sec.op.den > 1          ? COLORS.gateFraction :
                    sec.positive === true   ? COLORS.gateGood :
                    sec.positive === false  ? COLORS.gateBad  :
                    COLORS.gateNeutral;

      // Front face — filled rectangle
      ctx.save();
      ctx.globalAlpha = GATE_ALPHA;
      ctx.fillStyle   = color;
      ctx.fillRect(fxL, yTop, fxR - fxL, yBot - yTop);

      // Glowing border
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(1, 3 / relZ);
      ctx.shadowColor = color;
      ctx.shadowBlur  = 12;
      ctx.strokeRect(fxL, yTop, fxR - fxL, yBot - yTop);
      ctx.restore();

      // Top face — perspective-correct quadrilateral (lighter)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fxL, yTop);
      ctx.lineTo(fxR, yTop);
      ctx.lineTo(bxR, yTop2);
      ctx.lineTo(bxL, yTop2);
      ctx.closePath();
      ctx.globalAlpha = GATE_ALPHA;
      ctx.fillStyle   = color;
      ctx.fill();
      // White overlay to brighten the top face (lit from above)
      ctx.globalAlpha = 0.22;
      ctx.fillStyle   = '#ffffff';
      ctx.fill();
      ctx.restore();

      // Label — perspective-scaled, centered on the front face
      const cx = (fxL + fxR) / 2;
      const cy = (yTop + yBot) / 2;
      const fs = Math.max(10, Math.round(50 / relZ));
      ctx.save();
      ctx.font         = `bold ${fs}px 'Segoe UI', monospace`;
      ctx.fillStyle    = '#ffffff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur   = 6;
      ctx.fillText(opLabel(sec.op), cx, cy);
      ctx.restore();
    }

    // Split divider — vertical line at VP_X
    if (gate.sections.length === 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth   = Math.max(1, 1.5 / relZ);
      ctx.beginPath();
      ctx.moveTo(VP_X, yTop);
      ctx.lineTo(VP_X, yBot);
      ctx.stroke();
      // Divider top face line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(VP_X, yTop);
      ctx.lineTo(VP_X, yTop2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Stick figure
//
//  x, y   — foot anchor (screen coords)
//  phase  — local animation phase (radians)
//  scale  — 0..1 for spawn/despawn animation
//  stroke — outline/limb color
//  fill   — head fill color
// ═══════════════════════════════════════════════════════════════════
//  3/4 rear view: the crowd runs forward (up the road, away from camera).
//  Legs sit two-abreast and scissor along the vertical/depth axis; the lifted
//  leg rises + shrinks toward the vanishing point, the planted leg drives down
//  toward the camera + grows (foreshortening). Arms pump in screen-Y. A constant
//  yaw + forward lean give the dynamic three-quarter back.
function drawFigure(ctx, x, y, phase, scale, stroke, fill) {
  const H = FIGURE_HEIGHT * scale;
  if (H < 1) return;

  const headR  = H * 0.14, neckLen = H * 0.05, torsoLen = H * 0.30;
  const uArmLen = H * 0.20, fArmLen = H * 0.17, uLegLen = H * 0.22, shinLen = H * 0.20;

  const p   = phase;
  const sL  = Math.sin(p);             // left-leg stride: + = lift/forward, − = plant
  const sR  = Math.sin(p + Math.PI);   // right leg, anti-phase
  const aL  = sR, aR = sL;             // arms oppose the same-side leg
  const bob = Math.sin(2 * p) * BOB_AMPLITUDE * scale;

  const footBaseY = y + bob;
  const hipY      = footBaseY - uLegLen - shinLen;
  const legSpan   = LEG_LATERAL_SEP * H;
  const armSpan   = ARM_LATERAL_SEP * H;
  const hipLX     = x - legSpan, hipRX = x + legSpan;

  const yaw       = FIGURE_YAW;
  const shCX      = x + Math.sin(yaw) * torsoLen;        // yaw shifts shoulders → 3/4 view
  const shoulderY = hipY - torsoLen + FIGURE_LEAN * H;   // lean drops the upper body forward
  const shLX      = shCX - armSpan, shRX = shCX + armSpan;
  const headCX    = shCX + Math.sin(yaw) * neckLen;
  const headCY    = shoulderY - neckLen - headR;

  const baseLW    = Math.max(1.2, 1.8 * scale);
  const farStroke = shadeHex(stroke, FORESHORTEN_SHADE);

  // 2-segment limb stroke; foreshorten factor f scales its line width
  function seg(px, py, ex, ey, hx2, hy2, f, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = Math.max(1, baseLW * f);
    ctx.beginPath();
    ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2);
    ctx.stroke();
  }

  function legJoints(hx, s) {
    const f    = 1 - FORESHORTEN_AMT * s;          // plant (s<0) bigger, swing (s>0) smaller
    const uL   = uLegLen * f, shL = shinLen * f;
    const sw   = s * LEG_SWING_AMP;
    const bend = LEG_KNEE_BEND * Math.max(0, s);
    const kneeX = hx + (x - hx) * (LEG_CONVERGE * Math.max(0, s)) + Math.sin(yaw) * uL * 0.3;
    const kneeY = hipY - Math.sin(LEG_LIFT_ANG * sw) * uL;        // swing lifts the knee up-screen
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
    const handY  = elbowY + Math.cos(ARM_ELBOW_FLEX) * fA - ARM_SWING_AMP * H * a;  // pump in Y
    return { px: sx, py: shoulderY, ex: elbowX, ey: elbowY, hx2: handX, hy2: handY, f };
  }

  const legA = legJoints(hipLX, sL), legB = legJoints(hipRX, sR);
  const armA = armJoints(shLX, aL),  armB = armJoints(shRX, aR);

  // Painter's order: far (lifted/back, larger s) first, near (planted) last
  const legFar  = sL >= sR ? legA : legB, legNear = sL >= sR ? legB : legA;
  const armFar  = aL >= aR ? armA : armB, armNear = aL >= aR ? armB : armA;

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = fill;

  // Far limbs — shaded
  seg(armFar.px, armFar.py, armFar.ex, armFar.ey, armFar.hx2, armFar.hy2, armFar.f, farStroke);
  seg(legFar.px, legFar.py, legFar.ex, legFar.ey, legFar.hx2, legFar.hy2, legFar.f, farStroke);

  // Torso + neck
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = baseLW;
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(shCX, shoulderY);
  ctx.lineTo(headCX, headCY + headR);
  ctx.stroke();

  // Head (back of the head — filled)
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Near limbs
  seg(legNear.px, legNear.py, legNear.ex, legNear.ey, legNear.hx2, legNear.hy2, legNear.f, stroke);
  seg(armNear.px, armNear.py, armNear.ex, armNear.ey, armNear.hx2, armNear.hy2, armNear.f, stroke);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  DRAW: Crowd — circular formation, perspective-squished oval
// ═══════════════════════════════════════════════════════════════════

/** Concentric-ring formation: screen {x,y} for `n` figures centered at (centerX, baseY).
 *  Vertical radius is squished so the circle reads as an oval on the perspective road. */
function ringFormation(n, centerX, baseY, spacing) {
  const positions = [];
  if (n <= 0) return positions;

  positions.push({ x: centerX, y: baseY });   // slot 0 — centre

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

/** Screen positions for the player crowd (fixed depth at CROWD_Y). */
function getCrowdPositions() {
  return ringFormation(Game.crowd.people.length, Game.crowd.x, CROWD_Y, FIGURE_SPACING);
}

function drawCrowd(ctx) {
  const { crowd, runClock } = Game;
  if (crowd.people.length === 0) return;

  const positions = getCrowdPositions();

  // Paint back-to-front so front figures overlap rear ones
  const slots = positions
    .map((pos, i) => ({ pos, p: crowd.people[i] }))
    .sort((a, b) => a.pos.y - b.pos.y);

  for (const { pos, p } of slots) {
    if (!p || p.scale <= 0) continue;
    drawFigure(ctx, pos.x, pos.y, runClock + p.phaseOffset, p.scale,
               COLORS.playerStroke, COLORS.playerFill);
  }
}

/** Current run distance in whole meters — the main score. */
function scoreMeters() {
  return Math.floor(Game.distancePx * SCORE_SCALE);
}

function drawHUD(ctx) {
  ctx.save();
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 8;

  // Distance — the main score, shown above the runner count
  ctx.font      = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(scoreMeters() + ' m', 16, 12);

  // Live runner count
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

// ── Title screen + leaderboard modal wiring ─────────────────────────
const lbModal     = document.getElementById('leaderboardModal');
const lbList      = document.getElementById('leaderboardList');
const titleScreen = document.getElementById('titleScreen');
const titleList   = document.getElementById('titleScores');

function showTitle() { titleScreen.hidden = false; }
function hideTitle() { titleScreen.hidden = true;  }

/** Render exactly HIGHSCORE_COUNT rows; '-----' for empty slots, NEW tag on highlightRank. */
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

/** Show the leaderboard popup over the (frozen) game-over screen. */
function openLeaderboard() {
  renderLeaderboard();
  lbModal.hidden = false;
  Game.state = 'leaderboard';
  // Clear held inputs so the crowd doesn't lurch on restart
  Input.left = false; Input.right = false; Input.mouseDown = false;
}

function hideLeaderboard() { lbModal.hidden = true; }

document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('titleBtn').addEventListener('click', () => { hideLeaderboard(); startTitleDemo(); });
document.getElementById('playAgainBtn').addEventListener('click', () => { hideLeaderboard(); startGame(); });

/** Convert a client-space X to canvas logical X (accounts for CSS scaling). */
function clientToCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (CANVAS_W / rect.width);
}

window.addEventListener('keydown', e => {
  if (Game.state === 'title') return;                // attract demo — Play button starts the game
  if (Game.state === 'leaderboard') return;          // modal's Play Again button handles input
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

// ═══════════════════════════════════════════════════════════════════
//  UPDATE: Crowd steering
// ═══════════════════════════════════════════════════════════════════
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

  // Clamp so the full crowd width stays inside the road
  const bounds    = roadAt(CROWD_Y);
  const halfWidth = crowdHalfWidth();
  crowd.x = Math.max(bounds.left  + halfWidth,
             Math.min(bounds.right - halfWidth, crowd.x));

  return dir;
}

// ═══════════════════════════════════════════════════════════════════
//  PATH EDGE FALLING — figures tumble off the road when wall-hugging
// ═══════════════════════════════════════════════════════════════════

/** Actual horizontal half-extent of the formation: max |x-offset| of any live figure.
 *  Independent of crowd.x (offsets are relative), so it's safe to use during clamping. */
function crowdHalfWidth() {
  const positions = getCrowdPositions();
  let half = FIGURE_HEIGHT * 0.5;   // floor so a lone runner still has body width
  for (let i = 0; i < Game.crowd.people.length; i++) {
    const p = Game.crowd.people[i];
    if (!p || p.scaleTarget !== 1) continue;
    const pos = positions[i];
    if (pos) half = Math.max(half, Math.abs(pos.x - Game.crowd.x));
  }
  return half;
}

/** Smallest gap from any live figure to the road's left / right edge at that
 *  figure's depth. A small value means a runner is hugging (or over) that wall. */
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

  // Grace period at run start — no edge falling yet
  if (Game.elapsed < EDGE_FALL_GRACE_S) { crowd.edgeFallAccum = 0; return; }

  // Compare the actual leftmost / rightmost runners against the road edges.
  // A runner must be within the danger zone AND the player pushing into that wall.
  const { left, right } = crowdEdgeMargins();
  const hittingLeft  = dir < 0 && left  <= EDGE_DANGER_WIDTH;
  const hittingRight = dir > 0 && right <= EDGE_DANGER_WIDTH;

  if (!hittingLeft && !hittingRight) { crowd.edgeFallAccum = 0; return; }

  // Fractional accumulator: lose EDGE_FALL_RATE figures/second while hugging the wall
  crowd.edgeFallAccum += EDGE_FALL_RATE * dt;
  while (crowd.edgeFallAccum >= 1.0 && crowd.count > 0) {
    crowd.edgeFallAccum -= 1.0;
    dropFigureOffEdge(hittingLeft ? -1 : 1);
  }
}

/** Drop one runner toward the given wall (-1 left, +1 right): always show a tumbling
 *  figure and decrement the logical count, but only shrink the on-screen formation once
 *  the count falls back to the visible cap (so a huge crowd keeps looking full). */
function dropFigureOffEdge(side) {
  const crowd    = Game.crowd;
  const oldCount = crowd.count;
  if (oldCount <= 0) return;
  const newCount = oldCount - 1;   // maxPossible is intentionally NOT adjusted

  const oldDisplay = Math.min(oldCount, MAX_DISPLAY_FIGURES);
  const newDisplay = Math.min(newCount, MAX_DISPLAY_FIGURES);

  // Find the alive figure whose screen-x is most extreme toward the wall
  const positions = getCrowdPositions();
  let bestIdx = -1;
  let bestX   = side < 0 ? Infinity : -Infinity;
  for (let i = 0; i < crowd.people.length; i++) {
    const p = crowd.people[i];
    if (!p || p.scaleTarget !== 1) continue;       // skip figures already despawning
    const px = positions[i] ? positions[i].x : crowd.x;
    if (side < 0 ? px < bestX : px > bestX) { bestX = px; bestIdx = i; }
  }

  if (bestIdx !== -1) {
    const pos    = positions[bestIdx] || { x: crowd.x, y: CROWD_Y };
    const person = crowd.people[bestIdx];
    // Always spawn a visible tumbling figure peeling off the edge (slight jitter so
    // a fast stream of fallers above the cap doesn't overlap into a single line)
    Game.fallers.push({
      x: pos.x + (Math.random() - 0.5) * FIGURE_SPACING,
      y: pos.y + (Math.random() - 0.5) * FIGURE_SPACING * 0.5,
      phaseOffset: person.phaseOffset,
      side, t: 0,
    });
    // Only remove from the formation once we've dropped below the visible cap
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
    const slide = prog * 130;                       // slide outward, off the road edge
    const drop  = prog * prog * 70;                 // slight downward tumble (not through the floor)
    const angle = prog * (Math.PI / 2) * f.side;    // topple ~90° toward the wall
    ctx.save();
    ctx.globalAlpha = 1 - prog;
    ctx.translate(f.x + f.side * slide, f.y + drop);
    ctx.rotate(angle);
    drawFigure(ctx, 0, 0, f.phaseOffset, 1, COLORS.playerStroke, COLORS.playerFill);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GAME OVER / RESTART
// ═══════════════════════════════════════════════════════════════════
function triggerGameOver() {
  if (Game.state === 'gameover' || Game.state === 'leaderboard') return;
  Game.state = 'gameover';
  const res = saveHighscore(scoreMeters());   // record this run before showing results
  Game.highscores = res.scores;
  Game.lastRank   = res.rank;
  playSound('gameover');
}

// ── Local leaderboard (localStorage) ────────────────────────────────
// Wrapped in try/catch so a sandboxed iframe with storage disabled degrades
// gracefully (no leaderboard persistence, but the game still runs).

function loadHighscores() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIGHSCORE_KEY));
    if (!Array.isArray(arr)) return [];
    return arr.filter(n => typeof n === 'number' && isFinite(n))
              .sort((a, b) => b - a)
              .slice(0, HIGHSCORE_COUNT);
  } catch (e) { return []; }
}

/** Insert `score` into the local top-N. Returns the trimmed list and the new
 *  score's rank within it (-1 if it didn't make the cut). */
function saveHighscore(score) {
  const scores = loadHighscores();
  scores.push(score);
  scores.sort((a, b) => b - a);
  const trimmed = scores.slice(0, HIGHSCORE_COUNT);
  const rank    = trimmed.indexOf(score);   // first matching slot — fine for highlighting
  try { localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(trimmed)); } catch (e) { /* storage off */ }
  return { scores: trimmed, rank };
}

/** Zero out all run state (shared by both the real game and the title demo).
 *  Deliberately does NOT set Game.state — the caller decides 'running' vs 'title'. */
function resetSim() {
  Game.scrollSpeed = GATE_SCROLL_SPEED_INITIAL;
  Game.cameraZ     = 0;
  Game.runClock    = 0;
  Game.elapsed     = 0;
  Game.distancePx  = 0;
  Game.gates        = [];
  Game.rivals       = [];
  Game.fallers      = [];
  Game.debris       = [];
  Game.nextSpawnZ   = 0;   // first gate spawns instantly
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
    });
  }

  warmUpRoad();   // pre-roll START_SKIP_M of road so several gates are already approaching

  Input.left = false; Input.right = false; Input.mouseDown = false;
  hideLeaderboard();
}

/** Fast-forward the world by START_SKIP_M of road (without advancing the score or
 *  resolving any collisions) so the run begins with several gates already in flight.
 *  cameraZ moves forward, but distancePx stays 0, so this point reads as 0 m. */
function warmUpRoad() {
  // Distance→world-Z: cameraZ advances by (worldSpeed/scrollSpeed)=RELZ_CROWD²/PERSP_K per px.
  const skipPx        = START_SKIP_M / SCORE_SCALE;
  const targetCameraZ = skipPx * (RELZ_CROWD * RELZ_CROWD) / PERSP_K;

  // Replay the same distance-based spawn cadence as frame(), stepping the camera to each
  // slot so every gate gets the absZ it would have had during real play.
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
  Game.cameraZ = targetCameraZ;   // settle at the skip point (the new 0 m line)

  // Drop anything that would already have scrolled past the camera (same cull rule as frame()).
  Game.gates  = Game.gates.filter(g  => (g.absZ - Game.cameraZ) > 0.9);
  Game.rivals = Game.rivals.filter(r => (r.absZ - Game.cameraZ) > 0.9);
}

/** Start a real, player-controlled run. */
function startGame() {
  resetSim();
  Game.state = 'running';
  hideTitle();
  hideLeaderboard();
}

/** Start (or restart) the live attract demo behind the title overlay. */
function startTitleDemo() {
  resetSim();
  Game.demo.gateZ   = null;
  Game.demo.targetX = VP_X;
  Game.state = 'title';
  renderTitleScores();
  showTitle();
  hideLeaderboard();
}

// ── Title-screen auto-pilot ─────────────────────────────────────────
// Steers the crowd toward the better side of the next split gate (with an
// occasional deliberate mistake) by writing into the shared Input object,
// so the normal updateCrowd() movement is reused unchanged.

/** Pick a target X for the crowd: center of the better gate side (sometimes the worse). */
function chooseTargetX(gate, count) {
  const road = roadAt(CROWD_Y);
  if (gate.sections.length < 2) return VP_X;            // full gate → no choice, stay centered
  const L = gate.sections.find(s => s.side === 'left');
  const R = gate.sections.find(s => s.side === 'right');
  let pickLeft = applyOp(count, L.op) >= applyOp(count, R.op);  // better-result side
  if (Math.random() < DEMO_ERROR_CHANCE) pickLeft = !pickLeft;  // occasional mistake
  return pickLeft ? (road.left + VP_X) / 2 : (VP_X + road.right) / 2;
}

function demoSteer() {
  // Nearest un-fired gate still ahead of crowd depth
  let g = null, best = Infinity;
  for (const gate of Game.gates) {
    if (gate.fired) continue;
    const relZ = gate.absZ - Game.cameraZ;
    if (relZ > RELZ_CROWD && relZ < best) { best = relZ; g = gate; }
  }
  if (g && g.absZ !== Game.demo.gateZ) {                // decide once per gate
    Game.demo.gateZ   = g.absZ;
    Game.demo.targetX = chooseTargetX(g, Game.crowd.count);
  }
  if (!g) Game.demo.targetX = VP_X;                     // drift to center between gates

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

  // Final score (distance) — prominent
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

/** No-op audio stub — wire real sounds in later without refactoring. */
function playSound(id) { /* intentionally empty */ }

// ═══════════════════════════════════════════════════════════════════
//  RIVAL CROWDS & COMBAT
// ═══════════════════════════════════════════════════════════════════

function spawnRival() {
  const mp = Game.maxPossible;
  if (mp < 2) return null;   // too small to field a survivable rival — caller spawns a gate instead

  const frac = RIVAL_FRAC_BASE + RIVAL_FRAC_RAMP * Math.min(1, Game.elapsed / RIVAL_FRAC_RAMP_TIME);
  const jit  = 1 + (Math.random() * 2 - 1) * RIVAL_COUNT_JITTER;
  // Guardrail: rivalCount < maxPossible so a perfect player always survives an unavoidable rival
  const count = Math.max(1, Math.min(mp - 1, Math.round(mp * frac * jit)));
  Game.maxPossible = mp - count;             // unavoidable: loss applied at generation time

  const shown  = Math.min(count, MAX_DISPLAY_FIGURES);
  const people = [];
  for (let i = 0; i < shown; i++) people.push({ phaseOffset: Math.random() * Math.PI * 2 });
  return {
    absZ:     Game.cameraZ + GATE_SPAWN_WZ,  // fixed world position; camera approaches it
    x:        VP_X,                          // centered on the road (unavoidable for now)
    count,
    people,
    runClock: Math.random() * Math.PI * 2,   // independent gait
    fought:   false,
  };
}

/** Screen geometry of a rival at its current depth: center, baseline-Y and figure scale. */
function rivalGeom(rival) {
  const relZ  = rival.absZ - Game.cameraZ;
  const y     = Math.min(wz2y(relZ), CANVAS_H);
  const scale = RELZ_CROWD / relZ;   // 1.0 at crowd depth, smaller when farther away
  return { relZ, x: rival.x, y, scale };
}

function drawRivals(ctx) {
  for (const rival of Game.rivals) {
    const geo = rivalGeom(rival);
    if (geo.relZ <= 0.5 || geo.relZ > GATE_SPAWN_WZ + 2) continue;

    const positions = ringFormation(rival.people.length, geo.x, geo.y, FIGURE_SPACING * geo.scale);

    // Paint back-to-front so nearer figures overlap, tracking the formation's top edge
    const slots = positions
      .map((pos, i) => ({ pos, p: rival.people[i] }))
      .sort((a, b) => a.pos.y - b.pos.y);

    let topY = geo.y;
    for (const { pos, p } of slots) {
      if (!p) continue;
      topY = Math.min(topY, pos.y);
      drawFigure(ctx, pos.x, pos.y, rival.runClock + p.phaseOffset, geo.scale,
                 COLORS.rivalStroke, COLORS.rivalFill);
    }

    // Floating count label above the rival crowd, in the rival color
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

/** 1-on-1 combat: each side loses min(player, rival); the dead are blown away. */
function resolveRivalCombat(rival) {
  const crowd  = Game.crowd;
  const fought = Math.min(crowd.count, rival.count);
  const geo    = rivalGeom(rival);

  // Explosion: blow away the dead from both sides
  spawnBlast(fought, crowd.x, CROWD_Y,   1,         COLORS.playerStroke, COLORS.playerFill);
  spawnBlast(fought, geo.x,   geo.y,     geo.scale, COLORS.rivalStroke,  COLORS.rivalFill);

  // Apply losses (player loss may end the run via the count<=0 check in the frame loop)
  applyPlayerLoss(fought);
  rival.count -= fought;
  rival.fought = true;        // rival is removed regardless of any survivors

  playSound('clash');
}

/** Remove `amount` runners from the player crowd, shrinking the visible formation only
 *  once the count drops back to the display cap (same rule as edge falling). */
function applyPlayerLoss(amount) {
  const crowd      = Game.crowd;
  const oldCount   = crowd.count;
  const newCount   = Math.max(0, oldCount - amount);
  const oldDisplay = Math.min(oldCount, MAX_DISPLAY_FIGURES);
  const newDisplay = Math.min(newCount, MAX_DISPLAY_FIGURES);
  for (let k = 0; k < oldDisplay - newDisplay && crowd.people.length > 0; k++) crowd.people.pop();
  crowd.count = newCount;
}

/** Spawn up to CLASH_MAX_DEBRIS stick figures bursting outward from (cx, cy). */
function spawnBlast(deadCount, cx, cy, scale, stroke, fill) {
  const n = Math.min(deadCount, CLASH_MAX_DEBRIS);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = BLAST_SPEED * (0.5 + Math.random());
    Game.debris.push({
      x:  cx + (Math.random() - 0.5) * 40,
      y:  cy + (Math.random() - 0.5) * 30,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - BLAST_SPEED * 0.6,   // upward pop
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

  // Animation clocks always advance so figures keep "running" even on game over
  Game.runClock += dt * RUN_ANIM_SPEED;
  updateCrowdAnimations(dt);
  updateFallers(dt);
  updateDebris(dt);
  updateSky(dt);   // decorative — animates in every game state

  // The title-screen attract demo runs the full simulation too, driven by the auto-pilot.
  if (Game.state === 'running' || Game.state === 'title') {
    Game.elapsed += dt;

    // Gradual speed-up — begins once the first gate has been passed, capped at MAX
    if (Game.gatesPassed >= 1 && Game.scrollSpeed < GATE_SCROLL_SPEED_MAX) {
      Game.scrollSpeed = Math.min(GATE_SCROLL_SPEED_MAX, Game.scrollSpeed + GATE_SPEED_ACCEL * dt);
    }

    // Advance world scroll + accumulate distance (the score)
    const worldSpeed = computeWorldSpeed(Game.scrollSpeed);
    Game.cameraZ    += worldSpeed * dt;
    Game.distancePx += Game.scrollSpeed * dt;   // px at crowd depth → meters via SCORE_SCALE

    if (Game.state === 'title') demoSteer();    // auto-pilot writes Input before steering
    const dir = updateCrowd(dt);
    updateEdgeFalling(dt, dir);

    // Distance-based spawning — slots are a fixed distance apart, so a faster scroll
    // sweeps through them more often (every RIVAL_EVERY_N_GATES-th slot is a rival).
    while (Game.cameraZ >= Game.nextSpawnZ) {
      Game.nextSpawnZ += GATE_SPAWN_DIST_WZ;
      Game.spawnTick++;
      if (Game.spawnTick % RIVAL_EVERY_N_GATES === 0) {
        const rival = spawnRival();
        if (rival) Game.rivals.push(rival);
        else       Game.gates.push(spawnGate());   // maxPossible too small for a rival
      } else {
        Game.gates.push(spawnGate());
      }
    }
    // Gates are fixed in world space; cull once they've passed the camera.
    Game.gates = Game.gates.filter(g => (g.absZ - Game.cameraZ) > 0.9);

    // Gate collision — fire once when gate reaches crowd depth
    for (const gate of Game.gates) {
      if (gate.fired) continue;
      if ((gate.absZ - Game.cameraZ) > RELZ_CROWD) continue;
      const cx = Game.crowd.x;
      for (const sec of gate.sections) {
        if (sec.side === 'full' ||
            (sec.side === 'left'  && cx <  VP_X) ||
            (sec.side === 'right' && cx >= VP_X)) {
          applyGateSection(sec);
          break;
        }
      }
      gate.fired = true;
      Game.gatesPassed++;
    }

    // Rivals scroll like gates; combat resolves when one reaches crowd depth
    for (const rival of Game.rivals) {
      rival.runClock += dt * RUN_ANIM_SPEED;
      if (!rival.fought && (rival.absZ - Game.cameraZ) <= RELZ_CROWD) resolveRivalCombat(rival);
    }
    Game.rivals = Game.rivals.filter(r => !r.fought && (r.absZ - Game.cameraZ) > 0.9);

    // Crowd wiped out: end the real run, or silently restart the attract demo
    if (Game.crowd.count <= 0) {
      if (Game.state === 'title') startTitleDemo();
      else                        triggerGameOver();
    }
    // Soft time cap so a lucky demo still cycles for variety
    if (Game.state === 'title' && Game.elapsed > DEMO_MAX_TIME) startTitleDemo();
  }

  // Render layers (back to front)
  drawRoad(ctx);
  drawSky(ctx);          // stars + comet sit on the gutter, behind the horizon glow
  drawHorizonGlow(ctx);
  drawCenterDashes(ctx);
  drawGates(ctx);
  drawRivals(ctx);
  drawEdgeZones(ctx);
  drawCrowd(ctx);
  drawFallers(ctx);
  drawDebris(ctx);
  if (Game.state !== 'title') drawHUD(ctx);          // title overlay carries its own UI
  if (Game.state === 'gameover' || Game.state === 'leaderboard') drawGameOver(ctx);

  requestAnimationFrame(frame);
}

initSky();
startTitleDemo();          // open on the animated attract screen
requestAnimationFrame(frame);
