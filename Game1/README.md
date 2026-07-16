# Bubble Bopper

A vanilla HTML5 Canvas bubble-popping arcade game built for Xsolla. No frameworks, no build step — runs directly in the browser as static files and works inside an iframe.

---

## Tech Stack

| Concern | Solution |
|---|---|
| Rendering | HTML5 Canvas 2D API |
| Game loop | `requestAnimationFrame` + delta-time updates |
| State | Single `Game` object — no globals beyond it |
| Persistence | `localStorage` (key: `bubbleBopper_scores`) |
| Audio | `HTMLAudioElement` with `cloneNode()` per play call |
| Deployment | Static files, no build step |

---

## File Structure

```
index.html            — Shell: canvas element + script tag
game.js               — All game logic (~1400 lines)
style.css             — CSS scaling and layout
iframe-test.html      — Test harness: 400×300 collapsed, 800×600 expanded on click
assets/
  sounds/             — WAV/MP3 sound effects
  bgm/                — bgm.ogg background music
```

---

## Canvas & Rendering

- **Native resolution:** 800×600 (fixed — do not change game logic coordinates)
- **Scaling:** CSS `width: 100%` on the canvas element; the `.game-wrapper` div caps at 800px wide
- **Pixel quality:** `image-rendering: crisp-edges` keeps it sharp when CSS-scaled
- All collision, positioning, and spawn logic operates in 800×600 coordinates only

---

## Game Modes

| Mode | Button label | End condition |
|---|---|---|
| `flash` | Flash Pop | 30-second countdown reaches zero |
| `sniper` | Sniper Pop | 25 total clicks used up (idle penalty: −1 click per 10 s of inactivity) |
| `zen` | Zen Pop | Alive bubble count exceeds 100 |

---

## Bubble Types

### Blue (common)
- Direct click → pops immediately, triggers a small explosion around it
- Explosions chain-react to nearby bubbles

### Red (appears after 5 s)
- Direct click → pulses visually only, does **not** pop
- Only destroyed by a chain explosion from another bubble
- Produces a large explosion when it goes off

### Purple (appears after 10 s)
- Carries a direction arrow set randomly at spawn
- Direct click → launches it flying in the arrow direction, bouncing off walls
- Collides with another bubble → large explosion (same radius as red)
- Hit by an explosion → redirected randomly and bounced, **not** destroyed

---

## Audio System

Sound effects use `HTMLAudioElement.cloneNode()` so rapid chain pops don't cut each other off. Background music streams from `assets/bgm/bgm.ogg` with looping enabled.

| Event | Sound file |
|---|---|
| Blue bubble pop | `pop_sound1–5.wav` (random) |
| Red bubble explosion | `pop_bomb_sound.wav` |
| Purple bubble collision | `pop_purple_sound.wav` |
| UI button click | `pop_sound1–5.wav` (random) |
| Background music | `bgm.ogg` (loops during play, 1.5 s fade on return to title) |

The HUD sound-toggle button mutes both SFX and BGM simultaneously.

---

## HUD Elements (during gameplay)

| Element | Position | Modes |
|---|---|---|
| Score | Top-right | All |
| Countdown timer | Top-left | Flash only |
| Clicks remaining + idle gauge | Top-left | Sniper only |
| Sound toggle button | Right edge, below score | All |
| End game button | Right edge, below sound toggle | All |

---

## Balance Configuration

All tunable values are constants at the top of `game.js`:

```js
// Bubble sizes (px radius)
BUBBLE_BLUE_RADIUS   = 28
BUBBLE_RED_RADIUS    = 24
BUBBLE_PURPLE_RADIUS = 20

// Drift speeds (px/s)
BUBBLE_BLUE_DRIFT_SPEED   = 60
BUBBLE_RED_DRIFT_SPEED    = 50
BUBBLE_PURPLE_DRIFT_SPEED = 60
BUBBLE_PURPLE_FLY_SPEED   = 120   // speed when launched by click
BUBBLE_SPEED_VARIANCE     = 0.2   // ±20 % randomisation at spawn

// Explosion radii (multiplier × bubble radius)
BLUE_EXPLODE_MULT   = 2.0
RED_EXPLODE_MULT    = 5.0
PURPLE_EXPLODE_MULT = 5.8

// Spawn timing
SPAWN_INITIAL           = 15     // bubbles pre-placed at game start
SPAWN_INTERVAL_BASE     = 750    // ms between spawns
SPAWN_INTERVAL_VARIANCE = 100    // ms random ±
SPAWN_ACCEL             = -10    // ms/s interval reduction (Flash mode only)

// Bubble type unlock times (seconds from game start)
RED_APPEAR_TIME    = 5
PURPLE_APPEAR_TIME = 10

// Spawn chances per event (once type is unlocked)
RED_SPAWN_CHANCE    = 0.15
PURPLE_SPAWN_CHANCE = 0.10

// Mode limits
ZEN_BUBBLE_LIMIT   = 100   // Zen ends when alive count exceeds this
SNIPER_CLICK_LIMIT = 25
SNIPER_IDLE_TIMEOUT = 10   // seconds before idle click penalty
```

---

## High Scores

Top 3 scores are stored per mode in `localStorage`. A newly set record is highlighted in red on the records screen. Scores persist across sessions in the same browser.

---

## iframe Embedding

The game is self-contained and has no `parent`/`postMessage` dependencies. Embed at any size — the CSS scaling keeps it playable.

```html
<iframe src="index.html" width="800" height="600" scrolling="no"></iframe>
```

`iframe-test.html` demonstrates a collapsed 400×300 preview that expands to a centered 800×600 overlay on click (backdrop click collapses it back).

---

## Quest Ideas

The following quests can be implemented as in-game challenges or external achievement conditions. Each includes a measurable trigger suitable for tracking.

### Beginner Quests

| Quest | Task | Suggested reward |
|---|---|---|
| **First Pop** | Pop your first bubble | Unlock Flash Pop mode |
| **Chain Reaction** | Trigger a chain that pops 3 or more bubbles at once | +10 bonus score |
| **Bubble Buster** | Pop 50 bubbles across any number of games | Title: "Buster" |
| **Red Alert** | Destroy a red bubble for the first time | Unlock Sniper Pop mode |
| **Purple Rider** | Launch a purple bubble for the first time | Cosmetic trail colour change |

### Intermediate Quests

| Quest | Task | Suggested reward |
|---|---|---|
| **Sharpshooter** | Complete Sniper Pop without missing a single click (all 25 clicks hit a bubble) | Gold crosshair skin |
| **Demolition Derby** | Trigger a chain reaction that pops 8+ bubbles in one explosion | "Demolition" badge |
| **Speed Demon** | Score 30+ in Flash Pop | Leaderboard star |
| **Zen Master** | Survive 90 seconds in Zen Pop | Background colour theme unlock |
| **Purple Pinball** | Launch a purple bubble that bounces off 3 walls before hitting another bubble | Particle trail effect |

### Advanced Quests

| Quest | Task | Suggested reward |
|---|---|---|
| **Perfect Flash** | Score 60+ in a single Flash Pop game | Animated title screen effect |
| **No Touch** | Complete a Zen Pop session scoring 20+ without ever directly clicking a blue bubble (chain pops only) | Secret "Ghost" title |
| **Red Collector** | Destroy 10 red bubbles in a single game (any mode) | Red explosion colour variant |
| **Cascade King** | Trigger a single chain that pops 15+ bubbles at once | Crown icon on score HUD |
| **Clockwork** | Score 50+ in Flash Pop with 15+ seconds still remaining | Golden timer display |

### Social / Meta Quests

| Quest | Task | Suggested reward |
|---|---|---|
| **Top of the Charts** | Hold the #1 score in all three modes simultaneously | Trophy icon on title screen |
| **Triple Crown** | Complete all three modes and place in the top 3 on each leaderboard | Animated background on title |
| **Daily Pop** | Play at least one game on 5 different calendar days | Persistent streak counter |
| **Improvement Arc** | Beat your own previous high score 3 times in a row (same mode) | Score history chart unlock |

---

## Development Notes

- The game targets **60 FPS** on mid-range hardware; all movement uses `dt`-based updates
- Canvas is never resized at runtime — resolution stays 800×600 regardless of display size
- Collision detection uses circle–circle distance checks (no physics engine)
- All game state resets cleanly on each `startGame()` call, making the object safe to reuse across sessions
