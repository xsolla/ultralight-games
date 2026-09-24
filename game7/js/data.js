// ============================================================================
// data.js — the balance tables, and no behaviour: base units, hulls, guns, the
// healer, behaviours, the planet, the economy, the wave clock, damage, enemies,
// formations, meteors, the wave ramp, and the path SHAPES (pure functions of
// progress, as game6's PATHS table was). The design doc's percentages stay
// percentages here (1.0 = 100%) and become absolute numbers only by multiplying
// BASE, so a designer tweaks in the doc's own language and one BASE change
// rescales the roster (CLAUDE.md §4, §9).
//
// Every number is a first guess to be tuned in playtests.
// ============================================================================

// ---- What "100%" means -------------------------------------------------------
const BASE = {
  HP: 10,               // ship HP at 100%
  FIRE_INTERVAL: 400,   // ms between shots at 100% firing speed (2.5 shots/s)
  BULLET_SPEED: 300,    // px/s at 100%
  BULLET_LIFE: 600,     // ms at 100% — so range 1.0 is 180 px, half the screen width
  GUN_PRICE: 10,        // X: a level-1 gun at basePrice 100%
  KILL_REWARD: 3,       // a passive enemy; every other reward is a multiple of it
};

// ---- Display sizes (designer, 2026-09-24; CLAUDE.md §9) -----------------------
// Every table keeps its BASE dispW and the drawn size is that times one of these
// knobs. Hit radii and HP-bar widths derive from the drawn size.
const SIZE_SCALE = { ship: 0.65, enemy: 0.75, meteor: 1.0, shot: 0.8 };

// ---- Hulls (CLAUDE.md §9) ------------------------------------------------------
// `row` indexes interceptor_atlas.png. `hp` is a fraction of BASE.HP; `speed` is
// logical px/s; `turn` is degrees/s; `dispW` is the BASE display width.
// `role` is the one-line description the build popup prints under the name.
const HULLS = [
  { key: 'interceptor', name: 'Interceptor', row: 0, hp: 1.0, speed: 120, turn: 360,
    price: 20, buildMs: 3000, dispW: 26, role: 'FAST SKIRMISHER' },
  { key: 'warhammer',   name: 'Warhammer',   row: 1, hp: 3.0, speed: 55,  turn: 150,
    price: 35, buildMs: 4000, dispW: 30, role: 'HEAVY LINE HOLDER' },
  { key: 'tahyon',      name: 'Tahyon',      row: 2, hp: 2.2, speed: 85,  turn: 240,
    price: 50, buildMs: 5000, dispW: 30, role: 'LONG-RANGE DEFENDER' },
];

// ---- Guns (CLAUDE.md §7.3) -------------------------------------------------------
// `row` indexes projectiles_atlas.png. fireRate / bulletSpeed / life are
// fractions of BASE. `levels` says what a level buys: 'count' fires N bullets a
// shot, 'rate' (Flame Fury) fires one bullet N times as fast.
//
// `pattern` is where the bullets go: 'fan' spreads them evenly over spreadDeg,
// 'group' sets them side by side `spacing` px apart, 'sweep' walks one barrel
// across a spreadDeg cone on a sweepMs triangle wave.
//
// `levelCost` is per gun on purpose, so each can be retuned alone: level L
// costs GUN_PRICE x basePrice x the sum of its first L entries (§7.2).
// `mountOn` lists the hulls that can carry it; null means every hull.
const GUNS = [
  { key: 'spark', name: 'Spark Gun', short: 'SPARK', row: 0, sfx: 'weaponSpark',
    fireRate: 1.0, bulletSpeed: 1.0, life: 1.0, levels: 'count',
    pattern: 'fan', spreadDeg: 15,
    basePrice: 1.0, levelCost: [1, 1.5, 2, 2.5, 3], mountOn: null, dispW: 9 },
  { key: 'plasma', name: 'Plasma Gun', short: 'PLASMA', row: 1, sfx: 'weaponPlasma',
    fireRate: 0.8, bulletSpeed: 0.8, life: 1.6, levels: 'count',
    pattern: 'fan', spreadDeg: 30,
    basePrice: 1.0, levelCost: [1, 1.5, 2, 2.5, 3], mountOn: null, dispW: 11 },
  // Lifetime halved from the doc's 200% (designer, 2026-09-24): range 4.0 -> 2.0.
  { key: 'mystic', name: 'Mystic Dagger', short: 'DAGGER', row: 2, sfx: 'weaponDagger',
    fireRate: 1.0, bulletSpeed: 2.0, life: 1.0, levels: 'count',
    pattern: 'group', spacing: 4,
    basePrice: 1.0, levelCost: [1, 1.5, 2, 2.5, 3], mountOn: null, dispW: 8 },
  { key: 'fury', name: 'Flame Fury', short: 'FURY', row: 3, sfx: 'weaponFury',
    fireRate: 1.0, bulletSpeed: 1.0, life: 0.5, levels: 'rate',
    pattern: 'sweep', spreadDeg: 10, sweepMs: 700,
    basePrice: 1.0, levelCost: [1, 1.5, 2, 2.5, 3], mountOn: null, dispW: 10 },
  // Lifetime raised from the doc's 200% to 250% (designer, 2026-09-23) so the
  // Tahyon's gun out-ranges the Mystic Dagger — long range is that hull's whole role.
  { key: 'lightning', name: 'Lightning Gun', short: 'LIGHTNING', row: 4, sfx: 'weaponLightning',
    fireRate: 0.7, bulletSpeed: 1.8, life: 2.5, levels: 'count',
    pattern: 'fan', spreadDeg: 10,
    basePrice: 1.0, levelCost: [1, 1.5, 2, 2.5, 3], mountOn: [2], dispW: 10 },
];
const GUN_LEVELS = 5;

// ---- The healer (CLAUDE.md §7.9) ---------------------------------------------------
// An Interceptor hull re-tinted, with no gun. `hp` is its whole heal budget: it
// spends its own hull to repair others and fades out when it is gone.
const HEALER = {
  name: 'Medic', short: 'MEDIC', row: 0, speed: 120, turn: 360, dispW: 24,
  hp: 30,               // HP, and the most it can ever give away
  price: 40,
  buildMs: 1000,
  healRate: 10,         // HP/s transferred while in range
  healRange: 30,        // logical px between centres
  tint: 'rgb(60, 235, 180)',   // the hue its Interceptor sprite is shifted to
};

// ---- Behaviours (CLAUDE.md §7.5) ---------------------------------------------------
// `zone` is the home third of space: 0 far (top), 1 middle, 2 near the planet.
const BEHAVIOURS = [
  { key: 'aggressive', label: 'AGGRESSIVE', short: 'AGGR', zone: 0 },
  { key: 'balanced',   label: 'BALANCED',   short: 'BAL',  zone: 1 },
  { key: 'defensive',  label: 'DEFENSIVE',  short: 'DEF',  zone: 2 },
];
const START_BEHAVIOUR = 'defensive';   // every new ship (§7.2)

// ---- Planet, economy, waves (CLAUDE.md §9) ---------------------------------------
const PLANET = { HP: 30 };
const ECONOMY = { START_MONEY: 100 };   // designer, 2026-09-24: tried 50, too low
const WAVES = {
  OPENING_BREAK_MS: 12000,   // the run opens with a break so the first ships can be built
  BREAK_MS: [10000, 15000],  // between waves, rolled each time
  SPAWN_WINDOW_MS: 30000,    // how long a wave keeps spawning; it lasts until its enemies are gone
  BIG_EVERY: 5,              // every Nth wave is announced with the larger cue
};

// ---- Damage (CLAUDE.md §7.4) --------------------------------------------------
const DAMAGE = {
  BULLET: 1,              // every bullet, player's or enemy's
  RAM: 2,                 // a ship and an enemy colliding: both take this
  METEOR_TO_SHIP: 3,      // a ship ramming a meteor takes this...
  SHIP_TO_METEOR: 1,      // ...and the meteor takes this
  CONTACT_CD_MS: 600,     // a survivor of a ram cannot hit the same ship again for this long
};

// ---- Enemies (CLAUDE.md §7.6, §9) ----------------------------------------------
// `sprite` indexes SpriteKit.ENEMY_SPRITES — rows 0-4 are the tumbling aliens,
// 5-9 the armed ones — which also supplies the atlas, row, spin, pulse cadence,
// hit fraction and burst colours. Only the balance lives here.
//
// Drawn width is that sprite's dispW x ENEMY_DISP_BASE x SIZE_SCALE.enemy.
// `hp` and `speed` (px/s) are wave-1 values; WAVE_RAMP grows them. Every `hp`
// was tripled from the first guesses (designer, 2026-09-24). `reward` is a
// multiple of BASE.KILL_REWARD; `planetDmg` is what reaching the planet costs
// it; `from` is the first wave the type can appear in.
//
// Passives come in chains (`chain` is the link-count range). Shooters come in a
// FORMATIONS entry and fire `gun` (a GUNS index) at level 1 every `everyMs`,
// optionally as a `burst` of shots `burstGapMs` apart.
const ENEMY_DISP_BASE = 0.7;
const ENEMY_TYPES = [
  { key: 'sentinel', name: 'Sentinel', sprite: 0, shoots: false,
    hp: 6, speed: 60, planetDmg: 1, reward: 1, from: 1, chain: [5, 8] },
  { key: 'warden', name: 'Warden', sprite: 1, shoots: false,
    hp: 12, speed: 45, planetDmg: 2, reward: 1, from: 2, chain: [4, 6] },
  { key: 'lancer', name: 'Lancer', sprite: 2, shoots: false,
    hp: 3, speed: 95, planetDmg: 1, reward: 1, from: 1, chain: [6, 10] },
  { key: 'bulwark', name: 'Bulwark', sprite: 3, shoots: false,
    hp: 24, speed: 35, planetDmg: 3, reward: 1, from: 6, chain: [3, 5] },
  { key: 'phantom', name: 'Phantom', sprite: 4, shoots: false,
    hp: 9, speed: 75, planetDmg: 1, reward: 1, from: 4, chain: [5, 8] },

  { key: 'marauder', name: 'Marauder', sprite: 5, shoots: true,
    hp: 15, speed: 30, planetDmg: 3, reward: 3, from: 3, formation: 'solo',
    gun: { gun: 2, everyMs: 1800 } },
  { key: 'harrier', name: 'Harrier', sprite: 6, shoots: true,
    hp: 12, speed: 35, planetDmg: 3, reward: 3, from: 2, formation: 'arrow3',
    gun: { gun: 1, everyMs: 1500 } },
  { key: 'reaver', name: 'Reaver', sprite: 7, shoots: true,
    hp: 9, speed: 32, planetDmg: 3, reward: 3, from: 1, formation: 'pair',
    gun: { gun: 0, everyMs: 1200 } },
  { key: 'stalker', name: 'Stalker', sprite: 8, shoots: true,
    hp: 21, speed: 22, planetDmg: 3, reward: 3, from: 5, formation: 'solo',
    gun: { gun: 3, everyMs: 2200, burst: 3, burstGapMs: 150 } },
  { key: 'corsair', name: 'Corsair', sprite: 9, shoots: true,
    hp: 15, speed: 26, planetDmg: 3, reward: 3, from: 4, formation: 'line3',
    gun: { gun: 4, everyMs: 2000 } },
];
// A shooter's first shot comes this long after it APPEARS — enters the screen —
// rather than after it spawns off-edge (designer, 2026-09-24; was 3-5 s).
const ENEMY_FIRE_DELAY_MS = 1000;
const CHAIN_SPACING = 26;                   // px along the path between links of a chain

// Offsets in px from the path, for each member of a shooter group. +y is
// forward (the paths run down the screen), so an arrowhead's lead is at 0.
const FORMATIONS = {
  solo:   [[0, 0]],
  pair:   [[-13, 0], [13, 0]],
  arrow3: [[0, 0], [-22, -20], [22, -20]],
  line3:  [[-26, 0], [0, 0], [26, 0]],
};

// ---- Meteors (CLAUDE.md §7.7) ------------------------------------------------------
// `row` indexes asteroid_sprite_atlas.png, and colour is size. Drawn width is
// METEOR_W x sizeMult x SIZE_SCALE.meteor. `reward` is a multiple of KILL_REWARD.
const METEOR_W = 54;
const METEOR_TYPES = [
  { key: 'small',  row: 0, sizeMult: 0.8, hp: 20, speed: 18, planetDmg: 3, reward: 10, from: 3 },
  { key: 'medium', row: 1, sizeMult: 1.0, hp: 40, speed: 13, planetDmg: 5, reward: 15, from: 5 },
  { key: 'large',  row: 2, sizeMult: 1.2, hp: 70, speed: 9,  planetDmg: 8, reward: 20, from: 8 },
];

// ---- Wave ramp (CLAUDE.md §9) ------------------------------------------------------
const WAVE_RAMP = {
  CHAINS: [2, 0.6],          // passive chains in wave n: 2 + floor(0.6 (n-1))
  CHAIN_BONUS_EVERY: 4,      // every 4 waves adds a link to every chain...
  CHAIN_MAX: 12,             // ...up to this many links
  GROUPS: [0.5, 0.5],        // shooter groups: floor(0.5 + 0.5 n)
  HP_PER_WAVE: 0.10,         // enemy HP x (1 + 0.1 (n-1)), rounded
  SPEED_PER_WAVE: 0.02,      // enemy speed x (1 + 0.02 (n-1))...
  SPEED_MAX: 1.4,            // ...capped here
  METEOR_FROM: 3,            // one meteor every other wave from here,
  METEOR_EVERY_FROM: 8,      // one every wave from here,
  METEOR_DOUBLE_FROM: 12,    // two every wave from here
  FIRST_EVENT_MS: 1000,      // the first spawn lands this far into the window...
  LAST_EVENT_MS: 26000,      // ...and the last this far, so chains finish entering in time
  JITTER_MS: 900,            // each event moves up to this much either way
};

// ---- Paths (CLAUDE.md §7.6) ----------------------------------------------------------
// Shape functions (u, p) -> {x, y}, u running 0 at the entry to 1 at the planet.
// The spawner rolls `p` once per chain or group; enemies.js re-parameterises by
// arc length so every type moves at its own speed along any shape.
//
// Every shape COMMITS DOWNWARD (game6's rule): y is monotonic in u. That is why
// the bends are horizontal offsets rather than perpendicular ones — a sideways
// bow on a diagonal line could lift y and make an enemy stall mid-screen.
//   p: { x0, y0, x1, y1, amp, waves, bow, dir }
function bez3(a, b, c, d, u) {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
}
const PATHS = {
  // Straight from the entry point onto the planet.
  straight: (u, p) => ({ x: p.x0 + (p.x1 - p.x0) * u, y: p.y0 + (p.y1 - p.y0) * u }),
  // Straight, with a sideways weave that eases in over the first fifth.
  weave: (u, p) => ({
    x: p.x0 + (p.x1 - p.x0) * u + p.amp * Math.sin(u * p.waves * TAU) * Math.min(1, u * 5),
    y: p.y0 + (p.y1 - p.y0) * u,
  }),
  // One broad bend to a side.
  arc: (u, p) => {
    const cx = (p.x0 + p.x1) / 2 + p.bow, cy = (p.y0 + p.y1) / 2, v = 1 - u;
    return { x: v * v * p.x0 + 2 * v * u * cx + u * u * p.x1, y: v * v * p.y0 + 2 * v * u * cy + u * u * p.y1 };
  },
  // Two bends, one each way.
  scurve: (u, p) => ({
    x: bez3(p.x0, p.x0 + (p.x1 - p.x0) / 3 + p.bow, p.x0 + 2 * (p.x1 - p.x0) / 3 - p.bow, p.x1, u),
    y: bez3(p.y0, p.y0 + (p.y1 - p.y0) / 3, p.y0 + 2 * (p.y1 - p.y0) / 3, p.y1, u),
  }),
  // A side entry that runs in almost level, then curves down onto the planet.
  sweep: (u, p) => ({
    x: bez3(p.x0, p.x0 + p.dir * 170, p.x1, p.x1, u),
    y: bez3(p.y0, p.y0 + 12, p.y1 - 170, p.y1, u),
  }),
};
const PASSIVE_PATHS = ['straight', 'weave', 'arc', 'scurve', 'sweep'];
const SHOOTER_PATHS = ['straight', 'weave', 'arc'];   // formations hold together on gentle shapes
