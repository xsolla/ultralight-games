// ============================================================================
// ambiance.js — the decorative backdrop layers: the drifting starfield that
// sits behind everything, plus the god rays and bokeh the title screen is lit
// by. Purely decorative; none of it affects game state or is collided against.
//
// Three namespaces, all the same shape — own tunables, own state, a draw() that
// reads it and mutates nothing else. CLAUDE.md §3 earmarks this file for
// atmosphere in general ("parallax starfield; later nebula"), and the two light
// layers are that; menu.js composes them but does not own them, the same way
// render.js draws the starfield without owning it.
//
// Stars: three parallax layers scrolling downward to sell upward flight. Far
// layers are dim single-pixel dots; the nearest is brighter, larger, and mostly
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

// ---- Cached glow sprites ---------------------------------------------------
// Both light layers below are built out of soft radial discs, and a
// CanvasGradient rebuilt per disc per frame is the one thing that would make
// them cost anything real. So each distinct (tint, profile) pair is rendered
// ONCE into an offscreen canvas and blitted from then on — the same trick
// Atlas.tinted() uses, and like that one it reads no pixels back, so file://
// still works.
//
// The sprites live on their own canvases, not on the game's, so they survive a
// resize untouched — unlike a gradient, which branding.md §5 warns not to cache
// across a canvas.width assignment.
const GLOW_PX = 128;   // sprite resolution; every disc is a scaled blit of one

// A plain falloff, for the halo at the ray source.
const GLOW_BLOOM = { id: 'bloom', stops: [[0, 0.85], [0.35, 0.30], [1, 0]] };
// Bokeh is a defocused POINT, not a blurred blob: a real lens throws most of the
// light onto the RIM of the circle of confusion and leaves the middle flat.
// Drop that rim and it stops reading as bokeh and starts reading as fog.
const GLOW_BOKEH = {
  id: 'bokeh',
  stops: [[0, 0.22], [0.55, 0.30], [0.86, 0.85], [0.95, 1], [1, 0]],
};

const glowCache = {};

function glowSprite(tint, profile) {
  const key = tint + '|' + profile.id;
  if (glowCache[key]) return glowCache[key];

  const c = document.createElement('canvas');
  c.width = GLOW_PX;
  c.height = GLOW_PX;
  const g = c.getContext('2d');
  const r = GLOW_PX / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [pos, a] of profile.stops) grad.addColorStop(pos, `rgba(${tint}, ${a})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_PX, GLOW_PX);

  glowCache[key] = c;
  return c;
}

// ---- God rays (title screen) -----------------------------------------------
// Shafts from a source just off the top edge — which is where the title
// screen's light comes from and the direction the hero ship is flying toward.
// Nothing here is integrated: a shaft is a pure function of time, so the layer
// needs no update() and cannot drift.
const RAY_SRC_X  = 0.50;   // source position, as a fraction of the canvas
const RAY_SRC_Y  = -0.06;  // just off the top edge, so the fan has already
                           // spread by the time it enters the frame
const RAY_COUNT  = 13;
const RAY_LEN    = 680;    // logical px — clears the bottom edge from up there
const RAY_SPREAD = 64;     // degrees either side of straight down
const RAY_W_MIN  = 4;      // half-width at the FAR end, logical px
const RAY_W_MAX  = 17;
const RAY_ALPHA  = 0.055;  // per shaft, before its own jitter
// Each shaft breathes on its own slow cycle. Without it the fan is a decal;
// with it the light reads as coming through something that is moving.
const RAY_BREATHE    = 0.55;           // fraction of width and alpha modulated
const RAY_BREATHE_HZ = [0.03, 0.075];
// The whole fan rocks a few degrees, an order of magnitude slower than any
// single shaft breathes — close rates would beat against each other and the
// sum would read as one visible pulse rather than as drifting light.
const RAY_SWAY    = 2.6;   // degrees
const RAY_SWAY_HZ = 0.021;
const RAY_TINT    = '150, 205, 255';
const RAY_BLOOM_R = 210;   // radius of the halo at the source, logical px
const RAY_BLOOM_A = 0.30;

const Rays = {
  list: [],
  grad: null,

  init() {
    this.list = [];
    this.grad = null;
    for (let i = 0; i < RAY_COUNT; i++) {
      // Jittered around an even fan rather than evenly spaced. A regular fan
      // reads as a printed starburst; the uneven gaps are what make it look
      // like light picking its way through something.
      const even = ((i + 0.5) / RAY_COUNT) * 2 - 1;   // -1 .. 1
      const jitter = (Math.random() - 0.5) * (RAY_SPREAD / RAY_COUNT) * 1.6;
      this.list.push({
        ang: (even * RAY_SPREAD + jitter) * DEG,
        w: RAY_W_MIN + Math.random() * (RAY_W_MAX - RAY_W_MIN),
        a: RAY_ALPHA * (0.55 + Math.random() * 0.9),
        hz: RAY_BREATHE_HZ[0] + Math.random() * (RAY_BREATHE_HZ[1] - RAY_BREATHE_HZ[0]),
        phase: Math.random() * TAU,
      });
    }
  },

  draw(ctx, time) {
    const s = time / 1000;

    ctx.save();
    // Light ADDS. Under source-over these would paint as grey veils that stamp
    // out the stars behind them; 'lighter' lets the field shine through, which
    // is the whole difference between a shaft of light and a translucent wedge.
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(CANVAS_W * RAY_SRC_X, CANVAS_H * RAY_SRC_Y);

    ctx.globalAlpha = RAY_BLOOM_A;
    ctx.drawImage(glowSprite(RAY_TINT, GLOW_BLOOM),
                  -RAY_BLOOM_R, -RAY_BLOOM_R, RAY_BLOOM_R * 2, RAY_BLOOM_R * 2);

    // ONE gradient serves every shaft: each is filled inside its own rotated
    // frame with the ray running down local +y, so the same 0..RAY_LEN ramp is
    // correct for all of them and none of them rebuilds it. It is built on
    // first draw rather than in init() because init() has no context to ask.
    if (!this.grad) {
      this.grad = ctx.createLinearGradient(0, 0, 0, RAY_LEN);
      // Starts at zero alpha so the shafts emerge OUT of the bloom instead of
      // meeting it at a hard bright cap across their bases.
      this.grad.addColorStop(0.00, `rgba(${RAY_TINT}, 0)`);
      this.grad.addColorStop(0.10, `rgba(${RAY_TINT}, 1)`);
      this.grad.addColorStop(0.45, `rgba(${RAY_TINT}, 0.45)`);
      this.grad.addColorStop(1.00, `rgba(${RAY_TINT}, 0)`);
    }

    const sway = Math.sin(s * TAU * RAY_SWAY_HZ) * RAY_SWAY * DEG;
    for (const r of this.list) {
      const b = 1 - RAY_BREATHE +
                RAY_BREATHE * (0.5 + 0.5 * Math.sin(s * TAU * r.hz + r.phase));
      const w = r.w * b;
      ctx.save();
      ctx.rotate(r.ang + sway);
      ctx.globalAlpha = r.a * b;
      ctx.fillStyle = this.grad;
      // A wedge, not a parallel bar: it has to widen with distance or it reads
      // as a searchlight beam rather than as light spreading from a point.
      ctx.beginPath();
      ctx.moveTo(-w * 0.16, 0);
      ctx.lineTo(w * 0.16, 0);
      ctx.lineTo(w, RAY_LEN);
      ctx.lineTo(-w, RAY_LEN);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

// ---- Bokeh (title screen) --------------------------------------------------
// Out-of-focus points of light drifting down the frame, the near layer of the
// title screen's depth. Same downward direction as the starfield, so the menu
// and the run read as one continuous flight rather than two different scenes.
const BOKEH_COUNT  = 20;
const BOKEH_R      = [7, 33];      // logical px radius
const BOKEH_ALPHA  = [0.05, 0.16];
// A bigger disc is a NEARER one, so it also falls faster — the same parallax
// rule the star layers use, and what stops the field reading as one flat plane.
const BOKEH_FALL   = [5, 20];      // logical px/s downward
const BOKEH_SWAY   = 10;           // px either side of the birth column
const BOKEH_SWAY_HZ    = [0.02, 0.06];
const BOKEH_BREATHE    = 0.35;     // fraction of alpha that modulates
const BOKEH_BREATHE_HZ = [0.04, 0.11];
// Cool-dominant with a warm minority, the same split the starfield's tints use.
// Weights sum to 1.
const BOKEH_TINTS   = ['128, 200, 255', '150, 140, 255', '255, 208, 150', '140, 250, 215'];
const BOKEH_TINT_W  = [0.46, 0.22, 0.18, 0.14];

function pickBokehTint() {
  let r = Math.random();
  for (let i = 0; i < BOKEH_TINT_W.length; i++) {
    r -= BOKEH_TINT_W[i];
    if (r <= 0) return BOKEH_TINTS[i];
  }
  return BOKEH_TINTS[0];
}

const Bokeh = {
  list: [],

  init() {
    this.list = [];
    // Seeded across the whole height, not at the top: the layer has to look
    // like it has always been falling on the frame the menu first appears.
    for (let i = 0; i < BOKEH_COUNT; i++) this.list.push(makeBokeh(Math.random() * CANVAS_H));
  },

  update(dt) {
    const sec = dt / 1000;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      b.y += b.fall * sec;
      // Replaced rather than repositioned when it leaves: a recycled disc that
      // keeps its size and tint makes the field visibly repeat on a cycle.
      if (b.y - b.r > CANVAS_H) {
        const n = makeBokeh(0);
        n.y = -n.r;
        this.list[i] = n;
      }
    }
  },

  draw(ctx, time) {
    const s = time / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.list) {
      const breathe = 1 - BOKEH_BREATHE +
        BOKEH_BREATHE * (0.5 + 0.5 * Math.sin(s * TAU * b.breatheHz + b.breathePhase));
      // Sway is recomputed from time rather than integrated, the same way the
      // pickup bubbles' is: no drift can accumulate over a long menu idle.
      const x = b.x0 + BOKEH_SWAY * Math.sin(s * TAU * b.swayHz + b.swayPhase);
      ctx.globalAlpha = b.a * breathe;
      ctx.drawImage(glowSprite(b.tint, GLOW_BOKEH),
                    x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    ctx.restore();
  },
};

// ONE roll drives radius, fall speed and alpha together, because all three are
// the same fact: a big disc is a near disc, so it must also be the faster one
// and the dimmer one (defocused light spreads over more area for the same
// energy). Rolling them independently produces small bright slow discs, which
// read as stars rather than as bokeh and fight the layer behind them.
function makeBokeh(y) {
  const k = Math.random();
  return {
    x0: Math.random() * CANVAS_W,
    y,
    r: BOKEH_R[0] + k * (BOKEH_R[1] - BOKEH_R[0]),
    fall: BOKEH_FALL[0] + k * (BOKEH_FALL[1] - BOKEH_FALL[0]),
    a: BOKEH_ALPHA[1] - k * (BOKEH_ALPHA[1] - BOKEH_ALPHA[0]),
    tint: pickBokehTint(),
    swayHz: BOKEH_SWAY_HZ[0] + Math.random() * (BOKEH_SWAY_HZ[1] - BOKEH_SWAY_HZ[0]),
    swayPhase: Math.random() * TAU,
    breatheHz: BOKEH_BREATHE_HZ[0] + Math.random() * (BOKEH_BREATHE_HZ[1] - BOKEH_BREATHE_HZ[0]),
    breathePhase: Math.random() * TAU,
  };
}
