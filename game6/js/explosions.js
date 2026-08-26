// ============================================================================
// explosions.js — the explosion entity model: what a burst is made of, how it
// ages, and how its debris travels. Pure functions over plain objects; holds no
// state of its own (the live list is Game.explosions).
//
// It decides the SHAPE of a burst. It does not decide what dies or when
// (collide.js reports that, game.js acts on it), and it does not draw —
// render.js reads these objects and paints them.
//
// There is still no explosion atlas (CLAUDE.md §6), so a burst borrows an ENEMY
// atlas's brightest charge frame as its fireball silhouette. Those frames are
// already a radial spike-and-glow shape, which is what an explosion wants, and
// for an enemy death the silhouette is that enemy's own row of its own atlas —
// so the fireball matches the hull colour with no tinting at all. That is why a
// burst carries `atlas` as well as `row`: an armed hull has to blow up as
// itself, not as whichever tumbling disc happened to share its row index.
//
// Everything else (core, shock ring, debris streaks) is vector, so it costs no
// art and stays crisp at any scale. All of it goes through Atlas.drawBurst, so a
// real explosion atlas would be a manifest change in atlas.js and nothing else.
// ============================================================================

// ---- Tunable burst shape ---------------------------------------------------
const BOOM_MS          = 420;  // an enemy burst's lifetime, ms
const BOOM_FRAME       = 4;    // atlas column: the brightest, most-spiked frame
const BOOM_SHARDS      = 11;   // debris streaks thrown by one burst
// Debris speed in px/s per px of burst radius, so a Bulwark throws wreckage
// further than a Lancer without either needing its own number.
const BOOM_SHARD_SPEED = 18;
// 1/s. Streaks decelerate, so travel tops out at speed/drag — 2 to 4.5x the
// burst radius. Debris that stays inside the fireball is invisible, and debris
// that clears it is most of what makes the thing read as an explosion at all,
// so this is deliberately far enough out to be seen against the starfield.
const BOOM_DRAG        = 6.0;
const BOOM_SPIN        = 1.4;  // radians a puff turns over the whole life
// Hard ceiling on live bursts. Normal play runs 1-6 at a time, so this is only
// ever reached by something that kills en masse. MEASURED rather than guessed:
// a burst costs ~0.23ms a frame to draw on a software-rendered canvas (two
// upscaled blits, two radial gradients, three strokes), so 64 of them put a
// frame at 17.5ms against a 2.7ms empty scene — over budget. 40 keeps the worst
// case near 12ms there, and far under it on any GPU-composited canvas.
//
// When the nuke bonus lands it should STAGGER its kills rather than raise this:
// 90 bursts in one frame would be dropped straight back out by pushBurst, and
// a screen clearing in a ripple looks better than one clearing in a flash.
const EXPLOSION_MAX    = 40;

// ---- Tunable impact (the player taking a hit) ------------------------------
// A hit landing ON the hull, not something being destroyed, so this is small,
// short and centred on the ship. It has to register in the frame it appears and
// be gone before the next one lands — at the 1200ms post-hit grace, a burst
// much longer than this would still be on screen when the player is vulnerable
// again, which reads as the damage never having stopped.
const IMPACT_MS  = 300;
const IMPACT_R   = 13;   // logical px; the hull is 42-46 across, so this is a
                         // flash on the plating rather than around the ship
// Which alien silhouette an impact tints. ONE row, not a random one, so the
// tint cache in atlas.js stays bounded at a single canvas per source colour —
// and row 1 is the least spiky of the five, which is what a spark on armour
// wants rather than a starburst.
const IMPACT_ROW = 1;

// ---- Tunable wreck (the player's death) ------------------------------------
// The wreck is not one big burst but a stutter of small ones in different
// colours, which is what reads as a ship coming apart rather than a bomb.
const WRECK_MS         = 560;   // one sub-burst's lifetime
const WRECK_COUNT      = 12;    // sub-bursts, cycling WRECK_PALETTE
const WRECK_STAGGER_MS = 72;    // nominal gap between them, jittered per burst
const WRECK_SPREAD     = 30;    // px radius the sub-bursts scatter over
const WRECK_R_MIN      = 10;    // sub-burst radius range, logical px
const WRECK_R_MAX      = 20;
// The hull is roughly 1.5x taller than it is wide, so the scatter is stretched
// vertically to match the silhouette it is tearing apart.
const WRECK_SPREAD_Y   = 1.3;
// Which alien silhouette the ship's own two hull colours borrow. Any two rows
// work; these two are the least spiky, so a tinted copy reads as burning hull
// rather than as a recoloured alien. Taken from the tumbling atlas because the
// armed hulls are recognisably SHIPS — a tinted copy of one would read as an
// enemy exploding next to the player rather than as the player coming apart.
const WRECK_ATLAS      = 'aliens';
const WRECK_SHIP_ROWS  = [0, 1];

// Build one burst. `color`/`spark` are "r, g, b" triplets (the COLORS
// convention — alpha is composed at draw time); `tint` is a CSS colour for
// recolouring the silhouette, or null to draw the row as authored.
function makeBurst(x, y, r, atlas, row, color, spark, tint, delayMs, life) {
  const shards = [];
  for (let i = 0; i < BOOM_SHARDS; i++) {
    shards.push({
      // Even angular slots with jitter inside each slot: a purely random spread
      // clumps and leaves bald patches, a perfectly even one reads as a
      // mechanical asterisk.
      ang: (i + Math.random() * 0.85) * TAU / BOOM_SHARDS,
      // Wide spread on purpose: streaks that all travel the same distance read
      // as a clock face rather than as debris.
      spd: r * BOOM_SHARD_SPEED * (0.5 + Math.random() * 1.25),
      len: r * (0.45 + Math.random() * 0.7),
      alt: Math.random() < 0.4,   // drawn in `spark` rather than `color`
    });
  }
  return {
    x, y, r, atlas, row, color, spark, tint, shards,
    frame: BOOM_FRAME,
    // Two distorted copies of the silhouette. Offsetting, squashing and
    // counter-spinning them is what stops the atlas frame's circular casing
    // from reading as a disc that is merely glowing — overlapping arcs churn,
    // concentric ones just look like a bigger disc.
    puffs: [makePuff(0.30, 1.00), makePuff(0.55, 0.62)],
    // Starts negative for a staggered sub-burst and is skipped until it turns
    // positive — the same trick formations use for their spawn delay.
    ms: -delayMs,
    life,
  };
}

// One copy of the fireball silhouette. `off` is its offset from the burst
// centre and `scale` its size, both in units of the burst radius.
function makePuff(off, scale) {
  const a = Math.random() * TAU;
  return {
    ox: Math.cos(a) * off,
    oy: Math.sin(a) * off,
    sx: scale * (0.85 + Math.random() * 0.4),
    sy: scale * (0.85 + Math.random() * 0.4),
    rot: Math.random() * TAU,
    spin: (Math.random() < 0.5 ? -1 : 1) * BOOM_SPIN * (0.5 + Math.random()),
  };
}

function pushBurst(list, b) {
  // At the ceiling the OLDEST burst is dropped rather than the new one refused:
  // the newest kill is the feedback the player is waiting on, and the burst
  // being dropped is the one already nearly faded out.
  if (list.length >= EXPLOSION_MAX) list.shift();
  list.push(b);
}

// A killed enemy. No tint is passed: the silhouette is this enemy's own atlas
// row, so the fireball already carries its hull colour, and `color`/`spark` in
// ENEMY_TYPES are that same art measured off the atlas — the vector half of the
// burst therefore matches the sprite half by construction.
function explodeEnemy(list, e) {
  const type = ENEMY_TYPES[e.t];
  const b = makeBurst(e.x, e.y, type.dispW * 0.5, type.atlas, type.row,
                      type.color, type.spark, null, 0, BOOM_MS);
  // Sit the main puff on the disc that was there last frame — same row, same
  // angle — so the blast grows out of the enemy rather than snapping to a new
  // orientation the instant it appears.
  b.puffs[0].ox = 0;
  b.puffs[0].oy = 0;
  b.puffs[0].rot = e.rot;
  pushBurst(list, b);
}

// A hit landing on the player, drawn at the ship's own centre.
//
// `color`/`spark` are the SOURCE's, never the ship's: the flash is what tells
// the player what just got them, so a Lancer ramming them flashes red and a
// lightning bolt flashes yellow. Callers read those off the entity that landed
// the hit — ENEMY_TYPES for a body, PARTICLE_COLORS for a projectile.
//
// Pass null for a source that has no colour of its own and it takes a random
// entry from the wreck palette instead. That palette rather than a made-up one
// because it is already a deliberate spread of hues (see data.js), so a random
// pick still looks chosen; and a random colour rather than a fixed fallback
// because a fixed one would quietly become "the colour of things we forgot to
// attribute" and start reading as its own damage type.
function explodeImpact(list, x, y, color, spark) {
  if (!color) {
    const c = WRECK_PALETTE[Math.floor(Math.random() * WRECK_PALETTE.length)];
    color = c.color;
    spark = c.spark;
  }
  // Tinted, unlike an enemy's death burst: that one borrows its own hull's row
  // and needs no recolour, but this one is a single shared silhouette standing
  // in for every source there is.
  pushBurst(list, makeBurst(x, y, IMPACT_R, WRECK_ATLAS, IMPACT_ROW,
                            color, spark, rgbCss(color), 0, IMPACT_MS));
}

// The player's death: many bursts in many colours — the ship's own two hull
// accents first, then WRECK_PALETTE — scattered over the hull and staggered so
// they go off in a ragged chain rather than as one flash.
function explodeShip(list, p) {
  const ship = SHIPS[p.ship];
  const palette = [
    { color: ship.color, spark: ship.spark, row: WRECK_SHIP_ROWS[0] },
    { color: ship.spark, spark: ship.color, row: WRECK_SHIP_ROWS[1] },
  ].concat(WRECK_PALETTE);

  // The hull itself goes first, biggest and longest, so the chain reads as one
  // ship blowing up rather than as a cluster of unrelated pops.
  pushBurst(list, makeBurst(
    p.x, p.y, ship.dispW * 0.5, WRECK_ATLAS, palette[0].row,
    palette[0].color, palette[0].spark, rgbCss(palette[0].color),
    0, WRECK_MS + 140));

  for (let i = 1; i < WRECK_COUNT; i++) {
    const c = palette[i % palette.length];
    const a = Math.random() * TAU;
    // sqrt() so the offsets spread evenly over the disc instead of bunching at
    // the centre, which is what a plain uniform radius would do.
    const d = Math.sqrt(Math.random()) * WRECK_SPREAD;
    pushBurst(list, makeBurst(
      p.x + Math.cos(a) * d,
      p.y + Math.sin(a) * d * WRECK_SPREAD_Y,
      WRECK_R_MIN + Math.random() * (WRECK_R_MAX - WRECK_R_MIN),
      WRECK_ATLAS, c.row, c.color, c.spark, rgbCss(c.color),
      i * WRECK_STAGGER_MS * (0.6 + Math.random() * 0.8),
      WRECK_MS));
  }
}

function updateExplosions(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.ms += dt;
    // `ms` counts up from -delay, so this also gives staggered sub-bursts their
    // full life however late they light.
    if (b.ms >= b.life) list.splice(i, 1);
  }
}

// How far a debris streak has travelled at age `ms`. Linear drag integrated in
// closed form rather than stepped, for the same reason enemy paths are pure
// functions of age: a streak can never accumulate drift, and render.js can ask
// for a position without mutating anything.
function shardDist(s, ms) {
  return (s.spd / BOOM_DRAG) * (1 - Math.exp(-BOOM_DRAG * ms / 1000));
}

// "r, g, b" -> a CSS colour. Also the tint cache's key, so it has to be a
// stable string for a given palette entry.
function rgbCss(triplet) {
  return 'rgb(' + triplet + ')';
}
