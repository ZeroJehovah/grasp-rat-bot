'use strict';

const { normalizeChaseModeState } = require('../../strategy/chase-mode');

function fallbackReadPageGlobal(_key, fallbackValue) {
  return fallbackValue;
}

function fallbackPerformanceNow() {
  return performance.now();
}

function fallbackReadPersistentLastSelfState() {
  return null;
}

function createRuntimeBotState(runtime = {}) {
  const cfg = runtime.cfg && typeof runtime.cfg === 'object' ? runtime.cfg : {};
  const config = runtime.config && typeof runtime.config === 'object' ? runtime.config : {};
  const preserved = runtime.preserved && typeof runtime.preserved === 'object' ? runtime.preserved : {};
  const previousBot = runtime.previousBot && typeof runtime.previousBot === 'object' ? runtime.previousBot : null;
  const restoredFailures = Array.isArray(runtime.restoredFailures) ? runtime.restoredFailures : [];
  const restoredEnemyLeaveState = runtime.restoredEnemyLeaveState || null;
  const restoredOfflineLeaveState = runtime.restoredOfflineLeaveState || null;
  const targetWhitelistState = runtime.targetWhitelistState || null;
  const initialPendingExitState = runtime.initialPendingExitState || null;
  const initialChaseModeState = runtime.initialChaseModeState || null;
  const readPersistentLastSelfState = typeof runtime.readPersistentLastSelfState === 'function'
    ? runtime.readPersistentLastSelfState
    : fallbackReadPersistentLastSelfState;
  const readPageGlobal = typeof runtime.readPageGlobal === 'function'
    ? runtime.readPageGlobal
    : fallbackReadPageGlobal;
  const performanceNow = typeof runtime.performanceNow === 'function'
    ? runtime.performanceNow
    : fallbackPerformanceNow;

  return {
    running: true,
    version: cfg.version,
    sourceHash: cfg.sourceHash,
    sourceUrl: cfg.sourceUrl,
    injectedBy: cfg.injectedBy,
    startedAt: Date.now(),
    lastTickAt: 0,
    previousTickAt: 0,
    previousTickSource: '',
    previousTickCombatActive: false,
    lastTickSource: '',
    lastTickGapMs: null,
    lastTickCompletedAt: 0,
    lastTickCombatActive: false,
    lastCombatTickGap: null,
    lastTickReentryGapAt: 0,
    runtimeDiagnostics: {},
    lastStatusAt: 0,
    lastShotAt: 0,
    lastAction: null,
    waitSince: 0,
    offlineSince: 0,
    lastLoginAt: Number(preserved.lastLoginAt || 0) || 0,
    lastLoginResult: preserved.lastLoginResult,
    lastManualLoginResult: preserved.lastManualLoginResult,
    pendingExit: initialPendingExitState,
    lastOfflineLeaveAt: 0,
    lastOfflineLeaveResult: restoredOfflineLeaveState,
    offlineReloginUntil: Math.max(0, Number(restoredOfflineLeaveState?.reloginUntil || 0)),
    lastOfflineLeaveWaitMs: Number(restoredOfflineLeaveState?.reloginDelayMs || restoredOfflineLeaveState?.holdRemainingMs || 0),
    lastOfflineSafety: null,
    serverPositionStall: null,
    actionSettlementStall: null,
    networkQuality: null,
    lastPursuitLeaveAt: 0,
    lastPursuitLeaveResult: null,
    lastCombatLeaveAt: 0,
    lastCombatLeaveResult: null,
    pendingCombatLeave: null,
    lastInjuryLeaveAt: 0,
    lastInjuryLeaveResult: null,
    pendingInjuryLeave: null,
    lastEnemyLeaveResult: restoredEnemyLeaveState,
    lastEnemyLeaveWaitMs: Number(restoredEnemyLeaveState?.reloginDelayMs || restoredEnemyLeaveState?.holdRemainingMs || 0),
    lastEnemyLeaveRetryAt: 0,
    lastEnemyLeaveRetryResult: null,
    pursuitReloginUntil: Math.max(0, Number(restoredEnemyLeaveState?.reloginUntil || 0)),
    enemyLeaveStreak: null,
    pursuit: null,
    combatStrafe: null,
    combatTarget: preserved.combatTarget,
    combatRetreatIgnore: preserved.combatRetreatIgnore,
    combatAim: preserved.combatAim,
    combatDisadvantageObservation: preserved.combatDisadvantageObservation,
    lastCombatLogMetric: preserved.lastCombatLogMetric,
    lastCombatShot: preserved.lastCombatShot,
    combatLogging: {
      enabled: Boolean(cfg.combatLoggingEnabled && cfg.combatLogEndpointConfigured),
      endpoint: cfg.combatLogEndpointConfigured ? String(cfg.combatLogEndpoint || 'http://127.0.0.1:18765/combat-log') : '',
      endpointConfigured: Boolean(cfg.combatLogEndpointConfigured),
      combatId: String(preserved.combatLogging?.combatId || ''),
      active: Boolean(preserved.combatLogging?.active),
      startedAt: Number(preserved.combatLogging?.startedAt || 0),
      lastCombatAt: Number(preserved.combatLogging?.lastCombatAt || 0),
      lastQueuedFrameAt: Number(preserved.combatLogging?.lastQueuedFrameAt || 0),
      lastBuiltFrameAt: Number(preserved.combatLogging?.lastBuiltFrameAt || 0),
      lastCoinDiagnosticsAt: Number(preserved.combatLogging?.lastCoinDiagnosticsAt || 0),
      lastCoinDiagnosticsSignature: String(preserved.combatLogging?.lastCoinDiagnosticsSignature || ''),
      lastTargetSwitchDiagnosticsAt: Number(preserved.combatLogging?.lastTargetSwitchDiagnosticsAt || 0),
      lastTargetSwitchDiagnosticsSignature: String(preserved.combatLogging?.lastTargetSwitchDiagnosticsSignature || ''),
      lastFlushAt: 0,
      preBuffer: Array.isArray(preserved.combatLogging?.preBuffer) ? preserved.combatLogging.preBuffer : [],
      pending: Array.isArray(preserved.combatLogging?.pending) ? preserved.combatLogging.pending : [],
      dropped: Number(preserved.combatLogging?.dropped || 0),
      sent: Number(preserved.combatLogging?.sent || 0),
      failed: Number(preserved.combatLogging?.failed || 0),
      failedEntryKeys: Array.isArray(preserved.combatLogging?.failedEntryKeys) ? preserved.combatLogging.failedEntryKeys.slice(-1000) : [],
      sending: false,
      sendingExitAuditIds: [],
      pendingExitAuditIds: [],
      lastError: String(preserved.combatLogging?.lastError || ''),
      lastOkAt: Number(preserved.combatLogging?.lastOkAt || 0),
      sequence: Number(preserved.combatLogging?.sequence || 0)
    },
    watchdog: {
      enabled: Boolean(cfg.watchdogEnabled && cfg.watchdogEndpointConfigured),
      endpoint: cfg.watchdogEndpointConfigured ? String(cfg.watchdogEndpoint || 'http://127.0.0.1:18765/watchdog/heartbeat') : '',
      endpointConfigured: Boolean(cfg.watchdogEndpointConfigured),
      pageId: String(preserved.watchdog?.pageId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
      sequence: Number(preserved.watchdog?.sequence || 0),
      sent: Number(preserved.watchdog?.sent || 0),
      failed: Number(preserved.watchdog?.failed || 0),
      lastAttemptAt: 0,
      lastOkAt: Number(preserved.watchdog?.lastOkAt || 0),
      lastError: String(preserved.watchdog?.lastError || ''),
      lastSkipReason: '',
      sending: false,
      timer: 0,
      pageLifecycle: String(preserved.watchdog?.pageLifecycle || ''),
      leaveDescriptor: preserved.watchdog?.leaveDescriptor && typeof preserved.watchdog.leaveDescriptor === 'object'
        ? { ...preserved.watchdog.leaveDescriptor }
        : null,
      damagedInCombat: false,
      combatDamageActive: false,
      combatDamageStartHp: null,
      combatDamageMinHp: null
    },
    exitAudit: {
      sequence: Number(preserved.exitAudit?.sequence || previousBot?.exitAudit?.sequence || 0),
      requestSequence: Number(preserved.exitAudit?.requestSequence || previousBot?.exitAudit?.requestSequence || 0),
      restored: 0,
      lastBlockedReload: null,
      lastBlockedLogin: null,
      lastEvent: null
    },
    importantLogging: {
      activeCombat: preserved.importantLogging?.activeCombat || null,
      queuedRemoteIds: Array.isArray(preserved.importantLogging?.queuedRemoteIds) ? preserved.importantLogging.queuedRemoteIds.slice(-500) : [],
      restoredRemote: 0,
      lastEventAt: Number(preserved.importantLogging?.lastEventAt || 0) || 0,
      lastRemoteQueuedAt: Number(preserved.importantLogging?.lastRemoteQueuedAt || 0) || 0,
      localWriteError: String(preserved.importantLogging?.localWriteError || ''),
      lastRemoteError: String(preserved.importantLogging?.lastRemoteError || '')
    },
    loginSnapshotGate: runtime.normalizeLoginSnapshotGateStateCore(
      preserved.loginSnapshotGate,
      runtime.loginSnapshotSuccessRequiredCore()
    ),
    loginPointSafety: preserved.loginPointSafety && typeof preserved.loginPointSafety === 'object' ? { ...preserved.loginPointSafety } : null,
    sessionMismatchRecovery: null,
    leave403SnapshotRecovery: {
      streak: Math.max(0, Number(preserved.leave403SnapshotRecovery?.streak || 0) || 0),
      required: Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5)),
      lastOkAt: Number(preserved.leave403SnapshotRecovery?.lastOkAt || 0) || 0,
      lastErrorAt: Number(preserved.leave403SnapshotRecovery?.lastErrorAt || 0) || 0,
      lastError: String(preserved.leave403SnapshotRecovery?.lastError || ''),
      clearedAt: Number(preserved.leave403SnapshotRecovery?.clearedAt || 0) || 0,
      clearedReason: String(preserved.leave403SnapshotRecovery?.clearedReason || '')
    },
    clashLeaveRescue: {
      enabled: Boolean(cfg.clashLeaveRescueEnabled),
      running: false,
      lastAt: Number(preserved.clashLeaveRescue?.lastAt || 0) || 0,
      lastStage: String(preserved.clashLeaveRescue?.lastStage || ''),
      lastResult: preserved.clashLeaveRescue?.lastResult && typeof preserved.clashLeaveRescue.lastResult === 'object'
        ? { ...preserved.clashLeaveRescue.lastResult }
        : null,
      attempts: Array.isArray(preserved.clashLeaveRescue?.attempts) ? preserved.clashLeaveRescue.attempts.slice(-8) : []
    },
    postLoginZoom: {
      armed: preserved.postLoginZoom ? Boolean(preserved.postLoginZoom.armed) : true,
      missingSince: Number(preserved.postLoginZoom?.missingSince || 0) || 0,
      generation: Number(preserved.postLoginZoom?.generation || 0) || 0,
      appliedKey: String(preserved.postLoginZoom?.appliedKey || ''),
      scheduledKey: String(preserved.postLoginZoom?.scheduledKey || ''),
      scheduledAt: Number(preserved.postLoginZoom?.scheduledAt || 0) || 0,
      lastSeenSelfAt: Number(preserved.postLoginZoom?.lastSeenSelfAt || 0) || 0,
      lastResult: preserved.postLoginZoom?.lastResult && typeof preserved.postLoginZoom.lastResult === 'object'
        ? { ...preserved.postLoginZoom.lastResult }
        : null
    },
    reloadRequestedAt: 0,
    lastTarget: null,
    lastTargetAt: 0,
    snapshotCoinWaitSince: Number(previousBot?.snapshotCoinWaitSince || 0) || 0,
    lastSnapshotCoinWaitAgeMs: Number(previousBot?.lastSnapshotCoinWaitAgeMs || 0) || 0,
    lastCoinSourceSummary: previousBot?.lastCoinSourceSummary || null,
    coinDiagnostics: null,
    targetSwitchDiagnostics: {
      lastFocus: preserved.targetSwitchDiagnostics?.lastFocus || null,
      lastTargetFocus: preserved.targetSwitchDiagnostics?.lastTargetFocus || null,
      lastSwitch: preserved.targetSwitchDiagnostics?.lastSwitch || null,
      events: Array.isArray(preserved.targetSwitchDiagnostics?.events) ? preserved.targetSwitchDiagnostics.events.slice(-24) : []
    },
    finalActionArbitration: {
      lastAction: preserved.finalActionArbitration?.lastAction || null,
      lastFocus: preserved.finalActionArbitration?.lastFocus || null,
      lastSelectedAt: Number(preserved.finalActionArbitration?.lastSelectedAt || 0) || 0,
      lastOverride: preserved.finalActionArbitration?.lastOverride || null,
      history: Array.isArray(preserved.finalActionArbitration?.history) ? preserved.finalActionArbitration.history.slice(-24) : []
    },
    chaseMode: {
      ...normalizeChaseModeState(preserved.chaseMode || initialChaseModeState, {
        persistMax: cfg.chaseTargetPersistMax
      }),
      lastClear: preserved.chaseMode?.lastClear || null,
      lastDecision: preserved.chaseMode?.lastDecision || null,
      selectedTargetId: String(preserved.chaseMode?.selectedTargetId || ''),
      selectedTargetAt: Number(preserved.chaseMode?.selectedTargetAt || 0) || 0,
      lowDropObservations: preserved.chaseMode?.lowDropObservations && typeof preserved.chaseMode.lowDropObservations === 'object' ? { ...preserved.chaseMode.lowDropObservations } : {},
      killedTargetSuppressions: preserved.chaseMode?.killedTargetSuppressions && typeof preserved.chaseMode.killedTargetSuppressions === 'object' ? { ...preserved.chaseMode.killedTargetSuppressions } : {},
      panelCandidates: [],
      selectedTarget: null
    },
    lastSelf: preserved.lastSelf || readPersistentLastSelfState() || null,
    lastSafety: null,
    actionThreats: [],
    opportunityChoice: preserved.opportunityChoice,
    opportunitySwitchLock: preserved.opportunitySwitchLock,
    opportunityAfkStamina: preserved.opportunityAfkStamina instanceof Map ? new Map(preserved.opportunityAfkStamina) : new Map(),
    returnBlockLock: null,
    returnBlockScan: null,
    returnBlockCooldownUntil: 0,
    returnBlockRecentThreatId: '',
    fleeLock: null,
    patrolHeading: null,
    velocityStopTimer: 0,
    velocityPulseToken: 0,
    lastExitMotionStopAt: 0,
    lastExitMotionStopReason: '',
    coinApproachLock: null,
    staleCoinEscape: null,
    coinProgress: null,
    lastCoinCollected: null,
    lastNativeCoinSnapshot: Array.isArray(preserved.lastNativeCoinSnapshot) ? preserved.lastNativeCoinSnapshot.slice(-160) : [],
    coinAttempts: new Map(),
    ignoredCoins: new Map(restoredFailures
      .filter(([, item]) => Number(item?.ignoreUntil || 0) > performanceNow())
      .map(([id, item]) => [String(id), Number(item.ignoreUntil)])),
    coinFailures: new Map(restoredFailures),
    nativeMessageWs: null,
    nativeMessageHandler: null,
    nativeOpenHandler: null,
    nativeCloseHandler: null,
    nativeErrorHandler: null,
    directVelocityTimer: 0,
    directVelocityRepeatToken: 0,
    directVelocityRepeatUntil: 0,
    directVelocityStopRepeatsLeft: 0,
    lastDirectVelocityAt: 0,
    lastDirectVelocity: '',
    lastNativeTickAt: 0,
    seenEntities: new Map(),
    session: {
      startedAt: Number(preserved.session?.startedAt || 0) || 0,
      userId: preserved.session?.userId ?? null,
      importantSessionId: String(preserved.session?.importantSessionId || ''),
      importantStartEventId: String(preserved.session?.importantStartEventId || ''),
      importantEndEventId: String(preserved.session?.importantEndEventId || ''),
      exitAt: Number(preserved.session?.exitAt || 0) || 0,
      exitReason: String(preserved.session?.exitReason || ''),
      exitSummary: String(preserved.session?.exitSummary || ''),
      baseCoins: Number.isFinite(Number(preserved.session?.baseCoins)) ? Number(preserved.session.baseCoins) : null,
      coinsGained: Math.max(0, Number(preserved.session?.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(preserved.session?.coinPickupTotal || 0) || 0),
      coinPickupKeys: Array.isArray(preserved.session?.coinPickupKeys) ? preserved.session.coinPickupKeys.slice(-80) : [],
      kills: Math.max(0, Number(preserved.session?.kills || 0) || 0),
      stamina1dSpentBeforeSegment: Math.max(0, Number(preserved.session?.stamina1dSpentBeforeSegment || 0) || 0),
      stamina1dSpentMs: Math.max(0, Number(preserved.session?.stamina1dSpentMs || 0) || 0),
      stamina1dSegmentStartedAt: Number(preserved.session?.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dSegmentBase: Number.isFinite(Number(preserved.session?.stamina1dSegmentBase)) ? Number(preserved.session.stamina1dSegmentBase) : null,
      stamina1dObservedMax: Number.isFinite(Number(preserved.session?.stamina1dObservedMax)) ? Number(preserved.session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(preserved.session?.stamina1dObservedMin)) ? Number(preserved.session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(preserved.session?.stamina1dLastRemaining)) ? Number(preserved.session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(preserved.session?.stamina1dLastLimit)) ? Number(preserved.session.stamina1dLastLimit) : null,
      combatLogSentBase: Number.isFinite(Number(preserved.session?.combatLogSentBase)) ? Number(preserved.session.combatLogSentBase) : null,
      combatLogFailedBase: Number.isFinite(Number(preserved.session?.combatLogFailedBase)) ? Number(preserved.session.combatLogFailedBase) : null,
      missingSince: Number(preserved.session?.missingSince || 0) || 0
    },
    globalState: { refreshedAt: 0, snapshotRefreshedAt: 0, tick: 0, entities: [], bullets: [], coinDrops: [], messages: [], minimap: null, error: '', samplingOutage: null },
    control: {
      ws: null,
      wsOpen: false,
      wsReadyState: null,
      wsUrl: '',
      currentUserId: 0,
      hasToken: false,
      connecting: false,
      transport: '',
      nativeWsOpen: false,
      nativeWsReadyState: null,
      nativeReconnectEvents: [],
      nativeReconnectChurn: false,
      nativeReconnectEventCount: 0,
      nativeReconnectWindowMs: 0,
      lastOpenAt: 0,
      lastMessageAt: 0,
      lastError: '',
      lastVelocity: '',
      lastVelocityAt: 0,
      nonZeroVelocitySince: 0,
      lastNonZeroVelocityAt: 0
    },
    attackHistory: preserved.attackHistory,
    killHistory: preserved.killHistory,
    seenKillKeys: new Set(preserved.seenKillKeys),
    seenKillKeysList: preserved.seenKillKeys,
    tickCount: 0,
    starting: true,
    ticking: false,
    lastDecision: null,
    errors: [],
    lastDebugAt: 0,
    stopReason: '',
    targetWhitelist: targetWhitelistState,
    paused: Boolean(config.paused || readPageGlobal('__graspRatBotPaused', false, runtime.pageGlobal)),
    pauseReason: '',
    pauseChangedAt: 0
  };
}

module.exports = {
  createRuntimeBotState
};
