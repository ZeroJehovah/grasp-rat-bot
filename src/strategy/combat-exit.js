'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstConfiguredNumber(options, keys, fallback) {
  for (const key of keys) {
    const value = numberOrNull(options?.[key]);
    if (value !== null) return value;
  }
  return fallback;
}

function combatHpExitThresholdsCore(options = {}) {
  return {
    criticalHp: Math.max(0, firstConfiguredNumber(options, [
      'criticalHp',
      'combatCriticalHp',
      'combatCriticalHpLeaveThreshold'
    ], COMBAT_CONSTANTS.CRITICAL_HP)),
    lowHp: Math.max(0, firstConfiguredNumber(options, [
      'lowHp',
      'combatLowHpLeaveThreshold',
      'combatLowHpThreshold'
    ], COMBAT_CONSTANTS.LOW_HP_THRESHOLD)),
    disadvantageHpGap: Math.max(0, firstConfiguredNumber(options, [
      'disadvantageHpGap',
      'combatHighHpDisadvantageGap',
      'combatDisadvantageHpGap'
    ], COMBAT_CONSTANTS.DISADVANTAGE_HP_GAP))
  };
}

function evaluateCombatHpExitCore(input = {}, options = {}) {
  const selfHp = numberOrNull(input.selfHp ?? input.self?.hp);
  const targetHp = numberOrNull(input.targetHp ?? input.target?.hp);
  if (selfHp === null) return null;

  const thresholds = combatHpExitThresholdsCore(options);
  const hpGap = targetHp === null ? null : targetHp - selfHp;

  if (thresholds.criticalHp > 0 && selfHp < thresholds.criticalHp) {
    return {
      shouldLeave: true,
      policy: 'static-hp',
      rule: 'critical-hp',
      reason: 'combat-critical-hp-leave',
      selfHp,
      targetHp,
      hpGap,
      threshold: thresholds.criticalHp
    };
  }

  if (targetHp !== null
    && thresholds.lowHp > 0
    && selfHp < thresholds.lowHp
    && targetHp > selfHp) {
    return {
      shouldLeave: true,
      policy: 'static-hp',
      rule: 'low-hp-behind',
      reason: 'combat-low-hp-disadvantage-leave',
      selfHp,
      targetHp,
      hpGap,
      threshold: thresholds.lowHp
    };
  }

  if (targetHp !== null
    && thresholds.disadvantageHpGap > 0
    && hpGap >= thresholds.disadvantageHpGap) {
    return {
      shouldLeave: true,
      policy: 'static-hp',
      rule: 'clear-hp-gap',
      reason: 'combat-hp-disadvantage-leave',
      selfHp,
      targetHp,
      hpGap,
      threshold: thresholds.disadvantageHpGap
    };
  }

  return null;
}

module.exports = {
  combatHpExitThresholdsCore,
  evaluateCombatHpExitCore
};
