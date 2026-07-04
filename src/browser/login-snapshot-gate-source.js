'use strict';

function loginSnapshotGateSource() {
  return `const {
			    loginSnapshotSuccessRequiredCore,
			    normalizeLoginSnapshotGateStateCore
			  } = require('./src/browser/runtime/login-snapshot-gate');`;
}

module.exports = {
  loginSnapshotGateSource
};
