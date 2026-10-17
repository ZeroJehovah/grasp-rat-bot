'use strict';

const COMBAT_FIRE_WINDOW_MS = 5000;
const COMBAT_FIRE_BUDGET_MILLI = 5000;

function shotStaminaCostMilli(value) {
  const cost = Number(value);
  return Number.isFinite(cost) && cost > 0 ? cost : 500;
}

function usesCombatStaminaWindow(target, role = '') {
  if (!target) return false;
  const targetRole = String(role || target.combatRole || '').toLowerCase();
  if (targetRole === 'secondary') return true;
  if (targetRole === 'primary' || targetRole === 'current') {
    return target.active === true
      || target.current_join_mode === 'Active'
      || target.currentJoinMode === 'Active'
      || target.mode === 'Active'
      || target.firing === true;
  }
  return target.active === true || target.current_join_mode === 'Active';
}

// A dispatch reserves its whole cost before an ACK can arrive. Keep it until
// expiry even on a missing ACK: it may already have consumed server stamina.
// A rolling window also bounds every server refill window without guessing its phase.
function combatStaminaWindowCore(dispatches = [], nowMs = Date.now(), nextCost = 500) {
  const cutoff = nowMs - COMBAT_FIRE_WINDOW_MS;
  let spentMilli = 0;
  let dispatchCount = 0;
  let nextAvailableAtMs = null;
  const shotCostMilli = shotStaminaCostMilli(nextCost);
  for (const dispatch of dispatches) {
    if (dispatch.executionClass && dispatch.executionClass !== 'combat') continue;
    const at = Number(dispatch.requestedAtMs);
    if (!Number.isFinite(at) || at <= cutoff) continue;
    spentMilli += shotStaminaCostMilli(dispatch.shotCostMilli);
    dispatchCount += 1;
  }
  if (spentMilli + shotCostMilli > COMBAT_FIRE_BUDGET_MILLI) {
    // Entries are recorded in dispatch order. Future entries are retained on a
    // backwards clock so a clock adjustment cannot grant another fire budget.
    let remainingSpent = spentMilli;
    for (const dispatch of dispatches) {
      if (dispatch.executionClass && dispatch.executionClass !== 'combat') continue;
      const at = Number(dispatch.requestedAtMs);
      if (!Number.isFinite(at) || at <= cutoff) continue;
      remainingSpent -= shotStaminaCostMilli(dispatch.shotCostMilli);
      if (remainingSpent + shotCostMilli <= COMBAT_FIRE_BUDGET_MILLI) {
        nextAvailableAtMs = at + COMBAT_FIRE_WINDOW_MS;
        break;
      }
    }
  }
  return {
    windowMs: COMBAT_FIRE_WINDOW_MS,
    limitMilli: COMBAT_FIRE_BUDGET_MILLI,
    spentMilli,
    remainingMilli: Math.max(0, COMBAT_FIRE_BUDGET_MILLI - spentMilli),
    shotCostMilli,
    dispatchCount,
    allowed: spentMilli + shotCostMilli <= COMBAT_FIRE_BUDGET_MILLI,
    nextAvailableAtMs
  };
}

module.exports = {
  COMBAT_FIRE_WINDOW_MS,
  shotStaminaCostMilli,
  usesCombatStaminaWindow,
  combatStaminaWindowCore
};
