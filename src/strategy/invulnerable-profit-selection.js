'use strict';

const DEFAULT_INVULNERABLE_PROFIT_SELECTION = Object.freeze({
  fullSpeedCmPerSec: 950,
  moveStaminaPerCm: 1,
  waitStaminaWeight: 0.5,
  staminaFloor: 1
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function invulnerableProfitSelectionCostCore(input = {}, options = {}) {
  const staminaFloor = Math.max(1, Number(
    options.staminaFloor
      ?? options.opportunityDistanceFloor
      ?? DEFAULT_INVULNERABLE_PROFIT_SELECTION.staminaFloor
  ) || DEFAULT_INVULNERABLE_PROFIT_SELECTION.staminaFloor);
  const actualStaminaCost = finiteNumber(input.staminaCost);
  const actualEffectiveStaminaCost = actualStaminaCost === null
    ? null
    : Math.max(staminaFloor, Math.max(0, actualStaminaCost));
  const remainingMs = finiteNumber(input.invulnerableRemainingMs);
  const approachEtaMs = finiteNumber(input.approachEtaMs);
  const invulnerable = input.invulnerable === true || (remainingMs !== null && remainingMs > 0);
  const base = {
    algorithm: 'wait-stamina-half-weight',
    applied: false,
    reason: '',
    actualStaminaCost,
    selectionStaminaCost: actualStaminaCost,
    selectionNetROI: null,
    approachEtaMs,
    invulnerableRemainingMs: remainingMs,
    arrivalRemainingMs: 0,
    waitEquivalentStamina: 0,
    weightedWaitStamina: 0,
    waitStaminaWeight: Math.max(0, Number(
      options.waitStaminaWeight
        ?? options.invulnerableProfitWaitStaminaWeight
        ?? DEFAULT_INVULNERABLE_PROFIT_SELECTION.waitStaminaWeight
    ) || 0),
    selectionScoreMultiplier: 1
  };
  const reward = finiteNumber(input.expectedReward ?? input.reward);
  if (reward !== null && reward > 0 && actualStaminaCost !== null && actualEffectiveStaminaCost > 0) {
    base.selectionNetROI = reward / actualEffectiveStaminaCost;
  }
  if (actualStaminaCost === null || actualStaminaCost < 0) return { ...base, reason: 'invalid-stamina-cost' };
  if (!invulnerable) return { ...base, reason: 'not-invulnerable' };
  if (remainingMs === null || remainingMs < 0) return { ...base, reason: 'unknown-invulnerability-duration' };
  if (approachEtaMs === null || approachEtaMs < 0) return { ...base, reason: 'unknown-approach-eta' };

  const arrivalRemainingMs = Math.max(0, remainingMs - approachEtaMs);
  if (!(arrivalRemainingMs > 0)) return { ...base, reason: 'invulnerability-ends-before-arrival' };
  const fullSpeedCmPerSec = Math.max(0, Number(
    options.fullSpeedCmPerSec
      ?? options.invulnerableProfitSelectionFullSpeedCmPerSec
      ?? options.invulnerableProfitAxisSpeedCmPerSec
      ?? DEFAULT_INVULNERABLE_PROFIT_SELECTION.fullSpeedCmPerSec
  ) || 0);
  const moveStaminaPerCm = Math.max(0, Number(
    options.moveStaminaPerCm
      ?? options.opportunityMoveStaminaPerCm
      ?? DEFAULT_INVULNERABLE_PROFIT_SELECTION.moveStaminaPerCm
  ) || 0);
  const waitEquivalentStamina = arrivalRemainingMs / 1000 * fullSpeedCmPerSec * moveStaminaPerCm;
  const weightedWaitStamina = waitEquivalentStamina * base.waitStaminaWeight;
  const selectionStaminaCost = actualStaminaCost + weightedWaitStamina;
  const selectionEffectiveStaminaCost = Math.max(staminaFloor, selectionStaminaCost);
  return {
    ...base,
    applied: weightedWaitStamina > 0,
    reason: weightedWaitStamina > 0 ? 'arrival-wait-stamina-penalty' : 'zero-wait-stamina-penalty',
    selectionStaminaCost,
    selectionNetROI: reward !== null && reward > 0 ? reward / selectionEffectiveStaminaCost : null,
    arrivalRemainingMs,
    waitEquivalentStamina,
    weightedWaitStamina,
    fullSpeedCmPerSec,
    moveStaminaPerCm,
    selectionScoreMultiplier: actualEffectiveStaminaCost / selectionEffectiveStaminaCost
  };
}

module.exports = {
  DEFAULT_INVULNERABLE_PROFIT_SELECTION,
  invulnerableProfitSelectionCostCore
};
