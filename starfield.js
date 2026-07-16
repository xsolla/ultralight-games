// Animated starry-night background for the portal page.
// Fixed full-viewport canvas, drawn behind all page content (see #starfield CSS).

(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // rgb triples. Most stars land on the blue palette; red/yellow/cyan are rare accents.
  const BLUE_PALETTE = [
    '210,225,255',
    '180,205,255',
    '150,185,255',
    '120,165,250',
    '195,215,255',
    '165,195,255',
  ];
  const RARE_PALETTE = [
    { weight: 0.05, color: '255,110,105' },  // red
    { weight: 0.05, color: '255,214,110' },  // yellow
    { weight: 0.05, color: '110,240,235' },  // cyan
  ];

  function pickColor() {
    const r = Math.random();
    let acc = 0;
    for (const rare of RARE_PALETTE) {
      acc += rare.weight;
      if (r < acc) return { color: rare.color, rare: true };
    }
    return { color: BLUE_PALETTE[(Math.random() * BLUE_PALETTE.length) | 0], rare: false };
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  let width = 0, height = 0, dpr = 1;
  let stars = [];

  class Star {
    constructor() { this.respawn(true); }

    respawn(initial) {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      const picked = pickColor();
      this.color = picked.color;
      this.radius = picked.rare ? rand(1.1, 2.2) : rand(0.6, 1.8);
      this.maxOpacity = rand(0.45, 1);
      this.fadeInDur = rand(1500, 4000);
      this.holdDur = rand(2000, 6000);
      this.fadeOutDur = rand(1500, 3500);
      this.hiddenDur = rand(800, 7000);
      this.twinklePhase = Math.random() * Math.PI * 2;
      this.twinkleSpeed = rand(0.4, 1.3);
      this.state = 'in';
      this.timer = initial ? Math.random() * (this.fadeInDur + this.holdDur) : 0;
      this.opacity = 0;
      this.startOpacity = 0;
      if (initial) {
        // Fast-forward through the lifecycle so the sky isn't empty on first paint.
        this._advance(this.timer);
        this.timer = 0;
      }
    }

    _advance(ms) {
      // Cheap approximation: if the fast-forward lands past fade-in, just call it "hold".
      if (ms > this.fadeInDur) {
        this.state = 'hold';
        this.opacity = this.maxOpacity;
      } else if (ms > 0) {
        this.state = 'in';
        this.opacity = this.maxOpacity * (ms / this.fadeInDur);
      }
    }

    update(dt, t) {
      this.timer += dt;
      if (this.state === 'in') {
        this.opacity = Math.min(this.maxOpacity, (this.timer / this.fadeInDur) * this.maxOpacity);
        if (this.timer >= this.fadeInDur) { this.state = 'hold'; this.timer = 0; }
      } else if (this.state === 'hold') {
        const twinkle = 0.18 * Math.sin(t * this.twinkleSpeed + this.twinklePhase);
        this.opacity = Math.max(0, Math.min(1, this.maxOpacity + twinkle));
        if (this.timer >= this.holdDur) { this.state = 'out'; this.timer = 0; this.startOpacity = this.opacity; }
      } else if (this.state === 'out') {
        const p = Math.min(1, this.timer / this.fadeOutDur);
        this.opacity = this.startOpacity * (1 - p);
        if (this.timer >= this.fadeOutDur) { this.state = 'hidden'; this.timer = 0; this.opacity = 0; }
      } else if (this.state === 'hidden') {
        if (this.timer >= this.hiddenDur) this.respawn(false);
      }
    }

    draw(ctx) {
      if (this.opacity <= 0.01) return;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${this.color},${this.opacity})`;
      ctx.shadowColor = `rgba(${this.color},${Math.min(1, this.opacity)})`;
      ctx.shadowBlur = this.radius * 3.2;
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function starCount() {
    return Math.max(60, Math.min(220, Math.round((width * height) / 9000)));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = starCount();
    stars.forEach((s) => {
      if (s.x > width) s.x = Math.random() * width;
      if (s.y > height) s.y = Math.random() * height;
    });
    while (stars.length < target) stars.push(new Star());
    if (stars.length > target) stars.length = target;
  }

  // --- Constellations: at most one active at a time, connecting nearby stars. ---
  let constellation = null;
  let constellationCooldown = rand(4000, 9000);
  let constellationTimer = 0;

  function tryStartConstellation() {
    const visible = stars.filter((s) => s.opacity > 0.3 && (s.state === 'hold' || s.state === 'in'));
    if (visible.length < 4) return;

    const anchor = visible[(Math.random() * visible.length) | 0];
    const maxDist = Math.max(120, Math.min(width, height) * 0.22);
    const near = visible
      .filter((s) => s !== anchor)
      .map((s) => ({ s, d: Math.hypot(s.x - anchor.x, s.y - anchor.y) }))
      .filter((o) => o.d < maxDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3 + ((Math.random() * 3) | 0))
      .map((o) => o.s);

    if (near.length < 2) return;

    // Greedy nearest-neighbour chain starting at the anchor, for a natural zig-zag path.
    const ordered = [anchor];
    const remaining = near.slice();
    let current = anchor;
    while (remaining.length) {
      remaining.sort((a, b) => Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y));
      current = remaining.shift();
      ordered.push(current);
    }

    constellation = {
      points: ordered,
      timer: 0,
      fadeInDur: 700,
      pulseDur: rand(1800, 2800),
      fadeOutDur: 900,
    };
  }

  function updateConstellation(dt) {
    if (!constellation) {
      constellationTimer += dt;
      if (constellationTimer >= constellationCooldown) {
        constellationTimer = 0;
        constellationCooldown = rand(5000, 11000);
        tryStartConstellation();
      }
      return;
    }
    constellation.timer += dt;
    const total = constellation.fadeInDur + constellation.pulseDur + constellation.fadeOutDur;
    if (constellation.timer >= total) constellation = null;
  }

  function drawConstellation(ctx) {
    if (!constellation) return;
    const { points, timer, fadeInDur, pulseDur, fadeOutDur } = constellation;
    let opacity;
    if (timer < fadeInDur) {
      opacity = timer / fadeInDur;
    } else if (timer < fadeInDur + pulseDur) {
      const p = (timer - fadeInDur) / pulseDur;
      opacity = 0.55 + 0.35 * Math.sin(p * Math.PI * 3);
    } else {
      const p = (timer - fadeInDur - pulseDur) / fadeOutDur;
      opacity = 1 - p;
    }
    opacity = Math.max(0, Math.min(1, opacity));
    if (opacity <= 0.01) return;

    ctx.save();
    ctx.strokeStyle = `rgba(160,200,255,${opacity * 0.75})`;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = `rgba(160,200,255,${opacity})`;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();

    ctx.shadowBlur = 8;
    points.forEach((p) => {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${opacity})`;
      ctx.arc(p.x, p.y, p.radius + 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  let lastTime = null;
  function frame(now) {
    if (lastTime == null) lastTime = now;
    const dt = Math.min(100, now - lastTime);
    lastTime = now;
    const t = now / 1000;

    ctx.clearRect(0, 0, width, height);
    for (const s of stars) { s.update(dt, t); s.draw(ctx); }
    updateConstellation(dt);
    drawConstellation(ctx);

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();

  if (REDUCE_MOTION) {
    // Draw a single static frame instead of animating continuously.
    ctx.clearRect(0, 0, width, height);
    stars.forEach((s) => { s.opacity = s.maxOpacity; s.draw(ctx); });
  } else {
    requestAnimationFrame(frame);
  }
})();
