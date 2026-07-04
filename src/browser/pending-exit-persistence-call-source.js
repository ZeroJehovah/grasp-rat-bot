'use strict';

function writePersistentPendingExitStateCall(pendingExpr = 'null') {
  return `writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (${pendingExpr}) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers())`;
}

function writePersistentPendingExitStateCallback() {
  return 'pending => writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers())';
}

module.exports = {
  writePersistentPendingExitStateCall,
  writePersistentPendingExitStateCallback
};
