// ============================================================================
// board.js — pure board data (no drawing, no rules eval).
// Generates a regular-hexagon board of a given radius, tracks per-cell
// occupancy, computes the fit-to-canvas layout, and places starting tokens.
// ============================================================================

// A Board holds:
//   radius   — hex ring radius (2/3/4)
//   cells    — Map<hexKey, { q, r, owner }>  owner is BUBBLES | CRYSTALS | EMPTY
//   size     — computed pixel cell size (center-to-vertex)
//   origin   — pixel origin so the board is centered under the header
function createBoard(radius) {
  const cells = new Map();

  // Regular hexagon: all (q, r) with max(|q|, |r|, |s|) <= radius.
  for (let q = -radius; q <= radius; q++) {
    const rLo = Math.max(-radius, -q - radius);
    const rHi = Math.min(radius, -q + radius);
    for (let r = rLo; r <= rHi; r++) {
      cells.set(hexKey(q, r), { q, r, owner: EMPTY });
    }
  }

  const board = { radius, cells, size: 0, origin: { x: 0, y: 0 } };
  computeLayout(board);
  placeStartingTokens(board);
  return board;
}

function getCell(board, q, r) {
  return board.cells.get(hexKey(q, r));
}

function inBounds(board, q, r) {
  return board.cells.has(hexKey(q, r));
}

// Compute cell `size` and `origin` so the board's bounding box fits within the
// available area (canvas minus header minus margins), centered. Cell size is
// derived here — never hardcoded per board size.
function computeLayout(board) {
  const { radius } = board;

  // Bounding box of cell centers at unit size (size = 1), pointy-top.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cell of board.cells.values()) {
    const x = SQRT3 * (cell.q + cell.r / 2);
    const y = 1.5 * cell.r;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Add each hex's own half-extent: horizontal edge reach = sqrt(3)/2,
  // vertical vertex reach = 1 (at unit size).
  const unitW = (maxX - minX) + SQRT3;
  const unitH = (maxY - minY) + 2;

  const availW = CANVAS_W - 2 * LAYOUT.MARGIN;
  const availH = CANVAS_H - LAYOUT.HEADER_H - 2 * LAYOUT.MARGIN;

  board.size = Math.min(availW / unitW, availH / unitH);

  // Center the bounding box within the available area, offset below header.
  const boardW = unitW * board.size;
  const boardH = unitH * board.size;
  const boardLeft = LAYOUT.MARGIN + (availW - boardW) / 2;
  const boardTop = LAYOUT.HEADER_H + LAYOUT.MARGIN + (availH - boardH) / 2;

  // origin is the pixel position of axial (0,0). Center of unit bbox maps there.
  const centerUnitX = (minX + maxX) / 2;
  const centerUnitY = (minY + maxY) / 2;
  board.origin = {
    x: boardLeft + boardW / 2 - centerUnitX * board.size,
    y: boardTop + boardH / 2 - centerUnitY * board.size,
  };
}

// The 6 corners of the hexagonal board, in order around the ring.
function boardCorners(radius) {
  return [
    { q: radius, r: 0 },
    { q: 0, r: radius },
    { q: -radius, r: radius },
    { q: -radius, r: 0 },
    { q: 0, r: -radius },
    { q: radius, r: -radius },
  ];
}

// Start: 3 tokens per faction on alternating corners (6 corners, 3 each).
function placeStartingTokens(board) {
  const corners = boardCorners(board.radius);
  corners.forEach((c, i) => {
    const cell = getCell(board, c.q, c.r);
    if (cell) cell.owner = i % 2 === 0 ? BUBBLES : CRYSTALS;
  });
}

// Count tokens per faction.
function countTokens(board) {
  let bubbles = 0, crystals = 0, empty = 0;
  for (const cell of board.cells.values()) {
    if (cell.owner === BUBBLES) bubbles++;
    else if (cell.owner === CRYSTALS) crystals++;
    else empty++;
  }
  return { bubbles, crystals, empty };
}
