// ============================================================================
// spawner.js — the waves (CLAUDE.md §7.8): the clock — an opening break, then
// waves that spawn for SPAWN_WINDOW_MS and last until their enemies are gone,
// with a rolled break between each — and the plan of what each wave sends,
// from WAVE_RAMP. Decides WHAT and WHEN; enemies.js and meteors.js build the
// entities. Pure functions over Game.waves; no drawing, no movement.
// ============================================================================

function resetWaves(w) {
  w.wave = 0;              // the wave in progress, or the last one finished
  w.phase = 'break';       // 'break' | 'wave'
  w.ms = WAVES.OPENING_BREAK_MS;   // break: time left before the next wave
  w.spawnMs = 0;           // wave: spawn window left
  w.plan = [];             // wave: [{ at, kind, t }] sorted by `at` (ms into the window)
  w.next = 0;              // index of the next event in `plan`
}

// What wave n sends: its chains, shooter groups and meteors, shuffled together
// and spread across the window with jitter, so the kinds interleave rather than
// arriving in blocks. Types are a flat roll among those unlocked by wave n —
// none is a harder version of another, so an unpredictable order is what stops
// a run becoming a rota.
function planWave(n) {
  const R = WAVE_RAMP;
  const passives = [], shooters = [], rocks = [];
  ENEMY_TYPES.forEach((t, i) => { if (t.from <= n) (t.shoots ? shooters : passives).push(i); });
  METEOR_TYPES.forEach((t, i) => { if (t.from <= n) rocks.push(i); });

  const events = [];
  const chains = R.CHAINS[0] + Math.floor(R.CHAINS[1] * (n - 1));
  for (let i = 0; i < chains; i++) events.push({ kind: 'chain', t: pick(passives) });
  const groups = Math.floor(R.GROUPS[0] + R.GROUPS[1] * n);
  for (let i = 0; i < groups; i++) events.push({ kind: 'group', t: pick(shooters) });
  const meteors = n >= R.METEOR_DOUBLE_FROM ? 2
                : n >= R.METEOR_EVERY_FROM ? 1
                : n >= R.METEOR_FROM && (n - R.METEOR_FROM) % 2 === 0 ? 1 : 0;
  for (let i = 0; i < meteors && rocks.length; i++) events.push({ kind: 'meteor', t: pick(rocks) });

  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }
  const span = R.LAST_EVENT_MS - R.FIRST_EVENT_MS;
  events.forEach((e, i) => {
    const even = events.length > 1 ? R.FIRST_EVENT_MS + span * i / (events.length - 1) : R.FIRST_EVENT_MS;
    e.at = clamp(even + (Math.random() * 2 - 1) * R.JITTER_MS, 0, WAVES.SPAWN_WINDOW_MS);
  });
  return events.sort((a, b) => a.at - b.at);
}

// Advance the clock and spawn whatever is due into the lists. Every enemy and
// meteor alive belongs to the current wave — the next one cannot start until
// they are gone — so "the wave's enemies" is simply both lists' length.
// Returns 'waveStart', 'waveClear' or null, so game.js can announce the edges
// without this file knowing about sound or the HUD.
function updateWaves(w, dt, enemies, meteors) {
  if (w.phase === 'break') {
    w.ms -= dt;
    if (w.ms > 0) return null;
    w.wave++;
    w.phase = 'wave';
    w.spawnMs = WAVES.SPAWN_WINDOW_MS;
    w.plan = planWave(w.wave);
    w.next = 0;
    return 'waveStart';
  }
  if (w.spawnMs > 0) {
    w.spawnMs = Math.max(0, w.spawnMs - dt);
    const elapsed = WAVES.SPAWN_WINDOW_MS - w.spawnMs;
    while (w.next < w.plan.length && w.plan[w.next].at <= elapsed) {
      const ev = w.plan[w.next++];
      if (ev.kind === 'chain') spawnChain(enemies, ev.t, w.wave);
      else if (ev.kind === 'group') spawnGroup(enemies, ev.t, w.wave);
      else spawnMeteor(meteors, ev.t, w.wave);
    }
    return null;
  }
  if (enemies.length + meteors.length > 0) return null;
  w.phase = 'break';
  w.ms = randRange(WAVES.BREAK_MS);
  return 'waveClear';
}
