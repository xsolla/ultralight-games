// ============================================================================
// enemies.js — the enemy entity model: entries and paths (re-parameterised by
// arc length), chain and formation spawning, movement, spin, and the wave's
// HP/speed scaling. Plain objects on Game.enemies, updated in place.
//
// WHAT spawns and WHEN is spawner.js's; shooting is shooters.js's; every hit is
// collide.js's. No drawing.
// ============================================================================

// ---- Tunable entry and path knobs (§7.6) ---------------------------------------
const PATH_SAMPLES = 48;                    // arc-length table resolution
const ENTRY_MARGIN = 22;                    // px beyond the edge an enemy enters from
const ENTRY_SIDE_CHANCE = 0.55;             // the rest enter from the top edge
const ENTRY_SIDE_Y = [36, CANVAS_H / 3];    // side entries stay in the viewport's upper third
const ENTRY_TOP_X = [30, CANVAS_W - 30];
const EXIT_X = [36, CANVAS_W - 36];         // where on the planet a path lands
const PATH_AMP = [16, 30];                  // px of weave
const PATH_WAVES = [1.5, 3];                // weave cycles over the whole path
const PATH_BOW = [40, 90];                  // px an arc or S-curve bends out
const GENTLE = 0.55;                        // shooter formations bend this much less, so they hold shape

let nextEnemyId = 1;

// Where the planet's surface is at screen column x.
function planetSurfaceY(x) {
  const dx = x - PLANET_CX;
  return PLANET_CY - Math.sqrt(LAYOUT.PLANET_R * LAYOUT.PLANET_R - dx * dx);
}

// A random entry off the left, right or top edge. `side` is -1 left, 1 right,
// 0 top. `pad` pushes the start further out for something big.
function rollEntry(pad) {
  const m = ENTRY_MARGIN + (pad || 0);
  if (Math.random() < ENTRY_SIDE_CHANCE) {
    const side = Math.random() < 0.5 ? -1 : 1;
    return { x: side < 0 ? -m : CANVAS_W + m, y: randRange(ENTRY_SIDE_Y), side };
  }
  return { x: randRange(ENTRY_TOP_X), y: -m, side: 0 };
}

// A path from a random entry to a random point on the planet, in one of `kinds`.
// The sweep only makes sense from a side, so a top entry drops it.
function rollPath(kinds, gentle) {
  const en = rollEntry(0);
  const k = gentle ? GENTLE : 1;
  const x1 = randRange(EXIT_X);
  const p = {
    x0: en.x, y0: en.y,
    x1, y1: planetSurfaceY(x1) + 2,      // just under the surface, so arrival is contact
    dir: -en.side,                       // a sweep runs in toward the middle
    amp: randRange(PATH_AMP) * k,
    waves: randRange(PATH_WAVES),
    bow: randRange(PATH_BOW) * k * (Math.random() < 0.5 ? -1 : 1),
  };
  const allowed = en.side ? kinds : kinds.filter((s) => s !== 'sweep');
  return makePath(PATHS[pick(allowed)], p);
}

// Sample the shape once into a cumulative-length table, so position can be
// asked for by distance travelled: every type moves at its own px/s along any
// shape, and a chain's links keep their spacing through the bends.
function makePath(fn, p) {
  const cum = new Float32Array(PATH_SAMPLES + 1);
  let prev = fn(0, p), total = 0;
  for (let i = 1; i <= PATH_SAMPLES; i++) {
    const q = fn(i / PATH_SAMPLES, p);
    total += Math.hypot(q.x - prev.x, q.y - prev.y);
    cum[i] = total;
    prev = q;
  }
  const end = fn(1, p);
  // Past the end, an enemy keeps falling straight at the planet's centre. That
  // is what brings in a formation's trailing members, whose offset would
  // otherwise leave them parked just above the surface forever.
  const fx = PLANET_CX - end.x, fy = PLANET_CY - end.y, fl = Math.hypot(fx, fy);
  return { fn, p, cum, len: total, end, fallX: fx / fl, fallY: fy / fl };
}

function pathPoint(path, s) {
  if (s >= path.len) {
    const over = s - path.len;
    return { x: path.end.x + path.fallX * over, y: path.end.y + path.fallY * over };
  }
  if (s <= 0) return path.fn(0, path.p);
  const cum = path.cum;
  let lo = 0, hi = PATH_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const f = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  return path.fn((lo + f) / PATH_SAMPLES, path.p);
}

// ---- The wave's scaling (WAVE_RAMP) ---------------------------------------------
function waveHp(base, wave) {
  return Math.max(1, Math.round(base * (1 + WAVE_RAMP.HP_PER_WAVE * (wave - 1))));
}
function waveSpeed(wave) {
  return Math.min(WAVE_RAMP.SPEED_MAX, 1 + WAVE_RAMP.SPEED_PER_WAVE * (wave - 1));
}

// ---- Creation --------------------------------------------------------------------
// `delayMs` holds a chain's later links back so they enter one after another
// along the same path; until it runs out the enemy is not on the field at all —
// not drawn, not collidable, not targetable — but it still counts toward the wave.
function createEnemy(t, wave, path, offX, offY, delayMs) {
  const type = ENEMY_TYPES[t];
  const sp = SpriteKit.ENEMY_SPRITES[type.sprite];
  const dispW = sp.dispW * ENEMY_DISP_BASE * SIZE_SCALE.enemy;
  const hp = waveHp(type.hp, wave);
  const start = pathPoint(path, 0);
  return {
    id: nextEnemyId++,
    kind: 'enemy',
    t, wave,
    x: start.x + offX, y: start.y + offY, vx: 0, vy: 0,
    path, dist: 0, offX, offY,
    delayMs, active: false,
    speed: type.speed * waveSpeed(wave),
    hp, maxHp: hp,
    dispW,
    r: SpriteKit.enemyHitRadius(dispW, sp.disc),
    // Tumbling discs start at a random spin phase; armed hulls start nose-down,
    // the way they are flying.
    rot: type.shoots ? Math.PI : Math.random() * TAU,
    animMs: Math.random() * 1000,
    fireMs: ENEMY_FIRE_DELAY_MS,
    burstLeft: 0,
    burstMs: 0,
    contact: {},     // ship id -> ms until that ship can be rammed again (§7.4)
    dead: false,
  };
}

// N links of one passive type on one path, CHAIN_SPACING px apart.
function spawnChain(list, t, wave) {
  const type = ENEMY_TYPES[t];
  const n = Math.min(WAVE_RAMP.CHAIN_MAX,
                     randInt(type.chain) + Math.floor((wave - 1) / WAVE_RAMP.CHAIN_BONUS_EVERY));
  const path = rollPath(PASSIVE_PATHS, false);
  const gapMs = CHAIN_SPACING / (type.speed * waveSpeed(wave)) * 1000;
  for (let i = 0; i < n; i++) list.push(createEnemy(t, wave, path, 0, 0, i * gapMs));
}

// One shooter type in its formation, every member on the same path, offset.
function spawnGroup(list, t, wave) {
  const path = rollPath(SHOOTER_PATHS, true);
  for (const [ox, oy] of FORMATIONS[ENEMY_TYPES[t].formation]) {
    list.push(createEnemy(t, wave, path, ox, oy, 0));
  }
}

// ---- Update ----------------------------------------------------------------------
function updateEnemies(list, dt) {
  for (const e of list) {
    if (e.dead) continue;
    if (!e.active) {
      e.delayMs -= dt;
      if (e.delayMs > 0) continue;
      e.active = true;
    }
    e.animMs += dt;
    const px = e.x, py = e.y;
    e.dist += e.speed * dt / 1000;
    const p = pathPoint(e.path, e.dist);
    e.x = p.x + e.offX;
    e.y = p.y + e.offY;
    // Velocity is measured rather than stored, so it is right through every bend
    // — it is what the fleet leads its shots by.
    if (dt > 0) { e.vx = (e.x - px) / dt * 1000; e.vy = (e.y - py) / dt * 1000; }
    const type = ENEMY_TYPES[e.t];
    if (!type.shoots) e.rot += SpriteKit.ENEMY_SPRITES[type.sprite].spin * DEG * dt / 1000;
    for (const k in e.contact) {
      e.contact[k] -= dt;
      if (e.contact[k] <= 0) delete e.contact[k];
    }
  }
}
