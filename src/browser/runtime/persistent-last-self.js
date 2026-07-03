'use strict';

function readPersistentLastSelfStateCore(storage, key, maxAgeMsValue, t = Date.now()) {
  let state = null;
  try {
    state = JSON.parse(storage.getItem(key) || 'null');
  } catch (_) {
    state = null;
  }
  if (!state || typeof state !== 'object') return null;
  const at = Number(state.at || state.updatedAt || 0) || 0;
  const maxAgeMs = Math.max(3600000, Number(maxAgeMsValue || 172800000) || 172800000);
  if (at && t - at > maxAgeMs) return null;
  const self = state.self && typeof state.self === 'object' ? state.self : state;
  return self && typeof self === 'object' ? { ...self } : null;
}

function writePersistentLastSelfStateCore(storage, key, selfSummary, t = Date.now()) {
  if (!selfSummary || typeof selfSummary !== 'object') return false;
  try {
    storage.setItem(key, JSON.stringify({
      at: t,
      self: selfSummary
    }));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  readPersistentLastSelfStateCore,
  writePersistentLastSelfStateCore
};
