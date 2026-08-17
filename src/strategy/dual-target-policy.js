'use strict';

const DEFAULT_SECONDARY_WINDOW_MS = 5000;
const DEFAULT_SECONDARY_BASE_CADENCE_MS = 600;
const DEFAULT_SECONDARY_MAX_CADENCE_MS = 3000;
const DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS = 250;

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
  const secondary = whitelisted || Boolean(primaryId && targetId && primaryId !== targetId);
  return {
    role: secondary ? 'secondary' : (primaryId && targetId && primaryId === targetId ? 'primary' : 'single'),
    primaryTargetId: primaryId,
    targetId,
    secondaryTarget: secondary,
    whitelisted,
    sameAsProfitMission: Boolean(primaryId && targetId && primaryId === targetId)
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
  return {
    secondary,
    healthy,
    targetSource: target ? 'current' : (retainedMatch ? 'retained-phase-match' : 'none'),
    targetId: idOf(effectiveTarget),
    retainedMatch,
    suppressClearHpGap: healthy,
    suppressMissCloseTimeout: healthy,
    suppressExchangeStopLoss: healthy,
    preserveLowHpExits: secondary && Number.isFinite(hp) && hp <= 50
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
  const primaryCanAttack = input.primaryCanAttack === true;
  const invulnerable = input.invulnerable === true || target.invulnerable === true;
  const allowed = !invulnerable && !primaryCanAttack && quotaAvailable && cadenceReady;
  return {
    allowed,
    invulnerable,
    primaryCanAttack,
    ownShots,
    opponentShots,
    windowMs,
    cadenceMs,
    cadenceReady,
    quotaAvailable,
    reason: invulnerable
      ? 'secondary-invulnerable-dodge-only'
      : primaryCanAttack
        ? 'primary-target-fire-available'
        : !quotaAvailable
          ? 'secondary-five-second-shot-quota'
          : !cadenceReady ? 'secondary-cadence' : 'secondary-defensive-fire'
  };
}

module.exports = {
  DEFAULT_SECONDARY_BASE_CADENCE_MS,
  DEFAULT_SECONDARY_MAX_CADENCE_MS,
  DEFAULT_SECONDARY_NO_DAMAGE_STEP_MS,
  DEFAULT_SECONDARY_WINDOW_MS,
  classifyCombatTargetRole,
  idOf,
  isWhitelistTarget,
  missionTargetId,
  opponentShotCountInWindow,
  ownDispatchCountInWindow,
  secondaryCombatExitPolicy,
  secondaryCadenceMs,
  secondaryFirePolicy
};
