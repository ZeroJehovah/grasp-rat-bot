'use strict';

function persistentLastSelfSource() {
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

module.exports = {
  persistentLastSelfSource
};
