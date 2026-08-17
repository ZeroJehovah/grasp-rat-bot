'use strict';

const DEFAULT_SECONDARY_WINDOW_MS = 5000;
const DEFAULT_SECONDARY_BASE_CADENCE_MS = 160;
const DEFAULT_SECONDARY_MAX_CADENCE_MS = 160;
const DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS = 0;
const DEFAULT_SECONDARY_CLOSE_DISTANCE_CM = 2000;
const DEFAULT_SECONDARY_PRESSURE_WINDOW_MS = 1500;
const DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS = 2;
const DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS = 750;

function idOf(value) {
  const id = value?.user_id ?? value?.userId ?? value?.targetId ?? value?.id ?? value?.entity_id ?? value?.entityId;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function missionTargetId(mission = null) {
  return idOf(mission?.target || mission?.navigationTarget || mission);
}

function isWhitelistTarget(target = null) {
  return Boolean(target?.profitProtected
    || target?.whitelisted
    || target?.creatorProtected
    || target?.legacyWhitelistProtected
    || target?.dynamicWhitelistMember
    || target?.whitelistContactPolicy?.dynamicWhitelistMember);
}

function classifyCombatTargetRole(target = null, mission = null) {
  const targetId = idOf(target);
  const primaryId = missionTargetId(mission);
  const whitelisted = isWhitelistTarget(target);
  const sameAsProfitMission = Boolean(primaryId && targetId && primaryId === targetId);
  const implicitProfitPrimary = Boolean(
    !primaryId
      && targetId
      && !whitelisted
      && (target?.profitPrimaryTarget === true
        || target?.combatAdmission?.profitEligible === true
        || target?.combatRoleHint === 'primary')
  );
  const primary = Boolean(!whitelisted && (sameAsProfitMission || implicitProfitPrimary));
  const secondary = Boolean(targetId && !primary);
  return {
    role: targetId ? (primary ? 'primary' : 'secondary') : '',
    primaryTargetId: primaryId,
    targetId,
    secondaryTarget: secondary,
    whitelisted,
    sameAsProfitMission,
    implicitProfitPrimary
  };
}

function secondaryCombatExitPolicy(target = null, selfHp = null, context = {}) {
  const retainedTarget = context.retainedTarget || context.retainedCombatTarget || null;
  const phaseTargetId = idOf({ targetId: context.combatPhaseTargetId ?? context.combatPhase?.targetId });
  const retainedTargetId = idOf(retainedTarget);
  const retainedMatch = Boolean(!target && phaseTargetId && retainedTargetId === phaseTargetId);
  const effectiveTarget = target || (retainedMatch ? retainedTarget : null);
  const secondary = effectiveTarget?.combatRole === 'secondary' || effectiveTarget?.secondaryTarget === true;
  const hp = Number(selfHp);
  const healthy = secondary && Number.isFinite(hp) && hp > 50;
  const lowHpUnconditionalExit = secondary && Number.isFinite(hp) && hp <= 50;
  return {
    secondary,
    healthy,
    targetSource: target ? 'current' : (retainedMatch ? 'retained-phase-match' : 'none'),
    targetId: idOf(effectiveTarget),
    retainedMatch,
    suppressClearHpGap: healthy,
    suppressMissCloseTimeout: healthy,
    suppressExchangeStopLoss: healthy,
    preserveLowHpExits: lowHpUnconditionalExit,
    lowHpUnconditionalExit
  };
}

function secondaryCadenceMs(noDamageMs, options = {}) {
  const base = Math.max(1, Number(options.secondaryTargetBaseCadenceMs ?? DEFAULT_SECONDARY_BASE_CADENCE_MS));
  const max = Math.max(base, Number(options.secondaryTargetMaxCadenceMs ?? DEFAULT_SECONDARY_MAX_CADENCE_MS));
  const step = Math.max(0, Number(options.secondaryTargetNoDamageStepMs ?? DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS));
  const levels = Math.max(0, Math.floor(Math.max(0, Number(noDamageMs || 0)) / 5000));
  return Math.min(max, base + levels * step);
}

function ownDispatchCountInWindow(dispatchTimes = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const cutoff = Number(nowMs) - Math.max(1, Number(windowMs || DEFAULT_SECONDARY_WINDOW_MS));
  return (dispatchTimes || []).filter(at => Number(at) >= cutoff && Number(at) <= Number(nowMs)).length;
}

function opponentShotCountInWindow(samples = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const cutoff = Number(nowMs) - Math.max(1, Number(windowMs || DEFAULT_SECONDARY_WINDOW_MS));
  return (samples || []).reduce((total, sample) => (
    Number(sample?.at || 0) >= cutoff && Number(sample?.at || 0) <= Number(nowMs)
      ? total + Math.max(0, Number(sample?.newBulletCount || 0))
      : total
  ), 0);
}

function samplesInWindow(samples = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const now = Number(nowMs);
  const cutoff = now - Math.max(1, Number(windowMs || DEFAULT_SECONDARY_WINDOW_MS));
  return (samples || []).filter(sample => {
    const at = Number(sample?.at || 0);
    return at >= cutoff && at <= now;
  });
}

function hpLossRateInWindow(samples = [], field, nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = samplesInWindow(samples, nowMs, windowMs)
    .map(sample => ({ at: Number(sample?.at || 0), hp: Number(sample?.[field]) }))
    .filter(sample => Number.isFinite(sample.hp))
    .sort((left, right) => left.at - right.at);
  if (rows.length < 2) return 0;
  let loss = 0;
  for (let index = 1; index < rows.length; index += 1) {
    loss += Math.max(0, rows[index - 1].hp - rows[index].hp);
  }
  const elapsedMs = Math.max(1000, rows.at(-1).at - rows[0].at);
  return loss > 0 ? loss * 1000 / elapsedMs : 0;
}

function secondaryClosePressurePolicy(input = {}, options = {}) {
  const nowMs = Number(input.nowMs || Date.now());
  const target = input.target || {};
  const state = input.combatTargetState || {};
  const distanceCm = Number(input.distanceCm ?? target.distance);
  const closeDistanceCm = Math.max(1, Number(
    options.secondaryTargetCloseDistanceCm ?? DEFAULT_SECONDARY_CLOSE_DISTANCE_CM
  ));
  const windowMs = Math.max(250, Number(
    options.secondaryTargetPressureWindowMs ?? DEFAULT_SECONDARY_PRESSURE_WINDOW_MS
  ));
  const minimumShots = Math.max(1, Math.round(Number(
    options.secondaryTargetPressureMinShots ?? DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS
  )));
  const maximumLastShotAgeMs = Math.max(0, Number(
    options.secondaryTargetPressureMaxLastShotAgeMs
      ?? DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS
  ));
  const samples = samplesInWindow(state.motionSamples, nowMs, windowMs);
  const shotSamples = samples.filter(sample => Number(sample?.newBulletCount || 0) > 0);
  const opponentShots = shotSamples.reduce(
    (total, sample) => total + Math.max(0, Number(sample?.newBulletCount || 0)),
    0
  );
  const latestShotAt = shotSamples.length ? Number(shotSamples.at(-1).at || 0) : 0;
  const latestShotAgeMs = latestShotAt > 0 ? Math.max(0, nowMs - latestShotAt) : null;
  const close = Number.isFinite(distanceCm) && distanceCm <= closeDistanceCm;
  const sustainedAttack = opponentShots >= minimumShots
    && shotSamples.length >= Math.min(2, minimumShots)
    && latestShotAgeMs !== null
    && latestShotAgeMs <= maximumLastShotAgeMs;
  return {
    active: close && sustainedAttack,
    close,
    sustainedAttack,
    distanceCm: Number.isFinite(distanceCm) ? distanceCm : null,
    closeDistanceCm,
    windowMs,
    minimumShots,
    opponentShots,
    attackSampleCount: shotSamples.length,
    latestShotAt: latestShotAt || null,
    latestShotAgeMs,
    reason: close && sustainedAttack
      ? 'secondary-close-sustained-fire'
      : (!close ? 'secondary-outside-close-pressure-range' : 'secondary-fire-not-sustained')
  };
}

function primaryRewardSurvivalRacePolicy(input = {}, options = {}) {
  const selfHp = Number(input.selfHp ?? input.self?.hp);
  const primaryHp = Number(input.primaryHp ?? input.primaryTarget?.hp);
  const primaryDistanceCm = Number(input.primaryDistanceCm ?? input.primaryTarget?.distance);
  const nowMs = Number(input.nowMs || Date.now());
  const pressure = input.closePressure || secondaryClosePressurePolicy(input, options);
  const pickupRadiusCm = Math.max(1, Number(options.playerDropPickupRadiusCm ?? 150));
  const axisSpeedCmPerSec = Math.max(1, Number(
    options.invulnerableProfitAxisSpeedCmPerSec ?? 950
  ));
  const damageWindowMs = Math.max(1000, Number(
    options.secondaryTargetRaceDamageWindowMs ?? DEFAULT_SECONDARY_WINDOW_MS
  ));
  const secondarySamples = input.secondarySamples || input.combatTargetState?.motionSamples || [];
  const primarySamples = input.primarySamples || [];
  const observedIncomingRate = hpLossRateInWindow(secondarySamples, 'selfHp', nowMs, damageWindowMs);
  const opponentShots = opponentShotCountInWindow(secondarySamples, nowMs, damageWindowMs);
  const shotObservationRows = samplesInWindow(secondarySamples, nowMs, damageWindowMs);
  const shotObservationSpanMs = shotObservationRows.length > 1
    ? Math.max(1000, Number(shotObservationRows.at(-1)?.at || nowMs) - Number(shotObservationRows[0]?.at || nowMs))
    : 1000;
  const opponentShotsPerSec = opponentShots * 1000 / shotObservationSpanMs;
  const estimatedIncomingRate = opponentShotsPerSec
    * Math.max(0.05, Number(options.secondaryTargetRaceAssumedHitRate ?? 0.2))
    * Math.max(0.1, Number(options.secondaryTargetRaceShotDamageHp ?? 3));
  const incomingRateHpPerSec = Math.min(
    Math.max(1, Number(options.secondaryTargetRaceIncomingRateCapHpPerSec ?? 12)),
    Math.max(
      pressure.active ? Math.max(0.1, Number(options.secondaryTargetRaceIncomingRateFloorHpPerSec ?? 1.5)) : 0,
      observedIncomingRate,
      estimatedIncomingRate
    )
  );
  const observedPrimaryDamageRate = hpLossRateInWindow(primarySamples, 'hp', nowMs, damageWindowMs);
  const primaryDamageRateHpPerSec = Math.min(
    Math.max(0.1, Number(options.secondaryTargetRacePrimaryDamageRateCapHpPerSec ?? 10)),
    Math.max(
      Math.max(0.1, Number(options.secondaryTargetRacePrimaryOwnDamageRateHpPerSec ?? 3)),
      observedPrimaryDamageRate * Math.max(0, Number(
        options.secondaryTargetRaceObservedPrimaryDamageDiscount ?? 0.75
      ))
    )
  );
  const pickupTravelMs = Number.isFinite(primaryDistanceCm)
    ? Math.max(0, primaryDistanceCm - pickupRadiusCm) / axisSpeedCmPerSec * 1000
    : Infinity;
  const killEtaMs = Number.isFinite(primaryHp) && primaryHp > 0
    ? primaryHp / primaryDamageRateHpPerSec * 1000
    : Infinity;
  const confirmationMs = Math.max(0, Number(options.secondaryTargetRacePickupConfirmMs ?? 500));
  const primaryRewardEtaMs = killEtaMs + pickupTravelMs + confirmationMs;
  const selfHp50EtaMs = Number.isFinite(selfHp) && selfHp > 50 && incomingRateHpPerSec > 0
    ? (selfHp - 50) / incomingRateHpPerSec * 1000
    : (Number.isFinite(selfHp) && selfHp <= 50 ? 0 : Infinity);
  const safetyMarginMs = Math.max(0, Number(options.secondaryTargetRaceSafetyMarginMs ?? 1000));
  const evaluated = Boolean(
    pressure.active
      && Number.isFinite(selfHp)
      && Number.isFinite(primaryHp)
      && primaryHp > 0
      && incomingRateHpPerSec > 0
  );
  const continuePrimary = !evaluated
    || primaryRewardEtaMs + safetyMarginMs < selfHp50EtaMs;
  return {
    evaluated,
    continuePrimary,
    shouldFocusSecondary: evaluated && !continuePrimary,
    selfHp: Number.isFinite(selfHp) ? selfHp : null,
    primaryHp: Number.isFinite(primaryHp) ? primaryHp : null,
    primaryDistanceCm: Number.isFinite(primaryDistanceCm) ? primaryDistanceCm : null,
    pickupRadiusCm,
    observedIncomingRateHpPerSec: observedIncomingRate,
    estimatedIncomingRateHpPerSec: estimatedIncomingRate,
    incomingRateHpPerSec,
    observedPrimaryDamageRateHpPerSec: observedPrimaryDamageRate,
    primaryDamageRateHpPerSec,
    opponentShots,
    opponentShotsPerSec,
    killEtaMs: Number.isFinite(killEtaMs) ? killEtaMs : null,
    pickupTravelMs: Number.isFinite(pickupTravelMs) ? pickupTravelMs : null,
    confirmationMs,
    primaryRewardEtaMs: Number.isFinite(primaryRewardEtaMs) ? primaryRewardEtaMs : null,
    selfHp50EtaMs: Number.isFinite(selfHp50EtaMs) ? selfHp50EtaMs : null,
    safetyMarginMs,
    reason: !evaluated
      ? 'secondary-close-pressure-race-not-applicable'
      : (continuePrimary
          ? 'primary-reward-before-hp50-margin'
          : 'hp50-before-primary-reward-margin')
  };
}

function dualTargetFireArbitration(input = {}) {
  const secondaryActive = input.secondaryActive === true;
  const primaryAuthorized = input.primaryAuthorized === true;
  const closePressure = input.closePressure || { active: false };
  const rewardRace = input.rewardRace || { evaluated: false, continuePrimary: true };
  if (!secondaryActive) {
    return {
      mode: 'single-target',
      fireTargetRole: 'current',
      primarySelected: false,
      secondaryFocusActive: false,
      reason: 'no-defensive-secondary'
    };
  }
  if (primaryAuthorized && closePressure.active && rewardRace.shouldFocusSecondary) {
    return {
      mode: 'secondary-focus',
      fireTargetRole: 'secondary',
      primarySelected: false,
      secondaryFocusActive: true,
      reason: 'secondary-close-pressure-hp50-race'
    };
  }
  if (primaryAuthorized) {
    return {
      mode: 'primary-profit',
      fireTargetRole: 'primary',
      primarySelected: true,
      secondaryFocusActive: false,
      reason: closePressure.active
        ? 'primary-reward-race-safe'
        : 'primary-fire-authorized'
    };
  }
  return {
    mode: 'secondary-defensive',
    fireTargetRole: 'secondary',
    primarySelected: false,
    secondaryFocusActive: false,
    reason: 'primary-fire-not-authorized'
  };
}

function secondaryFirePolicy(input = {}, options = {}) {
  const target = input.target || {};
  const state = input.combatTargetState || {};
  const nowMs = Number(input.nowMs || Date.now());
  const windowMs = Math.max(1000, Number(options.secondaryTargetWindowMs ?? DEFAULT_SECONDARY_WINDOW_MS));
  const ownShots = ownDispatchCountInWindow(input.dispatchTimes, nowMs, windowMs);
  const opponentShots = opponentShotCountInWindow(state.motionSamples, nowMs, windowMs);
  const cadenceMs = secondaryCadenceMs(state.noDamageMs, options);
  const lastShotAt = Number(input.lastShotAt || 0);
  const cadenceReady = !lastShotAt || nowMs - lastShotAt >= cadenceMs;
  const quotaAvailable = ownShots < opponentShots;
  const invulnerable = input.invulnerable === true || target.invulnerable === true;
  const closePressure = secondaryClosePressurePolicy(input, options);
  const throttleExempt = closePressure.active;
  const allowed = !invulnerable && (throttleExempt || (quotaAvailable && cadenceReady));
  return {
    allowed,
    invulnerable,
    ownShots,
    opponentShots,
    windowMs,
    cadenceMs,
    cadenceReady,
    quotaAvailable,
    throttleExempt,
    closePressure,
    reason: invulnerable
      ? 'secondary-invulnerable-dodge-only'
      : throttleExempt
        ? 'secondary-close-pressure-normal-fire'
        : !quotaAvailable
          ? 'secondary-five-second-shot-quota'
          : !cadenceReady ? 'secondary-cadence' : 'secondary-defensive-fire'
  };
}

function secondaryRetentionPolicy(combatTargetState = null, nowMs = Date.now(), options = {}) {
  const secondary = combatTargetState?.combatRole === 'secondary'
    || combatTargetState?.secondaryTarget === true;
  const windowMs = Math.max(1000, Number(
    options.secondaryTargetWindowMs ?? DEFAULT_SECONDARY_WINDOW_MS
  ));
  const evidence = [
    ['target-firing', combatTargetState?.lastFiringAt],
    ['collision-path-bullet', combatTargetState?.lastThreatAt],
    ['incoming-bullet', combatTargetState?.lastIncomingBulletAt]
  ]
    .map(([type, at]) => ({ type, at: Number(at || 0) }))
    .filter(item => item.at > 0)
    .sort((left, right) => right.at - left.at);
  const latest = evidence[0] || null;
  const ageMs = latest ? Math.max(0, Number(nowMs) - latest.at) : null;
  const retained = Boolean(secondary && latest && ageMs <= windowMs);
  return {
    secondary,
    retained,
    windowMs,
    latestEvidenceAt: latest?.at || null,
    latestEvidenceType: latest?.type || '',
    ageMs,
    reason: retained
      ? 'secondary-defensive-evidence-grace'
      : (secondary ? 'secondary-defensive-evidence-expired' : 'not-secondary')
  };
}

module.exports = {
  DEFAULT_SECONDARY_BASE_CADENCE_MS,
  DEFAULT_SECONDARY_CLOSE_DISTANCE_CM,
  DEFAULT_SECONDARY_MAX_CADENCE_MS,
  DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS,
  DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS,
  DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS,
  DEFAULT_SECONDARY_PRESSURE_WINDOW_MS,
  DEFAULT_SECONDARY_WINDOW_MS,
  classifyCombatTargetRole,
  dualTargetFireArbitration,
  hpLossRateInWindow,
  idOf,
  isWhitelistTarget,
  missionTargetId,
  opponentShotCountInWindow,
  ownDispatchCountInWindow,
  primaryRewardSurvivalRacePolicy,
  secondaryCombatExitPolicy,
  secondaryCadenceMs,
  secondaryClosePressurePolicy,
  secondaryFirePolicy,
  secondaryRetentionPolicy
};
