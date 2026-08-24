// ============================================================================
// enemies.js — enemy entity model: construction, path evaluation, spin, death
// fade and culling. Pure functions over plain enemy objects.
//
// It moves enemies that already exist. It does not decide what spawns or when
// (spawner.js), does not resolve hits (collide.js), and does not draw.
//
// Position is recomputed from the path every frame rather than integrated, so
// an enemy can never accumulate drift and a formation cannot shear apart over
// time. The only integrated state is spin, which has nothing to keep in sync.
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
    rot: params.rot0,       // radians, integrated by spin
    animMs: Math.random() * ENEMY_FRAMES.length * type.frameMs,
    entered: false,         // has it ever been inside the playfield?
    deathMs: 0,             // counts up once killed, then the entity is dropped
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
    e.rot += type.spin * DEG * dt / 1000;

    const at = PATHS[e.p.path](e.ageMs, e.p);
    e.x = at.x;
    e.y = at.y;

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
