'use strict';

const DEFAULT_LOW_HP = 50;
const DEFAULT_HIGH_HP = 80;
const DEFAULT_LOW_HP_EQUIVALENT_DROP = 100;
const DEFAULT_HIGH_HP_EQUIVALENT_DROP = 40;
const DEFAULT_LOW_HP_APPROACH_STAMINA_MILLI = 75000;
const DEFAULT_HIGH_HP_APPROACH_STAMINA_MILLI = 150000;

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

function recoveryApproachStaminaBudgetForHp(hp, options = {}) {
  const value = numberOrNull(hp);
  if (value === null) return null;
  const lowHp = numberOrNull(options.recoveryPriorityLowHp) ?? DEFAULT_LOW_HP;
  const highHp = Math.max(lowHp + 1, numberOrNull(options.recoveryPriorityHighHp) ?? DEFAULT_HIGH_HP);
  // 血量已经回到高位时不再限制接近距离: 此时被打断的沉没代价足够低。
  if (value >= highHp) return null;
  const lowBudget = Math.max(
    0,
    numberOrNull(options.recoveryPriorityLowHpApproachStaminaMilli) ?? DEFAULT_LOW_HP_APPROACH_STAMINA_MILLI
  );
  const highBudget = Math.max(
    lowBudget,
    numberOrNull(options.recoveryPriorityHighHpApproachStaminaMilli) ?? DEFAULT_HIGH_HP_APPROACH_STAMINA_MILLI
  );
  if (value <= lowHp) return lowBudget;
  const ratio = (value - lowHp) / (highHp - lowHp);
  return lowBudget + (highBudget - lowBudget) * ratio;
}

function profitApproachStaminaCost(choiceOrAction = null) {
  const value = choiceOrAction?.staminaCost
    ?? choiceOrAction?.opportunityChoice?.staminaCost
    ?? choiceOrAction?.opportunityStaminaCost;
  const number = numberOrNull(value);
  return number === null || number < 0 ? null : number;
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
  const hp = self?.hp ?? self?.knownHp;
  const equivalentDrop = recoveryEquivalentDropForHp(hp, options);
  const choice = opportunity?.choice || null;
  const target = choice || opportunity?.action || null;
  const profitDrop = profitComparisonDrop(target);
  const approachStaminaCost = profitApproachStaminaCost(target);
  const approachStaminaBudget = recoveryApproachStaminaBudgetForHp(hp, options);
  const profitWinsOnDrop = equivalentDrop !== null && Boolean(choice) && equivalentDrop < profitDrop;
  // 低血量下的长途接近极易被第三方战斗中断: 已投入的体力全额沉没且颗粒无收,
  // 所以按血量给接近成本设一个预算, 超预算时先恢复再出发。成本未知时不拦截。
  const approachTooExpensive = profitWinsOnDrop
    && approachStaminaBudget !== null
    && approachStaminaCost !== null
    && approachStaminaCost > approachStaminaBudget;
  const recoveryWins = equivalentDrop !== null && (!choice || equivalentDrop >= profitDrop || approachTooExpensive);
  const reason = !recoveryWins
    ? 'profit-priority-above-recovery'
    : (approachTooExpensive ? 'recovery-priority-low-hp-approach-cost' : 'recovery-priority-at-or-above-profit');
  const metadata = {
    equivalentDrop,
    profitDrop,
    approachStaminaCost,
    approachStaminaBudget,
    hardGate: Boolean(recoveryWins),
    reason
  };
  return {
    equivalentDrop,
    profitDrop,
    approachStaminaCost,
    approachStaminaBudget,
    approachTooExpensive,
    recoveryWins,
    hardGate: Boolean(recoveryWins),
    reason,
    action: recoveryAction ? { ...recoveryAction, recoveryPriority: metadata } : null
  };
}

module.exports = {
  DEFAULT_HIGH_HP,
  DEFAULT_HIGH_HP_APPROACH_STAMINA_MILLI,
  DEFAULT_HIGH_HP_EQUIVALENT_DROP,
  DEFAULT_LOW_HP,
  DEFAULT_LOW_HP_APPROACH_STAMINA_MILLI,
  DEFAULT_LOW_HP_EQUIVALENT_DROP,
  profitApproachStaminaCost,
  profitComparisonDrop,
  recoveryApproachStaminaBudgetForHp,
  recoveryEquivalentDropForHp,
  recoveryPriorityDecision
};
