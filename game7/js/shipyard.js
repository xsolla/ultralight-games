// ============================================================================
// shipyard.js — what an order costs, whether it may be placed, and the build
// queue that turns orders into launches. Pure functions over a plain `yard`
// object that Game owns ({ queue, ms }); no drawing, no money handling — game.js
// spends the money and launches what comes out.
//
// An order is { kind: 'ship', hull, gun, level } or { kind: 'healer' }.
// ============================================================================

// Level L costs GUN_PRICE x basePrice x the sum of the gun's first L levelCost
// entries: X, then +1.5X, +2X ... (CLAUDE.md §7.2).
function gunPrice(gunIdx, level) {
  const g = GUNS[gunIdx];
  let sum = 0;
  for (let i = 0; i < level; i++) sum += g.levelCost[i];
  return Math.round(BASE.GUN_PRICE * g.basePrice * sum);
}

function canMount(hullIdx, gunIdx) {
  const m = GUNS[gunIdx].mountOn;
  return !m || m.includes(hullIdx);
}

function orderPrice(o) {
  return o.kind === 'healer' ? HEALER.price : HULLS[o.hull].price + gunPrice(o.gun, o.level);
}

function orderBuildMs(o) {
  return o.kind === 'healer' ? HEALER.buildMs : HULLS[o.hull].buildMs;
}

// Why an order cannot be placed right now, or null if it can. One function for
// both the BUILD button's label and the press itself, so the button can never
// promise something the press then refuses.
function orderBlocker(o, phase, money) {
  if (o.kind === 'healer' && phase !== 'break') return 'BETWEEN WAVES ONLY';
  if (o.kind === 'ship' && !canMount(o.hull, o.gun)) return 'TAHYON ONLY';
  const short = orderPrice(o) - money;
  if (short > 0) return 'NEED $' + short;
  return null;
}

function resetShipyard(yard) {
  yard.queue.length = 0;
  yard.ms = 0;
}

// Advance the order at the head of the queue. Returns the order that finished
// this frame, or null. One launch per frame at most: the next order starts from
// zero rather than inheriting the overflow, so two ships never leave the pad on
// the same frame and stack into one sprite.
function updateShipyard(yard, dt) {
  if (!yard.queue.length) { yard.ms = 0; return null; }
  yard.ms += dt;
  const head = yard.queue[0];
  if (yard.ms < orderBuildMs(head)) return null;
  yard.queue.shift();
  yard.ms = 0;
  return head;
}

// 0..1 through the order being built, for the build button's progress bar.
function yardProgress(yard) {
  return yard.queue.length ? Math.min(1, yard.ms / orderBuildMs(yard.queue[0])) : 0;
}
