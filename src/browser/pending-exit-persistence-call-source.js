'use strict';

function writePersistentPendingExitStateCall(pendingExpr = 'null', options = {}) {
  if (!options.bundledRuntime) return `writePersistentPendingExitState(${pendingExpr})`;
  return `writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (${pendingExpr}) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers())`;
}

function writePersistentPendingExitStateCallback(options = {}) {
  if (!options.bundledRuntime) return 'writePersistentPendingExitState';
  return 'pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers())';
}

module.exports = {
  writePersistentPendingExitStateCall,
  writePersistentPendingExitStateCallback
};
