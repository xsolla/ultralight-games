// particles.js — Particle system for visual effects

const Particles = (() => {
  let pool = [];

  function emit(x, y, count, color, speedMult = 1) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = (C.PARTICLE_SPEED + Math.random() * 80) * speedMult;
      // life and maxLife must come from one roll, or life/maxLife can exceed 1
      const life  = C.PARTICLE_LIFE * (0.7 + Math.random() * 0.6);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 2 + Math.random() * 3,
        color,
        gravity: 60,
        drag: 0.97,
        opacity: 1,
      });
    }
  }

  function emitRing(x, y, color) {
    // Enhanced ring pass particles - visible but not as intense as special segments
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20 + Math.random() * 0.4;
      const speed = (C.PARTICLE_SPEED + Math.random() * 60) * 1.1;
      const life  = C.PARTICLE_LIFE * 1.3 * (0.7 + Math.random() * 0.5);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 3 + Math.random() * 4,
        color,
        gravity: 50,
        drag: 0.97,
        opacity: 0.9,
        additive: true,
      });
    }
    // Sparkle highlights
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 100) * 1.4;
      const life  = C.PARTICLE_LIFE * 0.8 * (0.6 + Math.random() * 0.3);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 1.5 + Math.random() * 2,
        color: '#ffffff',
        gravity: 30,
        drag: 0.94,
        opacity: 1,
        additive: true,
      });
    }
  }

  function emitDeath(x, y) {
    emitSpecialSegment(x, y, C.DEADLY_COLOR);
    // Extra white-hot core
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 150) * 1.5;
      const life  = C.PARTICLE_LIFE * 1.0 * (0.7 + Math.random() * 0.4);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 3 + Math.random() * 4,
        color: '#ffffff',
        gravity: 35,
        drag: 0.95,
        opacity: 1,
        additive: true,
      });
    }
  }

  function emitPowerup(x, y, color) {
    emitSpecialSegment(x, y, color);
  }

  // Burst for special segment destruction (power-ups, deadly with shield/purple)
  function emitSpecialSegment(x, y, color) {
    // Primary burst - large, bright
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20 + Math.random() * 0.3;
      const speed = (C.PARTICLE_SPEED + Math.random() * 120) * 1.3;
      const life  = C.PARTICLE_LIFE * 1.35 * (0.8 + Math.random() * 0.5);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 4 + Math.random() * 5,
        color,
        gravity: 40,
        drag: 0.96,
        opacity: 1,
        additive: true,
      });
    }
    // Secondary burst - smaller, faster
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 200) * 1.6;
      const life  = C.PARTICLE_LIFE * 0.9 * (0.6 + Math.random() * 0.4);
      pool.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: 2 + Math.random() * 3,
        color,
        gravity: 30,
        drag: 0.94,
        opacity: 0.9,
        additive: true,
      });
    }
  }

  // Slow rising puff vented by a shattered ring fragment.
  function emitGas(x, y, color) {
    const life = C.PARTICLE_LIFE * (1.1 + Math.random() * 0.8);
    pool.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 50,
      vy: -25 - Math.random() * 45,
      life,
      maxLife: life,
      radius: 5 + Math.random() * 6,
      color,
      gravity: -40,     // gas rises as it thins out
      drag: 0.93,
      opacity: 0.3,     // big and faint, so puffs merge into a cloud
    });
  }

  function update(dt) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      const k = Math.pow(p.drag, dt * 60);   // frame-rate independent drag
      p.vx *= k;
      p.vy *= k;
      if (p.life <= 0) pool.splice(i, 1);
    }
  }

  function draw(ctx) {
    pool.forEach(p => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      if (p.additive) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * p.opacity * 1.2;
        ctx.shadowBlur = 16;
      } else {
        ctx.globalAlpha = alpha * p.opacity;
        ctx.shadowBlur = 8;
      }
      ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * Math.max(0.3, alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function clear() { pool = []; }

  return { emitRing, emitDeath, emitPowerup, emitSpecialSegment, emitGas, update, draw, clear };
})();
