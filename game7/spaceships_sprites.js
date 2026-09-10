// ============================================================================
// spaceships_sprites.js — the portable sprite mapping for the five 1024x1024
// atlases that ship beside it. Frame manifests, animation sequences, measured
// palettes, blitting, collision radii and vector fallbacks — and nothing else:
// no game state, no gameplay balance, no update loop.
//
// Everything in here was MEASURED off the alpha channels rather than assumed,
// and several of the values are traps if guessed: the ship and projectile row
// pitches are uneven, the alien cells must be anchored on the alpha-weighted
// centroid rather than the bounding box, and the armed hulls cannot share one
// collision fraction. The comments are the measurement record. Re-measure, do
// not re-derive, if an atlas is ever re-exported.
//
// No build step, no import/export: one plain <script src> tag, one global.
//
//   interceptor_atlas.png      6 columns x 3 rows. Rows are the three playable
//                              hulls; columns are engine frames, 0-3 normal
//                              flight and 4-5 turbo. STRAIGHT alpha.
//   projectiles_atlas.png      5 columns x 5 rows. Rows are the five weapon
//                              particles; columns are an animation pulse.
//                              STRAIGHT alpha.
//   alien_noshoot_atlas.png    5 columns x 5 rows. Five tumbling enemies.
//                              PREMULTIPLIED — see the note on ENEMY_CELLS.
//   alien_shoot_atlas.png      5 columns x 5 rows. Five armed enemies. Shares
//                              the no-shoot atlas's cell grid EXACTLY.
//                              PREMULTIPLIED.
//   asteroid_sprite_atlas.png  3 columns x 3 rows. Three rocks.
//                              STRAIGHT alpha.
//
// None of these need a chroma-key pass and none need getImageData, which is why
// a game built on them also runs from file://. Nothing in this file reads pixels
// back — keep it that way.
//
// ---- Usage contract --------------------------------------------------------
// The manifests only work if the caller draws the way they assume:
//
//   * SHIPS ARE EDGE-ANCHORED. drawShip takes absolute (cx, cy) and centres the
//     HULL, not the frame, so the exhaust plume hangs below it.
//   * EVERYTHING ELSE DRAWS IN THE CURRENT TRANSFORM. Bullets, enemies,
//     asteroids and bursts assume the caller has already translated to the
//     entity and applied its rotation:
//         ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang);
//         SpriteKit.drawEnemy(ctx, 'aliens', row, frame, dispW);
//         ctx.restore();
//   * BULLETS PIVOT ON THE TIP, at the origin, body trailing below it.
//   * ALL SPRITES ARE AUTHORED NOSE-UP, so a heading IS the rotation with no
//     offset. Enemy columns are a glow pulse and not a rotation, so every bit
//     of turning in the game is ctx.rotate at draw time.
//   * ctx.imageSmoothingEnabled = true. This is crisp cel-shaded art with 1px
//     outlines but it is NOT pixel art on a pixel grid, and the maximum hull
//     downscale is only ~1.08x, so one smoothed drawImage is both sufficient
//     and correct. Nearest-neighbour at a fractional ratio chews the outlines.
//   * A MISSING ATLAS MUST NOT WEDGE THE GAME. Every sprite pairs its draw with
//     the matching vector placeholder:
//         if (SpriteKit.has('bullets')) SpriteKit.drawBullet(...);
//         else                          SpriteKit.drawBulletPlaceholder(...);
//   * BURSTS WANT COLUMN 4 — the brightest, most-spiked frame of an enemy row.
// ============================================================================

const SpriteKit = (function () {

  const TAU = Math.PI * 2;

  // ---- Ship frame manifest (measured from the atlas alpha channel) ----------
  // Per ship: the left edge of each of the 6 frames, plus ONE shared source box
  // (y/w/h) reused by every frame in the row.
  //
  // The shared box is deliberate and load-bearing:
  //   * Every frame in a row is top-anchored on the hull nose, and the exhaust
  //     plume only ever grows downward, so a fixed box keeps the hull perfectly
  //     still while the flame animates. Per-frame boxes would bob by 1-4px.
  //   * h is measured to the LONGEST plume in the row, so short-flame frames
  //     simply carry transparent space below. Row 1's biggest flame overruns a
  //     naive 1024/3 grid cell by 5px; this box includes it.
  //   * The boxes leave the inter-frame gutters unsampled, which excludes two
  //     stray specks in the source art (a 50x1 at 758,691 and a 1x5 at 681,494,
  //     both alpha 21). Do not "tidy" these rects into a computed grid.
  //
  // hullH is the frame-0 height — hull plus idle flame. Used as the draw anchor
  // so swapping ships keeps the hull centred, and as the hitbox basis.
  const SHIP_FRAMES = [
    { x: [15, 186, 356, 527, 698, 869], y:  12, w: 141, h: 321, hullH: 219 }, // 0 blue interceptor
    { x: [ 8, 179, 350, 520, 690, 861], y: 367, w: 154, h: 321, hullH: 229 }, // 1 grey/red heavy
    { x: [ 8, 179, 349, 520, 691, 861], y: 709, w: 155, h: 309, hullH: 251 }, // 2 white/green
  ];

  // ---- Projectile frame manifest (measured from the atlas alpha channel) ----
  // The projectile art has the same structure as the ship rows, which is what
  // lets ONE box size serve all 25 frames — only the origin changes:
  //   * Every frame in a row is top-anchored on the particle tip and the trail
  //     only ever grows downward (row 0 frames all start at y=22-23, row 4 at
  //     y=843-845), so a fixed box holds the head still while the trail animates.
  //   * The travel axis is stable to +/-0.8px per column across all five rows
  //     (101.4, 306.4, 511.4, 716.0, 921.2), so the boxes are centred on it and
  //     an angled shot pivots about the particle's real axis rather than drifting.
  //   * Of 196077 non-transparent pixels in the file, exactly 7 fall outside
  //     these boxes and all have alpha <= 7 — invisible fringe. Nothing visible
  //     is clipped, and the gutters stay unsampled.
  //   * Row pitch is UNEVEN (205/212/196/208). As with the ships, do not replace
  //     these arrays with a computed grid; re-measure the alpha channel if the
  //     atlas is ever re-exported.
  const BULLET_COLS = [53, 258, 463, 668, 873];  // per-frame left edges
  const BULLET_ROWS = [22, 227, 439, 635, 843];  // per-particle top edges
  const BULLET_W = 96;
  const BULLET_H = 176;

  // Head-bulb centre per row, in source px below the box top. This is the
  // projectile analogue of SHIP_FRAMES.hullH: where a hit circle should sit,
  // rather than on the faint leading tip.
  const BULLET_CORE_Y = [38, 40, 53, 43, 52];

  // ---- Enemy frame manifest (measured from the atlas alpha channel) ---------
  // BOTH enemy atlases: 5 columns x 5 rows. Rows are the five types; columns are
  // a charge/glow pulse (dull -> bright, spikes extending), NOT a rotation — so
  // all turning is ctx.rotate at draw time, which is also why every box here is
  // CENTRE-anchored rather than edge-anchored like the ships. Measured: the
  // non-transparent pixel count climbs monotonically across every row of both
  // files, which is a charge ramp and not a spin.
  //
  // Unlike the ship and projectile atlases, these really are a regular grid: the
  // alpha-weighted disc centroid sits on an even 204.75px pitch on BOTH axes
  // (102, 306.5, 511, 716, 921). One shared array therefore serves both axes and,
  // measured independently, both files — so the armed set needs no manifest of
  // its own, only its own image.
  //
  // Do NOT anchor these on the solid bounding box — spikes and glow inflate it
  // asymmetrically, which walks the apparent centre by up to 10px between frames
  // of one row. For a spinning sprite that shows up as the disc wobbling around
  // its own axis. The alpha-weighted centroid is the stable anchor: measured
  // across a row's five frames it drifts at most 2.8px on the tumbling atlas
  // against that same row set's 10.0px by bounding box.
  //
  // HOW WELL CENTRED THE ART IS DIFFERS BY ATLAS, and the numbers are worth
  // knowing before reusing these cells for anything that turns:
  //   * alien_noshoot: centroid within 1.9px of the cell centre, drifting <=2.8px
  //     across a row. These are the ones that SPIN, and that is why it matters
  //     that they measure this well.
  //   * alien_shoot: up to 7.2px off centre (row 1, the splayed-prong hull) and
  //     drifting up to 4.3px across a row (row 4). An asymmetric hull's ink
  //     simply does not balance about its own hull centre, and the art is
  //     registered on the hull. HARMLESS AS USED, because every armed row has
  //     spin 0 — an off-centre pivot on a sprite that never rotates is just the
  //     hull sitting ~1.3 logical px off its nominal centre at dispW 38-42. But
  //     IF YOU EVER SPIN AN ARMED HULL, expect that wobble and offset the draw.
  //
  // Box is 204x204: content reaches at most r=120 from the centre (diagonally,
  // out along the spikes), so a half-size of 102 clears it on every axis while
  // leaving 1px gutters at 204/613/818, and stopping the last column at 1022.
  //
  // DO NOT WIDEN THE BOX OR EXTEND THE LAST COLUMN TO CLOSE THOSE GUTTERS. What
  // the cells currently exclude, measured:
  //   * alien_shoot: exactly ONE non-transparent pixel of 1,048,576, at
  //     (922, 204) with alpha 11.
  //   * alien_noshoot: 25 pixels. Thirteen are alpha-12 fringe in the gutters —
  //     but TEN ARE FULLY OPAQUE, a 12px-tall run at x=1023, y=302-313. That is
  //     the extreme right edge of the file, one pixel past cell column 4, and it
  //     is a stray mark in the source art rather than a clipped sprite. Widening
  //     the box to 205 would stamp it into the Warden's cell. This is the same
  //     trap the two specks in the ship atlas set.
  //
  // BOTH ALIEN ATLASES ARE PREMULTIPLIED, unlike the other three. Measured, not
  // assumed: of the no-shoot atlas's 38,239 partial-alpha pixels ZERO have any
  // channel exceeding alpha (and 0 of 20,633 in the armed one), which is
  // impossible for straight alpha on art with bright glow.
  //   * Canvas source-over assumes straight alpha, so partial-alpha pixels
  //     composite darker than intended by a factor of alpha. Against a
  //     near-black background the error measures mean 3.8/255, max 23/255, over
  //     0.9% of the atlas — invisible in practice, which is why it is drawn
  //     as-is.
  //   * DO NOT "fix" this at runtime. Un-premultiplying needs getImageData,
  //     which throws on file://. Fix the asset offline and re-measure instead.
  //   * The error scales with background brightness. RE-CHECK THIS if the new
  //     game puts these sprites over a lighter backdrop — the same art over a
  //     light wash would show real fringes.
  const ENEMY_CELLS = [0, 205, 409, 614, 819];  // box left/top per index
  const ENEMY_BOX = 204;

  // Default disc radius as a fraction of the box half-size, measured from the
  // frame-0 solid body (74-84 source px against a 102px half-box) with the spikes
  // and glow excluded. The collision basis — deliberately the metal hull, so a
  // near miss through the glow is a miss.
  //
  // This one number serves the whole no-shoot atlas because its five discs are
  // all within 0.73-0.82 of the half-box. The armed hulls are NOT: they measure
  // 0.78 / 0.47 / 0.60 / 0.62 / 0.65, because a hull with splayed prongs (row 1)
  // has far less solid body inside its footprint than a saucer does. A single
  // average there would give the prong-winged types a hitbox a third wider than
  // the metal, so those rows carry their own `disc` in ENEMY_SPRITES and pass it
  // to enemyHitRadius.
  const ENEMY_DISC_FRAC = 0.76;

  // ---- Asteroid frame manifest (measured from the alpha channel) ------------
  // asteroid_sprite_atlas.png: 1024x1024, 3 columns x 3 rows.
  //   Rows are the three rocks — grey/tan, magenta, azure.
  //   Columns are a brightening PULSE, not a rotation. Both mean body colour and
  //   content radius climb monotonically across every row (r90 of 130/131/139,
  //   130/141/142, 132/133/144), exactly as the two alien atlases do. So the
  //   frames animate the light on a rock and every bit of TURNING is ctx.rotate
  //   at draw time — which is why these boxes are centre-anchored like the
  //   enemies' and not edge-anchored like the ships'.
  //
  // This is the one atlas where the naive grid is also the correct one, and it
  // was measured before being trusted: the alpha-weighted centroids sit within
  // 1.3px of an even 341.33 thirds grid on both axes (x measured 169.9-170.8 /
  // 511.8-512.8 / 852.7-853.6, y 169.7-170.6 / 510.3-510.9 / 852.3-852.6), and
  // every cell's content bbox falls inside its own grid cell. At the ~30-58
  // logical px these draw at, 1.3 source px is under 0.25 logical px — nothing
  // like the 8px centroid walk that forced measured anchors on the alien atlas.
  //
  // STRAIGHT alpha, unlike BOTH alien atlases: 1651 of its 7504 partial-alpha
  // pixels carry a channel above their own alpha, which premultiplied art cannot
  // do. So it composites as authored and none of the premultiplied caveats above
  // apply to it — including the one about a lighter backdrop.
  const ASTEROID_CELLS = [0, 341, 683];
  const ASTEROID_BOX = 341;

  // Solid-body radius as a fraction of the half-box, for collision.
  //
  // Measured off frame 0 of each row — the un-pulsed frame, i.e. the rock without
  // its glow. An alpha-weighted 90th-percentile radius of 130.0/130.0/131.6
  // implies a filled-disc radius of ~137-139 (for a disc, r90 = sqrt(0.9) * R),
  // which is 0.80-0.81 of the 170.5 half-box. All three rows agree to within
  // 0.01, so one constant serves them the way ENEMY_DISC_FRAC serves the tumbling
  // discs rather than each row carrying its own like the armed hulls.
  //
  // Taking it from frame 0 rather than averaging the pulse leaves the hitbox just
  // inside the art at the peak of the glow, which is the forgiving direction for
  // something whose whole job is to be dodged.
  const ASTEROID_DISC_FRAC = 0.80;

  // ---- Animation cadences ---------------------------------------------------
  // Milliseconds per frame. Declared here rather than pulled from a host
  // project's constants file so this module stays self-contained.
  const ANIM = {
    SHIP_FRAME_MS: 90,    // per engine-animation frame during normal flight
    TURBO_FRAME_MS: 55,   // faster flicker while a turbo burst is active
    BULLET_FRAME_MS: 60,  // per projectile-particle frame; fast enough to crackle
  };

  // ---- Animation sequences --------------------------------------------------
  // EVERY atlas in this set has monotonic columns — the plume grows, the alien
  // glow charges, the rock brightens — so a linear 0->N loop snaps from the
  // brightest state back to the dullest once per cycle. Bouncing back down
  // instead reads as a pulse. That is the single reason all four of these
  // ping-pong; swap in a linear sequence only if the pop is actually wanted.

  // Which ship columns belong to which flight mode: 0-3 normal, 4-5 turbo.
  const FLIGHT_FRAMES = {
    normal: [0, 1, 2, 3, 2, 1],
    turbo: [4, 5],
  };

  const BULLET_FRAMES   = [0, 1, 2, 3, 4, 3, 2, 1];
  const ENEMY_FRAMES    = [0, 1, 2, 3, 4, 3, 2, 1];
  const ASTEROID_FRAMES = [0, 1, 2, 1];

  // ---- Ship sprites ---------------------------------------------------------
  // The three playable hulls, in atlas row order.
  //
  // `dispW` is on-screen width in logical px. KEEP IT AT OR BELOW 48: frames are
  // 141-155px wide, so at a 3x backing scale 48 logical px is ~144 device px,
  // i.e. essentially 1:1. Larger values upscale the sprite and the 1px outlines
  // visibly soften.
  //
  // `color`/`spark` are the hull's two accent colours, so a wreck or an impact
  // flash can be built from the ship's own paint. MEASURED, not eyeballed: each
  // row's frame 0 was hue-clustered over its fully-opaque hull pixels (the plume
  // excluded, since that is engine glow rather than hull), and these are the two
  // strongest clusters. Format is "r, g, b" so alpha composes at draw time.
  const SHIP_SPRITES = [
    { name: 'Interceptor', dispW: 42,
      color: '65, 118, 162',  spark: '227, 141, 74'  },   // steel blue + orange
    { name: 'Warhammer',   dispW: 46,
      color: '197, 92, 51',   spark: '252, 225, 110' },   // rust red + brass
    { name: 'Verdant',     dispW: 46,
      color: '97, 179, 130',  spark: '87, 150, 160'  },   // green + pale teal
  ];

  // ---- Particle sprites -----------------------------------------------------
  // One entry per ROW of projectiles_atlas.png. MEASURED the same way the hull
  // colours were: each row's frame 2 was hue-clustered, `color` being the
  // particle body and `spark` its highlight. Mystic and Lightning are
  // single-hued in the art, so their spark is that hue lightened toward white.
  //
  // Indexed by atlas row rather than by weapon, so both sides of a fight can
  // read the same entry — one measurement, two readers.
  //
  // `dispW` is a display default, not a measurement. These draw at roughly a 7x
  // downscale and that is fine: the near-1:1 rule above exists to protect the
  // hulls' hard outlines, and soft glow has nothing for a fractional filter to
  // chew. (The game these came from drew the same rows 1px narrower for incoming
  // fire than for the player's, on row 0 only — cosmetic, so one value serves.)
  const PARTICLE_SPRITES = [
    { key: 'spark',     row: 0, dispW: 13, color: '38, 88, 167',  spark: '111, 242, 252' },
    { key: 'plasma',    row: 1, dispW: 16, color: '102, 202, 76', spark: '238, 248, 169' },
    { key: 'mystic',    row: 2, dispW: 12, color: '187, 54, 193', spark: '229, 138, 233' },
    { key: 'fury',      row: 3, dispW: 15, color: '224, 103, 30', spark: '252, 237, 97'  },
    { key: 'lightning', row: 4, dispW: 14, color: '198, 176, 54', spark: '246, 240, 190' },
  ];

  // ---- Enemy sprites --------------------------------------------------------
  // ONE table for both halves of the roster: the five tumbling types from
  // alien_noshoot_atlas.png and, below them, the five armed types from
  // alien_shoot_atlas.png. `atlas` says which image the row indexes, which is
  // what lets a consumer index this table without learning that there are two
  // files.
  //
  // `spin` is degrees/s applied at draw time (negative = counter-clockwise).
  // The atlas columns are a glow pulse and not a rotation, so all turning is
  // ctx.rotate — and the armed hulls all have a NOSE, every one of them facing
  // up the screen, so their spin is 0 and their heading is chosen by the game
  // instead.
  //
  // `frameMs` is that row's own pulse cadence, in ms per frame.
  //
  // `disc` is a collision fraction of the half-box and appears ONLY on the armed
  // rows — see ENEMY_DISC_FRAC above for why those five cannot share one number
  // and the tumbling five can.
  //
  // `color`/`spark` are the row's hull colours, for a death burst that reads as
  // that specific enemy coming apart. MEASURED the same way the ship colours
  // were but off FRAME 4 rather than frame 0: frame 4 is the fully charged
  // state, which is both the brightest sample of the row's identity hue and the
  // frame a burst silhouette itself uses. The clusters come out one per row
  // cleanly — teal, blue, red, orange, magenta. `spark` is the second measured
  // cluster where the row has one; where the art is single-hued it is that hue
  // lightened 55% toward white, and the two rows that needed a judgement call
  // are noted inline.
  const ENEMY_SPRITES = [
    { key: 'sentinel', name: 'Sentinel', atlas: 'aliens', row: 0,
      dispW: 40, spin: 40, frameMs: 90,
      color: '70, 187, 207', spark: '92, 183, 134' },     // teal + green

    { key: 'warden', name: 'Warden', atlas: 'aliens', row: 1,
      dispW: 44, spin: -30, frameMs: 110,
      color: '50, 138, 205', spark: '97, 203, 193' },     // blue + pale cyan

    { key: 'lancer', name: 'Lancer', atlas: 'aliens', row: 2,
      dispW: 38, spin: 200, frameMs: 70,
      color: '198, 45, 38', spark: '251, 201, 95' },      // red + gold

    { key: 'bulwark', name: 'Bulwark', atlas: 'aliens', row: 3,
      dispW: 48, spin: 25, frameMs: 120,
      color: '210, 112, 35', spark: '254, 241, 130' },    // orange + yellow

    { key: 'phantom', name: 'Phantom', atlas: 'aliens', row: 4,
      dispW: 40, spin: -140, frameMs: 80,
      color: '196, 46, 185', spark: '228, 161, 223' },    // magenta + lightened

    // ---- Armed types (alien_shoot_atlas.png) --------------------------------
    { key: 'marauder', name: 'Marauder', atlas: 'shooters', row: 0,
      dispW: 40, spin: 0, frameMs: 95, disc: 0.78,
      // Cluster 2 (pale cyan) is far brighter than cluster 1 (indigo), which is
      // what a fireball wants: `color` cools the mid-stop and `spark` lights the
      // core.
      color: '56, 52, 109', spark: '167, 245, 249' },     // indigo + pale cyan

    { key: 'harrier', name: 'Harrier', atlas: 'shooters', row: 1,
      dispW: 38, spin: 0, frameMs: 80, disc: 0.47,
      // The second-strongest cluster here was another green — a shade of the
      // first, not a second colour — so the spark is the third, an olive gold of
      // near-identical weight and a genuinely different hue. A burst built from
      // two greens reads as one flat green blob.
      color: '58, 161, 115', spark: '159, 152, 95' },     // green + olive gold

    { key: 'reaver', name: 'Reaver', atlas: 'shooters', row: 2,
      dispW: 36, spin: 0, frameMs: 85, disc: 0.60,
      // Single-hued art, like Phantom: the spark is that hue lightened 55%
      // toward white, the same figure measured off Phantom's own two clusters.
      color: '139, 58, 63', spark: '203, 166, 169' },     // dark red + lightened

    { key: 'stalker', name: 'Stalker', atlas: 'shooters', row: 3,
      dispW: 42, spin: 0, frameMs: 90, disc: 0.62,
      color: '34, 74, 129', spark: '121, 238, 248' },     // deep blue + cyan

    { key: 'corsair', name: 'Corsair', atlas: 'shooters', row: 4,
      dispW: 40, spin: 0, frameMs: 88, disc: 0.65,
      color: '145, 52, 58', spark: '253, 245, 178' },     // red + pale yellow
  ];

  // ---- Asteroid sprites -----------------------------------------------------
  // The art gives all three rocks the same body radius and the same pulse, so
  // colour is the only thing that differs between them — which is deliberate
  // rather than lazy: a player reads a rock's threat off its trajectory, and if
  // size or spin were a property of the colour then the colour would become a
  // tell and three rocks would be three enemies. Roll size, speed, heading, spin
  // and animation phase per spawn instead.
  //
  // `color` is the row's MEASURED mean body colour — (81,72,67), (76,42,71),
  // (28,72,98) off the middle frame — scaled up in luminance so it reads against
  // a near-black field. `spark` is the colour of the CRYSTAL inclusions the pulse
  // lights up, rather than a whitened body: the crystals are what tells the three
  // rocks apart at a glance, so they are what a strike should flash in.
  const ASTEROID_SPRITES = [
    { key: 'grey',    row: 0, color: '150, 133, 124', spark: '255, 178, 82'  },
    { key: 'magenta', row: 1, color: '160, 88, 149',  spark: '232, 138, 255' },
    { key: 'azure',   row: 2, color: '56, 144, 196',  spark: '120, 240, 255' },
  ];

  // ---- Wreck palette --------------------------------------------------------
  // Colours for a multi-stage wreck: a stutter of sub-bursts in DIFFERENT
  // colours, which is what stops one collapsing into a single warm blob. Every
  // entry but the first is one of the particle colours above rather than a second
  // copy of them, on the reading that what cooks off is the magazine.
  //
  // It also serves as the pool an UNATTRIBUTED hit draws from, which is why it
  // wants to stay a spread of hues rather than a fire ramp: a random pick out of
  // it has to look chosen.
  //
  // `row` picks which alien silhouette the sub-burst tints. Fixed per entry
  // rather than random, so the tint cache stays bounded at one canvas per entry.
  // A new debris colour is a new row here and nothing else.
  // Only `color`/`spark` are taken from the particle rows — not a whole spread of
  // them, since a `dispW` carried in here would read as a debris size and is not
  // one.
  const WRECK_PALETTE = [
    { color: '252, 225, 110', spark: '255, 251, 235', row: 3 },  // brass, white-hot
    { color: PARTICLE_SPRITES[0].color, spark: PARTICLE_SPRITES[0].spark, row: 0 },
    { color: PARTICLE_SPRITES[1].color, spark: PARTICLE_SPRITES[1].spark, row: 1 },
    { color: PARTICLE_SPRITES[2].color, spark: PARTICLE_SPRITES[2].spark, row: 4 },
    { color: PARTICLE_SPRITES[3].color, spark: PARTICLE_SPRITES[3].spark, row: 2 },
    { color: PARTICLE_SPRITES[4].color, spark: PARTICLE_SPRITES[4].spark, row: 3 },
  ];

  // The brightest, most-spiked enemy column — the frame a burst silhouette
  // wants, and the frame the hull colours above were measured off.
  const BOOM_FRAME = 4;

  // Cache for tinted(): "atlas|row|frame|css" -> recoloured canvas. Private,
  // because nothing outside needs to know the recolour is memoised.
  const tintCache = {};

  const kit = {
    // ---- Config -------------------------------------------------------------
    // Set basePath before calling load() if the atlases live elsewhere.
    basePath: 'assets/sprites/',
    FILES: {
      ships: 'interceptor_atlas.png',
      bullets: 'projectiles_atlas.png',
      aliens: 'alien_noshoot_atlas.png',
      shooters: 'alien_shoot_atlas.png',
      asteroids: 'asteroid_sprite_atlas.png',
    },

    // ---- Runtime state ------------------------------------------------------
    imgs: {},       // key -> decoded HTMLImageElement; absent if that load failed
    ready: false,   // every source has settled, loaded or not
    failed: false,  // at least one source failed to load

    // ---- Manifests (exposed so a consumer can re-derive geometry) -----------
    SHIP_FRAMES, BULLET_COLS, BULLET_ROWS, BULLET_W, BULLET_H, BULLET_CORE_Y,
    ENEMY_CELLS, ENEMY_BOX, ENEMY_DISC_FRAC,
    ASTEROID_CELLS, ASTEROID_BOX, ASTEROID_DISC_FRAC,

    // ---- Animation ----------------------------------------------------------
    ANIM, FLIGHT_FRAMES, BULLET_FRAMES, ENEMY_FRAMES, ASTEROID_FRAMES,

    // ---- Sprite tables ------------------------------------------------------
    SHIP_SPRITES, PARTICLE_SPRITES, ENEMY_SPRITES, ASTEROID_SPRITES,
    WRECK_PALETTE, BOOM_FRAME,

    load(onDone) {
      const keys = Object.keys(this.FILES);
      let pending = keys.length;
      for (const key of keys) {
        const img = new Image();
        const settle = (ok) => {
          // A missing atlas must not wedge the game: each image degrades to its
          // own vector placeholder below, so the rest stays playable.
          if (ok) kit.imgs[key] = img;
          else kit.failed = true;
          if (--pending === 0) {
            kit.ready = true;
            if (onDone) onDone(!kit.failed);
          }
        };
        img.onload = () => settle(true);
        img.onerror = () => settle(false);
        img.src = this.basePath + this.FILES[key];
      }
    },

    has(key) {
      return !!kit.imgs[key];
    },

    // ---- Frame pickers ------------------------------------------------------
    // Pure functions of elapsed milliseconds, so they assume nothing about how
    // the host project shapes its entities. Pass a per-entity animation offset by
    // adding it to the ms argument if staggered phase is wanted.

    shipFrame(animMs, turbo) {
      const seq = turbo ? FLIGHT_FRAMES.turbo : FLIGHT_FRAMES.normal;
      const step = turbo ? ANIM.TURBO_FRAME_MS : ANIM.SHIP_FRAME_MS;
      return seq[Math.floor(animMs / step) % seq.length];
    },

    bulletFrame(animMs) {
      const i = Math.floor(animMs / ANIM.BULLET_FRAME_MS) % BULLET_FRAMES.length;
      return BULLET_FRAMES[i];
    },

    // frameMs is the type's own cadence — ENEMY_SPRITES[i].frameMs.
    enemyFrame(animMs, frameMs) {
      return ENEMY_FRAMES[Math.floor(animMs / frameMs) % ENEMY_FRAMES.length];
    },

    asteroidFrame(animMs, frameMs) {
      const i = Math.floor(animMs / frameMs) % ASTEROID_FRAMES.length;
      return ASTEROID_FRAMES[i];
    },

    // ---- Blitting -----------------------------------------------------------

    // Draw ship `shipIdx` frame `frame` with its hull centred on (cx, cy) and
    // scaled to `dispW` logical px wide. The plume extends below the hull.
    drawShip(ctx, shipIdx, frame, cx, cy, dispW) {
      const img = kit.imgs.ships;
      if (!img) return;
      const f = SHIP_FRAMES[shipIdx];
      const scale = dispW / f.w;
      ctx.drawImage(
        img,
        f.x[frame], f.y, f.w, f.h,
        cx - dispW / 2, cy - (f.hullH * scale) / 2, dispW, f.h * scale
      );
    },

    // On-screen hull height for a ship drawn `dispW` wide — the collision basis,
    // the muzzle offset (the nose is at cy - hullHeight/2), and the playfield
    // clamp.
    hullHeight(shipIdx, dispW) {
      const f = SHIP_FRAMES[shipIdx];
      return f.hullH * (dispW / f.w);
    },

    // Draw projectile particle `row` frame `frame` in the CURRENT transform: the
    // caller has already translated to the bullet and rotated to its heading, so
    // this only lays the box down with the tip at the origin, hanging below it.
    // That keeps the rotation pivot on the particle's leading point.
    drawBullet(ctx, row, frame, dispW) {
      const img = kit.imgs.bullets;
      if (!img) return;
      ctx.drawImage(
        img,
        BULLET_COLS[frame], BULLET_ROWS[row], BULLET_W, BULLET_H,
        -dispW / 2, 0, dispW, dispW * (BULLET_H / BULLET_W)
      );
    },

    // Draw enemy type `row` frame `frame` from enemy atlas `key` ('aliens' or
    // 'shooters') in the CURRENT transform, centred on the origin, `dispW`
    // logical px across. The caller has already translated to the enemy and
    // applied its rotation, so the box being centre-anchored means a tumbling
    // disc turns about its own axis and an armed hull pivots about its own middle
    // rather than swinging off one.
    drawEnemy(ctx, key, row, frame, dispW) {
      const img = kit.imgs[key];
      if (!img) return;
      ctx.drawImage(
        img,
        ENEMY_CELLS[frame], ENEMY_CELLS[row], ENEMY_BOX, ENEMY_BOX,
        -dispW / 2, -dispW / 2, dispW, dispW
      );
    },

    // Draw asteroid `row` frame `frame` in the CURRENT transform, centred on the
    // origin, `dispW` logical px across. Centre-anchored for the same reason the
    // enemies are: the caller has applied the spin.
    drawAsteroid(ctx, row, frame, dispW) {
      const img = kit.imgs.asteroids;
      if (!img) return;
      ctx.drawImage(
        img,
        ASTEROID_CELLS[frame], ASTEROID_CELLS[row], ASTEROID_BOX, ASTEROID_BOX,
        -dispW / 2, -dispW / 2, dispW, dispW
      );
    },

    // ---- Collision ----------------------------------------------------------

    // Collision radius for an enemy drawn `dispW` across — the solid hull, not
    // the glow. `frac` is the type's own measured body fraction; omit it for the
    // tumbling discs, which all sit close enough to share ENEMY_DISC_FRAC.
    enemyHitRadius(dispW, frac) {
      return (dispW / 2) * (frac || ENEMY_DISC_FRAC);
    },

    // Collision radius for a rock drawn `dispW` across. One fraction for all
    // three rows — see the note on ASTEROID_DISC_FRAC.
    asteroidHitRadius(dispW) {
      return (dispW / 2) * ASTEROID_DISC_FRAC;
    },

    // ---- Explosions ---------------------------------------------------------
    // There is no explosion atlas in this set, and none is needed: an enemy
    // frame is already a radial spike-and-glow burst, which is the shape wanted.
    // A killed enemy's fireball uses ITS OWN row and needs no tinting at all, so
    // the burst matches the hull for free. Anything that needs a colour no alien
    // has — a player wreck, say — passes `tintCss`.
    //
    // Draws in the CURRENT transform, centred on the origin, `dispW` across.
    // `key` comes along because an armed enemy has to borrow its own atlas, not
    // the tumbling one, or its wreck would be the wrong ship.
    //
    // This is the single entry point a burst draws through, so dropping in a real
    // explosion atlas later is a manifest change here and nothing else.
    drawBurst(ctx, key, row, frame, dispW, tintCss) {
      if (tintCss) {
        const c = kit.tinted(key, row, frame, tintCss);
        if (c) {
          ctx.drawImage(c, -dispW / 2, -dispW / 2, dispW, dispW);
          return;
        }
      }
      kit.drawEnemy(ctx, key, row, frame, dispW);
    },

    // Cached recolour of one atlas cell, built on first use. Bounded by the
    // palette times the rows it names — a handful of 204px canvases for a whole
    // session.
    tinted(atlasKey, row, frame, css) {
      const img = kit.imgs[atlasKey];
      if (!img) return null;
      const key = atlasKey + '|' + row + '|' + frame + '|' + css;
      if (tintCache[key]) return tintCache[key];

      const c = document.createElement('canvas');
      c.width = ENEMY_BOX;
      c.height = ENEMY_BOX;
      const g = c.getContext('2d');
      const sx = ENEMY_CELLS[frame], sy = ENEMY_CELLS[row];
      const blit = () => g.drawImage(img, sx, sy, ENEMY_BOX, ENEMY_BOX,
                                     0, 0, ENEMY_BOX, ENEMY_BOX);

      blit();
      // 'color' takes hue and saturation from the fill and keeps the BACKDROP's
      // luminosity, so the glow's internal shading and its dark outline survive
      // the recolour — a flat 'source-in' silhouette would throw both away.
      g.globalCompositeOperation = 'color';
      g.fillStyle = css;
      g.fillRect(0, 0, ENEMY_BOX, ENEMY_BOX);
      // A blend mode composites across the whole rect, including the transparent
      // margin, so the sprite's own alpha has to be stamped back over the result.
      g.globalCompositeOperation = 'destination-in';
      blit();

      // Note this reads no pixels back — drawing an image into a canvas taints it
      // but only getImageData would throw, so this still works from file://. If a
      // browser ever lacks the 'color' blend it degrades to source-over and the
      // burst becomes a flat colour silhouette, which is dimmer but not broken.
      tintCache[key] = c;
      return c;
    },

    // ---- Vector placeholders ------------------------------------------------
    // Reached only when an atlas fails to load, so movement, collision and the
    // feel of the game stay testable without art. Pair each with has():
    //   if (SpriteKit.has('aliens')) SpriteKit.drawEnemy(...);
    //   else                         SpriteKit.drawEnemyPlaceholder(...);
    // All of these draw centred on the origin, so a spin still reads.

    // A reticle, deliberately unlike any finished sprite.
    drawEnemyPlaceholder(ctx, dispW) {
      const r = dispW * 0.38;
      ctx.strokeStyle = '#c76b8a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.stroke();
    },

    // Drawn in the bullet's local space: tip at the origin, body trailing behind
    // it, matching drawBullet's anchor.
    drawBulletPlaceholder(ctx, dispW) {
      const w = dispW * 0.5;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w / 2, w * 2);
      ctx.lineTo(-w / 2, w * 2);
      ctx.closePath();
      ctx.fill();
    },

    // A flat lumpy polygon in the rock's own colours: obviously provisional, and
    // enough to dodge. `color`/`spark` are "r, g, b" strings from
    // ASTEROID_SPRITES.
    drawAsteroidPlaceholder(ctx, dispW, color, spark) {
      const r = dispW / 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const th = (i / 9) * TAU;
        // A fixed wobble, not a random one: this runs every frame, and a radius
        // rolled per frame would boil rather than spin.
        const rr = r * (0.78 + 0.22 * Math.abs(Math.sin(i * 2.4)));
        const x = Math.cos(th) * rr, y = Math.sin(th) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${color}, 0.85)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${spark}, 0.55)`;
      ctx.stroke();
    },

    // A nose-up dart. Note this is CENTRE-anchored where the real drawShip is
    // hull-anchored on an absolute point: a placeholder has no plume to hang
    // below the hull, so the caller translates to the ship first, as it does for
    // every other placeholder here.
    drawShipPlaceholder(ctx, dispW) {
      const w = dispW, h = w * 1.5;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
    },
  };

  return kit;
})();
