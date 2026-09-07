// ui.js — Small drawing primitives shared by the title screen and the game-over panel
//
// These two screens are the only places in the game that draw UI chrome rather than
// the play field, and they share a vocabulary: rounded panels, letter-tracked
// labels, and a play triangle. Keeping that vocabulary in one place is what makes
// the two screens look like they belong to the same product.

const UI = (() => {

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

  // Letter tracking, drawn a glyph at a time.
  //
  // ctx.letterSpacing would be shorter, but it is unevenly supported and — more to
  // the point — it adds trailing space after the final glyph, so a centred tracked
  // label comes out visibly off-centre. Measuring and placing each glyph gives an
  // exact width, which the logo lockup below depends on.

  function trackedWidth(ctx, text, tracking) {
    let w = 0;
    for (let i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width;
    return w + tracking * Math.max(0, text.length - 1);
  }

  // Draws `text` tracked by `tracking`, centred on `cx`. Honours the context's
  // current font, fill and shadow; ignores textAlign, which it has to set itself.
  function fillTracked(ctx, text, cx, y, tracking) {
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let x = cx - trackedWidth(ctx, text, tracking) / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + tracking;
    }
    ctx.textAlign = prevAlign;
  }

  // The tracking that makes `text` at the current font span exactly `target` px.
  function trackingToWidth(ctx, text, target) {
    if (text.length < 2) return 0;
    return (target - trackedWidth(ctx, text, 0)) / (text.length - 1);
  }

  // A play triangle pointing right, centred on (cx, cy) with the given half-height.
  // Drawn as a path rather than the "▶" glyph, whose size and vertical centring
  // vary between monospace fallbacks.
  function playGlyph(ctx, cx, cy, h) {
    const w = h * 1.05;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx - w / 2, cy + h);
    ctx.closePath();
    ctx.fill();
  }

  // A four-pointed star, for the new-best badge. Same reasoning as playGlyph.
  function starGlyph(ctx, cx, cy, r) {
    const i = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + i, cy - i);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + i, cy + i);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - i, cy + i);
    ctx.lineTo(cx - r, cy);
    ctx.lineTo(cx - i, cy - i);
    ctx.closePath();
    ctx.fill();
  }

  // A hairline rule. Offset by half a pixel so a 1px line lands on one row of
  // pixels instead of straddling two and rendering as a 2px smear at 50% alpha.
  function rule(ctx, x0, x1, y, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = width || 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5);
    ctx.lineTo(x1, Math.round(y) + 0.5);
    ctx.stroke();
  }

  // The 1px inner highlight along the top of a panel or button, which is what makes
  // a flat rounded rect read as a lit surface.
  function topHighlight(ctx, x, y, w, h, r, alpha) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h * 0.5);
    ctx.restore();
  }

  return { roundRect, trackedWidth, fillTracked, trackingToWidth,
           playGlyph, starGlyph, rule, topHighlight };
})();
