'use strict';

const { COMBAT_CONSTANTS } = require('./combat-constants');

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

function combatTargetId(entity) {
  return targetId(entity);
}

function incomingOwnerMatchesTarget(entity, context = {}) {
  const ownerId = context.incomingBulletOwnerId ?? context.incomingOwnerId ?? context.incomingBullet?.ownerId;
  if (ownerId === null || ownerId === undefined) return false;
  const id = targetId(entity);
  return id !== '' && String(ownerId) === id;
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

function activeCombatRequiresThreatEvidence(entity, context = {}) {
  if (!isActiveCombatMode(entity)) return false;
  return combatDropValue(entity) <= lowValueActiveDropMax(context) || proactiveActiveCombatBudgetBlocked(context);
}

function combatTargetThreatensSelf(entity, context = {}) {
  if (incomingOwnerMatchesTarget(entity, context)) return true;
  if (recentInjuryMatchesTarget(entity, context)) return true;
  if (context.unknownIncoming && isActiveCombatMode(entity) && isFiringCombatEntity(entity)) return true;
  return isFiringCombatEntity(entity);
}

function isCombatEligibleThreat(entity, options = {}) {
  if (!entity) return false;

  // Invulnerable targets are not combat eligible
  if (isInvulnerableEntity(entity)) return false;

  // Whitelisted targets are protected
  if (options.whitelistCheck && options.whitelistCheck(entity)) return false;

  if (incomingOwnerMatchesTarget(entity, options) || recentInjuryMatchesTarget(entity, options)) return true;

  // Match the browser runtime's split between defensive/proactive Active combat
  // and ordinary Passive/AFK profit. Moving or Drop value alone should not make
  // a Passive target a combat target; those belong to profit arbitration.
  if (isActiveCombatMode(entity)) {
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
      incomingBullet: context.incomingBullet || null,
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
    combatIntent: combatTargetThreatensSelf(scored[0].target, context) ? 'defensive' : 'profit'
  };
}

function incomingBulletRequiresTargetSwitchCore(incomingBullet, options = {}) {
  if (!incomingBullet) return false;
  const distance = Number(incomingBullet.distance);
  const timeToImpactMs = Number(incomingBullet.timeToImpactMs ?? incomingBullet.timeToImpact);
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

function pickEngagedCombatTargetCore(self, combatTargets = [], entities = [], bullets = [], state = {}, options = {}) {
  const engaged = state?.combatTarget || null;
  if (!engaged?.id) return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const maxAgeMs = Math.max(
    Number(options.targetStickMs || 0),
    Number(options.combatEngageStickMs || 0)
  );
  const ageMs = Math.max(0, nowMs - Number(engaged.at || 0));
  if (maxAgeMs > 0 && ageMs > maxAgeMs) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
  }
  const id = String(engaged.id);
  const target = (combatTargets || []).find(item => combatTargetId(item) === id);
  const incoming = Array.isArray(bullets)
    ? bullets.find(bullet => bullet?.incoming)
    : null;
  const context = {
    ...options,
    incomingBullet: incoming || null,
    incomingBulletOwnerId: incoming?.ownerId,
    unknownIncoming: Boolean(incoming && (incoming.ownerId === null || incoming.ownerId === undefined))
  };
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
  const raw = (entities || []).find(item => combatTargetId(item) === id);
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
  const activeReengage = Boolean(isActiveCombatMode(raw) || isFiringCombatEntity(raw) || raw.moving);
  const outOfRangeLimitMs = activeReengage
    ? Math.max(graceMs, Number(options.combatEngageStickMs || 0))
    : graceMs;
  if (!outOfRangeLimitMs || outOfRangeMs > outOfRangeLimitMs || (Number.isFinite(distance) && graceRange > 0 && distance > graceRange)) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
  }
  const engagedRealtimeHold = Number.isFinite(distance)
    && attackRange > 0
    && distance <= attackRange
    && maxAgeMs > 0
    && ageMs <= maxAgeMs;
  if (!isCombatEligibleThreat(raw, context) && !engagedRealtimeHold) {
    if (state && typeof state === 'object') state.combatTarget = null;
    return null;
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
  isCombatEligibleThreat,
  isInvulnerableEntity,
  calculateCombatTargetPriority,
  checkProactiveActiveCombatGates,
  combatTargetId,
  defensiveTargetOverridesEngagedCore,
  incomingBulletRequiresTargetSwitchCore,
  isActiveCombatMode,
  isFiringCombatEntity,
  pickEngagedCombatTargetCore,
  selectBestCombatTarget,
  isIdleInvulnerable
};
