'use strict';

function fallbackNow() {
  return Date.now();
}

function fallbackPerformanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function noop() {}

function createBotApiRuntime(runtime = {}) {
  const {
    bot,
    cfg = {},
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    botKey = '',
    pausedKey = '',
    pauseReasonKey = '',
    enemyLeaveStreakKey = '',
    readPageGlobal = (_key, fallbackValue) => fallbackValue,
    installPageGlobal = noop,
    wallNow = fallbackNow,
    performanceNow = fallbackPerformanceNow,
    clearTimeoutFn = typeof clearTimeout !== 'undefined' ? clearTimeout : noop,
    clearIntervalFn = typeof clearInterval !== 'undefined' ? clearInterval : noop,
    stopMotionSafely = noop,
    detachNativeMessagePump = noop,
    closeControlWs = noop,
    flushCombatLogs = noop,
    logStatus = noop,
    removeBotPanel = noop,
    removeTargetOverlay = noop,
    renderTargetOverlay = noop,
    forceLoginNow = () => null,
    configureCombatLogging = () => null,
    tick = () => null,
    syncPausedFromPage = () => false,
    triggerNativeTick = () => false,
    getSelf = () => null,
    summarizeSelf = value => value,
    updateKillHistory = noop,
    updateSessionStats = noop,
    summarizeSessionStats = () => null,
    summarizeTodaySessionStats = () => null,
    activeEnemyLeaveDetail = () => null,
    activeOfflineLeaveDetail = () => null,
    exitMotionStopLockRemainingMs = () => 0,
    postExitDecisionWithoutTargetForStatusCore = value => value,
    summarizeNetworkQuality = () => null,
    summarizeTargetWhitelistStatus = () => null,
    summarizeCombatLoggingStatus = () => null,
    summarizeImportantLoggingStatus = () => null,
    unresolvedExitAuditLogCount = () => 0,
    pendingExitAuditLogIds = () => [],
    summarizeSessionMismatchRecoveryStatus = () => null,
    snapshotLoginGateStatus = () => null,
    summarizeReloginGateStatus = () => null,
    arrayCount = value => Array.isArray(value) ? value.length : 0,
    summarizeControl = () => null,
    summarizeServerPositionStall = () => null,
    summarizeActionSettlementStall = () => null,
    normalizePendingExitReloadConfirmationCore = value => value,
    pendingExitRetryMsForBotObjectCore = () => 0,
    summarizePendingExitForBotObjectCore = () => null,
    summarizePursuit = value => value || null,
    latestEnemyLeaveSummary = () => '',
    latestEnemyLeaveDisplayReason = () => '',
    readEnemyLeaveStreakBoundCore = () => 0,
    summarizePendingCombatLeave = value => value || null
  } = runtime;

  function activeBot(context) {
    return context && typeof context === 'object' ? context : bot;
  }

  function statusPendingExit(current) {
    const pendingExitSummaryPending = current.pendingExit;
    if (!pendingExitSummaryPending) return null;
    const pendingExitSummaryNow = wallNow();
    const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(
      pendingExitSummaryPending.reloadConfirmation,
      pendingExitSummaryPending,
      pendingExitSummaryNow
    );
    return summarizePendingExitForBotObjectCore(pendingExitSummaryPending, {
      nowMs: pendingExitSummaryNow,
      retryMs: pendingExitRetryMsForBotObjectCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
      reloadConfirmation: pendingExitSummaryReload
    });
  }

  return {
    stop(reason = 'manual') {
      const current = activeBot(this);
      current.running = false;
      current.stopReason = reason;
      if (current.velocityStopTimer) clearTimeoutFn(current.velocityStopTimer);
      current.velocityStopTimer = 0;
      current.velocityPulseToken += 1;
      stopMotionSafely('stop');
      detachNativeMessagePump();
      closeControlWs(reason);
      if (current.timer) clearIntervalFn(current.timer);
      current.timer = 0;
      if (current.targetWhitelist?.timer) clearIntervalFn(current.targetWhitelist.timer);
      if (current.targetWhitelist) current.targetWhitelist.timer = 0;
      try {
        if (!String(reason || '').startsWith('replaced by ')) flushCombatLogs(true);
      } catch (_) {}
      logStatus('stopped: ' + reason);
      if (readPageGlobal(botKey, null, pageGlobal) === current) {
        removeBotPanel();
        removeTargetOverlay();
      }
    },
    setPaused(paused, reason = 'external') {
      const current = activeBot(this);
      const next = Boolean(paused);
      const changed = current.paused !== next;
      current.paused = next;
      current.pauseReason = next ? String(reason || 'manual') : '';
      if (changed) current.pauseChangedAt = wallNow();
      installPageGlobal('__graspRatBotPaused', next, pageGlobal);
      installPageGlobal('__graspRatBotPauseReason', current.pauseReason, pageGlobal);
      try {
        if (storage) {
          storage.setItem(pausedKey, next ? 'true' : 'false');
          if (next) storage.setItem(pauseReasonKey, current.pauseReason || 'manual');
          else storage.removeItem(pauseReasonKey);
        }
      } catch (_) {}
      if (changed && next) {
        stopMotionSafely('paused');
        removeTargetOverlay();
      }
      if (next) {
        current.lastDecision = {
          kind: 'idle',
          reason: 'paused',
          dx: 0,
          dy: 0,
          self: current.lastSelf,
          paused: true,
          pauseReason: current.pauseReason || 'manual'
        };
        renderTargetOverlay(current.lastDecision);
      }
      return current.status();
    },
    forceLoginNow(reason = 'panel immediate login') {
      return forceLoginNow(reason);
    },
    configureCombatLogging(options = {}) {
      return configureCombatLogging(options);
    },
    configureClashLeaveRescue(options = {}) {
      const current = activeBot(this);
      if (Object.prototype.hasOwnProperty.call(options || {}, 'enabled')) {
        cfg.clashLeaveRescueEnabled = Boolean(options.enabled);
      }
      if (Object.prototype.hasOwnProperty.call(options || {}, 'timeoutMs')) {
        cfg.clashLeaveRescueTimeoutMs = Math.max(1000, Number(options.timeoutMs || cfg.clashLeaveRescueTimeoutMs || 9000) || 9000);
      }
      current.clashLeaveRescue.enabled = Boolean(cfg.clashLeaveRescueEnabled);
      return {
        enabled: Boolean(cfg.clashLeaveRescueEnabled),
        timeoutMs: Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
        lastResult: current.clashLeaveRescue.lastResult || null
      };
    },
    step(source = 'external') {
      return tick(source);
    },
    status() {
      const current = activeBot(this);
      try {
        if (!current.ticking) syncPausedFromPage(false);
      } catch (_) {}
      const t = wallNow();
      if (current.running && !current.ticking && current.lastTickAt && t - current.lastTickAt > Math.max(3000, cfg.tickMs * 10)) {
        triggerNativeTick('status-watchdog', false);
      }
      const self = getSelf();
      const currentSelfSummary = self ? summarizeSelf(self) : null;
      const displaySelf = currentSelfSummary || current.lastSelf;
      if (self) updateKillHistory(self);
      updateSessionStats(currentSelfSummary);
      const session = summarizeSessionStats(displaySelf);
      const todaySession = summarizeTodaySessionStats(session, displaySelf);
      const enemyLeaveDetail = activeEnemyLeaveDetail();
      const offlineLeaveDetail = activeOfflineLeaveDetail();
      const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
      const displayLastDecision = exitMotionLockRemainingMs > 0
        ? postExitDecisionWithoutTargetForStatusCore(current.lastDecision, current.lastExitMotionStopReason || 'exit-motion-stopped', { lastExitMotionStopReason: current.lastExitMotionStopReason, exitMotionLockRemainingMs })
        : current.lastDecision;
      const perfNow = performanceNow();
      return {
        version: cfg.version,
        sourceHash: cfg.sourceHash,
        sourceUrl: cfg.sourceUrl,
        injectedBy: cfg.injectedBy,
        running: current.running,
        paused: Boolean(current.paused),
        pauseReason: current.pauseReason || '',
        pauseChangedAt: current.pauseChangedAt || 0,
        ticking: Boolean(current.ticking),
        timerActive: Boolean(current.timer),
        dryRun: cfg.dryRun,
        starting: Boolean(current.starting),
        tickCount: current.tickCount,
        uptimeMs: t - current.startedAt,
        lastTickAt: current.lastTickAt,
        lastTickAgeMs: current.lastTickAt ? t - current.lastTickAt : null,
        lastTickGapMs: current.lastTickGapMs,
        lastTickSource: current.lastTickSource || '',
        lastTickCompletedAt: current.lastTickCompletedAt || 0,
        lastTickCombatActive: Boolean(current.lastTickCombatActive),
        combatTickGap: current.lastCombatTickGap || null,
        lastTickReentryGapAt: current.lastTickReentryGapAt || 0,
        lastNativeTickAgeMs: current.lastNativeTickAt ? perfNow - current.lastNativeTickAt : null,
        lastAction: current.lastAction,
        lastDecision: displayLastDecision,
        lastTarget: current.lastTarget,
        combatTarget: current.combatTarget,
        combatAim: current.combatAim,
        networkQuality: summarizeNetworkQuality(),
        targetWhitelist: summarizeTargetWhitelistStatus(),
        combatLogging: summarizeCombatLoggingStatus(),
        importantLogging: summarizeImportantLoggingStatus(),
        exitAudit: {
          pending: unresolvedExitAuditLogCount(),
          pendingIds: pendingExitAuditLogIds().slice(0, 12),
          restored: Number(current.exitAudit?.restored || 0),
          lastEvent: current.exitAudit?.lastEvent || null,
          lastBlockedReload: current.exitAudit?.lastBlockedReload || null,
          lastBlockedLogin: current.exitAudit?.lastBlockedLogin || null
        },
        opportunityChoice: current.opportunityChoice,
        opportunitySwitchLock: current.opportunitySwitchLock,
        leave403SnapshotRecovery: current.leave403SnapshotRecovery,
        clashLeaveRescue: {
          enabled: Boolean(cfg.clashLeaveRescueEnabled),
          running: Boolean(current.clashLeaveRescue?.running),
          lastAt: Number(current.clashLeaveRescue?.lastAt || 0) || 0,
          lastAgeMs: current.clashLeaveRescue?.lastAt ? Math.max(0, Math.round(t - Number(current.clashLeaveRescue.lastAt || t))) : null,
          lastStage: current.clashLeaveRescue?.lastStage || '',
          lastResult: current.clashLeaveRescue?.lastResult || null,
          attempts: Array.isArray(current.clashLeaveRescue?.attempts) ? current.clashLeaveRescue.attempts.slice(-8) : []
        },
        sessionMismatchRecovery: summarizeSessionMismatchRecoveryStatus(),
        loginSnapshotGate: snapshotLoginGateStatus(),
        reloginGate: summarizeReloginGateStatus(),
        postLoginZoom: current.postLoginZoom,
        exitMotionStop: {
          at: current.lastExitMotionStopAt || 0,
          reason: current.lastExitMotionStopReason || '',
          lockRemainingMs: exitMotionLockRemainingMs
        },
        self: displaySelf,
        lastSelf: displaySelf,
        session,
        todaySession,
        safety: current.lastSafety,
        attackHistory: current.attackHistory.slice(-10),
        killHistory: current.killHistory.slice(-10),
        coinProgress: current.coinProgress,
        lastCoinCollected: current.lastCoinCollected,
        coinAttempts: Array.from(current.coinAttempts.values()).slice(-8).map(item => ({
          id: item.id,
          bestDistance: Math.round(item.bestDistance),
          lastDistance: Math.round(item.lastDistance),
          closeAgeMs: item.closeStartedAt ? Math.max(0, Math.round(perfNow - item.closeStartedAt)) : 0,
          lastSeenAgeMs: item.lastSeenAt ? Math.max(0, Math.round(perfNow - item.lastSeenAt)) : 0
        })),
        ignoredCoins: Array.from(current.ignoredCoins.entries()).map(([id, until]) => ({
          id,
          remainingMs: Math.max(0, Math.round(until - perfNow))
        })),
        coinFailures: Array.from(current.coinFailures.entries()).slice(-8).map(([id, item]) => ({
          id,
          count: Number(item.count || 0),
          reason: item.reason || '',
          remainingMs: Math.max(0, Math.round(Number(item.ignoreUntil || 0) - perfNow))
        })),
        snapshotCoinWait: {
          since: current.snapshotCoinWaitSince || 0,
          ageMs: Math.max(0, Math.round(Number(current.lastSnapshotCoinWaitAgeMs || 0))),
          maxMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0))),
          remainingMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0) - Number(current.lastSnapshotCoinWaitAgeMs || 0)))
        },
        coinSources: current.lastCoinSourceSummary,
        coinDiagnostics: current.coinDiagnostics,
        targetSwitchDiagnostics: current.targetSwitchDiagnostics,
        finalActionArbitration: current.finalActionArbitration,
        globalState: {
          refreshedAt: current.globalState.refreshedAt,
          snapshotRefreshedAt: current.globalState.snapshotRefreshedAt,
          snapshotAgeMs: current.globalState.snapshotRefreshedAt ? t - current.globalState.snapshotRefreshedAt : null,
          tick: current.globalState.tick,
          entities: arrayCount(current.globalState.entities),
          bullets: arrayCount(current.globalState.bullets),
          coinDrops: arrayCount(current.globalState.coinDrops),
          minimapPoints: current.globalState.minimap?.points?.length || 0,
          error: current.globalState.error,
          samplingOutage: current.globalState.samplingOutage || null,
          loginSnapshotGate: snapshotLoginGateStatus()
        },
        control: summarizeControl(),
        serverPositionStall: summarizeServerPositionStall(),
        actionSettlementStall: summarizeActionSettlementStall(),
        login: {
          lastAt: current.lastLoginAt || 0,
          lastAgeMs: current.lastLoginAt ? t - current.lastLoginAt : null,
          lastResult: current.lastLoginResult
        },
        pendingExit: statusPendingExit(current),
        offlineLeave: {
          lastAt: current.lastOfflineLeaveAt || 0,
          lastAgeMs: current.lastOfflineLeaveAt ? t - current.lastOfflineLeaveAt : null,
          holdUntil: current.offlineReloginUntil || 0,
          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(current.offlineReloginUntil || 0) - t)),
          safety: current.lastOfflineSafety,
          summary: offlineLeaveDetail?.summary || '',
          displayReason: offlineLeaveDetail?.displayReason || '',
          lastWaitMs: current.lastOfflineLeaveWaitMs || offlineLeaveDetail?.reloginDelayMs || offlineLeaveDetail?.holdRemainingMs || 0,
          lastResult: current.lastOfflineLeaveResult
        },
        pursuit: summarizePursuit(current.pursuit),
        pursuitLeave: {
          lastAt: current.lastPursuitLeaveAt || 0,
          lastAgeMs: current.lastPursuitLeaveAt ? t - current.lastPursuitLeaveAt : null,
          holdUntil: current.pursuitReloginUntil || 0,
          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(current.pursuitReloginUntil || 0) - t)),
          lastResult: current.lastPursuitLeaveResult
        },
        enemyLeave: {
          holdUntil: current.pursuitReloginUntil || 0,
          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(current.pursuitReloginUntil || 0) - t)),
          reason: enemyLeaveDetail?.reason || current.lastInjuryLeaveResult?.reason || current.lastPursuitLeaveResult?.reason || current.lastCombatLeaveResult?.reason || '',
          summary: enemyLeaveDetail?.summary || latestEnemyLeaveSummary(),
          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
          streak: readEnemyLeaveStreakBoundCore(storage, bot, cfg, t, { enemyLeaveStreakKey }),
          lastWaitMs: current.lastEnemyLeaveWaitMs || enemyLeaveDetail?.reloginDelayMs || enemyLeaveDetail?.holdRemainingMs || 0,
          enemyActor: enemyLeaveDetail?.enemyActor || null,
          reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
          lastInjuryResult: current.lastInjuryLeaveResult,
          lastPursuitResult: current.lastPursuitLeaveResult,
          lastCombatResult: current.lastCombatLeaveResult,
          lastRetryResult: current.lastEnemyLeaveRetryResult
        },
        combatLeave: {
          lastAt: current.lastCombatLeaveAt || 0,
          lastAgeMs: current.lastCombatLeaveAt ? t - current.lastCombatLeaveAt : null,
          lastResult: current.lastCombatLeaveResult,
          pending: summarizePendingCombatLeave(current.pendingCombatLeave)
        },
        stopReason: current.stopReason,
        errors: current.errors.slice(-5)
      };
    }
  };
}

module.exports = {
  createBotApiRuntime
};
