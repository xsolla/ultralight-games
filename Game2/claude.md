# Xsolla Crowd Run
*(working title — rename freely)*

---

## Stack
- Vanilla HTML5 Canvas, no framework
- Single `index.html` (inline `<script>` or companion `game.js`) — deployable as static files
- Save top 3 records locally (localStorage)
- Must work standalone inside an iframe (no parent-window dependencies)

---

## Constraints
- 60 FPS target on mid-range PC or Mac
- All game state in one `Game` object; no globals beyond it
- No build step — files run directly in the browser
- No external assets at launch; audio added later via stubs (see Conventions)

---

## Canvas & Rendering
- Native resolution: **800×600** (fixed — do not change)
- Canvas draws at 800×600 natively
- CSS scales it responsively (`width: 100%`) while preserving the 800×600 aspect ratio
- Cap max rendered size at 1200×900 on large screens (via `max-width`/`max-height` on the canvas)
- Use `image-rendering: crisp-edges` (with `pixelated` fallback) to keep pixels sharp when scaled up
- All game logic, collision, and positioning use **800×600 coordinates only**
- Do NOT implement dynamic `canvas.width` / `canvas.height` resizing

---

## Camera & Layout

The camera looks straight down a road rendered in **1-point perspective**. The road converges to a single vanishing point near the top of the canvas and fans out to its full width at the bottom. The player crowd is near the bottom (closest to the camera); gates and rivals appear small at the vanishing point and grow as they approach, simulating the crowd running forward.

Rendering uses a **world-Z depth model**, not flat screen-Y scrolling:
- `worldZ` is depth from the camera. Mapping: `screenY = HORIZON_Y + PERSP_K / worldZ`; inverse `worldZ = PERSP_K / (screenY − HORIZON_Y)`
- The camera scrolls forward each frame (`Game.cameraZ` grows). Gates, rivals and lane dashes sit at a fixed absolute world-Z (`absZ`); their relative depth `relZ = absZ − cameraZ` shrinks over time, so they slide down-screen and grow as they near the camera
- Layout constants: `VP_X = 400` (vanishing-point X, always canvas center), `HORIZON_Y = 35` (vanishing-point Y), `PERSP_K = CANVAS_H − HORIZON_Y = 565`, `ROAD_HALF_W = ROAD_WIDTH / 2 = 300`
- Road half-width at a given screenY: `hw(y) = ROAD_HALF_W × (y − HORIZON_Y) / PERSP_K`. Helpers: `roadAt(y)` → `{ left, right, hw }`; `wz2y(wz)` → screenY

```
┌─────────────────────────────────────────┐  y=0
│                 ╱ ┊ ╲                     │  ← VP_X / HORIZON_Y (vanishing point)
│  gutter       ╱  ┊  ╲       gutter        │     gates/rivals appear here (small)
│             ╱  ╌╌┊╌╌  ╲                    │
│           ╱   ┌───┴───┐  ╲                 │  ← split math gate (grows as it nears)
│         ╱     │÷3 │ ×3│    ╲               │
│       ╱       └───┬───┘      ╲             │
│     ╱          o o o o o       ╲           │  ← player crowd (blue), y ≈ CROWD_Y
│   ╱          o o o o o o o       ╲         │
│ ▓╱                                 ╲▓      │  ← edge danger zones
└─────────────────────────────────────────┘  y=600
 x=100                                 x=700
```

- **Road**: a trapezoid converging from `VP_X` at `HORIZON_Y` to the full `ROAD_WIDTH` at the bottom (left edge `x=100`, right edge `x=700` at `y=600`); filled with a dark vertical gradient
- **Gutters**: the area outside the road; drawn darker than the road surface
- **Lane dashes**: a single centered lane divider drawn as perspective-correct trapezoid stripes along `VP_X`, scrolling toward the camera to convey motion
- **Crowd anchor**: `crowd.x` is the horizontal center of the formation; the feet baseline sits at `CROWD_Y`
- **Count**: the true integer count is shown large in the HUD top-left corner (a floating label above the crowd is planned — see HUD & Screens)

---

## Stick Figure Specification

### Anatomy
All measurements relative to `FIGURE_HEIGHT`. Anchor point = feet center (bottom of figure).

| Part       | Description                                                             |
|------------|-------------------------------------------------------------------------|
| Head       | Filled circle, radius = `FIGURE_HEIGHT × 0.14`                         |
| Neck       | Short vertical line, `FIGURE_HEIGHT × 0.05`                            |
| Torso      | Vertical line from neck-base to hip, `FIGURE_HEIGHT × 0.30`            |
| Upper arm  | Line from shoulder, `FIGURE_HEIGHT × 0.20` (each side)                 |
| Forearm    | Line from elbow, `FIGURE_HEIGHT × 0.17` (each side)                    |
| Upper leg  | Line from hip, `FIGURE_HEIGHT × 0.22` (each side)                      |
| Shin       | Line from knee, `FIGURE_HEIGHT × 0.20` (each side)                     |

Expose a single reusable function: `drawFigure(ctx, x, y, phase, scale, stroke, fill)`.  
`scale` is used for spawn/despawn animation (normally 1.0); `stroke` colors the limbs/outline and `fill` colors the head — together they distinguish player (blue) from rival (red).

### Running Animation

Figures are drawn as a **three-quarter rear view** — we see their backs, angled by a constant `FIGURE_YAW`, leaning forward (`FIGURE_LEAN`). This sells "running forward, up the road" rather than the old flat side profile. The two legs are separated laterally (`LEG_LATERAL_SEP`) as are the shoulders (`ARM_LATERAL_SEP`).

- A global `runClock` advances each frame: `runClock += deltaTime × RUN_ANIM_SPEED` (radians)
- Each figure stores a personal `phaseOffset` (random on spawn) to desynchronise the crowd
- Per-frame local phase `p = runClock + phaseOffset`; stride drivers `sL = sin(p)`, `sR = sin(p+π)`; arms oppose the same-side leg (`aL = sR`, `aR = sL`)

The drivers move limbs along the **vertical/depth axis** (not a horizontal rotation):

| Part        | Behaviour                                                                 |
|-------------|---------------------------------------------------------------------------|
| Leg (s)     | swing (`s>0`) lifts the knee up-screen (`LEG_LIFT_ANG`) and tucks the shin (`LEG_KNEE_BEND`); foot travels in screen-Y by `LEG_STRIDE_Y` (plant pushes down toward camera, swing rises up the road) |
| Arm (a)     | elbow splays out (`ARM_OUT`), hand pumps in screen-Y by `ARM_SWING_AMP × H × a`, constant forearm flex `ARM_ELBOW_FLEX` |
| Foreshorten | each limb's length **and** line-width × `f = 1 − FORESHORTEN_AMT × s`: near (planted) limb bigger/thicker, far (lifted) limb smaller/thinner; far limbs use a darker shade (`FORESHORTEN_SHADE`) |
| Body bob    | `sin(2p) × BOB_AMPLITUDE` applied to the whole figure                      |

Painter's order per frame (anti-phase guarantees exactly one near limb): far arm → far leg → torso+neck → head → near leg → near arm. The figure's vertical extent stays ≈ `FIGURE_HEIGHT × scale` above the feet anchor, so formation and label math are unaffected. The same `drawFigure` is reused (rotated) by edge-fallers and clash debris.

### Crowd Formation
- Figures are arranged in **concentric rings** around `crowd.x` / `CROWD_Y`: slot 0 is the center, and each successive ring (radius = `ring × FIGURE_SPACING`) holds as many figures as its circumference allows (`max(6, floor(2π·r / FIGURE_SPACING))`)
- Each ring's vertical radius is squished (×0.45) so the circle reads as an oval on the perspective road
- Positions are recomputed every frame from `crowd.people.length`, centered on `crowd.x`; figures are painted back-to-front so nearer figures overlap farther ones
- Road-edge clamping uses a half-width of `max(FIGURE_HEIGHT × 0.5, (min(count, MAX_FIGURES_PER_ROW) − 1) × FIGURE_SPACING / 2)`
- **Visual cap**: if count > `MAX_DISPLAY_FIGURES`, render only `MAX_DISPLAY_FIGURES` figures; the count label always shows the true value
- **Spawn animation**: new figures scale `0 → 1` over `SPAWN_ANIM_MS` ms, appended to the end of the array and staggered by `SPAWN_STAGGER_MS` between consecutive figures
- **Despawn animation**: removed figures scale `1 → 0` over `DESPAWN_ANIM_MS` ms, marked from the end of the array and staggered by `SPAWN_STAGGER_MS`

### Path Edge Falling

Figures can fall off the road if the crowd is pressed against a road boundary.

- The inner edge of each road boundary has a danger zone `EDGE_DANGER_WIDTH` px wide
- While the crowd's edge overlaps this zone AND the player is actively pushing toward that wall (input held in that direction), figures begin falling off at `EDGE_FALL_RATE` figures/second
- Fractional accumulator: track `edgeFallAccum += EDGE_FALL_RATE × deltaTime`; when it crosses 1.0, remove one figure and subtract 1.0 from accumulator
- Falling figures play a dedicated **tumble animation**: the figure rotates ~90° and translates downward off the canvas over `FALL_ANIM_MS` milliseconds before being removed from the array
- The crowd count decreases by 1 for each fallen figure (triggers formation recalculation)
- `maxPossible` is **not** adjusted for edge falling — it assumes a perfect player never wall-hugs
- Edge falling is disabled during the first `EDGE_FALL_GRACE_S` seconds of the run (gives the player time to learn)

---

## Game Rules (Canonical)

### Start
- Opening screen: game title, brief subtitle, top 3 highscores, "tap / click to begin"
- First tap or click starts the run; crowd immediately begins running animation and lane dashes start scrolling

### Controls

| Platform | Action         | Effect                                          |
|----------|----------------|-------------------------------------------------|
| Desktop  | Hold ← / A     | Crowd moves left at `CROWD_SPEED_X` px/s        |
| Desktop  | Hold → / D     | Crowd moves right at `CROWD_SPEED_X` px/s       |
| Mobile   | Touch drag ←   | Crowd follows finger delta, same speed cap      |
| Mobile   | Touch drag →   | Same                                            |

- `crowd.x` is clamped so the full `crowdWidth` stays within the road boundaries at all times

### Gates

- A gate is a **vertical panel** fixed at an absolute world-Z (`absZ`), spanning the full road width and rendered as a 3D slab (front face + lit top face); its on-screen size scales with `1/relZ`. Panel height is `GATE_WORLD_HEIGHT` of the camera height and slab thickness is `GATE_WORLD_DEPTH` (world-Z units)
- Gates spawn `GATE_SPAWN_WZ` world-Z units ahead of the camera (`absZ = cameraZ + GATE_SPAWN_WZ`) and approach as the camera scrolls forward at `GATE_SCROLL_SPEED` (px/s at crowd depth); they are culled once they pass behind the camera
- **Split gate** (probability `SPLIT_GATE_CHANCE`): divided into a LEFT half and a RIGHT half, each with its own independent operation and color
- **Full gate** (probability `1 − SPLIT_GATE_CHANCE`): single full-width block, one unavoidable operation

**Color coding** (applied per section):
- **Fraction** (`×N/D` or `÷N/D`, i.e. `den > 1`): **purple-tinted** — overrides green/red so the player can't read good/bad at a glance and must evaluate the fraction
- Net-positive operation (result would be > current count): **green-tinted**, `GATE_ALPHA` opacity
- Net-negative operation (result would be < current count): **red-tinted**, `GATE_ALPHA` opacity
- Neutral (×1, ÷1, +0): **grey-tinted**

**Operation label**: bold text centered in the section, e.g. `+10`, `×3`, `−7`, `÷2`, `×3/4`, `÷5/2`. White or high-contrast color.

**Collision**: when a gate reaches crowd depth (`relZ ≤ RELZ_CROWD`), the section whose x-range contains `crowd.x` fires its operation (`crowd.x < VP_X` → left section, `≥ VP_X` → right section, or `full`); the gate is flagged `fired` (and later culled).

### Rival Crowds

Rival crowds are enemy groups of stick figures that spawn at the top of the road and scroll downward, just like gates. They use the same scroll speed as gates.

**Appearance:**
- Rival figures are drawn using the same `drawFigure` function but with a distinct **warm red/orange stroke color** (vs. player's cool blue/teal)
- Rival figures run with the same procedural animation, but their `runClock` advances independently
- A count label floats above the rival crowd (e.g. `[4]`) in the rival color
- Rival crowd width mirrors player crowd formation logic, capped at half the road width for avoidable spawns

**Spawn rules:**
- *Current (temporary) implementation*: every `RIVAL_EVERY_N_GATES`-th spawn slot produces a rival crowd instead of a gate, with a fixed size of `RIVAL_TEST_COUNT` (150), centered on the road and always unavoidable. To be replaced by the timer/scaling design below.
- *Planned*: rival crowds spawn on their own independent timer (separate from gate timer); first rival no earlier than `RIVAL_START_TIME` seconds in.
- **Avoidable rival** (probability `RIVAL_SPLIT_CHANCE`): occupies only the LEFT or RIGHT half of the road (randomly assigned); player can steer to the other half to avoid
- **Unavoidable rival** (probability `1 − RIVAL_SPLIT_CHANCE`): spans the full road width; combat is mandatory

**Combat resolution:**
When a rival crowd's bottom-y ≥ `CROWD_Y` and its x-range contains `crowd.centerX` (for avoidable) or always (for unavoidable):

```
fought    = Math.min(playerCount, rivalCount)
playerCount -= fought
rivalCount  -= fought
```

- Surviving side continues; loser is eliminated
- A **clash explosion** fires: up to `CLASH_MAX_DEBRIS` dead runners *per side* are blown outward as tumbling stick figures (`Game.debris`) with an upward pop, gravity and fade over `BLAST_ANIM_MS`, tuned by `BLAST_SPEED` / `BLAST_GRAVITY`
- If `playerCount` reaches 0 → **Game Over**
- Rival crowd is removed regardless (even if it had survivors — they ran off the road)

**maxPossible interaction:**
- **Avoidable rival**: `maxPossible` is unaffected (a perfect player steers around it)
- **Unavoidable rival**: `maxPossible -= rivalCount` at rival *generation* time, with guardrail: `rivalCount < maxPossible` (unavoidable rivals can never wipe out a perfect-run player)

### Operations

Applied to integer `count`. Operations come in two forms depending on elapsed time:

**Phase 1 — Integer ops (0 s to `FRACTION_START_TIME`):**

| Operator | Formula                                          |
|----------|--------------------------------------------------|
| `+ N`    | `count = count + N`                              |
| `− N`    | `count = Math.max(0, count − N)`                 |
| `× N`    | `count = Math.floor(count × N)`                  |
| `÷ N`    | `count = Math.max(0, Math.floor(count / N))`     |

**Phase 2 — Fractional ops (from `FRACTION_START_TIME` onward):**

Once `FRACTION_START_TIME` seconds have elapsed, each multiply and divide operation has a chance to render as a fraction `N/D` instead of a single integer. The result is identical — the cognitive challenge is that fractions are harder to read at a glance, so fraction gates are shown **purple** (not green/red) and hide whether they help or hurt.

The fraction chance starts at `FRACTION_CHANCE_INITIAL` (20%) and grows by `FRACTION_CHANCE_PER_GATE` (5%) for every gate the crowd has passed, capped at `FRACTION_CHANCE_MAX`. `+` and `−` are never fractional.

| Operator  | Formula                                                      | Display |
|-----------|--------------------------------------------------------------|---------|
| `× N/D`   | `count = Math.max(0, Math.floor(count × N / D))`            | `×3/4`  |
| `÷ N/D`   | equivalent to `× D/N`: `count = Math.floor(count × D / N)` | `÷5/2`  |

Rules for generating fraction operands:
- N is an integer 2–9; D is an integer 2–`FRACTION_MAX_DENOM`
- N ≠ D (no trivial ×1/1)
- `+` and `−` always remain integer operations throughout the game

**Math complexity progression (current implementation):**
- **0 s → `FRACTION_START_TIME`**: integers only; multipliers 2–4; divisors 2–3
- **`FRACTION_START_TIME` onward**: multiply/divide gates may appear as fractions (purple), denominators up to `FRACTION_MAX_DENOM`; the chance ramps per passed gate (see Phase 2). `+`/`−` stay integer

*(Future: ramp fraction denominators and operation magnitudes with elapsed time, and make integer ops rarer late-game.)*

After every operation: recalculate formation, trigger spawn/despawn animations.  
**If `count` reaches 0 → Game Over.**

### maxPossible System

`maxPossible` is a hidden shadow integer tracking the count of a player who has chosen every optimal gate from the start and avoided every avoidable rival. It is never displayed to the player.

- Initialise: `maxPossible = INITIAL_CROWD` (same as `count`)
- Updated **at generation time** for both gates and rival crowds, not at collision time:
  - **Split gate**: compute both operations on `maxPossible`; apply the *better* one (the one yielding the higher value)
  - **Full gate**: apply the operation to `maxPossible`
  - **Avoidable rival**: `maxPossible` unchanged (perfect player steers around it)
  - **Unavoidable rival**: `maxPossible -= rivalCount` at spawn time

**Generation guardrails** (use `maxPossible` to constrain generated values):
- Full `−N`: `N ≤ maxPossible − 1` — a perfect player always survives unavoidable minus gates
- Full `÷N/D`: `Math.floor(maxPossible × D / N) ≥ 1` — same guarantee for divide (including fractional)
- Unavoidable rival `rivalCount < maxPossible` — a perfect player always survives unavoidable fights
- Split bad side: may be any value including game-enders (this is the intentional risk)
- Split good side (**band-aware**): net-positive or neutral when `maxPossible` is at/below the target band; when **above** the band it may be a *gentle, survivable reduction* (result ≥ 1, ideally ≥ band low) so the controller can steer the count back down

**Target trajectory (bounds the randomness — prevents runaway growth):**
The optimal-route count tracks a saturating curve toward a soft ceiling, so randomness lives inside a band around it rather than compounding without limit:
```
T(t) = TARGET_BASE + (TARGET_CAP − TARGET_BASE) × (1 − e^(−t / TARGET_TAU))   // t = elapsedSeconds
bandLow  = floor(T × (1 − TARGET_BAND_FRAC))
bandHigh = ceil (T × (1 + TARGET_BAND_FRAC))
```
- `TARGET_CAP = MAX_DISPLAY_FIGURES` — a **soft** ceiling; occasional overshoot is acceptable (the over-cap display mechanic absorbs it).
- Each gate picks a `goal` for the optimal side: below band → grow toward `T` (capped at `maxPossible × STEP_MAX_FACTOR` per gate); above band → gentle shrink toward `T` (floored at `maxPossible × STEP_MIN_FACTOR`); in band → free random direction within `[bandLow, bandHigh]`.
- Because `T` saturates **and** single-gate growth is capped by `STEP_MAX_FACTOR`, geometric blow-up is impossible (simulated optimal play over 5 min stays ≈ 8 → 375, never the old 10k+).

### Scoring & Game Over

- **Score** = `Game.distancePx × SCORE_SCALE`, displayed as whole meters (e.g. "342 m") — the main score. `Game.distancePx += scrollSpeed × dt` accumulates each frame while running (frozen on game over)
- The score is shown live in the HUD **above the runner count** (top-left), and prominently on the game-over screen
- **Game Over** triggers when `count === 0`
- Game Over screen: "GAME OVER", final distance, restart prompt. *Planned*: top-3 leaderboard saved to localStorage

### Difficulty Ramp
- *Implemented*: `Game.scrollSpeed` ramps from `GATE_SCROLL_SPEED_INITIAL` up to `GATE_SCROLL_SPEED_MAX`, adding `GATE_SPEED_ACCEL` px/s **each second**, starting once the first gate has been passed (`gatesPassed ≥ 1`)
- *Implemented*: gates/rivals spawn on **distance**, not time — a new slot every `GATE_SPAWN_DIST_WZ` world-Z units the camera advances. Because the camera advances faster as `scrollSpeed` ramps, gates naturally arrive more frequently (this is the difficulty ramp), with no separate spawn-interval timer
- Operation magnitudes scale with elapsed time — loosely: multiply base N values by `1 + elapsedSeconds / DIFFICULTY_SCALE_TIME`, rounded to nearest integer, clamped to reasonable per-op maximums

---

## Gate Generation — Algorithm

Called each time a gate spawn is due. The first gate spawns **instantly at run start** and is always a single **positive** full gate (`+` or `×`) — a safe start that can never cause game over. For every subsequent gate:

1. Compute the optimal-side `goal = controllerGoal(maxPossible)` from the target band (grow / gentle-shrink / free-in-band — see Target trajectory).
2. Build the optimal op with `opTowardValue(maxPossible, goal)`: it picks `+`/`×` (growth) or `−`/`÷` (shrink) sized to approach `goal`. `×`/`÷` may render as a fraction (per `currentFractionChance()`), choosing `num/den` that approximates the desired value. `+`/`−` stay integer. Operands are clamped (`GROW_ADD_MAX`, `SHRINK_SUB_MAX`, `MUL_INT_MAX`, `DIV_INT_MAX`).
3. Run `enforceSurvival(op, maxPossible)` so an unavoidable/optimal side can never wipe the crowd (result ≥ 1).
4. **If split** (`Math.random() < SPLIT_GATE_CHANCE`): the other side is `makeBadSideOp(maxPossible)` — a deliberately worse, **un-guardrailed** op (≈60% a steep shrink that may be a near-wipe, ≈40% a weak-growth trap). Swap if the bad side is accidentally better, then `maxPossible = max(applyOp(good), applyOp(bad))` (optimal route takes the better side). Assign good/bad to LEFT/RIGHT randomly.
5. **If full**: `maxPossible = applyOp(maxPossible, op)`.
6. Push gate object `{ absZ, sections: [...] }` onto the active gates array (a `fired` flag is set on collision).

*"Better" = whichever op yields the higher value when applied to the current `maxPossible` (compare `applyOp` results directly, fractions included).*

## Rival Crowd Generation — Algorithm

*Current implementation* — a rival replaces every `RIVAL_EVERY_N_GATES`-th spawn slot; all rivals are centered/unavoidable and scale from `maxPossible`:

1. If `maxPossible < 2`, skip (spawn a gate instead) — too small to field a survivable rival.
2. `frac = RIVAL_FRAC_BASE + RIVAL_FRAC_RAMP × min(1, elapsed / RIVAL_FRAC_RAMP_TIME)` (≈30% → 65%).
3. `rivalCount = clamp(round(maxPossible × frac × jitter), 1, maxPossible − 1)` — guardrail `rivalCount < maxPossible` so a perfect player always survives (`jitter = 1 ± RIVAL_COUNT_JITTER`).
4. Apply `maxPossible −= rivalCount` (unavoidable, at generation time).
5. Push rival object `{ absZ, x: VP_X, count, people[], runClock, fought }`.

*Planned* — independent timer, `RIVAL_START_TIME`, and avoidable (half-road, dodgeable) rivals that leave `maxPossible` unchanged.

---

## HUD & Screens

**In-run HUD**
- Top-left: live distance in meters (the main score) **above** the live runner count
- *Planned*: small floating count label just above the crowd formation

**Start Screen**
- Game title (large)
- One-line rule hint: e.g. "Steer your crowd through the good gates!"
- Top 3 highscores (or dashes if empty)
- "Tap or click to start" prompt

**Game Over Screen**
- "GAME OVER" heading
- Final distance prominently displayed
- Top 3 leaderboard (new record highlighted if applicable)
- Restart button / tap-to-restart prompt

---

## Initial Balance Constants

All defined and clearly labeled at the **top of the JS file**. No magic numbers anywhere in game logic.

**Core / Figures**

| Constant                   | Default  | Unit / Notes                              |
|----------------------------|----------|-------------------------------------------|
| `INITIAL_CROWD`            | 1        | Starting figure count                     |
| `FIGURE_HEIGHT`            | 44       | px                                        |
| `FIGURE_SPACING`           | 17       | px between figure anchor points           |
| `MAX_FIGURES_PER_ROW`      | 20       | Figure-count cap used for road-edge clamping |
| `MAX_DISPLAY_FIGURES`      | 240      | Visual cap; count can exceed this         |
| `CROWD_SPEED_X`            | 350      | px/s, horizontal movement                 |
| `CROWD_Y`                  | 490      | px from top — feet baseline of crowd      |
| `RUN_ANIM_SPEED`           | 8        | rad/s, runClock advance rate              |
| `LEG_SWING_AMP`            | 0.45     | gain: leg stride driver → knee-lift angle |
| `ARM_SWING_AMP`            | 0.10     | ×FIGURE_HEIGHT — vertical hand-pump amplitude |
| `BOB_AMPLITUDE`            | 1.5      | px                                        |
| `SPAWN_ANIM_MS`            | 200      | ms, figure scale-up on arrival            |
| `DESPAWN_ANIM_MS`          | 180      | ms, figure fade-out on removal            |
| `SPAWN_STAGGER_MS`         | 45       | ms delay between consecutive figure spawns/despawns |
| `FIGURE_YAW`               | 0.18     | rad — constant 3/4 yaw of upper body      |
| `FIGURE_LEAN`              | 0.05     | ×FIGURE_HEIGHT — forward lean of shoulders |
| `LEG_LATERAL_SEP`          | 0.07     | ×FIGURE_HEIGHT — half-gap between the hips |
| `ARM_LATERAL_SEP`          | 0.11     | ×FIGURE_HEIGHT — half-gap between shoulders |
| `FORESHORTEN_AMT`          | 0.22     | 0–1 near/far limb length + width modulation |
| `FORESHORTEN_SHADE`        | 0.70     | far-limb stroke RGB multiplier (depth shade) |
| `LEG_LIFT_ANG`             | 0.70     | rad — stride driver → knee lift            |
| `LEG_STRIDE_Y`             | 0.10     | ×FIGURE_HEIGHT — vertical foot travel (depth scissor) |
| `LEG_KNEE_BEND`            | 0.60     | rad — extra knee flex on the lift half     |
| `LEG_CONVERGE`             | 0.25     | 0–1 — lifted knee drifts toward centre     |
| `ARM_OUT`                  | 0.35     | ×upper-arm — lateral elbow splay           |
| `ARM_ELBOW_FLEX`           | 0.90     | rad — constant forearm bend                |

**Road & Gates**

| Constant                      | Default  | Unit / Notes                              |
|-------------------------------|----------|-------------------------------------------|
| `ROAD_WIDTH`                  | 600      | px                                        |
| `GATE_HEIGHT`                 | 70       | px                                        |
| `GATE_ALPHA`                  | 0.60     | 0–1, gate block opacity                   |
| `GATE_SCROLL_SPEED_INITIAL`   | 360      | px/s at crowd depth                       |
| `GATE_SCROLL_SPEED_MAX`       | 840      | px/s at crowd depth                       |
| `GATE_SPEED_ACCEL`            | 5        | px/s per second                           |
| `GATE_SPAWN_DIST_WZ`          | 2.5      | world-Z distance between spawn slots (distance-based, not time) |
| `SPLIT_GATE_CHANCE`           | 0.75     | 0–1 probability of a split gate           |
| `GATE_WORLD_HEIGHT`           | 0.3      | gate height as fraction of camera height (world units) |
| `GATE_WORLD_DEPTH`            | 0.04     | gate slab thickness (world-Z units)       |
| `GATE_SPAWN_WZ`               | 10       | world-Z distance ahead of camera where gates spawn |

**Math Complexity**

| Constant                | Default  | Unit / Notes                                          |
|-------------------------|----------|-------------------------------------------------------|
| `FRACTION_START_TIME`     | 10       | seconds before mul/div can render as fractions        |
| `FRACTION_MAX_DENOM`      | 8        | maximum denominator in a fraction                     |
| `FRACTION_CHANCE_INITIAL` | 0.20     | fraction chance at `FRACTION_START_TIME`              |
| `FRACTION_CHANCE_PER_GATE`| 0.05     | added to the fraction chance per passed gate          |
| `FRACTION_CHANCE_MAX`     | 1.0      | cap on the fraction chance                            |

**Procedural Balance (maxPossible target controller)**

| Constant           | Default              | Unit / Notes                                          |
|--------------------|----------------------|-------------------------------------------------------|
| `TARGET_BASE`      | 8                    | runners — target-curve floor after the first gate     |
| `TARGET_CAP`       | `MAX_DISPLAY_FIGURES`| soft ceiling (240); occasional overshoot tolerated    |
| `TARGET_TAU`       | 90                   | s — ramp time constant (~63% of cap at 90 s)          |
| `TARGET_BAND_FRAC` | 0.18                 | ± band around target where op direction is free       |
| `STEP_MAX_FACTOR`  | 1.6                  | max single-gate growth × of maxPossible               |
| `STEP_MIN_FACTOR`  | 0.55                 | min single optimal-side result vs maxPossible         |
| `GROW_ADD_MAX`     | 60                   | cap on `+N` operand                                   |
| `SHRINK_SUB_MAX`   | 30                   | cap on `−N` operand                                   |
| `MUL_INT_MAX`      | 4                    | cap on integer `×N`                                   |
| `DIV_INT_MAX`      | 6                    | cap on integer `÷N`                                   |
| `BAD_SHRINK_LO`    | 0.10                 | split bad side may cut to as low as 10% of maxPossible|
| `BAD_SHRINK_HI`    | 0.60                 | ...up to 60%                                           |

**Path Edge Falling**

| Constant              | Default  | Unit / Notes                                            |
|-----------------------|----------|---------------------------------------------------------|
| `EDGE_DANGER_WIDTH`   | 30       | px, width of danger zone at each road edge              |
| `EDGE_FALL_RATE`      | 20       | figures/second lost while hugging the wall              |
| `FALL_ANIM_MS`        | 400      | ms, duration of tumble-off animation                    |
| `EDGE_FALL_GRACE_S`   | 5        | seconds at run start before edge falling activates      |

**Rival Crowds**

| Constant                      | Default  | Unit / Notes                                        |
|-------------------------------|----------|-----------------------------------------------------|
| `RIVAL_START_TIME`            | 8        | seconds before first rival crowd can spawn          |
| `RIVAL_SPAWN_INTERVAL_INITIAL`| 5000     | ms between rival spawns                             |
| `RIVAL_SPAWN_INTERVAL_MIN`    | 2000     | ms                                                  |
| `RIVAL_SPAWN_INTERVAL_ACCEL`  | −20      | ms/s                                                |
| `RIVAL_SPLIT_CHANCE`          | 0.65     | 0–1 probability of avoidable (half-road) rival      |
| `CLASH_ANIM_MS`               | 350      | ms, duration of combat burst animation              |
| `RIVAL_EVERY_N_GATES`         | 6        | spawn a rival instead of every Nth gate (temp logic)|
| `RIVAL_FRAC_BASE`             | 0.30     | unavoidable rival ≈ this fraction of maxPossible early|
| `RIVAL_FRAC_RAMP`             | 0.35     | additional fraction added over time                 |
| `RIVAL_FRAC_RAMP_TIME`        | 120      | seconds to reach full rival fraction                |
| `RIVAL_COUNT_JITTER`          | 0.15     | ±15% random jitter on rival size                    |
| `CLASH_MAX_DEBRIS`            | 50       | cap on blown-away figures rendered per side         |
| `BLAST_ANIM_MS`               | 800      | ms, how long dead runners fly before fading         |
| `BLAST_SPEED`                 | 320      | px/s, base outward blast speed                      |
| `BLAST_GRAVITY`               | 700      | px/s², downward accel on blasted figures            |

**Score**

| Constant               | Default  | Unit / Notes                    |
|------------------------|----------|---------------------------------|
| `SCORE_SCALE`          | 0.05     | meters per pixel scrolled       |
| `DIFFICULTY_SCALE_TIME`| 60       | seconds to reach full magnitude |

---

## Conventions
- `requestAnimationFrame` loop; cap `deltaTime` at 100 ms per frame to prevent spiral-of-death on tab-switch
- Collision: gate/rival depth `relZ` vs `RELZ_CROWD`; `crowd.x` vs section x-boundaries (split divider at `VP_X`)
- All tunable values in the constants block only — **zero magic numbers in game logic**
- Sound: implement `playSound(id)` as a no-op stub; hook audio files in later without refactoring
- Keep `maxPossible` bookkeeping strictly at *generation* time (gates and rivals), never at collision time
- `drawFigure(ctx, x, y, phase, scale, stroke, fill)` — `stroke`/`fill` distinguish player (blue) from rival (red)
- Operation objects: `{ type: '+' | '-' | 'MUL' | 'DIV', num: N, den: D }` — integer ops use `den: 1`
