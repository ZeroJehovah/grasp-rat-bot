'use strict';

function restoredRuntimeStateSource() {
  return `const { restoreRuntimeStateCore } = require('./src/browser/runtime/restored-runtime-state');
			  const { restoredCoinFailuresCore: restoredCoinFailuresForRestoredRuntimeStateCore } = require('./src/browser/runtime/restored-coin-failures');
			  const {
			    readPersistedPendingExitStateCore: readPersistedPendingExitStateForRestoredRuntimeStateCore,
			    chooseInitialPendingExitStateCore: chooseInitialPendingExitStateForRestoredRuntimeStateCore
			  } = require('./src/browser/runtime/pending-exit-persistence');

			  const restoredRuntimeState = restoreRuntimeStateCore(preserved, previousBot, {
			    restoredCoinFailures: () => restoredCoinFailuresForRestoredRuntimeStateCore(preserved.coinFailures, cfg, performance.now()),
			    readPersistentExitState,
			    readPersistedPendingExitState: (t, options) => readPersistedPendingExitStateForRestoredRuntimeStateCore(localStorage, PENDING_EXIT_STATE_KEY, t, options, pendingExitPersistenceCoreHelpers()),
			    chooseInitialPendingExitState: (memoryState, storedState, t, options) => chooseInitialPendingExitStateForRestoredRuntimeStateCore(memoryState, storedState, t, options, pendingExitPersistenceCoreHelpers()),
			    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
			    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
			    nowMs: () => Date.now()
			  });
			  const restoredFailures = restoredRuntimeState.restoredFailures;
			  const restoredEnemyLeaveState = restoredRuntimeState.restoredEnemyLeaveState;
			  const restoredOfflineLeaveState = restoredRuntimeState.restoredOfflineLeaveState;
			  const restoredPendingExitState = restoredRuntimeState.restoredPendingExitState;
			  const initialPendingExitState = restoredRuntimeState.initialPendingExitState;
`;
}

module.exports = {
  restoredRuntimeStateSource
};
