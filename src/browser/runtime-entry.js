'use strict';

// This file is the browser runtime entry that esbuild bundles for both remote
// production and local CDP/eval injection. Keep it executable; do not rebuild
// a source-fragment layer around it.
const __graspRatRuntimeStartup = (() => {
  const { createRuntimeShellContext } = require('./runtime/runtime-shell');
  const { createRuntimeBotState } = require('./runtime/runtime-bot-state');
  const { createBotApiRuntime } = require('./runtime/bot-api-runtime');
  const { createEntityStateRuntime } = require('./runtime/entity-state-runtime');
  const runtimeShell = createRuntimeShellContext(__GRASP_RAT_RUNTIME_CONFIG__, {
    storage: localStorage,
    now: Date.now,
    performanceNow: () => performance.now()
  });
  const {
    runtimeBootstrapBindings,
    runtimeStateBindings,
    botStatusCores
  } = runtimeShell;
		  const {
		    pageGlobalObject,
		    resolvePageGlobal,
		    readPageGlobal,
		    installPageGlobal,
		    readPageLocalStorageJson,
		    pageGlobal,
		    baseConfig,
		    runtimeConfig,
		    config,
		    OPPORTUNITY_CONSTANTS,
		    BOT_KEY,
		    PANEL_ID,
		    TARGET_OVERLAY_ID,
		    PAUSED_KEY,
		    PAUSE_REASON_KEY,
		    LOGIN_SUPPRESS_KEY,
		    LOGIN_SUPPRESS_REASON_KEY,
		    LOGIN_POINT_SAFETY_KEY,
		    SESSION_MISMATCH_RECOVERY_KEY,
		    EXIT_AUDIT_PENDING_LOGS_KEY,
		    COMBAT_LOG_PENDING_ENTRIES_KEY,
		    IMPORTANT_LOGS_KEY,
		    PENDING_EXIT_STATE_KEY,
		    ENEMY_LEAVE_STREAK_KEY,
		    ENEMY_LEAVE_STATE_KEY,
		    OFFLINE_LEAVE_STATE_KEY,
		    LAST_SELF_STATE_KEY,
		    CLOUDFLARE_RELOAD_KEY,
		    normalizeTargetWhitelistName,
		    parseTargetWhitelistNames,
		    deriveTargetWhitelistUrl,
		    staminaExhaustedLongWindows,
		    staminaEvidenceRemaining,
		    staminaHoldContradictedByStaminaEvidence,
		    previousBot,
		    preserved,
		    combatLogEndpointConfigured,
		    cfg,
		    targetWhitelistUrl,
		    preservedTargetWhitelistUrl,
		    preservedTargetWhitelistMatchesUrl,
		    preservedTargetWhitelistNames,
		    targetWhitelistState
		  } = runtimeBootstrapBindings;

		  const {
		    readPersistentLastSelfState,
		    writePersistentLastSelfState,
		    refreshExitDetail,
		    readPersistentExitState,
		    writePersistentExitState,
		    clearPersistentExitState,
		    clearPersistentPendingExitState,
		    pendingExitRetryCoreOptionsForPersistence,
		    pendingExitPersistenceCoreHelpers,
		    normalizePendingExitReloadConfirmationCore,
		    writePersistentPendingExitStateCore,
		    restoredRuntimeState,
		    restoredFailures,
		    restoredEnemyLeaveState,
		    restoredOfflineLeaveState,
		    restoredPendingExitState,
		    initialPendingExitState,
		    loginSnapshotSuccessRequiredCore,
		    normalizeLoginSnapshotGateStateCore,
		    recordRuntimeDiagnosticsCore
		  } = runtimeStateBindings;

  const {
    postExitDecisionWithoutTargetForStatusCore,
    readEnemyLeaveStreakBoundCore,
    pendingExitRetryMsForBotObjectCore,
    summarizePendingExitForBotObjectCore
  } = botStatusCores;

			  const bot = createRuntimeBotState({
      cfg,
      config,
      preserved,
      previousBot,
      targetWhitelistState,
      initialPendingExitState,
      restoredEnemyLeaveState,
      restoredOfflineLeaveState,
      restoredFailures,
      readPersistentLastSelfState,
      readPageGlobal,
      pageGlobal,
      normalizeLoginSnapshotGateStateCore,
      loginSnapshotSuccessRequiredCore,
      performanceNow: () => performance.now()
    });

    Object.assign(bot, createBotApiRuntime({
      bot,
      cfg,
      storage: localStorage,
      pageGlobal,
      botKey: BOT_KEY,
      pausedKey: PAUSED_KEY,
      pauseReasonKey: PAUSE_REASON_KEY,
      enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY,
      readPageGlobal,
      installPageGlobal,
      wallNow: Date.now,
      performanceNow: () => performance.now(),
      stopMotionSafely: (...args) => stopMotionSafely(...args),
      detachNativeMessagePump: (...args) => detachNativeMessagePump(...args),
      closeControlWs: (...args) => closeControlWs(...args),
      flushCombatLogs: (...args) => flushCombatLogs(...args),
      logStatus: (...args) => logStatus(...args),
      removeBotPanel: (...args) => removeBotPanel(...args),
      removeTargetOverlay: (...args) => removeTargetOverlay(...args),
      renderTargetOverlay: (...args) => renderTargetOverlay(...args),
      forceLoginNow: (...args) => forceLoginNow(...args),
      configureCombatLogging: (...args) => configureCombatLogging(...args),
      tick: (...args) => tick(...args),
      syncPausedFromPage: (...args) => syncPausedFromPage(...args),
      triggerNativeTick: (...args) => triggerNativeTick(...args),
      getSelf: (...args) => getSelf(...args),
      summarizeSelf: (...args) => summarizeSelf(...args),
      updateKillHistory: (...args) => updateKillHistory(...args),
      updateSessionStats: (...args) => updateSessionStats(...args),
      summarizeSessionStats: (...args) => summarizeSessionStats(...args),
      summarizeTodaySessionStats: (...args) => summarizeTodaySessionStats(...args),
      activeEnemyLeaveDetail: (...args) => activeEnemyLeaveDetail(...args),
      activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
      exitMotionStopLockRemainingMs: (...args) => exitMotionStopLockRemainingMs(...args),
      postExitDecisionWithoutTargetForStatusCore,
      summarizeNetworkQuality: (...args) => summarizeNetworkQuality(...args),
      summarizeTargetWhitelistStatus: (...args) => summarizeTargetWhitelistStatus(...args),
      summarizeCombatLoggingStatus: (...args) => summarizeCombatLoggingStatus(...args),
      summarizeImportantLoggingStatus: (...args) => summarizeImportantLoggingStatus(...args),
      unresolvedExitAuditLogCount: (...args) => unresolvedExitAuditLogCount(...args),
      pendingExitAuditLogIds: (...args) => pendingExitAuditLogIds(...args),
      summarizeSessionMismatchRecoveryStatus: (...args) => summarizeSessionMismatchRecoveryStatus(...args),
      snapshotLoginGateStatus: (...args) => snapshotLoginGateStatus(...args),
      summarizeReloginGateStatus: (...args) => summarizeReloginGateStatus(...args),
      arrayCount: (...args) => arrayCount(...args),
      summarizeControl: (...args) => summarizeControl(...args),
      summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
      summarizeActionSettlementStall: (...args) => summarizeActionSettlementStall(...args),
      normalizePendingExitReloadConfirmationCore,
      pendingExitRetryMsForBotObjectCore,
      summarizePendingExitForBotObjectCore,
      summarizePursuit: (...args) => summarizePursuit(...args),
      latestEnemyLeaveSummary: (...args) => latestEnemyLeaveSummary(...args),
      latestEnemyLeaveDisplayReason: (...args) => latestEnemyLeaveDisplayReason(...args),
      readEnemyLeaveStreakBoundCore,
      summarizePendingCombatLeave: (...args) => summarizePendingCombatLeave(...args)
    }));

	  const {
	    hypot,
	    now,
	    dist,
	    speed,
	    clamp,
	    isAlive,
	    dropValue,
	    truthyFlag,
	    isInvulnerable,
	    isJoinModeActive,
	    isInvulnerableActive,
	    staminaRemaining,
	    staminaLimitValue,
	    staminaExhaustedThreshold,
	    combatMovementBlockedByStamina,
	    isFiringEntity,
	    isMovingThreat,
	    isCurrentlyActive,
	    hasCombatActivitySignal,
	    isAvoidanceThreat,
	    isAfkProfitTarget,
	    hpValue,
	    combatHpValue,
	    knownHpValue,
	    isFullHp,
	    decorateActiveThreat,
	    isRecovering,
	    isConservingStamina
	  } = createEntityStateRuntime({
	    cfg,
	    performanceNow: () => performance.now()
	  });


  const { createTargetWhitelistRuntime } = require('./runtime/target-whitelist');
  const {
    isWhitelistedTarget,
    summarizeTargetWhitelistStatus,
    refreshTargetWhitelist,
    startTargetWhitelistPolling
  } = createTargetWhitelistRuntime({
    bot,
    cfg,
    targetWhitelistState,
    fetchJsonNoStore: (...args) => fetchJsonNoStore(...args),
    recordUnhandledTickError: (...args) => recordUnhandledTickError(...args),
    locationHref: () => location.href,
    now: Date.now,
    setInterval
  });


  const { createStaminaStatusRuntime } = require('./runtime/stamina-status');
  const {
    summarizeStamina,
    dailyStaminaWindowStartAt,
    nextDailyStaminaResetAt,
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    longStaminaHoldContradictedByKnownStamina,
    startupStaminaSampleLooksUnsettled,
    deferredStaminaExhaustionLeave,
    staleOfflineStaminaHoldContradicted
  } = createStaminaStatusRuntime({
    bot,
    cfg,
    staminaRemaining,
    staminaLimitValue,
    staminaExhaustedThreshold,
    staminaExhaustedLongWindows,
    staminaHoldContradictedByStaminaEvidence
  });

const { attackWorthTakingCore } = require('./runtime/attack-worth');

const {
    exitMotionStopLockRemainingMsCore,
    postExitDecisionWithoutTargetCore
  } = require('./runtime/exit-motion');
const {
    reloginDelayForHpCore,
    unsafeExitReloginMinDelayMsCore
  } = require('./runtime/exit-relogin');
const {
    staminaExhaustedWindowLabel
  } = require('./runtime/exit-summary');

  const unsafeExitReloginMinDelayMs = () => unsafeExitReloginMinDelayMsCore(cfg);

  function exitMotionStopLockRemainingMs(t = Date.now()) {
    return exitMotionStopLockRemainingMsCore(bot.lastExitMotionStopAt, cfg.exitMotionStopLockMs, t);
  }

  function clearPostExitTargetState(reason = 'exit-confirmed') {
    const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
    bot.lastTarget = null;
    bot.lastTargetAt = 0;
    bot.opportunityChoice = null;
    resetOpportunitySwitchLock();
    bot.staleCoinEscape = null;
    bot.coinApproachLock = null;
    removeTargetOverlay();
    if (bot.lastDecision && typeof bot.lastDecision === 'object') {
      bot.lastDecision = postExitDecisionWithoutTargetCore(bot.lastDecision, reason, {
        lastExitMotionStopReason: bot.lastExitMotionStopReason,
        exitMotionLockRemainingMs
      });
      try {
        updateBotPanel(bot.lastDecision);
      } catch (_) {}
    }
  }


  const { createTargetOverlayRuntime } = require('./runtime/target-overlay');
  const {
    removeTargetOverlay,
    renderTargetOverlay
  } = createTargetOverlayRuntime({
    bot,
    cfg,
    targetOverlayId: TARGET_OVERLAY_ID,
    loginPointSafetyKey: LOGIN_POINT_SAFETY_KEY,
    storage: localStorage,
    exitMotionStopLockRemainingMs,
    getNativeState: () => getNativeState(),
    getSelf: () => getSelf(),
    getCurrentUserId: () => getCurrentUserId(),
    getNativeCoinList: () => getNativeCoinList(),
    normalizeCoinDrop: (...args) => normalizeCoinDrop(...args),
    getNativeEntityList: () => getNativeEntityList(),
    getEntities: () => getEntities(),
    firstFiniteNumber: (...args) => firstFiniteNumber(...args),
    dist,
    isAlive,
    loginPointSafetyStatus: () => loginPointSafetyStatus()
  });


const { escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay } = require('./runtime/display-format');


	  function activeEnemyLeaveDetail(t = Date.now()) {
	    const current = latestEnemyLeaveResult();
	    const restored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
	    const picked = current || restored || bot.lastEnemyLeaveResult || null;
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	      if (bot.lastEnemyLeaveResult === picked) bot.lastEnemyLeaveResult = null;
	      return null;
	    }
	    bot.lastEnemyLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.pursuitReloginUntil = Math.max(Number(bot.pursuitReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function activeOfflineLeaveDetail(t = Date.now()) {
	    const picked = bot.lastOfflineLeaveResult || readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
	      if (bot.lastOfflineLeaveResult === picked) bot.lastOfflineLeaveResult = null;
	      return null;
	    }
	    bot.lastOfflineLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.offlineReloginUntil = Math.max(Number(bot.offlineReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function latestEnemyLeaveResult() {
	    const candidates = [
	      { at: Number(bot.lastEnemyLeaveResult?.at || 0), result: bot.lastEnemyLeaveResult },
	      { at: Number(bot.lastCombatLeaveResult?.at || bot.lastCombatLeaveAt || 0), result: bot.lastCombatLeaveResult },
	      { at: Number(bot.lastPursuitLeaveResult?.at || bot.lastPursuitLeaveAt || 0), result: bot.lastPursuitLeaveResult },
	      { at: Number(bot.lastInjuryLeaveResult?.at || bot.lastInjuryLeaveAt || 0), result: bot.lastInjuryLeaveResult }
    ].filter(item => item.result);
    return candidates.sort((a, b) => b.at - a.at)[0]?.result || null;
  }

  function latestEnemyLeaveSummary() {
    const result = latestEnemyLeaveResult();
    return result?.summary || result?.exitSummary || result?.enemyLeaveSummary || result?.displayReason || '';
  }

  function latestEnemyLeaveDisplayReason() {
    const result = latestEnemyLeaveResult();
    return result?.displayReason || result?.summary || result?.exitSummary || result?.enemyLeaveSummary || '';
  }

  const { createStatusPanelRuntime } = require('./runtime/status-panel');
  const {
    removeBotPanel,
    updateBotPanel
  } = createStatusPanelRuntime({
    bot,
    cfg,
    panelId: PANEL_ID,
    renderTargetOverlay,
    dropValue,
    summarizeControl: () => summarizeControl(),
    summarizePursuit: (...args) => summarizePursuit(...args)
  });

			  function logStatus(text, detail) {
			    bot.lastAction = text;
			    if (detail) bot.lastDecision = detail;
			    if (bot.running) updateBotPanel(bot.lastDecision || detail || { kind: 'wait', reason: text, self: bot.lastSelf });
			    if (typeof log === 'function') log('[bot] ' + text, 'info');
			    console.log('[grasp-rat-bot]', text, detail || '');
			  }




      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./runtime/runtime-utils');
      const { arrayCount } = require('./runtime/array-count');

  let rememberCombatEngagement;
  let clearCombatEngagement;
  let summarizeOfflineThreat;
  let assessOfflineSafety;
  let pickActiveCombatWaitThreat;
  let activeCombatThreatWaitAction;
  let recentCombatInjuryActive;
  let lowValueActiveDropMax;
  let isLowValueActiveCombatTarget;
  let proactiveActiveKillStaminaBudgetMs;
  let proactiveActiveCombatStaminaAffordable;
  let activeCombatBudgetBlocked;
  let activeCombatRequiresThreatEvidence;
  let incomingOwnerMatchesTarget;
  let activeCombatThreatensSelf;
  let lowValueActiveThreatensSelf;
  let combatDodgeThreatRange;
  let combatTargetPriority;
  let isDefensiveCombatTarget;
  let isProfitableCombatTarget;
  let combatHpGapDisadvantaged;
  let profitCombatDisadvantaged;
  let pickCombatTarget;
  let combatEngageGraceRange;
  let combatTargetCandidateRange;
  let combatDodgeOnlyCandidateRange;
  let combatEngagedCandidate;
  let pickEngagedCombatTarget;
  let defensiveTargetOverridesEngaged;
  let incomingBulletRequiresTargetSwitch;
  let pickOpportunisticShotTarget;
  let actionOpportunityScore;
  let opportunisticShotBeatsAction;
  let attachOpportunisticShot;
  let buildOpportunisticShotWait;
  let combatMoveVelocityForDirection;
  let combatBulletThreats;
  let incomingBulletThreat;
  let combatThreatFieldCandidate;
  let combatBulletThreatField;
  let combatStrafeHoldMs;
  let combatStrafeKey;
  let combatStrafeMatchesTarget;
  let combatPreciseStrafeSign;
  let selectCombatStrafeSign;
  let tangentMoveForBullet;
  let combatMoveClosesDistance;
  let combatSafeCloseMoveOverride;
  let combatSpacingVector;
  let combatSpacingShouldOverrideBullet;
  let combatLowHpCloseRiskState;
  let combatPressureDisadvantageState;
  let combatSustainedPressureDisadvantageState;
  let combatPressureCloseVector;
  let combatFarNoDamageCloseVector;
  let combatRetreatingFighterCloseVector;
  let combatFinishPressureState;
  let combatOutOfRangeFinishPressureState;
  let combatOutOfRangeReengageState;
  let combatPassiveRunnerState;
  let combatPassiveRunnerCloseVector;
  let mergeCombatMove;
  let combatPressureThreat;
  let combatOutOfRangeDodgeAction;
  let combatAimJitterLimit;
  let combatAimMotionScale;
  let combatMotionSample;
  let combatMotionSamplesWithCurrent;
  let combatOpponentProfile;
  let combatTradeEstimate;
  let combatTargetId;
  let combatRetreatIgnoreActive;
  let rememberCombatRetreatIgnore;
  let clearCombatDisadvantageObservation;
  let combatDisadvantageObservationState;
  let combatAimDamageState;
  let combatLowHpNoDamageLeaveState;
  let combatRetreatingTargetState;
  let combatServerStallNoDamageLeaveState;
  let combatTrendState;
  let combatTickActiveFromState;
  let globalSamplingOutageOfflineState;
  let combatTickGapOfflineState;
  let nativeTickMinIntervalMs;
  let combatShootingPlan;
  let combatAimNoDamageLevel;
  let combatAimNoDamageJitterLimit;
  let combatAimSteadyNoDamageState;
  let combatAimFallbackPrecisionState;
  let combatMovementAimMode;
  let combatInterceptSolution;
  let combatLiveAimTarget;
  let combatAimSourceDivergenceState;
  let combatAimServerStallState;
  let combatAimDynamicStrategyState;
  let combatAimTarget;
  let combatLeaveCoverAction;
  let buildCombatAction;
  let handleTickReentryCombatGap;
  let classify;
  let chooseAction;
  let tick;
  let threatKey;
  let returnBlockRadius;


  let readImportantLogsStore;
  let restoreImportantLogsForRemote;
  let markImportantLogsRemoteSent;
  let markImportantLogsRemoteError;
  let noteImportantSessionExit;
  let startImportantSession;
  let upsertImportantSessionRecord;
  let importantSessionStaminaSpentMs;
  let recordImportantCombatTick;
  let summarizeImportantLoggingStatus;
  let finishImportantCombat;
  let rememberAttack;
  let recordKillHistoryItem;
  let updateKillHistory;

  const { createCombatLogRuntime } = require('./runtime/combat-log-runtime');
  const {
    configureCombatLogging,
    summarizeCombatLoggingStatus,
    pendingExitAuditLogIds,
    unresolvedExitAuditLogCount,
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeLogin,
    closeCurrentImportantSessionBeforeReload,
    restorePersistedExitAuditLogs,
    restorePersistedCombatLogPendingEntries,
    persistCombatLogPendingEntries,
    newExitAuditRequestId,
    ensureExitAuditDetail,
    recordExitAuditEvent,
    combatLogSuspendReason,
    combatLogIsAfkAttack,
    queueCombatLogEntry,
    flushCombatLogs,
    recordCombatLogTick
  } = createCombatLogRuntime({
    bot,
    cfg,
    storage: localStorage,
    combatLogPendingEntriesKey: COMBAT_LOG_PENDING_ENTRIES_KEY,
    exitAuditPendingLogsKey: EXIT_AUDIT_PENDING_LOGS_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    now,
    readPersistentExitState,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    clearPersistentPendingExitState,
    clearPersistentExitState,
    normalizePendingExitReloadConfirmationCore,
    staleOfflineStaminaHoldContradicted: (...args) => staleOfflineStaminaHoldContradicted(...args),
    readImportantLogsStore: (...args) => readImportantLogsStore(...args),
    restoreImportantLogsForRemote: (...args) => restoreImportantLogsForRemote(...args),
    markImportantLogsRemoteSent: (...args) => markImportantLogsRemoteSent(...args),
    markImportantLogsRemoteError: (...args) => markImportantLogsRemoteError(...args),
    noteImportantSessionExit: (...args) => noteImportantSessionExit(...args),
    getCurrentUserId: () => getCurrentUserId(),
    summarizeSelf: (...args) => summarizeSelf(...args),
    dropValue,
    dist,
    speed,
    hypot,
    knownHpValue,
    isCurrentlyActive,
    isMovingThreat,
    isFiringEntity,
    isInvulnerable,
    getNativeEntityList: () => getNativeEntityList(),
    normalizeBullet: (...args) => normalizeBullet(...args),
    getBullets: () => getBullets(),
    summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
    combatTickActiveFromState: (...args) => combatTickActiveFromState(...args),
    summarizeNetworkQuality: (...args) => summarizeNetworkQuality(...args),
    getSelf: () => getSelf(),
    incomingBulletThreat: (...args) => incomingBulletThreat(...args),
    summarizePendingCombatLeave: (...args) => summarizePendingCombatLeave(...args),
    summarizePursuit: (...args) => summarizePursuit(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    snapshotLoginGateStatus: (...args) => snapshotLoginGateStatus(...args),
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail)
  });
  const { createTickSafetyRuntime } = require('./runtime/tick-safety');
  const {
    recordUnhandledTickError,
    runTickSafely,
    runCallbackSafely
  } = createTickSafetyRuntime({
    bot,
    now,
    tick: (...args) => tick(...args),
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail)
  });
  let requestReload;
  let requestLeaveConfirmationReload;
  let requestSessionMismatchRecoveryReload;
  let cloudflareErrorInfo;
  let maybeReloadCloudflareError;
  let getCurrentUserId;
  let getSessionToken;
  let hasNativeGameSession;
  let controlHasNativeGameSession;
  let snapshotSelfPresenceState;
  let controlHasAuthoritativeSessionMismatch;
  let noSelfGameSessionExitState;
  let clearSessionMismatchRecoveryState;
  let sessionMismatchRecoveryReloadSatisfied;
  let summarizeSessionMismatchRecoveryStatus;
  let liveSessionMismatchTakeoverState;
  let noteSelfUnavailableForPostLoginZoom;
  let schedulePostLoginZoomOut;
  let findLoginControl;
  let hasLoginRequiredText;
  let setLoginSuppress;
  let loginSuppressRemainingMs;
  let loginSuppressStatus;
  let loginPointSafetyExitSelfForDetail;
  let loginPointSafetyStatus;
  let rememberLoginPointDamageThreat;
  let maybeRecordLoginPoint;
  let snapshotLoginGateStatus;
  let resetLoginSnapshotGate;
  let noteLoginSnapshotProbe;
  let loginSnapshotGateAllowsLogin;
  let loginSnapshotGateBlockReason;
  let ensureLoginSnapshotGate;
  let loginSnapshotGateDisplayReason;
  let markManualLoginBypass;
  let manualLoginBypassActive;
  let installNativeLoginGateInterceptors;
  let summarizeReloginGateStatus;
  let clearCurrentReloginHold;
  let randomBetween;
  let hpInfoForRelogin;
  let summarizePursuit;
  let pendingExitSkipNewLeave;
  let pendingExitIntentForSkippedLeave;
  let rememberPendingExit;
  let noteLeave403SnapshotProbe;
  let handlePendingExit;
  let summarizePendingCombatLeave;
  let pendingCombatLeaveAction;
  let isCombatStateForInjuryLeave;
  let updatePursuitTracking;
  let issueLeaveCommand;
  let maybeStartAutoLogin;
  let forceLoginNow;
  let leaveOffline;
  let leaveForInjury;
  let leaveForPursuit;
  let leaveForCombat;
  let leaveDuringEnemyHold;
  let clearExitHoldDetail;

  const { createControlFlowRuntime } = require('./runtime/control-flow-runtime');
  ({
    requestReload,
    requestLeaveConfirmationReload,
    requestSessionMismatchRecoveryReload,
    cloudflareErrorInfo,
    maybeReloadCloudflareError,
    getCurrentUserId,
    getSessionToken,
    hasNativeGameSession,
    controlHasNativeGameSession,
    snapshotSelfPresenceState,
    controlHasAuthoritativeSessionMismatch,
    noSelfGameSessionExitState,
    clearSessionMismatchRecoveryState,
    sessionMismatchRecoveryReloadSatisfied,
    summarizeSessionMismatchRecoveryStatus,
    liveSessionMismatchTakeoverState,
    noteSelfUnavailableForPostLoginZoom,
    schedulePostLoginZoomOut,
    findLoginControl,
    hasLoginRequiredText,
    setLoginSuppress,
    loginSuppressRemainingMs,
    loginSuppressStatus,
    loginPointSafetyExitSelfForDetail,
    loginPointSafetyStatus,
    rememberLoginPointDamageThreat,
    maybeRecordLoginPoint,
    snapshotLoginGateStatus,
    resetLoginSnapshotGate,
    noteLoginSnapshotProbe,
    loginSnapshotGateAllowsLogin,
    loginSnapshotGateBlockReason,
    ensureLoginSnapshotGate,
    loginSnapshotGateDisplayReason,
    markManualLoginBypass,
    manualLoginBypassActive,
    installNativeLoginGateInterceptors,
    summarizeReloginGateStatus,
    clearCurrentReloginHold,
    randomBetween,
    hpInfoForRelogin,
    summarizePursuit,
    pendingExitSkipNewLeave,
    pendingExitIntentForSkippedLeave,
    rememberPendingExit,
    noteLeave403SnapshotProbe,
    handlePendingExit,
    summarizePendingCombatLeave,
    pendingCombatLeaveAction,
    isCombatStateForInjuryLeave,
    updatePursuitTracking,
    issueLeaveCommand,
    maybeStartAutoLogin,
    forceLoginNow,
    leaveOffline,
    leaveForInjury,
    leaveForPursuit,
    leaveForCombat,
    leaveDuringEnemyHold,
    clearExitHoldDetail
  } = createControlFlowRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    botKey: BOT_KEY,
    pendingExitStateKey: PENDING_EXIT_STATE_KEY,
    sessionMismatchRecoveryKey: SESSION_MISMATCH_RECOVERY_KEY,
    cloudflareReloadKey: CLOUDFLARE_RELOAD_KEY,
    loginSuppressKey: LOGIN_SUPPRESS_KEY,
    loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
    loginPointSafetyKey: LOGIN_POINT_SAFETY_KEY,
    enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
    offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
    enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY,
    readPageGlobal,
    installPageGlobal,
    normalizePendingExitReloadConfirmationCore,
    writePersistentPendingExitStateCore,
    pendingExitPersistenceCoreHelpers,
    clearPersistentPendingExitState,
    clearPersistentExitState,
    readPersistentExitState,
    writePersistentExitState,
    normalizeLoginSnapshotGateStateCore,
    loginSnapshotSuccessRequiredCore,
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail),
    exitAuditFlushPending,
    exitAuditFlushBlockDetail,
    importantSessionEndFlushPending,
    importantSessionEndFlushBlockDetail,
    closeCurrentImportantSessionBeforeReload,
    closeCurrentImportantSessionBeforeLogin,
    persistCombatLogPendingEntries,
    flushCombatLogs,
    ensureExitAuditDetail,
    recordExitAuditEvent,
    noteImportantSessionExit,
    logStatus,
    updateBotPanel,
    removeTargetOverlay,
    stopMotionSafely: (...args) => stopMotionSafely(...args),
    stopMotionAfterExit,
    clearCombatEngagement: (...args) => clearCombatEngagement(...args),
    sendActionVelocity: (...args) => sendActionVelocity(...args),
    shootAt: (...args) => shootAt(...args),
    triggerNativeTick: (...args) => triggerNativeTick(...args),
    recordUnhandledTickError,
    activeEnemyLeaveDetail: (...args) => activeEnemyLeaveDetail(...args),
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    exitMotionStopLockRemainingMs: (...args) => exitMotionStopLockRemainingMs(...args),
    unsafeExitReloginMinDelayMs: (...args) => unsafeExitReloginMinDelayMs(...args),
    getNativeControl: (...args) => getNativeControl(...args),
    getNativeState: (...args) => getNativeState(...args),
    getOwnEntity: (...args) => getOwnEntity(...args),
    getSelf: (...args) => getSelf(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    snapshotDataAgeMs: (...args) => snapshotDataAgeMs(...args),
    snapshotSelfFreshEnough: (...args) => snapshotSelfFreshEnough(...args),
    isOfflineishWsReadyState: (...args) => isOfflineishWsReadyState(...args),
    isAlive,
    isInvulnerable,
    isJoinModeActive,
    isFiringEntity,
    isMovingThreat,
    truthyFlag,
    staminaRemaining,
    staminaLimitValue,
    dropValue,
    clamp,
    dist,
    speed,
    now,
    isFullHp,
    threatKey: (...args) => threatKey(...args),
    returnBlockRadius: (...args) => returnBlockRadius(...args),
    staleOfflineStaminaHoldContradicted: (...args) => staleOfflineStaminaHoldContradicted(...args),
    staminaBudgetReloginDelayMs,
    staminaResetHoldUntil,
    staminaBudgetCoinLeaveSummary: (...args) => staminaBudgetCoinLeaveSummary(...args),
    staminaExhaustedWindowLabel: (...args) => staminaExhaustedWindowLabel(...args),
    reloginDelayForHpCore
  }));




























































































































































































































  function readPauseReason() {
    let reason = '';
    try {
      reason = String(localStorage.getItem(PAUSE_REASON_KEY) || '');
    } catch (_) {}
    return String(readPageGlobal('__graspRatBotPauseReason', '', pageGlobal) || reason || '');
  }

  function syncPausedFromPage(stopOnPause = true) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const paused = Boolean(readPageGlobal('__graspRatBotPaused', false, pageGlobal) === true || localPaused);
    if (paused !== bot.paused) {
      bot.paused = paused;
      bot.pauseChangedAt = Date.now();
      if (paused) {
        if (stopOnPause) stopMotionSafely('paused');
        removeTargetOverlay();
      }
    }
    bot.pauseReason = paused ? (readPauseReason() || bot.pauseReason || 'manual') : '';
    return paused;
  }

  function getOwnEntity() {
    try {
      return typeof getSelf === 'function' ? getSelf() : null;
    } catch (_) {
      return null;
    }
  }









  let pageNativeSnapshotUrl;
  let pageNativeSnapshotPayload;
  let pageNativeSnapshotError;
  let installPageNativeSnapshotObserver;
  let getNativeState;
  let getNativeControl;
  let wsConstant;
  let isOfflineishWsReadyState;
  let noteNativeReconnectState;
  let detachNativeMessagePump;
  let triggerNativeTick;
  let ensureNativeMessagePump;
  let notePageOwnsReconnect;
  let syncNativeControl;
  let summarizeControl;
  let closeControlWs;
  let ensureControlWs;
  let getSelf;
  let getEntities;
  let realtimeEntityWorldPoint;
  let realtimeEntityKey;
  let normalizeRealtimeEntity;
  let mergeRealtimeEntity;
  let getNativeEntityList;
  let listFromNativeCoinValue;
  let addNativeCoinSource;
  let getNativeCoinSources;
  let getNativeCoinList;
  let entityIdKey;
  let buildNativeEntityMeta;
  let snapshotDataAgeMs;
  let snapshotDataFreshEnough;
  let snapshotBulletFreshEnough;
  let snapshotSelfFreshEnough;
  let entityFreshEnoughForOffense;
  let snapshotEntityAllowed;
  let firstFiniteNumber;
  let normalizeCoinDrop;
  let coinDropKey;
  let nativeViewRadiusCm;
  let snapshotCoinLocalSuppressRadius;
  let snapshotCoinAllowed;
  let isSnapshotOnlyCoin;
  let snapshotCoinFreshEnough;
  let getCoins;
  let normalizeBullet;
  let getBullets;
  let fetchJsonNoStore;
  let summarizeSelf;
  let entityPoint;
  let pointDistance;
  let getSnapshotSelf;
  let currentVelocityCommandActive;
  let summarizeServerPositionStall;
  let resetServerPositionStall;
  let summarizeActionSettlementStall;
  let resetActionSettlementStall;
  let actionSettlementNumber;
  let actionSettlementEntityHp;
  let actionSettlementTarget;
  let actionSettlementSample;
  let actionSettlementStableNumber;
  let actionSettlementSelfProgress;
  let actionSettlementTargetProgress;
  let assessActionSettlementStall;
  let assessServerPositionStall;
  let resetSessionStaminaStats;
  let updateSessionStaminaStats;
  let updateSessionStats;
  let summarizeSessionStats;
  let readTodaySessionRecords;
  let maybeSetLatestTodayStamina;
  let dailyStaminaSpentFromRemaining;
  let addTodaySessionRecord;
  let summarizeTodaySessionStats;
  let pushBounded;
  let networkQualityRound;
  let networkQualityEma;
  let ensureNetworkQualityState;
  let networkQualityPoint;
  let networkQualityDistance;
  let networkQualityWindowMs;
  let networkQualityBaseFrameMs;
  let networkQualityExpectedFrameMs;
  let pruneNetworkQualityFrameSamples;
  let networkQualityFrameLatencySample;
  let estimateNetworkQualityLostFrames;
  let observeNativeWsFrame;
  let recordNetworkQualityMovementCommand;
  let observeNetworkQualitySelf;
  let networkQualityTargetId;
  let recordNetworkQualityShot;
  let recordNetworkQualityAttackDamage;
  let summarizeNetworkQuality;
  let refreshGlobalState;
  let wsSend;
  let setNativeKeys;
  let cancelVelocityStopTimer;
  let clearNativeMotionState;
  let stopLocalMotionOnly;
  let stopMotionSafely;
  let stopMotionAfterExit;
  let cancelDirectVelocityRepeat;
  let directWsVelocityMessage;
  let sendDirectNativeVelocity;
  let scheduleDirectVelocityRepeat;
  let sendNativeVelocity;
  let safeSendVelocity;
  let sendActionVelocity;
  let aimAt;
  let sendNativeShoot;
  let recordCombatShotAttempt;
  let shootAt;

  const { createNativeStateRuntime } = require('./runtime/native-state-runtime');
  ({
    pageNativeSnapshotUrl,
    pageNativeSnapshotPayload,
    pageNativeSnapshotError,
    installPageNativeSnapshotObserver,
    getNativeState,
    getNativeControl,
    wsConstant,
    isOfflineishWsReadyState,
    noteNativeReconnectState,
    detachNativeMessagePump,
    triggerNativeTick,
    ensureNativeMessagePump,
    notePageOwnsReconnect,
    syncNativeControl,
    summarizeControl,
    closeControlWs,
    ensureControlWs,
    getSelf,
    getEntities,
    realtimeEntityWorldPoint,
    realtimeEntityKey,
    normalizeRealtimeEntity,
    mergeRealtimeEntity,
    getNativeEntityList,
    listFromNativeCoinValue,
    addNativeCoinSource,
    getNativeCoinSources,
    getNativeCoinList,
    entityIdKey,
    buildNativeEntityMeta,
    snapshotDataAgeMs,
    snapshotDataFreshEnough,
    snapshotBulletFreshEnough,
    snapshotSelfFreshEnough,
    entityFreshEnoughForOffense,
    snapshotEntityAllowed,
    firstFiniteNumber,
    normalizeCoinDrop,
    coinDropKey,
    nativeViewRadiusCm,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinAllowed,
    isSnapshotOnlyCoin,
    snapshotCoinFreshEnough,
    getCoins,
    normalizeBullet,
    getBullets,
    fetchJsonNoStore,
    summarizeSelf,
    entityPoint,
    pointDistance,
    getSnapshotSelf,
    currentVelocityCommandActive,
    summarizeServerPositionStall,
    resetServerPositionStall,
    summarizeActionSettlementStall,
    resetActionSettlementStall,
    actionSettlementNumber,
    actionSettlementEntityHp,
    actionSettlementTarget,
    actionSettlementSample,
    actionSettlementStableNumber,
    actionSettlementSelfProgress,
    actionSettlementTargetProgress,
    assessActionSettlementStall,
    assessServerPositionStall,
    resetSessionStaminaStats,
    updateSessionStaminaStats,
    updateSessionStats,
    summarizeSessionStats,
    readTodaySessionRecords,
    maybeSetLatestTodayStamina,
    dailyStaminaSpentFromRemaining,
    addTodaySessionRecord,
    summarizeTodaySessionStats,
    pushBounded,
    networkQualityRound,
    networkQualityEma,
    ensureNetworkQualityState,
    networkQualityPoint,
    networkQualityDistance,
    networkQualityWindowMs,
    networkQualityBaseFrameMs,
    networkQualityExpectedFrameMs,
    pruneNetworkQualityFrameSamples,
    networkQualityFrameLatencySample,
    estimateNetworkQualityLostFrames,
    observeNativeWsFrame,
    recordNetworkQualityMovementCommand,
    observeNetworkQualitySelf,
    networkQualityTargetId,
    recordNetworkQualityShot,
    recordNetworkQualityAttackDamage,
    summarizeNetworkQuality,
    refreshGlobalState,
    wsSend,
    setNativeKeys,
    cancelVelocityStopTimer,
    clearNativeMotionState,
    stopLocalMotionOnly,
    stopMotionSafely,
    stopMotionAfterExit,
    cancelDirectVelocityRepeat,
    directWsVelocityMessage,
    sendDirectNativeVelocity,
    scheduleDirectVelocityRepeat,
    sendNativeVelocity,
    safeSendVelocity,
    sendActionVelocity,
    aimAt,
    sendNativeShoot,
    recordCombatShotAttempt,
    shootAt
  } = createNativeStateRuntime({
    bot,
    cfg,
    storage: localStorage,
    pageGlobal,
    readPageGlobal,
    installPageGlobal,
    recordRuntimeDiagnostics: detail => recordRuntimeDiagnosticsCore(bot, detail),
    noteLoginSnapshotProbe: (...args) => noteLoginSnapshotProbe(...args),
    noteLeave403SnapshotProbe: (...args) => noteLeave403SnapshotProbe(...args),
    getCurrentUserId: () => getCurrentUserId(),
    getSessionToken: () => getSessionToken(),
    getOwnEntity: () => {
      try {
        return typeof getOwnEntity === 'function' ? getOwnEntity() : null;
      } catch (_) {
        return null;
      }
    },
    targetOverlayRenderEntities: () => [],
    runTickSafely: (...args) => runTickSafely(...args),
    runCallbackSafely: (...args) => runCallbackSafely(...args),
    recordUnhandledTickError: (...args) => recordUnhandledTickError(...args),
    nativeTickMinIntervalMs: (...args) => nativeTickMinIntervalMs(...args),
    clearPostExitTargetState: (...args) => clearPostExitTargetState(...args),
    exitMotionStopLockRemainingMs: (...args) => exitMotionStopLockRemainingMs(...args),
    noteImportantSessionExit: (...args) => noteImportantSessionExit(...args),
    startImportantSession: (...args) => startImportantSession(...args),
    readImportantLogsStore: (...args) => readImportantLogsStore(...args),
    writePersistentLastSelfState: (...args) => writePersistentLastSelfState(...args),
    summarizeStamina: (...args) => summarizeStamina(...args),
    dailyStaminaWindowStartAt: (...args) => dailyStaminaWindowStartAt(...args),
    dropValue,
    dist,
    speed,
    hypot,
    clamp,
    isAlive,
    isFiringEntity,
    combatMetricRound: value => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.round(number) : null;
    },
    combatMetricEntityId: entity => entity?.id ?? entity?.user_id ?? null,
    combatMetricHp: entity => {
      const number = Number(entity?.hp);
      return Number.isFinite(number) ? number : null;
    },
    now
  }));














































































































































































































  const { createImportantLoggingRuntime } = require('./runtime/important-logging-runtime');
  ({
    readImportantLogsStore,
    restoreImportantLogsForRemote,
    markImportantLogsRemoteSent,
    markImportantLogsRemoteError,
    noteImportantSessionExit,
    startImportantSession,
    upsertImportantSessionRecord,
    importantSessionStaminaSpentMs,
    recordImportantCombatTick,
    summarizeImportantLoggingStatus,
    finishImportantCombat,
    rememberAttack,
    recordKillHistoryItem,
    updateKillHistory
  } = createImportantLoggingRuntime({
    bot,
    cfg,
    storage: localStorage,
    importantLogsKey: IMPORTANT_LOGS_KEY,
    queueCombatLogEntry,
    flushCombatLogs,
    combatLogSuspendReason,
    combatLogIsAfkAttack,
    getCurrentUserId: () => getCurrentUserId(),
    pushBounded,
    knownHpValue,
    dropValue,
    isAfkProfitTarget,
    isCurrentlyActive,
    isMovingThreat,
    isFiringEntity,
    summarizeSelf: (...args) => summarizeSelf(...args),
    getNativeEntityList: () => getNativeEntityList(),
    getEntities: () => getEntities(),
    isAlive,
    firstFiniteNumber
  }));

  const { createProfitRuntime } = require('./runtime/profit-runtime');
  const {
    coinMotionNumber,
    coinMotionTolerance,
    coinAxisApproachDirectionCore,
    coinPickupPrecisionPulseMsCore,
    coinAxisLockShouldHoldCore,
    coinNearApproachAxisCore,
    coinDirectionToCore,
    coinMotionMetaCore,
    directionTo,
    coinMotionCoreOptions,
    coinPickupFailureCount,
    coinPickupAttemptSlowCount,
    applyCoinApproachLockUpdate,
    coinDiagnosticsSummary,
    summarizeCoinDiagnosticsList,
    addCoinFilterDiagnostic,
    buildCoinDiagnostics,
    coinThreatDangerRadius,
    coinHeadingBlockedByInvulnerableThreat,
    coinBlockedByThreat,
    coinDiagnosticsNearDistance,
    coinDiagnosticsLimit,
    coinThreatDiagnostics,
    recordCoinFilterDiagnostic,
    coinStaminaAffordableWithDiagnostic,
    attachCoinDiagnostics,
    safeCoinCandidates,
    pickRealtimeLocalCoin,
    nearestRealtimeCoinWithin,
    fieldMigrationBlockedByNearbyCoin,
    pickCoin,
    pickCoinField,
    pickDistantCoin,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    pickHighValueVisibleCoin,
    nearbyThreatBlocksLowHpHighValueCoin,
    canPrioritizeHighValueVisibleCoin,
    highValueVisibleCoinPriorityNeeded,
    dailyStaminaBudgetIsLimitingCore,
    summarizeBlockedStaminaOpportunityCore,
    summarizeNearestCoinStaminaBudgetExitCore,
    pickNearestDailyStaminaFinalCoinCore,
    opportunityMoveStaminaCost,
    opportunityCoinStaminaCost,
    estimatedKillShots,
    opportunityEnemyStaminaCost,
    opportunityWindowStaminaBudget,
    opportunityLongStaminaBudget,
    opportunityStaminaAffordable,
    dailyStaminaFinalCoinAction,
    staminaBudgetCoinLeaveSummary,
    staminaBudgetCoinLeaveDisplay,
    staminaBudgetCoinLeaveAction,
    compareCoinOpportunity,
    snapshotCoinAgeMs,
    isSnapshotCoinWaitAction,
    pickSnapshotCoinDestination,
    scoreCoinOpportunity,
    opportunityAfkTargetId,
    targetStamina5sRemaining,
    opportunityAfkStaminaState,
    opportunityAfkStaminaCooldownMs,
    opportunityAfkStaminaDropThresholdMs,
    updateOpportunityAfkStaminaObservations,
    opportunityAfkStaminaCooldownRemaining,
    afkOpportunityBlockedByStaminaCooldown,
    scoreEnemyOpportunity,
    opportunityEffectiveStaminaCostCore,
    opportunityValueScoreCore,
    opportunityPriorityTierCore,
    mergeCoinRouteDisplayCore,
    uniqueVisibleRouteCoinsCore,
    buildCoinOpportunityCandidatesCore,
    buildEnemyOpportunityCandidatesCore,
    buildOpportunityCandidatesCore,
    bestCoinOpportunityScoreCore,
    opportunityPriorityTier,
    defaultDist,
    coinRouteKey,
    coinRouteIdsFrom,
    coinRouteLegStaminaCostCore,
    coinRouteLegClearCore,
    coinRoutePointLimitCore,
    coinRouteSummaryCore,
    coinRoutePoints,
    coinRouteActionMetaCore,
    buildCoinRouteFromAnchorCore,
    coinRouteSkipsCloserFirstCoinCore,
    coinRouteSkipsHeldSingleCoinCore,
    coinRouteMatchesHeldChoiceCore,
    heldCoinRouteBeatsSwitchCore,
    pickCoinRouteOpportunityCore,
    coinRouteCoreOptions,
    currentHeldCoinRouteChoice,
    currentHeldCoinChoice,
    opportunityCandidateCoreOptions,
    pickProfitableCombatTarget,
    postAttackVisibleCoinExistsCore,
    resolvedRecentPostAttackDropsCore,
    buildPostAttackDropCoinCandidateCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore,
    attackEntityMatches,
    recentAttackTargetStillAttackable,
    postAttackDropResolvedAt,
    buildPostAttackDropWaitAction,
    buildCoinAction,
    buildEnemyAction,
    opportunityKey,
    opportunityChoiceType,
    opportunityChoiceId,
    opportunityChoiceKey,
    opportunityPairKey,
    opportunityByKey,
    opportunityMatchesChoiceCore,
    isHighValueCoinOpportunityCore,
    highValueCoinHoldBlocksEnemySwitchCore,
    lockedOpportunityChoiceCore,
    applyOpportunityOscillationLockCore,
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore,
    opportunityChoiceCoreOptions,
    resetOpportunitySwitchLock,
    opportunitySameCoinRadius,
    currentVisibleCoinListForMissingHold,
    visibleCoinSourcesConfirmTargetMissing,
    clearMissingVisibleCoinTarget,
    pickBestOpportunityCore,
    patrolDirectionCore,
    shouldClearOpportunityChoiceCore,
    coinFailureIgnoreCore,
    staleCoinEscapeDirectionCore,
    coinProgressIntentCore,
    coinAttemptExpiredCore,
    updateCoinAttemptCore,
    updateCoinProgressRecordCore,
    buildIgnoredCoinProgressCore,
    buildIgnoredCoinPatrolActionCore,
    coinIgnoreCleanupIntentCore,
    coinProgressCoreOptions,
    actionPriorityBand,
    actionFocusTargetType,
    actionFocusId,
    actionFocusSummary,
    actionSwitchPairKey,
    buildPreviousDecisionSummary,
    recordActionSwitchDiagnosticsCore,
    finalActionBandRank,
    finalActionReusable,
    shouldHoldPreviousFinalAction,
    applyFinalActionArbitrationCore,
    targetSwitchHistoryLimit,
    targetSwitchOscillationWindowMs,
    roundedNullable,
    ensureTargetSwitchDiagnostics,
    finalActionArbitrationHoldMs,
    finalActionArbitrationHistoryLimit,
    ensureFinalActionArbitration,
    coinTargetKeyCore,
    coinTargetDistance,
    coinMatchesTrackedTargetCore,
    trackedCoinTargetForCollectionCore,
    buildNativeCoinSnapshotCore,
    pointToSegmentDistanceCore,
    pickIncidentalCoinPickupsCore,
    snapshotCoinWorthLongTravelCore,
    snapshotCoinNavigationReasonCore,
    setLastTarget,
    clearCoinTracking,
	    coinTargetCoreOptions,
	    recordIncidentalCoinPickups,
	    markCoinCollected,
	    applyCoinProgressAction,
	    applyFinalActionArbitration,
	    recordActionSwitchDiagnostics,
	    buildDropMatchedKillCore
	  } = createProfitRuntime({
    bot,
    cfg,
    OPPORTUNITY_CONSTANTS,
    safeJsonClone,
    arrayCount,
    formatDistance,
    formatDurationMs,
    now,
    hypot,
    dist,
    speed,
    clamp,
    staminaRemaining,
    staminaExhaustedThreshold,
    staminaBudgetReloginDelayMs,
    isInvulnerableActive,
    isInvulnerable,
    isCurrentlyActive,
    isFiringEntity,
    isAfkProfitTarget,
    isWhitelistedTarget,
    hasCombatActivitySignal,
    hpValue,
    combatHpValue,
    knownHpValue,
    dropValue,
    isFullHp,
    snapshotCoinLocalSuppressRadius: (...args) => snapshotCoinLocalSuppressRadius(...args),
    isSnapshotOnlyCoin: (...args) => isSnapshotOnlyCoin(...args),
    normalizeCoinDrop: (...args) => normalizeCoinDrop(...args),
    getNativeCoinSources: (...args) => getNativeCoinSources(...args),
    getNativeCoinList: (...args) => getNativeCoinList(...args),
    entityFreshEnoughForOffense,
    isAlive,
    attackWorthTakingCore,
    incomingBulletThreat: (...args) => incomingBulletThreat(...args),
    pickCombatTarget: (...args) => pickCombatTarget(...args),
    isLowValueActiveCombatTarget: (...args) => isLowValueActiveCombatTarget(...args),
    lowValueActiveThreatensSelf: (...args) => lowValueActiveThreatensSelf(...args),
    updateSessionStats,
    pushBounded,
    importantSessionStaminaSpentMs,
    recordKillHistoryItem,
    upsertImportantSessionRecord,
    summarizeSelf
  });

  const { createCombatRuntime } = require('./runtime/combat-runtime');
  ({
    rememberCombatEngagement,
    clearCombatEngagement,
    summarizeOfflineThreat,
    assessOfflineSafety,
    pickActiveCombatWaitThreat,
    activeCombatThreatWaitAction,
    recentCombatInjuryActive,
    lowValueActiveDropMax,
    isLowValueActiveCombatTarget,
    proactiveActiveKillStaminaBudgetMs,
    proactiveActiveCombatStaminaAffordable,
    activeCombatBudgetBlocked,
    activeCombatRequiresThreatEvidence,
    incomingOwnerMatchesTarget,
    activeCombatThreatensSelf,
    lowValueActiveThreatensSelf,
    combatDodgeThreatRange,
    combatTargetPriority,
    isDefensiveCombatTarget,
    isProfitableCombatTarget,
    combatHpGapDisadvantaged,
    profitCombatDisadvantaged,
    pickCombatTarget,
    combatEngageGraceRange,
    combatTargetCandidateRange,
    combatDodgeOnlyCandidateRange,
    combatEngagedCandidate,
    pickEngagedCombatTarget,
    defensiveTargetOverridesEngaged,
    incomingBulletRequiresTargetSwitch,
    pickOpportunisticShotTarget,
    actionOpportunityScore,
    opportunisticShotBeatsAction,
    attachOpportunisticShot,
    buildOpportunisticShotWait,
    combatMoveVelocityForDirection,
    combatBulletThreats,
    incomingBulletThreat,
    combatThreatFieldCandidate,
    combatBulletThreatField,
    combatStrafeHoldMs,
    combatStrafeKey,
    combatStrafeMatchesTarget,
    combatPreciseStrafeSign,
    selectCombatStrafeSign,
    tangentMoveForBullet,
    combatMoveClosesDistance,
    combatSafeCloseMoveOverride,
    combatSpacingVector,
    combatSpacingShouldOverrideBullet,
    combatLowHpCloseRiskState,
    combatPressureDisadvantageState,
    combatSustainedPressureDisadvantageState,
    combatPressureCloseVector,
    combatFarNoDamageCloseVector,
    combatRetreatingFighterCloseVector,
    combatFinishPressureState,
    combatOutOfRangeFinishPressureState,
    combatOutOfRangeReengageState,
    combatPassiveRunnerState,
    combatPassiveRunnerCloseVector,
    mergeCombatMove,
    combatPressureThreat,
    combatOutOfRangeDodgeAction,
    combatAimJitterLimit,
    combatAimMotionScale,
    combatMotionSample,
    combatMotionSamplesWithCurrent,
    combatOpponentProfile,
    combatTradeEstimate,
    combatTargetId,
    combatRetreatIgnoreActive,
    rememberCombatRetreatIgnore,
    clearCombatDisadvantageObservation,
    combatDisadvantageObservationState,
    combatAimDamageState,
    combatLowHpNoDamageLeaveState,
    combatRetreatingTargetState,
    combatServerStallNoDamageLeaveState,
    combatTrendState,
    combatTickActiveFromState,
    globalSamplingOutageOfflineState,
    combatTickGapOfflineState,
    nativeTickMinIntervalMs,
    combatShootingPlan,
    combatAimNoDamageLevel,
    combatAimNoDamageJitterLimit,
    combatAimSteadyNoDamageState,
    combatAimFallbackPrecisionState,
    combatMovementAimMode,
    combatInterceptSolution,
    combatLiveAimTarget,
    combatAimSourceDivergenceState,
    combatAimServerStallState,
    combatAimDynamicStrategyState,
    combatAimTarget,
    combatLeaveCoverAction,
    buildCombatAction,
    handleTickReentryCombatGap
  } = createCombatRuntime({
    bot,
    cfg,
    safeJsonClone,
    arrayCount,
    formatDistance,
    formatDurationMs,
    actorLabel,
    hpDisplay,
    now,
    hypot,
    dist,
    clamp,
    staminaRemaining,
    staminaExhaustedThreshold,
    combatMovementBlockedByStamina,
    staminaBudgetCoinLeaveSummary,
    staminaExhaustedWindowLabel,
    isInvulnerable,
    isCurrentlyActive,
    isFiringEntity,
    isMovingThreat,
    isAfkProfitTarget,
    isWhitelistedTarget,
    hasCombatActivitySignal,
    isJoinModeActive,
    hpValue,
    combatHpValue,
    knownHpValue,
    dropValue,
    isFullHp,
    isAlive,
    entityFreshEnoughForOffense,
    normalizeBullet: (...args) => normalizeBullet(...args),
    getBullets: () => getBullets(),
    getNativeEntityList: () => getNativeEntityList(),
    getSelf: () => getSelf(),
    classify: (...args) => classify(...args),
    returnBlockRadius: (...args) => returnBlockRadius(...args),
    attackWorthTakingCore,
    recordNetworkQualityAttackDamage: (...args) => recordNetworkQualityAttackDamage(...args),
    summarizeSelf: (...args) => summarizeSelf(...args),
    updateSessionStats: (...args) => updateSessionStats(...args),
    summarizeServerPositionStall: (...args) => summarizeServerPositionStall(...args),
    stopMotionSafely: (...args) => stopMotionSafely(...args),
    leaveOffline: (...args) => leaveOffline(...args),
    activeOfflineLeaveDetail: (...args) => activeOfflineLeaveDetail(...args),
    requestReload: (...args) => requestReload(...args),
    updateBotPanel: (...args) => updateBotPanel(...args),
    summarizeControl: (...args) => summarizeControl(...args),
    directionTo,
    opportunityLongStaminaBudget,
    scoreEnemyOpportunity,
    opportunityEnemyStaminaCost,
    estimatedKillShots,
    opportunityStaminaAffordable,
    scoreCoinOpportunity
  }));

  const { createOrchestrationRuntime } = require('./runtime/orchestration-runtime');
  const orchestrationRuntime = createOrchestrationRuntime({
    BOT_KEY,
    ENEMY_LEAVE_STATE_KEY,
    LOGIN_SUPPRESS_KEY,
    LOGIN_SUPPRESS_REASON_KEY,
    OFFLINE_LEAVE_STATE_KEY,
    PENDING_EXIT_STATE_KEY,
    activeCombatThreatWaitAction,
    activeEnemyLeaveDetail,
    activeOfflineLeaveDetail,
    actorLabel,
    applyCoinApproachLockUpdate,
    applyCoinProgressAction,
    applyFinalActionArbitration,
    arrayCount,
    assessActionSettlementStall,
    assessOfflineSafety,
    assessServerPositionStall,
    attachCoinDiagnostics,
    attachOpportunisticShot,
    attackWorthTakingCore,
    bot,
    buildCoinAction,
    buildCoinDiagnostics,
    buildCombatAction,
    buildDropMatchedKillCore,
    buildEnemyAction,
    buildMissingHeldOpportunityCore,
    buildNativeCoinSnapshotCore,
    buildNativeEntityMeta,
    buildOpportunisticShotWait,
    buildPostAttackDropWaitAction,
    canPrioritizeHighValueVisibleCoin,
    cfg,
    chooseStableOpportunityCore,
    clearCoinTracking,
    clearCombatEngagement,
    clearExitHoldDetail,
    clearMissingVisibleCoinTarget,
    clearPersistentExitState,
    clearPersistentPendingExitState,
    clearSessionMismatchRecoveryState,
    cloudflareErrorInfo,
    coinBlockedByThreat,
    coinDiagnosticsLimit,
    coinDiagnosticsNearDistance,
    coinDirectionToCore,
    coinMotionCoreOptions,
    coinMotionMetaCore,
    coinPickupAttemptSlowCount,
    coinPickupFailureCount,
    coinRouteCoreOptions,
    coinRouteKey,
    coinStaminaAffordableWithDiagnostic,
    coinTargetCoreOptions,
    coinTargetKeyCore,
    coinThreatDiagnostics,
    combatDodgeOnlyCandidateRange,
    combatHpValue,
    combatTargetCandidateRange,
    combatTickActiveFromState,
    combatTickGapOfflineState,
    controlHasNativeGameSession,
    currentHeldCoinChoice,
    currentHeldCoinRouteChoice,
    dailyStaminaBudgetIsLimitingCore,
    dailyStaminaFinalCoinAction,
    decorateActiveThreat,
    defensiveTargetOverridesEngaged,
    deferredStaminaExhaustionLeave,
    dist,
    dropValue,
    ensureControlWs,
    entityFreshEnoughForOffense,
    exitMotionStopLockRemainingMs,
    finishImportantCombat,
    formatDistance,
    formatDurationMs,
    getBullets,
    getCoins,
    getCurrentUserId,
    getNativeCoinList,
    getNativeEntityList,
    getSelf,
    globalSamplingOutageOfflineState,
    handlePendingExit,
    handleTickReentryCombatGap,
    highValueCoinPriorityAmount,
    highValueCoinPriorityHealthyHp,
    highValueVisibleCoinPriorityNeeded,
    hpDisplay,
    hpValue,
    hypot,
    importantSessionStaminaSpentMs,
    incomingBulletThreat,
    installNativeLoginGateInterceptors,
    installPageGlobal,
    installPageNativeSnapshotObserver,
    isAfkProfitTarget,
    isAlive,
    isAvoidanceThreat,
    isCombatStateForInjuryLeave,
    isConservingStamina,
    isCurrentlyActive,
    isFiringEntity,
    isFullHp,
    isInvulnerable,
    isInvulnerableActive,
    isRecovering,
    isSnapshotCoinWaitAction,
    isSnapshotOnlyCoin,
    isWhitelistedTarget,
    knownHpValue,
    latestEnemyLeaveDisplayReason,
    leaveForCombat,
    leaveForInjury,
    leaveForPursuit,
    leaveOffline,
    liveSessionMismatchTakeoverState,
    logStatus,
    loginSnapshotGateDisplayReason,
    markCoinCollected,
    maybeRecordLoginPoint,
    maybeReloadCloudflareError,
    maybeStartAutoLogin,
    noSelfGameSessionExitState,
    normalizeCoinDrop,
    normalizePendingExitReloadConfirmationCore,
    noteImportantSessionExit,
    noteSelfUnavailableForPostLoginZoom,
    now,
    observeNetworkQualitySelf,
    opportunityCandidateCoreOptions,
    opportunityChoiceCoreOptions,
    opportunityCoinStaminaCost,
    opportunityEnemyStaminaCost,
    opportunityLongStaminaBudget,
    opportunityPriorityTier,
    opportunityWindowStaminaBudget,
    pageGlobal,
    pendingCombatLeaveAction,
    pendingExitIntentForSkippedLeave,
    pendingExitPersistenceCoreHelpers,
    pendingExitSkipNewLeave,
    pickActiveCombatWaitThreat,
    pickBestOpportunityCore,
    pickCoin,
    pickCoinField,
    pickCoinRouteOpportunityCore,
    pickCombatTarget,
    pickDistantCoin,
    pickEngagedCombatTarget,
    pickHighValueVisibleCoin,
    pickNearestDailyStaminaFinalCoinCore,
    pickPostAttackDropCoinCore,
    pickPostAttackDropWaitTargetCore,
    pickProfitableCombatTarget,
    pickRealtimeLocalCoin,
    postAttackDropResolvedAt,
    previousBot,
    readPersistentExitState,
    recordActionSwitchDiagnostics,
    recordCoinFilterDiagnostic,
    recordCombatLogTick,
    recordImportantCombatTick,
    recordIncidentalCoinPickups,
    recordKillHistoryItem,
    recordUnhandledTickError,
    refreshGlobalState,
    rememberAttack,
    rememberCombatEngagement,
    rememberLoginPointDamageThreat,
    rememberOpportunityChoiceCore,
    requestReload,
    requestSessionMismatchRecoveryReload,
    resetOpportunitySwitchLock,
    resetServerPositionStall,
    restoreImportantLogsForRemote,
    restorePersistedCombatLogPendingEntries,
    restorePersistedExitAuditLogs,
    runTickSafely,
    safeCoinCandidates,
    safeJsonClone,
    safeStringify,
    schedulePostLoginZoomOut,
    scoreCoinOpportunity,
    sendActionVelocity,
    sessionMismatchRecoveryReloadSatisfied,
    setLastTarget,
    shootAt,
    shouldClearOpportunityChoiceCore,
    snapshotCoinAgeMs,
    snapshotCoinLocalSuppressRadius,
    snapshotCoinNavigationReasonCore,
    snapshotDataFreshEnough,
    snapshotEntityAllowed,
    speed,
    staleOfflineStaminaHoldContradicted,
    staminaBudgetCoinLeaveAction,
    staminaBudgetCoinLeaveSummary,
    staminaBudgetReloginDelayMs,
    staminaExhaustedWindowLabel,
    startTargetWhitelistPolling,
    stopMotionSafely,
    summarizeBlockedStaminaOpportunityCore,
    summarizeControl,
    summarizeNearestCoinStaminaBudgetExitCore,
    summarizePendingCombatLeave,
    summarizePursuit,
    summarizeSelf,
    summarizeSessionMismatchRecoveryStatus,
    summarizeStamina,
    syncPausedFromPage,
    uniqueVisibleRouteCoinsCore,
    updateBotPanel,
    updateKillHistory,
    updateOpportunityAfkStaminaObservations,
    updatePursuitTracking,
    updateSessionStats,
    visibleCoinSourcesConfirmTargetMissing,
    writePersistentPendingExitStateCore
  });
  ({
    classify,
    chooseAction,
    tick,
    threatKey,
    returnBlockRadius
  } = orchestrationRuntime);

  return orchestrationRuntime.startRuntime();

})();

module.exports = __graspRatRuntimeStartup;
module.exports.default = __graspRatRuntimeStartup;
