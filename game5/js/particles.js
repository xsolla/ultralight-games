// particles.js — Particle system for visual effects
//
// Every particle is a glow blob. They used to be drawn as arc()+fill() with
// shadowBlur and a per-particle globalCompositeOperation flip, which at 200+ live
// particles was the single largest cost in the frame. Now they are baked sprites
// (see glow.js) blitted in two batches, one state change each.

const Particles = (() => {
  let pool = [];

  // Emission counts scale with the quality tier. Always keep at least one particle
  // so an effect never vanishes entirely.
  function n(count) {
    return Math.max(1, Math.round(count * Quality.get().particleScale));
  }

  // Once the pool is full, new particles overwrite existing slots in rotation.
  // Dead particles are already removed by swap-and-pop, so the pool carries no age
  // order to preserve and an O(1) rotating evictor is as good as dropping the oldest.
  let capCursor = 0;

  function push(p) {
    if (pool.length >= C.PARTICLE_MAX) {
      pool[capCursor] = p;
      capCursor = (capCursor + 1) % pool.length;
    } else {
      pool.push(p);
    }
  }

  function emitRing(x, y, color) {
    // Enhanced ring pass particles - visible but not as intense as special segments
    const main = n(20);
    for (let i = 0; i < main; i++) {
      const angle = (Math.PI * 2 * i) / main + Math.random() * 0.4;
      const speed = (C.PARTICLE_SPEED + Math.random() * 60) * 1.1;
      const life  = C.PARTICLE_LIFE * 1.3 * (0.7 + Math.random() * 0.5);
      push({
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
    const spark = n(6);
    for (let i = 0; i < spark; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 100) * 1.4;
      const life  = C.PARTICLE_LIFE * 0.8 * (0.6 + Math.random() * 0.3);
      push({
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
    const core = n(12);
    for (let i = 0; i < core; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 150) * 1.5;
      const life  = C.PARTICLE_LIFE * 1.0 * (0.7 + Math.random() * 0.4);
      push({
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
    const main = n(20);
    for (let i = 0; i < main; i++) {
      const angle = (Math.PI * 2 * i) / main + Math.random() * 0.3;
      const speed = (C.PARTICLE_SPEED + Math.random() * 120) * 1.3;
      const life  = C.PARTICLE_LIFE * 1.35 * (0.8 + Math.random() * 0.5);
      push({
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
    const second = n(10);
    for (let i = 0; i < second; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (C.PARTICLE_SPEED + Math.random() * 200) * 1.6;
      const life  = C.PARTICLE_LIFE * 0.9 * (0.6 + Math.random() * 0.4);
      push({
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
    push({
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

  // Only a handful of distinct drag values exist across all emitters, so the
  // frame-rate-independent drag factor is resolved once per value per frame instead
  // of calling Math.pow for every live particle.
  const dragK = new Map();

  function update(dt) {
    dragK.clear();
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;

      let k = dragK.get(p.drag);
      if (k === undefined) {
        k = Math.pow(p.drag, dt * 60);   // frame-rate independent drag
        dragK.set(p.drag, k);
      }
      p.vx *= k;
      p.vy *= k;

      if (p.life <= 0) {
        // Swap-and-pop: order within the pool carries no meaning, and splice() on a
        // 200-entry pool is O(n) per removal.
        pool[i] = pool[pool.length - 1];
        pool.pop();
      }
    }
  }

  // Culling margin — a blob is drawn at radius * Glow HALO, so allow for the halo.
  const MARGIN = 40;

  function drawGroup(ctx, additive) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!!p.additive !== additive) continue;
      if (p.x < -MARGIN || p.x > C.CANVAS_W + MARGIN ||
          p.y < -MARGIN || p.y > C.CANVAS_H + MARGIN) continue;
      const alpha = p.life / p.maxLife;
      if (alpha <= 0) continue;
      const a = additive ? alpha * p.opacity * 1.2 : alpha * p.opacity;
      Glow.draw(ctx, p.color, p.x, p.y, p.radius * Math.max(0.3, alpha), Math.min(1, a));
    }
  }

  function draw(ctx) {
    // Two batches, one composite-mode change each, instead of one per particle.
    ctx.globalCompositeOperation = 'lighter';
    drawGroup(ctx, true);
    ctx.globalCompositeOperation = 'source-over';
    drawGroup(ctx, false);
    ctx.globalAlpha = 1;
  }

  function clear() { pool = []; capCursor = 0; }
  function count() { return pool.length; }

  return { emitRing, emitDeath, emitPowerup, emitSpecialSegment, emitGas,
           update, draw, clear, count };
})();
