'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

const DEFAULT_ATTACK_RANGE_CM = 14500;
const DEFAULT_GUARD_BUFFER_CM = 5000;
const DEFAULT_CONFIRMATIONS = 2;
const DEFAULT_MINIMUM_CLOSING_SPEED = 20;
const DEFAULT_MINIMUM_CLOSING_ALIGNMENT = 0.65;
const DEFAULT_ENGAGED_THREAT_EVIDENCE_LEASE_MS = 2500;
// 已经打出可归因伤害的同一场交战, 判定“身边还有人在打我们”时用同一条更长的
// 租约, 否则交战保留还在生效、站桩恢复却已经被放行, 两个策略会互相打脸。
const DEFAULT_ENGAGED_THREAT_OWN_DAMAGE_LEASE_MS = 5000;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointDistance(a, b) {
  const ax = numberOrNull(a?.x);
  const ay = numberOrNull(a?.y);
  const bx = numberOrNull(b?.x);
  const by = numberOrNull(b?.y);
  if (ax === null || ay === null || bx === null || by === null) return null;
  return Math.hypot(ax - bx, ay - by);
}

function targetKey(target) {
  const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function previousActionWasRecoveryCore(action) {
  if (!action || typeof action !== 'object') return false;
  return (String(action.kind || '') === 'recover' && String(action.band || '') === 'recover')
    || String(action.reason || '') === 'wait-for-full-stamina-and-hp';
}

function targetSnapshot(target, distance) {
  return {
    userId: target?.userId ?? target?.user_id ?? null,
    entityId: target?.entityId ?? target?.entity_id ?? null,
    name: String(target?.name || ''),
    x: numberOrNull(target?.x),
    y: numberOrNull(target?.y),
    distance: numberOrNull(distance),
    active: Boolean(target?.active),
    firing: Boolean(target?.firing || target?.is_firing || target?.shooting),
    authority: String(target?.authority || 'realtime')
  };
}

function directClosingEvidence(self, target, previous, nowMs, options = {}) {
  const selfVx = Number(self?.vx || 0);
  const selfVy = Number(self?.vy || 0);
  const targetVx = Number(target?.vx || 0);
  const targetVy = Number(target?.vy || 0);
  const relativeVx = targetVx - selfVx;
  const relativeVy = targetVy - selfVy;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  const dx = Number(target?.x) - Number(self?.x);
  const dy = Number(target?.y) - Number(self?.y);
  const distance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = Number.isFinite(distance)
    ? (dx * relativeVx + dy * relativeVy) / distance
    : 0;
  const closingSpeed = Math.max(0, -radialSpeed);
  const closingAlignment = relativeSpeed > 0 ? closingSpeed / relativeSpeed : 0;
  const minimumClosingSpeed = Math.max(0, Number(
    options.recoveryContactMinimumClosingSpeed
      ?? options.minimumClosingSpeed
      ?? DEFAULT_MINIMUM_CLOSING_SPEED
  ));
  const minimumClosingAlignment = Math.max(0, Math.min(1, Number(
    options.recoveryContactMinimumClosingAlignment
      ?? options.minimumClosingAlignment
      ?? DEFAULT_MINIMUM_CLOSING_ALIGNMENT
  )));
  const velocityDirect = closingSpeed >= minimumClosingSpeed
    && closingAlignment >= minimumClosingAlignment;
  const previousDistance = numberOrNull(previous?.distance);
  const previousAt = numberOrNull(previous?.observedAt);
  const elapsedMs = previousAt === null ? 0 : Math.max(0, nowMs - previousAt);
  const historyClosingSpeed = previousDistance !== null && elapsedMs > 0
    ? Math.max(0, (previousDistance - distance) / elapsedMs * 1000)
    : 0;
  const historyDirect = historyClosingSpeed >= minimumClosingSpeed;
  return {
    direct: velocityDirect || historyDirect,
    velocityDirect,
    historyDirect,
    closingSpeed: Math.round(Math.max(closingSpeed, historyClosingSpeed) * 100) / 100,
    closingAlignment: Math.round(closingAlignment * 1000) / 1000
  };
}

function recoveryContactRanges(options = {}) {
  const attackRange = Math.max(0, Number(
    options.recoveryContactAttackRangeCm
      ?? options.combatAttackRange
      ?? options.attackRange
      ?? DEFAULT_ATTACK_RANGE_CM
  ));
  const guardBuffer = Math.max(0, Number(
    options.recoveryContactGuardBufferCm
      ?? DEFAULT_GUARD_BUFFER_CM
  ));
  return {
    attackRange,
    guardBuffer,
    guardRange: attackRange + guardBuffer
  };
}

function selfHp(self) {
  return numberOrNull(self?.hp ?? self?.knownHp ?? self?.displayHp);
}

function recoveryContactLowHpThreshold(options = {}) {
  const configured = numberOrNull(
    options.recoveryContactLowHpThreshold
      ?? options.combatLowHpLeaveThreshold
      ?? options.combatLowHpThreshold
      ?? options.lowHpThreshold
  );
  return Math.max(0, configured ?? COMBAT_CONSTANTS.LOW_HP_THRESHOLD);
}

function updateRecoveryContactGuardCore(previousState, context = {}, options = {}) {
  const nowMs = Number(context.nowMs || Date.now());
  const self = context.self || null;
  if (!self || context.recovering !== true) {
    return { state: null, decision: null, reason: self ? 'recovery-finished' : 'missing-self' };
  }
  const previous = previousState && typeof previousState === 'object' ? previousState : null;
  const recoveryCommitted = previousActionWasRecoveryCore(context.previousAction);
  if (!previous?.armedByRecovery && !recoveryCommitted) {
    return { state: null, decision: null, reason: 'recovery-not-committed' };
  }
  const currentHp = selfHp(self);
  const lowHpThreshold = recoveryContactLowHpThreshold(options);
  if (currentHp === null) {
    return { state: null, decision: null, reason: 'missing-self-hp' };
  }
  if (currentHp > lowHpThreshold) {
    return { state: null, decision: null, reason: 'healthy-recovery-contact-no-guard' };
  }

  const ranges = recoveryContactRanges(options);
  const realBulletOwners = new Set((context.realBulletOwnerIds || []).map(String).filter(Boolean));
  const targets = (context.targets || [])
    .filter(target => target && target.alive !== false)
    .filter(target => !target.authority || target.authority === 'realtime')
    .map(target => {
      const id = targetKey(target);
      const distance = numberOrNull(target.distance) ?? pointDistance(self, target);
      const firing = Boolean(target.firing || target.is_firing || target.shooting);
      const realBullet = Boolean(id && realBulletOwners.has(id));
      const active = Boolean(target.active || firing || realBullet);
      return { target, id, distance, firing, realBullet, active };
    })
    .filter(item => item.id && item.active && item.distance !== null)
    .sort((left, right) => Number(left.distance) - Number(right.distance));

  const lockedId = String(previous?.targetId || '');
  let selected = lockedId
    ? targets.find(item => item.id === lockedId && item.distance <= ranges.guardRange) || null
    : null;
  if (!selected) {
    selected = targets.find(item => item.distance <= ranges.guardRange) || null;
  }
  if (!selected) {
    return { state: null, decision: null, reason: 'no-recovery-contact' };
  }

  const sameTarget = selected.id === lockedId;
  const observationKey = context.observationKey ?? nowMs;
  const freshObservation = !sameTarget || observationKey !== previous?.lastObservationKey;
  const closing = directClosingEvidence(
    self,
    selected.target,
    sameTarget ? previous : null,
    nowMs,
    options
  );
  const inRange = selected.distance <= ranges.attackRange;
  const strongEvidence = selected.firing || selected.realBullet || inRange;
  const ordinaryEvidence = closing.direct;
  const confirmationsRequired = Math.max(1, Number(
    options.recoveryContactConfirmations
      ?? DEFAULT_CONFIRMATIONS
  ));
  const priorConfirmations = sameTarget ? Number(previous?.closingConfirmations || 0) : 0;
  const closingConfirmations = freshObservation && ordinaryEvidence
    ? priorConfirmations + 1
    : (ordinaryEvidence ? priorConfirmations : 0);
  const confirmed = strongEvidence || closingConfirmations >= confirmationsRequired || previous?.active === true;
  const evidence = {
    trigger: selected.realBullet
      ? 'real-collision-bullet'
      : (selected.firing
          ? 'target-firing'
          : (inRange ? 'entered-attack-range' : 'direct-closing-confirmed')),
    firing: selected.firing,
    realBullet: selected.realBullet,
    inRange,
    directClosing: closing.direct,
    velocityDirect: closing.velocityDirect,
    historyDirect: closing.historyDirect,
    closingSpeed: closing.closingSpeed,
    closingAlignment: closing.closingAlignment,
    closingConfirmations,
    confirmationsRequired,
    selfHp: currentHp,
    lowHpThreshold
  };
  const nextState = {
    armedByRecovery: true,
    active: confirmed,
    targetId: selected.id,
    observedAt: nowMs,
    lastObservationKey: observationKey,
    distance: selected.distance,
    lastTarget: targetSnapshot(selected.target, selected.distance),
    closingConfirmations,
    confirmedAt: confirmed ? Number(previous?.confirmedAt || nowMs) : 0,
    evidence
  };
  if (!confirmed) {
    return { state: nextState, decision: null, reason: ordinaryEvidence ? 'closing-confirmation-pending' : 'no-hostile-approach' };
  }

  return {
    state: nextState,
    decision: {
      mode: 'leave',
      reason: 'recovery-low-hp-contact-leave',
      target: selected.target,
      retained: false,
      evidence,
      ranges
    },
    reason: 'confirmed-low-hp-contact-leave'
  };
}

// 血量在脱离阈值之上、身边还有一个正在交火的敌人在攻击距离内时, 原地站桩恢复
// 是纯亏: 我们不还手、不躲、也不走位, 对方每一轮火力都白拿。这条策略只拦掉
// “原地等待恢复”这一个动作, 让当轮交给战斗/安全/收益候选去竞争; 它不产生移动,
// 也不授予追击。血量到脱离阈值及以下时交回低血量接触守卫和脱离逻辑。
function recoveryEngagedThreatPolicy(context = {}, options = {}) {
  const enabled = options.recoveryEngagedThreatHoldSuppressionEnabled !== false;
  const self = context.self || null;
  const recovering = context.recovering === true;
  const nowMs = Number(context.nowMs || 0);
  const ranges = recoveryContactRanges(options);
  const lowHpThreshold = recoveryContactLowHpThreshold(options);
  const currentHp = selfHp(self);
  const baseEvidenceLeaseMs = Math.max(0, Number(
    options.recoveryEngagedThreatEvidenceLeaseMs
      ?? options.incomingPressureEvidenceLeaseMs
      ?? DEFAULT_ENGAGED_THREAT_EVIDENCE_LEASE_MS
  ));
  // 只有同一场交战确实打出过可归因伤害时才用更长的租约; 陌生目标仍走基础租约。
  const ownDamageLeaseMs = Math.max(baseEvidenceLeaseMs, Number(
    options.recoveryEngagedThreatOwnDamageLeaseMs
      ?? options.secondaryOwnDamageRetentionWindowMs
      ?? DEFAULT_ENGAGED_THREAT_OWN_DAMAGE_LEASE_MS
  ));
  const ownDamageProgress = Math.max(0, Number(context.engagedOwnDamageProgress || 0));
  const evidenceLeaseMs = ownDamageProgress > 0 ? ownDamageLeaseMs : baseEvidenceLeaseMs;
  const base = {
    enabled,
    suppressed: false,
    threat: null,
    evidence: null,
    ranges,
    selfHp: currentHp,
    lowHpThreshold,
    evidenceLeaseMs,
    baseEvidenceLeaseMs,
    ownDamageProgress
  };
  if (!enabled) return { ...base, reason: 'engaged-threat-hold-suppression-disabled' };
  if (!self || !recovering) return { ...base, reason: recovering ? 'missing-self' : 'not-recovering' };
  if (currentHp === null) return { ...base, reason: 'missing-self-hp' };
  if (currentHp <= lowHpThreshold) return { ...base, reason: 'low-hp-recovery-owns-contact' };
  const engagedId = context.engagedTargetId === null || context.engagedTargetId === undefined
    ? ''
    : String(context.engagedTargetId);
  const realBulletOwners = new Set((context.realBulletOwnerIds || []).map(String).filter(Boolean));
  const damageOwnerId = context.recentSelfDamageOwnerId === null || context.recentSelfDamageOwnerId === undefined
    ? ''
    : String(context.recentSelfDamageOwnerId);
  const damageAt = Number(context.recentSelfDamageAt || 0);
  const damageAgeMs = damageAt > 0 && nowMs > 0 ? Math.max(0, nowMs - damageAt) : null;
  const recentSelfDamage = Boolean(damageOwnerId
    && damageAgeMs !== null
    && damageAgeMs <= evidenceLeaseMs);
  const candidates = (context.targets || [])
    .filter(target => target && target.alive !== false)
    .filter(target => !target.authority || target.authority === 'realtime')
    .filter(target => !target.whitelisted && !target.profitProtected && !target.creatorProtected)
    .map(target => {
      const id = targetKey(target);
      const distance = numberOrNull(target.distance) ?? pointDistance(self, target);
      const firing = Boolean(target.firing || target.is_firing || target.shooting);
      const realBullet = Boolean(id && realBulletOwners.has(id));
      const engaged = Boolean(id && engagedId && id === engagedId);
      const damaged = Boolean(id && recentSelfDamage && id === damageOwnerId);
      return {
        target,
        id,
        distance,
        firing,
        realBullet,
        engaged,
        damaged,
        active: Boolean(target.active || firing || realBullet || engaged)
      };
    })
    .filter(item => item.id
      && item.active
      && item.distance !== null
      && item.distance <= ranges.attackRange
      && (item.firing || item.realBullet || item.engaged || item.damaged))
    .sort((left, right) => Number(left.distance) - Number(right.distance));
  const selected = candidates[0] || null;
  if (!selected) return { ...base, reason: 'no-engaged-threat-in-attack-range' };
  return {
    ...base,
    suppressed: true,
    reason: 'engaged-threat-in-attack-range',
    threat: targetSnapshot(selected.target, selected.distance),
    evidence: {
      trigger: selected.realBullet
        ? 'real-collision-bullet'
        : (selected.firing
            ? 'target-firing'
            : (selected.engaged ? 'established-engagement' : 'attributable-self-damage')),
      firing: selected.firing,
      realBullet: selected.realBullet,
      engaged: selected.engaged,
      recentSelfDamage: selected.damaged,
      selfDamageAgeMs: selected.damaged ? damageAgeMs : null,
      distance: Math.round(Number(selected.distance)),
      attackRange: ranges.attackRange,
      threatCount: candidates.length
    }
  };
}

module.exports = {
  DEFAULT_ENGAGED_THREAT_EVIDENCE_LEASE_MS,
  DEFAULT_ENGAGED_THREAT_OWN_DAMAGE_LEASE_MS,
  previousActionWasRecoveryCore,
  recoveryContactRanges,
  recoveryContactLowHpThreshold,
  recoveryEngagedThreatPolicy,
  updateRecoveryContactGuardCore
};
