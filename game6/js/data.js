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
// `base` is durability in hits: how many hits ONE armour layer absorbs, and so
// also how many the ship dies with at weapon level 1 — see the armor/weapon
// model in CLAUDE.md §7. Total durability is base * 5, so these three carry 10,
// 15 and 20 hits at full armour.
//
// Tightened from the original 3/4/5 spec now that enemies shoot back: a level-1
// Interceptor absorbing three separate hits before dying made the opening of a
// run forgiving to the point of being uneventful, and every layer above the
// first inherits the same slack five times over.
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
  { name: 'Interceptor', base: 2, speed: 300, dispW: 42,
    color: '65, 118, 162',  spark: '227, 141, 74' },   // steel blue + orange
  { name: 'Warhammer',   base: 3, speed: 250, dispW: 46,
    color: '197, 92, 51',   spark: '252, 225, 110' },  // rust red + brass
  { name: 'Verdant',     base: 4, speed: 215, dispW: 46,
    color: '97, 179, 130',  spark: '87, 150, 160' },   // green + pale teal
];

// ---- Particle colours ------------------------------------------------------
// One entry per ROW of projectiles_atlas.png. MEASURED, not eyeballed: each
// row's frame 2 was hue-clustered the same way the hull colours were, `color`
// being the particle body and `spark` its highlight. Mystic and Lightning are
// single-hued in the art, so their spark is that hue lightened toward white.
//
// Indexed by atlas row rather than by weapon, so both sides of the fight read
// the same entry: it is what a player shot contributes to the wreck when the
// magazine cooks off, and it is the colour an enemy shot leaves on the hull when
// it lands (explosions.js). One measurement, two readers.
const PARTICLE_COLORS = [
  { color: '38, 88, 167',   spark: '111, 242, 252' },   // 0 spark
  { color: '102, 202, 76',  spark: '238, 248, 169' },   // 1 plasma
  { color: '187, 54, 193',  spark: '229, 138, 233' },   // 2 mystic
  { color: '224, 103, 30',  spark: '252, 237, 97'  },   // 3 fury
  { color: '198, 176, 54',  spark: '246, 240, 190' },   // 4 lightning
];

// ---- Wreck palette ---------------------------------------------------------
// The colours the player's death explosion cycles through, on top of the dying
// ship's own two hull accents (explosions.js prepends those). A wreck is a
// stutter of sub-bursts in DIFFERENT colours, so this table is what stops it
// collapsing into one warm blob — which is exactly what happens if the palette
// is only a fire ramp and the ship is one of the warm-hulled two.
//
// Source: the ship's magazine cooking off, so every entry but the first is one
// of the particle colours above rather than a second copy of them.
//
// It doubles as the pool an UNATTRIBUTED hit draws from (explosions.js), which
// is why it wants to stay a spread of hues rather than a fire ramp: a random
// pick out of it has to look deliberate.
//
// `row` picks which alien silhouette the sub-burst tints. Fixed per entry
// rather than random, so the tint cache in atlas.js stays bounded at one canvas
// per entry. A new debris colour is a new row here and nothing else.
const WRECK_PALETTE = [
  { color: '252, 225, 110', spark: '255, 251, 235', row: 3 },  // brass, white-hot
  { ...PARTICLE_COLORS[0], row: 0 },   // Spark Gun
  { ...PARTICLE_COLORS[1], row: 1 },   // Plasma Gun
  { ...PARTICLE_COLORS[2], row: 4 },   // Mystic Dagger
  { ...PARTICLE_COLORS[3], row: 2 },   // Fiery Fury
  { ...PARTICLE_COLORS[4], row: 3 },   // Lightning Gun
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
// `letter` is the single character its bonus bubble shows, and it MUST stay
// unique across the table — that glyph is the only thing telling the player
// which weapon is inside, so two weapons sharing an initial would make one of
// the two unreadable. The five names happen to start S/P/M/F/L; a sixth weapon
// beginning with one of those needs a letter that is not its initial.
const WEAPONS = [
  // Narrow, fast, cheap. The baseline the others are read against.
  { key: 'spark', name: 'Spark Gun', row: 0, letter: 'S',
    pattern: 'fan', spreadDeg: 10,
    speed: 520, interval: 150, dispW: 13, damage: 1 },

  // Wider fan and heavier hits, but a slower cadence than the Spark Gun.
  { key: 'plasma', name: 'Plasma Gun', row: 1, letter: 'P',
    pattern: 'fan', spreadDeg: 25,
    speed: 430, interval: 210, dispW: 16, damage: 2 },

  // No spread at all — a widening column of parallel shots. Trades area denial
  // for concentrated single-target damage, so it stays distinct from the fans.
  { key: 'mystic', name: 'Mystic Dagger', row: 2, letter: 'M',
    pattern: 'parallel', spacing: 6,
    speed: 600, interval: 180, dispW: 12, damage: 2 },

  // `sweepStep` is how far the barrel walks per shot, and it persists ACROSS
  // volleys — that continuity is what reads as a driven gatling rather than a
  // fan dealt out one card at a time. 0.11 moves each shot 3.3 degrees
  // (step x 2 x spread), so a full side-to-side traverse takes ~9 shots.
  { key: 'fury', name: 'Fiery Fury', row: 3, letter: 'F',
    pattern: 'sweep', spreadDeg: 15, stagger: true, sweepStep: 0.11,
    speed: 470, interval: 200, dispW: 15, damage: 1 },

  // The widest fan in the game — closer to a screen-clearing burst than aimed
  // fire, so it is the slowest and the shots are the slowest-moving. Staggered,
  // so the arc is dealt one bolt at a time from one edge to the other rather
  // than appearing as a single 90-degree wall. The angles are still the fixed
  // even fan — the barrel does not move, unlike Fiery Fury's.
  { key: 'lightning', name: 'Lightning Gun', row: 4, letter: 'L',
    pattern: 'fan', spreadDeg: 90, stagger: true,
    speed: 380, interval: 260, dispW: 14, damage: 1 },
];

// Enemy charge/glow pulse, ping-pong for the same reason the other two cycles
// are: the five frames ramp monotonically from dull to bright, so a linear loop
// would snap from full glow back to dark once per cycle.
const ENEMY_FRAMES = [0, 1, 2, 3, 4, 3, 2, 1];

// ---- Enemy armament --------------------------------------------------------
// The armed enemies fire the SAME five particles the player does — same atlas
// rows, same ping-pong frames — because there is only one projectile atlas and
// inventing a sixth look for the other side would mean art that does not exist.
// What differs is the tuning, which is why this is its own table rather than a
// second reader of WEAPONS: a player's shot is tuned to travel AWAY from the
// eye, and the same 380-600 px/s coming toward the eye is barely dodgeable on a
// 640px-tall screen. These run at roughly half that, so a shot fired from the
// top edge takes ~2.5s to reach the player's row — enough time to read it and
// move, which is the whole design of the genre.
//
// `pattern`/`spreadDeg`/`spacing` are shaped exactly like WEAPONS so shotAim()
// in weapons.js serves both sides; the enemy analogue of the player's weapon
// LEVEL is `gun.count` on the firing type below.
//
// `damage` is 1 everywhere because CLAUDE.md §7 fixes every damage source in
// the game at exactly one hit. Like ENEMY_TYPES.contact it exists to be read
// rather than tuned, so the table stays the single source of truth.
const ENEMY_WEAPONS = [
  // 0 — Spark. The quickest of the five and the one aimed at the player, so it
  // gets the narrowest fan: a wide spread on an aimed shot punishes standing
  // still twice over.
  { key: 'spark', row: 0, pattern: 'fan', spreadDeg: 8,
    speed: 265, dispW: 12, damage: 1 },

  // 1 — Plasma. Big, slow and fired in a fixed burst from a stationary ship, so
  // it reads as a deliberate salvo rather than as suppressing fire.
  { key: 'plasma', row: 1, pattern: 'fan', spreadDeg: 20,
    speed: 215, dispW: 16, damage: 1 },

  // 2 — Mystic. Parallel column, as on the player's side: two daggers abreast
  // covering a lane rather than a cone, which is what makes a straight runner
  // something to sidestep instead of something to out-angle.
  { key: 'mystic', row: 2, pattern: 'parallel', spacing: 7,
    speed: 245, dispW: 12, damage: 1 },

  // 3 — Fury. Carried by the chaser, which is already pointed at the player, so
  // the fan is only wide enough that a dead-straight dodge is not free.
  { key: 'fury', row: 3, pattern: 'fan', spreadDeg: 12,
    speed: 205, dispW: 15, damage: 1 },

  // 4 — Lightning. The widest fan and the slowest shot, fired sideways across
  // the screen: area denial the player flies around rather than a shot to dodge.
  { key: 'lightning', row: 4, pattern: 'fan', spreadDeg: 50,
    speed: 190, dispW: 14, damage: 1 },
];

// ---- Armed flight profile --------------------------------------------------
// The arrowhead's timings sit up here, ahead of ENEMY_TYPES, rather than down
// with the other path knobs: the Harrier's gun opens the moment the trio
// arrives on station, so its `fireFrom` is timed off ARROW_IN_MS and the two
// numbers have to stay literally adjacent to stay in agreement.
const ARROW_IN_MS   = 1300;   // ms of approach, decelerating onto the station
const ARROW_HOLD_MS = 1150;   // ms held there — three shots at 300ms fit inside
const ARROW_OUT     = 1.55;   // x nominal speed once the retreat is committed
const ARROW_OUT_RAMP = 0.9;   // seconds to reach that retreat speed
// Station depth as a fraction of the canvas, per entry side. The top figure is
// the usual shooter stand-off. The bottom one is BELOW the player's normal band
// (they start at 0.78) on purpose: a trio that entered from underneath fires
// upward, so holding above the player would send every shot away from them and
// the whole variant would be decorative. Holding under them is what makes it
// the "get off the floor" moment it is meant to be.
const ARROW_HOLD_TOP    = 0.28;
const ARROW_HOLD_BOTTOM = 0.90;

// ---- Enemy types -----------------------------------------------------------
// ONE table for both halves of the roster: the five tumbling types from
// alien_noshoot_atlas.png and, below them, the five armed types from
// alien_shoot_atlas.png. Keeping them in one array is what lets collide.js,
// explosions.js and render.js go on indexing ENEMY_TYPES[e.t] without learning
// that shooters exist at all — `atlas` says which image a row's `row` indexes,
// and `shoots` is what splits the two spawn streams in spawner.js. That flag
// was carried unused from the first iteration for exactly this moment.
//
// `speed` is logical px/s and is what the PATHS functions scale their motion by.
// `spin` is degrees/s applied at draw time (negative = counter-clockwise); the
// atlas frames are a glow pulse, not a rotation, so all turning is ctx.rotate.
// `contact` is 1 for every type because CLAUDE.md §7 fixes every damage source
// in the game at exactly one hit — it exists to be read, not tuned.
// `tier` gates the difficulty ramp: tier 0 types spawn from the first second,
// higher tiers unlock as the run progresses (see spawner.js).
// `score` is what killing one is worth. Flat 1 for the tumbling types and 3 for
// the armed ones, matching the rule that a shooting enemy is worth three times
// an unarmed one — kept as a per-type FIELD rather than derived from `shoots` so
// a single type can be re-priced later without the rule becoming an `if`.
// `drop` is its per-kill bonus chance, scaled by DIFFICULTIES.dropMult.
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
  { key: 'sentinel', name: 'Sentinel', atlas: 'aliens', row: 0, shoots: false,
    hp: 2, speed: 72, contact: 1, dispW: 40, spin: 40, frameMs: 90,
    tier: 0, score: 1, drop: 0.05,
    color: '70, 187, 207', spark: '92, 183, 134' },    // teal + green

  // Slow but genuinely tough — meant to be dodged early and killed later.
  { key: 'warden', name: 'Warden', atlas: 'aliens', row: 1, shoots: false,
    hp: 4, speed: 58, contact: 1, dispW: 44, spin: -30, frameMs: 110,
    tier: 1, score: 1, drop: 0.10,
    color: '50, 138, 205', spark: '97, 203, 193' },    // blue + pale cyan

  // Fast and fragile, spins hard. The one that actually catches a careless
  // player, so it stays cheap to kill.
  { key: 'lancer', name: 'Lancer', atlas: 'aliens', row: 2, shoots: false,
    hp: 2, speed: 132, contact: 1, dispW: 38, spin: 200, frameMs: 70,
    tier: 1, score: 1, drop: 0.08,
    color: '198, 45, 38', spark: '251, 201, 95' },     // red + gold

  // The wall. Slowest and largest, and the only type a level-1 weapon cannot
  // clear before it arrives.
  { key: 'bulwark', name: 'Bulwark', atlas: 'aliens', row: 3, shoots: false,
    hp: 7, speed: 46, contact: 1, dispW: 48, spin: 25, frameMs: 120,
    tier: 2, score: 1, drop: 0.16,
    color: '210, 112, 35', spark: '254, 241, 130' },   // orange + yellow

  // Mid-weight, quick, and the type the spawner prefers for weaving paths.
  { key: 'phantom', name: 'Phantom', atlas: 'aliens', row: 4, shoots: false,
    hp: 3, speed: 96, contact: 1, dispW: 40, spin: -140, frameMs: 80,
    tier: 2, score: 1, drop: 0.12,
    color: '196, 46, 185', spark: '228, 161, 223' },   // magenta + lightened

  // ---- Armed types (alien_shoot_atlas.png) ---------------------------------
  // These five have a NOSE. Every hull in the art faces up the screen, so none
  // of them tumble — `spin` is 0 throughout and `face` says how the heading is
  // found instead:
  //   'fixed'  keep the heading chosen at birth, forever. A Harrier backs out
  //            of its attack run without turning round, which is the whole
  //            reading of a retreat rather than a rout.
  //   'travel' point along the last frame's movement, so the hull banks through
  //            a curve on its own.
  //   'steer'  the heading IS the state; shooters.js integrates it.
  //
  // `path` is fixed per type rather than rolled by the spawner: for these the
  // movement IS the identity — an arrowhead that wove would not be an
  // arrowhead. `gun` is the whole firing script:
  //   weapon      index into ENEMY_WEAPONS
  //   count       particles per volley (the analogue of the player's level)
  //   aim         'ahead' along the nose | 'player' at where they are RIGHT NOW
  //               | 'split' a coin flip between the two, rolled per volley
  //   intervalMs  ms between volleys
  //   fireFrom    ms of age before the gun opens; omit for "as soon as visible"
  //   volleys     lifetime volley cap; omit for unlimited
  //
  // `disc` is this hull's own collision fraction — see ENEMY_DISC_FRAC in
  // atlas.js for why these five cannot share one number.
  //
  // `color`/`spark` are measured off frame 4 by the same hue-clustering used on
  // the tumbling rows, and for the same reason: the death burst borrows the
  // row's own art, so the vector half of the explosion has to agree with the
  // sprite half. Two rows needed a judgement call, both noted below.

  // Flies one straight line, down the screen or up it, firing a pair of daggers
  // dead ahead. The plainest of the five on purpose: it is where the player
  // learns that these ones shoot back.
  { key: 'marauder', name: 'Marauder', atlas: 'shooters', row: 0, shoots: true,
    hp: 3, speed: 108, contact: 1, dispW: 40, spin: 0, frameMs: 95,
    disc: 0.78, face: 'fixed', path: 'shooterRun',
    tier: 0, score: 3, drop: 0.14,
    gun: { weapon: 2, count: 2, aim: 'ahead', intervalMs: 820 },
    // Cluster 2 (pale cyan) is far brighter than cluster 1 (indigo), which is
    // what a fireball wants: `color` cools the fireball's mid-stop and `spark`
    // lights its core.
    color: '56, 52, 109', spark: '167, 245, 249' },    // indigo + pale cyan

  // Three abreast in an arrowhead: in, three plasma salvoes from a standstill,
  // then straight back out the way they came. A set piece with a beginning and
  // an end rather than a stream, so it can afford to be the heaviest volley in
  // the game.
  { key: 'harrier', name: 'Harrier', atlas: 'shooters', row: 1, shoots: true,
    hp: 3, speed: 165, contact: 1, dispW: 38, spin: 0, frameMs: 80,
    disc: 0.47, face: 'fixed', path: 'shooterArrow',
    tier: 0, score: 3, drop: 0.12,
    gun: { weapon: 1, count: 1, aim: 'ahead', intervalMs: 300,
           fireFrom: ARROW_IN_MS + 140, volleys: 3 },
    // The second-strongest cluster here was another green — a shade of the
    // first, not a second colour — so the spark is the third, an olive gold of
    // near-identical weight and a genuinely different hue. A burst built from
    // two greens reads as one flat green blob.
    color: '58, 161, 115', spark: '159, 152, 95' },    // green + olive gold

  // A chain of them tracing one long sweeping curve, each link putting a spark
  // bolt on the player once a second. Individually the flimsiest type in the
  // game; the threat is the volume of aimed fire a whole chain puts out.
  { key: 'reaver', name: 'Reaver', atlas: 'shooters', row: 2, shoots: true,
    hp: 2, speed: 92, contact: 1, dispW: 36, spin: 0, frameMs: 85,
    disc: 0.60, face: 'travel', path: 'shooterCurve',
    tier: 0, score: 3, drop: 0.07,
    gun: { weapon: 0, count: 1, aim: 'player', intervalMs: 1000 },
    // Single-hued art, like Phantom: the spark is that hue lightened 55% toward
    // white, the same figure measured off Phantom's own two clusters.
    color: '139, 58, 63', spark: '203, 166, 169' },    // dark red + lightened

  // The chaser. Steers at the player and keeps correcting, firing fury bolts
  // straight down its own nose — so its aim is only ever as good as its turn.
  // The most valuable kill on the board and the only one that will follow.
  { key: 'stalker', name: 'Stalker', atlas: 'shooters', row: 3, shoots: true,
    hp: 4, speed: 132, contact: 1, dispW: 42, spin: 0, frameMs: 90,
    disc: 0.62, face: 'steer', path: 'homing', steer: true,
    tier: 0, score: 3, drop: 0.22,
    gun: { weapon: 3, count: 1, aim: 'ahead', intervalMs: 1000 },
    color: '34, 74, 129', spark: '121, 238, 248' },    // deep blue + cyan

  // A wing of them crossing the screen edge to edge, throwing lightning either
  // along their own track or at the player, a coin flip each time. The one type
  // whose fire comes at the player SIDEWAYS, which is what stops the whole game
  // being solved by dodging left and right.
  { key: 'corsair', name: 'Corsair', atlas: 'shooters', row: 4, shoots: true,
    hp: 3, speed: 128, contact: 1, dispW: 40, spin: 0, frameMs: 88,
    disc: 0.65, face: 'fixed', path: 'shooterCross',
    tier: 0, score: 3, drop: 0.15,
    gun: { weapon: 4, count: 1, aim: 'split', intervalMs: 1000 },
    color: '145, 52, 58', spark: '253, 245, 178' },    // red + pale yellow
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
// EVERY path must commit downward — with two deliberate exceptions among the
// armed types, both of which honour what that rule is actually protecting. The
// rule exists so nothing STALLS or turns back mid-screen and reads as timid; a
// path that commits monotonically to leaving the playfield is not that, whatever
// direction it leaves in. `shooterRun` climbing out of the bottom of the screen
// and `shooterCross` crossing it edge to edge both leave promptly and never
// reverse. `shooterArrow` does reverse, once, at a scripted moment after it has
// fired — a retreat with a reason, not a wobble.
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

// ---- Armed-path shape knobs ------------------------------------------------
// A Reaver chain traces ONE broad curve, so the amplitude is large and the
// frequency low: over a ~8s descent this covers roughly two thirds of a period,
// which paints a single sweeping C. Pushed toward the `weave` regime (amp 34-78,
// freq 1.1-2.2) it stops being a curve and becomes a wiggle, and a chain of
// eight on a wiggle just reads as noise. The amplitude is also what fixes the
// spawn column at mid-screen — x0 +/- CURVE_AMP has to stay inside 360px.
const CURVE_AMP   = 118;   // px of lateral swing
const CURVE_FREQ  = 0.52;  // radians/s
const CURVE_SINK  = 0.86;  // x nominal speed downward — constant, so it commits
// Starting phase, chosen so the curve begins near one extreme and sweeps across
// rather than starting mid-swing and only ever showing half the shape.
const CURVE_PHASE = -1.0;  // radians

// A crossing wing sinks as it goes so it does not carve one untouchable lane
// across the top of the screen, but only gently: the point of the type is the
// horizontal traverse, and a steep sink turns it into another kind of dive.
const CROSS_SINK  = 0.18;  // x nominal speed downward while crossing

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

  // ---- Armed paths ---------------------------------------------------------

  // One straight line at a constant speed, down the screen (dir 1) or up it
  // (dir -1). No acceleration and no aim: the whole read of this type is that
  // it is going exactly where its nose points, so the player can see the lane
  // it owns and step out of it.
  shooterRun(ageMs, p) {
    const s = ageMs / 1000;
    return { x: p.x0, y: p.y0 + p.dir * p.speed * s };
  },

  // The attack run: in, stop, shoot, back out. x never changes, so the whole
  // path is a speed profile along one column and the arrowhead keeps its shape
  // for free.
  //
  // The approach eases OUT (1-(1-k)^2), so the trio decelerates onto its station
  // instead of slamming to a halt — a hard stop reads as a dropped frame. The
  // retreat is the mirror: a linear speed ramp, integrated in closed form here
  // for the same reason plungeDist is, so this stays a pure function of age.
  //
  // Note the retreat subtracts `dir`: it reverses along the column it came down.
  // The hull does NOT turn to face the new direction — `face: 'fixed'` in
  // ENEMY_TYPES is what makes it back away still pointing at the player.
  shooterArrow(ageMs, p) {
    const s = ageMs / 1000;
    if (s <= 0) return { x: p.x0, y: p.y0 };
    const tIn = ARROW_IN_MS / 1000;
    const tHold = ARROW_HOLD_MS / 1000;

    if (s < tIn) {
      const k = s / tIn;
      return { x: p.x0, y: p.y0 + (p.holdY - p.y0) * (1 - (1 - k) * (1 - k)) };
    }
    if (s < tIn + tHold) return { x: p.x0, y: p.holdY };

    const r = s - tIn - tHold;
    const v = p.speed * ARROW_OUT;
    const d = r < ARROW_OUT_RAMP
      ? v * r * r / (2 * ARROW_OUT_RAMP)
      : v * (r - ARROW_OUT_RAMP / 2);
    return { x: p.x0, y: p.holdY - p.dir * d };
  },

  // One long sweeping curve down the screen. Structurally a weave, but run at
  // an amplitude and frequency that make it a single arc rather than an
  // oscillation — see the knobs above for why that distinction is the point.
  // Vertical speed is constant and positive, so it commits at every age,
  // including the negative ones a chain's tail links live at.
  shooterCurve(ageMs, p) {
    const s = ageMs / 1000;
    return {
      x: p.x0 + p.dir * p.amp * Math.sin(p.freq * s + p.phase),
      y: p.y0 + p.speed * CURVE_SINK * s,
    };
  },

  // Straight across the screen with a shallow sink. Constant speed on both
  // axes, so the heading never changes and the wing can be pointed once at
  // birth (`face: 'fixed'`).
  shooterCross(ageMs, p) {
    const s = ageMs / 1000;
    return {
      x: p.x0 + p.dir * p.speed * s,
      y: p.y0 + p.speed * CROSS_SINK * s,
    };
  },

  // The chaser's SPAWN POINT, and nothing else — note it ignores `ageMs`.
  //
  // This is the one motion in the game that is not a function of time. A chaser
  // has to see the player, and a PATHS entry cannot: they are pure functions of
  // age precisely so that a formation can never shear apart and an enemy can
  // never accumulate drift. So the Stalker's position is integrated instead, in
  // shooters.js, and enemies.js skips the path evaluation for it. This entry
  // exists so makeEnemy still has somewhere to read its birth position from,
  // which keeps that one branch out of the constructor.
  homing(ageMs, p) {
    return { x: p.x0, y: p.y0 };
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
// picker straight from this array once it exists. A drop-rate multiplier joins
// this table when bonuses land.
//
// `bulletSpeedMult` scales incoming fire only. It is a sharper dial than
// `speedMult`: a hull that arrives 15% faster is a little less time to react,
// but a shot that arrives 15% faster is less time to react during a moment the
// player is already committed to a dodge. Kept on a tighter range for that
// reason.
const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   spawnMult: 0.72, hpMult: 0.8, speedMult: 0.85, bulletSpeedMult: 0.85, dropMult: 1.25 },
  { key: 'normal', label: 'Normal', spawnMult: 1.00, hpMult: 1.0, speedMult: 1.00, bulletSpeedMult: 1.00, dropMult: 1.00 },
  { key: 'hard',   label: 'Hard',   spawnMult: 1.35, hpMult: 1.3, speedMult: 1.18, bulletSpeedMult: 1.12, dropMult: 0.80 },
];

// ---- Bonuses ---------------------------------------------------------------
// Caught, not bought (CLAUDE.md §7): dropped by dying enemies, then they drift
// down and the player flies into them. Every one is a transparent bubble with a
// still picture inside; the bubble is drawn procedurally, so a new bonus costs
// art only if its picture does.
//
// Three independent fields, which is what keeps a new bonus a row rather than a
// branch in three different files:
//   `kind`  what it DOES — dispatched through BONUS_EFFECTS in game.js
//   `glyph` what is drawn INSIDE the bubble — dispatched in render.js
//   `pick`  which table to roll an index from at spawn, or null. The roll lands
//           on the pickup as `arg`, so one row serves all five weapons and all
//           three hulls rather than needing eight rows.
//
// `color`/`spark` tint the bubble and, for `harm`, also colour the hit it
// causes. The tint is the ONLY cue separating a prize from a trap at a glance,
// so the harm row owns warm red and nothing else in this table may go near it.
//
// `w` is the relative pick weight; the sum is arbitrary, as in TRICKLE_PATHS.
const BONUSES = [
  // The staple. Also the weapon-level upgrade when armour is already full —
  // one counter, both jobs (§7).
  { key: 'heal', kind: 'heal', glyph: 'plus', pick: null, w: 26,
    color: '126, 240, 168', spark: '226, 255, 236' },   // green

  // The trap. Deliberately common enough to make the player read bubbles before
  // flying at them, which is what stops every drop being free.
  { key: 'harm', kind: 'harm', glyph: 'minus', pick: null, w: 12,
    color: '226, 62, 62', spark: '255, 176, 148' },     // red — reserved

  // Swaps to the NAMED weapon at the same level, so the bubble is an informed
  // choice: the letter inside says which one, in that particle's own colour.
  // `tintFrom` sends the BUBBLE's colour to the particle too, not just the
  // letter. Without it every weapon bubble is the same neutral blue and the
  // player has to be close enough to read a 19px letter before they know
  // whether it is worth crossing the screen for.
  { key: 'weapon', kind: 'weapon', glyph: 'letter', pick: 'weapon', w: 20,
    tintFrom: 'particle',
    color: '150, 190, 235', spark: '226, 240, 255' },   // fallback only

  // Swaps to the NAMED hull, carrying the weapon level across (§7). The hull
  // itself is the picture, which is why this one needed no new art.
  { key: 'ship', kind: 'ship', glyph: 'hull', pick: 'ship', w: 12,
    color: '150, 190, 235', spark: '226, 240, 255' },

  { key: 'turbo', kind: 'turbo', glyph: 'chevrons', pick: null, w: 16,
    color: '255, 209, 102', spark: '255, 244, 214' },   // amber, as COLORS.turbo

  { key: 'wing', kind: 'wing', glyph: 'wing', pick: null, w: 9,
    color: '127, 212, 255', spark: '232, 248, 255' },   // cyan
];
