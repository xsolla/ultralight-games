// Decorative animated background behind the well(s) and the menu — soft
// drifting bokeh motes in the 6 token hues, plus (title screen only) large
// blurred tokens from every tileset floating behind the interface. Purely
// visual: never touches game state, never gates input, safe to call from
// any screen.

// Title-screen floating tokens. Sizes are deliberately well above an in-game
// cell (~38px) so they read as out-of-focus foreground/background props.
const MENU_TILE_COUNT = 14;
const MENU_TILE_MIN_SIZE = 72;
const MENU_TILE_MAX_SIZE = 128;
const MENU_TILE_MIN_ALPHA = 0.3;
const MENU_TILE_MAX_ALPHA = 0.5;
const MENU_TILE_RISE_SPEED = 6;       // logical px/sec, scaled per tile by depth
const MENU_TILE_RENDER_SCALE = 0.5;   // offscreen render resolution (softens on upscale)
const MENU_TILE_BLUR_PX = 1.6;        // extra blur where ctx.filter is supported
const MENU_TILESETS = ['crystals', 'blobs', 'dice', 'elements'];

const Ambiance = {
  _motes: null,
  _tiles: null,
  _scratch: null,

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

  // Same idea as motes: fixed per-tile parameters, position is a pure
  // function of time (slow upward rise that wraps, plus a gentle sway/spin).
  // Columns are stratified so tiles spread across the whole width.
  getTiles() {
    if (this._tiles) return this._tiles;
    const tiles = [];
    for (let i = 0; i < MENU_TILE_COUNT; i++) {
      const depth = Math.random(); // 0 = far/small, 1 = near/large
      tiles.push({
        tileset: MENU_TILESETS[i % MENU_TILESETS.length],
        color: COLOR_IDS[(i * 5 + Math.floor(i / 4)) % COLOR_IDS.length],
        seed: Math.random(),
        size: MENU_TILE_MIN_SIZE + depth * (MENU_TILE_MAX_SIZE - MENU_TILE_MIN_SIZE),
        alpha: MENU_TILE_MIN_ALPHA + Math.random() * (MENU_TILE_MAX_ALPHA - MENU_TILE_MIN_ALPHA),
        baseX: ((i + 0.2 + Math.random() * 0.6) / MENU_TILE_COUNT) * CANVAS_W,
        baseY: Math.random(),
        rise: MENU_TILE_RISE_SPEED * (0.6 + depth * 0.8),
        swayR: 10 + Math.random() * 18,
        swaySpeed: 0.15 + Math.random() * 0.2,
        spin: (Math.random() - 0.5) * 0.12,
        tilt: (Math.random() - 0.5) * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
    // draw far (small) tiles first so nearer ones overlap them
    tiles.sort((a, b) => a.size - b.size);
    this._tiles = tiles;
    return tiles;
  },

  // Two small reusable canvases: tokens are rendered at reduced resolution
  // into `src`, then copied through a blur filter into `dst`. Upscaling the
  // low-res result onto the main canvas adds further softness, so this still
  // reads as out-of-focus on browsers without ctx.filter.
  getScratch() {
    if (this._scratch) return this._scratch;
    const dim = Math.ceil(MENU_TILE_MAX_SIZE * 1.4 * MENU_TILE_RENDER_SCALE);
    const make = () => {
      const c = document.createElement('canvas');
      c.width = dim;
      c.height = dim;
      return c;
    };
    const src = make(), dst = make();
    const dctx = dst.getContext('2d');
    this._scratch = {
      dim, src, dst,
      sctx: src.getContext('2d'),
      dctx,
      hasFilter: typeof dctx.filter === 'string',
    };
    return this._scratch;
  },

  withAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  // intensity scales mote opacity — 1 on gameplay screens, higher on the
  // title screen where the backdrop should be clearly visible.
  draw(ctx, timeMs, intensity) {
    const k = intensity || 1;
    const t = timeMs / 1000;
    ctx.save();
    this.getMotes().forEach((m) => {
      const angle = t * m.speed + m.phase;
      const x = m.baseX + Math.cos(angle) * m.driftR;
      const y = m.baseY + Math.sin(angle * 0.8) * m.driftR;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.35 + m.seed * 20);
      const base = COLORS[m.colorId];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, m.r * (k > 1 ? 1.4 : 1));
      grad.addColorStop(0, this.withAlpha(base, Math.min(1, (0.05 + 0.05 * pulse) * k)));
      grad.addColorStop(1, this.withAlpha(base, 0));
      ctx.beginPath();
      ctx.arc(x, y, m.r * (k > 1 ? 1.4 : 1), 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });
    ctx.restore();
  },

  drawFloatingTiles(ctx, timeMs) {
    const t = timeMs / 1000;
    const s = this.getScratch();
    const span = CANVAS_H + MENU_TILE_MAX_SIZE * 2;

    this.getTiles().forEach((tile) => {
      const travel = (tile.baseY * span + t * tile.rise) % span;
      const y = CANVAS_H + MENU_TILE_MAX_SIZE - travel;
      const x = tile.baseX + Math.sin(t * tile.swaySpeed + tile.phase) * tile.swayR;
      const rot = tile.tilt + Math.sin(t * tile.spin + tile.phase) * 0.35;

      // render the live, animated token small and centered in the scratch
      const rs = tile.size * MENU_TILE_RENDER_SCALE;
      const off = (s.dim - rs) / 2;
      s.sctx.setTransform(1, 0, 0, 1, 0, 0);
      s.sctx.clearRect(0, 0, s.dim, s.dim);
      Tilesets[tile.tileset].drawToken(s.sctx, off, off, rs, { color: tile.color, seed: tile.seed }, timeMs);

      s.dctx.clearRect(0, 0, s.dim, s.dim);
      if (s.hasFilter) s.dctx.filter = `blur(${MENU_TILE_BLUR_PX}px)`;
      s.dctx.drawImage(s.src, 0, 0);
      if (s.hasFilter) s.dctx.filter = 'none';

      const drawn = s.dim / MENU_TILE_RENDER_SCALE;
      ctx.save();
      ctx.globalAlpha = tile.alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(s.dst, -drawn / 2, -drawn / 2, drawn, drawn);
      ctx.restore();
    });
  },
};
