'use strict';

function persistentClearSource() {
  return `const { clearPersistentStorageKey } = require('./src/browser/runtime/persistent-clear');

		  function clearPersistentExitState(key) {
		    clearPersistentStorageKey(key);
		  }

		  function clearPersistentPendingExitState() {
		    clearPersistentStorageKey(PENDING_EXIT_STATE_KEY);
		  }`;
}

module.exports = {
  persistentClearSource
};
