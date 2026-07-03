'use strict';

function exitMotionStopLockRemainingMsCore(stoppedAtValue, lockMsValue, t = Date.now()) {
  const stoppedAt = Number(stoppedAtValue || 0);
  if (!stoppedAt) return 0;
  const lockMs = Math.max(0, Number(lockMsValue || 0) || 0);
  return Math.max(0, Math.round(stoppedAt + lockMs - t));
}

function postExitDecisionWithoutTargetCore(decision, reason = '', options = {}) {
  const previous = decision && typeof decision === 'object' ? decision : {};
  const lockRemaining = typeof options.exitMotionLockRemainingMs === 'function'
    ? options.exitMotionLockRemainingMs()
    : Number(options.exitMotionLockRemainingMs || 0);
  return {
    ...previous,
    kind: 'wait',
    reason: reason || previous.reason || 'exit-motion-stopped',
    dx: 0,
    dy: 0,
    target: null,
    aimTarget: null,
    opportunisticShot: null,
    combat: false,
    shoot: false,
    forceShoot: false,
    combatCover: null,
    exitMotionStopped: true,
    exitMotionStopReason: reason || options.lastExitMotionStopReason || '',
    exitMotionLockRemainingMs: lockRemaining
  };
}

module.exports = {
  exitMotionStopLockRemainingMsCore,
  postExitDecisionWithoutTargetCore
};
