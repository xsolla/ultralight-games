// ============================================================================
// game.js — the single Game object: state, screens, input, main loop.
// Screens: 'menu' (title screen) and 'playing'. AI decision-making lives in
// ai.js (added later); a random-move fallback keeps vs-AI playable until then.
// ============================================================================

const Game = {
  ctx: null,
  canvas: null,
  board: null,
  modeLabel: '',
  lastTime: 0,
  time: 0,                  // ms accumulator, drives breathing animations
  hoverCell: null,          // {q, r} of the cell under the cursor, or null
  animations: [],           // in-flight spawn/clone/jump/convert animations
  occludedCells: null,      // Set of cell keys an animation currently owns
  busy: false,              // true while a conversion is animating — blocks the next turn

  // Screen + persistent menu selections.
  screen: 'menu',           // 'menu' | 'ceremony' | 'playing'
  ceremony: null,           // coin-flip reveal state
  settings: { size: '5x5x5', mode: 'ai', ai: 'normal' },
  menuButtons: [],          // populated by drawMenu each frame, for hit-testing
  powerBtnRect: null,       // in-game power button (return to menu) rect
  soundBtnRect: null,       // in-game sound button rect
  soundState: 'on',         // 'on' | 'musicoff' | 'off' (cosmetic for now)

  // Turn / interaction state.
  currentPlayer: BUBBLES,
  selected: null,
  legalDests: [],

  // Mode state (vs-AI). null in hot seat.
  humanFaction: null,
  aiFaction: null,
  aiTimer: 0,               // ms left on the AI's artificial thinking pause

  // Outcome state.
  gameOver: false,
  winner: null,
  winMargin: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    // Audio: decode/cache sfx now, prepare the (streamed) music element.
    Sound.init();

    // Render at the display's real device pixels for crisp text/lines, while
    // all drawing stays in the fixed 800x600 logical space via a context scale.
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerleave', () => { this.hoverCell = null; });

    // Start on the title screen. Build an initial board so the loop has one.
    this.screen = 'menu';
    this.startGame();
    this.screen = 'menu';

    const loop = (t) => {
      const dt = this.lastTime ? t - this.lastTime : 0;
      this.lastTime = t;
      this.update(dt);
      drawScene(this.ctx, this);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  // Start a fresh game from the current settings.
  startGame() {
    const s = this.settings;
    const cfg = BOARD_SIZES[s.size];
    this.board = createBoard(cfg.radius);
    this.gameOver = false;
    this.winner = null;
    this.winMargin = 0;
    this.aiTimer = 0;
    this.hoverCell = null;
    this.busy = false;
    this.animations = [];
    this.occludedCells = null;
    this.clearSelection();

    // Decide the randomised roles up front; the coin-flip ceremony reveals them.
    if (s.mode === 'ai') {
      this.humanFaction = Math.random() < 0.5 ? BUBBLES : CRYSTALS;
      this.aiFaction = OPPONENT[this.humanFaction];
      this.modeLabel = 'vs AI (' + AI_LEVELS[s.ai].label + ')  ·  ' + cfg.label;
    } else {
      this.humanFaction = null;
      this.aiFaction = null;
      this.modeLabel = 'Hot Seat  ·  ' + cfg.label;
    }
    this.currentPlayer = Math.random() < 0.5 ? BUBBLES : CRYSTALS; // first move, all modes

    this.setupCeremony();
    this.screen = 'ceremony';
  },

  // Build the coin-flip sequence: AI-side (vs AI only), then first move.
  setupCeremony() {
    const label = (f) => (f === BUBBLES ? 'Bubbles' : 'Crystals');
    const tosses = [];
    if (this.settings.mode === 'ai') {
      tosses.push({ kind: 'ai', target: this.aiFaction,
        prompt: 'AI side',
        result: 'The AI plays ' + label(this.aiFaction) });
    }
    tosses.push({ kind: 'first', target: this.currentPlayer,
      prompt: 'First move',
      result: label(this.currentPlayer) + ' move first' });
    this.ceremony = { tosses, index: 0, phase: 'flip', elapsed: 0 };
  },

  advanceCeremony(dt) {
    const c = this.ceremony;
    // Coin toss whoosh at the start of each flip (this runs only on the
    // ceremony screen, so it never fires from the load-time board build).
    const toss = c.tosses[c.index];
    if (c.phase === 'flip' && !toss.startSounded) {
      toss.startSounded = true;
      Sound.play('coin_flip_start');
    }
    c.elapsed += dt;
    if (c.phase === 'flip') {
      if (c.elapsed >= CEREMONY.FLIP) { c.phase = 'reveal'; c.elapsed = 0; Sound.play('coin_flip_result'); }
    } else if (c.phase === 'reveal') {
      if (c.elapsed >= CEREMONY.REVEAL) {
        if (c.index < c.tosses.length - 1) { c.index++; c.phase = 'flip'; c.elapsed = 0; }
        else { c.phase = 'hold'; c.elapsed = 0; } // final pause on the last result
      }
    } else if (c.elapsed >= CEREMONY.END_PAUSE) { // 'hold'
      this.beginPlay();
    }
  },

  skipCeremony() { this.beginPlay(); },

  // Reveal done: show the board and queue the staggered spawn pop-ins.
  beginPlay() {
    this.screen = 'playing';
    this.animations = [];
    let n = 0;
    for (const cell of this.board.cells.values()) {
      if (cell.owner === EMPTY) continue;
      this.animations.push({
        type: 'spawn', faction: cell.owner,
        to: { q: cell.q, r: cell.r },
        elapsed: 0, delay: n * ANIM.SPAWN_STAGGER, dur: ANIM.SPAWN,
      });
      n++;
    }
    this.rebuildOccluded();
    Sound.startMusic();
    if (this.settings.mode === 'ai' && this.currentPlayer === this.aiFaction) this.scheduleAI();
  },

  // Return to the title screen and fade the music out.
  returnToMenu() {
    this.screen = 'menu';
    this.clearSelection();
    Sound.stopMusic();
  },

  clearSelection() {
    this.selected = null;
    this.legalDests = [];
  },

  // Cycle the sound button: on -> music off -> off -> on, and apply it.
  cycleSound() {
    this.soundState = this.soundState === 'on' ? 'musicoff'
      : this.soundState === 'musicoff' ? 'off' : 'on';
    Sound.applyState(this.soundState);
    Sound.play('ui_click'); // silent when the new state is 'off'
  },

  // Size the canvas backing store to the displayed size in device pixels, and
  // scale the context so all drawing still uses 800x600 logical coordinates.
  // (dpr capped at 2 to bound per-frame cost on very high-density screens.)
  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const cssW = rect.width || CANVAS_W;
    const cssH = rect.height || CANVAS_H;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    // Setting width/height resets the context, so (re)apply the logical scale.
    this.ctx.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0);
  },

  isHumanTurn() {
    return this.settings.mode !== 'ai' || this.currentPlayer === this.humanFaction;
  },

  // ---- Input -------------------------------------------------------------
  eventToCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nativeAspect = CANVAS_W / CANVAS_H;
    const boxAspect = rect.width / rect.height;

    let imgW, imgH, offX, offY;
    if (boxAspect > nativeAspect) {
      imgH = rect.height;
      imgW = imgH * nativeAspect;
      offX = (rect.width - imgW) / 2;
      offY = 0;
    } else {
      imgW = rect.width;
      imgH = imgW / nativeAspect;
      offX = 0;
      offY = (rect.height - imgH) / 2;
    }
    return {
      x: ((e.clientX - rect.left - offX) / imgW) * CANVAS_W,
      y: ((e.clientY - rect.top - offY) / imgH) * CANVAS_H,
    };
  },

  onPointerDown(e) {
    Sound.resume(); // browsers hold the AudioContext suspended until a gesture
    const p = this.eventToCanvas(e);
    if (this.screen === 'menu') { this.onMenuClick(p); return; }
    if (this.screen === 'ceremony') { this.skipCeremony(); return; }
    this.onBoardClick(p);
  },

  onPointerMove(e) {
    if (this.screen !== 'playing' || this.gameOver) { this.hoverCell = null; return; }
    const p = this.eventToCanvas(e);
    const { q, r } = pixelToAxial(p.x, p.y, this.board.size, this.board.origin);
    this.hoverCell = inBounds(this.board, q, r) ? { q, r } : null;
  },

  onMenuClick(p) {
    const b = menuButtonAt(this, p.x, p.y);
    if (!b) return;
    Sound.play('ui_click');
    switch (b.group) {
      case 'size': this.settings.size = b.value; break;
      case 'mode': this.settings.mode = b.value; break;
      case 'ai': this.settings.ai = b.value; break;
      case 'play':
        this.startGame(); // enters the coin-flip ceremony, then the board
        break;
    }
  },

  onBoardClick(p) {
    const inRect = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

    // HUD icon buttons always respond (even mid-conversion / at game over).
    if (inRect(this.soundBtnRect)) { this.cycleSound(); return; }
    if (inRect(this.powerBtnRect)) { Sound.play('ui_click'); this.returnToMenu(); return; }

    // Block board input while a conversion is resolving (turn hasn't advanced yet).
    if (this.busy) return;

    // Finished game: any click returns to the title screen.
    if (this.gameOver) { Sound.play('ui_click'); this.returnToMenu(); return; }

    // Ignore board input during the AI's turn.
    if (!this.isHumanTurn()) return;

    const { q, r } = pixelToAxial(p.x, p.y, this.board.size, this.board.origin);
    const cell = getCell(this.board, q, r);
    if (!cell) { this.clearSelection(); return; }

    if (cell.owner === this.currentPlayer) {
      this.selected = { q, r };
      this.legalDests = legalDestinations(this.board, q, r);
      Sound.play(this.currentPlayer === BUBBLES ? 'click_on_bubble' : 'click_on_crystal');
      return;
    }

    if (this.selected && cell.owner === EMPTY) {
      const dest = this.legalDests.find((d) => d.q === q && d.r === r);
      if (dest) { this.makeMove(this.selected, dest); return; }
    }

    this.clearSelection();
  },

  // ---- Turn flow ---------------------------------------------------------
  makeMove(from, to) {
    const mover = this.currentPlayer;
    const res = applyMove(this.board, from, to, mover);
    Sound.play(res.type === 'clone' ? 'token_clone' : 'token_jump');
    this.pushMoveAnimation(mover, from, to, res.type);
    this.clearSelection();

    if (res.converted.length > 0) {
      // The next turn can't start until the conversion animation finishes.
      this.busy = true;
      this.pushConversionAnimation(mover, to, res.converted, res.type);
    } else {
      this.finishTurn();
    }
  },

  // Advance the turn: immediately for plain moves, or via the conversion
  // animation's onDone so the next turn waits for conversion to complete.
  finishTurn() {
    this.busy = false;
    this.currentPlayer = OPPONENT[this.currentPlayer];
    this.checkGameState();
    if (!this.gameOver && this.settings.mode === 'ai' && this.currentPlayer === this.aiFaction) {
      this.scheduleAI();
    }
  },

  // Conversion animation: a coloured particle stream from the landed token to
  // each converted cell, under which the enemy token shrinks out and the
  // mover's token pops in (10% -> 120% -> 100%).
  pushConversionAnimation(faction, to, converted, moveType) {
    const landing = moveType === 'clone' ? ANIM.CLONE : ANIM.JUMP;
    const lead = Math.max(ANIM.CONVERT_LEAD, landing * 0.6);
    const targets = converted.map((c) => {
      const particles = [];
      for (let i = 0; i < 16; i++) {
        particles.push({
          lateral: Math.random() * 2 - 1,   // fixed position across the cone
          phase: Math.random(),             // start point along the stream
          speed: 0.7 + Math.random() * 0.7,
          plus: i % 2 === 0,                // alternate '+' signs and dots
          psize: 0.7 + Math.random() * 0.7,
        });
      }
      return { q: c.q, r: c.r, particles, stagger: Math.random() * 0.15 };
    });
    this.animations.push({
      type: 'convert', faction,
      from: { q: to.q, r: to.r },   // stream source = the token that just landed
      targets,
      elapsed: 0, delay: 0,
      lead,
      dur: lead + ANIM.CONVERT_STREAM,
      onDone: () => this.finishTurn(),
    });
    this.rebuildOccluded();
  },

  // Cosmetic landing animation (clone bud / jump arc).
  pushMoveAnimation(faction, from, to, type) {
    this.animations.push({
      type: type === 'clone' ? 'clone' : 'jump',
      faction,
      from: { q: from.q, r: from.r },
      to: { q: to.q, r: to.r },
      elapsed: 0, delay: 0,
      dur: type === 'clone' ? ANIM.CLONE : ANIM.JUMP,
    });
    this.rebuildOccluded();
  },

  // Cells an active animation is responsible for drawing (skipped by drawTokens):
  // a landing/spawn cell (`to`) and every converted cell (`targets`).
  rebuildOccluded() {
    if (!this.animations.length) { this.occludedCells = null; return; }
    const occ = new Set();
    for (const a of this.animations) {
      if (a.to) occ.add(hexKey(a.to.q, a.to.r));
      if (a.targets) for (const tg of a.targets) occ.add(hexKey(tg.q, tg.r));
    }
    this.occludedCells = occ;
  },

  advanceAnimations(dt) {
    if (!this.animations.length) return;
    for (const a of this.animations) {
      if (a.delay > 0) {
        a.delay -= dt;
        if (a.delay < 0) { a.elapsed += -a.delay; a.delay = 0; } // carry remainder
      } else {
        a.elapsed += dt;
      }
      // Conversion sfx fires once, when the particle stream begins (after lead),
      // so it lands with the tokens visibly converting rather than on impact.
      if (a.type === 'convert' && !a.soundPlayed && a.delay <= 0 && a.elapsed >= a.lead) {
        a.soundPlayed = true;
        Sound.play(a.faction === BUBBLES ? 'convert_to_bubbles' : 'convert_to_crystal');
      }
    }
    const finished = this.animations.filter((a) => a.elapsed >= a.dur);
    if (finished.length) {
      this.animations = this.animations.filter((a) => a.elapsed < a.dur);
      this.rebuildOccluded();
      for (const a of finished) if (a.onDone) a.onDone();
    }
  },

  checkGameState() {
    const counts = countTokens(this.board);
    if (counts.empty === 0) { this.endGame(); return; }
    if (hasLegalMove(this.board, this.currentPlayer)) return;

    const other = OPPONENT[this.currentPlayer];
    if (hasLegalMove(this.board, other)) {
      fillEmptyCells(this.board, other);
    }
    this.endGame();
  },

  endGame() {
    const c = countTokens(this.board);
    this.gameOver = true;
    if (c.bubbles > c.crystals) this.winner = BUBBLES;
    else if (c.crystals > c.bubbles) this.winner = CRYSTALS;
    else this.winner = 'draw';
    this.winMargin = Math.abs(c.bubbles - c.crystals);
    this.clearSelection();
  },

  // ---- AI turn driver ----------------------------------------------------
  scheduleAI() {
    // Enforce a minimum "thinking" pause even if the move is computed instantly.
    this.aiTimer = AI_DELAY.MIN + Math.random() * (AI_DELAY.MAX - AI_DELAY.MIN);
  },

  performAIMove() {
    const move = (typeof chooseAIMove === 'function')
      ? chooseAIMove(this.board, this.aiFaction, this.settings.ai)
      : this.randomAIMove();
    if (move) this.makeMove(move.from, move.to);
  },

  // Fallback used until ai.js provides chooseAIMove(): pick any legal move.
  randomAIMove() {
    const moves = allLegalMoves(this.board, this.aiFaction);
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  },

  update(dt) {
    this.time += dt;  // drives breathing animations regardless of screen
    this.advanceAnimations(dt);
    if (this.screen === 'ceremony') { this.advanceCeremony(dt); return; }
    if (this.screen !== 'playing' || this.gameOver) return;
    if (this.aiTimer > 0) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 0;
        this.performAIMove();
      }
    }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
