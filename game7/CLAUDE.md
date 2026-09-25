# Planet Defense

Space tower defense played in real time. A planet sits at the bottom of a vertical 9:16
screen. The player builds autonomous spaceships and sets each one's behaviour; the ships
defend the planet against waves of alien invaders and meteors. Vanilla HTML + CSS + JS,
**no build step, no dependencies, no framework**.

**Design source of truth:** the Google Doc "Planet Defense Game high level design"
(https://docs.google.com/document/d/1rw-bJl204p3WBciv_G2S3PfDH5uqhpcnT346C0Sbc2c/edit).
This file restates that doc and adds the decisions settled with the designer on
2026-09-23. Where the two disagree, this file is newer. If the doc changes, re-read it
and update this file.

**Status (2026-09-24): steps 1–3 of 4 are built. The game is playable end to end.** The
build plan is:
1. Skeleton: title screen, planet, HUD, the shared buttons.
2. Shipyard and ships: build button and popup, queue, launch, behaviours and patrol,
   medic, HP bars.
3. Enemies and waves: paths, spawner, meteors, guns, collisions, money, planet damage,
   game over.
4. Finishing: explosions, the full SFX set, and polish.

What runs today:
- The title screen, with the orbiting planet.
- A run from start to finish:
  - waves planned from `WAVE_RAMP`;
  - all ten enemy types on their paths, in chains and formations;
  - meteors;
  - the fleet targeting and firing by behaviour;
  - shooters firing back, rams, and planet damage (flashes, fires, shake);
  - money pop-ups;
  - the planet-lost sequence, then the records / game-over card.
- The build button, its tech-spec popup, and the medic.
- HP bars on everything, the exit / sound / fullscreen buttons, and every combat sound
  in §10.

Step 4 is what's left: balance from playtests, polish, and anything the designer asks
for.

House style, scaling, the HUD buttons, explosions and file structure are **taken from
the sibling project `../game6`** (Space Interceptor). Its `CLAUDE.md` is long and worth
reading once. When a convention here is ambiguous, open game6's source and match it.

---

## 1. Hard constraints

- **Never modify anything in `../game6`.** Read it and copy from it. Games deploy as
  standalone folders (iframe / Xsolla Overlay), so **nothing may be a cross-game import**.
  Duplicate code into this folder deliberately, the way `../branding.md` asks.
- **No build, no bundler, no transpiler, no npm.** The files in the repo are the files
  that ship.
- **No `import`/`export`, no `<script type="module">`.** Use plain `<script src>` tags in
  dependency order. Top-level `const`s and `function`s are shared globals.
- **No external requests at runtime.** No CDNs, no web fonts, no analytics. Canvas text
  uses the system stack `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Must run from `file://`.** Never call `getImageData` and never `fetch` assets. Audio
  uses `HTMLAudioElement`, not Web Audio, for the same reason (game6 §2).
- **Sprites vs vectors:**
  - From atlases: ships, projectiles, aliens, meteors, explosions.
  - Drawn on canvas: the planet, HUD, buttons, the build popup, behaviour menu and
    text.
  - There are no DOM controls. Never import UI images.
  - Ask before adding any asset file.
- Target 60 fps on a mid-range phone. Everything is `dt`-driven.

## 2. Running it

Open `index.html` directly, or serve the folder:

```powershell
python -m http.server 8080     # then http://localhost:8080
```

There is no test suite and no linter. To verify, load the page, play, and watch the
console. Hard-reload (Ctrl+Shift+R) when serving, because `http.server` sends no
`Cache-Control`. In the desktop app's preview pane, add a query string (`?v=2`) instead.

The desktop app's preview pane runs `.claude/launch.json` (server `game7`, port 8087).
It shows files outside the project only as static snapshots, and a page it opens
directly has a `data:` origin, so relative asset paths fail there. Serve through that
config instead.

Dev-only pages (`sprite_harness.html`, `planet_test.html`) sit in the folder root and
are never linked from the game.

The git repository root is `..` (`ultralight-games`), which holds every game.
Deployment covers the whole repo: Firebase hosting plus GitHub Pages
(`../.github/workflows`).

## 3. File layout

This is game6's shape, adapted to this game. Put each concern in its slot rather than
inventing a new home.

```
  index.html                canvas + ordered <script> tags, nothing else
  css/styles.css            canvas scaling & page chrome, copied from game6
  js/constants.js           cross-cutting: CANVAS_W/H, MAX_DPR, LAYOUT (horizon, planet, build button), ZONE_H, COLORS, FONT, MONO, SOUND_CYCLE, SHOW_HP_BARS, DEG, TAU, clamp/randRange/randInt/pick
  js/spaceships_sprites.js  SpriteKit, moved here from the root, contents unchanged
  js/data.js                tables: BASE, SIZE_SCALE, HULLS, GUNS, HEALER, BEHAVIOURS, PLANET, ECONOMY, WAVES, DAMAGE, ENEMY_TYPES, FORMATIONS, METEOR_TYPES, WAVE_RAMP, PATHS
  js/weapons.js             gun stats, volley patterns (fan / group / sweep), the bullet update
  js/shipyard.js            pricing, orderBlocker (the one "can this be ordered" check), the build queue
  js/ships.js               fleet entities: zones, launch, targeting + firing (§7.5), steering, patrol, separation, picking
  js/healer.js              the medic: patient choice, HP transfer, hover, fade-out
  js/enemies.js             enemy entities: entries, arc-length paths, chains and formations, movement, wave scaling
  js/shooters.js            armed enemies: fire delay, aim at the nearest ship, cadence and bursts, facing
  js/meteors.js             meteor entities
  js/spawner.js             the wave clock and each wave's plan (planWave)
  js/collide.js             hit tests and damage resolution; REPORTS events, game.js acts on them
  js/explosions.js          burst entity model, copied from game6 and scaled; + meteor burst, planet death
  js/ambiance.js            starfield, copied from game6 (slowed to a drift)
  js/planet.js              Planet: procedural layers, the orbiting sun, time-sliced generation and sun pass, damage effects (§6)
  js/render.js              the scene: world, fleet, enemies, shots, explosions, HP bars, pop-ups, shake, HUD + the shared buttons
  js/buildui.js             build button, tech-spec popup, behaviour menu — layout and drawing
  js/menu.js                title screen and the records card (which is also the game-over card)
  js/audio.js               Sound namespace, copied from game6, SFX table re-mapped (§10)
  js/scores.js              best-wave table in localStorage
  js/game.js                the Game object: state, screens, input, main loop, collision consequences, resize, fullscreen
  assets/sprites/*.png      the five atlases (ships, projectiles, 2x aliens, asteroids)
  assets/sfx/*.mp3          29 one-shots, same set as game6
  assets/bgm/*.mp3          bgm_title + bgm_battle1..3, game7's own set (game6 keeps its own bgm_ship1..3)
  sprite_harness.html       dev-only visual check of SpriteKit
  planet_test.html          dev-only planet look-dev page; the reference for planet.js (§6)
  .claude/launch.json       preview-pane config: `python -m http.server 8087` in this folder
  cards/                    card covers + rarity frames. NOT part of this design; leave unused
```

**planet.js and buildui.js draw.** That's deliberate, and it follows two precedents:
- **Planet** is an art provider that owns its caches and draws itself, the way
  SpriteKit does.
- **buildui.js** is presentation, like menu.js: it holds layout and drawing and never
  mutates state.

**Load order.** It's declared in `index.html` with a comment, as game6 does:

```
constants -> spaceships_sprites -> data
          -> pure logic (weapons, shipyard, ships, healer, spawner; then enemies,
                         shooters, meteors, collide, explosions)
          -> presentation (ambiance, planet, render, buildui, menu)
          -> subsystems (audio, scores) -> game
```

Nothing may reference a global from a later file *at load time*. Doing so inside a
function that only runs after `Game.init()` is fine.

**SpriteKit** (`spaceships_sprites.js`) is a measured, self-contained module. Treat its
numbers as vendored. Its manifests, cell boxes and hit fractions were measured off the
alpha channels, and several are traps if "tidied" (read its header). **Game names, sizes
and balance live in `data.js`, not in SpriteKit.** For example, row 2 is called "Verdant"
in SpriteKit and "Tahyon" here. Only `data.js` decides what a hull is called and how big
it is drawn.

**`sprite_harness.html`** is a dev-only check page, now pointed at
`js/spaceships_sprites.js` and `assets/sprites/`. Never link it from the game.

## 4. Code conventions

These are the same as game6 `CLAUDE.md` §4. Hold to them strictly.

- **Every file opens with a banner.** It names the file, its one responsibility, and what
  explicitly does *not* belong in it.
- **One concern per file.** Boundaries:
  - `render.js` draws and never mutates state.
  - `data.js` is tables with no behaviour.
  - `collide.js` is pure predicates plus damage resolution.
  - `game.js` owns the loop, input and screen transitions.
  - When a change doesn't fit its file's banner, move the work or add a module. Don't
    widen the banner.
- **Constants:** cross-cutting ones go in `constants.js`; local ones go at the top of
  their module under a `// ---- Tunable … ----` sub-banner. Every number gets a unit
  comment. **No magic numbers in logic.**
- **Keep the design doc's percentages as data.** `HULLS[i].hp = 3.0` means "300%" and
  `GUNS[i].fireRate = 0.8` means "80%". They become absolute values only by multiplying
  the `BASE` unit table (§9). A designer then tweaks numbers in the doc's own language,
  and one `BASE` change rescales the whole roster.
- **A new hull, gun, enemy, meteor, path or formation is a new row in its table.** A new
  `if` in the update loop is the signal that a table is missing a field. Example: the
  Lightning Gun's Tahyon-only rule is a `mountOn` field, not a branch.
- **Stateful subsystems get a namespace object** (`Game`, `Sound`, `Scores`,
  `SpriteKit`). **Pure libraries export bare functions** that take everything as
  arguments.
- **Single game-state object.** `Game` holds all run state. Entities are plain-object
  arrays (`Game.ships`, `Game.enemies`, `Game.meteors`, `Game.bullets`,
  `Game.enemyBullets`, `Game.explosions`, `Game.buildQueue`), swept in place. No
  classes, no ECS, no inheritance.
- **Explicit screen state.** `Game.screen` is one of `'menu' | 'playing' | 'records'`.
  `update` and `drawScene` branch on it at the top.
  - As in game6, the game-over card **is** the records card, opened with
    `recordsFrom = 'gameover'`.
  - Overlays inside a run (the build popup, the behaviour menu) are fields on Game
    (`popup`, `menu`), not screens.
- **Time and speed units:**
  - Time is milliseconds: `dt = t - lastTime`, clamped to 100.
  - Durations are declared in ms.
  - Speeds are declared in **logical px/s** and integrated as `v * dt / 1000`.
- **Comments explain *why*.** No dead code, no commented-out experiments, no TODO
  graveyards.
- Ask before adding a runtime dependency. New JS modules are routine.

## 5. Rendering, scaling, HUD — taken from game6

**Logical resolution is `360 × 640`** (`CANVAS_W`/`CANVAS_H`), exactly 9:16. All
gameplay math is in logical px. Never read `canvas.width` in game logic.

**"Sharp hybrid" scaling** is game6's *hybrid sharp scaling*, copied as-is:

- `index.html` declares `<canvas id="game" width="360" height="640">`.
- `css/styles.css` sizes the element with `width: min(100vw, 56.25vh, 540px)`,
  `aspect-ratio: 9 / 16` and `touch-action: none`, and uncaps under `html:fullscreen`.
  Body flex centres and letterboxes it. Copy the file.
- `Game.resizeCanvas()` rebuilds the **backing store** at device pixels:
  - `dpr = min(devicePixelRatio, MAX_DPR = 2)`
  - then `ctx.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0)`
  - then `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`
  - Re-run it on `resize`, `orientationchange` and `fullscreenchange`. On the last one,
    run it again inside a `requestAnimationFrame`.
- Vector content (HUD, text, planet, particles) renders at full backing resolution.
  Sprites use one smoothed `drawImage`.
- Pointer → logical coordinates go through `getBoundingClientRect()` (game6
  `toLogical`).

**The three shared buttons — sound, exit, fullscreen.** `../branding.md` is the
authority. Copy game6's implementation of it:

- From `render.js`: `HUD_BTN`, `HUD_BTN_IDS`, `MENU_BTN_IDS`, `hudButtonIds`,
  `HUD_BTN_SLOP`, `hudButtonRects`, `hudButtonAt`, `drawHudButtons`, `drawSoundIcon`,
  `drawPowerIcon`, `drawFullscreenIcon` and `roundRectPath`.
- From `game.js`: `pressHudButton`, `isFullscreen` and `toggleFullscreen`.
- From `constants.js`: `SOUND_CYCLE`.

Rules that come with them:

- Appearance values are **not tuning knobs**. Keep the deliberate near-misses against
  `COLORS`.
- Layout is game6's deviation: a **horizontal row, top-right, at `HUD_PAD`**, with hit
  slop.
- The title and records screens show sound + fullscreen only, because exit would return
  to where the player already is.
- Sound is three-state: `on` → `musicoff` → `off`.
- **Exit** returns to the title screen via the records card, exactly like game6's
  `endRun()`. The run's best wave still counts.
- **Fullscreen** targets `<html>`, not the canvas, and swallows the rejection that
  happens inside an iframe without `allow="fullscreen"`.
- **HUD first:** `pointerdown` hit-tests the shared buttons before anything else (build
  panel, behaviour menu, ship picking) and returns early.

**Explosions — copy game6's system.**

- Copy `js/explosions.js` whole: `makeBurst`, `makePuff`, `pushBurst`, `explodeEnemy`,
  `explodeImpact`, `explodeShip`, `updateExplosions`, `shardDist`, `rgbCss`,
  `EXPLOSION_MAX = 40`.
- Copy its draw half from `render.js`: `drawExplosions`, `drawBurstCore`,
  `drawBurstRing`, `drawBurstShards` and the `BOOM_*` knobs.
- Replace game6's `Atlas.*` calls with `SpriteKit.*` (`has`, `drawBurst`), and
  `ENEMY_TYPES`/`SHIPS` lookups with this game's tables.
- Every layer draws with `'lighter'`.

Per event:

- **Enemy death:** `explodeEnemy`, which uses the enemy's own atlas row, untinted.
- **Player ship death:** `explodeShip` (the multi-colour wreck), scaled to the smaller
  hulls.
- **Meteor destroyed:** a tinted burst (`SpriteKit.drawBurst` with a tint) in the rock's
  own `color`/`spark` from `ASTEROID_SPRITES`, sized to the meteor. The asteroid atlas
  has no burst frames.
- **Hit landing on a ship or on the planet:** `explodeImpact` in the colour of whatever
  landed it.
- **Healer:** never explodes. It fades out (§7.8).
- **Screen shake** (game6 `render.js`) is for planet hits and game over only. With
  dozens of ships trading fire, shaking on every ship hit would never stop.

## 6. Sprites and sizes

The SpriteKit usage contract is in its header. The parts that matter here:

- **Ships are edge-anchored.** `drawShip(ctx, row, frame, cx, cy, dispW)` centres the
  *hull* on (cx, cy) and the plume hangs below it. These ships turn, so translate and
  rotate first, then draw at (0, 0):
  `ctx.translate(x, y); ctx.rotate(heading); SpriteKit.drawShip(ctx, row, f, 0, 0, dispW)`.
- **Everything else draws in the current transform**, centred on the origin. Bullets
  pivot on their tip.
- All sprites are authored nose-up, so heading 0 = up the screen.
- Frames:
  - Engine frames: `shipFrame(t, turbo)`. Turbo frames could mark a ship dashing to a
    target.
  - Alien and meteor columns are a glow pulse (`enemyFrame`, `asteroidFrame`).
  - Passive aliens spin (`ENEMY_SPRITES[i].spin`). Armed aliens don't spin; they face
    their travel direction or their aim.
- **A missing atlas must not wedge the game.** Pair every draw with its placeholder via
  `SpriteKit.has(key)`.
- Hit radii: `enemyHitRadius(dispW, disc)` (armed rows pass their own `disc`) and
  `asteroidHitRadius(dispW)`. Ship hitbox = hull width × `hullHeight`.
- **Meteor colour IS its size here** (§7.7), deliberately. That overrides SpriteKit's
  note that colour should not be a tell, which was written for game6.

**Ships are small in this game.** The doc asks for ships "smaller than atlas resolution
suggests". The designer settled the display sizes on 2026-09-24 with the size sliders in
`planet_test.html`. They are four scale knobs over the base sizes; see "Display sizes"
in §9.

One consequence: small sprites are downscaled hard.
- Hulls are 17–20 px from 141–155 px source frames, and aliens are 19–25 px from
  204 px cells. At a 2× backing store that is roughly 3.5–5× downscaling, where game6
  sat at ~1:1.
- Chrome's `imageSmoothingQuality = 'high'` copes, but other browsers may shimmer as
  ships turn.
- Check on a phone. If it shimmers, cache each ship and alien frame once per resize at
  its display size in an offscreen canvas, stepping down by halves.
- Never switch to nearest-neighbour.

**Healer sprite.** It is the Interceptor row, hue-shifted. Build that once per frame
into a cached offscreen canvas, using the same technique as `SpriteKit.tinted()`: blit,
fill with a `'hue'` blend, then restamp alpha with `'destination-in'`. That reads no
pixels back, so `file://` still works. Don't rely on `ctx.filter`, whose Safari support
is patchy. Target a "medical" green-teal; the exact hue is tunable.

### The planet — generated in code, look chosen 2026-09-24

**The planet has no art.** Only its top arc is on screen, with a thin atmosphere. The
designer picked the look in `planet_test.html`, which is the **reference
implementation**. Port its generation code into the game rather than re-deriving it.
Ask before adding a planet image.

**Chosen settings** (the test page's defaults):

| Setting | Value |
|---|---|
| Style / palette | Soft (painted); palette defaults to Terran, player-selectable (below) |
| Horizon (top of the disc at screen centre) | y = 560 |
| Radius | 490 px, 1.36× the screen width. The arc drops to y ≈ 594 at the screen edges. |
| Sun direction | 14° (just right of straight up) |
| Sun behind ↔ in front | −0.80: well behind the planet |
| Atmosphere thickness / brightness | 7.5 px / 100% |
| Cloud cover / drift | 60% / 0.8° of arc per second |
| Terrain seed | 11 |

With the sun that far behind, the planet is **backlit**: a bright rim runs along the whole
horizon, a thin sunlit crescent hugs the limb, and the night side below it shows city
lights.

**Planet type is player-selectable** (settled 2026-09-25). `planet_test.html`'s four
palettes — Terran, Desert, Glacier, Alien — are all ported into `planet.js` as
`PALETTES`, keyed the same way; the style stays Soft-only. The title screen shows one
small button per palette (menu.js's planet-type row, §11); pressing one calls
`Planet.setPalette(key)`, which swaps the palette and the picked palette's own cloud
cover, then rebuilds in the background exactly like a resize — the old look keeps
drawing until the new one is lit, so the switch never blanks the screen. Since `Planet`
is the one instance the title screen and a run both draw, whatever was chosen carries
straight into the next run with no extra wiring.

**Technique.** Everything stays `file://`-safe: pixels are written into offscreen
canvases with `putImageData` and never read back.

- **Polar mapping:** `u = θ·ρ` along the arc, `v = R·acos(ρ/R)` inward from the limb.
  Features bend along the curve and foreshorten toward the horizon, which is what makes
  a flat band read as a globe.
- **Band-limited fBm:** the noise drops octaves a pixel can't resolve, so the limb
  doesn't sparkle.
- **Two kinds of layer**, both screen-aligned at device resolution:
  - **Sun-independent**, generated once per resize or setting change: the ground
    albedo, plus per-pixel caches of the surface normal, limb normal, coverage,
    atmosphere profiles (limb line, halo, haze), relief slope and city glow.
  - **Sun-dependent**, rebuilt by a **sun pass** (`relight()`) from those caches
    whenever the sun moves: the day/night shade (with relief folded in), city lights,
    and the atmosphere colour and brightness (sunset tint where the terminator meets
    the limb, sea glint). It is plain arithmetic plus three `putImageData` calls.
- **City lights are points**, not noise:
  - They are sampled on a jittered grid in surface coordinates, only on land and only
    inside city regions, then projected to the screen.
  - A point stays one pixel wide however hard the limb foreshortens, so lights show
    **all the way up to the horizon**.
  - Acceptance is thinned by `nz` so the horizon doesn't fuse into a solid line.
  - They light up only on the night side, with a faint sodium glow over each city.
- **Clouds** are one layer. Its noise is periodic in angle and covers a sector wider than
  the view. It is drawn rotated about the planet centre each frame, so the drift is
  seamless and costs one `drawImage`. The shade layer on top darkens them at night.
- **Per frame:** about 6 `drawImage` calls plus a few gradients for hits and fires, and
  the sun pass when the sun has moved.
- **Measured costs** on the dev machine:
  - Generation: about 80 ms at 1.14× backing, about 0.7 s at 3.4×.
  - Sun pass: about 60 ns per active pixel. That is 3.5 ms at 1.14× (76k px) and 42 ms
    at 3.4× (695k px).
- **Phone budget.** A phone at 2× backing has ~290k active pixels. That's too many for a
  sun pass every frame on a phone CPU. If the game's sun moves:
  - run the pass at ~1× logical resolution, where the terminator is soft anyway;
  - throttle it to ~10 Hz, since the sun moves 0.6° per 100 ms;
  - or split its rows across frames.
  - Draw the city points as vector dots, so they stay crisp either way.
  - Generation should likewise run at reduced resolution (the test page already builds
    clouds at 0.6× backing) or be spread over frames.

**The sun orbits, in the game too** (designer, 2026-09-24). It makes one turn per
minute: direction runs −180° → 180°, then wraps. The terminator, sunset rim and city
lights sweep across the planet on every screen, title included.

So the game uses the phone-budget measures above:
- Layers are generated at `min(backing scale, 2)`.
- Generation and the sun pass are **time-sliced**: each runs for a few ms per frame and
  uploads only the rows it touched.
- City points are drawn as vector dots each frame.

**Damage feedback** (in the test page):
- A hit gives a flash, two pulses racing along the limb, and a shock ring.
- Below 75% HP, fires with smoke appear on land.
- City lights dim with HP.
- The atmosphere dims to 75% brightness at 0 HP.

## 7. Game design spec

### 7.1 Screen layout and zones

```
  y=0    ┌────────────────────────────┐  HUD strip over the field: money, wave/timer,
         │ $ 120   WAVE 3  0:12  [][][]│  planet HP; shared buttons top-right
         │                            │
         │   ZONE 1 — far / top ⅓     │  Aggressive ships live here.
         │   (enemies enter here)     │  Enemies spawn off the edges in the top ⅓.
         ├────────────────────────────┤
         │   ZONE 2 — middle ⅓        │  Balanced ships live here.
         ├────────────────────────────┤
         │   ZONE 3 — near / low ⅓    │  Defensive ships live here. New ships start here.
  560    │ ╭──────── planet ────────╮ │  horizon (top of the planet disc)
         │ │                   [+▲] │ │  the planet, fully visible; ONE build button (§11)
  640    └─┴────────────────────────┴─┘
```

- "Space" is the area from the top of the screen down to the planet's horizon. The three
  zones are its thirds. All of them derive from `LAYOUT` in `constants.js` (planet
  centre/radius, space top/bottom), so moving the horizon moves the zones with it.
- Geometry, chosen 2026-09-24 (§6):
  - The planet is a disc of r = 490 (1.36× the screen width) centred below the screen,
    with its top at y = 560.
  - The visible cap is 80 px tall at the centre and ~46 px at the edges.
  - Space is y 0–560, so each zone is ~187 px tall.
- "Visible" means the entity's centre is inside the viewport.

### 7.2 Building ships

A ship is built from three choices: **hull**, **gun**, **gun level (1–5)**.

- **Price = hull price + gun price at that level.**
- **Gun price at level L** = `gun.basePrice × Σ levelCost[0..L-1]`.
  - `levelCost` is `[1, 1.5, 2, 2.5, 3]`: level 1 costs X, 1 → 2 costs 1.5X, 2 → 3 costs
    2X, and so on.
  - With X = 10 the cumulative prices are 10 / 25 / 45 / 70 / 100, so level 5 costs 10×
    level 1.
  - **`levelCost` and `basePrice` are per gun** so each can be tweaked separately. Today
    all five guns carry the same values (doc: "Base price: 100%").
- **Lightning Gun mounts on Tahyon only** (`GUNS[i].mountOn = [2]`). The build popup
  shows it locked for other hulls. Tahyon can mount every gun.
- **Build time is per hull:** Interceptor 3 s, Warhammer 4 s, Tahyon 5 s. The healer
  takes 1 s.
- Ships can be bought **any time, mid-wave included**. The healer can only be bought
  **during the break between waves** (§7.8).
- **No limit on ship count** for now.
- **Built ships cannot be upgraded**: hull, gun and level are fixed for the ship's
  lifetime. With no ship cap, building another ship is the upgrade path. If playtests
  show a cap is needed, an upgrade process gets designed alongside it. Don't build
  either one ahead of that decision.
- Money is paid when the order is placed. Orders build one at a time in a FIFO queue
  (the planet is a single shipyard). A finished ship launches from the planet's surface
  into Zone 3.
- Every new ship starts **Defensive**.
- **Ordering happens in the build popup (§11).** Its BUILD button places the order and
  closes the popup. The popup keeps the last selection, so repeating a build is two taps.
- **The healer is ordered from the same popup**, as a fourth hull tab ("MEDIC"). The
  tab is only enabled between waves. With it selected, the armament and level sections
  are replaced by the healer's own spec.

### 7.3 Guns

"Firing speed", "bullet speed" and "bullet lifetime" are percentages of the `BASE` units
(§9). **Range = bullet speed × lifetime.** Range is what the ship AI means by "can be
reached by its weapon". It depends on the gun, not the level.

Level rule for every gun except Flame Fury: **level N fires N bullets per shot**, and
level 1 is always a single bullet dead ahead.

| Gun | Fire speed | Bullet speed | Lifetime | Range | Level progression |
|---|---|---|---|---|---|
| Spark Gun | 100% | 100% | 100% (low) | 1.0 | N bullets evenly across a **15°** fan |
| Plasma Gun | 80% | 80% | 160% (medium) | 1.28 | N bullets evenly across a **30°** fan |
| Mystic Dagger | 100% | 200% | **100%** (doc: 200%, halved 2026-09-24) | **2.0** | N bullets in a **tight group**: extra bullets sit right beside the first and fly together on the same heading (~4 px apart) |
| Flame Fury | **100% × level** (100–500%) | 100% | 50% (very low) | 0.5 | **Gatling.** Always ONE bullet per shot. The barrel constantly sweeps left-right inside a **10°** cone, whether or not it is firing. Each level adds +100% fire rate. |
| Lightning Gun | 70% | 180% | **250%** (high) | **4.5** | N bullets evenly across a **10°** fan. **Tahyon only.** |

- **Fan angles:** for N ≥ 2, bullet `i` flies at `-F/2 + F·i/(N-1)` from the heading.
- **Balance check:** Flame Fury at level 5 (12.5 shots/s × 1 bullet) matches Spark at
  level 5 (2.5 volleys/s × 5 bullets). Fury trades spread for focus and very short range.
- **Lightning has the longest range in the game, by design.** The doc gave it 200%
  lifetime, which left it at range 3.6, short of Mystic Dagger's 4.0. That contradicted
  Tahyon's core role, which is to be a defender that fires very far. The designer
  raised it to 250% (2026-09-23). Keep Lightning's range above every other gun's when
  retuning.
- **Mystic Dagger's lifetime was halved** to 100% (designer, 2026-09-24). Its range is
  now 2.0 (360 px): a fast, accurate mid-range gun rather than a second sniper.
- **The gun fires along the ship's nose.** Ships turn to face their target at a
  per-hull turn rate. A ship fires only when its heading is within the fan's half-angle
  plus a small tolerance (6°) of the aim point.
- **Ships lead their target**, first order: they aim where it will be after the
  bullet's flight time, from its measured velocity. At these bullet speeds, a shot at
  where a Lancer is arrives where it was.
- **Enemy shooters do not lead.** They swing onto the nearest ship's current position
  over ~550 ms, then fire down their own nose. That keeps their shots dodgeable in
  principle.

### 7.4 Damage rules

- **Every bullet deals 1 damage**, player's and enemy's alike. Bullets **do not pierce**:
  one bullet, one hit, gone.
- **A ship ramming an enemy:** both take **2 damage**.
- **A ship ramming a meteor:** the ship takes **3**, the meteor takes **1**.
- **Enemy / meteor reaching the planet:** the planet takes that type's `planetDmg` and
  the enemy is destroyed (it explodes, and pays no money).
- **Friendly fire:** none. Player bullets ignore player ships and the planet. Enemy
  bullets ignore enemies.
- **Enemy bullets hit player ships only.** They pass over the planet harmlessly. The
  planet is damaged only by bodies reaching it (enemies and meteors).
- **A collision is an event, not a state.** An enemy or meteor that survives a ram
  (Bulwark, any meteor) must not re-hit the same ship every frame. Give each pair a
  contact cooldown, and push the ship out of the body.
- **Ship-to-ship:** no damage, but a soft separation so a crowd of ships doesn't stack
  into one sprite.
- **Kill credit:** money is paid for any enemy or meteor destroyed by a player bullet or
  ram. It is never paid for one that reaches the planet.

### 7.5 Player-ship behaviour

The player never steers ships. Each ship has one of three behaviours, changed at any
time by **tapping the ship and choosing from the menu that appears** (§11).

| Behaviour | Home zone | Target selection |
|---|---|---|
| **Aggressive** | Zone 1 (far third) | The closest **visible** enemy, anywhere. Flies to within range of it (may leave Zone 1 to do so) and attacks. |
| **Balanced** | Zone 2 (middle third) | The closest visible enemy **within its weapon range**, from where it is. |
| **Defensive** | Zone 3 (near third) | The closest visible enemy that is **in the lower ⅔ of space** (Zones 2+3) **and within weapon range**. |

- **Home-zone rule (all behaviours):** if an enemy is inside the ship's own zone but out
  of its range, the ship flies toward it to attack.
- **Idle:** with no target, a ship drifts slowly around its home zone. It picks random
  waypoints inside the zone at ~35% of hull speed, with short pauses. A ship whose
  behaviour was just changed flies to its new zone.
- **Target re-evaluation happens when the current target dies.** That lock is what
  keeps ships from twitching between targets.
  - The lock also breaks when the target leaves the screen, when the ship's behaviour
    changes, or when the target stops satisfying that behaviour's selection rule (e.g.
    it drifts out of a Balanced ship's range). Otherwise a ship could sit locked on
    something it can never hit. The designer approved this on 2026-09-23.
- **Standoff:** an attacking ship closes to ~85% of its range, then holds and fires. It
  does not ram on purpose.
- Meteors are valid targets like enemies.

### 7.6 Enemies

**Ten types**, one per row of the two alien atlases.

**Passive** (`alien_noshoot_atlas.png`):
- They have no guns and do damage only by colliding with ships or the planet.
- They come in **chains**: N enemies on one fixed path, spaced evenly in time, from the
  spawn point to the planet.
- They are faster than shooters, and they spin.

**Shooting** (`alien_shoot_atlas.png`):
- They arrive **solo or in small formations**: lines, arrowheads, pairs.
- They are harder to take down (more HP) and slower than passives. Their path also ends
  at the planet.
- Their gun:
  - It is **one of the player's five guns, always at level 1** (one bullet per shot),
    with that gun's bullet speed and lifetime.
  - They fire on their **own patterns** (interval or burst, §9).
  - They **start shooting 1 s after appearing on screen** (designer, 2026-09-24; the
    doc said 3–5 s). The delay counts from entering the viewport, not from spawning
    beyond the edge. They aim at the **nearest
    player ship**.
  - With no player ship alive they hold fire.
- They don't spin. They face travel direction, or turn toward their aim when firing.

**Spawning:**
- Enemies enter from the **left, right or top edge, within the upper ⅓ of the
  viewport**.
- Paths are pure functions of age, `(t, params) -> {x, y}`, in a `PATHS` table (game6's
  model). Available shapes: straight descent, sine weave, broad arc, S-curve, side entry
  that curves down.
- A formation is "N enemies on path P with staggered phase", never bespoke code.
- Paths must **commit downward** toward the planet (game6's rule: no stalling, no turning
  back).

### 7.7 Meteors

- Large, **very high HP**, slow. They head straight for the planet.
- **Three types. Colour and size go together:** small = grey (row 0), medium = magenta
  (row 1), large = azure (row 2). The assignment is a table field, so it is easy to
  swap.
- **Sizes derive from the normal (medium) meteor:** small is **80%** of it and large is
  **120%** (designer, 2026-09-24). Only the normal size is a tuning knob; the other two
  follow from the ratios. The chosen scale is 1.0, so the three are 43 / 54 / 65 px (§9).
- Kill reward: small = **10×**, medium = **15×**, large = **20×** a passive enemy's
  reward.
- A ship ramming a meteor takes 3 damage; the meteor takes 1 (§7.4).
- They slow-spin (`ctx.rotate`) and pulse (`asteroidFrame`).
- A meteor counts as part of the wave that spawned it. A wave isn't over until its
  meteors are gone too.

### 7.8 Waves

- An enemy wave **spawns for 30 s**. The wave lasts **until all of its enemies are
  destroyed** (killed, or crashed into the planet).
- Then comes a **10–15 s break (random)**, then the next wave. The HUD shows a countdown.
- **The run opens with a break** so the player can build the first ships before wave 1.
- Waves **get harder without end**. There is no final wave; the goal is to survive as
  long as possible.
- Difficulty ramps with **wave number** through `WAVE_RAMP` (§9): more chains and
  formations, longer chains, new types unlocking, HP and speed multipliers, and meteors
  from wave 3. The ramp is continuous, with no cliffs.
- The spawner decides *what* spawns and *when*. Movement lives in `PATHS`, damage in
  `collide.js`.

### 7.9 The healer

- **Only purchasable during the break between waves.** It takes 1 s to build.
- It uses the **Interceptor sprite, hue-shifted** (§6).
- It heals the player's ships, **farthest from the planet first**: the damaged ship
  with the smallest distance to the top of space goes first.
  - It flies to the target and transfers HP at a fixed rate while close.
  - When that ship is full, it picks the next one.
- **It spends its own HP to heal.** When its HP reaches 0 it **disappears with a fade**,
  never an explosion.
  - The same fade applies if it loses HP some other way.
  - It is not a combat ship: it has no gun and no behaviour menu, and enemies do not
    pick it as a target.
- It stays past the start of the next wave until its HP is spent. With nothing to heal it
  hovers just above the planet.
- **With more than one medic in the air, no two ever fly to the same patient**
  (settled 2026-09-25). Each keeps its own patient locked until full or gone, same as
  today; a medic *picking a new one* skips anyone another active medic already has
  locked, and falls back to the next-farthest unclaimed ship. A medic with nothing left
  unclaimed just hovers, same as having nothing to heal at all.

### 7.10 Economy, losing, records

- Money comes only from kills:
  - A **shooter pays 3×** a passive.
  - Meteors pay 10× / 15× / 20× (§7.7).
- The run starts with a fixed amount of money (§9).
- **The player loses when the planet's HP reaches 0.**
  1. The planet blows up: a long staggered wreck across the horizon, plus shake.
  2. The game-over card appears, showing wave reached, enemies destroyed and money
     earned.
  3. The card offers Retry or Title.
- Records follow game6's `scores.js` shape:
  - They live in localStorage under one namespaced key (`planetdefense_scores`).
  - Every access is wrapped in `try/catch`.
  - They are ranked by **highest wave reached**, with kills as the tiebreak.
- **Title screen:**
  - The game name.
  - The Xsolla wordmark, per `../branding.md` §1 (title screen only).
  - Start and Records buttons.
  - Between them, four small buttons to pick the planet's look — Terran / Desert /
    Glacier / Alien (§6) — applied at once and carried into the run.
  - Between the title and START, all three hulls fly a slow, looping decorative
    patrol (menu.js's `MENU_SHIPS`, settled 2026-09-25) — no game state, purely a
    function of elapsed time, so it costs nothing to have running under the UI.
  - The sound + fullscreen buttons.

### 7.11 HP bars on damaged entities (testing aid)

**Everything that has HP shows an HP bar over it while it's damaged** — narrowed from
"always, full HP included" to "damaged only" on 2026-09-25, as this section always said
it might be. A full-HP entity draws no bar at all. It covers:

- player ships
- the healer, whose bar is its remaining heal budget
- passive and shooting enemies
- meteors
- the planet, whose bar sits just above the horizon

Rules:

- **It is one switch:** `SHOW_HP_BARS = true` in `constants.js`. Every bar goes through
  one draw function in `render.js`, which is also the one place the "damaged only" filter
  lives — entity code never checks its own HP fraction to decide whether to draw.
- **Bars are screen-aligned.** Draw them outside the entity's rotate transform, centred
  above the sprite. For a ship, that means above the hull, not the plume. Width follows
  the entity's `dispW`, with a floor so small aliens still get a readable bar.
- Fill colour runs from green through amber to red by HP fraction, over a dim track.
  Draw the bars after all world entities and before the HUD, so they never hide behind
  another sprite.
- **Batch the draw calls.** A busy wave can show 100+ bars: build one path per colour
  band instead of one fill per bar, the way game6 batches debris shards.
- They are vector-drawn, like the rest of the HUD. No art.

## 8. Input

- **Pointer only** (`pointerdown` / `pointermove` / `pointerleave` on the canvas, one
  path for mouse and touch). There is no steering and no keyboard requirement.
- **Precedence on `pointerdown`** (`Game.press`; `Game.hoverAt` uses the same order):
  1. Shared HUD buttons.
  2. The build popup, if open. It's modal: a tap anywhere else is swallowed.
  3. The behaviour menu, if open. A tap outside it closes the menu and then counts as a
     fresh tap, so tapping a second ship moves the menu to it in one go.
  4. The build button.
  5. Ship picking.
  Each layer returns early.
- **Hover** is one field, `Game.hover`, as `'<layer>:<id>'` (`'hud:sound'`,
  `'pop:gun2'`, `'beh:balanced'`), or `'build'` / `'ship'`.
- **Ship picking:** ships are small and moving, so pick the **nearest player ship within
  a generous radius** (~24 logical px) of the tap, not a strict sprite hit.
- The game does **not** pause while the behaviour menu is open. It's real-time.
- Mouse hover highlights and `uiHover` sounds follow game6's `noteHover` rules, which are
  mouse-only.

## 9. Initial balance numbers

**Everything here is a first guess, to be tuned in playtests.** All of it lives in
`data.js` (or a module's tunables block), never in logic.

### Base units (`BASE` — what "100%" means)

| Unit | Value | Note |
|---|---|---|
| `HP` | 10 HP | ship HP at 100% |
| `FIRE_INTERVAL` | 400 ms | 100% firing speed = 2.5 shots/s; interval = 400 / fireRate |
| `BULLET_SPEED` | 300 px/s | |
| `BULLET_LIFE` | 600 ms | → range 1.0 = 180 px, half the screen width |
| `GUN_PRICE` | 10 | X, the level-1 price at `basePrice` 100% |
| `KILL_REWARD` | 3 | a passive enemy; everything else is a multiple |

### Hulls (`HULLS`)

| Hull | Atlas row | Speed | HP | Price | Build | base `dispW` | Turn rate |
|---|---|---|---|---|---|---|---|
| Interceptor | 0 | fast — 120 px/s | 100% → 10 | 20 (low) | 3 s | 26 | 360°/s |
| Warhammer | 1 | slow — 55 px/s | 300% → 30 | 35 (medium) | 4 s | 30 | 150°/s |
| Tahyon | 2 | medium — 85 px/s | 220% → 22 | 50 (high) | 5 s | 30 | 240°/s |

Tahyon is the **long-range defender**: the Lightning Gun is exclusive to it, and it has
the longest range in the game (§7.3).

### Guns (`GUNS`), derived from §7.3 and the base units

| Gun | Interval | Bullet speed | Lifetime | Range | base `dispW` |
|---|---|---|---|---|---|
| Spark | 400 ms | 300 px/s | 600 ms | 180 px | 9 |
| Plasma | 500 ms | 240 px/s | 960 ms | 230 px | 11 |
| Mystic Dagger | 400 ms | 600 px/s | 600 ms | 360 px | 8 |
| Flame Fury | 400 / level ms (L5 = 80 ms) | 300 px/s | 300 ms | 90 px | 10 |
| Lightning | 571 ms | 540 px/s | 1500 ms | 810 px | 10 |

Prices for every gun: `basePrice` 100% (X = 10), `levelCost [1, 1.5, 2, 2.5, 3]` →
10 / 25 / 45 / 70 / 100.

Cheapest ship: Interceptor + Spark L1 = 30. Most expensive: Tahyon + Lightning L5 = 150.

### Healer (`HEALER`)

| Price | Build | HP (heal budget) | Heal rate | Speed | base `dispW` |
|---|---|---|---|---|---|
| 40 | 1 s | 30 | 10 HP/s while within ~30 px | 120 px/s | 24 |

### Planet and economy (`PLANET`, `ECONOMY`)

| Planet HP | Starting money | Opening break | Wave break | Spawn window |
|---|---|---|---|---|
| 30 | 100 (50 was tried and was too low; designer, 2026-09-24) | 12 s | 10–15 s random | 30 s |

### Passive enemies (`ENEMY_TYPES`, `shoots: false`)

| Type (row) | HP | Speed | Planet dmg | Reward | From wave | Chain length |
|---|---|---|---|---|---|---|
| Sentinel (0) | 6 | 60 px/s | 1 | 3 | 1 | 5–8 |
| Lancer (2) | 3 | 95 px/s | 1 | 3 | 1 | 6–10 |
| Warden (1) | 12 | 45 px/s | 2 | 3 | 2 | 4–6 |
| Phantom (4) | 9 | 75 px/s | 1 | 3 | 4 | 5–8 |
| Bulwark (3) | 24 | 35 px/s | 3 | 3 | 6 | 3–5 |

All enemy HP (passive and shooting) was **tripled** from the first guesses (designer,
2026-09-24). Meteors were left as they were.

Base display size is SpriteKit's (game6's) `dispW` × 0.7. Drawn sizes are under
"Display sizes" below.

### Shooting enemies (`ENEMY_TYPES`, `shoots: true`)

These are all slower than the slowest passive. Every gun is level 1.

| Type (row) | HP | Speed | Gun | Pattern | Formation | From wave |
|---|---|---|---|---|---|---|
| Reaver (2) | 9 | 32 px/s | Spark | 1 shot / 1200 ms | pair | 1 |
| Harrier (1) | 12 | 35 px/s | Plasma | 1 shot / 1500 ms | arrowhead of 3 | 2 |
| Marauder (0) | 15 | 30 px/s | Mystic Dagger | 1 shot / 1800 ms | solo | 3 |
| Corsair (4) | 15 | 26 px/s | Lightning | 1 shot / 2000 ms | line of 3 | 4 |
| Stalker (3) | 21 | 22 px/s | Flame Fury | burst of 3 × 150 ms, every 2200 ms | solo | 5 |

- Reward is 9 (3× passive).
- Planet damage on arrival is 3.
- Fire starts 1000 ms after the shooter enters the screen (`ENEMY_FIRE_DELAY_MS`).
- Base display size uses the same rule as passives. Drawn sizes are under "Display
  sizes" below.

### Meteors (`METEOR_TYPES`)

| Size (row, colour) | HP | Speed | base `dispW` | Planet dmg | Reward | From wave |
|---|---|---|---|---|---|---|
| Small (0, grey) | 20 | 18 px/s | 43 (80%) | 3 | 30 (10×) | 3 |
| Medium (1, magenta) | 40 | 13 px/s | **54** (normal) | 5 | 45 (15×) | 5 |
| Large (2, azure) | 70 | 9 px/s | 65 (120%) | 8 | 60 (20×) | 8 |

Store one `METEOR_W` (the normal width) plus a per-row `sizeMult` of 0.8 / 1.0 / 1.2.
Don't store three separate widths.

The speeds above read too slow in playtests. Each meteor rolls its own multiplier from
`METEOR_SPEED_MULT = [2, 3]` in `meteors.js` at spawn time and keeps it for its whole
flight, so a wave's meteors visibly don't all move at the same speed (designer,
2026-09-25). The table above stays the base (the 100% a designer tunes); actual on-screen
speed is base × that roll, i.e. roughly 36–54 / 26–39 / 18–27 px/s for small/medium/large.

### Display sizes (`SIZE_SCALE`, settled 2026-09-24)

The designer picked these with the sliders in `planet_test.html`. Every table keeps its
**base** `dispW` (the values above, or the rule below), and the drawn size is **base ×
one of four scale knobs**. Hit radii and HP-bar widths derive from the drawn size, never
from the base.

```js
const SIZE_SCALE = { ship: 0.65, enemy: 0.75, meteor: 1.0, shot: 0.8 };
```

| Knob | Applies to | Base | Drawn size |
|---|---|---|---|
| `ship` 0.65 | player hulls and the healer | Interceptor 26, Warhammer 30, Tahyon 30, healer 24 | **17 / 19.5 / 19.5**, healer **16** |
| `enemy` 0.75 | all ten aliens | SpriteKit `ENEMY_SPRITES[i].dispW` × 0.7 | Sentinel 21, Warden 23, Lancer 20, Bulwark 25, Phantom 21; Marauder 21, Harrier 20, Reaver 19, Stalker 22, Corsair 21 |
| `meteor` 1.0 | the normal meteor; small/large follow ×0.8 / ×1.2 | normal 54 | **43 / 54 / 65** |
| `shot` 0.8 | every projectile, player's and enemy's | Spark 9, Plasma 11, Dagger 8, Fury 10, Lightning 10 | **7.2 / 8.8 / 6.4 / 8 / 8** |
### Wave ramp (`WAVE_RAMP`, for wave n = 1, 2, 3, …)

| Knob | Formula | w1 | w5 | w10 |
|---|---|---|---|---|
| Passive chains | `2 + floor(0.6 (n-1))` | 2 | 4 | 7 |
| Chain length bonus | `+floor((n-1) / 4)`, cap 12 | +0 | +1 | +2 |
| Shooter groups | `floor(0.5 + 0.5 n)` | 1 | 3 | 5 |
| Meteors | w3+: 1 every other wave; w8+: 1 per wave; w12+: 2 per wave | 0 | 0 | 1 |
| Enemy HP × | `1 + 0.10 (n-1)`, rounded | 1.0 | 1.4 | 1.9 |
| Enemy speed × | `1 + 0.02 (n-1)`, cap 1.4 | 1.0 | 1.08 | 1.18 |

- Kill rewards stay flat; income grows with enemy count.
- Spawn events spread across the 30 s window with jitter; the first one lands ~1 s in.
- Type unlocks follow the "From wave" columns above.

## 10. Audio — taken from game6

- Copy the `Sound` namespace from game6 `audio.js`, including its rules:
  - **An SFX is an event, not a file.** Callers say `Sound.play('enemyExplosion')`.
  - Each row has `pool` / `gap` / `vol`.
  - `*_var*` sets never repeat a file twice running.
  - SFX are preloaded; music is `preload='none'` and warmed on demand.
  - Crossfades are equal-power.
  - Nothing plays before the first gesture, and `Sound.resume()` is armed last in
    `bindInput`.
- Music (settled 2026-09-25): `bgm_title` loops on the title screen. In a run, one of
  `bgm_battle1/2/3` plays at random, once through (no loop). When it ends, a different
  one of the three is chosen at random — never the one that just played — and takes
  over. This never depends on wave state, planet damage, or anything else happening in
  the run; only the track finishing drives the next pick. Title ↔ run transitions still
  use game6's crossfade.
- This game has many guns firing at once, so gun and enemy-fire sounds need **tight
  `gap`s and low `vol`**, or the mix becomes a wall of noise.

Proposed event mapping. Nothing here is decided; re-map freely, it's one table.

| Event | File(s) |
|---|---|
| UI click / hover | `ui_click`, `ui_mouseover` |
| Player gun fires | `weapon_spark`, `weapon_plasma`, `weapon_dagger`, `weapon_fury`, `weapon_lightning` (named on the `GUNS` row, as game6 does) |
| Enemy gun fires | `enemy_fire_var1..4` |
| Enemy / meteor destroyed | `enemy explosion` (percent-encode the space) |
| Player ship destroyed | `player_explosion` |
| Player ship hit by a bullet | `player_ship_hit` |
| Ship rams enemy | `collision_var1..3` |
| Ship rams meteor | `collision_asteroid` |
| Ship launched from the shipyard | `wingmen_appear` |
| Behaviour changed | `ship_changed` |
| Planet takes damage | `weapon_level_down` |
| Wave start / every 5th wave | `boss_wave_start_small` / `boss_wave_start_large` |
| Wave cleared | `weapon_new_level_reached` |
| Healer launched / healer fades | `afterburners_activated` / `afterburners_deactivated` |
| Order placed (money spent) | `bonus_taken_var1..3` |

## 11. UI

- **HUD strip (top).** This sits over Zone 1, on a scrim as in game6.
  - Left: money, wave number with its state ("Wave 3" or "Next wave in 8"), and planet
    HP as a number. The planet's bar lives on the horizon (§7.11).
  - Right: the shared button row.
- **No build panel** (designer, 2026-09-24). The planet must stay fully visible because
  it's the best-looking thing on screen. Instead there is **one square build button**
  (`LAYOUT.BUILD_BTN`, 56 px, bottom right, over the planet):
  - It shows a spaceship silhouette with a **+** sign.
  - It also shows the build queue: a progress bar for the current order, and a count
    badge when more than one is queued.
  - New ships launch from its top edge.
- **The build popup** opens from that button. It looks "tech", like the technical spec
  sheet of the ship about to be built:
  - A chamfered dark panel with a faint blueprint grid, corner brackets and monospace
    labels.
  - Hull tabs (Interceptor / Warhammer / Tahyon / Medic).
  - A hologram of the hull on the grid, with dimension lines, and its stat bars (hull,
    speed, turn, build time).
  - Armament chips for the five guns. Lightning shows a lock unless Tahyon is selected.
  - The gun's stats: rate, range, pattern and velocity.
  - Mark I–V level pips.
  - A cost breakdown: hull + armament = total.
  - **Two buttons: CLOSE and BUILD.** BUILD shows the price, and is disabled with the
    reason ("NEED $12", "BETWEEN WAVES ONLY") when the order can't be placed.
  - The popup is modal: taps outside it do nothing except the shared HUD buttons.
  - It **never pauses the game** (designer, 2026-09-24): the battle goes on behind it.
- **Behaviour menu:** a compact popup of three options (Aggressive / Balanced /
  Defensive) beside the tapped ship.
  - The current behaviour is highlighted.
  - It also shows that ship's HP and its gun/level.
  - Choosing an option applies it and closes the menu; tapping elsewhere closes it.
  - If the ship dies while the menu is open, the menu closes.
- **HP bars** are on every entity with HP, always, while testing (§7.11).
- Buttons are drawn on canvas, with hit rects derived from pure layout functions, the
  same pattern as `hudButtonRects`.

## 12. Open decisions

Ask rather than assume:

- **Ship cap, and the upgrades that would come with it.** There is no cap and no
  upgrades today (§7.2). Revisit both together if playtests show the screen or the
  economy needs a cap.
- **Selling ships.** Not specified; assumed out of scope.
- **Music rotation and the SFX mapping** (§10) are proposals.
- **Pause.** Not specified; assumed out of scope.
- **`cards/`** assets are unused by this design. Don't wire them in without being asked.

Settled on 2026-09-23 and recorded above; kept here so the reasoning isn't re-opened:

- Lightning lifetime raised to 250%, so it out-ranges Mystic Dagger (§7.3).
- Target-lock break conditions (§7.5).
- Enemy bullets hit ships only (§7.4).
- One FIFO build queue, paid when the order is placed (§7.2).
- The healer persists into the next wave and is never targeted on purpose (§7.9).
- Meteor colours: grey = small, magenta = medium, azure = large (§7.7).
- Tahyon mounts every gun; Lightning is Tahyon-only (§7.2).
- Built ships are never upgraded (§7.2).
- HP bars on everything while testing, now narrowed to damaged only (§7.11; the
  narrowing itself was settled 2026-09-25, see below).
- The planet is procedural: its look, geometry and settings are recorded in §6
  (2026-09-24).
- Meteor sizes: small = 80% and large = 120% of the normal meteor (§7.7).
- Display sizes: ship 0.65, enemy 0.75, meteor 1.0, shot 0.8 (§9 "Display sizes").
- City lights are point lights that reach the horizon (§6).
- The sun orbits in the game too, once a minute (§6).
- No build panel: one build button and a tech-spec popup with BUILD / CLOSE (§11).
- The popup never pauses the game; BUILD places the order and closes it; the medic is
  the popup's fourth tab (designer, 2026-09-24).

Settled on 2026-09-25 and recorded above; kept here so the reasoning isn't re-opened:

- The title screen's planet is player-selectable among all four `planet_test.html`
  palettes, applied at once and carried into the run (§6, §11).
- The title screen flies all three hulls in a decorative, stateless patrol between the
  title and START (§11).
- With more than one medic in the air, none share a patient — a medic picking a new one
  skips anyone another active medic already has locked (§7.9).
- HP bars are damaged-only: a full-HP entity draws no bar (§7.11).
- Meteors were too slow: each now rolls a random 2–3× speed multiplier at spawn,
  `METEOR_SPEED_MULT` in `meteors.js` (§9 "Meteors").
