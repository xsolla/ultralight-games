// debris.js — Rings smashed by the ball: tumbling tube fragments venting gas

const Debris = (() => {
  let pieces = [];

  // Screen position of a fragment's midpoint, using the same projection as the
  // intact rings so a fragment starts exactly where its segment was drawn.
  function midPoint(p) {
    const am = (p.a0 + p.a1) / 2;
    const d  = Math.sin(am);
    const k  = 1 / (1 - C.RING_PERSPECTIVE * d);
    return {
      x: p.cx + p.rx * Math.cos(am) * k,
      y: p.y  + p.ry * d * k,
    };
  }

  // Blows one ring apart into a fragment per solid segment. scrollSpeed carries
  // the wreckage upward with the world it belonged to, so it falls behind the
  // ball rather than hanging in place.
  function emitRing(ring, score, difficulty, scrollSpeed, hitSegIndex, hitType) {
    const ry  = Helix.ringRadiusY(ring.y);
    const seg = C.SEGMENT_COUNT;
    const segAngle = (Math.PI * 2) / seg;
    const hue = (C.RING_HUE_START + score * C.RING_HUE_SCORE_SCALE + ring.hueOffset + 360) % 360;

    for (let i = 0; i < seg; i++) {
      const type = ring.types[i];
      if (type === 'gap') continue;

      let hsl;
      let segmentColor;
      if (type === 'deadly') {
        hsl = C.DEADLY_HSL;
        segmentColor = C.DEADLY_COLOR;
      } else if (type === 'powerup') {
        hsl = C.POWERUP_HSL[ring.powerupType] || C.POWERUP_HSL.mult;
        segmentColor = (ring.powerupType === 'shield') ? C.POWERUP_SHIELD_COLOR :
                       (ring.powerupType === 'slow')   ? C.POWERUP_SLOW_COLOR :
                       (ring.powerupType === 'bonus')  ? C.POWERUP_TEAL_COLOR :
                       (ring.powerupType === 'purple') ? C.POWERUP_PURPLE_COLOR :
                                                         C.POWERUP_MULT_COLOR;
      } else {
        hsl = [hue, 100, C.SAFE_LIGHTNESS];
        segmentColor = `hsl(${hue},100%,65%)`;
      }

      const a0 = Helix.getSegmentAngle(ring, i, difficulty);
      const a1 = a0 + segAngle * 0.88;
      const am = (a0 + a1) / 2;

      const life  = C.DEBRIS_LIFE * (0.8 + Math.random() * 0.4);
      const burst = C.DEBRIS_BURST_SPEED * (0.75 + Math.random() * 0.5);

      pieces.push({
        cx: C.TOWER_CX, y: ring.y, rx: C.TOWER_RADIUS_X, ry,
        thickness: C.RING_THICKNESS,
        a0, a1, hsl,
        // fly outward from the tower axis; the ellipse is wide and shallow, so
        // this is mostly sideways with a little vertical spread
        vx: Math.cos(am) * burst,
        vy: Math.sin(am) * burst * 0.45 - scrollSpeed,
        rot: 0,
        vRot: (Math.random() - 0.5) * 2 * C.DEBRIS_SPIN,
        life, maxLife: life,
        gasTimer: 0,
      });

      // Emit initial burst of particles ONLY for the segment that was actually hit
      if (i === hitSegIndex && (type === 'deadly' || type === 'powerup')) {
        const d = Math.sin(am);
        const k = 1 / (1 - C.RING_PERSPECTIVE * d);
        const px = C.TOWER_CX + C.TOWER_RADIUS_X * Math.cos(am) * k;
        const py = ring.y + ry * d * k;
        Particles.emitSpecialSegment(px, py, segmentColor);
      }
    }

    // Oldest wreckage goes first if a fast run outruns the cap.
    if (pieces.length > C.DEBRIS_MAX_PIECES) {
      pieces.splice(0, pieces.length - C.DEBRIS_MAX_PIECES);
    }
  }

  function update(dt) {
    const drag = Math.pow(C.DEBRIS_DRAG, dt * 60);

    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.cx  += p.vx * dt;
      p.y   += p.vy * dt;
      p.vy  += C.DEBRIS_GRAVITY * dt;
      p.vx  *= drag;
      p.vy  *= drag;
      p.rot += p.vRot * dt;
      p.life -= dt;

      if (p.life <= 0) { pieces.splice(i, 1); continue; }

      // Vent only while the fragment is still hot — a fragment venting for its
      // whole life floods the particle pool once rings start passing quickly.
      p.gasTimer -= dt;
      if (p.gasTimer <= 0 && p.life / p.maxLife > C.DEBRIS_GAS_WHILE) {
        p.gasTimer = C.DEBRIS_GAS_INTERVAL;
        const m = midPoint(p);
        Particles.emitGas(m.x, m.y, `hsl(${p.hsl[0]}, ${p.hsl[1]}%, ${p.hsl[2]}%)`);
      }
    }
  }

  function draw(ctx) {
    for (const p of pieces) {
      const t     = Math.max(0, p.life / p.maxLife);
      const alpha = Math.min(1, t * 2);         // hold full, then fade out
      const m     = midPoint(p);
      // Shade around the fragment itself, not its old ring. A detached piece is
      // just a lit tube; reusing the ring-wide depth ramp drops most of it into
      // the dark far-side band and it reads as grey debris.
      const shading = Helix.makeShading(
        ctx, m.y, p.thickness * 0.8, p.hsl[0], p.hsl[1], p.hsl[2]
      );

      ctx.save();
      ctx.translate(m.x, m.y);                  // tumble about the fragment
      ctx.rotate(p.rot);
      ctx.translate(-m.x, -m.y);
      Helix.drawArc3D(
        ctx,
        { cx: p.cx, y: p.y, rx: p.rx, ry: p.ry, thickness: p.thickness * (0.55 + 0.45 * t) },
        p.a0, p.a1, shading, 14 * t, alpha
      );
      ctx.restore();
    }
  }

  function clear() { pieces = []; }
  function count() { return pieces.length; }

  return { emitRing, update, draw, clear, count };
})();
