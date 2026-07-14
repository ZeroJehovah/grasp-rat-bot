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

function combatDisadvantageConfirmationCore(input = {}, options = {}) {
  const nowMsValue = numberOrNull(input.nowMs ?? input.at);
  const nowMs = nowMsValue === null ? Date.now() : nowMsValue;
  const firstAtValue = numberOrNull(input.disadvantageSinceAt ?? input.firstAt);
  const engagedAtValue = numberOrNull(input.combatStartedAt ?? input.engagedAt);
  const firstAt = firstAtValue === null ? nowMs : firstAtValue;
  const engagedAt = engagedAtValue === null ? firstAt : engagedAtValue;
  const confirmMs = Math.max(0, firstConfiguredNumber(options, [
    'combatDisadvantageConfirmMs',
    'disadvantageConfirmMs'
  ], COMBAT_CONSTANTS.DISADVANTAGE_CONFIRM_MS));
  const minEngageMs = Math.max(0, firstConfiguredNumber(options, [
    'combatDisadvantageMinEngageMs',
    'disadvantageMinEngageMs'
  ], COMBAT_CONSTANTS.DISADVANTAGE_MIN_ENGAGE_MS));
  const minSamples = Math.max(1, Math.round(firstConfiguredNumber(options, [
    'combatDisadvantageMinSamples',
    'disadvantageMinSamples'
  ], COMBAT_CONSTANTS.DISADVANTAGE_MIN_SAMPLES)));
  const sampleCount = Math.max(1, Math.round(numberOrNull(input.sampleCount) ?? 1));
  const observedMs = Math.max(0, nowMs - firstAt);
  const engagedMs = Math.max(0, nowMs - engagedAt);
  return {
    kind: 'hp-gap',
    ready: observedMs >= confirmMs && engagedMs >= minEngageMs && sampleCount >= minSamples,
    observedMs,
    confirmMs,
    engagedMs,
    minEngageMs,
    sampleCount,
    minSamples
  };
}

function evaluateConfirmedCombatHpExitCore(input = {}, options = {}) {
  const baselineExit = evaluateCombatHpExitCore(input, options);
  if (!baselineExit || baselineExit.rule !== 'clear-hp-gap') {
    return { exit: baselineExit, baselineExit, disadvantageObservation: null };
  }
  const confirmedSelfDamage = Math.max(0, numberOrNull(input.confirmedSelfDamage ?? input.selfDamage) ?? 0);
  if (confirmedSelfDamage > 0) {
    const disadvantageObservation = {
      kind: 'confirmed-target-damage',
      ready: true,
      confirmedSelfDamage
    };
    return {
      exit: { ...baselineExit, disadvantageObservation },
      baselineExit,
      disadvantageObservation
    };
  }
  const disadvantageObservation = combatDisadvantageConfirmationCore(input, options);
  return {
    exit: disadvantageObservation.ready
      ? { ...baselineExit, disadvantageObservation }
      : null,
    baselineExit,
    disadvantageObservation
  };
}

module.exports = {
  combatDisadvantageConfirmationCore,
  combatHpExitThresholdsCore,
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore
};
