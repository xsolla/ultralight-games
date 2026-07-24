// Pure game rules: scoring formula, garbage-row calculation, top-out check.
// The chain-resolve pass itself (scan -> flash -> explode -> fall -> rescan)
// is driven by Game as a timed state machine, since it now plays out over
// real time rather than resolving instantly; see Game.updateResolve.

const Rules = {
  // score(N): tiles 1..TIER_SIZE worth 1pt each, next TIER_SIZE worth 2pt
  // each, and so on. Closed form: g full groups + remainder r.
  scoreForChain(N) {
    const T = SCORE.TIER_SIZE;
    if (N < T) return 0;
    const g = Math.floor(N / T);
    const r = N - T * g;
    return (T * g * (g + 1)) / 2 + r * (g + 1);
  },

  garbageRowsFor(N) {
    return N > GARBAGE.THRESHOLD ? Math.floor((N - GARBAGE.THRESHOLD) / GARBAGE.STEP) : 0;
  },

  isTopOut(grid, spawnCol) {
    return !!grid[0][spawnCol];
  },
};
