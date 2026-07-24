// All canvas drawing: cached well tray, tokens for the active tileset, the
// falling piece, score pop-ups, header/panels, game-over. Game logic never
// lives here — everything comes in as plain data.

const Renderer = {
  trayCache: null,
  trayCacheKey: null,

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // Rendered offscreen at device resolution (logical size * pixelRatio) so
  // the hairline grid stays crisp; drawImage's destination size is given in
  // logical units, matching how everything else is drawn.
  ensureTrayCache(layout, pixelRatio) {
    const key = `${layout.wellX}|${layout.wellY}|${layout.cellSize}|${layout.wellW}|${layout.wellH}|${pixelRatio}`;
    if (this.trayCacheKey === key && this.trayCache) return this.trayCache;

    const pad = 20;
    const logicalW = layout.wellW + pad * 2;
    const logicalH = layout.wellH + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(logicalW * pixelRatio));
    canvas.height = Math.max(1, Math.round(logicalH * pixelRatio));
    const ctx = canvas.getContext('2d');
    ctx.scale(pixelRatio, pixelRatio);

    ctx.save();
    ctx.translate(pad, pad);

    // tray body — darker than before, so it still reads as a lit surface
    // against the much darker background, but colorful tokens are what pops
    this.roundRect(ctx, -14, -14, layout.wellW + 28, layout.wellH + 28, 18);
    const grad = ctx.createLinearGradient(0, -14, 0, layout.wellH + 14);
    grad.addColorStop(0, '#171a24');
    grad.addColorStop(1, '#0a0b10');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // soft cool rim glow
    this.roundRect(ctx, -14, -14, layout.wellW + 28, layout.wellH + 28, 18);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120, 150, 255, 0.07)';
    ctx.stroke();

    // rim bevel
    this.roundRect(ctx, -14, -14, layout.wellW + 28, layout.wellH + 28, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // hairline grid — thin, mostly-transparent cell separators (no per-cell fill)
    ctx.beginPath();
    for (let c = 1; c < WELL.COLS; c++) {
      const x = c * layout.cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, layout.wellH);
    }
    for (let r = 1; r < WELL.ROWS; r++) {
      const y = r * layout.cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(layout.wellW, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.stroke();

    ctx.restore();
    this.trayCache = canvas;
    this.trayCacheKey = key;
    return canvas;
  },

  // Much darker than before, on purpose: a near-black stage makes the
  // saturated tokens/tilesets read as the brightest thing on screen instead
  // of competing with a mid-gray backdrop.
  drawBackground(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#08090d');
    grad.addColorStop(1, '#020203');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // soft vignette for depth, darkest at the corners
    const vignette = ctx.createRadialGradient(
      CANVAS_W / 2, CANVAS_H * 0.42, CANVAS_H * 0.15,
      CANVAS_W / 2, CANVAS_H * 0.5, CANVAS_W * 0.72
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  },

  drawWell(ctx, layout, pixelRatio) {
    const tray = this.ensureTrayCache(layout, pixelRatio);
    const pad = 20;
    ctx.drawImage(
      tray,
      layout.wellX - pad, layout.wellY - pad,
      layout.wellW + pad * 2, layout.wellH + pad * 2
    );
  },

  // skipSet: optional Set of "row,col" resting-position keys to omit —
  // used while those tokens are mid-flight in the fall animation, so they
  // aren't also drawn frozen at their final resting cell.
  drawGridTokens(ctx, grid, layout, tileset, timeMs, skipSet) {
    for (let r = 0; r < WELL.ROWS; r++) {
      for (let c = 0; c < WELL.COLS; c++) {
        const token = grid[r][c];
        if (!token) continue;
        if (skipSet && skipSet.has(r + ',' + c)) continue;
        const rect = Grid.cellRect(c, r, layout);
        tileset.drawToken(ctx, rect.x + 3, rect.y + 3, rect.size - 6, token, timeMs);
      }
    }
  },

  drawPiece(ctx, piece, layout, tileset, timeMs) {
    for (let i = 0; i < PIECE.LENGTH; i++) {
      const rect = Grid.cellRect(piece.col, piece.row + i, layout);
      tileset.drawToken(ctx, rect.x + 3, rect.y + 3, rect.size - 6, piece.tokens[i], timeMs);
    }
  },

  // Tokens currently sliding from their old row into the gap gravity opened
  // up below them. Eased quadratically so the drop reads as accelerating,
  // like real gravity, rather than a linear slide.
  drawFallingTokens(ctx, moves, layout, tileset, timeMs, phaseStart, duration) {
    const t = Math.min(1, Math.max(0, (timeMs - phaseStart) / duration));
    const eased = t * t;
    moves.forEach((m) => {
      const row = m.fromRow + (m.toRow - m.fromRow) * eased;
      const rect = Grid.cellRect(m.col, row, layout);
      tileset.drawToken(ctx, rect.x + 3, rect.y + 3, rect.size - 6, m.token, timeMs);
    });
  },

  // Matched tiles strobe in place for ANIM.FLASH_MS right before they pop.
  // Flashes the tileset's own token shape (via silhouette()) rather than a
  // generic square, so e.g. a round blob flickers as a round blob, not a
  // square with a blob-shaped hole of unflashed corners around it.
  drawFlashes(ctx, cells, layout, timeMs, tileset) {
    const pulse = 0.4 + 0.4 * Math.sin(timeMs / 45);
    cells.forEach((cell) => {
      const rect = Grid.cellRect(cell.col, cell.row, layout);
      ctx.save();
      ctx.globalAlpha = Math.max(0, pulse);
      ctx.fillStyle = '#ffffff';
      if (tileset && tileset.silhouette) {
        ctx.fill(tileset.silhouette(rect.x + 3, rect.y + 3, rect.size - 6, cell, timeMs));
      } else {
        this.roundRect(ctx, rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4, 6);
        ctx.fill();
      }
      ctx.restore();
    });
  },

  // Burst particles that replace an exploded tile: fly outward, gravity
  // pulls them down, fading out over each particle's own lifetime.
  drawParticles(ctx, particles, timeMs) {
    particles.forEach((p) => {
      const age = timeMs - p.start;
      if (age < 0 || age > p.life) return;
      const t = age / 1000;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * ANIM.PARTICLE_GRAVITY * t * t;
      const alpha = 1 - age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#ffffff';
      ctx.fill();
      ctx.restore();
    });
  },

  drawScorePopups(ctx, popups, layout, timeMs) {
    popups.forEach((p) => {
      const t = (timeMs - p.start) / ANIM.POPUP_MS;
      if (t < 0 || t > 1) return;
      const rect = Grid.cellRect(p.col, p.row, layout);
      const y = rect.y + rect.size / 2 - t * 26;
      const scale = 1 + 0.5 * t; // grows from 100% to 150% while floating
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color || '#ffffff';
      ctx.font = `bold ${15 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('+' + p.value, rect.x + rect.size / 2, y);
      ctx.restore();
    });
  },

  // accent: optional [colorA, colorB] gradient for a thin top stripe,
  // clipped to the panel's own rounded corners so it never pokes past them.
  drawPanelFrame(ctx, rect, accent) {
    this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    const bg = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    bg.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    bg.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    if (accent) {
      ctx.save();
      this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.clip();
      const stripe = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
      stripe.addColorStop(0, accent[0]);
      stripe.addColorStop(1, accent[1]);
      ctx.fillStyle = stripe;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(rect.x, rect.y, rect.w, 3);
      ctx.restore();
    }
  },

  drawSparkleIcon(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.9;
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
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  drawBoltIcon(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s);
    ctx.lineTo(s * 0.4, -s * 0.15);
    ctx.lineTo(s * 0.05, -s * 0.05);
    ctx.lineTo(s * 0.2, s);
    ctx.lineTo(-s * 0.4, s * 0.15);
    ctx.lineTo(-s * 0.05, s * 0.05);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  // HUD icon buttons (audio mode toggle, exit-to-menu) — top-right corner of
  // every gameplay screen, drawn last so they stay visible/clickable above
  // the game-over/win dialog overlays. Icon-only, no text labels.
  drawHudIconButton(ctx, rect, drawIcon) {
    ctx.save();
    this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();
    drawIcon(ctx, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w * 0.32);
    ctx.restore();
  },

  // mode: 'on' (full volume, two waves), 'music-off' (sfx only — one wave +
  // a struck-through note badge), 'off' (whole glyph slashed).
  drawSpeakerIcon(ctx, cx, cy, s, mode) {
    const color = mode === 'off' ? '#5b6272' : '#e7eaf2';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, s * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-s * 0.95, -s * 0.32);
    ctx.lineTo(-s * 0.35, -s * 0.32);
    ctx.lineTo(s * 0.2, -s * 0.8);
    ctx.lineTo(s * 0.2, s * 0.8);
    ctx.lineTo(-s * 0.35, s * 0.32);
    ctx.lineTo(-s * 0.95, s * 0.32);
    ctx.closePath();
    ctx.fill();

    if (mode === 'on') {
      ctx.beginPath();
      ctx.arc(s * 0.2, 0, s * 0.5, -Math.PI / 3.4, Math.PI / 3.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.2, 0, s * 0.85, -Math.PI / 3.4, Math.PI / 3.4);
      ctx.stroke();
    } else if (mode === 'music-off') {
      ctx.beginPath();
      ctx.arc(s * 0.2, 0, s * 0.5, -Math.PI / 3.4, Math.PI / 3.4);
      ctx.stroke();

      const nx = s * 0.55, ny = -s * 0.62, nr = s * 0.15;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(nx + nr, ny);
      ctx.lineTo(nx + nr, ny - s * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nx - s * 0.26, ny - s * 0.26);
      ctx.lineTo(nx + s * 0.26, ny + s * 0.26);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-s * 0.95, -s * 0.95);
      ctx.lineTo(s * 0.95, s * 0.95);
      ctx.stroke();
    }
    ctx.restore();
  },

  // A door frame with an arrow passing out through it — universal "exit".
  drawExitIcon(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#e7eaf2';
    ctx.lineWidth = Math.max(1.4, s * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.85);
    ctx.lineTo(-s * 0.85, -s * 0.85);
    ctx.lineTo(-s * 0.85, s * 0.85);
    ctx.lineTo(-s * 0.1, s * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s * 0.6, 0);
    ctx.lineTo(s * 0.7, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s * 0.32, -s * 0.38);
    ctx.lineTo(s * 0.78, 0);
    ctx.lineTo(s * 0.32, s * 0.38);
    ctx.stroke();
    ctx.restore();
  },

  drawHudButtons(ctx, hud, audioMode) {
    this.drawHudIconButton(ctx, hud.audioBtn.rect, (c, x, y, s) => this.drawSpeakerIcon(c, x, y, s, audioMode));
    this.drawHudIconButton(ctx, hud.exitBtn.rect, (c, x, y, s) => this.drawExitIcon(c, x, y, s));
  },

  // Small row of dots in the match's actual active colors — shows what's
  // in play at a glance instead of just a count (matters most for Elements,
  // whose 4/5-variety subset is a random pick of the 6, not just "the
  // first N").
  drawVarietyDots(ctx, x, y, activeColors) {
    const r = 4, gap = 5;
    activeColors.forEach((colorId, i) => {
      ctx.beginPath();
      ctx.arc(x + i * (r * 2 + gap) + r, y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[colorId];
      ctx.fill();
    });
  },

  drawStatsPanel(ctx, rect, state) {
    ctx.save();
    this.drawPanelFrame(ctx, rect, ['#4f8cff', '#8a5cf6']);
    ctx.textAlign = 'left';

    const label = (text, y) => {
      ctx.fillStyle = '#7a8296';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(text, rect.x + 16, y);
    };
    const value = (text, y) => {
      ctx.fillStyle = '#f5f7fb';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(text, rect.x + 16, y);
    };

    label('SCORE', rect.y + 34);
    value(String(state.score), rect.y + 62);
    this.drawSparkleIcon(ctx, rect.x + rect.w - 24, rect.y + 48, 9, '#f2c94c');

    label('VARIETY', rect.y + 104);
    value(String(state.varietyCount), rect.y + 128);
    const activeColors = state.activeColors || COLOR_IDS.slice(0, state.varietyCount);
    this.drawVarietyDots(ctx, rect.x + 16, rect.y + 140, activeColors);

    label('SPEED', rect.y + 172);
    value((1000 / state.fallIntervalMs).toFixed(1) + '/s', rect.y + 196);
    this.drawBoltIcon(ctx, rect.x + rect.w - 22, rect.y + 184, 10, '#4f8cff');

    ctx.restore();
  },

  drawNextPanel(ctx, rect, nextPiece, tileset, timeMs) {
    ctx.save();
    this.drawPanelFrame(ctx, rect, ['#ff7ab8', '#ffb14f']);

    ctx.fillStyle = '#7a8296';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NEXT', rect.x + 16, rect.y + 34);

    const size = Math.min(46, rect.w - 40);
    const x = rect.x + rect.w / 2 - size / 2;
    let y = rect.y + 50;
    for (let i = 0; i < PIECE.LENGTH; i++) {
      tileset.drawToken(ctx, x, y, size, nextPiece.tokens[i], timeMs);
      y += size + 10;
    }
    ctx.restore();
  },

  // Multiplayer-only chrome: a small caption above each well (stands in for
  // the stats panel, which Multiplayer intentionally omits — see CLAUDE.md).
  drawWellLabel(ctx, layout) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b93a7';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(layout.label, layout.labelCenterX, layout.wellY - 20);
    ctx.restore();
  },

  drawToppedOutOverlay(ctx, layout) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 14, 0.55)';
    ctx.fillRect(layout.wellX, layout.wellY, layout.wellW, layout.wellH);
    ctx.fillStyle = '#e7eaf2';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('TOPPED OUT', layout.wellX + layout.wellW / 2, layout.wellY + layout.wellH / 2);
    ctx.restore();
  },

  drawWinDialog(ctx, layout, winnerLabel) {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 6, 10, 0.7)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.roundRect(ctx, layout.panelX, layout.panelY, layout.panelW, layout.panelH, 16);
    const grad = ctx.createLinearGradient(0, layout.panelY, 0, layout.panelY + layout.panelH);
    grad.addColorStop(0, '#171b28');
    grad.addColorStop(1, '#0c0e15');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f7fb';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(winnerLabel, layout.panelX + layout.panelW / 2, layout.panelY + 68);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#8b93a7';
    ctx.fillText('The other well topped out', layout.panelX + layout.panelW / 2, layout.panelY + 94);

    this.drawModalButton(ctx, layout.playAgainBtn.rect, 'PLAY AGAIN', true);
    this.drawModalButton(ctx, layout.titleBtn.rect, 'TITLE SCREEN', false);

    ctx.restore();
  },

  drawModalButton(ctx, r, label, primary) {
    ctx.save();
    this.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    if (primary) {
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, '#4f8cff');
      grad.addColorStop(1, '#2f5fd6');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    }
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = primary ? 'rgba(79, 140, 255, 0.8)' : 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = primary ? '#ffffff' : '#e7eaf2';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  // Single Player game-over dialog: final score, this run's rank (if it
  // made the cut) and the persisted top-3-for-this-variety leaderboard,
  // plus Play Again / Title Screen — same modal chrome as the Multiplayer
  // win dialog.
  drawGameOverDialog(ctx, layout, info) {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 6, 10, 0.72)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.roundRect(ctx, layout.panelX, layout.panelY, layout.panelW, layout.panelH, 16);
    const grad = ctx.createLinearGradient(0, layout.panelY, 0, layout.panelY + layout.panelH);
    grad.addColorStop(0, '#171b28');
    grad.addColorStop(1, '#0c0e15');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    const cx = layout.panelX + layout.panelW / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#f5f7fb';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('GAME OVER', cx, layout.panelY + 46);

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#8b93a7';
    ctx.fillText('SCORE', cx, layout.panelY + 72);
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(info.score), cx, layout.panelY + 108);

    let y = layout.panelY + 134;
    if (info.rank) {
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = info.rank === 1 ? '#f2c94c' : '#4f8cff';
      ctx.fillText(info.rank === 1 ? 'NEW BEST SCORE!' : `NEW #${info.rank} SCORE!`, cx, y);
      y += 22;
    } else {
      y += 2;
    }

    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#5b6272';
    ctx.fillText(`TOP SCORES · VARIETY ${info.varietyCount}`, cx, y + 16);

    const rowsStartY = y + 40;
    const rowH = 26;
    for (let i = 0; i < Scoreboard.MAX_ENTRIES; i++) {
      const val = info.topScores[i];
      const isThisRun = info.rank === i + 1 && val === info.score;
      ctx.font = isThisRun ? 'bold 14px system-ui, sans-serif' : '13px system-ui, sans-serif';
      ctx.fillStyle = isThisRun ? '#ffffff' : '#9aa1b2';
      ctx.fillText(`${i + 1}.  ${val !== undefined ? val : '—'}`, cx, rowsStartY + i * rowH);
    }

    this.drawModalButton(ctx, layout.playAgainBtn.rect, 'PLAY AGAIN', true);
    this.drawModalButton(ctx, layout.titleBtn.rect, 'TITLE SCREEN', false);

    ctx.restore();
  },
};
