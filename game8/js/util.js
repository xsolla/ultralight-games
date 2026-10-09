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

  // Новый canvas и его 2D-контекст
  canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  },

  // Текстура из canvas в sRGB
  canvasTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },
};
