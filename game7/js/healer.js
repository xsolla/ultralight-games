// ============================================================================
// healer.js — the medic's flying and healing (CLAUDE.md §7.9). It repairs the
// damaged ship farthest from the planet first, pays for every point out of its
// own hull, and fades out — never explodes — when it has nothing left to give.
// With nothing to heal it hovers just above the planet. Reuses steerShip() from
// ships.js; no drawing.
//
// With more than one medic in the air, each keeps its own patient locked
// until it's full or gone (see updateHealers), and a medic picking a NEW
// patient skips anyone another active medic already has locked — so two
// medics never converge on the same ship. One left over with nothing
// unclaimed to heal just hovers, same as having nothing to heal at all.
// ============================================================================

// ---- Tunables ------------------------------------------------------------------
const HEALER_FADE_MS     = 900;   // the disappearance, once its budget is spent
const HEALER_HOVER_Y     = LAYOUT.HORIZON - 36;   // where an idle medic waits
const HEALER_HOVER_X     = 70;    // px either side of centre it drifts over
const HEALER_HOVER_SPEED = 0.3;   // fraction of top speed while waiting
const HEALER_FOLLOW      = 0.6;   // inside healRange x this it matches its patient's pace

function updateHealers(ships, dt) {
  for (const h of ships) {
    if (h.kind !== 'healer' || h.dead) continue;

    if (h.hp <= 0) {
      // Out of hull. It drifts on its last heading while it fades — a medic that
      // stopped dead mid-air would read as having been shot. Release its patient
      // claim so another medic can take over.
      h.healTarget = 0;
      h.fade -= dt / HEALER_FADE_MS;
      thrust(h, h.topSpeed * HEALER_HOVER_SPEED, dt);
      if (h.fade <= 0) h.dead = true;
      continue;
    }

    // Keep the patient until it is full or gone, so the medic finishes a job
    // instead of twitching between two ships of nearly equal priority.
    let t = h.healTarget ? ships.find((s) => s.id === h.healTarget) : null;
    if (!t || t.dead || t.hp >= t.maxHp) t = pickPatient(ships, h);
    h.healTarget = t ? t.id : 0;

    if (!t) { hover(h, dt); continue; }

    const d = Math.hypot(t.x - h.x, t.y - h.y);
    const close = d < HEALER.healRange * HEALER_FOLLOW;
    steerShip(h, t.x, t.y, close ? HEALER_HOVER_SPEED : 1, dt);
    if (d <= HEALER.healRange) {
      const amt = Math.min(HEALER.healRate * dt / 1000, t.maxHp - t.hp, h.hp);
      t.hp += amt;
      h.hp -= amt;
    }
  }
}

// The damaged ship farthest from the planet's centre, excluding anyone another
// active medic already has locked as ITS patient (below). The medic is never
// a patient itself.
function pickPatient(ships, self) {
  let best = null, bestD = -1;
  for (const s of ships) {
    if (s.kind !== 'ship' || s.dead || s.hp >= s.maxHp) continue;
    if (claimedByOtherHealer(ships, s.id, self)) continue;
    const d = Math.hypot(s.x - PLANET_CX, s.y - PLANET_CY);
    if (d > bestD) { best = s; bestD = d; }
  }
  return best;
}

// Is some OTHER live medic already flying to heal `targetId`? A medic that has
// run out of hull has released its claim (see updateHealers) even though it
// hasn't fully faded yet.
function claimedByOtherHealer(ships, targetId, self) {
  for (const s of ships) {
    if (s !== self && s.kind === 'healer' && !s.dead && s.hp > 0 && s.healTarget === targetId) return true;
  }
  return false;
}

function hover(h, dt) {
  if (!h.wp || Math.hypot(h.wp.x - h.x, h.wp.y - h.y) < 12) {
    h.wp = {
      x: PLANET_CX + (Math.random() * 2 - 1) * HEALER_HOVER_X,
      y: HEALER_HOVER_Y + (Math.random() * 2 - 1) * 10,
    };
  }
  steerShip(h, h.wp.x, h.wp.y, HEALER_HOVER_SPEED, dt);
}
