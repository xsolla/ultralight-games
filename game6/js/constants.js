// ============================================================================
// constants.js — cross-cutting tunables (canvas size, palette, timings).
// Subsystem-local knobs live at the top of their own module instead: star
// layers in ambiance.js, movement/turbo in player.js, frame rects in atlas.js.
// All positioning assumes the fixed 360x640 logical canvas.
// ============================================================================

const CANVAS_W = 360;
const CANVAS_H = 640;

// Backing store cap. devicePixelRatio is clamped to this, and styles.css caps
// the element at 540px wide, so the backing store never exceeds 1080x1920 —
// a 3x scale over logical space, which is where the ship sprites sit at ~1:1
// with their atlas pixels. See the note in styles.css.
const MAX_DPR = 2;

// Playfield inset the ship cannot leave, in logical px. Generous at the bottom
// so the ship is never hidden under a thumb on touch.
const PLAYFIELD = { top: 28, bottom: 16, side: 6 };

// ---- Palette ---------------------------------------------------------------
const COLORS = {
  // The field is uniformly dark top to bottom. These two are close together on
  // purpose: enough vertical variation that the background isn't a dead flat
  // fill, but not enough to read as the screen being split into a lighter half
  // and a darker one. Keep them within a few RGB steps of each other.
  bgTop: '#070b16',       // deep space, top of the gradient
  bgBottom: '#04060b',    // near-black at the bottom

  star: '255, 255, 255',       // "r, g, b" — alpha composed per star
  starWarm: '255, 232, 190',   // a minority of stars are warm-tinted
  starCool: '190, 224, 255',

  hudText: '#e6eef8',
  hudDim: '#7d90ad',
  hudPanel: 'rgba(10, 18, 34, 0.55)',
  hudStroke: 'rgba(150, 180, 220, 0.28)',

  turbo: '#ffd166',
  turboTrack: 'rgba(255, 209, 102, 0.18)',

  // The score readout is an ECG, so it is monitor-green — and a green nothing
  // else in the HUD uses, because the trace has to read as a separate
  // instrument from the armour bar it sits beside.
  score: '#8ef2c8',
  scoreTrace: 'rgba(142, 242, 200, 0.30)',   // the trace at rest, between beats
  scoreFlat: 'rgba(142, 242, 200, 0.18)',    // ...and flatlined, once dead

  armor: '#7fd4ff',                        // a banked, fully intact armour layer
  armorLive: '#ffb347',                    // the layer currently being chewed through
  armorTrack: 'rgba(127, 212, 255, 0.15)', // a spent hit inside a slot
  // Outline around each of the five level slots, lit or not. Without it a bar
  // that is nearly empty has almost nothing left to see and the player loses the
  // sense of how much is missing — the ceiling has to stay visible when the
  // contents do not.
  armorCell: 'rgba(127, 212, 255, 0.22)',
};

// ---- Animation timings (ms) ------------------------------------------------
const ANIM = {
  SHIP_FRAME_MS: 90,   // per engine-animation frame during normal flight
  TURBO_FRAME_MS: 55,  // faster flicker while the turbo burst is active
  SHIP_SWAP_MS: 220,   // scale/flash punch when the ship is swapped
  BULLET_FRAME_MS: 60, // per projectile-particle frame; fast enough to crackle
};

// Font stack for every piece of canvas text — no web fonts anywhere.
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// ---- Sound state -----------------------------------------------------------
// The HUD's sound button is deliberately THREE-state rather than a boolean
// (branding.md §2): players commonly want the music off but the feedback sounds
// kept. 'on' = music + sfx, 'musicoff' = sfx only, 'off' = silent, and the
// button walks this cycle. Nothing reads it yet — there is no audio.js — but the
// state is the contract that module will read, and the icon already shows it.
const SOUND_CYCLE = { on: 'musicoff', musicoff: 'off', off: 'on' };

// ---- Shared math -----------------------------------------------------------
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
