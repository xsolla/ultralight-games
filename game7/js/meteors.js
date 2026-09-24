// ============================================================================
// meteors.js — the meteor entity model (CLAUDE.md §7.7): big, slow, very high
// HP, heading straight for the planet. Colour is size. Plain objects on
// Game.meteors; no drawing, no hit tests (collide.js).
// ============================================================================

// ---- Tunables --------------------------------------------------------------
const METEOR_SPIN     = [8, 30];      // deg/s, either direction
const METEOR_FRAME_MS = [110, 170];   // the brightening pulse's cadence

function spawnMeteor(list, t, wave) {
  const type = METEOR_TYPES[t];
  const dispW = METEOR_W * type.sizeMult * SIZE_SCALE.meteor;
  const en = rollEntry(dispW / 2);
  const x1 = randRange(EXIT_X), y1 = planetSurfaceY(x1);
  const dx = x1 - en.x, dy = y1 - en.y, d = Math.hypot(dx, dy);
  list.push({
    kind: 'meteor',
    t, wave,
    x: en.x, y: en.y,
    vx: dx / d * type.speed, vy: dy / d * type.speed,
    hp: type.hp, maxHp: type.hp,
    dispW,
    r: SpriteKit.asteroidHitRadius(dispW),
    rot: Math.random() * TAU,
    spin: randRange(METEOR_SPIN) * DEG * (Math.random() < 0.5 ? -1 : 1),
    frameMs: randRange(METEOR_FRAME_MS),
    animMs: Math.random() * 1000,
    active: true,
    contact: {},     // ship id -> ms until that ship can ram it again (§7.4)
    dead: false,
  });
}

function updateMeteors(list, dt) {
  const s = dt / 1000;
  for (const m of list) {
    if (m.dead) continue;
    m.animMs += dt;
    m.x += m.vx * s;
    m.y += m.vy * s;
    m.rot += m.spin * s;
    for (const k in m.contact) {
      m.contact[k] -= dt;
      if (m.contact[k] <= 0) delete m.contact[k];
    }
  }
}
