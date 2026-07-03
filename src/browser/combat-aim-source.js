'use strict';

function combatAimSource() {
  return String.raw`  function combatAimJitterLimit(distance, motionScale = 1) {
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

`;
}

module.exports = { combatAimSource };
