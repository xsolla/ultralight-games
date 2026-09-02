// glow.js — Pre-baked radial glow sprites
//
// Every soft glow in this game is drawn additively onto a dark background and never
// read back, so a blurred circle and a baked radial-gradient blob are visually
// interchangeable. `ctx.shadowBlur` costs an offscreen Gaussian per draw call;
// `drawImage` of a baked sprite is a single textured quad. At 200+ glowing particles
// a frame that difference is the whole frame budget.
//
// Sprites are keyed by colour string and baked on first use. Callers with a
// continuously varying colour (the score-driven hue rotation) must quantize it —
// see quantHue() — or the cache grows without bound.

const Glow = (() => {
  const cache = new Map();

  const SIZE = 64;   // bake resolution — plenty for blobs drawn at r <= 24

  // How far the glow reaches, as a multiple of the solid core's radius. The blobs
  // this replaces carried shadow radii from roughly 1x to 4x their own radius, which
  // no single reach can cover: too tight and stars go dull, too wide and the ball's
  // trail smears into one haze. Two variants span the range.
  //   WIDE  — stars, particles, gas, auras (shadowBlur was 2-4x the radius)
  //   TIGHT — the ball trail (shadowBlur was about 1.2x the radius)
  const HALO = { wide: 3.0, tight: 1.8 };

  // Fraction of the sprite radius that stays fully opaque. Deriving it from the halo
  // is what makes the solid core come out at exactly the radius the caller asked
  // for: the sprite is drawn at radius r*halo, so the core lands at r*halo/halo = r.

  function sprite(color, variant) {
    variant = variant || 'wide';
    const key = variant + '|' + color;
    let c = cache.get(key);
    if (c) return c;

    c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    const r = SIZE / 2;
    const CORE = 1 / HALO[variant];

    // Stops past the core approximate a Gaussian tail, so the falloff reads like a
    // blur rather than a hard-edged disc.
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    const tail = f => CORE + (1 - CORE) * f;
    grad.addColorStop(0,          'rgba(255,255,255,1)');
    grad.addColorStop(CORE,       'rgba(255,255,255,1)');     // solid core
    grad.addColorStop(tail(0.30), 'rgba(255,255,255,0.34)');
    grad.addColorStop(tail(0.60), 'rgba(255,255,255,0.10)');
    grad.addColorStop(1,          'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);

    // Tint the alpha mask with the requested colour. Going through source-in means
    // we never parse the colour string, so '#rrggbb', 'hsl(...)' and 'rgba(...)'
    // all work identically.
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, SIZE, SIZE);

    cache.set(key, c);
    return c;
  }

  // Draws a glow blob whose solid core matches an arc(x, y, radius) fill.
  // Deliberately does not save/restore: the caller owns globalCompositeOperation so
  // that a whole batch of additive blobs can share one state change.
  function draw(ctx, color, x, y, radius, alpha, variant) {
    variant = variant || 'wide';
    const d = radius * 2 * HALO[variant];
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite(color, variant), x - d * 0.5, y - d * 0.5, d, d);
  }

  // A horizontal glowing bar: a vertical falloff strip, baked and tinted the same
  // parse-free way, then stretched across the width. Interpolating a gradient from a
  // colour to 'transparent' would pass through darkened colour, which is why this is
  // baked as an alpha mask and tinted afterwards.
  const strips = new Map();

  function strip(color) {
    let c = strips.get(color);
    if (c) return c;
    const H = 64;
    c = document.createElement('canvas');
    c.width = 8; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,    'rgba(255,255,255,0)');
    grad.addColorStop(0.34, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.46, 'rgba(255,255,255,1)');
    grad.addColorStop(0.54, 'rgba(255,255,255,1)');
    grad.addColorStop(0.66, 'rgba(255,255,255,0.16)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, H);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 8, H);
    strips.set(color, c);
    return c;
  }

  function drawBar(ctx, color, y, halfHeight, width, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(strip(color), 0, y - halfHeight, width, halfHeight * 2);
  }

  // Quantized hue -> colour string, with the string itself memoized. Callers pass a
  // continuous hue; 15-degree buckets are imperceptible on a particle burst and cap
  // the sprite cache at 24 entries for the rotating palette.
  const hueStrings = new Map();
  function quantHue(hue, sat, light) {
    const h = (Math.round(hue / 15) * 15 + 360) % 360;
    const key = h * 10000 + sat * 100 + light;
    let s = hueStrings.get(key);
    if (s === undefined) {
      s = 'hsl(' + h + ',' + sat + '%,' + light + '%)';
      hueStrings.set(key, s);
    }
    return s;
  }

  // Bake the fixed palette up front so the first ring smash does not stutter while
  // it allocates canvases mid-frame.
  function warm() {
    const fixed = [
      C.DEADLY_COLOR, C.BALL_COLOR, C.BALL_GLOW, C.TRAIL_COLOR, '#ffffff',
      C.POWERUP_SHIELD_COLOR, C.POWERUP_SLOW_COLOR, C.POWERUP_MULT_COLOR,
      C.POWERUP_TEAL_COLOR, C.POWERUP_PURPLE_COLOR, '#aaddff', '#ff9040',
    ];
    for (const col of fixed) { sprite(col, 'wide'); sprite(col, 'tight'); }
  }

  function count() { return cache.size; }

  return { draw, drawBar, sprite, strip, quantHue, warm, count };
})();
