// ============================================================================
// render.js — all canvas drawing. Reads state and draws it; never mutates game
// state, never handles input. Consumes atlas.js for sprites and ambiance.js for
// the starfield.
// ============================================================================

// ---- Tunable presentation knobs -------------------------------------------
const BANK_MAX_RAD   = 0.20;  // hull roll at full lateral speed
const SWAP_PUNCH     = 0.22;  // extra scale at the peak of a ship-swap flash
const HUD_PAD        = 10;    // logical px inset for HUD furniture
const BOOM_GROW      = 2.4;   // extra size the fireball silhouette gains as it dies
const BOOM_HOT       = 2.6;   // 1/life — how fast the white core flash burns out
const BOOM_SPRITE_OUT= 0.5;   // fraction of the life the silhouette survives
const BOOM_RING_OUT  = 0.45;  // fraction of the life the shock ring survives

let bgGradient = null;        // built once; CANVAS_W/H never change

function drawScene(ctx, game) {
  drawBackground(ctx);
  Stars.draw(ctx, game.time, game.scrollMult);

  // Nothing to draw over the starfield until the atlases have settled.
  if (!Atlas.ready) { drawLoading(ctx); return; }

  // Draw order: enemies under bullets so a shot reads as landing ON the disc,
  // and bullets under the ship so a volley emerges from beneath the nose.
  // Explosions sit above all three — a blast is in front of what it destroyed.
  drawEnemies(ctx, game.enemies);
  drawBullets(ctx, game.bullets);

  // A wrecked ship is gone; only its explosion remains.
  if (!game.player.dead) {
    if (Atlas.has('ships')) drawPlayer(ctx, game.player);
    else drawPlayerPlaceholder(ctx, game.player);
  }

  drawExplosions(ctx, game.explosions);
  drawHud(ctx, game);
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
  // Blink the hull down rather than fully out during post-hit grace: the player
  // still has to dodge while invulnerable, so the ship must stay trackable.
  if (playerBlinkOff(p)) ctx.globalAlpha = 0.25;
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
  const sprites = Atlas.has('aliens');

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
    if (sprites) Atlas.drawEnemy(ctx, type.row, enemyFrame(e), type.dispW);
    else drawEnemyPlaceholder(ctx, type);
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
    const wp = WEAPONS[b.w];
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
  const sprites = Atlas.has('aliens');

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
    if (sprites) {
      const a = Math.max(0, 1 - t / BOOM_SPRITE_OUT);
      if (a > 0) {
        const w = b.r * 2 * (1 + BOOM_GROW * grow);
        for (const pf of b.puffs) {
          ctx.save();
          ctx.translate(b.x + pf.ox * b.r, b.y + pf.oy * b.r);
          ctx.rotate(pf.rot + pf.spin * grow);
          ctx.scale(pf.sx, pf.sy);
          ctx.globalAlpha = a * a * 0.85;
          Atlas.drawBurst(ctx, b.row, b.frame, w, b.tint);
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
  const ship = SHIPS[p.ship];
  const level = weaponLevel(p);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(ship.name, HUD_PAD, HUD_PAD);

  ctx.font = `500 11px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`${WEAPONS[p.weapon].name} · LVL ${level}`, HUD_PAD, HUD_PAD + 17);

  drawArmorPips(ctx, p, level);

  // Scaffolding: the difficulty picker belongs on the title screen, but until
  // menu.js exists this is the only way to see which multipliers are live.
  ctx.textAlign = 'right';
  ctx.font = `500 10px ${FONT}`;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(DIFFICULTIES[game.diffIdx].label.toUpperCase(),
               CANVAS_W - HUD_PAD, HUD_PAD + 14);
  ctx.textAlign = 'left';

  // Turbo remaining, only while a burst is live.
  if (p.turboMs > 0) {
    const frac = p.turboMs / PLAYER_TURBO_MS;
    const bw = 96, bh = 4, bx = HUD_PAD, by = HUD_PAD + 36;
    ctx.fillStyle = COLORS.turboTrack;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = COLORS.turbo;
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('TURBO', bx + bw + 6, by - 3);
  }

  drawControlHints(ctx);
}

// Armour and weapon level are the same counter (CLAUDE.md §7), so one row of
// five slots shows both: full slots are banked levels, and the partial one is
// the layer currently being chewed through.
function drawArmorPips(ctx, p, level) {
  const base = SHIPS[p.ship].base;
  const pw = 11, ph = 6, gap = 3;
  const x0 = CANVAS_W - HUD_PAD - (5 * pw + 4 * gap);
  const y = HUD_PAD + 3;

  for (let i = 0; i < 5; i++) {
    const x = x0 + i * (pw + gap);
    // How much of layer i+1 survives, 0..1.
    const filled = clamp(p.hits - i * base, 0, base) / base;
    ctx.fillStyle = COLORS.armorTrack;
    ctx.fillRect(x, y, pw, ph);
    if (filled > 0) {
      ctx.fillStyle = i + 1 === level ? COLORS.armorLive : COLORS.armor;
      ctx.fillRect(x, y, pw * filled, ph);
    }
  }
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
