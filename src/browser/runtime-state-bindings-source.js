'use strict';

function runtimeStateBindingsSource() {
  return `const { createRuntimeStateBindings } = require('./src/browser/runtime/runtime-state-bindings');

		  const runtimeStateBindings = createRuntimeStateBindings({
		    storage: localStorage,
		    cfg,
		    keys: {
		      lastSelfStateKey: LAST_SELF_STATE_KEY,
		      pendingExitStateKey: PENDING_EXIT_STATE_KEY,
		      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
		      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY
		    },
		    preserved,
		    previousBot,
		    now: Date.now,
		    performanceNow: () => performance.now()
		  });
		  const {
		    readPersistentLastSelfState,
		    writePersistentLastSelfState,
		    refreshExitDetail,
		    readPersistentExitState,
		    writePersistentExitState,
		    clearPersistentExitState,
		    clearPersistentPendingExitState,
		    pendingExitRetryCoreOptionsForPersistence,
		    pendingExitPersistenceCoreHelpers,
		    normalizePendingExitReloadConfirmationCore,
		    writePersistentPendingExitStateCore,
		    restoredRuntimeState,
		    restoredFailures,
		    restoredEnemyLeaveState,
		    restoredOfflineLeaveState,
		    restoredPendingExitState,
		    initialPendingExitState,
		    loginSnapshotSuccessRequiredCore,
		    normalizeLoginSnapshotGateStateCore,
		    recordRuntimeDiagnosticsCore
		  } = runtimeStateBindings;`;
}

module.exports = {
  runtimeStateBindingsSource
};
