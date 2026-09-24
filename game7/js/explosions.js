// ============================================================================
// explosions.js — the burst entity model, copied from game6 and scaled to this
// game's smaller sprites: what a burst is made of, how it ages, how its debris
// travels. Pure functions over plain objects on Game.explosions.
//
// It decides the SHAPE of a burst, not what dies or when (collide.js reports
// that, game.js acts on it), and it does not draw — render.js paints them.
//
// There is no explosion atlas: a burst borrows an alien atlas's brightest charge
// frame as its fireball silhouette. An enemy's death uses its own row of its own
// atlas, so the fireball matches the hull with no tinting at all; everything
// else tints a shared silhouette (SpriteKit.drawBurst). A burst that can only
// ever be one event SOUNDS ITSELF, so there is one place it can be forgotten from.
// ============================================================================

// ---- Tunable burst shape ---------------------------------------------------
const BOOM_MS          = 420;  // an enemy burst's lifetime, ms
const BOOM_FRAME       = 4;    // atlas column: the brightest, most-spiked frame
const BOOM_SHARDS      = 9;    // debris streaks thrown by one burst
// Debris speed in px/s per px of burst radius, so bigger things throw wreckage
// further without each needing its own number.
const BOOM_SHARD_SPEED = 18;
const BOOM_DRAG        = 6.0;  // 1/s: streaks decelerate, topping out at speed/drag
const BOOM_SPIN        = 1.4;  // radians a puff turns over the whole life
// Hard ceiling on live bursts. Measured in game6: ~0.23 ms a burst on a
// software-rendered canvas, so 40 keeps the worst case near 12 ms. At the
// ceiling the OLDEST is dropped — the newest kill is the feedback being waited on.
const EXPLOSION_MAX    = 40;

// ---- Tunable impact (a hit landing on a ship or the planet) ----------------
const IMPACT_MS  = 300;
const IMPACT_R   = 7;    // logical px; the hulls are 17-20 across
const IMPACT_ROW = 1;    // the least spiky alien silhouette: a spark on armour

// ---- Tunable wreck (a ship's death) ------------------------------------------
// Not one big burst but a stutter of small ones in different colours, which is
// what reads as a ship coming apart rather than a bomb.
const WRECK_MS         = 520;
const WRECK_COUNT      = 8;
const WRECK_STAGGER_MS = 70;
const WRECK_SPREAD     = 12;    // px radius the sub-bursts scatter over
const WRECK_R          = [5, 10];
const WRECK_SPREAD_Y   = 1.3;   // the hull is taller than wide
const WRECK_ATLAS      = 'aliens';
const WRECK_SHIP_ROWS  = [0, 1];

// ---- Tunable meteor burst --------------------------------------------------
const METEOR_BOOM_MS  = 640;
const METEOR_BOOM_ROW = 3;      // the roundest silhouette, tinted in the rock's colours
const METEOR_CHIPS    = 3;      // smaller bursts thrown off the edge

// ---- Tunable planet death --------------------------------------------------
const PLANET_BOOMS      = 18;       // bursts strung along the horizon
const PLANET_BOOM_SPAN  = 2200;     // ms they go off over
const PLANET_BOOM_R     = [12, 30];
const PLANET_BOOM_MS    = 900;

function makeBurst(x, y, r, atlas, row, color, spark, tint, delayMs, life) {
  const shards = [];
  for (let i = 0; i < BOOM_SHARDS; i++) {
    shards.push({
      // Even angular slots with jitter inside each slot: a purely random spread
      // clumps, a perfectly even one reads as a mechanical asterisk.
      ang: (i + Math.random() * 0.85) * TAU / BOOM_SHARDS,
      spd: r * BOOM_SHARD_SPEED * (0.5 + Math.random() * 1.25),
      len: r * (0.45 + Math.random() * 0.7),
      alt: Math.random() < 0.4,   // drawn in `spark` rather than `color`
    });
  }
  return {
    x, y, r, atlas, row, color, spark, tint, shards,
    frame: BOOM_FRAME,
    // Two distorted copies of the silhouette, offset, squashed and counter-spun,
    // so the frame's round casing churns instead of reading as a glowing disc.
    puffs: [makePuff(0.30, 1.00), makePuff(0.55, 0.62)],
    // Starts negative for a staggered burst and is skipped until it turns positive.
    ms: -delayMs,
    life,
  };
}

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
  if (list.length >= EXPLOSION_MAX) list.shift();
  list.push(b);
}

// A killed enemy, in its own atlas row, untinted.
function explodeEnemy(list, e) {
  const sp = SpriteKit.ENEMY_SPRITES[ENEMY_TYPES[e.t].sprite];
  const b = makeBurst(e.x, e.y, e.dispW * 0.5, sp.atlas, sp.row, sp.color, sp.spark, null, 0, BOOM_MS);
  // The main puff sits on the hull that was there last frame, same angle, so the
  // blast grows out of the enemy instead of snapping to a new orientation.
  b.puffs[0].ox = 0;
  b.puffs[0].oy = 0;
  b.puffs[0].rot = e.rot;
  pushBurst(list, b);
  Sound.play('enemyExplosion');
}

// A destroyed meteor: a big burst in the rock's own colours, and a few chips.
function explodeMeteor(list, m) {
  const a = SpriteKit.ASTEROID_SPRITES[METEOR_TYPES[m.t].row];
  const r = m.dispW * 0.5;
  pushBurst(list, makeBurst(m.x, m.y, r, WRECK_ATLAS, METEOR_BOOM_ROW, a.color, a.spark,
                            rgbCss(a.color), 0, METEOR_BOOM_MS));
  for (let i = 0; i < METEOR_CHIPS; i++) {
    const ang = Math.random() * TAU, d = r * (0.4 + Math.random() * 0.5);
    pushBurst(list, makeBurst(m.x + Math.cos(ang) * d, m.y + Math.sin(ang) * d, r * 0.35,
                              WRECK_ATLAS, IMPACT_ROW, a.spark, a.color, rgbCss(a.spark),
                              60 + i * 70, BOOM_MS));
  }
  Sound.play('enemyExplosion');
}

// A hit landing on something, drawn at the point of contact, in the colour of
// whatever landed it — never the target's: the flash tells the player what hit.
function explodeImpact(list, x, y, color, spark, r) {
  pushBurst(list, makeBurst(x, y, r || IMPACT_R, WRECK_ATLAS, IMPACT_ROW,
                            color, spark, rgbCss(color), 0, IMPACT_MS));
}

// A ship's death: the hull's own two accents first, then the wreck palette,
// scattered over the hull and staggered into a ragged chain.
function explodeShip(list, s) {
  Sound.play('playerExplosion');
  const hull = SpriteKit.SHIP_SPRITES[s.row];
  const palette = [
    { color: hull.color, spark: hull.spark, row: WRECK_SHIP_ROWS[0] },
    { color: hull.spark, spark: hull.color, row: WRECK_SHIP_ROWS[1] },
  ].concat(SpriteKit.WRECK_PALETTE);

  pushBurst(list, makeBurst(s.x, s.y, s.dispW * 0.5, WRECK_ATLAS, palette[0].row,
                            palette[0].color, palette[0].spark, rgbCss(palette[0].color),
                            0, WRECK_MS + 140));
  for (let i = 1; i < WRECK_COUNT; i++) {
    const c = palette[i % palette.length];
    const a = Math.random() * TAU;
    // sqrt() so the offsets spread evenly over the disc instead of bunching.
    const d = Math.sqrt(Math.random()) * WRECK_SPREAD;
    pushBurst(list, makeBurst(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * WRECK_SPREAD_Y,
                              randRange(WRECK_R), WRECK_ATLAS, c.row, c.color, c.spark, rgbCss(c.color),
                              i * WRECK_STAGGER_MS * (0.6 + Math.random() * 0.8), WRECK_MS));
  }
}

// The planet's death: fire strung along the whole visible horizon, going off in
// a ragged sweep rather than all at once.
function explodePlanet(list) {
  Sound.play('playerExplosion');
  const pal = SpriteKit.WRECK_PALETTE;
  for (let i = 0; i < PLANET_BOOMS; i++) {
    const x = 16 + Math.random() * (CANVAS_W - 32);
    const y = planetSurfaceY(x) + Math.random() * 18;
    const c = pal[i % pal.length];
    // Past the ceiling on purpose: this is the last thing the run shows, and a
    // staggered burst dropped before it lit would leave a hole in the sweep.
    list.push(makeBurst(x, y, randRange(PLANET_BOOM_R), WRECK_ATLAS, c.row, c.color, c.spark,
                        rgbCss(c.color), Math.random() * PLANET_BOOM_SPAN, PLANET_BOOM_MS));
  }
}

function updateExplosions(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.ms += dt;
    if (b.ms >= b.life) list.splice(i, 1);
  }
}

// How far a debris streak has travelled at age `ms`: linear drag integrated in
// closed form, so a streak can never accumulate drift.
function shardDist(s, ms) {
  return (s.spd / BOOM_DRAG) * (1 - Math.exp(-BOOM_DRAG * ms / 1000));
}

// "r, g, b" -> a CSS colour. Also the tint cache's key, so it must be stable.
function rgbCss(triplet) {
  return 'rgb(' + triplet + ')';
}
