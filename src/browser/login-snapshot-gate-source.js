'use strict';

function loginSnapshotGateInlineSource() {
  return String.raw`
			  function loginSnapshotSuccessRequired() {
			    return 0;
			  }

		  function normalizeLoginSnapshotGateState(state = null) {
		    const required = loginSnapshotSuccessRequired();
		    return {
		      streak: Math.max(0, Math.round(Number(state?.streak || 0) || 0)),
		      required,
		      lastOkAt: Number(state?.lastOkAt || 0) || 0,
		      lastErrorAt: Number(state?.lastErrorAt || 0) || 0,
		      lastSampleAt: Number(state?.lastSampleAt || state?.lastOkAt || state?.lastErrorAt || 0) || 0,
		      lastError: String(state?.lastError || ''),
		      lastTick: Number(state?.lastTick || 0) || 0,
		      resetAt: Number(state?.resetAt || 0) || 0,
		      resetReason: String(state?.resetReason || '')
		    };
		  }`;
}

function bundledLoginSnapshotGateSource() {
  return `const {
			    loginSnapshotSuccessRequiredCore,
			    normalizeLoginSnapshotGateStateCore
			  } = require('./src/browser/runtime/login-snapshot-gate');

			  function loginSnapshotSuccessRequired() {
			    return loginSnapshotSuccessRequiredCore();
		  }`;
}

function loginSnapshotGateSource(options = {}) {
  if (options.bundledRuntime) return bundledLoginSnapshotGateSource();
  return loginSnapshotGateInlineSource();
}

module.exports = {
  loginSnapshotGateInlineSource,
  bundledLoginSnapshotGateSource,
  loginSnapshotGateSource
};
