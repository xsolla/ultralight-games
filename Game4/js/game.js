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

  // Mouse and touch share one drag-to-swipe gesture model (dominant-axis
  // swipe moves/cycles the piece, two quick taps hard-drop it); they differ
  // only in which well a gesture may drive. The mouse always drives Single
  // Player's well or Player 1's, while a touch drives whichever well owns the
  // canvas half it started in — see gestureTargetAt / mouseGestureTarget.
  mouse: { active: false, startX: 0, startY: 0, target: null },

  // Live touches keyed by Touch.identifier, one entry per finger. Each is
  // resolved independently on touchend, so in Multiplayer two players' fingers
  // never share gesture state and can swipe/drop at the same time.
  touches: new Map(),

  // Last tap/click timestamp per gesture target, so a double tap on one well
  // can never hard-drop the other player's piece.
  lastTapTs: { sp: 0, p1: 0, p2: 0 },
  _mouseSuppressedUntilTs: 0,

  _winDialogLayout: null,
  _gameOverLayout: null,

  time: 0, // ms accumulator; drives idle animations (blob blink, etc.)
  lastFrameTs: null,
  hudHover: null, // 'audio' | 'exit' | null — which HUD button is hovered

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
    // Entering/leaving fullscreen changes the viewport, so the 4:3 canvas box
    // changes size and the backing store has to be rebuilt for it. The event can
    // fire before layout has settled on the new box, so re-measure next frame
    // too — otherwise exiting leaves the backing store at its fullscreen size.
    const onFullscreenChange = () => {
      this.resizeCanvas();
      requestAnimationFrame(() => this.resizeCanvas());
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.hudHover = null; });

    // Not passive: these preventDefault() to kill page scroll/pinch-zoom and
    // the synthetic mouse events a tap would otherwise fire.
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => this.handleTouchCancel(e));

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
    this.resetPointerState();
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
    this.resetPointerState();
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
    this.resetPointerState();
    this.hudHover = null;
    this.canvas.style.cursor = 'default';
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

  // ---- Pointer gestures (mouse drag + touch swipe), shared plumbing -----
  //
  // A gesture is bound to a "target" the moment it starts: 'sp' / 'p1' / 'p2'
  // for a well, or 'ui' for a point that wants a plain tap (menu, dialog, HUD
  // button) instead of a piece gesture. Binding at the start means a swipe is
  // still credited to the well it began over even if it ends elsewhere.

  // Which target a *touch* starting at this logical-space point drives. This
  // is the side-aware path: in Multiplayer the canvas splits down the middle,
  // exactly matching the two visual zones computeMultiplayerLayout lays out
  // (P1's well+preview left of center, P2's right of it), so both players can
  // drive their own well from their own side of a shared touchscreen.
  gestureTargetAt(x, y) {
    if (this.screen === 'menu') return 'ui';
    if (this.hudButtonAt(x, y)) return 'ui';
    if (this.screen === 'single') return this.sp.toppedOut ? 'ui' : 'sp';
    if (this.screen === 'multiplayer') {
      if (this.mp.winner) return 'ui'; // the win dialog owns every tap
      return x < CANVAS_W / 2 ? 'p1' : 'p2';
    }
    return null;
  },

  // A *mouse* gesture always drives Single Player's well, or Player 1's in
  // Multiplayer, wherever on the canvas it happens — Player 2 is keyboard-
  // and-touch-only, so a shared screen's single mouse can't interfere with
  // the other player's well (CLAUDE.md Controls).
  mouseGestureTarget() {
    if (this.screen === 'single') return 'sp';
    if (this.screen === 'multiplayer') return 'p1';
    return null;
  },

  wellForTarget(target) {
    if (target === 'sp') return this.screen === 'single' ? this.sp : null;
    if (target === 'p1') return this.screen === 'multiplayer' ? this.mp.p1 : null;
    if (target === 'p2') return this.screen === 'multiplayer' ? this.mp.p2 : null;
    return null;
  },

  // A well only accepts gestures while it actually has a controllable piece —
  // same guard the keyboard paths use.
  canControlWell(well) {
    if (!well) return false;
    if (this.screen === 'multiplayer' && this.mp.winner) return false;
    return !well.toppedOut && !well.resolve;
  },

  // One completed gesture on a well: short means a tap (two in quick
  // succession hard-drop), longer means a dominant-axis swipe. Controllability
  // is re-checked here rather than only at gesture start, so a swipe begun
  // while the well was mid-cascade still lands if the chain finished first.
  applyPointerGesture(target, dx, dy, ts) {
    const well = this.wellForTarget(target);
    if (!this.canControlWell(well)) return;

    if (Math.hypot(dx, dy) < INPUT.SWIPE_THRESHOLD_PX) {
      const prev = this.lastTapTs[target] || 0;
      if (prev && ts - prev <= INPUT.DOUBLE_CLICK_MS) {
        this.lastTapTs[target] = 0;
        this.hardDrop(well);
      } else {
        this.lastTapTs[target] = ts;
      }
      return;
    }

    this.resolveSwipeGesture(well, dx, dy);
  },

  resetPointerState() {
    this.mouse.active = false;
    this.mouse.target = null;
    this.touches.clear();
    this.lastTapTs = { sp: 0, p1: 0, p2: 0 };
  },

  handleMouseDown(e) {
    if (e.button !== 0) return; // left button only
    if (this.mouseSuppressed(e)) return;
    const target = this.mouseGestureTarget();
    if (!this.canControlWell(this.wellForTarget(target))) return;
    const p = this.eventToCanvas(e);
    if (this.hudButtonAt(p.x, p.y)) return; // HUD buttons take plain clicks
    this.mouse.active = true;
    this.mouse.target = target;
    this.mouse.startX = p.x;
    this.mouse.startY = p.y;
    e.preventDefault();
  },

  handleMouseUp(e) {
    if (!this.mouse.active) return;
    this.mouse.active = false;
    const p = this.eventToCanvas(e);
    this.applyPointerGesture(this.mouse.target, p.x - this.mouse.startX, p.y - this.mouse.startY, e.timeStamp);
  },

  // ---- Touch --------------------------------------------------------------
  //
  // Touch mirrors the mouse gesture set exactly (swipe left/right moves,
  // up/down cycles, double tap hard-drops) but is multi-touch and side-aware:
  // every finger is tracked by its own Touch.identifier and bound to the well
  // owning the canvas half it started in, so two Multiplayer players can
  // swipe and drop simultaneously on one screen without stealing each other's
  // gestures or double-tap timing.
  //
  // TouchLists are indexed rather than iterated — they aren't reliably
  // iterable across browsers.

  handleTouchStart(e) {
    e.preventDefault();
    this.noteTouchActivity(e.timeStamp);
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = this.eventToCanvas(t);
      this.touches.set(t.identifier, {
        target: this.gestureTargetAt(p.x, p.y),
        startX: p.x,
        startY: p.y,
      });
    }
  },

  // Gestures resolve on touchend (one action per swipe, same as a mouse
  // drag); this only exists to keep the page from scrolling/zooming under the
  // finger, which `touch-action: none` alone doesn't cover everywhere.
  handleTouchMove(e) {
    if (this.touches.size > 0) e.preventDefault();
  },

  handleTouchEnd(e) {
    e.preventDefault();
    this.noteTouchActivity(e.timeStamp);
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const g = this.touches.get(t.identifier);
      if (!g) continue;
      this.touches.delete(t.identifier);

      const p = this.eventToCanvas(t);
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;

      if (g.target === 'ui') {
        // A finger that slid away from where it landed is a cancelled tap,
        // the same as dragging off a button before releasing the mouse.
        if (Math.hypot(dx, dy) < INPUT.SWIPE_THRESHOLD_PX) this.dispatchTap(p.x, p.y);
      } else if (g.target) {
        this.applyPointerGesture(g.target, dx, dy, e.timeStamp);
      }
    }
  },

  handleTouchCancel(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.touches.delete(e.changedTouches[i].identifier);
    }
  },

  // touchstart's preventDefault() already stops the browser's compatibility
  // mouse events, but a short grace window after any touch guarantees a stray
  // synthetic click can't activate a menu button a second time.
  noteTouchActivity(ts) {
    this._mouseSuppressedUntilTs = ts + INPUT.TOUCH_MOUSE_GRACE_MS;
  },

  mouseSuppressed(e) {
    return e.timeStamp < this._mouseSuppressedUntilTs;
  },

  // Dominant-axis swipe maps to move/cycle, per CLAUDE.md Controls.
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

  // A mouse event's or Touch's position in the fixed 800x600 logical space —
  // the only space any hit-testing or gesture math happens in.
  eventToCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  },

  // HUD buttons live on the gameplay screens only, but stay active above the
  // game-over/win dialogs — so hover is tracked for the whole screen.
  handleMouseMove(e) {
    const onGameplay = this.screen === 'single' || this.screen === 'multiplayer';
    const p = this.eventToCanvas(e);
    this.hudHover = onGameplay ? this.hudButtonAt(p.x, p.y) : null;
    const cursor = this.hudHover ? 'pointer' : 'default';
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  },

  handleCanvasClick(e) {
    if (this.mouseSuppressed(e)) return;
    const { x, y } = this.eventToCanvas(e);
    this.dispatchTap(x, y);
  },

  // A plain click or tap at a logical-space point — title screen, HUD buttons,
  // and the game-over/win dialogs. Shared by the mouse `click` handler and
  // touchend's 'ui' target, so both pointer kinds hit exactly the same
  // targets. Menu owns its own layout and hit-testing; the dialogs' small
  // button sets are handled right here.
  dispatchTap(x, y) {
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
  //
  // Size/inset/colors/icons match the other three games (Game3/js/render.js is
  // the reference), but the pair stays side by side rather than stacked: this
  // header strip is only TOP_MARGIN (64px) tall, so a second 30px row at y=52
  // would spill onto the well — in Multiplayer directly over P2's top-right
  // cells, whose right edge reaches x~770.
  // The row grows leftward from the right margin: fullscreen, audio, exit.
  // It stays a single row (rather than the vertical column the other games use)
  // because this header strip is only TOP_MARGIN (64px) tall — see below.
  _hudLayout: null,
  getHudLayout() {
    if (this._hudLayout) return this._hudLayout;
    const btnSize = 30, gap = 6, margin = 28;
    const y = 16;
    const exitX = CANVAS_W - margin - btnSize;
    const audioX = exitX - gap - btnSize;
    const fullX = audioX - gap - btnSize;
    this._hudLayout = {
      fullscreenBtn: { rect: { x: fullX, y, w: btnSize, h: btnSize } },
      audioBtn: { rect: { x: audioX, y, w: btnSize, h: btnSize } },
      exitBtn: { rect: { x: exitX, y, w: btnSize, h: btnSize } },
    };
    return this._hudLayout;
  },

  handleHudClick(x, y) {
    const hud = this.getHudLayout();
    if (this.hitTest(x, y, hud.audioBtn.rect)) { this.cycleAudioMode(); return true; }
    if (this.hitTest(x, y, hud.exitBtn.rect)) { this.goToMenu(); return true; }
    if (this.hitTest(x, y, hud.fullscreenBtn.rect)) {
      Sound.play('ui_click');
      this.toggleFullscreen();
      return true;
    }
    return false;
  },

  // Which HUD icon button, if any, is under the given logical-space point.
  hudButtonAt(x, y) {
    const hud = this.getHudLayout();
    if (this.hitTest(x, y, hud.audioBtn.rect)) return 'audio';
    if (this.hitTest(x, y, hud.exitBtn.rect)) return 'exit';
    if (this.hitTest(x, y, hud.fullscreenBtn.rect)) return 'fullscreen';
    return null;
  },

  // Read live from the document rather than tracked in a field, so leaving
  // fullscreen with Esc or F11 keeps the button glyph in sync for free.
  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  // The <html> element goes fullscreen, not the canvas: styles.css sizes the
  // canvas as a centered 4:3 box against the viewport, so making the viewport
  // the screen keeps that box (and therefore resizeCanvas/eventToCanvas) exactly
  // as it is. Fullscreening the canvas itself would let the UA stretch it to
  // 100%x100% and break the logical-coordinate mapping.
  toggleFullscreen() {
    if (this.isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // Rejects when the embedding page withholds allow="fullscreen" — ignore it
    // rather than throwing an unhandled rejection into the console.
    if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }
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

      // Garbage shifts the whole settled stack up — that can bury the
      // spawn column before the currently-falling piece ever locks, so
      // top-out has to be checked right here, not just after the next
      // chain resolves.
      if (Rules.isTopOut(well.grid, PIECE.SPAWN_COL)) {
        well.toppedOut = true;
        if (well.onChainDone) well.onChainDone(0);
        return;
      }
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

    Renderer.drawHudButtons(ctx, this.getHudLayout(), Sound.mode, this.hudHover, this.isFullscreen());
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

    Renderer.drawHudButtons(ctx, this.getHudLayout(), Sound.mode, this.hudHover, this.isFullscreen());
  },
};
