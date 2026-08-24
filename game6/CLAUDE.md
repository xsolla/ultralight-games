# SpaceShooter

Endless vertical-scrolling space shooter. Vanilla HTML + CSS + JS, **no build step, no
dependencies, no framework**. A space interceptor flies upward through procedurally
generated waves of enemies, swapping weapons and ships via caught bonuses.

House style follows the sibling project
[Hexxagon](https://xsolla.github.io/ultralight-games/game3/index.html) — same
`index.html` + `css/` + `js/` shape, ordered plain `<script>` tags, a dedicated
`constants.js`, one module per concern with hard responsibility boundaries, and a
single `Game` object orchestrating. When a convention here is ambiguous, open that
game's source and match it.

---

## 1. Hard constraints

- **No build, no bundler, no transpiler, no npm.** The files in the repo are the
  files that ship. Editing one and reloading the browser is the entire dev loop.
- **No `import`/`export`, no `<script type="module">`.** Plain `<script src>` tags in
  dependency order; every module's top-level `const`s and `function`s are shared
  globals. Ordering in `index.html` *is* the dependency graph — keep the comment
  there that documents it.
- **No external requests at runtime.** No CDNs, no web fonts, no analytics. Canvas
  fonts must be system stacks (`system-ui, -apple-system, "Segoe UI", sans-serif`)
  or drawn as vector paths.
- **Ships, projectiles, asteroids, explosions = sprites from atlases.**
  **Buttons, HUD, text, menus, cards = drawn procedurally on canvas.** There are no
  DOM controls — see §5. Never import UI images.
- Target: 60 fps on a mid-range phone. Everything is `dt`-driven; nothing assumes a
  frame rate.

## 2. Running it

Open `index.html` directly, or serve it — both work:

```powershell
python -m http.server 8080     # then http://localhost:8080
```

**Keep it that way.** The atlas has real alpha, so nothing needs `getImageData` and
the canvas is never tainted. The reference game goes to the same trouble — its
`audio.js` uses `HTMLAudioElement` rather than Web Audio specifically because "the
Web Audio fetch+decode route is blocked by CORS on `file://`". Any new code that
reads pixels back, or fetches an asset, breaks `file://` and should be weighed
against that.

There is no test suite and no linter. Verification is: load the page, play it, watch
the console for errors.

## 3. File layout

Files marked ○ do not exist yet; they are the planned slots, so put that concern
there when it arrives rather than inventing a new home for it.

```
  index.html                            canvas + ordered <script> tags, nothing else
  css/styles.css                        canvas scaling & page chrome
  js/constants.js                       cross-cutting tunables: CANVAS_W/H, COLORS, ANIM, PLAYFIELD
  js/atlas.js                           Atlas namespace: frame manifests, load, drawShip/drawBullet/drawEnemy
  js/data.js                            SHIPS, FLIGHT_FRAMES, WEAPONS, ENEMY_TYPES, PATHS, FORMATIONS, DIFFICULTIES — and later BONUSES
  js/player.js                          ship state, flight model, input -> motion, the armor/weapon model, gun cadence
  js/weapons.js                         projectile geometry and motion (volley patterns, bullet update)
  js/enemies.js                         enemy entity model: path evaluation, spin, death fade, culling
  js/spawner.js                         wave scheduling, background trickle, difficulty ramp
  js/collide.js                         hit tests and damage resolution
  js/explosions.js                      burst entity model: fireball, debris, the player's wreck
  js/ambiance.js                        Stars namespace: parallax starfield; later nebula
  js/render.js                          all canvas drawing — world, HUD, cards
○ js/menu.js                            title, ship select, difficulty, records screens
○ js/audio.js                           Sound namespace
○ js/scores.js                          localStorage high-score table
  js/game.js                            the Game object: state, screens, input, main loop
  assets/sprites/interceptor_atlas.png  the three player ships, 6 frames each
  assets/sprites/projectiles_atlas.png  the five weapon particles, 5 frames each
  assets/sprites/alien_noshoot_atlas.png  the five non-shooting enemies, 5 frames each
○ assets/sprites/alien_shoot_atlas.png  present but unused — the shooting enemy set
```

**Load order** — declare it in `index.html` with a comment, exactly as the reference
game does (`<!-- Load order: constants -> shared geometry -> data -> render -> game. -->`):

```
constants -> atlas -> data -> pure logic (player, weapons, enemies, spawner, collide,
             explosions) -> presentation (ambiance, render, menu)
          -> subsystems (audio, scores) -> game
```

Within pure logic the order is only about *load-time* references: `player.js` calls into
`weapons.js` and `spawner.js` calls into `enemies.js`, but always from inside functions
that run after `Game.init()`, which is what keeps the graph acyclic.

Nothing may reference a global from a file loaded after it *at load time*. Referencing
it from inside a function that only runs after `Game.init()` is fine — that is how
`render.js` reaches `Sound` and how the whole graph stays acyclic.

**One concern per file, boundaries stated in the header.** `render.js` draws and never
mutates game state. `data.js` is tables and no behaviour. `collide.js` is pure
predicates over entities. `game.js` owns the loop, input, and screen transitions and
nothing else. When a change doesn't fit its file's stated responsibility, that's the
signal to move it — not to widen the file.

Adding a module is normal and expected; adding a *dependency* is not. Ask first.

## 4. Code conventions

Taken from the reference game; hold to them strictly.

**Every file opens with a banner** naming the file, its one-line responsibility, and
what explicitly does *not* belong in it:

```js
// ============================================================================
// spawner.js — wave scheduling, background trickle, difficulty ramp.
// Decides WHAT spawns and WHEN; hands finished entities to game.js. No drawing,
// no collision, no per-entity movement (that lives in the PATHS table in data.js).
// ============================================================================
```

**Constants live in `constants.js` when cross-cutting, at the top of their own module
when local.** `constants.js` carries the logical canvas size, `COLORS`, `ANIM`
durations, `LAYOUT`, and the small enum/config objects the menu offers. Anything only
one subsystem tunes goes at the top of that subsystem under a sub-banner, the way the
AI weights sit in `ai.js`:

```js
// ---- Tunable spawn knobs (all pacing lives here) --------------------------
const SPAWN_INTERVAL_BASE = 900;   // ms between trickle spawns at t=0
const SPAWN_INTERVAL_MIN  = 260;   // ms floor — below this the screen unreadably clogs
const WAVE_GAP            = 12000; // ms between scripted waves
```

Either way: a unit comment on every number, and **no magic numbers in logic**.

**Group related tunables into one frozen-in-practice object** rather than scattering
scalars — `COLORS`, `ANIM`, `LAYOUT`, `AUDIO`, `WEAPONS` — and give the object's
fields comments where intent isn't obvious. Bare `ALL_CAPS` scalars are for genuinely
standalone values.

**Stateful subsystems get a namespace object; pure libraries export bare functions.**
`Game`, `Sound`, `Atlas`, `Scores` are objects with state and methods. `render.js`,
`collide.js`, and `spawner.js` expose top-level functions
(`drawScene(ctx, game)`, `hitTestEnemies(...)`) that take everything they need as
arguments and hold no state.

**Single game-state object.** `Game` holds all mutable run state. Entities are
plain-object arrays (`Game.enemies`, `Game.bullets`, `Game.asteroids`,
`Game.pickups`, `Game.particles`), swept in place with a reverse loop or
`filter`-on-dead. No classes, no ECS, no inheritance.

**Explicit screen state.** `Game.screen` is one of
`'menu' | 'shipselect' | 'playing' | 'paused' | 'gameover' | 'records'`. `update` and
`drawScene` branch on it at the top and return early — the reference game's
`drawScene` is the model.

**Time is milliseconds.** `dt = t - lastTime`, clamped to `100` so a backgrounded tab
can't tunnel entities through each other. `Game.time` is an ms accumulator driving
periodic animation. Durations in constants are declared in ms. Speeds are declared in
**logical px/s** for readability and integrated as `v * dt / 1000` — state the unit in
the comment every time, since the two coexist.

**Comments explain *why*.** The reference game's comments read like
`// Setting width/height resets the context, so (re)apply the logical scale.`
Match that register: non-obvious ordering, coordinate-space choices, draw-order
dependencies, and balance intent get a line. Self-evident code gets nothing.

**No dead code, no commented-out experiments, no TODO graveyards.**

## 5. Rendering, scaling, and coordinate space

**Logical resolution is `360 × 640`** — `CANVAS_W` / `CANVAS_H` in `constants.js`,
keeping the reference game's names — exactly 9:16. All gameplay math, entity
positions, speeds, and hitboxes are in logical px. Never read `canvas.width` in game
logic; it is the backing-store size, not the coordinate space.

**Hybrid sharp scaling** — one canvas, two treatments:

- `index.html` declares the canvas at its native logical size
  (`<canvas id="game" width="360" height="640">`); `css/styles.css` sizes the *element*
  responsively with `width: min(100vw, 56.25vh)` + `aspect-ratio: 9 / 16`. No wrapper
  divs and no `object-fit` — the element *is* the 9:16 image, centred by `body`'s flex,
  which letterboxes it on other aspect ratios for free.
- `resizeCanvas()` in `game.js` rebuilds the **backing store** at real device pixels:
  `dpr = min(devicePixelRatio, 2)`, `bw = round(cssW * dpr)`, then
  `ctx.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0)` — because assigning
  `canvas.width` resets the context. Everything else draws in logical coordinates.
- **HUD, text, buttons, cards, particles: vector-drawn**, so they render at full
  backing resolution and stay crisp at any scale.
- **Sprites: a single smoothed `drawImage`.** The atlas is sized so the maximum
  downscale is ~1.08×, so no mip chain is needed and nearest-neighbor would be wrong
  for this art. See §6.
- Re-run `resizeCanvas()` on `resize`, `orientationchange`, and `fullscreenchange` —
  and on the last one, again inside a `requestAnimationFrame`, since the event can
  fire before layout has settled on the new box (otherwise exiting fullscreen leaves
  the backing store at its fullscreen size).
- **Fullscreen targets `<html>`, not the canvas**, so the CSS box rules above keep
  doing the fitting. Guard the `requestFullscreen()` rejection that happens when an
  embedding page withholds `allow="fullscreen"`.

**Every control is canvas-drawn — there are no DOM buttons.** Play, difficulty picker,
ship picker, Retry, records OK, and the in-game HUD toggles (sound, fullscreen, end
run) all follow the same pattern as the reference game:

- The drawing code stores its hit rect in logical coords while it draws —
  `Game.soundBtnRect`, `Game.fullscreenBtnRect`, or a `Game.menuButtons` list that
  `menu.js` rebuilds each frame from current settings so "selected" and "disabled"
  states can never drift from the real state.
- `game.js` hit-tests `pointerdown` against those rects and tracks
  `Game.hudHover` / hover flags from `pointermove` for the highlight.
- Clear the rects when leaving a screen so a stale rect can't be clicked.

Two consequences for a shooter specifically: HUD buttons sit over the playfield, so
**place them where they cannot swallow an input meant for the ship** (top corners, out
of the thumb's flight path), and **test the HUD hit rects before the playfield** in
`onPointerDown` so a tap on a button never also steers.

## 6. Asset pipeline — read this before touching sprites

### What `interceptor_atlas.png` actually is

Measured from the file, not assumed:

- **1024 × 1024, 32-bit with real alpha**, 315 KB. 68% fully transparent, 29% opaque,
  2.5% antialiased edge pixels.
- **Alpha is straight, not premultiplied** — verified, because premultiplied art
  gives dark fringes on canvas. Nothing needs `getImageData`; `file://` works.
- **Natively 1024**, not an upscale (only 11.5% of opaque pixels fall in uniform 2×2
  blocks).
- **6 columns × 3 rows.** Rows are the three ships: blue/orange interceptor,
  grey/red heavy, white/green. Columns are engine frames — **0–3 normal flight,
  4–5 turbo**, plume growing left to right.
- **All frames in a row are top-anchored on the hull nose** and the plume only grows
  downward. This is what lets the hull stay perfectly still while the flame animates.
- Hulls are registered and near-identical across frames (3.5–9.9 mean abs RGBA, best
  alignment at exactly (0,0)), so the 6-frame cycle reads as a flickering engine
  rather than a boiling ship.

### Sizing is already at the limit — don't grow the ships

Frames are 141–155 px wide. At the 3× backing-store cap that is ~144 device px for a
48-logical-px ship, i.e. **essentially 1:1**. So:

- **Keep `dispW` in `SHIPS` at or below 48 logical px.** At 56 you are upscaling
  (0.84–0.92×) and the sprites visibly soften.
- Because the maximum downscale is only ~1.08×, **a single `drawImage` with
  `imageSmoothingEnabled = true` is sufficient** — no mip chain, no pre-downscaling.
- `imageSmoothingEnabled` stays `true`. This is crisp cel-shaded art with 1px
  outlines, but it is not pixel art on a pixel grid, and nearest-neighbor at a
  fractional ratio would chew the outlines.

### Frame rects

The manifest lives at the top of `js/atlas.js`, not in `constants.js` — exactly one
module tunes it. Per ship it is the six frame left-edges plus **one shared source box
reused by every frame in the row**, which is load-bearing for three reasons spelled
out in the comment there: it keeps the hull from bobbing 1–4 px, it includes ship 1's
longest plume (which overruns a naive `1024/3` grid cell by 5 px), and it leaves the
inter-frame gutters unsampled, which excludes two stray specks in the source art (a
50×1 at 758,691 and a 1×5 at 681,494, both alpha 21).

**Do not "tidy" those rects into a computed grid** — the row pitch is uneven and the
per-frame top offsets vary, so a computed grid clips flames and picks up the specks.
Re-measure from the alpha channel if the atlas is ever re-exported.

### What `projectiles_atlas.png` actually is

Also measured from the alpha channel, not assumed:

- **1024 × 1024, 32-bit with straight alpha**, 163 KB. **5 columns × 5 rows.** Rows are
  the five weapon particles (blue, green, purple, orange, yellow); columns are 5
  animation frames, cycled ping-pong via `BULLET_FRAMES`.
- **Same structural luck as the ship atlas:** every frame in a row is top-anchored on
  the particle tip and the trail only grows downward, so one shared source box per row
  holds the head still while the trail animates.
- The **travel axis is stable to ±0.8 px** per column across all five rows, so a single
  uniform **96 × 176** box serves all 25 frames — only the origin changes. Of 196,077
  non-transparent pixels, 7 fall outside those boxes and all have alpha ≤ 7.
- **Row pitch is uneven** (205/212/196/208), so as with the ships a computed grid is
  wrong. The manifest is `BULLET_COLS` / `BULLET_ROWS` at the top of `js/atlas.js`.
- Unlike the hulls, these are drawn at roughly a **7× downscale** and that is fine: the
  near-1:1 rule above exists to protect the hulls' 1 px outlines, and soft glow has no
  hard edges for a fractional filter to chew.

### What `alien_noshoot_atlas.png` actually is — and its one trap

- **1024 × 1024, 5 columns × 5 rows**, 506 KB. Rows are the five non-shooting enemy
  types; columns are a **charge/glow pulse** (dull → bright, spikes extending), *not* a
  rotation. All enemy turning is therefore `ctx.rotate` at draw time, which is why the
  boxes are centre-anchored rather than edge-anchored like the ships and projectiles.
- **This atlas is PREMULTIPLIED**, unlike the other two. Measured, not assumed: of its
  38,239 partial-alpha pixels, **zero** have any channel exceeding alpha, where the
  interceptor atlas has 3.9% and the projectiles atlas 36.2%. That is impossible for
  straight alpha on art with bright glow.
  - Canvas `source-over` assumes straight alpha, so partial-alpha pixels composite
    darker than intended by a factor of alpha. Against the near-black background the
    measured error is **mean 3.8/255, max 23/255**, and only 0.9% of the atlas is
    affected — invisible in practice, which is why it is drawn as-is.
  - **Do not "fix" this at runtime.** Un-premultiplying needs `getImageData`, which
    throws on `file://` and would break the constraint in §2. If it ever needs fixing,
    fix the asset offline and re-measure.
  - The error scales with background brightness. **If a nebula or any lighter backdrop
    lands, re-check this** — the same sprites over a light wash would show real fringes.
- Geometry: unlike the other two atlases this one *is* a clean grid — the alpha-weighted
  disc centroid sits on an even 204.75 px pitch on both axes (102, 306.5, 511, 716, 921),
  stable to ~2 px across a row. Box is 204 × 204; content reaches r=120 diagonally.
- **Anchor on the alpha-weighted centroid, never the solid bounding box.** Spikes and
  glow inflate the bbox asymmetrically and walk its centre by up to 8 px between frames
  (row 0 frame 3 measures y=110.5 against y=102 for its neighbours), which on a spinning
  sprite shows up as the disc wobbling around its own axis.

### Missing atlases

Asteroids have no art yet. Until it arrives,
draw them as **clearly-provisional vector placeholders** (flat shapes, a `// PLACEHOLDER`
comment) behind the same `Atlas.draw(ctx, id, x, y, ...)` entry point real sprites use,
so swapping in a real atlas is a manifest change in `js/atlas.js` and nothing else.
Do not generate or commit stand-in PNGs.

**Explosions have no atlas either, and are not a placeholder** — they borrow
`alien_noshoot_atlas.png`. Its frames are already a radial spike-and-glow burst, and
because a killed enemy's fireball uses *its own row*, the burst matches the hull with
no tinting at all. The player's wreck needs colours no alien has, so `Atlas.tinted()`
recolours cells through a `'color'` blend plus a `'destination-in'` alpha restamp,
cached per (row, frame, colour). That reads no pixels back, so `file://` still works.
Everything else in a burst — fireball gradient, shock ring, debris streaks — is vector.
It all goes through `Atlas.drawBurst()`, so a real explosion atlas would still be a
manifest change in `js/atlas.js` and nothing else.

`Explosion_animation_sprite_atlas_2K_202608211555.jpeg` is in the repo and **unused**.
It is 2048×2048 24-bit RGB with **no alpha channel**, so it cannot be composited with
`source-over` at all. Do not wire it in without re-exporting it as a PNG with alpha (or
deciding it is purely additive), and re-measure it either way.

## 7. Game design spec

### Ships

| # | Name             | Base durability | Handling                          |
|---|------------------|-----------------|-----------------------------------|
| 1 | Light interceptor| 3 hits          | fastest, smallest hitbox          |
| 2 | Red heavy        | 4 hits          | middle                            |
| 3 | Green heavy      | 5 hits          | slowest, largest hitbox           |

All three are selectable at the title screen. Ship-change bonuses can move the player
to any of them mid-run, including a downgrade.

### The armor/weapon model — the game's core rule

Weapon level (1–5) *is* the armor. Every level above 1 adds a layer of durability
worth one full ship's-worth of hits; losing a layer costs a weapon level instead of a
life.

Model it as **one integer**:

```js
hits          // 1 .. base * 5
weaponLevel = Math.ceil(hits / base)
```

- **Taking damage:** `hits -= 1`. Dead at `0`. Weapon level falls out of the formula
  automatically.
- **Heal bonus:** `hits += 1`, capped at `base * 5`.

This single counter reproduces the whole spec. Ship 2 (`base = 4`) at weapon level 3
starts at `hits = 12`; 4 hits → `hits = 8`, level 2; 4 more → `hits = 4`, level 1;
4 more → dead, 12 total. And a heal at full level-3 armor gives `hits = 13` →
level 4 with exactly one hit in the new layer, which is precisely
"upgraded to next level with just one hit."

**Ship change** must preserve weapon level across a different `base`:
`newHits = (level - 1) * newBase + clamp(oldLayerRemainder, 1, newBase)`.
**Weapon change** swaps the weapon id only and leaves `hits` untouched.

Damage sources are all worth exactly 1 hit: enemy projectiles, enemy body impacts,
asteroid impacts. Give the player brief post-hit invulnerability with a blink so a
single collision can't drain several layers.

### Weapons

Many weapons, each defined purely by data in the `WEAPONS` table in `js/data.js` —
sprite id, damage,
projectile speed, fire interval, spread/count per level 1–5, and a projectile motion
kind. **Fire rate is constant per weapon; levels change the shot pattern, not the
cadence.** Motion kinds so far: `straight` and `straight_spin` (travels straight,
sprite rotates). Add new kinds as a `motion` function in the table rather than
branching in the bullet update.

Firing is automatic on touch devices, and LMB / Space on desktop (§8).

### Enemies

Data-driven `ENEMY_TYPES` table in `js/data.js`: sprite, hp, speed, contact damage,
score, and whether it shoots. Some drop bonuses on death (per-type drop chance).

Every path must **commit downward**: an enemy that stalls or turns back mid-screen
reads as timid, and a path whose vertical speed can reach zero is the bug that
causes it. `PATHS` entries are checked against this — see the note at the top of
that table. Movement must be varied — singles and formations, straight descents,
sine weaves, arcs, strafing dives, side entries, and formations that hold a
pattern while the pattern itself translates. Implement as a `PATHS` table in `js/data.js` of
`(t, spawnParams) -> {x, y}` functions so a formation is "N enemies on path P with
staggered phase," not bespoke code per wave.

### Spawning and difficulty

- **Waves plus a constant trickle.** A scripted wave lands on top of a steady
  background flow, never instead of it — the screen is never empty.
- **Difficulty ramps with elapsed run time**, scaling spawn rate, enemy mix, enemy
  speed, and shooter proportion. Ramp continuously; avoid cliffs the player can't read.
- **Three selectable difficulties** — easy / normal / hard — expressed as multipliers
  over the same ramp curve (spawn rate, enemy hp, projectile speed, bonus drop rate),
  not as separate spawn tables. They live in a `DIFFICULTIES` object in `js/data.js`
  shaped like the reference game's `AI_LEVELS` — `{ key, label, ...multipliers }` — so
  `menu.js` can render the picker straight from the table.
- Asteroids spawn from the trickle system independently of waves.

### Asteroids

Indestructible. Bullets pass through or spark off them without effect. They damage
the player on contact for 1 hit. They are pure obstacles — no score, no drops.

### Bonuses (caught, not bought)

Dropped by some enemies on death, then drift down; the player flies into them.

| Bonus         | Effect |
|---------------|--------|
| Heal / upgrade| `hits += 1`, capped at `base * 5` — becomes a weapon-level upgrade when armor is full (§7) |
| Weapon change | Swap to a different weapon at the same level; can be worse |
| Ship change   | Swap to a different ship, preserving weapon level; can be a downgrade |
| Speed boost   | Boost mode for 5 seconds — higher speed, visible exhaust/trail change |
| Nuke          | Instantly kills every enemy currently on screen |

Weapon and ship changes are genuine gambles, not strict upgrades. Keep them that way.

### Scoring and persistence

Score = kills (per-enemy point values) + distance travelled (accumulated scroll,
divided down by a constant). Shown live in the HUD.

High scores live in `js/scores.js` behind a `Scores` namespace, kept in `localStorage`
under a single namespaced key (`spaceshooter_scores`), **separately per difficulty**,
and wrapped in `try/catch` so private-browsing mode degrades to a non-persistent
session instead of throwing. The run-end flow is: game over card → return to title →
records screen shows the table with the just-finished run highlighted.

The reference game has no persistence, so there is no precedent to copy here — the
`try/catch`-and-namespaced-key shape comes from
[Bubble Bopper](https://xsolla.github.io/ultralight-games/game1/index.html) instead.

## 8. Input

Support all of these simultaneously; the player may switch mid-run.

- **Pointer drag** (mouse or touch) — the ship follows the pointer, lerped rather
  than snapped, with a grab offset so it doesn't teleport under the finger.
- **Keyboard** — WASD and arrows, velocity-based with acceleration.
- **Fire:** automatic when the last input was touch; LMB or Space otherwise. Track
  `Game.lastInputKind` and flip the auto-fire flag on the first touch event.

Use **`pointerdown` / `pointermove` / `pointerleave` on the canvas**, as the reference
game does — one code path covers mouse and touch, and `pointerleave` is where hover
state gets cleared. Convert client coords to logical coords through the canvas
`getBoundingClientRect()`, never through the backing-store size.

## 9. Working on this project

- **Change balance by editing constants** — `constants.js` for cross-cutting values,
  the module's own tunables block otherwise. Never thread a new number through call
  sites.
- **New enemy, weapon, bonus, or movement pattern = a new row in its table** in
  `js/data.js`. If a feature needs a new `if` in the update loop, that's a signal the
  table is missing a field.
- **Respect the file boundaries in §3.** Drawing code that mutates state, or rules
  code that draws, is the main way this structure rots. If work doesn't fit the
  module's banner, move the work or add a module — don't widen the banner.
- **A new module means a new `<script>` tag in the documented load order**, and the
  load-order comment in `index.html` gets updated with it.
- **Ask before adding an asset file or a runtime dependency.** New JS modules are
  routine; dependencies are not — zero-dependency is the point of the project.
- State the *reason* in a comment when a constant's value is non-obvious
  (e.g. why a spawn interval floors where it does).

## 10. Open decisions

Not yet settled — ask rather than assuming:

- ~~**Weapon roster.**~~ Settled: five weapons, one per row of `projectiles_atlas.png`,
  in the `WEAPONS` table — Spark Gun (10° fan), Plasma Gun (25° fan), Mystic Dagger
  (parallel column), Fiery Fury (15° staggered gatling sweep), Lightning Gun (90° fan).
  Level is the particle count; level 1 is always one shot dead ahead. Expanding means a
  new row plus, if the shape is genuinely new, a `pattern` case in `weapons.js`.
- **Audio.** The reference game's `audio.js` is a good template — preloaded
  `HTMLAudioElement` pools for SFX, a streamed looping BGM track, a three-state
  `Game.soundState` (`'on'` / `'musicoff'` / `'off'`), every entry point guarded so a
  missing file yields silence rather than a crash. Unknown whether this game wants
  audio at all, and no audio assets exist.
- **Asteroid art.** No atlas yet; placeholders until then (§6). Enemy and projectile
  art has landed, and explosions are ~~open~~ settled — they reuse the enemy atlas (§6).
  `alien_shoot_atlas.png` is in the repo but unused — shooting enemies are not
  implemented, and `ENEMY_TYPES.shoots` is the flag waiting for them.
- **What happens after death.** The ship now dies and blows apart at 0 hits, but with
  no `menu.js` or `scores.js` the run just restarts on the same hull after
  `RESPAWN_MS`. The real flow in §7 is game-over card → title → records; that restart
  is scaffolding and should go with the debug keys.
- **True homing.** `PATHS` entries are pure `(age, params) -> {x, y}` and so cannot see
  the player. The `intercept` path aims at the player's position *at spawn* instead,
  which is readable and dodgeable. A real chaser would need a stateful steer function —
  a bigger change than it looks, and probably worse to play against.
- **Scoring.** `ENEMY_TYPES.score` and the kill count returned by `resolveBulletHits`
  are both in place, but nothing is wired to a score yet.
- **Ship durability mapping.** `SHIPS` in `data.js` follows the original 3/4/5 spec,
  but in the delivered art ship 1 (armoured grey/red, twin heavy cannons) reads as the
  toughest hull while ship 2 (white/green) reads mid-weight — which argues for 3/5/4.
- **Boss encounters.** Not mentioned. Currently assumed out of scope.
- **Pause.** Assumed wanted (`'paused'` is in the screen list) but not specified.
- **Logical resolution.** 360 × 640 is chosen, but the source art has enough detail
  to justify 540 × 960 if sprites look soft in practice.
