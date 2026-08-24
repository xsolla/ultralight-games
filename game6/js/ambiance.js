// ============================================================================
// ambiance.js — the drifting starfield behind everything. Purely decorative;
// never affects game state and is never collided against.
//
// Three parallax layers scroll downward to sell upward flight. Far layers are
// dim single-pixel dots; the nearest layer is brighter, larger, and mostly
// four-armed crosses so it reads as "close" without any size cue.
// ============================================================================

// ---- Tunable layers (far to near) ------------------------------------------
// speed is logical px/s; cross is the fraction of the layer drawn as crosses
// rather than dots; twinkle is how much of the alpha is modulated.
const STAR_LAYERS = [
  { count: 80, speed: 16, size: 1.0, alpha: 0.30, cross: 0.00, twinkle: 0.25 },
  { count: 44, speed: 40, size: 1.6, alpha: 0.55, cross: 0.18, twinkle: 0.40 },
  { count: 20, speed: 88, size: 2.4, alpha: 0.95, cross: 0.60, twinkle: 0.55 },
];

const STAR_TWINKLE_RATE = 0.0022;  // radians per ms
const STAR_STREAK_MS    = 26;      // motion-blur length as a slice of travel time
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

  // `mult` scales scroll speed — 1 normally, PLAYER_TURBO_MULT during a burst,
  // which is most of what makes turbo feel fast.
  update(dt, mult) {
    const sec = dt / 1000;
    for (const s of this.list) {
      s.y += STAR_LAYERS[s.li].speed * mult * sec;
      if (s.y > CANVAS_H + 4) {
        // Recycle off the top at a fresh x so the field never visibly repeats.
        s.y -= CANVAS_H + 8;
        s.x = Math.random() * CANVAS_W;
      }
    }
  },

  draw(ctx, time, mult) {
    const streaking = mult > 1.05;
    for (const s of this.list) {
      const layer = STAR_LAYERS[s.li];
      const tw = 1 - layer.twinkle + layer.twinkle *
        (0.5 + 0.5 * Math.sin(time * STAR_TWINKLE_RATE + s.phase));
      ctx.fillStyle = `rgba(${s.tint}, ${(layer.alpha * tw).toFixed(3)})`;

      if (streaking) {
        // Vertical smear over the distance travelled in STAR_STREAK_MS. Drawn
        // instead of the dot/cross, not on top of it — overlapping alpha at
        // these opacities reads as a bright dash rather than motion.
        const len = layer.speed * mult * (STAR_STREAK_MS / 1000);
        ctx.fillRect(s.x - s.size / 2, s.y - len, s.size, len + s.size);
        continue;
      }

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
