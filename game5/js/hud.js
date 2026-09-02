// hud.js — HUD rendering and button logic
//
// The three icon buttons (sound, exit, fullscreen) follow ../branding.md verbatim:
// 30x30 at radius 8, a vertical column inset 28 from the right, y stepping by 36.
// Geometry, colours, icon paths and the three-state sound cycle all come from that
// spec, which is shared across every game in this repo.
//
// Buttons are positioned by their index in the requested list, so the title screen
// asking for ['sound', 'fullscreen'] puts fullscreen in the slot exit would have
// occupied — the spec's "hiding a middle button" case, with no special case for it.
//
// Drawn flat: no shadowBlur anywhere, so all of this is a handful of cheap fills.

const HUD = (() => {
  let soundMode = 0; // 0=On, 1=MusicOff, 2=Off

  const ALL = ['sound', 'exit', 'fullscreen'];
  const TAU = Math.PI * 2;

  // Pointer position in canvas coordinates, or null when the pointer is away.
  // Hover is a mouse affordance; touch simply never sets it.
  let hoverX = null, hoverY = null;

  function init() { /* layout is derived from constants, nothing to precompute */ }

  function getSoundMode() { return soundMode; }
  function isSfxOn()      { return soundMode < 2; }
  function cycleSound()   { soundMode = (soundMode + 1) % 3; }

  function setPointer(x, y) { hoverX = x; hoverY = y; }
  function clearPointer()   { hoverX = null; hoverY = null; }

  // Slot geometry for the i-th button of a column.
  function slot(i) {
    return {
      x: C.CANVAS_W - C.BTN_INSET - C.BTN_SIZE,
      y: C.BTN_Y0 + i * (C.BTN_SIZE + C.BTN_GAP),
      w: C.BTN_SIZE,
      h: C.BTN_SIZE,
    };
  }

  // Half-open on the far edges, so the hit region is exactly the drawn 30x30 box
  // rather than 31x31.
  function inside(b, x, y) {
    return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  }

  // Which button of `kinds` is under (x, y), or null.
  function hitTest(x, y, kinds) {
    if (x === null || y === null) return null;
    for (let i = 0; i < kinds.length; i++) {
      if (inside(slot(i), x, y)) return kinds[i];
    }
    return null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── Icons ─────────────────────────────────────────────────────────────────
  // All geometry is the spec's, expressed against the button centre (cx, cy) and
  // its nominal half-size s. Round caps and joins throughout.

  function speakerBody(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.85, cy - s * 0.25);
    ctx.lineTo(cx - s * 0.5,  cy - s * 0.25);
    ctx.lineTo(cx - s * 0.05, cy - s * 0.6);
    ctx.lineTo(cx - s * 0.05, cy + s * 0.6);
    ctx.lineTo(cx - s * 0.5,  cy + s * 0.25);
    ctx.lineTo(cx - s * 0.85, cy + s * 0.25);
    ctx.closePath();
    ctx.fill();
  }

  function iconSoundOn(ctx, cx, cy, s) {
    speakerBody(ctx, cx, cy, s);
    ctx.lineWidth = C.ICON_STROKE_SOUND;
    ctx.beginPath();
    ctx.arc(cx - s * 0.05, cy, s * 0.55, -0.7, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - s * 0.05, cy, s * 0.95, -0.7, 0.7);
    ctx.stroke();
  }

  function iconSoundOff(ctx, cx, cy, s) {
    speakerBody(ctx, cx, cy, s);
    ctx.lineWidth = C.ICON_STROKE_SOUND;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.2, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.9, cy + s * 0.5);
    ctx.moveTo(cx + s * 0.9, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.5);
    ctx.stroke();
  }

  // A slashed note, no speaker. The slash is the same state colour, not red —
  // one colour per state, per the spec.
  function iconMusicOff(ctx, cx, cy, s) {
    const nx = cx - s * 0.15;

    ctx.beginPath();
    ctx.ellipse(nx - s * 0.28, cy + s * 0.5, s * 0.3, s * 0.22, -0.4, 0, TAU);
    ctx.fill();

    ctx.lineWidth = C.ICON_STROKE_SOUND;
    ctx.beginPath();
    ctx.moveTo(nx, cy + s * 0.5);
    ctx.lineTo(nx, cy - s * 0.6);
    ctx.lineTo(nx + s * 0.5, cy - s * 0.4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.9, cy + s * 0.9);
    ctx.lineTo(cx + s * 0.9, cy - s * 0.9);
    ctx.stroke();
  }

  // Power symbol: a ring with an 84-degree gap centred at the top, plus a bar.
  function iconExit(ctx, cx, cy, s) {
    ctx.lineWidth = C.ICON_STROKE_GLYPH;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.8,
            (-90 + 42) * Math.PI / 180,
            (-90 - 42) * Math.PI / 180 + TAU, false);
    // moveTo starts a new subpath, so the bar is not joined to the ring's end.
    ctx.moveTo(cx, cy - s * 1.05);
    ctx.lineTo(cx, cy - s * 0.05);
    ctx.stroke();
  }

  // Four L-shaped corner brackets. Corners outside with arms reaching in = enter;
  // corners inset with arms reaching out to the edges = exit.
  const QUADRANTS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  function iconFullscreen(ctx, cx, cy, s, active) {
    const a = s * 0.8, b = s * 0.42;
    ctx.lineWidth = C.ICON_STROKE_GLYPH;
    ctx.beginPath();
    for (const q of QUADRANTS) {
      const sx = q[0], sy = q[1];
      if (active) {
        ctx.moveTo(cx + sx * a,       cy + sy * (a - b));
        ctx.lineTo(cx + sx * (a - b), cy + sy * (a - b));
        ctx.lineTo(cx + sx * (a - b), cy + sy * a);
      } else {
        ctx.moveTo(cx + sx * (a - b), cy + sy * a);
        ctx.lineTo(cx + sx * a,       cy + sy * a);
        ctx.lineTo(cx + sx * a,       cy + sy * (a - b));
      }
    }
    ctx.stroke();
  }

  // ── Buttons ───────────────────────────────────────────────────────────────

  function drawButton(ctx, kind, b, hovered) {
    ctx.fillStyle   = hovered ? C.BTN_FILL_HOVER   : C.BTN_FILL;
    ctx.strokeStyle = hovered ? C.BTN_STROKE_HOVER : C.BTN_STROKE;
    ctx.lineWidth   = C.BTN_LINE_WIDTH;
    roundRect(ctx, b.x, b.y, b.w, b.h, C.BTN_RADIUS);
    ctx.fill();
    ctx.stroke();

    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = C.ICON_HALF;
    // Only sound in the `on` state is bright; exit and fullscreen are always dim.
    const col = (kind === 'sound' && soundMode === 0) ? C.ICON_BRIGHT : C.ICON_DIM;
    ctx.fillStyle   = col;
    ctx.strokeStyle = col;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    if (kind === 'sound') {
      if (soundMode === 0)      iconSoundOn(ctx, cx, cy, s);
      else if (soundMode === 1) iconMusicOff(ctx, cx, cy, s);
      else                      iconSoundOff(ctx, cx, cy, s);
    } else if (kind === 'exit') {
      iconExit(ctx, cx, cy, s);
    } else {
      iconFullscreen(ctx, cx, cy, s, Game.isFullscreen());
    }
  }

  // Draws the column for `kinds`. Callers draw this last so the buttons stay live
  // above a game-over overlay, as the spec requires.
  function drawButtons(ctx, kinds) {
    const hot = hitTest(hoverX, hoverY, kinds);
    ctx.save();
    ctx.globalAlpha = 1;
    for (let i = 0; i < kinds.length; i++) {
      drawButton(ctx, kinds[i], slot(i), kinds[i] === hot);
    }
    ctx.restore();
    return hot;
  }

  // ── Gameplay HUD ──────────────────────────────────────────────────────────

  function draw(ctx, multiplierActive, shieldActive, slowActive, purpleActive) {
    drawButtons(ctx, ALL);

    // Active power-up badges, stacked below the button column.
    const bx = C.CANVAS_W - C.BTN_INSET - C.BTN_SIZE / 2;
    let piY = C.BTN_Y0 + ALL.length * (C.BTN_SIZE + C.BTN_GAP) + 12;
    if (shieldActive) {
      drawPowerupBadge(ctx, bx, piY, '⬡', C.POWERUP_SHIELD_COLOR);
      piY += 26;
    }
    if (slowActive) {
      drawPowerupBadge(ctx, bx, piY, '↓', C.POWERUP_SLOW_COLOR);
      piY += 26;
    }
    if (multiplierActive) {
      drawPowerupBadge(ctx, bx, piY, '×2', C.POWERUP_MULT_COLOR);
      piY += 26;
    }
    if (purpleActive) {
      drawPowerupBadge(ctx, bx, piY, '⚡', C.POWERUP_PURPLE_COLOR);
    }
  }

  // Only the alpha animates, so the glowing glyph is baked and the pulse applied
  // through globalAlpha on the blit.
  const badgeCache = new Map();

  function badgeSprite(icon, color) {
    const key = icon + ':' + color;
    let c = badgeCache.get(key);
    if (c) return c;
    const S = 44;
    c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.font         = 'bold 13px monospace';
    g.textAlign    = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur   = 10;
    g.shadowColor  = color;
    g.fillStyle    = color;
    g.fillText(icon, S / 2, S / 2);
    badgeCache.set(key, c);
    return c;
  }

  function drawPowerupBadge(ctx, x, y, icon, color) {
    const c = badgeSprite(icon, color);
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(Game.getTime() * 5);
    ctx.drawImage(c, x - c.width / 2, y - c.height / 2);
    ctx.globalAlpha = 1;
  }

  // Routes a tap on the gameplay column. Returns true when a button consumed it.
  function handleClick(cx, cy, onQuit, onFullscreen, onSound) {
    const hit = hitTest(cx, cy, ALL);
    if (hit === 'exit')       { onQuit(); return true; }
    if (hit === 'sound')      { onSound(); return true; }
    if (hit === 'fullscreen') { onFullscreen(); return true; }
    return false;
  }

  return {
    init, draw, drawButtons, handleClick, hitTest,
    getSoundMode, isSfxOn, cycleSound,
    setPointer, clearPointer,
    KINDS_GAME: ALL,
    // The title screen has no run to exit, so it shows two buttons and fullscreen
    // takes the slot exit would have used.
    KINDS_TITLE: ['sound', 'fullscreen'],
  };
})();
