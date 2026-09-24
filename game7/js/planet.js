// ============================================================================
// planet.js — Planet: the procedural planet (CLAUDE.md §6). It generates its
// layers into offscreen canvases, keeps the sun orbiting and relights the
// layers for it, drifts the clouds, and draws the result. Like SpriteKit, it is
// an art provider that owns its caches and draws itself; it holds no game
// state — the planet's HP lives on Game and arrives as an argument.
//
// Ported from planet_test.html, which stays the look-development reference.
// Only the look the designer chose is kept here: soft style, Terran palette.
//
// Everything is file://-safe: pixels are WRITTEN into offscreen canvases with
// putImageData and never read back.
//
// Cost control (the phone budget in CLAUDE.md §6):
//   * layers are built at min(backing scale, PLANET_MAX_SCALE);
//   * generation and the sun pass are generators, run for a few ms per frame,
//     and the sun pass uploads only the rows it touched;
//   * city lights are points drawn as vector dots each frame.
// ============================================================================

const Planet = (function () {

  // ---- The chosen look (designer, 2026-09-24) ---------------------------------
  const LOOK = {
    SEED: 11,
    THICK: 7.5,            // atmosphere scale height, logical px ("thin")
    BRIGHTNESS: 1.0,       // atmosphere brightness
    SUN_Z: -0.8,           // well behind the planet: a backlit rim, a lit crescent
    SUN_START: 14,         // degrees; 0 is straight up
    SUN_ORBIT_MS: 60000,   // one full turn, -180 -> 180 and wrap
    CLOUD_COVER: 0.6,
    CLOUD_DRIFT: 0.8,      // degrees of arc per second
  };

  // Terran. Colour stops are [position, [r,g,b]]; `sea` is the height threshold
  // between ocean and land in fBm units (roughly -0.7..0.7).
  const PAL = {
    sea: 0.04, landLo: 0.04, landHi: 0.62,
    ocean: [[0, [46, 136, 172]], [0.2, [22, 84, 136]], [1, [7, 26, 62]]],
    land: [[0, [198, 184, 134]], [0.06, [88, 140, 66]], [0.3, [46, 100, 55]], [0.55, [112, 104, 70]],
           [0.74, [136, 126, 116]], [0.88, [234, 240, 246]]],
    dry: [178, 152, 98],
    cloud: [250, 252, 255], cloudShade: [192, 208, 230],
    atmo: [92, 172, 255], sunset: [255, 136, 76], night: [3, 6, 18], city: '255, 196, 118',
  };

  // ---- Cost control --------------------------------------------------------------
  const MAX_SCALE   = 2;      // device px per logical px the layers are built at, at most
  const CLOUD_SCALE = 0.6;    // clouds are soft; they build at this fraction of that
  const GEN_BUDGET  = 6;      // ms per frame while layers are being generated
  const SUN_BUDGET  = 2.5;    // ms per frame for the sun pass
  const SUN_CHUNK   = 4096;   // pixels between budget checks and row uploads
  const MARGIN      = 12;     // logical px built past each side and the bottom, so a shake never shows an edge
  const FADE_MS     = 800;    // the planet fades in once its first layers exist
  const HALO        = Math.min(120, LOOK.THICK * 11 + 10);   // atmosphere extent above the limb

  // ---- Damage feedback (from planet_test.html) -----------------------------------
  const IMPACT_MS   = 1300;   // a strike's flash, limb pulses and ring, all told
  const FIRES_MAX   = 10;     // burning spots on land, lit progressively as HP falls...
  const FIRES_BELOW = 0.75;   // ...starting below this fraction of HP
  const FIRE_DEPTH  = [4, 70];   // logical px in from the limb a fire may sit

  const R = LAYOUT.PLANET_R, CX = PLANET_CX, CY = PLANET_CY;

  // ---- Noise — seeded simplex 2D/3D (Gustavson), plus band-limited fBm ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const GRAD3 = new Float64Array([1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1,
                                  1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1]);
  const perm = new Uint8Array(512), perm12 = new Uint8Array(512);
  function seedNoise(seed) {
    const r = mulberry32(seed * 7919 + 17), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; perm12[i] = perm[i] % 12; }
  }
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function noise2(xin, yin) {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) { g = perm12[ii + perm[jj]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x0 + GRAD3[g + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) { g = perm12[ii + i1 + perm[jj + j1]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x1 + GRAD3[g + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) { g = perm12[ii + 1 + perm[jj + 1]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x2 + GRAD3[g + 1] * y2); }
    return 70 * n;
  }
  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) / 3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) / 6;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const G3 = 1 / 6;
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt, g;
    tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tt > 0) { g = perm12[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0); }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tt > 0) { g = perm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1); }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tt > 0) { g = perm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2); }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tt > 0) { g = perm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3); }
    return 32 * n;
  }

  // fBm that drops octaves the pixel can't resolve. `lod` is how many noise units
  // one device pixel spans at octave 0. Near the limb the surface is foreshortened
  // hard, so without this the horizon would sparkle with sub-pixel detail.
  const FBM_NORM = [1, 0.5, 0.75, 0.875, 0.9375, 0.96875, 0.984375, 0.9921875];
  function fbm2(x, y, oct, lod) {
    let sum = 0, amp = 0.5, fr = 1;
    for (let o = 0; o < oct; o++) {
      const c = lod * fr;
      if (c >= 0.5) break;
      sum += amp * (c <= 0.25 ? 1 : (0.5 - c) * 4) * noise2(x * fr + o * 31.7, y * fr - o * 17.3);
      amp *= 0.5; fr *= 2.02;
    }
    return sum / FBM_NORM[oct];
  }
  function fbm3(x, y, z, oct, lod) {
    let sum = 0, amp = 0.5, fr = 1;
    for (let o = 0; o < oct; o++) {
      const c = lod * fr;
      if (c >= 0.5) break;
      sum += amp * (c <= 0.25 ? 1 : (0.5 - c) * 4) * noise3(x * fr + o * 31.7, y * fr - o * 17.3, z * fr + o * 11.1);
      amp *= 0.5; fr *= 2.02;
    }
    return sum / FBM_NORM[oct];
  }

  // Terrain height at surface coords (u, v). `f` is the foreshortening there and
  // `kk` the build scale, which together set how much detail survives. One
  // function for the ground pixels AND the city-light test, so a light can never
  // land on water the ground shows.
  const T_S = 110, T_SW = 170, T_WA = 46;   // continent scale, warp scale, warp px
  function terrainH(u, v, f, kk) {
    const lodW = f / (kk * T_SW);
    const wu = fbm2(u / T_SW + 17.3, v / T_SW - 4.1, 3, lodW);
    const wv = fbm2(u / T_SW - 9.7, v / T_SW + 23.9, 3, lodW);
    return fbm2((u + wu * T_WA) / T_S, (v + wv * T_WA) / T_S, 6, f / (kk * T_S));
  }
  function cityRegion(u, v) { return noise2(u / 30 + 300.5, v / 30 - 41.2); }

  // ---- Small helpers -------------------------------------------------------------
  function ss(e0, e1, x) { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function ramp(stops, t, out) {
    if (t <= stops[0][0]) { const c = stops[0][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t < b[0]) {
        const f = (t - a[0]) / (b[0] - a[0]);
        out[0] = a[1][0] + (b[1][0] - a[1][0]) * f;
        out[1] = a[1][1] + (b[1][1] - a[1][1]) * f;
        out[2] = a[1][2] + (b[1][2] - a[1][2]) * f;
        return;
      }
    }
    const c = stops[stops.length - 1][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  }
  function mixInto(out, c, f) {
    out[0] += (c[0] - out[0]) * f; out[1] += (c[1] - out[1]) * f; out[2] += (c[2] - out[2]) * f;
  }
  function blankCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function toCanvas(img) {
    const c = blankCanvas(img.width, img.height);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // ---- Static layers (sun-independent) -------------------------------------------
  // Screen-aligned, over the planet's part of the screen only. Surface coordinates
  // come from a polar mapping —
  //   u = theta * rho          (distance along the arc)
  //   v = R * acos(rho / R)    (true surface distance in from the limb)
  // — which bends every feature along the curve and foreshortens it toward the
  // horizon, which is what makes a flat band read as a globe.
  //
  // Nothing here depends on the sun. What the sun pass needs per pixel is cached
  // in typed arrays, so relighting is plain arithmetic.
  const RELIEF = 34;   // relief shading strength per unit slope
  function* genStatic(kk) {
    const thick = LOOK.THICK;
    const x0 = -MARGIN, y0 = LAYOUT.HORIZON - HALO;
    const W = Math.ceil((CANVAS_W + 2 * MARGIN) * kk), H = Math.ceil((CANVAS_H + MARGIN - y0) * kk);
    const N = W * H;
    const gImg = new ImageData(W, H), gd = gImg.data;
    const sImg = new ImageData(W, H), lImg = new ImageData(W, H), aImg = new ImageData(W, H);
    const sd = sImg.data, ld = lImg.data;
    const hb = new Float32Array(N).fill(-99);          // terrain height; -99 = not planet
    const kmap = new Int32Array(N).fill(-1);           // pixel -> active index
    const A = {
      n: 0, idx: new Int32Array(N),
      nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N),
      lx: new Float32Array(N), ly: new Float32Array(N),
      flag: new Uint8Array(N),                         // 0 air above the limb, 1 land, 3 sea
      cover: new Float32Array(N),
      line: new Float32Array(N), halo: new Float32Array(N), haze: new Float32Array(N),
      rgx: new Float32Array(N), rgy: new Float32Array(N), city: new Float32Array(N),
    };
    const C = [0, 0, 0], O = [0, 0, 0];
    const cityRGB = PAL.city.split(',').map(Number);

    // Colours that never change per pixel: shade is always night-tinted black and
    // lights always city-coloured; the sun pass only writes their alpha.
    for (let o = 0; o < N * 4; o += 4) {
      sd[o] = PAL.night[0]; sd[o + 1] = PAL.night[1]; sd[o + 2] = PAL.night[2];
      ld[o] = cityRGB[0]; ld[o + 1] = cityRGB[1]; ld[o + 2] = cityRGB[2];
    }

    for (let j = 0; j < H; j++) {
      const y = y0 + (j + 0.5) / kk, dy = y - CY;
      for (let i = 0; i < W; i++) {
        const x = x0 + (i + 0.5) / kk, dx = x - CX;
        const rho = Math.sqrt(dx * dx + dy * dy);
        const hOut = rho - R;
        if (hOut > HALO) continue;
        const idx = j * W + i, o = idx * 4, k = A.n++;
        kmap[idx] = k;
        A.idx[k] = idx;
        A.lx[k] = dx / rho; A.ly[k] = dy / rho;

        // The limb line: a thin bright seam right on the edge of the disc.
        const lq = (hOut + 0.15) / 0.8;
        A.line[k] = Math.exp(-lq * lq);

        if (hOut > 0) {
          // Halo above the limb: a thin, dense band plus a very faint wide scatter.
          A.halo[k] = 0.8 * Math.exp(-hOut / thick) + 0.2 * Math.exp(-hOut / (thick * 3.2));
          continue;
        }

        const cover = clamp((R - rho) * kk + 0.5, 0, 1);
        const nx = dx / R, ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const theta = Math.atan2(dx, -dy);
        const u = theta * rho, v = R * Math.acos(Math.min(1, rho / R));
        const f = 1 / Math.max(nz, 0.03);            // foreshortening across the arc
        const h = terrainH(u, v, f, kk);
        const land = h > PAL.sea;
        hb[idx] = h;
        A.flag[k] = land ? 1 : 3;
        A.nx[k] = nx; A.ny[k] = ny; A.nz[k] = nz; A.cover[k] = cover;

        // Albedo
        if (land) {
          const t = (h - PAL.landLo) / (PAL.landHi - PAL.landLo);
          ramp(PAL.land, t, C);
          if (t < 0.42) {
            const m = noise2(u / 240 + 51.7, v / 240 - 13.3);
            mixInto(C, PAL.dry, ss(0.1, 0.42, m) * (1 - t / 0.42));
          }
          if (h - PAL.sea < 0.006) {                    // soft coastline, no stair-steps
            ramp(PAL.ocean, 0, O);
            mixInto(C, O, 1 - (h - PAL.sea) / 0.006);
          }
        } else {
          ramp(PAL.ocean, (PAL.sea - h) / 0.5, C);
        }
        // Aerial perspective: near the limb the ground is seen through more air.
        const fres = 1 - nz;
        const hz = fres * fres * fres * 0.55;
        C[0] += (PAL.atmo[0] * 0.55 - C[0]) * hz;
        C[1] += (PAL.atmo[1] * 0.55 - C[1]) * hz;
        C[2] += (PAL.atmo[2] * 0.55 - C[2]) * hz;
        gd[o] = C[0]; gd[o + 1] = C[1]; gd[o + 2] = C[2]; gd[o + 3] = 255 * cover;

        // Haze inside the limb (how bright it is, is the sun pass's business)
        A.haze[k] = fres * fres * fres * 0.55;

        // Faint sodium glow over whole cities; the individual lights are points.
        if (land) {
          const region = ss(0.1, 0.5, cityRegion(u, v));
          const fadeG = clamp((0.45 - f / (kk * 30)) / 0.2, 0, 1);
          A.city[k] = region * region * 0.16 * fadeG;
        }
      }
      yield;
    }

    // Relief slopes. Reads only our own height buffer — never pixels back from a canvas.
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i, h = hb[idx];
        if (h <= PAL.sea) continue;                  // sea, or not planet at all
        const hl = hb[idx - 1], hr = hb[idx + 1], hu = hb[idx - W], hd = hb[idx + W];
        if (hl < -90 || hr < -90 || hu < -90 || hd < -90) continue;
        const k = kmap[idx], nz = A.nz[k];
        A.rgx[k] = (hr - hl) * kk * 0.5 * RELIEF * nz;
        A.rgy[k] = (hd - hu) * kk * 0.5 * RELIEF * nz;
      }
      if ((j & 7) === 0) yield;
    }

    // City lights as POINTS on the sphere, sampled on a jittered grid in surface
    // coordinates and projected. A point stays one pixel wide however hard the
    // limb foreshortens, so these survive all the way up to the horizon. Screen
    // density climbs as 1/nz toward the limb, so acceptance is thinned by nz to
    // keep the horizon from fusing into a solid line of light.
    const cities = [];
    const rhoMin = CY - CANVAS_H;
    const vMax = R * Math.acos(clamp(rhoMin / R, -1, 1));
    const thetaVis = Math.max(Math.asin(Math.min(1, CX / R)), Math.atan2(CX, rhoMin)) + DEG;
    const STEP = 2.6;                                // surface px between candidates
    const rc = mulberry32(LOOK.SEED * 97 + 3);
    for (let v = 0.4; v < vMax; v += STEP) {
      const dth = STEP / (R * Math.cos(v / R));
      for (let th = -thetaVis; th < thetaVis; th += dth) {
        const vj = v + (rc() - 0.5) * STEP, tj = th + (rc() - 0.5) * dth;
        const rho = R * Math.cos(vj / R), u = tj * rho;
        const c1 = cityRegion(u, vj);
        if (c1 < 0.12) continue;
        const nz = Math.sin(vj / R);
        if (rc() > ss(0.1, 0.5, c1) * 0.75 * Math.min(1, nz * 1.6)) continue;
        const x = CX + rho * Math.sin(tj), y = CY - rho * Math.cos(tj);
        if (x < 0 || x >= CANVAS_W || y < y0 || y >= CANVAS_H) continue;
        if (terrainH(u, vj, 1 / Math.max(nz, 0.03), kk) <= PAL.sea) continue;
        cities.push({ x, y, nx: (x - CX) / R, ny: (y - CY) / R, nz, b: 0.45 + 0.55 * rc() });
      }
      yield;
    }

    // Where fires break out as the planet is hurt: spread-out land points in the
    // visible band, found in our own height buffer.
    const fires = [];
    const rf = mulberry32(LOOK.SEED * 31 + 5);
    for (let tries = 0; tries < 6000 && fires.length < FIRES_MAX; tries++) {
      const x = 8 + rf() * (CANVAS_W - 16), y = y0 + rf() * (CANVAS_H - y0);
      const dx = x - CX, dy = y - CY, rho = Math.hypot(dx, dy), depth = R - rho;
      if (depth < FIRE_DEPTH[0] || depth > FIRE_DEPTH[1]) continue;
      const idx = Math.floor((y - y0) * kk) * W + Math.floor((x - x0) * kk);
      if (!(hb[idx] > PAL.sea)) continue;
      if (fires.some((f) => Math.hypot(f.x - x, f.y - y) < 22)) continue;
      fires.push({ x, y, nx: dx / rho, ny: dy / rho });
    }

    const shade = blankCanvas(W, H), lights = blankCanvas(W, H), atmo = blankCanvas(W, H);
    return {
      x0, y0, W, H, kk, px: A, sImg, lImg, aImg, cities, fires,
      ground: toCanvas(gImg), shade, lights, atmo,
      sctx: shade.getContext('2d'), lctx: lights.getContext('2d'), actx: atmo.getContext('2d'),
    };
  }

  // ---- Sun pass: shade, city glow and atmosphere from the cached normals ----------
  // A generator, so it can be spread over frames: each chunk is plain arithmetic
  // over SUN_CHUNK active pixels, then uploads only the rows it touched. The sun
  // vector is fixed for a whole pass, so a pass never tears against itself.
  function* relight(Lr, L) {
    const Lx = L.x, Ly = L.y, Lz = L.z;
    const hl = Math.hypot(Lx, Ly, Lz + 1);
    const Hx = Lx / hl, Hy = Ly / hl, Hz = (Lz + 1) / hl;   // half vector for sea glint
    const backlit = Math.max(0, -Lz);
    const A = Lr.px, sd = Lr.sImg.data, ld = Lr.lImg.data, ad = Lr.aImg.data;
    const at = PAL.atmo, su = PAL.sunset, W = Lr.W, n = A.n;
    let k = 0, rowFrom = n ? Math.floor(A.idx[0] / W) : 0;

    while (k < n) {
      const end = Math.min(n, k + SUN_CHUNK);
      for (; k < end; k++) {
        const o = A.idx[k] * 4;
        const limbLam = A.lx[k] * Lx + A.ly[k] * Ly;   // how lit the limb is at this angle
        const Ilimb = 0.12 + 0.88 * ss(-0.5, 0.65, limbLam) + backlit * 0.45;
        // The rim turns sunset-coloured where the terminator meets the limb.
        const qL = limbLam / 0.22;
        const sL = qL * qL > 9 ? 0 : Math.exp(-qL * qL) * 0.8;
        const cr = at[0] + (su[0] - at[0]) * sL, cg = at[1] + (su[1] - at[1]) * sL, cb = at[2] + (su[2] - at[2]) * sL;
        let ar = 0, ag = 0, ab = 0;                   // additive light, 0..255 scale

        const li = A.line[k];
        if (li > 0.002) {
          // whiter than the air around it, the way a real limb peaks toward white
          const v = li * 0.95 * Ilimb;
          ar += v * (cr * 0.7 + 76.5); ag += v * (cg * 0.7 + 76.5); ab += v * (cb * 0.7 + 76.5);
        }

        const fl = A.flag[k];
        if (fl === 0) {
          const v = A.halo[k] * 0.85 * Ilimb;
          ar += v * cr; ag += v * cg; ab += v * cb;
          ld[o + 3] = 0;
        } else {
          const lam = A.nx[k] * Lx + A.ny[k] * Ly + A.nz[k] * Lz;   // Lambert term
          const cv = A.cover[k];
          let bright = 0.06 + 0.94 * ss(-0.16, 0.5, lam) * (0.8 + 0.2 * clamp(lam, 0, 1));
          if (fl === 1) {
            const rel = -(A.rgx[k] * Lx + A.rgy[k] * Ly);         // slopes facing the sun brighten
            bright = Math.min(1, bright * clamp(1 + rel, 0.72, 1.22));
          }
          sd[o + 3] = 255 * (1 - bright) * cv;
          const cg0 = A.city[k];
          ld[o + 3] = cg0 > 0 ? 255 * cg0 * ss(0.04, -0.14, lam) * cv : 0;

          if (fl === 3 && lam > 0) {                 // sun glint on open water
            const sp = A.nx[k] * Hx + A.ny[k] * Hy + A.nz[k] * Hz;
            if (sp > 0.9) { const g = Math.pow(sp, 90) * 0.5 * 255 * cv; ar += g; ag += g * 0.96; ab += g * 0.86; }
          }
          const hz = A.haze[k];
          if (hz > 0.002) {
            const Iin = 0.1 + 0.9 * ss(-0.25, 0.45, lam) + backlit * 0.25;
            const qi = lam / 0.18, sIn = qi * qi > 9 ? 0 : Math.exp(-qi * qi) * 0.7;
            const hi = hz * Iin * cv;
            ar += hi * (at[0] + (su[0] - at[0]) * sIn);
            ag += hi * (at[1] + (su[1] - at[1]) * sIn);
            ab += hi * (at[2] + (su[2] - at[2]) * sIn);
          }
        }

        const a = ar > ag ? (ar > ab ? ar : ab) : (ag > ab ? ag : ab);
        if (a > 0.5) { ad[o] = ar / a * 255; ad[o + 1] = ag / a * 255; ad[o + 2] = ab / a * 255; ad[o + 3] = a; }
        else ad[o + 3] = 0;
      }
      const rowTo = Math.floor(A.idx[end - 1] / W);
      const h = rowTo - rowFrom + 1;
      Lr.sctx.putImageData(Lr.sImg, 0, 0, 0, rowFrom, W, h);
      Lr.lctx.putImageData(Lr.lImg, 0, 0, 0, rowFrom, W, h);
      Lr.actx.putImageData(Lr.aImg, 0, 0, 0, rowFrom, W, h);
      rowFrom = rowTo;                                // a boundary row can straddle two chunks
      yield;
    }
  }

  // ---- Cloud layer ------------------------------------------------------------------
  // Generated once over an angular sector wider than the view, with noise that is
  // PERIODIC in angle, then drawn rotated about the planet centre every frame.
  // Rotation keeps each pixel at its radius, so the clouds stay on the planet,
  // keep their foreshortening, and wrap seamlessly — the drift costs one
  // drawImage. The shade layer on top darkens them at night.
  function* genClouds(kc) {
    const rhoMin = CY - CANVAS_H - MARGIN - 2;
    const thetaVis = Math.max(Math.asin(Math.min(1, (CX + MARGIN) / R)), Math.atan2(CX + MARGIN, CY - CANVAS_H)) + 2 * DEG;
    const per = 2 * thetaVis + 4 * DEG;              // wider than the view: no visible repeat
    const phi1 = -thetaVis - per, phi2 = thetaVis;

    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let s = 0; s <= 128; s++) {
      const ph = phi1 + (phi2 - phi1) * s / 128;
      for (const r of [rhoMin, R + 1]) {
        const x = CX + r * Math.sin(ph), y = CY - r * Math.cos(ph);
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
    }
    bx0 -= 2; by0 -= 2; bx1 += 2; by1 += 2;
    const W = Math.ceil((bx1 - bx0) * kc), H = Math.ceil((by1 - by0) * kc);
    const img = new ImageData(W, H), d = img.data;
    const Sc = 64;
    const thr = 0.42 - 0.84 * LOOK.CLOUD_COVER;
    const C = [0, 0, 0];

    for (let j = 0; j < H; j++) {
      const y = by0 + (j + 0.5) / kc, dy = y - CY;
      for (let i = 0; i < W; i++) {
        const x = bx0 + (i + 0.5) / kc, dx = x - CX;
        const rho = Math.sqrt(dx * dx + dy * dy);
        if (rho > R + 1 || rho < rhoMin) continue;
        const phi = Math.atan2(dx, -dy);
        if (phi < phi1 - 0.01 || phi > phi2 + 0.01) continue;
        const rr = Math.min(1, rho / R), nz = Math.sqrt(1 - rr * rr), v = R * Math.acos(rr);
        const f = 1 / Math.max(nz, 0.03);
        const psi = TAU * phi / per, cr = per * rho / (TAU * Sc);
        const X = cr * Math.cos(psi), Y = cr * Math.sin(psi), Z = v / Sc;
        const lod = f / (kc * Sc);
        const w = fbm3(X * 0.5 + 5.2, Y * 0.5 - 3.1, Z * 0.5 + 9.1, 2, lod * 0.5) * 0.5;
        const c = fbm3(X + w, Y - w, Z + w * 0.6, 5, lod);
        const a = ss(thr, thr + 0.34, c) * 0.94;
        if (a < 0.004) continue;
        const edge = clamp((R - rho) * kc + 0.5, 0, 1);
        C[0] = PAL.cloudShade[0]; C[1] = PAL.cloudShade[1]; C[2] = PAL.cloudShade[2];
        mixInto(C, PAL.cloud, ss(thr, thr + 0.5, c));
        const o = (j * W + i) * 4;
        d[o] = C[0]; d[o + 1] = C[1]; d[o + 2] = C[2]; d[o + 3] = 255 * a * edge;
      }
      yield;
    }

    const cloud = toCanvas(img);
    // Shadow: the same shapes as a dark silhouette, drawn offset away from the sun.
    const shadow = blankCanvas(W, H);
    const sc = shadow.getContext('2d');
    sc.drawImage(cloud, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = 'rgb(0, 4, 14)';
    sc.fillRect(0, 0, W, H);
    return { cloud, shadow, x: bx0, y: by0, w: W / kc, h: H / kc, per };
  }

  // Everything a new build scale needs, first light included, so a set of layers
  // is never shown before it has been lit.
  function* buildAll(kk, sun) {
    const layers = yield* genStatic(kk);
    const clouds = yield* genClouds(Math.max(1, kk * CLOUD_SCALE));
    yield* relight(layers, sun());
    return { layers, clouds };
  }

  // Run a generator for up to `budget` ms. Returns its final value once it
  // finishes, or undefined while it still has work left.
  function runFor(gen, budget) {
    const t0 = performance.now();
    for (;;) {
      const r = gen.next();
      if (r.done) return r.value === undefined ? true : r.value;
      if (performance.now() - t0 >= budget) return undefined;
    }
  }

  const planet = {
    layers: null,     // the lit static layers in use, or null before the first build
    clouds: null,
    kk: 0,            // the scale those (or the pending job's) layers are built at
    job: null,        // a buildAll generator while a (re)build is running
    pass: null,       // the sun pass in progress over `layers`
    sunAngle: LOOK.SUN_START,   // degrees
    cloudAngle: 0,    // radians
    fade: 0,          // 0 -> 1 once the first layers exist
    t: 0,             // own clock, ms, for the damage effects
    impacts: [],      // strikes being shown: { th (angle on the limb), t0 }

    init() {
      seedNoise(LOOK.SEED);
    },

    // A body reached the planet at (x, y). Purely visual: the HP is Game's.
    hit(x, y) {
      this.impacts.push({ th: Math.atan2(x - CX, -(y - CY)), t0: this.t });
    },

    // A new run starts on an unscarred planet.
    clearDamage() {
      this.impacts.length = 0;
    },

    get ready() { return !!this.layers; },

    sunVector() {
      const a = this.sunAngle * DEG, z = LOOK.SUN_Z, c = Math.sqrt(1 - z * z);
      return { x: Math.sin(a) * c, y: -Math.cos(a) * c, z };
    },

    // The backing store changed. Rebuild at the new scale in the background;
    // the old layers keep drawing (scaled) until the new ones are lit.
    resize(backingScale) {
      const kk = Math.min(backingScale, MAX_SCALE);
      if (this.kk && Math.abs(kk - this.kk) / this.kk < 0.02) return;
      this.kk = kk;
      this.job = buildAll(kk, () => this.sunVector());
      this.pass = null;
    },

    update(dt) {
      this.t += dt;
      for (let i = this.impacts.length - 1; i >= 0; i--) {
        if (this.t - this.impacts[i].t0 > IMPACT_MS) this.impacts.splice(i, 1);
      }
      this.sunAngle += 360 * dt / LOOK.SUN_ORBIT_MS;
      if (this.sunAngle > 180) this.sunAngle -= 360;
      this.cloudAngle += LOOK.CLOUD_DRIFT * DEG * dt / 1000;

      if (this.job) {
        const done = runFor(this.job, GEN_BUDGET);
        if (done) {
          this.layers = done.layers;
          this.clouds = done.clouds;
          this.job = null;
        }
      } else if (this.layers) {
        if (!this.pass) this.pass = relight(this.layers, this.sunVector());
        if (runFor(this.pass, SUN_BUDGET)) this.pass = null;
      }
      if (this.layers && this.fade < 1) this.fade = Math.min(1, this.fade + dt / FADE_MS);
    },

    // `hpFrac` dims the city lights and, a little, the air: a planet being lost
    // should look it.
    draw(ctx, hpFrac, time) {
      const Lr = this.layers;
      if (!Lr) return;
      const fade = this.fade;
      const lw = Lr.W / Lr.kk, lh = Lr.H / Lr.kk;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.drawImage(Lr.ground, Lr.x0, Lr.y0, lw, lh);

      const Cl = this.clouds;
      if (Cl) {
        const ang = ((this.cloudAngle % Cl.per) + Cl.per) % Cl.per;
        const L = this.sunVector();
        const sl = Math.hypot(L.x, L.y) || 1;
        const off = 3.2 * Math.hypot(L.x, L.y);
        ctx.save();
        ctx.translate(CX - L.x / sl * off, CY - L.y / sl * off);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.3 * fade;
        ctx.drawImage(Cl.shadow, Cl.x - CX, Cl.y - CY, Cl.w, Cl.h);
        ctx.restore();
        ctx.save();
        ctx.translate(CX, CY);
        ctx.rotate(ang);
        ctx.drawImage(Cl.cloud, Cl.x - CX, Cl.y - CY, Cl.w, Cl.h);
        ctx.restore();
      }

      ctx.drawImage(Lr.shade, Lr.x0, Lr.y0, lw, lh);

      ctx.globalCompositeOperation = 'lighter';
      if (hpFrac > 0) {
        ctx.globalAlpha = hpFrac * fade;
        ctx.drawImage(Lr.lights, Lr.x0, Lr.y0, lw, lh);
        this.drawCities(ctx, hpFrac * fade);
      }
      const burning = this.burning(hpFrac);
      ctx.globalAlpha = fade;
      this.drawFires(ctx, burning);
      // A barely-there breathing on the air, so it reads as alive, not painted on.
      ctx.globalAlpha = clamp(LOOK.BRIGHTNESS * (0.75 + 0.25 * hpFrac) *
                              (1 + 0.035 * Math.sin(time / 1100)), 0, 1) * fade;
      ctx.drawImage(Lr.atmo, Lr.x0, Lr.y0, lw, lh);
      ctx.globalAlpha = 1;
      this.drawImpacts(ctx);
      ctx.globalCompositeOperation = 'source-over';
      this.drawSmoke(ctx, burning);
      ctx.restore();
    },

    // How many of the fire spots are alight at this much HP.
    burning(hpFrac) {
      const fires = this.layers.fires;
      if (hpFrac >= FIRES_BELOW) return 0;
      return Math.min(fires.length, Math.ceil((FIRES_BELOW - hpFrac) / FIRES_BELOW * fires.length));
    },

    drawFires(ctx, n) {
      const fires = this.layers.fires, t = this.t;
      for (let i = 0; i < n; i++) {
        const f = fires[i];
        const fl = 0.72 + 0.28 * Math.sin(t * 0.017 + i * 1.9) * Math.sin(t * 0.031 + i * 0.7);
        const r = (4.2 + (i % 3)) * fl * 2.2;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,236,170,${(0.95 * fl).toFixed(3)})`);
        g.addColorStop(0.3, `rgba(255,128,40,${(0.6 * fl).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      }
    },

    // Puffs rising off each fire, outward from the surface, swaying as they go.
    drawSmoke(ctx, n) {
      const fires = this.layers.fires, t = this.t;
      for (let i = 0; i < n; i++) {
        const f = fires[i];
        for (let k = 0; k < 3; k++) {
          const ph = ((t / 2400) + i * 0.37 + k / 3) % 1;
          const dist = 2 + ph * 20;
          const sway = Math.sin(t / 700 + i + k * 2) * 2 * ph;
          const x = f.x + f.nx * dist - f.ny * sway, y = f.y + f.ny * dist + f.nx * sway;
          ctx.fillStyle = `rgba(40,36,42,${((1 - ph) * 0.3 * Math.min(1, ph * 6)).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, 2 + ph * 6, 0, TAU); ctx.fill();
        }
      }
    },

    // A strike: a flare of the air around it, a flash, two pulses racing away
    // along the limb — the atmosphere carrying the blow — and a shock ring.
    drawImpacts(ctx) {
      ctx.lineCap = 'round';
      for (const im of this.impacts) {
        const age = this.t - im.t0;
        const px = CX + R * Math.sin(im.th), py = CY - R * Math.cos(im.th);
        const base = im.th - Math.PI / 2;            // canvas arc angles start at +x
        const ga = Math.max(0, 1 - age / 650);
        if (ga > 0) {
          ctx.strokeStyle = `rgba(${PAL.atmo.join(',')},${(0.4 * ga).toFixed(3)})`;
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.arc(CX, CY, R + 2, base - 46 / R, base + 46 / R); ctx.stroke();
        }
        const fa = Math.max(0, 1 - age / 480);
        if (fa > 0) {
          const r = 8 + 38 * (1 - Math.pow(1 - Math.min(1, age / 260), 3));
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, `rgba(255,244,220,${(0.95 * fa).toFixed(3)})`);
          g.addColorStop(0.35, `rgba(255,150,70,${(0.55 * fa).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,90,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
        }
        const p = age / IMPACT_MS, run = age / 1000 * 200, len = 28;
        ctx.strokeStyle = `rgba(${PAL.sunset.join(',')},${(Math.pow(1 - p, 2) * 0.9).toFixed(3)})`;
        ctx.lineWidth = 2.4 * (1 - p) + 0.6;
        for (const sg of [-1, 1]) {
          const a0 = base + sg * run / R;
          ctx.beginPath(); ctx.arc(CX, CY, R + 1.2, a0 - len / (2 * R), a0 + len / (2 * R)); ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255,210,160,${(Math.pow(1 - p, 2) * 0.35).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, 4 + 64 * p, 0, TAU); ctx.stroke();
      }
    },

    // The individual city lights, lit per frame from the current sun. Bucketed by
    // brightness so a few hundred dots cost a handful of fills; the second, wider
    // pass is the bloom.
    drawCities(ctx, alpha) {
      const L = this.sunVector();
      const BUCKETS = 6;
      const paths = [];
      for (let b = 0; b < BUCKETS; b++) paths.push([]);
      for (const p of this.layers.cities) {
        const nf = ss(0.04, -0.14, p.nx * L.x + p.ny * L.y + p.nz * L.z) * p.b;
        if (nf < 0.02) continue;
        paths[Math.min(BUCKETS - 1, Math.floor(nf * BUCKETS))].push(p);
      }
      for (let b = 0; b < BUCKETS; b++) {
        const list = paths[b];
        if (!list.length) continue;
        const a = (b + 0.5) / BUCKETS * alpha;
        ctx.globalAlpha = a * 0.22;
        ctx.fillStyle = `rgb(${PAL.city})`;
        ctx.beginPath();
        for (const p of list) ctx.rect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath();
        for (const p of list) ctx.rect(p.x - 0.45, p.y - 0.45, 0.9, 0.9);
        ctx.fill();
      }
    },
  };
  return planet;
})();
