// Local scoreboard: Single Player only, top 3 scores per token-variety count
// (4/5/6), persisted via localStorage. Pure data module — no rendering here.

const Scoreboard = {
  STORAGE_KEY: 'cascadia_scores_v1',
  MAX_ENTRIES: 3,

  _load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const data = {};
      TOKEN_VARIETY.OPTIONS.forEach((v) => {
        data[v] = Array.isArray(parsed[v]) ? parsed[v].filter((n) => typeof n === 'number') : [];
      });
      return data;
    } catch (e) {
      const empty = {};
      TOKEN_VARIETY.OPTIONS.forEach((v) => { empty[v] = []; });
      return empty;
    }
  },

  _save(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage unavailable (private mode, file:// restrictions, quota) —
      // the run still shows its result this session, it just won't persist.
    }
  },

  getTopScores(varietyCount) {
    return this._load()[varietyCount] || [];
  },

  // Inserts `score` into the given variety's list, re-sorts, and trims to
  // MAX_ENTRIES. Returns the resulting top list plus this score's 1-based
  // rank within it (null if it didn't make the cut).
  submitScore(varietyCount, score) {
    const data = this._load();
    const list = (data[varietyCount] || []).slice();
    list.push(score);
    list.sort((a, b) => b - a);
    const topScores = list.slice(0, this.MAX_ENTRIES);
    data[varietyCount] = topScores;
    this._save(data);

    const rank = topScores.indexOf(score);
    return { topScores, rank: rank === -1 ? null : rank + 1 };
  },
};
