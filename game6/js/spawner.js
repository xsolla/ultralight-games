// ============================================================================
// spawner.js — wave scheduling, background trickle, difficulty ramp.
// Decides WHAT spawns and WHEN; hands finished entities to game.js. No drawing,
// no collision, no per-entity movement (that lives in the PATHS table in
// data.js, evaluated by enemies.js).
//
// Holds no module state: the two timers live on the Game object like all other
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
  const weights = ENEMY_TYPES.map((t, i) => {
    if (t.tier > maxTier) return 0;
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
function updateSpawner(spawn, dt, runMs, diff, playerX, out) {
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

  for (let i = 0; i < f.count; i++) {
    if (out.length >= ENEMY_MAX) return;
    const p = Object.assign({}, template);
    p.x0 = template.x0 + (i - (f.count - 1) / 2) * f.dx;
    // A shared amp/freq with a stepped phase is what makes a weaving rank hold
    // its shape while the shape itself slides down the screen. Chains use a step
    // of 0, so every link retraces the leader's exact path.
    if (f.phaseStep) p.phase = (template.phase || 0) + i * f.phaseStep;
    // Spin phase stays per-enemy: links sharing a trajectory should not also
    // rotate in lockstep, which reads as one rigid object rather than a chain.
    p.rot0 = Math.random() * TAU;
    out.push(makeEnemy(typeIdx, p, ages ? -ages[i] : -i * f.delayMs));
  }
}

// Fresh run: first wave after a grace period, first trickle almost immediately.
function resetSpawner(spawn) {
  spawn.trickleMs = 400;
  spawn.waveMs = WAVE_FIRST_MS;
}
