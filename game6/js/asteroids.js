// ============================================================================
// asteroids.js — the asteroid entity model: what a drifting rock is, how it
// travels, how it turns and when it is gone. Pure functions over plain objects;
// holds no state of its own (the live list is Game.asteroids).
//
// A rock is NOT an enemy, which is why this is not part of enemies.js: it has
// no hp, cannot be killed, scores nothing, drops nothing, carries no gun and
// follows no PATHS entry. The only thing the two models share is that something
// round crosses the screen, and that is not enough to share a file over.
//
// It does not decide when one spawns (spawner.js), does not resolve the hit it
// causes (collide.js), and does not draw (render.js).
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// Display width range, logical px, and it starts at the art's NATURAL size:
// never below it, and at most 15% over.
//
// 114 is 1:1 with the source. The cell is 341px and the backing store tops out
// at 3x logical (MAX_DPR of 2 against the 540px cap in styles.css), so
// 341 / 3 = 113.7 logical px is where a rock draws at its own pixels — exactly
// the arithmetic §6 uses to put the ship hulls at 48. The rock body fills about
// 280 of the 341 box, so this puts ~95 logical px of actual rock on a 360px
// field.
//
// They are drawn this large because size is what SEPARATES them from the
// roster. Every enemy is 36-48 across, so a rock at that scale reads as another
// thing to shoot; at three times the width it reads as terrain, and the player
// goes around it without being told to. Downscaling is what made them look like
// enemies, so the floor of this range is the floor of the art.
// 130 is +14.4%, just inside the +15% ceiling — 131 would have been +15.25%.
const ASTEROID_W = [114, 130];
// Travel speed range, px/s. Slower than most enemies — a rock is a hazard the
// player routes around, and one that arrives at combat speed cannot be routed
// around, only reacted to.
const ASTEROID_SPEED = [56, 155];
// Spin rate range, degrees/s. Direction is rolled separately, so a slow rock is
// as likely to be turning left as right.
const ASTEROID_SPIN = [12, 80];
// Animation rate range, ms per pulse frame. Rolled per rock so a field of them
// does not pulse in unison.
const ASTEROID_FRAME_MS = [80, 165];
// How far outside the canvas a rock travels before it is culled. Generous for
// the same reason the enemy margin is: they are born off-screen.
const ASTEROID_CULL_MARGIN = 100;
// Backstop for a rock that somehow never enters the playfield, so a bad spawn
// cannot leak an entity for the whole run.
const ASTEROID_MAX_AGE_MS = 30000;
// Hard ceiling on live rocks. Far under the enemy cap, and lowered again when
// the art went to its natural size: a rock cannot be cleared by shooting, so a
// screen that fills with them stays full — and at ~95px of body each, six of
// them is already most of the width if they happen to line up.
const ASTEROID_MAX = 6;

// Build a rock entering at (x, y) travelling along (dirX, dirY), which need not
// be normalised: the spawner hands over the vector from the rock's entry point
// to its exit point and this turns it into a velocity. `speedMult` is the
// difficulty's dial.
//
// ONE roll decides mass, and mass decides three things at once: a bigger rock
// is a heavier rock, so it is also the slower one and the slower one to tumble.
// The size band is only 15% wide now, so that reads as a subtle correlation
// rather than as the difference between a boulder and a pebble — but it is
// still what stops the biggest rock on screen from also being the fastest,
// which is the one pairing that has no reading at all.
//
// What mass does NOT decide is which of the three rocks it is. That is a flat
// roll over ASTEROID_TYPES, so colour never predicts behaviour (see the note on
// that table).
function makeAsteroid(x, y, dirX, dirY, speedMult) {
  const k = Math.random();
  const w = ASTEROID_W[0] + k * (ASTEROID_W[1] - ASTEROID_W[0]);
  const speed = (ASTEROID_SPEED[1] - k * (ASTEROID_SPEED[1] - ASTEROID_SPEED[0])) * speedMult;
  const spin = (ASTEROID_SPIN[1] - k * (ASTEROID_SPIN[1] - ASTEROID_SPIN[0])) *
               (Math.random() < 0.5 ? -1 : 1);

  return {
    t: Math.floor(Math.random() * ASTEROID_TYPES.length),
    w,
    x, y,
    // Birth point and velocity are both kept, because position is recomputed
    // from age rather than integrated — see updateAsteroids.
    x0: x,
    y0: y,
    // Direction comes in as a raw entry->exit vector and is normalised here, so
    // the spawner can express a trajectory as the two points it joins and never
    // has to think in angles at all. `|| 1` guards a zero-length vector, which
    // no caller should produce but which would otherwise yield NaN forever.
    vx: (dirX / (Math.hypot(dirX, dirY) || 1)) * speed,
    vy: (dirY / (Math.hypot(dirX, dirY) || 1)) * speed,
    rot0: Math.random() * TAU,   // so two rocks never enter at the same attitude
    rot: 0,
    spin,                        // deg/s
    ageMs: 0,
    animOff: Math.random() * ASTEROID_FRAMES.length * ASTEROID_FRAME_MS[1],
    frameMs: ASTEROID_FRAME_MS[0] +
             Math.random() * (ASTEROID_FRAME_MS[1] - ASTEROID_FRAME_MS[0]),
    entered: false,              // has it ever been inside the playfield?
  };
}

// Position and attitude are pure functions of age rather than integrations, the
// same way an enemy's path is and for the same reason: a rock that has been on
// screen for twenty seconds is exactly where the arithmetic says it is, whatever
// the frame times were on the way. Nothing here can accumulate drift.
function updateAsteroids(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    a.ageMs += dt;
    const s = a.ageMs / 1000;

    a.x = a.x0 + a.vx * s;
    a.y = a.y0 + a.vy * s;
    a.rot = a.rot0 + a.spin * DEG * s;

    const out =
      a.x < -ASTEROID_CULL_MARGIN || a.x > CANVAS_W + ASTEROID_CULL_MARGIN ||
      a.y < -ASTEROID_CULL_MARGIN || a.y > CANVAS_H + ASTEROID_CULL_MARGIN;

    // Only cull something that has actually been on screen: rocks are born
    // outside the playfield and must be allowed to fly in.
    if (!out) a.entered = true;
    else if (a.entered || a.ageMs > ASTEROID_MAX_AGE_MS) list.splice(i, 1);
  }
}

// The atlas frame this rock shows right now. `animOff` is a per-rock phase, so
// a field of them never pulses in unison.
function asteroidFrame(a) {
  const i = Math.floor((a.ageMs + a.animOff) / a.frameMs) % ASTEROID_FRAMES.length;
  return ASTEROID_FRAMES[i];
}

function asteroidRadius(a) {
  return Atlas.asteroidHitRadius(a.w);
}
