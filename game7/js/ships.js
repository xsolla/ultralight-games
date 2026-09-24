// ============================================================================
// ships.js — the player's fleet as entities: creation, the three behaviour
// zones, launch from the shipyard, targeting and firing (CLAUDE.md §7.5),
// steering and idle patrol, and the soft separation that stops a crowd
// stacking into one sprite. Plain objects on Game.ships, updated in place.
// No drawing, no input, no collision (collide.js).
//
// The medic's own flying is healer.js, which reuses steerShip() below.
// ============================================================================

// ---- Tunable flight knobs ------------------------------------------------------
const PATROL_SPEED    = 0.35;          // fraction of top speed while idling (§7.5)
const PATROL_MIN_HOP  = 44;            // px: a new waypoint is at least this far off
const PATROL_ARRIVE   = 10;            // px: close enough to count as arrived
const PATROL_EASE     = 34;            // px: inside this a ship eases off toward the waypoint
const PATROL_PAUSE_MS = [300, 1200];   // coasting between waypoints, so patrols breathe
const COAST_DECAY     = 1.6;           // 1/s: how fast a coasting hull bleeds speed
const SHIP_ACCEL      = 2.4;           // top speeds per second of acceleration
// Throttle floor while turning away from the heading wanted: a slow-turning hull
// arcs round at this fraction instead of flying straight off at full speed.
const TURN_THROTTLE   = 0.3;

// Patrol boxes are inset from their zone so ships idle clear of the lines
// between zones. Zone 1's top clears the HUD strip.
const ZONE_INSET_X = 18;
const ZONE_INSET_Y = 14;
const ZONE0_TOP    = 66;

const LAUNCH_MS     = 700;   // the scale-in as a ship rises off the pad
const LAUNCH_SCALE0 = 0.3;   // ...starting at this fraction of full size

const SEPARATION_R    = 16;  // px between centres before two ships push apart
const SEPARATION_PUSH = 70;  // px/s at full overlap

const FIELD_MARGIN = 8;      // px a ship keeps from the side edges

// ---- Tunable combat knobs (§7.3, §7.5) -----------------------------------------
const STANDOFF   = 0.85;     // an attacker closes to this fraction of its range, then holds
const LOCK_SLACK = 1.12;     // a locked target may drift this far past range before the lock breaks
const FIRE_TOL   = 6 * DEG;  // nose may be this far off the aim point, beyond the fan's half-spread
const SHIP_HIT_FRAC = 0.42;  // hit radius as a fraction of dispW — the hull, not the plume

let nextShipId = 1;

function behaviourZone(key) {
  return BEHAVIOURS.find((b) => b.key === key).zone;
}

// The box a ship with home zone `z` patrols, in logical px.
function zoneRect(z) {
  return {
    x0: ZONE_INSET_X,
    x1: CANVAS_W - ZONE_INSET_X,
    y0: z === 0 ? ZONE0_TOP : z * ZONE_H + ZONE_INSET_Y,
    y1: (z + 1) * ZONE_H - ZONE_INSET_Y,
  };
}

// Whether a point lies in zone `z`'s third of space (the real third, not the
// inset patrol box).
function inZone(y, z) {
  return y >= z * ZONE_H && y < (z + 1) * ZONE_H;
}

// "Visible" is the centre inside the viewport (§7.1): enemies still flying in
// from beyond an edge cannot be targeted yet.
function onScreen(e) {
  return e.x >= 0 && e.x <= CANVAS_W && e.y >= 0 && e.y <= CANVAS_H;
}

// Where a finished order leaves the planet: the top edge of the build button,
// so the ship visibly comes out of the control that ordered it.
function launchPoint() {
  const b = LAYOUT.BUILD_BTN;
  return { x: b.x + b.size / 2, y: b.y - 2 };
}

function createShip(order) {
  const p = launchPoint();
  const medic = order.kind === 'healer';
  const spec = medic ? HEALER : HULLS[order.hull];
  const maxHp = medic ? HEALER.hp : Math.round(spec.hp * BASE.HP);
  const dispW = spec.dispW * SIZE_SCALE.ship;
  return {
    id: nextShipId++,
    kind: order.kind,                       // 'ship' | 'healer'
    hull: medic ? -1 : order.hull,
    gun: medic ? -1 : order.gun,
    level: medic ? 0 : order.level,
    row: spec.row,                          // interceptor_atlas.png row
    behaviour: START_BEHAVIOUR,
    x: p.x, y: p.y,
    heading: 0,                             // radians; 0 is up the screen
    speed: spec.speed,                      // leaves the pad at full thrust
    topSpeed: spec.speed,
    turn: spec.turn * DEG,                  // radians/s
    dispW,
    r: dispW * SHIP_HIT_FRAC,
    hp: maxHp, maxHp,
    wp: null,                               // current waypoint {x, y}
    pauseMs: 0,
    // True while flying to its home zone rather than patrolling it — after a
    // launch, a behaviour change, or a chase that took it out of its zone.
    dash: true,
    target: null,                           // the enemy or meteor it is locked on
    fireCd: 0,                              // ms until the gun may fire again
    launchMs: 0,
    animMs: Math.random() * 2000,           // desynchronises engine flicker and the Fury's sweep
    healTarget: 0,                          // medic only: id being repaired
    fade: 1,                                // medic only: 1 -> 0 as it disappears
    dead: false,
  };
}

// 0..1 through the scale-in after leaving the pad.
function launchScale(s) {
  const k = Math.min(1, s.launchMs / LAUNCH_MS);
  return LAUNCH_SCALE0 + (1 - LAUNCH_SCALE0) * (1 - Math.pow(1 - k, 3));
}

function launched(s) {
  return s.launchMs >= LAUNCH_MS;
}

// A behaviour change is one of the lock's break conditions (§7.5).
function setBehaviour(s, key) {
  s.behaviour = key;
  s.wp = null;
  s.pauseMs = 0;
  s.dash = true;
  s.target = null;
}

// Turn toward (tx, ty) at the hull's turn rate and fly its heading at
// `speedFrac` of top speed. Ships always fly their nose — there is no strafing —
// so a Warhammer visibly swings round where an Interceptor snaps.
function steerShip(s, tx, ty, speedFrac, dt) {
  const want = Math.atan2(tx - s.x, -(ty - s.y));
  turnToward(s, want, dt);
  let d = want - s.heading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  thrust(s, s.topSpeed * speedFrac * Math.max(TURN_THROTTLE, Math.cos(d)), dt);
}

function turnToward(s, want, dt) {
  let d = want - s.heading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const maxTurn = s.turn * dt / 1000;
  s.heading += clamp(d, -maxTurn, maxTurn);
}

function thrust(s, target, dt) {
  const acc = s.topSpeed * SHIP_ACCEL * dt / 1000;
  s.speed += clamp(target - s.speed, -acc, acc);
  s.x += Math.sin(s.heading) * s.speed * dt / 1000;
  s.y -= Math.cos(s.heading) * s.speed * dt / 1000;
}

// `foes` is every live enemy and meteor; `bullets` is where the fleet's shots go.
function updateShips(ships, dt, foes, bullets) {
  for (const s of ships) {
    s.animMs += dt;
    if (s.launchMs < LAUNCH_MS) s.launchMs += dt;
    if (s.kind !== 'ship' || s.dead) continue;
    s.fireCd = Math.max(0, s.fireCd - dt);
    if (launched(s)) acquire(s, foes);
    if (s.target) engage(s, dt, bullets);
    else patrol(s, dt);
  }
  separate(ships, dt);
  for (const s of ships) keepOnField(s);
}

// ---- Targeting (§7.5) ----------------------------------------------------------
// The behaviour's own rule: whether it would pick this foe. `slack` loosens the
// range test for a foe already locked, so a target hovering on the edge of range
// does not flicker in and out of the lock.
function ruleAllows(s, e, slack) {
  if (s.behaviour === 'aggressive') return true;
  const inRange = Math.hypot(e.x - s.x, e.y - s.y) <= gunRange(s.gun) * slack;
  if (s.behaviour === 'balanced') return inRange;
  return inRange && e.y >= ZONE_H;   // defensive: the lower two-thirds of space only
}

// The home-zone rule, for every behaviour: a foe inside the ship's own third is
// fair game even out of range — the ship flies at it.
function homeAllows(s, e) {
  return inZone(e.y, behaviourZone(s.behaviour));
}

// Keep the lock while the target lives, is on screen and still satisfies one of
// the two rules; otherwise pick the closest foe the behaviour's own rule allows,
// and only if there is none, the closest one in the home zone.
function acquire(s, foes) {
  const t = s.target;
  if (t && !t.dead && onScreen(t) && (ruleAllows(s, t, LOCK_SLACK) || homeAllows(s, t))) return;
  s.target = closest(s, foes, (e) => ruleAllows(s, e, 1)) || closest(s, foes, (e) => homeAllows(s, e));
}

function closest(s, foes, ok) {
  let best = null, bestD = Infinity;
  for (const e of foes) {
    if (e.dead || !e.active || !onScreen(e) || !ok(e)) continue;
    const d = (e.x - s.x) * (e.x - s.x) + (e.y - s.y) * (e.y - s.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

// Close to STANDOFF of range, then hold and fire. Balanced and Defensive ships
// never leave their own third to do it; Aggressive ones go wherever the target is.
// Aim leads the target by the bullet's flight time (first order), since at these
// bullet speeds a shot at where a Lancer IS arrives where it WAS.
function engage(s, dt, bullets) {
  const t = s.target;
  const range = gunRange(s.gun);
  const d = Math.hypot(t.x - s.x, t.y - s.y);
  const tof = d / gunBulletSpeed(s.gun);
  const ax = t.x + t.vx * tof, ay = t.y + t.vy * tof;
  const aim = Math.atan2(ax - s.x, -(ay - s.y));

  let moving = false;
  if (d > range * STANDOFF) {
    let mx = t.x, my = t.y;
    if (s.behaviour !== 'aggressive') {
      const z = zoneRect(behaviourZone(s.behaviour));
      mx = clamp(mx, z.x0, z.x1);
      my = clamp(my, z.y0, z.y1);
    }
    if (Math.hypot(mx - s.x, my - s.y) > PATROL_ARRIVE) {
      steerShip(s, mx, my, 1, dt);
      moving = true;
    }
  }
  if (!moving) {
    turnToward(s, aim, dt);
    thrust(s, 0, dt);
  }
  s.wp = null;

  let off = aim - s.heading;
  off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
  if (s.fireCd <= 0 && d <= range && off <= gunHalfSpread(s.gun, s.level) + FIRE_TOL) {
    const nose = SpriteKit.hullHeight(s.row, s.dispW) / 2;
    fireVolley(bullets, s.gun, s.level,
               s.x + Math.sin(s.heading) * nose, s.y - Math.cos(s.heading) * nose,
               s.heading, s.animMs);
    s.fireCd = gunIntervalMs(s.gun, s.level);
    // Sounded at the trigger, the gun's own cadence: one report per volley.
    Sound.play(GUNS[s.gun].sfx);
  }
}

// ---- Patrol ------------------------------------------------------------------
// Idle flight: wander between random waypoints inside the home zone, easing in
// and coasting briefly at each. A ship outside its zone dashes back first.
function patrol(s, dt) {
  const z = zoneRect(behaviourZone(s.behaviour));
  const inside = s.x >= z.x0 && s.x <= z.x1 && s.y >= z.y0 && s.y <= z.y1;
  if (!inside && !s.dash) { s.dash = true; s.wp = null; }
  if (s.dash && inside) s.dash = false;

  if (!s.wp) {
    if (s.pauseMs > 0) {
      s.pauseMs -= dt;
      s.speed *= Math.exp(-COAST_DECAY * dt / 1000);
      thrust(s, s.speed, dt);
      return;
    }
    s.wp = pickWaypoint(s, z);
  }

  const dist = Math.hypot(s.wp.x - s.x, s.wp.y - s.y);
  if (dist < PATROL_ARRIVE) {
    s.wp = null;
    s.pauseMs = s.dash ? 0 : randRange(PATROL_PAUSE_MS);
    return;
  }
  const frac = s.dash ? 1 : PATROL_SPEED * Math.min(1, 0.35 + dist / PATROL_EASE);
  steerShip(s, s.wp.x, s.wp.y, frac, dt);
}

function pickWaypoint(s, z) {
  let best = null;
  for (let i = 0; i < 6; i++) {
    const p = { x: z.x0 + Math.random() * (z.x1 - z.x0), y: z.y0 + Math.random() * (z.y1 - z.y0) };
    best = p;
    if (Math.hypot(p.x - s.x, p.y - s.y) >= PATROL_MIN_HOP) break;
  }
  return best;
}

// Pairwise push-apart. O(n^2), which is fine for a fleet of dozens and keeps
// the rule readable; revisit with a grid only if fleets get into the hundreds.
function separate(ships, dt) {
  const push = SEPARATION_PUSH * dt / 1000;
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= SEPARATION_R * SEPARATION_R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const k = (1 - d / SEPARATION_R) * push / d;
      a.x -= dx * k; a.y -= dy * k;
      b.x += dx * k; b.y += dy * k;
    }
  }
}

// Space ends at the side edges, the top, and the horizon. A ship still rising
// off the pad is below the horizon by design and is left alone until it clears.
function keepOnField(s) {
  s.x = clamp(s.x, FIELD_MARGIN, CANVAS_W - FIELD_MARGIN);
  if (s.y < FIELD_MARGIN) s.y = FIELD_MARGIN;
  if (launched(s) && s.y > LAYOUT.HORIZON - FIELD_MARGIN) s.y = LAYOUT.HORIZON - FIELD_MARGIN;
}

// The ship closest to a logical point within `radius`, or null. Ships are small
// and moving, so a tap picks the nearest one inside a generous radius rather
// than demanding a hit on the sprite (§8). Medics are not pickable: they have
// no orders to give.
function shipNear(ships, x, y, radius) {
  let best = null, bestD = radius;
  for (const s of ships) {
    if (s.kind !== 'ship' || s.dead) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}
