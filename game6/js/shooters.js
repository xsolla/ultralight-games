// ============================================================================
// shooters.js — the armed enemy's gun script, and the one steered flight path.
// Pure functions over plain enemy objects; holds no state of its own.
//
// It decides WHEN a shooter fires and WHERE its muzzle points. Where the
// particle then goes and how it flies is still weapons.js, exactly as the
// player's cadence lives in player.js and its geometry does not. It does not
// draw, does not resolve hits, and does not decide what spawns (spawner.js).
//
// It also carries the ONE motion kind that cannot live in the PATHS table: a
// chaser has to see the player, and PATHS entries are pure functions of age by
// design (see the note on `homing` in data.js). enemies.js skips path
// evaluation for a steered type and this integrates it instead.
// ============================================================================

// ---- Tunable steering (the Stalker) ----------------------------------------
// Degrees/s the chaser can swing its nose. This, not its speed, is what makes
// it dodgeable: at 115 deg/s a hard sidestep opens an angle it needs most of a
// second to close, so the counter-play is to bait the turn and cut across it.
const STEER_TURN_DEG = 115;

// How often the chaser re-reads the player's position.
//
// Deliberately a TIMER and not a frame count: a frame-count throttle would make
// the enemy track harder at 144fps than at 30fps, and CLAUDE.md §4 fixes every
// duration in this game in milliseconds for exactly that reason.
//
// And the reason to throttle at all is feel, not cost. The cost is one atan2 per
// chaser per tick and at most a handful are ever alive, so measuring it would be
// measuring noise. What re-aiming every frame actually buys is a heading glued
// to the player, which jitters as they cross the nose and reads as a magnet
// being dragged rather than as something flying. 90ms leaves a visible lag —
// about 11 corrections a second, so the hull is always aiming slightly at where
// the player just was, which is the tell the dodge is read off.
const STEER_REAIM_MS = 90;

// After this much life the chaser stops re-aiming and flies out on its last
// heading. Without it a chaser that overshoots simply orbits the player until
// the age backstop in enemies.js drops it, which is both unkillable-feeling and
// unfair; with it, every Stalker is a single committed pass the player can
// survive by out-turning. It is also the second half of the counter-play: bait
// the turn, then wait it out.
const STEER_COMMIT_MS = 3400;

// Muzzle offset as a fraction of the hull's on-screen width, so shots leave the
// nose rather than the middle of the sprite. Matches what player.js does with
// Atlas.hullHeight, but these hulls are drawn in a square box so the width is
// the only dimension there is.
const SHOOTER_MUZZLE = 0.42;

// Tick every armed enemy: steer the ones that steer, then run their guns.
// Appends any projectiles fired this frame to `out`.
//
// Called after updateEnemies has moved everything, so a volley leaves from
// where its hull ended up this frame rather than trailing a frame behind it —
// the same ordering the player's gun gets in game.js.
function updateShooters(enemies, dt, player, out, diff) {
  for (const e of enemies) {
    const type = ENEMY_TYPES[e.t];
    // Dying enemies neither steer nor fire: a shot that leaves a hull already
    // coming apart reads as the kill not having registered.
    if (!type.shoots || enemyDying(e)) continue;
    if (type.steer) steerShooter(e, dt, player);
    updateGun(e, type, dt, player, out, diff);
  }
}

// Integrate one chaser: re-aim on the timer, turn toward that aim at a bounded
// rate, then move along the nose. Heading IS the state here, which is why the
// type declares `face: 'steer'` — nothing else writes e.rot for it.
function steerShooter(e, dt, player) {
  const sec = dt / 1000;

  e.reaimMs -= dt;
  if (e.reaimMs <= 0 && e.ageMs < STEER_COMMIT_MS && !player.dead) {
    e.reaimMs += STEER_REAIM_MS;
    e.aim = Math.atan2(player.x - e.x, -(player.y - e.y));
  }

  // Turn the short way round. Without the wrap a chaser whose target crosses
  // the +/-pi seam takes the long way and visibly spins on the spot.
  let delta = e.aim - e.rot;
  delta -= TAU * Math.round(delta / TAU);
  const maxTurn = STEER_TURN_DEG * DEG * sec;
  e.rot += clamp(delta, -maxTurn, maxTurn);

  // Speed is constant; only the heading is steered. A chaser that could also
  // accelerate would be undodgeable, and `speed` is already difficulty-scaled
  // by the spawner like every other enemy's.
  e.x += Math.sin(e.rot) * e.p.speed * sec;
  e.y -= Math.cos(e.rot) * e.p.speed * sec;
}

// Run one shooter's gun for this frame. Every gate here is a reason NOT to
// fire, checked before the cooldown is touched so a gated shooter cannot bank
// up a burst and release it all at once the moment the gate opens.
function updateGun(e, type, dt, player, out, diff) {
  const g = type.gun;
  if (!g) return;
  // Nothing shoots from outside the playfield. Chain links and staggered
  // formation members are born off-screen at a negative age on purpose, and
  // without this a chain's tail would open fire from above the top edge.
  if (!e.entered || e.ageMs < 0) return;
  // Scripted window: the Harrier's gun opens only once it is on station.
  if (e.ageMs < (g.fireFrom || 0)) return;
  // Lifetime volley cap, which is what makes "three shots and out" a data field
  // rather than a special case in the path.
  if (g.volleys != null && e.volleys >= g.volleys) return;

  e.gunMs -= dt;
  if (e.gunMs > 0) return;
  e.gunMs += g.intervalMs;
  e.volleys++;
  fireVolley(e, type, g, player, out, diff);
}

// Emit one volley. `count` particles share a single muzzle heading and are laid
// out around it by shotAim — the same function that lays out the player's
// volleys, which is what keeps a fan a fan on both sides of the fight.
function fireVolley(e, type, g, player, out, diff) {
  const wp = ENEMY_WEAPONS[g.weapon];

  // 'split' rolls per volley rather than per ship, so one crossing wing mixes
  // shots down its own track with shots at the player instead of splitting
  // cleanly into two kinds of ship.
  const atPlayer = !player.dead &&
    (g.aim === 'player' || (g.aim === 'split' && Math.random() < 0.5));
  // Aiming reads the player's position at THIS instant. That is the whole
  // difference from the `intercept` path, which aims once at spawn: an aimed
  // shot has to be dodged after it is fired, not before.
  const base = atPlayer
    ? Math.atan2(player.x - e.x, -(player.y - e.y))
    : e.rot;

  const muzzle = type.dispW * SHOOTER_MUZZLE;
  for (let i = 0; i < g.count; i++) {
    const aim = shotAim(wp, g.count, i, 0);
    const ang = base + aim.ang;
    // Muzzle sits along each shot's OWN heading, so a fan leaves the nose as a
    // fan rather than as a stack of shots at one point.
    spawnEnemyBullet(
      out, g.weapon,
      e.x + Math.sin(ang) * muzzle,
      e.y - Math.cos(ang) * muzzle,
      ang, aim.offX, diff.bulletSpeedMult);
  }
}
