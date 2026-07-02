'use strict';

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function coinDiagnosticsSummary(coin, extra = {}) {
  if (!coin) return null;
  return {
    id: coin.drop_id ?? coin.id ?? null,
    amount: Number.isFinite(Number(coin.amount)) ? Number(coin.amount) : null,
    distance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
    x: Number.isFinite(Number(coin.x)) ? Math.round(Number(coin.x)) : null,
    y: Number.isFinite(Number(coin.y)) ? Math.round(Number(coin.y)) : null,
    native: Boolean(coin.native),
    snapshot: Boolean(coin.snapshot),
    nativeSource: coin.nativeSource || '',
    ...extra
  };
}

function summarizeCoinDiagnosticsList(coins, maxDistance, limit = 8) {
  return (coins || [])
    .filter(coin => Number(coin?.distance) <= maxDistance)
    .slice()
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
      || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, limit)
    .map(coin => coinDiagnosticsSummary(coin))
    .filter(Boolean);
}

function addCoinFilterDiagnostic(diagnostics, coin, reason, options = {}) {
  const distance = Number(coin?.distance);
  const nearDistance = Number(options.nearDistance || 0);
  if (!(nearDistance > 0) || !Number.isFinite(distance) || distance > nearDistance) return diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') return diagnostics;
  const limit = Math.max(1, Math.round(Number(options.limit || 8) || 8));
  const detail = options.detail || {};
  const filtered = Array.isArray(diagnostics.filteredNearCoins) ? diagnostics.filteredNearCoins : [];
  const entry = coinDiagnosticsSummary(coin, { reason, ...detail });
  if (!entry) return diagnostics;
  const key = String(entry.id ?? '') + ':' + reason;
  const existing = filtered.find(item => String(item.id ?? '') + ':' + String(item.reason || '') === key);
  if (existing) {
    if (entry.distance !== null && (existing.distance === null || entry.distance < existing.distance)) Object.assign(existing, entry);
  } else if (filtered.length < limit) {
    filtered.push(entry);
  }
  diagnostics.filteredNearCoins = filtered;
  return diagnostics;
}

function buildCoinDiagnostics(self, groups = {}, options = {}) {
  const nearDistance = Math.max(0, Number(options.nearDistance || 0));
  const limit = Math.max(1, Math.round(Number(options.limit || 8) || 8));
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const ignoredCoinUntil = typeof options.ignoredCoinUntil === 'function' ? options.ignoredCoinUntil : () => 0;
  const realtimeCoins = groups.realtimeCoins || [];
  const snapshotCoins = groups.snapshotCoins || [];
  const ignoredNearCoins = [];
  const snapshotOnlyNearCoins = [];

  for (const coin of realtimeCoins || []) {
    const distance = Number(coin?.distance);
    if (!Number.isFinite(distance) || !(distance <= nearDistance)) continue;
    const ignoredUntil = ignoredCoinUntil(coin);
    if (!ignoredUntil) continue;
    const summary = coinDiagnosticsSummary(coin, {
      reason: 'ignored',
      remainingMs: Math.max(0, Math.round(Number(ignoredUntil || 0) - nowMs))
    });
    if (summary) ignoredNearCoins.push(summary);
    if (ignoredNearCoins.length >= limit) break;
  }

  for (const coin of snapshotCoins || []) {
    const distance = Number(coin?.distance);
    if (!Number.isFinite(distance) || !(distance <= nearDistance)) continue;
    const summary = coinDiagnosticsSummary(coin, { reason: 'snapshot-only' });
    if (summary) snapshotOnlyNearCoins.push(summary);
    if (snapshotOnlyNearCoins.length >= limit) break;
  }

  return {
    at: Date.now(),
    self: self ? {
      x: Number.isFinite(Number(self.x)) ? Math.round(Number(self.x)) : null,
      y: Number.isFinite(Number(self.y)) ? Math.round(Number(self.y)) : null
    } : null,
    nearDistance: Math.round(nearDistance),
    realtimeNearCount: arrayCount(groups.realtimeNearCoins),
    realtimeCount: arrayCount(realtimeCoins),
    realtimeGlobalCount: arrayCount(groups.realtimeGlobalCoins),
    realtimePatrolCount: arrayCount(groups.realtimePatrolCoins),
    snapshotCount: arrayCount(groups.snapshotCoins),
    nearestRealtimeCoins: summarizeCoinDiagnosticsList(realtimeCoins, nearDistance, limit),
    ignoredNearCoins,
    snapshotOnlyNearCoins,
    filteredNearCoins: []
  };
}

module.exports = {
  coinDiagnosticsSummary,
  summarizeCoinDiagnosticsList,
  addCoinFilterDiagnostic,
  buildCoinDiagnostics
};
