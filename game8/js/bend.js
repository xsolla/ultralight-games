// ============================================================================
// bend.js — изгиб дороги.
//
// Логика игры остаётся на прямой сетке. Изгиб чисто визуальный: у каждой точки мира есть "логическая"
// позиция (x поперёк дороги, z вдоль, вперёд это -z), а на экран она попадает со сдвигом Bend.ox(z) и
// разворотом Bend.yaw(z). Дорога, обочина, машины, развилки, искры, камера: всё проходит через эти две функции.
//
// Кривизна k(u) задана по пройденному пути u (Bend.odo), поэтому повороты сами "наезжают" на игрока.
// Под игроком дорога всегда прямая, впереди она уходит вбок всё сильнее. Профиль k(u) строится один раз
// из генератора с зерном (CONFIG.BEND), так что трасса одна и та же при каждом запуске.
//
// Таблицы bendOx / bendPsi пересчитываются раз в кадр (Bend.rebuild) по расстоянию вперёд d = -z:
//   psi(d) угол дороги относительно направления под игроком, ox(d) = интеграл psi, боковой сдвиг.
// ============================================================================

const Bend = (() => {
  const B = CONFIG.BEND;
  const D_MIN = B.D_MIN, D_MAX = B.D_MAX, ND = D_MAX - D_MIN + 1, J0 = -D_MIN;
  let kTable = null;
  const bendOx = new Float32Array(ND), bendPsi = new Float32Array(ND);

  // Профиль кривизны: чередование прямых и поворотов, дважды сглаженное скользящим средним
  function buildProfile() {
    const rnd = Util.rng(B.SEED);
    const raw = new Float32Array(B.PERIOD);
    let u = B.START, sign = rnd() < 0.5 ? -1 : 1;
    while (u < B.PERIOD - B.TAIL) {
      const len = B.CURVE_LEN + rnd() * B.CURVE_LEN_RANGE, k = sign * (B.K + rnd() * B.K_RANGE);
      raw.fill(k, u, Math.min(B.PERIOD, u + len)); u += len;
      sign = rnd() < B.FLIP_CHANCE ? -sign : sign;
      u += rnd() < B.S_CHANCE ? 0 : B.STRAIGHT + rnd() * B.STRAIGHT_RANGE;
    }
    let a = raw, b = new Float32Array(B.PERIOD);
    const W = B.SMOOTH_W;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < B.PERIOD; i++) {
        let s = 0;
        for (let j = -W; j <= W; j++) s += a[(i + j + B.PERIOD) % B.PERIOD];
        b[i] = s / (2 * W + 1);
      }
      [a, b] = [b, a];
    }
    return a;
  }

  function kAt(u) {
    u = ((u % B.PERIOD) + B.PERIOD) % B.PERIOD;
    const i = u | 0, f = u - i;
    return kTable[i] * (1 - f) + kTable[(i + 1) % B.PERIOD] * f;
  }

  function sample(arr, z) {
    let f = -z - D_MIN;
    f = f < 0 ? 0 : f > ND - 1 ? ND - 1 : f;
    const i = Math.min(f | 0, ND - 2), t = f - i;
    return arr[i] * (1 - t) + arr[i + 1] * t;
  }

  const api = {
    odo: 0,            // пройденный путь, по нему бежит профиль кривизны

    init() { kTable = buildProfile(); },

    rebuild() {
      const sc = B.SCALE, odo = api.odo;
      bendPsi[J0] = 0; bendOx[J0] = 0;
      for (let j = J0 + 1; j < ND; j++) {
        bendPsi[j] = bendPsi[j - 1] + sc * kAt(odo + (j - 1 - J0) + 0.5);
        bendOx[j] = bendOx[j - 1] + 0.5 * (bendPsi[j - 1] + bendPsi[j]);
      }
      for (let j = J0 - 1; j >= 0; j--) {
        bendPsi[j] = bendPsi[j + 1] - sc * kAt(odo + (j - J0) + 0.5);
        bendOx[j] = bendOx[j + 1] - 0.5 * (bendPsi[j + 1] + bendPsi[j]);
      }
    },

    ox: z => sample(bendOx, z),                       // боковой сдвиг дороги на логической позиции z
    psi: z => sample(bendPsi, z),                     // угол дороги (тангенс) на z
    yaw: z => -Math.atan(sample(bendPsi, z)),         // поворот объекта вокруг вертикали вдоль дороги
  };
  return api;
})();
