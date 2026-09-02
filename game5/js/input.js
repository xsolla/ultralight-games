// input.js — Keyboard, mouse, touch input handling

const Input = (() => {
  let canvas = null;

  const state = {
    left: false,
    right: false,
    mouseDragging: false,
    mouseLastX: null,
    touchLastX: null,
    touchDeltaX: 0,
    mouseDeltaX: 0,
    // Pointer travel since the current press began. A press that moved further
    // than DRAG_CLICK_THRESHOLD is a rotate-drag, not a tap on a button.
    dragDistance: 0,
  };

  function init() {
    canvas = document.getElementById('gameCanvas');

    window.addEventListener('keydown', e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.right = true;
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') state.right = false;
    });

    // Touch
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      state.touchLastX  = e.touches[0].clientX;
      state.touchDeltaX = 0;
      state.dragDistance = 0;
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const x = e.touches[0].clientX;
      state.touchDeltaX = x - state.touchLastX;
      state.touchLastX  = x;
      state.dragDistance += Math.abs(state.touchDeltaX);
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      state.touchDeltaX = 0;
      state.touchLastX  = null;
    }, { passive: false });

    // Mouse drag
    canvas.addEventListener('mousedown', e => {
      state.mouseDragging = true;
      state.mouseLastX    = e.clientX;
      state.mouseDeltaX   = 0;
      state.dragDistance  = 0;
    });
    window.addEventListener('mousemove', e => {
      if (!state.mouseDragging) return;
      state.mouseDeltaX = e.clientX - state.mouseLastX;
      state.mouseLastX  = e.clientX;
      state.dragDistance += Math.abs(state.mouseDeltaX);
    });
    window.addEventListener('mouseup', () => {
      state.mouseDragging = false;
      state.mouseDeltaX   = 0;
    });
  }

  // Returns rotation delta in radians for this frame
  function getRotationDelta(dt) {
    let delta = 0;
    if (state.left)  delta -= C.ROTATE_SPEED_KB * dt;
    if (state.right) delta += C.ROTATE_SPEED_KB * dt;

    // Pointer deltas arrive in client px; convert to canvas px via the CSS scale.
    // Read from Game's cached value — calling getBoundingClientRect() here forces a
    // style/layout flush on every single frame.
    const scale = Game.getScale();
    delta += ((state.touchDeltaX + state.mouseDeltaX) / scale) * C.ROTATE_SPEED_TOUCH;

    // consume pointer deltas each frame
    state.touchDeltaX = 0;
    state.mouseDeltaX = 0;

    return delta;
  }

  // True when the press that produced the pending click/tap was a drag.
  // Cleared by the next mousedown/touchstart.
  function didDrag() { return state.dragDistance > C.DRAG_CLICK_THRESHOLD; }

  // Drop any pointer motion carried across a state change (e.g. into a new run).
  function reset() {
    state.touchDeltaX  = 0;
    state.mouseDeltaX  = 0;
    state.dragDistance = 0;
    state.touchLastX   = null;
  }

  return { init, getRotationDelta, didDrag, reset };
})();
