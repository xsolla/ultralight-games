// ============================================================================
// shooters.js — the armed enemies' guns (CLAUDE.md §7.6): a first shot
// ENEMY_FIRE_DELAY_MS after entering the screen, each type's own cadence (and
// the Stalker's burst), aim at
// the nearest player ship, and facing — travel direction normally, the aim
// while firing. Always the player's own guns at level 1. Holds fire when no
// ship is alive to aim at. Pure functions over Game.enemies; no drawing, no
// movement (enemies.js), no hit tests (collide.js).
// ============================================================================

// ---- Tunables --------------------------------------------------------------
const ENEMY_TURN  = 200 * DEG;   // rad/s an armed hull turns
const AIM_LEAD_MS = 550;         // it swings onto its aim this long before a shot
const MUZZLE_FRAC = 0.4;         // muzzle distance from centre, as a fraction of dispW

// The nearest ship worth shooting. Medics are never picked on purpose (§7.9),
// and a ship still rising off the pad is not on the field yet.
function nearestShipTarget(ships, x, y) {
  let best = null, bestD = Infinity;
  for (const s of ships) {
    if (s.dead || s.kind !== 'ship' || !launched(s)) continue;
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

function updateShooters(enemies, ships, dt, bullets) {
  for (const e of enemies) {
    const type = ENEMY_TYPES[e.t];
    if (!type.shoots || e.dead || !e.active) continue;
    const g = type.gun;
    // Off screen it neither aims nor fires: a shot from beyond the edge would be
    // one the player never saw coming.
    const visible = onScreen(e);
    const target = visible ? nearestShipTarget(ships, e.x, e.y) : null;
    const aiming = target && (e.fireMs < AIM_LEAD_MS || e.burstLeft > 0);
    const want = aiming ? Math.atan2(target.x - e.x, -(target.y - e.y))
               : Math.hypot(e.vx, e.vy) > 1 ? Math.atan2(e.vx, -e.vy) : e.rot;
    let d = want - e.rot;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.rot += clamp(d, -ENEMY_TURN * dt / 1000, ENEMY_TURN * dt / 1000);

    // The gun's clock only runs on screen, so "1 s after it appears" means after
    // the player can first see it — not after it spawned beyond the edge.
    if (!visible) continue;
    if (e.burstLeft > 0) {
      e.burstMs -= dt;
      if (e.burstMs <= 0) {
        if (target) shoot(e, g, bullets);
        e.burstLeft--;
        e.burstMs = g.burstGapMs;
      }
      continue;
    }
    e.fireMs -= dt;
    if (e.fireMs > 0) continue;
    e.fireMs += g.everyMs;
    if (!target) continue;
    shoot(e, g, bullets);
    if (g.burst) { e.burstLeft = g.burst - 1; e.burstMs = g.burstGapMs; }
  }
}

// Down its own nose: the hull has swung onto the aim over AIM_LEAD_MS, so the
// shot goes where the ship was when the turn began — dodgeable, never a snap.
function shoot(e, g, bullets) {
  const m = e.dispW * MUZZLE_FRAC;
  fireVolley(bullets, g.gun, 1, e.x + Math.sin(e.rot) * m, e.y - Math.cos(e.rot) * m, e.rot, e.animMs);
  Sound.play('enemyFire');
}
