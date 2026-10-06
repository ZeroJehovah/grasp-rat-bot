'use strict';

const { buildRuntimeDefaults } = require('../../shared/runtime-defaults');
const BROWSER_RUNTIME_DEFAULTS = buildRuntimeDefaults({}, false);

function optionNumber(options, key, fallback) {
  const number = Number(options?.[key]);
  return Number.isFinite(number) ? number : fallback;
}

function coinMotionCoreOptions(options = {}, extra = {}) {
  return {
    tolerance: optionNumber(options, 'coinPrecisionTolerance', BROWSER_RUNTIME_DEFAULTS.coinPrecisionTolerance),
    coinPrecisionTolerance: optionNumber(options, 'coinPrecisionTolerance', BROWSER_RUNTIME_DEFAULTS.coinPrecisionTolerance),
    coinAxisApproachMinDistance: optionNumber(options, 'coinAxisApproachMinDistance', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachMinDistance),
    coinAxisApproachRatio: optionNumber(options, 'coinAxisApproachRatio', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachRatio),
    coinAxisApproachLaneTolerance: optionNumber(options, 'coinAxisApproachLaneTolerance', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachLaneTolerance),
    coinAlignNearAxisFirst: options.coinAlignNearAxisFirst !== false,
    coinPickupStopDistance: optionNumber(options, 'coinPickupStopDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupStopDistance),
    coinPickupStopPulseMs: optionNumber(options, 'coinPickupStopPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupStopPulseMs),
    coinPickupMicroDistance: optionNumber(options, 'coinPickupMicroDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupMicroDistance),
    coinPickupMicroPulseMs: optionNumber(options, 'coinPickupMicroPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupMicroPulseMs),
    coinPickupJitterEnabled: options.coinPickupJitterEnabled !== false,
    coinPickupJitterMaxDistance: optionNumber(options, 'coinPickupJitterMaxDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupJitterMaxDistance),
    coinPickupJitterMaxBacktrack: optionNumber(options, 'coinPickupJitterMaxBacktrack', BROWSER_RUNTIME_DEFAULTS.coinPickupJitterMaxBacktrack),
    coinPickupJitterMaxPulses: optionNumber(options, 'coinPickupJitterMaxPulses', BROWSER_RUNTIME_DEFAULTS.coinPickupJitterMaxPulses),
    coinPickupFineDistance: optionNumber(options, 'coinPickupFineDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupFineDistance),
    coinPickupFinePulseMs: optionNumber(options, 'coinPickupFinePulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFinePulseMs),
    coinPickupBrakeDistance: optionNumber(options, 'coinPickupBrakeDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupBrakeDistance),
    coinPickupBrakePulseMs: optionNumber(options, 'coinPickupBrakePulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupBrakePulseMs),
    coinPickupSweepDistance: optionNumber(options, 'coinPickupSweepDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance),
    coinPickupSweepPulseMs: optionNumber(options, 'coinPickupSweepPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupSweepPulseMs),
    coinPickupPulseMs: optionNumber(options, 'coinPickupPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupPulseMs),
    coinPickupExactTolerance: optionNumber(options, 'coinPickupExactTolerance', BROWSER_RUNTIME_DEFAULTS.coinPickupExactTolerance),
    coinPickupFailureSlowStepMs: optionNumber(options, 'coinPickupFailureSlowStepMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFailureSlowStepMs),
    coinPickupFailureMinPulseMs: optionNumber(options, 'coinPickupFailureMinPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFailureMinPulseMs),
    coinApproachBrakeDistance: optionNumber(options, 'coinApproachBrakeDistance', BROWSER_RUNTIME_DEFAULTS.coinApproachBrakeDistance),
    coinAxisFlipTolerance: optionNumber(options, 'coinAxisFlipTolerance', BROWSER_RUNTIME_DEFAULTS.coinAxisFlipTolerance),
    coinApproachLockMs: optionNumber(options, 'coinApproachLockMs', BROWSER_RUNTIME_DEFAULTS.coinApproachLockMs),
    nearCoinStuckDistance: optionNumber(options, 'nearCoinStuckDistance', BROWSER_RUNTIME_DEFAULTS.nearCoinStuckDistance),
    ...extra
  };
}

module.exports = { coinMotionCoreOptions };
