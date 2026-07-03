'use strict';

function restoredCoinFailuresInlineSource() {
  return String.raw`
	  function restoredCoinFailures() {
    const t = performance.now();
    return (preserved.coinFailures || []).map(([id, item]) => {
      const next = { ...(item || {}) };
      const count = Number(next.count || 0);
      const lastAt = Number(next.lastAt || 0);
      const staleFailure = lastAt && t - lastAt > cfg.coinFailureDecayMs;
      let ignoreUntil = Number(next.ignoreUntil || 0);
      if ((next.reason === 'near' || next.reason === 'close') && count <= 1) {
        return null;
      }
      if (!staleFailure) {
        if (count >= cfg.coinFailureSevereIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureSevereIgnoreMs);
        } else if (count >= cfg.coinFailureHardIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureHardIgnoreMs);
        }
      }
      next.ignoreUntil = ignoreUntil;
      return [String(id), next];
    }).filter(Boolean);
  }`;
}

function bundledRestoredCoinFailuresSource() {
  return `const { restoredCoinFailuresCore } = require('./src/browser/runtime/restored-coin-failures');

	  function restoredCoinFailures() {
	    return restoredCoinFailuresCore(preserved.coinFailures, cfg, performance.now());
	  }`;
}

function restoredCoinFailuresSource(options = {}) {
  if (options.bundledRuntime) return bundledRestoredCoinFailuresSource();
  return restoredCoinFailuresInlineSource();
}

module.exports = {
  restoredCoinFailuresInlineSource,
  bundledRestoredCoinFailuresSource,
  restoredCoinFailuresSource
};
