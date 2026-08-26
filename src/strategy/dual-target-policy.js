'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

const DEFAULT_SECONDARY_WINDOW_MS = 5000;
const DEFAULT_SECONDARY_BASE_CADENCE_MS = 160;
const DEFAULT_SECONDARY_MAX_CADENCE_MS = 160;
const DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS = 0;
const DEFAULT_SECONDARY_CLOSE_DISTANCE_CM = 2000;
const DEFAULT_SECONDARY_PRESSURE_WINDOW_MS = 1500;
const DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS = 2;
const DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS = 750;
const DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS = 2500;
const DEFAULT_SECONDARY_RETENTION_WINDOW_MS = DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS;
const DEFAULT_SECONDARY_RETENTION_LOW_HP_THRESHOLD = COMBAT_CONSTANTS.LOW_HP_THRESHOLD;
const DEFAULT_SECONDARY_RETENTION_ATTACK_RANGE_CM = COMBAT_CONSTANTS.ATTACK_RANGE;
const DEFAULT_PRIMARY_FINISH_RACE_WINDOW_MS = 1800;
const DEFAULT_PRIMARY_FINISH_RACE_MAX_SHOTS = 3;
const DEFAULT_PRIMARY_FINISH_RACE_TARGET_HP_MAX = 55;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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

function attributedHpLossRateInWindow(samples = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = attributedHpLossRows(samples, nowMs, windowMs);
  if (!rows.length) return 0;
  const elapsedMs = Math.max(1000, Number(nowMs) - rows[0].at);
  return rows.reduce((total, row) => total + row.amount, 0) * 1000 / elapsedMs;
}

function attributedHpLossRows(samples = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = samplesInWindow(samples, nowMs, windowMs)
    .map(sample => {
      const explicitAmount = Number(sample?.selfDamageAmount);
      const amount = Number.isFinite(explicitAmount)
        ? Math.max(0, explicitAmount)
        : (sample?.attributableSelfDamage === true
            ? Math.max(0, Number(sample?.selfHpLoss || sample?.damage || 0))
            : 0);
      return {
        at: Number(sample?.at || 0),
        amount,
        selfHp: Number(sample?.selfHp)
      };
    })
    .filter(sample => Number.isFinite(sample.at) && sample.amount > 0)
    .sort((left, right) => left.at - right.at);
  return deduplicateDamageRows(rows);
}

function deduplicateDamageRows(rows = []) {
  const unique = new Map();
  for (const row of rows) {
    const hpKey = Number.isFinite(row.selfHp) ? `|hp:${row.selfHp}` : '';
    const key = `${row.at}${hpKey || `|amount:${row.amount}`}`;
    const previous = unique.get(key);
    if (!previous || row.amount > previous.amount) unique.set(key, row);
  }
  return Array.from(unique.values()).sort((left, right) => left.at - right.at);
}

function attributedHpLossRateAcrossOwnerGroups(ownerGroups = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = deduplicateDamageRows((ownerGroups || []).flatMap(samples => (
    attributedHpLossRows(samples, nowMs, windowMs)
  )));
  if (!rows.length) return 0;
  const elapsedMs = Math.max(1000, Number(nowMs) - rows[0].at);
  return rows.reduce((total, row) => total + row.amount, 0) * 1000 / elapsedMs;
}

function hpLossRateAcrossOwnerGroups(ownerGroups = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = (ownerGroups || []).flatMap(samples => samplesInWindow(samples, nowMs, windowMs)
    .map(sample => ({
      at: Number(sample?.at || 0),
      hp: Number(sample?.selfHp)
    }))
    .filter(sample => Number.isFinite(sample.at) && Number.isFinite(sample.hp)))
    .sort((left, right) => left.at - right.at);
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.at}|${row.hp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  if (unique.length < 2) return 0;
  let loss = 0;
  for (let index = 1; index < unique.length; index += 1) {
    loss += Math.max(0, unique[index - 1].hp - unique[index].hp);
  }
  const elapsedMs = Math.max(1000, unique.at(-1).at - unique[0].at);
  return loss > 0 ? loss * 1000 / elapsedMs : 0;
}

function incomingPressureEvidencePolicy(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const leaseMs = Math.max(250, Number(
    options.incomingPressureEvidenceLeaseMs ?? DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS
  ));
  const collisionBullets = Array.isArray(input.collisionBullets)
    ? input.collisionBullets
    : (Array.isArray(input.incomingBullets) ? input.incomingBullets : []);
  const ownerIds = uniqueStrings([
    ...(Array.isArray(input.ownerIds) ? input.ownerIds : []),
    ...collisionBullets.map(bullet => bullet?.ownerId ?? bullet?.owner_id)
  ]);
  const currentCollision = collisionBullets.length > 0;
  const evidence = [
    ['attributable-damage', input.recentAttributableDamageAt],
    ['recent-self-damage', input.recentSelfDamageAt],
    ['retained-defensive-evidence', input.retainedDefensiveEvidenceAt],
    ['residual-threat', input.residualThreatAt],
    ['known-owner-attack', input.knownOwnerAttackAt]
  ]
    .map(([type, at]) => ({ type, at: Number(at || 0) }))
    .filter(item => Number.isFinite(item.at) && item.at > 0 && item.at <= nowMs)
    .sort((left, right) => right.at - left.at);
  const latest = evidence[0] || null;
  const latestAgeMs = latest ? Math.max(0, nowMs - latest.at) : null;
  const recentEvidence = Boolean(latest && latestAgeMs <= leaseMs);
  const established = input.established === true;
  const active = Boolean(currentCollision || (recentEvidence && (ownerIds.length > 0 || established)));
  const evidenceTypes = uniqueStrings([
    currentCollision ? 'collision-path-bullet' : '',
    recentEvidence ? latest.type : '',
    input.residualThreatActive === true ? 'residual-threat-generation' : '',
    established ? 'established-defensive-owner' : ''
  ]);
  return {
    active,
    currentCollision,
    recentEvidence,
    established,
    ownerIds,
    ownerKnown: ownerIds.length > 0,
    leaseMs,
    latestEvidenceAt: latest?.at || null,
    latestEvidenceType: latest?.type || '',
    latestAgeMs,
    evidenceTypes,
    reason: active
      ? (currentCollision
          ? 'incoming-collision-path-pressure'
          : (latest?.type || (established ? 'established-defensive-pressure' : 'recent-incoming-pressure')))
      : 'incoming-pressure-evidence-expired'
  };
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
  const pressureEvidence = input.pressureEvidence || (pressure.active === true
    ? {
        active: true,
        currentCollision: false,
        recentEvidence: true,
        established: true,
        ownerIds: uniqueStrings(input.ownerIds),
        ownerKnown: uniqueStrings(input.ownerIds).length > 0,
        leaseMs: Math.max(250, Number(
          options.incomingPressureEvidenceLeaseMs ?? DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS
        )),
        latestEvidenceAt: nowMs,
        latestEvidenceType: 'close-pressure-compatibility',
        latestAgeMs: 0,
        evidenceTypes: ['close-pressure-compatibility'],
        reason: 'secondary-close-sustained-fire'
      }
    : incomingPressureEvidencePolicy({
        nowMs,
        ownerIds: input.ownerIds,
        collisionBullets: input.collisionBullets,
        recentAttributableDamageAt: input.recentAttributableDamageAt,
        recentSelfDamageAt: input.recentSelfDamageAt,
        retainedDefensiveEvidenceAt: input.retainedDefensiveEvidenceAt,
        residualThreatAt: input.residualThreatAt,
        knownOwnerAttackAt: input.knownOwnerAttackAt,
        established: input.established
      }, options));
  const pickupRadiusCm = Math.max(1, Number(options.playerDropPickupRadiusCm ?? 150));
  const axisSpeedCmPerSec = Math.max(1, Number(
    options.invulnerableProfitAxisSpeedCmPerSec ?? 950
  ));
  const damageWindowMs = Math.max(1000, Number(
    options.secondaryTargetRaceDamageWindowMs ?? DEFAULT_SECONDARY_WINDOW_MS
  ));
  const secondarySamples = input.secondarySamples || input.combatTargetState?.motionSamples || [];
  const primarySamples = input.primarySamples || [];
  const incomingSamplesByOwner = input.incomingSamplesByOwner
    && typeof input.incomingSamplesByOwner === 'object'
    ? input.incomingSamplesByOwner
    : null;
  const ownerSampleGroups = incomingSamplesByOwner
    ? Object.values(incomingSamplesByOwner).filter(Array.isArray)
    : [];
  const sampleGroups = ownerSampleGroups.length ? ownerSampleGroups : [secondarySamples];
  const hasAttributedSamples = sampleGroups.some(samples => samples.some(sample => (
    Number(sample?.selfDamageAmount) > 0 || sample?.attributableSelfDamage === true
  )));
  const observedIncomingRate = hasAttributedSamples
    ? attributedHpLossRateAcrossOwnerGroups(sampleGroups, nowMs, damageWindowMs)
    : hpLossRateAcrossOwnerGroups(sampleGroups, nowMs, damageWindowMs);
  const opponentShots = sampleGroups.reduce(
    (total, samples) => total + opponentShotCountInWindow(samples, nowMs, damageWindowMs),
    0
  );
  const shotObservationRows = sampleGroups.flatMap(samples => samplesInWindow(samples, nowMs, damageWindowMs));
  const shotObservationMinAt = shotObservationRows.length
    ? shotObservationRows.reduce((min, row) => Math.min(min, Number(row?.at || nowMs)), nowMs)
    : nowMs;
  const shotObservationMaxAt = shotObservationRows.length
    ? shotObservationRows.reduce((max, row) => Math.max(max, Number(row?.at || 0)), 0)
    : nowMs;
  const shotObservationSpanMs = shotObservationRows.length > 1
    ? Math.max(1000, shotObservationMaxAt - shotObservationMinAt)
    : 1000;
  const opponentShotsPerSec = opponentShots * 1000 / shotObservationSpanMs;
  const estimatedIncomingRate = opponentShotsPerSec
    * Math.max(0.05, Number(options.secondaryTargetRaceAssumedHitRate ?? 0.2))
    * Math.max(0.1, Number(options.secondaryTargetRaceShotDamageHp ?? 3));
  const incomingRateHpPerSec = Math.min(
      Math.max(1, Number(options.secondaryTargetRaceIncomingRateCapHpPerSec ?? 12)),
      Math.max(
      pressureEvidence.active ? Math.max(0.1, Number(options.secondaryTargetRaceIncomingRateFloorHpPerSec ?? 1.5)) : 0,
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
    pressureEvidence.active
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
    closePressureActive: pressure.active === true,
    pressureEvidence,
    incomingOwnerCount: sampleGroups.length,
    attributedSamples: hasAttributedSamples,
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
      ? 'incoming-pressure-race-not-applicable'
      : (continuePrimary
          ? 'primary-reward-before-hp50-margin'
          : 'hp50-before-primary-reward-margin')
  };
}

function uniqueStrings(values = []) {
  return Array.from(new Set((values || []).map(value => String(value || '')).filter(Boolean)));
}

function isSoftReserveBlocker(value) {
  const blocker = String(value || '');
  return blocker === 'fire-state:dodge-reserve'
    || blocker === 'fire-state:pressure-dodge-reserve'
    || blocker === 'fire-state:close-pressure-movement-reserve'
    || blocker === 'fire-state:close-pressure-reserve-band'
    || blocker === 'fire-state:reserve-band'
    || blocker === 'fire-state:finish-reserve';
}

/**
 * Decide whether a low-HP primary may use a bounded finish burst while a
 * defensive secondary is applying pressure. This sits below
 * physical/realtime gates and above the ordinary Dodge reserve. It never
 * changes the secondary shot quota; that quota is owned by secondary
 * dispatches only.
 */
function primaryFinishRaceAuthorization(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const selfHp = Number(input.selfHp ?? input.self?.hp);
  const primaryHp = Number(input.primaryHp ?? input.primaryTarget?.hp);
  const stamina5s = Number(input.stamina5s ?? input.self?.stamina5s ?? input.self?.stamina_5s_remaining_milli);
  const targetId = idOf(input.primaryTarget);
  const targetAlive = input.primaryTarget?.alive !== false && (!Number.isFinite(primaryHp) || primaryHp > 0);
  const targetInvulnerable = input.primaryTarget?.invulnerable === true || input.targetInvulnerable === true;
  const physicalEligible = input.primaryPhysicalEligible === true;
  const competitionAllowed = input.primaryCompetitionAllowed !== false;
  const targetFresh = input.primaryTargetFresh !== false;
  const closePressure = input.closePressure?.active === true;
  const pressureEvidence = input.pressureEvidence || {
    active: closePressure,
    reason: closePressure ? 'close-pressure-compatibility' : 'incoming-pressure-evidence-missing',
    evidenceTypes: closePressure ? ['close-pressure-compatibility'] : []
  };
  const rewardRace = input.rewardRace || {};
  const maxTargetHp = Math.max(1, Number(
    options.primaryFinishRaceTargetHpMax ?? DEFAULT_PRIMARY_FINISH_RACE_TARGET_HP_MAX
  ));
  const maxShots = Math.max(1, Math.round(Number(
    options.primaryFinishRaceMaxShots ?? DEFAULT_PRIMARY_FINISH_RACE_MAX_SHOTS
  )));
  const windowMs = Math.max(160, Number(
    options.primaryFinishRaceWindowMs ?? DEFAULT_PRIMARY_FINISH_RACE_WINDOW_MS
  ));
  const previous = input.previousWindow && typeof input.previousWindow === 'object'
    ? input.previousWindow
    : {};
  const previousStartedAt = Number(previous.windowStartedAt || 0);
  const previousExpiresAt = Number(previous.windowExpiresAt || 0);
  const previousShots = Math.max(0, Math.round(Number(
    input.finishRaceDispatchCount ?? previous.dispatchCount ?? 0
  )));
  const windowPreviouslyActive = previousStartedAt > 0
    && previousExpiresAt > nowMs
    && nowMs - previousStartedAt <= windowMs;
  const hardBlockers = uniqueStrings(input.hardBlockers);
  const softBlockers = uniqueStrings(input.softBlockers);
  if (!targetId) hardBlockers.push('primary-target-missing-id');
  if (!targetAlive) hardBlockers.push('primary-target-dead');
  if (targetInvulnerable) hardBlockers.push('primary-target-invulnerable');
  if (!Number.isFinite(selfHp) || selfHp <= 50) hardBlockers.push('self-hp-at-or-below-50');
  if (!Number.isFinite(primaryHp) || primaryHp <= 0) hardBlockers.push('primary-hp-unknown');
  else if (primaryHp > maxTargetHp) hardBlockers.push('primary-target-not-low-hp');
  if (!physicalEligible) hardBlockers.push('primary-physical-ineligible');
  if (!competitionAllowed) hardBlockers.push('primary-competition-blocked');
  if (!targetFresh) hardBlockers.push('primary-realtime-state-stale');
  if (pressureEvidence.active !== true) hardBlockers.push('incoming-pressure-not-active');
  if (rewardRace.evaluated !== true) hardBlockers.push('primary-race-rate-evidence-insufficient');
  else if (rewardRace.continuePrimary !== true) hardBlockers.push('primary-reward-race-failed');

  const hardReserveMs = Math.max(0, Number(
    input.hardReserveMs ?? options.combatShootHardReserveMs ?? 1800
  ));
  const shotCostMs = Math.max(0, Number(input.shotCostMs ?? options.combatShotStaminaCostMs ?? 500));
  const dodgeActionCostMs = Math.max(0, Number(input.dodgeActionCostMs || 0));
  const requiredHardStaminaMs = hardReserveMs + shotCostMs + dodgeActionCostMs;
  if (!Number.isFinite(stamina5s)) hardBlockers.push('stamina-unknown');
  else if (stamina5s < requiredHardStaminaMs) hardBlockers.push('below-hard-reserve');

  const normalBlocker = String(input.normalFireBlocker || '');
  if (input.primaryNormalAuthorized !== true && isSoftReserveBlocker(normalBlocker)) {
    softBlockers.push(normalBlocker);
  }
  if (input.primaryNormalAuthorized !== true && !isSoftReserveBlocker(normalBlocker)) {
    hardBlockers.push(normalBlocker || 'primary-normal-fire-not-authorized');
  }
  const uniqueHardBlockers = uniqueStrings(hardBlockers);
  const uniqueSoftBlockers = uniqueStrings(softBlockers).filter(value => !uniqueHardBlockers.includes(value));
  const exhausted = previousShots >= maxShots;
  if (exhausted) uniqueHardBlockers.push('finish-race-shot-window-exhausted');
  const eligible = uniqueHardBlockers.length === 0;
  const windowStartedAt = eligible
    ? (windowPreviouslyActive ? previousStartedAt : nowMs)
    : (windowPreviouslyActive ? previousStartedAt : null);
  const windowExpiresAt = windowStartedAt === null
    ? null
    : Math.min(
        Number.isFinite(previousExpiresAt) && previousExpiresAt > windowStartedAt
          ? previousExpiresAt
          : windowStartedAt + windowMs,
        windowStartedAt + windowMs
      );
  const active = eligible && windowExpiresAt !== null && nowMs < windowExpiresAt;
  const reason = active
    ? (input.primaryNormalAuthorized === true ? 'primary-finish-race-window' : 'primary-finish-race-soft-reserve-override')
    : (uniqueHardBlockers[0] || uniqueSoftBlockers[0] || 'primary-finish-race-not-authorized');
  return {
    eligible: active,
    active,
    targetId,
    selfHp: Number.isFinite(selfHp) ? selfHp : null,
    primaryHp: Number.isFinite(primaryHp) ? primaryHp : null,
    targetMaxHp: maxTargetHp,
    primaryPhysicalEligible: physicalEligible,
    primaryNormalAuthorized: input.primaryNormalAuthorized === true,
    normalFireBlocker: normalBlocker,
    closePressure,
    pressureEvidenceActive: pressureEvidence.active === true,
    pressureEvidence: { ...pressureEvidence },
    rewardRaceEvaluated: rewardRace.evaluated === true,
    rewardRaceContinuePrimary: rewardRace.continuePrimary === true,
    hardReserveMs,
    shotCostMs,
    dodgeActionCostMs,
    requiredHardStaminaMs,
    stamina5s: Number.isFinite(stamina5s) ? stamina5s : null,
    maxShots,
    dispatchCount: previousShots,
    windowMs,
    windowStartedAt,
    windowExpiresAt,
    hardBlockers: uniqueStrings(uniqueHardBlockers),
    softBlockers: uniqueSoftBlockers,
    reason
  };
}

function dualTargetFireArbitration(input = {}) {
  const secondaryActive = input.secondaryActive === true;
  const primaryAuthorized = input.primaryAuthorized === true;
  const primaryNormalAuthorized = input.primaryNormalAuthorized === undefined
    ? primaryAuthorized
    : input.primaryNormalAuthorized === true;
  const primaryPhysicalEligible = input.primaryPhysicalEligible !== false;
  const primaryFinishAuthorized = input.primaryFinishAuthorized === true;
  const closePressure = input.closePressure || { active: false };
  const pressureEvidence = input.pressureEvidence || closePressure;
  const rewardRace = input.rewardRace || { evaluated: false, continuePrimary: true };
  if (!secondaryActive) {
    return {
      mode: 'single-target',
      fireTargetRole: 'current',
      primarySelected: false,
      secondaryFocusActive: false,
      primaryPhysicalEligible,
      primaryNormalAuthorized,
      primaryFinishAuthorized: false,
      reason: 'no-defensive-secondary'
    };
  }
  if (primaryFinishAuthorized) {
    return {
      mode: 'primary-finish-race',
      fireTargetRole: 'primary',
      primarySelected: true,
      secondaryFocusActive: false,
      primaryPhysicalEligible,
      primaryNormalAuthorized,
      primaryFinishAuthorized: true,
      reason: 'primary-finish-race-authorized'
    };
  }
  if (primaryNormalAuthorized && pressureEvidence.active && rewardRace.shouldFocusSecondary) {
    return {
      mode: 'secondary-focus',
      fireTargetRole: 'secondary',
      primarySelected: false,
      secondaryFocusActive: true,
      primaryPhysicalEligible,
      primaryNormalAuthorized,
      primaryFinishAuthorized: false,
      reason: 'secondary-close-pressure-hp50-race'
    };
  }
  if (primaryNormalAuthorized) {
    return {
      mode: 'primary-profit',
      fireTargetRole: 'primary',
      primarySelected: true,
      secondaryFocusActive: false,
      primaryPhysicalEligible,
      primaryNormalAuthorized,
      primaryFinishAuthorized: false,
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
    primaryPhysicalEligible,
    primaryNormalAuthorized,
    primaryFinishAuthorized: false,
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

// 已经打出伤害的防御交战不应该因为对手火力间歇而脱战: 对手断火 2500ms 就放人,
// 会把一场本来能零伤害收掉的战斗拆成多次重新接触, 每次重新接触都要重新吃伤害。
// 这条证据只延长“不脱战”, 不授予追击: 目标一旦离开攻击距离或者自身血量掉到脱离
// 阈值, 证据立即失效, 交战按原有规则释放。
function secondaryOwnDamageRetentionEvidence(
  combatTargetState = null,
  nowMs = Date.now(),
  windowMs = DEFAULT_SECONDARY_RETENTION_WINDOW_MS,
  options = {},
  context = {}
) {
  const enabled = options.secondaryOwnDamageRetentionEnabled !== false;
  const damageProgress = Math.max(
    0,
    Number(combatTargetState?.damageFromStart || 0),
    Number(combatTargetState?.lastDamageAmount || 0)
  );
  const lastDamageAt = Number(combatTargetState?.lastDamageAt || 0);
  const ageMs = lastDamageAt > 0 ? Math.max(0, Number(nowMs) - lastDamageAt) : null;
  const selfHp = numberOrNull(context.selfHp);
  const lowHpThreshold = Math.max(0, numberOrNull(
    context.lowHpThreshold
      ?? options.combatLowHpLeaveThreshold
      ?? options.combatLowHpThreshold
      ?? options.lowHpThreshold
  ) ?? DEFAULT_SECONDARY_RETENTION_LOW_HP_THRESHOLD);
  const attackRange = Math.max(0, numberOrNull(
    context.attackRange
      ?? options.combatAttackRange
      ?? options.attackRange
  ) ?? DEFAULT_SECONDARY_RETENTION_ATTACK_RANGE_CM);
  const distance = numberOrNull(context.targetDistance);
  const visible = context.targetVisible === true;
  const inRange = distance !== null && distance <= attackRange;
  const healthy = selfHp !== null && selfHp > lowHpThreshold;
  const fresh = ageMs !== null && ageMs <= windowMs;
  const priorIncomingEvidence = context.priorIncomingEvidence !== false;
  const eligible = Boolean(enabled
    && priorIncomingEvidence
    && damageProgress > 0
    && fresh
    && healthy
    && visible
    && inRange);
  const reason = eligible
    ? 'own-damage-progress'
    : (!enabled
        ? 'own-damage-retention-disabled'
        : (!priorIncomingEvidence
            ? 'no-defensive-entry-evidence'
            : (damageProgress <= 0
                ? 'no-own-damage-progress'
                : (!healthy
                    ? 'self-hp-at-or-below-leave-threshold'
                    : (!visible
                        ? 'target-not-realtime-visible'
                        : (!inRange ? 'target-outside-attack-range' : 'own-damage-progress-expired'))))));
  return {
    enabled,
    eligible,
    reason,
    damageProgress,
    lastDamageAt: lastDamageAt || null,
    ageMs,
    selfHp,
    lowHpThreshold,
    attackRange,
    distance,
    visible,
    inRange,
    healthy,
    fresh,
    priorIncomingEvidence
  };
}

function secondaryRetentionPolicy(
  combatTargetState = null,
  nowMs = Date.now(),
  options = {},
  context = {}
) {
  const secondary = combatTargetState?.combatRole === 'secondary'
    || combatTargetState?.secondaryTarget === true;
  const windowMs = Math.max(1000, Number(
    options.secondaryTargetRetentionWindowMs
      ?? options.incomingPressureEvidenceLeaseMs
      ?? DEFAULT_SECONDARY_RETENTION_WINDOW_MS
  ));
  const evidence = [
    ['target-firing', combatTargetState?.lastFiringAt],
    ['collision-path-bullet', combatTargetState?.lastThreatAt],
    ['incoming-bullet', combatTargetState?.lastIncomingBulletAt],
    ['attributable-self-damage', combatTargetState?.hasDamagedSelf === true
      ? combatTargetState?.lastSelfDamageAt
      : 0]
  ]
    .map(([type, at]) => ({ type, at: Number(at || 0) }))
    .filter(item => item.at > 0);
  const ownDamageProgress = secondaryOwnDamageRetentionEvidence(
    combatTargetState,
    nowMs,
    windowMs,
    options,
    { ...context, priorIncomingEvidence: evidence.length > 0 }
  );
  if (ownDamageProgress.eligible) {
    evidence.push({ type: 'own-damage-progress', at: ownDamageProgress.lastDamageAt });
  }
  evidence.sort((left, right) => right.at - left.at);
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
    ownDamageProgress,
    reason: retained
      ? (latest?.type === 'own-damage-progress'
          ? 'secondary-own-damage-progress-grace'
          : 'secondary-defensive-evidence-grace')
      : (secondary ? 'secondary-defensive-evidence-expired' : 'not-secondary')
  };
}

module.exports = {
  DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS,
  DEFAULT_SECONDARY_RETENTION_ATTACK_RANGE_CM,
  DEFAULT_SECONDARY_RETENTION_LOW_HP_THRESHOLD,
  DEFAULT_SECONDARY_RETENTION_WINDOW_MS,
  DEFAULT_SECONDARY_BASE_CADENCE_MS,
  DEFAULT_SECONDARY_CLOSE_DISTANCE_CM,
  DEFAULT_SECONDARY_MAX_CADENCE_MS,
  DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS,
  DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS,
  DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS,
  DEFAULT_SECONDARY_PRESSURE_WINDOW_MS,
  DEFAULT_SECONDARY_WINDOW_MS,
  DEFAULT_PRIMARY_FINISH_RACE_MAX_SHOTS,
  DEFAULT_PRIMARY_FINISH_RACE_TARGET_HP_MAX,
  DEFAULT_PRIMARY_FINISH_RACE_WINDOW_MS,
  classifyCombatTargetRole,
  dualTargetFireArbitration,
  attributedHpLossRateInWindow,
  hpLossRateInWindow,
  incomingPressureEvidencePolicy,
  idOf,
  isWhitelistTarget,
  missionTargetId,
  opponentShotCountInWindow,
  ownDispatchCountInWindow,
  primaryFinishRaceAuthorization,
  primaryRewardSurvivalRacePolicy,
  secondaryCombatExitPolicy,
  secondaryCadenceMs,
  secondaryClosePressurePolicy,
  secondaryFirePolicy,
  secondaryOwnDamageRetentionEvidence,
  secondaryRetentionPolicy
};
