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
    ctx = canvas.getContext('2d');
    bestScore = loadBest();
    Input.init();
    HUD.init();
    Title.init();
    Title.setBestScore(bestScore);
    initStars();
    setupCanvasScale();
    window.addEventListener('resize', setupCanvasScale);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchend', onCanvasTouch, { passive: false });
    requestAnimationFrame(loop);
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * C.CANVAS_W,
        y: Math.random() * C.CANVAS_H,
        r: 0.4 + Math.random() * 1.4,
        alpha: 0.08 + Math.random() * 0.4,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
      });
    }
  }

  function setupCanvasScale() {
    const W = C.CANVAS_W, H = C.CANVAS_H;
    const winW = window.innerWidth, winH = window.innerHeight;
    const scale = Math.min(winW / W, winH / H);
    canvas.style.width        = W + 'px';
    canvas.style.height       = H + 'px';
    canvas.style.transform    = `scale(${scale})`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.position     = 'absolute';
    canvas.style.left         = Math.floor((winW - W * scale) / 2) + 'px';
    canvas.style.top          = Math.floor((winH - H * scale) / 2) + 'px';
  }

  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (C.CANVAS_W / rect.width),
      y: (clientY - rect.top)  * (C.CANVAS_H / rect.height),
    };
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
      if (action === 'play') { GameAudio.sfxButtonClick(); startGame(); }
    } else if (state === STATE.PLAYING || state === STATE.GAMEOVER) {
      HUD.handleClick(x, y,
        () => { GameAudio.sfxButtonClick(); goToTitle(); },
        () => { GameAudio.sfxButtonClick(); toggleFullscreen(); },
        () => { GameAudio.sfxButtonClick(); HUD.cycleSound(); GameAudio.applyMode(HUD.getSoundMode()); }
      );
      if (state === STATE.GAMEOVER && gameoverVisible) handleGameoverClick(x, y);
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
  }

  function goToTitle() {
    GameAudio.stopGameMusic();
    persistBest();
    state = STATE.TITLE;
    Title.setBestScore(bestScore);
  }

  function loop(timestamp) {
    if (lastTime === 0) lastTime = timestamp;   // first frame has no elapsed time
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;
    elapsed += dt;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

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
    stars.forEach(s => { s.twinkle += s.speed * dt; });
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
    Particles.emitRing(C.TOWER_CX, ballY, `hsl(${hue}, 100%, 65%)`);
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
    GameAudio.stopGameMusic();
    persistBest();
  }

  function handleGameoverClick(x, y) {
    const cx = C.CANVAS_W / 2;
    const paW = 200, paH = 52;
    const pw = 300, ph = 340;
    const px = cx - pw / 2, py = C.CANVAS_H / 2 - ph / 2 - 20;
    const paX = cx - paW / 2, paY = py + 236;
    if (x >= paX && x <= paX + paW && y >= paY && y <= paY + paH) {
      GameAudio.sfxButtonClick(); startGame(); return;
    }
    const qW = 130, qH = 40;
    const qX = cx - qW / 2, qY = py + 300;
    if (x >= qX && x <= qX + qW && y >= qY && y <= qY + qH) {
      GameAudio.sfxButtonClick(); goToTitle();
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
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

    stars.forEach(s => {
      const a = s.alpha * (0.5 + 0.5 * Math.sin(s.twinkle));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = s.r * 4;
      ctx.shadowColor = '#aaddff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

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
  function drawRingFlash() {
    if (ringFlash <= 0) return;
    const ballY = Ball.getY();
    ctx.save();
    ctx.globalAlpha = ringFlash * 0.55;
    ctx.fillStyle   = ringFlashColor;
    ctx.shadowBlur  = 20;
    ctx.shadowColor = ringFlashColor;
    ctx.fillRect(0, ballY - 3, C.CANVAS_W, 6);
    ctx.restore();
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
    roundRect(ctx, bx, by, barW, barH, 2);
    ctx.fill();

    // Fill — hue shifts cyan → red as speed increases
    if (pct > 0) {
      const barHue = 180 - pct * 160;
      ctx.fillStyle   = `hsl(${barHue}, 100%, 55%)`;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = `hsl(${barHue}, 100%, 65%)`;
      ctx.globalAlpha = 0.7;
      roundRect(ctx, bx, by, barW * pct, barH, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Combo display
  function drawCombo() {
    if (combo < 2) return;
    const cx    = C.CANVAS_W / 2;
    const alpha = Math.min(1, comboTimer / 0.6);
    ctx.save();
    ctx.globalAlpha  = alpha * 0.9;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const comboScale = 1 + Math.min(combo * 0.04, 0.5);
    ctx.font         = `bold ${Math.floor(15 * comboScale)}px monospace`;
    ctx.shadowBlur   = 14;
    ctx.shadowColor  = C.POWERUP_MULT_COLOR;
    ctx.fillStyle    = C.POWERUP_MULT_COLOR;
    ctx.fillText(`${combo}×  COMBO`, cx, C.TOWER_BALL_Y - 40);
    ctx.restore();
  }

  function drawScore() {
    const cx  = C.CANVAS_W / 2;
    const top = C.HUD_MARGIN + 2;

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    if (scorePop !== 1) {
      ctx.translate(cx, top + 24);
      ctx.scale(scorePop, scorePop);
      ctx.translate(-cx, -(top + 24));
    }

    ctx.font        = C.SCORE_FONT;
    ctx.shadowBlur  = 24;
    ctx.shadowColor = multActive ? C.POWERUP_MULT_COLOR : '#00e5ff';
    ctx.fillStyle   = multActive ? C.POWERUP_MULT_COLOR : '#ffffff';
    ctx.fillText(score, cx, top);

    if (newBest) {
      ctx.font       = 'bold 11px monospace';
      ctx.shadowBlur = 8;
      ctx.shadowColor = C.POWERUP_MULT_COLOR;
      ctx.fillStyle  = C.POWERUP_MULT_COLOR;
      ctx.fillText('NEW BEST', cx, top + 50);
    }

    ctx.restore();
  }

  function drawGameover() {
    if (!gameoverVisible) return;
    const cx  = C.CANVAS_W / 2;
    const pw  = 300, ph = 340;
    const px  = cx - pw / 2, py = C.CANVAS_H / 2 - ph / 2 - 20;
    const isNewBest = newBest;

    ctx.save();

    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    // Panel
    ctx.fillStyle   = 'rgba(10,10,30,0.88)';
    ctx.strokeStyle = isNewBest ? `rgba(255,215,0,0.35)` : 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = isNewBest ? 2 : 1.5;
    ctx.shadowBlur  = isNewBest ? 30 : 40;
    ctx.shadowColor = isNewBest ? C.POWERUP_MULT_COLOR : C.DEADLY_COLOR;
    roundRect(ctx, px, py, pw, ph, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    // GAME OVER
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 52px monospace';
    ctx.shadowBlur  = 28;
    ctx.shadowColor = C.DEADLY_COLOR;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText('GAME', cx, py + 60);
    ctx.fillStyle   = C.DEADLY_COLOR;
    ctx.fillText('OVER', cx, py + 118);

    // Score
    ctx.shadowColor = isNewBest ? C.POWERUP_MULT_COLOR : '#00e5ff';
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = isNewBest ? C.POWERUP_MULT_COLOR : '#ffffff';
    ctx.font        = 'bold 30px monospace';
    ctx.fillText(score, cx, py + 166);

    if (isNewBest) {
      ctx.font       = 'bold 12px monospace';
      ctx.shadowBlur = 10;
      ctx.fillStyle  = C.POWERUP_MULT_COLOR;
      ctx.fillText('★  NEW BEST  ★', cx, py + 200);
    } else {
      ctx.font       = 'bold 13px monospace';
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.4)';
      ctx.fillText(`BEST  ${bestScore}`, cx, py + 202);
    }

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px + 30, py + 222);
    ctx.lineTo(px + pw - 30, py + 222);
    ctx.stroke();

    // Play Again
    const paW = 200, paH = 52;
    const paX = cx - paW / 2, paY = py + 236;
    const paGrad = ctx.createLinearGradient(paX, paY, paX, paY + paH);
    paGrad.addColorStop(0, '#00c8e0');
    paGrad.addColorStop(1, '#007a96');
    ctx.shadowBlur  = 18;
    ctx.shadowColor = '#00e5ff';
    ctx.fillStyle   = paGrad;
    roundRect(ctx, paX, paY, paW, paH, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 0;
    roundRect(ctx, paX, paY, paW, paH, 13);
    ctx.stroke();
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 19px monospace';
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#ffffff';
    ctx.fillText('▶  PLAY AGAIN', cx, paY + paH / 2 + 1);

    // Quit
    const qW = 130, qH = 40;
    const qX = cx - qW / 2, qY = py + 300;
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.07)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth   = 1;
    roundRect(ctx, qX, qY, qW, qH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle  = 'rgba(255,255,255,0.48)';
    ctx.font       = 'bold 14px monospace';
    ctx.fillText('QUIT', cx, qY + qH / 2 + 1);

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, C.CANVAS_W, C.CANVAS_H);

    if (state === STATE.TITLE) { Title.draw(ctx); return; }

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
    HUD.draw(ctx, multActive, Ball.hasShield(), slowActive, purpleActive);

    if (state === STATE.GAMEOVER) drawGameover();

    ctx.restore();
  }

  return { init, getTime };
})();
