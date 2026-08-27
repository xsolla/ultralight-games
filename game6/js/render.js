// ============================================================================
// render.js — all canvas drawing. Reads state and draws it; never mutates game
// state, never handles input. Consumes atlas.js for sprites and ambiance.js for
// the starfield.
//
// It also owns HUD LAYOUT, not just HUD painting: `hudButtonRects` and
// `hudButtonAt` are pure functions of the constants below, and game.js hit-tests
// through them. CLAUDE.md §5 has the drawing code stash its rects on the Game
// object instead; this is the same contract with the drift designed out, since
// there is no stored rect to go stale and none to clear on a screen change.
// ============================================================================

// ---- Tunable presentation knobs -------------------------------------------
const BANK_MAX_RAD   = 0.20;  // hull roll at full lateral speed
const SWAP_PUNCH     = 0.22;  // extra scale at the peak of a ship-swap flash
const HUD_PAD        = 10;    // logical px inset for HUD furniture
const BOOM_GROW      = 2.4;   // extra size the fireball silhouette gains as it dies
const BOOM_HOT       = 2.6;   // 1/life — how fast the white core flash burns out
const BOOM_SPRITE_OUT= 0.5;   // fraction of the life the silhouette survives
const BOOM_RING_OUT  = 0.45;  // fraction of the life the shock ring survives

// ---- Pickup bubbles --------------------------------------------------------
// A soap bubble is a thin FILM, not a ball of glass, so almost all of its
// substance sits at the rim: the body gradient is nearly invisible until 0.8 of
// the radius and then climbs hard. Drop that ramp and it stops being a bubble.
const BUBBLE = {
  // Radial stops as [position, alpha] against the bonus's own tint.
  BODY: [[0.00, 0.03], [0.62, 0.07], [0.86, 0.26], [0.96, 0.50], [1.00, 0.04]],
  // Thin-film iridescence: arcs at slightly different radii in shifted hues.
  // Fixed, not animated — three static arcs read as a bubble, and a shimmer at
  // this size just reads as flicker.
  BANDS: [
    ['255, 120, 220', 0.90, -2.5, 1.1],
    ['120, 255, 220', 0.94,  0.4, 1.3],
    ['255, 220, 120', 0.86,  2.6, 0.9],
  ],
  BAND_ALPHA: 0.28,
  PICTURE: 0.62,   // the picture's box as a fraction of the bubble's DIAMETER
};

// Screen-shake oscillation, in Hz. Two different rates so the two axes trace a
// Lissajous scribble rather than a straight diagonal line, and both are close
// enough to the 60fps sampling rate that the result reads as a rattle rather
// than as a smooth wobble — which is the point. The y axis carries a phase
// offset so the very first frame of a shake is already displaced: a shake that
// eases in from zero reads as the camera drifting, not as a blow landing.
const SHAKE_FREQ_X = 17;
const SHAKE_FREQ_Y = 23;
const SHAKE_PHASE_Y = 1.7;   // radians

// ---- HUD chrome — VERBATIM from branding.md §2 and §3 ----------------------
// The repo's three shared HUD buttons, which must look identical in every game
// in it. Nothing in this object is a tuning knob.
//
// Two of these are near-misses of values already in COLORS, and the near-misses
// are deliberate: `dim` is #8aa0bd where COLORS.hudDim is #7d90ad, and `stroke`
// is 0.30 alpha where COLORS.hudStroke is 0.28. Do NOT "harmonise" them — this
// object answers to branding.md and the rest of the HUD answers to this game.
const HUD_BTN = {
  SIZE: 30,            // logical px, square
  RADIUS: 8,
  GAP: 6,
  ICON: 8,             // nominal icon half-size — `s` in the branding geometry
  fill:        'rgba(255, 255, 255, 0.045)',
  fillHover:   'rgba(255, 255, 255, 0.09)',
  stroke:      'rgba(150, 180, 220, 0.30)',
  strokeHover: 'rgba(150, 180, 220, 0.55)',
  bright: '#e6eef8',   // sound, and ONLY in the 'on' state
  dim:    '#8aa0bd',   // every other icon and state
  soundW: 1.6,         // sound icon stroke width
  glyphW: 1.8,         // exit and fullscreen
};

// Order is fixed by branding.md §2: sound, exit, fullscreen, left to right.
const HUD_BTN_IDS = ['sound', 'exit', 'fullscreen'];

// The title screen carries the same row minus exit, whose job in branding.md §2
// is "return to the title screen" — which is where the player already is, so it
// would be a button that does nothing. game2 drops it there for the same reason
// (branding.md §6). Order and appearance are untouched.
//
// The row stays RIGHT-aligned, so dropping the middle button closes the gap
// rather than leaving a hole in the row — which costs sound its mid-run column
// (248 -> 284) while fullscreen keeps its corner. That is the right trade: the
// corner is the position the player aims at without looking, and a row with a
// hole in it reads as a button that failed to draw.
const MENU_BTN_IDS = ['sound', 'fullscreen'];

// Which of the shared buttons a screen offers. One function so the painter and
// game.js's hit test can never disagree about what is on screen — the same
// contract hudButtonRects itself exists for, one level up.
function hudButtonIds(screen) {
  return screen === 'menu' ? MENU_BTN_IDS : HUD_BTN_IDS;
}

// LAYOUT DEVIATION, in the terms branding.md §6 asks for. The spec is a vertical
// column at a right inset of 28 on an 800x600 field. This game is 360x640, and
// both numbers break here: a column runs 102px down the right edge, straight
// through the lane the ship dodges into at the top of the screen, and an inset
// of 28 is 7.8% of the width against 3.5% there. So the buttons are a horizontal
// row at this game's own HUD_PAD — the same deviation game4 made, for the same
// reason (a shallow header strip with no room below it). Every appearance value
// above is untouched.
//
// Slop is hit-test only and is drawn nowhere: 30 logical px is ~33 CSS px on a
// phone, under the 44px touch-target guidance, so the tap area grows rather than
// the button, which would break the shared appearance. The top corners are
// somewhere the ship never needs to be, so the slop costs the playfield nothing.
const HUD_BTN_SLOP = 5;

// ---- HUD layout ------------------------------------------------------------
// Three rows down the left, the button row across the top right. Ordered by how
// urgently the player needs each one mid-run rather than by how permanent it is:
// the armour bar is the loudest thing because it is also the life bar, the
// weapon leads because a caught bonus can change it without warning, and the
// hull is a caption because you can already see which ship you are flying.
const HUD_ARMOR = {
  X: HUD_PAD,
  Y: 33,
  // 198 = five 34px cells plus four 7px gaps, and the whole-number cell pitch of
  // 41 is what lets the slot outlines land on half-pixel coordinates and stay
  // one device row wide. It also ends well clear of the button row at x=248.
  W: 198,
  H: 10,
  CELL_GAP: 7,     // between weapon-level cells — wide enough that five slots
                   // read as five, not as one strip with dividers in it
  SEG_GAP: 1.5,    // between hull segments inside one cell
};
const HUD_ROW_HULL = 49;   // top of the ship-name caption
const HUD_TURBO_Y  = 65;   // turbo bar, only present during a burst
// The turbo strip is SHORTER than the armour bar above it, unlike everything
// else in this column, because its label has to clear the score readout's left
// edge at x=218. Turbo is transient and the score is permanent, so turbo yields.
const HUD_TURBO_W  = 140;

// ---- Score readout ---------------------------------------------------------
// An ECG, sitting under the button row on the right. It beats once a second,
// and that beat IS the point being earned for staying alive — render.js reads
// the phase straight off the same accumulator game.js pays out on, so the two
// can never drift.
const HUD_SCORE = {
  X: 218, Y: 44, W: 132, H: 26,
  TRACE: 0.60,      // fraction of the width the waveform gets; the number takes
                    // the rest, so the trace runs INTO the figure it explains
  POP: 0.22,        // extra scale on the number at the peak of a gain
  SWEEP: 0.22,      // fraction of the trace lit by the travelling highlight
};

// One PQRST complex, as (x, y) in a 0..1 box — y 0 is the top, 0.5 the isoline.
// A polyline rather than curves: at 26px tall the corners of a real ECG are what
// make it read as one, and smoothing them turns it into a generic squiggle.
const ECG_TRACE = [
  [0.00, 0.50], [0.14, 0.50],
  [0.20, 0.43], [0.26, 0.50],               // P
  [0.33, 0.57], [0.38, 0.10], [0.44, 0.74], // QRS — the tall one
  [0.49, 0.50], [0.60, 0.50],
  [0.68, 0.38], [0.78, 0.50],               // T
  [1.00, 0.50],
];
// Which vertex is the R peak. The sweep is phased so its lit window is centred
// here at the instant a point lands — that is the whole point of the readout,
// and without it the highlight reaches the spike at an arbitrary moment and the
// beat stops meaning anything.
const ECG_BEAT_VERTEX = 5;

// The scrim the header sits on. The ship can reach y=28 (PLAYFIELD.top) and
// enemies come through the top edge, so without it the text is read against a
// moving starfield and whatever is exploding. A fade rather than a panel: a hard
// edge across a 9:16 field reads as the playfield being shorter than it is.
//
// Three stops, not two. A straight linear fade is already half gone by the time
// it reaches the hull caption at y=49 — exactly where an enemy entering the top
// left corner sits — so it holds near full strength to HUD_SCRIM_HOLD and only
// then falls away, which keeps one even wash behind all three rows and puts the
// whole of the fade below them where nothing has to be read.
const HUD_SCRIM_HOLD = 68;
const HUD_SCRIM_H    = 98;

let bgGradient = null;        // built once; CANVAS_W/H never change
let hudScrim = null;          // ditto

function drawScene(ctx, game) {
  // The background fill sits OUTSIDE the shake on purpose: it is a full-bleed
  // gradient, so translating it would leave an unpainted strip along one edge.
  // Everything that has a position of its own moves, the wash behind them
  // does not.
  drawBackground(ctx);

  // Screens branch at the top and return, as CLAUDE.md §5 requires. The title
  // screen shares the background wash and nothing else — it has its own
  // backdrop, its own composition and its own buttons, all of them menu.js's.
  // Reaching forward to a module loaded after this one is fine because it only
  // happens at run time, after Game.init(); see the load-order note in §3.
  if (game.screen === 'menu') {
    drawMenu(ctx, game);
    return;
  }

  const shake = shakeOffset(game);
  ctx.save();
  if (shake) ctx.translate(shake.x, shake.y);

  // The starfield shakes with the entities rather than with the background. It
  // is the only thing on screen big enough to carry the motion, and a shake the
  // stars sit out of reads as the sprites jittering instead of the view moving.
  Stars.draw(ctx, game.time, game.scrollMult);

  // Nothing to draw over the starfield until the atlases have settled.
  if (Atlas.ready) {
    // Draw order: enemies under bullets so a shot reads as landing ON the disc,
    // and bullets under the ship so a volley emerges from beneath the nose.
    // Explosions sit above all three — a blast is in front of what it destroyed,
    // and the player's impact flash is in front of the hull it landed on.
    //
    // Incoming fire goes down FIRST of the two bullet layers, so where the two
    // cross the player's own shots read on top. Both are additive, so the
    // overlap blooms either way; this just decides which colour wins the middle.
    drawEnemies(ctx, game.enemies);
    // Bubbles under the projectiles: shots pass in FRONT of a bonus, so a
    // firefight never hides the thing the player is trying to steer into.
    drawPickups(ctx, game.pickups);
    drawBullets(ctx, game.enemyBullets);
    drawBullets(ctx, game.bullets);

    // A wrecked ship is gone; only its explosion remains. The wing goes with
    // it — and under it, so the player's own hull always reads on top of its
    // escort when the formation closes up.
    if (!game.player.dead) {
      drawWingmen(ctx, game.wingmen);
      if (Atlas.has('ships')) drawPlayer(ctx, game.player);
      else drawPlayerPlaceholder(ctx, game.player);
    }

    drawExplosions(ctx, game.explosions);
  }
  ctx.restore();

  // The HUD never shakes — and not only because a shaking HUD is unreadable.
  // hudButtonRects() is a pure function of constants, so if the buttons moved
  // under the transform then what the player taps would stop being what was
  // drawn, which is the exact drift that function exists to rule out.
  if (Atlas.ready) drawHud(ctx, game);
  else drawLoading(ctx);
}

// Current shake displacement in logical px, or null when nothing is shaking.
// Pure: game.js owns the countdown, this only shapes it.
//
// Amplitude decays quadratically rather than linearly so most of the movement
// happens in the first third of the shake, which is where the blow was. Phase is
// driven by the shake's OWN elapsed time rather than by Game.time, so every
// shake starts from the same place and none of this depends on the frame rate.
function shakeOffset(game) {
  if (game.shakeMs <= 0) return null;
  const k = game.shakeMs / game.shakeTotalMs;      // 1 at the blow, 0 at rest
  const amp = game.shakeMag * k * k;
  const s = (game.shakeTotalMs - game.shakeMs) / 1000;
  return {
    x: amp * Math.sin(s * SHAKE_FREQ_X * TAU),
    y: amp * Math.sin(s * SHAKE_FREQ_Y * TAU + SHAKE_PHASE_Y),
  };
}

function drawBackground(ctx) {
  if (!bgGradient) {
    bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bgGradient.addColorStop(0, COLORS.bgTop);
    bgGradient.addColorStop(1, COLORS.bgBottom);
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawPlayer(ctx, p) {
  const ship = SHIPS[p.ship];
  const bank = clamp(p.vx / ship.speed, -1, 1) * BANK_MAX_RAD;
  // swapMs runs down, so t goes 1 -> 0 across the flash.
  const t = p.swapMs / ANIM.SHIP_SWAP_MS;
  const scale = 1 + SWAP_PUNCH * Math.sin(t * Math.PI);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(bank);
  ctx.scale(scale, scale);
  // The hull draws at full strength through the post-hit grace period. The hit
  // itself is already reported by the impact burst and the screen shake
  // (Game.onPlayerHit), and those land ON the frame of the blow, where the
  // information is; a flicker running for the whole 1200ms after it was reading
  // as the damage still happening.
  Atlas.drawShip(ctx, p.ship, playerFrame(p), 0, 0, ship.dispW);
  ctx.restore();

  if (t > 0) {
    // Expanding ring marking the swap, fading as it grows.
    const r = Atlas.hullHeight(p.ship, ship.dispW) * (0.5 + (1 - t) * 0.9);
    ctx.strokeStyle = `rgba(230, 238, 248, ${(t * 0.55).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemies(ctx, enemies) {
  if (!enemies.length) return;

  for (const e of enemies) {
    const type = ENEMY_TYPES[e.t];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    if (e.deathMs > 0) {
      // Fade out while swelling slightly. The kill's real feedback is the
      // explosion drawn over the top of this; the swell is the disc itself
      // going, and it is deliberately quicker than the burst that hides it.
      const k = Math.min(1, e.deathMs / ENEMY_DEATH_MS);
      ctx.globalAlpha = 1 - k;
      const s = 1 + k * 0.25;
      ctx.scale(s, s);
    }
    // Per enemy rather than hoisted: the two halves of the roster come from two
    // atlases, so either can be present while the other failed to load.
    if (Atlas.has(type.atlas)) {
      Atlas.drawEnemy(ctx, type.atlas, type.row, enemyFrame(e), type.dispW);
    } else {
      drawEnemyPlaceholder(ctx, type);
    }
    ctx.restore();
  }
}

// PLACEHOLDER — vector stand-in so spawning, movement and collision stay
// testable if the alien atlas fails to load. Centred on the origin like the
// real sprite, so the spin still reads.
function drawEnemyPlaceholder(ctx, type) {
  const r = type.dispW * 0.38;
  ctx.strokeStyle = '#c76b8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.stroke();
}

// ---- Wingmen ---------------------------------------------------------------
// Same hull art as the player, drawn smaller and with no bank: the escort holds
// formation rather than steering, so rolling it would imply an input it does not
// have.
function drawWingmen(ctx, list) {
  if (!list.length) return;
  for (const w of list) {
    ctx.save();
    ctx.translate(w.x, w.y);
    if (wingmanBlinkOff(w)) ctx.globalAlpha = 0.3;
    if (Atlas.has('ships')) {
      Atlas.drawShip(ctx, w.ship, wingmanFrame(w), 0, 0, WINGMAN_DISPW);
    } else {
      drawWingmanPlaceholder(ctx);
    }
    ctx.restore();
  }
}

// PLACEHOLDER — vector stand-in if the ship atlas fails to load, so a wing is
// still visibly there and still visibly shooting.
function drawWingmanPlaceholder(ctx) {
  const w = WINGMAN_DISPW, h = w * 1.5;
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
}

// ---- Pickups ---------------------------------------------------------------
// A bubble with a still picture inside. Everything but the picture is vector, so
// the container costs no art at all and a new bonus only needs one if its glyph
// does.
function drawPickups(ctx, pickups) {
  if (!pickups.length) return;

  for (const b of pickups) {
    const row = BONUSES[b.t];
    const fade = pickupFade(b);
    ctx.save();
    ctx.translate(b.x, b.y);
    // Popping: shrink and thin together, so an expiring bubble reads as
    // bursting rather than as fading out like a ghost.
    if (fade < 1) {
      ctx.globalAlpha = fade;
      const k = 0.75 + 0.25 * fade;
      ctx.scale(k, k);
    }
    drawBonusGlyph(ctx, row, b.arg, PICKUP_R * 2 * BUBBLE.PICTURE);
    drawBubble(ctx, PICKUP_R, bonusTint(row, b.arg));
    ctx.restore();
  }
}

// What colour a bubble takes. Usually the bonus row's own, but a bonus whose
// contents are rolled per pickup can borrow from whatever it is holding — see
// `tintFrom` in BONUSES.
function bonusTint(row, arg) {
  return row.tintFrom === 'particle' ? PARTICLE_COLORS[WEAPONS[arg].row] : row;
}

// The bubble itself, centred on the origin of the CURRENT transform. Drawn OVER
// the picture, not under it: a soap film is in front of whatever it contains,
// and the rim highlight passing across the glyph is most of what sells it as
// being sealed inside rather than pasted on top.
function drawBubble(ctx, r, row) {
  const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  for (const [stop, alpha] of BUBBLE.BODY) {
    g.addColorStop(stop, `rgba(${row.spark}, ${alpha})`);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  ctx.save();
  // Additive, for the same reason the projectiles are: this is light on a
  // near-black field, and the bands have to build where they overlap.
  ctx.globalCompositeOperation = 'lighter';

  // The bonus's own hue, as a wide band around the whole rim. This is what
  // separates a prize from a trap at a glance, so it goes down first and
  // heaviest; the iridescence sits on top of it.
  ctx.strokeStyle = `rgba(${row.color}, 0.42)`;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.stroke();

  ctx.lineCap = 'round';
  for (const [rgb, rad, a0, len] of BUBBLE.BANDS) {
    ctx.strokeStyle = `rgba(${rgb}, ${BUBBLE.BAND_ALPHA})`;
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, r * rad, a0, a0 + len);
    ctx.stroke();
  }
  ctx.restore();

  // Two speculars: a hard one where the light is, and a soft bounce opposite it
  // off the inside of the far wall. One alone reads as a sticker.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.44, r * 0.17, r * 0.11, -0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 240, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(r * 0.34, r * 0.4, r * 0.22, r * 0.1, -0.5, 0, TAU);
  ctx.fill();
}

// The still picture inside, centred on the origin, `d` logical px across.
// Dispatched on `glyph` rather than on `kind`, so two bonuses could share a
// shape without either table learning about the other.
function drawBonusGlyph(ctx, row, arg, d) {
  const s = d / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.32);
  ctx.strokeStyle = `rgb(${row.spark})`;

  switch (row.glyph) {
    case 'plus':
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, 0); ctx.lineTo(s * 0.72, 0);
      ctx.moveTo(0, -s * 0.72); ctx.lineTo(0, s * 0.72);
      ctx.stroke();
      break;

    // The trap, and deliberately the plus with one stroke taken away: the pair
    // has to be readable as opposites at a glance and at 19px.
    case 'minus':
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, 0); ctx.lineTo(s * 0.72, 0);
      ctx.stroke();
      break;

    // The weapon's initial, in that particle's own colour — so the letter says
    // WHICH and the colour confirms it for a player who has stopped reading.
    // Filled from the bright `spark` rather than the body `color`: several of
    // the bodies are dark blues and reds that vanish against the bubble, and the
    // spark is the same measured hue with the luminance a small glyph needs.
    case 'letter': {
      const wp = WEAPONS[arg];
      const pc = PARTICLE_COLORS[wp.row];
      ctx.font = `700 ${(d * 0.92).toFixed(1)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // A wash of the body colour behind it, so the hue reads even at a glance
      // where the letterform does not.
      ctx.fillStyle = `rgba(${pc.color}, 0.85)`;
      ctx.fillText(wp.letter, 0, s * 0.07);
      ctx.fillStyle = `rgb(${pc.spark})`;
      ctx.fillText(wp.letter, 0, 0);
      break;
    }

    // The hull itself. No new art was needed for this one — the ships read
    // clearly at this size, which is the whole reason the bonus can be named.
    case 'hull':
      if (Atlas.has('ships')) Atlas.drawShip(ctx, arg, 0, 0, 0, d * 0.92);
      else { ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, TAU); ctx.stroke(); }
      break;

    case 'chevrons':
      ctx.beginPath();
      for (const off of [-0.5, 0.22]) {
        ctx.moveTo(-s * 0.62, (off + 0.34) * s);
        ctx.lineTo(0, (off - 0.28) * s);
        ctx.lineTo(s * 0.62, (off + 0.34) * s);
      }
      ctx.stroke();
      break;

    // Three hulls in a V. Generic on purpose: the wing's hull and weapon are
    // rolled when it is CAUGHT, so a specific ship here would be a promise the
    // bonus does not keep.
    case 'wing': {
      ctx.fillStyle = `rgb(${row.spark})`;
      // Narrow darts, not equilateral triangles: at 19px a wide triangle reads
      // as a mountain, and the whole glyph has to say "three SHIPS in a V".
      const dart = (x, y, k) => {
        ctx.beginPath();
        ctx.moveTo(x, y - k);
        ctx.lineTo(x + k * 0.46, y + k * 0.72);
        ctx.lineTo(x, y + k * 0.42);
        ctx.lineTo(x - k * 0.46, y + k * 0.72);
        ctx.closePath();
        ctx.fill();
      };
      dart(0, -s * 0.34, s * 0.5);
      dart(-s * 0.6, s * 0.42, s * 0.42);
      dart(s * 0.6, s * 0.42, s * 0.42);
      break;
    }
  }
  ctx.restore();
}

function drawBullets(ctx, bullets) {
  if (!bullets.length) return;

  const sprites = Atlas.has('bullets');
  ctx.save();
  // Additive blending: the particles are glow on transparent over a near-black
  // field, so overlapping shots should bloom rather than flatly stack. Safe
  // here only because the background is dark — 'lighter' over a light nebula
  // would wash out.
  ctx.globalCompositeOperation = 'lighter';

  for (const b of bullets) {
    // One draw path for both sides. The tables are tuned differently but the
    // art is the same, so an incoming shot is told apart by where it is going,
    // not by how it looks (CLAUDE.md §10).
    const wp = bulletWeapon(b);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang);   // sprites are authored nose-up, so heading == rotation
    if (sprites) Atlas.drawBullet(ctx, wp.row, bulletFrame(b), wp.dispW);
    else drawBulletPlaceholder(ctx, wp);
    ctx.restore();
  }

  ctx.restore();
}

// PLACEHOLDER — vector stand-in so the weapons stay testable if the projectile
// atlas fails to load. Drawn in the bullet's local space: tip at the origin,
// body trailing behind it, matching Atlas.drawBullet's anchor.
function drawBulletPlaceholder(ctx, wp) {
  const w = wp.dispW * 0.5;
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w / 2, w * 2);
  ctx.lineTo(-w / 2, w * 2);
  ctx.closePath();
  ctx.fill();
}

// ---- Explosions ------------------------------------------------------------
// Every layer is additive, for the same reason the projectiles are: a burst is
// emissive light over a near-black field, so overlapping bursts should bloom
// rather than flatly stack. Re-check this if a lighter backdrop ever lands
// (CLAUDE.md §6 makes the same point about the enemy atlas).
//
// Four layers, back to front: the atlas silhouette, the fireball gradient, a
// shock ring, and the debris streaks.
function drawExplosions(ctx, list) {
  if (!list.length) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (const b of list) {
    if (b.ms < 0) continue;   // a staggered sub-burst that has not lit yet
    const t = Math.min(1, b.ms / b.life);
    // Size eases hard out of the gate: the fireball is most of its final size
    // within the first fifth of its life and only creeps after that, which is
    // what reads as a blast rather than as a balloon inflating.
    const grow = 1 - Math.pow(1 - t, 3);
    const fade = Math.pow(1 - t, 1.5);

    // The silhouette is the enemy atlas's charge frame, which is a readable
    // MACHINE: one copy, centred, held for the whole life just looks like the
    // ship is still sitting there glowing. The puffs (see makePuff) are offset,
    // squashed and spun apart so they overlap as churn instead, and all of them
    // are gone by BOOM_SPRITE_OUT of the way through — after which the vector
    // layers carry the burst, which is also what a failed atlas load leaves.
    if (Atlas.has(b.atlas)) {
      const a = Math.max(0, 1 - t / BOOM_SPRITE_OUT);
      if (a > 0) {
        const w = b.r * 2 * (1 + BOOM_GROW * grow);
        for (const pf of b.puffs) {
          ctx.save();
          ctx.translate(b.x + pf.ox * b.r, b.y + pf.oy * b.r);
          ctx.rotate(pf.rot + pf.spin * grow);
          ctx.scale(pf.sx, pf.sy);
          ctx.globalAlpha = a * a * 0.85;
          Atlas.drawBurst(ctx, b.atlas, b.row, b.frame, w, b.tint);
          ctx.restore();
        }
      }
    }
    drawBurstCore(ctx, b, t, grow, fade);
    drawBurstRing(ctx, b, t, grow);
    drawBurstShards(ctx, b, t);
  }

  ctx.restore();
}

// The fireball: white-hot at the centre, cooling out through the hull's two
// colours to nothing. This is a real radial gradient rather than a stack of
// flat discs because stacked discs band visibly under additive blending, and
// the banding is exactly what makes a burst look like drawn circles. One
// gradient object per burst per frame is affordable — EXPLOSION_MAX caps how
// many can exist at once.
function drawBurstCore(ctx, b, t, grow, fade) {
  const r = b.r * (0.7 + 1.35 * grow);

  // Alpha must fall MONOTONICALLY from the centre out. An earlier version put
  // the cooling white flash on stop 0, and once it dropped below the stop
  // outside it the fireball grew a dark hole in the middle.
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
  g.addColorStop(0, `rgba(${b.spark}, ${(0.85 * fade).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(${b.color}, ${(0.55 * fade).toFixed(3)})`);
  // The outer stop must be fully transparent, or under 'lighter' the whole disc
  // lifts the starfield behind it and the burst gets a visible hard edge.
  g.addColorStop(1, `rgba(${b.color}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, TAU);
  ctx.fill();

  // The white flash is a separate, smaller gradient on top, confined to the
  // first moments: the blast is hottest as it forms, and a centre that stays
  // white for the whole life reads as a lamp rather than as a detonation.
  const hot = Math.max(0, 1 - t * BOOM_HOT);
  if (hot <= 0) return;
  const hr = b.r * (0.3 + 0.8 * hot);
  const hg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, hr);
  hg.addColorStop(0, `rgba(255, 250, 235, ${(0.9 * hot).toFixed(3)})`);
  hg.addColorStop(1, 'rgba(255, 250, 235, 0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(b.x, b.y, hr, 0, TAU);
  ctx.fill();
}

// A thin shock ring outrunning the fireball, and confined to the first
// BOOM_RING_OUT of the life. It is the leading edge of the blast, so it has to
// be gone well before the burst is: a ring that survives into the fade stops
// reading as a shock front and starts reading as a bubble around the wreck.
function drawBurstRing(ctx, b, t, grow) {
  const k = 1 - t / BOOM_RING_OUT;
  if (k <= 0) return;
  ctx.strokeStyle = `rgba(${b.spark}, ${(k * k * 0.45).toFixed(3)})`;
  ctx.lineWidth = 0.35 + 1.6 * k;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * (0.8 + 2.6 * grow), 0, TAU);
  ctx.stroke();
}

// Debris, drawn as streaks along their own travel direction rather than as
// dots, so each one carries its speed. Batched into one path per colour: a
// packed screen can hold hundreds of shards and a stroke each would be the most
// expensive thing in the frame.
function drawBurstShards(ctx, b, t) {
  const fade = 1 - t;
  // Fraction of its launch speed a streak still has. Length is scaled by it, so
  // a streak is a long smear while it is fast and a short chip once it has
  // slowed — the same reason a real motion blur shortens.
  const vel = Math.exp(-BOOM_DRAG * b.ms / 1000);

  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    ctx.beginPath();
    for (const s of b.shards) {
      if ((s.alt ? 1 : 0) !== pass) continue;
      const d = shardDist(s, b.ms);
      // Never trail back past the origin, or the first frames draw streaks
      // crossing the centre and the burst looks like a starburst decal.
      const back = Math.min(s.len * (0.25 + 0.75 * vel), d);
      const cx = Math.cos(s.ang), cy = Math.sin(s.ang);
      ctx.moveTo(b.x + cx * (d - back), b.y + cy * (d - back));
      ctx.lineTo(b.x + cx * d, b.y + cy * d);
      any = true;
    }
    if (!any) continue;
    ctx.strokeStyle = `rgba(${pass ? b.spark : b.color}, ${(fade * 0.85).toFixed(3)})`;
    ctx.lineWidth = 1.2 + fade * 1.3;
    ctx.stroke();
  }
}

// Vector stand-in so flight and input stay testable if the atlas fails to load.
function drawPlayerPlaceholder(ctx, p) {
  const ship = SHIPS[p.ship];
  const w = ship.dispW, h = w * 1.6;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(clamp(p.vx / ship.speed, -1, 1) * BANK_MAX_RAD);
  ctx.fillStyle = '#7fd4ff';
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(0, h * 0.3);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLoading(ctx) {
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = `500 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('loading…', CANVAS_W / 2, CANVAS_H / 2);
}

function drawHud(ctx, game) {
  const p = game.player;
  const level = weaponLevel(p);

  drawHudScrim(ctx);

  // Row 1 — the weapon. It leads because it is the one line that can change
  // without the player doing anything: a caught bonus swaps it, possibly for
  // something worse (CLAUDE.md §7), so it has to be re-readable at a glance.
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(WEAPONS[p.weapon].name, HUD_PAD, HUD_PAD - 1);

  // Row 2 — armour, which is also weapon level, which is also the life bar.
  drawArmorBar(ctx, p, level);

  // The level numeral annotates the BAR, not the weapon name: the bar is where
  // the number is read off, and sitting at its end keeps one colour language for
  // the whole armour idea. Dim at level 0, which is the frame the ship dies on.
  ctx.font = `700 11px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = level > 0 ? COLORS.armorLive : COLORS.hudDim;
  ctx.fillText('LV' + level, HUD_ARMOR.X + HUD_ARMOR.W + 8,
               HUD_ARMOR.Y + HUD_ARMOR.H / 2 + 0.5);

  drawHullCaption(ctx, p);

  // Turbo remaining, only while a burst is live, and slotted directly under the
  // armour bar so the two read as one instrument stack rather than as furniture
  // appearing in a gap.
  if (p.turboMs > 0) {
    const frac = p.turboMs / PLAYER_TURBO_MS;
    ctx.fillStyle = COLORS.turboTrack;
    ctx.fillRect(HUD_ARMOR.X, HUD_TURBO_Y, HUD_TURBO_W, 3);
    ctx.fillStyle = COLORS.turbo;
    ctx.fillRect(HUD_ARMOR.X, HUD_TURBO_Y, HUD_TURBO_W * frac, 3);
    ctx.font = `600 9px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('TURBO', HUD_ARMOR.X + HUD_TURBO_W + 8, HUD_TURBO_Y + 1.5);
  }

  drawScore(ctx, game);
  drawHudButtons(ctx, game);
  drawDifficultyHint(ctx, game);
  drawControlHints(ctx);
}

// The header sits on a fade, not a panel. The ship can fly to y=28 and enemies
// enter through the top edge, so the text needs something behind it; a hard
// panel edge across a 9:16 field reads as the playfield being shorter than it is.
function drawHudScrim(ctx) {
  if (!hudScrim) {
    hudScrim = ctx.createLinearGradient(0, 0, 0, HUD_SCRIM_H);
    hudScrim.addColorStop(0, COLORS.hudPanel);
    hudScrim.addColorStop(HUD_SCRIM_HOLD / HUD_SCRIM_H, 'rgba(10, 18, 34, 0.44)');
    // Must reach zero alpha, not merely a low one: a flat floor would put a
    // visible horizontal seam across the starfield at HUD_SCRIM_H.
    hudScrim.addColorStop(1, 'rgba(10, 18, 34, 0)');
  }
  ctx.fillStyle = hudScrim;
  ctx.fillRect(0, 0, CANVAS_W, HUD_SCRIM_H);
}

// Armour and weapon level are the same counter (CLAUDE.md §7), so one bar shows
// both — and, because the counter's ceiling is a property of the HULL, it shows
// that too. Five cells are the five weapon levels; the SEGMENTS inside a cell
// are that ship's `base`, so the same bar is 3-up, 4-up or 5-up depending on
// what is being flown. Swapping ships mid-run visibly re-slices it, which is the
// only way the player ever sees that a Verdant layer costs five hits and an
// Interceptor layer costs three.
//
// Segment widths are derived from the cell rather than fixed, so the bar keeps
// one outline whatever the hull: capacity changes the grain, never the size.
function drawArmorBar(ctx, p, level) {
  const base = SHIPS[p.ship].base;
  const cellW = (HUD_ARMOR.W - 4 * HUD_ARMOR.CELL_GAP) / 5;
  const segW = (cellW - (base - 1) * HUD_ARMOR.SEG_GAP) / base;

  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const cellX = HUD_ARMOR.X + i * (cellW + HUD_ARMOR.CELL_GAP);
    // Hits surviving in layer i+1. Whole segments only — a half-lit segment
    // would imply a half hit, and there is no such thing in this game.
    const filled = clamp(p.hits - i * base, 0, base);
    for (let j = 0; j < base; j++) {
      ctx.fillStyle = j < filled
        // The live layer is the one being chewed through; the ones under it are
        // banked. Two colours, so "how much is left" and "how much is safe" are
        // never the same read.
        ? (i + 1 === level ? COLORS.armorLive : COLORS.armor)
        : COLORS.armorTrack;
      ctx.fillRect(cellX + j * (segW + HUD_ARMOR.SEG_GAP), HUD_ARMOR.Y,
                   segW, HUD_ARMOR.H);
    }
    // The slot itself, drawn last so it reads as a frame around its contents.
    // Offset by half a pixel: a 1px stroke on a whole coordinate straddles two
    // device rows and comes out as a 2px blur at every backing scale.
    ctx.strokeStyle = COLORS.armorCell;
    ctx.strokeRect(cellX - 1.5, HUD_ARMOR.Y - 1.5,
                   cellW + 3, HUD_ARMOR.H + 3);
  }
}

// Row 3 — the hull, as a caption under the bar it explains. Ship name and the
// raw counter belong on one line because the counter's CEILING is the ship: a
// swap moves it between 15, 20 and 25 and re-slices the bar above at the same
// instant, and seeing both numbers change together is what makes that legible.
function drawHullCaption(ctx, p) {
  const ship = SHIPS[p.ship];
  ctx.textBaseline = 'top';
  ctx.font = `500 10px ${FONT}`;

  const head = ship.name.toUpperCase() + ' · ';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(head, HUD_PAD, HUD_ROW_HULL);
  let x = HUD_PAD + ctx.measureText(head).width;

  // The live figure is lit in the bar's own colour so the eye ties the two
  // together; the ceiling stays dim because it only moves when the ship does.
  const hits = String(Math.max(0, p.hits));
  ctx.fillStyle = COLORS.armorLive;
  ctx.fillText(hits, x, HUD_ROW_HULL);
  x += ctx.measureText(hits).width;

  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(' / ' + ship.base * 5, x, HUD_ROW_HULL);
}

// ---- Score readout ---------------------------------------------------------
// The trace runs in from the left, beats, and flattens out into the number it
// is counting. Three passes over one polyline: the resting trace, a bright
// segment travelling along it once per beat, and the figure itself.
//
// A DEAD player flatlines — the complex is dropped, the sweep stops and the line
// goes to a dim rule. It costs nothing, it is the one readout that can say
// something about being dead, and a heartbeat still ticking over a wreck would
// be saying the opposite.
function drawScore(ctx, game) {
  const dead = game.player.dead;
  const traceW = HUD_SCORE.W * HUD_SCORE.TRACE;
  // Phase of the current beat: 1 the instant a point lands, decaying to 0 just
  // before the next one. The same counter game.js pays out on.
  const beat = dead ? 0 : 1 - game.scoreMs / SCORE_TICK_MS;

  const pts = ECG_TRACE.map(([x, y]) => [
    HUD_SCORE.X + x * traceW,
    // Flatlined: every point collapses onto the isoline, so the same polyline
    // draws both states and there is no second path to keep in sync.
    HUD_SCORE.Y + (dead ? 0.5 : y) * HUD_SCORE.H,
  ]);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };

  // 1. the resting trace
  ctx.strokeStyle = dead ? COLORS.scoreFlat : COLORS.scoreTrace;
  ctx.lineWidth = 1.4;
  path();
  ctx.stroke();

  // 2. the beat, as a bright segment travelling the polyline. A dash pattern
  // rather than a partial re-draw: one gap-and-dash cycle the length of the
  // whole path means exactly one lit segment exists, and moving lineDashOffset
  // walks it from end to end.
  if (!dead) {
    // Arc length, and how far along it the R peak sits. Measured because
    // lineDashOffset counts in PATH units, not in x — the spike's rise is 12px
    // of length across 4px of width, so the two are different quantities.
    // (For this particular trace they happen to agree to within half a pixel,
    // the extra length before the peak cancelling the extra length after it.
    // That is a coincidence of this shape, not something to lean on: reshape
    // ECG_TRACE and the measurement stays right where an x fraction would not.)
    let len = 0, atBeat = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (i === ECG_BEAT_VERTEX) atBeat = len;
    }
    const lit = len * HUD_SCORE.SWEEP;
    // One dash and one gap spanning the whole path, so exactly one lit segment
    // can be on the trace at a time and moving the offset walks it end to end.
    const period = len + lit;
    ctx.setLineDash([lit, len]);
    // Start of the lit window, advanced by a full period across the second and
    // pinned so that at beat = 1 it straddles the R peak.
    const start = atBeat - lit / 2 + (1 - beat) * period;
    ctx.lineDashOffset = -start;
    ctx.strokeStyle = COLORS.score;
    ctx.lineWidth = 1.9;
    path();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. the figure, right-aligned so it grows leftward into the space the trace
  // leaves rather than pushing the widget off the edge at five digits.
  const pop = game.scorePopMs / SCORE_POP_MS;
  const scale = 1 + HUD_SCORE.POP * pop * pop;
  const cy = HUD_SCORE.Y + HUD_SCORE.H * 0.5;
  ctx.translate(HUD_SCORE.X + HUD_SCORE.W, cy);
  ctx.scale(scale, scale);
  ctx.font = `700 15px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dead ? COLORS.hudDim : COLORS.score;
  ctx.fillText(String(game.score), 0, 0);
  ctx.restore();
}

// ---- HUD buttons -----------------------------------------------------------
// Layout, as a pure function of the constants. Both the painting below and the
// hit test in game.js read it, so what is clicked is by construction what was
// drawn — see the note in this file's banner.
function hudButtonRects(screen) {
  const ids = hudButtonIds(screen);
  const w = HUD_BTN.SIZE;
  const n = ids.length;
  const x0 = CANVAS_W - HUD_PAD - (n * w + (n - 1) * HUD_BTN.GAP);
  return ids.map((id, i) => ({
    id, x: x0 + i * (w + HUD_BTN.GAP), y: HUD_PAD, w, h: w,
  }));
}

// Which button is under a logical point, or null. Grown by HUD_BTN_SLOP — see
// the note on that constant. Takes the screen rather than reading it off Game,
// so this stays a pure function of its arguments.
function hudButtonAt(px, py, screen) {
  const k = HUD_BTN_SLOP;
  for (const r of hudButtonRects(screen)) {
    if (px >= r.x - k && px <= r.x + r.w + k &&
        py >= r.y - k && py <= r.y + r.h + k) return r.id;
  }
  return null;
}

function drawHudButtons(ctx, game) {
  // Fullscreen state is read LIVE rather than tracked, so leaving by Esc or F11
  // keeps the glyph in sync for free (branding.md §4).
  const full = game.isFullscreen();

  for (const r of hudButtonRects(game.screen)) {
    const hot = game.hudHover === r.id;
    roundRectPath(ctx, r.x, r.y, r.w, r.h, HUD_BTN.RADIUS);
    ctx.fillStyle = hot ? HUD_BTN.fillHover : HUD_BTN.fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = hot ? HUD_BTN.strokeHover : HUD_BTN.stroke;
    ctx.stroke();

    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (r.id === 'sound') drawSoundIcon(ctx, cx, cy, HUD_BTN.ICON, game.soundState);
    else if (r.id === 'exit') drawPowerIcon(ctx, cx, cy, HUD_BTN.ICON);
    else drawFullscreenIcon(ctx, cx, cy, HUD_BTN.ICON, full);
    ctx.restore();
  }
}

// Hand-rolled rather than ctx.roundRect: this game runs from file:// on whatever
// browser is to hand, and roundRect is recent enough to be worth not needing.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ---- Icon geometry — VERBATIM from branding.md §3 --------------------------
// Every coordinate below is the branding spec's arithmetic, unevaluated. Do not
// replace these with the numeric SVG paths in that document: those are the same
// values already evaluated for cx = cy = 15, s = 8, and the two must stay in
// sync. Only the bright/dim colour choice is logic.

// Three states, and only 'on' is bright — the colour IS the state (branding §2).
function drawSoundIcon(ctx, cx, cy, s, state) {
  const on = state === 'on';
  ctx.fillStyle = on ? HUD_BTN.bright : HUD_BTN.dim;
  ctx.strokeStyle = on ? HUD_BTN.bright : HUD_BTN.dim;
  ctx.lineWidth = HUD_BTN.soundW;

  if (state === 'musicoff') {
    // A slashed note and no speaker: the middle state is about the music track,
    // not about the output. The slash is the state colour, never red.
    const nx = cx - s * 0.15;
    ctx.beginPath();
    ctx.ellipse(nx - s * 0.28, cy + s * 0.5, s * 0.3, s * 0.22, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx, cy + s * 0.5);
    ctx.lineTo(nx, cy - s * 0.6);
    ctx.lineTo(nx + s * 0.5, cy - s * 0.4);
    ctx.moveTo(cx - s * 0.9, cy + s * 0.9);
    ctx.lineTo(cx + s * 0.9, cy - s * 0.9);
    ctx.stroke();
    return;
  }

  // Speaker body, shared by 'on' and 'off'.
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy - s * 0.25);
  ctx.lineTo(cx - s * 0.5,  cy - s * 0.25);
  ctx.lineTo(cx - s * 0.05, cy - s * 0.6);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.6);
  ctx.lineTo(cx - s * 0.5,  cy + s * 0.25);
  ctx.lineTo(cx - s * 0.85, cy + s * 0.25);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  if (on) {
    // moveTo before each arc: without it the path draws a chord from the end of
    // the inner wave to the start of the outer one.
    const ax = cx - s * 0.05;
    for (const r of [s * 0.55, s * 0.95]) {
      ctx.moveTo(ax + r * Math.cos(-0.7), cy + r * Math.sin(-0.7));
      ctx.arc(ax, cy, r, -0.7, 0.7);
    }
  } else {
    ctx.moveTo(cx + s * 0.2, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.9, cy + s * 0.5);
    ctx.moveTo(cx + s * 0.9, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.5);
  }
  ctx.stroke();
}

// Power symbol: a ring with an 84-degree gap at the top, and a bar through it.
function drawPowerIcon(ctx, cx, cy, s) {
  ctx.strokeStyle = HUD_BTN.dim;   // exit is always dim
  ctx.lineWidth = HUD_BTN.glyphW;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.8, (-90 + 42) * DEG, (-90 - 42) * DEG + TAU, false);
  ctx.moveTo(cx, cy - s * 1.05);
  ctx.lineTo(cx, cy - s * 0.05);
  ctx.stroke();
}

// Four corner brackets. Corners OUTSIDE with arms reaching in = enter; corners
// inset with arms reaching out = exit. Extent matches the power ring, so all
// three glyphs read at one weight.
function drawFullscreenIcon(ctx, cx, cy, s, active) {
  const a = s * 0.8, b = s * 0.42;
  ctx.strokeStyle = HUD_BTN.dim;   // fullscreen is always dim
  ctx.lineWidth = HUD_BTN.glyphW;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (active) {
      ctx.moveTo(cx + sx * a,       cy + sy * (a - b));
      ctx.lineTo(cx + sx * (a - b), cy + sy * (a - b));
      ctx.lineTo(cx + sx * (a - b), cy + sy * a);
    } else {
      ctx.moveTo(cx + sx * (a - b), cy + sy * a);
      ctx.lineTo(cx + sx * a,       cy + sy * a);
      ctx.lineTo(cx + sx * a,       cy + sy * (a - b));
    }
  }
  ctx.stroke();
}

// Scaffolding, parked with the crib sheet rather than in the HUD proper: the
// difficulty picker belongs on the title screen, and the 1/2/3 keys that change
// it are documented on the line immediately below this one. It goes when they do.
function drawDifficultyHint(ctx, game) {
  ctx.font = `500 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('difficulty: ' + DIFFICULTIES[game.diffIdx].label.toUpperCase(),
               HUD_PAD, CANVAS_H - HUD_PAD - 4 * 13);
}

// Scaffold-only crib sheet. Delete once the real title screen exists — and with
// it the debug keys in game.js, since ship/weapon/heal all arrive from caught
// bonuses in the real game.
function drawControlHints(ctx) {
  const lines = [
    'drag / WASD — steer',
    'LMB / Space — fire',
    'Z ship · X turbo · Q weapon',
    '[ ] — damage / heal · 1 2 3 — difficulty',
  ];
  ctx.font = `500 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = COLORS.hudDim;
  lines.forEach((line, i) => {
    ctx.fillText(line, HUD_PAD, CANVAS_H - HUD_PAD - (lines.length - 1 - i) * 13);
  });
}
