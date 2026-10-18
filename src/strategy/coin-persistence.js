'use strict';

const DEFAULT_HIGH_VALUE_COIN_PERSISTENCE = Object.freeze({
  waitTicks: 400,
  maxGapTicks: 1800,
  maxAgeMs: 90000,
  maxEntries: 256
});

function finiteTick(value) {
  const tick = Number(value);
  return Number.isFinite(tick) && tick > 0 ? tick : null;
}

function finiteTime(value) {
  const atMs = Number(value);
  return Number.isFinite(atMs) && atMs > 0 ? atMs : null;
}

// Persistence is keyed only by an explicit coin identity. Coordinate-derived
// IDs are useful for one-frame target matching, but cannot prove that a later
// observation is the same coin rather than a different drop at that spot.
function persistentCoinObservationKeyCore(coin) {
  // A normalized coin without a protocol ID carries an explicit empty/null
  // stableCoinId plus a coordinate-derived drop_id. That fallback can match a
  // target within one frame, but it cannot prove persistence across snapshots.
  if (Object.prototype.hasOwnProperty.call(coin || {}, 'stableCoinId')
    && (coin.stableCoinId === null || coin.stableCoinId === '')) {
    return '';
  }
  const id = coin?.stableCoinId
    ?? coin?.stable_coin_id
    ?? coin?.drop_id
    ?? coin?.coin_id
    ?? coin?.id;
  if (id === null || id === undefined || id === '') return '';
  return `id:${String(id)}`;
}

function collectHighValueCoins(coins, minAmount) {
  const byKey = new Map();
  for (const coin of coins || []) {
    const key = persistentCoinObservationKeyCore(coin);
    if (!key) continue;
    const amount = Number(coin?.amount || 0);
    if (!(amount >= minAmount)) continue;
    if (!byKey.has(key)) byKey.set(key, coin);
  }
  return byKey;
}

function persistentCoinEligibilityCore(record, options = {}) {
  if (!record) return null;
  const waitTicks = Math.max(0, Number(options.waitTicks
    ?? DEFAULT_HIGH_VALUE_COIN_PERSISTENCE.waitTicks));
  const firstTick = finiteTick(record.firstSeenTick);
  if (firstTick === null) return null;
  const requiredTick = firstTick + waitTicks;
  const lastLiveTick = finiteTick(record.lastLiveTick);
  const snapshotLastTick = finiteTick(record.snapshotLastTick);
  const snapshotObservationCount = Math.max(0, Number(record.snapshotObservationCount || 0));
  let qualification = '';

  if (record.firstSource === 'realtime') {
    if (lastLiveTick !== null && lastLiveTick >= requiredTick) {
      qualification = 'realtime-visible-ticks';
    } else if (snapshotObservationCount >= 1
      && snapshotLastTick !== null
      && snapshotLastTick >= requiredTick) {
      // The user explicitly permits a realtime-discovered coin that leaves
      // view to qualify from a later snapshot once that snapshot tick is at
      // least 400 ticks after the realtime discovery tick.
      qualification = 'realtime-then-snapshot-ticks';
    }
  } else if (record.firstSource === 'snapshot') {
    if (lastLiveTick !== null && lastLiveTick >= requiredTick) {
      qualification = 'snapshot-then-realtime-ticks';
    } else if (snapshotObservationCount >= 2) {
      // Snapshot polls normally land about 600 ticks (30 seconds) apart, so a
      // second distinct observation is the out-of-view persistence signal.
      // Do not require a second explicit tick threshold here: retries or an
      // unusually fast poll may make the tick gap differ from the normal
      // cadence while still proving that the same coin survived two complete
      // snapshots. Snapshot-only eligibility remains distinct-observation based.
      qualification = 'snapshot-distinct-observations';
    }
  }
  if (!qualification) return null;

  const observedLastTick = Math.max(lastLiveTick || 0, snapshotLastTick || 0, firstTick);
  return {
    coinKey: String(record.coinKey || ''),
    amount: Number(record.amount || 0),
    firstSource: String(record.firstSource || ''),
    firstSeenTick: firstTick,
    firstSeenAtMs: finiteTime(record.firstSeenAtMs),
    lastSeenTick: observedLastTick,
    lastSeenAtMs: finiteTime(record.lastSeenAtMs),
    snapshotObservationCount,
    snapshotLastTick,
    waitTicks,
    observedSpanTicks: Math.max(0, observedLastTick - firstTick),
    qualification,
    epoch: Math.max(0, Number(record.epoch || 0) || 0),
    dayKey: String(record.dayKey || '')
  };
}

function updatePersistentCoinObservationsCore(records = {}, options = {}) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return {};
  const nowMs = finiteTime(options.nowMs) ?? Date.now();
  const dayKey = String(options.dayKey || '');
  const epoch = Math.max(0, Number(options.epoch || 0) || 0);
  const realtimeTick = finiteTick(options.realtimeTick);
  const snapshotTick = finiteTick(options.snapshotTick);
  const realtimeObservedAtMs = finiteTime(options.realtimeObservedAtMs) ?? nowMs;
  const snapshotObservedAtMs = finiteTime(options.snapshotObservedAtMs);
  const minAmount = Math.max(1, Number(options.minAmount ?? 1));
  const waitTicks = Math.max(0, Number(options.waitTicks
    ?? DEFAULT_HIGH_VALUE_COIN_PERSISTENCE.waitTicks));
  const maxGapTicks = Math.max(waitTicks, Number(options.maxGapTicks
    ?? DEFAULT_HIGH_VALUE_COIN_PERSISTENCE.maxGapTicks));
  const maxAgeMs = Math.max(1000, Number(options.maxAgeMs
    ?? DEFAULT_HIGH_VALUE_COIN_PERSISTENCE.maxAgeMs));
  const maxEntries = Math.max(1, Math.round(Number(options.maxEntries
    ?? DEFAULT_HIGH_VALUE_COIN_PERSISTENCE.maxEntries)));
  const realtimeCoins = collectHighValueCoins(options.realtimeCoins, minAmount);
  const snapshotCoins = collectHighValueCoins(options.snapshotCoins, minAmount);
  const snapshotHasCoinList = options.snapshotHasCoinList === true;
  const snapshotIsNew = options.snapshotIsNew !== false;

  // Drop records that cannot belong to the current day, tick epoch, or
  // bounded observation horizon before adding this frame's evidence.
  for (const [key, record] of Object.entries(records)) {
    if (!record
      || String(record.coinKey || key) !== key
      || String(record.dayKey || '') !== dayKey
      || Number(record.epoch || 0) !== epoch
      || nowMs - Number(record.lastSeenAtMs || 0) > maxAgeMs
      || !(Number(record.amount || 0) >= minAmount)) {
      delete records[key];
    }
  }

  // A fresh complete snapshot is absence-capable. A coin missing from both
  // that snapshot and the current authoritative realtime list cannot remain
  // continuously observed merely because the ledger still has an old row.
  if (snapshotIsNew && snapshotHasCoinList && snapshotObservedAtMs !== null) {
    for (const [key, record] of Object.entries(records)) {
      if (realtimeCoins.has(key) || snapshotCoins.has(key)) continue;
      const lastSeenTick = finiteTick(record.lastSeenTick);
      if (snapshotTick !== null && lastSeenTick !== null && snapshotTick < lastSeenTick) continue;
      delete records[key];
    }
  }

  const keys = new Set([...realtimeCoins.keys(), ...snapshotCoins.keys()]);
  for (const key of keys) {
    const liveCoin = realtimeCoins.get(key) || null;
    const snapshotCoin = snapshotCoins.get(key) || null;
    const livePresent = Boolean(liveCoin && realtimeTick !== null);
    const snapshotPresent = Boolean(snapshotCoin && snapshotTick !== null);
    let record = records[key] || null;
    const currentObservedTick = Math.max(
      livePresent ? realtimeTick : 0,
      snapshotPresent ? snapshotTick : 0
    );
    const previousLastTick = finiteTick(record?.lastSeenTick);
    if (record && previousLastTick !== null && currentObservedTick - previousLastTick > maxGapTicks) {
      record = null;
    }

    if (!record) {
      let firstSource = '';
      if (livePresent && snapshotPresent) {
        const snapshotFirst = snapshotObservedAtMs === null
          || snapshotObservedAtMs <= realtimeObservedAtMs;
        firstSource = snapshotFirst ? 'snapshot' : 'realtime';
      } else if (livePresent) {
        firstSource = 'realtime';
      } else if (snapshotPresent) {
        firstSource = 'snapshot';
      }
      if (!firstSource) continue;
      const firstTick = firstSource === 'snapshot' ? snapshotTick : realtimeTick;
      const firstAtMs = firstSource === 'snapshot' ? snapshotObservedAtMs : realtimeObservedAtMs;
      record = {
        coinKey: key,
        amount: Number((liveCoin || snapshotCoin)?.amount || 0),
        firstSource,
        firstSeenTick: firstTick,
        firstSeenAtMs: firstAtMs,
        lastSeenTick: firstTick,
        lastSeenAtMs: firstAtMs,
        lastLiveTick: livePresent ? realtimeTick : null,
        lastLiveAtMs: livePresent ? realtimeObservedAtMs : null,
        snapshotObservationCount: firstSource === 'snapshot' ? 1 : 0,
        snapshotFirstTick: firstSource === 'snapshot' ? snapshotTick : null,
        snapshotLastTick: firstSource === 'snapshot' ? snapshotTick : null,
        epoch,
        dayKey
      };
      records[key] = record;
    }

    const firstTick = finiteTick(record.firstSeenTick);
    if (livePresent && realtimeTick >= firstTick) {
      record.lastLiveTick = Math.max(Number(record.lastLiveTick || 0), realtimeTick);
      record.lastLiveAtMs = Math.max(Number(record.lastLiveAtMs || 0), realtimeObservedAtMs);
      record.lastSeenTick = Math.max(Number(record.lastSeenTick || 0), realtimeTick);
      record.lastSeenAtMs = Math.max(Number(record.lastSeenAtMs || 0), realtimeObservedAtMs);
    }
    if (snapshotPresent && snapshotIsNew && snapshotTick >= firstTick) {
      const previousSnapshotTick = finiteTick(record.snapshotLastTick);
      if (previousSnapshotTick === null || snapshotTick > previousSnapshotTick) {
        const previousCount = Math.max(0, Number(record.snapshotObservationCount || 0));
        record.snapshotObservationCount = previousSnapshotTick === null
          ? Math.max(1, previousCount)
          : previousCount + 1;
        record.snapshotFirstTick = finiteTick(record.snapshotFirstTick) ?? snapshotTick;
        record.snapshotLastTick = snapshotTick;
        record.lastSeenTick = Math.max(Number(record.lastSeenTick || 0), snapshotTick);
        record.lastSeenAtMs = Math.max(Number(record.lastSeenAtMs || 0), snapshotObservedAtMs || 0);
      }
    }
    record.amount = Number((liveCoin || snapshotCoin)?.amount || record.amount || 0);
  }

  const retained = Object.entries(records)
    .sort((left, right) => Number(right[1]?.lastSeenAtMs || 0) - Number(left[1]?.lastSeenAtMs || 0))
    .slice(0, maxEntries);
  for (const key of Object.keys(records)) delete records[key];
  for (const [key, record] of retained) records[key] = record;

  const eligibleByKey = {};
  for (const [key, record] of Object.entries(records)) {
    const eligibility = persistentCoinEligibilityCore(record, { waitTicks });
    if (eligibility) eligibleByKey[key] = eligibility;
  }
  return eligibleByKey;
}

module.exports = {
  DEFAULT_HIGH_VALUE_COIN_PERSISTENCE,
  persistentCoinObservationKeyCore,
  persistentCoinEligibilityCore,
  updatePersistentCoinObservationsCore
};
