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
      const type = ENEMY_TYPES[e.t];
      const r = Atlas.enemyHitRadius(type.dispW, type.disc);
      if (segPointDistSq(x0, y0, b.x, b.y, e.x, e.y) > r * r) continue;

      e.hp -= bulletWeapon(b).damage;
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
    const r = Atlas.enemyHitRadius(ENEMY_TYPES[e.t].dispW, ENEMY_TYPES[e.t].disc);
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

// Resolve drifting bonuses against the ship. Returns the ones caught this frame
// and removes them from the list; game.js applies their effects, the same
// division of labour the two damage resolvers use.
//
// A circle test, not the segment test the projectiles get: a bubble drifts at
// 62px/s, which is 1 logical px in a clamped frame, so there is nothing to
// tunnel through. And the whole bubble catches, not just its picture — a
// pickup that has to be hit precisely is a pickup that gets missed.
//
// A wrecked ship catches nothing, but an INVULNERABLE one catches everything:
// the grace period is combat grace, and a player who cannot collect during it
// would be punished twice for one hit.
function resolveCatches(player, pickups) {
  const caught = [];
  if (player.dead || player.hits <= 0) return caught;
  const pr = playerHitRadius(player);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const b = pickups[i];
    if (!circlesOverlap(player.x, player.y, pr, b.x, b.y, PICKUP_R)) continue;
    caught.push(b);
    pickups.splice(i, 1);
  }
  return caught;
}

// Resolve incoming enemy fire against the ship. Returns the projectile that
// landed the damage — which the caller turns into the impact flash, in that
// shot's own colour — or null. At most one can ever land in a frame: the first
// one sets the grace period and the rest of the frame's shots are absorbed by
// it, so a wall of fire costs exactly one armour layer.
//
// Death is NOT reported and is not decided here; game.js checks the counter once
// a frame, so every damage source reaches death the same way.
//
// The segment test is the same one player fire gets, for the same reason: at the
// 100ms dt clamp a 265px/s shot advances 26 logical px, which is wider than the
// player's ~12px hit circle, so a point test would let shots tunnel through the
// hull on a stuttering frame.
function resolveEnemyBulletHits(player, bullets, dt) {
  if (player.hits <= 0) return null;
  const sec = dt / 1000;
  const pr = playerHitRadius(player);
  let landed = null;

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const x0 = b.x - b.vx * sec, y0 = b.y - b.vy * sec;
    if (segPointDistSq(x0, y0, b.x, b.y, player.x, player.y) > pr * pr) continue;

    // The shot always stops on the hull, invulnerable or not. Letting it pass
    // through during the grace period would make the grace a free screen-clear
    // and would look wrong besides; absorbing it costs the player nothing.
    bullets.splice(i, 1);
    if (player.invulnMs > 0) continue;

    for (let n = 0; n < bulletWeapon(b).damage; n++) damagePlayer(player);
    player.invulnMs = PLAYER_INVULN_MS;
    landed = b;
  }
  return landed;
}
