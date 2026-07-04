'use strict';

function persistentExitSource() {
  return `const {
	    readPersistentExitStateCore,
	    writePersistentExitStateCore
	  } = require('./src/browser/runtime/persistent-exit');

	  function readPersistentExitState(key, t = Date.now()) {
	    return readPersistentExitStateCore(localStorage, key, refreshExitDetail, t);
	  }

	  function writePersistentExitState(key, detail) {
	    writePersistentExitStateCore(localStorage, key, detail, refreshExitDetail);
	  }`;
}

module.exports = {
  persistentExitSource
};
