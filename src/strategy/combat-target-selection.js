'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');
const {
  dynamicWhitelistDistanceGuardBlocksCombatCore,
  dynamicWhitelistIncomingOverrideCore
} = require('./dynamic-whitelist-safety');

/**
 * Combat Target Classification and Selection
 *
 * Extracted from main file to improve modularity.
 * Handles combat target eligibility, priority, and selection logic.
 */

/**
 * Check if entity is a combat-eligible threat
 *
 * @param {Object} entity - Entity to check
 * @param {Object} options - Selection options
 * @returns {boolean}
 */
function isActiveCombatMode(entity) {
  if (!entity) return false;
  if (entity.active === true) return true;
  if (entity.active === false) return false;
  const mode = String(entity.current_join_mode || entity.mode || entity.joined || '').toLowerCase();
  return mode === 'active';
}

function isFiringCombatEntity(entity) {
  return Boolean(entity?.firing || entity?.is_firing || entity?.shooting);
}

function truthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function anyPositiveNumber(...values) {
  return values.some(value => Number(value) > 0);
}

function combatDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function targetId(entity) {
  const id = entity?.user_id ?? entity?.userId ?? entity?.id;
  return id === null || id === undefined ? '' : String(id);
}

function isPreferredEasyKillTarget(entity, context = {}) {
  if (entity?.easyKillProfitTarget !== true) return false;
  const preferredId = context.easyKillPreferredTargetId;
  return preferredId !== null
    && preferredId !== undefined
    && preferredId !== ''
    && targetId(entity) === String(preferredId);
}

function easyKillThreatExempt(entity, context = {}) {
  if (entity?.easyKillThreatExempt !== true) return false;
  if (!isPreferredEasyKillTarget(entity, context)) return true;
  return context.lowHpSelf === true;
}

function combatTargetId(entity) {
  return targetId(entity);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function combatHpValue(entity) {
  return numberOrNull(entity?.hp ?? entity?.knownHp ?? entity?.displayHp);
}

function combatDistanceValue(entity) {
  return numberOrNull(entity?.distance);
}

function targetRadialAwaySpeedCore(self, target) {
  const sx = numberOrNull(self?.x);
  const sy = numberOrNull(self?.y);
  const tx = numberOrNull(target?.x);
  const ty = numberOrNull(target?.y);
  const tvx = numberOrNull(target?.vx) ?? 0;
  const tvy = numberOrNull(target?.vy) ?? 0;
  if ([sx, sy, tx, ty].some(value => value === null)) return null;
  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return 0;
  return (tvx * dx + tvy * dy) / distance;
}

function combatEscapeDecisionCore(self, target, engaged = {}, options = {}) {
  const behavior = engaged?.opponentBehaviorState || target?.opponentBehaviorState || null;
  const previous = engaged?.escapeDecision || null;
  const mode = String(behavior?.mode || '');
  const confidence = Math.max(0, Number(behavior?.confidence || 0));
  const noProgressMs = Math.max(0, Number(behavior?.noProgressMs || 0));
  const netDistanceChangeCm = Number(behavior?.metrics?.netDistanceChange || 0);
  const radialAwaySpeed = targetRadialAwaySpeedCore(self, target);
  const minConfidence = Math.max(0, Number(options.combatEscapeConfirmConfidence ?? 0.8));
  const minNoProgressMs = Math.max(0, Number(options.combatEscapeConfirmNoProgressMs ?? 5000));
  const minNetDistanceCm = Math.max(0, Number(options.combatEscapeConfirmNetDistanceCm ?? 2000));
  const minRadialSpeed = Math.max(0, Number(options.combatEscapeConfirmRadialSpeedMin ?? 5));
  const freshConfirmed = mode === 'retreat-kite'
    && confidence >= minConfidence
    && noProgressMs >= minNoProgressMs
    && netDistanceChangeCm >= minNetDistanceCm
    && radialAwaySpeed !== null
    && radialAwaySpeed >= minRadialSpeed;
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || 0));
  const distance = combatDistanceValue(target);
  const clearlyApproaching = radialAwaySpeed !== null
    && radialAwaySpeed <= -minRadialSpeed
    && distance !== null
    && attackRange > 0
    && distance <= attackRange;
  const latched = Boolean(previous?.confirmed && !clearlyApproaching);
  const confirmed = Boolean(freshConfirmed || latched);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  return {
    confirmed,
    freshConfirmed,
    latched,
    released: Boolean(previous?.confirmed && clearlyApproaching),
    reason: confirmed
      ? (freshConfirmed ? 'sustained-outward-no-progress' : 'latched-sustained-escape')
      : (clearlyApproaching ? 'target-clearly-reapproaching' : 'escape-not-confirmed'),
    mode,
    confidence,
    noProgressMs,
    netDistanceChangeCm: Number.isFinite(netDistanceChangeCm) ? Math.round(netDistanceChangeCm) : null,
    radialAwaySpeed: radialAwaySpeed === null ? null : Number(radialAwaySpeed.toFixed(2)),
    confirmedAt: confirmed
      ? (freshConfirmed ? nowMs : Number(previous?.confirmedAt || nowMs))
      : 0,
    observedAt: nowMs
  };
}

function combatEdgePressureDecisionCore(self, target, engaged = {}, escapeDecision = null, options = {}) {
  const distance = combatDistanceValue(target);
  const selfHp = combatHpValue(self);
  const targetHp = combatHpValue(target);
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || 0));
  const maxRange = Math.max(attackRange, Number(options.combatAdvantageReengageRange ?? 16000));
  const minSelfHp = Math.max(0, Number(options.combatAdvantageReengageMinHp ?? 60));
  const minHpLead = Math.max(0, Number(options.combatAdvantageReengageMinHpLead ?? 5));
  const recentInRangeMs = Math.max(0, Number(options.combatAdvantageReengageRecentInRangeMs ?? 3000));
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const lastInRangeAt = Number(engaged?.lastInRangeAt || engaged?.at || 0);
  const outOfRangeMs = Math.max(0, nowMs - lastInRangeAt);
  const hpLead = selfHp === null || targetHp === null ? null : selfHp - targetHp;
  const active = Boolean(
    distance !== null
      && attackRange > 0
      && distance > attackRange
      && distance <= maxRange
      && selfHp !== null
      && targetHp !== null
      && selfHp >= minSelfHp
      && hpLead >= minHpLead
      && outOfRangeMs <= recentInRangeMs
      && escapeDecision?.confirmed !== true
  );
  return {
    active,
    reason: active
      ? 'healthy-hp-advantage-reengage'
      : (escapeDecision?.confirmed
          ? 'confirmed-escape-blocks-reengage'
          : (distance !== null && distance > maxRange
              ? 'outside-advantage-reengage-range'
              : (hpLead !== null && hpLead < minHpLead
                  ? 'insufficient-hp-lead'
                  : (outOfRangeMs > recentInRangeMs ? 'reengage-window-expired' : 'advantage-reengage-inactive')))),
    distance: distance === null ? null : Math.round(distance),
    attackRange: Math.round(attackRange),
    maxRange: Math.round(maxRange),
    selfHp,
    targetHp,
    hpLead,
    minSelfHp,
    minHpLead,
    outOfRangeMs: Math.round(outOfRangeMs),
    recentInRangeMs: Math.round(recentInRangeMs)
  };
}

function incomingBulletForTarget(entity, context = {}) {
  const id = targetId(entity);
  if (!id) return null;
  const explicit = context.incomingBullet || null;
  const explicitOwner = explicit?.ownerId
    ?? explicit?.owner_id
    ?? explicit?.ownerUserId
    ?? explicit?.owner_user_id
    ?? explicit?.source_user_id
    ?? explicit?.user_id;
  if (explicitOwner !== null
    && explicitOwner !== undefined
    && String(explicitOwner) === id
    && incomingBulletHasCollisionRiskCore(explicit, context)) return explicit;
  return (context.bullets || []).find(bullet => {
    const ownerId = bullet?.ownerId
      ?? bullet?.owner_id
      ?? bullet?.ownerUserId
      ?? bullet?.owner_user_id
      ?? bullet?.source_user_id
      ?? bullet?.user_id;
    return bullet?.incoming !== false
      && ownerId !== null
      && ownerId !== undefined
      && String(ownerId) === id
      && incomingBulletHasCollisionRiskCore(bullet, context);
  }) || null;
}

function incomingOwnerMatchesTarget(entity, context = {}) {
  const ownerId = context.incomingBulletOwnerId ?? context.incomingOwnerId ?? context.incomingBullet?.ownerId;
  const id = targetId(entity);
  if (id === '') return false;
  if (ownerId !== null && ownerId !== undefined && String(ownerId) === id) return true;
  return Boolean(incomingBulletForTarget(entity, context));
}

function recentInjuryMatchesTarget(entity, context = {}) {
  const injury = context.recentInjury || null;
  if (!injury) return false;
  const suspectId = injury.suspectId ?? injury.userId ?? injury.user_id ?? injury.targetId ?? injury.target_id;
  if (suspectId === null || suspectId === undefined) return false;
  const id = targetId(entity);
  return id !== '' && String(suspectId) === id;
}

function lowValueActiveDropMax(context = {}) {
  const value = Number(context.lowValueActiveDropMax ?? context.combatLowValueActiveDropMax ?? COMBAT_CONSTANTS.LOW_VALUE_ACTIVE_DROP_MAX);
  return Number.isFinite(value) ? Math.max(0, value) : COMBAT_CONSTANTS.LOW_VALUE_ACTIVE_DROP_MAX;
}

function proactiveActiveCombatBudgetBlocked(context = {}) {
  const required = Number(context.proactiveActiveKillStaminaBudgetMs ?? COMBAT_CONSTANTS.PROACTIVE_ACTIVE_KILL_STAMINA_BUDGET_MS);
  if (!(Number.isFinite(required) && required > 0)) return false;
  const budget = Number(context.opportunityStaminaBudget);
  return Number.isFinite(budget) && budget < required;
}

function proactiveActiveCombatImmediateStaminaBlocked(context = {}) {
  const required = Number(context.proactiveActiveCombatMinimumStamina5s);
  const remaining = Number(context.selfStamina5s);
  return Number.isFinite(required)
    && required > 0
    && Number.isFinite(remaining)
    && remaining < required;
}

function activeCombatRequiresThreatEvidence(entity, context = {}) {
  if (!isActiveCombatMode(entity)) return false;
  if (isPreferredEasyKillTarget(entity, context)) return false;
  return combatDropValue(entity) <= lowValueActiveDropMax(context)
    || proactiveActiveCombatBudgetBlocked(context)
    || proactiveActiveCombatImmediateStaminaBlocked(context);
}

function combatTargetThreatensSelf(entity, context = {}) {
  if (incomingOwnerMatchesTarget(entity, context)) return true;
  if (recentInjuryMatchesTarget(entity, context)) return true;
  if (context.unknownIncoming && isActiveCombatMode(entity) && isFiringCombatEntity(entity)) return true;
  return isFiringCombatEntity(entity);
}

function recentAfkAttackCommitmentCore(previousAction, entities = [], options = {}) {
  const action = previousAction && typeof previousAction === 'object' ? previousAction : null;
  const actionTarget = action?.target || null;
  const actionKind = String(action?.kind || '');
  if (!['attack', 'opportunistic-shot'].includes(actionKind) || !actionTarget) return null;
  if (actionTarget.active !== false || actionTarget.alive === false || actionTarget.invulnerable === true) return null;
  const continuation = actionTarget.afkAttackContinuation || null;
  if (!continuation || String(continuation.source || '') !== 'recent-actual-shot') return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const graceMs = Math.max(0, Number(continuation.graceMs || options.targetStickMs || 0));
  const shotAt = Number(continuation.at || 0);
  const ageMs = shotAt > 0 ? Math.max(0, nowMs - shotAt) : Math.max(0, Number(continuation.ageMs || 0));
  if (!(graceMs > 0) || ageMs > graceMs) return null;
  const id = targetId(actionTarget);
  const visibleTarget = id
    ? (entities || []).find(entity => targetId(entity) === id) || null
    : null;
  if (!visibleTarget
    || visibleTarget.active !== false
    || visibleTarget.alive === false
    || isInvulnerableEntity(visibleTarget)) {
    return null;
  }
  const distance = combatDistanceValue(visibleTarget);
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || 0));
  if (!Number.isFinite(distance) || !(attackRange > 0) || distance > attackRange) return null;
  return {
    active: true,
    reason: 'recent-afk-attack-commitment',
    targetId: id,
    targetName: String(visibleTarget.name || actionTarget.name || ''),
    targetHp: combatHpValue(visibleTarget),
    targetDistance: Math.round(distance),
    lastShotAt: shotAt || null,
    ageMs: Math.round(ageMs),
    graceMs: Math.round(graceMs)
  };
}

function isCombatEligibleThreat(entity, options = {}) {
  if (!entity) return false;

  if (entity.alive === false || isInvulnerableEntity(entity)) return false;
  if (entity.authority && entity.authority !== 'realtime') return false;

  const incomingBullet = incomingBulletForTarget(entity, options);
  const incomingOverride = dynamicWhitelistIncomingOverrideCore(entity, incomingBullet, {}, options);
  const recentInjury = recentInjuryMatchesTarget(entity, options);
  const dynamicPolicy = entity.whitelistContactPolicy || null;
  const dynamicWhitelistMember = Boolean(entity.dynamicWhitelistMember || dynamicPolicy?.dynamicWhitelistMember);
  const creatorProtected = Boolean(entity.creatorProtected || dynamicPolicy?.creatorProtected);
  const legacyWhitelistProtected = Boolean(
    entity.legacyWhitelistProtected
      || dynamicPolicy?.legacyWhitelistProtected
      || (!dynamicWhitelistMember && options.whitelistCheck && options.whitelistCheck(entity))
  );

  // The creator and legacy hard whitelist remain offensive vetoes. Their
  // bullets are handled by the pre-target Dodge/leave safety path instead.
  if (creatorProtected || legacyWhitelistProtected) return false;

  // Realtime collision-path fire and recent attributable injury outrank the
  // dynamic whitelist distance guard and the easy-kill trust exemption.
  if (incomingOverride.defensiveTargetEligible || recentInjury) return true;

  if (dynamicWhitelistMember) return dynamicPolicy?.proactiveCombatEligible === true;

  // A recently killed player stays outside ordinary defensive combat until it
  // has actually damaged self. A deliberately selected easy-kill profit target
  // may still be fought while health is above the ordinary low-HP exit line.
  if (easyKillThreatExempt(entity, options)) return false;

  if (incomingOwnerMatchesTarget(entity, options) || recentInjury) return true;

  // Match the browser runtime's split between defensive/proactive Active combat
  // and ordinary Passive/AFK profit. Moving or Drop value alone should not make
  // a Passive target a combat target; those belong to profit arbitration.
  if (isActiveCombatMode(entity)) {
    if (options.healthyRecoveryCombat === true) return true;
    return activeCombatRequiresThreatEvidence(entity, options)
      ? combatTargetThreatensSelf(entity, options)
      : true;
  }

  return isFiringCombatEntity(entity);
}

/**
 * Check if entity is invulnerable
 */
function isInvulnerableEntity(entity) {
  if (!entity) return false;

  return anyPositiveNumber(
    entity.invulnerable_remaining_ticks,
    entity.invincible_remaining_ticks,
    entity.invulnerability_remaining_ticks,
    entity.invulnerableTicks,
    entity.invulnerableRemainingTicks,
    entity.invincibleRemainingTicks,
    entity.invulnerabilityRemainingTicks,
    entity.invulnerable_ticks,
    entity.invincible_ticks,
    entity.invulnerability_ticks,
    entity.invulnerable_tick,
    entity.invincible_tick,
    entity.invulnerability_tick,
    entity.invulnerable_remaining_ms,
    entity.invincible_remaining_ms,
    entity.invulnerability_remaining_ms,
    entity.invulnerableRemainingMs,
    entity.invincibleRemainingMs,
    entity.invulnerabilityRemainingMs,
    entity.invulnerable_ms,
    entity.invincible_ms,
    entity.invulnerability_ms,
    entity.immune_remaining_ms,
    entity.immuneRemainingMs,
    entity.invulnerable_remaining,
    entity.invincible_remaining,
    entity.invulnerability_remaining,
    entity.invulnerableRemaining,
    entity.invincibleRemaining,
    entity.invulnerabilityRemaining
  ) || [
    'invulnerable',
    'is_invulnerable',
    'isInvulnerable',
    'immune',
    'is_immune'
  ].some(field => truthyFlag(entity?.[field]));
}

/**
 * Calculate combat target priority score
 *
 * Higher score = higher priority
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Target entity
 * @param {Object} context - Combat context (bullets, threats, etc.)
 * @returns {number} Priority score
 */
function calculateCombatTargetPriority(self, target, context = {}) {
  if (!target) return -Infinity;
  const distance = Number(target.distance || 0);
  return (incomingOwnerMatchesTarget(target, context) ? 1000000000 : 0)
    + (isFiringCombatEntity(target) ? 500000000 : 0)
    + (context.unknownIncoming && isActiveCombatMode(target) ? 200000000 : 0)
    + (recentInjuryMatchesTarget(target, context) ? 100000000 : 0)
    + (isActiveCombatMode(target) ? 50000000 : 0)
    + combatDropValue(target) * 1000000
    - (Number.isFinite(distance) ? distance : 0);
}

/**
 * Check if target satisfies proactive Active combat gates
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Target entity
 * @param {Object} context - Combat context
 * @returns {Object} { allowed, reason }
 */
function checkProactiveActiveCombatGates(self, target, context = {}) {
  if (!target) return { allowed: false, reason: 'no-target' };

  if (isPreferredEasyKillTarget(target, context)) {
    return { allowed: true, reason: 'known-easy-kill-profit-target' };
  }

  // Check Drop threshold
  const drop = combatDropValue(target);
  if (drop <= lowValueActiveDropMax(context)) {
    if (!combatTargetThreatensSelf(target, context)) {
      return { allowed: false, reason: 'low-drop-no-threat-evidence' };
    }
  }

  // Check stamina budget for proactive combat
  if (proactiveActiveCombatBudgetBlocked(context)) {
    if (!combatTargetThreatensSelf(target, context)) {
      return { allowed: false, reason: 'insufficient-stamina-budget' };
    }
  }

  if (proactiveActiveCombatImmediateStaminaBlocked(context)) {
    if (!combatTargetThreatensSelf(target, context)) {
      return { allowed: false, reason: 'insufficient-immediate-stamina' };
    }
  }

  return { allowed: true, reason: 'proactive-gates-satisfied' };
}

/**
 * Select best combat target from candidates
 *
 * @param {Object} self - Self entity
 * @param {Array} candidates - Array of candidate targets
 * @param {Object} context - Combat context
 * @returns {Object|null} Selected target or null
 */
function selectBestCombatTarget(self, candidates, context = {}) {
  if (!candidates || !candidates.length) return null;

  const incomingShooter = candidates.find(target => isCombatEligibleThreat(target, context) && incomingOwnerMatchesTarget(target, context));
  if (incomingShooter) {
    return {
      ...incomingShooter,
      incomingBullet: incomingBulletForTarget(incomingShooter, context),
      combatIntent: 'defensive'
    };
  }

  // Filter and score candidates
  const scored = candidates
    .filter(target => isCombatEligibleThreat(target, context))
    .map(target => ({
      target,
      score: calculateCombatTargetPriority(self, target, context)
    }))
    .filter(item => Number.isFinite(item.score));

  if (!scored.length) return null;

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return highest priority target
  return {
    ...scored[0].target,
    combatIntent: combatTargetThreatensSelf(scored[0].target, context)
      ? 'defensive'
      : (scored[0].target?.whitelistContactPolicy?.proactiveCombatEligible === true
          ? 'whitelist-proximity'
          : (context.healthyRecoveryCombat === true && isActiveCombatMode(scored[0].target)
              ? 'recovery-contact'
              : 'profit'))
  };
}

function incomingBulletHasCollisionRiskCore(incomingBullet, options = {}) {
  if (!incomingBullet) return false;
  const cpaValue = incomingBullet.cpa;
  if (cpaValue === null || cpaValue === undefined || cpaValue === '') return false;
  const cpa = Number(cpaValue);
  const hitRadius = Math.max(1, Number(
    options.combatTargetSwitchIncomingCpaCm
      ?? options.combatBulletHitRadiusCm
      ?? COMBAT_CONSTANTS.BULLET_HIT_RADIUS_CM
  ));
  return Number.isFinite(cpa) && cpa >= 0 && cpa <= hitRadius;
}

function incomingBulletRequiresTargetSwitchCore(incomingBullet, options = {}) {
  if (!incomingBulletHasCollisionRiskCore(incomingBullet, options)) return false;
  const distanceValue = incomingBullet.distance;
  const timeToImpactValue = incomingBullet.timeToImpactMs ?? incomingBullet.timeToImpact;
  const distance = distanceValue === null || distanceValue === undefined || distanceValue === '' ? NaN : Number(distanceValue);
  const timeToImpactMs = timeToImpactValue === null || timeToImpactValue === undefined || timeToImpactValue === ''
    ? NaN
    : Number(timeToImpactValue);
  const switchDistance = Math.max(0, Number(options.combatTargetSwitchIncomingDistance || 0));
  const switchTime = Math.max(0, Number(options.combatTargetSwitchIncomingTimeMs || 0));
  if (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance) return true;
  if (switchTime > 0 && Number.isFinite(timeToImpactMs) && timeToImpactMs <= switchTime) return true;
  return false;
}

function defensiveTargetOverridesEngagedCore(engagedTarget, defensiveTarget, options = {}) {
  if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
  if (!incomingBulletRequiresTargetSwitchCore(defensiveTarget.incomingBullet, options)) return false;
  const ownerId = defensiveTarget.incomingBullet.ownerId
    ?? defensiveTarget.incomingBullet.owner_id
    ?? defensiveTarget.incomingBullet.source_user_id
    ?? defensiveTarget.incomingBullet.user_id;
  if (ownerId === null || ownerId === undefined) return false;
  const defensiveId = combatTargetId(defensiveTarget);
  const engagedId = combatTargetId(engagedTarget);
  return defensiveId !== '' && engagedId !== '' && String(defensiveId) !== String(engagedId);
}

function combatTargetIncomingThreatEvidenceCore(bullets = [], targetIdValue = '', options = {}) {
  const targetIdValueString = String(targetIdValue || '');
  if (!targetIdValueString) {
    return { targetId: '', bulletCount: 0, urgentBulletCount: 0, urgent: false, riskLevel: 0, minTimeToImpactMs: null, minDistanceCm: null };
  }
  const matching = (bullets || []).filter(bullet => {
    const ownerId = bullet?.ownerId ?? bullet?.owner_id ?? bullet?.source_user_id ?? bullet?.user_id;
    return bullet?.incoming !== false
      && ownerId !== null
      && ownerId !== undefined
      && String(ownerId) === targetIdValueString
      && incomingBulletHasCollisionRiskCore(bullet, options);
  });
  const urgent = matching.filter(bullet => incomingBulletRequiresTargetSwitchCore(bullet, options));
  const finiteMinimum = (items, selector) => {
    const values = items.map(selector).map(Number).filter(Number.isFinite);
    return values.length ? Math.min(...values) : null;
  };
  const minTimeToImpactMs = finiteMinimum(matching, bullet => bullet.timeToImpactMs ?? bullet.timeToImpact);
  const minDistanceCm = finiteMinimum(matching, bullet => bullet.distance);
  const switchTime = Math.max(0, Number(options.combatTargetSwitchIncomingTimeMs || 0));
  const switchDistance = Math.max(0, Number(options.combatTargetSwitchIncomingDistance || 0));
  const critical = urgent.some(bullet => {
    const time = Number(bullet.timeToImpactMs ?? bullet.timeToImpact);
    const distance = Number(bullet.distance);
    return (switchTime > 0 && Number.isFinite(time) && time <= switchTime / 2)
      || (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance / 2);
  });
  return {
    targetId: targetIdValueString,
    bulletCount: matching.length,
    urgentBulletCount: urgent.length,
    urgent: urgent.length > 0,
    riskLevel: critical ? 3 : (urgent.length ? 2 : (matching.length ? 1 : 0)),
    minTimeToImpactMs,
    minDistanceCm
  };
}

function combatTargetThreatAdvantageCore(currentThreat = {}, proposedThreat = {}, options = {}) {
  const proposedLevel = Math.max(0, Number(proposedThreat.riskLevel || 0));
  const currentLevel = Math.max(0, Number(currentThreat.riskLevel || 0));
  const finiteAdvantage = (currentValue, proposedValue) => {
    if (currentValue === null || currentValue === undefined
      || proposedValue === null || proposedValue === undefined) return null;
    const current = Number(currentValue);
    const proposed = Number(proposedValue);
    return Number.isFinite(current) && Number.isFinite(proposed) ? current - proposed : null;
  };
  const ttiAdvantageMs = finiteAdvantage(
    currentThreat.minTimeToImpactMs,
    proposedThreat.minTimeToImpactMs
  );
  const distanceAdvantageCm = finiteAdvantage(
    currentThreat.minDistanceCm,
    proposedThreat.minDistanceCm
  );
  const requiredTtiAdvantageMs = Math.max(0, Number(options.threatTtiAdvantageMs ?? 250));
  const requiredDistanceAdvantageCm = Math.max(0, Number(options.threatDistanceAdvantageCm ?? 1500));
  const significant = proposedThreat.urgent === true && (
    proposedLevel > currentLevel
      || (proposedLevel === currentLevel && (
        (ttiAdvantageMs !== null && ttiAdvantageMs >= requiredTtiAdvantageMs)
          || (distanceAdvantageCm !== null && distanceAdvantageCm >= requiredDistanceAdvantageCm)
      ))
  );
  return {
    significant,
    riskLevelDifference: proposedLevel - currentLevel,
    timeToImpactAdvantageMs: ttiAdvantageMs,
    distanceAdvantageCm,
    requiredTtiAdvantageMs,
    requiredDistanceAdvantageCm
  };
}

function applyCombatTargetSwitchHysteresisCore(input = {}, previousGate = null, options = {}) {
  const currentId = String(input.currentTargetId || '');
  const proposedId = combatTargetId(input.proposedTarget);
  const ordinaryRequiredTicks = Math.max(1, Math.round(Number(options.confirmTicks ?? 3)));
  const urgentRequiredTicks = Math.max(1, Math.round(Number(options.urgentConfirmTicks ?? ordinaryRequiredTicks)));
  const oscillationWindowMs = Math.max(1000, Number(options.oscillationWindowMs ?? 10000));
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  if (!currentId) {
    return {
      target: input.proposedTarget || null,
      gate: null,
      diagnostic: null
    };
  }
  if (input.currentInvalid === true) {
    return {
      target: input.proposedTarget || null,
      gate: null,
      diagnostic: proposedId && currentId && proposedId !== currentId ? {
        fromTargetId: currentId,
        toTargetId: proposedId,
        allowed: true,
        reason: 'current-target-invalid',
        confirmationTicks: 0,
        observedTicks: 0,
        stickAgeMs: Math.max(0, Number(input.currentStickAgeMs || 0))
      } : null
    };
  }
  if (!input.proposedTarget) {
    return {
      target: input.currentVisibleTarget || null,
      gate: null,
      diagnostic: null
    };
  }
  if (currentId === proposedId) {
    return {
      target: input.proposedTarget || input.currentVisibleTarget || null,
      gate: null,
      diagnostic: null
    };
  }
  const urgentRequested = input.urgentSafety === true;
  const requiredTtiAdvantageMs = Math.max(0, Number(options.threatTtiAdvantageMs ?? 250));
  const requiredDistanceAdvantageCm = Math.max(0, Number(options.threatDistanceAdvantageCm ?? 1500));
  const threatAdvantage = combatTargetThreatAdvantageCore(
    input.currentThreat || {},
    input.proposedThreat || {},
    options
  );
  if (urgentRequested && !threatAdvantage.significant) {
    return {
      target: input.currentVisibleTarget || null,
      gate: null,
      diagnostic: {
        fromTargetId: currentId,
        toTargetId: proposedId,
        allowed: false,
        reason: 'urgent-incoming-threat-not-superior',
        confirmationTicks: urgentRequiredTicks,
        observedTicks: 0,
        currentThreat: input.currentThreat || null,
        proposedThreat: input.proposedThreat || null,
        threatDifference: threatAdvantage,
        stickAgeMs: Math.max(0, Number(input.currentStickAgeMs || 0))
      }
    };
  }
  const lastSwitch = input.lastSwitch && typeof input.lastSwitch === 'object' ? input.lastSwitch : null;
  const reversalBlocked = Boolean(
    lastSwitch
      && String(lastSwitch.fromTargetId || '') === proposedId
      && String(lastSwitch.toTargetId || '') === currentId
      && nowMs - Number(lastSwitch.at || 0) <= oscillationWindowMs
  );
  const urgentReversalTtiAdvantageMs = Math.max(
    requiredTtiAdvantageMs,
    Number(options.urgentReversalTtiAdvantageMs ?? 500)
  );
  const urgentReversalDistanceAdvantageCm = Math.max(
    requiredDistanceAdvantageCm,
    Number(options.urgentReversalDistanceAdvantageCm ?? 2500)
  );
  const urgentReversalAdvantage = Boolean(
    urgentRequested
      && input.proposedThreat?.urgent === true
      && (
        threatAdvantage.riskLevelDifference > 0
          || (threatAdvantage.timeToImpactAdvantageMs !== null
            && threatAdvantage.timeToImpactAdvantageMs >= urgentReversalTtiAdvantageMs)
          || (threatAdvantage.distanceAdvantageCm !== null
            && threatAdvantage.distanceAdvantageCm >= urgentReversalDistanceAdvantageCm)
          || Number(input.proposedThreat?.urgentBulletCount || 0)
            >= Number(input.currentThreat?.urgentBulletCount || 0) + 2
          || (input.currentTargetFinishable === false && input.proposedThreatDamageProgress === true)
      )
  );
  const urgentReversalGuardEnabled = options.urgentReversalGuardEnabled === true;
  const urgentReversalWouldBlock = reversalBlocked && urgentRequested && !urgentReversalAdvantage;
  const ordinaryReversalWouldBlock = reversalBlocked && !urgentRequested;
  if (ordinaryReversalWouldBlock || (urgentReversalGuardEnabled && urgentReversalWouldBlock)) {
    return {
      target: input.currentVisibleTarget || null,
      gate: null,
      diagnostic: {
        fromTargetId: currentId,
        toTargetId: proposedId,
        allowed: false,
        reason: urgentRequested
          ? 'urgent-oscillating-reversal-blocked'
          : 'oscillating-reversal-blocked',
        confirmationTicks: urgentRequested ? urgentRequiredTicks : ordinaryRequiredTicks,
        observedTicks: 0,
        holdRemainingMs: Math.max(0, oscillationWindowMs - (nowMs - Number(lastSwitch.at || 0))),
        reversalRemainingMs: Math.max(0, oscillationWindowMs - (nowMs - Number(lastSwitch.at || 0))),
        urgentReversalAdvantage,
        urgentReversalGuardEnabled,
        urgentReversalWouldBlock,
        urgentReversalTtiAdvantageMs,
        urgentReversalDistanceAdvantageCm,
        defensiveThreatOwnerId: input.defensiveThreatOwnerId ?? null,
        attackFocusTargetId: currentId,
        stickAgeMs: Math.max(0, Number(input.currentStickAgeMs || 0))
      }
    };
  }
  const switchMode = urgentRequested ? 'urgent' : 'ordinary';
  const requiredTicks = urgentRequested ? urgentRequiredTicks : ordinaryRequiredTicks;
  const sameCandidate = previousGate
    && String(previousGate.fromTargetId || '') === currentId
    && String(previousGate.toTargetId || '') === proposedId
    && String(previousGate.mode || 'ordinary') === switchMode;
  const observedTicks = sameCandidate ? Math.max(1, Number(previousGate.observedTicks || 0) + 1) : 1;
  const gate = {
    fromTargetId: currentId,
    toTargetId: proposedId,
    firstObservedAt: sameCandidate ? Number(previousGate.firstObservedAt || nowMs) : nowMs,
    lastObservedAt: nowMs,
    observedTicks,
    confirmationTicks: requiredTicks,
    mode: switchMode
  };
  const allowed = observedTicks >= requiredTicks;
  return {
    target: allowed ? input.proposedTarget : (input.currentVisibleTarget || null),
    gate: allowed ? null : gate,
    diagnostic: {
      ...gate,
      allowed,
      reason: urgentRequested
        ? (allowed ? 'urgent-incoming-shooter-confirmed' : 'urgent-incoming-shooter-awaiting-confirmation')
        : (allowed ? 'ordinary-switch-confirmed' : 'ordinary-switch-awaiting-confirmation'),
      currentThreat: input.currentThreat || null,
      proposedThreat: input.proposedThreat || null,
      threatDifference: threatAdvantage,
      urgentReversalAdvantage,
      urgentReversalGuardEnabled,
      urgentReversalWouldBlock,
      defensiveThreatOwnerId: input.defensiveThreatOwnerId ?? null,
      attackFocusTargetId: allowed ? proposedId : currentId,
      stickAgeMs: Math.max(0, Number(input.currentStickAgeMs || 0)),
      reversalRemainingMs: reversalBlocked
        ? Math.max(0, oscillationWindowMs - (nowMs - Number(lastSwitch.at || 0)))
        : 0
    }
  };
}

function pickEngagedCombatTargetCore(self, combatTargets = [], entities = [], bullets = [], state = {}, options = {}) {
  const engaged = state?.combatTarget || null;
  if (!engaged?.id) return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const closePressure = engaged.combatPhase === 'close-pressure'
    || engaged.closePressure?.active === true;
  const maxAgeMs = Math.max(
    Number(options.targetStickMs || 0),
    Number(options.combatEngageStickMs || 0)
  );
  const ageMs = Math.max(0, nowMs - Number(engaged.at || 0));
  const id = String(engaged.id);
  const target = (combatTargets || []).find(item => combatTargetId(item) === id);
  const raw = (entities || []).find(item => combatTargetId(item) === id);
  const visibleTarget = target || raw;
  const visibleHp = visibleTarget?.hp ?? visibleTarget?.knownHp ?? visibleTarget?.displayHp;
  const visibleTargetDead = visibleTarget?.alive === false
    || (visibleHp !== null && visibleHp !== undefined && visibleHp !== '' && Number(visibleHp) === 0);
  const incoming = Object.prototype.hasOwnProperty.call(options, 'incomingBullet')
    ? options.incomingBullet
    : (Array.isArray(bullets) ? bullets.find(bullet => bullet?.incoming) : null);
  const contextIncomingBullet = incoming || null;
  const contextIncomingBulletOwnerId = incoming?.ownerId;
  const contextUnknownIncoming = Boolean(
    incoming && (incoming.ownerId === null || incoming.ownerId === undefined)
  );
  // Browserless combat already installs these four frame-local fields on its
  // mutable option object before entering this shared selector. Reuse that
  // object in the hot path; retain the original full-copy behavior for direct
  // callers that have not supplied the frame context.
  const context = options?.bullets === bullets
    && options?.incomingBullet === contextIncomingBullet
    && options?.incomingBulletOwnerId === contextIncomingBulletOwnerId
    && options?.unknownIncoming === contextUnknownIncoming
    ? options
    : {
        ...options,
        bullets,
        incomingBullet: contextIncomingBullet,
        incomingBulletOwnerId: contextIncomingBulletOwnerId,
        unknownIncoming: contextUnknownIncoming
      };
  if (visibleTarget && dynamicWhitelistDistanceGuardBlocksCombatCore(visibleTarget, {
    incomingOverride: incomingOwnerMatchesTarget(visibleTarget, context),
    recentInjury: recentInjuryMatchesTarget(visibleTarget, context)
  })) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
  }
  // Once low-efficiency close pressure starts, keep using the realtime-visible
  // target for the bounded distance-control window. Releasing it at the old
  // disengage radius would prevent both the required close attempt and its
  // stop-loss assessment.
  if (closePressure && visibleTarget && !isInvulnerableEntity(visibleTarget)
    && !visibleTargetDead
    && !(typeof options.whitelistCheck === 'function'
      && options.whitelistCheck(visibleTarget)
      && !visibleTarget.dynamicWhitelistMember
      && !visibleTarget.whitelistContactPolicy?.dynamicWhitelistMember)) {
    const distance = Number(visibleTarget.distance);
    const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || 0));
    const lastInRangeAt = Number(engaged.lastInRangeAt || engaged.at || 0);
    const outOfRangeMs = Math.max(0, nowMs - lastInRangeAt);
    return {
      ...visibleTarget,
      combatIntent: 'reengage',
      combatEngagement: {
        ageMs: Math.round(ageMs),
        outOfRangeMs: Number.isFinite(distance) && attackRange > 0 && distance > attackRange
          ? Math.round(outOfRangeMs)
          : 0,
        graceRemainingMs: null,
        graceRange: null,
        activeReengage: Boolean(isActiveCombatMode(visibleTarget)
          || isFiringCombatEntity(visibleTarget)
          || visibleTarget.moving),
        outOfRangeLimitMs: null,
        closePressureHold: true,
        distanceControlBeyondLegacyDisengage: Boolean(
          Number.isFinite(distance)
            && distance > Math.max(attackRange, Number(options.combatDisengageRange || 0))
        ),
        edgePressure: null,
        escapeDecision: engaged.escapeDecision || null,
        escapeHold: false,
        lastReason: engaged.reason || '',
        realtimeHold: false,
        reengage: true
      }
    };
  }
  if (maxAgeMs > 0 && ageMs > maxAgeMs) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
  }
  if (target && !isInvulnerableEntity(target) && isCombatEligibleThreat(target, context)) {
    return {
      ...target,
      combatIntent: 'engaged',
      combatEngagement: {
        ageMs: Math.round(ageMs),
        outOfRangeMs: 0,
        lastReason: engaged.reason || '',
        lastInRangeAt: Number(engaged.lastInRangeAt || engaged.at || 0)
      }
    };
  }
  // `raw` is the same stable-ID realtime entity looked up above. Keep the
  // ordinary grace/escape policy below for engagements that have not entered
  // close pressure.
  if (!raw || isInvulnerableEntity(raw)) return null;
  const distance = Number(raw.distance);
  const attackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || 0));
  const graceRange = Math.max(
    attackRange,
    Number(options.combatDisengageRange || 0),
    Number(options.combatEngageGraceRange || 0)
  );
  const lastInRangeAt = Number(engaged.lastInRangeAt || engaged.at || 0);
  const outOfRangeMs = Math.max(0, nowMs - lastInRangeAt);
  const graceMs = Math.max(0, Number(options.combatEngageGraceMs || 0));
  const escapeDecision = combatEscapeDecisionCore(self, raw, engaged, {
    ...options,
    nowMs
  });
  const edgePressure = combatEdgePressureDecisionCore(self, raw, engaged, escapeDecision, {
    ...options,
    nowMs
  });
  const activeReengage = Boolean(isActiveCombatMode(raw) || isFiringCombatEntity(raw) || raw.moving);
  const ordinaryOutOfRangeLimitMs = activeReengage
    ? Math.max(graceMs, Number(options.combatEngageStickMs || 0))
    : graceMs;
  const escapeHoldMs = Math.max(0, Number(options.combatEscapeHoldMs ?? 1500));
  const escapeHold = Boolean(
    escapeDecision.confirmed
      && Number.isFinite(distance)
      && attackRange > 0
      && distance > attackRange
      && !isFiringCombatEntity(raw)
      && !incomingOwnerMatchesTarget(raw, context)
  );
  const outOfRangeLimitMs = escapeHold
    ? Math.min(ordinaryOutOfRangeLimitMs || escapeHoldMs, escapeHoldMs)
    : ordinaryOutOfRangeLimitMs;
  if (!outOfRangeLimitMs || outOfRangeMs > outOfRangeLimitMs || (Number.isFinite(distance) && graceRange > 0 && distance > graceRange)) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
  }
  const afkProfitSeed = String(engaged.originIntent || '') === 'afk-profit';
  const engagedRealtimeHold = Number.isFinite(distance)
    && attackRange > 0
    && distance <= attackRange
    && maxAgeMs > 0
    && ageMs <= maxAgeMs
    // A successful AFK-profit shot seeds combat state only so later realtime
    // activity can hand the same target to combat. The seed itself must not
    // turn a stationary Passive target into combat spacing, which would stop
    // the dedicated AFK approach before its 10m hold radius.
    && (!afkProfitSeed || activeReengage);
  const establishedEasyKillProfitHold = Boolean(
    raw.easyKillProfitTarget === true
      && raw.easyKillThreatExempt === true
      && ['profit', 'engaged', 'reengage'].includes(String(engaged.originIntent || engaged.intent || ''))
  );
  if (!isCombatEligibleThreat(raw, context) && !engagedRealtimeHold && !establishedEasyKillProfitHold) {
    if (!edgePressure.active && !escapeHold) {
      if (state && typeof state === 'object') state.combatTarget = null;
      return null;
    }
  }
  return {
    ...raw,
    combatIntent: engagedRealtimeHold ? 'engaged' : 'reengage',
    combatEngagement: {
      ageMs: Math.round(ageMs),
      outOfRangeMs: Math.round(outOfRangeMs),
      graceRemainingMs: Math.max(0, Math.round(outOfRangeLimitMs - outOfRangeMs)),
      graceRange: Math.round(graceRange),
      activeReengage,
      outOfRangeLimitMs: Math.round(outOfRangeLimitMs),
      edgePressure,
      escapeDecision,
      escapeHold,
      lastReason: engaged.reason || '',
      realtimeHold: engagedRealtimeHold,
      reengage: true
    }
  };
}

/**
 * Check if entity is idle invulnerable (stationary, no activity)
 */
function isIdleInvulnerable(entity) {
  if (!entity || !isInvulnerableEntity(entity)) return false;

  // Idle means: no movement, no firing, full stamina, no recent activity
  const noMovement = !entity.moving && (!entity.speed || entity.speed < 100);
  const noFiring = !entity.firing;
  const fullStamina = entity.stamina_5s_remaining_milli >= 9900 ||
                      entity.stamina_5s_remaining_milli === 10000;
  const noRecentActivity = !entity.recentActivityCooldown || entity.recentActivityCooldown <= 0;

  return noMovement && noFiring && fullStamina && noRecentActivity;
}

module.exports = {
  combatEdgePressureDecisionCore,
  combatEscapeDecisionCore,
  isCombatEligibleThreat,
  isInvulnerableEntity,
  calculateCombatTargetPriority,
  checkProactiveActiveCombatGates,
  combatTargetThreatensSelf,
  combatTargetId,
  combatTargetIncomingThreatEvidenceCore,
  combatTargetThreatAdvantageCore,
  applyCombatTargetSwitchHysteresisCore,
  defensiveTargetOverridesEngagedCore,
  incomingBulletHasCollisionRiskCore,
  incomingBulletRequiresTargetSwitchCore,
  isActiveCombatMode,
  isFiringCombatEntity,
  pickEngagedCombatTargetCore,
  proactiveActiveCombatImmediateStaminaBlocked,
  recentAfkAttackCommitmentCore,
  selectBestCombatTarget,
  isIdleInvulnerable
};
