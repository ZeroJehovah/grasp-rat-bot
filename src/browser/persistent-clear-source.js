'use strict';

function persistentClearInlineSource() {
  return String.raw`
		  function clearPersistentExitState(key) {
		    try {
		      localStorage.removeItem(key);
		    } catch (_) {}
		  }

		  function clearPersistentPendingExitState() {
		    try {
		      localStorage.removeItem(PENDING_EXIT_STATE_KEY);
		    } catch (_) {}
		  }`;
}

function bundledPersistentClearSource() {
  return `const { clearPersistentStorageKey } = require('./src/browser/runtime/persistent-clear');

		  function clearPersistentExitState(key) {
		    clearPersistentStorageKey(key);
		  }

		  function clearPersistentPendingExitState() {
		    clearPersistentStorageKey(PENDING_EXIT_STATE_KEY);
		  }`;
}

function persistentClearSource(options = {}) {
  if (options.bundledRuntime) return bundledPersistentClearSource();
  return persistentClearInlineSource();
}

module.exports = {
  persistentClearInlineSource,
  bundledPersistentClearSource,
  persistentClearSource
};
