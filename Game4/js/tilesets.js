// Swappable tile "skins". All 4 are implemented: Crystals, Blobs, Dice,
// Elements. Per token draw params + idle-animation params, keyed by the
// same 6 color identities used everywhere else. render.js only ever asks
// "how do I draw color X" — rules.js/board.js never see tileset-specific
// data (Dice's pip-count-as-match-identity is purely a rendering choice).

function hexLighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lr = Math.round(r + (255 - r) * amt);
  const lg = Math.round(g + (255 - g) * amt);
  const lb = Math.round(b + (255 - b) * amt);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

function hexDarken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const dr = Math.round(r * (1 - amt));
  const dg = Math.round(g * (1 - amt));
  const db = Math.round(b * (1 - amt));
  return `rgb(${dr}, ${dg}, ${db})`;
}

// Builds onto whatever path-like target it's given — a canvas context
// (caller must ctx.beginPath() first) or a fresh Path2D (which is already
// "begun"). The latter is how each tileset exposes a silhouette() the
// pre-explosion flash can fill, so the flash matches the actual token
// shape instead of a generic square (see Renderer.drawFlashes).
function roundedRectPath(target, x, y, w, h, r) {
  target.moveTo(x + r, y);
  target.arcTo(x + w, y, x + w, y + h, r);
  target.arcTo(x + w, y + h, x, y + h, r);
  target.arcTo(x, y + h, x, y, r);
  target.arcTo(x, y, x + w, y, r);
  target.closePath();
}

// A square with its corners cut off (an octagon) — reads as "cut" rather
// than "rounded," used by Crystals for a more faceted-gem silhouette.
function chamferedRectPath(target, x, y, w, h, c) {
  target.moveTo(x + c, y);
  target.lineTo(x + w - c, y);
  target.lineTo(x + w, y + c);
  target.lineTo(x + w, y + h - c);
  target.lineTo(x + w - c, y + h);
  target.lineTo(x + c, y + h);
  target.lineTo(x, y + h - c);
  target.lineTo(x, y + c);
  target.closePath();
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

// Deepens/saturates a flat UI hue into a richer tone — gives a tileset its
// own material identity instead of reusing the flat COLORS hex as-is.
// satBoost is relative (0.3 == 30% more saturation than the original hue,
// not +0.3 flat). Crystals and Blobs each call this with their own tuning
// (deep jewel tone vs. a brighter, candy-ish tone), so the cache key must
// include the params — keying by hex alone would let whichever tileset
// renders first silently poison the result for the other.
const JEWEL_TONE_CACHE = {};
function jewelTone(hex, satBoost, lightDelta) {
  const sb = satBoost != null ? satBoost : 0.3;
  const ld = lightDelta != null ? lightDelta : -0.05;
  const key = hex + '|' + sb + '|' + ld;
  if (JEWEL_TONE_CACHE[key]) return JEWEL_TONE_CACHE[key];
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const ns = Math.min(1, s * (1 + sb));
  const nl = Math.max(0.15, Math.min(0.85, l + ld));
  const rgb = hslToRgb(h, ns, nl);
  const result = rgbToHex(rgb.r, rgb.g, rgb.b);
  JEWEL_TONE_CACHE[key] = result;
  return result;
}

const Tilesets = {
  blobs: {
    id: 'blobs',

    // Just the organic wobbly outline (bulge amounts derived only from
    // `seed`, not per-frame randomness, so the shape is stable — not the
    // breathing scale, which is a live ctx transform in drawToken, not
    // baked into points here). Shared by drawToken and silhouette(), the
    // latter used by the pre-explosion flash so it matches this tileset's
    // actual shape instead of a generic square.
    bodyPath(x, y, size, token) {
      const seed = token.seed;
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.47; // near-full-bleed, same as the cell itself

      const wobblePts = 12;
      const pts = [];
      for (let i = 0; i < wobblePts; i++) {
        const angle = (i / wobblePts) * Math.PI * 2;
        const n = Math.sin(angle * 3 + seed * 37.1) * 0.5 + Math.sin(angle * 5 + seed * 13.7 + 2) * 0.3;
        const rr = 1 + n * 0.05;
        pts.push([cx + Math.cos(angle) * r * rr, cy + Math.sin(angle) * r * 0.92 * rr]);
      }
      const path = new Path2D();
      const startMid = [(pts[wobblePts - 1][0] + pts[0][0]) / 2, (pts[wobblePts - 1][1] + pts[0][1]) / 2];
      path.moveTo(startMid[0], startMid[1]);
      for (let i = 0; i < wobblePts; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % wobblePts];
        const mid = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
        path.quadraticCurveTo(cur[0], cur[1], mid[0], mid[1]);
      }
      path.closePath();
      return path;
    },

    silhouette(x, y, size, token) {
      return this.bodyPath(x, y, size, token);
    },

    // token: { color, seed } — seed (0..1) staggers each token's blink
    // cycle, idle breathing wobble, and silhouette bulge, plus its
    // occasional yawn/surprised expression, so blobs on screen never move
    // or emote in unison.
    drawToken(ctx, x, y, size, token, timeMs) {
      const seed = token.seed;
      const base = jewelTone(COLORS[token.color], 0.15, 0.05); // Blobs' own brighter, candy-ish tone
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.47; // near-full-bleed, same as the cell itself

      ctx.save();

      // ground-cast drop shadow — drawn before the breathing transform
      // below, since a cast shadow doesn't squash/stretch with the body
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.78, r * 0.7, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fill();

      // idle "breathing" squash/stretch, staggered per-token so a well full
      // of blobs doesn't pulse in lockstep
      const breathePeriod = 3400 + seed * 1800;
      const breathePhase = (timeMs + seed * 5000) % breathePeriod;
      const breathe = Math.sin((breathePhase / breathePeriod) * Math.PI * 2) * 0.025;
      ctx.translate(cx, cy);
      ctx.scale(1 + breathe, 1 - breathe * 0.6);
      ctx.translate(-cx, -cy);

      const bodyPath = this.bodyPath(x, y, size, token);

      // body fill
      const grad = ctx.createRadialGradient(
        cx - r * 0.35, cy - r * 0.4, r * 0.15,
        cx, cy, r * 1.05
      );
      grad.addColorStop(0, hexLighten(base, 0.45));
      grad.addColorStop(0.6, base);
      grad.addColorStop(1, hexDarken(base, 0.15));
      ctx.fillStyle = grad;
      ctx.fill(bodyPath);

      // subtle rim, crisping up the silhouette (there previously was none)
      ctx.lineWidth = Math.max(1, size * 0.015);
      ctx.strokeStyle = hexDarken(base, 0.22);
      ctx.stroke(bodyPath);

      // grounding/contact shadow on the body's own underside, clipped to
      // the wobbly silhouette — distinct from the cast shadow beneath it
      ctx.save();
      ctx.clip(bodyPath);
      const groundGrad = ctx.createLinearGradient(cx, cy + r * 0.35, cx, cy + r * 0.95);
      groundGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      groundGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(cx - r, cy, r * 2, r);
      ctx.restore();

      // glossy specular highlight, distinct from the body's own gradient
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.3, r * 0.19, -0.5, 0, Math.PI * 2);
      const sheen = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.32, cy - r * 0.38, r * 0.32);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheen;
      ctx.fill();

      // occasional expression — yawn (closed eyes + big "O") or surprised
      // (wide eyes + small "o"); otherwise normal (independent blinking +
      // smile). Timing is per-token/seed-driven, not per-frame random, so
      // it's stable and staggered across a well full of blobs.
      const exprPeriod = 9000 + seed * 6000;
      const exprPhase = (timeMs + seed * 8000) % exprPeriod;
      const yawnDur = 1950; // 3x the original 650ms
      const surpriseStart = exprPeriod * 0.5;
      const surpriseDur = 450;
      let expression = 'normal';
      let exprIntensity = 0;
      if (exprPhase < yawnDur) {
        expression = 'yawn';
        exprIntensity = Math.sin((exprPhase / yawnDur) * Math.PI);
      } else if (exprPhase >= surpriseStart && exprPhase < surpriseStart + surpriseDur) {
        expression = 'surprised';
        exprIntensity = Math.sin(((exprPhase - surpriseStart) / surpriseDur) * Math.PI);
      }

      const eyeDx = size * 0.15;
      const eyeDy = -size * 0.04;
      const eyeR = size * 0.09;
      const drawClosedEye = (ex, ey) => {
        ctx.beginPath();
        ctx.moveTo(ex - eyeR, ey);
        ctx.quadraticCurveTo(ex, ey - eyeR * 0.5, ex + eyeR, ey);
        ctx.lineWidth = Math.max(1.5, size * 0.035);
        ctx.strokeStyle = '#20242c';
        ctx.lineCap = 'round';
        ctx.stroke();
      };

      [-1, 1].forEach((dir) => {
        const ex = cx + dir * eyeDx;
        const ey = cy + eyeDy;

        if (expression === 'yawn') {
          drawClosedEye(ex, ey);
          return;
        }

        if (expression === 'surprised') {
          const wideR = eyeR * (1 + 0.45 * exprIntensity);
          ctx.beginPath();
          ctx.arc(ex, ey, wideR, 0, Math.PI * 2);
          ctx.fillStyle = '#20242c';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + wideR * 0.3, ey - wideR * 0.3, wideR * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          return;
        }

        // normal — each eye on its own blink cycle (slightly different
        // effective seed per eye), so the two don't always close in
        // perfect unison
        const eyeSeed = seed + (dir < 0 ? 0 : 0.07);
        const period = 2600 + eyeSeed * 2200;
        const phase = (timeMs + eyeSeed * 9973) % period;
        if (phase < 110) {
          drawClosedEye(ex, ey);
        } else {
          ctx.beginPath();
          ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
          ctx.fillStyle = '#20242c';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + eyeR * 0.3, ey - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      });

      if (expression === 'yawn') {
        // a large open "O"
        const openR = size * 0.11 * exprIntensity;
        ctx.beginPath();
        ctx.ellipse(cx, cy + size * 0.11, openR * 0.75, openR, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2f35';
        ctx.fill();
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.strokeStyle = '#20242c';
        ctx.stroke();
      } else if (expression === 'surprised') {
        // a small open "o"
        const openR = size * 0.045 * exprIntensity;
        ctx.beginPath();
        ctx.arc(cx, cy + size * 0.09, openR, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2f35';
        ctx.fill();
        ctx.lineWidth = Math.max(1, size * 0.015);
        ctx.strokeStyle = '#20242c';
        ctx.stroke();
      } else {
        // the normal small smile
        const mouthY = cy + size * 0.09;
        const mouthW = size * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - mouthW / 2, mouthY);
        ctx.quadraticCurveTo(cx, mouthY + size * 0.06, cx + mouthW / 2, mouthY);
        ctx.strokeStyle = '#20242c';
        ctx.lineWidth = Math.max(1.2, size * 0.025);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();
    },
  },

  // Faceted square gems: a chamfered (cut-corner) outline, a bright "table"
  // facet plus 4 shaded side facets (a real faceted cut, not just a bevel
  // gradient), in deepened jewel-tone variants of the 6 hues. Mostly static
  // — that's still intentional, it's meant to be the plain one next to
  // Blobs/Elements — but carries a slow, barely-perceptible gloss shimmer
  // and an occasional star-glint twinkle rather than being fully inert.
  crystals: {
    id: 'crystals',

    // The chamfered outline only — used by the pre-explosion flash so it
    // matches this tileset's actual (cut-corner) shape, not a plain square.
    silhouette(x, y, size, token, timeMs) {
      const pad = 2;
      const s = size - pad * 2;
      const gx = x + pad, gy = y + pad;
      const chamfer = s * 0.14;
      const path = new Path2D();
      chamferedRectPath(path, gx, gy, s, s, chamfer);
      return path;
    },

    drawToken(ctx, x, y, size, token, timeMs) {
      const jewel = jewelTone(COLORS[token.color]);
      const seed = token.seed;
      const pad = 2; // fixed 2px from each side of the box, not proportional
      const s = size - pad * 2;
      const gx = x + pad, gy = y + pad;
      const chamfer = s * 0.14;

      const TL = [gx, gy], TR = [gx + s, gy], BR = [gx + s, gy + s], BL = [gx, gy + s];
      const cx = gx + s / 2, cy = gy + s / 2;
      const th = s * 0.19; // table (center facet) half-size
      const tTL = [cx - th, cy - th], tTR = [cx + th, cy - th];
      const tBR = [cx + th, cy + th], tBL = [cx - th, cy + th];

      ctx.save();

      // base fill + drop shadow — establishes the silhouette; the facets
      // below fully cover it, this just guards against antialiasing seams
      ctx.beginPath();
      chamferedRectPath(ctx, gx, gy, s, s, chamfer);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = size * 0.1;
      ctx.shadowOffsetY = size * 0.04;
      ctx.fillStyle = jewel;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // facets + table + gloss, clipped to the chamfered outline
      ctx.save();
      ctx.beginPath();
      chamferedRectPath(ctx, gx, gy, s, s, chamfer);
      ctx.clip();

      const fillPoly = (pts, fillStyle) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = Math.max(1, size * 0.012);
        ctx.stroke();
      };

      // 4 trapezoids (one per outer edge) tiling out from the table with no
      // gaps/overlap — light source assumed top-left, so top/left are lit,
      // right/bottom fall into shadow
      fillPoly([TL, TR, tTR, tTL], hexLighten(jewel, 0.2));
      fillPoly([TR, BR, tBR, tTR], hexDarken(jewel, 0.22));
      fillPoly([BR, BL, tBL, tBR], hexDarken(jewel, 0.42));
      fillPoly([BL, TL, tTL, tBL], hexLighten(jewel, 0.05));

      // table — brightest facet, catches the most direct light
      ctx.beginPath();
      ctx.moveTo(tTL[0], tTL[1]);
      ctx.lineTo(tTR[0], tTR[1]);
      ctx.lineTo(tBR[0], tBR[1]);
      ctx.lineTo(tBL[0], tBL[1]);
      ctx.closePath();
      ctx.fillStyle = hexLighten(jewel, 0.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = Math.max(1, size * 0.012);
      ctx.stroke();

      // glossy streak — a slow, subtle shimmer on its opacity rather than
      // a fixed static highlight
      const shimmerPeriod = 5200 + seed * 2600;
      const shimmerPhase = (timeMs + seed * 6100) % shimmerPeriod;
      const shimmer = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin((shimmerPhase / shimmerPeriod) * Math.PI * 2));
      ctx.beginPath();
      ctx.moveTo(gx + s * 0.14, gy + s * 0.1);
      ctx.lineTo(gx + s * 0.56, gy + s * 0.1);
      ctx.lineTo(gx + s * 0.3, gy + s * 0.46);
      ctx.lineTo(gx + s * 0.1, gy + s * 0.46);
      ctx.closePath();
      const gloss = ctx.createLinearGradient(gx, gy, gx, gy + s * 0.46);
      gloss.addColorStop(0, `rgba(255, 255, 255, ${(0.55 * shimmer).toFixed(3)})`);
      gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gloss;
      ctx.fill();
      ctx.restore();

      // thin inset rim — shadow top-left, light-catch bottom-right, echoing
      // the well tray's own carved-cell language at the gem's own edge
      ctx.save();
      ctx.beginPath();
      chamferedRectPath(ctx, gx, gy, s, s, chamfer);
      ctx.clip();
      const inset = Math.max(1, size * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx + inset, gy + s - inset * 2.4);
      ctx.lineTo(gx + inset, gy + inset);
      ctx.lineTo(gx + s - inset * 2.4, gy + inset);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx + inset * 2.4, gy + s - inset);
      ctx.lineTo(gx + s - inset, gy + s - inset);
      ctx.lineTo(gx + s - inset, gy + inset * 2.4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();
      ctx.restore();

      // crisp outer edge
      ctx.beginPath();
      chamferedRectPath(ctx, gx, gy, s, s, chamfer);
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.strokeStyle = hexDarken(jewel, 0.45);
      ctx.stroke();

      // animated star-glint twinkle, nudged per-token so a run of gems
      // doesn't all flash in the same spot at the same time
      const glintX = gx + s * (0.76 + (seed - 0.5) * 0.06);
      const glintY = gy + s * (0.7 + (seed - 0.5) * 0.06);
      const twinklePeriod = 1900 + seed * 1500;
      const twinklePhase = (timeMs + seed * 4700) % twinklePeriod;
      const twinkle = Math.pow(Math.max(0, Math.sin((twinklePhase / twinklePeriod) * Math.PI)), 3);
      if (twinkle > 0.02) {
        const starR = size * (0.045 + 0.02 * twinkle);
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.65 * twinkle;
        ctx.translate(glintX, glintY);
        ctx.beginPath();
        ctx.moveTo(0, -starR);
        ctx.lineTo(starR * 0.28, -starR * 0.28);
        ctx.lineTo(starR, 0);
        ctx.lineTo(starR * 0.28, starR * 0.28);
        ctx.lineTo(0, starR);
        ctx.lineTo(-starR * 0.28, starR * 0.28);
        ctx.lineTo(-starR, 0);
        ctx.lineTo(-starR * 0.28, -starR * 0.28);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    },
  },

  // Cubes in one neutral color, distinguished purely by pip count 1-6 —
  // "value" replaces "color" as the match identity here. rules.js/board.js
  // are unaffected: they still only ever see the same 6 color-id tokens;
  // this is just a fixed color-id -> pip-count mapping for rendering.
  dice: {
    id: 'dice',

    FACE_COLOR: '#ece6d8',

    // Dice has no color identity at all — every face is this same neutral
    // color regardless of pip count/value — so its explosion particles
    // should match the die's own face color, not the underlying color-id's
    // hue (which is otherwise invisible in this tileset).
    particleColor(colorId) {
      return this.FACE_COLOR;
    },

    PIP_COUNTS: { red: 1, blue: 2, green: 3, cyan: 4, purple: 5, yellow: 6 },

    PIP_LAYOUTS: {
      1: ['mm'],
      2: ['tl', 'br'],
      3: ['tl', 'mm', 'br'],
      4: ['tl', 'tr', 'bl', 'br'],
      5: ['tl', 'tr', 'mm', 'bl', 'br'],
      6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
    },

    PIP_POSITIONS: {
      tl: [0.27, 0.27], tm: [0.5, 0.27], tr: [0.73, 0.27],
      ml: [0.27, 0.5], mm: [0.5, 0.5], mr: [0.73, 0.5],
      bl: [0.27, 0.73], bm: [0.5, 0.73], br: [0.73, 0.73],
    },

    // The rounded-square outline only — used by the pre-explosion flash so
    // it matches this tileset's actual shape, not a generic square.
    silhouette(x, y, size, token, timeMs) {
      const pad = size * 0.08;
      const s = size - pad * 2;
      const gx = x + pad, gy = y + pad;
      const radius = s * 0.2;
      const path = new Path2D();
      roundedRectPath(path, gx, gy, s, s, radius);
      return path;
    },

    drawToken(ctx, x, y, size, token, timeMs) {
      const pad = size * 0.08;
      const s = size - pad * 2;
      const gx = x + pad, gy = y + pad;
      const radius = s * 0.2;

      ctx.save();

      // face fill + drop shadow
      ctx.beginPath();
      roundedRectPath(ctx, gx, gy, s, s, radius);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = size * 0.1;
      ctx.shadowOffsetY = size * 0.04;
      ctx.fillStyle = this.FACE_COLOR;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // a much lighter bevel than Crystals — dice faces read as matte, not glassy
      ctx.beginPath();
      roundedRectPath(ctx, gx, gy, s, s, radius);
      const bevel = ctx.createLinearGradient(gx, gy, gx + s, gy + s);
      bevel.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      bevel.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
      bevel.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
      ctx.fillStyle = bevel;
      ctx.fill();

      // crisp outer edge
      ctx.beginPath();
      roundedRectPath(ctx, gx, gy, s, s, radius);
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.stroke();

      // pips — the actual match identity for this tileset
      const value = this.PIP_COUNTS[token.color] || 1;
      const pipR = s * 0.09;
      this.PIP_LAYOUTS[value].forEach((key) => {
        const [fx, fy] = this.PIP_POSITIONS[key];
        const px = gx + s * fx;
        const py = gy + s * fy;
        const grad = ctx.createRadialGradient(px - pipR * 0.3, py - pipR * 0.3, pipR * 0.1, px, py, pipR);
        grad.addColorStop(0, '#4a4550');
        grad.addColorStop(1, '#201d24');
        ctx.beginPath();
        ctx.arc(px, py, pipR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      ctx.restore();
    },
  },

  // Animated symbols inside a shared transparent soap-bubble membrane —
  // only the interior animation differs per color: fire/water/life/
  // lightning/void/star for red/blue/green/cyan/purple/yellow respectively.
  elements: {
    id: 'elements',

    // The wobbly membrane outline — unlike Blobs' wobble (a fixed per-seed
    // bulge shape, only the overall scale breathes), a soap film never
    // holds still, so this runs live off `timeMs`: several traveling sine
    // ripples of different frequency/speed, seed-offset so bubbles aren't
    // synchronized. Shared by drawToken and silhouette(), the latter used
    // by the pre-explosion flash so it matches this tileset's actual shape.
    bodyPath(x, y, size, token, timeMs) {
      const seed = token.seed;
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.47; // same fill philosophy as Blobs — near-full-bleed
      const t = timeMs / 1000;

      const pts = 16;
      const at = (i) => {
        const angle = (i / pts) * Math.PI * 2;
        const wob = Math.sin(angle * 3 + t * 1.3 + seed * 12) * 0.028
          + Math.sin(angle * 5 - t * 0.85 + seed * 23) * 0.018
          + Math.sin(angle * 2 + t * 0.55 + seed * 7) * 0.014;
        const rr = r * (1 + wob);
        return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr];
      };
      const path = new Path2D();
      const first = at(0);
      const last = at(pts - 1);
      const startMid = [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2];
      path.moveTo(startMid[0], startMid[1]);
      for (let i = 0; i < pts; i++) {
        const cur = at(i);
        const next = at((i + 1) % pts);
        const mid = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
        path.quadraticCurveTo(cur[0], cur[1], mid[0], mid[1]);
      }
      path.closePath();
      return path;
    },

    silhouette(x, y, size, token, timeMs) {
      return this.bodyPath(x, y, size, token, timeMs);
    },

    drawToken(ctx, x, y, size, token, timeMs) {
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.47;
      const seed = token.seed;
      const t = timeMs / 1000;

      ctx.save();

      const shell = this.bodyPath(x, y, size, token, timeMs);

      // near-invisible film fill — just enough to read as "there"
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.fill(shell);

      // iridescent rim: a slowly-rotating rainbow sheen along the film
      // itself, like real thin-film interference on soap. Drawn with
      // additive blending so the hues read as colored light against the
      // dark tray/interior instead of alpha-blending toward gray.
      ctx.save();
      ctx.clip(shell);
      ctx.globalCompositeOperation = 'lighter';
      const iri = ctx.createConicGradient(t * 0.4 + seed * 6, cx, cy);
      iri.addColorStop(0.0, 'rgba(255, 110, 170, 0.2)');
      iri.addColorStop(0.18, 'rgba(100, 170, 255, 0.175)');
      iri.addColorStop(0.36, 'rgba(100, 255, 190, 0.19)');
      iri.addColorStop(0.55, 'rgba(255, 215, 90, 0.175)');
      iri.addColorStop(0.75, 'rgba(180, 120, 255, 0.2)');
      iri.addColorStop(1.0, 'rgba(255, 110, 170, 0.2)');
      ctx.lineWidth = Math.max(1.6, size * 0.07);
      ctx.strokeStyle = iri;
      ctx.stroke(shell);
      ctx.restore();

      // crisp thin edge on top of the sheen, for definition
      ctx.lineWidth = Math.max(1, size * 0.018);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke(shell);

      // interior animation, clipped to the wobbly membrane itself so the
      // contents read as seen through a moving soap film, not a static disc
      ctx.save();
      ctx.clip(shell);
      switch (token.color) {
        case 'red': this.drawFire(ctx, cx, cy, r, seed, timeMs); break;
        case 'blue': this.drawWater(ctx, cx, cy, r, seed, timeMs); break;
        case 'green': this.drawLife(ctx, cx, cy, r, seed, timeMs); break;
        case 'cyan': this.drawLightning(ctx, cx, cy, r, seed, timeMs); break;
        case 'purple': this.drawVoid(ctx, cx, cy, r, seed, timeMs); break;
        case 'yellow': this.drawStar(ctx, cx, cy, r, seed, timeMs); break;
      }
      ctx.restore();

      // primary glossy highlight, gently drifting for a "live" shimmer
      const hlDrift = Math.sin(t * 0.7 + seed * 9) * r * 0.02;
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.32 + hlDrift, cy - r * 0.36, r * 0.24, r * 0.16, -0.5, 0, Math.PI * 2);
      const sheen = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.36, 0, cx - r * 0.32, cy - r * 0.36, r * 0.28);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheen;
      ctx.fill();

      // small secondary glint on the opposite side, real bubbles catch more
      // than one reflection
      ctx.beginPath();
      ctx.arc(cx + r * 0.4, cy + r * 0.32, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();

      ctx.restore();
    },

    // fire (red) — a stream of rising, color-shifting ember particles
    // (procedural: each of a fixed slot count runs its own short
    // rise-and-fade lifecycle computed straight from elapsed time, so no
    // persistent particle array is needed). Matches the particle language
    // Life/Void already use, instead of the old single solid flame shape.
    drawFire(ctx, cx, cy, r, seed, timeMs) {
      const baseY = cy + r * 0.62;
      const count = 16;
      const period = 950;

      // warm glow at the source, grounding the embers
      const glow = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, r * 0.5);
      glow.addColorStop(0, 'rgba(255, 180, 90, 0.35)');
      glow.addColorStop(1, 'rgba(255, 120, 60, 0)');
      ctx.beginPath();
      ctx.arc(cx, baseY, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      for (let i = 0; i < count; i++) {
        const offset = (i / count) * period + seed * 5000;
        const localT = ((timeMs + offset) % period) / period; // 0..1 lifecycle
        const sway = Math.sin(localT * Math.PI * 2.4 + i * 1.7 + seed * 9) * r * 0.1 * localT
          + Math.sin(i * 12.9 + seed * 5) * r * 0.05 * (1 - localT);
        const px = cx + sway;
        const py = baseY - localT * r * 1.2;
        const size = r * 0.15 * (1 - localT * 0.65) * (0.6 + 0.4 * Math.sin(i * 3.1 + seed * 2));
        const alpha = Math.sin(localT * Math.PI); // fades in, peaks mid-rise, fades out

        let color;
        if (localT < 0.3) color = `rgba(255, 235, 180, ${alpha})`;
        else if (localT < 0.65) color = `rgba(255, 150, 60, ${alpha})`;
        else color = `rgba(210, 70, 55, ${alpha * 0.75})`;

        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    },

    // water (blue) — fills ~2/3 of the bubble, surface gently sloshing,
    // with small bubbles rising up to that surface and vanishing there
    drawWater(ctx, cx, cy, r, seed, timeMs) {
      const t = timeMs / 1000 + seed * 10;
      const waterTopY = cy + r * 0.25 + Math.sin(t * 2.2) * r * 0.05;
      const steps = 10;
      const surface = [];
      for (let i = 0; i <= steps; i++) {
        const px = cx - r + (2 * r) * (i / steps);
        const py = waterTopY + Math.sin((i / steps) * Math.PI * 2 + t * 2.5) * r * 0.04;
        surface.push([px, py]);
      }

      ctx.beginPath();
      ctx.moveTo(surface[0][0], surface[0][1]);
      surface.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.lineTo(cx + r, cy + r + 2);
      ctx.lineTo(cx - r, cy + r + 2);
      ctx.closePath();
      const grad = ctx.createLinearGradient(cx, waterTopY, cx, cy + r);
      grad.addColorStop(0, 'rgba(120, 190, 255, 0.85)');
      grad.addColorStop(1, 'rgba(59, 130, 246, 0.9)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(surface[0][0], surface[0][1]);
      surface.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const bubbleCount = 5;
      const bubblePeriod = 1800;
      for (let i = 0; i < bubbleCount; i++) {
        const offset = (i / bubbleCount) * bubblePeriod + seed * 4000;
        const localT = ((timeMs + offset) % bubblePeriod) / bubblePeriod;
        const bx = cx + Math.sin(i * 3.3 + seed * 6) * r * 0.5;
        const by = (cy + r) - localT * (cy + r - waterTopY - r * 0.05);
        if (by < waterTopY + r * 0.05) continue; // reached the surface — hide
        const br = r * 0.035 * (0.6 + 0.4 * Math.sin(i * 2 + seed * 3));
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
      }
    },

    // life (green) — drifting fireflies: a soft glow halo, a faint trailing
    // echo along their own orbit, and a gentle pulsing brightness
    drawLife(ctx, cx, cy, r, seed, timeMs) {
      const t = timeMs / 1000 + seed * 10;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const phase = t * 0.55 + i * ((Math.PI * 2) / count) + seed * 3;
        const orbitR = r * (0.3 + 0.35 * ((i % 3) / 2));
        const px = cx + Math.cos(phase) * orbitR;
        const py = cy + Math.sin(phase * 1.3) * orbitR * 0.75;
        const pulse = 0.5 + 0.5 * Math.sin(phase * 2.4 + i);
        const pr = r * 0.075 * (0.7 + 0.5 * pulse);

        const glow = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.6);
        glow.addColorStop(0, `rgba(140, 255, 170, ${0.35 * pulse})`);
        glow.addColorStop(1, 'rgba(140, 255, 170, 0)');
        ctx.beginPath();
        ctx.arc(px, py, pr * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        const trailPhase = phase - 0.35;
        const tx = cx + Math.cos(trailPhase) * orbitR;
        const ty = cy + Math.sin(trailPhase * 1.3) * orbitR * 0.75;
        ctx.beginPath();
        ctx.arc(tx, ty, pr * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 230, 150, ${0.18 * pulse})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 255, 190, ${0.6 + 0.4 * pulse})`;
        ctx.fill();
      }
    },

    // lightning (cyan) — a constant electrical discharge, not an
    // intermittent flicker: the bolt is always present (so the color stays
    // identifiable at a glance) but crackles continuously via smooth
    // time-based jitter/intensity, plus an ambient haze and an occasional
    // branch fork for extra "alive" electricity
    drawLightning(ctx, cx, cy, r, seed, timeMs) {
      const t = timeMs / 1000 + seed * 10;

      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      haze.addColorStop(0, 'rgba(165, 243, 252, 0.16)');
      haze.addColorStop(1, 'rgba(165, 243, 252, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = haze;
      ctx.fill();

      const jitter = (i) => Math.sin(t * (9 + i * 3.3) + seed * (10 + i * 7)) * r * 0.09
        + Math.sin(t * (17 + i * 5) + seed * (3 + i)) * r * 0.05;
      const mainPts = [
        [cx - r * 0.15 + jitter(0), cy - r * 0.62],
        [cx + r * 0.12 + jitter(1), cy - r * 0.28],
        [cx - r * 0.1 + jitter(2), cy + r * 0.02],
        [cx + r * 0.14 + jitter(3), cy + r * 0.32],
        [cx - r * 0.08 + jitter(4), cy + r * 0.62],
      ];
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 6 + seed * 8)) * Math.abs(Math.sin(t * 2.3 + seed * 3));

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.shadowColor = 'rgba(165, 243, 252, 0.9)';
      ctx.shadowBlur = r * 0.35 * pulse;
      ctx.beginPath();
      ctx.moveTo(mainPts[0][0], mainPts[0][1]);
      mainPts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.strokeStyle = `rgba(165, 243, 252, ${0.55 + 0.35 * pulse})`;
      ctx.lineWidth = Math.max(1.6, r * 0.1 * (0.8 + 0.4 * pulse));
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(1, r * 0.035);
      ctx.stroke();

      // an occasional small branch fork off the middle of the bolt
      const [bx, by] = mainPts[2];
      const branchAngle = Math.sin(t * 4 + seed * 6) * 0.9 + 1.2;
      const branchLen = r * (0.22 + 0.08 * Math.sin(t * 5 + seed * 2));
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(branchAngle) * branchLen, by + Math.sin(branchAngle) * branchLen);
      ctx.strokeStyle = `rgba(200, 250, 255, ${0.4 + 0.3 * pulse})`;
      ctx.lineWidth = Math.max(1, r * 0.025);
      ctx.stroke();

      ctx.restore();
    },

    // void (purple) — many more sparkles than before, spiraling slowly
    // inward (thematically pulled toward the center) with a dark vignette
    // behind them so the color reads clearly rather than a few faint dots
    drawVoid(ctx, cx, cy, r, seed, timeMs) {
      const t = timeMs / 1000 + seed * 10;

      const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      vignette.addColorStop(0, 'rgba(20, 10, 30, 0.35)');
      vignette.addColorStop(0.7, 'rgba(40, 20, 60, 0.12)');
      vignette.addColorStop(1, 'rgba(40, 20, 60, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = vignette;
      ctx.fill();

      const count = 14;
      for (let i = 0; i < count; i++) {
        const phase = t * (0.25 + (i % 3) * 0.08) + i * 1.3 + seed * 5;
        const cyclePeriod = 4 + (i % 3);
        const cycleT = ((t * 0.4 + i * 0.6) % cyclePeriod) / cyclePeriod; // loops 0..1
        const driftR = r * (0.75 - 0.55 * cycleT); // spirals from outer edge inward
        const angle = phase + cycleT * Math.PI * 2.2;
        const px = cx + Math.cos(angle) * driftR;
        const py = cy + Math.sin(angle) * driftR * 0.85;
        const twinkle = 0.5 + 0.5 * Math.abs(Math.sin(phase * 3 + i));
        const fade = Math.sin(cycleT * Math.PI); // fades in/out over each spiral pass
        const pr = r * 0.06 * twinkle * (0.5 + 0.5 * fade);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, pr), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190, 130, 245, ${(0.45 + 0.45 * twinkle) * fade})`;
        ctx.fill();
      }
    },

    // star (yellow) — a glowing 4-armed star, slowly rotating, with a
    // gentle breathing glow and a couple of tiny twinkling sparkles
    // drifting loosely around it
    drawStar(ctx, cx, cy, r, seed, timeMs) {
      const t = timeMs / 1000 + seed * 10;
      const s = r * 0.55;
      const breathe = 0.8 + 0.2 * Math.sin(t * 1.6 + seed * 5);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.5);
      ctx.shadowColor = 'rgba(242, 201, 76, 0.8)';
      ctx.shadowBlur = r * 0.35 * breathe;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.28, -s * 0.28);
      ctx.lineTo(s, 0);
      ctx.lineTo(s * 0.28, s * 0.28);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.28, s * 0.28);
      ctx.lineTo(-s, 0);
      ctx.lineTo(-s * 0.28, -s * 0.28);
      ctx.closePath();
      ctx.fillStyle = '#f2c94c';
      ctx.fill();
      ctx.restore();

      const sparkleCount = 3;
      for (let i = 0; i < sparkleCount; i++) {
        const phase = t * 0.7 + i * 2.2 + seed * 6;
        const sr = r * (0.55 + 0.25 * (i % 2));
        const px = cx + Math.cos(phase) * sr;
        const py = cy + Math.sin(phase) * sr * 0.8;
        const twinkle = Math.max(0, Math.sin(phase * 3 + i * 2));
        if (twinkle < 0.05) continue;
        const pr = r * 0.035 * twinkle;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 235, 180, ${0.7 * twinkle})`;
        ctx.fill();
      }
    },
  },
};
