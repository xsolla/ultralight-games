// helix.js — Helix tower: ring generation, rotation, rendering

const Helix = (() => {
  let rings = [];
  let rotationAngle = 0;
  let ringsPassed = 0;
  let currentGapSize = C.INITIAL_GAP_SIZE;
  let diffSettings = {};

  // Populates `ring` in place — rings are pooled, never reallocated after init.
  function resetRing(ring, yPos) {
    const seg = C.SEGMENT_COUNT;
    const gapSize = currentGapSize;
    const deadlyCount = diffSettings.DEADLY_COUNT || 1;

    const gapStart = Math.floor(Math.random() * seg);

    const deadlySegments = [];
    let attempts = 0;
    while (deadlySegments.length < deadlyCount && attempts < 100) {
      attempts++;
      const d = Math.floor(Math.random() * seg);
      let overlapsGap = false;
      for (let g = 0; g < gapSize; g++) {
        if ((gapStart + g) % seg === d) { overlapsGap = true; break; }
      }
      if (!overlapsGap && !deadlySegments.includes(d)) deadlySegments.push(d);
    }

    let powerupSeg = -1;
    if (Math.random() < diffSettings.POWERUP_CHANCE) {
      const candidates = [];
      for (let i = 0; i < seg; i++) {
        let inGap = false;
        for (let g = 0; g < gapSize; g++) if ((gapStart + g) % seg === i) inGap = true;
        if (!inGap && !deadlySegments.includes(i)) candidates.push(i);
      }
      if (candidates.length > 0)
        powerupSeg = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const types = ring.types || new Array(seg);
    for (let i = 0; i < seg; i++) types[i] = 'safe';
    for (let g = 0; g < gapSize; g++) types[(gapStart + g) % seg] = 'gap';
    deadlySegments.forEach(d => { types[d] = 'deadly'; });
    if (powerupSeg >= 0) types[powerupSeg] = 'powerup';

    const puTypes = ['shield', 'slow', 'mult', 'bonus', 'purple'];

    ring.y                = yPos;
    ring.types            = types;
    ring.powerupSeg       = powerupSeg;
    ring.powerupType      = powerupSeg >= 0 ? puTypes[Math.floor(Math.random() * puTypes.length)] : null;
    ring.passed           = false;
    ring.deadlyDriftAngle = 0;
    // per-ring hue offset for visual variety
    ring.hueOffset        = Math.random() * 30 - 15;
    return ring;
  }

  function init(difficulty) {
    diffSettings = C.DIFFICULTY[difficulty] || C.DIFFICULTY.normal;
    currentGapSize = diffSettings.INITIAL_GAP_SIZE;
    rotationAngle = 0;
    ringsPassed = 0;
    rings = [];
    for (let i = 0; i < C.RING_COUNT; i++) {
      rings.push(resetRing({}, C.TOWER_BALL_Y + (i + 1) * C.RING_SPACING));
    }
  }

  function update(dt, fallSpeed, difficulty) {
    const scrollAmt = fallSpeed * dt;
    const drift     = difficulty === 'hard' ? C.HARD_DEADLY_DRIFT_SPEED * dt : 0;

    for (const r of rings) {
      r.y -= scrollAmt;
      r.deadlyDriftAngle += drift;
    }

    // Safety net: anything that scrolled off the top without being smashed
    // (only reachable if a ring is somehow never collided with) goes round again.
    for (const r of rings) {
      if (r.y < -C.RING_SPACING * 2) recycleRing(r);
    }
  }

  // Sends a ring back to the bottom of the stack and advances difficulty.
  function recycleRing(ring) {
    ringsPassed++;
    if (ringsPassed % C.GAP_SHRINK_EVERY === 0 && currentGapSize > C.MIN_GAP_SIZE)
      currentGapSize--;

    let bottomY = -Infinity;
    for (const r of rings) if (r !== ring && r.y > bottomY) bottomY = r.y;
    resetRing(ring, bottomY + C.RING_SPACING);
  }

  // The ball punched through this ring: burst it into debris, then reuse the
  // ring object at the bottom of the tower.
  function shatterRing(ring, score, difficulty, scrollSpeed, hitSegIndex, hitType) {
    Debris.emitRing(ring, score, difficulty, scrollSpeed, hitSegIndex, hitType);
    recycleRing(ring);
  }

  function rotate(delta) { rotationAngle += delta; }

  // Screen-space start angle of segment `i`, including hard-mode deadly drift.
  // Single source of truth: hit testing, near-miss checks and rendering all use it.
  function getSegmentAngle(ring, i, difficulty) {
    let a = rotationAngle + i * ((Math.PI * 2) / C.SEGMENT_COUNT);
    if (ring.types[i] === 'deadly' && difficulty === 'hard') a += ring.deadlyDriftAngle;
    return a;
  }

  function getSegmentAtAngle(ring, screenAngle, difficulty) {
    const seg = C.SEGMENT_COUNT;
    const segAngle = (Math.PI * 2) / seg;
    let match = null;
    for (let i = 0; i < seg; i++) {
      const segStart = getSegmentAngle(ring, i, difficulty);
      const a = ((screenAngle - segStart) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (a >= segAngle) continue;
      // A drifting deadly segment can overlap a neighbour in hard mode. Deadly
      // wins, so the hit test matches the arc actually drawn over the ball.
      if (ring.types[i] === 'deadly') return { type: 'deadly', segIndex: i };
      if (!match) match = { type: ring.types[i], segIndex: i };
    }
    return match || { type: 'safe', segIndex: 0 };
  }

  function getRings()    { return rings; }
  function getRotation() { return rotationAngle; }

  // ── 3D projection ─────────────────────────────────────────────────────────
  //
  // A ring is a horizontal circle around the tower axis. Screen angle `a` runs
  // so that a = PI/2 is the point nearest the viewer (drawn at the bottom of the
  // ellipse) and a = -PI/2 is the far side. Two cues make that readable:
  //
  //   1. Vertical radius grows with distance below the horizon, so rings high on
  //      screen are nearly edge-on and rings low on screen open up.
  //   2. The near half projects larger than the far half (RING_PERSPECTIVE), so
  //      the ellipse is egg-shaped and near arcs are drawn thicker.

  function ringRadiusY(y) {
    return C.RING_RY_MIN + Math.max(0, y - C.RING_HORIZON_Y) * C.RING_RY_SLOPE;
  }

  // Screen Y of the nearest point of a ring — where the ball actually meets it.
  function getRingFrontY(ring) {
    return ring.y + ringRadiusY(ring.y) / (1 - C.RING_PERSPECTIVE);
  }

  // Depth ramp for a ring: dark on the far side, bright on the near side.
  // Vertical position within a ring *is* depth, so a vertical gradient shades it.
  function makeShading(ctx, y, ry, h, s, l) {
    const yBack  = y - ry / (1 + C.RING_PERSPECTIVE);
    const yFront = y + ry / (1 - C.RING_PERSPECTIVE);
    const L = m => Math.max(0, Math.min(95, l * m)).toFixed(1);

    const body = ctx.createLinearGradient(0, yBack, 0, yFront);
    body.addColorStop(0,    `hsl(${h}, ${s}%, ${L(C.RING_SHADE_BACK)}%)`);
    body.addColorStop(0.55, `hsl(${h}, ${s}%, ${L(1)}%)`);
    body.addColorStop(1,    `hsl(${h}, ${s}%, ${L(C.RING_SHADE_FRONT)}%)`);

    // Specular highlight rides the top of the tube, fading out toward the back.
    // Kept below full white so the segment keeps its hue at the near edge.
    const spec = ctx.createLinearGradient(0, yBack, 0, yFront);
    spec.addColorStop(0,    `hsla(${h}, ${s}%, ${L(1.35)}%, 0)`);
    spec.addColorStop(0.45, `hsla(${h}, ${s}%, ${L(1.35)}%, 0)`);
    spec.addColorStop(1,    `hsla(${h}, ${s}%, ${L(1.45)}%, ${C.RING_SPECULAR})`);

    return { body, spec, glowColor: `hsl(${h}, ${s}%, ${L(1.15)}%)` };
  }

  // Traces a variable-width ribbon through `pts` (a tube seen side-on) as one
  // simple capsule outline: up one side, round the far cap, back down the other,
  // round the near cap. Kept as a single non-self-intersecting loop so the
  // nonzero fill rule can't punch holes where a cap meets the body.
  // vShift lifts it along screen Y to place the specular highlight.
  function ribbonPath(ctx, pts, widthScale, vShift) {
    const n = pts.length - 1;
    const L = [], R = [], ang = [];
    for (let i = 0; i <= n; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n, i + 1)];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len;
      const w  = pts[i].w * widthScale;
      const cy = pts[i].y + pts[i].w * vShift;
      L.push({ x: pts[i].x + nx * w, y: cy + ny * w });
      R.push({ x: pts[i].x - nx * w, y: cy - ny * w });
      ang.push(Math.atan2(ny, nx));
    }

    const capY = i => pts[i].y + pts[i].w * vShift;
    const capW = i => pts[i].w * widthScale;

    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i <= n; i++) ctx.lineTo(L[i].x, L[i].y);
    // far cap: sweep the outward half-circle from the L side round to the R side
    ctx.arc(pts[n].x, capY(n), capW(n), ang[n], ang[n] - Math.PI, true);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    // near cap: back round to where we started
    ctx.arc(pts[0].x, capY(0), capW(0), ang[0] + Math.PI, ang[0], true);
    ctx.closePath();
  }

  // Draws one segment as a lit tube. geo: { cx, y, rx, ry, thickness }.
  function drawArc3D(ctx, geo, a0, a1, shading, glow, alpha) {
    const steps = C.RING_STEPS;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      const d = Math.sin(a);                        // +1 nearest, -1 farthest
      const p = 1 / (1 - C.RING_PERSPECTIVE * d);   // near points project larger
      pts.push({
        x: geo.cx + geo.rx * Math.cos(a) * p,
        y: geo.y  + geo.ry * d * p,
        w: geo.thickness * 0.5 * p,
      });
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);

    if (glow > 0) {
      // Far arcs glow less — haze falls off with distance.
      const midD = Math.sin((a0 + a1) / 2);
      ctx.shadowBlur  = glow * (0.2 + 0.8 * (midD + 1) / 2);
      ctx.shadowColor = shading.glowColor;
    }
    ribbonPath(ctx, pts, 1, 0);
    ctx.fillStyle = shading.body;
    ctx.fill();

    ctx.shadowBlur = 0;
    ribbonPath(ctx, pts, 0.34, -0.34);
    ctx.fillStyle = shading.spec;
    ctx.fill();

    ctx.restore();
  }

  function drawRing(ctx, ring, score, difficulty) {
    const y   = ring.y;
    const ry  = ringRadiusY(y);
    const geo = { cx: C.TOWER_CX, y, rx: C.TOWER_RADIUS_X, ry, thickness: C.RING_THICKNESS };
    const seg = C.SEGMENT_COUNT;
    const segAngle = (Math.PI * 2) / seg;

    // Depth fade: rings near ball are fully bright; far below are dimmer
    const distFromBall = Math.abs(y - C.TOWER_BALL_Y);
    const depthAlpha   = Math.max(0.25, 1 - distFromBall / (C.RING_SPACING * C.RING_COUNT * 0.7));

    const hue = (C.RING_HUE_START + score * C.RING_HUE_SCORE_SCALE + ring.hueOffset + 360) % 360;
    const t   = Game.getTime();

    // One gradient per colour rather than per segment — every safe arc on a ring
    // shares the same depth ramp.
    const shadingCache = {};
    function shadeFor(type) {
      if (shadingCache[type]) return shadingCache[type];
      let hsl;
      if (type === 'deadly')       hsl = C.DEADLY_HSL;
      else if (type === 'powerup') hsl = C.POWERUP_HSL[ring.powerupType] || C.POWERUP_HSL.mult;
      else                         hsl = [hue, 100, C.SAFE_LIGHTNESS];
      return (shadingCache[type] = makeShading(ctx, y, ry, hsl[0], hsl[1], hsl[2]));
    }

    // Far arcs first, so near arcs overlap them where the ellipse crosses itself.
    const order = [];
    for (let i = 0; i < seg; i++) {
      if (ring.types[i] === 'gap') continue;
      const start = getSegmentAngle(ring, i, difficulty);
      order.push({ i, start, depth: Math.sin(start + segAngle * 0.44) });
    }
    order.sort((a, b) => a.depth - b.depth);

    for (const s of order) {
      const type = ring.types[s.i];
      let glow, alpha;

      if (type === 'deadly') {
        const pulse = 0.75 + 0.25 * Math.sin(t * 4 + s.i);
        glow  = 18 * pulse;
        alpha = depthAlpha * (0.85 + 0.15 * pulse);
      } else if (type === 'powerup') {
        const pulse = 0.65 + 0.35 * Math.sin(t * 7 + s.i * 0.8);
        glow  = 16 * pulse;
        alpha = depthAlpha * (0.75 + 0.25 * pulse);
      } else {
        // Safe segment — subtle brightness shimmer
        glow  = 10;
        alpha = depthAlpha * (0.94 + 0.06 * Math.sin(t * 2 + s.i * 0.5));
      }

      drawArc3D(ctx, geo, s.start, s.start + segAngle * 0.88, shadeFor(type), glow, alpha);
    }
  }

  function draw(ctx, score, difficulty) {
    // Painter's order: lowest rings first so nearer ones overlap them.
    // Sorted in place — ring order carries no meaning elsewhere.
    rings.sort((a, b) => b.y - a.y);
    for (const r of rings) {
      // Smashed rings recycle to the bottom of the stack, so most of the pool
      // now sits below the viewport. Drawing a tube is not cheap — skip them.
      if (r.y < -C.RING_SPACING || r.y > C.CANVAS_H + C.RING_SPACING) continue;
      drawRing(ctx, r, score, difficulty);
    }
  }

  return {
    init, update, rotate, draw,
    getRings, getRotation, getSegmentAngle, getSegmentAtAngle,
    ringRadiusY, getRingFrontY, makeShading, drawArc3D, shatterRing,
  };
})();
