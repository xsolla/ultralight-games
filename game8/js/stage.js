// ============================================================================
// stage.js — сцена THREE: рендерер, свет, туман, земля, горы, перспективная камера.
// Здесь только "сцена без содержимого". Дорога, обочина, машины добавляют себя в Stage.scene сами.
// Положение камеры в кадре считает camera.js.
// ============================================================================

const Stage = {
  renderer: null,
  scene: null,
  camera: null,
  view: null,

  init(view) {
    const W = CONFIG.WORLD, L = CONFIG.LIGHT, C = CONFIG.CAMERA;
    Stage.view = view;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.RENDER.MAX_DPR));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    view.appendChild(renderer.domElement);
    Stage.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(W.SKY);
    scene.fog = new THREE.Fog(W.SKY, W.FOG.NEAR, W.FOG.FAR);
    Stage.scene = scene;

    Stage.camera = new THREE.PerspectiveCamera(C.FOV, 1, C.NEAR, C.FAR);

    // свет: полусфера для мягкости и солнце с тенями
    scene.add(new THREE.HemisphereLight(L.HEMI.SKY, L.HEMI.GROUND, L.HEMI.INTENSITY));
    const sun = new THREE.DirectionalLight(L.SUN.COLOR, L.SUN.INTENSITY);
    sun.position.set(...L.SUN.POS);
    sun.castShadow = true;
    sun.shadow.mapSize.set(L.SUN.SHADOW_MAP, L.SUN.SHADOW_MAP);
    Object.assign(sun.shadow.camera, L.SUN.SHADOW_BOX);
    sun.shadow.bias = L.SUN.SHADOW_BIAS;
    scene.add(sun, sun.target);

    // земля
    const g = W.GROUND;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.SIZE, g.SIZE), Util.mat(g.COLOR, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, g.Y, g.Z);
    ground.receiveShadow = true;
    scene.add(ground);

    // дальние горы на горизонте
    const M = W.MOUNTAINS;
    for (let i = 0; i < M.COUNT; i++) {
      const h = M.H_MIN + Math.random() * M.H_RANGE;
      const m = new THREE.Mesh(new THREE.ConeGeometry(M.R_MIN + Math.random() * M.R_RANGE, h, M.SEGMENTS), Util.mat(M.COLOR, { fog: true }));
      m.position.set(M.X0 + i * M.DX + (Math.random() - 0.5) * M.JITTER, h / 2 - 2, M.Z - Math.random() * M.Z_RANGE);
      scene.add(m);
    }

    new ResizeObserver(Stage.resize).observe(view);
    Stage.resize();
  },

  resize() {
    const v = Stage.view, w = v.clientWidth, h = v.clientHeight;
    if (!w || !h) return;
    Stage.renderer.setSize(w, h, false);
    Stage.camera.aspect = w / h;
    Stage.camera.updateProjectionMatrix();
  },

  render() { Stage.renderer.render(Stage.scene, Stage.camera); },
};
