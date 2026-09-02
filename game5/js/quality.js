// quality.js — Adaptive render quality
//
// Frame time is sampled every frame into a rolling average. Sustained slowness steps
// the tier down; sustained headroom steps it back up. This is the safety net that
// keeps the game playable on a device slower than anything we tested on, without
// capping what a fast device gets to show.
//
// Every knob lives in C.QUALITY (constants.js). Renderers read Quality.get() and
// must tolerate it changing between frames.

const Quality = (() => {
  const order = C.QUALITY_ORDER;
  let index = 0;                      // start optimistic, measure, then adapt
  let tier = C.QUALITY[order[0]];

  const WINDOW_N = C.QUALITY_WINDOW;
  const samples = new Float32Array(WINDOW_N);
  let filled = 0, cursor = 0, sum = 0;

  let slowFrames = 0, fastFrames = 0;
  let warmup = C.QUALITY_WARMUP;
  let upCooldown = 0;                 // seconds until an upward step is allowed
  let onChange = null;

  function get()     { return tier; }
  function name()    { return order[index]; }
  function avgMs()   { return filled ? sum / filled : 0; }
  function setOnChange(fn) { onChange = fn; }

  function apply(next) {
    if (next === index) return;
    index = next;
    tier = C.QUALITY[order[index]];
    // A tier change invalidates the rolling average — the new tier's frame times
    // are not comparable to the old tier's, and mixing them causes oscillation.
    filled = 0; cursor = 0; sum = 0;
    slowFrames = 0; fastFrames = 0;
    if (onChange) onChange(tier, order[index]);
  }

  // dtMs: wall time for the frame just finished. `clamped` is true when the game
  // loop hit its dt ceiling, which means the tab was backgrounded or the process
  // stalled — that is not a rendering cost and must not trigger a downgrade.
  function sample(dtMs, clamped) {
    if (upCooldown > 0) upCooldown -= dtMs / 1000;

    if (clamped) { slowFrames = 0; fastFrames = 0; return; }
    if (warmup > 0) { warmup--; return; }

    if (filled < WINDOW_N) {
      sum += dtMs;
      samples[cursor] = dtMs;
      filled++;
    } else {
      sum += dtMs - samples[cursor];
      samples[cursor] = dtMs;
    }
    cursor = (cursor + 1) % WINDOW_N;
    if (filled < WINDOW_N) return;      // no verdict until the window is full

    const avg = sum / WINDOW_N;

    if (avg > C.QUALITY_DOWN_MS) {
      fastFrames = 0;
      if (++slowFrames >= C.QUALITY_DOWN_FRAMES && index < order.length - 1) {
        apply(index + 1);
        upCooldown = C.QUALITY_UP_COOLDOWN;
      }
    } else if (avg < C.QUALITY_UP_MS) {
      slowFrames = 0;
      if (++fastFrames >= C.QUALITY_UP_FRAMES && index > 0 && upCooldown <= 0) {
        apply(index - 1);
        upCooldown = C.QUALITY_UP_COOLDOWN;
      }
    } else {
      slowFrames = 0; fastFrames = 0;
    }
  }

  // Lets ?quality=low pin a tier for testing without waiting for the sampler.
  function init() {
    try {
      const m = /[?&]quality=(high|med|low)/.exec(location.search);
      if (m) {
        const i = order.indexOf(m[1]);
        if (i >= 0) { index = i; tier = C.QUALITY[order[i]]; warmup = Infinity; }
      }
    } catch (e) {}
  }

  return { init, sample, get, name, avgMs, setOnChange };
})();
