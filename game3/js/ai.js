// ============================================================================
// ai.js — the three AI tiers. Exposes chooseAIMove(board, faction, level)
// returning { from:{q,r}, to:{q,r} } (or null if no legal move).
//
//   Easy   — near-random among legal moves, biased toward clones (spreading),
//            depth-1 greedy on immediate token gain. No lookahead.
//   Normal — minimax + alpha-beta, depth 2-3.
//            heuristic = (own - enemy) + MOBILITY_WEIGHT * own_destination_count
//   Hard   — minimax + alpha-beta, depth 4-5, capped at ~1s wall-clock
//            (iterative deepening reduces depth on the fly to stay under it).
//            heuristic adds corner/edge control + an exposure penalty for own
//            tokens a jump-conversion could flip next turn.
//
// Internals use an index-based Int8Array board (0=empty, 1=Bubbles, 2=Crystals)
// with make/undo so the search never clones the board.
// ============================================================================

// ---- Tunable weights & depths (all AI knobs live here) ---------------------
const AI_MOBILITY_WEIGHT = 0.5;   // Normal & Hard: value per reachable empty
const AI_CORNER_WEIGHT   = 0.8;   // Hard: value per corner/edge control unit
const AI_EXPOSURE_WEIGHT = 0.6;   // Hard: penalty per own token exposed to a jump

const AI_DEPTH = { normal: 2, hard: 5 };  // max search plies per tier
const AI_TIME_MS = { normal: 700, hard: 1000 }; // wall-clock cap per move

// Normal is deliberately imperfect: this often it plays a random legal move
// instead of the minimax pick, narrowing the gap to Easy without matching Hard.
const AI_NORMAL_RANDOM_CHANCE = 0.3;

const AI_EASY_CLONE_BIAS = 1.6;   // Easy: multiplies a clone move's pick weight
const AI_EASY_GREEDY     = 0.5;   // Easy: how strongly immediate gain skews picks

const AI_WIN_SCORE = 1e6;         // magnitude for decided (terminal) positions

// Faction <-> internal side id.
const SIDE = { [BUBBLES]: 1, [CRYSTALS]: 2 };
const SIDE_FACTION = { 1: BUBBLES, 2: CRYSTALS };

const AI_TIMEOUT = { timeout: true };  // sentinel thrown to abort a deepening pass
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : 0);

// ---- Precomputed board geometry (cached per radius) ------------------------
const _geomCache = {};
let GG = null;  // active geometry for the current chooseAIMove call

function geometryFor(radius) {
  if (_geomCache[radius]) return _geomCache[radius];

  const cells = [];
  const keyToIdx = new Map();
  for (let q = -radius; q <= radius; q++) {
    const rLo = Math.max(-radius, -q - radius);
    const rHi = Math.min(radius, -q + radius);
    for (let r = rLo; r <= rHi; r++) {
      keyToIdx.set(q + ',' + r, cells.length);
      cells.push({ q, r });
    }
  }

  const N = cells.length;
  const nbr = [], jumps = [], destAll = [];
  const coeff = new Float32Array(N); // corner/edge control weight

  for (let i = 0; i < N; i++) {
    const { q, r } = cells[i];
    const nb = [];
    for (const d of HEX_DIRECTIONS) {
      const k = keyToIdx.get((q + d.q) + ',' + (r + d.r));
      if (k !== undefined) nb.push(k);
    }
    const jp = [];
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      if (hexDistance(q, r, cells[j].q, cells[j].r) === 2) jp.push(j);
    }
    nbr.push(nb);
    jumps.push(jp);
    destAll.push(nb.concat(jp));

    const s = -q - r;
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (ring === radius) {
      const isCorner =
        (Math.abs(q) === radius && Math.abs(r) === radius) ||
        (Math.abs(q) === radius && Math.abs(s) === radius) ||
        (Math.abs(r) === radius && Math.abs(s) === radius);
      coeff[i] = isCorner ? 2 : 1;
    }
  }

  const g = {
    radius, cells, keyToIdx, N,
    nbr, clones: nbr, jumps, destAll, coeff,
    mark: new Int32Array(N), ver: 0, // reusable stamp buffer for reach queries
  };
  _geomCache[radius] = g;
  return g;
}

// ---- Public entry ----------------------------------------------------------
function chooseAIMove(board, faction, level) {
  GG = geometryFor(board.radius);
  const me = SIDE[faction];

  // Snapshot the live board into the index model.
  const owner = new Int8Array(GG.N);
  const counts = [0, 0, 0];
  for (const cell of board.cells.values()) {
    const idx = GG.keyToIdx.get(hexKey(cell.q, cell.r));
    const s = cell.owner === BUBBLES ? 1 : cell.owner === CRYSTALS ? 2 : 0;
    owner[idx] = s;
    counts[s]++;
  }

  let mv;
  if (level === 'easy') {
    mv = easyMove(owner, me);
  } else if (level === 'normal' && Math.random() < AI_NORMAL_RANDOM_CHANCE) {
    // Occasional imperfection so Normal doesn't play optimally every move.
    mv = randomMove(owner, me);
  } else {
    const depth = level === 'hard' ? AI_DEPTH.hard : AI_DEPTH.normal;
    const timeMs = level === 'hard' ? AI_TIME_MS.hard : AI_TIME_MS.normal;
    mv = searchBest(owner, counts, me, level, depth, timeMs);
  }
  if (!mv) return null;

  return { from: GG.cells[mv.fromIdx], to: GG.cells[mv.toIdx] };
}

// A uniformly random legal move (used for Normal's occasional off-move).
function randomMove(owner, side) {
  const moves = genMoves(owner, side);
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// ---- Move generation -------------------------------------------------------
// Clone moves are deduped by target (all origins yield the same result); jump
// moves are kept per origin (the vacated origin changes the outcome).
function genMoves(owner, side) {
  const moves = [];
  const g = GG;
  g.ver++;
  const ver = g.ver, mark = g.mark;
  for (let i = 0; i < g.N; i++) {
    if (owner[i] !== side) continue;
    for (const j of g.clones[i]) {
      if (owner[j] === 0 && mark[j] !== ver) { mark[j] = ver; moves.push({ fromIdx: i, toIdx: j, type: 1 }); }
    }
    for (const j of g.jumps[i]) {
      if (owner[j] === 0) moves.push({ fromIdx: i, toIdx: j, type: 2 });
    }
  }
  return moves;
}

// Order by immediate conversions (then clones first) to sharpen alpha-beta.
function orderMoves(owner, moves, side) {
  const opp = 3 - side;
  for (const m of moves) {
    let c = 0;
    for (const k of GG.nbr[m.toIdx]) if (owner[k] === opp) c++;
    m.ord = c * 2 + (m.type === 1 ? 1 : 0);
  }
  moves.sort((a, b) => b.ord - a.ord);
}

// Apply a move in place; return an undo record.
function make(owner, counts, m, side) {
  const opp = 3 - side;
  const conv = [];
  if (m.type === 2) { owner[m.fromIdx] = 0; counts[side]--; }
  owner[m.toIdx] = side; counts[side]++;
  for (const k of GG.nbr[m.toIdx]) {
    if (owner[k] === opp) { owner[k] = side; counts[side]++; counts[opp]--; conv.push(k); }
  }
  return { type: m.type, fromIdx: m.fromIdx, toIdx: m.toIdx, conv };
}

function unmake(owner, counts, undo, side) {
  const opp = 3 - side;
  for (const k of undo.conv) { owner[k] = opp; counts[side]--; counts[opp]++; }
  owner[undo.toIdx] = 0; counts[side]--;
  if (undo.type === 2) { owner[undo.fromIdx] = side; counts[side]++; }
}

// ---- Easy: near-random, clone-biased, depth-1 greedy -----------------------
function easyMove(owner, me) {
  const moves = genMoves(owner, me);
  if (!moves.length) return null;

  const opp = 3 - me;
  let totalW = 0;
  const weights = new Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let conv = 0;
    for (const k of GG.nbr[m.toIdx]) if (owner[k] === opp) conv++;
    // Immediate token-count gain (own - enemy delta): clone adds a token (+1),
    // each conversion swings the differential by 2.
    const gain = (m.type === 1 ? 1 : 0) + 2 * conv;
    let w = 1 + AI_EASY_GREEDY * gain;
    if (m.type === 1) w *= AI_EASY_CLONE_BIAS;
    weights[i] = w;
    totalW += w;
  }

  let pick = Math.random() * totalW;
  for (let i = 0; i < moves.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

// ---- Normal / Hard: minimax + alpha-beta, iterative deepening --------------
function searchBest(owner, counts, me, level, maxDepth, timeMs) {
  const moves = genMoves(owner, me);
  if (!moves.length) return null;
  orderMoves(owner, moves, me);

  let best = moves[0];
  const deadline = perfNow() + timeMs;

  for (let d = 1; d <= maxDepth; d++) {
    let localBest = null, localScore = -Infinity, alpha = -Infinity;
    try {
      for (const m of moves) {
        const undo = make(owner, counts, m, me);
        const v = minimax(owner, counts, 3 - me, d - 1, alpha, Infinity, me, level, deadline);
        unmake(owner, counts, undo, me);
        if (v > localScore) { localScore = v; localBest = m; }
        if (v > alpha) alpha = v;
      }
    } catch (e) {
      if (e === AI_TIMEOUT) return best; // ran out of time: keep last full depth
      throw e;
    }
    best = localBest;
    // Re-order root moves best-first so the next, deeper pass prunes harder.
    moves.sort((a, b) => (b === localBest) - (a === localBest));
    if (localScore >= AI_WIN_SCORE) break; // forced win found
  }
  return best;
}

function minimax(owner, counts, side, depth, alpha, beta, me, level, deadline) {
  if (perfNow() > deadline) throw AI_TIMEOUT;
  if (depth === 0) return evaluate(owner, counts, me, level);

  const moves = genMoves(owner, side);
  if (moves.length === 0) return terminalValue(counts, side, me);
  orderMoves(owner, moves, side);

  if (side === me) {
    let best = -Infinity;
    for (const m of moves) {
      const undo = make(owner, counts, m, side);
      const v = minimax(owner, counts, 3 - side, depth - 1, alpha, beta, me, level, deadline);
      unmake(owner, counts, undo, side);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const undo = make(owner, counts, m, side);
      const v = minimax(owner, counts, 3 - side, depth - 1, alpha, beta, me, level, deadline);
      unmake(owner, counts, undo, side);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

// `side` (to move) has no legal move: game ends, the other side fills empties.
function terminalValue(counts, side, me) {
  const opp = 3 - side;
  const empties = GG.N - counts[1] - counts[2];
  const meFinal = counts[me] + (opp === me ? empties : 0);
  const oppSide = 3 - me;
  const oppFinal = counts[oppSide] + (opp === oppSide ? empties : 0);
  const diff = meFinal - oppFinal;
  if (diff > 0) return AI_WIN_SCORE + diff;
  if (diff < 0) return -AI_WIN_SCORE + diff;
  return 0;
}

// ---- Heuristics ------------------------------------------------------------
function evaluate(owner, counts, me, level) {
  const opp = 3 - me;
  let score = counts[me] - counts[opp];

  if (level === 'normal' || level === 'hard') {
    score += AI_MOBILITY_WEIGHT * reachCount(owner, me);
  }
  if (level === 'hard') {
    score += AI_CORNER_WEIGHT * cornerEdgeDiff(owner, me);
    score -= AI_EXPOSURE_WEIGHT * exposedCount(owner, me);
  }
  return score;
}

// Distinct empty cells `side` can reach (clone or jump) — a mobility proxy.
function reachCount(owner, side) {
  const g = GG;
  g.ver++;
  const ver = g.ver, mark = g.mark;
  let c = 0;
  for (let i = 0; i < g.N; i++) {
    if (owner[i] !== side) continue;
    for (const j of g.destAll[i]) {
      if (owner[j] === 0 && mark[j] !== ver) { mark[j] = ver; c++; }
    }
  }
  return c;
}

// Corner/edge control: own control weight minus enemy's.
function cornerEdgeDiff(owner, me) {
  const opp = 3 - me;
  let d = 0;
  const { N, coeff } = GG;
  for (let i = 0; i < N; i++) {
    if (coeff[i] === 0) continue;
    if (owner[i] === me) d += coeff[i];
    else if (owner[i] === opp) d -= coeff[i];
  }
  return d;
}

// Count own tokens adjacent to an empty cell the enemy can land on next turn
// (i.e., tokens a jump/clone-conversion could flip).
function exposedCount(owner, me) {
  const opp = 3 - me;
  const g = GG;
  g.ver++;
  const ver = g.ver, mark = g.mark;
  // Mark every empty cell the enemy can reach.
  for (let i = 0; i < g.N; i++) {
    if (owner[i] !== opp) continue;
    for (const j of g.destAll[i]) if (owner[j] === 0) mark[j] = ver;
  }
  let exposed = 0;
  for (let i = 0; i < g.N; i++) {
    if (owner[i] !== me) continue;
    for (const k of g.nbr[i]) {
      if (owner[k] === 0 && mark[k] === ver) { exposed++; break; }
    }
  }
  return exposed;
}
