'use strict';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function firstTimestamp(values = []) {
  for (const value of values) {
    const timestamp = timestampOrNull(value);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function observedNameAtMs(source, fallbackAtMs) {
  return firstTimestamp([
    source?.nameObservedAt,
    source?.lastObservedAt,
    source?.nameUpdatedAt,
    fallbackAtMs
  ]);
}

function storedNameAtMs(record, fallbacks = []) {
  return firstTimestamp([
    record?.nameObservedAt,
    ...fallbacks
  ]);
}

function nameObservationFreshness(detail = {}) {
  const observedAtMs = timestampOrNull(detail.observedAtMs);
  const previousObservedAtMs = timestampOrNull(detail.previousObservedAtMs);
  const observedTick = numberOrNull(detail.observedTick);
  const previousObservedTick = numberOrNull(detail.previousObservedTick);
  if (observedAtMs === null) return { accepted: false, advanced: false };
  if (previousObservedAtMs !== null && observedAtMs < previousObservedAtMs) {
    return { accepted: false, advanced: false };
  }
  if (previousObservedAtMs !== null
    && observedAtMs === previousObservedAtMs
    && observedTick !== null
    && previousObservedTick !== null
    && observedTick < previousObservedTick) {
    return { accepted: false, advanced: false };
  }
  return {
    accepted: true,
    advanced: previousObservedAtMs === null
      || observedAtMs > previousObservedAtMs
      || (observedAtMs === previousObservedAtMs
        && observedTick !== null
        && (previousObservedTick === null || observedTick > previousObservedTick))
  };
}

module.exports = {
  nameObservationFreshness,
  numberOrNull,
  observedNameAtMs,
  storedNameAtMs,
  timestampOrNull
};
