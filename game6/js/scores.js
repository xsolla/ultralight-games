// ============================================================================
// scores.js — the local high-score table: persistence and the ordering rule.
// A namespace with state, like Atlas and Stars. It does not draw (menu.js
// draws the card), does not own screen state (game.js does), and knows nothing
// about how a run ended — it is handed a number and reports where it landed.
//
// Kept SEPARATELY PER DIFFICULTY (CLAUDE.md §7), under one namespaced
// localStorage key. Difficulties are not comparable: the same 400 points off a
// Hard run and an Easy one are not the same achievement, and one shared table
// would quietly become the Easy table.
//
// The reference game has no persistence, so the shape here is Bubble Bopper's
// (game1): one namespaced key, and every access wrapped, so private-browsing
// mode degrades to a non-persistent session instead of throwing.
// ============================================================================

// ---- Tunables --------------------------------------------------------------
const SCORES_KEY = 'spaceshooter_scores';   // namespaced: the repo shares an origin
const SCORES_KEPT = 3;                      // entries per difficulty

const Scores = {
  // key -> descending array of at most SCORES_KEPT scores.
  tables: null,
  // Goes false the first time storage refuses us. Everything keeps working
  // against the in-memory tables from then on: a run in private-browsing mode
  // still shows its own records, they just do not outlive the tab.
  persists: true,

  init() {
    this.tables = {};
    for (const d of DIFFICULTIES) this.tables[d.key] = [];
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

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Corrupt or hand-edited. Start clean rather than refusing to run; the
      // next write replaces it.
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    // Read per difficulty rather than trusting the stored shape, so a key that
    // has been renamed or removed from DIFFICULTIES simply stops being read.
    for (const d of DIFFICULTIES) this.tables[d.key] = sanitiseScores(parsed[d.key]);
  },

  write() {
    if (!this.persists) return;
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(this.tables));
    } catch (e) {
      // Full, or denied. Stop trying for the rest of the session.
      this.persists = false;
    }
  },

  table(key) {
    return this.tables[key] || [];
  },

  // Would this score make the table? Asked separately from submit() so a caller
  // can look without recording.
  //
  // A zero never qualifies, even into an empty table: pressing exit on the
  // first frame of a run would otherwise enter 0 as a record and the card would
  // congratulate the player for it.
  qualifies(key, score) {
    if (!(score > 0)) return false;
    const t = this.table(key);
    return t.length < SCORES_KEPT || score > t[t.length - 1];
  },

  // Record a score. Returns the row it landed on (0 is the top), or -1 if it
  // did not make the table — which is what game.js reads to decide whether
  // there is a record to show at all.
  submit(key, score) {
    if (!this.qualifies(key, score)) return -1;

    const t = this.tables[key];
    // Strictly greater, so a tie sits BELOW the equal score already there: the
    // older run got there first, and matching a record is not beating it.
    let i = 0;
    while (i < t.length && score <= t[i]) i++;
    t.splice(i, 0, Math.floor(score));
    if (t.length > SCORES_KEPT) t.length = SCORES_KEPT;

    this.write();
    return i;
  },
};

// Whatever came out of storage, reduced to something safe to index into. The
// stored file is user-writable, so nothing about it is assumed: not that it is
// an array, not that its entries are numbers, not that it is sorted, and not
// that it is the length this build keeps.
function sanitiseScores(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => typeof n === 'number' && isFinite(n) && n > 0)
    .map((n) => Math.floor(n))
    .sort((a, b) => b - a)
    .slice(0, SCORES_KEPT);
}
