// ============================================================================
// collide.js — hit tests and damage resolution (CLAUDE.md §7.4): bullets on
// enemies and meteors, enemy bullets on ships, rams, and bodies reaching the
// planet. It applies HP and marks the dead, then REPORTS what happened in an
// events object; turning that into money, explosions, sound and shake is
// game.js's job. No drawing, no spawning.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// How deep into the atmosphere a body gets before it counts as reaching the
// planet, as a fraction of its own radius past the surface.
const PLANET_CONTACT = 0.3;

function newCollisionEvents() {
  return { kills: [], shipHits: [], rams: [], planet: [] };
}

// Did a bullet moving from (px, py) to (x, y) pass within r of (cx, cy)? The
// whole segment is tested, so a 600 px/s Dagger cannot step over a 10 px alien
// between two frames.
function segmentHits(px, py, x, y, cx, cy, r) {
  const dx = x - px, dy = y - py;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - px) * dx + (cy - py) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = px + dx * t - cx, qy = py + dy * t - cy;
  return qx * qx + qy * qy <= r * r;
}

// The fleet's shots. One bullet, one hit, gone: bullets never pierce.
function resolveBulletHits(bullets, foes, ev) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (const f of foes) {
      if (f.dead || !f.active) continue;
      if (!segmentHits(b.px, b.py, b.x, b.y, f.x, f.y, f.r)) continue;
      f.hp -= DAMAGE.BULLET;
      bullets.splice(i, 1);
      if (f.hp <= 0) { f.dead = true; ev.kills.push(f); }
      break;
    }
  }
}

// Incoming fire. It can hit the medic too — the medic is never AIMED at (§7.9),
// but a shot does not know who it was meant for.
function resolveEnemyBulletHits(bullets, ships, ev) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (const s of ships) {
      if (s.dead || !launched(s) || s.hp <= 0) continue;
      if (!segmentHits(b.px, b.py, b.x, b.y, s.x, s.y, s.r)) continue;
      s.hp -= DAMAGE.BULLET;
      bullets.splice(i, 1);
      ev.shipHits.push({ ship: s, row: b.row, x: b.x, y: b.y });
      break;
    }
  }
}

// Ships against bodies. A collision is an event, not a state: the pair then
// sits out CONTACT_CD_MS, and the ship is pushed clear, so a surviving Bulwark or
// a meteor cannot grind a hull down frame after frame.
function resolveRams(ships, foes, ev) {
  for (const s of ships) {
    if (s.dead || !launched(s) || s.hp <= 0) continue;
    for (const f of foes) {
      if (f.dead || !f.active || f.contact[s.id]) continue;
      const dx = s.x - f.x, dy = s.y - f.y;
      const reach = s.r + f.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const meteor = f.kind === 'meteor';
      s.hp -= meteor ? DAMAGE.METEOR_TO_SHIP : DAMAGE.RAM;
      f.hp -= meteor ? DAMAGE.SHIP_TO_METEOR : DAMAGE.RAM;
      f.contact[s.id] = DAMAGE.CONTACT_CD_MS;
      const d = Math.sqrt(d2) || 1;
      s.x = f.x + dx / d * reach;
      s.y = f.y + dy / d * reach;
      ev.rams.push({ ship: s, foe: f });
      if (f.hp <= 0) { f.dead = true; ev.kills.push(f); }
      if (s.hp <= 0) break;
    }
  }
}

// Bodies reaching the planet: the planet takes the damage and the body is gone,
// with no reward (§7.4).
function resolvePlanetHits(foes, ev) {
  for (const f of foes) {
    if (f.dead || !f.active) continue;
    const d = Math.hypot(f.x - PLANET_CX, f.y - PLANET_CY);
    if (d > LAYOUT.PLANET_R + f.r * (1 - PLANET_CONTACT)) continue;
    f.dead = true;
    ev.planet.push(f);
  }
}
