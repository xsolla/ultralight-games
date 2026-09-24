// ============================================================================
// ambiance.js — the starfield behind everything. Purely decorative; none of it
// affects game state or is collided against. Copied from game6's Stars, with
// the scroll slowed to a faint drift: game6 flew upward through space, and here
// the camera holds station over a planet.
//
// Three parallax layers. Far layers are dim single-pixel dots; the nearest is
// brighter, larger, and mostly four-armed crosses so it reads as "close"
// without any size cue.
// ============================================================================

// ---- Tunable layers (far to near) ------------------------------------------
// speed is logical px/s; cross is the fraction of the layer drawn as crosses
// rather than dots; twinkle is how much of the alpha is modulated.
const STAR_LAYERS = [
  { count: 80, speed: 0.6, size: 1.0, alpha: 0.30, cross: 0.00, twinkle: 0.25 },
  { count: 44, speed: 1.4, size: 1.6, alpha: 0.55, cross: 0.18, twinkle: 0.40 },
  { count: 20, speed: 3.0, size: 2.4, alpha: 0.95, cross: 0.60, twinkle: 0.55 },
];

const STAR_TWINKLE_RATE = 0.0022;  // radians per ms
const STAR_WARM_CHANCE  = 0.18;    // rest split between cool and neutral white

const Stars = {
  list: [],

  init() {
    this.list = [];
    STAR_LAYERS.forEach((layer, li) => {
      for (let i = 0; i < layer.count; i++) {
        this.list.push({
          li,
          x: Math.random() * CANVAS_W,
          y: Math.random() * CANVAS_H,
          cross: Math.random() < layer.cross,
          // Size jitter keeps a layer from looking like a printed pattern.
          size: layer.size * (0.75 + Math.random() * 0.5),
          phase: Math.random() * Math.PI * 2,
          tint: Math.random() < STAR_WARM_CHANCE ? COLORS.starWarm
              : Math.random() < 0.35 ? COLORS.starCool
              : COLORS.star,
        });
      }
    });
  },

  update(dt) {
    const sec = dt / 1000;
    for (const s of this.list) {
      s.y += STAR_LAYERS[s.li].speed * sec;
      if (s.y > CANVAS_H + 4) {
        // Recycle off the top at a fresh x so the field never visibly repeats.
        s.y -= CANVAS_H + 8;
        s.x = Math.random() * CANVAS_W;
      }
    }
  },

  draw(ctx, time) {
    for (const s of this.list) {
      // The planet is opaque, so stars below the horizon would only be overdrawn.
      if (s.y > LAYOUT.HORIZON + 4) continue;
      const layer = STAR_LAYERS[s.li];
      const tw = 1 - layer.twinkle + layer.twinkle *
        (0.5 + 0.5 * Math.sin(time * STAR_TWINKLE_RATE + s.phase));
      ctx.fillStyle = `rgba(${s.tint}, ${(layer.alpha * tw).toFixed(3)})`;

      if (s.cross) {
        // Four short arms plus a hot centre. Axis-aligned fillRects rather than
        // strokes: no lineWidth rounding, so the arms stay 1px crisp at any
        // backing-store scale.
        const arm = s.size * 1.9;
        const t = Math.max(0.7, s.size * 0.45);   // arm thickness
        ctx.fillRect(s.x - arm, s.y - t / 2, arm * 2, t);
        ctx.fillRect(s.x - t / 2, s.y - arm, t, arm * 2);
        ctx.fillStyle = `rgba(${s.tint}, ${Math.min(1, layer.alpha * tw * 1.6).toFixed(3)})`;
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      } else {
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
  },
};
