'use strict';

const {
  calculateCombatTargetPriority,
  combatTargetId,
  defensiveTargetOverridesEngagedCore,
  isCombatEligibleThreat,
  pickEngagedCombatTargetCore,
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
const { evaluateCombatHpExitCore } = require('../../strategy/combat-exit');
const { opponentMotionProfileCore, quadraticInterceptCore } = require('../../strategy/combat-aim');
const { targetIsWhitelisted, targetWhitelistNameSet } = require('../../shared/target-whitelist');

const DEFAULT_STAMINA_FULL_RATIO = 0.98;

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
  return Number(entity?.drop ?? entity?.Drop ?? entity?.reward ?? entity?.coin_reward ?? entity?.death_reward_preview ?? entity?.death_drop_coins ?? 0) || 0;
}

function targetWhitelistFromOptions(options = {}) {
  if (options.targetWhitelistNameSet instanceof Set) return options.targetWhitelistNameSet;
  if (options.targetWhitelist && typeof options.targetWhitelist === 'object') return options.targetWhitelist;
  if (Array.isArray(options.targetWhitelistNames)) return targetWhitelistNameSet(options.targetWhitelistNames, options.targetWhitelistMaxNames);
  return null;
}

function isWhitelistedTargetForOptions(entity, options = {}) {
  if (!entity) return false;
  if (entity.whitelisted === true) return true;
  if (typeof options.whitelistCheck === 'function' && options.whitelistCheck(entity)) return true;
  return targetIsWhitelisted(entity, targetWhitelistFromOptions(options));
}

function hpValue(entity) {
  const hp = Number(entity?.hp ?? entity?.knownHp ?? entity?.displayHp);
  return Number.isFinite(hp) ? hp : null;
}

function isActiveCombatEntity(entity) {
  const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
  return mode === 'active';
}

function combatHasFull5sStamina(stamina5s, stamina5sLimit, options = {}) {
  const remaining = Number(stamina5s);
  if (!Number.isFinite(remaining)) return false;
  const limitValue = Number(stamina5sLimit ?? 10000);
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 10000;
  const ratioValue = Number(options.staminaFullRatio ?? DEFAULT_STAMINA_FULL_RATIO);
  const ratio = Number.isFinite(ratioValue) && ratioValue >= 0 ? ratioValue : DEFAULT_STAMINA_FULL_RATIO;
  return remaining >= limit * ratio;
}

function combatEntityActive(entity, moving, firing, stamina5s, stamina5sLimit, options = {}) {
  if (entity && Object.prototype.hasOwnProperty.call(entity, 'active')) return Boolean(entity.active);
  return Boolean(moving || firing || (isActiveCombatEntity(entity) && !combatHasFull5sStamina(stamina5s, stamina5sLimit, options)));
}

function entityDisplayName(entity) {
  return String(entity?.name || entity?.label || entity?.username || entity?.user_name || entity?.displayName || entity?.display_name || '').trim();
}

function normalizeCombatEntity(entity, self = null, options = {}) {
  if (!entity || typeof entity !== 'object') return null;
  const vx = numberOrNull(entity.vx);
  const vy = numberOrNull(entity.vy);
  const speed = numberOrNull(entity.speed ?? entity.speed_per_tick ?? entity.speedPerTick);
  const stamina5s = numberOrNull(entity.stamina_5s_remaining_milli ?? entity.stamina5sRemainingMilli ?? entity.stamina5s ?? entity.stamina_5s);
  const stamina1h = numberOrNull(entity.stamina_1h_remaining_milli ?? entity.stamina1hRemainingMilli ?? entity.stamina1h ?? entity.stamina_1h);
  const stamina1d = numberOrNull(entity.stamina_1d_remaining_milli ?? entity.stamina1dRemainingMilli ?? entity.stamina1d ?? entity.stamina_1d);
  const stamina5sLimit = numberOrNull(entity.stamina_5s_limit_milli ?? entity.stamina5sLimitMilli ?? entity.stamina5sLimit);
  const stamina1hLimit = numberOrNull(entity.stamina_1h_limit_milli ?? entity.stamina1hLimitMilli ?? entity.stamina1hLimit);
  const stamina1dLimit = numberOrNull(entity.stamina_1d_limit_milli ?? entity.stamina1dLimitMilli ?? entity.stamina1dLimit);
  const moving = Boolean(entity.moving || Math.hypot(Number(vx || 0), Number(vy || 0)) > 0 || Number(speed || 0) > 0);
  const firing = Boolean(entity.firing || entity.is_firing || entity.shooting);
  const normalized = {
    ...cloneJson(entity),
    user_id: numberOrNull(entity.user_id),
    entity_id: numberOrNull(entity.entity_id),
    name: entityDisplayName(entity),
    x: numberOrNull(entity.x),
    y: numberOrNull(entity.y),
    vx,
    vy,
    speed,
    moving,
    hp: numberOrNull(entity.hp),
    max_hp: numberOrNull(entity.max_hp),
    drop: entityDropValue(entity),
    active: combatEntityActive(entity, moving, firing, stamina5s, stamina5sLimit, options),
    firing,
    authority: 'realtime'
  };
  if (stamina5s !== null) {
    normalized.stamina_5s_remaining_milli = stamina5s;
    normalized.stamina5sRemainingMilli = stamina5s;
  }
  if (stamina1h !== null) {
    normalized.stamina_1h_remaining_milli = stamina1h;
    normalized.stamina1hRemainingMilli = stamina1h;
  }
  if (stamina1d !== null) {
    normalized.stamina_1d_remaining_milli = stamina1d;
    normalized.stamina1dRemainingMilli = stamina1d;
  }
  if (stamina5sLimit !== null) {
    normalized.stamina_5s_limit_milli = stamina5sLimit;
    normalized.stamina5sLimitMilli = stamina5sLimit;
  }
  if (stamina1hLimit !== null) {
    normalized.stamina_1h_limit_milli = stamina1hLimit;
    normalized.stamina1hLimitMilli = stamina1hLimit;
  }
  if (stamina1dLimit !== null) {
    normalized.stamina_1d_limit_milli = stamina1dLimit;
    normalized.stamina1dLimitMilli = stamina1dLimit;
  }
  if (entity.staminaMetadataAuthority) normalized.staminaMetadataAuthority = entity.staminaMetadataAuthority;
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
    name: entityDisplayName(target),
    authority: target.authority || 'realtime',
    x: numberOrNull(target.x),
    y: numberOrNull(target.y),
    vx: numberOrNull(target.vx),
    vy: numberOrNull(target.vy),
    hp: numberOrNull(target.hp),
    maxHp: numberOrNull(target.max_hp ?? target.maxHp),
    drop: entityDropValue(target),
    stamina5s: numberOrNull(target.stamina_5s_remaining_milli ?? target.stamina5sRemainingMilli),
    stamina5sLimit: numberOrNull(target.stamina_5s_limit_milli ?? target.stamina5sLimitMilli),
    stamina1h: numberOrNull(target.stamina_1h_remaining_milli ?? target.stamina1hRemainingMilli),
    stamina1d: numberOrNull(target.stamina_1d_remaining_milli ?? target.stamina1dRemainingMilli),
    staminaMetadataAuthority: target.staminaMetadataAuthority || '',
    active: target && Object.prototype.hasOwnProperty.call(target, 'active')
      ? Boolean(target.active)
      : combatEntityActive(
        target,
        Boolean(target?.moving || Math.hypot(Number(target?.vx || 0), Number(target?.vy || 0)) > 0 || Number(target?.speed || 0) > 0),
        Boolean(target?.firing || target?.is_firing || target?.shooting),
        target?.stamina_5s_remaining_milli ?? target?.stamina5sRemainingMilli,
        target?.stamina_5s_limit_milli ?? target?.stamina5sLimitMilli
      ),
    firing: Boolean(target.firing || target.is_firing || target.shooting),
    distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
    score: Number.isFinite(Number(target.combatScore)) ? Math.round(Number(target.combatScore)) : null,
    combatIntent: target.combatIntent || '',
    combatEngagement: target.combatEngagement ? cloneJson(target.combatEngagement) : null
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
  const combatTargetState = options.combatTargetState || null;
  const samples = Array.isArray(combatTargetState?.motionSamples) ? combatTargetState.motionSamples : [];
  const profile = opponentMotionProfileCore(self, target, samples, {
    stationarySpeed: options.combatStationarySpeed
  });
  const motionScale = Math.max(0, Math.min(1, Math.max(speed, profile.avgSpeed) / Math.max(1, Number(options.combatTargetDodgeSpeedPerTick || 50))));
  const intercept = quadraticInterceptCore(self, target, {
    bulletSpeed,
    renderDelayTicks,
    bulletRange: options.combatBulletRangeCm || options.combatAttackRange || COMBAT_CONSTANTS.ATTACK_RANGE,
    hitRadius: options.combatBulletHitRadiusCm || 90,
    maxTicks: options.combatInterceptMaxTicks,
    maxTargetSpeed: options.combatTargetDodgeSpeedPerTick || 50,
    motionScale
  });
  const flightTicks = intercept?.flightTicks ?? Math.max(0, distance / bulletSpeed);
  const leadTicks = flightTicks + renderDelayTicks;
  const stationarySpeed = Math.max(0, Number(options.stationarySpeed ?? options.combatStationarySpeed ?? 5));
  const moving = Boolean(target.moving || speed >= stationarySpeed || Math.hypot(vx, vy) >= stationarySpeed);
  let x = moving ? (intercept?.x ?? tx + vx * leadTicks) : tx;
  let y = moving ? (intercept?.y ?? ty + vy * leadTicks) : ty;
  const leadDistance = distanceBetween({ x: tx, y: ty }, { x, y });
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const noDamageStartMs = Math.max(0, Number(options.combatAimNoDamageMs ?? 1000));
  const noDamageStepMs = Math.max(1, Number(options.combatAimNoDamageStepMs ?? 800));
  const noDamageLevel = noDamageStartMs > 0 && noDamageMs > noDamageStartMs
    ? Math.floor((noDamageMs - noDamageStartMs) / noDamageStepMs) + 1
    : 0;
  const noDamageWidened = noDamageLevel > 0;
  const confidence = Math.max(0.2, Math.min(1, (moving ? Number(intercept?.confidence || 0.55) * profile.aimConfidenceScale : 1) - Math.min(0.25, noDamageLevel * 0.04)));
  return {
    ok: true,
    x: Math.round(x),
    y: Math.round(y),
    mode: moving
      ? (intercept ? (noDamageWidened ? 'quadratic-intercept-motion-probe' : 'quadratic-intercept') : 'linear-intercept-fallback')
      : 'exact',
    distance: Math.round(distance),
    intercept: moving,
    flightTicks: Math.round(flightTicks * 10) / 10,
    leadDistance: Math.round(leadDistance),
    confidence,
    motionScale: Math.round(motionScale * 1000) / 1000,
    noDamageMs: Math.round(noDamageMs),
    noDamageLevel,
    noDamageWidened,
    spreadScale: noDamageWidened ? Math.round((1 + Math.min(1, noDamageLevel * 0.2)) * 100) / 100 : 1,
    opponentProfile: profile
  };
}

function targetRecedingFromSelf(self, target) {
  const vx = Number(target?.vx || 0);
  const vy = Number(target?.vy || 0);
  if (!self || !target || (!vx && !vy)) return false;
  const rx = Number(target.x) - Number(self.x);
  const ry = Number(target.y) - Number(self.y);
  return (rx * vx + ry * vy) > 0;
}

function movementTangentPreference(self, target) {
  if (!self || !target) return null;
  const baseX = Number(target.x) - Number(self.x);
  const baseY = Number(target.y) - Number(self.y);
  if (!baseX && !baseY) return null;
  const sign = Number(target.vx || 0) || Number(target.vy || 0) ? 1 : -1;
  return {
    dx: Math.sign(-baseY * sign),
    dy: Math.sign(baseX * sign)
  };
}

function passiveRunnerState(self, target, combatTargetState = {}, options = {}) {
  if (!self || !target) return { active: false };
  const selfHp = hpValue(self) ?? 100;
  const engagedMs = Math.max(0, Number(options.nowMs || Date.now()) - Number(combatTargetState?.firstSeenAt || combatTargetState?.at || options.nowMs || Date.now()));
  const confirmMs = Math.max(0, Number(options.combatPassiveRunnerConfirmMs ?? COMBAT_CONSTANTS.PASSIVE_RUNNER_CONFIRM_MS));
  const seenTargetRealBulletMs = combatTargetState?.seenTargetRealBulletAt
    ? Math.max(0, Number(options.nowMs || Date.now()) - Number(combatTargetState.seenTargetRealBulletAt))
    : 0;
  const active = Boolean(
    entityDropValue(target) > 0
      && target.moving
      && !target.firing
      && selfHp >= Math.max(1, Number(options.combatPassiveRunnerMinSelfHp || 80))
      && !seenTargetRealBulletMs
      && engagedMs >= confirmMs
  );
  return {
    active,
    engagedMs: Math.round(engagedMs),
    confirmMs,
    seenTargetRealBulletMs,
    reason: 'passive-runner'
  };
}

function buildCombatExitDecision(self, target, combatTargetState = {}, options = {}) {
  if (!self || !target) return null;
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const exit = evaluateCombatHpExitCore({ self, target }, options);
  return exit ? { ...exit, noDamageMs } : null;
}

function buildCombatMovementPlan(self, target, bullets = [], options = {}) {
  if (!self || !target) return { dx: 0, dy: 0, reason: 'missing-target', spacing: null, dodge: null, modifiers: [] };
  const combatTargetState = options.combatTargetState || null;
  const noDamageMs = Math.max(0, Number(combatTargetState?.noDamageMs || 0));
  const targetPressure = (bullets || []).some(bullet => Number(bullet.ownerId) === Number(target.user_id));
  const passiveRunner = passiveRunnerState(self, target, combatTargetState, options);
  const finishingTarget = Number(target.hp ?? 100) <= Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP);
  const spacing = calculateCombatSpacing(self, target, { targetPressure, finishingTarget });
  const dodge = calculateDodgeDirection(self, bullets, {
    tangentPreference: movementTangentPreference(self, target),
    target,
    moveSpeedPerTick: options.combatMoveSpeedPerTick || 50,
    hitRadius: options.combatBulletHitRadiusCm || 200
  });
  const backAway = shouldBackAwayFromTarget(self, target);
  const closeRange = Math.max(0, Number(options.combatPressureCloseRange || options.combatPassiveRunnerCloseRange || COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_RANGE));
  const pressureClose = Boolean(
    targetPressure
      && noDamageMs >= Math.max(0, Number(options.combatNoDamagePressCloseMs ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MS))
      && (hpValue(self) ?? 100) >= Math.max(0, Number(options.combatNoDamagePressCloseMinHp ?? COMBAT_CONSTANTS.NO_DAMAGE_PRESS_CLOSE_MIN_HP))
      && Number(target.distance || Infinity) > closeRange
  );
  const retreatingClose = Boolean(
    !pressureClose
      && targetRecedingFromSelf(self, target)
      && noDamageMs >= Math.max(0, Number(options.combatRetreatingCloseNoDamageMs || 2000))
      && Number(target.distance || Infinity) > spacing
  );
  const passiveRunnerClose = Boolean(
    !pressureClose
      && !retreatingClose
      && passiveRunner.active
      && Number(target.distance || Infinity) > Math.max(0, Number(options.combatPassiveRunnerCloseRange || 5500))
  );
  const closeIn = pressureClose || retreatingClose || passiveRunnerClose || Number(target.distance || Infinity) > spacing;
  const base = { dx: 0, dy: 0 };
  const movement = applyCombatMovementModifiers(base, self, target, { dodge, backAway, closeIn });
  const closeReason = pressureClose
    ? 'combat-pressure-close'
    : (retreatingClose ? 'combat-retreating-fighter-close' : (passiveRunnerClose ? 'passive-runner-close' : 'close-in'));
  const reason = movement.modifiers.includes('dodge')
    ? dodge.reason
    : (movement.modifiers.includes('back-away') || movement.modifiers.includes('back-away-mixed') ? 'back-away' : (movement.modifiers.includes('close-in') ? closeReason : 'hold-spacing'));
  return {
    dx: Number(movement.dx || 0),
    dy: Number(movement.dy || 0),
    reason,
    spacing: Math.round(spacing),
    dodge: dodge ? { dx: dodge.dx, dy: dodge.dy, reason: dodge.reason, threatField: dodge.threatField } : null,
    modifiers: movement.modifiers || [],
    pressureClose: pressureClose ? { active: true, noDamageMs: Math.round(noDamageMs), closeRange } : null,
    passiveRunner: passiveRunner.active ? passiveRunner : null,
    retreatingClose: retreatingClose ? { active: true, noDamageMs: Math.round(noDamageMs), receding: true } : null
  };
}

function pickIncomingBullet(bullets = []) {
  return (bullets || [])
    .filter(bullet => bullet?.incoming)
    .slice()
    .sort((a, b) => {
      const timeA = Number(a.timeToImpact ?? Infinity);
      const timeB = Number(b.timeToImpact ?? Infinity);
      if (timeA !== timeB) return timeA - timeB;
      return Number(a.distance ?? Infinity) - Number(b.distance ?? Infinity);
    })[0] || null;
}

function rememberBrowserlessCombatEngagement(stateful, self, target, options = {}) {
  if (!stateful || typeof stateful !== 'object' || !target) return;
  const id = combatTargetId(target);
  if (!id) return;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const previous = stateful.combatTarget || null;
  const same = previous && String(previous.id ?? '') === String(id);
  const distance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : distanceBetween(self, target);
  const hp = numberOrNull(target.knownHp ?? target.hp);
  const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
  const damaged = hp !== null && previousHp !== null && hp < previousHp - 0.01;
  const previousSelfHp = same ? hpValue(previous?.self) : null;
  const currentSelfHp = hpValue(self);
  const selfDamaged = previousSelfHp !== null && currentSelfHp !== null && currentSelfHp < previousSelfHp - 0.01;
  const previousFirstHp = same && Number.isFinite(Number(previous.firstHp)) ? Number(previous.firstHp) : null;
  const firstHp = same ? (previousFirstHp ?? previousHp ?? hp) : hp;
  const previousMinHp = same && Number.isFinite(Number(previous.minHp)) ? Number(previous.minHp) : null;
  const minHp = hp !== null ? Math.min(previousMinHp ?? hp, hp) : previousMinHp;
  const damageFromStart = firstHp !== null && minHp !== null ? Math.max(0, firstHp - minHp) : null;
  const inRange = Number.isFinite(distance)
    && distance <= Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const incomingOwnerId = target.incomingBullet?.ownerId ?? target.incomingBullet?.owner_id ?? null;
  const targetOwnsRealBullet = Boolean(
    target.incomingBullet
      && !target.incomingBullet.synthetic
      && incomingOwnerId !== null
      && incomingOwnerId !== undefined
      && String(incomingOwnerId) === String(id)
  );
  const targetBulletIds = (options.bullets || [])
    .filter(bullet => String(bullet?.ownerId ?? '') === String(id))
    .map(bullet => String(bullet?.bullet_id ?? bullet?.bulletId ?? `${bullet?.createdTick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`))
    .filter(Boolean);
  const previousSamples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples : [];
  const sampleWindowMs = Math.max(250, Number(options.combatMotionHistoryWindowMs || 6000));
  const motionSamples = previousSamples
    .concat([{
      at: nowMs,
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      vx: numberOrNull(target.vx),
      vy: numberOrNull(target.vy),
      selfHp: hpValue(self),
      targetHp: hp
    }])
    .filter(sample => nowMs - Number(sample.at || 0) <= sampleWindowMs)
    .slice(-20);
  stateful.combatTarget = {
    id,
    at: nowMs,
    firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || nowMs) : nowMs,
    name: target.name || '',
    x: Math.round(Number(target.x) || 0),
    y: Math.round(Number(target.y) || 0),
    hp,
    firstHp,
    minHp,
    damageFromStart,
    displayHp: numberOrNull(target.hp),
    drop: entityDropValue(target),
    distance,
    reason: options.reason || target.reason || 'combat-live-realtime',
    intent: target.combatIntent || (target.incomingBullet ? 'defensive' : 'profit'),
    originIntent: same ? String(previous.originIntent || previous.intent || target.combatIntent || '') : String(target.combatIntent || ''),
    originReason: same ? String(previous.originReason || previous.reason || '') : String(options.reason || target.reason || ''),
    lastDamageAt: damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs),
    lastInRangeAt: inRange ? nowMs : (same ? Number(previous.lastInRangeAt || previous.at || nowMs) : nowMs),
    seenTargetRealBulletAt: targetOwnsRealBullet ? nowMs : (same ? Number(previous.seenTargetRealBulletAt || 0) : 0),
    lastDamageAmount: damaged ? Math.max(0, previousHp - hp) : Number(previous?.lastDamageAmount || 0),
    noDamageMs: Math.max(0, nowMs - (damaged ? nowMs : (same ? Number(previous.lastDamageAt || previous.at || nowMs) : nowMs))),
    motionSamples,
    self: summarizeCombatTarget(self)
  };
  const previousMetrics = same && stateful.combatMetrics?.targetId === String(id) ? stateful.combatMetrics : {};
  const threatBulletIds = Array.from(new Set([...(previousMetrics.threatBulletIds || []), ...targetBulletIds])).slice(-200);
  const initialStamina1d = Number(previousMetrics.initialStamina1d);
  const currentStamina1d = Number(self?.stamina_1d_remaining_milli ?? self?.stamina1dRemainingMilli);
  const totalStaminaSpent = Number.isFinite(initialStamina1d) && Number.isFinite(currentStamina1d)
    ? Math.max(0, initialStamina1d - currentStamina1d)
    : 0;
  const shootingStaminaSpent = Number(previousMetrics.actualShots || 0)
    * Math.max(0, Number(options.opportunityShotStaminaCostMs ?? 500));
  stateful.combatMetrics = {
    ...previousMetrics,
    targetId: String(id),
    targetName: target.name || previousMetrics.targetName || '',
    startedAt: same ? Number(previousMetrics.startedAt || previous?.firstSeenAt || nowMs) : nowMs,
    lastObservedAt: nowMs,
    initialSelfHp: same
      ? (numberOrNull(previousMetrics.initialSelfHp) ?? previousSelfHp ?? currentSelfHp)
      : currentSelfHp,
    lastSelfHp: currentSelfHp,
    minSelfHp: currentSelfHp === null
      ? numberOrNull(previousMetrics.minSelfHp)
      : Math.min(numberOrNull(previousMetrics.minSelfHp) ?? currentSelfHp, currentSelfHp),
    initialTargetHp: same
      ? (numberOrNull(previousMetrics.initialTargetHp) ?? previousHp ?? hp)
      : hp,
    lastTargetHp: hp,
    minTargetHp: hp === null
      ? numberOrNull(previousMetrics.minTargetHp)
      : Math.min(numberOrNull(previousMetrics.minTargetHp) ?? hp, hp),
    initialStamina1d: Number.isFinite(initialStamina1d) ? initialStamina1d : (Number.isFinite(currentStamina1d) ? currentStamina1d : null),
    confirmedHits: Number(previousMetrics.confirmedHits || 0) + (damaged ? Math.max(1, Math.round((previousHp - hp) / 3)) : 0),
    targetDamage: Number(previousMetrics.targetDamage || 0) + (damaged ? previousHp - hp : 0),
    incomingHits: Number(previousMetrics.incomingHits || 0) + (selfDamaged ? Math.max(1, Math.round((previousSelfHp - currentSelfHp) / 3)) : 0),
    selfDamage: Number(previousMetrics.selfDamage || 0) + (selfDamaged ? previousSelfHp - currentSelfHp : 0),
    firstDamageAt: damaged ? (Number(previousMetrics.firstDamageAt || 0) || nowMs) : Number(previousMetrics.firstDamageAt || 0),
    threatBulletIds,
    threatBulletCount: threatBulletIds.length,
    totalStaminaSpent,
    shootingStaminaSpent,
    movementStaminaSpent: Math.max(0, totalStaminaSpent - shootingStaminaSpent),
    lastDodgeThreatField: null
  };
}

function buildBrowserlessCombatDryRun(state = {}, options = {}) {
  const realtime = state?.realtime || {};
  const dataGaps = [];
  const liveCombatEnabled = options.liveCombatEnabled === true || options.combatEnabled === true;
  const self = normalizeCombatEntity(realtime.self, null, options);
  if (!self) dataGaps.push('missing-realtime-self');
  const selfUserId = Number(self?.user_id ?? state?.userId ?? options.userId ?? 0);
  const entities = (Array.isArray(realtime.entities) ? realtime.entities : [])
    .map(entity => normalizeCombatEntity(entity, self, options))
    .filter(Boolean);
  const targets = entities.filter(entity => Number(entity.user_id) !== selfUserId);
  const bullets = (Array.isArray(realtime.bullets) ? realtime.bullets : [])
    .map(bullet => normalizeCombatBullet(bullet, self, { currentTick: realtime.tick }))
    .filter(Boolean);
  if (!bullets.length) dataGaps.push('no-realtime-bullet-evidence');
  const incomingBullet = pickIncomingBullet(bullets);
  const context = {
    userId: selfUserId,
    bullets,
    incomingBullet,
    incomingBulletOwnerId: incomingBullet?.ownerId,
    unknownIncoming: Boolean(incomingBullet && (incomingBullet.ownerId === null || incomingBullet.ownerId === undefined)),
    whitelistCheck: target => isWhitelistedTargetForOptions(target, options)
  };
  const combatAttackRange = Math.max(0, Number(options.combatAttackRange || options.attackRange || COMBAT_CONSTANTS.ATTACK_RANGE));
  const combatDodgeRange = combatAttackRange + Math.max(0, Number(options.combatDodgeRangeBuffer || 0));
  const candidates = targets
    .filter(target => isCombatEligibleThreat(target, context))
    .filter(target => {
      const distance = Number(target.distance);
      if (!Number.isFinite(distance)) return false;
      if (distance <= combatAttackRange) return true;
      return incomingBullet
        && incomingBullet.ownerId !== null
        && incomingBullet.ownerId !== undefined
        && String(incomingBullet.ownerId) === String(target.user_id)
        && distance <= combatDodgeRange;
    })
    .map(target => ({
      ...target,
      combatScore: calculateCombatTargetPriority(self, target, context)
    }))
    .sort((a, b) => Number(b.combatScore || 0) - Number(a.combatScore || 0));
  const stateful = options.decisionState || options.stateful || null;
  const engagedTarget = pickEngagedCombatTargetCore(self, candidates, targets, bullets, stateful, {
    ...options,
    ...context
  });
  const defensiveTarget = selectBestCombatTarget(self, candidates, context);
  const target = defensiveTargetOverridesEngagedCore(engagedTarget, defensiveTarget, options)
    ? defensiveTarget
    : (engagedTarget || defensiveTarget);
  rememberBrowserlessCombatEngagement(stateful, self, target, {
    ...options,
    bullets,
    reason: liveCombatEnabled ? 'combat-live-realtime' : (options.controlMode === 'combat-dry-run' ? 'combat-dry-run-realtime' : 'realtime-visible-threat')
  });
  const combatTargetState = stateful?.combatTarget || null;
  const combatStartedAtMs = target && Number.isFinite(Number(combatTargetState?.firstSeenAt || combatTargetState?.at))
    ? Number(combatTargetState.firstSeenAt || combatTargetState.at)
    : null;
  const combatDurationMs = combatStartedAtMs === null
    ? null
    : Math.max(0, (Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()) - combatStartedAtMs);
  const aim = estimateAim(self, target, {
    ...options,
    combatTargetState
  });
  if (!aim.ok) dataGaps.push(aim.reason);
  if (stateful && typeof stateful === 'object' && aim.ok) {
    stateful.combatAim = {
      targetId: combatTargetId(target),
      x: aim.x,
      y: aim.y,
      mode: aim.mode,
      confidence: aim.confidence,
      motionScale: aim.motionScale,
      noDamageMs: aim.noDamageMs,
      noDamageWidened: aim.noDamageWidened,
      noDamageLevel: aim.noDamageLevel,
      at: Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
    };
  }
  const movement = buildCombatMovementPlan(self, target, bullets, {
    ...options,
    combatTargetState,
    bullets
  });
  if (stateful?.combatMetrics && movement.dodge?.threatField) {
    stateful.combatMetrics.lastDodgeThreatField = cloneJson(movement.dodge.threatField);
  }
  const exitDecision = buildCombatExitDecision(self, target, {
    ...combatTargetState,
    combatMetrics: stateful?.combatMetrics || combatTargetState?.combatMetrics || null
  }, options);
  const fireState = target ? determineCombatFireState(self || {}, target, {
    targetPressureFire: bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id)),
    passiveRunner: Boolean(movement.passiveRunner?.active),
    finishLowThreat: Boolean(
      target
        && !exitDecision
        && (hpValue(self) ?? 0) >= Math.max(1, Number(options.combatFinishLowThreatMinSelfHp || 60))
        && (hpValue(target) ?? 100) <= Math.max(1, Number(options.combatFinishLowThreatHp ?? COMBAT_CONSTANTS.FINISH_LOW_THREAT_HP))
        && !bullets.some(bullet => Number(bullet.ownerId) === Number(target.user_id))
    )
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
    startedAt: combatStartedAtMs === null ? '' : new Date(combatStartedAtMs).toISOString(),
    durationMs: combatDurationMs === null ? null : Math.round(combatDurationMs),
    self: summarizeCombatTarget(self),
    target: summarizeCombatTarget(target),
    candidates: candidates.slice(0, 5).map(summarizeCombatTarget),
    movement,
    aim: aim.ok ? aim : null,
    exit: exitDecision
      ? {
          ...exitDecision,
          target: summarizeCombatTarget(target)
        }
      : null,
    shooting: {
      dryRunOnly: !liveCombatEnabled,
      wouldShoot,
      commandSuppressed,
      inRange,
      state: fireState.state,
      reason: fireState.reason,
      cadenceMs: Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null,
      reserve: numberOrNull(fireState.reserve),
      stamina5s: fireState.stamina5s === null ? null : numberOrNull(fireState.stamina5s),
      lowConfidenceThrottle: Boolean(lowConfidence.throttle),
      effectiveCadenceMs: Number.isFinite(Number(lowConfidence.cadenceMs)) && lowConfidence.throttle ? Number(lowConfidence.cadenceMs) : (Number.isFinite(Number(fireState.cadenceMs)) ? Number(fireState.cadenceMs) : null),
      decisionIntervalMs: Number.isFinite(Number(options.decisionIntervalMs)) ? Number(options.decisionIntervalMs) : null,
      combatControlIntervalMs: Number.isFinite(Number(options.combatControlIntervalMs)) ? Number(options.combatControlIntervalMs) : null,
      actualLastShotAt: Number.isFinite(Number(stateful?.combatMetrics?.actualLastShotAt)) ? Number(stateful.combatMetrics.actualLastShotAt) : null,
      actualShotIntervalMs: Number.isFinite(Number(stateful?.combatMetrics?.actualShotIntervalMs)) ? Number(stateful.combatMetrics.actualShotIntervalMs) : null
    },
    metrics: stateful?.combatMetrics ? {
      ...cloneJson(stateful.combatMetrics),
      estimatedHitRate: Number(stateful.combatMetrics.actualShots || 0) > 0
        ? Number((Number(stateful.combatMetrics.confirmedHits || 0) / Number(stateful.combatMetrics.actualShots) * 100).toFixed(1))
        : null,
      firstDamageDelayMs: Number(stateful.combatMetrics.firstDamageAt || 0) > 0
        ? Math.max(0, Number(stateful.combatMetrics.firstDamageAt) - Number(stateful.combatMetrics.startedAt || 0))
        : null
    } : null,
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
