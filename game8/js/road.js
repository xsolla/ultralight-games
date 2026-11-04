// ============================================================================
// road.js — основная дорога: текстура асфальта с разметкой и лента, которая каждый кадр изгибается
// по Bend. Текстура ползёт на игрока, это и даёт ощущение скорости.
//
// Лента (ribbon) состоит из ROAD.SEGMENTS поперечных рядов вершин, каждый сдвигается на Bend.ox(z).
// Дорога рисуется с polygonOffset: она всегда поверх ответвлений развилок и поверх земли.
// ============================================================================

const Road = {
  tex: null,        // текстура асфальта (развилки клонируют её для своих веток)
  canvas: null,     // её canvas: тема перерисовывает его (Road.paint), клоны видят то же изображение
  material: null,
  ribbon: null,     // { mesh, update }

  init() {
    const R = CONFIG.ROAD, T = CONFIG.TRACK;
    Road.tex = Road.makeTexture();
    Road.tex.repeat.set(1, R.LENGTH / T.CELL_L);

    const material = Road.material = new THREE.MeshStandardMaterial({
      map: Road.tex,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    Road.ribbon = Road.makeRibbon(-T.ROAD_W / 2, T.ROAD_W / 2, R.Z_START, R.Z_START - R.LENGTH, R.SEGMENTS, material);
    Stage.scene.add(Road.ribbon.mesh);
  },

  // Вид асфальта по теме (THEMES.*.ROAD): перерисовать текстуру, шероховатость и блеск (мокрый асфальт)
  applyTheme(road) {
    Road.paint(road);
    Road.tex.needsUpdate = true;
    Road.material.roughness = road.ROUGHNESS; Road.material.metalness = road.METALNESS;
  },

  update(dt) {
    const tex = Road.tex;
    tex.offset.y = (tex.offset.y + CONFIG.WORLD.SPEED * dt / CONFIG.TRACK.CELL_L) % 1;
    Road.ribbon.update();
  },

  // Текстура асфальта: canvas одной плитки, рисует его Road.paint (по теме)
  makeTexture() {
    const R = CONFIG.ROAD.TEXTURE, T = CONFIG.TRACK;
    const cw = R.WIDTH, ch = Math.round(cw * T.CELL_L / T.ROAD_W);
    const [c] = Util.canvas(cw, ch);
    Road.canvas = c;
    Road.paint(CONFIG.THEMES.day.ROAD);
    const t = Util.canvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Stage.renderer.capabilities.getMaxAnisotropy();
    return t;
  },

  // Асфальт с шумом, пунктирами между полосами, жёлтыми краевыми линиями и красно-белой кромкой.
  // Тема добавляет снег у краёв (SNOW) и лужи (PUDDLES). Одна плитка = одна клетка (CELL_L) вдоль дороги.
  paint(road) {
    const R = CONFIG.ROAD.TEXTURE, T = CONFIG.TRACK, c = Road.canvas, g = c.getContext('2d');
    const cw = c.width, ch = c.height;
    g.fillStyle = road.ASPHALT; g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < R.NOISE_COUNT; i++) {               // шум асфальта
      const v = road.NOISE_BASE + Math.random() * road.NOISE_RANGE | 0;
      g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
    }
    for (let i = 0; i < road.PUDDLES; i++) {                 // лужи: тёмное пятно с бледным отблеском неба
      const x = cw * (0.12 + Math.random() * 0.76), y = Math.random() * ch, rx = 10 + Math.random() * 22, ry = 6 + Math.random() * 12;
      g.fillStyle = 'rgba(14,18,26,0.55)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(150,170,200,0.16)'; g.beginPath(); g.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    const px = cw / T.ROAD_W;
    g.fillStyle = R.DASH;                                    // пунктиры между полосами
    for (let l = 1; l < T.LANES; l++) g.fillRect(l * T.LANE_W * px - 2, ch * R.DASH_FROM, 4, ch * R.DASH_LEN);
    g.fillStyle = R.EDGE_LINE;                               // краевые линии
    g.fillRect(R.EDGE_OFFSET * px, 0, 3, ch); g.fillRect(cw - R.EDGE_OFFSET * px - 3, 0, 3, ch);
    for (let i = 0; i < 2; i++) {                            // рамбл-стрип по краям
      g.fillStyle = i ? R.RUMBLE_WHITE : R.RUMBLE_RED;
      g.fillRect(0, i * ch / 2, R.RUMBLE_W * px, ch / 2);
      g.fillStyle = i ? R.RUMBLE_RED : R.RUMBLE_WHITE;
      g.fillRect(cw - R.RUMBLE_W * px, i * ch / 2, R.RUMBLE_W * px, ch / 2);
    }
    for (let i = 0; i < road.SNOW; i++) {                    // снег: у краёв плотно, к середине почти нет
      const d = Math.pow(Math.random(), 4) * cw * 0.5, x = Math.random() < 0.5 ? d : cw - d;
      g.fillStyle = `rgba(240,246,252,${0.55 + Math.random() * 0.4})`;
      g.fillRect(x, Math.random() * ch, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  },

  // Лента между двумя кромками xl и xr от z0 до z1, v = 0 у камеры, 1 вдали. Каждый кадр вершины
  // сдвигаются на Bend.ox(z).
  makeRibbon(xl, xr, z0, z1, segs, material) {
    const n = segs + 1;
    const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [], zs = [];
    for (let j = 0; j < n; j++) {
      const z = z0 + (z1 - z0) * j / segs; zs.push(z);
      pos.set([xl, 0, z, xr, 0, z], j * 6);
      nor.set([0, 1, 0, 0, 1, 0], j * 6);
      uv.set([0, j / segs, 1, j / segs], j * 4);
      if (j < segs) { const a = 2 * j; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    const update = () => {
      for (let j = 0; j < n; j++) { const o = Bend.ox(zs[j]); pos[j * 6] = xl + o; pos[j * 6 + 3] = xr + o; }
      geo.attributes.position.needsUpdate = true;
    };
    return { mesh, update };
  },
};
