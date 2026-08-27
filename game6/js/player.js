// ============================================================================
// player.js — player ship state, input -> motion, and the armour/weapon model.
// Pure functions over a player object; no drawing, no input event handling
// (that is game.js), no collision.
//
// It owns the gun's CADENCE — when a volley starts and when each of its
// particles leaves — because that is a property of the ship's armament. Where
// those particles go and how they fly belongs to weapons.js.
// ============================================================================

// ---- Tunable flight model (all handling knobs live here) -------------------
const PLAYER_TURBO_MULT   = 2.0;    // speed multiplier during a turbo burst
const PLAYER_TURBO_MS     = 5000;   // burst duration
const PLAYER_POINTER_LAG  = 16;     // 1/s — pointer follow stiffness; higher = snappier
const PLAYER_KEY_ACCEL    = 2600;   // px/s^2 ramp toward full keyboard speed
const PLAYER_KEY_DAMP     = 12;     // 1/s — decay toward rest when no key is held
const PLAYER_START_Y_FRAC = 0.78;   // spawn height as a fraction of the canvas
// Post-hit grace (CLAUDE.md §7). Long enough to fly clear of the enemy that
// just hit you, so one collision cannot drain several armour layers.
// The grace is invisible: the hull does not blink through it. What tells the
// player they were hit is the impact burst and the shake, both of which fire on
// the frame of the blow rather than running on after it.
const PLAYER_INVULN_MS    = 1200;

function createPlayer(shipIdx) {
  return {
    ship: shipIdx,
    x: CANVAS_W / 2,
    y: CANVAS_H * PLAYER_START_Y_FRAC,
    vx: 0,
    vy: 0,              // px/s, keyboard mode only
    turboMs: 0,         // remaining burst time
    animMs: 0,          // engine-animation accumulator
    swapMs: 0,          // ship-swap flash timer, counts down

    // ---- Armament (CLAUDE.md §7) ----
    weapon: 0,          // index into WEAPONS
    // The single counter that is both armour and weapon level. Starts at one
    // full layer, i.e. weapon level 1 with the hull's base durability.
    hits: SHIPS[shipIdx].base,
    invulnMs: 0,        // post-hit grace remaining; nothing is drawn for it
    dead: false,        // wrecked: flight and gun frozen, explosion playing out

    fireMs: 0,          // ms until the next volley may start
    volleyLeft: 0,      // particles still to emit in the current volley
    volleyCount: 0,     // that volley's total, fixed at trigger time
    volleyIndex: 0,     // which particle of it comes next
    volleyGapMs: 0,     // ms between emissions; 0 means all at once
    volleyNextMs: 0,    // countdown to the next emission
    sweepPhase: 0,      // running barrel position for 'sweep' weapons
  };
}

// Weapon level falls out of the hit counter — see the armor/weapon model in
// CLAUDE.md §7. `hits` is capped at base * 5 on heal so this cannot exceed 5,
// but the clamp is kept so a bad write can never index past the pattern rules.
function weaponLevel(p) {
  return Math.min(5, Math.ceil(p.hits / SHIPS[p.ship].base));
}

// One point of damage costs a hit, which costs a weapon level every time it
// empties a layer. Reaching 0 is death, but this does not itself kill: game.js
// checks the counter once per frame and calls killPlayer, so every damage
// source funnels through one place rather than each one remembering to.
function damagePlayer(p) {
  p.hits = Math.max(0, p.hits - 1);
}

// Wreck the ship. Returns true only on the call that actually killed it, so the
// caller can fire the death explosion exactly once — the same contract
// killEnemy has.
//
// Death is a STATE, not a removal: the wreck's explosion plays out over a live
// playfield, so the entity stays around with its flight and gun frozen.
function killPlayer(p) {
  if (p.dead) return false;
  p.dead = true;
  p.hits = 0;
  p.turboMs = 0;   // the engine is what just blew up; drop the burst with it
  return true;
}

// `n` is hits, not layers: the matched-bonus payouts in game.js hand over 1 and
// 2, and on a base-2 hull those are half a layer and a whole one. Paying in the
// counter's own unit rather than in levels is what keeps a heal worth the same
// on every hull — a level is 2 hits on an interceptor and 4 on a green heavy,
// so paying in levels would make the same bubble twice the prize on the ship
// that already has the most armour.
function healPlayer(p, n = 1) {
  // At full armour this rolls into the next weapon level with exactly one hit
  // in the new layer, which is the "upgrade" half of the heal bonus.
  p.hits = Math.min(SHIPS[p.ship].base * 5, p.hits + n);
}

// Current speed in px/s, turbo included.
function playerSpeed(p) {
  return SHIPS[p.ship].speed * (p.turboMs > 0 ? PLAYER_TURBO_MULT : 1);
}

// The atlas frame to draw this instant.
function playerFrame(p) {
  const turbo = p.turboMs > 0;
  const seq = turbo ? FLIGHT_FRAMES.turbo : FLIGHT_FRAMES.normal;
  const step = turbo ? ANIM.TURBO_FRAME_MS : ANIM.SHIP_FRAME_MS;
  return seq[Math.floor(p.animMs / step) % seq.length];
}

function startTurbo(p) {
  // Re-triggering refreshes the full duration rather than stacking.
  p.turboMs = PLAYER_TURBO_MS;
}

// Move to a specific ship, keeping position and turbo state, and carrying the
// weapon level across a hull with different durability (CLAUDE.md §7).
//
// This is what the named-hull bonus calls; cycleShip below is the debug key.
function setShip(p, idx) {
  if (idx === p.ship) {
    // Catching the hull you are already flying is a no-op, but it still flashes
    // — silence would read as the pickup having failed.
    p.swapMs = ANIM.SHIP_SWAP_MS;
    return;
  }
  const level = weaponLevel(p);
  const oldBase = SHIPS[p.ship].base;
  // How far into the current armour layer we are, 1..oldBase.
  const remainder = p.hits - (level - 1) * oldBase;

  p.ship = idx;

  // At 0 hits there is no layer to map, so leave the counter dead rather than
  // letting the formula resurrect the ship with a negative level.
  if (p.hits > 0) {
    const newBase = SHIPS[p.ship].base;
    p.hits = (level - 1) * newBase + clamp(remainder, 1, newBase);
  }

  p.swapMs = ANIM.SHIP_SWAP_MS;
  p.animMs = 0;
}

function cycleShip(p) {
  setShip(p, (p.ship + 1) % SHIPS.length);
}

// Swap the weapon id only — `hits`, and so the weapon level, are untouched.
// This is what the named-weapon bonus calls; cycleWeapon below is the debug key.
function setWeapon(p, idx) {
  p.weapon = idx;
  // Abandon any half-emitted volley, or a staggered swap would finish the old
  // weapon's pattern using the new weapon's particle.
  p.volleyLeft = 0;
  p.fireMs = 0;
}

function cycleWeapon(p) {
  setWeapon(p, (p.weapon + 1) % WEAPONS.length);
}

// Tick the gun and append any projectiles fired this frame to `out`.
// `firing` is the trigger state for this frame; autofire is just holding it.
function updateWeapon(p, dt, firing, out) {
  const wp = WEAPONS[p.weapon];
  if (p.fireMs > 0) p.fireMs = Math.max(0, p.fireMs - dt);

  // Start a volley when the cadence allows. The particle count is committed
  // here, so a level change mid-volley cannot retarget shots already promised.
  if (firing && p.fireMs === 0 && p.volleyLeft === 0 && p.hits > 0) {
    const n = weaponLevel(p);
    p.volleyCount = n;
    p.volleyLeft = n;
    p.volleyIndex = 0;
    // Staggered weapons spread their particles across the whole interval, which
    // is how Fiery Fury fires "in rapid succession" without its trigger cadence
    // changing by level — the §7 constant-fire-rate rule stays intact.
    p.volleyGapMs = wp.stagger ? wp.interval / n : 0;
    p.volleyNextMs = 0;
    p.fireMs = wp.interval;
  }

  if (p.volleyLeft > 0) {
    p.volleyNextMs -= dt;
    // A loop, not an `if`: a long frame must release every particle that came
    // due inside it, or a slow frame would silently swallow shots. With a gap of
    // 0 the whole volley leaves on this pass.
    while (p.volleyLeft > 0 && p.volleyNextMs <= 0) {
      const aim = shotAim(wp, p.volleyCount, p.volleyIndex, p.sweepPhase);
      const dispW = SHIPS[p.ship].dispW;
      // Muzzle is the hull nose, so shots leave the front of the sprite.
      const noseY = p.y - Atlas.hullHeight(p.ship, dispW) / 2;
      spawnBullet(out, p.weapon, p.x, noseY, aim.ang, aim.offX);

      p.sweepPhase += wp.sweepStep || 0;
      p.volleyLeft--;
      p.volleyIndex++;
      // Accumulate rather than reset so the stagger can't drift late.
      p.volleyNextMs += p.volleyGapMs;
    }
  }
}

// `input` is { px, py, pointer, dx, dy } — pointer target in logical px, a flag
// for whether the pointer is the active device, and a -1..1 keyboard axis pair.
function updatePlayer(p, dt, input) {
  const sec = dt / 1000;
  const sp = playerSpeed(p);

  if (input.pointer) {
    // Exponential approach, then clamped to the ship's speed so a pointer jump
    // across the screen still costs travel time — and so turbo is felt on
    // pointer control, not just on the keys.
    const k = 1 - Math.exp(-PLAYER_POINTER_LAG * sec);
    let dx = (input.px - p.x) * k;
    let dy = (input.py - p.y) * k;
    const dist = Math.hypot(dx, dy);
    const maxStep = sp * sec;
    if (dist > maxStep) {
      dx = (dx / dist) * maxStep;
      dy = (dy / dist) * maxStep;
    }
    p.x += dx;
    p.y += dy;
    p.vx = sec > 0 ? dx / sec : 0;   // kept so render.js can bank the hull
    p.vy = 0;
  } else {
    // Keyboard: accelerate toward the held direction, decay toward rest.
    const tvx = input.dx * sp;
    const tvy = input.dy * sp;
    p.vx = approach(p.vx, tvx, input.dx ? PLAYER_KEY_ACCEL * sec : PLAYER_KEY_DAMP * sec * Math.abs(p.vx));
    p.vy = approach(p.vy, tvy, input.dy ? PLAYER_KEY_ACCEL * sec : PLAYER_KEY_DAMP * sec * Math.abs(p.vy));
    p.x += p.vx * sec;
    p.y += p.vy * sec;
  }

  // Clamp to the playfield using the sprite's real on-screen size.
  const hw = SHIPS[p.ship].dispW / 2;
  const hh = Atlas.hullHeight(p.ship, SHIPS[p.ship].dispW) / 2;
  p.x = clamp(p.x, PLAYFIELD.side + hw, CANVAS_W - PLAYFIELD.side - hw);
  p.y = clamp(p.y, PLAYFIELD.top + hh, CANVAS_H - PLAYFIELD.bottom - hh);

  p.animMs += dt;
  if (p.turboMs > 0) p.turboMs = Math.max(0, p.turboMs - dt);
  if (p.swapMs > 0) p.swapMs = Math.max(0, p.swapMs - dt);
  if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dt);
}

// ---- Small shared helpers --------------------------------------------------
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function approach(v, target, maxDelta) {
  const d = target - v;
  if (Math.abs(d) <= maxDelta) return target;
  return v + Math.sign(d) * maxDelta;
}
