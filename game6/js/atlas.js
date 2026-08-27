// ============================================================================
// atlas.js — sprite atlas loading and blitting. Owns the frame manifests and
// nothing else: no game state, no gameplay decisions.
//
// All four atlases are 1024x1024 and need no chroma-key pass and no
// getImageData, which is why the game also runs from file://. The two hull/
// particle atlases carry straight alpha; the two ALIEN atlases are
// premultiplied and are drawn as-is on purpose (CLAUDE.md §6).
//
// interceptor_atlas.png:   6 columns x 3 rows. Rows are the three playable
//   ships; columns are engine frames, 0-3 normal flight and 4-5 turbo.
// projectiles_atlas.png:   5 columns x 5 rows. Rows are the five weapon
//   particles; columns are animation frames, cycled ping-pong (see data.js).
// alien_noshoot_atlas.png: 5 columns x 5 rows. The five tumbling enemies.
// alien_shoot_atlas.png:   5 columns x 5 rows. The five armed enemies. Shares
//   the no-shoot atlas's cell grid exactly — see ENEMY_CELLS below.
// ============================================================================

const ATLAS_SOURCES = {
  ships: 'assets/sprites/interceptor_atlas.png',
  bullets: 'assets/sprites/projectiles_atlas.png',
  aliens: 'assets/sprites/alien_noshoot_atlas.png',
  shooters: 'assets/sprites/alien_shoot_atlas.png',
  asteroids: 'assets/sprites/asteroid_sprite_atlas.png',
};

// ---- Ship frame manifest (measured from the atlas alpha channel) -----------
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
// so swapping ships keeps the hull centred, and as the future hitbox basis.
const SHIP_FRAMES = [
  { x: [15, 186, 356, 527, 698, 869], y:  12, w: 141, h: 321, hullH: 219 }, // 0 blue interceptor
  { x: [ 8, 179, 350, 520, 690, 861], y: 367, w: 154, h: 321, hullH: 229 }, // 1 grey/red heavy
  { x: [ 8, 179, 349, 520, 691, 861], y: 709, w: 155, h: 309, hullH: 251 }, // 2 white/green
];

// ---- Projectile frame manifest (measured from the atlas alpha channel) -----
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

// Head-bulb centre per row, in source px below the box top. Unused until
// collision exists — it is the projectile analogue of SHIP_FRAMES.hullH, i.e.
// where a hit circle should sit rather than on the faint leading tip.
const BULLET_CORE_Y = [38, 40, 53, 43, 52];

// ---- Enemy frame manifest (measured from the atlas alpha channel) ----------
// BOTH enemy atlases: 5 columns x 5 rows. Rows are the five types; columns are
// a charge/glow pulse (dull -> bright, spikes extending), NOT a rotation — so
// all turning is ctx.rotate at draw time, which is also why every box here is
// CENTRE-anchored rather than edge-anchored like the ships. Measured: the
// non-transparent pixel count climbs monotonically across every row of both
// files, which is a charge ramp and not a spin.
//
// Unlike the ship and projectile atlases, these really are a regular grid: the
// alpha-weighted disc centroid sits on an even 204.75px pitch on BOTH axes
// (102, 306.5, 511, 716, 921) and is stable to ~2px across a row's five frames.
// One shared array therefore serves both axes — and, measured independently,
// both files: of alien_shoot_atlas.png's 1,048,576 pixels exactly ONE
// non-transparent pixel falls outside these cells, at (922, 204) with alpha 11.
// So the armed set needs no manifest of its own, only its own image.
//
// Do NOT anchor these on the solid bounding box — spikes and glow inflate it
// asymmetrically, which walks the apparent centre by up to 8px between frames
// (row 0 frame 3 measures y=110.5 against y=102 for its neighbours). For a
// spinning sprite that shows up as the disc wobbling around its own axis. The
// alpha-weighted centroid is the stable anchor and is what these cells use.
//
// Box is 204x204: content reaches at most r=120 from the centre (diagonally,
// out along the spikes), so a half-size of 102 clears it on every axis while
// leaving 1px gutters at 204/613/818 that keep neighbouring glow unsampled.
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
// the metal, so those rows carry their own `disc` in ENEMY_TYPES and pass it
// in below.
const ENEMY_DISC_FRAC = 0.76;

// ---- Asteroid frame manifest (measured from the alpha channel) -------------
// asteroid_sprite_atlas.png: 1024x1024, 3 columns x 3 rows.
//   Rows are the three rocks — grey/tan, magenta, azure.
//   Columns are a brightening PULSE, not a rotation. Both mean body colour and
//   content radius climb monotonically across every row (r90 of 130/131/139,
//   130/141/142, 132/133/144), exactly as the two alien atlases do. So the
//   frames animate the light on a rock and every bit of TURNING is ctx.rotate
//   at draw time — which is why these boxes are centre-anchored like the
//   enemies' and not edge-anchored like the ships'.
//
// This is the one atlas in the game where the naive grid is also the correct
// one, and it was measured before being trusted: the alpha-weighted centroids
// sit within 1.3px of an even 341.33 thirds grid on both axes (x measured
// 169.9-170.8 / 511.8-512.8 / 852.7-853.6, y 169.7-170.6 / 510.3-510.9 /
// 852.3-852.6), and every cell's content bbox falls inside its own grid cell.
// At the ~30-58 logical px these draw at, 1.3 source px is under 0.25 logical
// px — nothing like the 8px centroid walk that forced per-cell anchors on the
// no-shoot atlas (CLAUDE.md §6). Re-measure if the atlas is re-exported.
//
// STRAIGHT alpha, unlike BOTH alien atlases: 1651 of its 7504 partial-alpha
// pixels carry a channel above their own alpha, which premultiplied art cannot
// do. So it composites as authored and none of §6's premultiplied caveats
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

const Atlas = {
  imgs: {},         // key -> decoded HTMLImageElement; absent if that load failed
  ready: false,     // every source has settled, loaded or not
  failed: false,    // at least one source failed to load
  tintCache: {},    // "atlas|row|frame|css" -> recoloured canvas; see tinted()

  load(onDone) {
    const keys = Object.keys(ATLAS_SOURCES);
    let pending = keys.length;
    for (const key of keys) {
      const img = new Image();
      const settle = (ok) => {
        // A missing atlas must not wedge the game: each image degrades to its
        // own vector placeholder in render.js, so the rest stays playable.
        if (ok) this.imgs[key] = img;
        else this.failed = true;
        if (--pending === 0) {
          this.ready = true;
          if (onDone) onDone(!this.failed);
        }
      };
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = ATLAS_SOURCES[key];
    }
  },

  has(key) {
    return !!this.imgs[key];
  },

  // Draw ship `shipIdx` frame `frame` with its hull centred on (cx, cy) and
  // scaled to `dispW` logical px wide. The plume extends below the hull.
  drawShip(ctx, shipIdx, frame, cx, cy, dispW) {
    const img = this.imgs.ships;
    if (!img) return;
    const f = SHIP_FRAMES[shipIdx];
    const scale = dispW / f.w;
    ctx.drawImage(
      img,
      f.x[frame], f.y, f.w, f.h,
      cx - dispW / 2, cy - (f.hullH * scale) / 2, dispW, f.h * scale
    );
  },

  // On-screen hull height for a ship drawn `dispW` wide — the collision basis
  // once enemies exist, and what render.js uses to size the swap flash.
  hullHeight(shipIdx, dispW) {
    const f = SHIP_FRAMES[shipIdx];
    return f.hullH * (dispW / f.w);
  },

  // Draw projectile particle `row` frame `frame` in the CURRENT transform: the
  // caller has already translated to the bullet and rotated to its heading, so
  // this only lays the box down with the tip at the origin, hanging below it.
  // That keeps the rotation pivot on the particle's leading point.
  //
  // Note the scale: a 96px-wide source box drawn at ~13 logical px is roughly a
  // 7x downscale, far past the near-1:1 rule CLAUDE.md §6 sets for sprites.
  // That rule is about the cel-shaded hulls, whose 1px outlines a fractional
  // filter would chew. These particles are soft glow with no hard edges, so
  // there is nothing to chew and smoothed downscaling is the right treatment.
  drawBullet(ctx, row, frame, dispW) {
    const img = this.imgs.bullets;
    if (!img) return;
    ctx.drawImage(
      img,
      BULLET_COLS[frame], BULLET_ROWS[row], BULLET_W, BULLET_H,
      -dispW / 2, 0, dispW, dispW * (BULLET_H / BULLET_W)
    );
  },

  // Draw enemy type `row` frame `frame` from enemy atlas `key` in the CURRENT
  // transform, centred on the origin, `dispW` logical px across. The caller has
  // already translated to the enemy and applied its rotation, so the box being
  // centre-anchored means a tumbling disc turns about its own axis and an armed
  // hull pivots about its own middle rather than swinging off one.
  drawEnemy(ctx, key, row, frame, dispW) {
    const img = this.imgs[key];
    if (!img) return;
    ctx.drawImage(
      img,
      ENEMY_CELLS[frame], ENEMY_CELLS[row], ENEMY_BOX, ENEMY_BOX,
      -dispW / 2, -dispW / 2, dispW, dispW
    );
  },

  // Draw asteroid `row` frame `frame` in the CURRENT transform, centred on the
  // origin, `dispW` logical px across. The caller has already translated to the
  // rock and applied its spin, so the centre anchor means it turns about its own
  // axis rather than swinging around one.
  drawAsteroid(ctx, row, frame, dispW) {
    const img = this.imgs.asteroids;
    if (!img) return;
    ctx.drawImage(
      img,
      ASTEROID_CELLS[frame], ASTEROID_CELLS[row], ASTEROID_BOX, ASTEROID_BOX,
      -dispW / 2, -dispW / 2, dispW, dispW
    );
  },

  // Collision radius for a rock drawn `dispW` across. One fraction for all
  // three rows — see the note on ASTEROID_DISC_FRAC.
  asteroidHitRadius(dispW) {
    return (dispW / 2) * ASTEROID_DISC_FRAC;
  },

  // Collision radius for an enemy drawn `dispW` across — the solid hull, not
  // the glow. `frac` is the type's own measured body fraction; omit it for the
  // tumbling discs, which all sit close enough to share ENEMY_DISC_FRAC.
  enemyHitRadius(dispW, frac) {
    return (dispW / 2) * (frac || ENEMY_DISC_FRAC);
  },

  // ---- Explosions ----------------------------------------------------------
  // There is no explosion atlas yet (CLAUDE.md §6), so a fireball borrows the
  // enemy atlas's brightest charge frame: it is already a radial spike-and-glow
  // burst, which is the shape wanted. This is the single entry point explosions
  // draw through, so a real atlas later is a manifest change here and nothing
  // else — no caller learns about it.
  //
  // Draws in the CURRENT transform, centred on the origin, `dispW` across.
  // `tintCss` recolours the frame; pass null to draw the row as authored, which
  // is what makes an enemy's death burst match its own hull for free — and why
  // `key` comes along: an armed enemy has to borrow its OWN atlas, not the
  // tumbling one, or its wreck would be the wrong ship.
  drawBurst(ctx, key, row, frame, dispW, tintCss) {
    if (tintCss) {
      const c = this.tinted(key, row, frame, tintCss);
      if (c) {
        ctx.drawImage(c, -dispW / 2, -dispW / 2, dispW, dispW);
        return;
      }
    }
    this.drawEnemy(ctx, key, row, frame, dispW);
  },

  // Cached recolour of one atlas cell, built on first use. The cache is bounded
  // by the wreck palette in data.js times the rows it names — a handful of
  // 204px canvases for the whole session, built on the first player death.
  tinted(atlasKey, row, frame, css) {
    const img = this.imgs[atlasKey];
    if (!img) return null;
    const key = atlasKey + '|' + row + '|' + frame + '|' + css;
    if (this.tintCache[key]) return this.tintCache[key];

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
    // but only getImageData would throw, so this still works from file://
    // (CLAUDE.md §2). If a browser ever lacks the 'color' blend it degrades to
    // source-over and the burst becomes a flat colour silhouette, which is
    // dimmer but not broken.
    this.tintCache[key] = c;
    return c;
  },
};
