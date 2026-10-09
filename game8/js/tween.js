// ============================================================================
// tween.js — минимальный движок анимаций. Все анимации игры (ходы, тараны, вылеты) идут через него,
// а не через setTimeout: так время течёт от кадра к кадру и паузится вместе с игрой.
//
//   await Tween.run(0.4, (k) => { ... });      // k идёт 0..1 с выбранным сглаживанием
//   await Tween.wait(0.12);                     // просто пауза, секунды
//
// Tween.update(dt) вызывается раз в кадр из main.js.
// ============================================================================

const Tween = {
  list: [],

  // fn(kEased, kRaw). Возвращает Promise, который выполняется по окончании.
  run(duration, fn, ease = Util.easeOut) {
    return new Promise(resolve => Tween.list.push({ t: 0, dur: duration, fn, ease, resolve }));
  },

  wait(seconds) { return Tween.run(seconds, () => {}, Util.linear); },

  update(dt) {
    const list = Tween.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k), k);
      if (k >= 1) { list.splice(i, 1); tw.resolve(); }
    }
  },
};
