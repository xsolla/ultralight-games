// ============================================================================
// util.js — мелкие помощники без состояния: сглаживания, генератор случайных чисел с зерном,
// фабрики материалов и мешей THREE. Грузится после constants.js, THREE нужен только при вызове.
// ============================================================================

const Util = {
  clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),

  // Плавная ступенька 0..1 (smoothstep)
  smooth(x) { x = Util.clamp(x, 0, 1); return x * x * (3 - 2 * x); },

  easeIn: k => k * k,
  easeOut: k => 1 - Math.pow(1 - k, 3),
  easeInOut: k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
  easeOutBack: k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),   // с перелётом за 1 и возвратом
  linear: k => k,

  // Детерминированный генератор (mulberry32): тот же seed даёт ту же последовательность
  rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  // Матовый материал в стиле low-poly, flat-shading
  mat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.08, ...extra });
  },

  // Бокс с тенями
  box(w, h, d, material) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    b.castShadow = true; b.receiveShadow = true;
    return b;
  },

  // Нормали со сглаживанием по углу (для несвязанной геометрии вроде ExtrudeGeometry): в вершине усредняются
  // нормали треугольников с тем же положением, которые отклонены от своего меньше чем на angle (радианы),
  // так что скругления становятся гладкими, а острые кромки остаются острыми.
  creaseNormals(geo, angle) {
    const p = geo.attributes.position.array, n = p.length / 9, cos = Math.cos(angle);
    const fn = new Float32Array(n * 3), groups = new Map(), key = i => `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
    for (let t = 0; t < n; t++) {
      const o = t * 9, ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
      const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
      fn.set([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx], t * 3);   // длина пропорциональна площади
      for (let v = 0; v < 3; v++) { const k = key(o + v * 3); groups.has(k) ? groups.get(k).push(t) : groups.set(k, [t]); }
    }
    const unit = t => { const x = fn[t * 3], y = fn[t * 3 + 1], z = fn[t * 3 + 2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const out = new Float32Array(p.length);
    for (let t = 0; t < n; t++) {
      const [ux, uy, uz] = unit(t);
      for (let v = 0; v < 3; v++) {
        let sx = 0, sy = 0, sz = 0;
        for (const u of groups.get(key(t * 9 + v * 3))) {
          const [wx, wy, wz] = unit(u);
          if (ux * wx + uy * wy + uz * wz >= cos) { sx += fn[u * 3]; sy += fn[u * 3 + 1]; sz += fn[u * 3 + 2]; }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        out.set([sx / l, sy / l, sz / l], t * 9 + v * 3);
      }
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    return geo;
  },

  // Новый canvas и его 2D-контекст
  canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  },

  // Мягкое белое пятно: яркий центр, к краю прозрачно (ореолы, пятна света). stops: [[доля радиуса, непрозрачность], ...]
  glowTexture(stops = [[0, 1], [0.35, 0.45], [1, 0]], size = 128) {
    const [c, g] = Util.canvas(size, size), h = size / 2, r = g.createRadialGradient(h, h, 0, h, h, h);
    for (const [at, a] of stops) r.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = r; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  },

  // Текстура из canvas в sRGB
  canvasTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },
};
