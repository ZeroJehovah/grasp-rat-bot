'use strict';

function persistentClearSource() {
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

module.exports = { persistentClearSource };
