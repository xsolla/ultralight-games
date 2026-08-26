// ============================================================================
// enemies.js — enemy entity model: construction, path evaluation, facing, death
// fade and culling. Pure functions over plain enemy objects.
//
// It moves enemies that already exist. It does not decide what spawns or when
// (spawner.js), does not resolve hits (collide.js), and does not draw.
//
// Position is recomputed from the path every frame rather than integrated, so
// an enemy can never accumulate drift and a formation cannot shear apart over
// time. The only integrated state is the heading.
//
// One motion kind is delegated rather than implemented: a steered type has no
// path to evaluate, because a chaser has to see the player. Its position and
// heading are integrated in shooters.js and this file leaves both alone — see
// the note on PATHS.homing in data.js. Guns are that module's too; this one has
// no opinion about which enemies are armed.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// How far outside the canvas an enemy travels before it is culled. Generous
// because paths legitimately leave and re-enter — `swoop` climbs back out the
// top, and formation members are born off-screen with a negative age.
const ENEMY_CULL_MARGIN = 110;
// Backstop for an enemy that somehow never enters the playfield: without this a
// mis-parameterised path would leak an entity for the whole run.
const ENEMY_MAX_AGE_MS = 24000;
// Hard ceiling on live enemies. The spawner's ramp should never approach this;
// it exists so a future wave table cannot uncap the frame time.
const ENEMY_MAX = 90;
// Death flash. The explosion is the feedback now, so this only has to cover the
// moment the disc disappears — long enough that the sprite doesn't pop out from
// under the burst, short enough that the corpse isn't still legible inside it.
const ENEMY_DEATH_MS = 90;
// Below this squared frame delta a `face: 'travel'` heading is noise rather than
// a direction, so the previous heading is kept. 0.01 px^2 is a tenth of a pixel:
// well under any real movement, and above the float dust a near-stationary
// moment on a curve produces.
const FACE_MIN_DELTA_SQ = 0.01;

function makeEnemy(typeIdx, params, ageMs) {
  const type = ENEMY_TYPES[typeIdx];
  const at = PATHS[params.path](ageMs, params);
  return {
    t: typeIdx,
    p: params,
    ageMs,
    x: at.x,
    y: at.y,
    hp: params.hp,          // already difficulty-scaled by the spawner
    // radians. A tumbling type starts at a random spin phase; an armed one has
    // a nose, so it starts pointed the way its spawn recipe pointed it.
    rot: type.shoots ? params.face : params.rot0,
    animMs: Math.random() * ENEMY_FRAMES.length * type.frameMs,
    entered: false,         // has it ever been inside the playfield?
    deathMs: 0,             // counts up once killed, then the entity is dropped

    // ---- Gun and steering state, driven by shooters.js ----
    // Carried by every enemy rather than only the armed ones: the entity stays
    // one shape, which is worth four unused numbers on a tumbling disc.
    //
    // A gun with no scripted window starts part-way through its cooldown, so a
    // chain or a wing does not open fire in one lockstep wall. A scripted one
    // starts at 0 and is held by its `fireFrom` gate instead, which is what
    // fires a Harrier's first salvo the instant it arrives rather than whenever
    // its dice landed.
    gunMs: type.gun && !type.gun.fireFrom
      ? Math.random() * type.gun.intervalMs
      : 0,
    volleys: 0,             // volleys fired so far, against gun.volleys
    aim: type.shoots ? params.face : 0,   // heading a chaser is turning toward
    reaimMs: 0,             // countdown to its next look at the player
  };
}

// Mark an enemy as killed. Returns true if this call is what killed it, so the
// caller can count the kill exactly once.
function killEnemy(e) {
  if (e.deathMs > 0) return false;
  e.deathMs = 1;   // any non-zero value starts the fade; 1 keeps it visible
  return true;
}

function enemyDying(e) {
  return e.deathMs > 0;
}

function updateEnemies(enemies, dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const type = ENEMY_TYPES[e.t];

    if (e.deathMs > 0) {
      // Dying enemies hold position and fade. Freezing rather than coasting
      // makes the pop read as a hit landing on the spot the player aimed at.
      e.deathMs += dt;
      if (e.deathMs >= ENEMY_DEATH_MS) enemies.splice(i, 1);
      continue;
    }

    e.ageMs += dt;
    e.animMs += dt;

    // A steered type owns both its position and its heading; shooters.js has
    // already written them this frame, so touching either here would fight it.
    if (!type.steer) {
      const wasX = e.x, wasY = e.y;
      const at = PATHS[e.p.path](e.ageMs, e.p);
      e.x = at.x;
      e.y = at.y;

      if (type.spin) {
        // The tumbling types: the atlas frames are a glow pulse, not a
        // rotation, so all of their turning is this one integration.
        e.rot += type.spin * DEG * dt / 1000;
      } else if (type.face === 'travel') {
        // Armed hulls have a nose, so they point along where they actually went
        // this frame and bank through a curve for free. Anything else keeps the
        // heading it was born with — which is what lets a Harrier reverse out of
        // its attack run without turning round.
        const dx = e.x - wasX, dy = e.y - wasY;
        if (dx * dx + dy * dy > FACE_MIN_DELTA_SQ) e.rot = Math.atan2(dx, -dy);
      }
    }

    const out =
      e.x < -ENEMY_CULL_MARGIN || e.x > CANVAS_W + ENEMY_CULL_MARGIN ||
      e.y < -ENEMY_CULL_MARGIN || e.y > CANVAS_H + ENEMY_CULL_MARGIN;

    // Only cull something that has actually been on screen. Formation members
    // are born outside the playfield on purpose and must be allowed to fly in.
    if (!out) e.entered = true;
    else if (e.entered || e.ageMs > ENEMY_MAX_AGE_MS) enemies.splice(i, 1);
  }
}

// The atlas frame this enemy shows right now.
function enemyFrame(e) {
  const i = Math.floor(e.animMs / ENEMY_TYPES[e.t].frameMs) % ENEMY_FRAMES.length;
  return ENEMY_FRAMES[i];
}
