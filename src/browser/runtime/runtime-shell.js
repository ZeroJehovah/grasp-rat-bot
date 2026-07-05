'use strict';

const {
  createRuntimeBootstrapBindings
} = require('./runtime-bootstrap-bindings');
const {
  createRuntimeStateBindings
} = require('./runtime-state-bindings');
const {
  postExitDecisionWithoutTargetCore
} = require('./exit-motion');
const {
  readEnemyLeaveStreakBoundCore
} = require('./exit-relogin');
const {
  pendingExitRetryMsCore,
  summarizePendingExitCore
} = require('./pending-exit');

function createRuntimeShellContext(baseConfig = {}, options = {}) {
  const runtimeBootstrapBindings = createRuntimeBootstrapBindings(baseConfig, options);
  const {
    cfg,
    preserved,
    previousBot,
    LAST_SELF_STATE_KEY,
    PENDING_EXIT_STATE_KEY,
    ENEMY_LEAVE_STATE_KEY,
    OFFLINE_LEAVE_STATE_KEY
  } = runtimeBootstrapBindings;
  const runtimeStateBindings = createRuntimeStateBindings({
    storage: options.storage,
    cfg,
    keys: {
      lastSelfStateKey: LAST_SELF_STATE_KEY,
      pendingExitStateKey: PENDING_EXIT_STATE_KEY,
      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY
    },
    preserved,
    previousBot,
    now: options.now,
    performanceNow: options.performanceNow
  });

  return {
    runtimeBootstrapBindings,
    runtimeStateBindings,
    botStatusCores: {
      postExitDecisionWithoutTargetForStatusCore: postExitDecisionWithoutTargetCore,
      readEnemyLeaveStreakBoundCore,
      pendingExitRetryMsForBotObjectCore: pendingExitRetryMsCore,
      summarizePendingExitForBotObjectCore: summarizePendingExitCore
    }
  };
}

module.exports = {
  createRuntimeShellContext
};
