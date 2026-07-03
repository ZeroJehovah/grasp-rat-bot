'use strict';

function restoreRuntimeStateCore(preserved, previousBot, helpers = {}) {
  const state = preserved && typeof preserved === 'object' ? preserved : {};
  const nowMs = typeof helpers.nowMs === 'function' ? helpers.nowMs : Date.now;
  const restoredFailures = helpers.restoredCoinFailures();
  const restoredEnemyLeaveState = helpers.readPersistentExitState(helpers.enemyLeaveStateKey);
  const restoredOfflineLeaveState = helpers.readPersistentExitState(helpers.offlineLeaveStateKey);
  const restoreOptions = { markReloaded: !previousBot };
  const restoredPendingExitState = helpers.readPersistedPendingExitState(nowMs(), restoreOptions);
  const initialPendingExitState = helpers.chooseInitialPendingExitState(
    state.pendingExit,
    restoredPendingExitState,
    nowMs(),
    restoreOptions
  );
  return {
    restoredFailures,
    restoredEnemyLeaveState,
    restoredOfflineLeaveState,
    restoredPendingExitState,
    initialPendingExitState
  };
}

module.exports = { restoreRuntimeStateCore };
