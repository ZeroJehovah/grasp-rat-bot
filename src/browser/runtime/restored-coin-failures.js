'use strict';

function restoredCoinFailuresCore(preservedCoinFailures, cfg, t) {
  const options = cfg && typeof cfg === 'object' ? cfg : {};
  return (preservedCoinFailures || []).map(([id, item]) => {
    const next = { ...(item || {}) };
    const count = Number(next.count || 0);
    const lastAt = Number(next.lastAt || 0);
    const staleFailure = lastAt && t - lastAt > options.coinFailureDecayMs;
    let ignoreUntil = Number(next.ignoreUntil || 0);
    if ((next.reason === 'near' || next.reason === 'close') && count <= 1) {
      return null;
    }
    if (!staleFailure) {
      if (count >= options.coinFailureSevereIgnoreCount) {
        ignoreUntil = Math.max(ignoreUntil, t + options.coinFailureSevereIgnoreMs);
      } else if (count >= options.coinFailureHardIgnoreCount) {
        ignoreUntil = Math.max(ignoreUntil, t + options.coinFailureHardIgnoreMs);
      }
    }
    next.ignoreUntil = ignoreUntil;
    return [String(id), next];
  }).filter(Boolean);
}

module.exports = { restoredCoinFailuresCore };
