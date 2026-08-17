'use strict';

const DEFAULT_LOW_HP = 50;
const DEFAULT_HIGH_HP = 80;
const DEFAULT_LOW_HP_EQUIVALENT_DROP = 100;
const DEFAULT_HIGH_HP_EQUIVALENT_DROP = 40;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recoveryEquivalentDropForHp(hp, options = {}) {
  const value = numberOrNull(hp);
  if (value === null) return null;
  const lowHp = numberOrNull(options.recoveryPriorityLowHp) ?? DEFAULT_LOW_HP;
  const highHp = Math.max(lowHp + 1, numberOrNull(options.recoveryPriorityHighHp) ?? DEFAULT_HIGH_HP);
  const lowDrop = Math.max(0, numberOrNull(options.recoveryPriorityLowHpDrop) ?? DEFAULT_LOW_HP_EQUIVALENT_DROP);
  const highDrop = Math.max(0, numberOrNull(options.recoveryPriorityHighHpDrop) ?? DEFAULT_HIGH_HP_EQUIVALENT_DROP);
  if (value <= lowHp) return lowDrop;
  if (value >= highHp) return highDrop;
  const ratio = (value - lowHp) / (highHp - lowHp);
  return lowDrop + (highDrop - lowDrop) * ratio;
}

function profitComparisonDrop(choiceOrAction = null) {
  const value = choiceOrAction?.sourceTarget?.drop
    ?? choiceOrAction?.target?.drop
    ?? choiceOrAction?.drop
    ?? choiceOrAction?.sourceCoin?.amount
    ?? choiceOrAction?.target?.amount
    ?? choiceOrAction?.reward
    ?? choiceOrAction?.expectedReward;
  const number = numberOrNull(value);
  return number === null ? 0 : Math.max(0, number);
}

function recoveryPriorityDecision(self, opportunity = null, recoveryAction = null, options = {}) {
  const equivalentDrop = recoveryEquivalentDropForHp(self?.hp ?? self?.knownHp, options);
  const choice = opportunity?.choice || null;
  const profitDrop = profitComparisonDrop(choice || opportunity?.action || null);
  const recoveryWins = equivalentDrop !== null && (!choice || equivalentDrop >= profitDrop);
  return {
    equivalentDrop,
    profitDrop,
    recoveryWins,
    hardGate: Boolean(recoveryWins),
    reason: recoveryWins ? 'recovery-priority-at-or-above-profit' : 'profit-priority-above-recovery',
    action: recoveryAction
      ? {
          ...recoveryAction,
          recoveryPriority: {
            equivalentDrop,
            profitDrop,
            hardGate: Boolean(recoveryWins),
            reason: recoveryWins ? 'recovery-priority-at-or-above-profit' : 'profit-priority-above-recovery'
          }
        }
      : null
  };
}

module.exports = {
  DEFAULT_HIGH_HP,
  DEFAULT_HIGH_HP_EQUIVALENT_DROP,
  DEFAULT_LOW_HP,
  DEFAULT_LOW_HP_EQUIVALENT_DROP,
  profitComparisonDrop,
  recoveryEquivalentDropForHp,
  recoveryPriorityDecision
};
