# Shared branding & HUD spec

Reference for the elements every game in this repo shares: the **Xsolla wordmark**
and the three **HUD icon buttons** (sound, exit, fullscreen). Copy the values here
verbatim into a new game — they are the single source of truth, and all four
existing games were diffed against them.

Everything assumes the house convention: a **fixed 800×600 logical coordinate
space** (`CANVAS_W`/`CANVAS_H`), scaled to the display. All coordinates below are
logical pixels.

Games are deployed as standalone folders (iframe / Xsolla Overlay), so **nothing
here may be a cross-game import**. Duplicate the code into each game
deliberately; this file is what keeps the copies identical.

---

## 1. Xsolla wordmark

Source artwork: `common_assets/xsolla_logo/new-logo-dark.svg` — `viewBox="0 0 171 46"`,
five `<path>` elements, all filled `#80EAFF`.

Two details that matter:

- Paths 1 (the `O`) and 5 (the `A`) are `fill-rule="evenodd"`. **Fill all five with
  `evenodd`** — for the three without holes it is identical to nonzero, so one
  uniform call is both correct and simpler.
- The source `<clipPath>` rect exactly bounds the artwork (`169.997 × 36.9211` at
  `y = 4.53857`), so it is a no-op — skip it. But subtract that `4.53857` y-offset
  so a caller's `y` means "top of the visible artwork".

Artwork occupies **x 0…169.997, y 4.53857…41.4599** in the source viewBox.

### Placement (identical in all four games)

| Property | Value |
|---|---|
| Position | `x = 28`, `y = 16` (top-left of the visible artwork) |
| Width | `112` → renders ≈ 112 × 24.3 |
| Colour | `#80EAFF` |
| Screen | **Title screen only** — not the in-game header |

`28` is the house margin (`LAYOUT.MARGIN` in Game3) and mirrors the HUD button
column at `x = 742`, so logo and buttons sit symmetrically.

Check for collisions before committing to it — on every existing title screen the
region is clear, but centred titles and decorations vary per game.

### Path data

```
M73.6664 4.53827C84.0077 4.53827 92.1272 12.6598 92.1272 22.9991C92.1272 33.3383 84.0077 41.4599 73.6664 41.4599C63.3271 41.4599 55.2078 33.3383 55.2078 22.9991C55.2078 12.6598 63.3272 4.53829 73.6664 4.53827ZM73.6664 11.6001C67.4629 11.6001 62.7728 16.4937 62.7728 22.9991C62.7728 29.5065 67.4629 34.398 73.6664 34.398C79.872 34.398 84.5622 29.5065 84.5622 22.9991C84.5622 16.4937 79.872 11.6001 73.6664 11.6001Z
M18.0542 16.6417L26.3277 5.34541H35.0034L22.2521 22.2765L36.0119 40.6531H26.884L17.7546 28.3332L8.725 40.6531H0.00012207L13.5575 22.6895L0.605567 5.34541H9.68396L18.0542 16.6417Z
M42.9917 15.4836L49.9509 24.2107C51.4643 26.1266 52.1706 27.9419 52.1706 29.9091C52.1706 31.8763 51.4643 33.6917 49.9509 35.6097L45.9669 40.6531H36.9893L45.1088 30.2622L38.1987 21.5865C36.7367 19.7712 36.0304 18.005 36.0304 16.1404C36.0304 14.2225 36.7367 12.4584 38.1987 10.6925L42.7391 5.34541H51.5156L42.9917 15.4836Z
M118.379 40.6531H109.502L90.5358 5.34541H99.4151L118.379 40.6531Z
M116.976 5.34541L131.944 33.2089L146.393 5.34541H151.688L169.997 40.6531H127.065L108.101 5.34541H116.976ZM139.348 34.0962H158.385L148.875 15.1397L139.348 34.0962Z
```

### Canvas implementation

Preferred for canvas-drawn games: no asset file, no async load, pixel-exact at
any scale. **Build the `Path2D` objects once and cache them** — never per frame.

```js
const XSOLLA_LOGO_PATHS = [ /* the five d strings above */ ];
const XSOLLA_LOGO_W    = 169.997;   // artwork width in source units
const XSOLLA_LOGO_Y0   = 4.53857;   // artwork's top edge in source units
const XSOLLA_LOGO_FILL = '#80EAFF';
let xsollaLogoCache = null;

// (x, y) = top-left of the visible artwork; w = target width in logical px.
function drawXsollaLogo(ctx, x, y, w) {
  if (!xsollaLogoCache) xsollaLogoCache = XSOLLA_LOGO_PATHS.map(d => new Path2D(d));
  const s = w / XSOLLA_LOGO_W;
  ctx.save();
  ctx.translate(x, y - XSOLLA_LOGO_Y0 * s);
  ctx.scale(s, s);
  ctx.fillStyle = XSOLLA_LOGO_FILL;
  for (const p of xsollaLogoCache) ctx.fill(p, 'evenodd');
  ctx.restore();
}
```

### DOM implementation

For DOM-based title screens. The viewBox is cropped to the artwork so
`width: 112px` gives the right size with no offset maths:

```html
<div id="titleLogo"></div>
```
```css
#titleLogo { position: absolute; left: 28px; top: 16px; width: 112px; }
#titleLogo svg { width: 100%; height: auto; display: block; }
```
```js
titleLogo.innerHTML = `<svg viewBox="0 4.53857 169.997 36.9211" fill="none" aria-label="Xsolla" role="img">
  <path fill-rule="evenodd" clip-rule="evenodd" d="…path 1…" fill="#80EAFF"/>
  <path d="…path 2…" fill="#80EAFF"/>
  <path d="…path 3…" fill="#80EAFF"/>
  <path d="…path 4…" fill="#80EAFF"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="…path 5…" fill="#80EAFF"/>
</svg>`;
```

Inject the markup from JS rather than writing it into the HTML — see
[Gotchas](#5-gotchas).

---

## 2. HUD buttons — shared chrome

Three buttons: **sound**, **exit**, **fullscreen**, in that order.

### Geometry

| Property | Value |
|---|---|
| Size | 30 × 30 |
| Corner radius | 8 |
| Layout | vertical column, top-right |
| Right inset | 28 (`x = CANVAS_W - 28 - 30 = 742`) |
| `y` positions | sound `16`, exit `52`, fullscreen `88` (gap 6) |
| Icon centre | button centre — `(x + 15, y + 15)` |
| Icon nominal half-size | `s = 8` |

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
| Exit | — | Return to the title screen |
| Fullscreen | enter / exit | Toggle fullscreen (§4) |

Sound is deliberately **three**-state, not a boolean: players commonly want the
music off but keep the feedback sounds. The bright icon colour marks `on` only.

The buttons should stay live even when a game-over or win dialog is up — draw
them last so they sit above such overlays.

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

### Exit — power symbol

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
sync for free.

### CSS: a 4:3 box, uncapped in fullscreen

Size the game as a 4:3 box against viewport units with a cap, then lift the cap:

```css
#game { width: min(100vw, 133.3333vh, 1200px); aspect-ratio: 4 / 3; max-height: 900px; }
html:fullscreen #game { width: min(100vw, 133.3333vh); max-height: none; }
```

Centre it with flex so non-4:3 displays letterbox it. If a HUD column sits
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
  validator. **Inject all icon and logo markup from JS**, keeping the HTML
  `<svg>`-free.
- **`button[hidden]`** needs an explicit `display: none` rule whenever the button
  rule sets `display: flex`, which otherwise wins.
- A **30px SVG inside a 30px border-box button** overflows the 28px content box by
  1px per side. Harmless — all icon artwork stays within units ~7…23 — and it
  centres the glyph on the border box, matching the canvas version.
- **Hiding a middle button:** in a flex column, hiding it closes the gap for free.
  With absolute positioning you must reposition the ones below it.
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
| **Game1** Bubble Bopper | Buttons are DOM, in a column **outside** the frame; fixed 30px, don't scale with the game. Exit ends the run to the score screen rather than the title. | Clicking bubbles is the entire interaction — a button over the field swallows shots. |
| **Game2** Crowd Run | Buttons are DOM inside the frame. Sound and fullscreen show on the **title screen** too; exit only mid-run. | The frame is a `transform: scale()`-d DOM subtree, so DOM buttons scale with it and sit above the overlay title screen. |
| **Game3** Hexxagon | Canvas-drawn, gameplay screen only. | **Reference implementation** — match this. |
| **Game4** Cascadia | Buttons in a **horizontal row** (`x` 670 / 706 / 742, all `y = 16`). | Its header strip is only 64px tall; a second row would overlap the well — in Multiplayer, directly over P2's cells. |
