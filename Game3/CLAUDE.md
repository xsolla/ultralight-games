# Xsolla Hexxagon

A browser Hexxagon clone (Ataxx-style): two factions battle for control of a
hexagonal board via clone/jump moves and adjacency conversions.

## Stack
- Vanilla HTML5 Canvas, no framework, **no build step** — files run directly in the browser
- `index.html` + `css/styles.css` + several `js/` modules (see Architecture)
- Must work standalone inside an iframe (no parent-window dependencies)

## Architecture (file layout)
All game state lives in one global `Game` object (`game.js`); no other globals
beyond shared constants and pure helper functions.

- `index.html` — canvas element + ordered `<script>` includes
- `css/styles.css` — canvas sizing (4:3 box, capped 1200×900)
- `js/constants.js` — cross-cutting tunables: `CANVAS_W/H`, `LAYOUT`, `COLORS`, `BOARD_SIZES`, `MODES`, `AI_LEVELS`, `AI_DELAY`, `ANIM`
- `js/hex.js` — shared hex geometry (axial↔pixel, cube distance, neighbors, rounding, corners); used by BOTH rendering and click hit-testing
- `js/board.js` — pure board data: generation per radius, fit-to-canvas layout, starting placement, token counting
- `js/render.js` — all canvas drawing: cached board-plate (tray+wells+grain), background/glow/vignette, tokens (bubble & crystal), animations, hints, selection, header (score + sound/power HUD buttons), game-over
- `js/ambiance.js` — decorative animated background (god rays, drifting dust, out-of-focus bokeh bubbles/crystals) drawn behind the board and behind the menu, with distinct palettes/ray directions per screen; purely visual
- `js/menu.js` — the title screen (Play button + icon settings tiles) and its hit-testable button rects
- `js/rules.js` — pure game rules: `legalDestinations`, `allLegalMoves`, `hasLegalMove`, `applyMove` (clone/jump + conversion), `fillEmptyCells`
- `js/ai.js` — the three AI tiers; all weights/depths as named constants at the top
- `js/audio.js` — the `Sound` manager: preloaded HTMLAudio pools for sfx + a looping music element; all files/volumes/fade in the `AUDIO` constant (see Audio)
- `js/game.js` — the `Game` object: screen state, input, turn flow, AI driver, animation queue, main rAF loop

## Constraints
- 60 FPS target on a mid-range PC/Mac
- All game state in one `Game` object, no globals beyond it
- No build step

## Canvas & Rendering
- **Logical coordinate space is a fixed 800×600.** All game logic, layout,
  collision, positioning, and hit-testing use 800×600 coordinates only.
- **Device-pixel rendering (updated approach):** the canvas *backing store* is
  sized to its displayed size × `devicePixelRatio` (capped at 2×) by
  `Game.resizeCanvas()`, and `ctx.setTransform` scales the logical 800×600 space
  onto it. This keeps text/lines crisp at any display size.
  - NOTE: this intentionally supersedes the original spec note "do NOT implement
    dynamic canvas resizing / responsive canvas.width/height." That older
    approach (fixed 800×600 backing + CSS upscale with `image-rendering:
    crisp-edges`) looked blocky when enlarged. The **logical** resolution is
    still a fixed 800×600 — only the backing store tracks device pixels — so no
    game/layout math changed. `resizeCanvas()` runs on load and on window resize.
- CSS: the canvas element is a 4:3 box (`aspect-ratio: 4/3`) that fits the
  viewport and never exceeds 1200×900. No `object-fit`, no `crisp-edges`.
- **Static board layer is cached offscreen** (`getStaticLayer`) at the current
  device scale and blitted each frame — background, glow/vignette, board tray,
  carved cell wells, and film grain never change during play, so per-cell
  effects are effectively free. Cache is keyed by board identity + backing dims.
- Rendering uses `requestAnimationFrame` with delta-time updates.

## Board & Coordinates
- Hex grid using axial coordinates `(q, r)` with cube constraint `q + r + s = 0`
- Board shape: regular hexagon. Size chosen from the menu before each game:
  - 3x3x3 → radius 2 → 19 cells
  - 4x4x4 → radius 3 → 37 cells
  - 5x5x5 → radius 4 → 61 cells
- Pointy-top hexes
- Cell size is computed per board size (`computeLayout` in board.js) so the board
  fits centered within the 800×600 space below the header — never hardcoded
- One shared module (`hex.js`) for hex↔pixel conversion, used for both rendering
  and click/tap hit-testing

## Game rules (canonical)
- Two factions: **Bubbles** (soft bluish) and **Crystals** (hard reddish)
- Start: 3 tokens per faction, placed on alternating corners of the hex board (6 corners total, 3 per faction)
- On a turn, the player selects one of their own tokens, then a legal destination hex:
  - **Clone** (distance 1, the 6 neighbors): original stays in place, a new token appears at the destination
  - **Jump** (distance 2): the original token is removed from its origin and reappears at the destination
  - No other distance is a legal move
- Immediately after a token lands on a destination (clone or jump), every enemy token in that destination's 6 neighboring hexes converts to the mover's faction
- Turn passes to the other player after every move
- If the player to move has no legal move available, that is a game-ending condition — see Win Condition
- Outcome is decided purely by final token count

## Win Condition
- As soon as one player has no legal moves left, the game ends immediately (it does not wait for the other player to also be stuck)
- All remaining empty hexes are then filled with tokens of the player who still had moves available
- Whoever has more tokens once the board is fully resolved wins
- Edge case — both players simultaneously out of moves (board locked with empty cells remaining): skip the fill step and compare current token counts directly
- Edge case — board fills up naturally through normal play before either side runs out of moves: compare final counts directly

(Implemented in `Game.checkGameState` / `Game.endGame`.)

## Modes
- **Play vs AI**: human plays one faction, AI plays the other. Which faction the AI gets is random per game.
- **Hot Seat**: two humans alternate turns on the same device/board; no AI involvement
- **First move is randomized in ALL modes** (both vs-AI and Hot Seat).
- Board size (3x3x3 / 4x4x4 / 5x5x5) is chosen from the title screen before each game, in both modes
- **Coin-flip ceremony**: after Play, a brief `screen: 'ceremony'` plays coin tosses
  revealing the randomised roles (AI's side in vs-AI, then who moves first, all
  modes) over the ambiance, then `beginPlay()` shows the board with the spawn
  pop-ins. Click skips. Constants in `CEREMONY` (constants.js); rendered by
  `drawCeremony`/`drawCoin`; the coin's two faces are the Bubble & Crystal tokens.

## AI levels
All weights/depths are named constants at the top of `ai.js`, clearly tunable.
The internal search uses an index-based `Int8Array` board with make/undo (never
clones the board). An artificial ~400–600 ms "thinking" pause (`AI_DELAY`) wraps
every AI move so it doesn't feel jarring.

- **Easy**: near-random among legal moves, weighted slightly toward clone moves
  over jump moves (favors spreading); depth-1 greedy on immediate token gain, no
  lookahead. Constants: `AI_EASY_CLONE_BIAS`, `AI_EASY_GREEDY`.
- **Normal**: minimax with alpha-beta, **depth 2** (`AI_DEPTH.normal`).
  Heuristic = `(own − enemy) + AI_MOBILITY_WEIGHT * own_destination_count`.
  Deliberately imperfect: with probability **`AI_NORMAL_RANDOM_CHANCE` (0.3)** it
  plays a random legal move instead of the minimax pick, so it doesn't crush a
  human and stays clearly between Easy and Hard. (This nerf was added after
  Normal-at-depth-3 felt too strong relative to Easy.)
- **Hard**: minimax with alpha-beta, **depth 5** (`AI_DEPTH.hard`), capped at
  ~1 s wall-clock (`AI_TIME_MS.hard`) via iterative deepening that reduces depth
  on the fly. Heuristic adds corner/edge control (`AI_CORNER_WEIGHT`) and a
  penalty for own tokens exposed to an enemy jump-conversion next turn
  (`AI_EXPOSURE_WEIGHT`).
- Verified ordering: Hard > Normal > Easy; Hard worst-case move ~0.6 s on 5x5x5.

## Visual style
- **Bubbles** (soft faction): living, translucent **soap bubbles** — faint blue
  interior (board shows through), organic wobbling outline, rotating thin-film
  iridescence (screen-blended color smears), bright rim + specular highlights.
  Idle: gently float (bob) and breathe (volume-preserving squash), each with its
  own phase from a deterministic per-cell seed.
- **Crystals** (hard faction): luminous, translucent **step-cut ruby gems** —
  a bright inner table facet + 6 crown facets with alternating brightness (so
  the cut reads and isn't flat), over an inner glow. Idle: gradual hue shift
  (kept in the red range) and a light flash that sweeps the facets once in a
  while, plus a twinkling sparkle.
- **Board tray**: the grid sits on a rounded flat-top hexagon plate (lit
  gradient, rim bevel, drop shadow) so the board floats above a glow + vignette,
  with subtle film grain over everything.
- **Cell wells**: each empty cell is a carved recess (inner shadow top-left,
  light-catching wall bottom-right).
- **Background ambiance** (`ambiance.js`): animated god rays, drifting dust
  motes, and deep out-of-focus bokeh bubbles/crystals behind the board and the
  menu — cool/blue rays in-game, warmer/purple rays on the title screen.
- **Selected token**: breathing highlighted ring. **Legal destinations**:
  clone-range (green, solid dot) vs jump-range (blue, hollow ring), gently
  pulsing. **Hover**: subtle highlight on the cell under the cursor.

## Animations
Cosmetic overlay on instant logic: the board state updates immediately in
`applyMove`; animations are queued in `Game.animations` and drawn by
`drawAnimations`. Cells owned by an in-flight animation are skipped by the
static token pass (`Game.occludedCells`). Durations live in `ANIM` (constants.js).
- **spawn** — starting tokens pop out of the cell center (staggered) with an overshoot
- **clone** — a new token buds off the origin and travels to the destination, growing (soap "split")
- **jump** — the token arcs from origin to destination with squash/stretch and a lifting contact shadow
- **convert** — a particle stream (dots + '+' signs, coloured by the mover's
  faction, shaped as a cone with a cut-off top) flows from the landed token to
  each converted cell; under it the enemy token shrinks out and the mover's
  token pops in (10% → 120% → 100%). **The turn is gated on this**: `Game.busy`
  blocks input/AI and `finishTurn()` only runs from the convert animation's
  `onDone`, so the next turn cannot start until conversion ends.

## Audio
Implemented in `js/audio.js` (the `Sound` object); all tunables (file paths,
volumes, fade duration) live in the `AUDIO` constant at the top.
- **Everything uses `HTMLAudioElement`** so audio behaves identically under
  `file://` and `http://`. (The Web Audio `fetch`+`decodeAudioData` route is
  blocked by CORS on `file://`, which would silently kill all sfx while
  HTMLAudio music kept playing — so it is deliberately not used.)
- **Sfx** are preloaded into a small per-sound pool (`POOL_SIZE`) and cached in
  memory; playback round-robins through the pool so overlapping/rapid sounds
  don't cut each other off, and replaying rewinds a cached element rather than
  re-reading from disc. Event → file mapping (self-explanatory names in
  `assets/sfx/`): `ui_click` (menu/HUD buttons), `click_on_bubble`/
  `click_on_crystal` (selecting your own token), `token_clone`/`token_jump`
  (moves), `convert_to_bubbles`/`convert_to_crystal` (conversion, fired when the
  particle stream begins, by the mover's faction), `coin_flip_start`/
  `coin_flip_result` (ceremony).
- **Music** (`assets/bgm/hexx-bgm.mp3`) streams and loops; it is **not** cached.
  It starts in `beginPlay()` (when the board appears — not on the menu or during
  the ceremony) and fades out over `AUDIO.MUSIC_FADE_MS` (3 s) then stops when
  returning to the title screen (`Game.returnToMenu()`).
- **Sound button** (`Game.soundState`, 3-state) drives `Sound.applyState`:
  `on` = sfx + music, `musicoff` = sfx only (music pauses immediately, resumes
  if toggled back on mid-game), `off` = silent.

## Conventions
- Use `requestAnimationFrame`, delta-time updates (a `Game.time` accumulator drives idle/breathing animations)
- Hex distance via cube coordinates: `max(abs(dq), abs(dr), abs(ds))`
- Keep all balance/tunable numbers (AI depths & weights, animation durations, colors, layout margins) as constants at the top of their respective files

## Initial Balance
- Initial tokens per faction: 3, placed at alternating board corners
- Clone distance: 1 hex; Jump distance: 2 hex
- AI move delay: enforced ~400–600 ms minimum "thinking" pause (`AI_DELAY`)

## Implementation status
- **Done:** board generation & dynamic layout; rules (clone/jump/conversion,
  legal moves); win condition + resolution; modes (vs AI random assignment, Hot
  Seat); all 3 AI tiers; title-screen menu with icon tiles; full aesthetics
  (soap bubbles, ruby crystals, tray/wells/vignette/grain, hover, breathing
  hints/selection); spawn/clone/jump/convert animations; turn-gating on
  conversion; device-pixel crisp rendering; audio (sfx + background music, see
  Audio).
- **Pending:** none.
