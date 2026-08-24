// ============================================================================
// collide.js — hit tests and damage resolution. Pure functions over entity
// arrays: no drawing, no input, no spawning, no screen state.
//
// Everything is circle-based. The sprites are a round disc (enemies) and a
// narrow dart (the ship), and a circle is both cheap and the forgiving shape
// this genre wants — a player should never lose armour to a pixel of wingtip.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// Player hit circle as a fraction of the ship's on-screen width. Deliberately
// small: 0.28 puts it at ~12 logical px across a 42-46px sprite, so it covers
// the fuselage and not the wings. This is also what makes CLAUDE.md §7's "ship 1
// has the smallest hitbox" fall out for free — it has the smallest dispW.
const PLAYER_HIT_FRAC = 0.28;

// Distance from a point to a segment, squared. Used instead of a point test for
// projectiles because a stuttering frame (dt is clamped at 100ms) advances a
// 600px/s shot by 60 logical px, which is wider than an enemy's hit circle —
// a point test would let bullets tunnel straight through.
function segPointDistSq(x0, y0, x1, y1, cx, cy) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const px = cx - x0, py = cy - y0;
    return px * px + py * py;
  }
  // Projection of the centre onto the segment, clamped to its ends.
  let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = cx - (x0 + t * dx), py = cy - (y0 + t * dy);
  return px * px + py * py;
}

function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = bx - ax, dy = by - ay, r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

function playerHitRadius(p) {
  return SHIPS[p.ship].dispW * PLAYER_HIT_FRAC;
}

// Resolve projectiles against enemies. A bullet is consumed by the first enemy
// it touches; an enemy at or below 0 hp starts its death fade.
//
// Returns the enemies killed this frame — the callers turn those into
// explosions and, later, score. Reporting the entities rather than a count
// keeps the spawning of effects out of here, which the banner above forbids,
// and `.length` is still the kill count. Empty is the common case.
function resolveBulletHits(bullets, enemies, dt) {
  const sec = dt / 1000;
  const killed = [];

  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    // Where this bullet was at the start of the frame; enemies.js has already
    // moved it, so walk the segment it just travelled.
    const x0 = b.x - b.vx * sec, y0 = b.y - b.vy * sec;

    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei];
      if (enemyDying(e)) continue;
      const r = Atlas.enemyHitRadius(ENEMY_TYPES[e.t].dispW);
      if (segPointDistSq(x0, y0, b.x, b.y, e.x, e.y) > r * r) continue;

      e.hp -= WEAPONS[b.w].damage;
      if (e.hp <= 0 && killEnemy(e)) killed.push(e);
      bullets.splice(bi, 1);
      break;   // one bullet, one enemy
    }
  }
  return killed;
}

// Resolve enemy bodies against the ship. Returns the enemy that landed the hit
// — which the impact also killed, so the caller can explode it — or null.
//
// An enemy only dies when it actually lands damage: if it passes through during
// post-hit invulnerability it survives, so a single hit can't clear the screen
// and the player still has to move off the contact.
function resolvePlayerHits(player, enemies) {
  if (player.invulnMs > 0 || player.hits <= 0) return null;
  const pr = playerHitRadius(player);

  for (const e of enemies) {
    if (enemyDying(e)) continue;
    const r = Atlas.enemyHitRadius(ENEMY_TYPES[e.t].dispW);
    if (!circlesOverlap(player.x, player.y, pr, e.x, e.y, r)) continue;

    // Every damage source in the game is worth exactly one hit (§7); `contact`
    // is read rather than assumed so the table stays the single source of truth.
    for (let i = 0; i < ENEMY_TYPES[e.t].contact; i++) damagePlayer(player);
    player.invulnMs = PLAYER_INVULN_MS;
    killEnemy(e);
    return e;
  }
  return null;
}
