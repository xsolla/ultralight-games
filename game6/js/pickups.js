// ============================================================================
// pickups.js — the caught-bonus entity model: what a drifting bubble is, how it
// moves, when one is dropped and when it is gone. Pure functions over plain
// objects; holds no state of its own (the live list is Game.pickups).
//
// It does NOT decide what a bonus does when caught. That is BONUS_EFFECTS in
// game.js, for exactly the reason collide.js reports a kill and game.js turns it
// into an explosion: this file would otherwise have to reach into the player,
// the wingmen and the explosion list to do its job. It does not draw either.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
// Outer radius of the bubble, and so also its catch radius. 15 makes a 30px
// sphere — the size of a small enemy, which is what a thing you are meant to
// steer into wants to be.
const PICKUP_R = 15;
// Downward drift, logical px/s. Slower than every enemy in the game on purpose:
// a bonus that falls at combat speed has to be chased, and chasing it means
// flying through whatever killed the enemy that dropped it.
const PICKUP_FALL = 62;
// Lateral wobble. A bubble that falls in a straight line reads as a token; the
// sway is most of what sells it as something floating rather than dropping.
const PICKUP_SWAY = 13;      // px either side
const PICKUP_SWAY_HZ = 0.42; // slow — one lazy pass across in ~2.4s
// Fade-out. A bubble pops rather than sinking off the bottom edge, so an
// uncaught one reads as a missed chance instead of as something that scrolled
// away, and the player learns the window has a length.
const PICKUP_LIFE_MS = 9000;
const PICKUP_POP_MS  = 550;   // of that life spent shrinking and thinning
// Hard ceiling on live bubbles. A cleared screen full of drops is already the
// good case; past this the field stops reading.
const PICKUP_MAX = 14;

function makePickup(typeIdx, x, y) {
  const row = BONUSES[typeIdx];
  return {
    t: typeIdx,
    // Rolled at BIRTH, not when caught: the bubble shows which weapon or which
    // hull it holds, so what it holds has to be decided before it is drawn.
    // Bonuses with nothing to choose carry 0 and never read it.
    arg: row.pick === 'weapon' ? Math.floor(Math.random() * WEAPONS.length)
       : row.pick === 'ship'   ? Math.floor(Math.random() * SHIPS.length)
       : 0,
    x, y,
    x0: x,
    y0: y,
    ageMs: 0,
    // So a pair dropped by one formation does not sway in lockstep.
    phase: Math.random() * TAU,
  };
}

// Position is recomputed from age every frame rather than integrated, the same
// way enemy paths are and for the same reason: no drift can accumulate, and the
// sway stays a pure function of time.
function updatePickups(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.ageMs += dt;
    const s = p.ageMs / 1000;
    p.x = p.x0 + PICKUP_SWAY * Math.sin(PICKUP_SWAY_HZ * TAU * s + p.phase);
    p.y = p.y0 + PICKUP_FALL * s;
    if (p.ageMs >= PICKUP_LIFE_MS || p.y > CANVAS_H + PICKUP_R * 2) {
      list.splice(i, 1);
    }
  }
}

// 0..1 of how much of the bubble is left — 1 for most of its life, falling to 0
// as it pops. render.js scales and fades by this; collide.js ignores it, so a
// bubble is catchable right up to the last frame it is visible.
function pickupFade(p) {
  const left = PICKUP_LIFE_MS - p.ageMs;
  return left >= PICKUP_POP_MS ? 1 : Math.max(0, left / PICKUP_POP_MS);
}

// Weighted pick over the whole table. Weights are relative; the sum is
// arbitrary, exactly as in TRICKLE_PATHS.
function pickBonus() {
  let total = 0;
  for (const b of BONUSES) total += b.w;
  let r = Math.random() * total;
  for (let i = 0; i < BONUSES.length; i++) {
    r -= BONUSES[i].w;
    if (r <= 0) return i;
  }
  return 0;
}

// Roll a dying enemy's drop. `drop` is the per-type chance in ENEMY_TYPES and
// `dropMult` the difficulty's dial, so a generous difficulty is more generous
// with every type at once rather than needing its own table.
function maybeDropBonus(list, e, diff) {
  if (list.length >= PICKUP_MAX) return;
  if (Math.random() >= ENEMY_TYPES[e.t].drop * diff.dropMult) return;
  list.push(makePickup(pickBonus(), e.x, e.y));
}
