'use strict';

function createCombatMovementRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    hypot = Math.hypot,
    dist = () => Infinity,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    staminaRemaining = () => NaN,
    staminaExhaustedThreshold = () => 0,
    combatMovementBlockedByStamina = () => false,
    isCurrentlyActive = () => false,
    isFiringEntity = () => false,
    isMovingThreat = () => false,
    hpValue = () => 0,
    dropValue = () => 0,
    normalizeBullet = value => value,
    getBullets = () => [],
    recentCombatInjuryActive = () => null,
    combatDodgeThreatRange = () => 0
  } = runtime;

  function combatMoveVelocityForDirection(dx, dy) {
    const x = clamp(Math.round(Number(dx) || 0), -1, 1);
    const y = clamp(Math.round(Number(dy) || 0), -1, 1);
    if (!(x || y)) return { vx: 0, vy: 0 };
    const speedPerTick = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const axisSpeed = x && y ? Math.round(speedPerTick / Math.SQRT2) : speedPerTick;
    return { vx: x * axisSpeed, vy: y * axisSpeed };
  }

  function combatBulletThreats(self, target = null, bullets = getBullets()) {
    const selfId = Number(self?.user_id);
    const items = [];
    for (const raw of bullets || []) {
      const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) {
        continue;
      }
      const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const impactTicks = projection / speedValue;
      const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      items.push({
        id: bullet.id,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        distance,
        projection,
        laneDistance,
        signedLaneDistance,
        impactTicks,
        timeToImpactMs,
        hitRadius,
        directHit: laneDistance <= hitRadius,
        score
      });
    }
    return items.sort((a, b) => b.score - a.score || a.timeToImpactMs - b.timeToImpactMs);
  }

  function incomingBulletThreat(self, target = null, bullets = getBullets()) {
    const threats = combatBulletThreats(self, target, bullets);
    const best = threats[0] || null;
    if (!best) return null;
    return {
      ...best,
      threatCount: threats.length,
      threats: threats.slice(0, 6)
    };
  }

  function combatThreatFieldCandidate(self, threats, dx, dy) {
    const move = combatMoveVelocityForDirection(dx, dy);
    let safetyScore = 0;
    let minCpaDistance = Infinity;
    let minTimeToImpactMs = Infinity;
    let directHitCount = 0;
    for (const threat of threats || []) {
      const rx = Number(threat.x) - Number(self.x);
      const ry = Number(threat.y) - Number(self.y);
      const rvx = (Number(threat.vx) || 0) - move.vx;
      const rvy = (Number(threat.vy) || 0) - move.vy;
      const relSpeedSq = rvx * rvx + rvy * rvy;
      const rawImpactTicks = Number(threat.impactTicks);
      const horizonTicks = Math.max(0, Math.min(
        Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
        Number(cfg.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500))
      ));
      const cpaTicks = relSpeedSq > 0.000001
        ? clamp(-(rx * rvx + ry * rvy) / relSpeedSq, 0, horizonTicks)
        : 0;
      const cpaX = rx + rvx * cpaTicks;
      const cpaY = ry + rvy * cpaTicks;
      const cpaDistance = Math.hypot(cpaX, cpaY);
      const hitRadius = Math.max(0, Number(threat.hitRadius ?? cfg.combatBulletHitRadiusCm ?? 90));
      const timeToImpactMs = Number(threat.timeToImpactMs);
      const urgency = Number.isFinite(timeToImpactMs) ? Math.max(0.35, 1.8 - Math.min(1500, timeToImpactMs) / 1500) : 1;
      minCpaDistance = Math.min(minCpaDistance, cpaDistance);
      if (Number.isFinite(timeToImpactMs)) minTimeToImpactMs = Math.min(minTimeToImpactMs, timeToImpactMs);
      if (cpaDistance <= hitRadius) directHitCount += 1;
      safetyScore += Math.min(5000, cpaDistance) * urgency;
      if (cpaDistance <= hitRadius) safetyScore -= (hitRadius - cpaDistance + 1) * 100000 * urgency;
      else if (cpaDistance <= hitRadius * 3) safetyScore -= (hitRadius * 3 - cpaDistance) * 300 * urgency;
    }
    return {
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      safetyScore,
      minCpaDistance,
      minTimeToImpactMs,
      directHitCount
    };
  }

  function combatBulletThreatField(self, threats, options = {}) {
    const list = (threats || []).filter(Boolean).slice(0, 6);
    if (!list.length) return null;
    const preferred = options.preferred || {};
    const preferredDx = clamp(Math.round(Number(preferred.dx) || 0), -1, 1);
    const preferredDy = clamp(Math.round(Number(preferred.dy) || 0), -1, 1);
    const target = options.target || null;
    const approachX = target ? Math.sign(Number(target.x) - Number(self.x)) || 0 : 0;
    const approachY = target ? Math.sign(Number(target.y) - Number(self.y)) || 0 : 0;
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    const scored = directions.map(item => {
      const candidate = combatThreatFieldCandidate(self, list, item.dx, item.dy);
      let bias = 0;
      if (candidate.dx === preferredDx && candidate.dy === preferredDy) bias += 120;
      if (options.preferClosing) {
        if (candidate.dx && approachX && candidate.dx === approachX) bias += 40;
        if (candidate.dy && approachY && candidate.dy === approachY) bias += 40;
      }
      return { ...candidate, safetyScore: candidate.safetyScore + bias };
    }).sort((a, b) => {
      if (a.directHitCount !== b.directHitCount) return a.directHitCount - b.directHitCount;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return b.minCpaDistance - a.minCpaDistance;
    });
    const best = scored[0] || null;
    if (!best) return null;
    return best;
  }

  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }

  function combatStrafeKey(target, pressure) {
    const ownerId = pressure?.ownerId;
    if (ownerId !== null && ownerId !== undefined) return 'owner:' + ownerId;
    const targetId = target?.user_id ?? target?.id;
    if (targetId !== null && targetId !== undefined) return 'target:' + targetId;
    return 'combat';
  }

  function combatStrafeMatchesTarget(strafe, target) {
    if (!strafe) return false;
    const targetId = target?.user_id ?? target?.id;
    if (targetId === null || targetId === undefined) return true;
    const key = String(targetId);
    return strafe.targetId === key || strafe.key === 'target:' + key || strafe.key === 'owner:' + key;
  }

  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }

  function selectCombatStrafeSign(existing, key, preciseSign, t = now()) {
    let sign = 0;
    let until = 0;
    let locked = false;
    let lockOverridden = false;
    const existingUntil = Number(existing?.until || 0);
    if (existing && existing.key === key && t < existingUntil) {
      const existingSign = Math.sign(Number(existing.sign || 0));
      const precise = Math.sign(Number(preciseSign || 0));
      if (precise && existingSign && existingSign !== precise) {
        sign = precise;
        until = t + combatStrafeHoldMs();
        lockOverridden = true;
      } else {
        sign = existingSign;
        until = existingUntil;
        locked = Boolean(sign);
      }
    }
    if (!sign) {
      sign = Math.sign(Number(preciseSign || 0)) || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }
    return { sign, until, locked, lockOverridden };
  }

	  function combatStrafeVector(self, target, pressure, sign, options = {}) {
	    let baseX = Number(pressure?.vx) || 0;
	    let baseY = Number(pressure?.vy) || 0;
	    if (!(baseX || baseY) && target) {
      baseX = Number(target.x) - Number(self.x);
      baseY = Number(target.y) - Number(self.y);
    }
    const tangentX = -baseY * sign;
	    const tangentY = baseX * sign;
	    let dx = Math.sign(tangentX || 0);
	    let dy = Math.sign(tangentY || 0);
    let closingBiased = false;
	    if (target) {
	      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
	      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
	      const approachX = Math.sign(Number(target.x) - Number(self.x)) || 0;
	      const approachY = Math.sign(Number(target.y) - Number(self.y)) || 0;
	      const fillX = options.preferClosing ? approachX : awayX;
	      const fillY = options.preferClosing ? approachY : awayY;
	      if (dx && !dy && fillY) dy = fillY;
	      else if (dy && !dx && fillX) dx = fillX;
      if (options.preferClosing && dx && dy) {
        const closesX = Boolean(approachX && Math.sign(dx) === approachX);
        const closesY = Boolean(approachY && Math.sign(dy) === approachY);
        if (!closesX && !closesY) {
          const offsetX = Math.abs(Number(target.x) - Number(self.x));
          const offsetY = Math.abs(Number(target.y) - Number(self.y));
          if (offsetX >= offsetY && approachX) {
            closingBiased = Math.sign(dx) !== approachX;
            dx = approachX;
          } else if (approachY) {
            closingBiased = Math.sign(dy) !== approachY;
            dy = approachY;
          }
        }
      }
	    }
	    if (!(dx || dy) && target) {
	      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
	      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
	    }
	    return { dx: clamp(Math.round(dx), -1, 1), dy: clamp(Math.round(dy), -1, 1), closingBiased };
	  }

  function tangentMoveForBullet(self, target, pressure, options = {}) {
    const t = now();
    const existing = bot.combatStrafe;
    if (!pressure) {
      if (combatStrafeMatchesTarget(existing, target)
        && t < Number(existing?.carryUntil || 0)
        && (existing.dx || existing.dy)) {
        return {
          dx: clamp(Math.round(Number(existing.dx) || 0), -1, 1),
          dy: clamp(Math.round(Number(existing.dy) || 0), -1, 1),
          locked: true,
          carried: true,
          active: true,
          sign: Number(existing.sign || 0),
          key: existing.key,
          holdRemainingMs: Math.max(0, Math.round(Number(existing.until || 0) - t)),
          carryRemainingMs: Math.max(0, Math.round(Number(existing.carryUntil || 0) - t))
        };
      }
      return { dx: 0, dy: 0, locked: false, carried: false, active: false };
    }

    const key = combatStrafeKey(target, pressure);
    const preciseSign = combatPreciseStrafeSign(pressure);
    const strafeSign = selectCombatStrafeSign(existing, key, preciseSign, t);
    const sign = strafeSign.sign;
    const until = strafeSign.until;

	    let { dx, dy, closingBiased } = combatStrafeVector(self, target, pressure, sign, options);
    const threatField = !pressure.synthetic
      ? combatBulletThreatField(self, pressure.threats || [pressure], {
        preferred: { dx, dy },
        target,
        preferClosing: Boolean(options.preferClosing)
      })
      : null;
    if (threatField) {
      dx = threatField.dx;
      dy = threatField.dy;
    }
    if (!(dx || dy) && existing && (existing.dx || existing.dy)) {
      dx = clamp(Math.round(Number(existing.dx) || 0), -1, 1);
      dy = clamp(Math.round(Number(existing.dy) || 0), -1, 1);
    }
    const carryMs = Math.max(0, Number(cfg.combatStrafeCarryMs) || 0);
    const targetId = target?.user_id ?? target?.id;
    bot.combatStrafe = {
      key,
      targetId: targetId !== null && targetId !== undefined ? String(targetId) : '',
      ownerId: pressure.ownerId !== null && pressure.ownerId !== undefined ? String(pressure.ownerId) : '',
      sign,
      dx,
      dy,
      threatField,
      until,
      carryUntil: t + carryMs
    };
    return {
	      dx,
	      dy,
	      locked: Boolean(strafeSign.locked),
	      lockOverridden: Boolean(strafeSign.lockOverridden),
      closingBiased: Boolean(closingBiased),
	      carried: false,
      threatField,
      active: true,
      sign,
      precise: Boolean(preciseSign),
      key,
      holdRemainingMs: Math.max(0, Math.round(until - t)),
      carryRemainingMs: carryMs
    };
  }

  function combatMoveClosesDistance(self, target, move) {
    const dx = clamp(Math.round(Number(move?.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(move?.dy) || 0), -1, 1);
    if (!(dx || dy) || !self || !target) return false;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    return (toTargetX * dx + toTargetY * dy) > 0;
  }

  function combatSafeCloseMoveOverride(self, target, pressure, closeMove) {
    if (!self || !target || !pressure || pressure.synthetic || !closeMove?.active) return null;
    const dx = clamp(Math.round(Number(closeMove.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(closeMove.dy) || 0), -1, 1);
    if (!(dx || dy) || !combatMoveClosesDistance(self, target, { dx, dy })) return null;
    const candidate = combatThreatFieldCandidate(self, pressure.threats || [pressure], dx, dy);
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const minSafeCpa = Math.max(hitRadius * 3, Number(cfg.combatPressureCloseMinCpaCm || 0));
    if (candidate.directHitCount > 0) return null;
    if (Number.isFinite(Number(candidate.minCpaDistance)) && Number(candidate.minCpaDistance) < minSafeCpa) return null;
    return {
      dx,
      dy,
      active: true,
      reason: closeMove.reason || 'safe-close',
      source: closeMove,
      threatField: candidate,
      minSafeCpa
    };
  }

  function combatSpacingVector(self, target, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minRange = Math.max(0, Number(cfg.combatSpacingMinRange || 0));
    const preferredRange = Math.max(minRange, Number(cfg.combatSpacingPreferredRange || minRange));
    if (!(distance > 0) || !minRange) return { active: false, dx: 0, dy: 0 };
    const dxRaw = Number(self.x) - Number(target.x);
    const dyRaw = Number(self.y) - Number(target.y);
    let dx = Math.sign(dxRaw) || 0;
    let dy = Math.sign(dyRaw) || 0;
    if (!(dx || dy)) dx = -Math.sign(Number(target.vx) || 0) || 1;
    const targetVx = Number(target.vx) || 0;
    const targetVy = Number(target.vy) || 0;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    const d = Math.max(1, distance);
    const radialSpeed = (toTargetX / d) * targetVx + (toTargetY / d) * targetVy;
    const tooClose = distance < minRange;
    const closing = radialSpeed <= -cfg.combatStationarySpeed && distance < preferredRange;
    if (!tooClose && !closing) return { active: false, dx: 0, dy: 0, distance, minRange, preferredRange, radialSpeed };
    return {
      active: true,
      dx: clamp(Math.round(dx), -1, 1),
      dy: clamp(Math.round(dy), -1, 1),
      distance,
      minRange,
      preferredRange,
      radialSpeed,
      reason: tooClose ? 'too-close' : 'closing'
    };
  }

  function combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp) {
    if (!spacing?.active || spacing.reason !== 'too-close') return false;
    const distance = Number(spacing.distance);
    const emergencyRange = Math.max(0, Number(cfg.combatSpacingEmergencyRange || 0));
    const lowHpThreshold = Math.max(0, Number(cfg.combatSpacingLowHpThreshold || cfg.combatLowHpLeaveThreshold || 0));
    const hp = Number(selfHp);
    const emergencyClose = emergencyRange > 0 && Number.isFinite(distance) && distance <= emergencyRange;
    const lowHpClose = lowHpThreshold > 0 && Number.isFinite(hp) && hp < lowHpThreshold;
    return Boolean(emergencyClose || lowHpClose);
  }

  function combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0));
    const margin = Math.max(0, Number(cfg.combatLowHpCloseRiskMargin || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    if (!threshold || !margin || !Number.isFinite(hp) || !Number.isFinite(enemyHp)) return null;
    if (!(hp < threshold) || !(hp <= enemyHp + margin)) return null;
    if (!spacing?.active || spacing.reason !== 'too-close') return null;
    if (!realBulletPressure && !combatSpacingShouldOverrideBullet(spacing, hp, enemyHp)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap: enemyHp - hp,
      margin,
      distance: Math.round(Number(spacing.distance || 0)),
      realBulletPressure: Boolean(realBulletPressure)
    };
  }

  function combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatPressureExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureExitHpGap || 0));
    const range = Math.max(0, Number(cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const hpGap = enemyHp - hp;
    if (!threshold || !minGap || !range || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp < threshold) || !(hpGap >= minGap) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      distance: Math.round(distance),
      realBulletPressure: true
    };
  }

  function combatSustainedPressureDisadvantageState(selfHp, targetHp, targetDistance, noDamageMs, targetRealBulletPressure = false) {
    const waitMs = Math.max(0, Number(cfg.combatPressureNoDamageExitMs || 0));
    const threshold = Math.max(0, Number(cfg.combatPressureNoDamageExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureNoDamageExitHpGap || 0));
    const targetHpMin = Math.max(0, Number(cfg.combatPressureNoDamageExitTargetHpMin || 0));
    const range = Math.max(0, Number(cfg.combatPressureNoDamageExitRange || cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hpGap = enemyHp - hp;
    if (!waitMs || !threshold || !minGap || !range || !targetRealBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      targetHpMin,
      noDamageMs: Math.round(elapsed),
      waitMs,
      distance: Math.round(distance),
      targetRealBulletPressure: true
    };
  }

  function combatPressureCloseVector(self, target, targetDistance, noDamageMs, selfHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    if (!thresholdMs || elapsed < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: elapsed,
      reason: 'long-no-damage'
    };
  }

  function combatFarNoDamageCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatFarNoDamageCloseMinHp || cfg.combatPressureCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    if (!thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      reason: 'far-no-damage'
    };
  }

  function combatRetreatingFighterCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatRetreatingFighterCloseMinHp || cfg.combatFarNoDamageCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatRetreatingFighterCloseMaxHpGap || cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    const activeRetreating = Boolean(retreatingTarget?.active && !retreatingTarget?.disengage);
    if (!activeRetreating || !targetRealBulletPressure || !thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, retreatingTarget };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      targetRealBulletPressure: true,
      farNoDamageClose: true,
      reason: 'retreating-fighter-close',
      retreatingTarget
    };
  }

  function combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatFinishPressureTargetHpMax || 0));
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatFinishPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const inAttackRange = attackRange > 0 && distance <= attackRange;
    const retreatingEdge = Boolean(retreatingTarget?.active && retreatingTarget?.reason === 'target-retreating-edge');
    if (!retreatingEdge || !inAttackRange || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      minSelfHp,
      maxTargetHp,
      reason: 'low-hp-retreating-target',
      retreatingTarget
    };
  }

  function combatOutOfRangeFinishPressureState(self, target, targetDistance, selfHp, targetHp, damageState = null, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeFinishPressureRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureTargetHpMax || 0));
    const maxHpGap = Number.isFinite(Number(cfg.combatOutOfRangeFinishPressureMaxHpGap))
      ? Number(cfg.combatOutOfRangeFinishPressureMaxHpGap)
      : 0;
    const recentDamageMs = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureRecentDamageMs || 0));
    const noDamageMs = Math.max(0, Number(damageState?.noDamageMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!recentDamageMs || noDamageMs > recentDamageMs) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp || hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, hpGap, noDamageMs };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs,
      recentDamageMs,
      reason: 'out-of-range-low-hp-finish',
      retreatingTarget
    };
  }

  function combatOutOfRangeReengageState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeReengageRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeReengageMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatOutOfRangeReengageMaxHpGap || 0));
    const pressureMaxHpGap = Math.max(maxHpGap, Number(cfg.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
    const effectiveMaxHpGap = targetRealBulletPressure ? pressureMaxHpGap : maxHpGap;
    const recentInRangeMs = Math.max(0, Number(cfg.combatOutOfRangeReengageRecentInRangeMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    const outOfRangeMs = Math.max(0, Number(target?.combatEngagement?.outOfRangeMs || 0));
    const graceRemainingMs = Math.max(0, Number(target?.combatEngagement?.graceRemainingMs || 0));
    const engagedIntent = /^(engaged|reengage)$/.test(String(target?.combatIntent || ''))
      || Boolean(target?.combatEngagement);
    const freshInRangeContact = Boolean(
      recentInRangeMs
      && outOfRangeMs <= recentInRangeMs
      && !retreatingTarget?.active
    );
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (!engagedIntent) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (retreatingTarget?.active && !targetRealBulletPressure) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!targetRealBulletPressure && !freshInRangeContact) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || hpGap > effectiveMaxHpGap || combatMovementBlockedByStamina(self)) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        minSelfHp,
        maxHpGap: effectiveMaxHpGap,
        baseMaxHpGap: maxHpGap,
        pressureMaxHpGap,
        outOfRangeMs,
        graceRemainingMs,
        targetRealBulletPressure: Boolean(targetRealBulletPressure),
        freshInRangeContact,
        retreatingTarget
      };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      minSelfHp,
      maxHpGap: effectiveMaxHpGap,
      baseMaxHpGap: maxHpGap,
      pressureMaxHpGap,
      outOfRangeMs,
      graceRemainingMs,
      targetRealBulletPressure: Boolean(targetRealBulletPressure),
      freshInRangeContact,
      reason: targetRealBulletPressure ? 'target-real-bullet-pressure' : 'fresh-in-range-contact',
      retreatingTarget
    };
  }

  function combatPassiveRunnerState(self, target, targetDistance, damageState = null, pressure = null, motionScale = 0) {
    const t = Date.now();
    const selfHp = hpValue(self);
    const minSelfHp = Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const minDrop = Math.max(0, Number(cfg.combatPassiveRunnerMinDrop || 0));
    const confirmMs = Math.max(0, Number(cfg.combatPassiveRunnerConfirmMs || 0));
    const targetDrop = Math.max(0, Number(dropValue(target) || target?.drop || 0));
    const active = isCurrentlyActive(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || Number(motionScale || 0) >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const realPressure = Boolean(pressure && !pressure.synthetic);
    const recentlyInjured = bot.pendingInjuryLeave
      && Date.now() - Number(bot.pendingInjuryLeave.at || 0) <= cfg.combatStrafeLockMs * 3;
    const current = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target) ? bot.combatTarget : null;
    const samples = Array.isArray(current?.motionSamples) ? current.motionSamples : [];
    const firstSelfHp = samples.length ? Number(samples[0].selfHp) : null;
    const lastSelfHp = samples.length ? Number(samples[samples.length - 1].selfHp) : null;
    const recentSelfDamage = Number.isFinite(firstSelfHp) && Number.isFinite(lastSelfHp)
      ? Math.max(0, firstSelfHp - lastSelfHp)
      : 0;
    const intent = String(target?.combatIntent || current?.intent || '');
    const originIntent = String(current?.originIntent || current?.intent || intent);
    const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
    const rewarded = targetDrop >= minDrop || runnerIntent;
    const engagedMs = current
      ? Math.max(0, t - Number(current.firstSeenAt || current.at || t))
      : 0;
    const confirmed = engagedMs >= confirmMs;
    const seenTargetRealBulletAt = Number(current?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, t - seenTargetRealBulletAt) : 0;
    const eligible = Boolean(
      active
      && moving
      && runnerIntent
      && rewarded
      && !isFiringEntity(target)
      && !isInvulnerable(target)
      && !realPressure
      && !recentlyInjured
      && confirmed
      && !seenTargetRealBulletAt
      && Number.isFinite(selfHp)
      && selfHp >= minSelfHp
      && recentSelfDamage <= 0.01
    );
    return {
      active: eligible,
      selfHp,
      minSelfHp,
      targetDrop,
      minDrop,
      distance: Number.isFinite(Number(targetDistance)) ? Math.round(Number(targetDistance)) : null,
      moving,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(Number(motionScale).toFixed(2)) : 0,
      recentSelfDamage,
      pressureReason: pressure?.reason || '',
      combatIntent: intent,
      originIntent,
      engagedMs,
      confirmMs,
      confirmed,
      seenTargetRealBulletAt: seenTargetRealBulletAt || 0,
      seenTargetRealBulletMs,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatPassiveRunnerCloseVector(self, target, targetDistance, runnerState) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPassiveRunnerCloseRange || 0)
    );
    if (!runnerState?.active || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, reason: 'passive-runner' };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: Math.max(0, Number(runnerState.noDamageMs || 0)),
      reason: 'passive-runner'
    };
  }

  function mergeCombatMove(primary, spacing, allowSpacingMerge = true) {
    if (!spacing?.active || !allowSpacingMerge) return primary || { dx: 0, dy: 0 };
    const current = primary || { dx: 0, dy: 0 };
    const mergeAxis = (value, spacingValue) => {
      const v = clamp(Math.round(Number(value) || 0), -1, 1);
      const s = clamp(Math.round(Number(spacingValue) || 0), -1, 1);
      if (v && s && Math.sign(v) !== Math.sign(s)) return s;
      return v || s;
    };
    return {
      ...current,
      dx: mergeAxis(current.dx, spacing.dx),
      dy: mergeAxis(current.dy, spacing.dy),
      spacingMerged: true
    };
  }

  function combatPressureThreat(self, target, bullets) {
    const bullet = target.incomingBullet || incomingBulletThreat(self, target, bullets) || incomingBulletThreat(self, null, bullets);
    if (bullet) return { ...bullet, reason: 'incoming-bullet' };
    const injury = bot.pendingInjuryLeave;
    const recentlyInjured = injury && Date.now() - Number(injury.at || 0) <= cfg.combatStrafeLockMs * 3;
    const pressure = recentlyInjured || isFiringEntity(target) || isCurrentlyActive(target);
    if (!pressure) return null;
    const vx = Number(self.x) - Number(target.x);
    const vy = Number(self.y) - Number(target.y);
    const distance = Math.hypot(vx, vy);
    return {
      id: 'pressure:' + (target.user_id ?? target.id ?? ''),
      ownerId: target.user_id ?? null,
      x: Number(target.x),
      y: Number(target.y),
      vx,
      vy,
      distance,
      projection: distance,
      laneDistance: 0,
      synthetic: true,
      reason: recentlyInjured ? 'recent-injury' : 'target-pressure'
    };
  }

  function combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget = null, closeMove = null) {
    if (!pressure || pressure.synthetic) return null;
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const targetDistance = Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target);
    if (!attackRange || !(targetDistance > attackRange) || !(targetDistance <= dodgeRange)) return null;
    const spacing = combatSpacingVector(self, target, targetDistance);
    const closeOverride = combatSafeCloseMoveOverride(self, target, pressure, closeMove);
    const strafe = closeOverride
      ? {
        dx: closeOverride.dx,
        dy: closeOverride.dy,
        active: true,
        closingBiased: true,
        safeCloseOverride: closeOverride
      }
      : tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const spacingOverride = combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = mergeCombatMove(strafe, spacing, spacingOverride);
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const spacingActive = Boolean(spacing.active && (combatMove.dx || combatMove.dy));
    return {
      kind: 'attack',
      reason: movementSuppressed ? 'combat-stamina-hold' : (spacingOverride ? 'combat-spacing-dodge' : 'combat-out-of-range-dodge'),
      combat: true,
      combatDodgeOnly: true,
      ignoreReturnBlock: true,
      shoot: false,
      forceShoot: false,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: {
        ...baseTarget,
        combatDodgeOnly: true
      },
      incomingBullet: {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: false,
        reason: pressure.reason || 'incoming-bullet'
      },
      combatState: {
        selfHp,
        targetHp,
        dodgeOnly: {
          distance: Math.round(targetDistance),
          attackRange: Math.round(attackRange),
          dodgeRange: Math.round(dodgeRange),
          buffer: Math.max(0, Math.round(dodgeRange - attackRange)),
          reason: 'incoming-bullet-outside-attack-range'
        },
        strafe: {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
          precise: Boolean(strafe.precise),
          locked: Boolean(strafe.locked),
          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
          safeCloseOverride: closeOverride ? {
            dx: closeOverride.dx,
            dy: closeOverride.dy,
            reason: closeOverride.reason,
            minCpaDistance: Number.isFinite(Number(closeOverride.threatField?.minCpaDistance)) ? Math.round(Number(closeOverride.threatField.minCpaDistance)) : null,
            directHitCount: Number(closeOverride.threatField?.directHitCount || 0)
          } : null,
          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0,
          spacingMerged: Boolean(combatMove.spacingMerged),
          threatField: strafe.threatField ? {
            dx: strafe.threatField.dx,
            dy: strafe.threatField.dy,
            directHitCount: strafe.threatField.directHitCount,
            minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
            minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
          } : null
        },
        spacing: spacingActive ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          radialSpeed: Number.isFinite(Number(spacing.radialSpeed)) ? Math.round(Number(spacing.radialSpeed)) : null,
          merged: Boolean(combatMove.spacingMerged),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        movementSuppressed,
        retreatingTarget: retreatingTarget?.active ? retreatingTarget : null
      }
    };
  }

  return {
    combatMoveVelocityForDirection,
    combatBulletThreats,
    incomingBulletThreat,
    combatThreatFieldCandidate,
    combatBulletThreatField,
    combatStrafeHoldMs,
    combatStrafeKey,
    combatStrafeMatchesTarget,
    combatPreciseStrafeSign,
    selectCombatStrafeSign,
    tangentMoveForBullet,
    combatMoveClosesDistance,
    combatSafeCloseMoveOverride,
    combatSpacingVector,
    combatSpacingShouldOverrideBullet,
    combatLowHpCloseRiskState,
    combatPressureDisadvantageState,
    combatSustainedPressureDisadvantageState,
    combatPressureCloseVector,
    combatFarNoDamageCloseVector,
    combatRetreatingFighterCloseVector,
    combatFinishPressureState,
    combatOutOfRangeFinishPressureState,
    combatOutOfRangeReengageState,
    combatPassiveRunnerState,
    combatPassiveRunnerCloseVector,
    mergeCombatMove,
    combatPressureThreat,
    combatOutOfRangeDodgeAction
  };
}

module.exports = {
  createCombatMovementRuntime
};
