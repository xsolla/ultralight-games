// ============================================================================
// render.js — the scene: background, starfield, planet, meteors, enemies, both
// streams of shots, the fleet, explosions, HP bars and pay-out pop-ups (all
// under the planet shake), then the HUD with the three shared buttons. Reads
// state and draws it; never mutates game state and never handles input.
//
// It also owns HUD LAYOUT, not just painting: `hudButtonRects` and
// `hudButtonAt` are pure functions of the constants below, and game.js
// hit-tests through them, so what is tapped is by construction what was drawn.
//
// The build button, the build popup and the behaviour menu are buildui.js's;
// the title screen and the records card are menu.js's. Both compose pieces of
// this file.
// ============================================================================

// ---- Tunable presentation knobs --------------------------------------------
const HUD_PAD = 10;            // logical px inset for HUD furniture
const HUD_SCRIM_HOLD = 52;     // the header scrim holds near full strength to here...
const HUD_SCRIM_H    = 84;     // ...and has faded to nothing by here
const TURBO_FRAC     = 0.85;   // above this fraction of top speed a ship shows turbo frames
const SHOT_FADE_MS   = 80;     // a bullet fades over its last this-many ms instead of blinking out
const BOOM_GROW      = 2.4;    // extra size the fireball silhouette gains as it dies
const BOOM_HOT       = 2.6;    // 1/life — how fast the white core flash burns out
const BOOM_SPRITE_OUT= 0.5;    // fraction of the life the silhouette survives
const BOOM_RING_OUT  = 0.45;   // fraction of the life the shock ring survives
const FLOAT_MS       = 900;    // a "+$3" pop-up's life
const FLOAT_RISE     = 18;     // px it drifts up over that life

// Screen shake, from game6: two rates so the axes trace a scribble rather than a
// diagonal, and a phase offset so the first frame of a shake is already displaced.
const SHAKE_FREQ_X  = 17;      // Hz
const SHAKE_FREQ_Y  = 23;      // Hz
const SHAKE_PHASE_Y = 1.7;     // radians

// HP bars (CLAUDE.md §7.11)
const HP_BAR = {
  H: 2.5,          // logical px tall
  MIN_W: 14,       // so the smallest sprite still gets a readable bar
  GAP: 4,          // px between the top of the sprite and the bar
  MID: 0.6,        // at or below this fraction the fill turns amber...
  LOW: 0.3,        // ...and red at or below this
  PLANET_W: 96,    // the planet's bar, just above the horizon
  PLANET_Y: LAYOUT.HORIZON - 16,
};

// ---- HUD chrome — VERBATIM from branding.md §2 and §3, via game6 -----------
// The repo's three shared HUD buttons, which must look identical in every game
// in it. Nothing in this object is a tuning knob.
//
// Two of these are near-misses of values in COLORS, and the near-misses are
// deliberate: `dim` is #8aa0bd where COLORS.hudDim is #7d90ad. Do NOT
// "harmonise" them — this object answers to branding.md and the rest of the
// HUD answers to this game.
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
// The title screen and records card carry the same row minus exit, whose job is
// "return to the title screen" — which is where the player already is.
const MENU_BTN_IDS = ['sound', 'fullscreen'];

function hudButtonIds(screen) {
  return (screen === 'menu' || screen === 'records') ? MENU_BTN_IDS : HUD_BTN_IDS;
}

// LAYOUT DEVIATION, the same one game6 made (branding.md §6): the spec's
// vertical column at a right inset of 28 is for an 800x600 field; on 360x640 it
// runs down through the play area. So the buttons are a horizontal row at
// HUD_PAD. Every appearance value above is untouched. Slop is hit-test only and
// is drawn nowhere: the tap area grows, the shared look does not.
const HUD_BTN_SLOP = 5;

// ---- Scene -------------------------------------------------------------------
let bgGradient = null;        // built once; CANVAS_W/H never change
let hudScrim = null;          // ditto

function drawScene(ctx, game) {
  drawBackground(ctx);

  // Screens branch at the top and return (CLAUDE.md §4). Reaching forward into
  // modules loaded after this one is fine because it only happens at run time,
  // after Game.init().
  if (game.screen === 'menu') { drawMenu(ctx, game); return; }
  if (game.screen === 'records') { drawRecords(ctx, game); return; }

  drawWorld(ctx, game);
  drawHud(ctx, game);
  drawBuildUi(ctx, game);
  // Last, so they sit above everything — branding.md §2 requires the shared
  // buttons to stay on top even of an overlay.
  drawHudButtons(ctx, game);
}

// The playfield and everything in it, shake included. Split out so the records
// card can paint the finished run behind itself. The HUD is drawn by the caller,
// OUTSIDE the shake: its hit rects are pure functions of constants, so buttons
// that moved under the transform would stop being what the player taps.
function drawWorld(ctx, game) {
  const shake = shakeOffset(game);
  ctx.save();
  if (shake) ctx.translate(shake.x, shake.y);
  Stars.draw(ctx, game.time);
  Planet.draw(ctx, game.planetHp / PLANET.HP, game.time);
  if (SpriteKit.ready) {
    // Back to front: rocks under everything so nothing hides behind the thing
    // the player can see coming from furthest off; incoming fire under the
    // fleet's own, both under the hulls they leave; bursts on top of what they
    // destroyed.
    drawMeteors(ctx, game.meteors);
    drawEnemies(ctx, game.enemies);
    drawBullets(ctx, game.enemyBullets);
    drawBullets(ctx, game.bullets);
    drawShips(ctx, game.ships);
    drawExplosions(ctx, game.explosions);
  }
  if (SHOW_HP_BARS) drawHpBars(ctx, game);
  drawFloaters(ctx, game.floaters);
  ctx.restore();
}

// Current shake displacement in logical px, or null. Pure: game.js owns the
// countdown. Amplitude decays quadratically, so most of the movement is in the
// first third, where the blow was.
function shakeOffset(game) {
  if (game.shakeMs <= 0) return null;
  const k = game.shakeMs / game.shakeTotalMs;
  const amp = game.shakeMag * k * k;
  const s = (game.shakeTotalMs - game.shakeMs) / 1000;
  return {
    x: amp * Math.sin(s * SHAKE_FREQ_X * TAU),
    y: amp * Math.sin(s * SHAKE_FREQ_Y * TAU + SHAKE_PHASE_Y),
  };
}

// ---- Enemies, meteors, shots ---------------------------------------------------
function drawEnemies(ctx, list) {
  for (const e of list) {
    if (e.dead || !e.active) continue;
    const sp = SpriteKit.ENEMY_SPRITES[ENEMY_TYPES[e.t].sprite];
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    if (SpriteKit.has(sp.atlas)) SpriteKit.drawEnemy(ctx, sp.atlas, sp.row, SpriteKit.enemyFrame(e.animMs, sp.frameMs), e.dispW);
    else SpriteKit.drawEnemyPlaceholder(ctx, e.dispW);
    ctx.restore();
  }
}

function drawMeteors(ctx, list) {
  for (const m of list) {
    if (m.dead) continue;
    const row = METEOR_TYPES[m.t].row;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    if (SpriteKit.has('asteroids')) {
      SpriteKit.drawAsteroid(ctx, row, SpriteKit.asteroidFrame(m.animMs, m.frameMs), m.dispW);
    } else {
      const a = SpriteKit.ASTEROID_SPRITES[row];
      SpriteKit.drawAsteroidPlaceholder(ctx, m.dispW, a.color, a.spark);
    }
    ctx.restore();
  }
}

// Additive: a shot is emissive light over a near-black field, so crossing
// streams bloom rather than stack flatly.
function drawBullets(ctx, list) {
  if (!list.length) return;
  const has = SpriteKit.has('bullets');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of list) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (b.life - b.age) / SHOT_FADE_MS);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.ang);
    if (has) SpriteKit.drawBullet(ctx, b.row, SpriteKit.bulletFrame(b.age), b.w);
    else SpriteKit.drawBulletPlaceholder(ctx, b.w);
    ctx.restore();
  }
  ctx.restore();
}

// ---- Explosions — copied from game6 --------------------------------------------
// Four layers, all additive, back to front: the atlas silhouette, the fireball
// gradient, a shock ring, and the debris streaks.
function drawExplosions(ctx, list) {
  if (!list.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of list) {
    if (b.ms < 0) continue;   // a staggered burst that has not lit yet
    const t = Math.min(1, b.ms / b.life);
    // Most of its final size within the first fifth of its life: a blast, not
    // a balloon inflating.
    const grow = 1 - Math.pow(1 - t, 3);
    const fade = Math.pow(1 - t, 1.5);
    // The silhouette is a readable machine, so its puffs are offset, squashed
    // and spun apart, and gone by BOOM_SPRITE_OUT — the vector layers carry the rest.
    if (SpriteKit.has(b.atlas)) {
      const a = Math.max(0, 1 - t / BOOM_SPRITE_OUT);
      if (a > 0) {
        const w = b.r * 2 * (1 + BOOM_GROW * grow);
        for (const pf of b.puffs) {
          ctx.save();
          ctx.translate(b.x + pf.ox * b.r, b.y + pf.oy * b.r);
          ctx.rotate(pf.rot + pf.spin * grow);
          ctx.scale(pf.sx, pf.sy);
          ctx.globalAlpha = a * a * 0.85;
          SpriteKit.drawBurst(ctx, b.atlas, b.row, b.frame, w, b.tint);
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

// White-hot at the centre, cooling through the burst's two colours to nothing.
// Alpha falls MONOTONICALLY from the centre, and the outer stop is fully clear,
// or under 'lighter' the disc gets a hard edge.
function drawBurstCore(ctx, b, t, grow, fade) {
  const r = b.r * (0.7 + 1.35 * grow);
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
  g.addColorStop(0, `rgba(${b.spark}, ${(0.85 * fade).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(${b.color}, ${(0.55 * fade).toFixed(3)})`);
  g.addColorStop(1, `rgba(${b.color}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, TAU);
  ctx.fill();

  // The white flash, confined to the first moments: hottest as it forms.
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

// A thin shock ring outrunning the fireball, gone well before the burst is.
function drawBurstRing(ctx, b, t, grow) {
  const k = 1 - t / BOOM_RING_OUT;
  if (k <= 0) return;
  ctx.strokeStyle = `rgba(${b.spark}, ${(k * k * 0.45).toFixed(3)})`;
  ctx.lineWidth = 0.35 + 1.6 * k;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * (0.8 + 2.6 * grow), 0, TAU);
  ctx.stroke();
}

// Debris as streaks along their travel, so each carries its speed. Batched into
// one path per colour: a packed screen holds hundreds of shards.
function drawBurstShards(ctx, b, t) {
  const fade = 1 - t;
  const vel = Math.exp(-BOOM_DRAG * b.ms / 1000);
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    ctx.beginPath();
    for (const s of b.shards) {
      if ((s.alt ? 1 : 0) !== pass) continue;
      const d = shardDist(s, b.ms);
      const back = Math.min(s.len * (0.25 + 0.75 * vel), d);
      const cx = Math.cos(s.ang), cy = Math.sin(s.ang);
      ctx.moveTo(b.x + cx * (d - back), b.y + cy * (d - back));
      ctx.lineTo(b.x + cx * d, b.y + cy * d);
      any = true;
    }
    if (!any) continue;
    ctx.strokeStyle = `rgba(${pass ? b.spark : b.color}, ${(fade * 0.85).toFixed(3)})`;
    ctx.lineWidth = 1 + fade * 1.1;
    ctx.stroke();
  }
}

// "+$3" where a kill paid out, rising and fading.
function drawFloaters(ctx, list) {
  if (!list.length) return;
  ctx.save();
  ctx.font = `800 9px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of list) {
    const t = f.ms / FLOAT_MS;
    ctx.globalAlpha = 1 - t * t;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - FLOAT_RISE * t);
  }
  ctx.restore();
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

// ---- The fleet ---------------------------------------------------------------
function drawShips(ctx, ships) {
  for (const s of ships) {
    if (s.dead) continue;
    const fast = s.speed > s.topSpeed * TURBO_FRAC;
    const frame = SpriteKit.shipFrame(s.animMs, fast);
    const w = s.dispW * launchScale(s);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    if (s.kind === 'healer') {
      ctx.globalAlpha = Math.max(0, s.fade);
      drawHealerSprite(ctx, frame, w);
    } else if (SpriteKit.has('ships')) {
      SpriteKit.drawShip(ctx, s.row, frame, 0, 0, w);
    } else {
      SpriteKit.drawShipPlaceholder(ctx, w * 0.7);
    }
    ctx.restore();
  }
}

// The medic is the Interceptor, hue-shifted (CLAUDE.md §6). Each engine frame is
// recoloured ONCE into its own canvas — blit, a 'hue' fill, then the sprite's
// alpha stamped back with 'destination-in', the same technique as
// SpriteKit.tinted(). That reads no pixels back, so file:// still works; and it
// avoids ctx.filter, whose Safari support is patchy.
const healerFrames = [];
function healerFrame(frame) {
  if (healerFrames[frame]) return healerFrames[frame];
  const img = SpriteKit.imgs.ships;
  const f = SpriteKit.SHIP_FRAMES[HEALER.row];
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const g = c.getContext('2d');
  const blit = () => g.drawImage(img, f.x[frame], f.y, f.w, f.h, 0, 0, f.w, f.h);
  blit();
  g.globalCompositeOperation = 'hue';
  g.fillStyle = HEALER.tint;
  g.fillRect(0, 0, f.w, f.h);
  g.globalCompositeOperation = 'destination-in';
  blit();
  healerFrames[frame] = c;
  return c;
}

// Same geometry as SpriteKit.drawShip: hull centred on the origin, plume below.
function drawHealerSprite(ctx, frame, w) {
  if (!SpriteKit.has('ships')) { SpriteKit.drawShipPlaceholder(ctx, w * 0.7); return; }
  const f = SpriteKit.SHIP_FRAMES[HEALER.row];
  const k = w / f.w;
  ctx.drawImage(healerFrame(frame), -w / 2, -(f.hullH * k) / 2, w, f.h * k);
}

// Half the on-screen height of a ship's hull — its plume excluded — which is
// what an HP bar and a selection ring are placed against.
function shipRadius(s) {
  return SpriteKit.hullHeight(s.row, s.dispW * launchScale(s)) / 2;
}

// ---- HP bars (CLAUDE.md §7.11) ------------------------------------------------
// Screen-aligned, above each sprite, drawn after every world entity. Batched:
// one path for all the tracks and one per colour band, rather than a fill per
// bar, because a busy wave shows a hundred of them.
function drawHpBars(ctx, game) {
  const bars = [];
  // Narrowed to "damaged only" (CLAUDE.md §7.11, 2026-09-25): a full-HP entity
  // draws no bar at all, so the track never clutters a healthy fleet.
  const bar = (x, top, w, f, a) => {
    if (f >= 1) return;
    bars.push({ x: x - w / 2, y: top - HP_BAR.GAP - HP_BAR.H, w, f, a });
  };
  for (const s of game.ships) {
    if (s.dead) continue;
    bar(s.x, s.y - shipRadius(s), Math.max(HP_BAR.MIN_W, s.dispW), s.hp / s.maxHp,
        s.kind === 'healer' ? Math.max(0, s.fade) : 1);
  }
  for (const e of game.enemies) {
    if (e.dead || !e.active) continue;
    bar(e.x, e.y - e.dispW * 0.45, Math.max(HP_BAR.MIN_W, e.dispW * 0.9), e.hp / e.maxHp, 1);
  }
  for (const m of game.meteors) {
    if (m.dead) continue;
    bar(m.x, m.y - m.r, Math.max(HP_BAR.MIN_W, m.dispW * 0.7), m.hp / m.maxHp, 1);
  }
  const planetFrac = game.planetHp / PLANET.HP;
  if (planetFrac < 1) {
    bars.push({ x: PLANET_CX - HP_BAR.PLANET_W / 2, y: HP_BAR.PLANET_Y, w: HP_BAR.PLANET_W,
                f: planetFrac, a: Planet.fade });
  }

  ctx.save();
  ctx.fillStyle = COLORS.hpTrack;
  ctx.beginPath();
  for (const b of bars) if (b.a > 0.01) ctx.rect(b.x - 0.5, b.y - 0.5, b.w + 1, HP_BAR.H + 1);
  ctx.fill();
  const bands = [[COLORS.hpHigh, (f) => f > HP_BAR.MID],
                 [COLORS.hpMid, (f) => f > HP_BAR.LOW && f <= HP_BAR.MID],
                 [COLORS.hpLow, (f) => f <= HP_BAR.LOW]];
  for (const [color, inBand] of bands) {
    ctx.fillStyle = color;
    ctx.beginPath();
    let any = false;
    for (const b of bars) {
      const f = clamp(b.f, 0, 1);
      if (b.a <= 0.01 || f <= 0 || !inBand(f)) continue;
      ctx.rect(b.x, b.y, b.w * f, HP_BAR.H);
      any = true;
    }
    if (any) ctx.fill();
  }
  ctx.restore();
}

// ---- HUD ---------------------------------------------------------------------
function drawHud(ctx, game) {
  drawHudScrim(ctx);
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.font = `800 18px ${FONT}`;
  ctx.fillStyle = COLORS.money;
  ctx.fillText('$ ' + game.money, HUD_PAD, HUD_PAD);

  const w = game.waves;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = COLORS.hudText;
  const line = w.phase === 'break'
    ? (w.wave === 0 ? 'FIRST WAVE IN ' : 'NEXT WAVE IN ') + Math.ceil(w.ms / 1000)
    : 'WAVE ' + w.wave;
  ctx.fillText(line, HUD_PAD, HUD_PAD + 24);
  if (w.phase === 'wave') {
    const x = HUD_PAD + ctx.measureText(line).width;
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('  ·  ' + (game.enemies.length + game.meteors.length) + ' HOSTILE', x, HUD_PAD + 25);
  }

  ctx.font = `600 10px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('PLANET ' + Math.ceil(game.planetHp) + ' / ' + PLANET.HP, HUD_PAD, HUD_PAD + 40);
  ctx.restore();
}

// The header sits on a fade, not a panel: a hard panel edge across a 9:16 field
// reads as the playfield being shorter than it is.
function drawHudScrim(ctx) {
  if (!hudScrim) {
    hudScrim = ctx.createLinearGradient(0, 0, 0, HUD_SCRIM_H);
    hudScrim.addColorStop(0, COLORS.hudPanel);
    hudScrim.addColorStop(HUD_SCRIM_HOLD / HUD_SCRIM_H, 'rgba(10, 18, 34, 0.40)');
    // Must reach zero alpha, or a visible seam crosses the starfield.
    hudScrim.addColorStop(1, 'rgba(10, 18, 34, 0)');
  }
  ctx.fillStyle = hudScrim;
  ctx.fillRect(0, 0, CANVAS_W, HUD_SCRIM_H);
}

// ---- HUD buttons -----------------------------------------------------------
// Layout, as a pure function of the constants. Both the painting below and the
// hit test in game.js read it.
function hudButtonRects(screen) {
  const ids = hudButtonIds(screen);
  const w = HUD_BTN.SIZE;
  const n = ids.length;
  const x0 = CANVAS_W - HUD_PAD - (n * w + (n - 1) * HUD_BTN.GAP);
  return ids.map((id, i) => ({
    id, x: x0 + i * (w + HUD_BTN.GAP), y: HUD_PAD, w, h: w,
  }));
}

// Which button is under a logical point, or null. Grown by HUD_BTN_SLOP.
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
    const hot = game.hover === 'hud:' + r.id;
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

// ---- Icon geometry — VERBATIM from branding.md §3, via game6 ---------------
// Every coordinate below is the branding spec's arithmetic, unevaluated. Only
// the bright/dim colour choice is logic.

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
// inset with arms reaching out = exit.
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
