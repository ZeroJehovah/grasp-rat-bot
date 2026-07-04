'use strict';

const {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
} = require('./runtime/coin-motion');

function coinDirectionToCall(selfExpr, targetExpr, toleranceExpr = 'cfg.coinPrecisionTolerance', options = {}) {
  const tolerance = toleranceExpr || 'cfg.coinPrecisionTolerance';
  if (!options.bundledRuntime) {
    const toleranceArg = tolerance === 'cfg.coinPrecisionTolerance' ? '' : `, ${tolerance}`;
    return `coinDirectionTo(${selfExpr}, ${targetExpr}${toleranceArg})`;
  }
  return String.raw`(() => {
      const coinDirectionSelf = ${selfExpr};
      const coinDirectionTarget = ${targetExpr};
      const coinDirectionDxRaw = Number(coinDirectionTarget.x) - Number(coinDirectionSelf.x);
      const coinDirectionDyRaw = Number(coinDirectionTarget.y) - Number(coinDirectionSelf.y);
      const coinDirectionDistance = hypot(coinDirectionDxRaw, coinDirectionDyRaw);
      const coinDirectionAt = now();
      const coinDirectionId = String(coinDirectionTarget.drop_id ?? coinDirectionTarget.id ?? '');
      const coinDirectionResult = coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions(${tolerance}, {
        nowMs: coinDirectionAt,
        lock: bot.coinApproachLock,
        pickupFailureCount: coinPickupFailureCount(coinDirectionId, coinDirectionAt),
        pickupAttemptSlowCount: coinPickupAttemptSlowCount(coinDirectionId, coinDirectionDistance, coinDirectionAt)
      }));
      applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate);
      return coinDirectionResult.direction;
    })()`;
}

function coinMotionRuntimeInlineSource(helpers = {}, options = {}) {
  const {
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore
  } = helpers;
  const coinMotionHelperSource = [
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore
  ].map(fn => typeof fn === 'function' ? `  ${fn.toString()}` : '').join('\n');
  const localCoinDirectionToSource = options.bundledRuntime ? '' : String.raw`
  function coinDirectionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const distance = hypot(dxRaw, dyRaw);
    const t = now();
    const id = String(target.drop_id ?? target.id ?? '');
    const result = coinDirectionToCore(self, target, coinMotionCoreOptions(tolerance, {
      nowMs: t,
      lock: bot.coinApproachLock,
      pickupFailureCount: coinPickupFailureCount(id, t),
      pickupAttemptSlowCount: coinPickupAttemptSlowCount(id, distance, t)
    }));
    applyCoinApproachLockUpdate(result.lockUpdate);
    return result.direction;
  }

`;
  return String.raw`  function directionTo(self, target, tolerance = 250) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance: hypot(dxRaw, dyRaw)
    };
  }

${coinMotionHelperSource}

  function coinMotionCoreOptions(tolerance = cfg.coinPrecisionTolerance, extra = {}) {
    return {
      tolerance,
      coinPrecisionTolerance: cfg.coinPrecisionTolerance,
      coinAxisApproachMinDistance: cfg.coinAxisApproachMinDistance,
      coinAxisApproachRatio: cfg.coinAxisApproachRatio,
      coinAxisApproachLaneTolerance: cfg.coinAxisApproachLaneTolerance,
      coinPickupStopDistance: cfg.coinPickupStopDistance,
      coinPickupStopPulseMs: cfg.coinPickupStopPulseMs,
      coinPickupMicroDistance: cfg.coinPickupMicroDistance,
      coinPickupMicroPulseMs: cfg.coinPickupMicroPulseMs,
      coinPickupFineDistance: cfg.coinPickupFineDistance,
      coinPickupFinePulseMs: cfg.coinPickupFinePulseMs,
      coinPickupBrakeDistance: cfg.coinPickupBrakeDistance,
      coinPickupBrakePulseMs: cfg.coinPickupBrakePulseMs,
      coinPickupSweepDistance: cfg.coinPickupSweepDistance,
      coinPickupSweepPulseMs: cfg.coinPickupSweepPulseMs,
      coinPickupPulseMs: cfg.coinPickupPulseMs,
      coinPickupExactTolerance: cfg.coinPickupExactTolerance,
      coinPickupFailureSlowStepMs: cfg.coinPickupFailureSlowStepMs,
      coinPickupFailureMinPulseMs: cfg.coinPickupFailureMinPulseMs,
      coinApproachBrakeDistance: cfg.coinApproachBrakeDistance,
      coinAxisFlipTolerance: cfg.coinAxisFlipTolerance,
      coinApproachLockMs: cfg.coinApproachLockMs,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      ...extra
    };
  }

  function coinPickupFailureCount(id, t = now()) {
    if (!id && id !== 0) return 0;
    const failure = bot.coinFailures.get(String(id));
    if (!failure) return 0;
    const lastAt = Number(failure.lastAt || 0);
    if (lastAt && t - lastAt > Number(cfg.coinFailureDecayMs || 0)) return 0;
    return Math.max(0, Math.floor(Number(failure.count || 0)));
  }

  function coinPickupAttemptSlowCount(id, distance, t = now()) {
    if (!id && id !== 0) return 0;
    if (Number(distance) > Number(cfg.closeCoinStuckDistance || 0)) return 0;
    const progress = bot.coinProgress;
    if (!progress || String(progress.id) !== String(id)) return 0;
    const lastImprovedAt = Number(progress.lastImprovedAt || progress.startedAt || t);
    const everyMs = Math.max(1, Number(cfg.coinPickupAttemptSlowEveryMs || 2500));
    const maxCount = Math.max(0, Math.floor(Number(cfg.coinPickupAttemptSlowMaxCount || 0)));
    return clamp(Math.floor(Math.max(0, t - lastImprovedAt) / everyMs), 0, maxCount);
  }

  function applyCoinApproachLockUpdate(update) {
    if (!update) return;
    if (update.action === 'set' && update.lock) {
      bot.coinApproachLock = update.lock;
      return;
    }
    if (update.action === 'clear') {
      if (update.all || !bot.coinApproachLock || String(bot.coinApproachLock.id) === String(update.id)) {
        bot.coinApproachLock = null;
      }
    }
  }

${localCoinDirectionToSource}
`;
}

function bundledCoinMotionRuntimeSource() {
  return `const {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
} = require('./src/browser/runtime/coin-motion');

${coinMotionRuntimeInlineSource({}, { bundledRuntime: true })}`;
}

function coinMotionRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledCoinMotionRuntimeSource();
  return coinMotionRuntimeInlineSource({
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore
  });
}

module.exports = {
  bundledCoinMotionRuntimeSource,
  coinDirectionToCall,
  coinMotionRuntimeInlineSource,
  coinMotionRuntimeSource
};
