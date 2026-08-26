#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { combatPressurePhaseCore } = require('../src/strategy/combat-pressure');
const {
  DEFAULT_SECONDARY_CLOSE_DISTANCE_CM,
  DEFAULT_PRIMARY_FINISH_RACE_MAX_SHOTS,
  DEFAULT_PRIMARY_FINISH_RACE_TARGET_HP_MAX,
  DEFAULT_PRIMARY_FINISH_RACE_WINDOW_MS,
  dualTargetFireArbitration,
  primaryFinishRaceAuthorization,
  secondaryRetentionPolicy
} = require('../src/strategy/dual-target-policy');
const { recoveryEngagedThreatPolicy } = require('../src/strategy/recovery-contact-guard');
const { COMBAT_CONSTANTS } = require('../src/strategy/combat-constants');

const DEFAULTS = {
  hitRadiusCm: 90,
  tickMs: 50,
  bulletSpeedPerTick: 500,
  bulletTtlMs: 1500,
  combatAttackRange: 14500,
  combatStationarySpeed: 5,
  combatAimNoDamageMs: 1000,
  combatAimMovingScaleThreshold: 0.15,
  primaryFinishRaceWindowMs: DEFAULT_PRIMARY_FINISH_RACE_WINDOW_MS,
  primaryFinishRaceMaxShots: DEFAULT_PRIMARY_FINISH_RACE_MAX_SHOTS,
  primaryFinishRaceTargetHpMax: DEFAULT_PRIMARY_FINISH_RACE_TARGET_HP_MAX,
  incomingPressureEvidenceLeaseMs: 2500,
  combatLowHpLeaveThreshold: COMBAT_CONSTANTS.LOW_HP_THRESHOLD,
  combatShootHardReserveMs: 1800,
  combatShotStaminaCostMs: 500,
  liveDivergencePrecisionCm: 1200,
  liveDivergencePrecisionRatio: 0.08,
  combatAimRadialPrecisionLateralRatio: 0.35,
  fallbackPrecisionNoDamageMs: 25000,
  combatRetreatEdgeRange: 13800,
  combatFinishPressureSelfHpMin: 90,
  combatFinishPressureTargetHpMax: 55,
  combatFinishPressureShootEveryMs: 360,
  combatShootEveryMs: 160,
  combatShootReserveMs: 5600,
  combatShootConserveEveryMs: 360,
  combatShootPressureDodgeReserveMs: 2600,
  combatShootPressureMinHp: 60,
  combatShootPressureRange: 14500,
  combatShootPressureMaxHpGap: 10,
  combatShootPassiveRunnerDodgeReserveMs: 1800,
  combatShootWinningPressureDodgeReserveMs: 1800,
  combatShootWinningPressureMinHp: 60,
  combatShootWinningPressureTargetHpMax: 75,
  combatShootWinningPressureLeadHp: 5,
  combatShootWinningPressureRange: 11000,
  combatShootWinningPressureNoDamageMs: 6000,
  combatPressureNoDamageExitMs: 10000,
  combatPressureNoDamageExitHpThreshold: 80,
  combatPressureNoDamageExitHpGap: 10,
  combatPressureNoDamageExitTargetHpMin: 75,
  combatPressureNoDamageExitRange: 14500,
  combatShootFinishLowThreatDodgeReserveMs: 1800,
  combatShootFinishLowThreatMinHp: 90,
  combatShootFinishLowThreatTargetHpMax: 55,
  combatShootFinishLowThreatMaxHpGap: 0,
  combatShootFinishLowThreatRange: 8500,
  combatFarNoDamageCloseMs: 6000,
  combatFarNoDamageCloseStartRange: 10000,
  combatFarNoDamageCloseRange: 7500,
  combatFarNoDamageCloseMinHp: 60,
  combatFarNoDamageCloseMaxHpGap: 10,
  combatPassiveRunnerMinSelfHp: 80,
  combatPassiveRunnerMinDrop: 1,
  combatOpponentProbeMs: 6000,
  combatOpponentProbeReserveMs: 5600,
  combatOpponentProbeEveryMs: 520,
  combatPassiveRunnerCloseRange: 4500,
  combatPassiveRunnerPrecisionRange: 5500,
  combatPassiveRunnerPrecisionMaxNoDamageMs: 8000,
  combatPassiveRunnerInterceptSpreadScale: 0,
  combatOutOfRangeReengageRange: 15000,
  combatOutOfRangeReengageMinHp: 60,
  combatOutOfRangeReengageMaxHpGap: 10,
  combatOutOfRangePressureReengageMaxHpGap: 20,
  combatOutOfRangeReengageRecentInRangeMs: 2500,
  combatTargetDodgeSpeedPerTick: 50,
  combatAimLowConfidenceThreshold: 0.6,
  combatAimLowConfidenceMinDistance: 9000,
  combatAimLowConfidenceEveryMs: 520,
  serverStallNoDamageLeaveMs: 25000,
  serverStallNoDamagePrecisionGraceMs: 10000,
  serverStallNoDamageHpGap: 5,
  combatAimSnapshotOutlierCloseNativeRange: 8000,
  combatAimSnapshotOutlierCloseSnapshotRatio: 2,
  combatAimSnapshotOutlierDisadvantageRange: 11000,
  combatAimSnapshotOutlierNoDamageMs: 1000,
  opportunityShotStaminaCostMs: 500,
  combatEfficiencyWindowMs: 0,
  combatEfficiencyCloseStepCm: 1000,
  combatEfficiencyMinimumDistanceCm: 1000,
  combatEfficiencyRequiredCloserRatio: 0.5,
  combatEfficiencySampleGapCapMs: 250
};

function parseArgs(argv) {
  const options = {
    file: '',
    startLine: 0,
    endLine: 0,
    selfId: '',
    targetId: '',
    targetName: '',
    json: false,
    selfTest: false,
    ...DEFAULTS
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') options.file = argv[++i] || '';
    else if (arg === '--start-line') options.startLine = Number(argv[++i] || 0);
    else if (arg === '--end-line') options.endLine = Number(argv[++i] || 0);
    else if (arg === '--self-id') options.selfId = String(argv[++i] || '');
    else if (arg === '--target-id') options.targetId = String(argv[++i] || '');
    else if (arg === '--target-name') options.targetName = String(argv[++i] || '');
    else if (arg === '--hit-radius') options.hitRadiusCm = Number(argv[++i] || options.hitRadiusCm);
    else if (arg === '--json') options.json = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node replay-combat.js --file <jsonl> --start-line <n> --end-line <n> [options]

Options:
  --self-id <id>       Own user id. Defaults to first frame self id.
  --target-id <id>     Enemy user id.
  --target-name <name> Enemy name fallback when id is unavailable.
  --hit-radius <cm>    Bullet hit radius estimate. Default: ${DEFAULTS.hitRadiusCm}
  --json               Print JSON instead of a compact text report.
  --self-test          Replay available historical reference fights and require improvement.
`);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointOf(value) {
  const x = numberOrNull(value?.x);
  const y = numberOrNull(value?.y);
  return x === null || y === null ? null : { x, y };
}

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a, scale) {
  return { x: a.x * scale, y: a.y * scale };
}

function unit(v) {
  const d = Math.hypot(v.x, v.y);
  return d > 0 ? { x: v.x / d, y: v.y / d } : null;
}

function sameTarget(entity, options) {
  if (!entity) return false;
  const id = entity.id ?? entity.user_id ?? entity.userId;
  if (options.targetId && id !== null && id !== undefined && String(id) === options.targetId) return true;
  return Boolean(options.targetName && String(entity.name || '') === options.targetName);
}

function findNearbyTarget(entry, options) {
  return (entry.nearbyEntities || []).find(entity => sameTarget(entity, options)) || null;
}

function targetFromEntry(entry, options) {
  const direct = entry.target || entry.decision?.target || null;
  if (sameTarget(direct, options)) return direct;
  return direct || null;
}

function targetHp(frame) {
  return numberOrNull(frame.target?.hp ?? frame.entry?.decision?.target?.hp ?? frame.nearbyTarget?.hp);
}

function nearbyTargetHp(frame) {
  return numberOrNull(frame.nearbyEntity?.hp ?? frame.nearbyEntity?.knownHp);
}

function selfHp(frame) {
  return numberOrNull(frame.self?.hp ?? frame.entry?.decision?.self?.hp);
}

function incomingRealBullet(frame) {
  const incoming = frame.entry?.incomingBullet || frame.entry?.decision?.incomingBullet || null;
  return Boolean(incoming && !incoming.synthetic);
}

function incomingBulletOwnerId(frame) {
  const incoming = frame.entry?.incomingBullet || frame.entry?.decision?.incomingBullet || null;
  return incoming?.ownerId ?? incoming?.owner_id ?? incoming?.source_user_id ?? incoming?.user_id ?? null;
}

function frameTargetId(frame) {
  return frame.target?.id ?? frame.target?.user_id ?? frame.nearbyEntity?.id ?? frame.nearbyEntity?.user_id ?? null;
}

function targetRealBulletPressure(frame) {
  const targetId = frameTargetId(frame);
  const ownerId = incomingBulletOwnerId(frame);
  return Boolean(incomingRealBullet(frame) && targetId !== null && targetId !== undefined && String(ownerId ?? '') === String(targetId));
}

function incomingBulletFromFrame(frame) {
  return frame?.entry?.incomingBullet || frame?.entry?.decision?.incomingBullet || null;
}

function replayPressureEvidenceFromLiveDetail(at, target, secondaryRetention = {}, shooting = {}, movement = {}) {
  const logged = shooting.primaryFinishRace?.pressureEvidence
    || shooting.primaryRewardSurvivalRace?.pressureEvidence
    || null;
  if (logged && typeof logged === 'object' && typeof logged.active === 'boolean') {
    return logged;
  }

  const secondaryId = target?.user_id ?? target?.userId ?? target?.id ?? null;
  const ownerIds = secondaryId === null || secondaryId === undefined || secondaryId === ''
    ? []
    : [String(secondaryId)];
  const latestEvidenceAt = numberOrNull(secondaryRetention.latestEvidenceAt);
  const ageMs = numberOrNull(secondaryRetention.ageMs);
  const leaseMs = Math.max(
    250,
    Number(shooting.primaryRewardSurvivalRace?.pressureEvidence?.leaseMs
      || DEFAULTS.incomingPressureEvidenceLeaseMs)
  );
  const retained = secondaryRetention.retained === true
    && Number.isFinite(Number(at))
    && Number.isFinite(latestEvidenceAt)
    && latestEvidenceAt <= Number(at)
    && Number.isFinite(ageMs)
    && ageMs >= 0
    && ageMs <= leaseMs;
  const currentDodgeThreat = movement.dodgeOwnership?.currentThreat === true
    || (Array.isArray(movement.dodge?.threatField)
      && movement.dodge.threatField.some(item => Number(item?.directHits || 0) > 0));
  if (!retained && !currentDodgeThreat) return null;

  const evidenceTypes = [];
  if (currentDodgeThreat) evidenceTypes.push('collision-path-bullet');
  if (retained) evidenceTypes.push('retained-defensive-evidence');
  return {
    active: true,
    currentCollision: currentDodgeThreat,
    recentEvidence: retained,
    established: retained,
    ownerIds,
    ownerKnown: ownerIds.length > 0,
    leaseMs,
    latestEvidenceAt: retained ? latestEvidenceAt : Number(at),
    latestEvidenceType: retained
      ? String(secondaryRetention.latestEvidenceType || 'retained-defensive-evidence')
      : 'collision-path-bullet',
    latestAgeMs: retained ? ageMs : 0,
    evidenceTypes,
    reason: currentDodgeThreat
      ? 'incoming-collision-path-pressure'
      : 'retained-defensive-evidence',
    replayDerived: true
  };
}

function replayRewardRaceFromLiveDetail(rewardRace = {}, pressureEvidence = null) {
  if (!pressureEvidence?.active || rewardRace.evaluated === true) return rewardRace;

  const primaryRewardEtaMs = Number(rewardRace.primaryRewardEtaMs);
  const selfHp50EtaMs = Number(rewardRace.selfHp50EtaMs);
  const safetyMarginMs = Math.max(0, Number(rewardRace.safetyMarginMs ?? 1000));
  const incomingRateHpPerSec = Number(rewardRace.incomingRateHpPerSec);
  const evaluated = Number.isFinite(incomingRateHpPerSec)
    && incomingRateHpPerSec > 0
    && Number.isFinite(primaryRewardEtaMs)
    && Number.isFinite(selfHp50EtaMs);
  if (!evaluated) {
    return {
      ...rewardRace,
      replayDerived: true,
      replayDerivationReason: 'retained-pressure-without-complete-race-rates'
    };
  }
  const continuePrimary = primaryRewardEtaMs + safetyMarginMs < selfHp50EtaMs;
  return {
    ...rewardRace,
    evaluated: true,
    continuePrimary,
    shouldFocusSecondary: !continuePrimary,
    reason: continuePrimary
      ? 'primary-reward-before-hp50-margin-replay-derived'
      : 'hp50-before-primary-reward-margin-replay-derived',
    replayDerived: true,
    replayDerivationReason: 'secondary-retention-reconstructed-pressure-evidence'
  };
}

function combatMoveVelocityForDirection(dx, dy, options) {
  const speedPerTick = Math.max(0, Number(options.combatTargetDodgeSpeedPerTick || 50));
  const x = Math.sign(Number(dx) || 0);
  const y = Math.sign(Number(dy) || 0);
  if (x && y) return { vx: x * speedPerTick / Math.SQRT2, vy: y * speedPerTick / Math.SQRT2 };
  return { vx: x * speedPerTick, vy: y * speedPerTick };
}

function safeCloseDirectionAllowed(frame, simulatedSelf, direction, options) {
  const incoming = incomingBulletFromFrame(frame);
  if (!incoming || incoming.synthetic) return true;
  const dx = Math.sign(Number(direction?.x || 0));
  const dy = Math.sign(Number(direction?.y || 0));
  if (!(dx || dy)) return false;
  const move = combatMoveVelocityForDirection(dx, dy, options);
  const threats = Array.isArray(incoming.threats) && incoming.threats.length ? incoming.threats : [incoming];
  const hitRadiusFallback = Math.max(0, Number(options.hitRadiusCm || DEFAULTS.hitRadiusCm || 90));
  const minSafeCpa = hitRadiusFallback * 3;
  for (const threat of threats.filter(Boolean).slice(0, 6)) {
    const rx = Number(threat.x) - Number(simulatedSelf.x);
    const ry = Number(threat.y) - Number(simulatedSelf.y);
    const rvx = (Number(threat.vx) || 0) - move.vx;
    const rvy = (Number(threat.vy) || 0) - move.vy;
    const relSpeedSq = rvx * rvx + rvy * rvy;
    const rawImpactTicks = Number(threat.impactTicks);
    const horizonTicks = Math.max(0, Math.min(
      Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
      Number(options.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(options.bulletSpeedPerTick || DEFAULTS.bulletSpeedPerTick))
    ));
    const cpaTicks = relSpeedSq > 0.000001
      ? Math.max(0, Math.min(horizonTicks, -(rx * rvx + ry * rvy) / relSpeedSq))
      : 0;
    const cpaDistance = Math.hypot(rx + rvx * cpaTicks, ry + rvy * cpaTicks);
    const hitRadius = Math.max(0, Number(threat.hitRadius ?? hitRadiusFallback));
    if (cpaDistance <= hitRadius || cpaDistance < Math.max(minSafeCpa, hitRadius * 3)) return false;
  }
  return true;
}

function stamina5s(frame) {
  const self = frame.entry?.self || frame.entry?.decision?.self || null;
  return numberOrNull(self?.stamina_5s_remaining_milli ?? self?.stamina5s);
}

function shootingReason(frame) {
  return String(
    frame.entry?.combatState?.shooting?.reason
      ?? frame.entry?.decision?.combatState?.shooting?.reason
      ?? ''
  );
}

function serverStalled(frame) {
  const stall = frame.entry?.control?.serverPositionStall || frame.entry?.combatMetrics?.serverPositionStall || null;
  return Boolean(stall?.stalled);
}

function noDamageMs(frame) {
  return numberOrNull(
    frame.entry?.aimTarget?.noDamageMs
      ?? frame.entry?.combatState?.aim?.noDamageMs
      ?? frame.entry?.combatMetrics?.damage?.noTargetDamageMs
      ?? frame.entry?.combatMetrics?.damage?.lastTargetDamageAgeMs
  ) || 0;
}

function interpolate(samples, t) {
  if (!samples.length || t < samples[0].at || t > samples[samples.length - 1].at) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].at <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[Math.min(lo + 1, samples.length - 1)];
  if (!b || b.at === a.at) return { x: a.x, y: a.y };
  const ratio = (t - a.at) / (b.at - a.at);
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio
  };
}

function samplesFromFrames(frames, key) {
  return frames
    .map(frame => {
      const point = frame[key];
      return point ? { at: frame.at, x: point.x, y: point.y } : null;
    })
    .filter(Boolean);
}

function samplesFromFramesBy(frames, pickPoint) {
  return frames
    .map(frame => {
      const point = pickPoint(frame);
      return point ? { at: frame.at, x: point.x, y: point.y } : null;
    })
    .filter(Boolean);
}

function farNoDamageCloseActive(frame, options, selfPoint = frame.self) {
  if (!selfPoint || !frame.nearbyTarget) return false;
  const thresholdMs = Math.max(0, Number(options.combatFarNoDamageCloseMs || 0));
  const startRange = Math.max(0, Number(options.combatFarNoDamageCloseStartRange || 0));
  const closeRange = Math.max(0, Number(options.combatFarNoDamageCloseRange || 0));
  const minHp = Math.max(0, Number(options.combatFarNoDamageCloseMinHp || 0));
  const maxHpGap = Math.max(0, Number(options.combatFarNoDamageCloseMaxHpGap || 0));
  const d = distance(selfPoint, frame.nearbyTarget);
  const hp = frame.selfHp;
  const enemyHp = frame.targetHp;
  const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
  return Boolean(
    thresholdMs
    && startRange
    && frame.noDamageMs >= thresholdMs
    && d >= startRange
    && d > closeRange
    && (!Number.isFinite(hp) || hp >= minHp)
    && (!Number.isFinite(hpGap) || hpGap <= maxHpGap)
  );
}

function simulateFarNoDamageSelfSamples(frames, options) {
  const speedPerMs = Math.max(1, Number(options.combatTargetDodgeSpeedPerTick || 50)) / Number(options.tickMs || 50);
  const closeRange = Math.max(0, Number(options.combatFarNoDamageCloseRange || 0));
  const samples = [];
  let simulated = null;
  let lastAt = null;
  let activeStarted = null;
  let activeFrames = 0;
  for (const frame of frames) {
    if (!frame.self) continue;
    if (!simulated) simulated = { ...frame.self };
    if (lastAt !== null && farNoDamageCloseActive(frame, options, simulated)) {
      if (!activeStarted) activeStarted = frame;
      activeFrames += 1;
      const target = frame.nearbyTarget;
      if (target) {
        const dt = Math.max(0, frame.at - lastAt);
        const toTarget = sub(target, simulated);
        const d = Math.hypot(toTarget.x, toTarget.y);
        if (d > closeRange) {
          const step = Math.min(Math.max(0, d - closeRange), speedPerMs * dt);
          if (step > 0) {
            const dir = unit(toTarget);
            if (dir && safeCloseDirectionAllowed(frame, simulated, dir, options)) {
              simulated = add(simulated, mul(dir, step));
            }
          }
        }
      }
    }
    samples.push({ at: frame.at, x: simulated.x, y: simulated.y });
    lastAt = frame.at;
  }
  return { samples, activeStarted, activeFrames };
}

function cloneShotWithSimulatedSelf(shot, simulatedSelfSamples) {
  const simulatedSelf = interpolate(simulatedSelfSamples, shot.frame.at);
  if (!simulatedSelf) return shot;
  return {
    ...shot,
    frame: {
      ...shot.frame,
      self: simulatedSelf
    }
  };
}

function normalizedCombatEntity(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const id = source.id ?? source.user_id ?? source.userId ?? source.entity_id ?? source.entityId;
  const stamina5s = source.stamina_5s_remaining_milli ?? source.stamina5sRemainingMilli ?? source.stamina5s;
  return {
    ...source,
    ...(id === null || id === undefined || id === '' ? {} : { id, user_id: id }),
    ...(stamina5s === null || stamina5s === undefined ? {} : { stamina_5s_remaining_milli: stamina5s })
  };
}

function entryAtMs(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function browserlessSyntheticBullets(detail, state = {}) {
  const metrics = detail?.metrics && typeof detail.metrics === 'object' ? detail.metrics : {};
  const target = normalizedCombatEntity(detail?.target);
  const self = normalizedCombatEntity(detail?.self);
  const engagementId = String(metrics.engagementId || metrics.targetId || target.user_id || 'unknown');
  const accepted = numberOrNull(metrics.acceptedShots);
  const previous = state.acceptedByEngagement.get(engagementId);
  state.acceptedByEngagement.set(engagementId, accepted);
  if (accepted === null || previous === undefined) return [];
  const delta = accepted >= previous ? accepted - previous : accepted;
  const count = Math.max(0, Math.min(16, Math.round(delta)));
  const aim = detail?.aim && typeof detail.aim === 'object' ? detail.aim : target;
  const origin = pointOf(self);
  const aimPoint = pointOf(aim) || pointOf(target);
  if (!origin || !aimPoint || !count) return [];
  const direction = unit(sub(aimPoint, origin));
  if (!direction) return [];
  const speed = Math.max(1, Number(detail?.bulletSpeedPerTick || DEFAULTS.bulletSpeedPerTick));
  const firstSequence = Math.max(0, Math.round(accepted - count + 1));
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic:${engagementId}:${firstSequence + index}`,
    owner_id: self.user_id ?? null,
    x: origin.x,
    y: origin.y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    synthetic: true
  }));
}

function normalizeBrowserlessCombatLiveEntry(entry, state = {}) {
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const self = normalizedCombatEntity(detail.self);
  const target = normalizedCombatEntity(detail.target);
  const aim = detail.aim && typeof detail.aim === 'object' ? detail.aim : {};
  const shooting = detail.shooting && typeof detail.shooting === 'object' ? detail.shooting : {};
  const metrics = detail.metrics && typeof detail.metrics === 'object' ? detail.metrics : {};
  const combatAudit = detail.combatAudit && typeof detail.combatAudit === 'object'
    ? detail.combatAudit
    : {};
  const finalAction = combatAudit.finalAction && typeof combatAudit.finalAction === 'object'
    ? combatAudit.finalAction
    : {};
  const desiredAction = combatAudit.desiredAction && typeof combatAudit.desiredAction === 'object'
    ? combatAudit.desiredAction
    : {};
  const movement = detail.movement && typeof detail.movement === 'object' ? detail.movement : {};
  const secondaryRetention = detail.secondaryRetention && typeof detail.secondaryRetention === 'object'
    ? detail.secondaryRetention
    : {};
  const primarySource = detail.profitMission?.navigationTarget || null;
  const primaryId = primarySource?.userId ?? primarySource?.user_id
    ?? detail.profitMission?.targetId ?? detail.profitMission?.subjectId ?? null;
  const primaryAim = detail.primaryAim && typeof detail.primaryAim === 'object'
    ? detail.primaryAim
    : {};
  const primaryRewardSurvivalRace = shooting.primaryRewardSurvivalRace
    && typeof shooting.primaryRewardSurvivalRace === 'object'
    ? shooting.primaryRewardSurvivalRace
    : {};
  const primaryFireAuthorization = shooting.primaryFireAuthorization
    && typeof shooting.primaryFireAuthorization === 'object'
    ? shooting.primaryFireAuthorization
    : {};
  const primaryHp = numberOrNull(
    primaryRewardSurvivalRace.primaryHp
      ?? primarySource?.hp
  );
  const primaryDistance = numberOrNull(
    primaryRewardSurvivalRace.primaryDistanceCm
      ?? primarySource?.distance
  );
  const legacyPrimaryCanAttack = shooting.secondaryPolicy?.primaryCanAttack === true;
  const primaryNormalAuthorized = typeof shooting.primaryNormalAuthorized === 'boolean'
    ? shooting.primaryNormalAuthorized
    : (typeof primaryFireAuthorization.authorized === 'boolean'
        ? primaryFireAuthorization.authorized
        : legacyPrimaryCanAttack);
  const primaryPhysicalExplicit = typeof shooting.primaryPhysicalEligible === 'boolean'
    ? shooting.primaryPhysicalEligible
    : null;
  const primaryTargetFresh = typeof shooting.primaryTargetFresh === 'boolean'
    ? shooting.primaryTargetFresh
    : Boolean(
        (primarySource?.authority || '').toLowerCase() !== 'snapshot'
          && primaryAim.ok === true
      );
  const primaryPhysicalDerived = Boolean(
    primaryTargetFresh
      && primaryAim.ok === true
      && Number.isFinite(primaryHp)
      && primaryHp > 0
      && primarySource?.alive !== false
      && primarySource?.invulnerable !== true
      && Number.isFinite(primaryDistance)
      && primaryDistance <= DEFAULTS.combatAttackRange
  );
  const primaryPhysicalEligible = primaryPhysicalExplicit === null
    ? (legacyPrimaryCanAttack || primaryPhysicalDerived)
    : primaryPhysicalExplicit;
  const primaryCompetitionAllowed = typeof shooting.primaryCompetitionAllowed === 'boolean'
    ? shooting.primaryCompetitionAllowed
    : true;
  const primaryFinishRace = shooting.primaryFinishRace
    && typeof shooting.primaryFinishRace === 'object'
    ? shooting.primaryFinishRace
    : null;
  const closePressure = shooting.secondaryPolicy?.closePressure
    && typeof shooting.secondaryPolicy.closePressure === 'object'
    ? shooting.secondaryPolicy.closePressure
    : { active: false };
  const at = entryAtMs(entry?.at);
  const pressureEvidence = replayPressureEvidenceFromLiveDetail(
    at,
    target,
    secondaryRetention,
    shooting,
    movement
  );
  const replayRewardRace = replayRewardRaceFromLiveDetail(
    primaryRewardSurvivalRace,
    pressureEvidence
  );
  const primaryAimReachable = Boolean(
    primaryAim.ok === true
      && primaryAim.fireReachability?.reachable === true
  );
  const primaryAimProofValid = Boolean(
    primaryAimReachable
      && primaryAim.trajectoryAimProof?.valid === true
  );
  const loggedFireTargetRole = String(
    shooting.targetRole
      || detail.fireTargetRole
      || ''
  );
  return {
    type: 'combat-frame',
    sourceType: 'combat-live',
    at,
    self,
    target,
    nearbyEntities: target.user_id === undefined ? [] : [target],
    aimTarget: aim,
    bullets: browserlessSyntheticBullets(detail, state),
    combatState: {
      aim,
      shooting,
      combatMetrics: metrics,
      passiveRunner: detail.passiveRunner || null,
      outOfRangeHold: detail.outOfRangeHold || null
    },
    combatMetrics: metrics,
    control: detail.control || null,
    incomingBullet: detail.incomingBullet || null,
    invulnerableAvoidanceReplay: primaryId === null || primaryId === undefined || primaryId === ''
      ? null
      : {
          primaryTargetId: String(primaryId),
          primaryTargetName: String(primarySource?.name || ''),
          secondaryTargetId: target.user_id === undefined || target.user_id === null
            ? ''
            : String(target.user_id),
          secondaryRetained: secondaryRetention.retained === true,
          secondaryEvidenceAgeMs: numberOrNull(secondaryRetention.ageMs),
          loggedFinalActionKind: String(finalAction.kind || ''),
          loggedFinalActionBand: String(finalAction.band || ''),
          loggedFinalActionReason: String(finalAction.reason || ''),
          desiredActionKind: String(desiredAction.kind || ''),
          desiredActionBand: String(desiredAction.band || ''),
          desiredActionReason: String(desiredAction.reason || ''),
          movementReason: String(movement.reason || '')
        },
    secondaryRetentionReplay: {
      targetId: target.user_id === undefined || target.user_id === null
        ? ''
        : String(target.user_id),
      secondary: secondaryRetention.secondary === true
        || String(target.combatRole || '') === 'secondary'
        || target.secondaryTarget === true,
      retained: secondaryRetention.retained === true,
      windowMs: numberOrNull(secondaryRetention.windowMs),
      evidenceAt: numberOrNull(secondaryRetention.latestEvidenceAt),
      evidenceType: String(secondaryRetention.latestEvidenceType || ''),
      evidenceAgeMs: numberOrNull(secondaryRetention.ageMs),
      distanceCm: numberOrNull(target.distance),
      authority: String(target.authority || ''),
      alive: target.alive !== false,
      active: target.active === true,
      firing: target.firing === true,
      whitelisted: Boolean(target.whitelisted || target.profitProtected || target.creatorProtected),
      loggedFinalActionKind: String(finalAction.kind || ''),
      loggedFinalActionBand: String(finalAction.band || ''),
      loggedFinalActionReason: String(finalAction.reason || ''),
      loggedFinalActionStopMotion: finalAction.stopMotion === true,
      loggedRecoveringSelf: detail.contactEntryGuard?.assessment?.recoveringSelf === true
    },
    dualTargetReplay: primaryId === null || primaryId === undefined || primaryId === ''
      ? null
      : {
          primaryTarget: {
            user_id: primaryId,
            name: String(primarySource?.name || ''),
            x: numberOrNull(primarySource?.x),
            y: numberOrNull(primarySource?.y),
            hp: primaryHp,
            alive: primarySource?.alive !== false,
            invulnerable: primarySource?.invulnerable === true,
            distance: primaryDistance,
            authority: String(primarySource?.authority || '')
          },
          secondaryTargetId: target.user_id ?? null,
          secondaryDistanceCm: numberOrNull(target.distance),
          primaryCanAttack: primaryNormalAuthorized,
          primaryNormalAuthorized,
          primaryPhysicalEligible,
          primaryPhysicalSource: primaryPhysicalExplicit === null ? 'replay-derived' : 'logged',
          primaryCompetitionAllowed,
          primaryTargetFresh,
          primaryFinishRace,
          primaryFinishRaceActive: primaryFinishRace?.active === true,
          primaryFinishRaceEligible: primaryFinishRace?.eligible === true,
          primaryFinishRaceDispatchCount: numberOrNull(primaryFinishRace?.dispatchCount),
          primaryFinishRaceMaxShots: numberOrNull(primaryFinishRace?.maxShots),
          primaryFinishRaceWindowStartedAt: numberOrNull(primaryFinishRace?.windowStartedAt),
          primaryFinishRaceWindowExpiresAt: numberOrNull(primaryFinishRace?.windowExpiresAt),
          normalFireBlocker: String(primaryFireAuthorization.finalFireBlocker || ''),
          closePressure,
          pressureEvidence,
          replayDerivedPressureEvidence: pressureEvidence?.replayDerived === true,
          rewardRace: replayRewardRace,
          replayDerivedRewardRace: replayRewardRace?.replayDerived === true,
          primaryAimReachable,
          primaryAimProofValid,
          selfStamina5s: numberOrNull(self.stamina5s ?? self.stamina_5s_remaining_milli),
          hardReserveMs: numberOrNull(shooting.hardReserveMs),
          shotCostMs: numberOrNull(shooting.shotCostMs),
          dodgeActionCostMs: numberOrNull(shooting.dodgeActionCostMs),
          loggedFireTargetRole,
          wouldShoot: shooting.wouldShoot === true,
          finalFireBlocker: String(shooting.finalFireBlocker || '')
        },
    decision: {
      self,
      target,
      reason: detail.reason || shooting.reason || '',
      combatState: {
        aim,
        shooting,
        passiveRunner: detail.passiveRunner || null,
        outOfRangeHold: detail.outOfRangeHold || null
      }
    }
  };
}

function loadFrames(options) {
  if (!options.file) throw new Error('--file is required');
  const filePath = path.resolve(options.file);
  const start = Math.max(1, Number(options.startLine || 1));
  const requestedEnd = Number(options.endLine || 0);
  const end = requestedEnd > 0 ? requestedEnd : Infinity;
  const frames = [];
  const sourceEvents = [];
  const foundTypes = new Set();
  const browserlessState = { acceptedByEngagement: new Map() };
  let inferredSelfId = options.selfId;
  let inferredTargetId = options.targetId;
  let inferredTargetName = options.targetName;

  const processLine = (raw, lineNo) => {
    if (lineNo < start || lineNo > end || !raw || !raw.trim()) return;
    let sourceEntry;
    try {
      sourceEntry = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const sourceType = String(sourceEntry.type || '');
    if (sourceType) foundTypes.add(sourceType);
    if (sourceType === 'shoot-execution') {
      const detail = sourceEntry.detail && typeof sourceEntry.detail === 'object'
        ? sourceEntry.detail
        : {};
      sourceEvents.push({
        lineNo,
        at: entryAtMs(sourceEntry.at ?? detail.atMs),
        type: sourceType,
        detail: {
          type: String(detail.type || ''),
          targetId: String(detail.targetId ?? ''),
          outcome: String(detail.outcome || '')
        }
      });
    }
    const entry = sourceType === 'combat-frame'
      ? sourceEntry
      : (sourceType === 'combat-live' ? normalizeBrowserlessCombatLiveEntry(sourceEntry, browserlessState) : null);
    if (!entry) return;
    const self = entry.self || entry.decision?.self || null;
    if (!inferredSelfId && (self?.id ?? self?.user_id ?? self?.userId) !== undefined) {
      inferredSelfId = String(self.id ?? self.user_id ?? self.userId);
    }
    const target = targetFromEntry(entry, { targetId: inferredTargetId, targetName: inferredTargetName });
    if (!inferredTargetId && (target?.id ?? target?.user_id ?? target?.userId) !== undefined) {
      inferredTargetId = String(target.id ?? target.user_id ?? target.userId);
    }
    if (!inferredTargetName && target?.name) inferredTargetName = String(target.name);
    const matchOptions = { ...options, selfId: inferredSelfId, targetId: inferredTargetId, targetName: inferredTargetName };
    const nearbyTarget = findNearbyTarget(entry, matchOptions);
    const at = entryAtMs(entry.at);
    if (!Number.isFinite(at)) return;
    const frame = {
      lineNo,
      entry,
      at,
      self: pointOf(self),
      decisionTarget: pointOf(target),
      nearbyTarget: pointOf(nearbyTarget),
      target,
      nearbyEntity: nearbyTarget,
      aim: pointOf(entry.aimTarget || entry.combatState?.aim),
      selfHp: null,
      targetHp: null,
      nearbyHp: null,
      noDamageMs: 0
    };
    frame.selfHp = selfHp(frame);
    frame.targetHp = targetHp(frame);
    frame.nearbyHp = nearbyTargetHp(frame);
    frame.noDamageMs = noDamageMs(frame);
    frames.push(frame);
  };

  const consumeText = text => {
    const lines = String(text || '').split('\n');
    for (let index = 0; index < lines.length && index + 1 <= end; index += 1) {
      processLine(lines[index].replace(/\r$/, ''), index + 1);
    }
  };

  if (/\.gz$/i.test(filePath)) {
    consumeText(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
  } else {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let carry = '';
    let lineNo = 1;
    try {
      while (lineNo <= end) {
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!bytes) break;
        carry += buffer.toString('utf8', 0, bytes);
        let newline;
        while ((newline = carry.indexOf('\n')) !== -1) {
          const raw = carry.slice(0, newline).replace(/\r$/, '');
          carry = carry.slice(newline + 1);
          processLine(raw, lineNo);
          lineNo += 1;
          if (lineNo > end) break;
        }
      }
      if (lineNo <= end && carry) processLine(carry.replace(/\r$/, ''), lineNo);
    } finally {
      fs.closeSync(fd);
    }
  }
  if (!frames.length) {
    const actual = foundTypes.size ? Array.from(foundTypes).sort().join(', ') : 'none';
    throw new Error(`no replayable combat entries matched the selected line range; accepted formats: combat-frame, combat-live; found types: ${actual}`);
  }
  return {
    file: filePath,
    frames,
    selfId: inferredSelfId || options.selfId,
    targetId: inferredTargetId || options.targetId,
    targetName: inferredTargetName || options.targetName,
    sourceEvents
  };
}

function runLoadFramesSelfTest() {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-replay-loader-'));
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`replay loader self-test failed: ${name}`);
  };
  try {
    const legacyFile = path.join(root, 'legacy.jsonl');
    fs.writeFileSync(legacyFile, JSON.stringify({
      type: 'combat-frame',
      at: 1000,
      self: { id: '7', x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 9000 },
      target: { id: '8', name: 'target', x: 5000, y: 0, hp: 100 },
      nearbyEntities: [{ id: '8', name: 'target', x: 5000, y: 0, hp: 100 }],
      aimTarget: { x: 5000, y: 0 },
      bullets: []
    }) + '\n');
    const legacy = loadFrames({ file: legacyFile, startLine: 1, endLine: 1, selfId: '', targetId: '', targetName: '' });
    assert('legacy combat-frame remains readable', legacy.frames.length === 1
      && legacy.selfId === '7' && legacy.targetId === '8');

    const liveFile = path.join(root, 'browserless.jsonl.gz');
    const primaryTarget = {
      userId: '9',
      name: 'primary',
      x: 4500,
      y: 0,
      hp: 100,
      alive: true,
      invulnerable: true,
      distance: 4500
    };
    const liveEntries = [
      {
        at: '2026-07-29T00:00:00.000Z',
        type: 'combat-live',
        detail: {
          self: { userId: '7', x: 0, y: 0, hp: 100, stamina5s: 9000 },
          target: { userId: '8', name: 'target', x: 5000, y: 0, hp: 100, vx: 20, vy: 0, distance: 5000 },
          aim: { x: 5100, y: 0, noDamageMs: 0 },
          shooting: {
            reason: 'normal-cadence',
            wouldShoot: true,
            secondaryPolicy: { primaryCanAttack: false }
          },
          profitMission: { targetId: '9', navigationTarget: primaryTarget },
          metrics: { engagementId: '8:1', acceptedShots: 0, confirmedHits: 0 }
        }
      },
      {
        at: '2026-07-29T00:00:00.050Z',
        type: 'combat-live',
        detail: {
          self: { userId: '7', x: 0, y: 0, hp: 100, stamina5s: 8500 },
          target: { userId: '8', name: 'target', x: 5010, y: 0, hp: 100, vx: 20, vy: 0, distance: 5010 },
          aim: { x: 5110, y: 0, noDamageMs: 50 },
          profitMission: {
            targetId: '9',
            navigationTarget: { ...primaryTarget, invulnerable: false }
          },
          primaryAim: {
            ok: true,
            fireReachability: { reachable: true },
            trajectoryAimProof: { valid: true }
          },
          secondaryRetention: {
            retained: true,
            ageMs: 50,
            latestEvidenceAt: Date.parse('2026-07-29T00:00:00.050Z') - 50,
            latestEvidenceType: 'collision-path-bullet',
            windowMs: 5000
          },
          shooting: {
            reason: 'normal-cadence',
            wouldShoot: false,
            finalFireBlocker: 'secondary:primary-target-fire-available',
            primaryRewardSurvivalRace: {
              primaryHp: 100,
              primaryDistanceCm: 4500,
              primaryRewardEtaMs: 1000,
              selfHp50EtaMs: 5000,
              incomingRateHpPerSec: 3,
              safetyMarginMs: 1000
            },
            secondaryPolicy: { primaryCanAttack: true }
          },
          metrics: { engagementId: '8:1', acceptedShots: 1, confirmedHits: 0 }
        }
      },
      {
        at: '2026-07-29T00:00:00.025Z',
        type: 'shoot-execution',
        detail: {
          type: 'shoot-dispatch',
          targetId: '8',
          outcome: 'transport-accepted'
        }
      }
    ];
    fs.writeFileSync(liveFile, zlib.gzipSync(Buffer.from(liveEntries.map(JSON.stringify).join('\n') + '\n')));
    const live = loadFrames({ file: liveFile, startLine: 1, endLine: 3, selfId: '', targetId: '', targetName: '' });
    assert('gzip browserless combat-live normalizes ids and ISO time', live.frames.length === 2
      && live.selfId === '7' && live.targetId === '8'
      && Number.isFinite(live.frames[0].at) && live.frames[0].at < live.frames[1].at);
    assert('browserless accepted-shot deltas normalize to synthetic replay bullets',
      Array.isArray(live.frames[1].entry.bullets) && live.frames[1].entry.bullets.length === 1);
    const dualTarget = runDualTargetFireArbitrationReplay(live.frames, live.sourceEvents);
    assert('browserless dual-target replay preserves pre-unlock defense and corrects post-unlock selection',
      dualTarget?.preservedSecondarySelectionFrames === 1
      && dualTarget?.correctedPrimarySelectionFrames === 1
      && dualTarget?.loggedDispatches?.primary === 0
      && dualTarget?.loggedDispatches?.secondaryBeforePrimaryAuthorization === 1
        && dualTarget?.pressureEvidenceFrames === 1
        && dualTarget?.replayDerivedPressureEvidenceFrames === 1
        && dualTarget?.improved === true);

    const avoidanceEntries = [
      {
        at: '2026-07-29T00:00:00.000Z',
        type: 'combat-live',
        detail: {
          self: { userId: '7', x: 0, y: 0, hp: 100, stamina5s: 9000 },
          target: { userId: '8', name: 'target', x: 5000, y: 0, hp: 100, distance: 5000, invulnerable: true },
          movement: { reason: 'secondary-follow-primary-target' },
          secondaryRetention: { retained: true, ageMs: 100 },
          combatAudit: {
            finalAction: { kind: 'flee', band: 'safety', reason: 'avoid-invulnerable-target' },
            desiredAction: { kind: 'shoot', band: 'combat', reason: 'secondary:secondary-invulnerable-dodge-only' }
          },
          profitMission: { targetId: '9', navigationTarget: { ...primaryTarget } }
        }
      },
      {
        at: '2026-07-29T00:00:00.050Z',
        type: 'combat-live',
        detail: {
          self: { userId: '7', x: 0, y: 0, hp: 100, stamina5s: 8500 },
          target: { userId: '8', name: 'target', x: 5010, y: 0, hp: 100, distance: 5010, invulnerable: true },
          movement: { reason: 'secondary-follow-primary-target' },
          secondaryRetention: { retained: true, ageMs: 150 },
          combatAudit: {
            finalAction: { kind: 'incoming-bullet-dodge', band: 'safety', reason: 'incoming-bullet-dodge' },
            desiredAction: { kind: 'shoot', band: 'combat', reason: 'secondary:secondary-invulnerable-dodge-only' }
          },
          profitMission: { targetId: '9', navigationTarget: { ...primaryTarget } }
        }
      }
    ];
    const avoidanceFile = path.join(root, 'invulnerable-avoidance.jsonl.gz');
    fs.writeFileSync(avoidanceFile, zlib.gzipSync(Buffer.from(avoidanceEntries.map(JSON.stringify).join('\n') + '\n')));
    const avoidanceLoaded = loadFrames({ file: avoidanceFile, startLine: 1, endLine: 2, selfId: '', targetId: '', targetName: '' });
    const avoidance = runInvulnerableAvoidanceArbitrationReplay(avoidanceLoaded.frames);
    assert('browserless replay corrects generic invulnerable avoidance while preserving incoming Dodge',
      avoidance?.loggedAvoidanceFrames === 1
        && avoidance?.correctedEscortFrames === 1
        && avoidance?.preservedIncomingDodgeFrames === 1
        && avoidance?.improved === true);

    const retentionEntry = (offsetMs, targetHp, distance, selfHp, evidenceAgeMs) => ({
      at: new Date(Date.parse('2026-08-26T06:39:02.000Z') + offsetMs).toISOString(),
      type: 'combat-live',
      detail: {
        self: { userId: '7', x: 0, y: 0, hp: selfHp, stamina5s: 2239 },
        target: {
          userId: '8',
          name: 'target',
          x: distance,
          y: 0,
          hp: targetHp,
          distance,
          active: true,
          firing: false,
          authority: 'realtime',
          combatRole: 'secondary',
          combatIntent: 'engaged'
        },
        secondaryRetention: {
          secondary: true,
          retained: evidenceAgeMs <= 2500,
          ageMs: evidenceAgeMs,
          latestEvidenceAt: Date.parse('2026-08-26T06:39:02.000Z') + offsetMs - evidenceAgeMs,
          latestEvidenceType: 'collision-path-bullet',
          windowMs: 2500
        },
        contactEntryGuard: { assessment: { recoveringSelf: true } },
        combatAudit: {
          finalAction: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime' }
        },
        metrics: { engagementId: '8:1', acceptedShots: 0, confirmedHits: 0 }
      }
    });
    const retentionEntries = [
      retentionEntry(0, 79, 1900, 100, 100),
      retentionEntry(2000, 52, 2140, 94, 2100),
      retentionEntry(2600, 52, 2246, 94, 2700),
      retentionEntry(2650, 52, 20000, 94, 2750),
      retentionEntry(2700, 52, 2246, 50, 2800)
    ];
    const retentionFile = path.join(root, 'secondary-retention.jsonl.gz');
    fs.writeFileSync(retentionFile, zlib.gzipSync(Buffer.from(retentionEntries.map(JSON.stringify).join('\n') + '\n')));
    const retentionLoaded = loadFrames({
      file: retentionFile,
      startLine: 1,
      endLine: retentionEntries.length,
      selfId: '',
      targetId: '',
      targetName: ''
    });
    const retention = runSecondaryOwnDamageRetentionReplay(retentionLoaded.frames, {});
    assert('browserless replay corrects secondary release without granting chase or low-hp retention',
      retention?.secondaryFrames === retentionEntries.length
        && retention?.loggedReleaseFrames === 3
        && retention?.correctedRetentionFrames === 1
        && retention?.firstCorrection?.line === 3
        && retention?.droppedRetentionFrames === 0
        && retention?.chaseRiskFrames === 0
        && retention?.lowHpRetentionFrames === 0
        && retention?.recoveryOwnedFrames === retentionEntries.length
        && retention?.improved === true);

    const invalidFile = path.join(root, 'invalid.jsonl');
    fs.writeFileSync(invalidFile, JSON.stringify({ type: 'other', at: 1 }) + '\n');
    let diagnostic = '';
    try {
      loadFrames({ file: invalidFile, startLine: 1, endLine: 1, selfId: '', targetId: '', targetName: '' });
    } catch (err) {
      diagnostic = String(err?.message || err);
    }
    assert('unsupported formats produce an actionable diagnostic', diagnostic.includes('combat-frame, combat-live') && diagnostic.includes('other'));
    return { ok: true, cases };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), cases };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function collectShots(frames, selfId) {
  const seen = new Set();
  const shots = [];
  for (const frame of frames) {
    for (const bullet of frame.entry.bullets || []) {
      const owner = bullet.ownerId ?? bullet.owner_id ?? bullet.source_user_id ?? bullet.user_id;
      if (selfId && String(owner) !== String(selfId)) continue;
      const id = String(bullet.id ?? `${frame.lineNo}:${shots.length}`);
      if (seen.has(id)) continue;
      seen.add(id);
      shots.push({ id, frame, bullet });
    }
  }
  return shots.sort((a, b) => a.frame.at - b.frame.at);
}

function finishPressureCadenceMs(frame, options) {
  const finishEvery = Math.max(1, Number(options.combatFinishPressureShootEveryMs || 0));
  const lowConfidenceEvery = Math.max(finishEvery, Number(options.combatAimLowConfidenceEveryMs || finishEvery));
  const threshold = Math.max(0, Math.min(1, Number(options.combatAimLowConfidenceThreshold || 0)));
  const minDistance = Math.max(0, Number(options.combatAimLowConfidenceMinDistance || 0));
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : null;
  const aimConfidence = numberOrNull(
    frame.entry?.aimTarget?.aimConfidence
      ?? frame.entry?.combatState?.aim?.aimConfidence
      ?? frame.entry?.decision?.aimTarget?.aimConfidence
  );
  if (aimConfidence !== null
    && threshold > 0
    && aimConfidence < threshold
    && liveDistance !== null
    && liveDistance >= minDistance) {
    return lowConfidenceEvery;
  }
  return finishEvery;
}

function collectFinishPressureShots(frames, options) {
  const shots = [];
  let lastShotAt = -Infinity;
  for (const frame of frames) {
    const decision = frame.entry?.decision || {};
    const retreating = frame.entry?.combatState?.retreatingTarget || decision.combatState?.retreatingTarget || null;
    const reason = String(decision.reason || frame.entry?.combatState?.shooting?.reason || '');
    const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : null;
    const targetHpValue = frame.targetHp;
    const selfHpValue = frame.selfHp;
    const oldRetreatingSuppression = reason === 'combat-target-retreating'
      || frame.entry?.combatState?.shooting?.reason === 'target-retreating-edge'
      || retreating?.reason === 'target-retreating-edge';
    const eligible = oldRetreatingSuppression
      && liveDistance !== null
      && liveDistance <= Number(options.combatAttackRange || DEFAULTS.combatAttackRange)
      && liveDistance >= Number(options.combatRetreatEdgeRange || DEFAULTS.combatRetreatEdgeRange)
      && Number.isFinite(selfHpValue)
      && Number.isFinite(targetHpValue)
      && selfHpValue >= Number(options.combatFinishPressureSelfHpMin || DEFAULTS.combatFinishPressureSelfHpMin)
      && targetHpValue <= Number(options.combatFinishPressureTargetHpMax || DEFAULTS.combatFinishPressureTargetHpMax);
    if (!eligible) continue;
    const cadence = finishPressureCadenceMs(frame, options);
    if (frame.at - lastShotAt < cadence) continue;
    shots.push({
      id: `finish:${frame.lineNo}`,
      frame,
      hypothetical: true,
      cadenceMs: cadence
    });
    lastShotAt = frame.at;
  }
  return shots;
}

function finishLowThreatActive(frame, options) {
  const shootingReason = String(
    frame.entry?.combatState?.shooting?.reason
      ?? frame.entry?.decision?.combatState?.shooting?.reason
      ?? ''
  );
  if (shootingReason !== 'reserve-for-dodge') return false;
  if (incomingRealBullet(frame)) return false;
  const selfHpValue = Number(frame.selfHp);
  const targetHpValue = Number(frame.targetHp);
  const hpGap = targetHpValue - selfHpValue;
  const minSelfHp = Math.max(0, Number(options.combatShootFinishLowThreatMinHp || 0));
  const targetHpMax = Math.max(0, Number(options.combatShootFinishLowThreatTargetHpMax || 0));
  const maxHpGap = Math.max(0, Number(options.combatShootFinishLowThreatMaxHpGap || 0));
  const range = Math.max(0, Number(options.combatShootFinishLowThreatRange || 0));
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : null;
  return Boolean(
    Number.isFinite(selfHpValue)
    && Number.isFinite(targetHpValue)
    && Number.isFinite(liveDistance)
    && selfHpValue >= minSelfHp
    && targetHpValue <= targetHpMax
    && hpGap <= maxHpGap
    && liveDistance <= range
  );
}

function collectFinishLowThreatShots(frames, actualShots, options) {
  const cadenceMs = Math.max(
    Number(options.combatShootConserveEveryMs || 0),
    Number(options.combatShootEveryMs || 0),
    1
  );
  const shots = [];
  const sortedActualShots = (actualShots || []).slice().sort((a, b) => a.frame.at - b.frame.at);
  let actualIndex = 0;
  let lastShotAt = -Infinity;
  for (const frame of frames) {
    while (actualIndex < sortedActualShots.length && sortedActualShots[actualIndex].frame.at <= frame.at) {
      lastShotAt = Math.max(lastShotAt, sortedActualShots[actualIndex].frame.at);
      actualIndex += 1;
    }
    if (!finishLowThreatActive(frame, options)) continue;
    if (frame.at - lastShotAt < cadenceMs) continue;
    shots.push({
      id: `finish-low-threat:${frame.lineNo}`,
      frame,
      hypothetical: true,
      cadenceMs
    });
    lastShotAt = frame.at;
  }
  return shots;
}

function runFinishLowThreatScenario(frames, shots, targetSamples, options) {
  const hypotheticalShots = collectFinishLowThreatShots(frames, shots, options);
  const combinedShots = [...shots, ...hypotheticalShots]
    .sort((a, b) => a.frame.at - b.frame.at || String(a.id).localeCompare(String(b.id)));
  const scenario = runAimScenario(
    'finish-low-threat burst vs live target',
    combinedShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = frames.find(frame => finishLowThreatActive(frame, options)) || null;
  return {
    ...scenario,
    extraShots: hypotheticalShots.length,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: firstFrame.self && firstFrame.nearbyTarget ? Math.round(distance(firstFrame.self, firstFrame.nearbyTarget)) : null
    } : null
  };
}

function pressureFireCadenceMs(frame, options) {
  const normalEveryMs = Math.max(1, Number(options.combatShootEveryMs || 0));
  const conserveEveryMs = Math.max(normalEveryMs, Number(options.combatShootConserveEveryMs || normalEveryMs));
  const reserveMs = Math.max(0, Number(options.combatShootReserveMs || 0));
  const stamina = stamina5s(frame);
  return stamina !== null && reserveMs > 0 && stamina < reserveMs ? conserveEveryMs : normalEveryMs;
}

function pressureFireActive(frame, options) {
  if (shootingReason(frame) !== 'reserve-for-dodge') return false;
  if (!targetRealBulletPressure(frame)) return false;
  const selfHpValue = Number(frame.selfHp);
  const targetHpValue = Number(frame.targetHp);
  const hpGap = targetHpValue - selfHpValue;
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : null;
  const stamina = stamina5s(frame);
  const minSelfHp = Math.max(0, Number(options.combatShootPressureMinHp || 0));
  const maxHpGap = Math.max(0, Number(options.combatShootPressureMaxHpGap || 0));
  const range = Math.max(0, Number(options.combatShootPressureRange || 0));
  const winningMinHp = Math.max(0, Number(options.combatShootWinningPressureMinHp || 0));
  const winningTargetHpMax = Math.max(0, Number(options.combatShootWinningPressureTargetHpMax || 0));
  const winningLeadHp = Math.max(0, Number(options.combatShootWinningPressureLeadHp || 0));
  const winningRange = Math.max(0, Number(options.combatShootWinningPressureRange || 0));
  const winningNoDamageMs = Math.max(0, Number(options.combatShootWinningPressureNoDamageMs || 0));
  const winningPressure = Boolean(
    winningMinHp
    && winningTargetHpMax
    && winningRange
    && selfHpValue >= winningMinHp
    && targetHpValue <= winningTargetHpMax
    && hpGap <= -winningLeadHp
    && noDamageMs(frame) >= winningNoDamageMs
    && liveDistance !== null
    && liveDistance <= winningRange
  );
  const reserveMs = Math.max(0, Number(winningPressure
    ? (options.combatShootWinningPressureDodgeReserveMs || options.combatShootPressureDodgeReserveMs || 0)
    : (options.combatShootPressureDodgeReserveMs || 0)));
  return Boolean(
    Number.isFinite(selfHpValue)
    && Number.isFinite(targetHpValue)
    && Number.isFinite(liveDistance)
    && stamina !== null
    && selfHpValue >= minSelfHp
    && hpGap <= maxHpGap
    && liveDistance <= range
    && stamina >= reserveMs
  );
}

function collectPressureFireShots(frames, actualShots, options) {
  const shots = [];
  const sortedActualShots = (actualShots || []).slice().sort((a, b) => a.frame.at - b.frame.at);
  let actualIndex = 0;
  let lastShotAt = -Infinity;
  for (const frame of frames) {
    while (actualIndex < sortedActualShots.length && sortedActualShots[actualIndex].frame.at <= frame.at) {
      lastShotAt = Math.max(lastShotAt, sortedActualShots[actualIndex].frame.at);
      actualIndex += 1;
    }
    if (!pressureFireActive(frame, options)) continue;
    const cadenceMs = pressureFireCadenceMs(frame, options);
    if (frame.at - lastShotAt < cadenceMs) continue;
    shots.push({
      id: `pressure-fire:${frame.lineNo}`,
      frame,
      hypothetical: true,
      cadenceMs
    });
    lastShotAt = frame.at;
  }
  return shots;
}

function runPressureFireScenario(frames, shots, targetSamples, options) {
  const hypotheticalShots = collectPressureFireShots(frames, shots, options);
  const combinedShots = [...shots, ...hypotheticalShots]
    .sort((a, b) => a.frame.at - b.frame.at || String(a.id).localeCompare(String(b.id)));
  const scenario = runAimScenario(
    'real-bullet pressure fire vs live target',
    combinedShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = frames.find(frame => pressureFireActive(frame, options)) || null;
  return {
    ...scenario,
    extraShots: hypotheticalShots.length,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: firstFrame.self && firstFrame.nearbyTarget ? Math.round(distance(firstFrame.self, firstFrame.nearbyTarget)) : null,
      stamina5s: stamina5s(firstFrame),
      hpGap: Number(firstFrame.targetHp) - Number(firstFrame.selfHp)
    } : null
  };
}

function passiveRunnerReserveFireActive(frame, options) {
  if (shootingReason(frame) !== 'reserve-for-dodge') return false;
  if (!passiveRunnerActive(frame, options, true)) return false;
  if (incomingRealBullet(frame)) return false;
  const stamina = stamina5s(frame);
  const reserveMs = Math.max(0, Number(options.combatShootPassiveRunnerDodgeReserveMs || 0));
  return Boolean(stamina !== null && stamina >= reserveMs);
}

function collectPassiveRunnerReserveShots(frames, actualShots, options) {
  const cadenceMs = Math.max(
    Number(options.combatShootConserveEveryMs || 0),
    Number(options.combatShootEveryMs || 0),
    1
  );
  const shots = [];
  const sortedActualShots = (actualShots || []).slice().sort((a, b) => a.frame.at - b.frame.at);
  let actualIndex = 0;
  let lastShotAt = -Infinity;
  for (const frame of frames) {
    while (actualIndex < sortedActualShots.length && sortedActualShots[actualIndex].frame.at <= frame.at) {
      lastShotAt = Math.max(lastShotAt, sortedActualShots[actualIndex].frame.at);
      actualIndex += 1;
    }
    if (!passiveRunnerReserveFireActive(frame, options)) continue;
    if (frame.at - lastShotAt < cadenceMs) continue;
    shots.push({
      id: `passive-runner-reserve:${frame.lineNo}`,
      frame,
      hypothetical: true,
      cadenceMs
    });
    lastShotAt = frame.at;
  }
  return shots;
}

function runPassiveRunnerReserveFireScenario(frames, shots, targetSamples, options) {
  const hypotheticalShots = collectPassiveRunnerReserveShots(frames, shots, options);
  const combinedShots = [...shots, ...hypotheticalShots]
    .sort((a, b) => a.frame.at - b.frame.at || String(a.id).localeCompare(String(b.id)));
  const scenario = runAimScenario(
    'passive-runner reserve fire vs live target',
    combinedShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = frames.find(frame => passiveRunnerReserveFireActive(frame, options)) || null;
  return {
    ...scenario,
    extraShots: hypotheticalShots.length,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: firstFrame.self && firstFrame.nearbyTarget ? Math.round(distance(firstFrame.self, firstFrame.nearbyTarget)) : null,
      stamina5s: stamina5s(firstFrame)
    } : null
  };
}

function opponentProbePressureFrame(frames) {
  return frames.find(frame => targetRealBulletPressure(frame)) || null;
}

function runOpponentProbeReserveScenario(frames, shots, options) {
  const windowMs = Math.max(0, Number(options.combatOpponentProbeMs || 0));
  const reserveMs = Math.max(0, Number(options.combatOpponentProbeReserveMs || options.combatShootReserveMs || 0));
  const cadenceMs = Math.max(
    Number(options.combatShootEveryMs || 0),
    Number(options.combatOpponentProbeEveryMs || options.combatAimLowConfidenceEveryMs || 0),
    1
  );
  const shotCostMs = Math.max(0, Number(options.opportunityShotStaminaCostMs || 500));
  const startFrame = frames[0] || null;
  const pressureFrame = opponentProbePressureFrame(frames);
  const startAt = startFrame ? startFrame.at : 0;
  const cutoffAt = Math.min(
    startAt + windowMs,
    pressureFrame ? pressureFrame.at : Infinity
  );
  const probeShots = (shots || [])
    .filter(shot => shot.frame.at >= startAt && shot.frame.at < cutoffAt)
    .sort((a, b) => a.frame.at - b.frame.at || String(a.id).localeCompare(String(b.id)));
  const kept = [];
  const skipped = [];
  let lastKeptAt = -Infinity;
  let savedStaminaMs = 0;
  for (const shot of probeShots) {
    const projectedStamina = Math.max(0, Number(stamina5s(shot.frame) || 0)) + savedStaminaMs;
    const cadenceReady = shot.frame.at - lastKeptAt >= cadenceMs;
    const reserveReady = projectedStamina >= reserveMs;
    if (cadenceReady && reserveReady) {
      kept.push({ line: shot.frame.lineNo, time: formatTime(shot.frame.at), projectedStamina5s: Math.round(projectedStamina) });
      lastKeptAt = shot.frame.at;
    } else {
      skipped.push({
        line: shot.frame.lineNo,
        time: formatTime(shot.frame.at),
        reason: cadenceReady ? 'reserve' : 'cadence',
        projectedStamina5s: Math.round(projectedStamina)
      });
      savedStaminaMs += shotCostMs;
    }
  }
  const pressureLoggedStamina = pressureFrame ? stamina5s(pressureFrame) : null;
  const pressureProjectedStamina = pressureLoggedStamina === null
    ? null
    : Math.round(pressureLoggedStamina + savedStaminaMs);
  return {
    label: 'opponent-probe opening reserve',
    hits: pressureProjectedStamina !== null && pressureProjectedStamina >= reserveMs ? 1 : 0,
    considered: probeShots.length,
    loggedShots: probeShots.length,
    simulatedShots: kept.length,
    skippedShots: skipped.length,
    savedStaminaMs,
    shotCostMs,
    reserveMs,
    cadenceMs,
    windowMs,
    reserveMet: pressureProjectedStamina !== null && pressureProjectedStamina >= reserveMs,
    kept,
    skipped,
    activeStart: startFrame ? {
      line: startFrame.lineNo,
      time: formatTime(startFrame.at),
      distanceCm: startFrame.self && startFrame.nearbyTarget ? Math.round(distance(startFrame.self, startFrame.nearbyTarget)) : null,
      stamina5s: stamina5s(startFrame)
    } : null,
    firstPressure: pressureFrame ? {
      line: pressureFrame.lineNo,
      time: formatTime(pressureFrame.at),
      loggedStamina5s: pressureLoggedStamina,
      projectedStamina5s: pressureProjectedStamina,
      selfHp: pressureFrame.selfHp,
      targetHp: pressureFrame.targetHp
    } : null
  };
}

function sustainedPressureExitState(frame, options) {
  if (!targetRealBulletPressure(frame)) return null;
  const waitMs = Math.max(0, Number(options.combatPressureNoDamageExitMs || 0));
  const threshold = Math.max(0, Number(options.combatPressureNoDamageExitHpThreshold || 0));
  const minGap = Math.max(0, Number(options.combatPressureNoDamageExitHpGap || 0));
  const targetHpMin = Math.max(0, Number(options.combatPressureNoDamageExitTargetHpMin || 0));
  const range = Math.max(0, Number(options.combatPressureNoDamageExitRange || options.combatShootPressureRange || options.combatAttackRange || 0));
  const hp = Number(frame.selfHp);
  const enemyHp = Number(frame.targetHp);
  const elapsed = noDamageMs(frame);
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : null;
  const hpGap = enemyHp - hp;
  if (!waitMs || !threshold || !minGap || !range) return null;
  if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(liveDistance)) return null;
  if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(liveDistance <= range)) return null;
  return {
    active: true,
    line: frame.lineNo,
    time: formatTime(frame.at),
    selfHp: hp,
    targetHp: enemyHp,
    hpGap,
    targetHpMin,
    noDamageMs: Math.round(elapsed),
    distanceCm: Math.round(liveDistance)
  };
}

function runSustainedPressureExitScenario(frames, options) {
  const exitFrame = frames.find(frame => sustainedPressureExitState(frame, options)) || null;
  const exitState = exitFrame ? sustainedPressureExitState(exitFrame, options) : null;
  const lastFrame = frames.at(-1) || null;
  return {
    label: 'sustained pressure no-damage exit',
    considered: frames.length,
    hits: exitState ? 1 : 0,
    minDistanceCm: exitState?.distanceCm ?? null,
    activeStart: exitState ? {
      line: exitState.line,
      time: exitState.time,
      noDamageMs: exitState.noDamageMs,
      distanceCm: exitState.distanceCm
    } : null,
    exitFrame: exitState,
    savedFrames: exitState && lastFrame ? Math.max(0, lastFrame.lineNo - exitState.line) : 0,
    savedMs: exitState && lastFrame ? Math.max(0, Math.round(lastFrame.at - exitFrame.at)) : 0
  };
}

function frameStamina1d(frame) {
  return numberOrNull(
    frame?.entry?.self?.stamina_1d_remaining_milli
      ?? frame?.entry?.self?.stamina1dRemainingMilli
      ?? frame?.entry?.self?.stamina1d
  );
}

function runCombatEfficiencyDistanceControlScenario(frames, targetId, options) {
  const firstFrame = frames.find(frame => Number.isFinite(frame.targetHp)) || frames[0] || null;
  const lastFrame = frames.at(-1) || null;
  if (!firstFrame || !lastFrame || !targetId) {
    return {
      label: 'combat efficiency distance-control exit',
      considered: frames.length,
      hits: 0,
      minDistanceCm: null,
      activeStart: null,
      exitFrame: null,
      savedFrames: 0,
      savedMs: 0,
      savedStaminaMilli: 0,
      savedStamina: 0
    };
  }
  let firstHp = numberOrNull(firstFrame.targetHp);
  let minHp = firstHp;
  let previousVisibleHp = firstHp;
  let retainedHp = firstHp;
  let damageProgressAt = firstFrame.at;
  let phaseState = {
    id: String(targetId),
    firstSeenAt: firstFrame.at,
    firstHp,
    minHp,
    combatPhase: 'normal-combat'
  };
  let activeStart = null;
  let exitFrame = null;
  let exitPhase = null;
  let exitIndex = -1;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const visibleHp = numberOrNull(frame.targetHp);
    if (firstHp === null && visibleHp !== null) firstHp = visibleHp;
    if (visibleHp !== null) {
      if (previousVisibleHp !== null && visibleHp < previousVisibleHp - 0.01) damageProgressAt = frame.at;
      previousVisibleHp = visibleHp;
      retainedHp = visibleHp;
      minHp = minHp === null ? visibleHp : Math.min(minHp, visibleHp);
    }
    const targetDistance = frame.self && frame.nearbyTarget
      ? distance(frame.self, frame.nearbyTarget)
      : null;
    const metrics = frame.entry?.combatMetrics || frame.entry?.combatState?.combatMetrics || {};
    const phase = combatPressurePhaseCore(phaseState, {
      targetId: String(targetId),
      nowMs: frame.at,
      engagedAt: firstFrame.at,
      ordinaryProfit: false,
      targetHp: retainedHp,
      firstHp,
      minHp,
      damageFromStart: firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null,
      damageKnown: firstHp !== null && minHp !== null,
      damageProgressAt,
      targetDamageTotal: Math.max(0, Number(metrics.targetDamage
        ?? (firstHp !== null && minHp !== null ? firstHp - minHp : 0))),
      totalStaminaSpentMilli: Number.isFinite(Number(metrics.totalStaminaSpent))
        ? Math.max(0, Number(metrics.totalStaminaSpent))
        : null,
      targetDrop: frame.target?.drop ?? frame.nearbyEntity?.drop,
      acceptedShotsSinceDamage: Math.max(0, Number(metrics.acceptedShots || 0)),
      distance: targetDistance
    }, options);
    phaseState = {
      ...phaseState,
      id: String(targetId),
      combatPhase: phase.phase,
      phaseStartedAt: phase.phaseStartedAt,
      closePressure: phase.active ? phase : null,
      combatEfficiency: phase.combatEfficiency,
      hp: retainedHp,
      firstHp,
      minHp,
      distance: targetDistance
    };
    if (!activeStart && phase.active) {
      activeStart = {
        line: frame.lineNo,
        time: formatTime(frame.at),
        noDamageMs: phase.noDamageMs,
        distanceCm: targetDistance === null ? null : Math.round(targetDistance),
        goalDistanceCm: phase.goalDistanceCm,
        acceptedShotsSinceDamage: phase.acceptedShotsSinceDamage,
        damageEfficiencyHpPerStamina: phase.lastCompletedWindow?.damageEfficiencyHpPerStamina ?? null,
        requiredHpPerStamina: phase.lastCompletedWindow?.requiredHpPerStamina ?? null
      };
    }
    if (!exitFrame && phase.exitRequired) {
      exitFrame = frame;
      exitPhase = phase;
      exitIndex = index;
      break;
    }
  }
  const exitStamina = frameStamina1d(exitFrame);
  const finalStamina = frameStamina1d(lastFrame);
  const savedStaminaMilli = exitStamina !== null && finalStamina !== null
    ? Math.max(0, Math.round(exitStamina - finalStamina))
    : 0;
  return {
    label: 'combat efficiency distance-control exit',
    considered: frames.length,
    hits: exitFrame ? 1 : 0,
    minDistanceCm: exitPhase?.bestDistanceCm ?? null,
    activeStart,
    exitFrame: exitFrame ? {
      line: exitFrame.lineNo,
      time: formatTime(exitFrame.at),
      selfHp: exitFrame.selfHp,
      targetHp: exitFrame.targetHp ?? retainedHp,
      noDamageMs: exitPhase.noDamageMs,
      rule: exitPhase.exitRule,
      stepIndex: exitPhase.stepIndex,
      goalDistanceCm: exitPhase.goalDistanceCm,
      closerTimeMs: exitPhase.closerTimeMs,
      closerRatio: exitPhase.closerRatio,
      outsideCloserRatio: exitPhase.outsideCloserRatio,
      acceptedShotsSinceDamage: exitPhase.acceptedShotsSinceDamage,
      targetDamageHp: exitPhase.lastCompletedWindow?.targetDamageHp ?? null,
      staminaSpentMilli: exitPhase.lastCompletedWindow?.staminaSpentMilli ?? null,
      damageEfficiencyHpPerStamina: exitPhase.lastCompletedWindow?.damageEfficiencyHpPerStamina ?? null,
      requiredHpPerStamina: exitPhase.lastCompletedWindow?.requiredHpPerStamina ?? null,
      evaluationWindowMs: exitPhase.lastCompletedWindow?.evaluationWindowMs
        ?? exitPhase.evaluationWindowMs
        ?? null,
      windowMode: exitPhase.lastCompletedWindow?.windowMode ?? null,
      referenceDamageHp: exitPhase.lastCompletedWindow?.referenceDamageHp ?? null,
      expectedHitRate: exitPhase.lastCompletedWindow?.expectedHitRate ?? null,
      rewardMultiplier: exitPhase.lastCompletedWindow?.rewardMultiplier ?? null,
      effectiveRewardCoins: exitPhase.lastCompletedWindow?.effectiveRewardCoins ?? null,
      targetDrop: exitPhase.lastCompletedWindow?.targetDrop ?? null
    } : null,
    savedFrames: exitIndex >= 0 ? Math.max(0, frames.length - exitIndex - 1) : 0,
    savedMs: exitFrame ? Math.max(0, Math.round(lastFrame.at - exitFrame.at)) : 0,
    savedStaminaMilli,
    savedStamina: Number((savedStaminaMilli / 10000).toFixed(4))
  };
}

function minDistanceForShot(origin, aim, targetSamples, shotAt, options) {
  if (!origin || !aim || !targetSamples.length) return { hit: false, min: Infinity, minAt: null };
  const dir = unit(sub(aim, origin));
  if (!dir) return { hit: false, min: Infinity, minAt: null };
  const speedPerMs = options.bulletSpeedPerTick / options.tickMs;
  let min = Infinity;
  let minAt = null;
  for (let dt = 0; dt <= options.bulletTtlMs; dt += 25) {
    const t = shotAt + dt;
    const target = interpolate(targetSamples, t);
    if (!target) continue;
    const bullet = add(origin, mul(dir, speedPerMs * dt));
    const d = distance(bullet, target);
    if (d < min) {
      min = d;
      minAt = t;
    }
  }
  return { hit: min <= options.hitRadiusCm, min, minAt };
}

function runAimScenario(label, shots, aimForShot, targetSamples, options, filterShot = () => true) {
  let considered = 0;
  let hits = 0;
  let minDistance = Infinity;
  let firstHit = null;
  for (const shot of shots) {
    const frame = shot.frame;
    if (!filterShot(shot)) continue;
    const origin = frame.self;
    const aim = aimForShot(shot);
    const result = minDistanceForShot(origin, aim, targetSamples, frame.at, options);
    considered += 1;
    if (result.min < minDistance) minDistance = result.min;
    if (result.hit) {
      hits += 1;
      if (!firstHit) {
        firstHit = {
          line: frame.lineNo,
          time: formatTime(frame.at),
          noDamageMs: Math.round(frame.noDamageMs),
          minDistanceCm: Math.round(result.min)
        };
      }
    }
  }
  return {
    label,
    considered,
    hits,
    minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
    firstHit
  };
}

function runActualBulletScenario(shots, targetSamples, options) {
  let considered = 0;
  let hits = 0;
  let minDistance = Infinity;
  let firstHit = null;
  for (const shot of shots) {
    const origin = pointOf(shot.bullet);
    const vx = numberOrNull(shot.bullet.vx);
    const vy = numberOrNull(shot.bullet.vy);
    if (!origin || vx === null || vy === null) continue;
    let localMin = Infinity;
    for (let dt = 0; dt <= options.bulletTtlMs; dt += 25) {
      const target = interpolate(targetSamples, shot.frame.at + dt);
      if (!target) continue;
      const bullet = {
        x: origin.x + (vx / options.tickMs) * dt,
        y: origin.y + (vy / options.tickMs) * dt
      };
      const d = distance(bullet, target);
      if (d < localMin) localMin = d;
    }
    considered += 1;
    if (localMin < minDistance) minDistance = localMin;
    if (localMin <= options.hitRadiusCm) {
      hits += 1;
      if (!firstHit) {
        firstHit = {
          line: shot.frame.lineNo,
          time: formatTime(shot.frame.at),
          noDamageMs: Math.round(shot.frame.noDamageMs),
          minDistanceCm: Math.round(localMin)
        };
      }
    }
  }
  return {
    label: 'actual bullet vectors vs live target',
    considered,
    hits,
    minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
    firstHit
  };
}

function liveDivergenceState(frame, options) {
  if (!frame.nearbyTarget || !frame.decisionTarget) {
    return { active: false, divergenceCm: null, thresholdCm: null };
  }
  const liveDistance = frame.self && frame.nearbyTarget ? distance(frame.self, frame.nearbyTarget) : 0;
  const divergence = distance(frame.nearbyTarget, frame.decisionTarget);
  const threshold = Math.max(
    Number(options.liveDivergencePrecisionCm || 0),
    Math.round(liveDistance * Number(options.liveDivergencePrecisionRatio || 0))
  );
  return {
    active: threshold > 0 && divergence >= threshold,
    divergenceCm: Math.round(divergence),
    thresholdCm: Math.round(threshold)
  };
}

function dynamicAimForShot(shot, options) {
  const frame = shot.frame;
  const live = frame.nearbyTarget;
  const divergence = liveDivergenceState(frame, options);
  const fallback = frame.noDamageMs >= options.fallbackPrecisionNoDamageMs;
  const attackRange = Math.max(0, Number(options.combatAttackRange || 0));
  const liveDistance = frame.self && live ? distance(frame.self, live) : null;
  const withinAttackRange = !attackRange || (Number.isFinite(liveDistance) && liveDistance <= attackRange);
  const motionScale = Math.max(
    0,
    Number(
      frame.target?.motionScale
      ?? frame.aim?.motionScale
      ?? frame.entry?.combatState?.aim?.motionScale
      ?? frame.entry?.decision?.combatState?.aim?.motionScale
      ?? 0
    ) || 0
  );
  const movement = combatMovementAimModeForFrame(frame, liveDistance, options);
  const moving = Boolean(
    movement
    && (
      Number(movement.targetSpeed || 0) >= Number(options.combatStationarySpeed || 0)
      || motionScale >= Math.max(0, Number(options.combatAimMovingScaleThreshold || 0.15))
    )
  );
  const radialMax = Math.max(0, Number(options.combatAimRadialPrecisionLateralRatio || 0));
  const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
  const realBulletPrecision = Boolean(live && moving && incomingRealBullet(frame) && withinAttackRange);
  const passiveRunnerPrecisionRange = Math.max(0, Number(options.combatPassiveRunnerPrecisionRange || 0));
  const passiveRunnerPrecisionMaxNoDamageMs = Math.max(0, Number(options.combatPassiveRunnerPrecisionMaxNoDamageMs || 0));
  const passiveRunnerPrecisionLimited = Boolean(
    passiveRunnerPrecisionMaxNoDamageMs
    && frame.noDamageMs >= passiveRunnerPrecisionMaxNoDamageMs
  );
  const passiveRunnerPrecision = Boolean(
    live
    && moving
    && passiveRunnerActive(frame, options)
    && passiveRunnerPrecisionRange > 0
    && Number(liveDistance) <= passiveRunnerPrecisionRange
    && !passiveRunnerPrecisionLimited
    && withinAttackRange
  );
  const passiveRunnerIntercept = Boolean(
    live
    && moving
    && movement
    && passiveRunnerActive(frame, options)
    && !passiveRunnerPrecision
    && withinAttackRange
  );
  const liveIntercept = Boolean(
    live
    && moving
    && movement
    && (
      passiveRunnerIntercept
      || (lateralRatio > radialMax && (
        realBulletPrecision
        || (serverStalled(frame) && withinAttackRange)
      ))
    )
  );
  const stallLive = Boolean(live && serverStalled(frame));
  const radialPrecision = Boolean(
    live
    && moving
    && radialMax > 0
    && movement
    && Number(movement.targetSpeed || 0) >= Number(options.combatStationarySpeed || 0)
    && lateralRatio <= radialMax
    && withinAttackRange
  );
  if (live && divergence.active) return live;
  if (passiveRunnerPrecision) return live;
  if (passiveRunnerIntercept) return liveInterceptAimForShot(shot, options);
  if (realBulletPrecision && liveIntercept) return liveInterceptAimForShot(shot, options);
  if (realBulletPrecision) return live;
  if (stallLive && liveIntercept) return liveInterceptAimForShot(shot, options);
  if (stallLive || radialPrecision) return live;
  if (fallback) return live;
  return frame.aim || frame.decisionTarget || live;
}

function realBulletPrecisionAimForShot(shot) {
  const frame = shot.frame;
  if (incomingRealBullet(frame) && frame.nearbyTarget) return frame.nearbyTarget;
  return frame.aim || frame.decisionTarget || frame.nearbyTarget;
}

function liveInterceptAimForShot(shot, options) {
  const frame = shot.frame;
  const self = frame.self;
  const live = frame.nearbyTarget;
  if (!self || !live) return frame.aim || frame.decisionTarget || live;
  const vx = numberOrNull(frame.target?.vx ?? frame.nearbyEntity?.vx);
  const vy = numberOrNull(frame.target?.vy ?? frame.nearbyEntity?.vy);
  if (vx === null || vy === null) return live;
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedPerTick || DEFAULTS.bulletSpeedPerTick));
  const renderDelayTicks = Math.max(0, Number(options.combatRenderDelayTicks ?? 2));
  const compensatedX = Number(live.x) + vx * renderDelayTicks;
  const compensatedY = Number(live.y) + vy * renderDelayTicks;
  const dx = compensatedX - Number(self.x);
  const dy = compensatedY - Number(self.y);
  const c = dx * dx + dy * dy;
  if (!(c > 0)) return live;
  const speedSq = vx * vx + vy * vy;
  const a = speedSq - bulletSpeed * bulletSpeed;
  const b = 2 * (dx * vx + dy * vy);
  const eps = 1e-6;
  const roots = [];
  if (Math.abs(a) < eps) {
    if (Math.abs(b) > eps) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= -eps) {
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
  }
  const t = roots.filter(value => Number.isFinite(value) && value > 0).sort((x, y) => x - y)[0];
  if (!Number.isFinite(t)) return live;
  return {
    x: compensatedX + vx * t,
    y: compensatedY + vy * t
  };
}

function combatMovementAimModeForFrame(frame, distanceValue, options) {
  const self = frame.self;
  const target = frame.nearbyEntity || frame.target;
  if (!self || !target) {
    return { mode: '', lateralSpeed: 0, radialSpeed: 0, lateralRatio: 0, targetSpeed: 0 };
  }
  const vx = Number(target.vx) || 0;
  const vy = Number(target.vy) || 0;
  const targetSpeed = Math.hypot(vx, vy);
  const dx = Number(target.x) - Number(self.x);
  const dy = Number(target.y) - Number(self.y);
  const d = Math.max(1, Number(distanceValue) || Math.hypot(dx, dy) || 1);
  const ux = dx / d;
  const uy = dy / d;
  const radialSpeed = ux * vx + uy * vy;
  const lateralSpeed = ux * vy - uy * vx;
  const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
  let mode = 'drift';
  if (lateralRatio >= 0.55) mode = 'lateral';
  else if (radialSpeed <= -Number(options.combatStationarySpeed || 0)) mode = 'closing';
  else if (radialSpeed >= Number(options.combatStationarySpeed || 0)) mode = 'retreating';
  return {
    mode,
    lateralSpeed,
    radialSpeed,
    lateralRatio,
    targetSpeed
  };
}

function entitySpeed(entity) {
  return Math.hypot(Number(entity?.vx) || 0, Number(entity?.vy) || 0);
}

function passiveRunnerActive(frame, options, allowMissingIntent = false) {
  const target = frame.nearbyEntity || frame.target || null;
  if (!frame.self || !target) return false;
  const minSelfHp = Math.max(0, Number(options.combatPassiveRunnerMinSelfHp || 0));
  const minDrop = Math.max(0, Number(options.combatPassiveRunnerMinDrop || 0));
  const confirmMs = Math.max(0, Number(options.combatPassiveRunnerConfirmMs || 0));
  const motionScale = Math.max(
    0,
    Number(
      target.motionScale
        ?? frame.target?.motionScale
        ?? frame.aim?.motionScale
        ?? frame.entry?.combatState?.aim?.motionScale
        ?? frame.entry?.decision?.combatState?.aim?.motionScale
        ?? 0
    ) || 0
  );
  const moving = entitySpeed(target) >= Number(options.combatStationarySpeed || 0)
    || motionScale >= Math.max(0, Number(options.combatAimMovingScaleThreshold || 0.15));
  const active = Boolean(target.active || target.current_join_mode === 'Active' || target.mode === 'Active');
  const firing = Boolean(target.firing || target.attacking || target.is_attacking);
  const invulnerable = Boolean(target.invulnerable || target.invulnerable_remaining_ticks > 0);
  const drop = Math.max(0, Number(target.drop ?? frame.target?.drop ?? 0) || 0);
  const intent = String(target.combatIntent || frame.target?.combatIntent || '');
  const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
  const engagedAgeMs = numberOrNull(
    frame.entry?.combatState?.passiveRunner?.engagedMs
      ?? frame.entry?.decision?.combatState?.passiveRunner?.engagedMs
  ) || 0;
  const seenTargetRealBulletAt = numberOrNull(
    frame.entry?.combatState?.passiveRunner?.seenTargetRealBulletAt
      ?? frame.entry?.decision?.combatState?.passiveRunner?.seenTargetRealBulletAt
  ) || 0;
  return Boolean(
    active
    && moving
    && (runnerIntent || allowMissingIntent)
    && !firing
    && !invulnerable
    && !incomingRealBullet(frame)
    && engagedAgeMs >= confirmMs
    && !seenTargetRealBulletAt
    && Number(frame.selfHp) >= minSelfHp
    && (drop >= minDrop || runnerIntent)
  );
}

function passiveRunnerAimForShot(shot, options) {
  return dynamicAimForShot(shot, options);
}

function simulatePassiveRunnerSelfSamples(frames, options) {
  const samples = [];
  let simulated = frames[0]?.self ? { ...frames[0].self } : null;
  let previousAt = frames[0]?.at || 0;
  let activeStarted = null;
  let activeFrames = 0;
  let runnerLocked = false;
  let seenTargetRealBullet = false;
  const closeRange = Math.max(0, Number(options.combatPassiveRunnerCloseRange || 0));
  const speedPerMs = Math.max(0, Number(options.combatTargetDodgeSpeedPerTick || 50)) / Math.max(1, Number(options.tickMs || 50));
  for (const frame of frames) {
    if (!simulated && frame.self) simulated = { ...frame.self };
    if (!simulated) continue;
    const dt = Math.max(0, Number(frame.at) - previousAt);
    previousAt = Number(frame.at);
    if (targetRealBulletPressure(frame)) seenTargetRealBullet = true;
    const active = !seenTargetRealBullet && passiveRunnerActive(frame, options, runnerLocked);
    if (active && frame.nearbyTarget) {
      runnerLocked = true;
      activeFrames += 1;
      if (!activeStarted) activeStarted = frame;
      const currentDistance = distance(simulated, frame.nearbyTarget);
      if (!closeRange || currentDistance > closeRange) {
        const dir = unit(sub(frame.nearbyTarget, simulated));
        if (dir) {
          const step = Math.min(Math.max(0, currentDistance - closeRange), speedPerMs * dt);
          simulated = add(simulated, mul(dir, step));
        }
      }
    } else if (frame.self) {
      if (!passiveRunnerActive(frame, options, runnerLocked)) runnerLocked = false;
      simulated = { ...frame.self };
    }
    samples.push({ at: frame.at, x: simulated.x, y: simulated.y });
  }
  return { samples, activeStarted, activeFrames };
}

function outOfRangeReengageActive(frame, options, simulatedSelf = frame.self) {
  const selfPoint = simulatedSelf || frame.self;
  const targetPoint = frame.nearbyTarget;
  const target = frame.nearbyEntity || frame.target || null;
  if (!selfPoint || !targetPoint || !target) return false;
  const attackRange = Math.max(0, Number(options.combatAttackRange || 0));
  const maxRange = Math.max(attackRange, Number(options.combatOutOfRangeReengageRange || 0));
  const minSelfHp = Math.max(0, Number(options.combatOutOfRangeReengageMinHp || 0));
  const maxHpGap = Math.max(0, Number(options.combatOutOfRangeReengageMaxHpGap || 0));
  const pressureMaxHpGap = Math.max(maxHpGap, Number(options.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
  const recentInRangeMs = Math.max(0, Number(options.combatOutOfRangeReengageRecentInRangeMs || 0));
  const distanceCm = distance(selfPoint, targetPoint);
  const hp = frame.selfHp;
  const enemyHp = frame.targetHp;
  const hpGap = Number(enemyHp) - Number(hp);
  const outOfRangeMs = numberOrNull(
    frame.entry?.combatState?.outOfRangeHold?.outOfRangeMs
      ?? frame.entry?.safety?.engagedCombat?.outOfRangeMs
  ) || 0;
  const targetId = String(target.id ?? target.user_id ?? '');
  const incoming = frame.entry?.incomingBullet || frame.entry?.decision?.incomingBullet || null;
  const incomingOwnerId = incoming?.ownerId ?? incoming?.owner_id ?? incoming?.source_user_id ?? incoming?.user_id;
  const targetRealBulletPressure = Boolean(incomingRealBullet(frame) && targetId && String(incomingOwnerId ?? '') === targetId);
  const intent = String(target.combatIntent || frame.entry?.safety?.engagedCombat?.intent || '');
  const engagedIntent = /^(engaged|reengage)$/.test(intent);
  const stationaryFreshContact = Boolean(
    recentInRangeMs
    && outOfRangeMs <= recentInRangeMs
    && entitySpeed(target) < Number(options.combatStationarySpeed || 0)
  );
  return Boolean(
    frame.entry?.decision?.reason === 'combat-out-of-range-hold'
    && engagedIntent
    && distanceCm > attackRange
    && distanceCm <= maxRange
    && Number.isFinite(hp)
    && Number.isFinite(enemyHp)
    && hp >= minSelfHp
    && hpGap <= (targetRealBulletPressure ? pressureMaxHpGap : maxHpGap)
    && (targetRealBulletPressure || stationaryFreshContact)
  );
}

function simulateOutOfRangeReengageSelfSamples(frames, options) {
  const speedPerMs = Math.max(1, Number(options.combatTargetDodgeSpeedPerTick || 50)) / Number(options.tickMs || 50);
  const attackRange = Math.max(0, Number(options.combatAttackRange || 0));
  const samples = [];
  const activeLineNos = new Set();
  let simulated = null;
  let lastAt = null;
  let activeStarted = null;
  let activeFrames = 0;
  let enteredRangeFrame = null;
  for (const frame of frames) {
    if (!frame.self) continue;
    if (!simulated) simulated = { ...frame.self };
    const originalActive = lastAt !== null && outOfRangeReengageActive(frame, options, frame.self);
    if (originalActive) {
      activeLineNos.add(frame.lineNo);
    }
    if (originalActive) {
      if (!activeStarted) activeStarted = frame;
      activeFrames += 1;
      const target = frame.nearbyTarget;
      if (target) {
        const dt = Math.max(0, frame.at - lastAt);
        const toTarget = sub(target, simulated);
        const d = Math.hypot(toTarget.x, toTarget.y);
        if (d > attackRange) {
          const step = Math.min(Math.max(0, d - attackRange), speedPerMs * dt);
          if (step > 0) {
            const dir = unit(toTarget);
            simulated = add(simulated, mul(dir, step));
          }
        }
      }
    }
    const simulatedDistance = simulated && frame.nearbyTarget ? distance(simulated, frame.nearbyTarget) : null;
    if (!enteredRangeFrame
      && activeStarted
      && activeLineNos.has(frame.lineNo)
      && simulatedDistance !== null
      && simulatedDistance <= attackRange) {
      enteredRangeFrame = frame;
    }
    samples.push({ at: frame.at, x: simulated.x, y: simulated.y });
    lastAt = frame.at;
  }
  return { samples, activeStarted, activeFrames, enteredRangeFrame, activeLineNos };
}

function collectOutOfRangeReengageShots(frames, simulation, options) {
  const cadenceMs = Math.max(
    Number(options.combatShootConserveEveryMs || 0),
    Number(options.combatShootEveryMs || 0),
    1
  );
  const shots = [];
  let lastShotAt = -Infinity;
  for (const frame of frames) {
    if (!simulation.activeStarted || frame.at < simulation.activeStarted.at) continue;
    const simulatedSelf = interpolate(simulation.samples, frame.at);
    if (!simulatedSelf || !simulation.activeLineNos?.has(frame.lineNo) || !frame.nearbyTarget) continue;
    const simulatedDistance = distance(simulatedSelf, frame.nearbyTarget);
    if (simulatedDistance > Number(options.combatAttackRange || 0)) continue;
    if (frame.at - lastShotAt < cadenceMs) continue;
    shots.push({
      id: `out-of-range-reengage:${frame.lineNo}`,
      frame: {
        ...frame,
        self: simulatedSelf
      },
      hypothetical: true
    });
    lastShotAt = frame.at;
  }
  return shots;
}

function runOutOfRangeReengageScenario(frames, targetSamples, options) {
  const simulation = simulateOutOfRangeReengageSelfSamples(frames, options);
  const shots = collectOutOfRangeReengageShots(frames, simulation, options);
  const scenario = runAimScenario(
    'out-of-range reengage dynamic vs live target',
    shots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = simulation.activeStarted || null;
  const lastFrame = firstFrame ? frames.filter(frame => frame.at >= firstFrame.at).at(-1) : null;
  const firstDistance = firstFrame?.self && firstFrame?.nearbyTarget ? distance(firstFrame.self, firstFrame.nearbyTarget) : null;
  const lastOriginalDistance = lastFrame?.self && lastFrame?.nearbyTarget ? distance(lastFrame.self, lastFrame.nearbyTarget) : null;
  const lastSim = lastFrame ? interpolate(simulation.samples, lastFrame.at) : null;
  const lastSimDistance = lastSim && lastFrame?.nearbyTarget ? distance(lastSim, lastFrame.nearbyTarget) : null;
  return {
    ...scenario,
    baselineHits: 0,
    baselineMinDistanceCm: null,
    activeFrames: simulation.activeFrames,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: Math.round(firstDistance)
    } : null,
    enteredRange: simulation.enteredRangeFrame ? {
      line: simulation.enteredRangeFrame.lineNo,
      time: formatTime(simulation.enteredRangeFrame.at)
    } : null,
    originalEndDistanceCm: Number.isFinite(lastOriginalDistance) ? Math.round(lastOriginalDistance) : null,
    simulatedEndDistanceCm: Number.isFinite(lastSimDistance) ? Math.round(lastSimDistance) : null,
    simulatedApproachCm: Number.isFinite(lastOriginalDistance) && Number.isFinite(lastSimDistance)
      ? Math.round(lastOriginalDistance - lastSimDistance)
      : null
  };
}

function runPassiveRunnerScenario(frames, shots, targetSamples, options) {
  const simulation = simulatePassiveRunnerSelfSamples(frames, options);
  const filteredShots = shots.filter(shot => {
    return simulation.activeStarted
      && shot.frame.at >= simulation.activeStarted.at
      && passiveRunnerActive(shot.frame, options);
  });
  const simulatedShots = filteredShots.map(shot => cloneShotWithSimulatedSelf(shot, simulation.samples));
  const scenario = runAimScenario(
    'passive-runner close intercept vs live target',
    simulatedShots,
    shot => passiveRunnerAimForShot(shot, options),
    targetSamples,
    options
  );
  const baseline = runAimScenario(
    'passive-runner old-position dynamic vs live target',
    filteredShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = simulation.activeStarted || null;
  const lastFrame = firstFrame ? frames.filter(frame => frame.at >= firstFrame.at).at(-1) : null;
  const firstDistance = firstFrame?.self && firstFrame?.nearbyTarget ? distance(firstFrame.self, firstFrame.nearbyTarget) : null;
  const lastOriginalDistance = lastFrame?.self && lastFrame?.nearbyTarget ? distance(lastFrame.self, lastFrame.nearbyTarget) : null;
  const lastSim = lastFrame ? interpolate(simulation.samples, lastFrame.at) : null;
  const lastSimDistance = lastSim && lastFrame?.nearbyTarget ? distance(lastSim, lastFrame.nearbyTarget) : null;
  return {
    ...scenario,
    baselineHits: baseline.hits,
    baselineMinDistanceCm: baseline.minDistanceCm,
    activeFrames: simulation.activeFrames,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: Math.round(firstDistance)
    } : null,
    originalEndDistanceCm: Number.isFinite(lastOriginalDistance) ? Math.round(lastOriginalDistance) : null,
    simulatedEndDistanceCm: Number.isFinite(lastSimDistance) ? Math.round(lastSimDistance) : null,
    simulatedApproachCm: Number.isFinite(lastOriginalDistance) && Number.isFinite(lastSimDistance)
      ? Math.round(lastOriginalDistance - lastSimDistance)
      : null
  };
}

function pressureAuthorityState(frame, options) {
  const authority = frame.nearbyTarget;
  const reference = frame.decisionTarget;
  if (!frame.self || !authority || !reference) {
    return { active: false, useSnapshot: false, suppressFire: false, divergenceCm: null, thresholdCm: null, authorityDistance: null, referenceDistance: null, rejectedSnapshotOutlier: false, snapshotOutlierReason: '' };
  }
  const authorityDistance = distance(frame.self, authority);
  const referenceDistance = distance(frame.self, reference);
  const divergence = distance(authority, reference);
  const threshold = Math.max(
    Number(options.liveDivergencePrecisionCm || 0),
    Math.round(Math.max(0, Math.min(authorityDistance, referenceDistance)) * Number(options.liveDivergencePrecisionRatio || 0))
  );
  const pressure = Boolean(
    serverStalled(frame)
      || incomingRealBullet(frame)
      || (Number(options.combatAimNoDamageMs || 0) && frame.noDamageMs >= Number(options.combatAimNoDamageMs || 0))
  );
  const attackRange = Math.max(0, Number(options.combatAttackRange || 0));
  const authoritativeOutOfRange = Boolean(attackRange && authorityDistance > attackRange);
  const closeNativeRange = Math.max(0, Number(options.combatAimSnapshotOutlierCloseNativeRange || 0));
  const closeSnapshotRatio = Math.max(1, Number(options.combatAimSnapshotOutlierCloseSnapshotRatio || 1));
  const disadvantageRange = Math.max(0, Number(options.combatAimSnapshotOutlierDisadvantageRange || 0));
  const outlierNoDamageMs = Math.max(0, Number(options.combatAimSnapshotOutlierNoDamageMs || 0));
  const selfHpValue = frame.selfHp;
  const targetHpValue = frame.targetHp;
  const snapshotHpValue = frame.nearbyHp;
  const targetMaxHp = numberOrNull(frame.target?.maxHp ?? frame.target?.max_hp ?? frame.nearbyEntity?.maxHp ?? frame.nearbyEntity?.max_hp ?? 100);
  const closeNativeSnapshotOutlier = Boolean(authoritativeOutOfRange
    && incomingRealBullet(frame)
    && closeNativeRange
    && referenceDistance <= closeNativeRange
    && authorityDistance >= attackRange * closeSnapshotRatio);
  const staleSnapshotHpOutlier = Boolean(incomingRealBullet(frame)
    && disadvantageRange
    && referenceDistance <= disadvantageRange
    && frame.noDamageMs >= outlierNoDamageMs
    && Number.isFinite(selfHpValue)
    && Number.isFinite(targetHpValue)
    && Number.isFinite(snapshotHpValue)
    && targetHpValue > selfHpValue
    && targetHpValue < snapshotHpValue
    && (targetMaxHp === null || targetHpValue < targetMaxHp));
  const rejectedSnapshotOutlier = closeNativeSnapshotOutlier || staleSnapshotHpOutlier;
  const active = Boolean(threshold > 0 && divergence >= threshold && (pressure || authoritativeOutOfRange) && !rejectedSnapshotOutlier);
  return {
    active,
    useSnapshot: Boolean(active && (!attackRange || authorityDistance <= attackRange)),
    suppressFire: Boolean(active && attackRange && authorityDistance > attackRange),
    divergenceCm: Math.round(divergence),
    thresholdCm: Math.round(threshold),
    authorityDistance: Math.round(authorityDistance),
    referenceDistance: Math.round(referenceDistance),
    rejectedSnapshotOutlier,
    snapshotOutlierReason: closeNativeSnapshotOutlier
      ? 'close-native-real-bullet'
      : (staleSnapshotHpOutlier ? 'stale-snapshot-hp' : '')
  };
}

function runPressureAuthorityScenario(shots, targetSamples, options, label = 'pressure snapshot authority vs live target') {
  let considered = 0;
  let hits = 0;
  let minDistance = Infinity;
  let firstHit = null;
  let suppressed = 0;
  let suppressedLoggedHits = 0;
  let rejectedSnapshotOutliers = 0;
  for (const shot of shots) {
    const frame = shot.frame;
    const state = pressureAuthorityState(frame, options);
    if (state.rejectedSnapshotOutlier) rejectedSnapshotOutliers += 1;
    if (state.suppressFire) {
      suppressed += 1;
      const logged = minDistanceForShot(frame.self, frame.aim, targetSamples, frame.at, options);
      if (logged.hit) suppressedLoggedHits += 1;
      continue;
    }
    const aim = state.rejectedSnapshotOutlier
      ? (frame.decisionTarget || frame.aim || frame.nearbyTarget)
      : (state.useSnapshot ? frame.nearbyTarget : (frame.aim || frame.decisionTarget || frame.nearbyTarget));
    const result = minDistanceForShot(frame.self, aim, targetSamples, frame.at, options);
    considered += 1;
    if (result.min < minDistance) minDistance = result.min;
    if (result.hit) {
      hits += 1;
      if (!firstHit) {
        firstHit = {
          line: frame.lineNo,
          time: formatTime(frame.at),
          noDamageMs: Math.round(frame.noDamageMs),
          minDistanceCm: Math.round(result.min)
        };
      }
    }
  }
  return {
    label,
    considered,
    hits,
    minDistanceCm: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
    firstHit,
    suppressed,
    suppressedLoggedHits,
    rejectedSnapshotOutliers
  };
}

function runFarNoDamageCloseScenario(frames, shots, targetSamples, options) {
  const simulation = simulateFarNoDamageSelfSamples(frames, options);
  const filteredShots = shots.filter(shot => {
    return simulation.activeStarted
      && shot.frame.at >= simulation.activeStarted.at;
  });
  const simulatedShots = filteredShots.map(shot => cloneShotWithSimulatedSelf(shot, simulation.samples));
  const scenario = runAimScenario(
    'far no-damage close dynamic vs live target',
    simulatedShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const baseline = runAimScenario(
    'far no-damage old-position dynamic vs live target',
    filteredShots,
    shot => dynamicAimForShot(shot, options),
    targetSamples,
    options
  );
  const firstFrame = simulation.activeStarted || null;
  const lastFrame = firstFrame ? frames.filter(frame => frame.at >= firstFrame.at).at(-1) : null;
  const firstSim = firstFrame ? interpolate(simulation.samples, firstFrame.at) : null;
  const lastSim = lastFrame ? interpolate(simulation.samples, lastFrame.at) : null;
  const firstDistance = firstFrame?.self && firstFrame?.nearbyTarget ? distance(firstFrame.self, firstFrame.nearbyTarget) : null;
  const lastOriginalDistance = lastFrame?.self && lastFrame?.nearbyTarget ? distance(lastFrame.self, lastFrame.nearbyTarget) : null;
  const lastSimDistance = lastSim && lastFrame?.nearbyTarget ? distance(lastSim, lastFrame.nearbyTarget) : null;
  return {
    ...scenario,
    baselineHits: baseline.hits,
    baselineMinDistanceCm: baseline.minDistanceCm,
    activeFrames: simulation.activeFrames,
    activeStart: firstFrame ? {
      line: firstFrame.lineNo,
      time: formatTime(firstFrame.at),
      noDamageMs: Math.round(firstFrame.noDamageMs),
      distanceCm: Math.round(firstDistance)
    } : null,
    originalEndDistanceCm: Number.isFinite(lastOriginalDistance) ? Math.round(lastOriginalDistance) : null,
    simulatedEndDistanceCm: Number.isFinite(lastSimDistance) ? Math.round(lastSimDistance) : null,
    simulatedApproachCm: Number.isFinite(lastOriginalDistance) && Number.isFinite(lastSimDistance)
      ? Math.round(lastOriginalDistance - lastSimDistance)
      : null
  };
}

function findExitFrame(frames, waitMs, options) {
  return frames.find(frame => {
    const hp = frame.selfHp;
    const enemyHp = frame.targetHp;
    const hpGap = Number(enemyHp) - Number(hp);
    return frame.noDamageMs >= waitMs
      && Number.isFinite(hpGap)
      && hpGap >= options.serverStallNoDamageHpGap
      && serverStalled(frame)
      && incomingRealBullet(frame);
  }) || null;
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

function runDualTargetFireArbitrationReplay(frames = [], sourceEvents = []) {
  const candidates = frames.filter(frame => {
    const replay = frame.entry?.dualTargetReplay;
    const primaryId = String(replay?.primaryTarget?.user_id ?? '');
    const secondaryId = String(replay?.secondaryTargetId ?? '');
    return Boolean(primaryId && secondaryId && primaryId !== secondaryId);
  });
  if (!candidates.length) return null;

  const primaryTarget = candidates[0].entry.dualTargetReplay.primaryTarget;
  const primaryId = String(primaryTarget.user_id);
  const secondaryId = String(candidates[0].entry.dualTargetReplay.secondaryTargetId);
  const firstNormalPrimaryAuthorization = candidates.find(frame => (
    frame.entry.dualTargetReplay.primaryNormalAuthorized === true
  )) || null;
  let finishRaceState = null;
  let finishRaceCandidateFrames = 0;
  let firstFinishRaceAuthorization = null;
  let lastHypotheticalFinishDispatchAt = -Infinity;
  const hypotheticalFinishDispatches = [];
  const finishRaceCadenceMs = Math.max(1, Number(DEFAULTS.combatShootEveryMs || 160));
  let preservedSecondarySelectionFrames = 0;
  let correctedPrimarySelectionFrames = 0;
  let loggedNoFireFramesCorrected = 0;
  let firstCorrectedFrame = null;
  let pressureEvidenceFrames = 0;
  let replayDerivedPressureEvidenceFrames = 0;
  let reachablePrimaryFinishDispatches = 0;
  let aimProofPrimaryFinishDispatches = 0;

  for (const frame of candidates) {
    const replay = frame.entry.dualTargetReplay;
    const primaryNormalAuthorized = replay.primaryNormalAuthorized === true;
    const pressureEvidence = replay.pressureEvidence || null;
    const rewardRace = replay.rewardRace || {};
    if (pressureEvidence?.active === true) pressureEvidenceFrames += 1;
    if (replay.replayDerivedPressureEvidence === true) replayDerivedPressureEvidenceFrames += 1;
    let hypotheticalDispatchAdded = false;
    const finishRace = primaryFinishRaceAuthorization({
      nowMs: frame.at,
      selfHp: frame.selfHp,
      primaryHp: replay.primaryTarget?.hp,
      primaryTarget: replay.primaryTarget,
      primaryPhysicalEligible: replay.primaryPhysicalEligible === true,
      primaryCompetitionAllowed: replay.primaryCompetitionAllowed !== false,
      primaryTargetFresh: replay.primaryTargetFresh !== false,
      primaryNormalAuthorized,
      normalFireBlocker: replay.normalFireBlocker,
      closePressure: replay.closePressure,
      pressureEvidence,
      rewardRace,
      finishRaceDispatchCount: finishRaceState?.dispatchCount || 0,
      previousWindow: finishRaceState,
      stamina5s: replay.selfStamina5s ?? frame.selfHp,
      hardReserveMs: replay.hardReserveMs ?? DEFAULTS.combatShootHardReserveMs,
      shotCostMs: replay.shotCostMs ?? DEFAULTS.combatShotStaminaCostMs,
      dodgeActionCostMs: replay.dodgeActionCostMs ?? 0
    }, DEFAULTS);
    if (finishRace.eligible === true) {
      finishRaceCandidateFrames += 1;
      if (!firstFinishRaceAuthorization) firstFinishRaceAuthorization = frame;
      if (frame.at - lastHypotheticalFinishDispatchAt >= finishRaceCadenceMs
        && (finishRace.dispatchCount || 0) < Number(DEFAULTS.primaryFinishRaceMaxShots)) {
        hypotheticalFinishDispatches.push({
          line: frame.lineNo,
          time: formatTime(frame.at),
          atMs: frame.at,
          selfHp: frame.selfHp,
          primaryHp: replay.primaryTarget?.hp ?? null,
          secondaryDistanceCm: replay.secondaryDistanceCm ?? null,
          dispatchCount: Number(finishRace.dispatchCount || 0) + 1,
          reachableAim: replay.primaryAimReachable === true,
          aimProofValid: replay.primaryAimProofValid === true
        });
        if (replay.primaryAimReachable === true) reachablePrimaryFinishDispatches += 1;
        if (replay.primaryAimProofValid === true) aimProofPrimaryFinishDispatches += 1;
        lastHypotheticalFinishDispatchAt = frame.at;
        hypotheticalDispatchAdded = true;
      }
      finishRaceState = {
        ...finishRace,
        dispatchCount: Number(finishRace.dispatchCount || 0) + Number(hypotheticalDispatchAdded)
      };
    } else if (!finishRace.windowExpiresAt || frame.at >= finishRace.windowExpiresAt) {
      finishRaceState = null;
    } else if (finishRace.windowStartedAt !== null) {
      finishRaceState = {
        ...finishRace,
        dispatchCount: Number(finishRace.dispatchCount || 0)
      };
    }

    const arbitration = dualTargetFireArbitration({
      secondaryActive: true,
      primaryAuthorized: primaryNormalAuthorized,
      primaryNormalAuthorized,
      primaryPhysicalEligible: replay.primaryPhysicalEligible === true,
      primaryFinishAuthorized: finishRace.eligible === true,
      closePressure: replay.closePressure,
      pressureEvidence,
      rewardRace
    });
    if (!primaryNormalAuthorized && finishRace.eligible !== true
      && arbitration.fireTargetRole === 'secondary') {
      preservedSecondarySelectionFrames += 1;
    }
    const loggedPrimary = replay.loggedFireTargetRole === 'primary';
    if (arbitration.primarySelected && !loggedPrimary) {
      correctedPrimarySelectionFrames += 1;
      if (replay.wouldShoot !== true) loggedNoFireFramesCorrected += 1;
      if (!firstCorrectedFrame) firstCorrectedFrame = frame;
    }
  }

  const dispatches = sourceEvents.filter(event => event.detail?.type === 'shoot-dispatch');
  const loggedPrimaryDispatches = dispatches.filter(event => (
    String(event.detail?.targetId || '') === primaryId
  )).length;
  const firstPrimaryAuthorization = firstNormalPrimaryAuthorization || firstFinishRaceAuthorization;
  const firstFinishAt = firstFinishRaceAuthorization?.at ?? Infinity;
  const finishRaceWindowEnd = Number.isFinite(firstFinishAt)
    ? firstFinishAt + Number(DEFAULTS.primaryFinishRaceWindowMs)
    : -Infinity;
  const loggedPrimaryDispatchesDuringFinishWindow = dispatches.filter(event => (
    String(event.detail?.targetId || '') === primaryId
      && Number(event.at) >= firstFinishAt
      && Number(event.at) <= finishRaceWindowEnd
  )).length;
  const firstPrimaryAuthorizationAt = firstPrimaryAuthorization?.at ?? Infinity;
  const loggedSecondaryBeforePrimaryAuthorization = dispatches.filter(event => (
    String(event.detail?.targetId || '') === secondaryId
      && Number(event.at) < firstPrimaryAuthorizationAt
  )).length;
  const loggedSecondaryAfterPrimaryAuthorization = dispatches.filter(event => (
    String(event.detail?.targetId || '') === secondaryId
      && Number(event.at) >= firstPrimaryAuthorizationAt
  )).length;
  const firstReplay = firstCorrectedFrame?.entry?.dualTargetReplay || null;
  return {
    primaryTargetId: primaryId,
    primaryTargetName: String(primaryTarget.name || ''),
    secondaryTargetId: secondaryId,
    closePressureDistanceCm: DEFAULT_SECONDARY_CLOSE_DISTANCE_CM,
    preservedSecondarySelectionFrames,
    correctedPrimarySelectionFrames,
    loggedNoFireFramesCorrected,
    pressureEvidenceFrames,
    replayDerivedPressureEvidenceFrames,
    reachablePrimaryFinishDispatches,
    aimProofPrimaryFinishDispatches,
    finishRaceCandidateFrames,
    firstFinishRaceAuthorization: firstFinishRaceAuthorization ? {
      line: firstFinishRaceAuthorization.lineNo,
      time: formatTime(firstFinishRaceAuthorization.at),
      atMs: firstFinishRaceAuthorization.at,
      selfHp: firstFinishRaceAuthorization.selfHp,
      primaryHp: firstFinishRaceAuthorization.entry?.dualTargetReplay?.primaryTarget?.hp ?? null,
      secondaryDistanceCm: firstFinishRaceAuthorization.entry?.dualTargetReplay?.secondaryDistanceCm ?? null
    } : null,
    hypotheticalFinishDispatches,
    loggedDispatches: {
      primary: loggedPrimaryDispatches,
      primaryDuringFinishWindow: loggedPrimaryDispatchesDuringFinishWindow,
      secondaryBeforePrimaryAuthorization: loggedSecondaryBeforePrimaryAuthorization,
      secondaryAfterPrimaryAuthorization: loggedSecondaryAfterPrimaryAuthorization
    },
    firstPrimaryAuthorization: firstPrimaryAuthorization ? {
      line: firstPrimaryAuthorization.lineNo,
      time: formatTime(firstPrimaryAuthorization.at),
      atMs: firstPrimaryAuthorization.at
    } : null,
    firstCorrectedSelection: firstCorrectedFrame ? {
      line: firstCorrectedFrame.lineNo,
      time: formatTime(firstCorrectedFrame.at),
      atMs: firstCorrectedFrame.at,
      selfHp: firstCorrectedFrame.selfHp,
      primaryHp: firstReplay?.primaryTarget?.hp ?? null,
      secondaryDistanceCm: firstReplay?.secondaryDistanceCm ?? null,
      loggedFinalFireBlocker: firstReplay?.finalFireBlocker || ''
    } : null,
    improved: (hypotheticalFinishDispatches.length > loggedPrimaryDispatchesDuringFinishWindow
      && aimProofPrimaryFinishDispatches > 0
      && correctedPrimarySelectionFrames > 0)
      || (loggedPrimaryDispatches === 0 && correctedPrimarySelectionFrames > 0),
    reason: hypotheticalFinishDispatches.length > loggedPrimaryDispatchesDuringFinishWindow
      && aimProofPrimaryFinishDispatches > 0
      && correctedPrimarySelectionFrames > 0
      ? 'bounded-primary-finish-race-adds-aim-proof-wire-fire-opportunity'
      : (loggedPrimaryDispatches === 0 && correctedPrimarySelectionFrames > 0
          ? 'restored-primary-fire-selection-after-authorization'
          : 'no-demonstrated-primary-selection-improvement')
  };
}

function runInvulnerableAvoidanceArbitrationReplay(frames = []) {
  const candidates = frames.filter(frame => {
    const replay = frame.entry?.invulnerableAvoidanceReplay;
    return Boolean(
        replay?.primaryTargetId
        && replay?.secondaryTargetId
        && replay.primaryTargetId !== replay.secondaryTargetId
    );
  });
  if (!candidates.length) return null;

  const first = candidates[0].entry.invulnerableAvoidanceReplay;
  let primaryMissionFrames = 0;
  let secondaryRetentionFrames = 0;
  let loggedAvoidanceFrames = 0;
  let correctedEscortFrames = 0;
  let alreadyEscortedFrames = 0;
  let preservedIncomingDodgeFrames = 0;
  let firstCorrection = null;
  const correctedReasons = {};
  const evidenceAges = [];

  for (const frame of candidates) {
    const replay = frame.entry.invulnerableAvoidanceReplay;
    if (replay.primaryTargetId === first.primaryTargetId) primaryMissionFrames += 1;
    if (replay.secondaryRetained === true) secondaryRetentionFrames += 1;
    if (Number.isFinite(Number(replay.secondaryEvidenceAgeMs))) {
      evidenceAges.push(Number(replay.secondaryEvidenceAgeMs));
    }
    if (replay.loggedFinalActionReason === 'incoming-bullet-dodge') {
      preservedIncomingDodgeFrames += 1;
    }
    if (replay.loggedFinalActionReason === 'combat-live-realtime'
      || replay.loggedFinalActionKind === 'combat-live') {
      alreadyEscortedFrames += 1;
    }
    if (replay.loggedFinalActionReason !== 'avoid-invulnerable-target'
      || replay.secondaryRetained !== true) continue;
    loggedAvoidanceFrames += 1;
    const corrected = replay.desiredActionBand === 'combat'
      && Boolean(replay.movementReason);
    if (!corrected) continue;
    correctedEscortFrames += 1;
    const reason = replay.desiredActionReason || replay.movementReason || 'combat-action';
    correctedReasons[reason] = Number(correctedReasons[reason] || 0) + 1;
    if (!firstCorrection) {
      firstCorrection = {
        line: frame.lineNo,
        time: formatTime(frame.at),
        atMs: frame.at,
        selfHp: frame.selfHp,
        secondaryEvidenceAgeMs: replay.secondaryEvidenceAgeMs,
        loggedFinalActionReason: replay.loggedFinalActionReason,
        correctedActionReason: reason,
        movementReason: replay.movementReason
      };
    }
  }

  const evidenceMinMs = evidenceAges.length ? Math.min(...evidenceAges) : null;
  const evidenceMaxMs = evidenceAges.length ? Math.max(...evidenceAges) : null;
  const improved = primaryMissionFrames > 0
    && secondaryRetentionFrames > 0
    && loggedAvoidanceFrames > 0
    && correctedEscortFrames > 0;
  return {
    primaryTargetId: first.primaryTargetId,
    primaryTargetName: first.primaryTargetName,
    secondaryTargetId: first.secondaryTargetId,
    primaryMissionFrames,
    secondaryRetentionFrames,
    loggedAvoidanceFrames,
    correctedEscortFrames,
    alreadyEscortedFrames,
    preservedIncomingDodgeFrames,
    secondaryEvidenceAgeMs: { min: evidenceMinMs, max: evidenceMaxMs },
    correctedReasons,
    firstCorrection,
    improved,
    reason: improved
      ? 'restored-secondary-escort-action-after-invulnerable-avoidance-arbitration'
      : 'no-demonstrated-invulnerable-avoidance-arbitration-improvement'
  };
}

// 副目标交战因对手火力间歇被释放, 会把一场战斗拆成多段重新接触。这里用日志里的
// 目标血量序列还原“我们自己的伤害进度”, 对同一批帧分别跑关闭/开启该证据的
// secondaryRetentionPolicy, 统计被纠正的释放帧, 并强制检查它没有带来追击
// (超出攻击距离仍维持) 或低血量滞留 (血量到脱离阈值仍维持)。
function retentionEvidenceState(replay, damage) {
  const evidenceAt = Number(replay.evidenceAt || 0);
  const state = {
    combatRole: 'secondary',
    secondaryTarget: true,
    lastFiringAt: 0,
    lastThreatAt: 0,
    lastIncomingBulletAt: 0,
    hasDamagedSelf: false,
    lastSelfDamageAt: 0,
    damageFromStart: Number(damage.damageFromStart || 0),
    lastDamageAmount: Number(damage.lastDamageAmount || 0),
    lastDamageAt: Number(damage.lastDamageAt || 0)
  };
  if (!evidenceAt) return state;
  if (replay.evidenceType === 'target-firing') state.lastFiringAt = evidenceAt;
  else if (replay.evidenceType === 'incoming-bullet') state.lastIncomingBulletAt = evidenceAt;
  else if (replay.evidenceType === 'attributable-self-damage') {
    state.hasDamagedSelf = true;
    state.lastSelfDamageAt = evidenceAt;
  } else state.lastThreatAt = evidenceAt;
  return state;
}

function runSecondaryOwnDamageRetentionReplay(frames = [], options = {}) {
  const candidates = frames.filter(frame => frame.entry?.secondaryRetentionReplay?.targetId);
  if (!candidates.length) return null;
  const attackRange = Number(options.combatAttackRange || DEFAULTS.combatAttackRange);
  const lowHpThreshold = Number(
    options.combatLowHpLeaveThreshold || DEFAULTS.combatLowHpLeaveThreshold
  );
  const policyOptions = {
    combatAttackRange: attackRange,
    combatLowHpLeaveThreshold: lowHpThreshold
  };
  const damage = { damageFromStart: 0, lastDamageAmount: 0, lastDamageAt: 0 };
  let firstTargetHp = null;
  let minTargetHp = null;
  let secondaryFrames = 0;
  let loggedAgreementFrames = 0;
  let loggedReleaseFrames = 0;
  let correctedRetentionFrames = 0;
  let droppedRetentionFrames = 0;
  let chaseRiskFrames = 0;
  let lowHpRetentionFrames = 0;
  let recoveryOwnedFrames = 0;
  let loggedRecoveryHoldFrames = 0;
  let suppressedRecoveryHoldFrames = 0;
  let firstCorrection = null;
  let lastEvaluation = null;

  for (const frame of candidates) {
    const replay = frame.entry.secondaryRetentionReplay;
    const targetHp = Number.isFinite(frame.targetHp) ? Number(frame.targetHp) : null;
    if (targetHp !== null) {
      if (firstTargetHp === null) {
        firstTargetHp = targetHp;
        minTargetHp = targetHp;
      } else if (targetHp < minTargetHp) {
        damage.lastDamageAmount = minTargetHp - targetHp;
        minTargetHp = targetHp;
        damage.lastDamageAt = frame.at;
      }
      damage.damageFromStart = Math.max(0, firstTargetHp - minTargetHp);
    }
    if (!replay.secondary) continue;
    secondaryFrames += 1;
    const state = retentionEvidenceState(replay, damage);
    const context = {
      selfHp: frame.selfHp,
      lowHpThreshold,
      attackRange,
      targetVisible: Boolean(replay.alive && (!replay.authority || replay.authority === 'realtime')),
      targetDistance: replay.distanceCm
    };
    const previous = secondaryRetentionPolicy(
      state,
      frame.at,
      { ...policyOptions, secondaryOwnDamageRetentionEnabled: false },
      context
    );
    const corrected = secondaryRetentionPolicy(state, frame.at, policyOptions, context);
    if (previous.retained === replay.retained) loggedAgreementFrames += 1;
    if (previous.retained === false) loggedReleaseFrames += 1;
    if (previous.retained === false && corrected.retained === true) {
      correctedRetentionFrames += 1;
      if (!firstCorrection) {
        firstCorrection = {
          line: frame.lineNo,
          time: formatTime(frame.at),
          atMs: frame.at,
          selfHp: frame.selfHp,
          targetHp,
          previousEvidenceType: previous.latestEvidenceType || '',
          previousEvidenceAgeMs: previous.ageMs,
          ownDamageAgeMs: corrected.ownDamageProgress?.ageMs ?? null,
          damageProgress: corrected.ownDamageProgress?.damageProgress ?? null,
          distanceCm: replay.distanceCm,
          loggedFinalActionReason: replay.loggedFinalActionReason
        };
      }
    }
    if (previous.retained === true && corrected.retained === false) droppedRetentionFrames += 1;
    if (corrected.retained === true) {
      if (!(Number(replay.distanceCm) <= attackRange)) chaseRiskFrames += 1;
      if (Number(frame.selfHp) <= lowHpThreshold) lowHpRetentionFrames += 1;
    }
    if (replay.loggedRecoveringSelf) recoveryOwnedFrames += 1;
    const engagedThreat = recoveryEngagedThreatPolicy({
      self: { hp: frame.selfHp },
      recovering: true,
      nowMs: frame.at,
      targets: [{
        userId: replay.targetId,
        distance: replay.distanceCm,
        active: replay.active,
        firing: replay.firing,
        authority: replay.authority || 'realtime',
        whitelisted: replay.whitelisted
      }],
      engagedTargetId: corrected.retained === true ? replay.targetId : ''
    }, policyOptions);
    const loggedHold = replay.loggedFinalActionKind === 'recover'
      || replay.loggedFinalActionReason === 'wait-for-full-stamina-and-hp';
    if (loggedHold) {
      loggedRecoveryHoldFrames += 1;
      if (engagedThreat.suppressed) suppressedRecoveryHoldFrames += 1;
    }
    lastEvaluation = {
      line: frame.lineNo,
      time: formatTime(frame.at),
      previousRetained: previous.retained,
      previousEvidenceAgeMs: previous.ageMs,
      correctedRetained: corrected.retained,
      correctedReason: corrected.reason,
      ownDamageAgeMs: corrected.ownDamageProgress?.ageMs ?? null,
      distanceCm: replay.distanceCm,
      selfHp: frame.selfHp,
      targetHp,
      engagedThreatSuppressed: engagedThreat.suppressed === true,
      engagedThreatTrigger: engagedThreat.evidence?.trigger || ''
    };
  }

  if (!secondaryFrames) return null;
  const improved = correctedRetentionFrames > 0
    && droppedRetentionFrames === 0
    && chaseRiskFrames === 0
    && lowHpRetentionFrames === 0;
  return {
    secondaryFrames,
    loggedAgreementFrames,
    loggedReleaseFrames,
    correctedRetentionFrames,
    droppedRetentionFrames,
    chaseRiskFrames,
    lowHpRetentionFrames,
    recoveryOwnedFrames,
    loggedRecoveryHoldFrames,
    suppressedRecoveryHoldFrames,
    ownDamageProgress: damage.damageFromStart,
    attackRangeCm: attackRange,
    lowHpThreshold,
    firstCorrection,
    segmentEnd: lastEvaluation,
    improved,
    reason: improved
      ? 'own-damage-progress-retains-secondary-engagement-without-chase-or-low-hp-hold'
      : (correctedRetentionFrames > 0
          ? 'own-damage-retention-violated-a-chase-or-low-hp-invariant'
          : 'no-secondary-release-frame-to-correct')
  };
}

function replay(options) {
  const loaded = loadFrames(options);
  const frames = loaded.frames;
  const selfSamples = samplesFromFrames(frames, 'self');
  const decisionSamples = samplesFromFrames(frames, 'decisionTarget');
  const liveSamples = samplesFromFrames(frames, 'nearbyTarget');
  const targetSamples = liveSamples.length ? liveSamples : decisionSamples;
  const healthAuthoritativeSamples = samplesFromFramesBy(frames, frame => {
    if (frame.decisionTarget
      && Number.isFinite(frame.targetHp)
      && Number.isFinite(frame.nearbyHp)
      && frame.targetHp < frame.nearbyHp) {
      return frame.decisionTarget;
    }
    return frame.nearbyTarget || frame.decisionTarget;
  });
  const shots = collectShots(frames, loaded.selfId);
  const finishPressureShots = collectFinishPressureShots(frames, options);
  const oldExitFrame = findExitFrame(frames, options.serverStallNoDamageLeaveMs, options);
  const graceWaitMs = Math.max(
    options.serverStallNoDamageLeaveMs,
    options.fallbackPrecisionNoDamageMs + options.serverStallNoDamagePrecisionGraceMs
  );
  const graceExitFrame = findExitFrame(frames, graceWaitMs, options);
  const precisionStartFrame = frames.find(frame => liveDivergenceState(frame, options).active)
    || frames.find(frame => frame.noDamageMs >= options.fallbackPrecisionNoDamageMs)
    || null;
  const snapshotOutlierRejections = frames.filter(frame => pressureAuthorityState(frame, options).rejectedSnapshotOutlier).length;

  const scenarios = [
    runActualBulletScenario(shots, targetSamples, options),
    runAimScenario('logged aimTarget vs live target', shots, shot => shot.frame.aim, targetSamples, options),
    runAimScenario('exact decision.target vs decision trajectory', shots, shot => shot.frame.decisionTarget, decisionSamples, options),
    runAimScenario('exact decision.target vs live target', shots, shot => shot.frame.decisionTarget, targetSamples, options),
    runAimScenario('exact live target vs live target', shots, shot => shot.frame.nearbyTarget, targetSamples, options),
    runAimScenario('real-bullet live precision vs live target', shots, realBulletPrecisionAimForShot, targetSamples, options),
    runAimScenario('live intercept vs live target', shots, shot => liveInterceptAimForShot(shot, options), targetSamples, options),
    runAimScenario('old effective logged aim before server-stall exit', shots, shot => shot.frame.aim, targetSamples, options, shot => !oldExitFrame || shot.frame.at < oldExitFrame.at),
    runAimScenario('dynamic strategy vs live target', shots, shot => dynamicAimForShot(shot, options), targetSamples, options),
    runAimScenario('dynamic strategy before grace exit', shots, shot => dynamicAimForShot(shot, options), targetSamples, options, shot => !graceExitFrame || shot.frame.at < graceExitFrame.at),
    runAimScenario('finish-pressure hypothetical dynamic vs live target', finishPressureShots, shot => dynamicAimForShot(shot, options), targetSamples, options),
    runOutOfRangeReengageScenario(frames, targetSamples, options),
    runFarNoDamageCloseScenario(frames, shots, targetSamples, options),
    runPassiveRunnerScenario(frames, shots, targetSamples, options),
    runPassiveRunnerReserveFireScenario(frames, shots, targetSamples, options),
    runOpponentProbeReserveScenario(frames, shots, options),
    runFinishLowThreatScenario(frames, shots, targetSamples, options),
    runPressureFireScenario(frames, shots, targetSamples, options),
    runSustainedPressureExitScenario(frames, options),
    runCombatEfficiencyDistanceControlScenario(frames, loaded.targetId, options),
    runPressureAuthorityScenario(shots, targetSamples, options),
    runAimScenario('logged aimTarget vs hp-authoritative target', shots, shot => shot.frame.aim, healthAuthoritativeSamples, options),
    runPressureAuthorityScenario(shots, healthAuthoritativeSamples, options, 'guarded pressure authority vs hp-authoritative target')
  ];

  const divergences = frames
    .map(frame => liveDivergenceState(frame, options).divergenceCm)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const targetHpValues = Array.from(new Set(frames.map(frame => frame.targetHp).filter(Number.isFinite))).sort((a, b) => a - b);
  const dualTargetFire = runDualTargetFireArbitrationReplay(frames, loaded.sourceEvents);
  const invulnerableAvoidance = runInvulnerableAvoidanceArbitrationReplay(frames);
  const secondaryOwnDamageRetention = runSecondaryOwnDamageRetentionReplay(frames, options);
  return {
    file: loaded.file,
    lineRange: [frames[0].lineNo, frames[frames.length - 1].lineNo],
    timeRange: [formatTime(frames[0].at), formatTime(frames[frames.length - 1].at)],
    selfId: loaded.selfId,
    targetId: loaded.targetId,
    targetName: loaded.targetName,
    frames: frames.length,
    shots: shots.length,
    finishPressureShots: finishPressureShots.length,
    selfHp: [frames[0].selfHp, frames[frames.length - 1].selfHp],
    targetHpValues,
    dualTargetFire,
    invulnerableAvoidance,
    secondaryOwnDamageRetention,
    coordinateDivergence: {
      samples: divergences.length,
      over10m: divergences.filter(value => value > 1000).length,
      over50m: divergences.filter(value => value > 5000).length,
      medianCm: divergences.length ? divergences[Math.floor(divergences.length / 2)] : null,
      maxCm: divergences.length ? divergences[divergences.length - 1] : null
    },
    dynamicStart: precisionStartFrame ? {
      line: precisionStartFrame.lineNo,
      time: formatTime(precisionStartFrame.at),
      noDamageMs: Math.round(precisionStartFrame.noDamageMs),
      divergence: liveDivergenceState(precisionStartFrame, options)
    } : null,
    snapshotOutlierRejections,
    oldServerStallExit: oldExitFrame ? {
      line: oldExitFrame.lineNo,
      time: formatTime(oldExitFrame.at),
      noDamageMs: Math.round(oldExitFrame.noDamageMs),
      selfHp: oldExitFrame.selfHp,
      targetHp: oldExitFrame.targetHp
    } : null,
    graceExitIfStillNoHit: graceExitFrame ? {
      line: graceExitFrame.lineNo,
      time: formatTime(graceExitFrame.at),
      noDamageMs: Math.round(graceExitFrame.noDamageMs),
      selfHp: graceExitFrame.selfHp,
      targetHp: graceExitFrame.targetHp
    } : null,
    scenarios
  };
}

function printReport(result) {
  console.log(`Replay ${path.relative(process.cwd(), result.file)} lines ${result.lineRange[0]}-${result.lineRange[1]}`);
  console.log(`Target ${result.targetName || '-'} (${result.targetId || '-'}) ${result.timeRange[0]}-${result.timeRange[1]}, frames=${result.frames}, shots=${result.shots}, finishPressureShots=${result.finishPressureShots}`);
  console.log(`HP self ${result.selfHp[0]} -> ${result.selfHp[1]}, target HP values ${result.targetHpValues.join(',') || '-'}`);
  console.log(`Coordinate divergence median=${result.coordinateDivergence.medianCm}cm max=${result.coordinateDivergence.maxCm}cm over10m=${result.coordinateDivergence.over10m}/${result.coordinateDivergence.samples}`);
  if (result.dualTargetFire) {
    const dual = result.dualTargetFire;
    console.log(`Dual-target replay primary ${dual.primaryTargetName || '-'} (${dual.primaryTargetId}) vs secondary ${dual.secondaryTargetId}: logged dispatches primary=${dual.loggedDispatches.primary}, secondary before/after authorization=${dual.loggedDispatches.secondaryBeforePrimaryAuthorization}/${dual.loggedDispatches.secondaryAfterPrimaryAuthorization}`);
    console.log(`Dual-target policy selections preservedSecondary=${dual.preservedSecondarySelectionFrames}, correctedPrimaryOutside${dual.closePressureDistanceCm}cm=${dual.correctedPrimarySelectionFrames}, correctedLoggedNoFire=${dual.loggedNoFireFramesCorrected}, improved=${dual.improved}`);
    console.log(`Pressure evidence frames=${dual.pressureEvidenceFrames}, replayDerived=${dual.replayDerivedPressureEvidenceFrames}, reachableFinishDispatches=${dual.reachablePrimaryFinishDispatches}, aimProofFinishDispatches=${dual.aimProofPrimaryFinishDispatches}`);
    if (dual.firstCorrectedSelection) {
      console.log(`First corrected primary selection line ${dual.firstCorrectedSelection.line} at ${dual.firstCorrectedSelection.time}, HP self/primary=${dual.firstCorrectedSelection.selfHp}/${dual.firstCorrectedSelection.primaryHp}, secondaryDistance=${dual.firstCorrectedSelection.secondaryDistanceCm}cm, loggedBlocker=${dual.firstCorrectedSelection.loggedFinalFireBlocker || '-'}`);
    }
  }
  if (result.invulnerableAvoidance) {
    const avoidance = result.invulnerableAvoidance;
    console.log(`Invulnerable-avoidance replay primary ${avoidance.primaryTargetId} vs secondary ${avoidance.secondaryTargetId}: loggedAvoidance=${avoidance.loggedAvoidanceFrames}, correctedEscort=${avoidance.correctedEscortFrames}, alreadyEscorted=${avoidance.alreadyEscortedFrames}, preservedIncomingDodge=${avoidance.preservedIncomingDodgeFrames}, evidenceAge=${avoidance.secondaryEvidenceAgeMs.min}-${avoidance.secondaryEvidenceAgeMs.max}ms, improved=${avoidance.improved}`);
    if (avoidance.firstCorrection) {
      console.log(`First corrected escort action line ${avoidance.firstCorrection.line} at ${avoidance.firstCorrection.time}, age=${avoidance.firstCorrection.secondaryEvidenceAgeMs}ms, logged=${avoidance.firstCorrection.loggedFinalActionReason}, corrected=${avoidance.firstCorrection.correctedActionReason}, movement=${avoidance.firstCorrection.movementReason}`);
    }
  }
  if (result.secondaryOwnDamageRetention) {
    const retention = result.secondaryOwnDamageRetention;
    console.log(`Secondary own-damage retention replay: secondaryFrames=${retention.secondaryFrames}, loggedAgreement=${retention.loggedAgreementFrames}, loggedRelease=${retention.loggedReleaseFrames}, correctedRetention=${retention.correctedRetentionFrames}, dropped=${retention.droppedRetentionFrames}, chaseRisk=${retention.chaseRiskFrames}, lowHpHold=${retention.lowHpRetentionFrames}, ownDamage=${retention.ownDamageProgress}, improved=${retention.improved}`);
    if (retention.firstCorrection) {
      console.log(`First corrected release line ${retention.firstCorrection.line} at ${retention.firstCorrection.time}, oldEvidence=${retention.firstCorrection.previousEvidenceType}/${retention.firstCorrection.previousEvidenceAgeMs}ms, ownDamage=${retention.firstCorrection.damageProgress}@${retention.firstCorrection.ownDamageAgeMs}ms, distance=${retention.firstCorrection.distanceCm}cm, HP self/target=${retention.firstCorrection.selfHp}/${retention.firstCorrection.targetHp}, logged=${retention.firstCorrection.loggedFinalActionReason || '-'}`);
    }
    if (retention.segmentEnd) {
      console.log(`Segment end line ${retention.segmentEnd.line} at ${retention.segmentEnd.time}: oldRetained=${retention.segmentEnd.previousRetained}@${retention.segmentEnd.previousEvidenceAgeMs}ms, correctedRetained=${retention.segmentEnd.correctedRetained} (${retention.segmentEnd.correctedReason}), distance=${retention.segmentEnd.distanceCm}cm, HP self/target=${retention.segmentEnd.selfHp}/${retention.segmentEnd.targetHp}, recoveryOwned=${retention.recoveryOwnedFrames}, loggedHold=${retention.loggedRecoveryHoldFrames}, holdSuppressed=${retention.suppressedRecoveryHoldFrames}, engagedThreat=${retention.segmentEnd.engagedThreatSuppressed}/${retention.segmentEnd.engagedThreatTrigger || '-'}`);
    }
  }
  if (result.dynamicStart) {
    console.log(`Dynamic precision starts line ${result.dynamicStart.line} at ${result.dynamicStart.time}, reason=${result.dynamicStart.divergence.active ? 'coordinate-divergence' : 'fallback'}, noDamage=${result.dynamicStart.noDamageMs}ms`);
  }
  if (result.oldServerStallExit) {
    console.log(`Old server-stall exit line ${result.oldServerStallExit.line} at ${result.oldServerStallExit.time}, HP ${result.oldServerStallExit.selfHp}/${result.oldServerStallExit.targetHp}`);
  }
  if (result.snapshotOutlierRejections) {
    console.log(`Snapshot outlier rejections=${result.snapshotOutlierRejections}`);
  }
  if (result.graceExitIfStillNoHit) {
    console.log(`Grace exit if still no hit line ${result.graceExitIfStillNoHit.line} at ${result.graceExitIfStillNoHit.time}, HP ${result.graceExitIfStillNoHit.selfHp}/${result.graceExitIfStillNoHit.targetHp}`);
  }
  for (const item of result.scenarios) {
    const first = item.firstHit ? ` firstHit=line ${item.firstHit.line} ${item.firstHit.time} min=${item.firstHit.minDistanceCm}cm` : '';
    const suppressed = Number.isFinite(Number(item.suppressed))
      ? ` suppressed=${item.suppressed} suppressedLoggedHits=${item.suppressedLoggedHits || 0} rejectedSnapshotOutliers=${item.rejectedSnapshotOutliers || 0}`
      : '';
    const extra = Number.isFinite(Number(item.extraShots)) ? ` extraShots=${item.extraShots}` : '';
    const baseline = Number.isFinite(Number(item.baselineHits))
      ? ` baseline=${item.baselineHits}/${item.considered} baselineMin=${item.baselineMinDistanceCm}cm`
      : '';
    const active = item.activeStart
      ? ` activeStart=line ${item.activeStart.line} distance=${item.activeStart.distanceCm}cm`
      : '';
    const approach = Number.isFinite(Number(item.simulatedApproachCm))
      ? ` simulatedEndDistance=${item.simulatedEndDistanceCm}cm approach=${item.simulatedApproachCm}cm`
      : '';
    const probe = Number.isFinite(Number(item.savedStaminaMs))
      ? ` simulatedShots=${item.simulatedShots}/${item.loggedShots} skipped=${item.skippedShots} savedStamina=${item.savedStaminaMs}ms reserveMet=${Boolean(item.reserveMet)}`
      : '';
    const firstPressure = item.firstPressure
      ? ` firstPressure=line ${item.firstPressure.line} stamina=${item.firstPressure.loggedStamina5s}->${item.firstPressure.projectedStamina5s}`
      : '';
    const exit = item.exitFrame
      ? ` exit=line ${item.exitFrame.line} savedMs=${item.savedMs || 0} savedStamina=${item.savedStamina || 0} hp=${item.exitFrame.selfHp}/${item.exitFrame.targetHp} noDamageMs=${item.exitFrame.noDamageMs}${item.exitFrame.rule ? ` rule=${item.exitFrame.rule} closeRatio=${item.exitFrame.closerRatio}` : ''}`
      : '';
    console.log(`- ${item.label}: hits=${item.hits}/${item.considered}, min=${item.minDistanceCm}cm${first}${suppressed}${extra}${baseline}${active}${approach}${probe}${firstPressure}${exit}`);
  }
}

function selfTest() {
  const loader = runLoadFramesSelfTest();
  if (!loader.ok) throw new Error(loader.error || 'browserless replay loader self-test failed');
  const cases = [
    {
      id: '2026-06-14-xmsthc-reference',
      file: path.join(__dirname, 'logs/2026-06-14/-_-_-_-.jsonl'),
      startLine: 12167,
      endLine: 12351,
      selfId: '28886',
      targetId: '20606',
      targetName: 'xmsthc'
    },
    {
      id: '2026-06-15-xmsthc-authority-divergence',
      file: path.join(__dirname, 'logs/2026-06-15/-_-_-_-.jsonl'),
      startLine: 5570,
      endLine: 6237,
      selfId: '28886',
      targetId: '20606',
      targetName: 'xmsthc'
    },
    {
      id: '2026-06-15-raf-authority-divergence',
      file: path.join(__dirname, 'logs/2026-06-15/-_-_-_-.jsonl'),
      startLine: 4421,
      endLine: 5469,
      selfId: '28886',
      targetId: '32664',
      targetName: '菈菲爾'
    },
    {
      id: '2026-06-17-xmsthc-real-bullet-live-precision',
      file: path.join(__dirname, 'logs/2026-06-17/20260617010950-self-28886-vs-xmsthc.jsonl'),
      startLine: 1,
      endLine: 438,
      selfId: '28886',
      targetId: '20606',
      targetName: 'xmsthc',
      expectRealBulletPrecisionImproved: true
    },
    {
      id: '2026-06-17-motor-real-bullet-live-precision',
      file: path.join(__dirname, 'logs/2026-06-17/20260617005325-self-28886-vs-Motor.jsonl'),
      startLine: 1,
      endLine: 610,
      selfId: '28886',
      targetId: '32906',
      targetName: 'Motor',
      expectRealBulletPrecisionImproved: true
    },
    {
      id: '2026-06-18-noah-z-server-stall-live-intercept',
      file: path.join(__dirname, 'logs/2026-06-18/20260618010728-self-28886-vs-Noah_Z.jsonl'),
      startLine: 1,
      endLine: 380,
      selfId: '28886',
      targetId: '29062',
      targetName: 'Noah_Z',
      expectLiveInterceptImproved: true
    },
    {
      id: '2026-06-18-lockcc-server-stall-live-intercept',
      file: path.join(__dirname, 'logs/2026-06-18/20260618012203-self-28886-vs-lockcc.jsonl'),
      startLine: 1,
      endLine: 737,
      selfId: '28886',
      targetId: '29014',
      targetName: 'lockcc',
      expectLiveInterceptImproved: true
    },
    {
      id: '2026-06-18-tyshine-long-live-intercept',
      file: path.join(__dirname, 'logs/2026-06-18/20260618014942-self-28886-vs-tyshine.jsonl'),
      startLine: 1,
      endLine: 2539,
      selfId: '28886',
      targetId: '33302',
      targetName: 'tyshine',
      expectLiveInterceptImproved: true
    },
    {
      id: '2026-06-18-beings-high-hp-zero-damage-window',
      file: path.join(__dirname, 'logs/2026-06-18/20260617160308-self-28886-vs-BeingS.jsonl'),
      startLine: 520,
      endLine: 594,
      selfId: '28886',
      targetId: '4430',
      targetName: 'BeingS',
      expectLiveInterceptImproved: true
    },
    {
      id: '2026-06-15-xmsthc-pressure-authority',
      file: path.join(__dirname, 'logs/2026-06-15/-_-_-_-.jsonl'),
      startLine: 9113,
      endLine: 9465,
      selfId: '28886',
      targetId: '20606',
      targetName: 'xmsthc',
      expectSuppressed: true
    },
    {
      id: '2026-06-16-mango-out-of-range-authority',
      file: path.join(__dirname, 'logs/2026-06-16/-_-_-_-.jsonl'),
      startLine: 1613,
      endLine: 2502,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango',
      expectSuppressed: true,
      expectExtraSuppression: true
    },
    {
      id: '2026-06-16-bluefeather-close-snapshot-outlier',
      file: path.join(__dirname, 'logs/2026-06-16/-_-_-_-.jsonl'),
      startLine: 3930,
      endLine: 4062,
      selfId: '28886',
      targetId: '32934',
      targetName: 'BlueFeather',
      expectSnapshotOutlierRejected: true
    },
    {
      id: '2026-06-16-bluefeather-losing-snapshot-outlier',
      file: path.join(__dirname, 'logs/2026-06-16/-_-_-_-.jsonl'),
      startLine: 4160,
      endLine: 5065,
      selfId: '28886',
      targetId: '32934',
      targetName: 'BlueFeather',
      expectImprovedPressureAuthority: true,
      expectSnapshotOutlierRejected: true
    },
    {
      id: '2026-06-20-mango-passive-runner-live-intercept',
      file: path.join(__dirname, 'logs/2026-06-20/20260619180524-self-28886-vs-mango.jsonl'),
      startLine: 1,
      endLine: 1874,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango'
    },
    {
      id: '2026-06-20-mango-passive-runner-close',
      file: path.join(__dirname, 'logs/2026-06-20/20260619180740-self-28886-vs-mango.jsonl'),
      startLine: 1,
      endLine: 1495,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango',
      expectPassiveRunnerImproved: true
    },
    {
      id: '2026-06-20-hamster-out-of-range-reengage',
      file: path.join(__dirname, 'logs/2026-06-20/20260620083709-self-28886-vs-81992.jsonl'),
      startLine: 1,
      endLine: 263,
      selfId: '28886',
      targetId: '33545',
      targetName: '蕉灼の仓鼠',
      expectOutOfRangeReengageImproved: true
    },
    {
      id: '2026-06-21-mango-low-threat-finish',
      file: path.join(__dirname, 'logs/2026-06-21/20260621011341-self-28886-vs-mango.jsonl'),
      startLine: 1,
      endLine: 3057,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango',
      expectFinishLowThreatImproved: true
    },
    {
      id: '2026-06-21-mango-low-threat-finish-pressure',
      file: path.join(__dirname, 'logs/2026-06-21/20260620224307-self-28886-vs-mango.jsonl'),
      startLine: 1,
      endLine: 3268,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango',
      expectFinishLowThreatImproved: true
    },
    {
      id: '2026-06-22-mango-passive-runner-close-range',
      file: path.join(__dirname, 'logs/2026-06-22/20260621201149-self-28886-vs-mango.jsonl'),
      startLine: 1,
      endLine: 3407,
      selfId: '28886',
      targetId: '31361',
      targetName: 'mango',
      expectPassiveRunnerImproved: true
    },
    {
      id: '2026-06-22-biliee-pressure-reengage',
      file: path.join(__dirname, 'logs/2026-06-22/20260622022724-self-28886-vs-biliee.jsonl'),
      startLine: 1,
      endLine: 610,
      selfId: '28886',
      targetId: '33607',
      targetName: 'biliee',
      expectOutOfRangeReengageImproved: true
    },
    {
      id: '2026-06-26-biliee-opponent-probe-reserve',
      file: path.join(__dirname, 'logs/2026-06-26/combat/20260626030537-self-28886-vs-biliee.jsonl'),
      startLine: 96,
      endLine: 225,
      selfId: '28886',
      targetId: '33607',
      targetName: 'biliee',
      expectOpponentProbeReserveImproved: true
    },
    {
      id: '2026-07-06-xuanze00-passive-runner-close-precision',
      file: path.join(__dirname, 'logs/2026-07-06/combat/20260705171540-self-28886-vs-xuanze00.jsonl'),
      startLine: 96,
      endLine: 2316,
      selfId: '28886',
      targetId: '34711',
      targetName: 'xuanze00'
    },
    {
      id: '2026-07-07-xuanze00-passive-runner-close-no-damage-intercept',
      file: path.join(__dirname, 'logs/2026-07-07/combat/20260707034130-self-28886-vs-xuanze00.jsonl'),
      startLine: 64,
      endLine: 1068,
      selfId: '28886',
      targetId: '34711',
      targetName: 'xuanze00'
    }
  ];
  const skipped = [];
  const summaries = cases.filter(item => {
    if (fs.existsSync(item.file)) return true;
    skipped.push({
      id: item.id,
      file: path.relative(__dirname, item.file),
      reason: 'missing-local-log'
    });
    return false;
  }).map(item => {
    const result = replay({ ...DEFAULTS, ...item });
    const logged = result.scenarios.find(scenario => scenario.label === 'logged aimTarget vs live target');
    const realBulletPrecision = result.scenarios.find(scenario => scenario.label === 'real-bullet live precision vs live target');
    const liveIntercept = result.scenarios.find(scenario => scenario.label === 'live intercept vs live target');
    const passiveRunner = result.scenarios.find(scenario => scenario.label === 'passive-runner close intercept vs live target');
    const passiveRunnerReserve = result.scenarios.find(scenario => scenario.label === 'passive-runner reserve fire vs live target');
    const opponentProbeReserve = result.scenarios.find(scenario => scenario.label === 'opponent-probe opening reserve');
    const finishLowThreat = result.scenarios.find(scenario => scenario.label === 'finish-low-threat burst vs live target');
    const outOfRangeReengage = result.scenarios.find(scenario => scenario.label === 'out-of-range reengage dynamic vs live target');
    const sustainedPressureExit = result.scenarios.find(scenario => scenario.label === 'sustained pressure no-damage exit');
    const dynamic = result.scenarios.find(scenario => scenario.label === 'dynamic strategy vs live target');
    const dynamicGrace = result.scenarios.find(scenario => scenario.label === 'dynamic strategy before grace exit');
    if (!logged || !dynamic || !dynamicGrace) throw new Error(`missing replay scenarios for ${item.id}`);
    if (!(dynamic.hits > logged.hits)) {
      const pressureAuthority = result.scenarios.find(scenario => scenario.label === 'pressure snapshot authority vs live target');
      if ((!item.expectSuppressed || !pressureAuthority || !(pressureAuthority.suppressed > 0) || pressureAuthority.suppressedLoggedHits !== 0)
        && (!item.expectSnapshotOutlierRejected || !(result.snapshotOutlierRejections > 0))
        && (!item.expectPassiveRunnerImproved || !passiveRunner || !(passiveRunner.hits > logged.hits))
        && (!item.expectOpponentProbeReserveImproved || !opponentProbeReserve || !opponentProbeReserve.reserveMet || !(opponentProbeReserve.skippedShots > 0))
        && (!item.expectFinishLowThreatImproved || !finishLowThreat || !(finishLowThreat.hits > logged.hits))
        && (!item.expectOutOfRangeReengageImproved || !outOfRangeReengage || !(outOfRangeReengage.hits > 0))
        && (!item.expectSustainedPressureExit || !sustainedPressureExit || !(sustainedPressureExit.hits > 0))) {
        throw new Error(`${item.id} dynamic replay did not improve hits: ${dynamic.hits} <= ${logged.hits}`);
      }
    }
    if (!item.expectOpponentProbeReserveImproved && !(dynamicGrace.hits > 0)) throw new Error(`${item.id} dynamic replay has no hits before grace exit`);
    if (item.expectRealBulletPrecisionImproved && (!realBulletPrecision || !(realBulletPrecision.hits > logged.hits))) {
      throw new Error(`${item.id} real-bullet live precision did not improve hits: ${realBulletPrecision?.hits || 0} <= ${logged.hits}`);
    }
    if (item.expectLiveInterceptImproved && (!liveIntercept || !(liveIntercept.hits > logged.hits) || !(dynamic.hits > logged.hits))) {
      throw new Error(`${item.id} live-intercept replay did not improve dynamic strategy over logged aim: liveIntercept=${liveIntercept?.hits || 0}, dynamic=${dynamic.hits}, logged=${logged.hits}`);
    }
    const pressureAuthority = result.scenarios.find(scenario => scenario.label === 'pressure snapshot authority vs live target');
    if (item.expectSuppressed && (!pressureAuthority || !(pressureAuthority.suppressed > 0) || pressureAuthority.suppressedLoggedHits !== 0)) {
      throw new Error(`${item.id} pressure authority did not suppress only no-hit logged shots`);
    }
    if (item.expectExtraSuppression && (!pressureAuthority || pressureAuthority.suppressed < 6)) {
      throw new Error(`${item.id} out-of-range authority did not suppress the stale opening shots`);
    }
    if (item.expectImprovedPressureAuthority && (!pressureAuthority || !(pressureAuthority.hits > logged.hits))) {
      const loggedHealth = result.scenarios.find(scenario => scenario.label === 'logged aimTarget vs hp-authoritative target');
      const guardedHealth = result.scenarios.find(scenario => scenario.label === 'guarded pressure authority vs hp-authoritative target');
      if (!loggedHealth || !guardedHealth || !(guardedHealth.hits > loggedHealth.hits)) {
        throw new Error(`${item.id} guarded pressure authority did not improve hits: ${pressureAuthority?.hits || 0} <= ${logged.hits}`);
      }
    }
    if (item.expectSnapshotOutlierRejected && !(result.snapshotOutlierRejections > 0)) {
      throw new Error(`${item.id} did not reject any snapshot outlier`);
    }
    if (item.expectPassiveRunnerImproved && (!passiveRunner || !(passiveRunner.hits > logged.hits) || !(passiveRunner.simulatedApproachCm > 0))) {
      throw new Error(`${item.id} passive-runner replay did not improve hits/approach: passiveRunner=${passiveRunner?.hits || 0}, logged=${logged.hits}, approach=${passiveRunner?.simulatedApproachCm || 0}`);
    }
    if (item.expectOpponentProbeReserveImproved && (!opponentProbeReserve
      || !opponentProbeReserve.reserveMet
      || !(opponentProbeReserve.skippedShots > 0)
      || !(opponentProbeReserve.savedStaminaMs > 0)
      || !opponentProbeReserve.firstPressure)) {
      throw new Error(`${item.id} opponent probe did not preserve opening reserve: skipped=${opponentProbeReserve?.skippedShots || 0}, saved=${opponentProbeReserve?.savedStaminaMs || 0}, reserveMet=${Boolean(opponentProbeReserve?.reserveMet)}`);
    }
    if (item.expectFinishLowThreatImproved && (!finishLowThreat || !(finishLowThreat.hits > logged.hits) || !(finishLowThreat.extraShots > 0))) {
      throw new Error(`${item.id} finish-low-threat replay did not improve hits: finishLowThreat=${finishLowThreat?.hits || 0}, logged=${logged.hits}, extraShots=${finishLowThreat?.extraShots || 0}`);
    }
    if (item.expectOutOfRangeReengageImproved && (!outOfRangeReengage
      || !(outOfRangeReengage.considered > 0)
      || !(outOfRangeReengage.hits > 0)
      || !(outOfRangeReengage.simulatedApproachCm > 0)
      || !outOfRangeReengage.enteredRange)) {
      throw new Error(`${item.id} out-of-range reengage replay did not enter range and create hits: considered=${outOfRangeReengage?.considered || 0}, hits=${outOfRangeReengage?.hits || 0}, approach=${outOfRangeReengage?.simulatedApproachCm || 0}`);
    }
    if (item.expectSustainedPressureExit && (!sustainedPressureExit || !(sustainedPressureExit.hits > 0) || !sustainedPressureExit.exitFrame)) {
      throw new Error(`${item.id} sustained pressure stop-loss did not trigger`);
    }
    return {
      id: item.id,
      loggedHits: logged.hits,
      realBulletPrecisionHits: realBulletPrecision?.hits || 0,
      liveInterceptHits: liveIntercept?.hits || 0,
      passiveRunnerHits: passiveRunner?.hits || 0,
      passiveRunnerReserveHits: passiveRunnerReserve?.hits || 0,
      passiveRunnerApproachCm: passiveRunner?.simulatedApproachCm || 0,
      opponentProbeSkippedShots: opponentProbeReserve?.skippedShots || 0,
      opponentProbeSavedStaminaMs: opponentProbeReserve?.savedStaminaMs || 0,
      opponentProbeProjectedStamina5s: opponentProbeReserve?.firstPressure?.projectedStamina5s || 0,
      finishLowThreatHits: finishLowThreat?.hits || 0,
      finishLowThreatExtraShots: finishLowThreat?.extraShots || 0,
      outOfRangeReengageHits: outOfRangeReengage?.hits || 0,
      outOfRangeReengageApproachCm: outOfRangeReengage?.simulatedApproachCm || 0,
      sustainedPressureExitLine: sustainedPressureExit?.exitFrame?.line || 0,
      dynamicHits: dynamic.hits,
      dynamicGraceHits: dynamicGrace.hits,
      pressureSuppressed: pressureAuthority?.suppressed || 0,
      pressureSuppressedLoggedHits: pressureAuthority?.suppressedLoggedHits || 0,
      pressureRejectedSnapshotOutliers: pressureAuthority?.rejectedSnapshotOutliers || 0,
      snapshotOutlierRejections: result.snapshotOutlierRejections
    };
  });
  console.log(JSON.stringify({ ok: true, loader, cases: summaries, skipped }, null, 2));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    selfTest();
    return;
  }
  const result = replay(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}

module.exports = {
  DEFAULTS,
  loadFrames,
  replay,
  runDualTargetFireArbitrationReplay,
  runInvulnerableAvoidanceArbitrationReplay,
  runLoadFramesSelfTest
};
