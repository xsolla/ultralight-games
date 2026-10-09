// ============================================================================
// road.js — основная дорога: текстура асфальта с разметкой и лента, которая каждый кадр изгибается
// по Bend. Текстура ползёт на игрока, это и даёт ощущение скорости.
//
// Лента (ribbon) состоит из ROAD.SEGMENTS поперечных рядов вершин, каждый сдвигается на Bend.ox(z).
// Дорога рисуется с polygonOffset: она всегда поверх ответвлений развилок и поверх земли.
// ============================================================================

const Road = {
  tex: null,        // текстура асфальта (развилки клонируют её для своих веток)
  ribbon: null,     // { mesh, update }

  init() {
    const R = CONFIG.ROAD, T = CONFIG.TRACK;
    Road.tex = Road.makeTexture();
    Road.tex.repeat.set(1, R.LENGTH / T.CELL_L);

    const material = new THREE.MeshStandardMaterial({
      map: Road.tex, roughness: R.ROUGHNESS,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    Road.ribbon = Road.makeRibbon(-T.ROAD_W / 2, T.ROAD_W / 2, R.Z_START, R.Z_START - R.LENGTH, R.SEGMENTS, material);
    Stage.scene.add(Road.ribbon.mesh);
  },

  update(dt) {
    const tex = Road.tex;
    tex.offset.y = (tex.offset.y + CONFIG.WORLD.SPEED * dt / CONFIG.TRACK.CELL_L) % 1;
    Road.ribbon.update();
  },

  // Асфальт с шумом, пунктирами между полосами, жёлтыми краевыми линиями и красно-белой кромкой.
  // Одна плитка = одна клетка (CELL_L) вдоль дороги, дальше повторяется.
  makeTexture() {
    const R = CONFIG.ROAD.TEXTURE, T = CONFIG.TRACK;
    const cw = R.WIDTH, ch = Math.round(cw * T.CELL_L / T.ROAD_W);
    const [c, g] = Util.canvas(cw, ch);
    g.fillStyle = R.ASPHALT; g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < R.NOISE_COUNT; i++) {               // шум асфальта
      const v = R.NOISE_BASE + Math.random() * R.NOISE_RANGE | 0;
      g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
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
    const t = Util.canvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Stage.renderer.capabilities.getMaxAnisotropy();
    return t;
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
