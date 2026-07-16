// ============================================================================
// hex.js — shared hex geometry module (pointy-top, axial coords q,r).
// Used by BOTH rendering and click hit-testing, so conversions live here only.
//
// Axial: (q, r). Cube constraint: s = -q - r, so q + r + s = 0.
// Pointy-top layout (a vertex points straight up).
// ============================================================================

const SQRT3 = Math.sqrt(3);

// The 6 neighbor directions in axial coords (distance-1 ring).
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

// Stable string key for a cell, usable as a Map/Set key.
function hexKey(q, r) {
  return q + ',' + r;
}

// Cube distance via axial: max(|dq|, |dr|, |ds|).
function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  const ds = -dq - dr;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

// The 6 neighbors of (q, r).
function hexNeighbors(q, r) {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Axial -> pixel center, given cell `size` (center-to-vertex) and pixel `origin`.
// Pointy-top: x = size * sqrt(3) * (q + r/2);  y = size * 3/2 * r
function axialToPixel(q, r, size, origin) {
  return {
    x: origin.x + size * SQRT3 * (q + r / 2),
    y: origin.y + size * 1.5 * r,
  };
}

// Pixel -> nearest axial cell (for click/tap hit-testing). Inverse of the
// above followed by cube rounding.
function pixelToAxial(px, py, size, origin) {
  const x = (px - origin.x) / size;
  const y = (py - origin.y) / size;
  const qf = (SQRT3 / 3) * x - (1 / 3) * y;
  const rf = (2 / 3) * y;
  return cubeRound(qf, rf);
}

// Round fractional axial coords to the nearest valid hex (via cube rounding).
function cubeRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);

  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);

  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  return { q, r };
}

// The 6 pixel corners of a pointy-top hex centered at (cx, cy).
// Vertex angles: -30, 30, 90, 150, 210, 270 degrees.
function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return pts;
}
