// Pure well data: grid init, random token generation, match detection,
// gravity/column-collapse, garbage-row insertion, and the layout math that
// centers the well within the fixed 800x600 canvas.

const Board = {
  // Well is centered in the full game window; the stats/next panels simply
  // occupy whatever space is left on either side, so they stay symmetric.
  computeLayout(canvasW, canvasH) {
    const availH = canvasH - LAYOUT.TOP_MARGIN - LAYOUT.BOTTOM_MARGIN;
    const cellSize = Math.floor(availH / WELL.ROWS);
    const wellH = cellSize * WELL.ROWS;
    const wellW = cellSize * WELL.COLS;
    const wellX = Math.round((canvasW - wellW) / 2);
    const wellY = LAYOUT.TOP_MARGIN;

    const statsPanel = {
      x: LAYOUT.PANEL_GAP,
      y: wellY,
      w: wellX - LAYOUT.PANEL_GAP * 2,
      h: wellH,
    };
    const nextPanel = {
      x: wellX + wellW + LAYOUT.PANEL_GAP,
      y: wellY,
      w: canvasW - (wellX + wellW) - LAYOUT.PANEL_GAP * 2,
      h: wellH,
    };

    return { canvasW, canvasH, cellSize, wellX, wellY, wellW, wellH, statsPanel, nextPanel };
  },

  // Multiplayer splits the canvas into two zones (no stats panel — just a
  // next-piece preview per CLAUDE.md's Multiplayer scope): P1's well sits
  // toward the left edge with its preview inward toward center, mirrored
  // for P2, so both previews flank the center divide symmetrically.
  computeMultiplayerLayout(canvasW, canvasH) {
    const availH = canvasH - LAYOUT.TOP_MARGIN - LAYOUT.BOTTOM_MARGIN;
    const cellSize = Math.floor(availH / WELL.ROWS);
    const wellH = cellSize * WELL.ROWS;
    const wellW = cellSize * WELL.COLS;
    const wellY = LAYOUT.TOP_MARGIN;
    const gap = LAYOUT.PANEL_GAP;
    const panelW = 130;
    const zoneW = canvasW / 2;
    const pad = (zoneW - (wellW + gap + panelW)) / 2;

    const p1WellX = pad;
    const p1PanelX = p1WellX + wellW + gap;
    const p2PanelX = zoneW + pad;
    const p2WellX = p2PanelX + panelW + gap;

    const make = (wellX, panelX, label, groupLeft, groupRight) => ({
      wellX, wellY, wellW, wellH, cellSize,
      nextPanel: { x: panelX, y: wellY, w: panelW, h: wellH },
      label,
      labelCenterX: (groupLeft + groupRight) / 2,
    });

    return {
      p1: make(p1WellX, p1PanelX, 'PLAYER 1', p1WellX, p1PanelX + panelW),
      p2: make(p2WellX, p2PanelX, 'PLAYER 2', p2PanelX, p2WellX + wellW),
    };
  },

  createGrid() {
    return Array.from({ length: WELL.ROWS }, () => Array(WELL.COLS).fill(null));
  },

  // Which color IDs are in play for a match. Normally just the first N of
  // COLOR_IDS (order doesn't matter for the generic tilesets) — but the
  // Elements tileset's 6 designs are named, distinct concepts, so at 4/5
  // variety CLAUDE.md calls for a *random* subset of the six, chosen once
  // per match rather than always the same fixed 4/5.
  pickActiveColors(varietyCount, tilesetId) {
    const n = Math.max(1, Math.min(COLOR_IDS.length, varietyCount || TOKEN_VARIETY.DEFAULT));
    if (tilesetId === 'elements' && n < COLOR_IDS.length) {
      const shuffled = COLOR_IDS.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, n);
    }
    return COLOR_IDS.slice(0, n);
  },

  randomToken(activeColors) {
    const colors = activeColors && activeColors.length ? activeColors : COLOR_IDS.slice(0, TOKEN_VARIETY.DEFAULT);
    const id = colors[Math.floor(Math.random() * colors.length)];
    return { color: id, seed: Math.random() };
  },

  // Every straight line worth checking for a run: each row, each column,
  // and every diagonal in both directions (\  and  /). Coordinates only
  // depend on WELL's fixed size, so this is built once and cached.
  _lines: null,
  buildLines() {
    const lines = [];

    for (let r = 0; r < WELL.ROWS; r++) {
      const line = [];
      for (let c = 0; c < WELL.COLS; c++) line.push([r, c]);
      lines.push(line);
    }
    for (let c = 0; c < WELL.COLS; c++) {
      const line = [];
      for (let r = 0; r < WELL.ROWS; r++) line.push([r, c]);
      lines.push(line);
    }

    // diagonal \ (down-right): starts along the top row + left column
    const startsDR = [];
    for (let c = 0; c < WELL.COLS; c++) startsDR.push([0, c]);
    for (let r = 1; r < WELL.ROWS; r++) startsDR.push([r, 0]);
    startsDR.forEach(([r0, c0]) => {
      const line = [];
      for (let r = r0, c = c0; r < WELL.ROWS && c < WELL.COLS; r++, c++) line.push([r, c]);
      if (line.length >= 3) lines.push(line);
    });

    // diagonal / (down-left): starts along the top row + right column
    const startsDL = [];
    for (let c = 0; c < WELL.COLS; c++) startsDL.push([0, c]);
    for (let r = 1; r < WELL.ROWS; r++) startsDL.push([r, WELL.COLS - 1]);
    startsDL.forEach(([r0, c0]) => {
      const line = [];
      for (let r = r0, c = c0; r < WELL.ROWS && c >= 0; r++, c--) line.push([r, c]);
      if (line.length >= 3) lines.push(line);
    });

    return lines;
  },

  getLines() {
    if (!this._lines) this._lines = this.buildLines();
    return this._lines;
  },

  // Walks one line (row, column, or diagonal) looking for maximal runs of
  // length >= 3 of the same color, adding every matched cell to `matched`.
  scanLine(line, grid, matched) {
    let i = 0;
    while (i < line.length) {
      const [r, c] = line[i];
      const token = grid[r][c];
      if (!token) { i++; continue; }
      let j = i + 1;
      while (j < line.length) {
        const [rr, cc] = line[j];
        const next = grid[rr][cc];
        if (!next || next.color !== token.color) break;
        j++;
      }
      if (j - i >= 3) for (let k = i; k < j; k++) matched.add(line[k][0] + ',' + line[k][1]);
      i = j;
    }
  },

  // Returns a Set of "row,col" keys for every cell that belongs to a
  // straight-line run of length >= 3 — row, column, or diagonal. A cell
  // matched by more than one line is still only removed once.
  scanMatches(grid) {
    const matched = new Set();
    this.getLines().forEach((line) => this.scanLine(line, grid, matched));
    return matched;
  },

  // Removes the matched cells and compacts each column, same as before —
  // but also reports which surviving tokens changed row, so the caller can
  // animate the drop instead of teleporting them to their final resting row.
  removeAndCollapse(grid, matchedSet) {
    for (const key of matchedSet) {
      const [r, c] = key.split(',').map(Number);
      grid[r][c] = null;
    }
    const moves = [];
    for (let c = 0; c < WELL.COLS; c++) {
      const survivors = [];
      for (let r = 0; r < WELL.ROWS; r++) if (grid[r][c]) survivors.push({ token: grid[r][c], fromRow: r });
      for (let r = 0; r < WELL.ROWS; r++) grid[r][c] = null;
      let writeRow = WELL.ROWS - 1;
      for (let i = survivors.length - 1; i >= 0; i--, writeRow--) {
        grid[writeRow][c] = survivors[i].token;
        if (writeRow !== survivors[i].fromRow) {
          moves.push({ col: c, fromRow: survivors[i].fromRow, toRow: writeRow, token: survivors[i].token });
        }
      }
    }
    return moves;
  },

  // Inserts one full row of random tokens at the bottom, shifting the rest
  // of the well's settled content up by one row.
  insertGarbageRow(grid, activeColors) {
    grid.shift();
    grid.push(Array.from({ length: WELL.COLS }, () => this.randomToken(activeColors)));
  },
};
