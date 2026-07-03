'use strict';

function restoredRuntimeStateInlineSource() {
  return `

			  const restoredFailures = restoredCoinFailures();
			  const restoredEnemyLeaveState = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
			  const restoredOfflineLeaveState = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
			  const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot });
			  const initialPendingExitState = chooseInitialPendingExitState(preserved.pendingExit, restoredPendingExitState, Date.now(), { markReloaded: !previousBot });
`;
}

function bundledRestoredRuntimeStateSource() {
  return `const { restoreRuntimeStateCore } = require('./src/browser/runtime/restored-runtime-state');

			  const restoredRuntimeState = restoreRuntimeStateCore(preserved, previousBot, {
			    restoredCoinFailures,
			    readPersistentExitState,
			    readPersistedPendingExitState,
			    chooseInitialPendingExitState,
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

function restoredRuntimeStateSource(options = {}) {
  if (options.bundledRuntime) return bundledRestoredRuntimeStateSource();
  return restoredRuntimeStateInlineSource();
}

module.exports = {
  restoredRuntimeStateInlineSource,
  bundledRestoredRuntimeStateSource,
  restoredRuntimeStateSource
};
