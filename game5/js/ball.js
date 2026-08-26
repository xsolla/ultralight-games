// ball.js — Ball physics, trail, collision detection

const Ball = (() => {
  let x, y;
  let trail = [];
  let shieldActive = false;
  let purpleActive = false;
  let shieldFlash = 0;
  let squishY = 1;      // scale Y for squish on ring pass
  let squishTimer = 0;

  function init() {
    x = C.TOWER_CX;
    y = C.TOWER_BALL_Y;
    trail = [];
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
    for (let i = 0; i < trail.length; i++) trail[i].y -= rise;

    trail.unshift({ x, y });
    if (trail.length > C.BALL_TRAIL_LENGTH) trail.pop();

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

  function draw(ctx) {
    // --- Trail ---
    for (let i = trail.length - 1; i >= 0; i--) {
      const t   = trail[i];
      const pct = 1 - i / trail.length;
      const alpha  = pct * 0.5;
      const radius = C.BALL_RADIUS * pct * 0.75;
      if (radius < 1) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      // Trail gradient: gold at head, fades to transparent
      const trailHue = 40 + i * 1.5;
      ctx.shadowBlur  = 10 * pct;
      ctx.shadowColor = C.TRAIL_COLOR;
      ctx.fillStyle   = `hsl(${trailHue}, 100%, 65%)`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Shield aura ---
    if (shieldActive) {
      const pulse = 0.55 + 0.45 * Math.sin(Game.getTime() * 7);
      // Outer ring
      ctx.save();
      ctx.globalAlpha  = 0.35 * pulse;
      ctx.strokeStyle  = C.POWERUP_SHIELD_COLOR;
      ctx.lineWidth    = 2.5;
      ctx.shadowBlur   = 20;
      ctx.shadowColor  = C.POWERUP_SHIELD_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, C.BALL_RADIUS + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Inner fill
      ctx.save();
      ctx.globalAlpha = 0.10 * pulse;
      ctx.fillStyle   = C.POWERUP_SHIELD_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, C.BALL_RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Purple bonus aura ---
    if (purpleActive) {
      const pulse = 0.55 + 0.45 * Math.sin(Game.getTime() * 9);
      // Outer ring
      ctx.save();
      ctx.globalAlpha  = 0.35 * pulse;
      ctx.strokeStyle  = C.POWERUP_PURPLE_COLOR;
      ctx.lineWidth    = 2.5;
      ctx.shadowBlur   = 20;
      ctx.shadowColor  = C.POWERUP_PURPLE_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, C.BALL_RADIUS + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Inner fill
      ctx.save();
      ctx.globalAlpha = 0.10 * pulse;
      ctx.fillStyle   = C.POWERUP_PURPLE_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, C.BALL_RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Shield-break flash ---
    if (shieldFlash > 0) {
      const pct = shieldFlash / 0.5;
      ctx.save();
      ctx.globalAlpha = pct * 0.7;
      ctx.fillStyle   = C.POWERUP_SHIELD_COLOR;
      ctx.shadowBlur  = 40;
      ctx.shadowColor = C.POWERUP_SHIELD_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, C.BALL_RADIUS + 18 * pct, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Ball core with squish ---
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / squishY, squishY); // stretch vertically, narrow horizontally (volume-preserving)
    ctx.translate(-x, -y);

    // Outer glow
    ctx.shadowBlur  = 32;
    ctx.shadowColor = C.BALL_GLOW;
    ctx.fillStyle   = C.BALL_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Second glow pass
    ctx.shadowBlur  = 16;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle   = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    const grad = ctx.createRadialGradient(
      x - C.BALL_RADIUS * 0.3, y - C.BALL_RADIUS * 0.3, 0,
      x, y, C.BALL_RADIUS
    );
    grad.addColorStop(0,   'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,220,100,0.5)');
    grad.addColorStop(1,   'rgba(255,140,0,0.0)');
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    ctx.arc(x, y, C.BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function getY() { return y; }

  return { init, update, draw, activateShield, consumeShield, hasShield, setPurpleActive, triggerSquish, getY };
})();
