'use strict';

function createCombatAimRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    dist = () => Infinity,
    speed = () => 0,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    staminaRemaining = () => NaN,
    staminaExhaustedThreshold = () => 0,
    isInvulnerable = () => false,
    isCurrentlyActive = () => false,
    isFiringEntity = () => false,
    hpValue = () => 0,
    combatHpValue = () => 100,
    knownHpValue = () => null,
    dropValue = () => 0,
    isAlive = value => Boolean(value),
    getNativeEntityList = () => [],
    summarizeServerPositionStall = () => null,
    combatTargetId = () => '',
    combatAimDamageState = () => ({ noDamageMs: 0, widenMs: 0 }),
    combatTrendState = () => ({})
  } = runtime;

  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clamp(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clamp(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clamp(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clamp(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clamp(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }

  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clamp(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clamp(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
  }

  function combatMotionSample(self, target, at = Date.now()) {
    if (!target) return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = self ? (Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target)) : Number(target.distance);
    return {
      at,
      x,
      y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      distance: Number.isFinite(distance) ? distance : null,
      hp: knownHpValue(target),
      selfHp: knownHpValue(self)
    };
  }

  function combatMotionSamplesWithCurrent(self, target, t = Date.now(), windowMsOverride = null) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget || null;
    const same = previous && id && String(previous.id ?? '') === id;
    const windowMs = Math.max(250, Number(windowMsOverride || cfg.combatMotionHistoryWindowMs || 2000));
    const maxSamples = Math.max(2, Math.round(Number(cfg.combatMotionHistoryMaxSamples || 80)));
    const samples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples.slice() : [];
    const current = combatMotionSample(self, target, t);
    if (current) samples.push(current);
    return samples
      .filter(sample => sample && Number.isFinite(Number(sample.at)) && t - Number(sample.at) <= windowMs)
      .sort((a, b) => Number(a.at) - Number(b.at))
      .slice(-maxSamples);
  }

  function combatOpponentProfile(self, target, targetDistance = null) {
    const samples = combatMotionSamplesWithCurrent(self, target, Date.now(), Math.max(250, Number(cfg.combatMotionHistoryWindowMs || 2000)));
    const threshold = Math.max(1, Number(cfg.combatStationarySpeed || 5));
    let lateralFlips = 0;
    let previousLateralSign = 0;
    let radialSum = 0;
    let radialCount = 0;
    let speedSum = 0;
    let dotSum = 0;
    let dotCount = 0;
    for (const sample of samples) {
      const sx = Number(sample.x);
      const sy = Number(sample.y);
      const vx = Number(sample.vx) || 0;
      const vy = Number(sample.vy) || 0;
      const dx = sx - Number(self?.x || 0);
      const dy = sy - Number(self?.y || 0);
      const d = Math.max(1, Math.hypot(dx, dy));
      const radial = (dx / d) * vx + (dy / d) * vy;
      const lateral = (dx / d) * vy - (dy / d) * vx;
      const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
      if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
      if (lateralSign) previousLateralSign = lateralSign;
      radialSum += radial;
      radialCount += 1;
      speedSum += Math.hypot(vx, vy);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const av = Math.hypot(Number(a.vx) || 0, Number(a.vy) || 0);
      const bv = Math.hypot(Number(b.vx) || 0, Number(b.vy) || 0);
      if (av >= threshold && bv >= threshold) {
        dotSum += ((Number(a.vx) || 0) * (Number(b.vx) || 0) + (Number(a.vy) || 0) * (Number(b.vy) || 0)) / (av * bv);
        dotCount += 1;
      }
    }
    const durationMs = samples.length >= 2 ? Math.max(0, Number(samples[samples.length - 1].at) - Number(samples[0].at)) : 0;
    const velocityStability = dotCount ? clamp((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
    const avgRadialSpeed = radialCount ? radialSum / radialCount : 0;
    const avgSpeed = samples.length ? speedSum / samples.length : speed(target);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : (Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target));
    const strafePattern = Boolean(samples.length >= 4 && lateralFlips >= 2 && durationMs >= 600);
    const kiting = Boolean(samples.length >= 3
      && avgRadialSpeed >= Math.max(3, threshold)
      && distance >= Math.max(0, Number(cfg.combatSpacingPreferredRange || 0))
      && (isFiringEntity(target) || isCurrentlyActive(target)));
    const maneuverScale = clamp((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45 + (kiting ? 0.2 : 0), 0, 1);
    const aimConfidenceScale = clamp(1.08 - maneuverScale * 0.45, 0.55, 1.08);
    return {
      sampleCount: samples.length,
      durationMs,
      lateralFlips,
      velocityStability,
      avgRadialSpeed,
      avgSpeed,
      strafePattern,
      kiting,
      maneuverScale,
      aimConfidenceScale
    };
  }

  function combatTradeEstimate(self, target) {
    const previous = bot.combatTarget || null;
    const id = combatTargetId(target);
    const same = previous && id && String(previous.id ?? '') === id;
    if (!same) return null;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.combatTradeEstimateWindowMs || 6000));
    const samples = combatMotionSamplesWithCurrent(self, target, t, windowMs)
      .filter(sample => t - Number(sample.at) <= windowMs && Number.isFinite(Number(sample.hp)) && Number.isFinite(Number(sample.selfHp)));
    if (samples.length < 3) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = Math.max(1, Number(last.at) - Number(first.at));
    if (elapsedMs < Math.max(500, Number(cfg.combatTradeEstimateMinWindowMs || 1800))) return null;
    const targetDamage = Math.max(0, Number(first.hp) - Number(last.hp));
    const selfDamage = Math.max(0, Number(first.selfHp) - Number(last.selfHp));
    const myDps = targetDamage / elapsedMs * 1000;
    const enemyDps = selfDamage / elapsedMs * 1000;
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const tKillMs = myDps > 0.05 ? targetHp / myDps * 1000 : Infinity;
    const tDeathMs = enemyDps > 0.05 ? selfHp / enemyDps * 1000 : Infinity;
    const minSelfDamage = Math.max(0, Number(cfg.combatTradeEstimateMinSelfDamage || 6));
    const minEnemyDps = Math.max(0, Number(cfg.combatTradeEstimateMinEnemyDps || 1.5));
    const safetyFactor = Math.max(1, Number(cfg.combatTradeEstimateSafetyFactor || 1.15));
    const noDamageSafeSelfHp = Math.max(0, Number(cfg.combatTradeEstimateNoDamageSafeSelfHp || 75));
    const noDamageUnsafeTDeathMs = Math.max(1000, Number(cfg.combatTradeEstimateNoDamageUnsafeTDeathMs || 30000));
    const zeroDamageWindow = targetDamage <= 0.01;
    const noDamageUnsafe = !zeroDamageWindow
      || selfHp <= noDamageSafeSelfHp
      || tDeathMs <= noDamageUnsafeTDeathMs;
    const disadvantaged = Boolean(
      selfDamage >= minSelfDamage
      && enemyDps >= minEnemyDps
      && tDeathMs < tKillMs * safetyFactor
      && targetHp > 1
      && noDamageUnsafe
    );
    return {
      active: disadvantaged,
      sampleCount: samples.length,
      elapsedMs,
      selfDamage,
      targetDamage,
      myDps,
      enemyDps,
      tKillMs,
      tDeathMs,
      safetyFactor,
      zeroDamageWindow,
      noDamageUnsafe
    };
  }

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const finishLowThreatDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootFinishLowThreatDodgeReserveMs || hardReserveMs));
    const passiveRunnerDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPassiveRunnerDodgeReserveMs || highHpDodgeReserveMs));
    const pressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPressureDodgeReserveMs || highHpDodgeReserveMs));
    const winningPressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootWinningPressureDodgeReserveMs || pressureDodgeReserveMs));
    const steadyAimDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootSteadyAimDodgeReserveMs || highHpDodgeReserveMs));
    const noDamageDuelDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootNoDamageDuelDodgeReserveMs || highHpDodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const trend = options.trend && typeof options.trend === 'object'
      ? options.trend
      : combatTrendState(self, options);
    const noDamageMs = Math.max(0, Number(trend.noDamageMs || 0));
    const highHpFireWindow = Boolean(trend.highHpFireWindow);
    const passiveRunnerFireWindow = Boolean(trend.passiveRunnerFireWindow);
    const opponentProbeFireWindow = Boolean(trend.opponentProbeFireWindow);
    const finishLowThreatFireWindow = Boolean(trend.finishLowThreatFireWindow);
    const closePressureFireWindow = Boolean(trend.closePressureFireWindow);
	    const winningPressureFireWindow = Boolean(trend.winningPressureFireWindow);
	    const steadyAimFireWindow = Boolean(trend.steadyAimFireWindow);
	    const noDamageDuelFireWindow = Boolean(trend.noDamageDuelFireWindow);
	    const farNoDamageCloseFireWindow = Boolean(trend.farNoDamageCloseFireWindow);
	    const aimConfidence = Number.isFinite(Number(options.aimConfidence))
	      ? Math.max(0, Math.min(1, Number(options.aimConfidence)))
	      : null;
	    const lowConfidenceThreshold = Math.max(0, Math.min(1, Number(cfg.combatAimLowConfidenceThreshold || 0)));
	    const lowConfidenceMinDistance = Math.max(0, Number(cfg.combatAimLowConfidenceMinDistance || 0));
	    const lowConfidenceMotionScale = Math.max(0, Number(cfg.combatAimLowConfidenceMotionScale || 0));
	    const lowConfidenceEveryMs = Math.max(conserveEveryMs, Number(cfg.combatAimLowConfidenceEveryMs || conserveEveryMs));
    const opponentProbeReserveMs = Math.max(
      dodgeReserveMs,
      Number(cfg.combatOpponentProbeReserveMs || reserveMs)
    );
    const opponentProbeEveryMs = Math.max(
      normalEveryMs,
      Number(cfg.combatOpponentProbeEveryMs || lowConfidenceEveryMs)
    );
	    const lowConfidenceWindow = Boolean(
	      aimConfidence !== null
	      && lowConfidenceThreshold > 0
	      && aimConfidence < lowConfidenceThreshold
	      && Number(options.targetDistance || 0) >= lowConfidenceMinDistance
	      && (options.targetMoving || Number(options.motionScale || 0) >= lowConfidenceMotionScale)
	      && !closePressureFireWindow
	      && !steadyAimFireWindow
	    );
    let effectiveDodgeReserveMs = dodgeReserveMs;
    if (opponentProbeFireWindow) {
      effectiveDodgeReserveMs = Math.max(effectiveDodgeReserveMs, opponentProbeReserveMs);
    } else {
      if (highHpFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, highHpDodgeReserveMs);
      if (passiveRunnerFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, passiveRunnerDodgeReserveMs);
    }
    if (finishLowThreatFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, finishLowThreatDodgeReserveMs);
    if (closePressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, pressureDodgeReserveMs);
    if (winningPressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, winningPressureDodgeReserveMs);
    if (steadyAimFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, steadyAimDodgeReserveMs);
    if (noDamageDuelFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, noDamageDuelDodgeReserveMs);
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure || options.pressureClose);
    const base = {
      shoot: true,
      forceShoot: false,
      shootEveryMs: normalEveryMs,
      reason: 'normal',
      stamina5s,
      reserveMs,
      dodgeReserveMs: effectiveDodgeReserveMs,
      standardDodgeReserveMs: dodgeReserveMs,
      highHpDodgeReserveMs,
      passiveRunnerDodgeReserveMs,
      finishLowThreatDodgeReserveMs,
      pressureDodgeReserveMs,
      winningPressureDodgeReserveMs,
      steadyAimDodgeReserveMs,
      noDamageDuelDodgeReserveMs,
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
	      noDamageDuelFireWindow,
	      farNoDamageCloseFireWindow,
      opponentProbeFireWindow,
      opponentProbeReserveMs,
      opponentProbeEveryMs,
	      aimConfidence,
	      lowConfidenceWindow,
	      noDamageMs,
      trend: {
        stance: trend.stance || 'normal',
        hpGap: Number.isFinite(Number(trend.hpGap)) ? Number(trend.hpGap) : null,
        targetDistance: Number.isFinite(Number(trend.targetDistance)) ? Math.round(Number(trend.targetDistance)) : null,
        noDamageMs: Math.round(noDamageMs),
        engagedCombat: Boolean(trend.engagedCombat),
        targetActive: Boolean(trend.targetActive),
        targetMoving: Boolean(trend.targetMoving),
        passiveRunner: Boolean(trend.passiveRunner),
        opponentProbe: Boolean(trend.opponentProbeFireWindow),
        opponentProbeEngagedMs: Math.round(Math.max(0, Number(trend.opponentProbeEngagedMs || 0))),
        realBulletPressure: Boolean(trend.realBulletPressure),
        steadyAim: Boolean(trend.steadyAim),
        farNoDamageClose: Boolean(trend.farNoDamageCloseFireWindow)
      },
      suppressed: false,
      throttled: false
    };
    if (stamina5s !== null && stamina5s < hardReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'stamina-rebuild', suppressed: true };
    }
    if (stamina5s !== null && opponentProbeFireWindow && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
    if (stamina5s !== null && needsMovement && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
	    if (stamina5s !== null && stamina5s < reserveMs) {
	      return { ...base, shootEveryMs: conserveEveryMs, reason: 'burst-fire', throttled: true };
	    }
    if (opponentProbeFireWindow) {
      return { ...base, shootEveryMs: opponentProbeEveryMs, reason: 'opponent-probe', throttled: true };
    }
	    if (lowConfidenceWindow) {
	      return { ...base, shootEveryMs: lowConfidenceEveryMs, reason: 'low-confidence-burst', throttled: true };
	    }
	    return base;
	  }

  function combatAimNoDamageLevel(widenMs) {
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const elapsed = Math.max(0, Number(widenMs) || 0);
    return elapsed > 0 ? Math.min(3, 1 + elapsed / stepMs) : 0;
  }

  function combatAimNoDamageJitterLimit(baseLimit, noDamageLevel) {
    const base = Math.max(0, Number(baseLimit) || 0);
    const level = Math.max(0, Number(noDamageLevel) || 0);
    const maxNoDamageLimit = Math.max(base, Number(cfg.combatAimNoDamageMaxRadians) || base);
    return level ? Math.min(maxNoDamageLimit, base * (1 + level * 0.45)) : base;
  }
  function combatAimSteadyNoDamageState(target, noDamageMs, motionScale = 0) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimSteadyNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    const speedMax = Math.max(0, Number(cfg.combatAimSteadySpeedMax ?? cfg.combatStationarySpeed ?? 0));
    const currentSpeed = speed(target);
    const active = Boolean(thresholdMs && elapsed >= thresholdMs && currentSpeed <= speedMax);
    return {
      active,
      noDamageMs: elapsed,
      thresholdMs,
      currentSpeed,
      speedMax,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(motionScale) : 0
    };
  }

  function combatAimFallbackPrecisionState(noDamageMs) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    return {
      active: Boolean(thresholdMs && elapsed >= thresholdMs),
      noDamageMs: elapsed,
      thresholdMs
    };
  }

  function combatMovementAimMode(self, target, distance) {
    const vx = Number(target.vx) || 0;
    const vy = Number(target.vy) || 0;
    const targetSpeed = Math.hypot(vx, vy);
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const d = Math.max(1, Number(distance) || Math.hypot(dx, dy) || 1);
    const ux = dx / d;
    const uy = dy / d;
    const radialSpeed = ux * vx + uy * vy;
    const lateralSpeed = ux * vy - uy * vx;
    const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
    let mode = 'drift';
    let leadScale = 0.75;
    if (lateralRatio >= 0.55) {
      mode = 'lateral';
      leadScale = 1.1;
    } else if (radialSpeed <= -cfg.combatStationarySpeed) {
      mode = 'closing';
      leadScale = 0.5;
    } else if (radialSpeed >= cfg.combatStationarySpeed) {
      mode = 'retreating';
      leadScale = 0.6;
    }
    if (target.current_join_mode === 'Active') leadScale += 0.15;
    if (isFiringEntity(target)) leadScale += 0.1;
    return {
      mode,
      leadScale,
      lateralSpeed,
      radialSpeed,
      lateralRatio,
      targetSpeed
    };
  }

  function combatInterceptSolution(self, target, distance = null, motionScale = 1) {
    const sx = Number(self?.x);
    const sy = Number(self?.y);
    const px = Number(target?.x);
    const py = Number(target?.y);
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const renderDelayTicks = Math.max(0, Number(cfg.combatRenderDelayTicks ?? 2));
    const compensatedX = px + vx * renderDelayTicks;
    const compensatedY = py + vy * renderDelayTicks;
    const dx = compensatedX - sx;
    const dy = compensatedY - sy;
    const c = dx * dx + dy * dy;
    if (!(c > 0)) return null;
    const targetSpeedSq = vx * vx + vy * vy;
    const a = targetSpeedSq - bulletSpeed * bulletSpeed;
    const b = 2 * (dx * vx + dy * vy);
    const eps = 1e-6;
    const roots = [];
    if (Math.abs(a) < eps) {
      if (Math.abs(b) > eps) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -eps) return null;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
    const maxByRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000) / bulletSpeed);
    const configuredMax = Number(cfg.combatInterceptMaxTicks || 0);
    const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
    const t = roots
      .filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks)
      .sort((aTick, bTick) => aTick - bTick)[0];
    if (!Number.isFinite(t)) return null;
    const x = compensatedX + vx * t;
    const y = compensatedY + vy * t;
    const travelDistance = Math.hypot(x - sx, y - sy);
    const bulletRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000));
    if (travelDistance > bulletRange + Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90))) return null;
    const rawDistance = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : Math.hypot(px - sx, py - sy);
    const targetSpeed = Math.sqrt(targetSpeedSq);
    const maxTargetSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const speedRatio = targetSpeed / maxTargetSpeed;
    const timeFactor = 1 - Math.min(1, t / maxTicks) * 0.35;
    const speedPenalty = Math.max(0, speedRatio - 1) * 0.2;
    const motionPenalty = Math.max(0, Math.min(1, Number(motionScale) || 0)) * 0.08;
    const confidence = Math.max(0.25, Math.min(1, 0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty));
    return {
      x,
      y,
      flightTicks: t,
      flightMs: t * 50,
      travelDistance,
      currentDistance: rawDistance,
      leadDistance: Math.hypot(x - px, y - py),
      renderDelayTicks,
      compensatedX,
      compensatedY,
      targetVx: vx,
      targetVy: vy,
      targetSpeed,
      confidence
    };
  }

  function combatLiveAimTarget(self, target) {
    const targetId = combatTargetId(target);
    const targetName = String(target?.name || '').trim();
    let live = null;
    try {
      const nativeEntities = Array.isArray(bot.testNativeEntities)
        ? bot.testNativeEntities
        : (typeof getNativeEntityList === 'function' ? getNativeEntityList() : []);
      if (Array.isArray(nativeEntities) && nativeEntities.length) {
        live = nativeEntities.find(entity => {
          const id = combatTargetId(entity);
          return targetId && id && String(id) === targetId;
        }) || null;
        if (!live && targetName) live = nativeEntities.find(entity => String(entity?.name || '').trim() === targetName) || null;
      }
    } catch (_) {
      live = null;
    }
    if (!live || !isAlive(live) || isInvulnerable(live)) return target;
    const x = Number(live.x);
    const y = Number(live.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return target;
    return {
      ...target,
      ...live,
      user_id: live.user_id ?? live.id ?? target.user_id ?? target.id,
      id: live.user_id ?? live.id ?? target.id ?? target.user_id,
      hp: combatHpValue(live),
      knownHp: knownHpValue(live),
      drop: dropValue(live) || target.drop,
      distance: dist(self, live),
      speed: speed(live),
      combatIntent: target.combatIntent || live.combatIntent || '',
      nativeAimResolved: true,
      originalAimTarget: target
    };
  }
  function combatAimSourceDivergenceState(aimSource, distance) {
    const original = aimSource?.originalAimTarget;
    const live = Boolean(aimSource?.nativeAimResolved);
    const ax = Number(aimSource?.x);
    const ay = Number(aimSource?.y);
    const ox = Number(original?.x);
    const oy = Number(original?.y);
    const divergence = live
      && Number.isFinite(ax)
      && Number.isFinite(ay)
      && Number.isFinite(ox)
      && Number.isFinite(oy)
      ? Math.hypot(ax - ox, ay - oy)
      : null;
    const baseThreshold = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionCm || 0));
    const ratio = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionRatio || 0));
    const ratioThreshold = Number.isFinite(Number(distance)) ? Math.round(Math.max(0, Number(distance)) * ratio) : 0;
    const threshold = Math.max(baseThreshold, ratioThreshold);
    return {
      active: Boolean(live && divergence !== null && threshold > 0 && divergence >= threshold),
      divergenceCm: divergence !== null ? Math.round(divergence) : null,
      thresholdCm: Math.round(threshold),
      baseThresholdCm: Math.round(baseThreshold),
      ratioThresholdCm: Math.round(ratioThreshold)
    };
  }

  function combatAimServerStallState() {
    const stall = typeof summarizeServerPositionStall === 'function'
      ? summarizeServerPositionStall()
      : bot.serverPositionStall;
    return stall && typeof stall === 'object' ? stall : {};
  }

  function combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, options = {}) {
    const fallbackPrecision = combatAimFallbackPrecisionState(damage?.noDamageMs);
    const sourceDivergence = combatAimSourceDivergenceState(aimSource, distance);
    const serverStall = combatAimServerStallState();
    const live = Boolean(aimSource?.nativeAimResolved);
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const radialMax = Math.max(0, Number(cfg.combatAimRadialPrecisionLateralRatio || 0));
    const realBulletPrecision = Boolean(live
      && moving
      && options.realBulletPressure
      && (!attackRange || Number(distance) <= attackRange));
    const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
    const passiveRunnerPrecisionRange = Math.max(0, Number(cfg.combatPassiveRunnerPrecisionRange || 0));
    const passiveRunnerPrecisionMaxNoDamageMs = Math.max(0, Number(cfg.combatPassiveRunnerPrecisionMaxNoDamageMs || 0));
    const passiveRunnerNoDamageMs = Math.max(0, Number(damage?.noDamageMs || 0));
    const passiveRunnerPrecisionLimited = Boolean(
      passiveRunnerPrecisionMaxNoDamageMs
      && passiveRunnerNoDamageMs >= passiveRunnerPrecisionMaxNoDamageMs
    );
    const passiveRunnerPrecision = Boolean(live
      && moving
      && options.passiveRunner
      && passiveRunnerPrecisionRange > 0
      && Number(distance) <= passiveRunnerPrecisionRange
      && !passiveRunnerPrecisionLimited
      && (!attackRange || Number(distance) <= attackRange));
    const passiveRunnerIntercept = Boolean(live
      && moving
      && movement
      && options.passiveRunner
      && !passiveRunnerPrecision
      && (!attackRange || Number(distance) <= attackRange));
    const liveIntercept = Boolean(live
      && moving
      && movement
      && (
        passiveRunnerIntercept
        || (lateralRatio > radialMax && (
          realBulletPrecision
          || (serverStall.stalled && (!attackRange || Number(distance) <= attackRange))
        ))
      ));
    const radialPrecision = Boolean(live
      && moving
      && radialMax > 0
      && movement
      && Number(movement.targetSpeed || 0) >= Number(cfg.combatStationarySpeed || 0)
      && lateralRatio <= radialMax
      && (!attackRange || Number(distance) <= attackRange));
    let mode = moving ? 'intercept' : 'exact';
    let strategy = moving ? 'intercept' : 'exact';
    let reason = moving ? (movement?.mode || 'moving') : 'stationary';
    let precision = false;
    let steady = false;
    let passiveRunnerAim = false;
    if (sourceDivergence.active) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'coordinate-divergence';
      precision = true;
    } else if (passiveRunnerPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'passive-runner-close';
      precision = true;
      passiveRunnerAim = true;
    } else if (passiveRunnerIntercept) {
      strategy = 'live-intercept';
      reason = 'passive-runner-intercept';
      passiveRunnerAim = true;
    } else if (realBulletPrecision && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'real-bullet-pressure-intercept';
    } else if (realBulletPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'real-bullet-pressure';
      precision = true;
    } else if (live && serverStall.stalled && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'server-stall-live-intercept';
    } else if (live && serverStall.stalled) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'server-stall-live';
      precision = true;
    } else if (radialPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'radial-motion';
      precision = true;
    } else if (fallbackPrecision.active) {
      mode = 'precision';
      strategy = 'fallback-precision';
      reason = 'no-damage-fallback';
      precision = true;
    } else if (steadyAim?.active && moving) {
      mode = 'steady';
      strategy = 'steady';
      reason = 'steady-no-damage';
      steady = true;
    }
    return {
      mode,
      strategy,
      reason,
      precision,
      steady,
      bypassJitter: Boolean(!moving || precision || steady),
      sourceDivergence,
      serverStall: Boolean(serverStall.stalled),
      liveIntercept,
      realBulletPrecision,
      radialPrecision,
      fallbackPrecision: Boolean(fallbackPrecision.active),
      passiveRunner: Boolean(passiveRunnerAim),
      passiveRunnerPrecisionLimited,
      movementMode: precision ? strategy : (steady ? 'steady' : (movement?.mode || ''))
    };
  }

  function combatAimTarget(self, target, options = {}) {
    const nativeAimSource = combatLiveAimTarget(self, target);
    const preliminaryDamage = combatAimDamageState(nativeAimSource);
    const aimSource = nativeAimSource;
	    const motionScale = combatAimMotionScale(aimSource);
	    const moving = speed(aimSource) >= cfg.combatStationarySpeed
	      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
	    const targetDistance = Number(aimSource.distance);
	    const distance = Number.isFinite(targetDistance) ? targetDistance : dist(self, aimSource);
    const opponentProfile = combatOpponentProfile(self, aimSource, distance);
	    const damage = preliminaryDamage;
    const steadyAim = combatAimSteadyNoDamageState(aimSource, damage.noDamageMs, motionScale);
    const movement = moving
      ? combatMovementAimMode(self, aimSource, distance)
      : { mode: '', targetSpeed: 0, lateralRatio: 0, lateralSpeed: 0, radialSpeed: 0 };
    const aimStrategy = combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, {
      realBulletPressure: Boolean(options.realBulletPressure),
      passiveRunner: Boolean(options.passiveRunner)
    });
    const exact = {
      x: Number(aimSource.x),
      y: Number(aimSource.y),
      mode: aimStrategy.mode,
      moving,
      distance,
      motionScale,
      movementMode: aimStrategy.movementMode,
      jitterLimit: 0,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: false,
      precisionAim: Boolean(aimStrategy.precision),
      steadyAim: Boolean(aimStrategy.steady),
      lockedAim: false,
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.reason,
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      passiveRunnerPrecisionLimited: Boolean(aimStrategy.passiveRunnerPrecisionLimited),
      aimConfidence: aimStrategy.bypassJitter ? 1 : null,
      opponentProfile,
    };
    if (aimStrategy.bypassJitter) return exact;
    const dx = Number(aimSource.x) - Number(self.x);
    const dy = Number(aimSource.y) - Number(self.y);
    const baseLimit = combatAimJitterLimit(distance, motionScale);
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const noDamageLevel = combatAimNoDamageLevel(damage.widenMs);
    const jitterLimit = combatAimNoDamageJitterLimit(baseLimit, noDamageLevel);
    const targetId = combatTargetId(aimSource);
    const previousAim = bot.combatAim;
    let sign = Math.sign(movement.lateralSpeed || 0);
    if (!sign && previousAim && String(previousAim.targetId || '') === targetId) sign = Math.sign(Number(previousAim.sign || 0));
    if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
    const noDamageBucket = noDamageLevel ? Math.floor(damage.widenMs / stepMs) + 1 : 0;
    const motionBucket = Math.round(motionScale * 10);
    const intercept = combatInterceptSolution(self, aimSource, distance, motionScale);
    const lockCompatible = previousAim
      && String(previousAim.targetId || '') === targetId
      && String(previousAim.movementMode || '') === movement.mode
      && String(previousAim.strategy || '') === String(aimStrategy.strategy || '')
      && Boolean(previousAim.passiveRunner) === Boolean(aimStrategy.passiveRunner)
      && Number(previousAim.noDamageBucket || 0) === noDamageBucket
      && Number(previousAim.motionBucket ?? motionBucket) === motionBucket
      && now() < Number(previousAim.until || 0);
    if (intercept) {
      const interceptStrategyReason = aimStrategy.passiveRunner
        ? (aimStrategy.reason || 'passive-runner-intercept')
        : (aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : 'quadratic-intercept');
      const interceptConfidence = clamp(Number(intercept.confidence || 0) * Number(opponentProfile.aimConfidenceScale || 1), 0.1, 1);
      let spreadAngle = 0;
      const locked = lockCompatible && Number.isFinite(Number(previousAim.spreadAngle));
      if (locked) {
        spreadAngle = Number(previousAim.spreadAngle);
        sign = Math.sign(Number(previousAim.sign || sign)) || sign;
      } else {
        const spreadScale = Math.max(0, Number(cfg.combatInterceptSpreadScale ?? 0.18))
          * (aimStrategy.passiveRunner
            ? Math.max(0, Number(cfg.combatPassiveRunnerInterceptSpreadScale ?? 0))
            : (aimStrategy.liveIntercept ? 0.35 : 1));
        const uncertainty = 1 - Math.max(0, Math.min(1, interceptConfidence));
        const randomLimit = jitterLimit * spreadScale * (0.35 + uncertainty) * (noDamageLevel ? 1.35 : 1);
        spreadAngle = (Math.random() * 2 - 1) * randomLimit;
        bot.combatAim = {
          targetId,
          angle: spreadAngle,
          spreadAngle,
          sign,
          movementMode: movement.mode,
          strategy: aimStrategy.strategy,
          passiveRunner: Boolean(aimStrategy.passiveRunner),
          noDamageBucket,
          motionBucket,
          intercept: true,
          until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
        };
      }
      const interceptDx = Number(intercept.x) - Number(self.x);
      const interceptDy = Number(intercept.y) - Number(self.y);
      const cos = Math.cos(spreadAngle);
      const sin = Math.sin(spreadAngle);
      const currentAngle = Math.atan2(dy, dx);
      const predictedAngle = Math.atan2(interceptDy, interceptDx);
      let relativeAngle = predictedAngle - currentAngle + spreadAngle;
      while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
      while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
      return {
        x: Number(self.x) + interceptDx * cos - interceptDy * sin,
        y: Number(self.y) + interceptDx * sin + interceptDy * cos,
        mode: 'intercept',
        moving,
        angle: relativeAngle,
        jitterLimit,
        distance,
        motionScale,
        movementMode: movement.mode,
        radialSpeed: movement.radialSpeed,
        lateralSpeed: movement.lateralSpeed,
        noDamageMs: damage.noDamageMs,
        noDamageWidened: Boolean(noDamageLevel),
        precisionAim: false,
        steadyAim: false,
        lockedAim: Boolean(locked),
        liveAim: Boolean(aimSource.nativeAimResolved),
        liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
        aimStrategy: aimStrategy.strategy,
        aimStrategyReason: interceptStrategyReason,
        sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
        sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
        serverStallAim: Boolean(aimStrategy.serverStall),
        liveInterceptAim: Boolean(aimStrategy.liveIntercept),
        realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
        radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
        fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
        passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
        passiveRunnerPrecisionLimited: Boolean(aimStrategy.passiveRunnerPrecisionLimited),
        interceptAim: true,
        interceptFlightTicks: intercept.flightTicks,
        interceptFlightMs: intercept.flightMs,
        interceptLeadDistance: intercept.leadDistance,
	        interceptConfidence,
	        aimConfidence: interceptConfidence,
	        opponentProfile
	      };
	    }
    let angle = 0;
    const locked = lockCompatible && Number.isFinite(Number(previousAim.angle));
    if (locked) {
      angle = Number(previousAim.angle);
      sign = Math.sign(Number(previousAim.sign || sign)) || sign;
    } else {
      const aimScale = clamp(Math.max(0.2, motionScale), 0.2, 1);
      const spreadScale = clamp(Math.max(0.35, motionScale), 0.35, 1);
      const minLead = Math.min(jitterLimit, Math.max(0, Number(cfg.combatAimLeadMinRadians) || 0) * aimScale);
      const lead = Math.min(jitterLimit, Math.max(minLead, jitterLimit * movement.leadScale * aimScale));
      const randomSpread = jitterLimit * (noDamageLevel ? 0.35 : 0.22) * spreadScale;
      angle = sign * lead + (Math.random() * 2 - 1) * randomSpread;
      if (Math.abs(angle) < minLead && minLead > 0) angle = sign * minLead;
      angle = clamp(angle, -jitterLimit, jitterLimit);
      bot.combatAim = {
        targetId,
        angle,
        sign,
        movementMode: movement.mode,
        strategy: aimStrategy.strategy,
        passiveRunner: Boolean(aimStrategy.passiveRunner),
        noDamageBucket,
        motionBucket,
        intercept: false,
        until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
      };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: Number(self.x) + dx * cos - dy * sin,
      y: Number(self.y) + dx * sin + dy * cos,
      mode: 'jitter',
      moving,
      angle,
      jitterLimit,
      distance,
      motionScale,
      movementMode: movement.mode,
      radialSpeed: movement.radialSpeed,
      lateralSpeed: movement.lateralSpeed,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: Boolean(noDamageLevel),
      precisionAim: false,
      steadyAim: false,
      lockedAim: Boolean(locked),
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : (aimStrategy.passiveRunner ? (aimStrategy.reason || 'passive-runner-intercept') : 'intercept-fallback'),
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      liveInterceptAim: Boolean(aimStrategy.liveIntercept),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      passiveRunnerPrecisionLimited: Boolean(aimStrategy.passiveRunnerPrecisionLimited),
      interceptAim: false,
	      aimConfidence: Math.max(0.2, Math.min(0.7, Number(opponentProfile.aimConfidenceScale || 1) * (1 - Math.min(0.65, motionScale * 0.35)))),
	      opponentProfile
	    };
	  }

  return {
    combatAimJitterLimit,
    combatAimMotionScale,
    combatMotionSample,
    combatMotionSamplesWithCurrent,
    combatOpponentProfile,
    combatTradeEstimate,
    combatShootingPlan,
    combatAimNoDamageLevel,
    combatAimNoDamageJitterLimit,
    combatAimSteadyNoDamageState,
    combatAimFallbackPrecisionState,
    combatMovementAimMode,
    combatInterceptSolution,
    combatLiveAimTarget,
    combatAimSourceDivergenceState,
    combatAimServerStallState,
    combatAimDynamicStrategyState,
    combatAimTarget
  };
}

module.exports = {
  createCombatAimRuntime
};
