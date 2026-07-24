// The Game object: screen state, input, per-well piece driver, animation
// queue, main rAF loop.
//
// Single Player and Multiplayer share one "well state" shape (grid, piece,
// nextPiece, resolve/particles/popups, toppedOut, ...) and the same
// chain-resolve/gravity-fall state machine — Single Player just drives one
// of them, Multiplayer drives two independently (see CLAUDE.md Architecture:
// "Game simply holds two independent well/piece/score sub-states").

const Game = {
  canvas: null,
  ctx: null,
  layout: null, // Single Player well+panels layout
  mpLayout: null, // Multiplayer's two-well split layout
  tileset: null,
  currentTilesetId: null, // active tileset's id string, for Sound's per-tileset music lookup
  pixelRatio: 1,

  // 'menu' | 'single' | 'multiplayer'.
  screen: 'menu',

  // Single Player state: one well + its own speed ramp.
  sp: null,
  spMatchElapsedSec: 0,
  spFallIntervalMs: FALL_SPEED.BASE_MS,

  // Multiplayer state: two wells sharing one speed ramp, plus the match
  // winner once someone tops out.
  mp: null,

  // Drag-to-swipe gesture tracking for mouse input (mirrors touch: a swipe
  // moves/cycles the piece, a double-click/double-tap hard-drops it). Mouse
  // always drives Single Player's well, or Player 1's in Multiplayer.
  mouse: { active: false, startX: 0, startY: 0, lastClickTs: 0 },

  _winDialogLayout: null,
  _gameOverLayout: null,

  time: 0, // ms accumulator; drives idle animations (blob blink, etc.)
  lastFrameTs: null,

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    Sound.init();
    this.tileset = Tilesets.blobs;
    this.layout = Board.computeLayout(CANVAS_W, CANVAS_H);
    this.mpLayout = Board.computeMultiplayerLayout(CANVAS_W, CANVAS_H);
    this.screen = 'menu';

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    requestAnimationFrame((ts) => this.loop(ts));
  },

  // Device-pixel rendering: backing store sized to displayed size * DPR
  // (capped 2x), logical 800x600 space scaled onto it via setTransform.
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = rect.width / CANVAS_W;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.pixelRatio = scale * dpr;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  },

  hitTest(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },

  // ---------------------------------------------------------------------
  // Well state — shared shape for Single Player's one well and each of
  // Multiplayer's two wells.
  // ---------------------------------------------------------------------

  createWellState(varietyCount, activeColors, onChainDone) {
    return {
      varietyCount,
      activeColors,
      grid: Board.createGrid(),
      piece: PieceLogic.spawn(activeColors),
      nextPiece: PieceLogic.spawn(activeColors),
      score: 0,
      fallTimerMs: 0,
      resolve: null,
      particles: [],
      scorePopups: [],
      toppedOut: false,
      pendingGarbage: 0,
      garbageAnim: null,
      onChainDone: onChainDone || null,
    };
  },

  startSinglePlayer() {
    const tilesetId = Menu.selectedTileset;
    this.tileset = Tilesets[tilesetId] || Tilesets.blobs;
    this.currentTilesetId = tilesetId;
    const activeColors = Board.pickActiveColors(Menu.selectedVariety, tilesetId);
    this.sp = this.createWellState(Menu.selectedVariety, activeColors, (total) => this.handleSingleChainDone(total));
    this.sp.scoreboardResult = null;
    this.spMatchElapsedSec = 0;
    this.spFallIntervalMs = FALL_SPEED.BASE_MS;
    this.mouse.active = false;
    this.screen = 'single';
    Sound.playMusicForTileset(tilesetId);
  },

  // Records the run's score into the local top-3-per-variety scoreboard the
  // moment the well tops out (guarded so a well can only ever submit once).
  handleSingleChainDone(totalRemoved) {
    if (this.sp.toppedOut && !this.sp.scoreboardResult) {
      this.sp.scoreboardResult = Scoreboard.submitScore(this.sp.varietyCount, this.sp.score);
    }
  },

  startMultiplayer() {
    const varietyCount = Menu.selectedVariety;
    const tilesetId = Menu.selectedTileset;
    // Shared by both wells — same active color set for the whole match, both
    // so garbage exchanged between wells stays meaningful and so the match
    // is fair (neither player gets an easier or harder color set).
    const activeColors = Board.pickActiveColors(varietyCount, tilesetId);
    this.mp = {
      varietyCount,
      tileset: Tilesets[tilesetId] || Tilesets.blobs,
      matchElapsedSec: 0,
      fallIntervalMs: FALL_SPEED.BASE_MS,
      winner: null,
    };
    this.mp.p1 = this.createWellState(varietyCount, activeColors, (total) => this.handleChainDone(this.mp.p1, this.mp.p2, total));
    this.mp.p2 = this.createWellState(varietyCount, activeColors, (total) => this.handleChainDone(this.mp.p2, this.mp.p1, total));
    this.mouse.active = false;
    this.screen = 'multiplayer';
    this.currentTilesetId = tilesetId;
    Sound.playMusicForTileset(tilesetId);
  },

  // Fades any playing HUD music out over AUDIO.MUSIC_FADE_MS and returns to
  // the title screen — the one path every "back to menu" trigger goes
  // through (win/game-over dialog buttons, R/M shortcuts, the HUD exit
  // button), so music never just cuts or keeps playing over the menu.
  goToMenu() {
    Sound.stopMusic(true);
    this.screen = 'menu';
  },

  // Called once a well's own chain fully resolves. Sends garbage to the
  // rival on a big enough chain, or ends the match if this well topped out.
  handleChainDone(well, rival, totalRemoved) {
    if (well.toppedOut) {
      if (!this.mp.winner) this.mp.winner = well === this.mp.p1 ? 'p2' : 'p1';
      return;
    }
    if (totalRemoved > 0) {
      const rows = Rules.garbageRowsFor(totalRemoved);
      if (rows > 0) rival.pendingGarbage += rows;
    }
  },

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  handleKeyDown(e) {
    if (this.screen === 'menu') return this.handleMenuKeyDown(e);
    if (this.screen === 'single') return this.handleSingleKeyDown(e);
    if (this.screen === 'multiplayer') return this.handleMultiplayerKeyDown(e);
  },

  handleMenuKeyDown(e) {
    if (Menu.showHowTo) {
      if (e.key === 'Escape') Menu.showHowTo = false;
      else if (e.key === 'ArrowLeft') Menu.prevPage();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); Menu.nextPage(); }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      Sound.play('ui_click');
      if (Menu.selectedMode === 'multi') this.startMultiplayer();
      else this.startSinglePlayer();
    }
  },

  handleSingleKeyDown(e) {
    if (this.sp.toppedOut) {
      if (e.key === 'r' || e.key === 'R') { Sound.play('ui_click'); this.startSinglePlayer(); }
      if (e.key === 'm' || e.key === 'M') { Sound.play('ui_click'); this.goToMenu(); }
      return;
    }
    if (this.sp.resolve) return; // cascade is playing out; no active piece to control

    switch (e.key) {
      case 'a': case 'A': case 'ArrowLeft':
        PieceLogic.moveLeft(this.sp.grid, this.sp.piece);
        break;
      case 'd': case 'D': case 'ArrowRight':
        PieceLogic.moveRight(this.sp.grid, this.sp.piece);
        break;
      case 'w': case 'W': case 'ArrowUp':
        PieceLogic.cycleUp(this.sp.piece);
        Sound.play('piece_rotate');
        break;
      case 's': case 'S': case 'ArrowDown':
        PieceLogic.cycleDown(this.sp.piece);
        Sound.play('piece_rotate');
        break;
      case ' ': case 'Enter':
        e.preventDefault();
        this.hardDrop(this.sp);
        break;
      default:
        return;
    }
    e.preventDefault();
  },

  handleMultiplayerKeyDown(e) {
    if (this.mp.winner) {
      if (e.key === 'r' || e.key === 'R') { Sound.play('ui_click'); this.startMultiplayer(); }
      if (e.key === 'm' || e.key === 'M') { Sound.play('ui_click'); this.goToMenu(); }
      return;
    }

    const p1 = this.mp.p1, p2 = this.mp.p2;
    let handled = false;

    if (!p1.toppedOut && !p1.resolve) {
      switch (e.key) {
        case 'a': case 'A': PieceLogic.moveLeft(p1.grid, p1.piece); handled = true; break;
        case 'd': case 'D': PieceLogic.moveRight(p1.grid, p1.piece); handled = true; break;
        case 'w': case 'W': PieceLogic.cycleUp(p1.piece); Sound.play('piece_rotate'); handled = true; break;
        case 's': case 'S': PieceLogic.cycleDown(p1.piece); Sound.play('piece_rotate'); handled = true; break;
        case ' ': this.hardDrop(p1); handled = true; break;
      }
    }
    if (!p2.toppedOut && !p2.resolve) {
      switch (e.key) {
        case 'ArrowLeft': PieceLogic.moveLeft(p2.grid, p2.piece); handled = true; break;
        case 'ArrowRight': PieceLogic.moveRight(p2.grid, p2.piece); handled = true; break;
        case 'ArrowUp': PieceLogic.cycleUp(p2.piece); Sound.play('piece_rotate'); handled = true; break;
        case 'ArrowDown': PieceLogic.cycleDown(p2.piece); Sound.play('piece_rotate'); handled = true; break;
        case 'Enter': this.hardDrop(p2); handled = true; break;
      }
    }
    if (handled || [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
    }
  },

  hardDrop(well) {
    PieceLogic.hardDrop(well.grid, well.piece);
    this.lockAndResolve(well);
  },

  // Mouse always drives Single Player's well, or Player 1's in Multiplayer —
  // Player 2 stays keyboard-only (arrows/Enter).
  activeMouseWell() {
    if (this.screen === 'single') return this.sp;
    if (this.screen === 'multiplayer') return this.mp.p1;
    return null;
  },

  handleMouseDown(e) {
    if (e.button !== 0) return; // left button only
    const well = this.activeMouseWell();
    if (!well) return;
    if (this.screen === 'multiplayer' && this.mp.winner) return;
    if (well.toppedOut || well.resolve) return;
    this.mouse.active = true;
    this.mouse.startX = e.clientX;
    this.mouse.startY = e.clientY;
    e.preventDefault();
  },

  handleMouseUp(e) {
    if (!this.mouse.active) return;
    this.mouse.active = false;
    const well = this.activeMouseWell();
    if (!well) return;
    if (this.screen === 'multiplayer' && this.mp.winner) return;
    if (well.toppedOut || well.resolve) return;

    const dx = e.clientX - this.mouse.startX;
    const dy = e.clientY - this.mouse.startY;
    const dist = Math.hypot(dx, dy);

    if (dist < INPUT.SWIPE_THRESHOLD_PX) {
      // short drag / plain click — check for a double-click to hard-drop
      if (this.mouse.lastClickTs && e.timeStamp - this.mouse.lastClickTs <= INPUT.DOUBLE_CLICK_MS) {
        this.mouse.lastClickTs = 0;
        this.hardDrop(well);
      } else {
        this.mouse.lastClickTs = e.timeStamp;
      }
      return;
    }

    this.resolveSwipeGesture(well, dx, dy);
  },

  // Shared by mouse and (future) touch: dominant-axis swipe maps to
  // move/cycle, same as the touch controls in CLAUDE.md.
  resolveSwipeGesture(well, dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) PieceLogic.moveRight(well.grid, well.piece);
      else PieceLogic.moveLeft(well.grid, well.piece);
    } else {
      if (dy > 0) PieceLogic.cycleDown(well.piece);
      else PieceLogic.cycleUp(well.piece);
      Sound.play('piece_rotate');
    }
  },

  // Title-screen / win-dialog button clicks (Menu owns its own layout and
  // hit-testing; the win dialog's small button set is handled right here).
  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;

    if (this.screen === 'menu') { Menu.handleClick(x, y); return; }

    // HUD icon buttons sit above everything (including dialogs), same
    // top-right spot on both gameplay screens — checked first every click.
    if ((this.screen === 'single' || this.screen === 'multiplayer') && this.handleHudClick(x, y)) return;

    if (this.screen === 'single' && this.sp.toppedOut) {
      const gl = this.getGameOverLayout();
      if (this.hitTest(x, y, gl.playAgainBtn.rect)) { Sound.play('ui_click'); this.startSinglePlayer(); return; }
      if (this.hitTest(x, y, gl.titleBtn.rect)) { Sound.play('ui_click'); this.goToMenu(); return; }
    }

    if (this.screen === 'multiplayer' && this.mp.winner) {
      const wl = this.getWinDialogLayout();
      if (this.hitTest(x, y, wl.playAgainBtn.rect)) { Sound.play('ui_click'); this.startMultiplayer(); return; }
      if (this.hitTest(x, y, wl.titleBtn.rect)) { Sound.play('ui_click'); this.goToMenu(); return; }
    }
  },

  // Top-right icon buttons shown on every gameplay screen: audio mode cycle
  // (on -> music off -> all off -> on) and immediate exit to the title
  // screen. Fixed logical-space layout, same spot in Single Player and
  // Multiplayer since both share the same TOP_MARGIN header strip.
  _hudLayout: null,
  getHudLayout() {
    if (this._hudLayout) return this._hudLayout;
    const btnSize = 34, gap = 10, margin = 14;
    const y = margin;
    const exitX = CANVAS_W - margin - btnSize;
    const audioX = exitX - gap - btnSize;
    this._hudLayout = {
      audioBtn: { rect: { x: audioX, y, w: btnSize, h: btnSize } },
      exitBtn: { rect: { x: exitX, y, w: btnSize, h: btnSize } },
    };
    return this._hudLayout;
  },

  handleHudClick(x, y) {
    const hud = this.getHudLayout();
    if (this.hitTest(x, y, hud.audioBtn.rect)) { this.cycleAudioMode(); return true; }
    if (this.hitTest(x, y, hud.exitBtn.rect)) { this.goToMenu(); return true; }
    return false;
  },

  cycleAudioMode() {
    const order = ['on', 'music-off', 'off'];
    const next = order[(order.indexOf(Sound.mode) + 1) % order.length];
    Sound.setMode(next, this.currentTilesetId);
    Sound.play('ui_click');
  },

  getGameOverLayout() {
    if (this._gameOverLayout) return this._gameOverLayout;
    const panelW = 420, panelH = 400;
    const panelX = (CANVAS_W - panelW) / 2;
    const panelY = (CANVAS_H - panelH) / 2;
    const btnW = 150, btnH = 46, gap = 20;
    const rowX = panelX + (panelW - (btnW * 2 + gap)) / 2;
    const btnY = panelY + panelH - 64;
    this._gameOverLayout = {
      panelX, panelY, panelW, panelH,
      playAgainBtn: { rect: { x: rowX, y: btnY, w: btnW, h: btnH } },
      titleBtn: { rect: { x: rowX + btnW + gap, y: btnY, w: btnW, h: btnH } },
    };
    return this._gameOverLayout;
  },

  getWinDialogLayout() {
    if (this._winDialogLayout) return this._winDialogLayout;
    const panelW = 380, panelH = 220;
    const panelX = (CANVAS_W - panelW) / 2;
    const panelY = (CANVAS_H - panelH) / 2;
    const btnW = 150, btnH = 46, gap = 20;
    const rowX = panelX + (panelW - (btnW * 2 + gap)) / 2;
    const btnY = panelY + panelH - 70;
    this._winDialogLayout = {
      panelX, panelY, panelW, panelH,
      playAgainBtn: { rect: { x: rowX, y: btnY, w: btnW, h: btnH } },
      titleBtn: { rect: { x: rowX + btnW + gap, y: btnY, w: btnW, h: btnH } },
    };
    return this._winDialogLayout;
  },

  // ---------------------------------------------------------------------
  // Chain-resolve state machine — shared by every well in every mode.
  // flash -> explode/particles -> gravity-fall -> rescan, looping until a
  // rescan comes back empty; see CLAUDE.md Matching, Cascades & Resolution
  // and Animations.
  // ---------------------------------------------------------------------

  lockAndResolve(well) {
    PieceLogic.lock(well.grid, well.piece);
    Sound.play('piece_lock');
    this.beginResolve(well);
  },

  beginResolve(well) {
    const matched = Board.scanMatches(well.grid);
    if (matched.size === 0) {
      this.finishChain(well, 0);
      return;
    }
    well.resolve = {
      phase: 'flash',
      phaseStart: this.time,
      totalRemoved: 0,
      tileIndex: 0,
      chainStep: 0,
      matchedCells: this.cellsFromMatchSet(well, matched),
      fallAnims: [],
      fallDuration: 0,
    };
  },

  cellsFromMatchSet(well, matchedSet) {
    return [...matchedSet].map((key) => {
      const [row, col] = key.split(',').map(Number);
      const token = well.grid[row][col];
      // seed carried along so the flash silhouette (e.g. Blobs' wobble)
      // matches this exact token's shape, not a generic default
      return { row, col, color: token.color, seed: token.seed };
    });
  },

  updateResolve(well, layout, tileset) {
    const r = well.resolve;
    if (r.phase === 'flash') {
      if (this.time - r.phaseStart >= ANIM.FLASH_MS) this.explodeCurrentMatches(well, layout, tileset);
      return;
    }
    if (r.phase === 'fall') {
      if (this.time - r.phaseStart >= r.fallDuration) this.advanceChainAfterFall(well);
      return;
    }
  },

  explodeCurrentMatches(well, layout, tileset) {
    const r = well.resolve;
    Sound.play('match_pop', r.chainStep);
    const T = SCORE.TIER_SIZE;
    r.matchedCells.forEach((cell) => {
      r.tileIndex++;
      const tier = Math.ceil(r.tileIndex / T);
      this.spawnParticles(well, cell, layout, tileset);
      // Dice has no color identity (one neutral die, distinguished by pip
      // count) — its particleColor() override applies here too, so the
      // floating "+x" isn't colored by a hue this tileset never shows.
      const popupColor = tileset && tileset.particleColor
        ? tileset.particleColor(cell.color)
        : COLORS[cell.color];
      well.scorePopups.push({ row: cell.row, col: cell.col, color: popupColor, value: tier, start: this.time });
    });
    r.totalRemoved += r.matchedCells.length;

    const matchedSet = new Set(r.matchedCells.map((c) => c.row + ',' + c.col));
    const moves = Board.removeAndCollapse(well.grid, matchedSet);

    if (moves.length > 0) {
      const maxRows = Math.max(...moves.map((m) => m.toRow - m.fromRow));
      r.fallAnims = moves;
      r.fallDuration = Math.min(ANIM.FALL_MAX_MS, ANIM.FALL_BASE_MS + maxRows * ANIM.FALL_PER_ROW_MS);
      r.phase = 'fall';
      r.phaseStart = this.time;
    } else {
      this.advanceChainAfterFall(well);
    }
  },

  advanceChainAfterFall(well) {
    const r = well.resolve;
    r.fallAnims = [];
    const matched = Board.scanMatches(well.grid);
    if (matched.size === 0) {
      this.finishChain(well, r.totalRemoved);
      return;
    }
    r.phase = 'flash';
    r.phaseStart = this.time;
    r.chainStep++;
    r.matchedCells = this.cellsFromMatchSet(well, matched);
  },

  finishChain(well, totalRemoved) {
    if (totalRemoved > 0) well.score += Rules.scoreForChain(totalRemoved);
    well.resolve = null;

    if (Rules.isTopOut(well.grid, PIECE.SPAWN_COL)) {
      well.toppedOut = true;
    } else {
      well.piece = well.nextPiece;
      well.nextPiece = PieceLogic.spawn(well.activeColors);
      well.fallTimerMs = 0;
    }

    if (well.onChainDone) well.onChainDone(totalRemoved);
  },

  spawnParticles(well, cell, layout, tileset) {
    const rect = Grid.cellRect(cell.col, cell.row, layout);
    const cx = rect.x + rect.size / 2;
    const cy = rect.y + rect.size / 2;
    // Most tilesets' particles match the token's own color; Dice has no
    // color identity at all (it's one neutral die color, distinguished by
    // pip count), so its particleColor() override returns that instead.
    const particleColor = tileset && tileset.particleColor
      ? tileset.particleColor(cell.color)
      : COLORS[cell.color];
    for (let i = 0; i < ANIM.PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / ANIM.PARTICLE_COUNT + (Math.random() - 0.5) * 0.6;
      const speed = 40 + Math.random() * 80;
      well.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        color: particleColor,
        size: rect.size * (0.09 + Math.random() * 0.07),
        start: this.time,
        life: ANIM.PARTICLE_MS * (0.7 + Math.random() * 0.6),
      });
    }
  },

  buildFallSkipSet(well) {
    if (!well.resolve || well.resolve.phase !== 'fall') return null;
    const set = new Set();
    well.resolve.fallAnims.forEach((m) => set.add(m.toRow + ',' + m.col));
    return set;
  },

  buildGarbageSkipSet(well) {
    if (!well.garbageAnim || this.time - well.garbageAnim.phaseStart >= well.garbageAnim.duration) return null;
    const set = new Set();
    well.garbageAnim.moves.forEach((m) => { if (m.toRow >= 0) set.add(m.toRow + ',' + m.col); });
    return set;
  },

  // Grid data updates instantly (same "instant logic, animated overlay"
  // approach as everywhere else) — but the incoming row(s) should read as
  // sliding up from below, fast but not instant, not just appearing. Every
  // existing token shifts by the same `rows` amount, and the new garbage
  // tokens are modeled as already sitting `rows` further below the well
  // (off-screen) before that same shift — so both existing and new tokens
  // share one simple relationship: toRow = fromRow - rows.
  insertGarbageWithAnim(well, rows) {
    const moves = [];
    for (let r = 0; r < WELL.ROWS; r++) {
      for (let c = 0; c < WELL.COLS; c++) {
        const token = well.grid[r][c];
        if (token) moves.push({ col: c, fromRow: r, toRow: r - rows, token });
      }
    }

    for (let i = 0; i < rows; i++) Board.insertGarbageRow(well.grid, well.activeColors);

    for (let j = 0; j < rows; j++) {
      const finalRow = WELL.ROWS - rows + j;
      for (let c = 0; c < WELL.COLS; c++) {
        moves.push({ col: c, fromRow: finalRow + rows, toRow: finalRow, token: well.grid[finalRow][c] });
      }
    }

    well.garbageAnim = {
      phaseStart: this.time,
      duration: Math.min(ANIM.FALL_MAX_MS, ANIM.FALL_BASE_MS + rows * ANIM.FALL_PER_ROW_MS),
      moves,
    };
  },

  ageWellEffects(well) {
    well.particles = well.particles.filter((p) => this.time - p.start < p.life);
    well.scorePopups = well.scorePopups.filter((p) => this.time - p.start < ANIM.POPUP_MS);
  },

  // Advances one well by one tick: garbage drains only once it's safe (not
  // mid-cascade, so row-shift never invalidates an in-flight fall animation's
  // row indices), then normal natural-fall/lock.
  updateWell(well, layout, fallIntervalMs, dt, tileset) {
    if (well.toppedOut) return;

    if (well.resolve) {
      this.updateResolve(well, layout, tileset);
      return;
    }

    if (well.pendingGarbage > 0) {
      this.insertGarbageWithAnim(well, well.pendingGarbage);
      well.pendingGarbage = 0;
    }

    well.fallTimerMs += dt;
    if (well.fallTimerMs >= fallIntervalMs) {
      well.fallTimerMs = 0;
      if (PieceLogic.canFall(well.grid, well.piece)) {
        PieceLogic.stepFall(well.piece);
      } else {
        this.lockAndResolve(well);
      }
    }
  },

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------

  loop(ts) {
    if (this.lastFrameTs == null) this.lastFrameTs = ts;
    const dt = ts - this.lastFrameTs;
    this.lastFrameTs = ts;
    this.time += dt;
    Sound.update(dt);

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    if (this.screen === 'single') { this.updateSingle(dt); return; }
    if (this.screen === 'multiplayer') { this.updateMultiplayer(dt); return; }
    // 'menu': nothing to simulate on the title screen
  },

  updateSingle(dt) {
    this.ageWellEffects(this.sp);
    if (this.sp.toppedOut) return;

    this.spMatchElapsedSec += dt / 1000;
    const rampSteps = Math.floor(this.spMatchElapsedSec / FALL_SPEED.RAMP_INTERVAL_SEC);
    this.spFallIntervalMs = Math.max(
      FALL_SPEED.MIN_MS,
      FALL_SPEED.BASE_MS - rampSteps * FALL_SPEED.RAMP_STEP_MS
    );

    this.updateWell(this.sp, this.layout, this.spFallIntervalMs, dt, this.tileset);
  },

  updateMultiplayer(dt) {
    this.ageWellEffects(this.mp.p1);
    this.ageWellEffects(this.mp.p2);
    if (this.mp.winner) return;

    this.mp.matchElapsedSec += dt / 1000;
    const rampSteps = Math.floor(this.mp.matchElapsedSec / FALL_SPEED.RAMP_INTERVAL_SEC);
    this.mp.fallIntervalMs = Math.max(
      FALL_SPEED.MIN_MS,
      FALL_SPEED.BASE_MS - rampSteps * FALL_SPEED.RAMP_STEP_MS
    );

    this.updateWell(this.mp.p1, this.mpLayout.p1, this.mp.fallIntervalMs, dt, this.mp.tileset);
    if (this.mp.winner) return; // p1 topping out just decided the match
    this.updateWell(this.mp.p2, this.mpLayout.p2, this.mp.fallIntervalMs, dt, this.mp.tileset);
  },

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    if (this.screen === 'menu') { Menu.render(ctx, this.time); return; }
    if (this.screen === 'single') { this.renderSingle(ctx); return; }
    if (this.screen === 'multiplayer') { this.renderMultiplayer(ctx); return; }
  },

  renderWellContents(ctx, well, layout, tileset) {
    Renderer.drawWell(ctx, layout, this.pixelRatio);
    const skipSet = this.buildFallSkipSet(well) || this.buildGarbageSkipSet(well);
    Renderer.drawGridTokens(ctx, well.grid, layout, tileset, this.time, skipSet);

    if (well.resolve && well.resolve.phase === 'fall') {
      Renderer.drawFallingTokens(
        ctx, well.resolve.fallAnims, layout, tileset,
        this.time, well.resolve.phaseStart, well.resolve.fallDuration
      );
    }
    if (well.garbageAnim && this.time - well.garbageAnim.phaseStart < well.garbageAnim.duration) {
      Renderer.drawFallingTokens(
        ctx, well.garbageAnim.moves, layout, tileset,
        this.time, well.garbageAnim.phaseStart, well.garbageAnim.duration
      );
    }
    if (well.resolve && well.resolve.phase === 'flash') {
      Renderer.drawFlashes(ctx, well.resolve.matchedCells, layout, this.time, tileset);
    }
    if (!well.toppedOut && !well.resolve) Renderer.drawPiece(ctx, well.piece, layout, tileset, this.time);

    Renderer.drawParticles(ctx, well.particles, this.time);
    Renderer.drawScorePopups(ctx, well.scorePopups, layout, this.time);
  },

  renderSingle(ctx) {
    Renderer.drawBackground(ctx);
    Ambiance.draw(ctx, this.time);
    this.renderWellContents(ctx, this.sp, this.layout, this.tileset);
    Renderer.drawStatsPanel(ctx, this.layout.statsPanel, {
      score: this.sp.score, varietyCount: this.sp.varietyCount, fallIntervalMs: this.spFallIntervalMs,
      activeColors: this.sp.activeColors,
    });
    Renderer.drawNextPanel(ctx, this.layout.nextPanel, this.sp.nextPiece, this.tileset, this.time);

    if (this.sp.toppedOut) {
      const result = this.sp.scoreboardResult || { topScores: Scoreboard.getTopScores(this.sp.varietyCount), rank: null };
      Renderer.drawGameOverDialog(ctx, this.getGameOverLayout(), {
        score: this.sp.score,
        varietyCount: this.sp.varietyCount,
        topScores: result.topScores,
        rank: result.rank,
      });
    }

    Renderer.drawHudButtons(ctx, this.getHudLayout(), Sound.mode);
  },

  renderMultiplayer(ctx) {
    Renderer.drawBackground(ctx);
    Ambiance.draw(ctx, this.time);

    [[this.mp.p1, this.mpLayout.p1], [this.mp.p2, this.mpLayout.p2]].forEach(([well, layout]) => {
      Renderer.drawWellLabel(ctx, layout);
      this.renderWellContents(ctx, well, layout, this.mp.tileset);
      Renderer.drawNextPanel(ctx, layout.nextPanel, well.nextPiece, this.mp.tileset, this.time);
      if (well.toppedOut) Renderer.drawToppedOutOverlay(ctx, layout);
    });

    if (this.mp.winner) {
      const label = this.mp.winner === 'p1' ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!';
      Renderer.drawWinDialog(ctx, this.getWinDialogLayout(), label);
    }

    Renderer.drawHudButtons(ctx, this.getHudLayout(), Sound.mode);
  },
};
