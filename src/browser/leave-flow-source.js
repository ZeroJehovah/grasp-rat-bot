'use strict';

function leaveFlowSource(options = {}) {
  const runtimeExitReloginPrelude = options.bundledRuntime
    ? "  const {\n    injuryLeaveSummaryCore: injuryLeaveSummaryForLeaveFlowCore,\n    offlineExitRequiresUnsafeReloginDelayCore,\n    offlineLeaveSummaryCore: offlineLeaveSummaryForLeaveFlowCore,\n    primePendingStaminaExitLoginSuppressBoundCore,\n    primePendingUnsafeExitLoginSuppressBoundCore,\n    pursuitLeaveSummaryCore: pursuitLeaveSummaryForLeaveFlowCore,\n    startExitAuditBoundCore\n  } = require('./src/browser/runtime/exit-relogin');\n\n"
    : '';
  const offlineUnsafePredicateCall = options.bundledRuntime
    ? 'offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety)'
    : 'offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety)';
  const pendingStaminaSuppressCall = options.bundledRuntime
    ? 'primePendingStaminaExitLoginSuppressBoundCore(detail, { now: Date.now, staminaBudgetReloginDelayMs, staminaResetHoldUntil, setLoginSuppress })'
    : 'primePendingStaminaExitLoginSuppress(detail)';
  const reloginDelayForHpBinding = options.bundledRuntime
    ? 'reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp })'
    : 'reloginDelayForHp';
  const pendingUnsafeSuppressCall = (storageReason, reason, detail, selfLike) => options.bundledRuntime
    ? `primePendingUnsafeExitLoginSuppressBoundCore(${storageReason}, ${reason}, ${detail}, ${selfLike}, {}, { hpInfoForRelogin, ${reloginDelayForHpBinding}, cfg, setLoginSuppress, now: Date.now })`
    : `primePendingUnsafeExitLoginSuppress(${storageReason}, ${reason}, ${detail}, ${selfLike})`;
  const startExitAuditCall = (detail, meta) => options.bundledRuntime
    ? `startExitAuditBoundCore(${detail}, ${meta}, bot, { resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now })`
    : `startExitAudit(${detail}, ${meta})`;
  const offlineLeaveSummaryCall = (reason, offlineSafety) => options.bundledRuntime
    ? `offlineLeaveSummaryForLeaveFlowCore(${reason}, ${offlineSafety}, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })`
    : `offlineLeaveSummary(${reason}, ${offlineSafety})`;
  const injuryLeaveSummaryCall = injury => options.bundledRuntime
    ? `injuryLeaveSummaryForLeaveFlowCore(${injury}, { actorLabel, hpDisplay })`
    : `injuryLeaveSummary(${injury})`;
  const pursuitLeaveSummaryCall = pursuit => options.bundledRuntime
    ? `pursuitLeaveSummaryForLeaveFlowCore(${pursuit}, { actorLabel, formatDurationMs, formatDistance })`
    : `pursuitLeaveSummary(${pursuit})`;
  return String.raw`${runtimeExitReloginPrelude}  async function leaveOffline(reason, selfSummary = null, offlineSafety = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('offline', reason, {
      self: selfSummary,
      offlineSafety,
      summary: ${offlineLeaveSummaryCall('reason', 'offlineSafety')}
    });
    if (skipped) return skipped;
    const retryMs = Math.max(200, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    if (t - Number(bot.lastOfflineLeaveAt || 0) < retryMs) {
      const active = activeOfflineLeaveDetail(t);
      const summary = ${offlineLeaveSummaryCall('reason', 'offlineSafety')};
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastOfflineLeaveAt || 0)))),
        offlineSafety,
        summary: summary || active?.summary || '',
        reloginUntil: active?.reloginUntil || bot.offlineReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || 0
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety,
      summary: ${offlineLeaveSummaryCall('reason', 'offlineSafety')},
      error: ''
    };
    ${startExitAuditCall('detail', "{ scope: 'offline', source: 'offline', reason, self: selfSummary, offlineSafety }")};
    bot.lastOfflineLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      const staminaSuppress = ${pendingStaminaSuppressCall};
      if (!staminaSuppress && ${offlineUnsafePredicateCall}) {
        ${pendingUnsafeSuppressCall("'offline leave'", 'reason', 'detail', 'selfSummary')};
      }
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('offline', 'offline', detail, selfSummary);
    }
    finalizeLeaveDisplayReason(detail);
    bot.lastOfflineLeaveResult = detail;
    return detail;
  }

  async function leaveForInjury(injury) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('injury', 'injury hp drop', {
      injury,
      summary: ${injuryLeaveSummaryCall('injury')}
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastInjuryLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastInjuryLeaveAt || 0)))),
        injury,
        summary: ${injuryLeaveSummaryCall('injury')}
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'injury hp drop',
      at: t,
      userId: getCurrentUserId() || null,
      injury,
      summary: ${injuryLeaveSummaryCall('injury')},
      error: ''
    };
    ${startExitAuditCall('detail', "{ scope: 'enemy', source: 'injury', reason: detail.reason, self: injury?.self || injury, injury }")};
    bot.lastInjuryLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      ${pendingUnsafeSuppressCall("'enemy leave'", 'detail.reason', 'detail', 'injury?.self || injury')};
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'injury', detail, injury?.self || injury);
      bot.pendingInjuryLeave = null;
    }
    bot.lastInjuryLeaveResult = detail;
    return detail;
  }

  async function leaveForPursuit(pursuit, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const pursuitSummary = summarizePursuit(pursuit);
    const skipped = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: ${pursuitLeaveSummaryCall('pursuitSummary')}
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastPursuitLeaveAt || 0) < cfg.pursuitLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.pursuitLeaveRetryMs - (t - Number(bot.lastPursuitLeaveAt || 0)))),
        pursuit: pursuitSummary,
        summary: ${pursuitLeaveSummaryCall('pursuitSummary')}
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'sustained pursuit',
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: ${pursuitLeaveSummaryCall('pursuitSummary')},
      error: ''
    };
    ${startExitAuditCall('detail', "{ scope: 'enemy', source: 'pursuit', reason: detail.reason, self: selfSummary, pursuit: pursuitSummary }")};
    bot.lastPursuitLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      ${pendingUnsafeSuppressCall("'enemy leave'", 'detail.reason', 'detail', 'selfSummary')};
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'pursuit', detail, selfSummary);
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
    }
    bot.lastPursuitLeaveResult = detail;
    return detail;
  }

  async function leaveForCombat(action, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const reason = action?.reason === 'combat-critical-hp-leave'
      ? 'combat critical hp'
      : action?.reason === 'combat-hp-disadvantage-leave'
        ? 'combat hp disadvantage'
        : action?.reason === 'combat-low-hp-no-damage-leave'
          ? 'combat low hp no damage'
          : 'combat low hp disadvantage';
    const skipped = pendingExitSkipNewLeave('combat', reason, {
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastCombatLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastCombatLeaveAt || 0)))),
        combat: action?.combatState || null,
        combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
        target: action?.target || null,
        summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
      };
      finalizeLeaveDisplayReason(detail);
      rememberPendingCombatLeave(action, selfSummary, detail);
      return detail;
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}),
      error: ''
    };
    ${startExitAuditCall('detail', "{ scope: 'enemy', source: 'combat', reason, self: selfSummary, target: action?.target || null, combat: action?.combatState || null }")};
    bot.lastCombatLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      ${pendingUnsafeSuppressCall("'enemy leave'", 'detail.reason', 'detail', 'selfSummary')};
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'combat', detail, selfSummary);
      bot.pendingCombatLeave = null;
    } else {
      rememberPendingCombatLeave(action, selfSummary, detail);
    }
    bot.lastCombatLeaveResult = detail;
    return detail;
  }

  async function leaveDuringEnemyHold(reason = 'enemy leave wait') {
    const t = Date.now();
    const retryMs = Math.max(cfg.pursuitLeaveRetryMs, cfg.combatLeaveRetryMs);
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('enemy-hold-retry', reason, {
      summary: activeEnemyLeaveDetail(t)?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || ''
    });
    if (skipped) return skipped;
	    const active = activeEnemyLeaveDetail(t);
	    if (t - Number(bot.lastEnemyLeaveRetryAt || 0) < retryMs) {
	      const detail = {
	        attempted: false,
	        reason: 'cooldown',
	        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastEnemyLeaveRetryAt || 0)))),
	        holdRemainingMs: enemyReloginHoldRemainingMs(),
        summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
        reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0
	      };
      return finalizeLeaveDisplayReason(detail);
	    }
		    const detail = {
		      attempted: false,
		      method: '',
		      reason,
      at: t,
		      userId: getCurrentUserId() || null,
		      holdRemainingMs: enemyReloginHoldRemainingMs(),
      summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
      reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
      reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0,
	      error: ''
	    };
    ${startExitAuditCall('detail', "{ scope: 'enemy', source: 'enemy-hold-retry', reason }")};
    bot.lastEnemyLeaveRetryAt = t;
    await issueLeaveCommand(detail);
	    if (detail.attempted && !detail.error) bot.pendingCombatLeave = null;
	    detail.holdRemainingMs = enemyReloginHoldRemainingMs();
    finalizeLeaveDisplayReason(detail);
	    bot.lastEnemyLeaveRetryResult = detail;
    return detail;
  }

`;
}

module.exports = {
  leaveFlowSource
};
