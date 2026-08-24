// ============================================================================
// data.js — static gameplay tables. Data only: no behaviour, no drawing.
// Everything the game can spawn or the player can fly is a row in here, so
// adding content never means adding a branch to the update loop.
// ============================================================================

// Which atlas columns belong to which flight mode. The atlas ships 6 frames per
// row: the first four are normal flight (plume growing) and the last two are the
// turbo burst.
//
// `normal` cycles as a ping-pong (0,1,2,3,2,1) rather than a plain 0->3 loop:
// the plume grows monotonically across the four frames, so a linear cycle snaps
// from the biggest flame back to the smallest once per loop. Ping-pong reads as
// a pulsing engine. Swap in [0,1,2,3] here if the linear pop is wanted instead.
const FLIGHT_FRAMES = {
  normal: [0, 1, 2, 3, 2, 1],
  turbo: [4, 5],
};

// The three playable ships, in atlas row order.
//
// `base` is durability in hits and is unused until damage exists — see the
// armor/weapon model in CLAUDE.md §7. NOTE: the values below follow the
// original 3/4/5 spec, but in the current art ship 1 (armoured grey/red, twin
// heavy cannons) reads as the toughest hull while ship 2 (white/green) reads
// mid-weight, which suggests 3/5/4. Unresolved — see CLAUDE.md §10.
//
// `dispW` is on-screen width in logical px. Keep it at or below 48: at 3x
// backing scale that is ~144 device px against 141-155px source frames, i.e.
// roughly 1:1. Larger values upscale the sprite and it goes soft.
//
// `color`/`spark` are the hull's two accent colours, so the wreck a ship leaves
// behind is built from its own paint. MEASURED, not eyeballed: each row's frame
// 0 was hue-clustered over its fully-opaque hull pixels (the plume excluded,
// since that is engine glow rather than hull), and these are the two strongest
// clusters — which is exactly the "blue/orange, grey/red, white/green" the
// atlas notes in CLAUDE.md §6 describe. Format is "r, g, b" so alpha composes
// at draw time, the same convention COLORS.star uses.
const SHIPS = [
  { name: 'Interceptor', base: 3, speed: 300, dispW: 42,
    color: '65, 118, 162',  spark: '227, 141, 74' },   // steel blue + orange
  { name: 'Warhammer',   base: 4, speed: 250, dispW: 46,
    color: '197, 92, 51',   spark: '252, 225, 110' },  // rust red + brass
  { name: 'Verdant',     base: 5, speed: 215, dispW: 46,
    color: '97, 179, 130',  spark: '87, 150, 160' },   // green + pale teal
];

// ---- Wreck palette ---------------------------------------------------------
// The colours the player's death explosion cycles through, on top of the dying
// ship's own two hull accents (explosions.js prepends those). A wreck is a
// stutter of sub-bursts in DIFFERENT colours, so this table is what stops it
// collapsing into one warm blob — which is exactly what happens if the palette
// is only a fire ramp and the ship is one of the warm-hulled two.
//
// Source: the ship's magazine cooking off. Every entry but the first is one row
// of projectiles_atlas.png — the player's own five weapon particles — measured
// the same way the hull colours were, off frame 2, `color` being the particle
// body and `spark` its highlight. Mystic and Lightning are single-hued in the
// art, so their spark is that hue lightened toward white.
//
// `row` picks which alien silhouette the sub-burst tints. Fixed per entry
// rather than random, so the tint cache in atlas.js stays bounded at one canvas
// per entry. A new debris colour is a new row here and nothing else.
const WRECK_PALETTE = [
  { color: '252, 225, 110', spark: '255, 251, 235', row: 3 },  // brass, white-hot
  { color: '38, 88, 167',   spark: '111, 242, 252', row: 0 },  // Spark Gun
  { color: '102, 202, 76',  spark: '238, 248, 169', row: 1 },  // Plasma Gun
  { color: '187, 54, 193',  spark: '229, 138, 233', row: 4 },  // Mystic Dagger
  { color: '224, 103, 30',  spark: '252, 237, 97',  row: 2 },  // Fiery Fury
  { color: '198, 176, 54',  spark: '246, 240, 190', row: 3 },  // Lightning Gun
];

// Projectile particle animation, one row of projectiles_atlas.png per weapon.
// Ping-pong for the same reason FLIGHT_FRAMES.normal is: the five frames are a
// monotonic progression, so a linear 0->4 loop snaps from the last state back to
// the first once per cycle. Bouncing back down reads as a pulsing particle.
const BULLET_FRAMES = [0, 1, 2, 3, 4, 3, 2, 1];

// ---- Weapons ---------------------------------------------------------------
// The five weapons, in atlas row order. `row` indexes projectiles_atlas.png.
//
// Level is always the particle count — level N fires N particles — so there is
// no per-level column here. Level 1 is a single shot dead ahead for every
// weapon, handled as a universal rule in weapons.js before any pattern runs.
//
// `interval` is the gap between volleys and is CONSTANT per weapon at every
// level, per CLAUDE.md §7: levels change the shot pattern, never the cadence.
// The staggered weapons look like an exception and are not — see `stagger`.
//
// Two independent axes, which is why neither needs a branch in the update loop:
//
// `pattern` — WHERE the particles go (add a kind as a case in weapons.js):
//   'fan'      — particles spread evenly across `spreadDeg`, all from the muzzle
//   'parallel' — all dead ahead, offset sideways by `spacing` logical px
//   'sweep'    — angle walks a triangle wave across `spreadDeg` (gatling)
//
// `stagger` — WHEN they leave. Absent, the whole volley fires at once. Set, the
//   level's particles are spaced evenly across `interval`, so throughput still
//   scales with level while the trigger cadence stays fixed. Any pattern can be
//   staggered: Fiery Fury sweeps as it staggers, Lightning ripples across a
//   fixed fan instead.
//
// `damage` is carried but unused until collision exists, exactly as SHIPS.base
// is today.
const WEAPONS = [
  // Narrow, fast, cheap. The baseline the others are read against.
  { key: 'spark', name: 'Spark Gun', row: 0,
    pattern: 'fan', spreadDeg: 10,
    speed: 520, interval: 150, dispW: 13, damage: 1 },

  // Wider fan and heavier hits, but a slower cadence than the Spark Gun.
  { key: 'plasma', name: 'Plasma Gun', row: 1,
    pattern: 'fan', spreadDeg: 25,
    speed: 430, interval: 210, dispW: 16, damage: 2 },

  // No spread at all — a widening column of parallel shots. Trades area denial
  // for concentrated single-target damage, so it stays distinct from the fans.
  { key: 'mystic', name: 'Mystic Dagger', row: 2,
    pattern: 'parallel', spacing: 6,
    speed: 600, interval: 180, dispW: 12, damage: 2 },

  // `sweepStep` is how far the barrel walks per shot, and it persists ACROSS
  // volleys — that continuity is what reads as a driven gatling rather than a
  // fan dealt out one card at a time. 0.11 moves each shot 3.3 degrees
  // (step x 2 x spread), so a full side-to-side traverse takes ~9 shots.
  { key: 'fury', name: 'Fiery Fury', row: 3,
    pattern: 'sweep', spreadDeg: 15, stagger: true, sweepStep: 0.11,
    speed: 470, interval: 200, dispW: 15, damage: 1 },

  // The widest fan in the game — closer to a screen-clearing burst than aimed
  // fire, so it is the slowest and the shots are the slowest-moving. Staggered,
  // so the arc is dealt one bolt at a time from one edge to the other rather
  // than appearing as a single 90-degree wall. The angles are still the fixed
  // even fan — the barrel does not move, unlike Fiery Fury's.
  { key: 'lightning', name: 'Lightning Gun', row: 4,
    pattern: 'fan', spreadDeg: 90, stagger: true,
    speed: 380, interval: 260, dispW: 14, damage: 1 },
];

// Enemy charge/glow pulse, ping-pong for the same reason the other two cycles
// are: the five frames ramp monotonically from dull to bright, so a linear loop
// would snap from full glow back to dark once per cycle.
const ENEMY_FRAMES = [0, 1, 2, 3, 4, 3, 2, 1];

// ---- Enemy types -----------------------------------------------------------
// One row of alien_noshoot_atlas.png each. None of them shoot — `shoots` is
// carried so the shooting atlas can add rows with it set without the spawner or
// the update loop learning a new branch.
//
// `speed` is logical px/s and is what the PATHS functions scale their motion by.
// `spin` is degrees/s applied at draw time (negative = counter-clockwise); the
// atlas frames are a glow pulse, not a rotation, so all turning is ctx.rotate.
// `contact` is 1 for every type because CLAUDE.md §7 fixes every damage source
// in the game at exactly one hit — it exists to be read, not tuned.
// `tier` gates the difficulty ramp: tier 0 types spawn from the first second,
// higher tiers unlock as the run progresses (see spawner.js).
// `score` and `drop` are carried but unwired until scoring and bonuses land,
// exactly as SHIPS.base and WEAPONS.damage were before their systems arrived.
//
// `color`/`spark` are the row's hull colours and drive its death explosion, so
// a kill reads as that specific enemy coming apart. MEASURED the same way the
// ship colours were, but off frame 4 rather than frame 0: frame 4 is the fully
// charged state, which is both the brightest sample of the row's identity hue
// and the frame the explosion silhouette itself uses (see BOOM_FRAME). The
// clusters come out one per row cleanly — teal, blue, red, orange, magenta —
// which is what makes matching a burst to a hull a data lookup and not a guess.
// `spark` is the second measured cluster where the row has one; Phantom's art
// is single-hued, so its spark is that hue lightened toward white instead.
const ENEMY_TYPES = [
  // Cheap and slow. The type the player learns the collision rules against.
  { key: 'sentinel', name: 'Sentinel', row: 0, shoots: false,
    hp: 2, speed: 72, contact: 1, dispW: 40, spin: 40, frameMs: 90,
    tier: 0, score: 100, drop: 0.05,
    color: '70, 187, 207', spark: '92, 183, 134' },    // teal + green

  // Slow but genuinely tough — meant to be dodged early and killed later.
  { key: 'warden', name: 'Warden', row: 1, shoots: false,
    hp: 4, speed: 58, contact: 1, dispW: 44, spin: -30, frameMs: 110,
    tier: 1, score: 200, drop: 0.10,
    color: '50, 138, 205', spark: '97, 203, 193' },    // blue + pale cyan

  // Fast and fragile, spins hard. The one that actually catches a careless
  // player, so it stays cheap to kill.
  { key: 'lancer', name: 'Lancer', row: 2, shoots: false,
    hp: 2, speed: 132, contact: 1, dispW: 38, spin: 200, frameMs: 70,
    tier: 1, score: 150, drop: 0.08,
    color: '198, 45, 38', spark: '251, 201, 95' },     // red + gold

  // The wall. Slowest and largest, and the only type a level-1 weapon cannot
  // clear before it arrives.
  { key: 'bulwark', name: 'Bulwark', row: 3, shoots: false,
    hp: 7, speed: 46, contact: 1, dispW: 48, spin: 25, frameMs: 120,
    tier: 2, score: 350, drop: 0.16,
    color: '210, 112, 35', spark: '254, 241, 130' },   // orange + yellow

  // Mid-weight, quick, and the type the spawner prefers for weaving paths.
  { key: 'phantom', name: 'Phantom', row: 4, shoots: false,
    hp: 3, speed: 96, contact: 1, dispW: 40, spin: -140, frameMs: 80,
    tier: 2, score: 250, drop: 0.12,
    color: '196, 46, 185', spark: '228, 161, 223' },   // magenta + lightened
];

// ---- Movement paths --------------------------------------------------------
// (ageMs, p) -> {x, y}, evaluated fresh every frame from the enemy's age, so a
// path is a pure function of time and never accumulates drift. `p` is the
// enemy's own spawn params, fixed at birth.
//
// Age can be NEGATIVE. That is how formations stagger: a member born with a
// negative age evaluates to a position off the top or side of the screen and
// flies into view on its own, so no pending-spawn queue is needed anywhere.
// (enemies.js only culls something that has actually been on screen once.)
// Every function here must therefore stay monotonic through s < 0 as well, or a
// chain's tail links sit in front of their leader instead of behind it.
//
// EVERY path must commit downward. An earlier version had two that did not:
// `swoop` was a sine that stalled at its peak and climbed back out, and `arc`
// was a full circle that came back up the way it went in. Sampled over 400
// spawns each, both reversed 100% of the time and turned around at 53% and 39%
// of the screen height respectively — neither ever reached the player's row,
// which is what made the enemies read as timid.
//
// Params in use: x0/y0 spawn point, speed (px/s, from the type), amp, freq,
// dir (-1 or 1), phase, ang (radians off straight-down), targetX, r (turn
// radius).
//
// A new movement kind is a new entry here plus a `path` reference in a
// FORMATIONS row — never a branch in the enemy update.

// ---- The attack-run profile ------------------------------------------------
// Shared by every path that dives. Vertical speed starts at PLUNGE_IN x the
// type's nominal speed and accelerates to PLUNGE_OUT x over PLUNGE_RAMP
// seconds, then holds. The end multiplier is deliberately ABOVE 1: an enemy
// that never exceeds its nominal speed spends most of a 640px screen drifting,
// and the point of these paths is that they arrive.
//
// Written as the closed-form integral of that velocity ramp rather than stepped,
// so it stays a pure function of age like everything else here. Velocity is
// continuous at both joins, so nothing visibly brakes mid-dive.
const PLUNGE_IN   = 0.75;   // x nominal speed on entry
const PLUNGE_OUT  = 1.8;    // x nominal speed once the dive is committed
const PLUNGE_RAMP = 2.4;    // seconds to reach full dive speed

function plungeDist(s, speed) {
  // Before birth, hold the entry speed. Extending the ramp backwards instead
  // would turn the distance negative at about -2s and hand a chain's tail links
  // a position BELOW their leader, and chain staggers reach -2.6s.
  if (s <= 0) return speed * PLUNGE_IN * s;
  if (s <= PLUNGE_RAMP) {
    return speed * (PLUNGE_IN * s + (PLUNGE_OUT - PLUNGE_IN) * s * s / (2 * PLUNGE_RAMP));
  }
  return speed * (PLUNGE_RAMP * (PLUNGE_IN + PLUNGE_OUT) / 2 + PLUNGE_OUT * (s - PLUNGE_RAMP));
}

// Lateral travel that eases to a stop: `side` x speed sideways at birth,
// decaying linearly to nothing over `ramp` seconds. This is what turns a
// diagonal into a hook — the enemy cuts across, then straightens into its dive.
// Total sideways travel is side * speed * ramp / 2, which is what bounds it.
function hookDist(s, speed, side, ramp) {
  if (s <= 0) return side * speed * s;
  if (s >= ramp) return side * speed * ramp / 2;
  return side * speed * (s - s * s / (2 * ramp));
}

// ---- Per-path shape knobs --------------------------------------------------
const SWOOP_SIDE  = 1.7;   // x speed sideways at the start of a strafing dive
const SWOOP_HOOK  = 1.6;   // seconds the swoop's sideways cut lasts
const SIDE_ACROSS = 0.85;  // x speed sideways for a side entry (it crosses)
const SIDE_SINK   = 0.72;  // x the plunge profile for a side entry's descent
// The arc runs at one speed throughout, so this multiplier sets its dive speed
// as well as its entry: kept modest for that reason. It is above 1 because a
// slow hull has to cross real ground before it can turn down and threaten
// anything, and below PLUNGE_OUT so a sweeping entry does not outrun a
// committed dive.
const ARC_ENTRY   = 1.45;
const ARC_MIN_SWEEP = 85;  // px/s floor on that speed, so the slowest hulls
                           // don't spend six seconds entering.

const PATHS = {
  // Straight line, aimed. `ang` tilts it off vertical and the spawner points it
  // at the player's column at spawn time, so a descent is an approach rather
  // than a lane the player can stand beside.
  dive(ageMs, p) {
    const s = ageMs / 1000;
    const d = plungeDist(s, p.speed);
    return {
      x: p.x0 + Math.sin(p.ang) * d,
      y: p.y0 + Math.cos(p.ang) * d,
    };
  },

  // Descends on a sine weave at a steady rate. Deliberately the one path that
  // does NOT accelerate or aim: it is the readable, ignorable filler that makes
  // the committed paths register as committed. `phase` is what lets a formation
  // hold a shape while the shape itself translates down the screen.
  weave(ageMs, p) {
    const s = ageMs / 1000;
    return {
      x: p.x0 + p.amp * Math.sin(p.freq * s + p.phase),
      y: p.y0 + p.speed * s,
    };
  },

  // Sweeps in from a side and turns into a dive. The turn is CLAMPED at a
  // quarter circle — that is the whole fix over the old full circle, which
  // carried on round and climbed back out. At the quarter mark the enemy is
  // pointing straight down, and from there it plunges.
  arc(ageMs, p) {
    const sweep = Math.max(p.speed, ARC_MIN_SWEEP) * ARC_ENTRY;
    const s = ageMs / 1000;
    // Before the turn starts, continue the entry tangent backwards: at a = 0 the
    // motion is purely sideways, so this is where a chain's earlier links sit.
    if (s <= 0) return { x: p.x0 + p.dir * sweep * s, y: p.y0 };

    const w = sweep / p.r;             // angular rate that travels at `sweep`
    const quarter = (Math.PI / 2) / w; // seconds to finish the turn
    const a = Math.min(s, quarter) * w;
    // Speed is CONSTANT for the whole path: uniform circular motion at `sweep`
    // through the turn, then a straight dive at the same `sweep`. Handing off to
    // the shared plunge profile instead dropped the speed 2-5x at the turn exit,
    // which is a visible brake in mid-air — the very thing this rework is meant
    // to remove — and it bunched the arc chain from 42px down to 19px.
    return {
      x: p.x0 + p.dir * p.r * Math.sin(a),
      y: p.y0 + p.r * (1 - Math.cos(a)) + sweep * Math.max(0, s - quarter),
    };
  },

  // A strafing dive: cuts hard across the screen while it plunges, the sideways
  // component easing out so the line straightens into the attack. What is left
  // of the old "swoop and return" is the shape of the entry — the stall and the
  // climb-out are gone.
  swoop(ageMs, p) {
    const s = ageMs / 1000;
    return {
      x: p.x0 + p.dir * hookDist(s, p.speed, SWOOP_SIDE, SWOOP_HOOK),
      y: p.y0 + plungeDist(s, p.speed),
    };
  },

  // Crosses the screen from one side while committing downward, so it threatens
  // a player camped on either edge and then follows them down. The sink used to
  // be a flat 22% of `speed`, which measured out as only 70% of them ever
  // reaching the player's row, after 15 seconds of drifting across the top.
  sideEntry(ageMs, p) {
    const s = ageMs / 1000;
    return {
      x: p.x0 + p.dir * p.speed * SIDE_ACROSS * s,
      y: p.y0 + plungeDist(s, p.speed) * SIDE_SINK,
    };
  },

  // Aims at where the player WAS when it spawned, easing onto that column as it
  // dives. Deliberately not true homing: PATHS are pure functions of time and
  // cannot see the player, and a shot at your spawn-time position is readable
  // and dodgeable where a real chaser is neither. True homing would need a
  // stateful steer function, which is a bigger change than it looks.
  intercept(ageMs, p) {
    const s = ageMs / 1000;
    const k = Math.min(1, Math.max(0, s / p.freq));
    const ease = k * k * (3 - 2 * k);   // smoothstep, so the turn-in isn't a kink
    return {
      x: p.x0 + (p.targetX - p.x0) * ease,
      y: p.y0 + plungeDist(s, p.speed),
    };
  },
};

// ---- Formations ------------------------------------------------------------
// A wave is "count enemies on one path, staggered". Every member shares ONE set
// of path params (the spawner builds it once and clones it), which is what gives
// a formation a shape at all. Per member i the spawner then applies:
//   x0 += (i - (count-1)/2) * dx      lateral slot
//   phase += i * phaseStep            where on a shared wave it sits
//   age -= stagger                    from `delayMs`, or from `gap` for chains
//
// `dx` of 0 with a stagger gives single file; `dx` with no stagger gives a rank
// abreast; both together give a diagonal.
//
// `w` is the relative pick weight — the ranks are the common case and the chains
// are the occasional set piece, roughly 30% of waves.
const FORMATIONS = [
  { key: 'rank',    path: 'dive',      count: 5, dx: 52, delayMs: 0,   phaseStep: 0,   w: 3 },
  { key: 'echelon', path: 'dive',      count: 5, dx: 40, delayMs: 190, phaseStep: 0,   w: 3 },
  { key: 'column',  path: 'dive',      count: 4, dx: 0,  delayMs: 340, phaseStep: 0,   w: 3 },
  // A shared wave with a per-member phase step: the wall keeps its shape while
  // sliding down, which is the formation behaviour §7 asks for.
  { key: 'ribbon',  path: 'weave',     count: 5, dx: 46, delayMs: 0,   phaseStep: 0.7, w: 3 },
  { key: 'sweep',   path: 'arc',       count: 4, dx: 0,  delayMs: 300, phaseStep: 0,   w: 3 },
  { key: 'flank',   path: 'sideEntry', count: 3, dx: 0,  delayMs: 420, phaseStep: 0,   w: 3 },
  { key: 'stoop',   path: 'swoop',     count: 3, dx: 62, delayMs: 150, phaseStep: 0,   w: 3 },
  { key: 'pincer',  path: 'intercept', count: 3, dx: 58, delayMs: 220, phaseStep: 0,   w: 3 },

  // ---- Chains ----
  // `gap` instead of `delayMs`, dx 0 and phaseStep 0: every link retraces the
  // leader's exact curve a fixed DISTANCE behind it, which is what reads as a
  // linked chain rather than as a rank or a queue.
  //
  // `gap` is that distance as a multiple of the type's own dispW, so a chain
  // looks equally tight whether the links are slow Bulwarks or fast Lancers — a
  // fixed delayMs would stretch the fast types apart. Values are just under 1,
  // so consecutive links very nearly touch. The spacing is solved along the
  // curve's arc length in spawner.js rather than divided out of `speed`, which
  // is what keeps it even on a path whose speed is not its `speed` param. Note
  // the spacing is solved at mid-screen, not at birth: the plunging paths change
  // speed as they commit, so a time-staggered chain drifts, and mid-screen is
  // where it should be at its tidiest. See chainAgeOffsets.
  //
  // Chains are narrow by construction, so a long one is a spectacle the player
  // dodges sideways rather than an unfair wall — which is why they can afford
  // more links than a rank.
  { key: 'serpent', path: 'weave',     count: 9, dx: 0,  gap: 0.82, phaseStep: 0, w: 2 },
  { key: 'lash',    path: 'arc',       count: 8, dx: 0,  gap: 0.86, phaseStep: 0, w: 2 },
  { key: 'spear',   path: 'dive',      count: 7, dx: 0,  gap: 0.92, phaseStep: 0, w: 2 },
  { key: 'noose',   path: 'intercept', count: 8, dx: 0,  gap: 0.84, phaseStep: 0, w: 2 },
  // The whole chain cuts sideways as it plunges, so it lands across the screen
  // as a diagonal lash rather than dropping into one column. (It used to fold
  // back on itself, when `swoop` still climbed out — that stall is gone.)
  { key: 'whip',    path: 'swoop',     count: 8, dx: 0,  gap: 0.88, phaseStep: 0, w: 2 },
  { key: 'lariat',  path: 'sideEntry', count: 7, dx: 0,  gap: 0.90, phaseStep: 0, w: 2 },
];

// ---- Difficulties ----------------------------------------------------------
// Multipliers over the one ramp curve in spawner.js, never separate spawn
// tables — shaped like the reference game's AI_LEVELS so menu.js can render the
// picker straight from this array once it exists. Projectile-speed and
// drop-rate multipliers join this table when enemy fire and bonuses land.
const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   spawnMult: 0.72, hpMult: 0.8, speedMult: 0.85 },
  { key: 'normal', label: 'Normal', spawnMult: 1.00, hpMult: 1.0, speedMult: 1.00 },
  { key: 'hard',   label: 'Hard',   spawnMult: 1.35, hpMult: 1.3, speedMult: 1.18 },
];
