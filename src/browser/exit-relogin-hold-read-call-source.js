'use strict';

function enemyReloginHoldRemainingMsBoundCall(name = 'enemyReloginHoldRemainingMsBoundCore') {
  return `${name}(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, now: Date.now })`;
}

function offlineReloginHoldRemainingMsBoundCall(name = 'offlineReloginHoldRemainingMsBoundCore', clearName = 'clearOfflineReloginHoldBoundCore') {
  return `${name}(bot, localStorage, { loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, readPersistentExitState, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY, staleOfflineStaminaHoldContradicted, clearOfflineReloginHold: reason => ${clearName}(bot, localStorage, reason, { now: Date.now, writePersistentPendingExitState, clearPersistentPendingExitState, clearPersistentExitState, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY }), now: Date.now })`;
}

module.exports = {
  enemyReloginHoldRemainingMsBoundCall,
  offlineReloginHoldRemainingMsBoundCall
};
