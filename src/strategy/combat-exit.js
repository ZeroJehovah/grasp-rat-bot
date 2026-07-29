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

  if (thresholds.criticalHp > 0 && selfHp <= thresholds.criticalHp) {
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

function evaluatePredictedLeaveHpCore(input = {}, options = {}) {
  const selfHp = numberOrNull(input.selfHp ?? input.self?.hp);
  if (selfHp === null) return null;
  const baseWindowMs = Math.max(1000, firstConfiguredNumber(options, [
    'leavePredictionWindowMs',
    'combatLeavePredictionWindowMs'
  ], 1000));
  const commandDelayMs = Math.max(0, numberOrNull(
    input.commandDelayMs
      ?? options.leavePredictionCommandDelayMs
      ?? options.combatLeavePredictionCommandDelayMs
  ) ?? 250);
  const windowMs = baseWindowMs + commandDelayMs;
  const damagePerHit = Math.max(0.1, firstConfiguredNumber(options, [
    'leavePredictionDamagePerHit',
    'combatLeavePredictionDamagePerHit',
    'opportunityEstimatedDamagePerShot'
  ], 3));
  const directHits = Math.max(0, Math.round(numberOrNull(input.directHits) ?? 0));
  const unavoidableHits = Math.max(0, Math.round(numberOrNull(input.unavoidableHits) ?? 0));
  const collisionHits = Math.max(directHits, unavoidableHits);
  const collisionDamage = collisionHits * damagePerHit;
  const recentDamage = Math.max(0, numberOrNull(input.recentDamage) ?? 0);
  const recentDamageWindowMs = Math.max(0, numberOrNull(input.recentDamageWindowMs) ?? 0);
  const sampleDamageRateHpPerMs = recentDamage > 0 && recentDamageWindowMs >= 100
    ? recentDamage / recentDamageWindowMs
    : 0;
  const latchedDamageRateHpPerMs = Math.max(0, numberOrNull(input.latchedDamageRateHpPerSecond) ?? 0) / 1000;
  const damageRateHpPerMs = Math.max(sampleDamageRateHpPerMs, latchedDamageRateHpPerMs);
  const rateDamage = damageRateHpPerMs > 0
    ? Math.ceil(damageRateHpPerMs * windowMs * 10) / 10
    : 0;
  const predictedDamage = Math.min(selfHp, Math.max(collisionDamage, rateDamage));
  const uncertaintyDamage = Math.max(0, firstConfiguredNumber(options, [
    'leavePredictionUncertaintyDamage',
    'combatLeavePredictionUncertaintyDamage'
  ], damagePerHit * 2));
  const predictedHp = selfHp - predictedDamage;
  const riskAdjustedHp = predictedHp - uncertaintyDamage;
  const survivalMarginHp = Math.max(0, firstConfiguredNumber(options, [
    'leavePredictionSurvivalMarginHp',
    'combatLeavePredictionSurvivalMarginHp',
    'criticalHp',
    'combatCriticalHp',
    'combatCriticalHpLeaveThreshold'
  ], COMBAT_CONSTANTS.LEAVE_SURVIVAL_MARGIN_HP));
  const shouldLeave = predictedDamage > 0 && riskAdjustedHp <= survivalMarginHp;
  return {
    shouldLeave,
    policy: 'predicted-leave-hp',
    rule: shouldLeave ? 'predicted-survival-margin' : 'predicted-survivable',
    reason: shouldLeave ? 'combat-predicted-leave-hp' : 'combat-predicted-hp-acceptable',
    selfHp,
    predictedHp: Math.round(predictedHp * 10) / 10,
    riskAdjustedHp: Math.round(riskAdjustedHp * 10) / 10,
    predictedDamage: Math.round(predictedDamage * 10) / 10,
    collisionDamage: Math.round(collisionDamage * 10) / 10,
    rateDamage: Math.round(rateDamage * 10) / 10,
    directHits,
    unavoidableHits,
    damagePerHit,
    recentDamage: Math.round(recentDamage * 10) / 10,
    recentDamageWindowMs: Math.round(recentDamageWindowMs),
    sampleDamageRateHpPerSecond: Math.round(sampleDamageRateHpPerMs * 1000 * 10) / 10,
    latchedDamageRateHpPerSecond: Math.round(latchedDamageRateHpPerMs * 1000 * 10) / 10,
    damageRateHpPerSecond: Math.round(damageRateHpPerMs * 1000 * 10) / 10,
    baseWindowMs,
    commandDelayMs,
    windowMs,
    uncertaintyDamage,
    survivalMarginHp
  };
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

function evaluateCombatExchangeStopLossCore(input = {}, options = {}) {
  const engagedMs = Math.max(0, Number(input.engagedMs || 0));
  const acceptedShots = Math.max(0, Number(input.acceptedShots || 0));
  const damageObservations = Math.max(0, Number(input.damageObservations || 0));
  const selfHp = numberOrNull(input.selfHp);
  const targetHp = numberOrNull(input.targetHp);
  const selfDamage = Math.max(0, Number(input.windowSelfDamage || 0));
  const targetDamage = Math.max(0, Number(input.windowTargetDamage || 0));
  const longSelfDamage = Math.max(0, Number(input.longWindowSelfDamage ?? selfDamage));
  const longTargetDamage = Math.max(0, Number(input.longWindowTargetDamage ?? targetDamage));
  const distanceProgressCm = Number(input.distanceProgressCm || 0);
  const ready = engagedMs >= Math.max(8000, Number(options.exchangeMinEngageMs || 8000))
    && acceptedShots >= Math.max(10, Number(options.exchangeMinAcceptedShots || 10))
    && damageObservations >= Math.max(4, Number(options.exchangeMinDamageObservations || 4));
  const targetDps = targetDamage / Math.max(1, Number(input.windowMs || 10000) / 1000);
  const selfDps = selfDamage / Math.max(1, Number(input.windowMs || 10000) / 1000);
  const ttkMs = targetHp !== null && targetDps > 0 ? targetHp / targetDps * 1000 : Infinity;
  const ttdMs = selfHp !== null && selfDps > 0 ? selfHp / selfDps * 1000 : Infinity;
  const lowHpFinishProtected = targetHp !== null && selfHp !== null
    && targetHp <= 20
    && selfHp >= targetHp + 10
    && Number(input.recentTargetDamage || 0) > 0
    && ttkMs < ttdMs;
  const closePressure = input.closePressure === true;
  const closePressureMinSelfHp = Math.max(0, Number(
    options.closePressureMinSelfHp ?? options.combatClosePressureMinSelfHp ?? 60
  ));
  const closePressureMaxHpGap = Math.max(0, Number(
    options.closePressureMaxHpGap ?? options.combatClosePressureMaxHpGap ?? 20
  ));
  const closePressureContinuation = Boolean(
    closePressure
      && selfHp !== null
      && selfHp >= closePressureMinSelfHp
      && (targetHp === null || targetHp - selfHp < closePressureMaxHpGap)
      && !lowHpFinishProtected
  );
  let rule = '';
  if (ready && !lowHpFinishProtected) {
    if (selfDamage - targetDamage >= 12 && targetHp !== null && selfHp !== null && targetHp >= selfHp) {
      rule = 'negative-damage-exchange';
    } else if (Number.isFinite(ttdMs) && ttdMs * 1.25 < ttkMs && targetHp !== null && targetHp > 25) {
      rule = 'ttd-below-ttk';
    } else if (engagedMs >= 20000 && longTargetDamage < 6 && longSelfDamage >= 9 && distanceProgressCm < 500) {
      rule = 'long-no-progress-loss';
    }
  }
  const nowMs = Number(input.nowMs || Date.now());
  const previousSince = Number(input.degradationSinceAt || 0);
  const degradationSinceAt = rule ? (previousSince || nowMs) : 0;
  const confirmMs = Math.max(2500, Number(options.exchangeConfirmMs || 2750));
  const triggered = Boolean(rule && nowMs - degradationSinceAt >= confirmMs);
  const defensive = Boolean(input.defensive);
  const cumulativeSelfDamage = Math.max(0, Number(input.cumulativeSelfDamage ?? longSelfDamage));
  const cumulativeTargetDamage = Math.max(0, Number(input.cumulativeTargetDamage ?? longTargetDamage));
  const cumulativeDamageRatio = cumulativeTargetDamage > 0
    ? cumulativeSelfDamage / cumulativeTargetDamage
    : (cumulativeSelfDamage > 0 ? null : 0);
  const poorExchangeMinEngageMs = Math.max(60000, Number(options.poorExchangeMinEngageMs ?? 60000));
  const poorExchangeDamageRatioThreshold = Math.max(1, Number(options.poorExchangeDamageRatio ?? 1.5));
  const poorExchangeSelfHpThreshold = Math.max(1, Number(options.poorExchangeSelfHp ?? 60));
  const poorExchangeTargetHpThreshold = Math.max(0, Number(options.poorExchangeTargetHp ?? 40));
  const poorExchangeRatioExceeded = cumulativeTargetDamage > 0
    ? cumulativeDamageRatio > poorExchangeDamageRatioThreshold
    : cumulativeSelfDamage > 0;
  const severePoorExchange = Boolean(
    engagedMs > poorExchangeMinEngageMs
      && poorExchangeRatioExceeded
      && targetHp !== null
      && targetHp > poorExchangeTargetHpThreshold
      && selfHp !== null
      && selfHp < poorExchangeSelfHpThreshold
      && !lowHpFinishProtected
  );
  const effectiveRule = severePoorExchange ? 'severe-cumulative-poor-exchange' : rule;
  const effectiveTriggered = Boolean(severePoorExchange || triggered);
  const observeMs = Math.max(30000, Number(options.exchangeObserveMs || 30000));
  const disengageMs = Math.max(observeMs, Number(options.exchangeDisengageMs || 45000));
  const exitEngageMs = Math.max(disengageMs, Number(options.exchangeExitEngageMs || 60000));
  const retreatMinMs = Math.max(8000, Math.min(12000, Number(options.exchangeRetreatMinMs || 10000)));
  const retreatSelfDamageThreshold = Math.max(1, Number(options.exchangeRetreatSelfDamageHp || 12));
  const retreatTargetDamageMax = Math.max(0, Number(options.exchangeRetreatTargetDamageMaxHp || 3));
  const retreatNewSelfDamageExit = Math.max(1, Number(options.exchangeRetreatNewSelfDamageExitHp || 6));
  const recentNoHit = Number(input.recentTargetDamage || 0) <= 0;
  const retreatEligible = defensive
    && engagedMs >= disengageMs
    && cumulativeSelfDamage >= retreatSelfDamageThreshold
    && cumulativeTargetDamage <= retreatTargetDamageMax
    && recentNoHit
    && !lowHpFinishProtected
    && !closePressureContinuation;
  const previousRetreatSinceAt = Math.max(0, Number(input.retreatSinceAt || 0));
  const retreatSinceAt = closePressureContinuation
    ? 0
    : (retreatEligible ? (previousRetreatSinceAt || nowMs) : previousRetreatSinceAt);
  const retreatSelfDamageBaseline = retreatSinceAt
    ? Math.max(0, Number(input.retreatSelfDamageBaseline ?? cumulativeSelfDamage))
    : 0;
  const retreatTargetDamageBaseline = retreatSinceAt
    ? Math.max(0, Number(input.retreatTargetDamageBaseline ?? cumulativeTargetDamage))
    : 0;
  const newSelfDamageSinceRetreat = retreatSinceAt
    ? Math.max(0, cumulativeSelfDamage - retreatSelfDamageBaseline)
    : 0;
  const newTargetDamageSinceRetreat = retreatSinceAt
    ? Math.max(0, cumulativeTargetDamage - retreatTargetDamageBaseline)
    : 0;
  const distance = numberOrNull(input.distance);
  const safeDistanceCm = Math.max(0, Number(options.exchangeSafeDistanceCm
    ?? input.safeDistanceCm
    ?? 17000));
  const recentThreatBulletCount = Math.max(0, Number(input.recentThreatBulletCount || 0));
  const safeDistanceReached = Boolean(
    distance !== null
      && distance >= safeDistanceCm
      && recentThreatBulletCount === 0
  );
  const disengage = Boolean(retreatSinceAt && !lowHpFinishProtected && !closePressureContinuation);
  const shouldExit = Boolean(
    severePoorExchange
      || (disengage
        && !safeDistanceReached
        && cumulativeTargetDamage <= retreatTargetDamageMax
        && nowMs - retreatSinceAt >= retreatMinMs
        && (engagedMs >= exitEngageMs || newSelfDamageSinceRetreat >= retreatNewSelfDamageExit))
  );
  const phase = shouldExit
    ? 'exit'
    : (closePressureContinuation
        ? 'close-pressure'
        : (disengage ? 'retreat' : (defensive && engagedMs >= observeMs ? 'observe' : '')));
  const phasedReason = shouldExit
    ? (severePoorExchange ? 'combat-exit-poor-exchange' : 'defensive-exchange-no-progress-leave')
    : (closePressureContinuation
        ? 'close-pressure-continue'
        : (disengage
            ? 'defensive-exchange-no-progress-disengage'
            : (phase === 'observe' ? 'defensive-exchange-observe' : '')));
  return {
    ready,
    active: Boolean(effectiveRule),
    triggered: effectiveTriggered,
    rule: effectiveRule,
    reason: severePoorExchange
      ? 'combat-exit-poor-exchange'
      : (triggered ? `combat-exchange-stop-loss-${rule}` : (rule ? 'combat-exchange-degrading' : 'combat-exchange-acceptable')),
    degradationSinceAt,
    confirmMs,
    exchangeWindow: {
      windowMs: Number(input.windowMs || 10000),
      selfDamage,
      targetDamage,
      longSelfDamage,
      longTargetDamage,
      distanceProgressCm
    },
    ttdMs: Number.isFinite(ttdMs) ? Math.round(ttdMs) : null,
    ttkMs: Number.isFinite(ttkMs) ? Math.round(ttkMs) : null,
    damageRatio: targetDamage > 0 ? Number((selfDamage / targetDamage).toFixed(3)) : (selfDamage > 0 ? null : 0),
    confirmedShotCount: acceptedShots,
    damageObservations,
    lowHpFinishProtected,
    defensive,
    closePressure,
    closePressureContinuation,
    closePressureMinSelfHp,
    closePressureMaxHpGap,
    phase,
    observing: phase === 'observe',
    disengage,
    shouldExit,
    phasedReason,
    cumulativeSelfDamage,
    cumulativeTargetDamage,
    cumulativeDamageRatio: cumulativeDamageRatio === null ? null : Number(cumulativeDamageRatio.toFixed(3)),
    severePoorExchange,
    poorExchangeThresholds: {
      minEngageMs: poorExchangeMinEngageMs,
      damageRatio: poorExchangeDamageRatioThreshold,
      selfHp: poorExchangeSelfHpThreshold,
      targetHp: poorExchangeTargetHpThreshold
    },
    recentNoHit,
    retreatSinceAt,
    retreatSelfDamageBaseline,
    retreatTargetDamageBaseline,
    newSelfDamageSinceRetreat,
    newTargetDamageSinceRetreat,
    safeDistanceCm,
    safeDistanceReached,
    recentThreatBulletCount,
    observeMs,
    disengageMs,
    exitEngageMs,
    retreatMinMs
  };
}

module.exports = {
  combatDisadvantageConfirmationCore,
  combatHpExitThresholdsCore,
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatExchangeStopLossCore,
  evaluateCombatHpExitCore,
  evaluatePredictedLeaveHpCore
};
