'use strict';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const UTC8_OFFSET_MS = 8 * HOUR_MS;
const STAMINA_MILLI_PER_UNIT = 1000;
const DEFAULT_RESERVE_STAMINA_UNITS = 1000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nextDailyProfitResetAtCore(nowMs, options = {}) {
  const now = finiteNumber(nowMs);
  if (now === null) return null;
  const offsetMs = finiteNumber(options.utcOffsetMs) ?? UTC8_OFFSET_MS;
  return (Math.floor((now + offsetMs) / DAY_MS) + 1) * DAY_MS - offsetMs;
}

function normalizeProfitThresholdCore(options = {}) {
  const rewardCoins = finiteNumber(options.rewardCoins ?? options.coinsPer10Stamina);
  const staminaMilli = finiteNumber(options.staminaMilli)
    ?? ((finiteNumber(options.staminaUnits) ?? 10) * STAMINA_MILLI_PER_UNIT);
  return {
    rewardCoins: rewardCoins !== null && rewardCoins > 0 ? rewardCoins : 1,
    staminaMilli: staminaMilli !== null && staminaMilli > 0 ? staminaMilli : 10000,
    coinsPer10Stamina: rewardCoins !== null && rewardCoins > 0 ? rewardCoins : 1
  };
}

function buildDynamicProfitThresholdCore(input = {}, options = {}) {
  const threshold = normalizeProfitThresholdCore(options);
  const enabled = options.enabled !== false;
  const nowMs = finiteNumber(input.nowMs);
  const remaining1dMilli = finiteNumber(input.remaining1dMilli);
  const reserveMs = Math.max(0, finiteNumber(options.reserveMs) ?? HOUR_MS);
  const hourlyStaminaLimit = finiteNumber(options.hourlyStaminaLimit);
  const hourlyBurnMilli = (hourlyStaminaLimit !== null && hourlyStaminaLimit > 0 ? hourlyStaminaLimit : 3000)
    * STAMINA_MILLI_PER_UNIT;
  const reserveStaminaMilli = Math.max(0, finiteNumber(options.reserveStaminaMilli)
    ?? ((finiteNumber(options.reserveStaminaUnits) ?? DEFAULT_RESERVE_STAMINA_UNITS) * STAMINA_MILLI_PER_UNIT));
  const resetAt = nextDailyProfitResetAtCore(nowMs, options);
  const timeUntilResetMs = resetAt === null || nowMs === null ? null : Math.max(0, resetAt - nowMs);
  const usableTimeMs = timeUntilResetMs === null ? null : Math.max(0, timeUntilResetMs - reserveMs);
  const burnCapacityMilli = usableTimeMs === null ? null : usableTimeMs / HOUR_MS * hourlyBurnMilli;
  const burnTargetMilli = remaining1dMilli === null
    ? null
    : Math.max(0, remaining1dMilli - reserveStaminaMilli);
  const inResetReserveWindow = timeUntilResetMs !== null && timeUntilResetMs <= reserveMs;
  let reason = 'active';
  let active = true;
  if (!enabled) {
    active = false;
    reason = 'feature-disabled';
  } else if (remaining1dMilli === null) {
    active = false;
    reason = 'daily-stamina-unknown';
  } else if (remaining1dMilli <= 0) {
    active = false;
    reason = 'daily-stamina-exhausted';
  } else if (inResetReserveWindow) {
    active = true;
    reason = 'reset-reserve-window';
  } else if (burnCapacityMilli === null || burnTargetMilli > burnCapacityMilli) {
    active = false;
    reason = 'insufficient-burn-window';
  }
  return {
    active,
    reason,
    threshold,
    remaining1dMilli,
    resetAt,
    timeUntilResetMs,
    usableTimeMs,
    reserveMs,
    reserveStaminaMilli,
    burnTargetMilli,
    inResetReserveWindow,
    hourlyStaminaLimit: hourlyBurnMilli / STAMINA_MILLI_PER_UNIT,
    burnCapacityMilli
  };
}

function profitTargetEligibleCore(rewardCoins, staminaCostMilli, threshold = {}) {
  const reward = finiteNumber(rewardCoins);
  const cost = finiteNumber(staminaCostMilli);
  const normalized = normalizeProfitThresholdCore(threshold);
  if (reward === null || reward <= 0 || cost === null || cost < 0) return false;
  if (cost === 0) return true;
  return reward * normalized.staminaMilli >= cost * normalized.rewardCoins;
}

function filterProfitCandidatesCore(candidates = [], thresholdContext = {}, options = {}) {
  const limit = Math.max(0, Math.round(finiteNumber(options.summaryLimit) ?? 12));
  const annotated = (candidates || []).map(item => {
    const reward = finiteNumber(options.reward ? options.reward(item) : item?.reward);
    const staminaCost = finiteNumber(options.staminaCost ? options.staminaCost(item) : item?.staminaCost);
    const eligible = !thresholdContext.active
      || profitTargetEligibleCore(reward, staminaCost, thresholdContext.threshold);
    return {
      ...item,
      reward,
      staminaCost,
      profitThresholdEligible: eligible,
      profitThresholdReason: eligible ? 'eligible' : 'below-profit-threshold'
    };
  });
  const eligible = annotated.filter(item => item.profitThresholdEligible);
  const filtered = annotated.filter(item => !item.profitThresholdEligible);
  // `filtered` 只投影前 limit 条, 所以从日志看不出被截掉的那些是什么类型。
  // 按类型计数补上这个缺口: 一个本该被评分的玩家从未进池时, 计数会直接暴露
  // “候选里一个 enemy 都没有”。
  const countsByType = {};
  for (const item of annotated) {
    const type = String(item?.type || 'unknown');
    const bucket = countsByType[type] || (countsByType[type] = { raw: 0, eligible: 0, filtered: 0 });
    bucket.raw += 1;
    if (item.profitThresholdEligible) bucket.eligible += 1;
    else bucket.filtered += 1;
  }
  return {
    candidates: eligible,
    annotated,
    rawCount: annotated.length,
    eligibleCount: eligible.length,
    filteredCount: filtered.length,
    countsByType,
    filtered: filtered.slice(0, limit).map(item => ({
      type: item.type || '',
      id: item.id ?? '',
      reward: item.reward,
      staminaCost: item.staminaCost,
      reason: item.profitThresholdReason
    }))
  };
}

module.exports = {
  DAY_MS,
  DEFAULT_RESERVE_STAMINA_UNITS,
  HOUR_MS,
  STAMINA_MILLI_PER_UNIT,
  UTC8_OFFSET_MS,
  buildDynamicProfitThresholdCore,
  filterProfitCandidatesCore,
  nextDailyProfitResetAtCore,
  normalizeProfitThresholdCore,
  profitTargetEligibleCore
};
