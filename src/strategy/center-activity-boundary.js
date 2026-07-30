'use strict';

const DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM = 130000;
const DEFAULT_HIGH_VALUE_COIN_AMOUNT = 10;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointRadiusFromOriginCore(point) {
  const x = finiteNumber(point?.x);
  const y = finiteNumber(point?.y);
  return x === null || y === null ? null : Math.hypot(x, y);
}

function centerActivityHardBoundaryRadiusCore(value) {
  const configured = finiteNumber(value);
  return configured === null
    ? DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM
    : Math.max(0, configured);
}

function highValueCoinTargetForActionCore(action, minAmount = DEFAULT_HIGH_VALUE_COIN_AMOUNT) {
  if (!action || typeof action !== 'object') return null;
  const requiredAmount = Math.max(1, finiteNumber(minAmount) ?? DEFAULT_HIGH_VALUE_COIN_AMOUNT);
  const kind = String(action.kind || '');
  const band = String(action.band || '');
  const directCoinAction = kind === 'coin' || kind === 'seek-coin';
  const candidates = [
    { target: action.target, source: 'target', allowed: directCoinAction || band === 'profit' },
    { target: action.lootTarget, source: 'loot-target', allowed: action.realtimeLootPriority === true }
  ];
  for (const candidate of candidates) {
    const target = candidate.target;
    if (!candidate.allowed || !target || typeof target !== 'object') continue;
    if (String(target.type || '').toLowerCase() !== 'coin') continue;
    const amount = finiteNumber(target.amount);
    if (amount === null || amount < requiredAmount) continue;
    return {
      target,
      source: candidate.source,
      amount,
      minAmount: requiredAmount
    };
  }
  return null;
}

function evaluateCenterActivityHardBoundaryCore(input = {}, options = {}) {
  const boundaryRadiusCm = centerActivityHardBoundaryRadiusCore(options.boundaryRadiusCm);
  const selfRadiusCm = pointRadiusFromOriginCore(input.self);
  const outside = Boolean(
    boundaryRadiusCm > 0
      && selfRadiusCm !== null
      && selfRadiusCm > boundaryRadiusCm
  );
  const highValueCoin = outside
    ? highValueCoinTargetForActionCore(input.action, options.highValueCoinMinAmount)
    : null;
  return {
    checked: selfRadiusCm !== null,
    outside,
    allowed: !outside || Boolean(highValueCoin),
    boundaryRadiusCm,
    selfRadiusCm,
    outsideByCm: outside ? Math.max(0, selfRadiusCm - boundaryRadiusCm) : 0,
    highValueCoin
  };
}

module.exports = {
  DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM,
  DEFAULT_HIGH_VALUE_COIN_AMOUNT,
  centerActivityHardBoundaryRadiusCore,
  evaluateCenterActivityHardBoundaryCore,
  highValueCoinTargetForActionCore,
  pointRadiusFromOriginCore
};
