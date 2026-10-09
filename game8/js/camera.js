// ============================================================================
// camera.js — "оператор": ставит камеру над серединой ряда позади игрока, следит за игроком по
// ширине, подворачивает и кренит в повороты, добавляет покачивание, тряску и толчок угла обзора.
//
// Камера стоит над рядом позади игрока. Наклон подобран так, что нижний край кадра приходится на
// центр этого ряда, поэтому отставшие на клетку машины видны наполовину, а игрок остаётся в нижней
// трети кадра. Числа в CONFIG.CAMERA.
// ============================================================================

const Rig = {
  // состояние камеры: x плавно догоняет игрока, остальное считается при init
  cam: { x: 0, y: 0, z: 0, lookY: 0, lookZ: 0 },

  init() {
    const C = CONFIG.CAMERA, bottomZ = C.BOTTOM_ROWS_BEHIND * CONFIG.TRACK.CELL_L;
    const cam = Rig.cam;
    cam.y = C.HEIGHT;
    cam.z = bottomZ + C.BACK;
    const pitchBottom = Math.atan2(cam.y, cam.z - bottomZ);
    const pitch = pitchBottom - THREE.MathUtils.degToRad(C.FOV / 2);
    cam.lookZ = cam.z - cam.y / Math.tan(pitch);
  },

  // targetX: боковое положение игрока (логическое), t: игровое время для покачивания
  update(dt, t, targetX) {
    const C = CONFIG.CAMERA, cam = Rig.cam, camera = Stage.camera;
    cam.x += (targetX * C.FOLLOW_X - cam.x) * Math.min(1, dt * C.FOLLOW_SPEED);

    const shake = Fx.shake;
    const sx = (Math.random() - 0.5) * shake * C.SHAKE_X, sy = (Math.random() - 0.5) * shake * C.SHAKE_Y;
    camera.position.set(
      cam.x + Math.sin(t * C.SWAY.X_FREQ) * C.SWAY.X_AMP + sx,
      cam.y + Math.sin(t * C.SWAY.Y_FREQ) * C.SWAY.Y_AMP + sy,
      cam.z,
    );

    // подворот и крен в сторону поворота дороги
    const roll = Util.clamp(Bend.psi(-C.LEAN.DIST) * C.LEAN.ROLL_GAIN, -C.LEAN.ROLL_MAX, C.LEAN.ROLL_MAX);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(cam.x * C.LOOK_X + Bend.ox(-C.LEAN.DIST) * C.LEAN.LOOK + sx, cam.lookY, cam.lookZ);

    camera.fov = C.FOV + Fx.fovBoost;
    camera.updateProjectionMatrix();
  },
};
