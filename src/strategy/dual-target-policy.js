'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

const DEFAULT_SECONDARY_WINDOW_MS = 5000;
const DEFAULT_SECONDARY_BASE_CADENCE_MS = 500;
const DEFAULT_SECONDARY_MAX_CADENCE_MS = 500;
const DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS = 0;
const DEFAULT_SECONDARY_CLOSE_DISTANCE_CM = 2000;
const DEFAULT_SECONDARY_PRESSURE_WINDOW_MS = 1500;
const DEFAULT_SECONDARY_PRESSURE_MIN_SHOTS = 2;
// 持续攻击的“最新一次发射”容忍度。1500ms 窗口、至少两次发射观测不变, 但最后
// 一次发射的年龄上限从 750ms 放宽到 1200ms: 对手按 500-750ms 节奏连发时, 中间
// 漏掉一次观测就会让 793ms 的样本被判成“已停火”, 1.1km 内的交战因此回落成对
// 9km 外挂机目标的射击。1200ms 仍然要求最后五分之四的窗口内有弹, 不会把已经
// 脱离的目标继续当作持续压力。
const DEFAULT_SECONDARY_PRESSURE_MAX_LAST_SHOT_AGE_MS = 1200;
// 远距离副目标只在对手站桩时开火。按两日生产日志逐档统计“发射数 / 可归因
// 掉血帧”, 6km 是唯一的断崖: 6km 内每档都有稳定命中 (近身 58%、3-4km 13%、
// 4-6km 1.3%), 6km 外两天合计 2,151 发只换来 1 次掉血 (3 点), 约 1,076 体力;
// 其中 2,093 发属于“>6km 且 >=30cm/s”, 正是本门槛抑制的部分。
// 所以门槛取 6km 而不是更激进的距离: 它只砍掉实测零收益的那一段, 不触碰仍有
// 命中的档位。这条门槛只停止“打不中的逐格发射”, 不改变副目标准入、保留、
// Dodge、退出和配额: 对手仍在开火就继续交战并闪避, 只是把体力留到能命中的
// 距离。今日伤害近身豁免 (<=2000cm) 与近身持续压力距离上天然在门槛内。
const DEFAULT_SECONDARY_FIRE_RANGE_CM = 6000;
const DEFAULT_SECONDARY_FIRE_RANGE_EVASIVE_SPEED_CM_PER_SEC = 30;
const DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS = 2500;
const DEFAULT_SECONDARY_RETENTION_WINDOW_MS = DEFAULT_INCOMING_PRESSURE_EVIDENCE_LEASE_MS;
// 已经打出可归因伤害的同一场交战单独用一条更长的租约。对手用横向绕行拉开火力
// 间隔时, 观测到的来弹间隔中位数只有约 1.3s, 但十分之一以上超过 4s, 基础
// 2500ms 租约撑不过一个绕行周期, 于是一场连续交火被拆成多段, 每段都要重新吃
// 伤害。这条更长的租约只作用于 own-damage 分支: 没打出伤害的陌生目标仍然严格
// 走 2500ms/2501ms 边界。它只延长“不脱战”, 不授予追击。
const DEFAULT_SECONDARY_OWN_DAMAGE_RETENTION_WINDOW_MS = 5000;
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

// Mean observed speed over the recent samples. Frame-to-frame vx/vy is noisy for
// a strafing opponent, so the range gate reads the average instead of one frame.
function averageSpeedInWindow(samples = [], nowMs = Date.now(), windowMs = DEFAULT_SECONDARY_WINDOW_MS) {
  const rows = samplesInWindow(samples, nowMs, windowMs);
  if (!rows.length) return 0;
  const total = rows.reduce(
    (sum, sample) => sum + Math.hypot(Number(sample?.vx) || 0, Number(sample?.vy) || 0),
    0
  );
  return total / rows.length;
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
    maxLastShotAgeMs: maximumLastShotAgeMs,
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
  // Only this secondary's attributed injury can extend focus beyond close
  // range. Aggregate pressure from another owner must not authorize it.
  const secondaryDamageWindowMs = Math.max(250, Number(
    options.secondaryTargetPressureWindowMs ?? DEFAULT_SECONDARY_PRESSURE_WINDOW_MS
  ));
  const secondaryDamageRows = attributedHpLossRows(secondarySamples, nowMs, secondaryDamageWindowMs);
  const secondaryDamagePressure = {
    active: secondaryDamageRows.length > 0,
    windowMs: secondaryDamageWindowMs,
    damageHp: secondaryDamageRows.reduce((total, row) => total + row.amount, 0),
    lastDamageAt: secondaryDamageRows.at(-1)?.at ?? null
  };
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
    secondaryDamagePressure,
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

/**
 * Decide whether a low-HP primary may use a bounded finish burst while a
 * defensive secondary is applying pressure. This sits below
 * physical/realtime gates. It never
 * changes the secondary shot quota; that quota is owned by secondary
 * dispatches only.
 */
function primaryFinishRaceAuthorization(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const selfHp = Number(input.selfHp ?? input.self?.hp);
  const primaryHp = Number(input.primaryHp ?? input.primaryTarget?.hp);
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

  const normalBlocker = String(input.normalFireBlocker || '');
  if (input.primaryNormalAuthorized !== true) {
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
    ? 'primary-finish-race-window'
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
  // Beyond close range, require sustained fire AND recent attributed injury
  // from this secondary. This does not grant the close-range quota exemption.
  const damagingPressure = closePressure.sustainedAttack === true
    && rewardRace.secondaryDamagePressure?.active === true;
  if (primaryNormalAuthorized && (closePressure.active === true || damagingPressure)
    && pressureEvidence.active && rewardRace.shouldFocusSecondary) {
    return {
      mode: 'secondary-focus',
      fireTargetRole: 'secondary',
      primarySelected: false,
      secondaryFocusActive: true,
      primaryPhysicalEligible,
      primaryNormalAuthorized,
      primaryFinishAuthorized: false,
      reason: closePressure.active === true
        ? 'secondary-close-pressure-hp50-race'
        : 'secondary-sustained-damage-hp50-race'
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
  const quotaAvailable = ownShots < opponentShots;
  const invulnerable = input.invulnerable === true || target.invulnerable === true;
  const closePressure = secondaryClosePressurePolicy(input, options);
  // History exempts only the quota. Keep sustained pressure separate because
  // primary reward/survival arbitration consumes closePressure.active.
  const dailyDamageCloseExemption = closePressure.close && target.dailyDamageActor === true;
  const throttleExempt = closePressure.active || dailyDamageCloseExemption;
  const quotaExemptionReason = closePressure.active
    ? (dailyDamageCloseExemption ? 'sustained-close-fire+daily-damage-close' : 'sustained-close-fire')
    : (dailyDamageCloseExemption ? 'daily-damage-close' : '');
  const distanceCm = numberOrNull(input.distanceCm ?? target.distance);
  const closeDistanceCm = Math.max(1, Number(
    options.secondaryTargetCloseDistanceCm ?? DEFAULT_SECONDARY_CLOSE_DISTANCE_CM
  ));
  // Never let a configured range fall inside the close band: the <=2000cm quota
  // exemption and the daily-damage exemption are hard entitlements.
  const fireRangeCm = Math.max(closeDistanceCm, Number(
    options.secondaryTargetFireRangeCm ?? DEFAULT_SECONDARY_FIRE_RANGE_CM
  ));
  const evasiveSpeedCmPerSec = Math.max(1, Number(
    options.secondaryTargetFireRangeEvasiveSpeedCmPerSec
      ?? DEFAULT_SECONDARY_FIRE_RANGE_EVASIVE_SPEED_CM_PER_SEC
  ));
  const targetSpeedCmPerSec = averageSpeedInWindow(state.motionSamples, nowMs, windowMs);
  const outOfFireRange = distanceCm !== null && distanceCm > fireRangeCm;
  const evasive = targetSpeedCmPerSec >= evasiveSpeedCmPerSec;
  // Out of range and actually moving: keep the engagement, retention and Dodge,
  // drop only the per-slot dispatch.
  const rangeSuppressed = outOfFireRange && evasive && !throttleExempt;
  // Cadence is a forecast for the shared 10-frame grid, never an independent
  // transmission gate. The rolling quota may still make a legal frame slower.
  const allowed = !invulnerable && !rangeSuppressed && (throttleExempt || quotaAvailable);
  return {
    allowed,
    invulnerable,
    ownShots,
    opponentShots,
    windowMs,
    cadenceMs,
    quotaAvailable,
    throttleExempt,
    dailyDamageCloseExemption,
    quotaExemptionReason,
    closePressure,
    distanceCm,
    fireRangeCm,
    targetSpeedCmPerSec,
    evasive,
    rangeSuppressed,
    reason: invulnerable
      ? 'secondary-invulnerable-dodge-only'
      : closePressure.active
        ? 'secondary-close-pressure-normal-fire'
        : dailyDamageCloseExemption
          ? 'secondary-daily-damage-close-normal-fire'
          : rangeSuppressed
            ? 'secondary-out-of-fire-range'
            : !quotaAvailable
              ? 'secondary-five-second-shot-quota'
              : 'secondary-defensive-fire'
  };
}

// 已经打出伤害的防御交战不应该因为对手火力间歇而脱战: 对手断火 2500ms 就放人,
// 会把一场本来能零伤害收掉的战斗拆成多次重新接触, 每次重新接触都要重新吃伤害。
// 这条证据只延长“不脱战”, 不授予追击: 目标一旦离开攻击距离或者自身血量掉到脱离
// 阈值, 证据立即失效, 交战按原有规则释放。
function secondaryOwnDamageRetentionWindowMs(baseWindowMs, options = {}) {
  const base = Math.max(1000, Number(baseWindowMs) || DEFAULT_SECONDARY_RETENTION_WINDOW_MS);
  const configured = Number(options.secondaryOwnDamageRetentionWindowMs);
  const extended = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SECONDARY_OWN_DAMAGE_RETENTION_WINDOW_MS;
  // 更长的租约永远不会短于基础租约: 打出过伤害不应该反而更早脱战。
  return Math.max(base, extended);
}

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
  const baseWindowMs = Math.max(1000, Number(windowMs) || DEFAULT_SECONDARY_RETENTION_WINDOW_MS);
  const effectiveWindowMs = secondaryOwnDamageRetentionWindowMs(baseWindowMs, options);
  const fresh = ageMs !== null && ageMs <= effectiveWindowMs;
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
    baseWindowMs,
    windowMs: effectiveWindowMs,
    priorIncomingEvidence
  };
}

// The distance/evasiveness gate only trims unproductive per-slot fire, so it must
// never override a decision the reward/survival race already made: when
// `secondary-focus` is active the arbitration owns the shot (UC-005 sustained
// damaging pressure, which is reachable beyond the close band). Returns true only
// when the range gate is the reason to withhold fire and nothing outranks it.
function secondaryRangeGateBlocksFire(input = {}) {
  return input.rangeSuppressed === true && input.secondaryFocusActive !== true;
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
  // own-damage 证据用它自己的更长租约, 其余证据仍然按基础租约判定。每条证据各自
  // 对照自己的租约: 否则一条较新但已过基础租约的开火证据会盖住仍然有效的伤害
  // 进度证据, 反而比没有伤害进度时更早脱战。
  const leaseFor = type => (type === 'own-damage-progress' ? ownDamageProgress.windowMs : windowMs);
  evidence.sort((left, right) => right.at - left.at);
  const qualifying = evidence.filter(item => (
    Math.max(0, Number(nowMs) - item.at) <= leaseFor(item.type)
  ));
  const latest = qualifying[0] || evidence[0] || null;
  const ageMs = latest ? Math.max(0, Number(nowMs) - latest.at) : null;
  const effectiveWindowMs = latest ? leaseFor(latest.type) : windowMs;
  const retained = Boolean(secondary && qualifying.length > 0);
  return {
    secondary,
    retained,
    windowMs: effectiveWindowMs,
    baseWindowMs: windowMs,
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
  DEFAULT_SECONDARY_OWN_DAMAGE_RETENTION_WINDOW_MS,
  DEFAULT_SECONDARY_RETENTION_ATTACK_RANGE_CM,
  DEFAULT_SECONDARY_RETENTION_LOW_HP_THRESHOLD,
  DEFAULT_SECONDARY_RETENTION_WINDOW_MS,
  DEFAULT_SECONDARY_BASE_CADENCE_MS,
  DEFAULT_SECONDARY_CLOSE_DISTANCE_CM,
  DEFAULT_SECONDARY_FIRE_RANGE_CM,
  DEFAULT_SECONDARY_FIRE_RANGE_EVASIVE_SPEED_CM_PER_SEC,
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
  secondaryRangeGateBlocksFire,
  secondaryFirePolicy,
  secondaryOwnDamageRetentionEvidence,
  secondaryOwnDamageRetentionWindowMs,
  secondaryRetentionPolicy
};
