// atmos.js — Title-screen atmosphere: volumetric god rays and bokeh
//
// Both effects are baked sprites blitted additively, for the same reason glow.js
// exists: a shaft of light and a defocused highlight are soft alpha ramps over a
// dark background, and a textured quad reproduces one for a fraction of what a
// live gradient fill or a shadowBlur costs.
//
// One sprite is baked per colour and reused, so the per-frame cost is a handful of
// drawImage calls with a transform — the animation lives entirely in the transform
// and globalAlpha, never in the pixels.

const Atmos = (() => {

  // ── God rays ──────────────────────────────────────────────────────────────
  // A single wedge, apex at the top centre, is baked once and then drawn N times
  // rotated about a shared origin. The vertical ramp peaks a little below the apex
  // rather than at it, so overlapping shafts never pile into a hard hotspot where
  // they all meet.

  const RAY_W = 96, RAY_H = 384;
  const rayCache = new Map();

  function raySprite(color) {
    let c = rayCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = RAY_W; c.height = RAY_H;
    const g = c.getContext('2d');

    const vg = g.createLinearGradient(0, 0, 0, RAY_H);
    vg.addColorStop(0.00, 'rgba(255,255,255,0)');
    vg.addColorStop(0.12, 'rgba(255,255,255,1)');
    vg.addColorStop(0.44, 'rgba(255,255,255,0.44)');
    vg.addColorStop(0.76, 'rgba(255,255,255,0.11)');
    vg.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = vg;
    g.beginPath();
    g.moveTo(RAY_W / 2, 0);
    g.lineTo(RAY_W, RAY_H);
    g.lineTo(0, RAY_H);
    g.closePath();
    g.fill();

    // Soften the wedge's two straight edges. The wedge is only a few pixels wide at
    // the apex — right where the mask is opaque — so the taper loses nothing there
    // and feathers the shaft fully at the base.
    g.globalCompositeOperation = 'destination-in';
    const hg = g.createLinearGradient(0, 0, RAY_W, 0);
    hg.addColorStop(0.0,  'rgba(255,255,255,0)');
    hg.addColorStop(0.5,  'rgba(255,255,255,1)');
    hg.addColorStop(1.0,  'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, RAY_W, RAY_H);

    // Tint through source-in, so the colour string is never parsed here.
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, RAY_W, RAY_H);

    rayCache.set(color, c);
    return c;
  }

  // ── Bokeh ─────────────────────────────────────────────────────────────────
  // A defocused point of light images as the lens aperture: a disc with a bright
  // rim and a flatter interior. That rim is the whole reason these read as bokeh
  // and not as another starfield, so the gradient carries it explicitly.

  const BOKEH_SIZE = 64;
  const bokehCache = new Map();

  function bokehSprite(color) {
    let c = bokehCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = BOKEH_SIZE;
    const g = c.getContext('2d');
    const r = BOKEH_SIZE / 2;

    // Full interior with a brighter rim, rather than a hollow donut: a hole in the
    // middle is technically a real lens signature, but it draws the eye and these
    // discs pass right over the logo.
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0.00, 'rgba(255,255,255,0.44)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.52)');
    grad.addColorStop(0.88, 'rgba(255,255,255,0.94)');
    grad.addColorStop(0.94, 'rgba(255,255,255,1)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, BOKEH_SIZE, BOKEH_SIZE);

    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, BOKEH_SIZE, BOKEH_SIZE);

    bokehCache.set(color, c);
    return c;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let rays = [];
  let bokeh = [];
  let t = 0;

  function init() {
    const q = Quality.get();
    t = 0;

    rays = [];
    const rayN = q.rayCount || 0;
    for (let i = 0; i < rayN; i++) {
      // Spread across the fan rather than randomly, so no two shafts ever stack up
      // and leave a bald patch elsewhere. The jitter keeps it from looking combed.
      const f = rayN === 1 ? 0.5 : i / (rayN - 1);
      const base = C.RAY_SPREAD * (f * 2 - 1) + (Math.random() - 0.5) * 0.07;
      rays.push({
        angle: base,
        sway: 0.020 + Math.random() * 0.035,
        swaySpeed: 0.16 + Math.random() * 0.22,
        pulseSpeed: 0.30 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
        // Shafts near the middle of the fan run longer, which is what sells the
        // source as a point above the tower rather than a strip.
        len: C.RAY_LEN * (0.72 + 0.28 * (1 - Math.abs(f * 2 - 1))),
        width: C.RAY_WIDTH * (0.6 + Math.random() * 0.8),
        alpha: C.RAY_ALPHA * (0.55 + Math.random() * 0.65),
        color: i % 3 === 2 ? C.RAY_COLOR_ALT : C.RAY_COLOR,
      });
    }

    bokeh = [];
    const bokehN = q.bokehCount || 0;
    for (let i = 0; i < bokehN; i++) {
      // The largest discs are the ones closest to the lens, so they float in front
      // of the tower and drift fastest; the rest sit behind it.
      const near = i < Math.round(bokehN * 0.28);
      const r = near ? 16 + Math.random() * 12 : 5 + Math.random() * 10;
      bokeh.push({
        x: Math.random() * C.CANVAS_W,
        y: Math.random() * (C.CANVAS_H + 80) - 40,
        r,
        near,
        // Bigger discs are more defocused, so they carry less energy per pixel.
        alpha: (near ? 0.055 : 0.115) * (0.6 + Math.random() * 0.7),
        rise: (near ? 7 : 3.4) * (0.6 + Math.random() * 0.8),  // px/s upward
        swayAmp: 4 + Math.random() * 14,
        swaySpeed: 0.18 + Math.random() * 0.3,
        pulseSpeed: 0.4 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        color: C.BOKEH_COLORS[i % C.BOKEH_COLORS.length],
      });
    }
  }

  function update(dt) {
    t += dt;
    for (const b of bokeh) {
      b.y -= b.rise * dt;
      // Wrap a full sprite-height past the edge so a disc never pops into view.
      if (b.y < -b.r * 2.2) {
        b.y = C.CANVAS_H + b.r * 2.2;
        b.x = Math.random() * C.CANVAS_W;
      }
    }
  }

  // Additive, and the caller owns the composite mode for the whole batch — same
  // contract as Glow.draw.
  function drawRays(ctx) {
    if (!rays.length) return;
    ctx.globalCompositeOperation = 'lighter';

    // A soft pool just inside the top edge, so the shafts read as spilling out of
    // something rather than starting from nowhere.
    Glow.draw(ctx, C.RAY_COLOR, C.RAY_ORIGIN_X, -30, 96,
              C.RAY_POOL_ALPHA * (0.75 + 0.25 * Math.sin(t * 0.5)));

    for (const r of rays) {
      const ang = r.angle + Math.sin(t * r.swaySpeed + r.phase) * r.sway;
      const w   = r.width * (1 + 0.14 * Math.sin(t * r.pulseSpeed + r.phase));
      const a   = r.alpha * (0.52 + 0.48 * Math.sin(t * r.pulseSpeed * 0.68 + r.phase));
      ctx.save();
      ctx.translate(C.RAY_ORIGIN_X, C.RAY_ORIGIN_Y);
      ctx.rotate(ang);
      ctx.globalAlpha = a;
      ctx.drawImage(raySprite(r.color), -w / 2, 0, w, r.len);
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // `near` picks the depth slice: false for the discs behind the tower, true for
  // the few that float in front of it.
  function drawBokeh(ctx, near) {
    if (!bokeh.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bokeh) {
      if (b.near !== near) continue;
      const d = b.r * 2;
      const x = b.x + Math.sin(t * b.swaySpeed + b.phase) * b.swayAmp;
      ctx.globalAlpha = b.alpha * (0.7 + 0.3 * Math.sin(t * b.pulseSpeed + b.phase));
      ctx.drawImage(bokehSprite(b.color), x - b.r, b.y - b.r, d, d);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Bake the fixed palette up front, alongside Glow.warm(), so the title screen's
  // first frame is not the one that allocates six canvases.
  function warm() {
    raySprite(C.RAY_COLOR);
    raySprite(C.RAY_COLOR_ALT);
    for (const col of C.BOKEH_COLORS) bokehSprite(col);
  }

  return { init, update, drawRays, drawBokeh, warm };
})();
