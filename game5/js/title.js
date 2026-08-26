// title.js — Title screen rendering and logic

const Title = (() => {
  let angle = 0;
  let selectedDifficulty = 'normal';
  let bestScore = 0;
  let animFrame = 0;
  let logoGlow = 0;
  let playBtnBounds = {};
  let diffBtnBounds = {};
  // Starfield
  let stars = [];

  // Best score is owned and persisted by Game; it arrives via setBestScore().
  function init() {
    // Layout is static, so bounds are valid for hit testing from init onward —
    // not only after the first draw.
    const cx = C.CANVAS_W / 2;
    playBtnBounds = { x: cx - 93, y: 580, w: 186, h: 58 };

    const dw = 88, dh = 36, gap = 8;
    const startX = cx - (3 * dw + 2 * gap) / 2;
    diffBtnBounds = {};
    ['easy', 'normal', 'hard'].forEach((d, i) => {
      diffBtnBounds[d] = { x: startX + i * (dw + gap), y: 522, w: dw, h: dh };
    });

    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * C.CANVAS_W,
        y: Math.random() * C.CANVAS_H,
        r: 0.5 + Math.random() * 1.5,
        alpha: 0.1 + Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
  }

  function setBestScore(s) { bestScore = s; }
  function getDifficulty()  { return selectedDifficulty; }

  function update(dt) {
    angle     += C.TITLE_HELIX_SPEED * dt;
    animFrame += dt;
    logoGlow   = 0.55 + 0.45 * Math.sin(animFrame * 1.6);
    stars.forEach(s => {
      s.twinkle += s.speed * dt;
      s.y       += 0.12 * dt * 60; // slow drift down
      if (s.y > C.CANVAS_H) s.y = 0;
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  // ── Draw sections ─────────────────────────────────────────────────────────

  function drawBackground(ctx) {
    // Deep space radial gradient
    const grad = ctx.createRadialGradient(
      C.CANVAS_W / 2, C.CANVAS_H * 0.38, 40,
      C.CANVAS_W / 2, C.CANVAS_H / 2,    C.CANVAS_H * 0.9
    );
    grad.addColorStop(0,   '#101030');
    grad.addColorStop(0.5, '#080818');
    grad.addColorStop(1,   '#030308');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Stars
    stars.forEach(s => {
      const a = s.alpha * (0.5 + 0.5 * Math.sin(s.twinkle));
      ctx.save();
      ctx.globalAlpha  = a;
      ctx.fillStyle    = '#ffffff';
      ctx.shadowBlur   = s.r * 3;
      ctx.shadowColor  = '#aaddff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawHelixPreview(ctx) {
    const cx  = C.CANVAS_W / 2;
    const rx  = C.TOWER_RADIUS_X * 0.72;
    const seg = C.SEGMENT_COUNT;
    const segAngle  = (Math.PI * 2) / seg;
    const ringCount = C.TITLE_RING_COUNT;
    const topY      = 195;
    const spacing   = 40;

    for (let ri = 0; ri < ringCount; ri++) {
      const y          = topY + ri * spacing;
      const ry         = Helix.ringRadiusY(y) * 0.72;
      const geo        = { cx, y, rx, ry, thickness: 8 };
      const hue        = (C.RING_HUE_START + ri * 22) % 360;
      const depthAlpha = 0.2 + 0.8 * (ri / (ringCount - 1));

      const safeShade = Helix.makeShading(ctx, y, ry, hue, 100, 56);
      const deadShade = Helix.makeShading(ctx, y, ry, C.DEADLY_HSL[0], C.DEADLY_HSL[1], C.DEADLY_HSL[2]);

      // Far arcs first, matching the in-game tower.
      const order = [];
      for (let i = 0; i < seg; i++) {
        if (i >= 2 && i <= 4) continue; // gap
        const start = angle + i * segAngle;
        order.push({ i, start, depth: Math.sin(start + segAngle * 0.43) });
      }
      order.sort((a, b) => a.depth - b.depth);

      for (const s of order) {
        const isDeadly = (s.i === 8);
        Helix.drawArc3D(
          ctx, geo, s.start, s.start + segAngle * 0.86,
          isDeadly ? deadShade : safeShade,
          isDeadly ? 14 : 9,
          depthAlpha * (isDeadly ? 0.95 : 0.85)
        );
      }
    }
  }

  function drawLogo(ctx) {
    const cx = C.CANVAS_W / 2;

    // Glow halo behind text
    ctx.save();
    ctx.globalAlpha = 0.18 * logoGlow;
    const halo = ctx.createRadialGradient(cx, 118, 10, cx, 118, 110);
    halo.addColorStop(0, '#00e5ff');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 140, 30, 280, 160);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';

    // "HELIX"
    ctx.font        = 'bold 64px monospace';
    ctx.shadowBlur  = 35 * logoGlow;
    ctx.shadowColor = '#00e5ff';
    ctx.fillStyle   = '#ffffff';
    ctx.fillText('HELIX', cx, 96);

    // "FALL" — cyan, slightly smaller
    ctx.font        = 'bold 54px monospace';
    ctx.shadowBlur  = 28 * logoGlow;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle   = '#00e5ff';
    ctx.fillText('FALL', cx, 150);

    // Thin rule under logo
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.moveTo(cx - 100, 162);
    ctx.lineTo(cx + 100, 162);
    ctx.stroke();

    ctx.restore();
  }

  function drawDifficultySelector(ctx) {
    const cx     = C.CANVAS_W / 2;
    const diffs  = ['easy', 'normal', 'hard'];
    const labels = ['EASY', 'NORMAL', 'HARD'];
    const colors = ['#69ff47', '#00e5ff', '#ff1744'];

    // Label above
    ctx.save();
    ctx.font          = 'bold 10px monospace';
    ctx.textAlign     = 'center';
    ctx.fillStyle     = 'rgba(255,255,255,0.35)';
    ctx.letterSpacing = '2px';
    ctx.fillText('SELECT DIFFICULTY', cx, 508);
    ctx.restore();

    ctx.save();
    ctx.font          = 'bold 11px monospace';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';

    diffs.forEach((d, i) => {
      const { x: bx, y: by, w, h } = diffBtnBounds[d];
      const active = selectedDifficulty === d;

      // Background
      ctx.fillStyle   = active ? colors[i] + '28' : 'rgba(0,0,0,0.4)';
      ctx.strokeStyle = active ? colors[i]        : 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = active ? 2 : 1;
      ctx.shadowBlur  = active ? 16 : 0;
      ctx.shadowColor = colors[i];
      roundRect(ctx, bx, by, w, h, 9);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.shadowBlur  = active ? 12 : 0;
      ctx.fillStyle   = active ? colors[i] : 'rgba(255,255,255,0.4)';
      ctx.fillText(labels[i], bx + w / 2, by + h / 2);
    });

    ctx.restore();
  }

  function drawPlayButton(ctx) {
    const cx = C.CANVAS_W / 2;
    const { x: bx, y: by, w: bw, h: bh } = playBtnBounds;

    const pulse = 0.82 + 0.18 * Math.sin(animFrame * 2.4);

    ctx.save();

    // Outer glow
    ctx.shadowBlur  = 36 * pulse;
    ctx.shadowColor = '#00e5ff';

    // Button fill gradient
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, '#00c8e0');
    grad.addColorStop(1, '#0088a8');
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by, bw, bh, 16);
    ctx.fill();

    // Highlight strip at top
    ctx.globalAlpha = 0.25;
    ctx.fillStyle   = '#ffffff';
    roundRect(ctx, bx + 3, by + 3, bw - 6, bh * 0.42, 14);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 0;
    roundRect(ctx, bx, by, bw, bh, 16);
    ctx.stroke();

    // Label
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 23px monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur  = 12 * pulse;
    ctx.shadowColor = '#ffffff';
    ctx.fillText('▶  PLAY', cx, by + bh / 2 + 1);

    ctx.restore();
  }

  function drawBestScore(ctx) {
    if (bestScore <= 0) return;
    const cx = C.CANVAS_W / 2;
    ctx.save();
    ctx.font          = 'bold 13px monospace';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'alphabetic';
    ctx.fillStyle     = 'rgba(255,255,255,0.38)';
    ctx.shadowBlur    = 6;
    ctx.shadowColor   = '#00e5ff';
    ctx.fillText(`BEST  ${bestScore}`, cx, 655);
    ctx.restore();
  }

  function drawHint(ctx) {
    const cx = C.CANVAS_W / 2;
    const a  = 0.18 + 0.12 * Math.sin(animFrame * 1.1);
    ctx.save();
    ctx.globalAlpha   = a;
    ctx.font          = '11px monospace';
    ctx.textAlign     = 'center';
    ctx.fillStyle     = '#ffffff';
    ctx.fillText('← →  or drag to rotate', cx, 698);
    ctx.restore();
  }

  function draw(ctx) {
    drawBackground(ctx);
    drawHelixPreview(ctx);
    drawLogo(ctx);
    drawDifficultySelector(ctx);
    drawPlayButton(ctx);
    drawBestScore(ctx);
    drawHint(ctx);
  }

  function handleClick(cx, cy) {
    const diffs = ['easy', 'normal', 'hard'];
    for (const d of diffs) {
      const b = diffBtnBounds[d];
      if (b && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
        selectedDifficulty = d;
        return null;
      }
    }
    const pb = playBtnBounds;
    if (pb && cx >= pb.x && cx <= pb.x + pb.w && cy >= pb.y && cy <= pb.y + pb.h) {
      return 'play';
    }
    return null;
  }

  return { init, update, draw, handleClick, getDifficulty, setBestScore };
})();
