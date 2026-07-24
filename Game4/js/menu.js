// Title screen: mode picker, token-variety picker, tileset picker, Play
// button — and their hit-testable button rects. Operates in the same fixed
// 800x600 logical space as everything else; Game forwards clicks/keys to it
// while Game.screen === 'menu'.
//
// All 4 tilesets are actually implemented now (see tilesets.js) — every
// option in the picker below uses its real per-token renderer.

const Menu = {
  selectedVariety: TOKEN_VARIETY.DEFAULT,
  selectedTileset: 'blobs',
  selectedMode: 'single',

  // "How To" popup state — 2 pages: controls, then match rules.
  showHowTo: false,
  howToPage: 0,
  HOWTO_PAGE_COUNT: 2,

  TILESET_INFO: [
    { id: 'crystals', label: 'Crystals', enabled: true },
    { id: 'blobs', label: 'Blobs', enabled: true },
    { id: 'dice', label: 'Dice', enabled: true },
    { id: 'elements', label: 'Elements', enabled: true },
  ],

  _layout: null,

  // All coordinates are static for the fixed 800x600 logical canvas, so the
  // layout is computed once and cached.
  getLayout() {
    if (this._layout) return this._layout;

    const modeBtnW = 260, modeBtnH = 54, modeGap = 20;
    const modeRowW = modeBtnW * 2 + modeGap;
    const modeX = (CANVAS_W - modeRowW) / 2;
    const modeY = 114;
    const modeButtons = [
      { id: 'mode-single', kind: 'mode', value: 'single', label: 'SINGLE PLAYER', disabled: false,
        rect: { x: modeX, y: modeY, w: modeBtnW, h: modeBtnH } },
      { id: 'mode-multi', kind: 'mode', value: 'multi', label: 'MULTIPLAYER', disabled: false,
        rect: { x: modeX + modeBtnW + modeGap, y: modeY, w: modeBtnW, h: modeBtnH } },
    ];

    const varBtnSize = 64, varGap = 18;
    const varietyY = 224;
    const varietyRowW = TOKEN_VARIETY.OPTIONS.length * varBtnSize + (TOKEN_VARIETY.OPTIONS.length - 1) * varGap;
    const varietyX = (CANVAS_W - varietyRowW) / 2;
    const varietyButtons = TOKEN_VARIETY.OPTIONS.map((v, i) => ({
      id: 'variety-' + v, kind: 'variety', value: v, label: String(v), disabled: false,
      rect: { x: varietyX + i * (varBtnSize + varGap), y: varietyY, w: varBtnSize, h: varBtnSize },
    }));

    const tileBtnW = 160, tileBtnH = 120, tileGap = 18;
    const tilesetY = 346;
    const tilesetRowW = this.TILESET_INFO.length * tileBtnW + (this.TILESET_INFO.length - 1) * tileGap;
    const tilesetX = (CANVAS_W - tilesetRowW) / 2;
    const tilesetButtons = this.TILESET_INFO.map((t, i) => ({
      id: 'tileset-' + t.id, kind: 'tileset', value: t.id, label: t.label, disabled: !t.enabled,
      rect: { x: tilesetX + i * (tileBtnW + tileGap), y: tilesetY, w: tileBtnW, h: tileBtnH },
    }));

    const playW = 220, playH = 58;
    const playButton = {
      id: 'play', kind: 'play', value: null, label: 'PLAY', disabled: false,
      rect: { x: (CANVAS_W - playW) / 2, y: 504, w: playW, h: playH },
    };

    const howToBtnW = 116, howToBtnH = 40, howToMargin = 18;
    const howToButton = {
      id: 'howto', kind: 'howto', value: null, label: 'HOW TO PLAY', disabled: false,
      rect: {
        x: CANVAS_W - howToMargin - howToBtnW,
        y: CANVAS_H - howToMargin - howToBtnH,
        w: howToBtnW, h: howToBtnH,
      },
    };

    this._layout = { modeButtons, varietyButtons, tilesetButtons, playButton, howToButton };
    return this._layout;
  },

  // Static center-panel layout for the How To popup — also fixed 800x600
  // logical coordinates, cached the same way as the main menu layout.
  _howToLayout: null,
  getHowToLayout() {
    if (this._howToLayout) return this._howToLayout;

    const panelW = 560, panelH = 420;
    const panelX = (CANVAS_W - panelW) / 2;
    const panelY = (CANVAS_H - panelH) / 2;

    const closeBtn = { rect: { x: panelX + panelW - 46, y: panelY + 14, w: 30, h: 30 } };
    const navBtnW = 110, navBtnH = 42;
    const navY = panelY + panelH - 58;
    const prevBtn = { rect: { x: panelX + 24, y: navY, w: navBtnW, h: navBtnH } };
    const nextBtn = { rect: { x: panelX + panelW - 24 - navBtnW, y: navY, w: navBtnW, h: navBtnH } };

    this._howToLayout = { panelX, panelY, panelW, panelH, closeBtn, prevBtn, nextBtn };
    return this._howToLayout;
  },

  hitTest(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  },

  // x, y are logical (800x600) coordinates. Returns true if something was hit.
  handleClick(x, y) {
    if (this.showHowTo) return this.handleHowToClick(x, y);

    for (const b of this.buttonsList()) {
      if (b.disabled) continue;
      if (this.hitTest(x, y, b.rect)) {
        this.activate(b);
        return true;
      }
    }
    return false;
  },

  handleHowToClick(x, y) {
    const hl = this.getHowToLayout();
    if (this.hitTest(x, y, hl.closeBtn.rect)) { Sound.play('ui_click'); this.showHowTo = false; return true; }
    if (this.hitTest(x, y, hl.prevBtn.rect)) { Sound.play('ui_click'); this.prevPage(); return true; }
    if (this.hitTest(x, y, hl.nextBtn.rect)) { Sound.play('ui_click'); this.nextPage(); return true; }
    if (!this.hitTest(x, y, { x: hl.panelX, y: hl.panelY, w: hl.panelW, h: hl.panelH })) {
      this.showHowTo = false; // click outside the panel dismisses it
    }
    return true; // swallow the click either way so it never reaches the menu behind it
  },

  prevPage() {
    if (this.howToPage > 0) this.howToPage--;
  },

  nextPage() {
    if (this.howToPage < this.HOWTO_PAGE_COUNT - 1) this.howToPage++;
    else this.showHowTo = false; // "next" on the last page closes it
  },

  buttonsList() {
    const l = this.getLayout();
    return [...l.modeButtons, ...l.varietyButtons, ...l.tilesetButtons, l.playButton, l.howToButton];
  },

  activate(b) {
    Sound.play('ui_click');
    if (b.kind === 'variety') this.selectedVariety = b.value;
    else if (b.kind === 'tileset') this.selectedTileset = b.value;
    else if (b.kind === 'mode') this.selectedMode = b.value;
    else if (b.kind === 'howto') { this.showHowTo = true; this.howToPage = 0; }
    else if (b.kind === 'play') {
      if (this.selectedMode === 'multi') Game.startMultiplayer();
      else Game.startSinglePlayer();
    }
  },

  render(ctx, timeMs) {
    const layout = this.getLayout();

    Renderer.drawBackground(ctx);
    Ambiance.draw(ctx, timeMs);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f7fb';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('XSOLLA CASCADIA', CANVAS_W / 2, 60);

    this.drawSectionLabel(ctx, 'MODE', 98);
    layout.modeButtons.forEach((b) => this.drawFlatButton(ctx, b, b.value === this.selectedMode));

    this.drawSectionLabel(ctx, 'TOKEN VARIETY', 208);
    layout.varietyButtons.forEach((b) => this.drawVarietyButton(ctx, b));

    this.drawSectionLabel(ctx, 'TILESET', 332);
    layout.tilesetButtons.forEach((b) => this.drawTilesetButton(ctx, b, timeMs));

    this.drawFlatButton(ctx, layout.playButton, false, true);

    ctx.fillStyle = '#5b6272';
    ctx.font = '12px system-ui, sans-serif';
    const p = layout.playButton.rect;
    ctx.fillText('Click Play, or press Enter / Space', CANVAS_W / 2, p.y + p.h + 24);

    this.drawFlatButton(ctx, layout.howToButton, false, false);

    if (this.showHowTo) this.renderHowTo(ctx);
  },

  renderHowTo(ctx) {
    const hl = this.getHowToLayout();

    ctx.save();
    ctx.fillStyle = 'rgba(5, 6, 10, 0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    Renderer.roundRect(ctx, hl.panelX, hl.panelY, hl.panelW, hl.panelH, 16);
    const grad = ctx.createLinearGradient(0, hl.panelY, 0, hl.panelY + hl.panelH);
    grad.addColorStop(0, '#171b28');
    grad.addColorStop(1, '#0c0e15');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // close (x)
    const cr = hl.closeBtn.rect;
    Renderer.roundRect(ctx, cr.x, cr.y, cr.w, cr.h, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c7cbd6';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('✕', cr.x + cr.w / 2, cr.y + cr.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    // title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f7fb';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(this.howToPage === 0 ? 'CONTROLS' : 'HOW TO PLAY', hl.panelX + hl.panelW / 2, hl.panelY + 42);

    if (this.howToPage === 0) this.renderControlsPage(ctx, hl);
    else this.renderMatchRulesPage(ctx, hl);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5b6272';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${this.howToPage + 1} / ${this.HOWTO_PAGE_COUNT}`, hl.panelX + hl.panelW / 2, hl.panelY + hl.panelH - 70);

    this.drawNavButton(ctx, hl.prevBtn.rect, 'PREV', this.howToPage > 0);
    this.drawNavButton(ctx, hl.nextBtn.rect, this.howToPage < this.HOWTO_PAGE_COUNT - 1 ? 'NEXT' : 'GOT IT', true);

    ctx.restore();
  },

  drawNavButton(ctx, r, label, enabled) {
    ctx.save();
    Renderer.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = enabled ? 'rgba(79, 140, 255, 0.22)' : 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = enabled ? 'rgba(79, 140, 255, 0.6)' : 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = enabled ? '#e7eaf2' : '#4b515f';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  renderControlsPage(ctx, hl) {
    const rows = [
      ['Move Left', 'A  (P2: ←)'],
      ['Move Right', 'D  (P2: →)'],
      ['Cycle Up', 'W  (P2: ↑)'],
      ['Cycle Down', 'S  (P2: ↓)'],
      ['Hard Drop', 'Space  (P2: Enter)'],
      ['Mouse', 'Drag/double-click (SP or P1 only)'],
    ];
    const leftX = hl.panelX + 40;
    const rightX = hl.panelX + hl.panelW - 40;
    const startY = hl.panelY + 78;
    const rowH = 32;

    ctx.save();
    ctx.textBaseline = 'middle';
    rows.forEach(([label, val], i) => {
      const y = startY + i * rowH;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(label, leftX, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e7eaf2';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(val, rightX, y);
    });
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  renderMatchRulesPage(ctx, hl) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c7cbd6';
    ctx.font = '13px system-ui, sans-serif';
    this.wrapText(
      ctx,
      'Line up 3 or more tiles of the same type and they explode — it counts whether '
      + 'they’re arranged horizontally, vertically, or diagonally.',
      hl.panelX + hl.panelW / 2, hl.panelY + 78, hl.panelW - 80, 19
    );

    const demoSize = 86;
    const gap = 40;
    const totalW = demoSize * 3 + gap * 2;
    const startX = hl.panelX + hl.panelW / 2 - totalW / 2;
    const demoY = hl.panelY + 150;

    const demos = [
      { kind: 'row', label: 'Horizontal', cx: startX + demoSize / 2 },
      { kind: 'col', label: 'Vertical', cx: startX + demoSize + gap + demoSize / 2 },
      { kind: 'diag', label: 'Diagonal (either way)', cx: startX + 2 * (demoSize + gap) + demoSize / 2 },
    ];
    demos.forEach((d) => {
      this.drawMiniLineDemo(ctx, d.cx, demoY + demoSize / 2, demoSize, d.kind);
      ctx.fillStyle = '#8b93a7';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(d.label, d.cx, demoY + demoSize + 20);
    });
    ctx.restore();
  },

  wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
  },

  // A tiny 3x3 grid with 3 dots highlighted along the given line direction —
  // enough to show what "3 in a row" means without a full worked example.
  drawMiniLineDemo(ctx, cx, cy, size, kind) {
    const cell = size / 3;
    const gridX = cx - size / 2;
    const gridY = cy - size / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(gridX + i * cell, gridY);
      ctx.lineTo(gridX + i * cell, gridY + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + i * cell);
      ctx.lineTo(gridX + size, gridY + i * cell);
      ctx.stroke();
    }

    let cells;
    if (kind === 'row') cells = [[1, 0], [1, 1], [1, 2]];
    else if (kind === 'col') cells = [[0, 1], [1, 1], [2, 1]];
    else cells = [[0, 0], [1, 1], [2, 2]];

    cells.forEach(([r, c]) => {
      const ccx = gridX + c * cell + cell / 2;
      const ccy = gridY + r * cell + cell / 2;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
      ctx.arc(ccx, ccy, cell * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = COLORS.cyan;
      ctx.arc(ccx, ccy, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  },

  drawSectionLabel(ctx, text, y) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5b6272';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(text, CANVAS_W / 2, y);
    ctx.restore();
  },

  drawFlatButton(ctx, b, selected, primary) {
    const r = b.rect;
    ctx.save();
    Renderer.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    if (b.disabled) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    } else if (primary) {
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, '#4f8cff');
      grad.addColorStop(1, '#2f5fd6');
      ctx.fillStyle = grad;
    } else if (selected) {
      ctx.fillStyle = 'rgba(79, 140, 255, 0.18)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    }
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? 'rgba(79, 140, 255, 0.8)' : 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = b.disabled ? '#4b515f' : primary ? '#ffffff' : '#e7eaf2';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 - (b.disabled ? 7 : 0));

    if (b.disabled) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#7d8798';
      ctx.fillText('COMING SOON', r.x + r.w / 2, r.y + r.h / 2 + 12);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  drawVarietyButton(ctx, b) {
    const r = b.rect;
    const selected = b.value === this.selectedVariety;
    ctx.save();
    Renderer.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = selected ? 'rgba(79, 140, 255, 0.22)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? 'rgba(79, 140, 255, 0.85)' : 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = selected ? '#ffffff' : '#c7cbd6';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(String(b.value), r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  drawTilesetButton(ctx, b, timeMs) {
    const r = b.rect;
    const selected = !b.disabled && b.value === this.selectedTileset;
    ctx.save();
    Renderer.roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = b.disabled
      ? 'rgba(255, 255, 255, 0.03)'
      : selected ? 'rgba(79, 140, 255, 0.18)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? 'rgba(79, 140, 255, 0.85)' : 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    if (b.disabled) ctx.globalAlpha = 0.4;
    this.drawTilesetIcon(ctx, b.value, r.x + r.w / 2, r.y + 44, 34, timeMs);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = b.disabled ? '#5b6272' : '#e7eaf2';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h - 28);

    if (b.disabled) {
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = '#7d8798';
      ctx.fillText('SOON', r.x + r.w / 2, r.y + r.h - 12);
    }
    ctx.restore();
  },

  // All 4 use their real tileset renderer now.
  drawTilesetIcon(ctx, id, cx, cy, size, timeMs) {
    if (id === 'blobs') {
      Tilesets.blobs.drawToken(ctx, cx - size / 2, cy - size / 2, size, { color: 'blue', seed: 0.15 }, timeMs);
      return;
    }
    if (id === 'crystals') {
      Tilesets.crystals.drawToken(ctx, cx - size / 2, cy - size / 2, size, { color: 'cyan', seed: 0.4 }, timeMs);
      return;
    }
    if (id === 'dice') {
      Tilesets.dice.drawToken(ctx, cx - size / 2, cy - size / 2, size, { color: 'yellow', seed: 0 }, timeMs);
      return;
    }
    if (id === 'elements') {
      Tilesets.elements.drawToken(ctx, cx - size / 2, cy - size / 2, size, { color: 'red', seed: 0.3 }, timeMs);
      return;
    }
  },

};
