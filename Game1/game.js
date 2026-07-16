// ─── Balance constants ────────────────────────────────────────────────────────
const CANVAS_W = 800;
const CANVAS_H = 600;

const BUBBLE_BLUE_RADIUS   = 28;
const BUBBLE_RED_RADIUS    = 24;
const BUBBLE_PURPLE_RADIUS = 20;

const BUBBLE_BLUE_DRIFT_SPEED   = 60;  // px/s
const BUBBLE_RED_DRIFT_SPEED    = 50;
const BUBBLE_PURPLE_DRIFT_SPEED = 60;
const BUBBLE_PURPLE_FLY_SPEED   = 120; // 2x drift speed
const BUBBLE_SPEED_VARIANCE     = 0.2; // +-20 % randomisation on drift speed at spawn

const BLUE_EXPLODE_MULT   = 2.0;
const RED_EXPLODE_MULT    = 5.0;
const PURPLE_EXPLODE_MULT = 5.8;

const SPAWN_INITIAL           = 15;
const SPAWN_INTERVAL_BASE     = 750;  // ms
const SPAWN_INTERVAL_VARIANCE = 100;  // ms (+--)
const SPAWN_ACCEL             = -10;  // ms/s (timed mode)

const RED_APPEAR_TIME    = 5;    // seconds
const PURPLE_APPEAR_TIME = 10;   // seconds

const RED_SPAWN_CHANCE    = 0.15; // per spawn event once unlocked
const PURPLE_SPAWN_CHANCE = 0.10;

const EXPLOSION_DURATION  = 0.4;  // seconds
const SPAWN_ANIM_DURATION = 0.35; // seconds: 0->120%->100% scale-in
const RED_PULSE_DURATION    = 0.35; // seconds for click-pulse on red bubble
const PURPLE_BOUNCE_DURATION = 0.3; // seconds for explosion-hit bounce on purple bubble

const TRAIL_EMIT_RATE    = 55;   // particles per second while purple is flying
const TRAIL_MAX_AGE_BASE = 0.45; // seconds (randomised +-40 %)

const EXPLOSION_PARTICLE_DENSITY = 0.35; // particles spawned per px of explosion radius

const ZEN_BUBBLE_LIMIT = 100; // Zen Pop ends when alive bubble count exceeds this

const SNIPER_CLICK_LIMIT  = 25;  // total clicks available in Sniper Pop
const SNIPER_IDLE_TIMEOUT = 10;  // seconds of inactivity before 1 click is penalised

// ─── Juice / atmosphere ───────────────────────────────────────────────────────
const COMBO_WINDOW         = 1.2;  // seconds to chain the next pop into a combo
const COMBO_STEP           = 5;    // pops per +1 multiplier tier
const COMBO_MAX_MULT       = 5;    // multiplier cap
const SCORE_POPUP_DURATION = 0.9;  // seconds
const SHOCKWAVE_DURATION   = 0.42; // seconds
const SHARD_DURATION_BASE  = 0.5;  // seconds (randomised)
const BOKEH_COUNT          = 14;   // drifting background light orbs
const SHAKE_DECAY          = 9;    // exponential decay rate for screen shake

// Per-mode background palette: base hue (HSL) that slowly drifts during play.
const MODE_BG = {
  flash:  { hue: 18  }, // warm
  sniper: { hue: 275 }, // violet
  zen:    { hue: 188 }, // teal
};

// Bubble variety
const DEPTH_MIN       = 0.75; // smallest / farthest / slowest
const DEPTH_MAX       = 1.25; // biggest / closest / fastest
const CLUSTER_CHANCE  = 0.22; // chance a spawn event drops a packed cluster
const CLUSTER_MIN     = 4;
const CLUSTER_MAX     = 6;
const CHAIN_POP_DELAY = 0.055; // base seconds between staggered cascade pops

// Tier-1 beautification
const COLOR_BLEED_MAX_ALPHA = 0.16; // additive full-screen wash tinted to the popped bubble
const COLOR_BLEED_DECAY     = 4.2;  // exponential fade rate for the wash
const AMBIENT_FIELD_COUNT   = 14;   // drifting background bubbles behind gameplay
const COMBO_AURA_MIN_COMBO  = 3;    // combo count before the cursor/edge aura kicks in
const CARD_ANIM_DURATION    = 0.4;  // seconds for the complete/records card scale-fade-in
const LIGHT_SHAFT_COUNT     = 5;    // drifting god-ray beams behind gameplay

// HUD / UI polish
const CURSOR_TRAIL_MAX_AGE = 0.35; // seconds
const TITLE_FIELD_COUNT    = 18;   // ambient drifting bubbles behind the menu
const TITLE_ANIM_DURATION  = 0.5;  // seconds for the card slide-in

const COMPLETE_MESSAGES = {
  flash:  "Let's see how much bubbles you managed to pop in 30 seconds!",
  sniper: "Lets see how much bubbles you managed to pop with 25 clicks!",
  zen:    "Ensless popping requres inner strength from a samurai!",
};

// ─── Main Game object ─────────────────────────────────────────────────────────
const Game = {
  canvas: null,
  ctx: null,
  state: 'title',       // 'title' | 'playing' | 'complete' | 'records'
  hoveredButton: null,
  titleButtons: [],
  completeOkRect: null,
  completeOkHovered: false,
  highScores: null,
  newRecord: null,      // { mode, rank } set by checkAndSaveScore after a game ends
  recordsOkRect: null,
  recordsOkHovered: false,
  soundEnabled: true,
  hudSoundRect: null,
  hudEndRect: null,
  hudSoundHovered: false,
  hudEndHovered: false,
  bgm: null,
  bgmFading: false,
  bgmFadeRate: 0,
  bubbles: [],
  explosions: [],
  score: 0,
  gameTime: 0,
  lastTime: 0,
  particles: [],
  spawnTimer: 0,
  nextSpawnIn: SPAWN_INTERVAL_BASE,

  // juice / atmosphere state
  shake: 0,          // current screen-shake magnitude (px), decays each frame
  combo: 0,          // consecutive-pop counter
  comboTimer: 0,     // seconds left to chain the combo
  scorePopups: [],   // floating +N / combo texts
  shockwaves: [],    // white flash rings on pop
  shards: [],        // curved burst fragments on pop
  bokeh: [],         // drifting background light orbs
  pendingPops: [],   // staggered chain-pop cascade queue
  displayScore: 0,   // eased score for the rolling counter
  cursorTrail: [],   // fading crosshair trail points
  mouseX: -100,
  mouseY: -100,
  titleField: [],    // ambient drifting bubbles behind the title menu
  titleAnimT: 0,     // 0->1 card slide-in progress
  sniperEnding: false, // sniper: last click spent, waiting for the final pop to resolve
  sniperEndTimer: 0,   // safety timeout for the wait

  colorBleed: { r: 0, g: 0, b: 0, a: 0 }, // additive full-screen wash, tinted per pop, fades out
  ambientField: [],    // drifting background bubbles behind gameplay
  cardAnimT: 0,        // 0->1 scale-fade-in progress for complete/records cards

  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');

    this.initSounds();
    this.loadHighScores();

    this.titleButtons = [
      { id: 'flash',  label: 'Flash Pop',   colorA: '#ff6830', colorB: '#7a0000', time: '30s', clicks: 'inf'  },
      { id: 'sniper', label: 'Sniper Pop',  colorA: '#8040e8', colorB: '#360065', time: 'inf',   clicks: '25' },
      { id: 'zen',    label: 'Zen Pop',     colorA: '#20a8b8', colorB: '#005070', time: 'inf',   clicks: 'inf'  },
      { id: 'scores', label: 'High Scores', colorA: '#c09020', colorB: '#5a4010' },
    ];
    // Compute button rects
    const BTN_W = 252, BTN_H = 68, BTN_GAP = 18, BTN_X = 174, BTN_Y0 = 200;
    this.titleButtons.forEach((btn, i) => {
      btn.x = BTN_X; btn.y = BTN_Y0 + i * (BTN_H + BTN_GAP); btn.w = BTN_W; btn.h = BTN_H; btn._i = i;
    });
    this.titleAnimT = 0;
    this.initTitleField();

    this.canvas.addEventListener('click',     e => this.onCanvasClick(e));
    this.canvas.addEventListener('mousemove', e => this.onCanvasMouseMove(e));
    requestAnimationFrame(ts => this.loop(ts));
  },

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    this.update(dt);
    this.updateBgm(dt);
    this.draw();
    requestAnimationFrame(ts => this.loop(ts));
  },

  // ─── Update ──────────────────────────────────────────────────────────────

  update(dt) {
    this.updateCursorTrail(dt);
    this.updateColorBleed(dt);
    if (this.state === 'complete' || this.state === 'records') {
      if (this.cardAnimT < 1) this.cardAnimT = Math.min(1, this.cardAnimT + dt / CARD_ANIM_DURATION);
    }
    if (this.state === 'title') this.updateTitle(dt);
    if (this.state !== 'playing') return;
    this.gameTime += dt;

    if (this.gameMode === 'flash') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endGame();
        return;
      }
    }

    if (this.gameMode === 'sniper' && !this.sniperEnding) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        this.idleTimer = SNIPER_IDLE_TIMEOUT;
        this.clicksLeft--;
        if (this.clicksLeft <= 0) { this.clicksLeft = 0; this.beginSniperEnd(); }
      }
    }

    for (const b of this.bubbles) {
      if (!b.alive) continue;

      // Spawn scale-in animation
      if (b.spawning) {
        b.spawnAge += dt;
        if (b.spawnAge >= b.spawnDuration) {
          b.spawning = false;
          b.scale    = 1;
        } else {
          const t = b.spawnAge / b.spawnDuration;
          b.scale = t < 0.6
            ? 1.2 * (1 - (1 - t / 0.6) ** 2)
            : 1.2 - 0.2 * ((t - 0.6) / 0.4);
        }
      }

      // Red: click-pulse animation
      if (b.type === 'red' && b.pulsing) {
        b.pulseAge += dt;
        if (b.pulseAge >= RED_PULSE_DURATION) {
          b.pulsing  = false;
          b.pulseAge = 0;
          b.scale    = 1;
        } else {
          b.scale = 1 + 0.22 * Math.sin((b.pulseAge / RED_PULSE_DURATION) * Math.PI);
        }
      }

      // Purple: explosion-hit bounce animation
      if (b.type === 'purple' && b.bouncing) {
        b.bounceAge += dt;
        if (b.bounceAge >= PURPLE_BOUNCE_DURATION) {
          b.bouncing  = false;
          b.bounceAge = 0;
          b.scale     = 1;
        } else {
          b.scale = 1 + 0.3 * Math.sin((b.bounceAge / PURPLE_BOUNCE_DURATION) * Math.PI);
        }
      }

      // Purple: flying
      if (b.type === 'purple' && b.flying) {
        b.x += b.flyVx * dt;
        b.y += b.flyVy * dt;
        this.emitPurpleTrail(b, dt);

        if (b.x - b.radius <= 0) {
          b.x = b.radius; b.flyVx = Math.abs(b.flyVx);
        } else if (b.x + b.radius >= CANVAS_W) {
          b.x = CANVAS_W - b.radius; b.flyVx = -Math.abs(b.flyVx);
        }
        if (b.y - b.radius <= 0) {
          b.y = b.radius; b.flyVy = Math.abs(b.flyVy);
        } else if (b.y + b.radius >= CANVAS_H) {
          b.y = CANVAS_H - b.radius; b.flyVy = -Math.abs(b.flyVy);
        }
        b.flyAngle = Math.atan2(b.flyVy, b.flyVx);

        let hitOther = false;
        for (const other of this.bubbles) {
          if (other === b || !other.alive || other.spawning) continue;
          const dx = other.x - b.x;
          const dy = other.y - b.y;
          if (dx * dx + dy * dy <= (b.radius + other.radius) ** 2) {
            hitOther = true;
            break;
          }
        }
        if (hitOther) { this.popPurple(b); continue; }

        continue;
      }

      // Normal drift + wall reflect
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x - b.radius < 0) {
        b.x = b.radius; b.vx = Math.abs(b.vx);
      } else if (b.x + b.radius > CANVAS_W) {
        b.x = CANVAS_W - b.radius; b.vx = -Math.abs(b.vx);
      }
      if (b.y - b.radius < 0) {
        b.y = b.radius; b.vy = Math.abs(b.vy);
      } else if (b.y + b.radius > CANVAS_H) {
        b.y = CANVAS_H - b.radius; b.vy = -Math.abs(b.vy);
      }
    }

    this.bubbles = this.bubbles.filter(b => b.alive);

    // Spawn timer
    this.spawnTimer += dt * 1000;
    if (this.spawnTimer >= this.nextSpawnIn) {
      this.spawnTimer  = 0;
      const accelOffset = this.gameMode === 'flash' ? SPAWN_ACCEL * this.gameTime : 0;
      const spawnBase   = Math.max(200, SPAWN_INTERVAL_BASE + accelOffset);
      this.nextSpawnIn  = Math.max(150,
        spawnBase + (Math.random() * SPAWN_INTERVAL_VARIANCE * 2 - SPAWN_INTERVAL_VARIANCE));

      let type = 'blue';
      if (this.gameTime >= PURPLE_APPEAR_TIME && Math.random() < PURPLE_SPAWN_CHANCE) {
        type = 'purple';
      } else if (this.gameTime >= RED_APPEAR_TIME && Math.random() < RED_SPAWN_CHANCE) {
        type = 'red';
      }
      if (!this.sniperEnding) {
        if (type === 'blue' && Math.random() < CLUSTER_CHANCE) this.spawnCluster();
        else this.spawnBubble(type);
      }

      if (this.gameMode === 'zen' && this.bubbles.length > ZEN_BUBBLE_LIMIT) {
        this.endGame();
        return;
      }
    }

    for (const ex of this.explosions) {
      ex.age += dt;
      const t = ex.age / ex.duration;
      ex.currentRadius = ex.maxRadius * t;
      ex.alpha         = 1 - t;
    }
    this.explosions = this.explosions.filter(ex => ex.age < ex.duration);

    for (const p of this.particles) {
      p.age += dt;
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
    }
    this.particles = this.particles.filter(p => p.age < p.maxAge);

    // Staggered chain-pop cascade
    if (this.pendingPops.length) {
      for (const entry of this.pendingPops) entry.timer -= dt;
      const ready = this.pendingPops.filter(e => e.timer <= 0);
      this.pendingPops = this.pendingPops.filter(e => e.timer > 0);
      for (const e of ready) if (e.b.alive) this.popBubble(e.b);
    }

    // Rolling score counter
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 12);
    if (Math.abs(this.score - this.displayScore) < 0.5) this.displayScore = this.score;

    // Combo window
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Screen shake decay (exponential)
    if (this.shake > 0.05) this.shake *= Math.exp(-SHAKE_DECAY * dt);
    else this.shake = 0;

    // Floating score popups
    for (const sp of this.scorePopups) { sp.age += dt; sp.y += sp.vy * dt; }
    this.scorePopups = this.scorePopups.filter(sp => sp.age < sp.maxAge);

    // Shockwaves
    for (const sw of this.shockwaves) sw.age += dt;
    this.shockwaves = this.shockwaves.filter(sw => sw.age < sw.maxAge);

    // Burst shards
    for (const sh of this.shards) {
      sh.age  += dt;
      sh.dist += sh.speed * dt;
      sh.speed *= Math.exp(-3 * dt);
      sh.ang  += sh.spin * dt;
    }
    this.shards = this.shards.filter(sh => sh.age < sh.maxAge);

    // Drifting bokeh orbs
    for (const o of this.bokeh) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < -o.r) o.x = CANVAS_W + o.r; else if (o.x > CANVAS_W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = CANVAS_H + o.r; else if (o.y > CANVAS_H + o.r) o.y = -o.r;
    }

    // Drifting ambient bubbles (rise gently behind gameplay)
    this.updateAmbientField(dt);

    // Sniper: end only once the final pop has fully resolved
    if (this.sniperEnding) {
      this.sniperEndTimer -= dt;
      if (!this.sniperActivityPending() || this.sniperEndTimer <= 0) {
        this.sniperEnding = false;
        this.endGame();
        return;
      }
    }
  },

  beginSniperEnd() {
    if (this.sniperEnding) return;
    this.sniperEnding   = true;
    this.sniperEndTimer = 6; // safety cap in case a launched purple never lands
  },

  // True while the last pop is still resolving: a cascade in flight or a launched purple.
  sniperActivityPending() {
    if (this.pendingPops.length) return true;
    for (const b of this.bubbles) if (b.alive && b.flying) return true;
    return false;
  },

  // ─── Draw ────────────────────────────────────────────────────────────────

  draw() {
    if (this.state === 'title')   { this.drawTitleScreen();   return; }
    if (this.state === 'records') { this.drawRecordsScreen(); return; }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Animated, per-mode background (drawn without shake so edges never gap)
    this.drawPlayBackground();

    // Shake only the world layer; HUD stays steady for readability
    ctx.save();
    if (this.shake > 0.1) {
      ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    }
    for (const p of this.particles)   { if (p.layer === 'bg') this.drawParticle(p); }
    // Parallax: draw smaller/farther bubbles first, bigger/closer on top
    this.bubbles.sort((a, b) => a.radius - b.radius);
    for (const b of this.bubbles)     this.drawBubble(b);
    for (const p of this.particles)   { if (p.layer === 'fg') this.drawParticle(p); }
    for (const sh of this.shards)      this.drawShard(sh);
    for (const ex of this.explosions) this.drawExplosion(ex);
    for (const sw of this.shockwaves)  this.drawShockwave(sw);
    ctx.restore();

    // Color-bleed flash: brief additive wash tinted to the last pop
    this.drawColorBleed();

    // Vignette (subtle pulse on the music beat)
    this.drawVignette();

    // Combo aura: escalating cursor glow + warm edge wash at high combo
    if (this.state === 'playing') this.drawComboAura();

    // Cursor trail (steady, follows the real pointer) — playing only
    if (this.state === 'playing') { this.drawCursorTrail(); this.drawReticle(); }

    // Floating score / combo popups (steady, above the world)
    for (const sp of this.scorePopups) this.drawScorePopup(sp);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font      = 'bold 20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Score: ${Math.round(this.displayScore)}`, CANVAS_W - 16, 32);

    if (this.gameMode === 'flash') this.drawTimerRing();

    if (this.gameMode === 'sniper') this.drawSniperHUD();

    if (this.state === 'playing') this.drawHudButtons();

    if (this.state === 'complete') this.drawCompleteScreen();
  },

  drawBubble(b) {
    this.drawContactShadow(b);
    if (b.popQueued) this.drawTensionTell(b);
    if (b.type === 'red')    return this.drawRedBubble(b);
    if (b.type === 'purple') return this.drawPurpleBubble(b);
    this.drawBlueBubble(b);
  },

  drawBlueBubble(b) {
    const { ctx } = this;
    const r = b.radius;
    const w = this._wob(b);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(b.scale * (1 + w), b.scale * (1 - w)); ctx.translate(-b.x, -b.y);

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(b.x - r*0.3, b.y - r*0.35, r*0.05, b.x, b.y, r);
    g.addColorStop(0,    'rgba(200,255,250,0.10)');
    g.addColorStop(0.55, 'rgba(32,178,170,0.14)');
    g.addColorStop(0.85, 'rgba(20,160,175,0.30)');
    g.addColorStop(1,    'rgba(90,210,235,0.55)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(150,235,245,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();

    this.drawBubbleGlassOverlays(b, r);

    ctx.beginPath();
    ctx.ellipse(b.x - r*0.28, b.y - r*0.32, r*0.22, r*0.13, -Math.PI/5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.restore();
  },

  drawRedBubble(b) {
    const { ctx } = this;
    const r = b.radius;
    const w = this._wob(b);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(b.scale * (1 + w), b.scale * (1 - w)); ctx.translate(-b.x, -b.y);

    const glow = ctx.createRadialGradient(b.x, b.y, r*0.5, b.x, b.y, r*1.5);
    glow.addColorStop(0,   'rgba(255,80,20,0)');
    glow.addColorStop(1,   'rgba(255,40,0,0.22)');
    ctx.beginPath(); ctx.arc(b.x, b.y, r*1.5, 0, Math.PI*2);
    ctx.fillStyle = glow; ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(b.x - r*0.3, b.y - r*0.35, r*0.05, b.x, b.y, r);
    g.addColorStop(0,    'rgba(255,225,200,0.10)');
    g.addColorStop(0.5,  'rgba(255,90,40,0.16)');
    g.addColorStop(0.85, 'rgba(230,50,20,0.32)');
    g.addColorStop(1,    'rgba(255,120,70,0.58)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,165,95,0.72)'; ctx.lineWidth = 1.4; ctx.stroke();

    this.drawBubbleGlassOverlays(b, r);

    ctx.beginPath();
    ctx.ellipse(b.x - r*0.28, b.y - r*0.32, r*0.22, r*0.13, -Math.PI/5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,180,0.65)'; ctx.fill();
    ctx.restore();
  },

  drawPurpleBubble(b) {
    const { ctx } = this;
    const r = b.radius;
    const w = this._wob(b);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(b.scale * (1 + w), b.scale * (1 - w)); ctx.translate(-b.x, -b.y);

    if (b.flying) {
      const trailLen = r * 2.5;
      for (let i = 0; i < 5; i++) {
        const spread = (i - 2) * r * 0.18;
        const perpX  = -Math.sin(b.flyAngle);
        const perpY  =  Math.cos(b.flyAngle);
        const tx = b.x - Math.cos(b.flyAngle) * trailLen + perpX * spread;
        const ty = b.y - Math.sin(b.flyAngle) * trailLen + perpY * spread;
        ctx.beginPath();
        ctx.moveTo(b.x + perpX * spread, b.y + perpY * spread);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = `rgba(200,130,255,${0.4 - Math.abs(i-2)*0.12})`;
        ctx.lineWidth   = 2 - Math.abs(i - 2) * 0.5;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(b.x - r*0.3, b.y - r*0.35, r*0.05, b.x, b.y, r);
    g.addColorStop(0,    'rgba(240,220,255,0.10)');
    g.addColorStop(0.5,  'rgba(160,60,220,0.15)');
    g.addColorStop(0.85, 'rgba(120,40,200,0.32)');
    g.addColorStop(1,    'rgba(195,130,255,0.58)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(210,150,255,0.72)'; ctx.lineWidth = 1.4; ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(b.x - r*0.28, b.y - r*0.32, r*0.22, r*0.13, -Math.PI/5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(240,210,255,0.55)'; ctx.fill();

    this.drawBubbleGlassOverlays(b, r);

    const tip   = { x: b.x + Math.cos(b.flyAngle) * r*0.58, y: b.y + Math.sin(b.flyAngle) * r*0.58 };
    const alen  = r * 0.4;
    const aWide = r * 0.18;
    const px    = -Math.sin(b.flyAngle);
    const py    =  Math.cos(b.flyAngle);
    const base  = { x: tip.x - Math.cos(b.flyAngle)*alen, y: tip.y - Math.sin(b.flyAngle)*alen };
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(base.x + px*aWide, base.y + py*aWide);
    ctx.lineTo(base.x - px*aWide, base.y - py*aWide);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fill();
    ctx.restore();
  },

  drawExplosion(ex) {
    const { ctx } = this;
    const t = ex.age / ex.duration;

    let cr, cg, cb;
    if      (ex.type === 'red')    { cr = 255; cg = 100; cb = 30;  }
    else if (ex.type === 'purple') { cr = 210; cg = 80;  cb = 255; }
    else                           { cr = 100; cg = 220; cb = 255; }

    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${ex.alpha * 0.9})`;
    ctx.lineWidth   = 3 * (1 - t) + 1;
    ctx.stroke();

    if (t > 0.15 && t < 0.75) {
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.currentRadius * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${ex.alpha * 0.45})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    if (t < 0.3) {
      const ft = 1 - t / 0.3;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.currentRadius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${ft * 0.28})`;
      ctx.fill();
    }
  },

  // ─── Trail particles ─────────────────────────────────────────────────────────

  emitPurpleTrail(b, dt) {
    const count = Math.round(TRAIL_EMIT_RATE * dt + Math.random() * 0.6);
    const perpX = -Math.sin(b.flyAngle);
    const perpY =  Math.cos(b.flyAngle);
    for (let i = 0; i < count; i++) {
      const back   = b.radius * (0.15 + Math.random() * 0.7);
      const spread = (Math.random() - 0.5) * b.radius * 0.65;
      this.particles.push({
        x:          b.x - Math.cos(b.flyAngle) * back + perpX * spread,
        y:          b.y - Math.sin(b.flyAngle) * back + perpY * spread,
        vx:         (Math.random() - 0.5) * 22,
        vy:         (Math.random() - 0.5) * 22,
        type:       Math.random() < 0.42 ? 'cross' : 'dot',
        size:       1.5 + Math.random() * 3.5,
        rotation:   Math.random() * Math.PI,
        colorEarly: 'rgb(230,170,255)',
        colorLate:  'rgb(170,90,230)',
        layer:      'bg',
        age:        0,
        maxAge:     TRAIL_MAX_AGE_BASE * (0.6 + Math.random() * 0.8),
      });
    }
  },

  drawParticle(p) {
    const { ctx } = this;
    const t     = p.age / p.maxAge;
    const alpha = (1 - t) ** 1.8;
    const s     = p.size * (1 - t * 0.35);
    const color = t < 0.4 ? p.colorEarly : p.colorLate;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (p.type === 'dot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(0.7, s * 0.5);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
      ctx.moveTo(0, -s); ctx.lineTo(0, s);
      ctx.stroke();
    }

    ctx.restore();
  },

  emitExplosionParticles(x, y, maxRadius, type) {
    const count = Math.round(EXPLOSION_PARTICLE_DENSITY * maxRadius);
    const colorEarly = type === 'red'    ? 'rgb(255,220,160)'
                     : type === 'purple' ? 'rgb(230,170,255)'
                     :                     'rgb(180,240,255)';
    const colorLate  = type === 'red'    ? 'rgb(220,80,30)'
                     : type === 'purple' ? 'rgb(170,90,230)'
                     :                     'rgb(60,170,220)';

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = maxRadius * (1.0 + Math.random() * 1.4);
      const size  = 1.5 + Math.random() * (maxRadius * 0.055);

      this.particles.push({
        x, y,
        vx:         Math.cos(angle) * speed,
        vy:         Math.sin(angle) * speed,
        type:       Math.random() < 0.45 ? 'cross' : 'dot',
        size,
        rotation:   Math.random() * Math.PI,
        colorEarly,
        colorLate,
        layer:      'fg',
        age:        0,
        maxAge:     0.35 + Math.random() * 0.45,
      });
    }
  },

  // ─── Game logic ──────────────────────────────────────────────────────────────

  spawnBubble(type, opts = {}) {
    const baseR = type === 'red' ? BUBBLE_RED_RADIUS
                : type === 'purple' ? BUBBLE_PURPLE_RADIUS
                : BUBBLE_BLUE_RADIUS;
    // Depth: bigger = closer = faster; smaller = farther = slower (parallax)
    const depth = DEPTH_MIN + Math.random() * (DEPTH_MAX - DEPTH_MIN);
    const r     = baseR * depth;
    const baseSpeed = type === 'red'    ? BUBBLE_RED_DRIFT_SPEED
                    : type === 'purple' ? BUBBLE_PURPLE_DRIFT_SPEED
                    :                     BUBBLE_BLUE_DRIFT_SPEED;
    const speed = baseSpeed * depth * (1 - BUBBLE_SPEED_VARIANCE + Math.random() * BUBBLE_SPEED_VARIANCE * 2);
    const angle = Math.random() * Math.PI * 2;

    let px = opts.x !== undefined ? opts.x : r + Math.random() * (CANVAS_W - r * 2);
    let py = opts.y !== undefined ? opts.y : r + Math.random() * (CANVAS_H - r * 2);
    px = Math.max(r, Math.min(CANVAS_W - r, px));
    py = Math.max(r, Math.min(CANVAS_H - r, py));

    const b = {
      x:             px,
      y:             py,
      vx:            Math.cos(angle) * speed,
      vy:            Math.sin(angle) * speed,
      radius:        r,
      depth,
      type,
      alive:         true,
      spawning:      true,
      spawnAge:      0,
      spawnDuration: SPAWN_ANIM_DURATION,
      scale:         0,
      wobblePhase:   Math.random() * Math.PI * 2,
      wobbleFreq:    1.6 + Math.random() * 1.2,
      swirl:         Math.random() * Math.PI * 2,
    };

    if (type === 'red') {
      b.pulsing  = false;
      b.pulseAge = 0;
    }

    if (type === 'purple') {
      b.flyAngle  = Math.random() * Math.PI * 2;
      b.flying    = false;
      b.flyVx     = 0;
      b.flyVy     = 0;
      b.bouncing  = false;
      b.bounceAge = 0;
    }

    this.bubbles.push(b);
  },

  onCanvasClick(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx     = (e.clientX - rect.left) * scaleX;
    const cy     = (e.clientY - rect.top)  * scaleY;

    this.unlockAudio(); // resume the AudioContext on the first user gesture

    if (this.state === 'title') {
      for (const btn of this.titleButtons) {
        if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
          this.playRandomPop();
          if      (btn.id === 'flash')  this.startGame('flash');
          else if (btn.id === 'sniper') this.startGame('sniper');
          else if (btn.id === 'zen')    this.startGame('zen');
          else if (btn.id === 'scores') { this.newRecord = null; this.showRecords(); }
        }
      }
      return;
    }

    if (this.state === 'complete') {
      if (this.completeOkRect) {
        const { x, y, w, h } = this.completeOkRect;
        if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
          this.playRandomPop();
          this.showRecords();
        }
      }
      return;
    }

    if (this.state === 'records') {
      if (this.recordsOkRect) {
        const { x, y, w, h } = this.recordsOkRect;
        if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
          this.playRandomPop();
          this.returnToTitle();
        }
      }
      return;
    }

    if (this.sniperEnding) return; // clicks are spent; let the final pop resolve

    if (this.hudSoundRect) {
      const { x, y, w, h } = this.hudSoundRect;
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
        this.soundEnabled = !this.soundEnabled;
        if (this.bgm) this.bgm.muted = !this.soundEnabled;
        return;
      }
    }
    if (this.hudEndRect) {
      const { x, y, w, h } = this.hudEndRect;
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
        this.playRandomPop();
        this.endGame();
        return;
      }
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b  = this.bubbles[i];
      if (b.spawning) continue;
      const dx = cx - b.x;
      const dy = cy - b.y;
      if (dx * dx + dy * dy <= b.radius * b.radius) {
        if (b.type === 'red') {
          b.pulsing  = true;
          b.pulseAge = 0;
          b.scale    = 1;
        } else if (b.type === 'purple' && !b.flying) {
          b.flying = true;
          b.flyVx  = Math.cos(b.flyAngle) * BUBBLE_PURPLE_FLY_SPEED;
          b.flyVy  = Math.sin(b.flyAngle) * BUBBLE_PURPLE_FLY_SPEED;
        } else {
          this.popBubble(b);
        }
        if (this.gameMode === 'sniper') {
          this.idleTimer  = SNIPER_IDLE_TIMEOUT;
          this.clicksLeft--;
          if (this.clicksLeft <= 0) { this.clicksLeft = 0; this.beginSniperEnd(); }
        }
        break;
      }
    }
  },

  popBubble(b) {
    b.alive = false;
    this.registerPop(b.x, b.y, b.type, b.radius);
    const mult = b.type === 'red' ? RED_EXPLODE_MULT : BLUE_EXPLODE_MULT;
    this.createExplosion(b.x, b.y, b.radius * mult, b.type);
  },

  popPurple(b) {
    b.alive  = false;
    b.flying = false;
    this.registerPop(b.x, b.y, 'purple', b.radius);
    this.createExplosion(b.x, b.y, b.radius * PURPLE_EXPLODE_MULT, 'purple');
  },

  // Central hook for every pop: combo, score, pitch, shake, popup, shockwave, shards.
  registerPop(x, y, type, radius) {
    if (this.comboTimer > 0) this.combo++; else this.combo = 1;
    this.comboTimer = COMBO_WINDOW;
    const mult = Math.min(1 + Math.floor((this.combo - 1) / COMBO_STEP), COMBO_MAX_MULT);
    this.score += mult;

    const rate = 1 + Math.min(this.combo, 12) * 0.025; // pitch climbs with the combo
    if      (type === 'red')    this.playSound('bomb', rate);
    else if (type === 'purple') this.playSound('purple', rate);
    else                        this.playRandomPop(rate);

    const baseShake = type === 'red' ? 14 : type === 'purple' ? 9 : 5;
    this.shake = Math.min(22, Math.max(this.shake, baseShake));

    this.spawnScorePopup(x, y, mult, this.combo);
    this.spawnShockwave(x, y, radius, type);
    this.spawnShards(x, y, radius, type);
    this.triggerColorBleed(type);
  },

  // ─── Juice / atmosphere helpers ────────────────────────────────────────────────

  _wob(b) {
    const base = 0.06 * Math.sin(this.gameTime * (b.wobbleFreq || 2) + (b.wobblePhase || 0));
    // Pre-pop tension: fast jitter while queued in a chain cascade
    if (b.popQueued) return base + 0.11 * Math.sin(this.gameTime * 42);
    return base;
  },

  _rimColor(type) {
    return type === 'red' ? '255,165,95' : type === 'purple' ? '210,150,255' : '150,235,245';
  },

  drawBubbleGlassOverlays(b, r) {
    const { ctx } = this;
    // Thin-film iridescent rim whose hue drifts slowly (per bubble)
    const hue = (this.gameTime * 45 + b.wobblePhase * 57.3) % 360;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${hue}, 95%, 72%, 0.30)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.93, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `hsla(${(hue + 140) % 360}, 95%, 72%, 0.18)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Slow inner swirl reflection so idle bubbles keep moving
    const a = this.gameTime * 0.7 + (b.swirl || 0);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = r * 0.10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.5, a, a + Math.PI * 0.6);
    ctx.stroke();
    ctx.restore();

    // Caustic focal dot: light focused through the sphere, opposite the top-left highlight
    const ca = this.gameTime * 0.9 + (b.wobblePhase || 0);
    const cx = b.x + r * 0.30 + Math.cos(ca) * r * 0.10;
    const cy = b.y + r * 0.32 + Math.sin(ca) * r * 0.10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.24);
    cg.addColorStop(0, 'rgba(255,255,255,0.8)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  drawPlayBackground() {
    const { ctx } = this;
    const base  = (MODE_BG[this.gameMode] || MODE_BG.zen).hue;
    const drift = Math.sin(this.gameTime * 0.12) * 14;
    const h     = base + drift;
    const g = ctx.createLinearGradient(0, 0, CANVAS_W * 0.35, CANVAS_H);
    g.addColorStop(0, `hsl(${h}, 55%, 12%)`);
    g.addColorStop(1, `hsl(${h + 24}, 62%, 5%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawLightShafts(h);
    this.drawBokeh(h);
    this.drawAmbientField();
  },

  drawLightShafts(hue) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const skew = 150;
    for (let i = 0; i < LIGHT_SHAFT_COUNT; i++) {
      const sway  = Math.sin(this.gameTime * 0.18 + i * 1.7) * 40;
      const bx    = CANVAS_W * 0.14 + i * 130 + sway;
      const w     = 44 + 22 * Math.sin(this.gameTime * 0.3 + i);
      const alpha = 0.045 + 0.03 * (0.5 + 0.5 * Math.sin(this.gameTime * 0.5 + i * 2));
      const g = ctx.createLinearGradient(bx, 0, bx + skew, CANVAS_H);
      g.addColorStop(0, `hsla(${(hue + 40) % 360}, 90%, 76%, ${alpha})`);
      g.addColorStop(1, `hsla(${(hue + 40) % 360}, 90%, 76%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx,             -10);
      ctx.lineTo(bx + w,         -10);
      ctx.lineTo(bx + w + skew,  CANVAS_H + 10);
      ctx.lineTo(bx + skew,      CANVAS_H + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  drawTensionTell(b) {
    const { ctx } = this;
    const r     = b.radius * (b.scale || 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * 42);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(b.x, b.y, r * 0.4, b.x, b.y, r * 1.3);
    g.addColorStop(0, `rgba(255,255,255,${0.10 + 0.20 * pulse})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  drawReticle() {
    if (this.mouseX < -50) return;
    const { ctx } = this;
    const x = this.mouseX, y = this.mouseY;
    const R = 13;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.gameTime * 1.2);
    ctx.strokeStyle = 'rgba(180,240,255,0.85)';
    ctx.lineWidth   = 1.6;
    ctx.lineCap     = 'round';
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, R, a0, a0 + Math.PI / 2 - 0.7);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(180,240,255,0.6)';
    ctx.lineWidth   = 1.4;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (R + 3), Math.sin(a) * (R + 3));
      ctx.lineTo(Math.cos(a) * (R + 7), Math.sin(a) * (R + 7));
      ctx.stroke();
    }
    ctx.restore();
  },

  drawBokeh(hue) {
    const { ctx } = this;
    if (!this.bokeh.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const o of this.bokeh) {
      const c = `hsla(${(hue + o.hueOffset) % 360}, 80%, 65%,`;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, `${c} ${o.alpha})`);
      g.addColorStop(1, `${c} 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawVignette() {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(this.gameTime * Math.PI * 2 * 1.4); // ~84 BPM feel
    const a = 0.34 + 0.08 * pulse;
    const g = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, 190, CANVAS_W/2, CANVAS_H/2, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  },

  initBokeh() {
    this.bokeh = [];
    for (let i = 0; i < BOKEH_COUNT; i++) {
      this.bokeh.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        r: 40 + Math.random() * 110,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        hueOffset: (Math.random() - 0.5) * 60,
        alpha: 0.05 + Math.random() * 0.06,
      });
    }
  },

  // ─── Color-bleed flash ───────────────────────────────────────────────────────
  triggerColorBleed(type) {
    const c = type === 'red'    ? [255, 90,  40]
            : type === 'purple' ? [200, 90,  255]
            :                     [90,  200, 235];
    // Louder wash the deeper the combo, capped at the max alpha.
    const boost = Math.min(1, 0.45 + this.combo * 0.06);
    const a = COLOR_BLEED_MAX_ALPHA * boost;
    // Keep the strongest active tint rather than stomping a big red with a small blue.
    if (a >= this.colorBleed.a) this.colorBleed = { r: c[0], g: c[1], b: c[2], a };
  },

  updateColorBleed(dt) {
    if (this.colorBleed.a <= 0.001) { this.colorBleed.a = 0; return; }
    this.colorBleed.a *= Math.exp(-COLOR_BLEED_DECAY * dt);
  },

  drawColorBleed() {
    const b = this.colorBleed;
    if (b.a <= 0.001) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${b.r},${b.g},${b.b},${b.a})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  },

  // ─── Combo aura ──────────────────────────────────────────────────────────────
  drawComboAura() {
    if (this.combo < COMBO_AURA_MIN_COMBO) return;
    const { ctx } = this;
    const tier = Math.min(1 + Math.floor((this.combo - 1) / COMBO_STEP), COMBO_MAX_MULT);
    const frac = tier / COMBO_MAX_MULT;
    const col  = tier >= 5 ? '255,90,220'
               : tier >= 4 ? '255,150,60'
               : tier >= 3 ? '255,205,90'
               :             '120,220,255';
    const pulse = 0.6 + 0.4 * Math.sin(this.gameTime * 9);

    // Cursor glow ring
    if (this.mouseX > -50) {
      const r = 24 + frac * 30;
      const g = ctx.createRadialGradient(this.mouseX, this.mouseY, r * 0.25, this.mouseX, this.mouseY, r);
      g.addColorStop(0, `rgba(${col},${0.22 * frac * pulse})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.mouseX, this.mouseY, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Warm edge wash that intensifies with the combo tier
    const eg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 250, CANVAS_W / 2, CANVAS_H / 2, 560);
    eg.addColorStop(0, `rgba(${col},0)`);
    eg.addColorStop(1, `rgba(${col},${0.07 * frac})`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  },

  // ─── Contact shadow ──────────────────────────────────────────────────────────
  drawContactShadow(b) {
    if (this.state !== 'playing' || b._bg) return; // gameplay bubbles only
    const { ctx } = this;
    const depth = b.depth || 1;
    const r     = b.radius * (b.scale || 1);
    const off   = r * 0.62;
    const g = ctx.createRadialGradient(b.x, b.y + off, 0, b.x, b.y + off, r * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.5 * depth;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + off, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  // ─── Ambient background bubbles (during play) ────────────────────────────────
  initAmbientField() {
    this.ambientField = [];
    for (let i = 0; i < AMBIENT_FIELD_COUNT; i++) {
      this.ambientField.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        r: 6 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 10,
        vy: -6 - Math.random() * 14, // gently rise
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq:  1.2 + Math.random() * 1.0,
        swirl:       Math.random() * Math.PI * 2,
      });
    }
  },

  updateAmbientField(dt) {
    if (!this.ambientField.length) return;
    for (const o of this.ambientField) {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.y + o.r < 0) { o.y = CANVAS_H + o.r; o.x = Math.random() * CANVAS_W; }
      if (o.x < -o.r) o.x = CANVAS_W + o.r; else if (o.x > CANVAS_W + o.r) o.x = -o.r;
    }
  },

  drawAmbientField() {
    const { ctx } = this;
    if (!this.ambientField.length) return;
    for (const o of this.ambientField) {
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.min(0.14, o.r / 90);
      this.drawBubble({ x: o.x, y: o.y, radius: o.r, type: 'blue', scale: 1, depth: 0.5,
        wobblePhase: o.wobblePhase, wobbleFreq: o.wobbleFreq, swirl: o.swirl,
        flying: false, flyAngle: 0, pulsing: false, bouncing: false, _bg: true });
      ctx.restore();
    }
  },

  spawnScorePopup(x, y, points, combo) {
    this.scorePopups.push({ x, y, points, combo, age: 0, maxAge: SCORE_POPUP_DURATION, vy: -42 });
  },

  drawScorePopup(sp) {
    const { ctx } = this;
    const t     = sp.age / sp.maxAge;
    const alpha = (1 - t) ** 1.4;
    const col   = sp.combo >= 10 ? '255,90,220'
                : sp.combo >= 6  ? '255,150,60'
                : sp.combo >= 3  ? '255,225,90'
                :                  '255,255,255';
    const size  = 18 + Math.min(sp.combo, 12) * 1.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = `rgb(${col})`;
    ctx.shadowColor = `rgba(${col},0.8)`;
    ctx.shadowBlur  = 8;
    ctx.font        = `bold ${size}px sans-serif`;
    ctx.fillText(`+${sp.points}`, sp.x, sp.y);
    if (sp.combo >= 3) {
      ctx.font       = 'bold 13px sans-serif';
      ctx.shadowBlur = 4;
      ctx.fillText(`COMBO x${sp.combo}`, sp.x, sp.y + size * 0.9);
    }
    ctx.restore();
  },

  spawnShockwave(x, y, radius, type) {
    this.shockwaves.push({ x, y, r0: radius * 0.6, rMax: radius * 2.6, age: 0, maxAge: SHOCKWAVE_DURATION, type });
  },

  drawShockwave(sw) {
    const { ctx } = this;
    const t     = sw.age / sw.maxAge;
    const ease  = 1 - (1 - t) ** 2;
    const r     = sw.r0 + (sw.rMax - sw.r0) * ease;
    const alpha = 1 - t;
    ctx.save();
    ctx.beginPath(); ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
    ctx.lineWidth   = (1 - t) * 3 + 0.6;
    ctx.stroke();
    if (t < 0.22) {
      const ft = 1 - t / 0.22;
      const fg = ctx.createRadialGradient(sw.x, sw.y, 0, sw.x, sw.y, sw.r0 * 1.6);
      fg.addColorStop(0, `rgba(255,255,255,${ft * 0.55})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r0 * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  spawnShards(x, y, radius, type) {
    const n = 9 + Math.floor(Math.random() * 4);
    const color = this._rimColor(type);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      this.shards.push({
        x, y,
        dirX: Math.cos(a), dirY: Math.sin(a),
        dist:  radius * 0.4,
        speed: radius * (2.4 + Math.random() * 2.0),
        rad:   radius * (0.45 + Math.random() * 0.4),
        span:  0.5 + Math.random() * 0.6,
        base:  a,
        ang:   0,
        spin:  (Math.random() - 0.5) * 7,
        age:   0,
        maxAge: SHARD_DURATION_BASE * (0.7 + Math.random() * 0.6),
        color,
      });
    }
  },

  drawShard(sh) {
    const { ctx } = this;
    const t     = sh.age / sh.maxAge;
    const alpha = (1 - t) ** 1.5;
    const px    = sh.x + sh.dirX * sh.dist;
    const py    = sh.y + sh.dirY * sh.dist;
    const mid   = sh.base + sh.ang;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgb(${sh.color})`;
    ctx.lineWidth   = 2 * (1 - t) + 0.6;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(px, py, sh.rad, mid - sh.span / 2, mid + sh.span / 2);
    ctx.stroke();
    ctx.restore();
  },

  // ─── Cursor trail ───────────────────────────────────────────────────────────
  updateCursorTrail(dt) {
    if (!this.cursorTrail.length) return;
    for (const p of this.cursorTrail) p.age += dt;
    this.cursorTrail = this.cursorTrail.filter(p => p.age < CURSOR_TRAIL_MAX_AGE);
  },

  pushCursorPoint(x, y) {
    const last = this.cursorTrail[this.cursorTrail.length - 1];
    if (last) { const dx = x - last.x, dy = y - last.y; if (dx * dx + dy * dy < 16) return; }
    this.cursorTrail.push({ x, y, age: 0 });
    if (this.cursorTrail.length > 24) this.cursorTrail.shift();
  },

  drawCursorTrail() {
    const { ctx } = this;
    if (!this.cursorTrail.length) return;
    ctx.save();
    for (const p of this.cursorTrail) {
      const t = p.age / CURSOR_TRAIL_MAX_AGE;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + (1 - t) * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(150,235,245,${(1 - t) * 0.5})`;
      ctx.fill();
    }
    ctx.restore();
  },

  // ─── Title ambient field + card animation ───────────────────────────────────
  initTitleField() {
    this.titleField = [];
    for (let i = 0; i < TITLE_FIELD_COUNT; i++) {
      this.titleField.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        r: 8 + Math.random() * 26,
        vx: (Math.random() - 0.5) * 18,
        vy: -8 - Math.random() * 18, // gently rise
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq:  1.4 + Math.random() * 1.0,
        swirl:       Math.random() * Math.PI * 2,
      });
    }
  },

  updateTitle(dt) {
    this.gameTime += dt; // drives wobble / iridescence on the title visuals
    if (this.titleAnimT < 1) this.titleAnimT = Math.min(1, this.titleAnimT + dt / TITLE_ANIM_DURATION);
    if (!this.titleField.length) this.initTitleField();
    for (const o of this.titleField) {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.y + o.r < 0) { o.y = CANVAS_H + o.r; o.x = Math.random() * CANVAS_W; }
      if (o.x < -o.r) o.x = CANVAS_W + o.r; else if (o.x > CANVAS_W + o.r) o.x = -o.r;
    }
  },

  drawTitleField() {
    const { ctx } = this;
    for (const o of this.titleField) {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.min(0.38, o.r / 60);
      this.drawBubble({ x: o.x, y: o.y, radius: o.r, type: 'blue', scale: 1,
        wobblePhase: o.wobblePhase, wobbleFreq: o.wobbleFreq, swirl: o.swirl,
        flying: false, flyAngle: 0, pulsing: false, bouncing: false });
      ctx.restore();
    }
  },

  // ─── Timer ring (flash mode) ────────────────────────────────────────────────
  drawTimerRing() {
    const { ctx } = this;
    const frac   = Math.max(0, Math.min(1, this.timeLeft / 30));
    const cx = 44, cy = 44, R = 20;
    const urgent = this.timeLeft <= 5;
    const pulse  = urgent ? 1 + 0.12 * Math.sin(this.gameTime * 16) : 1;
    const hue    = 120 * frac; // green -> amber -> red as it drains
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy);

    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 5; ctx.stroke();

    const start = -Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, start + Math.PI * 2 * frac);
    ctx.strokeStyle = `hsl(${hue}, 85%, 55%)`;
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    if (urgent) { ctx.shadowColor = `hsl(${hue}, 90%, 55%)`; ctx.shadowBlur = 12; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle    = urgent ? `hsl(${hue}, 90%, 66%)` : 'rgba(255,255,255,0.9)';
    ctx.font         = 'bold 16px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.ceil(this.timeLeft)), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  },

  createExplosion(x, y, maxRadius, type) {
    this.explosions.push({ x, y, maxRadius, type, currentRadius: 0, alpha: 1, duration: EXPLOSION_DURATION, age: 0 });
    this.emitExplosionParticles(x, y, maxRadius, type);

    for (const b of this.bubbles) {
      if (!b.alive || b.spawning) continue;
      const dx   = b.x - x;
      const dy   = b.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxRadius) {
        if (b.type === 'purple') {
          this.onBubbleHitByExplosion(b); // bounce immediately
        } else {
          // Stagger the chain by distance so the cascade ripples outward
          this.schedulePop(b, CHAIN_POP_DELAY * (0.4 + dist / maxRadius));
        }
      }
    }
  },

  schedulePop(b, delay) {
    if (!b.alive || b.popQueued) return;
    b.popQueued = true;
    this.pendingPops.push({ b, timer: delay });
  },

  spawnCluster() {
    const n  = CLUSTER_MIN + Math.floor(Math.random() * (CLUSTER_MAX - CLUSTER_MIN + 1));
    const cx = BUBBLE_BLUE_RADIUS * 2 + Math.random() * (CANVAS_W - BUBBLE_BLUE_RADIUS * 4);
    const cy = BUBBLE_BLUE_RADIUS * 2 + Math.random() * (CANVAS_H - BUBBLE_BLUE_RADIUS * 4);
    const spread = BUBBLE_BLUE_RADIUS * 2.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = Math.random() * spread;
      this.spawnBubble('blue', { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
    }
  },

  onBubbleHitByExplosion(b) {
    if (!b.alive) return;

    if (b.type === 'blue' || b.type === 'red') {
      this.popBubble(b);
    } else if (b.type === 'purple') {
      b.flyAngle  = Math.random() * Math.PI * 2;
      b.bouncing  = true;
      b.bounceAge = 0;
      b.scale     = 1;
    }
  },

  // ─── Game complete ───────────────────────────────────────────────────────────

  endGame() {
    this.newRecord         = this.checkAndSaveScore(this.gameMode, this.score);
    this.state             = 'complete';
    this.cardAnimT         = 0;
    this.canvas.style.cursor = 'default';
    this.completeOkRect    = null;
    this.completeOkHovered = false;
  },

  returnToTitle() {
    this.state             = 'title';
    this.canvas.style.cursor = 'default';
    this.hoveredButton     = null;
    this.titleAnimT        = 0; // replay the card slide-in
    this.stopBgm();
  },

  showRecords() {
    this.state              = 'records';
    this.cardAnimT          = 0;
    this.canvas.style.cursor = 'default';
    this.recordsOkRect      = null;
    this.recordsOkHovered   = false;
  },

  // ─── Background music ────────────────────────────────────────────────────────

  startBgm() {
    if (!this.bgm) {
      this.bgm      = new Audio('assets/bgm/bgm.ogg');
      this.bgm.loop = true;
    }
    this.bgmFading       = false;
    this.bgm.muted       = !this.soundEnabled;
    this.bgm.volume      = 0.45;
    this.bgm.currentTime = 0;
    this.bgm.play().catch(() => {});
  },

  stopBgm() {
    if (!this.bgm || this.bgm.paused) return;
    this.bgmFading   = true;
    this.bgmFadeRate = this.bgm.volume / 1.5;
  },

  updateBgm(dt) {
    if (!this.bgm || !this.bgmFading) return;
    this.bgm.volume = Math.max(0, this.bgm.volume - this.bgmFadeRate * dt);
    if (this.bgm.volume <= 0) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgmFading       = false;
    }
  },

  // ─── HUD buttons ─────────────────────────────────────────────────────────────

  drawHudButtons() {
    const SZ = 34, MR = 10, GAP = 6;
    const bx = CANVAS_W - MR - SZ;
    const y1 = 46;
    const y2 = y1 + SZ + GAP;
    this.hudSoundRect = { x: bx, y: y1, w: SZ, h: SZ };
    this.hudEndRect   = { x: bx, y: y2, w: SZ, h: SZ };
    this.drawHudButton(bx, y1, SZ, this.hudSoundHovered);
    this.drawSoundIcon(bx + SZ / 2, y1 + SZ / 2, SZ * 0.36);
    this.drawHudButton(bx, y2, SZ, this.hudEndHovered);
    this.drawEndIcon(bx + SZ / 2, y2 + SZ / 2, SZ * 0.36);
  },

  drawHudButton(x, y, sz, hovered) {
    const { ctx } = this;
    const r = 7;
    const p = new Path2D();
    p.moveTo(x + r, y);
    p.arcTo(x + sz, y,      x + sz, y + sz, r);
    p.arcTo(x + sz, y + sz, x,      y + sz, r);
    p.arcTo(x,      y + sz, x,      y,      r);
    p.arcTo(x,      y,      x + sz, y,      r);
    p.closePath();
    ctx.save();
    ctx.fillStyle   = hovered ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.38)';
    ctx.fill(p);
    ctx.strokeStyle = hovered ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1.2;
    ctx.stroke(p);
    ctx.restore();
  },

  drawSoundIcon(cx, cy, r) {
    const { ctx } = this;
    ctx.save();
    const color = this.soundEnabled ? 'rgba(255,255,255,0.88)' : 'rgba(255,90,70,0.88)';
    ctx.fillStyle   = color;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r*0.70, cy - r*0.35);
    ctx.lineTo(cx - r*0.25, cy - r*0.35);
    ctx.lineTo(cx + r*0.20, cy - r*0.72);
    ctx.lineTo(cx + r*0.20, cy + r*0.72);
    ctx.lineTo(cx - r*0.25, cy + r*0.35);
    ctx.lineTo(cx - r*0.70, cy + r*0.35);
    ctx.closePath();
    ctx.fill();
    if (this.soundEnabled) {
      ctx.beginPath();
      ctx.arc(cx + r*0.2, cy, r*0.52, -Math.PI*0.42, Math.PI*0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r*0.2, cy, r*0.85, -Math.PI*0.38, Math.PI*0.38);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,90,70,0.88)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(cx + r*0.32, cy - r*0.55);
      ctx.lineTo(cx + r*0.78, cy + r*0.55);
      ctx.moveTo(cx + r*0.78, cy - r*0.55);
      ctx.lineTo(cx + r*0.32, cy + r*0.55);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawEndIcon(cx, cy, r) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,175,55,0.92)';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r*0.9);
    ctx.lineTo(cx, cy - r*0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r*0.68, Math.PI*0.62, Math.PI*2.38);
    ctx.stroke();
    ctx.restore();
  },

  // ─── Sound ───────────────────────────────────────────────────────────────────

  initSounds() {
    const base = 'assets/sounds/';
    this.soundFiles = {
      pop1:   base + 'pop_sound1.wav',
      pop2:   base + 'pop_sound2.wav',
      pop3:   base + 'pop_sound3.wav',
      pop4:   base + 'pop_sound4.wav',
      pop5:   base + 'pop_sound5.wav',
      bomb:   base + 'pop_bomb_sound.wav',
      purple: base + 'pop_purple_sound.wav',
    };
    this.soundBuffers = {}; // name -> decoded AudioBuffer, kept in memory for the session
    this.soundEls     = {}; // name -> HTMLAudioElement, fallback only

    // Preferred path: Web Audio API. Fetch each clip once, decode it to an
    // in-memory AudioBuffer, and hold it for the whole session. Playback then
    // spins up a throwaway BufferSource with no fetch/decode on the hot path,
    // so there is no lag between the pop event and the sound.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        this.audioCtx = new AC();
        this.sfxGain  = this.audioCtx.createGain();
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.audioCtx.destination);
        for (const [name, url] of Object.entries(this.soundFiles)) {
          fetch(url)
            .then(r => r.arrayBuffer())
            .then(buf => this.audioCtx.decodeAudioData(buf))
            .then(decoded => { this.soundBuffers[name] = decoded; })
            .catch(() => { this.preloadFallback(name); }); // keep this clip playable
        }
        return;
      } catch (e) {
        this.audioCtx = null; // Web Audio unavailable, drop to HTMLAudio
      }
    }

    // Fallback path (no Web Audio): preload HTMLAudio elements into memory.
    for (const name of Object.keys(this.soundFiles)) this.preloadFallback(name);
  },

  preloadFallback(name) {
    if (this.soundEls[name]) return;
    const el = new Audio(this.soundFiles[name]);
    el.preload = 'auto';
    el.load();
    this.soundEls[name] = el;
  },

  // Browsers create the AudioContext suspended until a user gesture. Resume it
  // on the first click so the very first pop is not swallowed.
  unlockAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  },

  playSound(name, rate = 1) {
    if (!this.soundEnabled) return;

    // Zero-latency path: play the pre-decoded buffer straight from memory.
    const buffer = this.soundBuffers && this.soundBuffers[name];
    if (this.audioCtx && buffer) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.connect(this.sfxGain);
      src.start(0);
      return;
    }

    // Fallback: cloned preloaded HTMLAudio element (also covers the brief window
    // before a buffer finishes decoding).
    const el = this.soundEls && this.soundEls[name];
    if (!el) return;
    const clone = el.cloneNode();
    clone.playbackRate = rate;
    clone.play().catch(() => {});
  },

  playRandomPop(rate = 1) {
    this.playSound(`pop${Math.ceil(Math.random() * 5)}`, rate);
  },

  // ─── High Scores storage ─────────────────────────────────────────────────────

  loadHighScores() {
    const blank = { flash: [0,0,0], sniper: [0,0,0], zen: [0,0,0] };
    try {
      const raw = localStorage.getItem('overlay-game1_scores');
      if (!raw) { this.highScores = blank; return; }
      const p = JSON.parse(raw);
      this.highScores = {
        flash:  (Array.isArray(p.flash)  ? p.flash  : []).concat([0,0,0]).slice(0,3).map(Number),
        sniper: (Array.isArray(p.sniper) ? p.sniper : []).concat([0,0,0]).slice(0,3).map(Number),
        zen:    (Array.isArray(p.zen)    ? p.zen    : []).concat([0,0,0]).slice(0,3).map(Number),
      };
    } catch (e) { this.highScores = blank; }
  },

  checkAndSaveScore(mode, score) {
    if (score <= 0) return null;
    const list = this.highScores[mode];
    if (score <= list[2]) return null;
    list.push(score);
    list.sort((a, b) => b - a);
    list.splice(3);
    const rank = list.indexOf(score);
    try { localStorage.setItem('overlay-game1_scores', JSON.stringify(this.highScores)); } catch (e) {}
    return { mode, rank };
  },

  // ─── Records screen ───────────────────────────────────────────────────────────

  drawRecordsScreen() {
    const { ctx } = this;

    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const vig = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, 200, CANVAS_W/2, CANVAS_H/2, 500);
    vig.addColorStop(0, 'rgba(20,60,100,0.0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Card entrance: scale + fade in (visual only; hit rects stay at final coords)
    const ease = 1 - (1 - this.cardAnimT) ** 3;
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.scale(0.9 + 0.1 * ease, 0.9 + 0.1 * ease);
    ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

    const cardW = 560, cardH = 370;
    const cardX = (CANVAS_W - cardW) / 2;
    const cardY = (CANVAS_H - cardH) / 2;
    const cr    = 18;

    const cardPath = new Path2D();
    cardPath.moveTo(cardX + cr, cardY);
    cardPath.arcTo(cardX + cardW, cardY,          cardX + cardW, cardY + cardH, cr);
    cardPath.arcTo(cardX + cardW, cardY + cardH,  cardX,         cardY + cardH, cr);
    cardPath.arcTo(cardX,         cardY + cardH,  cardX,         cardY,         cr);
    cardPath.arcTo(cardX,         cardY,          cardX + cardW, cardY,         cr);
    cardPath.closePath();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur  = 40;
    const cardBg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardBg.addColorStop(0, '#1a2a40');
    cardBg.addColorStop(1, '#0d1520');
    ctx.fillStyle = cardBg;
    ctx.fill(cardPath);
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(100,200,240,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.stroke(cardPath);
    ctx.restore();

    ctx.save();
    ctx.font         = 'bold 32px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    const hg = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
    hg.addColorStop(0, '#7de8e0');
    hg.addColorStop(1, '#a8d8ff');
    ctx.fillStyle   = hg;
    ctx.shadowColor = 'rgba(100,220,240,0.35)';
    ctx.shadowBlur  = 16;
    ctx.fillText('High Scores', CANVAS_W / 2, cardY + 56);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cardX + 40, cardY + 70);
    ctx.lineTo(cardX + cardW - 40, cardY + 70);
    const sep0 = ctx.createLinearGradient(cardX + 40, 0, cardX + cardW - 40, 0);
    sep0.addColorStop(0,   'rgba(100,200,220,0)');
    sep0.addColorStop(0.5, 'rgba(100,200,220,0.38)');
    sep0.addColorStop(1,   'rgba(100,200,220,0)');
    ctx.strokeStyle = sep0; ctx.lineWidth = 1; ctx.stroke();

    const MODES = [
      { id: 'flash',  label: 'Flash Pop',  color: 'rgba(255,128,80,0.95)',  accent: 'rgba(255,128,80,0.3)',  glow: 'rgba(255,128,80,0.6)'  },
      { id: 'sniper', label: 'Sniper Pop', color: 'rgba(160,96,240,0.95)',  accent: 'rgba(160,96,240,0.3)',  glow: 'rgba(160,96,240,0.6)'  },
      { id: 'zen',    label: 'Zen Pop',    color: 'rgba(48,200,210,0.95)',  accent: 'rgba(48,200,210,0.3)',  glow: 'rgba(48,200,210,0.6)'  },
    ];
    const RANK_COLORS = ['rgba(255,210,60,0.85)', 'rgba(200,200,220,0.75)', 'rgba(185,115,60,0.75)'];
    const colW  = cardW / 3;
    const row0Y = cardY + 148;
    const rowH  = 34;

    for (let col = 0; col < 3; col++) {
      const m      = MODES[col];
      const scores = this.highScores[m.id];
      const cx     = cardX + colW * col + colW / 2;

      if (col > 0) {
        ctx.beginPath();
        ctx.moveTo(cardX + colW * col, cardY + 80);
        ctx.lineTo(cardX + colW * col, cardY + cardH - 60);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }

      ctx.save();
      ctx.font         = 'bold 15px sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle    = m.color;
      ctx.shadowColor  = m.glow;
      ctx.shadowBlur   = 8;
      ctx.fillText(m.label, cx, cardY + 104);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(cx - 42, cardY + 112);
      ctx.lineTo(cx + 42, cardY + 112);
      ctx.strokeStyle = m.accent;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      for (let rank = 0; rank < 3; rank++) {
        const rowY  = row0Y + rank * rowH;
        const val   = scores[rank];
        const isNew = this.newRecord !== null &&
                      this.newRecord.mode === m.id &&
                      this.newRecord.rank === rank;

        ctx.save();
        ctx.textBaseline = 'middle';

        ctx.font      = '13px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = RANK_COLORS[rank];
        ctx.fillText(`${rank + 1}.`, cx - 8, rowY);

        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        if (isNew) {
          ctx.shadowColor = 'rgba(255,50,30,1)';
          ctx.shadowBlur  = 18;
          ctx.fillStyle   = '#ff6040';
        } else if (val === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
        }
        ctx.fillText(val === 0 ? '-' : String(val), cx - 2, rowY);
        ctx.restore();
      }
    }

    const btnW = 160, btnH = 46;
    const btnX  = (CANVAS_W - btnW) / 2;
    const btnY  = cardY + cardH - btnH - 22;
    this.recordsOkRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    const btnR    = 10;
    const btnPath = new Path2D();
    btnPath.moveTo(btnX + btnR, btnY);
    btnPath.arcTo(btnX + btnW, btnY,          btnX + btnW, btnY + btnH, btnR);
    btnPath.arcTo(btnX + btnW, btnY + btnH,   btnX,        btnY + btnH, btnR);
    btnPath.arcTo(btnX,        btnY + btnH,   btnX,        btnY,        btnR);
    btnPath.arcTo(btnX,        btnY,          btnX + btnW, btnY,        btnR);
    btnPath.closePath();

    ctx.save();
    if (this.recordsOkHovered) { ctx.shadowColor = '#20a8b8'; ctx.shadowBlur = 22; }
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
    btnGrad.addColorStop(0, '#20a8b8');
    btnGrad.addColorStop(1, '#005070');
    ctx.fillStyle = btnGrad;
    ctx.fill(btnPath);
    if (this.recordsOkHovered) {
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.12)';
      ctx.fill(btnPath);
    }
    ctx.strokeStyle = this.recordsOkHovered ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1.2;
    ctx.stroke(btnPath);
    ctx.restore();

    ctx.font         = 'bold 20px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.95)';
    ctx.fillText('OK', btnX + btnW / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';

    ctx.restore(); // end card entrance transform
  },

  wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (this.ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  },

  drawCompleteScreen() {
    const { ctx } = this;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Card entrance: scale + fade in (visual only; hit rects stay at final coords)
    const ease = 1 - (1 - this.cardAnimT) ** 3;
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.scale(0.9 + 0.1 * ease, 0.9 + 0.1 * ease);
    ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

    const cardW = 480, cardH = 310;
    const cardX = (CANVAS_W - cardW) / 2;
    const cardY = (CANVAS_H - cardH) / 2;
    const cr    = 18;

    const cardPath = new Path2D();
    cardPath.moveTo(cardX + cr, cardY);
    cardPath.arcTo(cardX + cardW, cardY,          cardX + cardW, cardY + cardH, cr);
    cardPath.arcTo(cardX + cardW, cardY + cardH,  cardX,         cardY + cardH, cr);
    cardPath.arcTo(cardX,         cardY + cardH,  cardX,         cardY,         cr);
    cardPath.arcTo(cardX,         cardY,           cardX + cardW, cardY,         cr);
    cardPath.closePath();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur  = 40;
    const cardBg = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardBg.addColorStop(0, '#1a2a40');
    cardBg.addColorStop(1, '#0d1520');
    ctx.fillStyle = cardBg;
    ctx.fill(cardPath);
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(100,200,240,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.stroke(cardPath);
    ctx.restore();

    ctx.save();
    ctx.font         = 'bold 34px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    const hg = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
    hg.addColorStop(0, '#7de8e0');
    hg.addColorStop(1, '#a8d8ff');
    ctx.fillStyle   = hg;
    ctx.shadowColor = 'rgba(100,220,240,0.35)';
    ctx.shadowBlur  = 16;
    ctx.fillText('Game Complete!', CANVAS_W / 2, cardY + 60);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cardX + 40, cardY + 74);
    ctx.lineTo(cardX + cardW - 40, cardY + 74);
    const sep = ctx.createLinearGradient(cardX + 40, 0, cardX + cardW - 40, 0);
    sep.addColorStop(0,   'rgba(100,200,220,0)');
    sep.addColorStop(0.5, 'rgba(100,200,220,0.38)');
    sep.addColorStop(1,   'rgba(100,200,220,0)');
    ctx.strokeStyle = sep; ctx.lineWidth = 1; ctx.stroke();

    const msg = COMPLETE_MESSAGES[this.gameMode] || '';
    ctx.font         = '17px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = 'rgba(180,220,245,0.9)';
    const lines  = this.wrapText(msg, cardW - 80);
    const lineH  = 24;
    const msgY0  = cardY + 108;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], CANVAS_W / 2, msgY0 + i * lineH);
    }

    ctx.font         = 'bold 30px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.fillText(`Score: ${this.score}`, CANVAS_W / 2, msgY0 + lines.length * lineH + 34);

    const btnW = 160, btnH = 46;
    const btnX = (CANVAS_W - btnW) / 2;
    const btnY = cardY + cardH - btnH - 22;
    this.completeOkRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    const btnR    = 10;
    const btnPath = new Path2D();
    btnPath.moveTo(btnX + btnR, btnY);
    btnPath.arcTo(btnX + btnW, btnY,          btnX + btnW, btnY + btnH, btnR);
    btnPath.arcTo(btnX + btnW, btnY + btnH,   btnX,        btnY + btnH, btnR);
    btnPath.arcTo(btnX,        btnY + btnH,   btnX,        btnY,        btnR);
    btnPath.arcTo(btnX,        btnY,          btnX + btnW, btnY,        btnR);
    btnPath.closePath();

    ctx.save();
    if (this.completeOkHovered) { ctx.shadowColor = '#20a8b8'; ctx.shadowBlur = 22; }
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
    btnGrad.addColorStop(0, '#20a8b8');
    btnGrad.addColorStop(1, '#005070');
    ctx.fillStyle = btnGrad;
    ctx.fill(btnPath);
    if (this.completeOkHovered) {
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.12)';
      ctx.fill(btnPath);
    }
    ctx.strokeStyle = this.completeOkHovered ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1.2;
    ctx.stroke(btnPath);
    ctx.restore();

    ctx.font         = 'bold 20px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.95)';
    ctx.fillText('OK', btnX + btnW / 2, btnY + btnH / 2);
    ctx.textBaseline = 'alphabetic';

    ctx.restore(); // end card entrance transform
  },

  // ─── Sniper HUD ──────────────────────────────────────────────────────────────

  drawSniperHUD() {
    const { ctx } = this;
    const ratio    = Math.max(0, this.idleTimer / SNIPER_IDLE_TIMEOUT);
    const critical = this.clicksLeft <= 5;

    ctx.save();

    ctx.font      = 'bold 20px sans-serif';
    ctx.fillStyle = critical ? 'rgba(255,80,40,0.95)' : 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`Clicks: ${this.clicksLeft}`, 16, 32);

    const bX = 16, bY = 42, bW = 140, bH = 5;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bX, bY, bW, bH);

    if (ratio > 0.5)       ctx.fillStyle = 'rgba(32,200,180,0.9)';
    else if (ratio > 0.25) ctx.fillStyle = 'rgba(255,180,40,0.9)';
    else {
      const pulse = 0.65 + 0.35 * Math.sin(this.gameTime * Math.PI * 5);
      ctx.globalAlpha = pulse;
      ctx.fillStyle   = 'rgba(255,60,40,0.95)';
    }
    ctx.fillRect(bX, bY, bW * ratio, bH);

    ctx.restore();
  },

  // ─── Title screen ────────────────────────────────────────────────────────────

  startGame(mode) {
    this.gameMode    = mode;
    this.bubbles     = [];
    this.explosions  = [];
    this.particles   = [];
    this.scorePopups = [];
    this.shockwaves  = [];
    this.shards      = [];
    this.pendingPops = [];
    this.cursorTrail = [];
    this.shake       = 0;
    this.combo       = 0;
    this.comboTimer  = 0;
    this.displayScore = 0;
    this.sniperEnding = false;
    this.sniperEndTimer = 0;
    this.colorBleed = { r: 0, g: 0, b: 0, a: 0 };
    this.initBokeh();
    this.initAmbientField();
    this.score       = 0;
    this.gameTime    = 0;
    this.spawnTimer  = 0;
    this.nextSpawnIn = SPAWN_INTERVAL_BASE;
    this.timeLeft    = (mode === 'flash') ? 30 : Infinity;
    this.clicksLeft  = (mode === 'sniper') ? SNIPER_CLICK_LIMIT : 0;
    this.idleTimer   = SNIPER_IDLE_TIMEOUT;
    this.state       = 'playing';
    this.cardAnimT   = 0;
    this.canvas.style.cursor = 'none'; // custom reticle is drawn instead
    for (let i = 0; i < SPAWN_INITIAL; i++) this.spawnBubble('blue');
    this.startBgm();
  },

  onCanvasMouseMove(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx     = (e.clientX - rect.left) * scaleX;
    const cy     = (e.clientY - rect.top)  * scaleY;

    this.mouseX = cx; this.mouseY = cy;
    if (this.state === 'playing') this.pushCursorPoint(cx, cy);

    if (this.state === 'complete') {
      if (this.completeOkRect) {
        const { x, y, w, h } = this.completeOkRect;
        this.completeOkHovered = cx >= x && cx <= x + w && cy >= y && cy <= y + h;
        this.canvas.style.cursor = this.completeOkHovered ? 'pointer' : 'default';
      }
      return;
    }

    if (this.state === 'records') {
      if (this.recordsOkRect) {
        const { x, y, w, h } = this.recordsOkRect;
        this.recordsOkHovered = cx >= x && cx <= x + w && cy >= y && cy <= y + h;
        this.canvas.style.cursor = this.recordsOkHovered ? 'pointer' : 'default';
      }
      return;
    }

    if (this.state === 'playing') {
      const inRect = (r) => r && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
      this.hudSoundHovered = inRect(this.hudSoundRect);
      this.hudEndHovered   = inRect(this.hudEndRect);
      this.canvas.style.cursor = (this.hudSoundHovered || this.hudEndHovered) ? 'pointer' : 'none';
      return;
    }

    if (this.state !== 'title') return;

    this.hoveredButton = null;
    for (const btn of this.titleButtons) {
      if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
        this.hoveredButton = btn; break;
      }
    }
    this.canvas.style.cursor = this.hoveredButton ? 'pointer' : 'default';
  },

  drawTitleScreen() {
    const { ctx } = this;

    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const vig = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, 200, CANVAS_W/2, CANVAS_H/2, 500);
    vig.addColorStop(0, 'rgba(20,60,100,0.0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.drawTitleField();
    this.drawDecoBubbles();

    ctx.save();
    ctx.font         = '13px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = 'rgba(100,190,230,0.38)';
    ctx.fillText('X S O L L A', CANVAS_W / 2, 66);
    ctx.restore();

    ctx.save();
    ctx.font      = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    const tg = ctx.createLinearGradient(CANVAS_W/2 - 220, 80, CANVAS_W/2 + 220, 140);
    // Sweep a bright highlight band across the wordmark
    const peak = 0.15 + 0.70 * (0.5 + 0.5 * Math.sin(this.gameTime * 0.8));
    tg.addColorStop(0,           '#7de8e0');
    tg.addColorStop(peak - 0.12, '#8fe9ea');
    tg.addColorStop(peak,        '#ffffff');
    tg.addColorStop(peak + 0.12, '#a8d8ff');
    tg.addColorStop(1,           '#a8d8ff');
    ctx.fillStyle = tg;
    ctx.shadowColor = 'rgba(30,180,200,0.35)';
    ctx.shadowBlur  = 24;
    ctx.fillText('Bubble Bopper', CANVAS_W / 2, 128);
    ctx.restore();

    ctx.font         = '16px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = 'rgba(160,210,245,0.55)';
    ctx.fillText('Select a mode to play', CANVAS_W / 2, 167);

    ctx.beginPath();
    ctx.moveTo(CANVAS_W/2 - 140, 182); ctx.lineTo(CANVAS_W/2 + 140, 182);
    const sep = ctx.createLinearGradient(CANVAS_W/2 - 140, 0, CANVAS_W/2 + 140, 0);
    sep.addColorStop(0,   'rgba(100,200,220,0)');
    sep.addColorStop(0.5, 'rgba(100,200,220,0.35)');
    sep.addColorStop(1,   'rgba(100,200,220,0)');
    ctx.strokeStyle = sep; ctx.lineWidth = 1; ctx.stroke();

    for (const btn of this.titleButtons) {
      this.drawModeButton(btn, btn === this.hoveredButton);
    }
  },

  drawDecoBubbles() {
    const decos = [
      { x: 65,  y: 98,  r: 44, type: 'blue',   flyAngle: 0 },
      { x: 715, y: 105, r: 32, type: 'red',     flyAngle: 0 },
      { x: 48,  y: 492, r: 26, type: 'purple',  flyAngle: 1.2 },
      { x: 742, y: 498, r: 38, type: 'blue',    flyAngle: 0 },
      { x: 662, y: 295, r: 19, type: 'purple',  flyAngle: 2.8 },
    ];
    for (const d of decos) {
      this.drawBubble({ x: d.x, y: d.y, radius: d.r, type: d.type, scale: 1,
        flying: false, flyAngle: d.flyAngle, pulsing: false, bouncing: false });
    }
  },

  drawModeButton(btn, hovered) {
    const { ctx } = this;
    const { x, y, w, h, label, colorA, colorB, time, clicks } = btn;
    const r  = 14;
    const bcy = y + h / 2;

    // Staggered slide-in + hover scale (visual only; hit rects stay fixed)
    const i     = btn._i || 0;
    const local = Math.max(0, Math.min(1, (this.titleAnimT - i * 0.08) / 0.5));
    const ease  = 1 - (1 - local) ** 3;
    const slide = (1 - ease) * -70;
    const hs    = hovered ? 1.05 : 1;
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(slide, 0);
    ctx.translate(x + w / 2, bcy); ctx.scale(hs, hs); ctx.translate(-(x + w / 2), -bcy);

    const p = new Path2D();
    p.moveTo(x + r, y);
    p.arcTo(x + w, y,     x + w, y + h, r);
    p.arcTo(x + w, y + h, x,     y + h, r);
    p.arcTo(x,     y + h, x,     y,     r);
    p.arcTo(x,     y,     x + w, y,     r);
    p.closePath();

    ctx.save();
    if (hovered) { ctx.shadowColor = colorA; ctx.shadowBlur = 24; }
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, colorA); grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    ctx.fill(p);
    if (hovered) {
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.1)';
      ctx.fill(p);
    }
    ctx.strokeStyle = hovered ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1.2;
    ctx.stroke(p);
    ctx.restore();

    ctx.font          = 'bold 22px sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = 'rgba(255,255,255,0.95)';
    ctx.fillText(label, x + w / 2, bcy);
    ctx.textBaseline  = 'alphabetic';

    if (time !== undefined) this.drawModeInfo(x + w + 26, bcy, time, clicks);

    ctx.restore();
  },

  drawModeInfo(startX, cy, time, clicks) {
    const { ctx } = this;

    const cx1 = startX + 14;
    ctx.beginPath(); ctx.arc(cx1, cy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx1, cy); ctx.lineTo(cx1, cy - 7.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx1, cy); ctx.lineTo(cx1 + 7, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx1, cy, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(time, cx1 + 17, cy);

    const cx2 = startX + 104;
    this.drawMouseIcon(cx2, cy);
    ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(clicks, cx2 + 13, cy);

    ctx.textBaseline = 'alphabetic';
  },

  drawMouseIcon(cx, cy) {
    const { ctx } = this;
    const mw = 10, mh = 16, mr = 4;
    const mx = cx - mw / 2, my = cy - mh / 2;

    const mp = new Path2D();
    mp.moveTo(mx + mr, my);
    mp.arcTo(mx + mw, my,     mx + mw, my + mh, mr);
    mp.arcTo(mx + mw, my + mh, mx,     my + mh, mr);
    mp.arcTo(mx,      my + mh, mx,     my,      mr);
    mp.arcTo(mx,      my,     mx + mr, my,      mr);
    mp.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6; ctx.stroke(mp);

    ctx.beginPath(); ctx.moveTo(cx, my); ctx.lineTo(cx, my + mh * 0.42);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, my + mh * 0.28, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  },
};

// ─── Entry point ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => Game.init());
