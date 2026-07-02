'use strict';

function coinMotionNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function coinMotionTolerance(options = {}) {
  return coinMotionNumber(options.tolerance, coinMotionNumber(options.coinPrecisionTolerance, 250));
}

function coinAxisApproachDirectionCore(dxRaw, dyRaw, distance, options = {}, lock = null) {
  const tolerance = coinMotionTolerance(options);
  const absX = Math.abs(dxRaw);
  const absY = Math.abs(dyRaw);
  const minDistance = Math.max(0, Number(options.coinAxisApproachMinDistance || options.nearCoinStuckDistance || 0));
  if (Math.max(absX, absY) <= minDistance) return null;
  const baseRatio = Math.max(1, Number(options.coinAxisApproachRatio || 1));
  const laneTolerance = Math.max(tolerance, Number(options.coinAxisApproachLaneTolerance || 0));
  const xLocked = lock && lock.dx && !lock.dy;
  const yLocked = lock && lock.dy && !lock.dx;
  const xRatio = xLocked ? Math.max(1, baseRatio * 0.75) : baseRatio;
  const yRatio = yLocked ? Math.max(1, baseRatio * 0.75) : baseRatio;
  if (absX > tolerance && absX > absY && (absY <= laneTolerance || absX >= absY * xRatio)) {
    return { dx: Math.sign(dxRaw), dy: 0, distance, axisApproach: 'x' };
  }
  if (absY > tolerance && absY > absX && (absX <= laneTolerance || absY >= absX * yRatio)) {
    return { dx: 0, dy: Math.sign(dyRaw), distance, axisApproach: 'y' };
  }
  return null;
}

function coinPickupPrecisionPulseMsCore(distance, failureCount = 0, options = {}) {
  const d = Math.max(0, Number(distance) || 0);
  const stopDistance = Math.max(0, Number(options.coinPickupStopDistance || 0));
  const microDistance = Math.max(stopDistance, Number(options.coinPickupMicroDistance || 0));
  const fineDistance = Math.max(microDistance, Number(options.coinPickupFineDistance || 0));
  const brakeDistance = Math.max(fineDistance, Number(options.coinPickupBrakeDistance || 0));
  let pulse = Number(options.coinPickupSweepPulseMs) || 150;
  if (d <= stopDistance) {
    pulse = Number(options.coinPickupStopPulseMs) || Number(options.coinPickupMicroPulseMs) || 45;
  } else if (d <= microDistance) {
    pulse = Number(options.coinPickupMicroPulseMs) || Number(options.coinPickupFinePulseMs) || 60;
  } else if (d <= fineDistance) {
    pulse = Number(options.coinPickupFinePulseMs) || Number(options.coinPickupBrakePulseMs) || 75;
  } else if (d <= brakeDistance) {
    pulse = Number(options.coinPickupBrakePulseMs) || 90;
  }
  const slowStep = Math.max(0, Number(options.coinPickupFailureSlowStepMs || 0));
  const minPulse = Math.max(20, Number(options.coinPickupFailureMinPulseMs || 35));
  const slowMs = Math.max(0, Math.floor(Number(failureCount) || 0)) * slowStep;
  return Math.max(minPulse, Math.round(pulse - slowMs));
}

function coinAxisLockShouldHoldCore(lock, dxRaw, dyRaw, options = {}) {
  if (!lock || !(lock.dx || lock.dy)) return false;
  const axisRaw = lock.dx ? dxRaw : dyRaw;
  const axisSign = lock.dx || lock.dy;
  const brakeDistance = Math.max(
    Number(options.coinPrecisionTolerance || options.tolerance || 0),
    Number(options.coinApproachBrakeDistance || options.coinAxisFlipTolerance || 0)
  );
  return Math.sign(axisRaw) === axisSign && Math.abs(axisRaw) > brakeDistance;
}

function coinNearApproachAxisCore(dxRaw, dyRaw, absX, absY, tolerance, options = {}) {
  const brakeDistance = Math.max(tolerance, Number(options.coinApproachBrakeDistance || options.coinAxisFlipTolerance || 0));
  if (absX >= absY) {
    if (absX <= brakeDistance && absY > tolerance) return { dx: 0, dy: Math.sign(dyRaw) };
    return { dx: absX > tolerance ? Math.sign(dxRaw) : 0, dy: 0 };
  }
  if (absY <= brakeDistance && absX > tolerance) return { dx: Math.sign(dxRaw), dy: 0 };
  return { dx: 0, dy: absY > tolerance ? Math.sign(dyRaw) : 0 };
}

function coinDirectionToCore(self, target, options = {}) {
  const dxRaw = Number(target.x) - Number(self.x);
  const dyRaw = Number(target.y) - Number(self.y);
  const absX = Math.abs(dxRaw);
  const absY = Math.abs(dyRaw);
  const distance = Math.hypot(dxRaw, dyRaw);
  const t = coinMotionNumber(options.nowMs, 0);
  const id = String(target.drop_id ?? target.id ?? '');
  const lock = options.lock || null;
  const sameLock = lock && lock.id === id && t < Number(lock.until || 0) && (lock.dx || lock.dy);
  const tolerance = coinMotionTolerance(options);
  const exactTolerance = Math.max(0, Number(options.coinPickupExactTolerance ?? 0) || 0);
  const exactDirection = () => ({
    dx: absX > exactTolerance ? Math.sign(dxRaw) : 0,
    dy: absY > exactTolerance ? Math.sign(dyRaw) : 0
  });
  const withLockUpdate = (direction, lockUpdate = null) => ({ direction, lockUpdate });
  const setLock = (next, durationMs) => ({
    action: 'set',
    lock: { id, dx: next.dx, dy: next.dy, until: t + Math.max(0, Number(durationMs) || 0) }
  });
  const clearLock = (all = false) => ({ action: 'clear', id, all: Boolean(all) });

  if (distance <= options.coinPickupSweepDistance) {
    const pulse = Math.max(60, Number(options.coinPickupPulseMs) || 180);
    const pickupFailureCount = Math.max(0, Math.floor(Number(options.pickupFailureCount || 0)));
    const pickupAttemptSlowLevel = Math.max(0, Math.floor(Number(options.pickupAttemptSlowCount || 0)));
    const pickupSlowCount = pickupFailureCount + pickupAttemptSlowLevel;
    const precisionPulseMs = coinPickupPrecisionPulseMsCore(distance, pickupSlowCount, options);
    const locked = (next, extra = {}) => {
      if (next.dx || next.dy) {
        return withLockUpdate({
          ...next,
          distance,
          pickupSweep: true,
          locked: Boolean(sameLock),
          precisionPulseMs,
          pickupFailureCount,
          pickupAttemptSlowCount: pickupAttemptSlowLevel,
          ...extra
        }, setLock(next, pulse));
      }
      return withLockUpdate({ dx: 0, dy: 0, distance, pickupSweep: true, ...extra }, clearLock());
    };
    const dominantAxis = () => coinNearApproachAxisCore(dxRaw, dyRaw, absX, absY, tolerance, options);
    const direct = exactDirection();
    if (direct.dx || direct.dy) {
      return locked(direct, {
        exactTarget: true,
        pickupMicro: distance <= options.coinPickupMicroDistance,
        pickupFine: distance > options.coinPickupMicroDistance && distance <= options.coinPickupFineDistance,
        pushThrough: true
      });
    }

    if (distance <= options.coinPickupMicroDistance) {
      return locked({ dx: 0, dy: 0 }, { pickupMicro: true, exactTarget: true });
    }

    if (distance <= options.coinPickupFineDistance) {
      if (Math.floor(t / pulse) % 4 === 3) return locked({ dx: 0, dy: 0 }, { pickupFine: true });
      return locked(dominantAxis(), { pickupFine: true, pushThrough: true });
    }

    if (Math.floor(t / pulse) % 3 === 2) return locked({ dx: 0, dy: 0 });
    return locked(dominantAxis());
  }

  if (distance <= tolerance) {
    return withLockUpdate({ dx: 0, dy: 0, distance }, clearLock(true));
  }
  const axisApproach = coinAxisApproachDirectionCore(dxRaw, dyRaw, distance, options, sameLock ? lock : null);
  if (axisApproach) {
    return withLockUpdate({ ...axisApproach, locked: Boolean(sameLock) }, setLock(axisApproach, options.coinApproachLockMs));
  }
  if (distance <= options.nearCoinStuckDistance && Math.max(absX, absY) > tolerance) {
    if (sameLock) {
      if (coinAxisLockShouldHoldCore(lock, dxRaw, dyRaw, options)) {
        return withLockUpdate({ dx: lock.dx, dy: lock.dy, distance, locked: true });
      }
    }
    const next = coinNearApproachAxisCore(dxRaw, dyRaw, absX, absY, tolerance, options);
    if (!(next.dx || next.dy)) return withLockUpdate({ dx: 0, dy: 0, distance, braking: true }, clearLock());
    return withLockUpdate({ ...next, distance }, setLock(next, options.coinApproachLockMs));
  }
  if (distance <= options.nearCoinStuckDistance) {
    const next = coinNearApproachAxisCore(dxRaw, dyRaw, absX, absY, tolerance, options);
    if (!(next.dx || next.dy)) return withLockUpdate({ dx: 0, dy: 0, distance, braking: true }, clearLock());
    return withLockUpdate({ ...next, distance }, setLock(next, options.coinApproachLockMs));
  }
  return withLockUpdate({
    dx: absX > tolerance ? Math.sign(dxRaw) : 0,
    dy: absY > tolerance ? Math.sign(dyRaw) : 0,
    distance
  }, clearLock(true));
}

function coinMotionMetaCore(dir) {
  const meta = {};
  if (dir?.precisionPulseMs) meta.precisionPulseMs = Math.round(Number(dir.precisionPulseMs));
  const pickupFailureCount = Math.max(0, Math.floor(Number(dir?.pickupFailureCount || 0)));
  const pickupAttemptSlowCount = Math.max(0, Math.floor(Number(dir?.pickupAttemptSlowCount || 0)));
  if (pickupFailureCount) meta.pickupFailureCount = pickupFailureCount;
  if (pickupAttemptSlowCount) meta.pickupAttemptSlowCount = pickupAttemptSlowCount;
  if (pickupFailureCount || pickupAttemptSlowCount) meta.pickupSlowCount = pickupFailureCount + pickupAttemptSlowCount;
  if (dir?.pickupMicro) meta.pickupMode = dir.crossSweep ? 'micro-cross-sweep' : 'micro';
  else if (dir?.pickupFine) meta.pickupMode = 'fine';
  else if (dir?.pickupSweep) meta.pickupMode = 'sweep';
  else if (dir?.axisApproach) meta.routeMode = 'axis-approach-' + dir.axisApproach;
  if (dir?.locked) meta.motionLocked = true;
  if (dir?.pushThrough) meta.pushThrough = true;
  if (dir?.braking) meta.routeMode = 'coin-brake';
  return meta;
}

module.exports = {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
};
