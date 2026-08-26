# HELIX FALL — Game Design & Tech Architecture

## Concept
An endless arcade game where a glowing ball falls down an infinitely rotating helix tower. The player spins the tower left or right to guide the ball through gaps in the helix rings, avoid deadly red segments, collect power-ups, and survive as long as possible. Speed increases over time, creating escalating tension.

## Core Loop
1. Ball falls at constant (escalating) speed
2. Player rotates tower left/right (keyboard arrows / touch swipe / mouse drag)
3. Helix rings scroll upward as ball falls
4. Ball passes through gaps (safe segments) — score increases
5. Ball hits a red/deadly segment — game over
6. Power-ups appear occasionally on rings for bonus effects

## Game Modes
Single player, no AI needed. Three difficulty modes on title screen:
- **Easy**: Slower speed escalation, wider gaps, more power-ups
- **Normal**: Balanced
- **Hard**: Fast escalation, narrow gaps, fewer power-ups, red segments can move

## Screens
1. **Title Screen** — Game logo, animated helix preview, difficulty selector, Play button, best score
2. **Gameplay Screen** — Helix tower, falling ball, HUD overlay
3. **Game Over Screen** — Score, best score, Play Again / Quit buttons (overlaid on gameplay screen)

## Visual Identity
- Dark background with subtle radial gradient (deep navy to black)
- Ball: bright white/gold with glowing trail (canvas shadow blur)
- Helix rings: colored arcs drawn with canvas arc(), color shifts as score increases (hue rotation over time)
- Safe segments: vibrant cyan/teal with glow
- Deadly segments: deep red/crimson with glow
- Power-up segments: gold/yellow pulse
- Particle burst on passing through a ring
- Screen shake on near-miss
- Score counter: large, clean, glowing font

## HUD Elements (always visible during gameplay)
- Score (top center)
- Fullscreen toggle button (top right)
- Sound button: cycles On → Music Off → Off (top right)
- Quit button: returns to title screen (top right)

## Tech Architecture

### Files
```
index.html          — Entry point, canvas setup, screen routing
js/
  constants.js      — All tunable game settings
  game.js           — Main game loop, state machine
  helix.js          — Helix tower: ring generation, rotation, rendering
  ball.js           — Ball physics, trail, collision detection
  particles.js      — Particle system for visual effects
  hud.js            — HUD rendering and button logic
  title.js          — Title screen rendering and logic
  input.js          — Keyboard, touch, mouse input handling
  audio.js          — Web Audio API sound/music generation
```

### Scaling
- Native resolution: 405 × 720 (9:16)
- Canvas scales to fill iframe using CSS transform: scale()
- Letterboxing with centered alignment if aspect ratio differs
- Fullscreen uses Fullscreen API, maintains aspect ratio

### Rendering
- Single `<canvas>` element
- requestAnimationFrame loop
- Delta-time based physics for consistent speed across framerates

### State Machine
States: `TITLE` → `PLAYING` → `GAMEOVER` → `TITLE`

### Helix Geometry
- Tower is centered on canvas horizontally
- Rings are drawn as ellipses (top-down perspective foreshortening)
- Each ring has N segments; some are gaps, one or more are deadly, optionally one is power-up
- Tower rotation angle is shared state — all rings rotate together
- Rings scroll upward in screen space as ball falls (ball is fixed vertically near center)
- Ring Y positions wrap/recycle from bottom to top (object pooling)

### Collision Detection
- Ball occupies a fixed X,Y point (center-bottom of screen area)
- Each ring is checked when its Y crosses the ball's Y
- Angular position of ball relative to tower determines which segment it hits
- Segment type determines outcome: pass / die / power-up

### Difficulty Scaling
- Speed starts at INITIAL_FALL_SPEED, increases by SPEED_INCREMENT every SPEED_INTERVAL ms
- Capped at MAX_FALL_SPEED
- Gap width decreases every N rings passed (floored at MIN_GAP_SIZE)
- Hard mode: deadly segments slowly rotate independently

### Power-ups
- **Shield**: Next deadly hit is blocked (ball flashes)
- **Slow**: Speed temporarily reduced
- **Multiplier**: 2x score for 5 seconds

## Tuning (see constants.js)
All speeds, sizes, colors, timing values live in constants.js for easy finetuning.
