// brand.js — Xsolla wordmark
//
// Path data and placement come from ../branding.md, the shared spec for every game
// in this repo. Deliberately duplicated rather than imported: the games ship as
// standalone folders, so branding.md is what keeps the copies identical.
//
// Source artwork: common_assets/xsolla_logo/new-logo-dark.svg, viewBox 0 0 171 46.
// Two details from the spec that matter here:
//   - Paths 1 (the O) and 5 (the A) are fill-rule="evenodd". All five are filled
//     evenodd, since for the three without holes it is identical to nonzero — one
//     uniform call is both correct and simpler.
//   - The source clipPath rect exactly bounds the artwork, so it is a no-op and is
//     skipped. But its 4.53857 y-offset is subtracted so a caller's `y` means the
//     top of the visible artwork.

const Brand = (() => {
  const PATHS = [
    'M73.6664 4.53827C84.0077 4.53827 92.1272 12.6598 92.1272 22.9991C92.1272 33.3383 84.0077 41.4599 73.6664 41.4599C63.3271 41.4599 55.2078 33.3383 55.2078 22.9991C55.2078 12.6598 63.3272 4.53829 73.6664 4.53827ZM73.6664 11.6001C67.4629 11.6001 62.7728 16.4937 62.7728 22.9991C62.7728 29.5065 67.4629 34.398 73.6664 34.398C79.872 34.398 84.5622 29.5065 84.5622 22.9991C84.5622 16.4937 79.872 11.6001 73.6664 11.6001Z',
    'M18.0542 16.6417L26.3277 5.34541H35.0034L22.2521 22.2765L36.0119 40.6531H26.884L17.7546 28.3332L8.725 40.6531H0.00012207L13.5575 22.6895L0.605567 5.34541H9.68396L18.0542 16.6417Z',
    'M42.9917 15.4836L49.9509 24.2107C51.4643 26.1266 52.1706 27.9419 52.1706 29.9091C52.1706 31.8763 51.4643 33.6917 49.9509 35.6097L45.9669 40.6531H36.9893L45.1088 30.2622L38.1987 21.5865C36.7367 19.7712 36.0304 18.005 36.0304 16.1404C36.0304 14.2225 36.7367 12.4584 38.1987 10.6925L42.7391 5.34541H51.5156L42.9917 15.4836Z',
    'M118.379 40.6531H109.502L90.5358 5.34541H99.4151L118.379 40.6531Z',
    'M116.976 5.34541L131.944 33.2089L146.393 5.34541H151.688L169.997 40.6531H127.065L108.101 5.34541H116.976ZM139.348 34.0962H158.385L148.875 15.1397L139.348 34.0962Z',
  ];

  const SRC_W = 169.997;   // artwork width in source units
  const SRC_Y0 = 4.53857;  // artwork's top edge in source units

  // Built once, never per frame. Safe to hold across frames only because this game
  // never reassigns canvas.width — doing so resets the context and would invalidate
  // cached Path2D objects (see branding.md gotchas).
  let cache = null;

  // (x, y) = top-left of the visible artwork; w = target width in logical px.
  function drawLogo(ctx, x, y, w) {
    if (!cache) cache = PATHS.map(d => new Path2D(d));
    const s = w / SRC_W;
    ctx.save();
    ctx.translate(x, y - SRC_Y0 * s);
    ctx.scale(s, s);
    ctx.fillStyle = C.BRAND_LOGO_FILL;
    for (const p of cache) ctx.fill(p, 'evenodd');
    ctx.restore();
  }

  // Bounds of the rendered artwork, for collision checks against a title layout.
  function logoBounds(x, y, w) {
    return { x, y, w, h: w * (36.9211 / SRC_W) };
  }

  return { drawLogo, logoBounds };
})();
