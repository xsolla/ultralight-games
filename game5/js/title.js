// title.js — Title screen rendering and logic
//
// Layout is one vertical rhythm, driven entirely by the TITLE_* constants:
//
//   logo lockup  ── two words justified to the same width, over a tracked tagline
//   helix emblem ── a scaled copy of the real tower, rotating
//   scrim        ── grounds everything below it against the atmosphere
//   best pill    ── label + value in one chip
//   difficulty   ── a segmented control, not three loose buttons, plus a descriptor
//   play         ── the one primary action, the brightest thing on the screen
//
// Everything static is baked to an offscreen canvas on first use and blitted after;
// only the atmosphere, the tower and a few alphas are live. See glow.js for why.

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

  const DIFFS  = ['easy', 'normal', 'hard'];
  const LABELS = ['EASY', 'NORMAL', 'HARD'];
  const COLORS = DIFFS.map(d => C.DIFF_COLORS[d]);
  const NOTES  = ['SLOW RAMP · WIDE GAPS',
                  'BALANCED DESCENT',
                  'FAST RAMP · DRIFTING SPIKES'];

  // Best score is owned and persisted by Game; it arrives via setBestScore().
  function init() {
    // Layout is static, so bounds are valid for hit testing from init onward —
    // not only after the first draw.
    const cx = C.CANVAS_W / 2;
    playBtnBounds = {
      x: cx - C.TITLE_PLAY_W / 2, y: C.TITLE_PLAY_Y,
      w: C.TITLE_PLAY_W, h: C.TITLE_PLAY_H,
    };

    // A cell's hit region is its full third of the control, padding included — the
    // drawn pill is inset, but there is no reason to make the touch target smaller
    // than the space the control occupies.
    const dw = C.TITLE_DIFF_W / 3;
    const x0 = cx - C.TITLE_DIFF_W / 2;
    diffBtnBounds = {};
    DIFFS.forEach((d, i) => {
      diffBtnBounds[d] = { x: x0 + i * dw, y: C.TITLE_DIFF_Y, w: dw, h: C.TITLE_DIFF_H };
    });

    buildStars();
    Atmos.init();
  }

  function buildStars() {
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

  // Star and atmosphere counts are both tier-derived, so a tier change rebuilds
  // them. Called by Game when Quality steps.
  function onQualityChange() {
    buildStars();
    Atmos.init();
  }

  function setBestScore(s) {
    if (s !== bestScore) { bestScore = s; bestCache.key = null; }
  }
  function getDifficulty() { return selectedDifficulty; }

  function update(dt) {
    angle     += C.TITLE_HELIX_SPEED * dt;
    animFrame += dt;
    logoGlow   = 0.55 + 0.45 * Math.sin(animFrame * 1.6);
    stars.forEach(s => {
      s.twinkle += s.speed * dt;
      s.y       += 0.12 * dt * 60; // slow drift down
      if (s.y > C.CANVAS_H) s.y = 0;
    });
    Atmos.update(dt);
  }

  // ── Background ────────────────────────────────────────────────────────────

  // Fixed geometry — built once, not every frame.
  let bgGrad = null, scrimGrad = null;

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

  // Everything below the tower is UI, and UI needs a settled ground to sit on. The
  // scrim pulls the atmosphere's brightness back down over the bottom third so the
  // pill, the control and the button all hold their contrast.
  function drawScrim(ctx) {
    if (!scrimGrad) {
      scrimGrad = ctx.createLinearGradient(0, C.TITLE_SCRIM_TOP, 0, C.CANVAS_H);
      scrimGrad.addColorStop(0,    'rgba(4,4,12,0)');
      scrimGrad.addColorStop(0.55, `rgba(4,4,12,${C.TITLE_SCRIM_ALPHA * 0.72})`);
      scrimGrad.addColorStop(1,    `rgba(4,4,12,${C.TITLE_SCRIM_ALPHA})`);
    }
    ctx.fillStyle = scrimGrad;
    ctx.fillRect(0, C.TITLE_SCRIM_TOP, C.CANVAS_W, C.CANVAS_H - C.TITLE_SCRIM_TOP);
  }

  // ── Helix emblem ──────────────────────────────────────────────────────────

  function drawHelixPreview(ctx) {
    const cx    = C.CANVAS_W / 2;
    const scale = C.TITLE_RING_SCALE;
    const rx    = C.TOWER_RADIUS_X * scale;
    const seg   = C.SEGMENT_COUNT;
    const segAngle  = (Math.PI * 2) / seg;
    const ringCount = C.TITLE_RING_COUNT;

    for (let ri = 0; ri < ringCount; ri++) {
      const y          = C.TITLE_RING_TOP_Y + ri * C.TITLE_RING_SPACING;
      const ry         = Helix.ringRadiusY(y) * scale;
      const geo        = { cx, y, rx, ry, thickness: 8 };
      const hue        = (C.RING_HUE_START + ri * 26) % 360;
      const depthAlpha = 0.24 + 0.76 * (ri / (ringCount - 1));

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

  // ── Logo lockup ───────────────────────────────────────────────────────────
  // "HELIX" and "FALL" are tracked out to exactly the same width, which is what
  // turns two centred words into a single deliberate block. The width match is
  // measured at bake time rather than hand-tuned, so it survives a font change.
  //
  // The two words carry 28-35px glows and never change, so the whole lockup is
  // baked at full glow and its breathing reproduced by cross-fading the blit's
  // alpha — which is what the animated shadowBlur was doing to the eye anyway.

  // The layer spans the lockup plus room for its glow to spread on both sides.
  let logoLayer = null, haloGrad = null;
  const LOGO_TOP = 36, LOGO_H = 180;

  function bakeLogo() {
    if (logoLayer) return;
    logoLayer = document.createElement('canvas');
    logoLayer.width  = C.CANVAS_W;
    logoLayer.height = LOGO_H;
    const g = logoLayer.getContext('2d');
    const cx = C.CANVAS_W / 2;
    g.translate(0, -LOGO_TOP);
    g.textBaseline = 'alphabetic';

    // "HELIX" — white, lightly tracked; its width becomes the lockup's measure.
    g.font        = 'bold 58px monospace';
    g.shadowBlur  = 34;
    g.shadowColor = '#00e5ff';
    g.fillStyle   = '#ffffff';
    const measure = UI.trackedWidth(g, 'HELIX', 2);
    UI.fillTracked(g, 'HELIX', cx, C.TITLE_LOGO_Y1, 2);

    // "FALL" — cyan, tracked until it spans the same measure. One fewer glyph over
    // the same width means real air between the letters, so it is set large enough
    // that the tracking reads as deliberate spacing rather than four stray letters.
    g.font        = 'bold 44px monospace';
    g.shadowBlur  = 26;
    g.shadowColor = '#ffffff';
    g.fillStyle   = '#00e5ff';
    UI.fillTracked(g, 'FALL', cx, C.TITLE_LOGO_Y2, UI.trackingToWidth(g, 'FALL', measure));

    // Tagline, flanked by rules that stop short of the text on both sides.
    g.shadowBlur   = 0;
    g.font         = 'bold 9px monospace';
    g.fillStyle    = 'rgba(255,255,255,0.34)';
    const tag  = 'ENDLESS DESCENT';
    const tagW = UI.trackedWidth(g, tag, 3.5);
    UI.fillTracked(g, tag, cx, C.TITLE_TAGLINE_Y + 3, 3.5);
    const inner = tagW / 2 + 11, outer = measure / 2;
    if (outer > inner) {
      UI.rule(g, cx - outer, cx - inner, C.TITLE_TAGLINE_Y, 'rgba(0,229,255,0.28)');
      UI.rule(g, cx + inner, cx + outer, C.TITLE_TAGLINE_Y, 'rgba(0,229,255,0.28)');
    }
  }

  function drawLogo(ctx) {
    const cx = C.CANVAS_W / 2;
    bakeLogo();

    // Glow halo behind the text.
    if (!haloGrad) {
      haloGrad = ctx.createRadialGradient(cx, 140, 10, cx, 140, 118);
      haloGrad.addColorStop(0, '#00e5ff');
      haloGrad.addColorStop(1, 'rgba(0,229,255,0)');
    }
    ctx.globalAlpha = 0.11 * logoGlow;
    ctx.fillStyle = haloGrad;
    ctx.fillRect(cx - 140, 40, 280, 180);

    // Breathe between a dim and a full-strength blit rather than re-blurring.
    ctx.globalAlpha = 0.74 + 0.26 * logoGlow;
    ctx.drawImage(logoLayer, 0, LOGO_TOP);
    ctx.globalAlpha = 1;
  }

  // ── Best score pill ───────────────────────────────────────────────────────
  // Label and value share one chip, with the label small and dim and the value
  // bright: the pill says what the number is without a separate caption line.

  const bestCache = { key: null, canvas: null };
  const BEST_PAD = 16;

  function bakeBest() {
    const key = String(bestScore);
    if (bestCache.key === key) return;
    if (!bestCache.canvas) bestCache.canvas = document.createElement('canvas');
    const c = bestCache.canvas;
    const w = C.TITLE_BEST_W + BEST_PAD * 2, h = C.TITLE_BEST_H + BEST_PAD * 2;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.translate(BEST_PAD, BEST_PAD);

    const bw = C.TITLE_BEST_W, bh = C.TITLE_BEST_H, r = bh / 2;
    g.fillStyle   = 'rgba(255,255,255,0.035)';
    g.strokeStyle = 'rgba(0,229,255,0.22)';
    g.lineWidth   = 1;
    UI.roundRect(g, 0, 0, bw, bh, r);
    g.fill();
    g.stroke();

    // Lay the label and the value out as one centred run, so the pill stays
    // optically balanced whatever the number's width.
    const value = bestScore > 0 ? String(bestScore) : '—';
    g.textBaseline = 'middle';
    g.font = 'bold 9px monospace';
    const labelW = UI.trackedWidth(g, 'BEST', 2.5);
    g.font = 'bold 18px monospace';
    const valueW = g.measureText(value).width;
    const gap = 10;
    const startX = bw / 2 - (labelW + gap + valueW) / 2;

    g.font      = 'bold 9px monospace';
    g.fillStyle = 'rgba(255,255,255,0.42)';
    UI.fillTracked(g, 'BEST', startX + labelW / 2, bh / 2 + 1, 2.5);

    g.font        = 'bold 18px monospace';
    g.textAlign   = 'left';
    g.shadowBlur  = 10;
    g.shadowColor = '#00e5ff';
    g.fillStyle   = bestScore > 0 ? '#8ff2ff' : 'rgba(255,255,255,0.3)';
    g.fillText(value, startX + labelW + gap, bh / 2 + 1);

    bestCache.key = key;
  }

  function drawBestScore(ctx) {
    bakeBest();
    ctx.drawImage(bestCache.canvas,
                  C.CANVAS_W / 2 - C.TITLE_BEST_W / 2 - BEST_PAD,
                  C.TITLE_BEST_Y - BEST_PAD);
  }

  // ── Difficulty ────────────────────────────────────────────────────────────
  // One segmented control with three cells. Grouping the choices inside a single
  // container is what communicates that they are mutually exclusive; three
  // separate boxes read as three separate actions.

  const diffCache = new Map();   // selected index -> baked control
  const noteCache = new Map();   // selected index -> baked descriptor
  const DIFF_PAD = 22;

  function diffSprite(sel) {
    let c = diffCache.get(sel);
    if (c) return c;
    const cw = C.TITLE_DIFF_W, ch = C.TITLE_DIFF_H;
    c = document.createElement('canvas');
    c.width  = cw + DIFF_PAD * 2;
    c.height = ch + DIFF_PAD * 2;
    const g = c.getContext('2d');
    g.translate(DIFF_PAD, DIFF_PAD);

    // Container
    g.fillStyle   = 'rgba(255,255,255,0.04)';
    g.strokeStyle = 'rgba(150,180,220,0.22)';
    g.lineWidth   = 1;
    UI.roundRect(g, 0, 0, cw, ch, 13);
    g.fill();
    g.stroke();

    const pad = C.TITLE_DIFF_PAD;
    const cellW = (cw - pad * 2) / 3, cellH = ch - pad * 2;

    // Hairline separators between unselected neighbours only — a divider next to
    // the selected pill would just crowd its outline.
    for (let i = 1; i < 3; i++) {
      if (i === sel || i - 1 === sel) continue;
      const x = pad + i * cellW;
      g.strokeStyle = 'rgba(150,180,220,0.14)';
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, pad + 7);
      g.lineTo(Math.round(x) + 0.5, pad + cellH - 7);
      g.stroke();
    }

    g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const x = pad + i * cellW, y = pad;
      const active = i === sel;

      if (active) {
        g.fillStyle   = COLORS[i] + '26';
        g.strokeStyle = COLORS[i];
        g.lineWidth   = 1.5;
        g.shadowBlur  = 16;
        g.shadowColor = COLORS[i];
        UI.roundRect(g, x, y, cellW, cellH, 10);
        g.fill();
        g.shadowBlur = 0;
        g.stroke();
        UI.topHighlight(g, x, y, cellW, cellH, 10, 0.14);
      }

      g.font        = 'bold 11px monospace';
      g.shadowBlur  = active ? 10 : 0;
      g.shadowColor = COLORS[i];
      g.fillStyle   = active ? COLORS[i] : 'rgba(255,255,255,0.40)';
      UI.fillTracked(g, LABELS[i], x + cellW / 2, y + cellH / 2 + 1, 1.2);
      g.shadowBlur = 0;
    }

    diffCache.set(sel, c);
    return c;
  }

  function noteSprite(sel) {
    let c = noteCache.get(sel);
    if (c) return c;
    c = document.createElement('canvas');
    c.width  = C.CANVAS_W;
    c.height = 20;
    const g = c.getContext('2d');
    g.font         = '9px monospace';
    g.textBaseline = 'middle';
    g.fillStyle    = 'rgba(255,255,255,0.30)';
    UI.fillTracked(g, NOTES[sel], C.CANVAS_W / 2, 10, 2);
    noteCache.set(sel, c);
    return c;
  }

  // The caption above the row never changes.
  let captionLayer = null;

  function drawDifficultySelector(ctx) {
    const cx = C.CANVAS_W / 2;
    const sel = DIFFS.indexOf(selectedDifficulty);

    if (!captionLayer) {
      captionLayer = document.createElement('canvas');
      captionLayer.width  = C.CANVAS_W;
      captionLayer.height = 20;
      const g = captionLayer.getContext('2d');
      g.font         = 'bold 9px monospace';
      g.textBaseline = 'middle';
      g.fillStyle    = 'rgba(255,255,255,0.32)';
      UI.fillTracked(g, 'SELECT DIFFICULTY', cx, 10, 3);
    }
    ctx.drawImage(captionLayer, 0, C.TITLE_DIFF_CAPTION_Y - 10);

    ctx.drawImage(diffSprite(sel),
                  cx - C.TITLE_DIFF_W / 2 - DIFF_PAD,
                  C.TITLE_DIFF_Y - DIFF_PAD);

    ctx.drawImage(noteSprite(sel), 0, C.TITLE_DIFF_NOTE_Y - 10);
  }

  // ── Play button ───────────────────────────────────────────────────────────
  // The button face never changes; only its glow breathes. Bake the face once with
  // its glow, then modulate the pulse with an additive blob behind it.

  let playLayer = null;
  const PLAY_PAD = 46;

  function bakePlayButton() {
    if (playLayer) return;
    const bw = C.TITLE_PLAY_W, bh = C.TITLE_PLAY_H, r = 18;
    playLayer = document.createElement('canvas');
    playLayer.width  = bw + PLAY_PAD * 2;
    playLayer.height = bh + PLAY_PAD * 2;
    const g = playLayer.getContext('2d');
    g.translate(PLAY_PAD, PLAY_PAD);

    g.shadowBlur  = 34;
    g.shadowColor = '#00e5ff';
    const grad = g.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0,    '#22d8ee');
    grad.addColorStop(0.52, '#00bcd8');
    grad.addColorStop(1,    '#0079a0');
    g.fillStyle = grad;
    UI.roundRect(g, 0, 0, bw, bh, r);
    g.fill();
    g.shadowBlur = 0;

    UI.topHighlight(g, 0, 0, bw, bh, r, 0.34);

    g.strokeStyle = 'rgba(255,255,255,0.42)';
    g.lineWidth   = 1.5;
    UI.roundRect(g, 0, 0, bw, bh, r);
    g.stroke();

    // Glyph and label, measured as one run and centred together.
    g.textBaseline = 'middle';
    g.font         = 'bold 24px monospace';
    const labelW = UI.trackedWidth(g, 'PLAY', 4);
    const glyphH = 10, glyphW = glyphH * 1.05, gap = 15;
    const runW   = glyphW + gap + labelW;
    const startX = bw / 2 - runW / 2;
    const midY   = bh / 2;

    g.fillStyle   = '#ffffff';
    g.shadowBlur  = 12;
    g.shadowColor = '#ffffff';
    UI.playGlyph(g, startX + glyphW / 2, midY, glyphH);
    UI.fillTracked(g, 'PLAY', startX + glyphW + gap + labelW / 2, midY + 1, 4);
  }

  function drawPlayButton(ctx) {
    const { x: bx, y: by, w: bw, h: bh } = playBtnBounds;
    const pulse = 0.82 + 0.18 * Math.sin(animFrame * 2.4);
    bakePlayButton();

    // The breathing glow, additively behind the baked face.
    ctx.globalCompositeOperation = 'lighter';
    Glow.draw(ctx, '#00e5ff', bx + bw / 2, by + bh / 2, bw * 0.5, 0.17 * pulse);
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = 1;
    ctx.drawImage(playLayer, bx - PLAY_PAD, by - PLAY_PAD);
  }

  function drawHint(ctx) {
    const cx = C.CANVAS_W / 2;
    ctx.save();
    ctx.globalAlpha = 0.20 + 0.12 * Math.sin(animFrame * 1.1);
    ctx.font        = '10px monospace';
    ctx.fillStyle   = '#ffffff';
    UI.fillTracked(ctx, '← →  OR DRAG TO ROTATE', cx, C.TITLE_HINT_Y, 1.5);
    ctx.restore();
  }

  function draw(ctx) {
    drawBackground(ctx);
    Atmos.drawRays(ctx);
    Atmos.drawBokeh(ctx, false);   // behind the tower
    drawHelixPreview(ctx);
    Atmos.drawBokeh(ctx, true);    // the few discs in front of it
    drawScrim(ctx);
    drawLogo(ctx);
    drawBestScore(ctx);
    drawDifficultySelector(ctx);
    drawPlayButton(ctx);
    drawHint(ctx);
    // Xsolla wordmark is title-screen only, per ../branding.md.
    Brand.drawLogo(ctx, C.BRAND_LOGO_X, C.BRAND_LOGO_Y, C.BRAND_LOGO_W);
    // Last, so the column sits above the rest of the screen.
    HUD.drawButtons(ctx, HUD.KINDS_TITLE);
  }

  function handleClick(cx, cy) {
    const btn = HUD.hitTest(cx, cy, HUD.KINDS_TITLE);
    if (btn) return btn;          // 'sound' | 'fullscreen', handled by Game

    for (const d of DIFFS) {
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

  return { init, update, draw, handleClick, getDifficulty, setBestScore, onQualityChange };
})();
