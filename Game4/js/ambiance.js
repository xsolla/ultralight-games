// Decorative animated background behind the well(s) and the menu — soft
// drifting bokeh motes in the 6 token hues. Purely visual: never touches
// game state, never gates input, safe to call from any screen.

const Ambiance = {
  _motes: null,

  // Motes are laid out once (their position/size/orbit are fixed per mote)
  // and then just drift from that fixed layout over time — no simulation
  // state to carry between frames.
  getMotes() {
    if (this._motes) return this._motes;
    const count = 20;
    const motes = [];
    for (let i = 0; i < count; i++) {
      motes.push({
        seed: Math.random(),
        baseX: Math.random() * CANVAS_W,
        baseY: Math.random() * CANVAS_H,
        r: 20 + Math.random() * 50,
        colorId: COLOR_IDS[i % COLOR_IDS.length],
        driftR: 12 + Math.random() * 24,
        speed: 0.04 + Math.random() * 0.07,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this._motes = motes;
    return motes;
  },

  withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  draw(ctx, timeMs) {
    const t = timeMs / 1000;
    ctx.save();
    this.getMotes().forEach((m) => {
      const angle = t * m.speed + m.phase;
      const x = m.baseX + Math.cos(angle) * m.driftR;
      const y = m.baseY + Math.sin(angle * 0.8) * m.driftR;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.35 + m.seed * 20);
      const base = COLORS[m.colorId];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, m.r);
      grad.addColorStop(0, this.withAlpha(base, 0.05 + 0.05 * pulse));
      grad.addColorStop(1, this.withAlpha(base, 0));
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });
    ctx.restore();
  },
};
