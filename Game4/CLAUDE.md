# Xsolla Cascadia

A browser falling-piece match-3 game (Columns-style): 1×3 tiles of colored
tokens drop into a 6-wide well, rotate and slide before locking, then trigger
match/cascade chains. Single Player is an endless score-attack; Multiplayer is
a real-time, simultaneous two-well Hot Seat where cascades dump garbage on the
rival's well.

## Stack
- Vanilla HTML5 Canvas, no framework, **no build step** — files run directly in the browser
- `index.html` + `css/styles.css` + several `js/` modules (see Architecture)
- Must work standalone inside an iframe (no parent-window dependencies)

## Architecture (file layout)
All game state lives in one global `Game` object (`game.js`); no other globals
beyond shared constants and pure helper functions. In Multiplayer, `Game`
simply holds two independent well/piece/score sub-states rather than becoming
two globals.

- `index.html` — canvas element + ordered `<script>` includes
- `css/styles.css` — canvas sizing (4:3 box, capped 1200×900)
- `js/constants.js` — cross-cutting tunables: `CANVAS_W/H`, `LAYOUT`, `COLORS`,
  `WELL` (cols/rows), `TOKEN_VARIETY` options, `PIECE` (shape, spawn column),
  `FALL_SPEED` (base interval + ramp curve), `SCORE` (tier size), `GARBAGE`
  (threshold/step), `ANIM`, `AUDIO`
- `js/grid.js` — shared well-grid↔pixel geometry (col/row → x/y and back) for
  one well; used by both rendering and layout math
- `js/tilesets.js` — defines the 4 swappable tile "skins" (Crystals, Blobs,
  Dice, Elements): per-token draw params and idle-animation parameters, keyed
  by the same 6 color identities across all sets. Purely visual — `rules.js`
  and `board.js` only ever see token color IDs, never tileset-specific data.
- `js/board.js` — pure well data: grid init (6×15), random token generation
  respecting active variety count, match detection (row/column run scan),
  gravity/column-collapse after removal, garbage-row insertion
- `js/piece.js` — pure falling-piece logic: spawn a new 1×3 piece (random
  tokens), legal left/right movement, cycle up/down (rotate the 3 tokens),
  natural per-tick fall step, hard-drop resolution, lock test
- `js/rules.js` — pure game rules: full chain-resolve pass after a piece locks
  (match scan → removal → gravity fill → rescan, looping until stable),
  scoring formula, garbage-row calculation, top-out/game-over check
- `js/render.js` — all canvas drawing: cached well tray/background, tokens per
  active tileset, the falling piece, score "+x" pop-ups, garbage-row insertion
  animation, header (score, next-piece preview, sound/menu buttons), game-over
- `js/ambiance.js` — decorative animated background behind the well(s) and
  behind the menu, palette driven by the active tileset; purely visual
- `js/menu.js` — title screen (mode picker, token-variety picker, tileset
  picker, Play button, scoreboard view) and its hit-testable button rects
- `js/audio.js` — the `Sound` manager: preloaded HTMLAudio pools for sfx + a
  looping music element; all files/volumes/fade in the `AUDIO` constant
- `js/game.js` — the `Game` object: screen state, input (keyboard/on-screen
  buttons/swipe), per-well piece driver, animation queue, main rAF loop

**No `ai.js`** — there is no computer opponent in this game. Multiplayer is
two humans, each fully controlling their own well.

## Constraints
- 60 FPS target on a mid-range PC/Mac
- All game state in one `Game` object, no globals beyond it
- No build step

## Canvas & Rendering
- **Logical coordinate space is a fixed 800×600**, same as Hexxagon. All game
  logic, layout, collision, and hit-testing use 800×600 coordinates only.
- **Device-pixel rendering:** the canvas backing store is sized to its
  displayed size × `devicePixelRatio` (capped at 2×) by `Game.resizeCanvas()`,
  and `ctx.setTransform` scales the logical 800×600 space onto it. Runs on
  load and on window resize.
- CSS: the canvas element is a 4:3 box (`aspect-ratio: 4/3`) that fits the
  viewport and never exceeds 1200×900.
- **Static well layer is cached offscreen** (tray, carved cell wells,
  background/vignette/grain) at the current device scale and blitted each
  frame — only tokens, the falling piece, and effects are drawn fresh.
  Cache is keyed by well layout + tileset + backing dims.
- Rendering uses `requestAnimationFrame` with delta-time updates.

## Well & Grid
- Square grid, **5 columns × 13 rows**, one well per player
- Cell size computed per layout (`computeLayout` in `board.js`) so a well fits
  centered within the 800×600 space below the header — never hardcoded
- **Single Player:** one well, centered, with a stats panel (score/variety/
  speed) to the left and a next-piece preview to the right
- **Multiplayer:** two wells side by side within the same 800×600 canvas,
  layout splits width, not two separate canvases. No stats panel here —
  each well just gets a small "PLAYER 1"/"PLAYER 2" caption and its own
  next-piece preview (placed toward the center divide, mirrored, so both
  previews flank the middle of the screen)
- A cell above logical row 0 is valid space for a piece still entering the
  well (see Falling Piece) but is never part of the settled grid

## Falling Piece
- Shape: a fixed **1×3 vertical piece** — three token cells stacked in one column
- Spawns **fully inside the well** at a fixed spawn column (`PIECE.SPAWN_COL`),
  top-aligned (its top token at row 0), with 3 random tokens — no off-grid
  entry phase; it's immediately fully visible and controllable, and begins
  its natural descent from there
- **Move left / right:** shifts the piece one column, blocked by well edges
  or by an occupied/out-of-bounds cell in the destination column at any of
  the piece's 3 rows
- **Cycle up:** rotates the 3 tokens in place — top → bottom, middle → top,
  bottom → middle (wraps)
- **Cycle down:** the reverse rotation
- **Drop fast (hard drop):** the piece instantly falls to the lowest row it
  can legally occupy and locks immediately — no cancel, no further input
- **Natural fall:** the piece descends one row per `FALL_SPEED` tick,
  automatically, without input
- **Locking:** the instant a piece reaches the lowest row it can occupy —
  whether by natural fall or hard drop — it is written into the well grid and
  can no longer be moved, rotated, or reclaimed. **There is no lock-delay
  grace period.**
- `FALL_SPEED` increases as a match goes on: every `RAMP_INTERVAL_SEC` of
  elapsed match time, the fall interval drops by `RAMP_STEP_MS` down to a
  floor of `MIN_MS`. In Multiplayer both wells share the same ramp/timer, so
  neither player is disadvantaged by speed.

## Matching, Cascades & Resolution
Once a piece locks, `rules.js` runs a full **chain-resolve pass**:

1. **Scan:** for every row, column, and diagonal (both `\` and `/`
   directions), find maximal runs of length ≥ 3 of the same token. A cell
   matched by more than one line (row/column/diagonal) is still only
   removed once (union of all matched cells).
2. **Flash:** matched cells stay in place and strobe for `ANIM.FLASH_MS`
   (250ms) to telegraph the pop before anything is removed.
3. **Explode:** matched cells are removed simultaneously and replaced with a
   burst of colored particles at each cell's position; a `+x` score pop-up
   appears alongside it (see Scoring for `x`).
4. **Fill:** within each column, tokens above a gap fall straight down to
   close it (gravity/column-collapse) — animated at a real, tuned speed
   (fast but not instant; longer drops take a little longer, capped), not a
   teleport. No new tokens are spawned to fill gaps — new tokens only ever
   enter via the next falling piece.
5. **Rescan:** once the fall settles, repeat step 1 on the result. If a new
   match is found, go back to step 2 (a cascade — flash, explode, fall,
   again), so a multi-step chain visibly reads as explosion → fall →
   explosion → fall. If not, the chain is done.
6. **Next piece:** only once a chain is fully done (nothing exploded on the
   last scan) is a new piece spawned for that well. A piece never spawns
   while its own well is still resolving — input is ignored for the whole
   flash/explode/fall sequence, not just the instant of removal.

The total tile count across **every** removal in the whole chain (not just
the first pop) is what feeds both the Scoring formula and the Multiplayer
garbage formula below.

## Scoring (Single Player and per-player in Multiplayer)
Let `N` = total tiles removed across the whole cascade chain from one piece
lock. Each tile's point value depends on its position when tiles are ordered
1..N (order doesn't affect the total, only the tier math):

- Tiles 1–3 (the base match): **1 point each**
- Tiles 4–6: **2 points each**
- Tiles 7–9: **3 points each**
- Tiles 10–12: **4 points each**
- …and so on, +1 point per tile for every additional group of 3

Closed form: with `g = floor(N / 3)` full groups and remainder `r = N - 3g`:

```
score(N) = 3 * g * (g + 1) / 2 + r * (g + 1)      (0 for N < 3)
```

Worked examples: `score(3) = 3`, `score(4) = 5`, `score(6) = 9`,
`score(7) = 12`, `score(9) = 18`, `score(12) = 30`.

- `+x` pop-ups: each exploding tile in the chain shows its own per-tile point
  value (1, 2, 3, 4…) at its cell, matching the tier it fell into.

## Multiplayer & Garbage
- Hot Seat is **real-time and simultaneous**, not turn-based: both wells run
  their own piece/fall/lock/cascade loop at the same time, on a shared speed
  ramp and shared token variety/tileset for the match.
- **Controls are split, not shared:** `a` / `d` / `w` / `s` / `space` drive
  Player 1's well; `←` / `→` / `↑` / `↓` / `Enter` drive Player 2's well —
  simultaneously, on one keyboard, in real time (not alternating turns).
- Using the same chain total `N` as Scoring: if `N > 3`, the attacker sends
  `floor((N - 3) / 3)` garbage rows to the rival's well — garbage kicks in
  once a chain clears more than the *second* triplet, not the third.
  `N ≤ 3` sends none. (`N=4,5` → 0 rows; `N=6` → 1 row; `N=9` → 2 rows;
  `N=12` → 3 rows.)
- A garbage row is a **full row of 6 random tokens** (drawn from the match's
  active variety count), inserted at the **bottom** of the rival's well,
  shifting all of that well's existing settled content up by one row per row
  of garbage. The existing structure is shifted, never rearranged or altered.
- Garbage insertion does **not** itself trigger a match scan — it only sits
  there until the receiving player's own next piece locks and a chain-resolve
  pass runs (which can then match against garbage tiles like any other token).
- If a defending well's currently-falling piece is mid-descent when garbage
  arrives, only the settled grid shifts; the falling piece is unaffected and
  simply continues descending into the new, higher stack.
- **Game over (per well):** if a new piece cannot be spawned because the
  spawn column is already blocked at the top of the well, that player tops
  out and loses; the other player wins immediately (the match ends the
  instant a well tops out — it doesn't wait for the winning well to also
  finish its current cascade). The losing well shows a "TOPPED OUT" tint;
  a win dialog ("PLAYER X WINS!") appears with **Play Again** (rematch with
  the same variety/tileset) and **Title Screen** buttons/keys (`R` / `M`).
  In Single Player, topping out records the score to the local scoreboard
  (see Token Variety & Difficulty) and shows a game-over dialog: final
  score, "NEW BEST SCORE!" / "NEW #2/#3 SCORE!" if it made the top 3 for
  the active variety, the top-3 list itself, and Play Again / Title Screen
  buttons (`R` / `M`).

## Modes
- **Single Player:** one well, endless score-attack, speed ramps over time,
  ends on top-out, final score offered to the local scoreboard
- **Multiplayer (Hot Seat):** two wells, same device, real-time simultaneous
  play (see Multiplayer & Garbage above); ends when either well tops out
- Token variety (4/5/6) and tileset are chosen from the title screen before
  each game/match, same for both wells in Multiplayer
- The **next piece** is always shown in a preview panel — for both wells in
  Multiplayer, for the single well in Single Player

## Token Variety & Difficulty
- Token variety is chosen before start: **4, 5, or 6** distinct tokens in
  play. This doubles as the Single Player "difficulty" for scoreboard purposes.
- **Local scoreboard:** Single Player only, top **3 scores per variety count**
  (4 / 5 / 6), stored locally (`localStorage`, `js/scoreboard.js`) and shown
  in the Single Player game-over dialog (see Modes); not yet surfaced on the
  title screen itself.
- The Elements tileset's six designs (fire/water/life/lightning/void/star) are
  its natural 6-variety set. At 4 or 5 variety, the game **randomly selects**
  4 or 5 of the six designs once at the start of the match; that subset then
  stays fixed for the whole match.

## Tile Sets
All four tilesets map to the **same 6 color identities** (red, blue, green,
cyan, purple, yellow) — swapping tilesets only changes how a token color is
drawn, never the game logic. `tilesets.js` is the only place per-set visuals
live; `render.js` asks it for "how do I draw color X" and nothing else.

- **Color Square Crystals:** faceted square gems — a chamfered (cut-corner)
  outline, a bright center "table" facet plus 4 shaded side facets (a real
  faceted cut, not a flat fill or single bevel gradient), in deepened
  jewel-tone variants of the 6 hues rather than the flat UI hex. Mostly
  static/simple next to Blobs and Elements, but not fully inert: a slow,
  barely-perceptible shimmer on its gloss streak and an occasional
  animated star-glint twinkle
- **Color Round Blobs (eyes):** large, near-full-bleed blobs (same fill
  philosophy as Crystals — barely any margin to the cell) in a brighter,
  slightly more saturated variant of the 6 hues than the flat UI hex. An
  organically wobbly (not perfectly round) silhouette with its own rim,
  a specular highlight distinct from the body's gradient, a contact/AO
  shadow on the body's own underside, a small smile, and a barely-
  perceptible idle "breathing" squash/stretch. Each eye blinks on its own
  independent, slightly-desynced cycle from a deterministic per-cell seed
  (staggered, not synchronized, and not even synced eye-to-eye). Also
  occasionally yawns (both eyes close, mouth opens into a large "O") or
  looks surprised (eyes widen, mouth opens into a small "o") — infrequent,
  seed-timed expression windows layered on top of the normal blink/smile
- **Dice:** cubes rendered in a single neutral dice color, distinguished
  purely by pip count 1–6 (dots) rather than by hue — the "value" replaces
  "color" as the match identity for this set
- **Elements** (hardest to render): same near-full-bleed size as Blobs, in a
  high-quality soap-bubble membrane — genuinely wobbly and alive (several
  traveling sine ripples running live off elapsed time, not a fixed per-seed
  bulge like Blobs' — real soap film never holds still), a slowly-rotating
  iridescent rainbow sheen along the rim (thin-film interference), a primary
  highlight that gently drifts plus a smaller secondary glint, and animated
  symbols inside, seen through the wobbly membrane itself (the interior clip
  follows the same live outline) —
  - **Fire (red):** a stream of small rising ember particles (not a single
    solid flame shape) — color-shifts hot white/yellow near the base to
    orange to smoky red as each ember rises and fades, over a warm glow
  - **Water (blue):** the bubble fills to roughly 2/3 with a gently sloshing
    water level, with small bubbles rising up to the surface and vanishing there
  - **Life (green):** drifting firefly particles, each with a soft glow
    halo, a faint trailing echo along its own orbit, and a gentle pulse
  - **Lightning (cyan):** a constant electrical discharge — always present
    (not an intermittent flicker, which made the color hard to identify at
    a glance), crackling continuously via smooth jitter/intensity, with an
    ambient cyan haze and an occasional branch fork
  - **Void (purple):** many sparkle particles (not a sparse few) spiraling
    slowly inward over a dark vignette, thematically pulled toward the center
  - **Star (yellow):** a glowing 4-armed star slowly rotating, with a
    gentle breathing glow and a couple of tiny twinkling sparkles drifting
    loosely around it
  - All six share the same soap-bubble membrane so only the interior
    animation differs

## Visual Style (shared chrome)
- **Background:** deliberately very dark (near-black gradient + a soft
  vignette darkest at the corners) on every screen, menu included — so the
  saturated tilesets/tokens read as the brightest thing on screen rather
  than competing with a mid-gray backdrop
- **Well tray:** the grid sits on a rounded, lit-gradient tray (also darker
  than the background gradient itself, plus a soft cool rim glow) with rim
  bevel and drop shadow, matching the aesthetic language of Hexxagon's board tray
- **Cell wells:** each empty cell is a carved recess (inner shadow top-left,
  light-catching wall bottom-right)
- **Background ambiance** (`js/ambiance.js`, implemented): soft drifting
  bokeh motes in the 6 token hues, behind the well(s) and the menu — a fixed
  layout of motes that just drift/pulse from their own seed over time, no
  per-frame simulation state
- **HUD panels** (stats/next): a colored gradient accent stripe across the
  top of each panel (clipped to its own rounded corners), small hand-drawn
  icons next to SCORE/SPEED (sparkle, bolt), and — for variety — a row of
  dots in the match's actual active colors rather than just a number
  (matters most for Elements, whose 4/5-variety subset is a random pick of
  the 6, not just "the first N")
- **Falling piece:** drawn identically to settled tokens of the active
  tileset, no ghost/landing-preview piece
- **Score pop-ups:** `+x` text rises and grows (100%→150%) while it fades at
  each exploding cell's position, colored to match the exploding token (or
  the tileset's own neutral color, for Dice)
- **Garbage rows:** visually distinguishable insertion moment as the new
  row(s) slide up from below the well and the existing stack shifts up to
  make room, fast but not instant (see Animations — garbage insert)

## Animations
The chain-resolve pass is a real timed state machine (driven by `game.js`,
not instant): flash → explode/particles → gravity-fall → rescan, looping
until a rescan comes back empty. Underlying grid data still updates in one
shot at each step (removal, then compaction), but the *state machine itself*
blocks scanning/spawning until each step's animation duration has actually
elapsed — so a cascade is paced in wall-clock time, not just decorated.
- **spawn** — piece token trio appears already fully inside the well (see
  Falling Piece); no off-grid entry animation
- **fall** — smooth per-row interpolation for both natural fall and hard drop
- **lock** — a small settle/squash bump when a piece fixes in place *(not yet
  implemented)*
- **flash** — matched tokens strobe in place for `ANIM.FLASH_MS` (250ms)
  before exploding, in the shape of the active tileset's own token
  silhouette (round for Blobs/Elements, chamfered for Crystals, rounded
  square for Dice — via each tileset's `silhouette()`), not a generic
  square, so only the token itself flickers rather than its whole cell
- **explode** — matched tokens are replaced by a burst of colored particles
  (`ANIM.PARTICLE_COUNT` per cell) that fly outward, arc under gravity, and
  fade over each particle's own lifetime; a `+x` score pop-up floats up and
  fades alongside it
- **gravity-fall** — tokens above a cleared gap drop with an accelerating
  (ease-in) animation, fast but not instant; duration scales with distance
  fallen (`ANIM.FALL_BASE_MS` + per-row, capped at `ANIM.FALL_MAX_MS`) so the
  next rescan only happens once tokens have visibly settled
- **garbage insert** — the incoming row(s) rise up from below as the
  existing stack shifts up in one smooth beat, fast but not instant (same
  `ANIM.FALL_BASE_MS`/`FALL_PER_ROW_MS`/`FALL_MAX_MS` timing as gravity-fall,
  scaled by row count). Grid data updates in one shot as always; every
  existing token and every incoming token share one relationship
  (`toRow = fromRow - rows`, the new tokens simply starting `rows` further
  below, off-screen) so both animate as a single unified upward shift. This
  doesn't block or interrupt the currently-falling piece, which keeps
  descending into the taller stack exactly as before

## Audio
Mirrors Hexxagon's approach: everything uses `HTMLAudioElement` (works
identically under `file://` and `http://`), sfx preloaded into small pools
(`POOL_SIZE`) and round-robin played, music streamed and looped, not cached.
Event names below are placeholders for `assets/sfx/` — adjust freely:
`ui_click` (menu/HUD), `piece_move`, `piece_rotate`, `piece_lock`,
`match_pop` (first pop in a chain), `cascade_pop` (subsequent pops, can pitch
up per chain step), `garbage_land` (row insertion), `game_over`. Music starts
when play begins and fades/stops on return to the title screen, same
`AUDIO.MUSIC_FADE_MS` convention as Hexxagon.

## Controls
Buttons (on-screen, clickable) and touch both supported, alongside keyboard.

| Action | Single Player | Multiplayer P1 | Multiplayer P2 | Touch |
|---|---|---|---|---|
| Move left | `a` / `←` | `a` | `←` | swipe left |
| Move right | `d` / `→` | `d` | `→` | swipe right |
| Cycle up | `w` / `↑` | `w` | `↑` | swipe up |
| Cycle down | `s` / `↓` | `s` | `↓` | swipe down |
| Drop fast | `space` / `Enter` | `space` | `Enter` | double tap |

On-screen buttons for all 5 actions are always available as an alternative
input path (mouse click or touch tap), independent of keyboard bindings.

**Mouse (drag-to-swipe):** click-drag on the well in a direction to
move/cycle the piece (dominant axis wins — horizontal drag moves left/right,
vertical drag cycles up/down), double-click to hard-drop — the same gesture
mapping as Touch above. Mouse control drives **Single Player's** well, or
**Player 1's** well in Multiplayer — Player 2 stays keyboard-only
(arrows/Enter), so one player's mouse can't interfere with the other's well
on a shared screen.

## Conventions
- Use `requestAnimationFrame`, delta-time updates (a `Game.time` accumulator
  drives idle animations like blob blinking and element bubble motion)
- Match detection via straight-line runs only (row, column, and both diagonal directions)
- Keep all balance/tunable numbers (fall-speed ramp, score tiers, garbage
  thresholds, animation durations, colors, layout margins) as constants at
  the top of their respective files

## Initial Balance
- Well size: 5 columns × 13 rows
- Piece shape: 1×3 vertical, 3 random tokens per spawn
- Token variety: 4, 5, or 6, chosen pre-game
- Match minimum: 3 in a straight line (row, column, or diagonal)
- Score tiers: +1 point-per-tile bump for every additional 3 tiles in a chain
  (`score(3)=3`, `score(6)=9`, `score(9)=18`, `score(12)=30`)
- Garbage: `floor((N-3)/3)` rows sent to rival per chain where `N` is the
  chain's total exploded tiles (0 rows if `N ≤ 3`)
- Fall speed: ramps up over elapsed match time toward a floor, shared across
  both wells in Multiplayer

## Implementation status
- **Done:**
  - Project scaffold: `index.html`, `css/styles.css`, all `js/` modules per
    Architecture.
  - **Title screen** (`js/menu.js`): mode picker (Single Player and
    Multiplayer both enabled), token-variety picker (4/5/6), tileset picker,
    Play (click or Enter/Space). A "How To Play" button (bottom-right)
    opens a 2-page popup — controls, then a visual explainer of
    row/column/diagonal matching — navigable by click, Prev/Next, Escape,
    or arrow keys.
  - **Tile Sets:** all 4 are fully implemented and selectable — Crystals,
    Blobs, Dice, Elements (Elements includes the random 4/5-of-6 design
    subset per match — see Token Variety & Difficulty; Dice maps color IDs
    to a fixed 1-6 pip count, a rendering-only choice that rules.js/board.js
    never see).
  - **Single Player:** playable end-to-end — 5×13 well centered on screen,
    stats panel (left) + next-piece preview (right), 1×3 piece
    spawn/move/cycle/fall/hard-drop, full chain-resolve with a real timed
    cascade (flash → explode/particles → gravity-fall → rescan, matching
    row/column/diagonal runs), scoring formula. Game-over is a proper
    dialog (`js/scoreboard.js` + `Renderer.drawGameOverDialog`): final
    score, top-3-per-variety local scoreboard (`localStorage`), a
    "NEW BEST/#2/#3 SCORE!" callout when this run makes the cut, and
    Play Again / Title Screen buttons (`R`/`M`).
  - **Multiplayer (Hot Seat):** two wells split the canvas width (no stats
    panel — just a "PLAYER 1"/"PLAYER 2" caption and next-piece preview
    each), independent piece/fall/lock/cascade loops on one shared speed
    ramp, garbage exchange on big chains (`Rules.garbageRowsFor`, garbage
    kicks in once a chain clears more than the second triplet — `N > 3`)
    deferred until the receiving well isn't itself mid-cascade, then
    animated sliding up from below (fast but not instant — see Animations),
    not an instant appearance. `a/d/w/s/space` drives Player 1 (plus mouse),
    `←/→/↑/↓/Enter` drives Player 2. The match ends the instant either well
    tops out, with a win dialog offering Play Again (`R`/click) or Title
    Screen (`M`/click).
  - **Input:** full keyboard for both modes, plus mouse drag-to-swipe +
    double-click for Single Player/Player 1, and plain click for all
    menus/dialogs (scoped per Controls).
  - **HUD redesign:** much darker background/tray across every screen (menu
    included) so saturated tokens read as the brightest thing on screen;
    `js/ambiance.js` implements the previously-planned drifting bokeh
    layer; stats/next panels got a colored accent stripe, small hand-drawn
    icons (sparkle/bolt), and a row of dots in the match's actual active
    colors for variety (not just a number) — see Visual Style.
  - **Audio** (`js/audio.js`, the `Sound` manager): sfx (`ui_click`,
    `piece_rotate`, `piece_lock`, `match_pop`) preloaded into small pools
    and round-robin played so triggering never waits on a decode; one music
    track per tileset (Crystals/Blobs/Dice/Elements), started when Single
    Player or Multiplayer begins and switched only between HUD screens —
    never on the title screen. Returning to the title screen (win/game-over
    dialog, `R`/`M`, or the HUD exit button) fades the current track out
    over `AUDIO.MUSIC_FADE_MS` (3s) before stopping, rather than cutting it.
    Two icon-only HUD buttons sit top-right on both gameplay screens: an
    audio-mode toggle cycling On → Music Off → All Off → On (speaker icon
    changes glyph per mode) and an Exit button that returns to the title
    screen immediately.
- **Pending:** a scoreboard view on the title screen itself
  (data/persistence exists, just not shown there yet), touch input (mouse
  gesture code is written to be reused, not yet wired to touch events),
  other on-screen buttons (move/cycle/drop), and the lock-squash animation
  noted above.
