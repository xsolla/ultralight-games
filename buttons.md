# Shared buttons spec

Reference for the three **icon buttons** every game in this repo shares: **sound**,
**exit** (power symbol) and **fullscreen**. Copy the values here verbatim into a
new game — they are the single source of truth, and all four existing games were
diffed against them.

Everything assumes the house convention: a **fixed 800×600 logical coordinate
space** (`CANVAS_W`/`CANVAS_H`), scaled to the display. All coordinates below are
logical pixels.

Games are deployed as standalone folders (iframe / Xsolla Overlay), so **nothing
here may be a cross-game import**. Duplicate the code into each game
deliberately; this file is what keeps the copies identical.

---

## 1. Which buttons appear where

| Button | Title screen | HUD (in-game) |
|---|---|---|
| Sound | ✅ | ✅ |
| Fullscreen | ✅ | ✅ |
| Exit (power) | ❌ | ✅ |

- **Sound** and **fullscreen** are present on **both** the title screen and the
  HUD, so the player can set audio and display mode before starting a run.
- The **exit / power** button is shown **only on the HUD**. On the title screen
  there is nothing to exit to, so it is hidden.
- The column stays contiguous: when exit is hidden, fullscreen moves **up into
  exit's slot** (`y = 52`) rather than leaving a gap — see §2.

---

## 2. Shared chrome

Order in the column: **sound**, **exit**, **fullscreen**.

### Geometry

| Property | Value |
|---|---|
| Size | 30 × 30 |
| Corner radius | 8 |
| Layout | vertical column, top-right |
| Right inset | 28 (`x = CANVAS_W - 28 - 30 = 742`) |
| `y` positions — HUD | sound `16`, exit `52`, fullscreen `88` (gap 6) |
| `y` positions — title | sound `16`, fullscreen `52` |
| Icon centre | button centre — `(x + 15, y + 15)` |
| Icon nominal half-size | `s = 8` |

`28` is the house margin (`LAYOUT.MARGIN` in game3).

### Colours

| | rest | hover |
|---|---|---|
| Fill | `rgba(255,255,255,0.045)` | `rgba(255,255,255,0.09)` |
| Stroke | `rgba(150,180,220,0.30)` | `rgba(150,180,220,0.55)` |

`lineWidth: 1`. No pressed state. `cursor: pointer` while hovered.

**Icon colours:** `#e6eef8` when bright (sound in the `on` state only),
`#8aa0bd` otherwise — exit and fullscreen are always dim.

**Icon stroke widths:** sound `1.6`; exit and fullscreen `1.8`. Round caps and
joins throughout.

### Behaviour contract

| Button | States | Action |
|---|---|---|
| Sound | `on` → `musicoff` → `off` → `on` | `on` = music + sfx; `musicoff` = sfx only; `off` = silent |
| Exit | — | Return to the title screen (HUD only) |
| Fullscreen | enter / exit | Toggle fullscreen (§4) |

Sound is deliberately **three**-state, not a boolean: players commonly want the
music off but keep the feedback sounds. The bright icon colour marks `on` only.
The sound state carries over between title screen and HUD — it is one setting,
not two.

The buttons should stay live even when a game-over or win dialog is up — draw
them last so they sit above such overlays.

### Showing / hiding exit

DOM version — toggle `hidden` and re-lay the column:

```js
function layoutButtonColumn() {
  fullscreenBtn.style.top = exitBtn.hidden ? '52px' : '88px';
}
function showExit() { exitBtn.hidden = false; layoutButtonColumn(); }  // entering gameplay
function hideExit() { exitBtn.hidden = true;  layoutButtonColumn(); }  // back to title
```

Canvas version — derive the layout from the current screen each frame and use
the same rects for hit-testing:

```js
function buttonRects(onTitle) {
  const x = CANVAS_W - 28 - 30;
  return onTitle
    ? { sound: { x, y: 16 }, fullscreen: { x, y: 52 } }
    : { sound: { x, y: 16 }, exit: { x, y: 52 }, fullscreen: { x, y: 88 } };
}
```

---

## 3. Icon geometry

Given identically in both flavours. The SVG uses a **30-unit viewBox at 30px, so
1 unit = 1 logical px** — meaning every number below is the canvas arithmetic
already evaluated for `cx = cy = 15, s = 8`. Keep them in sync.

### Sound — `on`

Filled 6-point speaker body, plus two arcs.

```js
// speaker (fill)
moveTo(cx - s*0.85, cy - s*0.25); lineTo(cx - s*0.5,  cy - s*0.25);
lineTo(cx - s*0.05, cy - s*0.6);  lineTo(cx - s*0.05, cy + s*0.6);
lineTo(cx - s*0.5,  cy + s*0.25); lineTo(cx - s*0.85, cy + s*0.25); closePath();
// waves (stroke)
arc(cx - s*0.05, cy, s*0.55, -0.7, 0.7);
arc(cx - s*0.05, cy, s*0.95, -0.7, 0.7);
```
```svg
<path d="M8.2 13 H11 L14.6 10.2 V19.8 L11 17 H8.2 Z" fill="currentColor"/>
<path d="M17.965 12.165 A4.4 4.4 0 0 1 17.965 17.835" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
<path d="M20.413 10.104 A7.6 7.6 0 0 1 20.413 19.896" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
```

### Sound — `off`

Same speaker body, plus an X to its right.

```js
moveTo(cx + s*0.2, cy - s*0.5); lineTo(cx + s*0.9, cy + s*0.5);
moveTo(cx + s*0.9, cy - s*0.5); lineTo(cx + s*0.2, cy + s*0.5);
```
```svg
<path d="M8.2 13 H11 L14.6 10.2 V19.8 L11 17 H8.2 Z" fill="currentColor"/>
<path d="M16.6 11 L22.2 19 M22.2 11 L16.6 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
```

### Sound — `musicoff`

A slashed musical note (no speaker). The slash is the **same** state colour, not
red — one colour per state.

```js
const nx = cx - s*0.15;
ellipse(nx - s*0.28, cy + s*0.5, s*0.3, s*0.22, -0.4, 0, TAU);  // note head, fill
moveTo(nx, cy + s*0.5); lineTo(nx, cy - s*0.6); lineTo(nx + s*0.5, cy - s*0.4);  // stem + flag
moveTo(cx - s*0.9, cy + s*0.9); lineTo(cx + s*0.9, cy - s*0.9);  // slash
```
```svg
<ellipse cx="11.56" cy="19" rx="2.4" ry="1.76" transform="rotate(-22.918 11.56 19)" fill="currentColor"/>
<path d="M13.8 19 L13.8 10.2 L17.8 11.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7.8 22.2 L22.2 7.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
```

### Exit — power symbol (HUD only)

Ring of radius `0.8s` with an **84° gap centred at the top** (arc −48° → 228°,
a 276° sweep), plus a vertical bar through it.

```js
arc(cx, cy, s*0.8, (-90 + 42) * Math.PI/180, (-90 - 42) * Math.PI/180 + TAU, false);
moveTo(cx, cy - s*1.05); lineTo(cx, cy - s*0.05);
```
```svg
<path d="M19.282 10.244 A6.4 6.4 0 1 1 10.718 10.244"/>
<path d="M15 6.6 L15 14.6"/>
```
(`stroke-width="1.8"`, `stroke-linecap="round"`, `fill="none"`.)

### Fullscreen — corner brackets

Four L-shaped brackets, one per quadrant. **Corners on the outside with arms
reaching in = enter; corners inset with arms reaching out to the edges = exit.**
Extent `a = 0.8s` matches the power ring, so all three glyphs read at one weight.

```js
const a = s * 0.8, b = s * 0.42;
for (const [sx, sy] of [[-1,-1], [1,-1], [1,1], [-1,1]]) {
  if (active) {   // exit
    moveTo(cx + sx*a,       cy + sy*(a - b));
    lineTo(cx + sx*(a - b), cy + sy*(a - b));
    lineTo(cx + sx*(a - b), cy + sy*a);
  } else {        // enter
    moveTo(cx + sx*(a - b), cy + sy*a);
    lineTo(cx + sx*a,       cy + sy*a);
    lineTo(cx + sx*a,       cy + sy*(a - b));
  }
}
```
```svg
<!-- enter -->
<path d="M11.96 8.6 H8.6 V11.96"/>  <path d="M18.04 8.6 H21.4 V11.96"/>
<path d="M18.04 21.4 H21.4 V18.04"/> <path d="M11.96 21.4 H8.6 V18.04"/>
<!-- exit -->
<path d="M8.6 11.96 H11.96 V8.6"/>  <path d="M21.4 11.96 H18.04 V8.6"/>
<path d="M21.4 18.04 H18.04 V21.4"/> <path d="M8.6 18.04 H11.96 V21.4"/>
```
(`stroke-width="1.8"`, round cap and join, `fill="none"`.)

### DOM chrome (when the buttons are `<button>` elements)

```css
button {
  width: 30px; height: 30px;                 /* box-sizing: border-box */
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  color: #8aa0bd;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(150, 180, 220, 0.30);
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
button:hover { background: rgba(255,255,255,0.09); border-color: rgba(150,180,220,0.55); }
button[hidden] { display: none; }            /* required — display:flex defeats [hidden] */
button svg { width: 30px; height: 30px; flex: none; display: block; }
```

---

## 4. Fullscreen

### Toggle the `<html>` element — not the canvas, not an inner wrapper

The UA stylesheet forces a fullscreen element to `width: 100% !important;
height: 100% !important`, which breaks a fixed-size game box and any
transform-based scaling built on it. Fullscreening `<html>` instead makes the
*viewport* the screen, so viewport-unit CSS does the resizing and the existing
coordinate mapping is untouched.

```js
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

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
```

**Read the state live from `document.fullscreenElement`** rather than tracking it
in a field — then leaving via <kbd>Esc</kbd> or <kbd>F11</kbd> keeps the glyph in
sync for free, on both the title screen and the HUD.

### CSS: a 4:3 box, uncapped in fullscreen

Size the game as a 4:3 box against viewport units with a cap, then lift the cap:

```css
#game { width: min(100vw, 133.3333vh, 1200px); aspect-ratio: 4 / 3; max-height: 900px; }
html:fullscreen #game { width: min(100vw, 133.3333vh); max-height: none; }
```

Centre it with flex so non-4:3 displays letterbox it. If a button column sits
outside the frame, subtract its width from the budget:
`min(calc(100vw - 56px), 133.3333vh, 1200px)`.

### Re-measure on change — twice

`fullscreenchange` can fire **before layout has settled** on the new box. Without
the deferred second pass, exiting leaves the canvas backing store at its
fullscreen size:

```js
const onFullscreenChange = () => {
  updateFullscreenButton();
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);
};
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);
window.addEventListener('resize', resizeCanvas);
```

### Iframes

`requestFullscreen()` **fails silently unless the embedding page sets
`allow="fullscreen"` on the `<iframe>`**. That covers the repo's own hub and
`iframe-test.html` harnesses, and any external host (e.g. the Overlay). Budget
for the button being inert where that permission is missing.

### Device-pixel backing store (needed for fullscreen to look good)

Without this the game is an upscale of a fixed 800×600 bitmap and fullscreen
looks soft. Keep the element CSS-sized; size only the *backing store*:

```js
const MAX_BACKING_SCALE = 2;   // cap: past 2x, cost outweighs sharpness

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = Math.min(((rect.width || CANVAS_W) / CANVAS_W) * dpr, MAX_BACKING_SCALE);
  const bw = Math.max(1, Math.round(CANVAS_W * k));
  const bh = Math.max(1, Math.round(CANVAS_H * k));
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  // Setting width/height resets the context, so (re)apply the logical scale.
  ctx.setTransform(bw / CANVAS_W, 0, 0, bh / CANVAS_H, 0, 0);
}
```

**No drawing code changes are needed** — but confirm these four preconditions
first, or the base transform will misbehave:

1. Nothing resets the transform. Every `ctx.scale`/`translate`/`rotate` must be
   inside a `save()`/`restore()` pair.
2. No gradient or pattern is cached across frames (setting `canvas.width` resets
   the context).
3. `clearRect` uses logical coordinates (`0, 0, CANVAS_W, CANVAS_H`).
4. Pointer mapping derives from `getBoundingClientRect()`, not a hardcoded scale.

All four games satisfied these unchanged; a `grep` for
`setTransform|resetTransform|getImageData|clearRect|canvas.width` is enough to
check a new one.

---

## 5. Gotchas

- **`<svg>` + `<script>` in one HTML file** is flagged as XSS by the mini-app
  validator. **Inject all icon markup from JS**, keeping the HTML `<svg>`-free.
- **`button[hidden]`** needs an explicit `display: none` rule whenever the button
  rule sets `display: flex`, which otherwise wins.
- A **30px SVG inside a 30px border-box button** overflows the 28px content box by
  1px per side. Harmless — all icon artwork stays within units ~7…23 — and it
  centres the glyph on the border box, matching the canvas version.
- **Hiding exit on the title screen:** in a flex column, hiding it closes the gap
  for free. With absolute positioning you must move fullscreen from `88` to `52`
  yourself (§2).
- **Hit-test against the same rects you draw.** In a canvas game, a click at
  `y = 52` on the title screen must hit fullscreen, not a hidden exit.
- If the title screen is a DOM overlay, make sure the buttons sit **above** it
  (z-index) so they stay clickable there.
- Don't cache `Path2D` or gradients across a `canvas.width` assignment.
- `http.server` sends no `Cache-Control`; **hard-reload (Ctrl+Shift+R)** when
  verifying changes, or Chrome will run stale JS/CSS.

---

## 6. Per-game deviations (and why)

The spec above is the default. These games deviate deliberately — match the
*appearance* values regardless, and only diverge on layout when there is a
comparable reason.

| Game | Deviation | Reason |
|---|---|---|
| **game1** Bubble Bopper | Buttons are DOM, in a column **outside** the frame; fixed 30px, don't scale with the game. Exit ends the run to the score screen rather than the title. | Clicking bubbles is the entire interaction — a button over the field swallows shots. |
| **game2** Crowd Run | None on visibility — sound and fullscreen on the title screen, exit only mid-run, fullscreen moving up into exit's slot. Buttons are DOM inside the frame. | The frame is a `transform: scale()`-d DOM subtree, so DOM buttons scale with it and sit above the overlay title screen. |
| **game3** Hexxagon | Canvas-drawn; buttons currently on the gameplay screen only. | **Reference implementation** for drawing — match this. Sound and fullscreen still need adding to its title screen. |
| **game4** Cascadia | Buttons in a **horizontal row** (`x` 670 / 706 / 742, all `y = 16`). On the title screen, without exit, use `x` 706 / 742 so fullscreen stays at the right edge. | Its header strip is only 64px tall; a second row would overlap the well — in Multiplayer, directly over P2's cells. |
