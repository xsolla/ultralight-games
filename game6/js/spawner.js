// ============================================================================
// spawner.js — wave scheduling, background trickle, armed set pieces, and the
// difficulty ramp. Decides WHAT spawns and WHEN; hands finished entities to
// game.js. No drawing, no collision, no per-entity movement (that lives in the
// PATHS table in data.js, evaluated by enemies.js).
//
// Three independent streams, each on its own timer:
//   trickle  a steady flow of tumbling types, so the screen is never empty
//   waves    scripted formations of tumbling types, on top of the trickle
//   armed    the shooting types, as self-contained set pieces
//
// Holds no module state: the three timers live on the Game object like all other
// run state, and are passed in as `spawn`.
// ============================================================================

// ---- Tunable spawn knobs (all pacing lives here) ---------------------------
const SPAWN_INTERVAL_BASE = 1150;   // ms between trickle spawns at t=0
const SPAWN_INTERVAL_MIN  = 320;    // ms floor — below this the screen clogs
                                    // faster than a level-1 weapon can clear
const RAMP_FULL_MS        = 150000; // 2.5 min of run time to reach full ramp
const WAVE_FIRST_MS       = 13000;  // grace period before the first wave
const WAVE_GAP_BASE       = 15000;  // ms between waves at t=0
const WAVE_GAP_MIN        = 8000;   // ms between waves at full ramp
const RAMP_SPEED_BONUS    = 0.35;   // +35% enemy speed by full ramp

// Enemy tiers unlock in steps because a type either exists or it doesn't. Kept
// to two steps, each introducing one new type, so the change is readable as
// "something new showed up" rather than as a difficulty cliff.
const TIER1_AT = 0.22;   // ramp fraction where tier-1 types join
const TIER2_AT = 0.55;   // ...and tier-2

// Geometry: how far outside the playfield things are born.
const SPAWN_ABOVE = 70;   // logical px above the top edge
const SPAWN_BESIDE = 55;  // logical px outside the left/right edge

// ---- Armed set pieces ------------------------------------------------------
// The shooting types arrive on their own timer, independent of both the trickle
// and the waves. Not folded into either: each of these five is a scripted
// encounter with its own geometry and its own beginning and end, and a trickle
// that dealt them out one at a time at random positions would destroy the shape
// that makes them read.
const SHOOTER_FIRST_MS = 7000;   // grace before the first armed contact, so the
                                 // player meets the unarmed types first
const SHOOTER_GAP_BASE = 9500;   // ms between set pieces at t=0
const SHOOTER_GAP_MIN  = 4200;   // ...at full ramp
// Slots kept clear of ENEMY_MAX before a set piece is allowed to start. A chain
// is up to 8 links and a wing up to 5, so without headroom a busy screen would
// spawn half an encounter and the shape would be a lie.
const SHOOTER_HEADROOM = 12;

// ---- Boss waves ------------------------------------------------------------
// The one stream driven by SCORE rather than by a clock. Every BOSS_SCORE_STEP
// points the whole armed roster arrives at once, with rocks in among it — all
// five set pieces on the field together, which is a thing the ordinary shooter
// timer can never produce because it deals them out one at a time.
//
// Score rather than elapsed time on purpose: it is the one number that already
// measures how well this run is going, so the encounter lands when the player
// has earned it rather than when the clock says so. A player being ground down
// scores slowly and meets fewer of these.
const BOSS_SCORE_STEP = 500;
// Every SECOND milestone — 1000, 2000, 3000 — sends two waves back to back
// instead of one.
const BOSS_DOUBLE = 2;
// Beat between the score landing and the wave arriving. Short, but not zero:
// something this size appearing on the same frame as the point that summoned it
// reads as a glitch rather than as an arrival.
const BOSS_LEAD_MS = 700;
// Gap between the two waves of a double. Deliberately shorter than any of the
// set pieces takes to cross, so the second lands while the first is still being
// dealt with — that overlap IS the difference between a double and two singles.
const BOSS_REPEAT_MS = 4000;
// Rocks thrown in alongside. Capped by ASTEROID_MAX like any other spawn, so a
// boss landing on an already-rocky field adds fewer rather than walling the
// screen off — the encounter is meant to be survivable, not a closed door.
const BOSS_ASTEROIDS = [2, 3];
// The ordinary shooter timer is pushed out this far when a boss fires. Without
// it a routine set piece can arrive in the middle of the encounter, and the
// boss stops reading as its own event.
const BOSS_QUIET_MS = 6500;

// How many waves a milestone is worth. Milestone 1 is 500, 2 is 1000, and so on,
// so the even ones are exactly the thousands.
function bossWavesFor(milestone) {
  return milestone % 2 === 0 ? BOSS_DOUBLE : 1;
}

// Queue `n` waves. Called by game.js the moment the score crosses a milestone;
// the waves themselves are paced out by updateSpawner below.
function queueBossWaves(spawn, n) {
  // Only restart the countdown when nothing is already pending, so a milestone
  // crossed during a double does not cut the gap between its two waves short.
  if (spawn.bossQueue <= 0) spawn.bossMs = BOSS_LEAD_MS;
  spawn.bossQueue += n;
}

// ---- Asteroid stream -------------------------------------------------------
// A fourth timer, independent of all three above (CLAUDE.md §7). Its own stream
// rather than a row in the trickle because a rock is not a kind of enemy: it
// cannot be shot, so mixing it into a table that the difficulty ramp thickens
// would mean the late game silts up with obstacles that never clear.
const ASTEROID_FIRST_MS = 5000;   // grace before the first rock, so the opening
                                  // seconds are about learning to fly
// Gaps are long, and got longer when the rocks went to their natural size: one
// of them is ~95px of body on a 360px field, so two on the same row already
// halve the corridor. Tuned against the measured mean-on-screen rather than
// guessed — see the density note below.
const ASTEROID_GAP_BASE = 7600;   // ms between rocks at t=0
const ASTEROID_GAP_MIN  = 4100;   // ...at full ramp
// Rocks enter from the top, or from a side near the top. A field that only ever
// falls straight at you is one the player learns to sidestep once; one that also
// crosses is what makes them look before moving.
const ASTEROID_SIDE_CHANCE = 0.30;
// Entry and exit depths for a side crossing, as fractions of the canvas height.
// The GAP between the two bands is what forces a crossing rock to travel most of
// the field rather than nicking a corner of it: entering by 0.22 at the latest
// and leaving by 0.70 at the earliest, it covers at least 48% of the height on
// its worst roll and 96% on its best — on top of the full width, which a side
// entry crosses by construction.
const ASTEROID_SIDE_IN  = [0.02, 0.22];
const ASTEROID_SIDE_OUT = [0.70, 0.98];

// Per-type recipe knobs. Each governs exactly one of the five encounters.
const MARAUDER_DOWN    = 0.75;  // share of runners that dive rather than climb
const MARAUDER_PAIR    = 0.45;  // chance a run is two ships rather than one
const MARAUDER_GAP_MS  = 620;   // stagger between them, so they are two threats
                                // in sequence rather than one wide one
const HARRIER_TOP      = 0.70;  // share of arrowheads entering from the top
const ARROW_DX         = 34;    // wingman offset to the side, logical px
const ARROW_DY         = 30;    // ...and BEHIND the leader along its travel
const REAVER_MIN       = 5;     // links in a chain
const REAVER_MAX       = 8;
const REAVER_GAP       = 0.95;  // link spacing as a multiple of the hull width,
                                // solved along the curve by chainAgeOffsets
const CURVE_X_JITTER   = 40;    // px of noise on a chain's mid-screen column,
                                // enough that two chains do not overlay
const CORSAIR_MIN      = 1;     // ships in a crossing wing
const CORSAIR_MAX      = 5;
const CORSAIR_DY       = 26;    // depth step between wing members
const CORSAIR_JITTER   = 14;    // px of noise on that step, so the wing arrives
                                // as a ragged line rather than a ruled one
const CORSAIR_GAP_MS   = 240;   // entry stagger, which is also what desynchs
                                // their guns on top of the random cooldown
// Depth band a crossing wing enters at, as a fraction of the canvas. Bounded
// above the player's own band: the wing sinks as it crosses (CROSS_SINK), and
// entering level with the player would give them no room to go under it.
const CROSS_Y_MIN = 0.14;
const CROSS_Y_MAX = 0.46;

// ---- Aim ------------------------------------------------------------------
// How a spawn is pointed at the player. This is aim, not tracking: it is
// resolved once at birth from the player's position at that instant, so the
// paths stay pure functions of age and the attack stays dodgeable.
const DIVE_AIM_DEPTH  = CANVAS_H * 0.78; // depth at which a dive should arrive
                                         // over the player's column
const DIVE_AIM_JITTER = 0.30;            // radians of noise on that aim, so a
                                         // rank fans out instead of funnelling
const DIVE_ANG_MAX    = 0.75;            // hard cap off vertical (~43 deg) —
                                         // past this a dive skims sideways and
                                         // leaves before it gets deep
// Arc turn radius, as a fraction of canvas width. This is how far in from the
// edge the sweep reaches before it points straight down.
const ARC_R_FRAC = [0.34, 0.72];
// How far to either side of the player's column an intercept actually aims.
const INTERCEPT_SLIP = 26;

// Chain link spacing is solved by walking the path's arc length. 8ms sampling is
// finer than any link gap by two orders of magnitude; the bound just stops a
// degenerate path (one that barely moves) from spinning.
const CHAIN_STEP_MS = 8;
const CHAIN_MAX_MS = 30000;
// Depth at which a chain's spacing is solved — see chainAgeOffsets. Mid-screen,
// so the chain is at its tidiest right where the player is dealing with it.
const CHAIN_SOLVE_Y = CANVAS_H * 0.45;

// Trickle path mix. Weights are relative; the sum is arbitrary.
//
// Weighted toward the paths that come at the player. `weave` is the only one
// left that neither aims nor accelerates, and it is deliberately kept in the
// mix at a reduced share: without something ignorable to contrast against, a
// screen where everything is diving at you stops reading as aggression and
// just reads as noise.
const TRICKLE_PATHS = [
  { path: 'dive',      w: 26 },
  { path: 'intercept', w: 20 },
  { path: 'swoop',     w: 16 },
  { path: 'weave',     w: 14 },
  { path: 'arc',       w: 13 },
  { path: 'sideEntry', w: 11 },
];

// ---- Spawn-time parameterisation ------------------------------------------
// One entry per PATHS kind, turning a spawn context into that path's params.
// Adding a movement kind means adding a PATHS entry and an entry here — two
// table rows, never a branch in an update loop.
//
// `c` carries { x0, speed, dir, targetX }.
const PATH_SETUP = {
  dive: (c) => ({
    x0: c.x0, y0: -SPAWN_ABOVE,
    // AIMED, not jittered: the angle that would put this enemy over the
    // player's column by the time it is DIVE_AIM_DEPTH down the screen, plus
    // enough noise that a rank does not converge into a single point. It was
    // previously a flat random +/-17 degrees, which is why descents so often
    // came down in a lane the player was not in.
    //
    // Still not homing — the angle is fixed at birth and never updated, so it
    // stays readable and dodgeable (CLAUDE.md 10).
    ang: clamp(
      Math.atan2(c.targetX - c.x0, DIVE_AIM_DEPTH) +
        (Math.random() - 0.5) * DIVE_AIM_JITTER,
      -DIVE_ANG_MAX, DIVE_ANG_MAX),
  }),

  weave: (c) => ({
    x0: c.x0, y0: -SPAWN_ABOVE,
    amp: 34 + Math.random() * 44,      // logical px of lateral swing
    freq: 1.1 + Math.random() * 1.1,   // radians/s
    phase: Math.random() * TAU,
  }),

  arc: (c) => ({
    // Enters from a side near the top and turns into a descent.
    x0: c.dir > 0 ? -SPAWN_BESIDE : CANVAS_W + SPAWN_BESIDE,
    y0: 20 + Math.random() * 70,
    dir: c.dir,
    // Turn radius as a fraction of the CANVAS, not derived from the type's
    // speed. Deriving it gave the slow hulls a ~60px radius, so they turned
    // downward while still tucked against the edge they came in from and never
    // threatened the middle. This is now literally how far in the sweep
    // reaches before it is pointing straight down.
    r: CANVAS_W * (ARC_R_FRAC[0] +
                   Math.random() * (ARC_R_FRAC[1] - ARC_R_FRAC[0])),
  }),

  swoop: (c) => ({
    x0: c.x0, y0: -SPAWN_ABOVE,
    // Cut toward the player rather than at a coin-flip direction: a strafing
    // dive that sweeps away from the target is the shy behaviour in another
    // costume. The magnitude of the cut is fixed in data.js; only the side is
    // chosen here.
    dir: c.targetX >= c.x0 ? 1 : -1,
  }),

  sideEntry: (c) => ({
    x0: c.dir > 0 ? -SPAWN_BESIDE : CANVAS_W + SPAWN_BESIDE,
    // Starts higher than it used to (was up to 0.42 of the screen). It now
    // sinks properly on its way across, so entering low as well would drop it
    // straight past the player with no crossing to dodge.
    y0: 30 + Math.random() * (CANVAS_H * 0.22),
    dir: c.dir,
  }),

  // ---- Armed paths --------------------------------------------------------
  // These carry a `face`: an armed hull has a nose, so its heading is chosen
  // here rather than being a random spin phase. `dir` for the two vertical
  // runners is which way they fly, so it also picks which edge they enter from.

  shooterRun: (c) => ({
    x0: c.x0,
    y0: c.dir > 0 ? -SPAWN_ABOVE : CANVAS_H + SPAWN_ABOVE,
    dir: c.dir,
    face: c.dir > 0 ? Math.PI : 0,
  }),

  shooterArrow: (c) => ({
    x0: c.x0,
    y0: c.dir > 0 ? -SPAWN_ABOVE : CANVAS_H + SPAWN_ABOVE,
    dir: c.dir,
    holdY: CANVAS_H * (c.dir > 0 ? ARROW_HOLD_TOP : ARROW_HOLD_BOTTOM),
    face: c.dir > 0 ? Math.PI : 0,
  }),

  shooterCurve: (c) => ({
    // Fixed to mid-screen rather than a free spawnX: the swing is +/- CURVE_AMP
    // wide, so a chain born at the edge would spend half its curve off-screen.
    x0: CANVAS_W / 2 + (Math.random() - 0.5) * CURVE_X_JITTER,
    y0: -SPAWN_ABOVE,
    dir: c.dir,
    amp: CURVE_AMP * (0.85 + Math.random() * 0.3),
    freq: CURVE_FREQ * (0.85 + Math.random() * 0.3),
    phase: CURVE_PHASE,
    // Starting value only — `face: 'travel'` takes over on the first frame.
    // Nose-down, so a link is never drawn pointing the wrong way even once.
    face: Math.PI,
  }),

  shooterCross: (c) => ({
    x0: c.dir > 0 ? -SPAWN_BESIDE : CANVAS_W + SPAWN_BESIDE,
    y0: CANVAS_H * (CROSS_Y_MIN + Math.random() * (CROSS_Y_MAX - CROSS_Y_MIN)),
    dir: c.dir,
    // Constant velocity on both axes, so one heading serves the whole crossing.
    face: Math.atan2(c.dir, -CROSS_SINK),
  }),

  homing: (c) => ({
    x0: c.x0, y0: -SPAWN_ABOVE,
    // Enters nose-down; shooters.js owns the heading from there.
    face: Math.PI,
  }),

  intercept: (c) => ({
    x0: c.x0, y0: -SPAWN_ABOVE,
    // Aim a little off the player's exact column. Landing dead on it every time
    // measured as a 0px miss distance, which reads as scripted rather than as
    // aimed — and it means a rank of them stacks into one lane instead of
    // bracketing the player.
    targetX: c.targetX + (Math.random() - 0.5) * 2 * INTERCEPT_SLIP,
    // Seconds to finish easing onto the target column. Long enough that the
    // turn-in reads as an attack run rather than as cheating, short enough
    // that it is committed to a column well before it gets there.
    freq: 1.2 + Math.random() * 0.8,
  }),
};

// ---- Ramp ------------------------------------------------------------------
// 0 at the start of a run, 1 once RAMP_FULL_MS has elapsed. Everything that
// scales with run time scales off this one number.
function spawnRamp(runMs) {
  return clamp(runMs / RAMP_FULL_MS, 0, 1);
}

function unlockedTiers(ramp) {
  return ramp >= TIER2_AT ? 2 : ramp >= TIER1_AT ? 1 : 0;
}

function pickType(ramp) {
  const maxTier = unlockedTiers(ramp);
  // Late in a run the tougher types should dominate rather than merely be
  // possible, so weight by tier instead of picking uniformly.
  let total = 0;
  const weights = ENEMY_TYPES.map((t) => {
    // The armed types are not part of this stream at all: they arrive on the
    // shooter timer as whole encounters, and a Harrier dealt out singly by the
    // trickle would be an arrowhead of one. This is what ENEMY_TYPES.shoots was
    // carried unused for.
    if (t.shoots || t.tier > maxTier) return 0;
    const w = 1 + t.tier * ramp * 2;
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return i;
  }
  return 0;
}

function pickTricklePath() {
  let total = 0;
  for (const e of TRICKLE_PATHS) total += e.w;
  let r = Math.random() * total;
  for (const e of TRICKLE_PATHS) {
    r -= e.w;
    if (r <= 0) return e.path;
  }
  return 'dive';
}

// Build one enemy's full spawn params: the path's own geometry plus the fields
// every path needs (speed, hp, initial spin phase).
function buildParams(pathKey, typeIdx, ramp, diff, playerX, x0, dir) {
  const type = ENEMY_TYPES[typeIdx];
  const p = PATH_SETUP[pathKey]({
    x0, dir,
    speed: type.speed,
    targetX: clamp(playerX, PLAYFIELD.side + 20, CANVAS_W - PLAYFIELD.side - 20),
  });
  p.path = pathKey;
  p.speed = type.speed * (1 + RAMP_SPEED_BONUS * ramp) * diff.speedMult;
  p.hp = Math.max(1, Math.round(type.hp * diff.hpMult));
  p.rot0 = Math.random() * TAU;   // so identical types don't spin in lockstep
  return p;
}

// A random x that keeps the whole sprite inside the playfield.
function spawnX(typeIdx) {
  const half = ENEMY_TYPES[typeIdx].dispW / 2;
  const lo = PLAYFIELD.side + half;
  const hi = CANVAS_W - PLAYFIELD.side - half;
  return lo + Math.random() * (hi - lo);
}

// ---- Entry point -----------------------------------------------------------
// `spawn` is { trickleMs, waveMs } and is the only thing mutated. Appends new
// enemies to `out`.
function updateSpawner(spawn, dt, runMs, diff, playerX, out, rocks) {
  const ramp = spawnRamp(runMs);

  // --- Background trickle. Runs the whole time, independent of waves, so the
  // screen is never empty between them (CLAUDE.md §7).
  spawn.trickleMs -= dt;
  if (spawn.trickleMs <= 0) {
    const interval =
      (SPAWN_INTERVAL_BASE + (SPAWN_INTERVAL_MIN - SPAWN_INTERVAL_BASE) * ramp) /
      diff.spawnMult;
    // Jitter so the trickle never becomes a metronome the player can read.
    spawn.trickleMs += interval * (0.75 + Math.random() * 0.5);
    if (out.length < ENEMY_MAX) {
      const typeIdx = pickType(ramp);
      const pathKey = pickTricklePath();
      const dir = Math.random() < 0.5 ? -1 : 1;
      const params = buildParams(pathKey, typeIdx, ramp, diff, playerX,
                                 spawnX(typeIdx), dir);
      out.push(makeEnemy(typeIdx, params, 0));
    }
  }

  // --- Scripted waves, landing on top of the trickle rather than instead of it.
  spawn.waveMs -= dt;
  if (spawn.waveMs <= 0) {
    const gap = (WAVE_GAP_BASE + (WAVE_GAP_MIN - WAVE_GAP_BASE) * ramp) /
                diff.spawnMult;
    spawn.waveMs += gap;
    spawnFormation(ramp, diff, playerX, out);
  }

  // --- Armed set pieces, on top of both. Which of the five arrives is a flat
  // roll: they are not tiered against each other because none of them is a
  // harder version of another — they are five different problems, and meeting
  // them in an unpredictable order is what stops the run becoming a rota.
  spawn.shooterMs -= dt;
  if (spawn.shooterMs <= 0) {
    const gap = (SHOOTER_GAP_BASE + (SHOOTER_GAP_MIN - SHOOTER_GAP_BASE) * ramp) /
                diff.spawnMult;
    spawn.shooterMs += gap * (0.8 + Math.random() * 0.4);
    if (out.length < ENEMY_MAX - SHOOTER_HEADROOM) {
      const idx = SHOOTER_IDX[Math.floor(Math.random() * SHOOTER_IDX.length)];
      SHOOTER_WAVES[ENEMY_TYPES[idx].key](idx, ramp, diff, playerX, out);
    }
  }

  // --- Boss waves. Not a timer of its own: the queue is filled by score
  // (game.js), and this only paces out what is already owed.
  if (spawn.bossQueue > 0) {
    spawn.bossMs -= dt;
    if (spawn.bossMs <= 0) {
      spawn.bossQueue--;
      spawn.bossMs = BOSS_REPEAT_MS;
      spawnBossWave(ramp, diff, playerX, out, rocks);
      // Hold the routine shooter off, so what is on screen for the next few
      // seconds is the boss and not the boss plus whatever was already due.
      spawn.shooterMs = Math.max(spawn.shooterMs, BOSS_QUIET_MS);
    }
  }

  // --- Asteroids, on a fourth timer of their own. Never aimed at the player:
  // a rock is weather, and weather that hunts is just a slow enemy.
  spawn.asteroidMs -= dt;
  if (spawn.asteroidMs <= 0) {
    const gap = (ASTEROID_GAP_BASE + (ASTEROID_GAP_MIN - ASTEROID_GAP_BASE) * ramp) /
                diff.spawnMult;
    spawn.asteroidMs += gap * (0.7 + Math.random() * 0.6);
    if (rocks.length < ASTEROID_MAX) rocks.push(rollAsteroid(diff));
  }
}

// One boss wave: every armed type at once, plus rocks.
//
// Each type arrives through its OWN recipe rather than through some flattened
// boss formation, which is the whole point — a Harrier still comes in as an
// arrowhead and a Reaver still comes in as a chain, so the encounter is the five
// problems the player already knows how to read, all at once, rather than a
// sixth problem they have never seen. It needs no new geometry for the same
// reason, and a new armed type joins these waves by existing.
//
// They spawn on ONE frame and are not staggered: the five recipes already enter
// from different edges on different geometry, so they separate themselves
// without any help, and staggering them would turn "all of them at once" into a
// queue — which is what the ordinary shooter timer already is.
function spawnBossWave(ramp, diff, playerX, out, rocks) {
  for (const idx of SHOOTER_IDX) {
    // The same headroom the routine shooter keeps, so a boss can never fill the
    // entity cap and starve the trickle for the rest of the run.
    if (out.length >= ENEMY_MAX - SHOOTER_HEADROOM) break;
    SHOOTER_WAVES[ENEMY_TYPES[idx].key](idx, ramp, diff, playerX, out);
  }

  const n = BOSS_ASTEROIDS[0] +
            Math.floor(Math.random() * (BOSS_ASTEROIDS[1] - BOSS_ASTEROIDS[0] + 1));
  for (let i = 0; i < n; i++) {
    if (rocks.length >= ASTEROID_MAX) break;
    rocks.push(rollAsteroid(diff));
  }
}

// One rock. Every trajectory is built from an entry point AND an exit point,
// and the heading is simply whatever joins them.
//
// That construction is the whole reason a rock now crosses the field instead of
// clipping a corner of it. A heading rolled directly can point off the near edge
// a second after the rock arrives, and no cap on the angle fixes that — the
// angle was never the problem, the unconstrained destination was. Two points
// that both lie on the field cannot be joined by a line that leaves it in
// between, so aiming at an exit is a guarantee where a narrower cone was only
// ever a hope.
//
// It also means every rock commits downward by construction: the exit is always
// below the entry, so the vertical component cannot reach zero and the §7 rule
// against stalling paths holds without anything having to check it.
function rollAsteroid(diff) {
  // The widest rock's half-width, used as the inset for EVERY rock rather than
  // its own. The size band is 15% wide, so padding them all by the largest costs
  // a few pixels of entry range and keeps this arithmetic independent of the
  // mass roll that happens inside makeAsteroid.
  const pad = ASTEROID_W[1] / 2;
  const lo = pad;
  const hi = CANVAS_W - pad;

  if (Math.random() >= ASTEROID_SIDE_CHANCE) {
    // Top to bottom. BOTH ends are inset from the side edges, so the whole
    // descent happens on screen and a rock can no longer leave by the edge it
    // came in beside — which is exactly what made them read as corner traffic.
    const xIn = lo + Math.random() * (hi - lo);
    const xOut = lo + Math.random() * (hi - lo);
    return makeAsteroid(xIn, -SPAWN_ABOVE,
                        xOut - xIn, CANVAS_H + SPAWN_ABOVE * 2, diff.speedMult);
  }

  // Side to side, entering high and leaving low, so it crosses the full width
  // and a third of the height at the very least. Much shallower than a falling
  // rock — around 40 to 65 degrees off vertical — which is what makes a crossing
  // read as a different hazard rather than as a leaning descent.
  const dir = Math.random() < 0.5 ? 1 : -1;   // +1 enters at the left
  const xIn = dir > 0 ? -SPAWN_BESIDE : CANVAS_W + SPAWN_BESIDE;
  const xOut = dir > 0 ? CANVAS_W + SPAWN_BESIDE : -SPAWN_BESIDE;
  const yIn = CANVAS_H * (ASTEROID_SIDE_IN[0] +
              Math.random() * (ASTEROID_SIDE_IN[1] - ASTEROID_SIDE_IN[0]));
  const yOut = CANVAS_H * (ASTEROID_SIDE_OUT[0] +
               Math.random() * (ASTEROID_SIDE_OUT[1] - ASTEROID_SIDE_OUT[0]));
  return makeAsteroid(xIn, yIn, xOut - xIn, yOut - yIn, diff.speedMult);
}

function pickFormation() {
  let total = 0;
  for (const f of FORMATIONS) total += f.w;
  let r = Math.random() * total;
  for (const f of FORMATIONS) {
    r -= f.w;
    if (r <= 0) return f;
  }
  return FORMATIONS[0];
}

// Age offsets that seat `count` links exactly `gapPx` apart ALONG the shared
// curve, found by walking the path and accumulating arc length.
//
// Two things about the walk, both of which the accelerating attack paths forced:
//
// It runs BACKWARDS, because that is where the links sit: link i is born at age
// -offsets[i], so the geometry that has to come out evenly spaced is the curve
// BEHIND the reference point, not ahead of it. Walking forwards measured a
// different speed profile entirely and left the arc chain at 42-146px against a
// 41px target.
//
// And it starts from the age at which the leader reaches CHAIN_SOLVE_Y, not from
// birth. A time-staggered chain on a path whose speed varies with age cannot
// hold one spacing for its whole life — the links are at different ages, so they
// are travelling at different speeds. Solved at birth, `spear` opened from 44px
// to 98px by the time its leader reached the player's row and `lash` bunched
// from 42px to 19px. Solving at mid-screen puts the even spacing where it is
// actually looked at and leaves the drift off-screen, where nobody sees it.
//
// Not simply gapPx/speed either: a path's real speed is not its `speed` param,
// because `speed` only scales one term of the path expression. A weave outruns
// its own `speed` through the diagonals, and a plunging path exceeds it by
// PLUNGE_OUT once committed.
function chainAgeOffsets(pathKey, params, gapPx, count) {
  const fn = PATHS[pathKey];

  let ref = 0;
  while (ref < CHAIN_MAX_MS && fn(ref, params).y < CHAIN_SOLVE_Y) ref += CHAIN_STEP_MS;

  const offsets = [0];
  let t = ref, acc = 0;
  let prev = fn(ref, params);

  while (offsets.length < count && t > ref - CHAIN_MAX_MS) {
    t -= CHAIN_STEP_MS;
    const cur = fn(t, params);
    acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
    if (acc >= gapPx) { offsets.push(ref - t); acc = 0; }
  }

  // A barely-moving path can run out of solve budget. Repeat the last spacing
  // rather than truncating, so the chain still spawns at full length.
  const step = offsets.length > 1
    ? offsets[offsets.length - 1] - offsets[offsets.length - 2]
    : CHAIN_STEP_MS;
  while (offsets.length < count) offsets.push(offsets[offsets.length - 1] + step);
  return offsets;
}

// Instantiate one formation: `count` enemies on a shared path, staggered either
// by distance along the curve (`gap`, a chain) or by a fixed time (`delayMs`).
// Staggered members are born with a NEGATIVE age, which places them off-screen
// and lets them fly in on their own.
function spawnFormation(ramp, diff, playerX, out) {
  const f = pickFormation();
  const typeIdx = pickType(ramp);
  const type = ENEMY_TYPES[typeIdx];
  const dir = Math.random() < 0.5 ? -1 : 1;

  // Keep the whole rank on screen: the formation is `count` slots of `dx` wide,
  // centred on a base x that is inset by half the rank's own width.
  const half = type.dispW / 2;
  const rankHalf = (f.count - 1) * f.dx / 2;
  const lo = PLAYFIELD.side + half + rankHalf;
  const hi = CANVAS_W - PLAYFIELD.side - half - rankHalf;
  const baseX = hi > lo ? lo + Math.random() * (hi - lo) : CANVAS_W / 2;

  // ONE geometry template for the whole formation, cloned per member. PATH_SETUP
  // rolls random amp/freq/angles, so calling it per member would hand every
  // member its own curve and the formation would have no shape to hold.
  const template = buildParams(f.path, typeIdx, ramp, diff, playerX, baseX, dir);
  const ages = f.gap != null
    ? chainAgeOffsets(f.path, template, f.gap * type.dispW, f.count)
    : null;

  // Only a chain carries a shared counter, so only a chain can pay the
  // clearance bonus. `gap` is already what separates the chains from the ranks
  // in FORMATIONS — see the "---- Chains ----" block there — so this needs no
  // new field in the table.
  const chain = f.gap != null ? makeChain(f.count) : null;

  for (let i = 0; i < f.count; i++) {
    if (out.length >= ENEMY_MAX) {
      // The ceiling truncates the line, so the counter has to shrink with it.
      if (chain) chainTruncate(chain, i);
      return;
    }
    const p = Object.assign({}, template);
    p.x0 = template.x0 + (i - (f.count - 1) / 2) * f.dx;
    // A shared amp/freq with a stepped phase is what makes a weaving rank hold
    // its shape while the shape itself slides down the screen. Chains use a step
    // of 0, so every link retraces the leader's exact path.
    if (f.phaseStep) p.phase = (template.phase || 0) + i * f.phaseStep;
    // Spin phase stays per-enemy: links sharing a trajectory should not also
    // rotate in lockstep, which reads as one rigid object rather than a chain.
    p.rot0 = Math.random() * TAU;
    out.push(makeEnemy(typeIdx, p, ages ? -ages[i] : -i * f.delayMs, chain));
  }
}

// ---- Armed set pieces ------------------------------------------------------
// Which rows of ENEMY_TYPES are armed. Resolved once at load: keeping both
// halves of the roster in one table is what lets collide.js and explosions.js
// stay ignorant of shooters, and this is the slice the shooter timer draws from.
const SHOOTER_IDX = ENEMY_TYPES
  .map((t, i) => (t.shoots ? i : -1))
  .filter((i) => i >= 0);

// One recipe per armed type, keyed by ENEMY_TYPES.key. Each builds a whole
// encounter and appends it to `out`. This is the spawner's counterpart to
// FORMATIONS: those are declarative because every tumbling wave is the same
// shape ("N on one path, staggered"), and these are not — an arrowhead, a chain
// and a crossing wing have nothing in common to factor out except the path
// params, which PATH_SETUP already owns.
const SHOOTER_WAVES = {
  // One or two straight runners, each in its own lane. Mostly diving; the
  // climbing variant enters from the bottom and fires ahead of itself, which is
  // AWAY from a player it has just passed — so it is a ramming threat from
  // behind rather than a firing one, and rarer for being the odder read.
  marauder(idx, ramp, diff, playerX, out) {
    const dir = Math.random() < MARAUDER_DOWN ? 1 : -1;
    const n = Math.random() < MARAUDER_PAIR ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // A fresh x per ship rather than a shared one: two runners in the same
      // column would be one obstacle with a gap in it.
      const p = buildParams('shooterRun', idx, ramp, diff, playerX,
                            spawnX(idx), dir);
      out.push(makeEnemy(idx, p, -i * MARAUDER_GAP_MS));
    }
  },

  // Three abreast in an arrowhead, all on one column each. The leader is at the
  // point and the wingmen sit out to the sides and BEHIND it — behind meaning
  // back along the direction of travel, so a climbing arrowhead is the exact
  // mirror of a diving one and neither has to be written twice.
  harrier(idx, ramp, diff, playerX, out) {
    const dir = Math.random() < HARRIER_TOP ? 1 : -1;
    const half = ENEMY_TYPES[idx].dispW / 2;
    // Inset by a full wing width so the whole formation stays in the playfield.
    const lo = PLAYFIELD.side + half + ARROW_DX;
    const hi = CANVAS_W - PLAYFIELD.side - half - ARROW_DX;
    const leadX = hi > lo ? lo + Math.random() * (hi - lo) : CANVAS_W / 2;
    const lead = buildParams('shooterArrow', idx, ramp, diff, playerX,
                             leadX, dir);

    for (let i = 0; i < 3; i++) {
      const p = Object.assign({}, lead);
      if (i > 0) {
        p.x0 = leadX + (i === 1 ? -ARROW_DX : ARROW_DX);
        // y0 and holdY shift TOGETHER, which is what holds the arrowhead's shape
        // through the approach, the hold and the retreat alike.
        p.y0 = lead.y0 - dir * ARROW_DY;
        p.holdY = lead.holdY - dir * ARROW_DY;
      }
      out.push(makeEnemy(idx, p, 0));
    }
  },

  // A chain tracing one broad curve. Spacing is solved along the curve's arc
  // length by the same walker the tumbling chains use, so the links sit an even
  // distance apart rather than an even time apart.
  reaver(idx, ramp, diff, playerX, out) {
    const n = REAVER_MIN + Math.floor(Math.random() * (REAVER_MAX - REAVER_MIN + 1));
    const dir = Math.random() < 0.5 ? -1 : 1;
    // ONE template cloned per link: PATH_SETUP rolls the amplitude and
    // frequency, so calling it per link would give every link its own curve and
    // there would be no chain.
    const template = buildParams('shooterCurve', idx, ramp, diff, playerX,
                                 0, dir);
    const ages = chainAgeOffsets('shooterCurve', template,
                                 REAVER_GAP * ENEMY_TYPES[idx].dispW, n);
    // The armed chain, and the only set piece that is one — an arrowhead and a
    // crossing wing are formations, not lines. It pays the clearance bonus on
    // the same terms the tumbling chains do.
    const chain = makeChain(n);
    for (let i = 0; i < n; i++) {
      if (out.length >= ENEMY_MAX) {
        chainTruncate(chain, i);
        return;
      }
      out.push(makeEnemy(idx, Object.assign({}, template), -ages[i], chain));
    }
  },

  // One chaser. Deliberately never more than one: two of these converging from
  // different angles leaves no direction to run, and the type is built around
  // there being one.
  stalker(idx, ramp, diff, playerX, out) {
    out.push(makeEnemy(idx, buildParams('homing', idx, ramp, diff, playerX,
                                        spawnX(idx), 1), 0));
  },

  // A wing crossing the screen from one side. Staggered in depth and in time so
  // it arrives as a ragged line: a rank abreast would put every gun on the same
  // row and its shots would land as one wall.
  corsair(idx, ramp, diff, playerX, out) {
    const n = CORSAIR_MIN + Math.floor(Math.random() * (CORSAIR_MAX - CORSAIR_MIN + 1));
    const dir = Math.random() < 0.5 ? -1 : 1;
    const lead = buildParams('shooterCross', idx, ramp, diff, playerX, 0, dir);
    for (let i = 0; i < n; i++) {
      if (out.length >= ENEMY_MAX) return;
      const p = Object.assign({}, lead);
      p.y0 = lead.y0 + i * CORSAIR_DY + (Math.random() - 0.5) * CORSAIR_JITTER;
      out.push(makeEnemy(idx, p, -i * CORSAIR_GAP_MS));
    }
  },
};

// Fresh run: first trickle almost immediately, then the armed set pieces, then
// the formations — so the player meets one problem at a time on the way in.
function resetSpawner(spawn) {
  spawn.trickleMs = 400;
  spawn.waveMs = WAVE_FIRST_MS;
  spawn.shooterMs = SHOOTER_FIRST_MS;
  spawn.asteroidMs = ASTEROID_FIRST_MS;
  // The boss queue is emptied rather than seeded: it fills from score, and a
  // fresh run has none.
  spawn.bossQueue = 0;
  spawn.bossMs = 0;
}
