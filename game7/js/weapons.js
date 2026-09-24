// ============================================================================
// weapons.js — gun maths and projectiles: the absolute numbers a GUNS row works
// out to at a level, the volley patterns (fan / group / sweep), and the bullet
// update. Pure functions over plain objects on Game.bullets and
// Game.enemyBullets; no drawing, no collision (collide.js), and no decision
// about WHEN to fire — ships.js and shooters.js pull the trigger.
// ============================================================================

// ms between trigger pulls. A 'rate' gun (Flame Fury) fires N times faster at
// level N instead of firing more bullets (§7.3).
function gunIntervalMs(gunIdx, level) {
  const g = GUNS[gunIdx];
  return BASE.FIRE_INTERVAL / (g.fireRate * (g.levels === 'rate' ? level : 1));
}

// Bullets per trigger pull.
function gunShots(gunIdx, level) {
  return GUNS[gunIdx].levels === 'count' ? level : 1;
}

function gunBulletSpeed(gunIdx) { return BASE.BULLET_SPEED * GUNS[gunIdx].bulletSpeed; }   // px/s
function gunLifeMs(gunIdx) { return BASE.BULLET_LIFE * GUNS[gunIdx].life; }

// How far a bullet flies before it expires, logical px. This is what the ship AI
// means by "can be reached by its weapon" (§7.3), and it does not depend on level.
function gunRange(gunIdx) {
  return gunBulletSpeed(gunIdx) * gunLifeMs(gunIdx) / 1000;
}

// Half the angle a volley spreads over, radians — how far off the target a
// ship's nose may be and still land the fan on it.
function gunHalfSpread(gunIdx, level) {
  const g = GUNS[gunIdx];
  return g.pattern === 'fan' && gunShots(gunIdx, level) > 1 ? g.spreadDeg * DEG / 2 : 0;
}

// One trigger pull from the muzzle at (x, y) along heading `ang`, into `list`.
// `clockMs` drives Flame Fury's barrel, which sweeps whether or not it is firing,
// so the caller passes its own running clock.
//   fan    — N bullets evenly across spreadDeg; a single shot flies dead ahead
//   group  — N bullets side by side `spacing` px apart, all on the one heading
//   sweep  — one bullet off a barrel walking a triangle wave across spreadDeg
function fireVolley(list, gunIdx, level, x, y, ang, clockMs) {
  const g = GUNS[gunIdx];
  const n = gunShots(gunIdx, level);
  const speed = gunBulletSpeed(gunIdx), life = gunLifeMs(gunIdx);
  const w = g.dispW * SIZE_SCALE.shot;
  const shots = [];
  if (g.pattern === 'fan' && n > 1) {
    for (let i = 0; i < n; i++) shots.push([ang + (-g.spreadDeg / 2 + g.spreadDeg * i / (n - 1)) * DEG, 0]);
  } else if (g.pattern === 'group' && n > 1) {
    for (let i = 0; i < n; i++) shots.push([ang, (i - (n - 1) / 2) * g.spacing]);
  } else if (g.pattern === 'sweep') {
    const ph = (clockMs % g.sweepMs) / g.sweepMs;
    const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;   // -1 .. 1 .. -1
    shots.push([ang + tri * g.spreadDeg / 2 * DEG, 0]);
  } else {
    shots.push([ang, 0]);
  }
  // Group offsets are perpendicular to the heading: (cos, sin) is the right-hand
  // side when (sin, -cos) is forward.
  for (const [a, off] of shots) {
    const bx = x + Math.cos(ang) * off, by = y + Math.sin(ang) * off;
    list.push({ x: bx, y: by, px: bx, py: by, vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed,
                ang: a, row: g.row, w, age: 0, life });
  }
}

// Move every bullet and expire the ones past their lifetime. `px/py` keep the
// previous position, so collide.js can test the whole segment a fast bullet
// crossed this frame instead of tunnelling through a small target.
function updateBullets(list, dt) {
  const s = dt / 1000;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.age += dt;
    if (b.age >= b.life) { list.splice(i, 1); continue; }
    b.px = b.x; b.py = b.y;
    b.x += b.vx * s;
    b.y += b.vy * s;
  }
}
