// hud.js — HUD rendering and button logic

const HUD = (() => {
  let soundMode = 0; // 0=On, 1=MusicOff, 2=Off
  const soundIcons = ['♪', '♩', '✕'];

  let buttons = {};

  // Layout is static, so bounds are valid for hit testing from init onward —
  // not only after the first draw.
  function init() {
    const m  = C.HUD_MARGIN;
    const bs = C.HUD_BTN_SIZE;
    const W  = C.CANVAS_W;
    // [Quit] [Sound] [Fullscreen], right-aligned
    buttons = {
      quit:       { x: W - m - bs * 3 - 6, y: m, w: bs, h: bs },
      sound:      { x: W - m - bs * 2 - 4, y: m, w: bs, h: bs },
      fullscreen: { x: W - m - bs,         y: m, w: bs, h: bs },
    };
  }

  function getSoundMode() { return soundMode; }
  function isSfxOn()   { return soundMode < 2; }

  function cycleSound() {
    soundMode = (soundMode + 1) % 3;
  }

  function drawBtn(ctx, x, y, w, h, icon, active) {
    ctx.save();
    // Background
    ctx.fillStyle = active ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // Icon
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00e5ff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x + w / 2, y + h / 2);
    ctx.restore();
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

  function draw(ctx, multiplierActive, shieldActive, slowActive, purpleActive) {
    const m = C.HUD_MARGIN;
    const bs = C.HUD_BTN_SIZE;
    const W = C.CANVAS_W;

    // --- Buttons top-right ---
    drawBtn(ctx, buttons.quit.x,       buttons.quit.y,       bs, bs, '✕', false);
    drawBtn(ctx, buttons.sound.x,      buttons.sound.y,      bs, bs, soundIcons[soundMode], soundMode === 0);
    drawBtn(ctx, buttons.fullscreen.x, buttons.fullscreen.y, bs, bs, '⛶', !!document.fullscreenElement);

    // --- Active power-up indicators ---
    let piY = m + bs + 14;
    if (shieldActive) {
      drawPowerupBadge(ctx, W - m - bs * 1.5, piY, '⬡', C.POWERUP_SHIELD_COLOR);
      piY += 28;
    }
    if (slowActive) {
      drawPowerupBadge(ctx, W - m - bs * 1.5, piY, '↓', C.POWERUP_SLOW_COLOR);
      piY += 28;
    }
    if (multiplierActive) {
      drawPowerupBadge(ctx, W - m - bs * 1.5, piY, '×2', C.POWERUP_MULT_COLOR);
    }
    if (purpleActive) {
      drawPowerupBadge(ctx, W - m - bs * 1.5, piY, '⚡', C.POWERUP_PURPLE_COLOR);
    }
  }

  function drawPowerupBadge(ctx, x, y, icon, color) {
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(Game.getTime() * 5);
    ctx.fillText(icon, x, y);
    ctx.restore();
  }

  function handleClick(cx, cy, onQuit, onFullscreen, onSound) {
    function hit(btn) {
      return cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h;
    }
    if (hit(buttons.quit))       { onQuit(); return true; }
    if (hit(buttons.sound))      { onSound(); return true; }
    if (hit(buttons.fullscreen)) { onFullscreen(); return true; }
    return false;
  }

  return { init, draw, handleClick, getSoundMode, isSfxOn, cycleSound };
})();
