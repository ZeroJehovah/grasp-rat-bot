'use strict';

function entityActivitySource() {
  return String.raw`	  const hypot = Math.hypot;
  const now = () => performance.now();
  const dist = (a, b) => hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const speed = e => hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const anyPositiveNumber = (...values) => values.some(value => Number(value) > 0);
  const isInvulnerable = e => anyPositiveNumber(
      e?.invulnerable_remaining_ticks,
      e?.invincible_remaining_ticks,
      e?.invulnerability_remaining_ticks,
      e?.invulnerableTicks,
      e?.invulnerableRemainingTicks,
      e?.invincibleRemainingTicks,
      e?.invulnerabilityRemainingTicks,
      e?.invulnerable_ticks,
      e?.invincible_ticks,
      e?.invulnerability_ticks,
      e?.invulnerable_remaining_ms,
      e?.invincible_remaining_ms,
      e?.invulnerability_remaining_ms,
      e?.invulnerableRemainingMs,
      e?.invincibleRemainingMs,
      e?.invulnerabilityRemainingMs,
      e?.invulnerable_ms,
      e?.invincible_ms,
      e?.invulnerability_ms,
      e?.immune_remaining_ms,
      e?.immuneRemainingMs,
      e?.invulnerable_remaining,
      e?.invincible_remaining,
      e?.invulnerability_remaining,
      e?.invulnerableRemaining,
      e?.invincibleRemaining,
      e?.invulnerabilityRemaining
    )
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaLimitValue = (e, windowName, fallback) => {
    const value = Number(e?.['stamina_' + windowName + '_limit_milli'] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const isStaminaWindowExhausted = (e, windowName) => {
    const value = staminaRemaining(e, windowName);
    return value !== null && value < staminaExhaustedThreshold();
  };
  const combatMovementBlockedByStamina = self => isStaminaWindowExhausted(self, '5s');
  const hasLongWindowStamina = e => !isStaminaWindowExhausted(e, '1h') && !isStaminaWindowExhausted(e, '1d');
  const hasMoveStamina = e => Number(e?.stamina_5s_remaining_milli || 0) > 250 && hasLongWindowStamina(e);
  const hasAttackStamina = e => Number(e?.stamina_5s_remaining_milli || 0) >= cfg.attackMinStamina && hasLongWindowStamina(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  const isMovingThreat = e => speed(e) >= cfg.activeSpeedMin || Boolean(e.recentlyMoved);
  const isCurrentlyActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const hasCombatActivitySignal = e => isCurrentlyActive(e)
    || truthyFlag(e?.active)
    || truthyFlag(e?.currentlyActive)
    || truthyFlag(e?.combat)
    || truthyFlag(e?.engagedCombat)
    || String(e?.combatIntent || '') === 'engaged';
  function entityRecentActivityAgeMs(e) {
    const value = Number(e?.recentActivityAgeMs ?? e?.activityAgeMs ?? e?.motionAgeMs ?? NaN);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function recentlyActionedForAfk(e) {
    const cooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
    if (!(cooldownMs > 0)) return false;
    const ageMs = entityRecentActivityAgeMs(e);
    return Boolean(e?.recentlyActive || (ageMs !== null && ageMs <= cooldownMs));
  }
  function isIdleInvulnerableTarget(e) {
    return Boolean(isInvulnerable(e)
      && !isMovingThreat(e)
      && !isFiringEntity(e)
      && hasFullStamina(e)
      && !recentlyActionedForAfk(e));
  }
  const isAvoidanceThreat = e => isInvulnerable(e) && !isIdleInvulnerableTarget(e);
  const isAfkTarget = e => !recentlyActionedForAfk(e) && !isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => !recentlyActionedForAfk(e) && (isAfkTarget(e) || (isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e) && !isFiringEntity(e)));`;
}

module.exports = {
  entityActivitySource
};
