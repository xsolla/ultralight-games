// ball.js — Ball physics, trail, collision detection

const Ball = (() => {
  let x, y;
  // Trail is a ring buffer: the ball emits one sample a frame, and unshift()/pop()
  // on an array copies the whole thing every frame for no reason.
  // The buffer is always full length; the quality tier only limits how many of the
  // stored samples get drawn, so a tier change can never expose an unwritten slot.
  const TRAIL_CAP = C.BALL_TRAIL_LENGTH;
  const trailX = new Float32Array(TRAIL_CAP);
  const trailY = new Float32Array(TRAIL_CAP);
  let trailN = 0;      // samples written so far, capped at TRAIL_CAP
  let trailHead = 0;   // index of the newest sample

  let shieldActive = false;
  let purpleActive = false;
  let shieldFlash = 0;
  let squishY = 1;      // scale Y for squish on ring pass
  let squishTimer = 0;

  function init() {
    x = C.TOWER_CX;
    y = C.TOWER_BALL_Y;
    trailN = 0;
    trailHead = 0;
    shieldActive = false;
    purpleActive = false;
    shieldFlash = 0;
    squishY = 1;
    squishTimer = 0;
  }

  function update(dt, scrollSpeed) {
    // The ball is fixed on screen while the world scrolls past it, so trail
    // samples must rise at the fall speed to mark where the ball has been.
    const rise = scrollSpeed * dt;
    for (let i = 0; i < trailN; i++) trailY[i] -= rise;

    trailHead = trailN === 0 ? 0 : (trailHead + 1) % TRAIL_CAP;
    trailX[trailHead] = x;
    trailY[trailHead] = y;
    if (trailN < TRAIL_CAP) trailN++;

    if (shieldFlash > 0) shieldFlash -= dt;

    // Squish recovery
    if (squishTimer > 0) {
      squishTimer -= dt;
      const t = Math.max(0, squishTimer / 0.18);
      squishY = 1 + 0.28 * Math.sin(t * Math.PI);
    } else {
      squishY = 1;
    }
  }

  function triggerSquish() {
    squishTimer = 0.18;
  }

  function activateShield() { shieldActive = true; shieldFlash = 0; }

  function consumeShield() {
    shieldActive = false;
    shieldFlash = 0.5;
    triggerSquish();
  }

  function hasShield() { return shieldActive; }

  function setPurpleActive(active) { purpleActive = active; }

  // The specular highlight is fixed geometry — the ball never moves — so the
  // gradient is built once instead of every frame.
  let specGrad = null;
  function specular(ctx) {
    if (!specGrad) {
      specGrad = ctx.createRadialGradient(
        x - C.BALL_RADIUS * 0.3, y - C.BALL_RADIUS * 0.3, 0,
        x, y, C.BALL_RADIUS
      );
      specGrad.addColorStop(0,   'rgba(255,255,255,0.95)');
      specGrad.addColorStop(0.4, 'rgba(255,220,100,0.5)');
      specGrad.addColorStop(1,   'rgba(255,140,0,0.0)');
    }
    return specGrad;
  }

  // Aura ring shared by the shield and purple power-ups.
  function drawAura(ctx, color, speed) {
    const pulse = 0.55 + 0.45 * Math.sin(Game.getTime() * speed);
    // Baked glow behind the stroke replaces the shadowBlur the ring used to carry.
    ctx.globalCompositeOperation = 'lighter';
    Glow.draw(ctx, color, x, y, C.BALL_RADIUS + 12, 0.22 * pulse);
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 0.35 * pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS + 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.10 * pulse;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw(ctx) {
    // --- Trail --- one additive batch of baked glow sprites
    const shown = Math.min(trailN, Quality.get().trailLength);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < shown; i++) {
      // i = 0 is the newest sample; walk backwards from the head.
      const idx = (trailHead - i + TRAIL_CAP) % TRAIL_CAP;
      const pct = 1 - i / shown;
      const radius = C.BALL_RADIUS * pct * 0.75;
      if (radius < 1) continue;
      // Tight variant: the trail's original blur was only about 1.2x its radius, and
      // the wide halo smears the whole trail into the ball's glow.
      Glow.draw(ctx, Glow.quantHue(40 + i * 1.5, 100, 65),
                trailX[idx], trailY[idx], radius, pct * 0.5, 'tight');
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (shieldActive) drawAura(ctx, C.POWERUP_SHIELD_COLOR, 7);
    if (purpleActive) drawAura(ctx, C.POWERUP_PURPLE_COLOR, 9);

    // --- Shield-break flash ---
    if (shieldFlash > 0) {
      const pct = shieldFlash / 0.5;
      ctx.globalCompositeOperation = 'lighter';
      Glow.draw(ctx, C.POWERUP_SHIELD_COLOR, x, y,
                C.BALL_RADIUS + 18 * pct, pct * 0.7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // --- Ball core with squish ---
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / squishY, squishY); // stretch vertically, narrow horizontally (volume-preserving)
    ctx.translate(-x, -y);

    // Outer glow as a baked sprite rather than two blurred fills. Sized so the halo
    // reaches about as far as the 32px shadow it replaces — any wider and the gold
    // specular underneath gets washed out to white.
    ctx.globalCompositeOperation = 'lighter';
    Glow.draw(ctx, C.BALL_GLOW, x, y, C.BALL_RADIUS * 0.95, 0.5);
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 1;
    ctx.fillStyle = C.BALL_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = specular(ctx);
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function getY() { return y; }

  return { init, update, draw, activateShield, consumeShield, hasShield, setPurpleActive, triggerSquish, getY };
})();
