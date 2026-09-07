// game.js — Main game loop, state machine

const Game = (() => {
  const STATE = { TITLE: 'TITLE', PLAYING: 'PLAYING', GAMEOVER: 'GAMEOVER' };
  const BEST_KEY = 'helixfall_best';
  let state = STATE.TITLE;
  let canvas, ctx;
  let lastTime = 0;
  let elapsed = 0;          // seconds since start — shared animation clock
  let score = 0;
  let bestScore = 0;
  let newBest = false;      // set when this run has beaten the stored best
  let fallSpeed = 0;
  let scrollSpeed = 0;      // fall speed actually applied this frame (slow-aware)
  let speedTimer = 0;
  let difficulty = 'normal';
  let shakeX = 0, shakeY = 0, shakeMag = 0;
  let gameoverTimer = 0;
  let gameoverVisible = false;

  // Power-up state
  let slowActive = false, slowTimer = 0;
  let multActive = false, multTimer = 0;
  let purpleActive = false, purpleTimer = 0;
  let purplePrevFallSpeed = 0;   // fall speed before purple activation

  // Score pop
  let scorePop = 1, scorePopTimer = 0;

  // Combo system
  let combo = 0;
  let comboTimer = 0;
  const COMBO_WINDOW = 3.5; // seconds before combo resets

  // Ring pass flash
  let ringFlash = 0;       // alpha 0-1
  let ringFlashColor = '#00e5ff';

  // Speed-up flash
  let speedFlash = 0;

  // Stars
  let stars = [];

  // localStorage can throw (private mode, disabled storage) and can hold junk.
  function loadBest() {
    try {
      const v = parseInt(localStorage.getItem(BEST_KEY), 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }

  function persistBest() {
    try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (e) {}
  }

  function getTime() { return elapsed; }

  function init() {
    canvas = document.getElementById('gameCanvas');
    // The background fill covers every pixel every frame, so an alpha channel on
    // the backing store buys nothing and costs on mobile compositing.
    ctx = canvas.getContext('2d', { alpha: false });
    bestScore = loadBest();
    Quality.init();
    Quality.setOnChange(onQualityChange);
    Glow.warm();
    Atmos.warm();
    Input.init();
    HUD.init();
    Title.init();
    Title.setBestScore(bestScore);
    initStars();
    setupCanvasScale();
    window.addEventListener('resize', setupCanvasScale);
    document.addEventListener('fullscreenchange', setupCanvasScale);
    document.addEventListener('webkitfullscreenchange', setupCanvasScale);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchend', onCanvasTouch, { passive: false });
    // Hover is a mouse-only affordance; touch never sets it.
    canvas.addEventListener('mousemove', onCanvasHover);
    canvas.addEventListener('mouseleave', () => { HUD.clearPointer(); setCursor(false); });
    requestAnimationFrame(loop);
  }

  // The starfield is static geometry whose only animation is a per-star alpha
  // twinkle. Drawing all of it live cost 70 blurred fills a frame. Instead the field
  // is baked once into an offscreen layer, and only the largest stars — the ones
  // where the shimmer actually reads — are drawn live on top.
  let starLayer = null;
  let twinkleStars = [];

  function initStars() {
    const q = Quality.get();
    stars = [];
    for (let i = 0; i < q.starCount; i++) {
      stars.push({
        x: Math.random() * C.CANVAS_W,
        y: Math.random() * C.CANVAS_H,
        r: 0.4 + Math.random() * 1.4,
        alpha: 0.08 + Math.random() * 0.4,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
      });
    }
    bakeStars();
  }

  function bakeStars() {
    const q = Quality.get();
    // Brightest first, so the live-drawn subset is the one worth animating.
    const byR = stars.slice().sort((a, b) => b.r - a.r);
    twinkleStars = byR.slice(0, Math.min(q.starTwinkle, byR.length));
    const baked = byR.slice(twinkleStars.length);

    if (!starLayer) {
      starLayer = document.createElement('canvas');
      starLayer.width  = C.CANVAS_W;
      starLayer.height = C.CANVAS_H;
    }
    const g = starLayer.getContext('2d');
    g.clearRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    g.globalCompositeOperation = 'lighter';
    for (const st of baked) {
      // Baked at mean twinkle brightness — a static star at the average of its
      // cycle is indistinguishable from one mid-cycle.
      Glow.draw(g, '#aaddff', st.x, st.y, st.r, st.alpha * 0.75);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // A tier change alters star counts and the trail length, so the baked layer and
  // anything else sized by the tier is rebuilt.
  function onQualityChange() {
    initStars();
    Title.onQualityChange();
    scoreCache.key = null;
    gameoverCache.key = null;
  }

  // Cached so Input.getRotationDelta does not have to call getBoundingClientRect()
  // every frame, which forces a style/layout flush.
  let cssScale = 1;
  function getScale() { return cssScale; }

  function setupCanvasScale() {
    const W = C.CANVAS_W, H = C.CANVAS_H;
    const winW = window.innerWidth, winH = window.innerHeight;
    const scale = Math.min(winW / W, winH / H);
    cssScale = scale || 1;
    canvas.style.width        = W + 'px';
    canvas.style.height       = H + 'px';
    canvas.style.transform    = `scale(${scale})`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.position     = 'absolute';
    canvas.style.left         = Math.floor((winW - W * scale) / 2) + 'px';
    canvas.style.top          = Math.floor((winH - H * scale) / 2) + 'px';
  }

  // Click path only — one layout flush per tap is fine, and reading the live rect
  // keeps taps accurate even if a resize has not been processed yet.
  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (C.CANVAS_W / rect.width),
      y: (clientY - rect.top)  * (C.CANVAS_H / rect.height),
    };
  }

  function onCanvasHover(e) {
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    HUD.setPointer(x, y);
    setCursor(!!HUD.hitTest(x, y, state === STATE.TITLE ? HUD.KINDS_TITLE : HUD.KINDS_GAME));
  }

  // Only touched on change — assigning canvas.style.cursor every mousemove would
  // dirty style on each event for nothing.
  let cursorPointer = false;
  function setCursor(pointer) {
    if (pointer === cursorPointer) return;
    cursorPointer = pointer;
    canvas.style.cursor = pointer ? 'pointer' : 'default';
  }

  function onCanvasClick(e) {
    // A rotate-drag that happens to end over a button is not a button press.
    if (Input.didDrag()) return;
    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    handleInput(x, y);
  }

  function onCanvasTouch(e) {
    e.preventDefault();
    if (Input.didDrag()) return;
    const t = e.changedTouches[0];
    const { x, y } = getCanvasCoords(t.clientX, t.clientY);
    handleInput(x, y);
  }

  function handleInput(x, y) {
    if (state === STATE.TITLE) {
      const action = Title.handleClick(x, y);
      if (action === 'play')            { GameAudio.sfxButtonClick(); startGame(); }
      else if (action === 'sound')      { GameAudio.sfxButtonClick(); cycleSound(); }
      else if (action === 'fullscreen') { GameAudio.sfxButtonClick(); toggleFullscreen(); }
    } else if (state === STATE.PLAYING || state === STATE.GAMEOVER) {
      // The button column sits above the game-over panel, so a tap it consumes
      // must not also reach the panel underneath.
      const consumed = HUD.handleClick(x, y,
        () => { GameAudio.sfxButtonClick(); goToTitle(); },
        () => { GameAudio.sfxButtonClick(); toggleFullscreen(); },
        () => { GameAudio.sfxButtonClick(); cycleSound(); }
      );
      if (!consumed && state === STATE.GAMEOVER && gameoverVisible) handleGameoverClick(x, y);
    }
  }

  function startGame() {
    difficulty = Title.getDifficulty();
    const diff = C.DIFFICULTY[difficulty];
    fallSpeed  = diff.INITIAL_FALL_SPEED;
    score = 0; speedTimer = 0;
    slowActive = false; multActive = false; purpleActive = false;
    shakeX = 0; shakeY = 0; shakeMag = 0;
    gameoverVisible = false; gameoverTimer = 0;
    scorePop = 1; scorePopTimer = 0;
    combo = 0; comboTimer = 0;
    ringFlash = 0; speedFlash = 0;
    newBest = false;

    Helix.init(difficulty);
    Ball.init();
    Particles.clear();
    Debris.clear();
    Input.reset();
    state = STATE.PLAYING;
    GameAudio.applyMode(HUD.getSoundMode());
    GameAudio.startBgm();
  }

  function cycleSound() {
    HUD.cycleSound();
    GameAudio.applyMode(HUD.getSoundMode());
  }

  function goToTitle() {
    GameAudio.fadeOutBgm(C.BGM_FADE_SEC);
    persistBest();
    state = STATE.TITLE;
    Title.setBestScore(bestScore);
  }

  function loop(timestamp) {
    if (lastTime === 0) lastTime = timestamp;   // first frame has no elapsed time
    const raw = timestamp - lastTime;
    const dt = Math.min(raw / 1000, 0.05);
    lastTime = timestamp;
    elapsed += dt;
    // Only an outright stall is excluded from the sample. Using the dt clamp here
    // would dismiss every frame on a device rendering slower than 20fps, which is
    // precisely the device the tier system exists to help.
    Quality.sample(raw, raw >= C.QUALITY_STALL_MS);
    frameMs = frameMs * 0.9 + raw * 0.1;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  let frameMs = 0;

  function update(dt) {
    if (state === STATE.TITLE) { Title.update(dt); return; }

    if (state === STATE.GAMEOVER) {
      Debris.update(dt);
      Particles.update(dt);
      gameoverTimer += dt;
      if (gameoverTimer * 1000 >= C.GAMEOVER_DELAY) gameoverVisible = true;
      updateShake(dt);
      return;
    }

    // PLAYING
    const rotDelta = Input.getRotationDelta(dt);
    if (rotDelta !== 0) Helix.rotate(rotDelta);

    if (slowActive) { slowTimer -= dt; if (slowTimer <= 0) slowActive = false; }
    if (multActive) { multTimer -= dt; if (multTimer <= 0) multActive = false; }
    if (purpleActive) {
      purpleTimer -= dt;
      if (purpleTimer <= 0) {
        purpleActive = false;
        fallSpeed = purplePrevFallSpeed;
        Ball.setPurpleActive(false);
      }
    }

    // Combo decay
    if (combo > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 0; }
    }

    // Speed escalation
    speedTimer += dt * 1000;
    if (speedTimer >= C.SPEED_INTERVAL) {
      speedTimer -= C.SPEED_INTERVAL;
      const prev = fallSpeed;
      fallSpeed = Math.min(fallSpeed + C.DIFFICULTY[difficulty].SPEED_INCREMENT, C.MAX_FALL_SPEED);
      if (fallSpeed > prev) speedFlash = 0.7; // trigger flash
    }

    scrollSpeed = purpleActive ? fallSpeed * C.POWERUP_PURPLE_SPEED_MULT
      : slowActive ? fallSpeed * C.POWERUP_SLOW_FACTOR : fallSpeed;

    Helix.update(dt, scrollSpeed, difficulty);
    Ball.update(dt, scrollSpeed);
    Debris.update(dt);
    Particles.update(dt);
    updateShake(dt);
    updateScorePop(dt);
    updateStars(dt);
    if (ringFlash > 0) ringFlash -= dt * 5;
    if (speedFlash > 0) speedFlash -= dt * 2.5;
    checkCollisions();
  }

  function updateShake(dt) {
    if (shakeMag > 0) {
      shakeX = (Math.random() - 0.5) * 2 * shakeMag;
      shakeY = (Math.random() - 0.5) * 2 * shakeMag;
      shakeMag *= Math.pow(0.1, dt * C.SHAKE_DECAY);
      if (shakeMag < 0.3) shakeMag = 0;
    } else { shakeX = 0; shakeY = 0; }
  }

  function updateScorePop(dt) {
    if (scorePopTimer > 0) {
      scorePopTimer -= dt;
      scorePop = 1 + 0.35 * Math.sin(Math.max(0, scorePopTimer / 0.22) * Math.PI);
    } else { scorePop = 1; }
  }

  function updateStars(dt) {
    // Only the live-drawn subset animates; the rest is baked into starLayer.
    for (const st of twinkleStars) st.twinkle += st.speed * dt;
  }

  function checkCollisions() {
    const rings = Helix.getRings();
    const ballY = Ball.getY();

    rings.forEach(ring => {
      if (ring.passed) return;
      // The ball rides the front of the tower, so it meets a ring at that ring's
      // nearest point — not its centre. Rings only ever move up, so a single
      // upper bound cannot be stepped over at high fall speeds.
      if (Helix.getRingFrontY(ring) <= ballY + C.BALL_RADIUS) {
        ring.passed = true;

        // The ball is fixed on screen at the front of the tower. Its angle is
        // constant; the segments rotate past it.
        const ballAngle = C.BALL_ANGLE;
        const { type, segIndex }  = Helix.getSegmentAtAngle(ring, ballAngle, difficulty);
        let survived = true;

        if (type === 'gap') {
          incrementCombo();
          addScore(C.SCORE_PER_RING);
          Ball.triggerSquish();

          // Near-miss: a deadly segment whose centre sits within 1.5 segments of
          // the ball — i.e. immediately adjacent. Uses the same angle source as
          // the hit test so hard-mode drift is accounted for.
          const segAngle = (Math.PI * 2) / C.SEGMENT_COUNT;
          let nearMiss = false;
          ring.types.forEach((t, i) => {
            if (t !== 'deadly') return;
            const da = Helix.getSegmentAngle(ring, i, difficulty) + segAngle / 2;
            let dist = Math.abs(((ballAngle - da) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
            if (dist > Math.PI) dist = Math.PI * 2 - dist;
            if (dist < segAngle * 1.5) nearMiss = true;
          });

          if (nearMiss) {
            addScore(C.SCORE_NEAR_MISS_BONUS);
            shakeMag = C.SHAKE_NEAR_MISS;
            if (HUD.isSfxOn()) GameAudio.sfxNearMiss();
            triggerRingFlash('#ff9040');
          } else {
            if (HUD.isSfxOn()) GameAudio.sfxPass();
            const hue = (C.RING_HUE_START + score * C.RING_HUE_SCORE_SCALE) % 360;
            triggerRingFlash(`hsl(${hue},100%,65%)`);
          }
          emitPassParticles(ballY);

        } else if (type === 'deadly') {
          if (Ball.hasShield() || purpleActive) {
            if (Ball.hasShield()) Ball.consumeShield();
            addScore(C.SCORE_PER_RING);
            shakeMag = C.SHAKE_NEAR_MISS;
            if (HUD.isSfxOn()) GameAudio.sfxNearMiss();
            const deadlyParticleColor = purpleActive ? C.POWERUP_PURPLE_COLOR : C.DEADLY_COLOR;
            triggerRingFlash(deadlyParticleColor);
          } else {
            combo = 0;
            survived = false;
            triggerDeath();
          }

        } else if (type === 'powerup') {
          incrementCombo();
          addScore(C.SCORE_PER_RING);
          Ball.triggerSquish();
          applyPowerup(ring.powerupType, ballY);
          triggerRingFlash(
            ring.powerupType === 'shield' ? C.POWERUP_SHIELD_COLOR :
            ring.powerupType === 'slow'   ? C.POWERUP_SLOW_COLOR   :
            ring.powerupType === 'bonus'  ? C.POWERUP_TEAL_COLOR   :
            ring.powerupType === 'purple' ? C.POWERUP_PURPLE_COLOR : C.POWERUP_MULT_COLOR
          );

        } else {
          // Safe solid segment
          incrementCombo();
          addScore(C.SCORE_PER_RING);
          Ball.triggerSquish();
          if (HUD.isSfxOn()) GameAudio.sfxPass();
          emitPassParticles(ballY);
          const hue = (C.RING_HUE_START + score * C.RING_HUE_SCORE_SCALE) % 360;
          triggerRingFlash(`hsl(${hue},100%,65%)`);
        }

        // Anything the ball came through is destroyed behind it. Read the ring
        // before this point — shattering recycles it to the bottom of the tower.
        if (survived) {
          shakeMag = Math.max(shakeMag, C.SHAKE_HIT);
          Helix.shatterRing(ring, score, difficulty, scrollSpeed, segIndex, type);
        }
      }
    });
  }

  function incrementCombo() {
    combo++;
    comboTimer = COMBO_WINDOW;
    // Extra score for high combos
    if (combo > 3) addScore(Math.floor(combo / 3) * 2);
  }

  function triggerRingFlash(color) {
    ringFlash = 1;
    ringFlashColor = color;
  }

  function addScore(amount, useMultiplier = true) {
    score += amount * (useMultiplier && multActive ? 2 : 1);
    scorePopTimer = 0.22;
    // Track the best live for the HUD, but only write storage when a run ends.
    if (score > bestScore) { bestScore = score; newBest = true; }
  }

  function emitPassParticles(ballY) {
    const hue = (C.RING_HUE_START + score * C.RING_HUE_SCORE_SCALE) % 360;
    // Quantized: the hue drifts continuously with score, and an unbounded set of
    // colour strings would mean an unbounded set of baked glow sprites.
    Particles.emitRing(C.TOWER_CX, ballY, Glow.quantHue(hue, 100, 65));
  }

  function applyPowerup(type, y) {
    if (HUD.isSfxOn()) GameAudio.sfxPowerup(type);
    if (type === 'shield')     { Ball.activateShield(); }
    else if (type === 'slow')  { slowActive = true; slowTimer = C.POWERUP_SLOW_DURATION / 1000; }
    else if (type === 'mult')  { multActive = true; multTimer = C.POWERUP_MULT_DURATION / 1000; }
    else if (type === 'bonus') { addScore(Math.floor(score * 0.1), false); }
    else if (type === 'purple') {
      purpleActive = true;
      purpleTimer = C.POWERUP_PURPLE_DURATION / 1000;
      purplePrevFallSpeed = fallSpeed;
      Ball.setPurpleActive(true);
    }
  }

  function triggerDeath() {
    shakeMag = C.SHAKE_DEATH;
    if (HUD.isSfxOn()) GameAudio.sfxDeath();
    Particles.emitDeath(C.TOWER_CX, Ball.getY());
    state = STATE.GAMEOVER;
    gameoverTimer = 0;
    gameoverVisible = false;
    persistBest();
  }

  // Screen-space top-left of the panel. Shared by the blit and the hit test.
  function gameoverPanelOrigin() {
    return {
      x: C.CANVAS_W / 2 - C.GO_PANEL_W / 2,
      y: C.CANVAS_H / 2 - C.GO_PANEL_H / 2 + C.GO_PANEL_DY,
    };
  }

  function handleGameoverClick(x, y) {
    const o = gameoverPanelOrigin();
    const cx = C.CANVAS_W / 2;

    const paX = cx - C.GO_PLAY_W / 2, paY = o.y + C.GO_PLAY_Y;
    if (x >= paX && x <= paX + C.GO_PLAY_W && y >= paY && y <= paY + C.GO_PLAY_H) {
      GameAudio.sfxButtonClick(); startGame(); return;
    }

    const qX = cx - C.GO_QUIT_W / 2, qY = o.y + C.GO_QUIT_Y;
    if (x >= qX && x <= qX + C.GO_QUIT_W && y >= qY && y <= qY + C.GO_QUIT_H) {
      GameAudio.sfxButtonClick(); goToTitle();
    }
  }

  // Read live from the document rather than tracking a flag, so leaving fullscreen
  // via Esc or F11 keeps the button's glyph in sync for free.
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // Toggles the <html> element, not the canvas: the UA stylesheet forces a
  // fullscreen element to 100% width/height, which would break the fixed-size box
  // this game's transform-based scaling is built on.
  function toggleFullscreen() {
    if (isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // Rejects when the embedding page withholds allow="fullscreen".
    if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  // Both background gradients are fixed geometry — build them once.
  let bgGrad = null, vigGrad = null;

  function drawBackground() {
    if (!bgGrad) {
      bgGrad = ctx.createRadialGradient(
        C.CANVAS_W / 2, C.CANVAS_H * 0.38, 50,
        C.CANVAS_W / 2, C.CANVAS_H / 2, C.CANVAS_H
      );
      bgGrad.addColorStop(0, '#0f0f2e');
      bgGrad.addColorStop(0.5, '#080818');
      bgGrad.addColorStop(1, '#030308');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    if (starLayer) ctx.drawImage(starLayer, 0, 0);
    if (twinkleStars.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const st of twinkleStars) {
        Glow.draw(ctx, '#aaddff', st.x, st.y, st.r,
                  st.alpha * (0.5 + 0.5 * Math.sin(st.twinkle)));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Speed-up flash — red edge vignette
    if (speedFlash > 0) {
      const sv = ctx.createRadialGradient(
        C.CANVAS_W / 2, C.CANVAS_H / 2, C.CANVAS_H * 0.2,
        C.CANVAS_W / 2, C.CANVAS_H / 2, C.CANVAS_H * 0.85
      );
      sv.addColorStop(0, 'rgba(0,0,0,0)');
      sv.addColorStop(1, `rgba(200,20,20,${speedFlash * 0.45})`);
      ctx.fillStyle = sv;
      ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    }

    // Vignette
    if (!vigGrad) {
      vigGrad = ctx.createRadialGradient(
        C.CANVAS_W / 2, C.CANVAS_H / 2, C.CANVAS_H * 0.25,
        C.CANVAS_W / 2, C.CANVAS_H / 2, C.CANVAS_H * 0.78
      );
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.52)');
    }
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
  }

  // Horizontal flash bar at ball Y when passing through a ring
  // A baked falloff strip stands in for the bar's 20px shadow — one blit, and a
  // genuinely smooth gradient rather than the visible steps stacked bands left.
  const FLASH_HALF = 22;

  function drawRingFlash() {
    if (ringFlash <= 0) return;
    Glow.drawBar(ctx, ringFlashColor, Ball.getY(), FLASH_HALF, C.CANVAS_W,
                 ringFlash * 0.7);
    ctx.globalAlpha = 1;
  }

  // Thin speed bar at bottom of screen
  function drawSpeedBar() {
    const maxSpd = C.MAX_FALL_SPEED;
    const minSpd = C.DIFFICULTY[difficulty].INITIAL_FALL_SPEED;
    const pct    = Math.max(0, Math.min(1, (fallSpeed - minSpd) / (maxSpd - minSpd)));
    const barW   = C.CANVAS_W - 40;
    const barH   = 3;
    const bx     = 20, by = C.CANVAS_H - 14;

    ctx.save();
    // Track
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    UI.roundRect(ctx, bx, by, barW, barH, 2);
    ctx.fill();

    // Fill — hue shifts cyan → red as speed increases
    if (pct > 0) {
      const barHue = 180 - pct * 160;
      // A faint wider band replaces the 6px shadow — imperceptible on a 3px bar.
      ctx.fillStyle   = `hsl(${barHue}, 100%, 65%)`;
      ctx.globalAlpha = 0.22;
      UI.roundRect(ctx, bx, by - 2, barW * pct, barH + 4, 3);
      ctx.fill();
      ctx.fillStyle   = `hsl(${barHue}, 100%, 55%)`;
      ctx.globalAlpha = 0.7;
      UI.roundRect(ctx, bx, by, barW * pct, barH, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Combo display
  // Only the alpha animates between ring passes, so the glowing label is baked per
  // combo value and blitted.
  const comboCache = { key: null, canvas: null };

  function drawCombo() {
    if (combo < 2) return;
    const cx    = C.CANVAS_W / 2;
    const alpha = Math.min(1, comboTimer / 0.6);
    const key   = String(combo);

    if (comboCache.key !== key) {
      if (!comboCache.canvas) comboCache.canvas = document.createElement('canvas');
      const c = comboCache.canvas;
      const w = 220, h = 60;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.textAlign    = 'center';
      g.textBaseline = 'middle';
      const comboScale = 1 + Math.min(combo * 0.04, 0.5);
      g.font         = `bold ${Math.floor(15 * comboScale)}px monospace`;
      g.shadowBlur   = 14;
      g.shadowColor  = C.POWERUP_MULT_COLOR;
      g.fillStyle    = C.POWERUP_MULT_COLOR;
      g.fillText(`${combo}×  COMBO`, w / 2, h / 2);
      comboCache.key = key;
    }

    const c = comboCache.canvas;
    ctx.globalAlpha = alpha * 0.9;
    ctx.drawImage(c, cx - c.width / 2, C.TOWER_BALL_Y - 40 - c.height / 2);
    ctx.globalAlpha = 1;
  }

  // The score glyphs carry a 24px glow, and the string changes at most a few times a
  // second while the frame redraws sixty. Bake on change, blit otherwise; scorePop is
  // applied through the blit's destination size so the pop costs nothing extra.
  const scoreCache = { key: null, canvas: null, w: 0, h: 0 };
  const SCORE_PAD = 34;   // room for the glow around the glyphs

  function bakeScore() {
    const key = score + '|' + (newBest ? 1 : 0) + '|' + (multActive ? 1 : 0);
    if (scoreCache.key === key) return;

    if (!scoreCache.canvas) scoreCache.canvas = document.createElement('canvas');
    const c = scoreCache.canvas;
    // Width is generous: the widest score plus glow padding on both sides.
    const w = 260, h = 110;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);

    g.textAlign    = 'center';
    g.textBaseline = 'top';
    g.font         = C.SCORE_FONT;
    g.shadowBlur   = 24;
    g.shadowColor  = multActive ? C.POWERUP_MULT_COLOR : '#00e5ff';
    g.fillStyle    = multActive ? C.POWERUP_MULT_COLOR : '#ffffff';
    g.fillText(score, w / 2, SCORE_PAD);

    if (newBest) {
      g.font        = 'bold 11px monospace';
      g.shadowBlur  = 8;
      g.shadowColor = C.POWERUP_MULT_COLOR;
      g.fillStyle   = C.POWERUP_MULT_COLOR;
      g.fillText('NEW BEST', w / 2, SCORE_PAD + 50);
    }

    scoreCache.key = key;
    scoreCache.w = w;
    scoreCache.h = h;
  }

  function drawScore() {
    bakeScore();
    const cx  = C.CANVAS_W / 2;
    const top = C.HUD_MARGIN + 2 - SCORE_PAD;
    const w = scoreCache.w, h = scoreCache.h;

    if (scorePop !== 1) {
      // Pop about the same anchor the live-drawn version used.
      const ax = cx, ay = C.HUD_MARGIN + 2 + 24;
      const dw = w * scorePop, dh = h * scorePop;
      ctx.drawImage(scoreCache.canvas,
        ax - (ax - (cx - w / 2)) * scorePop, ay - (ay - top) * scorePop, dw, dh);
    } else {
      ctx.drawImage(scoreCache.canvas, cx - w / 2, top, w, h);
    }
  }

  // The game-over panel is a stack of glowing text and gradient buttons that never
  // changes once it appears — score, best and newBest are all fixed at death. Bake
  // the whole panel once and blit it; only the dimming overlay is drawn live.
  //
  // Layout, top to bottom: a header band carrying "GAME OVER" as a small tracked
  // label; the run's score as the largest element on the panel; a new-best badge in
  // a reserved slot; a two-cell stat row for best and mode; then the two actions at
  // the same width, so the button block reads as one column.
  const gameoverCache = { key: null, canvas: null };
  const GO_PAD = 54;   // room for the panel's glow

  // A centred pill holding an optional bright value and a small tracked label. The
  // pill is sized to its own content rather than to a fixed width, so "NEW BEST"
  // and "1240 TO BEAT" both come out snug.
  function drawVerdictPill(g, cx, label, value, color, star) {
    const bh = C.GO_BADGE_H, by = C.GO_BADGE_Y;

    g.textBaseline = 'middle';
    g.font = 'bold 10px monospace';
    const labelW = UI.trackedWidth(g, label, 2.5);
    g.font = 'bold 13px monospace';
    const valueW = value ? g.measureText(value).width : 0;
    const starR  = star ? 4.5 : 0;
    const gap    = 9;
    const runW   = (star ? starR * 2 + gap : 0) + (value ? valueW + gap : 0) + labelW;
    const bw     = runW + 30;
    const bx     = cx - bw / 2;
    let   x      = cx - runW / 2;
    const midY   = by + bh / 2;

    g.fillStyle   = star ? 'rgba(255,215,64,0.13)' : 'rgba(255,255,255,0.045)';
    g.strokeStyle = star ? 'rgba(255,215,64,0.5)'  : 'rgba(150,180,220,0.26)';
    g.lineWidth   = 1;
    UI.roundRect(g, bx, by, bw, bh, bh / 2);
    g.fill();
    g.stroke();

    g.shadowBlur  = 8;
    g.shadowColor = color;
    if (star) {
      g.fillStyle = color;
      UI.starGlyph(g, x + starR, midY, starR);
      x += starR * 2 + gap;
    }
    if (value) {
      g.font      = 'bold 13px monospace';
      g.fillStyle = color;
      g.textAlign = 'left';
      g.fillText(value, x, midY + 1);
      g.textAlign = 'center';
      x += valueW + gap;
    }
    g.shadowBlur = star ? 8 : 0;
    g.font       = 'bold 10px monospace';
    g.fillStyle  = star ? color : 'rgba(255,255,255,0.38)';
    UI.fillTracked(g, label, x + labelW / 2, midY + 1, 2.5);

    g.shadowBlur   = 0;
    g.textBaseline = 'alphabetic';
  }

  function bakeGameover() {
    const pw = C.GO_PANEL_W, ph = C.GO_PANEL_H;
    const key = score + '|' + bestScore + '|' + (newBest ? 1 : 0) + '|' + difficulty;
    if (gameoverCache.key === key) return;

    if (!gameoverCache.canvas) gameoverCache.canvas = document.createElement('canvas');
    const c = gameoverCache.canvas;
    const w = pw + GO_PAD * 2, h = ph + GO_PAD * 2;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    // This canvas is reused across runs, and getContext hands back the *same*
    // context with whatever transform the last bake left on it. Reset before
    // clearing: clearRect works in the current transform space, so an inherited
    // translate would clear the wrong region and leave the previous panel behind.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    // Draw in panel-local coordinates: origin at the panel's top-left.
    g.save();
    g.translate(GO_PAD, GO_PAD);

    const cx  = pw / 2;
    const isNewBest = newBest;
    const R   = 22;
    const accent = isNewBest ? C.POWERUP_MULT_COLOR : '#00e5ff';

    // ── Panel body ────────────────────────────────────────────────────────
    // A vertical gradient rather than a flat fill, so the panel has a lit top
    // edge and settles into the dimmed play field at its foot.
    g.shadowBlur  = 20;
    g.shadowColor = isNewBest ? C.POWERUP_MULT_COLOR : C.DEADLY_COLOR;
    const body = g.createLinearGradient(0, 0, 0, ph);
    body.addColorStop(0,    'rgba(18,20,44,0.95)');
    body.addColorStop(0.55, 'rgba(11,12,30,0.93)');
    body.addColorStop(1,    'rgba(7,8,20,0.95)');
    g.fillStyle = body;
    UI.roundRect(g, 0, 0, pw, ph, R);
    g.fill();
    g.shadowBlur = 0;

    g.strokeStyle = isNewBest ? 'rgba(255,215,64,0.42)' : 'rgba(150,180,220,0.20)';
    g.lineWidth   = isNewBest ? 1.75 : 1.25;
    UI.roundRect(g, 0, 0, pw, ph, R);
    g.stroke();

    // ── Header band ───────────────────────────────────────────────────────
    // Clipped to the panel so its fill follows the top two corner radii.
    g.save();
    UI.roundRect(g, 0, 0, pw, ph, R);
    g.clip();
    const hdr = g.createLinearGradient(0, 0, 0, C.GO_HEADER_H);
    hdr.addColorStop(0, 'rgba(255,23,68,0.16)');
    hdr.addColorStop(1, 'rgba(255,23,68,0)');
    g.fillStyle = hdr;
    g.fillRect(0, 0, pw, C.GO_HEADER_H);
    g.restore();

    // "GAME" white, "OVER" red, laid out as one tracked run so the two words stay
    // centred together rather than each being centred on its own.
    g.textBaseline = 'alphabetic';
    g.font        = 'bold 23px monospace';
    const tt      = 5, wordGap = 14;
    const wGame   = UI.trackedWidth(g, 'GAME', tt);
    const wOver   = UI.trackedWidth(g, 'OVER', tt);
    const hSX     = cx - (wGame + wordGap + wOver) / 2;
    g.shadowBlur  = 20;
    g.shadowColor = C.DEADLY_COLOR;
    g.fillStyle   = '#ffffff';
    UI.fillTracked(g, 'GAME', hSX + wGame / 2, C.GO_TITLE_Y, tt);
    g.fillStyle   = C.DEADLY_COLOR;
    UI.fillTracked(g, 'OVER', hSX + wGame + wordGap + wOver / 2, C.GO_TITLE_Y, tt);
    g.shadowBlur  = 0;

    // Underline the band, brightest in the middle: a flat hairline across a
    // 322px panel reads as a hard seam, a fading one reads as a light break.
    const seam = g.createLinearGradient(0, 0, pw, 0);
    seam.addColorStop(0,   'rgba(255,23,68,0)');
    seam.addColorStop(0.5, 'rgba(255,23,68,0.5)');
    seam.addColorStop(1,   'rgba(255,23,68,0)');
    UI.rule(g, 1, pw - 1, C.GO_HEADER_H, seam);

    // ── Score ─────────────────────────────────────────────────────────────
    g.font        = 'bold 9px monospace';
    g.shadowBlur  = 0;
    g.fillStyle   = 'rgba(255,255,255,0.34)';
    UI.fillTracked(g, 'SCORE', cx, C.GO_SCORE_LABEL_Y, 3.5);

    g.font        = 'bold 56px monospace';
    g.shadowBlur  = 26;
    g.shadowColor = accent;
    g.fillStyle   = isNewBest ? C.POWERUP_MULT_COLOR : '#ffffff';
    UI.fillTracked(g, String(score), cx, C.GO_SCORE_Y, 1);
    g.shadowBlur  = 0;

    // ── Verdict pill ──────────────────────────────────────────────────────
    // One slot, two readings: a run that beat the record gets a gold badge, and one
    // that did not gets the gap it has to close. Either way the slot is filled, so
    // the panel has no hole in it and the player leaves with a target.
    // The one case with nothing to say is a 0 against a 0.
    const behind = bestScore - score;
    if (isNewBest)      drawVerdictPill(g, cx, 'NEW BEST', null, C.POWERUP_MULT_COLOR, true);
    else if (behind > 0) drawVerdictPill(g, cx, 'TO BEAT', String(behind), '#8ff2ff', false);

    // ── Stat row ──────────────────────────────────────────────────────────
    // Two cells, hairline-framed: the run in context (best) and the run's terms
    // (mode). Symmetrical cells are what make this read as a scoreboard.
    const hair = 'rgba(150,180,220,0.16)';
    UI.rule(g, 24, pw - 24, C.GO_STATS_TOP, hair);
    UI.rule(g, 24, pw - 24, C.GO_STATS_BOTTOM, hair);
    g.strokeStyle = hair;
    g.lineWidth   = 1;
    g.beginPath();
    g.moveTo(Math.round(cx) + 0.5, C.GO_STATS_TOP + 9);
    g.lineTo(Math.round(cx) + 0.5, C.GO_STATS_BOTTOM - 9);
    g.stroke();

    const cellMid = [cx / 2 + 12, cx + cx / 2 - 12];
    const labelY  = C.GO_STATS_TOP + 21;
    const valueY  = C.GO_STATS_TOP + 43;
    const cells = [
      ['BEST', String(bestScore), isNewBest ? C.POWERUP_MULT_COLOR : '#8ff2ff'],
      ['MODE', difficulty.toUpperCase(), C.DIFF_COLORS[difficulty] || '#8ff2ff'],
    ];
    cells.forEach(([label, value, color], i) => {
      g.font      = 'bold 8px monospace';
      g.fillStyle = 'rgba(255,255,255,0.3)';
      UI.fillTracked(g, label, cellMid[i], labelY, 2.5);
      g.font        = 'bold 16px monospace';
      g.shadowBlur  = 8;
      g.shadowColor = color;
      g.fillStyle   = color;
      UI.fillTracked(g, value, cellMid[i], valueY, 1);
      g.shadowBlur  = 0;
    });

    // ── Play again (primary) ──────────────────────────────────────────────
    const paW = C.GO_PLAY_W, paH = C.GO_PLAY_H;
    const paX = cx - paW / 2, paY = C.GO_PLAY_Y, paR = 15;
    const paGrad = g.createLinearGradient(paX, paY, paX, paY + paH);
    paGrad.addColorStop(0,    '#22d8ee');
    paGrad.addColorStop(0.52, '#00bcd8');
    paGrad.addColorStop(1,    '#0079a0');
    g.shadowBlur  = 22;
    g.shadowColor = '#00e5ff';
    g.fillStyle   = paGrad;
    UI.roundRect(g, paX, paY, paW, paH, paR);
    g.fill();
    g.shadowBlur = 0;

    UI.topHighlight(g, paX, paY, paW, paH, paR, 0.32);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth   = 1.5;
    UI.roundRect(g, paX, paY, paW, paH, paR);
    g.stroke();

    g.textBaseline = 'middle';
    g.font         = 'bold 19px monospace';
    const paLblW = UI.trackedWidth(g, 'PLAY AGAIN', 2.5);
    const paGH   = 8.5, paGW = paGH * 1.05, paGap = 13;
    const paRun  = paGW + paGap + paLblW;
    const paSX   = cx - paRun / 2, paMY = paY + paH / 2;
    g.fillStyle   = '#ffffff';
    g.shadowBlur  = 11;
    g.shadowColor = '#ffffff';
    UI.playGlyph(g, paSX + paGW / 2, paMY, paGH);
    UI.fillTracked(g, 'PLAY AGAIN', paSX + paGW + paGap + paLblW / 2, paMY + 1, 2.5);
    g.shadowBlur = 0;

    // ── Quit (secondary) ──────────────────────────────────────────────────
    // Same width as the primary, ghosted rather than filled: the pair reads as a
    // ranked column instead of two unrelated chips.
    const qW = C.GO_QUIT_W, qH = C.GO_QUIT_H;
    const qX = cx - qW / 2, qY = C.GO_QUIT_Y;
    g.fillStyle   = 'rgba(255,255,255,0.045)';
    g.strokeStyle = 'rgba(150,180,220,0.28)';
    g.lineWidth   = 1;
    UI.roundRect(g, qX, qY, qW, qH, 12);
    g.fill();
    g.stroke();
    g.font      = 'bold 13px monospace';
    g.fillStyle = 'rgba(230,238,248,0.62)';
    UI.fillTracked(g, 'QUIT', cx, qY + qH / 2 + 1, 3);

    g.restore();
    gameoverCache.key = key;
  }

  function drawGameover() {
    if (!gameoverVisible) return;
    bakeGameover();

    const o = gameoverPanelOrigin();

    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    ctx.drawImage(gameoverCache.canvas, o.x - GO_PAD, o.y - GO_PAD);
  }

  function render() {
    // No clearRect: both states paint an opaque full-screen background first, and
    // the context has no alpha channel to clear.
    if (state === STATE.TITLE) {
      Title.draw(ctx);
      if (DEBUG) drawDebug();
      return;
    }

    ctx.save();
    if (shakeMag > 0.3) ctx.translate(shakeX, shakeY);

    drawBackground();
    Helix.draw(ctx, score, difficulty);
    Debris.draw(ctx);
    drawRingFlash();
    Particles.draw(ctx);
    Ball.draw(ctx);
    drawCombo();
    drawScore();
    drawSpeedBar();

    if (state === STATE.GAMEOVER) drawGameover();

    // Last, so the button column stays legible above the game-over overlay —
    // it dims everything under it by 68%, and the buttons remain live there.
    HUD.draw(ctx, multActive, Ball.hasShield(), slowActive, purpleActive);

    ctx.restore();

    if (DEBUG) drawDebug();
  }

  // ── Debug overlay ─────────────────────────────────────────────────────────
  // Instrumentation for profiling on device. Gated behind ?debug so it never ships
  // to players.
  const DEBUG = (() => {
    try { return /[?&]debug(?:=|&|$)/.test(location.search); } catch (e) { return false; }
  })();

  function drawDebug() {
    let visibleRings = 0;
    if (state !== STATE.TITLE) {
      for (const r of Helix.getRings()) {
        if (r.y >= -C.RING_SPACING && r.y <= C.CANVAS_H + C.RING_SPACING) visibleRings++;
      }
    }
    const lines = [
      `${frameMs.toFixed(1)}ms  (${(1000 / Math.max(frameMs, 0.001)).toFixed(0)}fps)`,
      `tier ${Quality.name()}  avg ${Quality.avgMs().toFixed(1)}ms`,
      `rings ${visibleRings}  debris ${Debris.count()}`,
      `parts ${Particles.count()}  sprites ${Glow.count()}`,
    ];

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(6, C.CANVAS_H - 74, 186, 68);
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = frameMs > 20 ? '#ff6b6b' : '#8fe388';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 12, C.CANVAS_H - 70 + i * 16);
    }
    ctx.restore();
  }

  return { init, getTime, getScale, isFullscreen };
})();
