'use strict';

const DEFAULT_PROXIMITY_BASE_RANGE_CM = 6500;
const DEFAULT_COMBAT_ATTACK_RANGE_CM = 14500;
const DEFAULT_LOW_HP_THRESHOLD = 50;
const DEFAULT_RISK_HP_RATIO = 0.5;
const DEFAULT_BULLET_HIT_RADIUS_CM = 90;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function entityHp(value) {
  return numberOrNull(value?.hp ?? value?.health ?? value?.knownHp ?? value?.displayHp);
}

function entityMaxHp(value) {
  const maxHp = numberOrNull(value?.max_hp ?? value?.maxHp ?? value?.maximumHp);
  return maxHp !== null && maxHp > 0 ? maxHp : null;
}

function entityDistance(value) {
  return numberOrNull(value?.distance ?? value?.distanceCm);
}

function entityAlive(value) {
  if (!value || value.alive === false) return false;
  const hp = entityHp(value);
  if (hp !== null && hp <= 0) return false;
  const life = String(value.life ?? value.state ?? value.status ?? '').trim().toLowerCase();
  return !['dead', 'died', 'killed'].includes(life);
}

function entityInvulnerable(value) {
  if (!value) return false;
  if (value.invulnerable === true || value.isInvulnerable === true || value.is_invulnerable === true) return true;
  return [
    value.invulnerable_remaining_ms,
    value.invulnerableRemainingMs,
    value.invulnerable_remaining_ticks,
    value.invulnerableRemainingTicks,
    value.invincible_remaining_ms,
    value.invincibleRemainingMs,
    value.invincible_remaining_ticks,
    value.invincibleRemainingTicks
  ].some(item => Number(item) > 0);
}

function combatAttackRange(options = {}) {
  const configured = numberOrNull(options.combatAttackRange ?? options.attackRange);
  return Math.max(0, configured ?? DEFAULT_COMBAT_ATTACK_RANGE_CM);
}

function lowHpThreshold(options = {}) {
  const configured = numberOrNull(
    options.dynamicWhitelistLowHpThreshold
      ?? options.combatLowHpLeaveThreshold
      ?? options.lowHpThreshold
  );
  return Math.max(0, configured ?? DEFAULT_LOW_HP_THRESHOLD);
}

function dynamicWhitelistCombatRangeCore(self, options = {}) {
  const selfHp = entityHp(self);
  const maxHp = entityMaxHp(self);
  const threshold = lowHpThreshold(options);
  const maximumRangeCm = combatAttackRange(options);
  const configuredBaseRange = numberOrNull(options.dynamicWhitelistFullHpRangeCm);
  const baseRangeCm = Math.min(
    maximumRangeCm,
    Math.max(0, configuredBaseRange ?? DEFAULT_PROXIMITY_BASE_RANGE_CM)
  );
  const riskHpRatio = Math.max(
    0.01,
    numberOrNull(options.dynamicWhitelistRiskHpRatio) ?? DEFAULT_RISK_HP_RATIO
  );
  if (selfHp === null) {
    return {
      valid: false,
      reason: 'missing-self-hp',
      selfHp: null,
      maxHp,
      hpRatio: null,
      risk: null,
      lowHp: false,
      lowHpThreshold: threshold,
      baseRangeCm,
      maximumRangeCm,
      rangeCm: 0
    };
  }
  if (selfHp <= threshold) {
    return {
      valid: true,
      reason: 'low-hp-no-proximity-combat',
      selfHp,
      maxHp,
      hpRatio: maxHp === null ? null : clamp(selfHp / maxHp, 0, 1),
      risk: 1,
      lowHp: true,
      lowHpThreshold: threshold,
      baseRangeCm,
      maximumRangeCm,
      rangeCm: 0
    };
  }
  if (maxHp === null) {
    return {
      valid: false,
      reason: 'missing-self-max-hp',
      selfHp,
      maxHp: null,
      hpRatio: null,
      risk: null,
      lowHp: false,
      lowHpThreshold: threshold,
      baseRangeCm,
      maximumRangeCm,
      rangeCm: 0
    };
  }
  const hpRatio = clamp(selfHp / maxHp, 0, 1);
  const risk = clamp((1 - hpRatio) / riskHpRatio, 0, 1);
  const rangeCm = Math.min(
    maximumRangeCm,
    Math.max(baseRangeCm, Math.round(baseRangeCm + risk * (maximumRangeCm - baseRangeCm)))
  );
  return {
    valid: true,
    reason: 'hp-scaled-proximity-range',
    selfHp,
    maxHp,
    hpRatio,
    risk,
    lowHp: false,
    lowHpThreshold: threshold,
    baseRangeCm,
    maximumRangeCm,
    rangeCm
  };
}

function evaluateDynamicWhitelistContactCore(self, target, context = {}, options = {}) {
  const creatorProtected = context.creatorProtected === true || target?.creatorProtected === true;
  const dynamicWhitelistMember = context.dynamicWhitelistMember === true || target?.dynamicWhitelistMember === true;
  const dynamicWhitelistEnabled = dynamicWhitelistMember && (
    context.dynamicWhitelistEnabled !== undefined
      ? context.dynamicWhitelistEnabled === true
      : target?.dynamicWhitelistEnabled !== false
  );
  const damagedSelfToday = dynamicWhitelistMember && (
    context.damagedSelfToday === true || target?.damagedSelfToday === true
  );
  const legacyWhitelistProtected = !creatorProtected
    && !dynamicWhitelistMember
    && (context.legacyWhitelistProtected === true || target?.whitelisted === true || target?.profitProtected === true);
  const membershipSource = creatorProtected ? 'creator' : (dynamicWhitelistMember ? 'dynamic' : 'none');
  const profitProtected = Boolean(creatorProtected || dynamicWhitelistMember || legacyWhitelistProtected);
  const rangeModel = dynamicWhitelistCombatRangeCore(self, options);
  const attackRangeCm = rangeModel.maximumRangeCm;
  const distanceCm = entityDistance(target);
  const realtimeAuthority = !target?.authority || target.authority === 'realtime';
  const targetValid = Boolean(
    target
      && realtimeAuthority
      && entityAlive(target)
      && !entityInvulnerable(target)
      && distanceCm !== null
  );
  const ordinaryRangeOverride = Boolean(dynamicWhitelistMember && (damagedSelfToday || !dynamicWhitelistEnabled));
  const proactiveCombatRangeCm = dynamicWhitelistMember
    ? (ordinaryRangeOverride ? attackRangeCm : rangeModel.rangeCm)
    : 0;
  const selfHp = rangeModel.selfHp;
  const lowHp = selfHp !== null && selfHp <= rangeModel.lowHpThreshold;
  const recovering = context.recovering === true;
  const recoveryRadiusCm = Math.max(0, numberOrNull(context.recoveryRadiusCm) ?? 0);
  const lowHpSafetyRadiusCm = recovering
    ? Math.max(attackRangeCm, recoveryRadiusCm)
    : attackRangeCm;
  const inProactiveRange = Boolean(
    targetValid
      && dynamicWhitelistMember
      && proactiveCombatRangeCm > 0
      && distanceCm <= proactiveCombatRangeCm
  );
  const lowHpSafetyExit = Boolean(
    targetValid
      && dynamicWhitelistMember
      && !creatorProtected
      && lowHp
      && distanceCm <= lowHpSafetyRadiusCm
  );
  const proximitySafetyEnabled = options.dynamicWhitelistProximitySafetyEnabled !== false;
  const proactiveCombatEligible = Boolean(
    proximitySafetyEnabled
      && targetValid
      && dynamicWhitelistMember
      && !creatorProtected
      && !lowHp
      && selfHp !== null
      && (ordinaryRangeOverride || rangeModel.valid)
      && inProactiveRange
  );
  let reason = 'ordinary-target';
  if (creatorProtected) reason = 'creator-hard-protection';
  else if (legacyWhitelistProtected) reason = 'legacy-whitelist-hard-protection';
  else if (dynamicWhitelistMember && lowHpSafetyExit) reason = 'dynamic-whitelist-low-hp-contact';
  else if (dynamicWhitelistMember && damagedSelfToday) reason = 'dynamic-whitelist-damaged-today';
  else if (dynamicWhitelistMember) reason = 'dynamic-whitelist-distance-guard';
  return {
    membershipSource,
    creatorProtected,
    dynamicWhitelistMember,
    dynamicWhitelistEnabled,
    damagedSelfToday,
    legacyWhitelistProtected,
    profitProtected,
    targetValid,
    authority: target?.authority || '',
    selfHp,
    maxHp: rangeModel.maxHp,
    hpRatio: rangeModel.hpRatio,
    risk: rangeModel.risk,
    lowHp,
    lowHpThreshold: rangeModel.lowHpThreshold,
    distanceCm,
    attackRangeCm,
    proactiveCombatRangeCm,
    proactiveCombatEligible,
    inProactiveRange,
    ordinaryRangeOverride,
    recovering,
    recoveryRadiusCm,
    lowHpSafetyRadiusCm,
    lowHpSafetyExit,
    incomingDodgeRequired: false,
    dodgeOnly: false,
    reason,
    rangeModel
  };
}

function incomingOwnerId(incoming) {
  const value = incoming?.ownerId
    ?? incoming?.owner_id
    ?? incoming?.owner_user_id
    ?? incoming?.ownerUserId
    ?? incoming?.source_user_id
    ?? incoming?.user_id;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function targetUserId(target) {
  const value = target?.user_id ?? target?.userId ?? target?.id ?? target?.entity_id ?? target?.entityId;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function dynamicWhitelistIncomingOverrideCore(target, incoming, context = {}, options = {}) {
  const ownerId = incomingOwnerId(incoming);
  const targetId = targetUserId(target);
  const ownerMatches = Boolean(ownerId && targetId && ownerId === targetId);
  const cpa = numberOrNull(incoming?.cpa);
  const hitRadiusCm = Math.max(
    1,
    numberOrNull(options.combatTargetSwitchIncomingCpaCm ?? options.combatBulletHitRadiusCm)
      ?? DEFAULT_BULLET_HIT_RADIUS_CM
  );
  const collisionPath = Boolean(
    incoming
      && incoming.incoming !== false
      && cpa !== null
      && cpa >= 0
      && cpa <= hitRadiusCm
  );
  const incomingDodgeRequired = Boolean(collisionPath && (ownerMatches || !target));
  const creatorProtected = context.creatorProtected === true || target?.creatorProtected === true;
  const dynamicWhitelistMember = context.dynamicWhitelistMember === true || target?.dynamicWhitelistMember === true;
  const legacyWhitelistProtected = !creatorProtected
    && !dynamicWhitelistMember
    && (context.legacyWhitelistProtected === true || target?.legacyWhitelistProtected === true);
  const distanceCm = entityDistance(target);
  const attackRangeCm = combatAttackRange(options);
  const dodgeRangeCm = attackRangeCm + Math.max(0, numberOrNull(
    options.combatDodgeRangeBuffer
  ) ?? 1000);
  const offensiveProtection = Boolean(creatorProtected || legacyWhitelistProtected);
  const defensiveTargetEligible = Boolean(
    incomingDodgeRequired
      && target
      && entityAlive(target)
      && !entityInvulnerable(target)
      && !offensiveProtection
      && distanceCm !== null
      && distanceCm <= attackRangeCm
  );
  return {
    ownerId: ownerId || null,
    targetId: targetId || null,
    ownerMatches,
    collisionPath,
    cpa,
    hitRadiusCm,
    incomingDodgeRequired,
    defensiveTargetEligible,
    dodgeOnly: Boolean(incomingDodgeRequired && !defensiveTargetEligible),
    outsideAttackRange: distanceCm !== null && distanceCm > attackRangeCm,
    withinDodgeRange: distanceCm !== null && distanceCm <= dodgeRangeCm,
    distanceCm,
    attackRangeCm,
    dodgeRangeCm,
    reason: incomingDodgeRequired
      ? (creatorProtected
          ? 'creator-hard-protection'
          : (legacyWhitelistProtected
              ? 'legacy-whitelist-hard-protection'
              : 'dynamic-whitelist-incoming-override'))
      : 'no-collision-path-incoming'
  };
}

function dynamicWhitelistDistanceGuardBlocksCombatCore(target, context = {}) {
  const policy = target?.whitelistContactPolicy || null;
  if (!policy?.dynamicWhitelistMember || policy.creatorProtected) return false;
  if (context.incomingOverride === true || context.recentInjury === true) return false;
  return policy.proactiveCombatEligible !== true;
}

module.exports = {
  DEFAULT_COMBAT_ATTACK_RANGE_CM,
  DEFAULT_LOW_HP_THRESHOLD,
  DEFAULT_PROXIMITY_BASE_RANGE_CM,
  dynamicWhitelistCombatRangeCore,
  dynamicWhitelistDistanceGuardBlocksCombatCore,
  dynamicWhitelistIncomingOverrideCore,
  evaluateDynamicWhitelistContactCore
};
