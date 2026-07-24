// Pure falling-piece logic: spawn, legal left/right movement, cycle
// up/down, natural per-tick fall step, hard-drop resolution, lock test.
// `piece.row` is the row of the piece's TOP token; it starts negative
// (above the well) and increases as the piece descends.

const PieceLogic = {
  // activeColors: the match's active color-id list (see
  // Board.pickActiveColors) — usually the first N of COLOR_IDS, but a
  // random subset for the Elements tileset at 4/5 variety.
  spawn(activeColors) {
    return {
      col: PIECE.SPAWN_COL,
      row: PIECE.SPAWN_ROW,
      tokens: [
        Board.randomToken(activeColors),
        Board.randomToken(activeColors),
        Board.randomToken(activeColors),
      ],
    };
  },

  // Rows above the grid (row < 0) are always passable; rows/cols outside
  // the well are blocked; otherwise blocked only if the cell is occupied.
  cellBlocked(grid, col, row) {
    if (col < 0 || col >= WELL.COLS) return true;
    if (row >= WELL.ROWS) return true;
    if (row < 0) return false;
    return !!grid[row][col];
  },

  canMoveTo(grid, piece, dCol) {
    const newCol = piece.col + dCol;
    for (let i = 0; i < PIECE.LENGTH; i++) {
      if (this.cellBlocked(grid, newCol, piece.row + i)) return false;
    }
    return true;
  },

  moveLeft(grid, piece) {
    if (this.canMoveTo(grid, piece, -1)) piece.col -= 1;
  },

  moveRight(grid, piece) {
    if (this.canMoveTo(grid, piece, 1)) piece.col += 1;
  },

  // top -> bottom, middle -> top, bottom -> middle
  cycleUp(piece) {
    const [a, b, c] = piece.tokens;
    piece.tokens = [b, c, a];
  },

  // reverse of cycleUp
  cycleDown(piece) {
    const [a, b, c] = piece.tokens;
    piece.tokens = [c, a, b];
  },

  canFall(grid, piece) {
    for (let i = 0; i < PIECE.LENGTH; i++) {
      if (this.cellBlocked(grid, piece.col, piece.row + i + 1)) return false;
    }
    return true;
  },

  stepFall(piece) {
    piece.row += 1;
  },

  hardDrop(grid, piece) {
    while (this.canFall(grid, piece)) piece.row += 1;
  },

  lock(grid, piece) {
    for (let i = 0; i < PIECE.LENGTH; i++) {
      const row = piece.row + i;
      if (row >= 0 && row < WELL.ROWS) grid[row][piece.col] = piece.tokens[i];
    }
  },
};
