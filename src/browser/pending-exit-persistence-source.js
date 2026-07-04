'use strict';

function pendingExitPersistenceSource() {
  return `const {
		    normalizePendingExitReloadConfirmationCore,
		    writePersistentPendingExitStateCore
		  } = require('./src/browser/runtime/pending-exit-persistence');
		  const {
		    pendingExitDisplayReasonCore: pendingExitDisplayReasonForPersistenceCore,
		    pendingExitRetryMsCore: pendingExitRetryMsForPersistenceCore
		  } = require('./src/browser/runtime/pending-exit');

		  function pendingExitRetryCoreOptionsForPersistence() {
		    return {
		      leaveRetryMinMs: cfg.leaveRetryMinMs,
		      leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
		      offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
		      combatLeaveRetryMs: cfg.combatLeaveRetryMs,
		      pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
		    };
		  }

		  function pendingExitPersistenceCoreHelpers() {
		    return {
		      pendingExitPersistMaxMs: cfg.pendingExitPersistMaxMs,
		      cloneForPendingExit,
		      pendingExitDisplayReason: summary => pendingExitDisplayReasonForPersistenceCore(summary),
		      pendingExitRetryMs: pending => pendingExitRetryMsForPersistenceCore(pending, pendingExitRetryCoreOptionsForPersistence()),
		      stringify: safeStringify,
		      clearPersistentPendingExitState
		    };
		  }`;
}

module.exports = {
  pendingExitPersistenceSource
};
