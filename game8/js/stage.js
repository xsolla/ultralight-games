// ============================================================================
// stage.js — сцена THREE: рендерер, свет, туман, земля, горы, перспективная камера.
// Здесь только "сцена без содержимого". Дорога, обочина, машины добавляют себя в Stage.scene сами.
// Положение камеры в кадре считает camera.js. Цвета неба, тумана, света, земли и гор ставит тема (theme.js):
// здесь они создаются нейтральными, Theme.apply перекрашивает их через hemi, sun, groundMat, mountainMat.
// ============================================================================

const Stage = {
  renderer: null,
  scene: null,
  camera: null,
  view: null,
  hemi: null, sun: null, groundMat: null, mountainMat: null,

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
    scene.background = new THREE.Color();
    scene.fog = new THREE.Fog(0xffffff, 1, 2);
    Stage.scene = scene;

    Stage.camera = new THREE.PerspectiveCamera(C.FOV, 1, C.NEAR, C.FAR);

    // свет: полусфера для мягкости и солнце с тенями (цвета, яркость и положение солнца из темы)
    Stage.hemi = new THREE.HemisphereLight();
    scene.add(Stage.hemi);
    const sun = Stage.sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(L.SUN.SHADOW_MAP, L.SUN.SHADOW_MAP);
    Object.assign(sun.shadow.camera, L.SUN.SHADOW_BOX);
    sun.shadow.bias = L.SUN.SHADOW_BIAS;
    scene.add(sun, sun.target);

    // земля
    const g = W.GROUND;
    Stage.groundMat = Util.mat(0xffffff, { roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.SIZE, g.SIZE), Stage.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, g.Y, g.Z);
    ground.receiveShadow = true;
    scene.add(ground);

    // дальние горы на горизонте
    const M = W.MOUNTAINS;
    Stage.mountainMat = Util.mat(0xffffff, { fog: true });
    for (let i = 0; i < M.COUNT; i++) {
      const h = M.H_MIN + Math.random() * M.H_RANGE;
      const m = new THREE.Mesh(new THREE.ConeGeometry(M.R_MIN + Math.random() * M.R_RANGE, h, M.SEGMENTS), Stage.mountainMat);
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
