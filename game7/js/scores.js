// ============================================================================
// scores.js — the local records table: persistence and the ordering rule. A
// namespace with state; it does not draw (menu.js draws the card), does not own
// screen state (game.js does), and knows nothing about how a run ended — it is
// handed a result and reports where it landed.
//
// A result is { wave, kills }, ranked by highest wave reached with kills as the
// tiebreak (CLAUDE.md §7.10). Shape from game6 and game1: one namespaced
// localStorage key, and every access wrapped, so private-browsing mode degrades
// to a non-persistent session instead of throwing.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
const SCORES_KEY = 'planetdefense_scores';   // namespaced: the repo shares an origin
const SCORES_KEPT = 3;                       // rows on the card

// Does `a` beat `b`? Strictly — a tie sits below the older run, because matching
// a record is not beating it.
function resultBeats(a, b) {
  return a.wave > b.wave || (a.wave === b.wave && a.kills > b.kills);
}

const Scores = {
  list: [],
  // Goes false the first time storage refuses us; the in-memory table keeps
  // working for the rest of the session.
  persists: true,

  init() {
    this.list = [];
    this.read();
  },

  read() {
    let raw = null;
    // Reading throws too, not just writing — Safari's private mode has denied
    // getItem outright — so the guard goes around the read as well.
    try {
      raw = localStorage.getItem(SCORES_KEY);
    } catch (e) {
      this.persists = false;
      return;
    }
    if (!raw) return;
    try {
      this.list = sanitiseResults(JSON.parse(raw));
    } catch (e) {
      // Corrupt or hand-edited: start clean; the next write replaces it.
      this.list = [];
    }
  },

  write() {
    if (!this.persists) return;
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(this.list));
    } catch (e) {
      this.persists = false;
    }
  },

  table() {
    return this.list;
  },

  // Record a result. Returns the row it landed on (0 is the top), or -1 if it
  // did not make the table. A run that never reached wave 1 never qualifies —
  // leaving during the opening break is not a record.
  submit(result) {
    if (!(result.wave >= 1)) return -1;
    let i = 0;
    while (i < this.list.length && !resultBeats(result, this.list[i])) i++;
    if (i >= SCORES_KEPT) return -1;
    this.list.splice(i, 0, { wave: Math.floor(result.wave), kills: Math.floor(result.kills) });
    if (this.list.length > SCORES_KEPT) this.list.length = SCORES_KEPT;
    this.write();
    return i;
  },
};

// Whatever came out of storage, reduced to something safe to index into. The
// stored value is user-writable, so nothing about its shape is assumed.
function sanitiseResults(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.wave === 'number' && isFinite(r.wave) && r.wave >= 1)
    .map((r) => ({ wave: Math.floor(r.wave), kills: Math.max(0, Math.floor(+r.kills || 0)) }))
    .sort((a, b) => (resultBeats(a, b) ? -1 : resultBeats(b, a) ? 1 : 0))
    .slice(0, SCORES_KEPT);
}
