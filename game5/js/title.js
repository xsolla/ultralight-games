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
    // Ten more than the gameplay field, matching the density the title had.
    const starCount = Quality.get().starCount + 10;
    for (let i = 0; i < starCount; i++) {
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

  // Fixed geometry — built once, not every frame.
  let bgGrad = null;

  function drawBackground(ctx) {
    // Deep space radial gradient
    if (!bgGrad) {
      bgGrad = ctx.createRadialGradient(
        C.CANVAS_W / 2, C.CANVAS_H * 0.38, 40,
        C.CANVAS_W / 2, C.CANVAS_H / 2,    C.CANVAS_H * 0.9
      );
      bgGrad.addColorStop(0,   '#101030');
      bgGrad.addColorStop(0.5, '#080818');
      bgGrad.addColorStop(1,   '#030308');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Stars — baked glow sprites in one additive batch. These drift downward, so
    // unlike the gameplay field they cannot be baked into a static layer.
    ctx.globalCompositeOperation = 'lighter';
    for (const st of stars) {
      Glow.draw(ctx, '#aaddff', st.x, st.y, st.r,
                st.alpha * (0.5 + 0.5 * Math.sin(st.twinkle)));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
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

  // The logo's two words carry 28-35px glows and never change. Baked once at full
  // glow; the breathing is reproduced by cross-fading the blit's alpha, which is
  // what the animated shadowBlur was doing to the eye anyway.
  let logoLayer = null, haloGrad = null;
  const LOGO_TOP = 30, LOGO_H = 150;

  function bakeLogo(ctx) {
    if (logoLayer) return;
    logoLayer = document.createElement('canvas');
    logoLayer.width  = C.CANVAS_W;
    logoLayer.height = LOGO_H;
    const g = logoLayer.getContext('2d');
    const cx = C.CANVAS_W / 2;
    g.translate(0, -LOGO_TOP);
    g.textAlign = 'center';

    // "HELIX"
    g.font        = 'bold 64px monospace';
    g.shadowBlur  = 35;
    g.shadowColor = '#00e5ff';
    g.fillStyle   = '#ffffff';
    g.fillText('HELIX', cx, 96);

    // "FALL" — cyan, slightly smaller
    g.font        = 'bold 54px monospace';
    g.shadowBlur  = 28;
    g.shadowColor = '#ffffff';
    g.fillStyle   = '#00e5ff';
    g.fillText('FALL', cx, 150);
  }

  function drawLogo(ctx) {
    const cx = C.CANVAS_W / 2;
    bakeLogo(ctx);

    // Glow halo behind text
    if (!haloGrad) {
      haloGrad = ctx.createRadialGradient(cx, 118, 10, cx, 118, 110);
      haloGrad.addColorStop(0, '#00e5ff');
      haloGrad.addColorStop(1, 'rgba(0,229,255,0)');
    }
    ctx.globalAlpha = 0.18 * logoGlow;
    ctx.fillStyle = haloGrad;
    ctx.fillRect(cx - 140, 30, 280, 160);

    // Breathe between a dim and a full-strength blit rather than re-blurring.
    ctx.globalAlpha = 0.72 + 0.28 * logoGlow;
    ctx.drawImage(logoLayer, 0, LOGO_TOP);
    ctx.globalAlpha = 1;

    // Thin rule under logo
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 100, 162);
    ctx.lineTo(cx + 100, 162);
    ctx.stroke();
    ctx.restore();
  }

  const DIFFS  = ['easy', 'normal', 'hard'];
  const LABELS = ['EASY', 'NORMAL', 'HARD'];
  const COLORS = ['#69ff47', '#00e5ff', '#ff1744'];
  const DIFF_PAD = 20;

  // Six static faces (three buttons x selected/unselected), baked on first use.
  const diffCache = new Map();

  function diffSprite(i, w, h, active) {
    const key = i + ':' + (active ? 1 : 0);
    let c = diffCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width  = w + DIFF_PAD * 2;
    c.height = h + DIFF_PAD * 2;
    const g = c.getContext('2d');
    g.translate(DIFF_PAD, DIFF_PAD);

    g.font         = 'bold 11px monospace';
    g.textAlign    = 'center';
    g.textBaseline = 'middle';

    g.fillStyle   = active ? COLORS[i] + '28' : 'rgba(0,0,0,0.4)';
    g.strokeStyle = active ? COLORS[i]        : 'rgba(255,255,255,0.15)';
    g.lineWidth   = active ? 2 : 1;
    g.shadowBlur  = active ? 16 : 0;
    g.shadowColor = COLORS[i];
    roundRect(g, 0, 0, w, h, 9);
    g.fill();
    g.stroke();

    g.shadowBlur = active ? 12 : 0;
    g.fillStyle  = active ? COLORS[i] : 'rgba(255,255,255,0.4)';
    g.fillText(LABELS[i], w / 2, h / 2);

    diffCache.set(key, c);
    return c;
  }

  // The static caption above the row.
  let captionLayer = null;

  function drawDifficultySelector(ctx) {
    const cx = C.CANVAS_W / 2;

    if (!captionLayer) {
      captionLayer = document.createElement('canvas');
      captionLayer.width = C.CANVAS_W;
      captionLayer.height = 24;
      const g = captionLayer.getContext('2d');
      g.font          = 'bold 10px monospace';
      g.textAlign     = 'center';
      g.textBaseline  = 'middle';
      g.fillStyle     = 'rgba(255,255,255,0.35)';
      g.letterSpacing = '2px';
      g.fillText('SELECT DIFFICULTY', cx, 12);
    }
    ctx.drawImage(captionLayer, 0, 508 - 12);

    DIFFS.forEach((d, i) => {
      const { x: bx, y: by, w, h } = diffBtnBounds[d];
      const c = diffSprite(i, w, h, selectedDifficulty === d);
      ctx.drawImage(c, bx - DIFF_PAD, by - DIFF_PAD);
    });
  }

  // The button face never changes; only its glow breathes. Bake the face once with
  // its glow, then modulate the pulse with an additive blob behind it.
  let playLayer = null;
  const PLAY_PAD = 46;

  function bakePlayButton() {
    if (playLayer) return;
    const { w: bw, h: bh } = playBtnBounds;
    playLayer = document.createElement('canvas');
    playLayer.width  = bw + PLAY_PAD * 2;
    playLayer.height = bh + PLAY_PAD * 2;
    const g = playLayer.getContext('2d');
    g.translate(PLAY_PAD, PLAY_PAD);

    g.shadowBlur  = 36;
    g.shadowColor = '#00e5ff';

    const grad = g.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0, '#00c8e0');
    grad.addColorStop(1, '#0088a8');
    g.fillStyle = grad;
    roundRect(g, 0, 0, bw, bh, 16);
    g.fill();
    g.shadowBlur = 0;

    // Highlight strip at top
    g.globalAlpha = 0.25;
    g.fillStyle   = '#ffffff';
    roundRect(g, 3, 3, bw - 6, bh * 0.42, 14);
    g.fill();
    g.globalAlpha = 1;

    // Border
    g.strokeStyle = 'rgba(255,255,255,0.38)';
    g.lineWidth   = 1.5;
    roundRect(g, 0, 0, bw, bh, 16);
    g.stroke();

    // Label
    g.fillStyle    = '#ffffff';
    g.font         = 'bold 23px monospace';
    g.textAlign    = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur   = 12;
    g.shadowColor  = '#ffffff';
    g.fillText('▶  PLAY', bw / 2, bh / 2 + 1);
  }

  function drawPlayButton(ctx) {
    const { x: bx, y: by, w: bw, h: bh } = playBtnBounds;
    const pulse = 0.82 + 0.18 * Math.sin(animFrame * 2.4);
    bakePlayButton();

    // The breathing glow, additively behind the baked face.
    ctx.globalCompositeOperation = 'lighter';
    Glow.draw(ctx, '#00e5ff', bx + bw / 2, by + bh / 2, bw * 0.52, 0.16 * pulse);
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 1;
    ctx.drawImage(playLayer, bx - PLAY_PAD, by - PLAY_PAD);
  }

  const bestCache = { key: null, canvas: null };

  function drawBestScore(ctx) {
    if (bestScore <= 0) return;
    const cx = C.CANVAS_W / 2;
    const key = String(bestScore);

    if (bestCache.key !== key) {
      if (!bestCache.canvas) bestCache.canvas = document.createElement('canvas');
      const c = bestCache.canvas;
      if (c.width !== C.CANVAS_W || c.height !== 30) { c.width = C.CANVAS_W; c.height = 30; }
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.font          = 'bold 13px monospace';
      g.textAlign     = 'center';
      g.textBaseline  = 'middle';
      g.fillStyle     = 'rgba(255,255,255,0.38)';
      g.shadowBlur    = 6;
      g.shadowColor   = '#00e5ff';
      g.fillText(`BEST  ${bestScore}`, cx, 15);
      bestCache.key = key;
    }
    ctx.drawImage(bestCache.canvas, 0, 655 - 19);
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
    // Xsolla wordmark is title-screen only, per ../branding.md.
    Brand.drawLogo(ctx, C.BRAND_LOGO_X, C.BRAND_LOGO_Y, C.BRAND_LOGO_W);
    // Last, so the column sits above the rest of the screen.
    HUD.drawButtons(ctx, HUD.KINDS_TITLE);
  }

  function handleClick(cx, cy) {
    const btn = HUD.hitTest(cx, cy, HUD.KINDS_TITLE);
    if (btn) return btn;          // 'sound' | 'fullscreen', handled by Game

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
