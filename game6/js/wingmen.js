// ============================================================================
// wingmen.js — the escort entity model: two hulls that fly formation on the
// player and shoot alongside them for a fixed time. Pure functions over plain
// objects; holds no state of its own (the live list is Game.wingmen).
//
// It owns their formation flying and their gun cadence, the way player.js owns
// the player's. Where the shots go is still weapons.js. It does not draw, and it
// does not decide when a wing is granted — that is the bonus, in game.js.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
const WINGMAN_MS      = 10000;  // how long a wing lasts, ms
const WINGMAN_COUNT   = 2;      // one either side
const WINGMAN_DISPW   = 27;     // logical px wide against the player's 42-46, so
                                // the escort never competes with the hull it is
                                // escorting for the eye
const WINGMAN_SIDE    = 31;     // px out to each side of the player
const WINGMAN_BACK    = 15;     // px behind, so the player's nose stays ahead
// 1/s follow stiffness. Deliberately looser than the player's own pointer lag
// (16): a wing that tracks as tightly as the ship reads as three sprites bolted
// to one object, and the slight trail is the whole formation-flying look.
const WINGMAN_LAG     = 9;
// Warning blink before they leave, so the wing running out is something the
// player sees coming rather than something they notice afterwards.
const WINGMAN_WARN_MS  = 2000;
const WINGMAN_BLINK_MS = 130;

// Grant a wing. Everything about it is rolled ONCE here and shared: one hull for
// both, one weapon for both. Rolling per wingman would give the player a
// mismatched pair that reads as two unrelated pickups, and the point of the
// bonus is that a squadron arrives.
//
// Re-catching REPLACES rather than stacks — otherwise a lucky run ends up flying
// a wall of escorts — and it re-rolls, so a second wing is a fresh draw rather
// than a timer extension.
function spawnWingmen(list, player) {
  const ship = Math.floor(Math.random() * SHIPS.length);
  const weapon = Math.floor(Math.random() * WEAPONS.length);
  list.length = 0;

  for (let i = 0; i < WINGMAN_COUNT; i++) {
    // Evenly spaced either side of the player: -1 and +1 for a pair, and still
    // sensible if WINGMAN_COUNT ever grows.
    const side = WINGMAN_COUNT === 1 ? 0
      : -1 + (2 * i) / (WINGMAN_COUNT - 1);
    list.push({
      ship, weapon, side,
      // Born ON the player and flying out to station, so a wing arrives as
      // something that peeled off the ship rather than as two sprites blinking
      // into existence beside it.
      x: player.x,
      y: player.y,
      ms: WINGMAN_MS,
      animMs: Math.random() * FLIGHT_FRAMES.normal.length * ANIM.SHIP_FRAME_MS,
      // Staggered so the pair does not fire as one double-shot.
      fireMs: (i / WINGMAN_COUNT) * WEAPONS[weapon].interval,
    });
  }
}

// Fly the wing and run its guns. `firing` is the player's own trigger state, so
// the escort shoots when the player does — it is an extension of their gun, not
// an autonomous ally, and on touch that means it simply always fires.
function updateWingmen(list, dt, player, firing, out) {
  const sec = dt / 1000;
  // Exponential follow, framed so the stiffness is per second rather than per
  // frame — the same form updatePlayer and the scroll ease use.
  const k = 1 - Math.exp(-WINGMAN_LAG * sec);

  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    // A wrecked ship has nothing to escort, and a wing that outlived its pilot
    // would go on shooting over the wreck.
    w.ms -= dt;
    if (w.ms <= 0 || player.dead) { list.splice(i, 1); continue; }

    w.x += (player.x + w.side * WINGMAN_SIDE - w.x) * k;
    w.y += (player.y + WINGMAN_BACK - w.y) * k;
    w.animMs += dt;

    // ALWAYS level 1 — one shot dead ahead, whatever the player's own level is.
    // shotAim already returns exactly that for a count of 1, as a universal rule
    // ahead of any pattern, so there is nothing to special-case here.
    const wp = WEAPONS[w.weapon];
    if (w.fireMs > 0) w.fireMs = Math.max(0, w.fireMs - dt);
    if (firing && w.fireMs === 0) {
      w.fireMs = wp.interval;
      spawnBullet(out, w.weapon, w.x,
                  w.y - Atlas.hullHeight(w.ship, WINGMAN_DISPW) / 2, 0, 0);
    }
  }
}

// Whether the hull is on the dark half of its expiry blink. This is a countdown
// the player can act on — the wing is about to leave — and not damage feedback,
// which is why it survives while the player's own post-hit blink does not.
//
// It blinks DOWN rather than out: the player is still flying formation with it
// and has to be able to see it for the whole warning.
function wingmanBlinkOff(w) {
  return w.ms < WINGMAN_WARN_MS &&
         Math.floor(w.ms / WINGMAN_BLINK_MS) % 2 === 1;
}

// The atlas frame this escort shows right now. Wingmen never carry the turbo
// burst — the boost is the player's ship, not the wing's.
function wingmanFrame(w) {
  const seq = FLIGHT_FRAMES.normal;
  return seq[Math.floor(w.animMs / ANIM.SHIP_FRAME_MS) % seq.length];
}
