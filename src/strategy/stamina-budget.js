'use strict';

function defaultDist(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
}

function dailyStaminaBudgetIsLimitingCore(staminaCost = 0, oneHourBudget = Infinity, oneDayBudget = Infinity) {
  const cost = Math.max(0, Number(staminaCost) || 0);
  const oneHour = Number(oneHourBudget);
  const oneDay = Number(oneDayBudget);
  return Number.isFinite(oneDay)
    && cost > oneDay
    && (!Number.isFinite(oneHour) || cost <= oneHour);
}

function summarizeBlockedStaminaOpportunityCore(coins, targets = [], options = {}) {
  const budget = Number(options.budget);
  if (!Number.isFinite(budget)) return null;
  const coinStaminaCost = typeof options.coinStaminaCost === 'function' ? options.coinStaminaCost : coin => Number(coin?.staminaCost ?? 0);
  const enemyStaminaCost = typeof options.enemyStaminaCost === 'function' ? options.enemyStaminaCost : target => Number(target?.staminaCost ?? 0);
  const targetDrop = typeof options.targetDrop === 'function' ? options.targetDrop : target => Number(target?.drop ?? 0);
  const items = [];
  for (const coin of coins || []) {
    const distance = Number(coin?.distance);
    const amount = Number(coin?.amount || 0);
    if (!(amount > 0) || !Number.isFinite(distance)) continue;
    const staminaCost = coinStaminaCost(coin);
    if (staminaCost <= budget) continue;
    items.push({
      type: 'coin',
      id: coin.drop_id,
      amount,
      distance,
      staminaCost,
      shortageMs: staminaCost - budget,
      snapshot: Boolean(coin.snapshot),
      native: Boolean(coin.native)
    });
  }
  for (const target of targets || []) {
    const distance = Number(target?.distance);
    const drop = Number(target?.drop ?? targetDrop(target) ?? 0);
    if (!(drop > 0) || !Number.isFinite(distance)) continue;
    const staminaCost = enemyStaminaCost(target);
    if (staminaCost <= budget) continue;
    items.push({
      type: 'enemy',
      id: target.user_id,
      name: target.name || '',
      drop,
      distance,
      staminaCost,
      shortageMs: staminaCost - budget
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.shortageMs - b.shortageMs || a.distance - b.distance);
  const best = items[0];
  return {
    budgetMs: Math.max(0, Math.round(budget)),
    requiredMs: Math.max(0, Math.round(best.staminaCost)),
    shortageMs: Math.max(0, Math.round(best.shortageMs)),
    type: best.type,
    id: best.id,
    name: best.name || '',
    amount: best.amount || 0,
    drop: best.drop || 0,
    distance: Math.round(best.distance),
    snapshot: Boolean(best.snapshot),
    native: Boolean(best.native)
  };
}

function summarizeNearestCoinStaminaBudgetExitCore(self, coins, options = {}) {
  const budget = Number(options.budget);
  if (!Number.isFinite(budget)) return null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const coinStaminaCost = typeof options.coinStaminaCost === 'function' ? options.coinStaminaCost : coin => Number(coin?.staminaCost ?? 0);
  const candidates = (coins || [])
    .map(coin => ({
      ...coin,
      distance: Number.isFinite(Number(coin?.distance)) ? Number(coin.distance) : dist(self, coin),
      amount: Number(coin?.amount || 0)
    }))
    .filter(coin => coin.amount > 0 && Number.isFinite(coin.distance))
    .sort((a, b) => a.distance - b.distance || b.amount - a.amount);
  const coin = candidates[0] || null;
  if (!coin) return null;
  const staminaCost = coinStaminaCost(coin);
  if (staminaCost <= budget) return null;
  return {
    type: 'coin',
    window: '1h',
    id: coin.drop_id,
    amount: coin.amount,
    distance: Math.round(coin.distance),
    budgetMs: Math.max(0, Math.round(budget)),
    requiredMs: Math.max(0, Math.round(staminaCost)),
    shortageMs: Math.max(0, Math.round(staminaCost - budget)),
    reloginDelayMs: options.reloginDelayMs,
    snapshot: Boolean(coin.snapshot),
    native: Boolean(coin.native)
  };
}

function pickNearestDailyStaminaFinalCoinCore(coins, options = {}) {
  const coinStaminaCost = typeof options.coinStaminaCost === 'function' ? options.coinStaminaCost : coin => Number(coin?.staminaCost ?? 0);
  const dailyStaminaBudgetIsLimiting = typeof options.dailyStaminaBudgetIsLimiting === 'function'
    ? options.dailyStaminaBudgetIsLimiting
    : cost => dailyStaminaBudgetIsLimitingCore(cost, options.oneHourBudget, options.oneDayBudget);
  const isSnapshotOnlyCoin = typeof options.isSnapshotOnlyCoin === 'function' ? options.isSnapshotOnlyCoin : coin => Boolean(coin?.snapshotOnly);
  return (coins || [])
    .filter(coin => !isSnapshotOnlyCoin(coin))
    .filter(coin => dailyStaminaBudgetIsLimiting(coinStaminaCost(coin)))
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
      || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
}

module.exports = {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
};
