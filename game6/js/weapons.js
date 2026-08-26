// ============================================================================
// weapons.js — projectile geometry and projectile motion. Pure functions over
// plain bullet objects and the WEAPONS / ENEMY_WEAPONS tables; holds no state of
// its own.
//
// Decides WHERE a volley's particles go and HOW they travel, for BOTH sides:
// a player shot and an enemy shot are the same entity flying the same way out of
// the same atlas, and differ only in which table tunes them. It does not decide
// WHEN to fire (the player's gun cadence is player.js, the enemies' is
// shooters.js), does not read input, does not draw, and does not resolve hits.
//
// Angle convention throughout: 0 is straight up the screen and positive turns
// clockwise (screen coords, +y down). Sprites are authored nose-up, so a shot's
// heading is also its draw rotation.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// Hard ceiling on live projectiles. Level-5 Lightning and Fiery Fury together
// are the realistic worst case (~50 alive); this is well clear of that and only
// exists so a future rapid-fire weapon can't uncap the fill rate.
const BULLET_MAX = 180;
// The same ceiling for incoming fire, on its own array and deliberately lower.
// The realistic worst case is a Reaver chain plus a Corsair wing, which is ~14
// guns at roughly one shot a second each against shots that cross the screen in
// two to three seconds — call it 40 alive. Anything approaching this figure is
// a screen the player cannot read, so the cap doubles as a bug alarm.
const ENEMY_BULLET_MAX = 90;
// How far past the canvas a bullet's tip travels before it is culled. Bullets
// are anchored at the tip with the trail BEHIND them, so this must exceed the
// longest projectile's on-screen length (~29px at dispW 16) or trails would pop
// out of existence while still visible.
const BULLET_CULL_MARGIN = 48;

// Triangle wave over `p`: 0 at p=0, 1 at p=0.5, back to 0 at p=1. Used to walk
// the Fiery Fury sweep back and forth instead of snapping at the end of a fan.
function triangle(p) {
  const f = p - Math.floor(p);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

// Aim for emission `i` of a `n`-particle volley. Returns a heading and a
// sideways offset measured perpendicular to that heading, both of which the
// caller applies at the muzzle.
//
// `sweepPhase` is the firer's running sweep position and only matters to the
// 'sweep' pattern; it is passed in rather than stored so this stays pure.
function shotAim(weapon, n, i, sweepPhase) {
  // Universal rule, ahead of any pattern: level 1 is a single shot dead ahead
  // for every weapon in the game.
  if (n <= 1) return { ang: 0, offX: 0 };

  const spread = (weapon.spreadDeg || 0) * DEG;

  switch (weapon.pattern) {
    case 'fan':
      // Even distribution across the weapon's FIXED total spread, so the outer
      // shots always sit on the edges of the fan regardless of level. Note this
      // means even levels have no shot dead ahead (level 2 Lightning is +/-45
      // degrees with a hole up the middle) — that is the intended reading of
      // "spread evenly along the angle". Scale `spread` by (n-1)/4 here if that
      // ever needs to open up with level instead.
      return { ang: -spread / 2 + (i * spread) / (n - 1), offX: 0 };

    case 'parallel':
      // No spread at all: a centred column of parallel shots. Concentrated
      // single-target damage, which is what keeps it distinct from the fans.
      return { ang: 0, offX: (i - (n - 1) / 2) * weapon.spacing };

    case 'sweep':
      // The angle is a function of the firer's sweep phase, NOT of `i`, so the
      // barrel keeps walking across volley boundaries rather than restarting
      // each volley. That continuity is the whole gatling read.
      return { ang: -spread / 2 + spread * triangle(sweepPhase), offX: 0 };
  }

  return { ang: 0, offX: 0 };
}

// The table a bullet's `w` indexes. One flag rather than two entity types: the
// two sides share the atlas, the motion, the animation and the cull rules, and
// differ only in where they are tuned. render.js and collide.js both go through
// this so neither has to know which array it was handed.
function bulletWeapon(b) {
  return (b.foe ? ENEMY_WEAPONS : WEAPONS)[b.w];
}

// Append one player projectile travelling on `ang` from the muzzle at (x, y).
function spawnBullet(out, weaponIdx, x, y, ang, offX) {
  pushBullet(out, false, weaponIdx, WEAPONS[weaponIdx].speed, x, y, ang, offX);
}

// The same, from an enemy gun. `speedMult` is the difficulty's incoming-fire
// dial and is applied here rather than baked into the table, so one table row
// serves all three difficulties.
function spawnEnemyBullet(out, weaponIdx, x, y, ang, offX, speedMult) {
  pushBullet(out, true, weaponIdx,
             ENEMY_WEAPONS[weaponIdx].speed * speedMult, x, y, ang, offX);
}

function pushBullet(out, foe, weaponIdx, speed, x, y, ang, offX) {
  if (out.length >= (foe ? ENEMY_BULLET_MAX : BULLET_MAX)) return;
  const sin = Math.sin(ang);
  const cos = Math.cos(ang);
  out.push({
    w: weaponIdx,
    foe,
    // offX is perpendicular to the heading, so an offset column stays square to
    // its own line of travel rather than to the screen.
    x: x + offX * cos,
    y: y + offX * sin,
    vx: sin * speed,     // logical px/s
    vy: -cos * speed,    // logical px/s; up the screen is -y
    ang,
    // Random starting phase so the particles in one volley don't pulse in
    // lockstep, which reads as a single flashing object rather than several.
    animMs: Math.random() * BULLET_FRAMES.length * ANIM.BULLET_FRAME_MS,
  });
}

// Advance every projectile and drop the ones that have left the playfield.
// Reverse loop so splicing can't skip an entry.
function updateBullets(bullets, dt) {
  const sec = dt / 1000;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * sec;
    b.y += b.vy * sec;
    b.animMs += dt;
    if (b.y < -BULLET_CULL_MARGIN || b.y > CANVAS_H + BULLET_CULL_MARGIN ||
        b.x < -BULLET_CULL_MARGIN || b.x > CANVAS_W + BULLET_CULL_MARGIN) {
      bullets.splice(i, 1);
    }
  }
}

// The atlas frame this projectile shows right now.
function bulletFrame(b) {
  const i = Math.floor(b.animMs / ANIM.BULLET_FRAME_MS) % BULLET_FRAMES.length;
  return BULLET_FRAMES[i];
}
