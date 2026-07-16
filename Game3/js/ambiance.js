// ============================================================================
// ambiance.js — decorative animated background behind the board / menu:
// volumetric god rays, drifting dust motes, and deep out-of-focus bokeh
// bubbles & crystals. Purely visual; never affects game state.
//
// Elements are generated once per config (cached) and animated by time; the
// game and title screen use different palettes and ray directions.
// ============================================================================

// Ray colours as "r,g,b" strings so alpha can be composed per draw.
const AMBIANCE_GAME = {
  id: 'game',
  ray: { rgb: '150,190,255', ox: 0.32, oy: -0.12, tilt: 0.30, count: 7, alpha: 0.11 },
  dust: { rgb: '205,225,255', count: 64, alpha: 0.55 },
  bokeh: { count: 16, bubble: '120,180,255', crystal: '255,120,140', aMin: 0.05, aMax: 0.16 },
};

const AMBIANCE_MENU = {
  id: 'menu',
  ray: { rgb: '205,175,255', ox: 0.68, oy: -0.12, tilt: -0.28, count: 8, alpha: 0.13 },
  dust: { rgb: '235,222,255', count: 74, alpha: 0.55 },
  bokeh: { count: 18, bubble: '150,190,255', crystal: '255,140,155', aMin: 0.05, aMax: 0.16 },
};

const _ambiCache = {};

function getAmbiance(cfg) {
  if (_ambiCache[cfg.id]) return _ambiCache[cfg.id];

  const rays = [];
  for (let i = 0; i < cfg.ray.count; i++) {
    rays.push({
      offset: (Math.random() * 2 - 1) * CANVAS_W * 0.5, // lateral position (local space)
      topW: 8 + Math.random() * 22,
      botW: 60 + Math.random() * 150,
      len: CANVAS_H * 1.25,
      phase: Math.random() * TAU,
      speed: 0.0004 + Math.random() * 0.0006,
      a: 0.5 + Math.random() * 0.5,
    });
  }

  const bokeh = [];
  for (let i = 0; i < cfg.bokeh.count; i++) {
    bokeh.push({
      x: Math.random(), y: Math.random(),
      r: 22 + Math.random() * 82,
      crystal: Math.random() < 0.4,
      phase: Math.random() * TAU,
      speed: 0.2 + Math.random() * 0.6,
      driftX: 18 + Math.random() * 42,
      driftY: 14 + Math.random() * 30,
      a: cfg.bokeh.aMin + Math.random() * (cfg.bokeh.aMax - cfg.bokeh.aMin),
      rot: Math.random() * TAU,
    });
  }

  const dust = [];
  for (let i = 0; i < cfg.dust.count; i++) {
    dust.push({
      x: Math.random(), y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      speed: 0.6 + Math.random() * 1.6,
      phase: Math.random() * TAU,
      driftX: 6 + Math.random() * 16,
      tw: 0.4 + Math.random() * 0.7,
    });
  }

  const A = { rays, bokeh, dust };
  _ambiCache[cfg.id] = A;
  return A;
}

// Draw the full ambiance: deep bokeh, then god rays, then foreground dust.
function drawAmbiance(ctx, cfg, t) {
  const A = getAmbiance(cfg);
  drawBokehLayer(ctx, cfg, A.bokeh, t);
  drawGodRays(ctx, cfg, A.rays, t);
  drawDustLayer(ctx, cfg, A.dust, t);
}

// Out-of-focus bubbles (soft rings) and crystals (soft hex blobs) floating deep.
function drawBokehLayer(ctx, cfg, bokeh, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bokeh) {
    const cx = b.x * CANVAS_W + Math.sin(t * 0.0001 * b.speed + b.phase) * b.driftX;
    const cy = b.y * CANVAS_H + Math.cos(t * 0.00008 * b.speed + b.phase * 1.3) * b.driftY;
    const col = b.crystal ? cfg.bokeh.crystal : cfg.bokeh.bubble;

    if (b.crystal) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(b.rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
      g.addColorStop(0, 'rgba(' + col + ',' + b.a.toFixed(3) + ')');
      g.addColorStop(0.7, 'rgba(' + col + ',' + (b.a * 0.5).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      tracePolygon(ctx, hexCorners(0, 0, b.r * 0.9));
      ctx.fill();
      ctx.restore();
    } else {
      // Soft ring — brighter near the rim, like a defocused bubble.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
      g.addColorStop(0, 'rgba(' + col + ',' + (b.a * 0.32).toFixed(3) + ')');
      g.addColorStop(0.72, 'rgba(' + col + ',' + (b.a * 0.5).toFixed(3) + ')');
      g.addColorStop(0.9, 'rgba(' + col + ',' + b.a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, b.r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Volumetric light shafts fanning from an off-screen source.
function drawGodRays(ctx, cfg, rays, t) {
  const ox = cfg.ray.ox * CANVAS_W, oy = cfg.ray.oy * CANVAS_H;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(ox, oy);
  ctx.rotate(cfg.ray.tilt + Math.sin(t * 0.00012) * 0.03); // slow sway
  for (const r of rays) {
    const pulse = 0.6 + 0.4 * Math.sin(t * r.speed + r.phase);
    const aTop = cfg.ray.alpha * r.a * pulse;
    const g = ctx.createLinearGradient(0, 0, 0, r.len);
    g.addColorStop(0, 'rgba(' + cfg.ray.rgb + ',' + aTop.toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(' + cfg.ray.rgb + ',' + (aTop * 0.4).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + cfg.ray.rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(r.offset - r.topW / 2, 0);
    ctx.lineTo(r.offset + r.topW / 2, 0);
    ctx.lineTo(r.offset + r.botW / 2, r.len);
    ctx.lineTo(r.offset - r.botW / 2, r.len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Slowly rising, twinkling dust motes.
function drawDustLayer(ctx, cfg, dust, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    const y = ((d.y - t * 0.0000075 * d.speed) % 1 + 1) % 1;
    const cx = d.x * CANVAS_W + Math.sin(t * 0.0003 + d.phase) * d.driftX;
    const cy = y * CANVAS_H;
    const alpha = cfg.dust.alpha * (0.25 + 0.75 * Math.abs(Math.sin(t * 0.002 * d.tw + d.phase)));
    ctx.fillStyle = 'rgba(' + cfg.dust.rgb + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, d.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
