// ============================================================================
// rules.js — game rules: move generation, move application, conversion.
// Pure functions over a board; no rendering, no input, no AI heuristics.
// (Win-condition resolution & turn orchestration land in game.js / a later step.)
// ============================================================================

const CLONE_DIST = 1;
const JUMP_DIST = 2;

const OPPONENT = { [BUBBLES]: CRYSTALS, [CRYSTALS]: BUBBLES };

// All legal destinations for the token at (q, r): empty cells at distance 1
// (clone) or distance 2 (jump). Returns [{ q, r, type }].
function legalDestinations(board, q, r) {
  const dests = [];
  const seen = new Set();
  // Distance-1 and distance-2 cells are exactly those reachable by stepping
  // through the neighbor ring once or twice; iterate the bounded window.
  for (let dq = -JUMP_DIST; dq <= JUMP_DIST; dq++) {
    for (let dr = -JUMP_DIST; dr <= JUMP_DIST; dr++) {
      const tq = q + dq;
      const tr = r + dr;
      const dist = hexDistance(q, r, tq, tr);
      if (dist !== CLONE_DIST && dist !== JUMP_DIST) continue;
      const cell = getCell(board, tq, tr);
      if (!cell || cell.owner !== EMPTY) continue;
      const k = hexKey(tq, tr);
      if (seen.has(k)) continue;
      seen.add(k);
      dests.push({ q: tq, r: tr, type: dist === CLONE_DIST ? 'clone' : 'jump' });
    }
  }
  return dests;
}

// Does `faction` have at least one legal move anywhere on the board?
function hasLegalMove(board, faction) {
  for (const cell of board.cells.values()) {
    if (cell.owner !== faction) continue;
    if (legalDestinations(board, cell.q, cell.r).length > 0) return true;
  }
  return false;
}

// Every legal move for `faction`: [{ from:{q,r}, to:{q,r}, type }].
function allLegalMoves(board, faction) {
  const moves = [];
  for (const cell of board.cells.values()) {
    if (cell.owner !== faction) continue;
    for (const d of legalDestinations(board, cell.q, cell.r)) {
      moves.push({ from: { q: cell.q, r: cell.r }, to: { q: d.q, r: d.r }, type: d.type });
    }
  }
  return moves;
}

// Fill every empty cell with `faction` (end-of-game board resolution).
// Returns the list of newly filled cells (for a landing/flash animation later).
function fillEmptyCells(board, faction) {
  const filled = [];
  for (const cell of board.cells.values()) {
    if (cell.owner === EMPTY) {
      cell.owner = faction;
      filled.push({ q: cell.q, r: cell.r });
    }
  }
  return filled;
}

// Apply a move (assumed legal). Clone leaves the origin; jump vacates it.
// After landing, enemy tokens adjacent to the destination convert to `faction`.
// Returns { placed:{q,r}, converted:[{q,r}], type } for animation/eval use.
function applyMove(board, from, to, faction) {
  const type = hexDistance(from.q, from.r, to.q, to.r) === CLONE_DIST ? 'clone' : 'jump';

  if (type === 'jump') {
    const src = getCell(board, from.q, from.r);
    if (src) src.owner = EMPTY;
  }

  const dest = getCell(board, to.q, to.r);
  dest.owner = faction;

  const enemy = OPPONENT[faction];
  const converted = [];
  for (const n of hexNeighbors(to.q, to.r)) {
    const c = getCell(board, n.q, n.r);
    if (c && c.owner === enemy) {
      c.owner = faction;
      converted.push({ q: n.q, r: n.r });
    }
  }

  return { placed: { q: to.q, r: to.r }, converted, type };
}
