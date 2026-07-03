'use strict';

function persistentLastSelfInlineSource() {
  return String.raw`
	  function readPersistentLastSelfState(t = Date.now()) {
	    let state = null;
	    try {
	      state = JSON.parse(localStorage.getItem(LAST_SELF_STATE_KEY) || 'null');
	    } catch (_) {
	      state = null;
	    }
	    if (!state || typeof state !== 'object') return null;
	    const at = Number(state.at || state.updatedAt || 0) || 0;
	    const maxAgeMs = Math.max(3600000, Number(cfg.lastSelfPersistMaxMs || 172800000) || 172800000);
	    if (at && t - at > maxAgeMs) return null;
	    const self = state.self && typeof state.self === 'object' ? state.self : state;
	    return self && typeof self === 'object' ? { ...self } : null;
	  }

	  function writePersistentLastSelfState(selfSummary, t = Date.now()) {
	    if (!selfSummary || typeof selfSummary !== 'object') return;
	    try {
	      localStorage.setItem(LAST_SELF_STATE_KEY, JSON.stringify({
	        at: t,
	        self: selfSummary
	      }));
	    } catch (_) {}
	  }`;
}

function bundledPersistentLastSelfSource() {
  return `const {
	    readPersistentLastSelfStateCore,
	    writePersistentLastSelfStateCore
	  } = require('./src/browser/runtime/persistent-last-self');

	  function readPersistentLastSelfState(t = Date.now()) {
	    return readPersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, cfg.lastSelfPersistMaxMs, t);
	  }

	  function writePersistentLastSelfState(selfSummary, t = Date.now()) {
	    writePersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, selfSummary, t);
	  }`;
}

function persistentLastSelfSource(options = {}) {
  if (options.bundledRuntime) return bundledPersistentLastSelfSource();
  return persistentLastSelfInlineSource();
}

module.exports = {
  persistentLastSelfInlineSource,
  bundledPersistentLastSelfSource,
  persistentLastSelfSource
};
