'use strict';

const {
  calculateCombatTargetPriority,
  isCombatEligibleThreat,
  selectBestCombatTarget
} = require('../../strategy/combat-target-selection');
const {
  applyCombatMovementModifiers,
  calculateCombatSpacing,
  calculateDodgeDirection,
  shouldBackAwayFromTarget
} = require('../../strategy/combat-movement');
const {
  checkLowConfidenceThrottle,
  determineCombatFireState
} = require('../../strategy/combat-fire-discipline');
const { COMBAT_CONSTANTS } = require('../../strategy/combat-constants');

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceBetween(a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function entityDropValue(entity) {
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? 0) || 0;
}

function isActiveCombatEntity(entity) {
  const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
  return mode === 'active';
}

function normalizeCombatEntity(entity, self = null) {
  if (!entity || typeof entity !== 'object') return null;
  const vx = numberOrNull(entity.vx);
  const vy = numberOrNull(entity.vy);
  const speed = numberOrNull(entity.speed ?? entity.speed_per_tick ?? entity.speedPerTick);
  const normalized = {
    ...cloneJson(entity),
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entity.name || '',
    x: numberOrNull(entity.x),
    y: numberOrNull(entity.y),
    vx,
    vy,
    speed,
    moving: Boolean(entity.moving || Math.hypot(Number(vx || 0), Number(vy || 0)) > 0 || Number(speed || 0) > 0),
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
    active: isActiveCombatEntity(entity),
    firing: Boolean(entity.firing || entity.is_firing || entity.shooting),
    authority: 'realtime'
  };
  normalized.distance = self ? distanceBetween(self, normalized) : numberOrNull(entity.distance);
  return normalized;
}

function bulletOwnerId(bullet) {
  return bullet?.owner_user_id ?? bullet?.ownerUserId ?? bullet?.owner_id ?? bullet?.ownerId ?? bullet?.user_id ?? bullet?.userId ?? null;
}

function bulletDirection(bullet, startX, startY, targetX, targetY) {
  const microsX = numberOrNull(bullet?.dir_x_micros ?? bullet?.dirXMicros);
  const microsY = numberOrNull(bullet?.dir_y_micros ?? bullet?.dirYMicros);
  if (microsX !== null || microsY !== null) {
    const dx = Number(microsX || 0) / 1000000;
    const dy = Number(microsY || 0) / 1000000;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { dx: dx / length, dy: dy / length };
  }
  if ([startX, startY, targetX, targetY].every(value => value !== null)) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { dx: dx / length, dy: dy / length };
  }
  return { dx: 0, dy: 0 };
}

function estimateBulletKinematics(bullet, self, options = {}) {
  const startX = numberOrNull(bullet.start_x ?? bullet.startX ?? bullet.x);
  const startY = numberOrNull(bullet.start_y ?? bullet.startY ?? bullet.y);
  const targetX = numberOrNull(bullet.target_x ?? bullet.targetX ?? bullet.aim_x ?? bullet.aimX);
  const targetY = numberOrNull(bullet.target_y ?? bullet.targetY ?? bullet.aim_y ?? bullet.aimY);
  const speedValue = numberOrNull(bullet.speed_per_tick ?? bullet.speedPerTick ?? bullet.speed);
  const speed = Math.max(0, Number(speedValue ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const direction = bulletDirection(bullet, startX, startY, targetX, targetY);
  const currentTick = numberOrNull(options.currentTick);
  const createdTick = numberOrNull(bullet.created_tick ?? bullet.createdTick);
  const expireTick = numberOrNull(bullet.expire_tick ?? bullet.expireTick);
  const ageTicks = currentTick !== null && createdTick !== null ? Math.max(0, currentTick - createdTick) : 0;
  const projectedX = startX !== null ? startX + direction.dx * speed * ageTicks : null;
  const projectedY = startY !== null ? startY + direction.dy * speed * ageTicks : null;
  const x = numberOrNull(bullet.x ?? projectedX ?? startX);
  const y = numberOrNull(bullet.y ?? projectedY ?? startY);
  let distance = self && x !== null && y !== null ? distanceBetween(self, { x, y }) : numberOrNull(bullet.distance);
  let cpa = numberOrNull(bullet.cpa);
  let timeToImpact = numberOrNull(bullet.timeToImpact ?? bullet.time_to_impact_ms);
  if (self && x !== null && y !== null && speed > 0 && (direction.dx || direction.dy)) {
    const relX = Number(self.x) - x;
    const relY = Number(self.y) - y;
    const closestTicks = (relX * direction.dx + relY * direction.dy) / speed;
    if (closestTicks > 0) {
      const closestX = x + direction.dx * speed * closestTicks;
      const closestY = y + direction.dy * speed * closestTicks;
      cpa = distanceBetween(self, { x: closestX, y: closestY });
      timeToImpact = Math.round(closestTicks * 50);
    }
  }
  if (!Number.isFinite(distance)) distance = null;
  return {
    startX,
    startY,
    targetX,
    targetY,
    x,
    y,
    distance,
    speed,
    direction,
    cpa,
    timeToImpact,
    createdTick,
    expireTick
  };
}

function normalizeCombatBullet(bullet, self = null, options = {}) {
  if (!bullet || typeof bullet !== 'object') return null;
  const kinematics = estimateBulletKinematics(bullet, self, options);
  const ownerId = bulletOwnerId(bullet);
  return {
    ...cloneJson(bullet),
    ownerId: ownerId === null || ownerId === undefined ? null : Number(ownerId),
    startX: kinematics.startX,
    startY: kinematics.startY,
    targetX: kinematics.targetX,
    targetY: kinematics.targetY,
    x: kinematics.x,
    y: kinematics.y,
    distance: kinematics.distance,
    speed: kinematics.speed,
    direction: kinematics.direction,
    cpa: kinematics.cpa,
    timeToImpact: kinematics.timeToImpact,
    createdTick: kinematics.createdTick,
    expireTick: kinematics.expireTick,
    incoming: Boolean(self && ownerId !== null && Number(ownerId) !== Number(self.user_id)),
    authority: 'realtime'
  };
}

function summarizeCombatTarget(target) {
  if (!target) return null;
  return {
    userId: numberOrNull(target.user_id),
    entityId: numberOrNull(target.entity_id),
    name: target.name || '',
    authority: target.authority || 'realtime',
    x: numberOrNull(target.x),
    y: numberOrNull(target.y),
    vx: numberOrNull(target.vx),
    vy: numberOrNull(target.vy),
    hp: numberOrNull(target.hp),
    drop: entityDropValue(target),
    active: Boolean(target.active || isActiveCombatEntity(target)),
    firing: Boolean(target.firing || target.is_firing || target.shooting),
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null
  };
}

function estimateAim(self, target, options = {}) {
  if (!self || !target) return { ok: false, reason: 'missing-self-or-target' };
  const distance = distanceBetween(self, target);
  const tx = numberOrNull(target.x);
  const ty = numberOrNull(target.y);
  if (tx === null || ty === null || !Number.isFinite(distance)) {
    return { ok: false, reason: 'missing-target-position' };
  }
  const vx = Number(target.vx || 0);
  const vy = Number(target.vy || 0);
  const speed = Number(target.speed ?? Math.hypot(vx, vy));
  const bulletSpeed = Math.max(1, Number(options.bulletSpeedCmPerTick || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const renderDelayTicks = Math.max(0, Number(options.renderDelayTicks ?? COMBAT_CONSTANTS.RENDER_DELAY_TICKS));
  const flightTicks = Math.max(0, distance / bulletSpeed);
  const leadTicks = flightTicks + renderDelayTicks;
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? 50));
  const moving = Boolean(target.moving || speed > stationarySpeed || Math.hypot(vx, vy) > stationarySpeed);
  const x = moving ? tx + vx * leadTicks : tx;
  const y = moving ? ty + vy * leadTicks : ty;
  const leadDistance = distanceBetween({ x: tx, y: ty }, { x, y });
  const confidence = Math.max(0.2, Math.min(1, moving ? 0.7 : 1));
  return {
    ok: true,
    x: Math.round(x),
    y: Math.round(y),
    mode: moving ? 'linear-intercept' : 'exact',
    distance: Math.round(distance),
    intercept: moving,
    flightTicks: Math.round(flightTicks * 10) / 10,
    leadDistance: Math.round(leadDistance),
    confidence
  };
}

function buildCombatMovementPlan(self, target, bullets = [], options = {}) {
  if (!self || !target) return { dx: 0, dy: 0, reason: 'missing-target', spacing: null, dodge: null, modifiers: [] };
  const spacing = calculateCombatSpacing(self, target, {});
  const dodge = calculateDodgeDirection(self, bullets, {});
  const backAway = shouldBackAwayFromTarget(self, target);
  const closeIn = Number(target.distance || Infinity) > spacing;
  const base = { dx: 0, dy: 0 };
  const movement = applyCombatMovementModifiers(base, self, target, { dodge, backAway, closeIn });
  const reason = movement.modifiers.includes('dodge')
    ? dodge.reason
    : (movement.modifiers.includes('back-away') || movement.modifiers.includes('back-away-mixed') ? 'back-away' : (movement.modifiers.includes('close-in') ? 'close-in' : 'hold-spacing'));
  return {
    dx: Number(movement.dx || 0),
    dy: Number(movement.dy || 0),
    reason,
    spacing: Math.round(spacing),
    dodge: dodge ? { dx: dodge.dx, dy: dodge.dy, reason: dodge.reason } : null,
    modifiers: movement.modifiers || []
  };
}

function buildBrowserlessCombatDryRun(state = {}, options = {}) {
  const realtime = state?.realtime || {};
  const dataGaps = [];
  const liveCombatEnabled = options.liveCombatEnabled === true || options.combatEnabled === true;
  const self = normalizeCombatEntity(realtime.self, null);
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const entities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => normalizeCombatEntity(entity, self))
    .filter(Boolean);
  const targets = entities.filter(entity => Number(entity.user_id) !== selfUserId);
  const bullets = (Array.isArray(realtime.bullets) ? realtime.bullets : [])
    .map(bullet => normalizeCombatBullet(bullet, self, { currentTick: realtime.tick }))
    .filter(Boolean);
  if (!bullets.length) dataGaps.push('no-realtime-bullet-evidence');
  const context = {
    userId: selfUserId,
    bullets,
    whitelistCheck: typeof options.whitelistCheck === 'function' ? options.whitelistCheck : () => false
  };
  const candidates = targets
    .filter(target => isCombatEligibleThreat(target, context))
    .map(target => ({
      ...target,
      combatScore: calculateCombatTargetPriority(self, target, context)
    }))
    .sort((a, b) => Number(b.combatScore || 0) - Number(a.combatScore || 0));
  const target = selectBestCombatTarget(self, candidates, context);
  const aim = estimateAim(self, target, options);
  if (!aim.ok) dataGaps.push(aim.reason);
  const movement = buildCombatMovementPlan(self, target, bullets, options);
  const fireState = target ? determineCombatFireState(self || {}, target, {
    targetPressureFire: bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id))
  }) : { state: 'disabled', cadenceMs: Infinity, reserve: null, reason: 'no-target' };
  const lowConfidence = aim.ok ? checkLowConfidenceThrottle({ confidence: aim.confidence, distance: aim.distance }) : { throttle: false, cadenceMs: null };
  const inRange = target ? Number(target.distance || Infinity) <= Number(options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE) : false;
  const wouldShoot = Boolean(target && aim.ok && inRange && fireState.state !== 'disabled' && fireState.state !== 'paused');
  const commandSuppressed = Boolean(!liveCombatEnabled || !wouldShoot);
  return {
    ok: Boolean(self),
    dryRun: !liveCombatEnabled,
    liveEnabled: liveCombatEnabled,
    authority: 'realtime',
    tick: realtime.tick ?? null,
    self: summarizeCombatTarget(self),
    target: summarizeCombatTarget(target),
    candidates: candidates.slice(0, 5).map(summarizeCombatTarget),
    movement,
    aim: aim.ok ? aim : null,
    shooting: {
      dryRunOnly: !liveCombatEnabled,
      wouldShoot,
      commandSuppressed,
      inRange,
      state: fireState.state,
      reason: fireState.reason,
      cadenceMs: Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null,
      reserve: numberOrNull(fireState.reserve),
      lowConfidenceThrottle: Boolean(lowConfidence.throttle),
      effectiveCadenceMs: Number.isFinite(Number(lowConfidence.cadenceMs)) && lowConfidence.throttle ? Number(lowConfidence.cadenceMs) : (Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null)
    },
    dataGaps
  };
}

module.exports = {
  buildBrowserlessCombatDryRun,
  buildCombatMovementPlan,
  estimateAim,
  normalizeCombatBullet,
  normalizeCombatEntity,
  summarizeCombatTarget
};
