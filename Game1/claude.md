\# Xsolla Bubble Bopper



\## Stack

\- Vanilla HTML5 Canvas, no framework

\- Single index.html, deployable as static files

\- Save records locally (3 best results)

\- Must work standalone inside an iframe (no parent-window dependencies)



\## Constraints

\- 60 FPS target on mid range PC or Mac

\- All game state in one Game object, no globals beyond it

\- No build step — files run directly in the browser



\## Tech data

\## Canvas \& Rendering
- Native resolution: 800×600 (fixed, do not change)
- Scaling: Use CSS hybrid approach (Use CSS scaling as the default, but cap the max size)
- Native resolution: 800×600 (fixed, do not change)
- Scaling: Use CSS hybrid approach
- Canvas draws at 800×600 natively
- CSS scales it responsively on smaller screens (100% width, object-fit: contain)
- Cap max size at 1200×900 on large screens (via @media query)
- Use `image-rendering: crisp-edges` to keep it sharp when scaled
- All game logic, collision, and positioning based on 800×600 coordinates only
- Do NOT implement dynamic canvas resizing or responsive canvas.width/height



\## Game rules (canonical)

\- Game features soap bubbles of three types: blue-green (usual), red, and purple. At game start, only blue-green bubbles appear on the field.

\- Soap bubbles drift randomly, reflecting from field edges

\- Soap bubbles appear with a slightly increasing speed if game runs in timer mode and with constant speed if game is in zen mode

\- Blue-green bubbles: pop directly when tapped/clicked, causing a small explosion around them.

\- Explosions trigger other bubbles within their radius to explode (chain reaction).

\- Red bubbles: rarer, do not pop when directly touched – only pulse momentarily. They explode only when reached by an explosion from another bubbles, producing a much larger explosion that can pop many surrounding balloons.

\- Purple bubbles: have a direction indicator pointing randomly at spawn. When caught in an explosion, they do not explode; instead, they randomly change direction and fly in a straight line until hitting another bubble or the field boundary. On collision, they pop with a large explosion identical to red bubbles.

\- 1 pop = 1 score

\- Modes: Timed (60s default), Clicks (25 clicks, no time limit) and Zen (endless)



\## Conventions

\- Use requestAnimationFrame, delta-time updates

\- Collision: simple circle-circle distance checks

\- Keep all balance numbers tunable via constants at top of game.js



\## Initial Balance


\- Initial number of bubbles on game start: 15

\- New bubble appearance rate: One new bubble per 750 milliseconds plus/minus random(0-100) milliseconds

\- New bubble appearance rate acceleration: -10 milliseconds per second

\- Red bubble start appearing on : 5th second 

\- Purple bubble start appearing on : 10th second 

\- Blue bubble explode radius: x1.5 of the bubble's size

\- Red bubble explode radius: x3.0 of the bubble's size

\- Purple bubble explode radius: x2.8 of the bubble's size

\- Also add these parameters and set their initial values yourself: Blue bubble size, Red bubble size, Purple bubble size (initially make all thee the same), Blue bubble drift speed, Red bubble drift speed, Purple bubble drift speed (initially make all thee the same) and Purple bubble directional fly speed (initially make to 2x from drift speed. 