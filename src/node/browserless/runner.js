'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { performance } = require('perf_hooks');
const { parseBrowserlessRunnerArgs } = require('./config');
const { cleanupOldLogDays } = require('./log-retention');
const { createLocalLogStore } = require('./local-log-store');
const { createBrowserlessBackgroundIo } = require('./background-io');
const {
  browserlessStatsForDecision,
  browserlessStatsForKillEvidence,
  browserlessStatsForOffline,
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  loginPointFromAnyState,
  mergeLiveState,
  mergeState,
  readBrowserlessStateFile,
  reconcileBrowserlessExitKillEvidence,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');
const { startStatusServer } = require('./status-server');
const {
  BROWSERLESS_WEB_PANEL_VERSION,
  groupBlockingFactorsCore,
  highDropRankValueCore,
  isStaminaExhaustionExitReasonCore
} = require('./web-panel');
const {
  applySingleBlockerLoginBypass,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
} = require('./canary');
const {
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller
} = require('./high-drop-player-tracker');
const { createEasyKillPlayerTracker } = require('./easy-kill-player-tracker');
const { createCombatCompletionTracker } = require('./combat-completion-tracker');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const { createDynamicWhitelist } = require('./dynamic-whitelist');
const {
  DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
  DEFAULT_CHAT_IDLE_INTERVAL_MS,
  createChatService,
  runChatServiceSelfTest
} = require('./chat-service');
const {
  BROWSER_RUNTIME_DEFAULTS,
  buildBrowserlessRealtimeControlDecision,
  decisionStatePatch,
  observeBrowserlessCoinPickups,
  snapshotSelfKillEvidence,
  summarizeNearbyForPanel
} = require('./decision-adapter');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { buildBrowserlessCombatDryRun } = require('./combat-adapter');
const { createSourceIpController } = require('./source-ip-controller');
const { createBrowserlessSafetyController } = require('./safety-controller');
const {
  actionTargetKey,
  createRestartDrainCoordinator,
  evaluateRestartReadiness,
  restartDrainAllowsDecision
} = require('./restart-readiness');
const { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus } = require('./runtime-revision');
const { runSnapshotEdgeSelfTest } = require('./snapshot-edge-wait');
const {
  normalizePendingExit,
  pendingExitFromCanary,
  pendingExitSnapshotResolution
} = require('./pending-exit-recovery');
const {
  buildSnapshotProbeUrl,
  readResponseBody,
  redactSecrets,
  summarizeSnapshotPayload
} = require('./session-client');

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS = 40000;
const SELF_TEST_MAIN_THREAD_BUDGET_MS = 50;
const STATUS_COMPACT_REFRESH_MS = 500;
const STATUS_COMPACT_MAX_STALE_MS = 5000;
const STATUS_RENDER_TIMEOUT_MS = 2000;
const BACKGROUND_IO_CLOSE_TIMEOUT_MS = 5000;
const STATUS_IO_CLOSE_TIMEOUT_MS = 2000;

function publicConfig(config) {
  return {
    gameOrigin: config.gameOrigin,
    wsPath: config.wsPath,
    wsExtraQuery: config.wsExtraQuery,
    snapshotPath: config.snapshotPath,
    targetWhitelistUrl: redactSecrets(config.targetWhitelistUrl || ''),
    targetWhitelistFile: config.targetWhitelistFile || '',
    targetWhitelistTimeoutMs: Number(config.targetWhitelistTimeoutMs || 0),
    targetWhitelistMaxNames: Number(config.targetWhitelistMaxNames || 0),
    dataDir: config.dataDir,
    logDir: config.logDir,
    statusHost: config.statusHost,
    statusPort: config.statusPort,
    webTokenPresent: Boolean(config.webToken),
    readOnly: Boolean(config.readOnly),
    controlMode: config.controlMode || 'read-only',
    canaryProfile: config.canaryProfile || '',
    dryRun: Boolean(config.dryRun),
    once: Boolean(config.once),
    logRetentionDays: Number(config.logRetentionDays || 0),
    readOnlyProbeMs: Number(config.readOnlyProbeMs || 0),
    frameGapAlertMs: Number(config.frameGapAlertMs || 0),
    leaveRetryMax: Number(config.leaveRetryMax || 0),
    leaveRetryMs: Number(config.leaveRetryMs || 0),
    leaveHedgeMs: Number(config.leaveHedgeMs || 0),
    leaveDangerHedgeMs: Number(config.leaveDangerHedgeMs || 0),
    leavePrewarmIntervalMs: Number(config.leavePrewarmIntervalMs || 0),
    decisionIntervalMs: Number(config.decisionIntervalMs || 0),
    loopDelayMs: Number(config.loopDelayMs || 0),
    dailyFirstLoginDelayMs: Number(config.dailyFirstLoginDelayMs || 0),
    loginPointSafetySuccessRequired: Number(config.loginPointSafetySuccessRequired || 0),
    loginPointSafetyProbeIntervalMs: Number(config.loginPointSafetyProbeIntervalMs || 0),
    loginPointSingleBlockerBypassMs: Number(config.loginPointSingleBlockerBypassMs || 0),
    snapshotEdgeEnabled: config.snapshotEdgeEnabled === true,
    snapshotEdgeIntervalMs: Number(config.snapshotEdgeIntervalMs || 0),
    snapshotEdgeMaxWaitMs: Number(config.snapshotEdgeMaxWaitMs || 0),
    snapshotEdgeMaxErrors: Number(config.snapshotEdgeMaxErrors || 0),
    snapshotEdgeBackoffMs: Number(config.snapshotEdgeBackoffMs || 0),
    staleSelfMs: Number(config.staleSelfMs || 0),
    staleSelfConfirmMs: Number(config.staleSelfConfirmMs || 0),
    noSelfGraceMs: Number(config.noSelfGraceMs || 0),
    staminaExhaustedBelowMs: Number(config.staminaExhaustedBelowMs || 0),
    movementCommandIntervalMs: Number(config.movementCommandIntervalMs || 0),
    movementTargetDeadZoneCm: Number(config.movementTargetDeadZoneCm || 0),
    movementSettlementFrames: Number(config.movementSettlementFrames || 0),
    movementSettlementStallMs: Number(config.movementSettlementStallMs || 0),
    movementSettlementMinDistanceCm: Number(config.movementSettlementMinDistanceCm || 0),
    singleCoinBaitEnabled: config.singleCoinBaitEnabled !== false,
    singleCoinBaitHoldRadiusCm: Number(config.singleCoinBaitHoldRadiusCm || 0),
    browserlessCenterActivityRadiusCm: Number(config.browserlessCenterActivityRadiusCm || 0),
    browserlessOutsideCenterIdleExitMs: Number(config.browserlessOutsideCenterIdleExitMs || 0),
    browserlessProfitPursuitMaxMs: Number(config.browserlessProfitPursuitMaxMs || 0),
    browserlessProfitPursuitSuppressMs: Number(config.browserlessProfitPursuitSuppressMs || 0),
    browserlessDangerousTargetCooldownMs: Number(config.browserlessDangerousTargetCooldownMs || 0),
    browserlessProfitPursuitMinDamageMs: Number(config.browserlessProfitPursuitMinDamageMs || 0),
    browserlessProfitPursuitMinDamageHp: Number(config.browserlessProfitPursuitMinDamageHp || 0),
    browserlessProfitPursuitSoftMovementStaminaMs: Number(config.browserlessProfitPursuitSoftMovementStaminaMs || 0),
    browserlessProfitPursuitHardNoDamageMs: Number(config.browserlessProfitPursuitHardNoDamageMs || 0),
    browserlessProfitPursuitHardMovementStaminaMs: Number(config.browserlessProfitPursuitHardMovementStaminaMs || 0),
    browserlessProfitPursuitPressureCycleMs: Number(config.browserlessProfitPursuitPressureCycleMs || 0),
    combatEnabled: Boolean(config.combatEnabled),
    combatRobustDodgeEnabled: config.combatRobustDodgeEnabled !== false,
    combatCloseBandReserveEnabled: config.combatCloseBandReserveEnabled !== false,
    combatShootMinIntervalMs: Number(config.combatShootMinIntervalMs || 0),
    combatMissCloseTriggerShots: Number(config.combatMissCloseTriggerShots || 0),
    combatMissCloseStepShots: Number(config.combatMissCloseStepShots || 0),
    combatMissCloseStepCm: Number(config.combatMissCloseStepCm || 0),
    combatMissCloseMinimumDistanceCm: Number(config.combatMissCloseMinimumDistanceCm || 0),
    combatMissCloseTimeoutMs: Number(config.combatMissCloseTimeoutMs || 0),
    combatMissCloseGenerationMaxMs: Number(config.combatMissCloseGenerationMaxMs || 0),
    combatMissCloseGenerationMaxSteps: Number(config.combatMissCloseGenerationMaxSteps || 0),
    combatResponsePolicyShadowConfirmTicks: Number(config.combatResponsePolicyShadowConfirmTicks || 0),
    combatResponsePolicyShadowMinimumHoldMs: Number(config.combatResponsePolicyShadowMinimumHoldMs || 0),
    combatTrajectoryCoverageMode: String(config.combatTrajectoryCoverageMode || 'live-single'),
    wsTraceEnabled: Boolean(config.wsTraceEnabled),
    wsTracePayload: Boolean(config.wsTracePayload),
    wsTraceMaxPayloadChars: Number(config.wsTraceMaxPayloadChars || 0),
    sourceIp: config.sourceIp || '',
    sourceIps: config.sourceIps || [],
    stateFile: config.stateFile || stateFilePath(config),
    loginPointPresent: hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY),
    dynamicProfitThresholdEnabled: Boolean(config.dynamicProfitThresholdEnabled),
    profitThresholdCoinsPer10Stamina: Number(config.profitThresholdCoinsPer10Stamina || 0),
    profitThresholdHourlyStaminaLimit: Number(config.profitThresholdHourlyStaminaLimit || 0),
    profitThresholdResetReserveMs: Number(config.profitThresholdResetReserveMs || 0),
    userId: Number(config.userId || 0),
    sessionTokenPresent: Boolean(config.sessionToken)
  };
}

function runLoginPointSingleBlockerSelfTest() {
  const startedAtMs = Date.UTC(2026, 6, 18, 0, 0, 0);
  const loginPoint = { x: 0, y: 0, hp: 100, maxHp: 100, source: 'self-test' };
  const blocker = {
    entity_id: 11,
    user_id: 1011,
    name: 'single-blocker',
    x: 1000,
    y: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 9000,
    stamina_5s_limit_milli: 10000,
    life: 'Alive'
  };
  const payload = {
    tick: 100,
    entities: [blocker],
    bullets: [],
    coin_drops: [],
    messages: []
  };
  const baseSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint,
    latestKnownTick: 99,
    damageActorUserIds: [blocker.user_id]
  });
  const config = { loginPointSingleBlockerBypassMs: 3600000 };
  const first = applySingleBlockerLoginBypass(baseSummary, {}, config, startedAtMs);
  const firstState = {
    loginPointSafety: {
      detail: {
        singleBlockerHold: first.summary.safety.singleBlockerHold
      }
    }
  };
  const elapsed = applySingleBlockerLoginBypass(baseSummary, firstState, config, startedAtMs + 3599999);
  const bypass = applySingleBlockerLoginBypass(baseSummary, firstState, config, startedAtMs + 3600000);
  const consumed = applySingleBlockerLoginBypass(baseSummary, {
    loginPointSafety: {
      detail: {
        singleBlockerHold: bypass.summary.safety.singleBlockerHold
      }
    }
  }, config, startedAtMs + 3601000);
  const multipleSummary = summarizeSnapshotPayload({
    ...payload,
    tick: 101,
    entities: [
      blocker,
      {
        ...blocker,
        entity_id: 12,
        user_id: 1012,
        name: 'second-blocker',
        x: 2000
      }
    ]
  }, {
    userId: 7,
    loginPoint,
    latestKnownTick: 100,
    damageActorUserIds: [blocker.user_id]
  });
  const multiple = applySingleBlockerLoginBypass(multipleSummary, firstState, config, startedAtMs + 3600000);
  const lowHpSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint: { ...loginPoint, hp: 99 },
    latestKnownTick: 99,
    damageActorUserIds: [blocker.user_id]
  });
  const lowHp = applySingleBlockerLoginBypass(lowHpSummary, firstState, config, startedAtMs + 3600000);
  const staleSummary = summarizeSnapshotPayload(payload, {
    userId: 7,
    loginPoint,
    latestKnownTick: 101,
    damageActorUserIds: [blocker.user_id]
  });
  const stale = applySingleBlockerLoginBypass(staleSummary, firstState, config, startedAtMs + 3600000);
  const compact = buildCompactBrowserlessStatus({
    updatedAt: new Date(startedAtMs + 3600000).toISOString(),
    loginPointSafety: {
      ok: bypass.summary.safety.ok,
      reason: bypass.summary.safety.reason,
      checkedAt: new Date(startedAtMs + 3600000).toISOString(),
      point: loginPoint,
      detail: bypass.summary.safety
    }
  });
  const replacedDetail = mergeState({
    loginPointSafety: { detail: { blockingFactors: [{ reason: 'stale' }], stale: true } }
  }, {
    loginPointSafety: { detail: { blockingFactors: [] } }
  }).loginPointSafety.detail;
  return {
    ok: Boolean(
      baseSummary.safety.blockingPlayers.length === 1
        && baseSummary.safety.blockingFactors.length === 2
        && first.bypassed === false
        && first.summary.safety.singleBlockerHold.observationCount === 1
        && elapsed.bypassed === false
        && elapsed.summary.safety.singleBlockerHold.remainingMs === 1
        && bypass.bypassed === true
        && bypass.summary.safety.reason === 'single-blocker-timeout-bypass'
        && bypass.summary.safety.singleBlockerHold.fullHp === true
        && consumed.bypassed === false
        && consumed.summary.safety.singleBlockerHold.durationMs === 0
        && multiple.bypassed === false
        && multiple.summary.safety.singleBlockerHold.resetReason === 'multiple-blocking-players'
        && lowHp.bypassed === false
        && lowHp.summary.safety.singleBlockerHold.resetReason === 'login-point-not-full-hp'
        && stale.bypassed === false
        && stale.summary.safety.singleBlockerHold.resetReason === 'non-player-blocking-factor'
        && compact.loginPointSafety.detail.blockingPlayers.length === 1
        && compact.loginPointSafety.detail.blockingFactors.length === 2
        && compact.loginPointSafety.detail.singleBlockerHold.eligible === true
        && replacedDetail.blockingFactors.length === 0
        && replacedDetail.stale === undefined
    ),
    blockingPlayerCount: baseSummary.safety.blockingPlayers.length,
    blockingFactorCount: baseSummary.safety.blockingFactors.length,
    bypassReason: bypass.summary.safety.reason,
    consumedDurationMs: consumed.summary.safety.singleBlockerHold.durationMs,
    multipleResetReason: multiple.summary.safety.singleBlockerHold.resetReason,
    lowHpResetReason: lowHp.summary.safety.singleBlockerHold.resetReason,
    staleResetReason: stale.summary.safety.singleBlockerHold.resetReason,
    compactFactorCount: compact.loginPointSafety.detail.blockingFactors.length
  };
}

function hasConfigNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const BATTLE_ACTIVITY_WINDOW_MS = 3000;

function actorMovingAt(actor, atMs) {
  if (!actor || typeof actor !== 'object') return 0;
  if (actor.moving === true) return atMs;
  const vx = numberOrNull(actor.vx);
  const vy = numberOrNull(actor.vy);
  return (vx !== null && Math.abs(vx) > 0) || (vy !== null && Math.abs(vy) > 0) ? atMs : 0;
}

function latestTargetShotAt(combat = {}) {
  const events = combat?.behavior?.metrics?.shotEvents;
  if (!Array.isArray(events) || !events.length) return 0;
  return events.reduce((latest, event) => Math.max(latest, numberOrNull(event?.observedAt) || 0), 0);
}

function battleActivityActor(previous = {}, actor = null, evidence = {}, atMs = Date.now()) {
  return {
    movingAt: actorMovingAt(actor, atMs) || numberOrNull(previous.movingAt) || 0,
    firingAt: Math.max(
      actor?.firing === true ? atMs : 0,
      numberOrNull(evidence.firingAt) || 0,
      numberOrNull(previous.firingAt) || 0
    )
  };
}

function browserlessBattlePresentation(previous, decision = {}) {
  const action = decision.action && typeof decision.action === 'object' ? decision.action : decision;
  const kind = String(action.kind || decision.kind || '');
  const band = String(action.band || decision.band || '');
  const battleLike = kind === 'attack' || kind === 'combat-live' || band === 'combat';
  const targetKey = battleLike ? actionTargetKey({ ...action, kind }) : '';
  const combat = decision.combat || {};
  const self = decision.input?.self || combat.self || null;
  const target = combat.target || action.target || decision.target || null;
  const currentX = numberOrNull(self?.x);
  const currentY = numberOrNull(self?.y);
  if (!targetKey || currentX === null || currentY === null) return null;
  const sameTarget = previous?.targetKey === targetKey;
  const observedAtMs = Date.parse(String(decision.at || '')) || Date.now();
  const startX = sameTarget ? (numberOrNull(previous.startX) ?? currentX) : currentX;
  const startY = sameTarget ? (numberOrNull(previous.startY) ?? currentY) : currentY;
  const startedAt = sameTarget
    ? String(previous.startedAt || combat.startedAt || decision.at || '')
    : String(combat.startedAt || decision.at || '');
  const previousActivity = sameTarget && previous?.activity && typeof previous.activity === 'object'
    ? previous.activity
    : {};
  return {
    targetKey,
    startedAt,
    startX,
    startY,
    movementDistance: Math.round(Math.hypot(currentX - startX, currentY - startY)),
    activity: {
      windowMs: BATTLE_ACTIVITY_WINDOW_MS,
      self: battleActivityActor(previousActivity.self, self, {
        firingAt: combat?.shooting?.actualLastShotAt
      }, observedAtMs),
      target: battleActivityActor(previousActivity.target, target, {
        firingAt: latestTargetShotAt(combat)
      }, observedAtMs)
    }
  };
}

function loopPlanNowMs(config = {}) {
  const configured = Number(config.nowMs);
  return Number.isFinite(configured) ? configured : Date.now();
}

function nextDailyStaminaResetAt(t = Date.now()) {
  return Math.floor((Number(t) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS + DAY_MS;
}

function browserlessDayKey(t = Date.now()) {
  return new Date(Number(t) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function browserlessDayStartMs(t = Date.now()) {
  return Math.floor((Number(t) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS;
}

function isFirstBrowserlessLoginOfDay(state, nowMs = Date.now()) {
  const stats = state?.stats || {};
  const today = stats.today || {};
  const session = stats.currentSession || {};
  if (session.online) return false;
  const day = browserlessDayKey(nowMs);
  if (String(today.day || '') !== day) return true;
  return Math.max(0, Number(today.sessionCount || 0)) <= 0;
}

function browserlessDailyFirstLoginNotBeforeMs(state, config = {}, nowMs = Date.now()) {
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (!isFirstBrowserlessLoginOfDay(state, nowValue)) return 0;
  const delayAfterMidnightMs = Math.max(0, Number(config.dailyFirstLoginDelayMs ?? 120000));
  return browserlessDayStartMs(nowValue) + delayAfterMidnightMs;
}

function browserlessDailyFirstLoginDelayPlan(state, config = {}, nowMs = Date.now()) {
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const notBeforeMs = browserlessDailyFirstLoginNotBeforeMs(state, config, nowValue);
  if (!notBeforeMs) return null;
  const delayMs = Math.max(0, notBeforeMs - nowValue);
  if (delayMs <= 0) return null;
  return {
    continue: true,
    reason: 'daily-first-login-delay',
    delayMs,
    previousRunId: '',
    error: 'daily-first-login-delay',
    safetyReason: '',
    explicitDelay: true,
    notBeforeAt: new Date(notBeforeMs).toISOString()
  };
}

function preLoginSafetyLeadMs(config = {}) {
  if (config.snapshotEdgeEnabled === true) return 0;
  const required = loginPointSafetyRequiredFromConfig(config);
  const intervalMs = Math.max(0, Number(config.loginPointSafetyProbeIntervalMs || 0));
  return Math.max(0, required - 1) * intervalMs;
}

function staminaExhaustedThresholdMs(config = {}) {
  return Math.max(0, Number(
    config.staminaExhaustedBelowMs
      ?? config.staminaExhaustedThresholdMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaExhaustedThresholdMs
      ?? 1000
  ));
}

function staminaBudgetReloginDelayMs(config = {}) {
  return Math.max(1000, Number(
    config.staminaBudgetReloginDelayMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaBudgetReloginDelayMs
      ?? 1800000
  ));
}

function staminaResetGraceMs(config = {}) {
  return Math.max(0, Number(
    config.staminaResetGraceMs
      ?? BROWSER_RUNTIME_DEFAULTS.staminaResetGraceMs
      ?? 0
  ));
}

function lastLeaveResponseFromCanary(canary) {
  const leaves = [
    canary?.leave,
    canary?.safety?.exit?.leave
  ];
  for (const leave of leaves) {
    const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
    for (let i = attempts.length - 1; i >= 0; i -= 1) {
      const response = attempts[i]?.response;
      if (response && typeof response === 'object') return response;
    }
  }
  return null;
}

function inferredLongStaminaExhaustionFromCanary(canary, config = {}) {
  const response = lastLeaveResponseFromCanary(canary);
  if (!response) return null;
  const thresholdMs = staminaExhaustedThresholdMs(config);
  const remaining1h = numberOrNull(response.stamina_1h_remaining_milli ?? response.stamina1hRemainingMilli);
  const remaining1d = numberOrNull(response.stamina_1d_remaining_milli ?? response.stamina1dRemainingMilli);
  const exhausted = [];
  if (remaining1h !== null && remaining1h < thresholdMs) exhausted.push('1h');
  if (remaining1d !== null && remaining1d < thresholdMs) exhausted.push('1d');
  if (!exhausted.length) return null;
  const nowMs = loopPlanNowMs(config);
  const resetAt = exhausted.includes('1d') ? nextDailyStaminaResetAt(nowMs) : 0;
  const fixedDelayMs = exhausted.includes('1h') ? staminaBudgetReloginDelayMs(config) : 0;
  const resetDelayMs = resetAt ? Math.max(0, resetAt + staminaResetGraceMs(config) - nowMs) : 0;
  const reloginDelayMs = Math.max(fixedDelayMs, resetDelayMs, 1000);
  return {
    exhausted,
    thresholdMs,
    remaining1h,
    remaining1d,
    resetAt,
    fixedDelayMs,
    reloginDelayMs
  };
}

function createNoThrowLogStore(logStore, onError = () => {}) {
  if (!logStore || typeof logStore !== 'object') return logStore;
  return {
    ...logStore,
    append(stream, type, detail = {}, options = {}) {
      try {
        return logStore.append(stream, type, detail, options);
      } catch (err) {
        onError(err, { operation: 'log-append', stream, type });
        return { error: errorMessage(err) };
      }
    },
    dayDirFor(ms) {
      try {
        return logStore.dayDirFor(ms);
      } catch (err) {
        onError(err, { operation: 'log-day-dir' });
        return '';
      }
    }
  };
}

function buildRunnerErrorCanary(error, config = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const message = errorMessage(error);
  const startedAt = options.startedAt || now();
  return {
    ok: false,
    runId: String(options.runId || `${config.controlMode || 'runner'}-error-${new Date(startedAt).toISOString().replace(/[-:.]/g, '')}`),
    mode: config.controlMode || 'read-only',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(now()).toISOString(),
    error: message,
    safety: {
      event: null,
      exit: null,
      leaveFailure: null
    }
  };
}

function hydrateConfigFromState(config, state) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  return {
    ...config,
    userId: Number(config.userId || 0) || session.userId,
    sessionToken: config.sessionToken || session.sessionToken,
    loginPointX: hasConfigNumber(config.loginPointX) ? Number(config.loginPointX) : loginPoint?.x ?? config.loginPointX,
    loginPointY: hasConfigNumber(config.loginPointY) ? Number(config.loginPointY) : loginPoint?.y ?? config.loginPointY,
    loginPointHp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : loginPoint?.hp ?? config.loginPointHp
  };
}

function parseIsoTimeMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

const STAMINA_GAMEPLAY_DEADLINE_REASONS = new Set([
  'stamina-budget-coin-leave',
  'stamina-exhausted-leave'
]);

function staminaGameplayDeadlineReason(value) {
  const reason = String(value || '');
  return STAMINA_GAMEPLAY_DEADLINE_REASONS.has(reason) ? reason : '';
}

function gameplayDeadlineFromLoopPlan(loopPlan = {}, until = '', sourceRunId = '') {
  const untilMs = parseIsoTimeMs(until);
  if (!untilMs) return null;
  const reason = String(loopPlan.reason || 'persisted-reconnect-wait');
  const staminaReason = staminaGameplayDeadlineReason(reason);
  return {
    type: staminaReason ? 'stamina-reset' : (loopPlan.explicitDelay ? 'explicit-delay' : 'reconnect-wait'),
    reason,
    until: new Date(untilMs).toISOString(),
    explicit: Boolean(loopPlan.explicitDelay || staminaReason),
    snapshotEdgeReplaceable: Boolean(!loopPlan.explicitDelay && !staminaReason),
    sourceRunId: String(sourceRunId || loopPlan.previousRunId || '')
  };
}

function persistedReconnectDelayPlan(state, config = {}, nowMs = Date.now()) {
  const runner = state?.runner || {};
  const action = state?.runner?.currentAction || {};
  const stats = state?.stats || {};
  const lastExit = stats.lastExit || {};
  const gameplayDeadline = runner.gameplayDeadline && typeof runner.gameplayDeadline === 'object'
    ? runner.gameplayDeadline
    : null;
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const pendingExit = normalizePendingExit(runner.pendingExit, nowValue, {
    maximumAgeMs: config.pendingExitPersistMaxMs
  });
  if (pendingExit) {
    const delayMs = Math.max(0, Number(pendingExit.nextRetryAtMs || 0) - nowValue);
    return {
      continue: true,
      reason: 'exit-recovery',
      delayMs,
      previousRunId: pendingExit.sourceRunId || action.previousRunId || '',
      error: pendingExit.lastError || pendingExit.reason || 'exit-recovery',
      safetyReason: pendingExit.reason || 'exit-recovery',
      nextRunAt: pendingExit.nextRetryAt,
      persisted: true,
      explicitDelay: false,
      explicitCooldown: false,
      deadlineType: 'pending-exit-retry',
      deadlineSource: 'pending-exit',
      pendingExit,
      gameplayDeadline: null,
      processStop: runner.processStop || null
    };
  }
  const candidates = [
    { until: gameplayDeadline?.until, source: 'gameplay-deadline', reason: gameplayDeadline?.reason, explicit: gameplayDeadline?.explicit },
    { until: action.nextRunAt, source: 'current-action', reason: action.reason, explicit: action.explicitDelay },
    { until: lastExit.nextRunAt, source: 'last-exit', reason: lastExit.reason, explicit: false }
  ];
  let nextRunAtMs = 0;
  let nextRunAt = '';
  let selected = null;
  for (const candidate of candidates) {
    const parsed = parseIsoTimeMs(candidate.until);
    if (parsed > nextRunAtMs) {
      nextRunAtMs = parsed;
      nextRunAt = String(candidate.until || '');
      selected = candidate;
    }
  }
  const originalNextRunAtMs = nextRunAtMs;
  const dailyFirstLoginNotBeforeMs = browserlessDailyFirstLoginNotBeforeMs(state, config, nextRunAtMs);
  const dailyFirstLoginDeadlineApplied = dailyFirstLoginNotBeforeMs > nextRunAtMs;
  if (dailyFirstLoginDeadlineApplied) {
    nextRunAtMs = dailyFirstLoginNotBeforeMs;
    nextRunAt = new Date(nextRunAtMs).toISOString();
  }
  const remainingMs = Math.max(0, nextRunAtMs - nowValue);
  if (remainingMs <= 0) return null;
  const maxDelayMs = Math.max(
    1000,
    Number(config.maxPersistedReconnectDelayMs || 0) || DAY_MS
  );
  if (remainingMs > maxDelayMs) return null;
  const actionSafetyReason = String(action.safetyReason || '');
  const deadlineReason = String(gameplayDeadline?.reason || '');
  const lastExitReason = String(lastExit.reason || '');
  const selectedReason = String(selected?.reason || '');
  const staminaReason = [
    deadlineReason,
    actionSafetyReason,
    lastExitReason,
    action.reason,
    selectedReason
  ].map(staminaGameplayDeadlineReason).find(Boolean) || '';
  const reason = staminaReason || selectedReason || deadlineReason || actionSafetyReason || lastExitReason
    || String(action.reason || 'persisted-reconnect-wait');
  const explicitCooldown = Boolean(
    staminaReason
      || gameplayDeadline?.type === 'stamina-reset'
      || gameplayDeadline?.explicit
      || action.explicitDelay
      || selected?.explicit
      || dailyFirstLoginDeadlineApplied
  );
  const persistedGameplayDeadline = dailyFirstLoginDeadlineApplied
    ? gameplayDeadlineFromLoopPlan({
        reason: reason || 'daily-first-login-delay',
        explicitDelay: true,
        previousRunId: action.previousRunId || lastExit.runId || ''
      }, nextRunAt, action.previousRunId || lastExit.runId || '')
    : (gameplayDeadline || (staminaReason ? {
        type: 'stamina-reset',
        reason: staminaReason,
        until: nextRunAt,
        explicit: true,
        snapshotEdgeReplaceable: false,
        sourceRunId: String(action.previousRunId || lastExit.runId || '')
      } : null));
  return {
    continue: true,
    reason: reason || 'persisted-reconnect-wait',
    delayMs: remainingMs,
    previousRunId: action.previousRunId || '',
    error: reason || 'persisted-reconnect-wait',
    safetyReason: staminaReason || actionSafetyReason || lastExitReason || reason || '',
    nextRunAt,
    persisted: true,
    explicitDelay: Boolean(gameplayDeadline?.explicit || action.explicitDelay || selected?.explicit || dailyFirstLoginDeadlineApplied),
    explicitCooldown,
    deadlineType: String(persistedGameplayDeadline?.type || (staminaReason ? 'stamina-reset' : 'legacy-reconnect-wait')),
    deadlineSource: dailyFirstLoginDeadlineApplied ? 'daily-first-login' : String(selected?.source || ''),
    dailyFirstLoginDeadlineApplied,
    originalNextRunAt: originalNextRunAtMs > 0 ? new Date(originalNextRunAtMs).toISOString() : '',
    gameplayDeadline: persistedGameplayDeadline,
    processStop: runner.processStop || null
  };
}

function loginPointSafetyRequiredFromConfig(config = {}) {
  const required = Number(config.loginPointSafetySuccessRequired || 3);
  return Number.isFinite(required) && required > 0 ? Math.max(1, Math.round(required)) : 3;
}

function pendingLoginPointSafetyPatch(config = {}, reason = 'manual-login-point-pending-snapshot-safety', point = null, options = {}) {
  const currentPoint = point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    ? {
        x: Number(point.x),
        y: Number(point.y),
        hp: hasConfigNumber(point.hp) ? Number(point.hp) : null,
        source: point.source || 'state'
      }
    : null;
  return {
    ok: false,
    reason,
    point: currentPoint,
    checkedAt: '',
    snapshotSafety: null,
    detail: {
      ok: false,
      reason,
      originalReason: '',
      checkedAt: '',
      required: loginPointSafetyRequiredFromConfig(config),
      streak: 0,
      satisfied: false,
      selfPresent: null,
      bypassedPreLoginSafety: false,
      nearestActive: null,
      ...(options.detail && typeof options.detail === 'object' ? options.detail : {})
    }
  };
}

function learnedLoginPointFromCanary(canary) {
  const finalSelf = canary?.state?.realtime?.self || canary?.decisions?.last?.input?.self || null;
  const entrySelf = canary?.entry?.firstSelf || null;
  if (!finalSelf || !Number.isFinite(Number(finalSelf.x)) || !Number.isFinite(Number(finalSelf.y))) {
    return { finalSelf: null, loginPoint: null };
  }
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const hasEntrySummary = canary && Object.prototype.hasOwnProperty.call(canary, 'entry');
  let pointSelf = null;
  if (!snapshotSelfPresent) {
    if (entrySelf && Number.isFinite(Number(entrySelf.x)) && Number.isFinite(Number(entrySelf.y))) {
      pointSelf = entrySelf;
    } else if (!hasEntrySummary) {
      pointSelf = finalSelf;
    }
  }
  const pointSource = pointSelf === entrySelf ? 'browserless-entry-self' : 'canary-self';
  return {
    finalSelf,
    loginPoint: pointSelf
      ? {
          x: Number(pointSelf.x),
          y: Number(pointSelf.y),
          hp: Number.isFinite(Number(finalSelf.hp))
            ? Number(finalSelf.hp)
            : (Number.isFinite(Number(pointSelf.hp)) ? Number(pointSelf.hp) : null),
          source: pointSource
        }
      : null
  };
}

function browserlessLoopPlan(result, config = {}) {
  const canary = result?.canary || null;
  const safetyEvent = canary?.safety?.event || null;
  const safetyReason = safetyEvent?.reason || canary?.safety?.leaveFailure?.reason || '';
  const error = String(canary?.error || result?.reason || result?.error || '');
  const runId = canary?.runId || '';
  const snapshotSelfPresent = Boolean(canary?.snapshotSafety?.response?.summary?.selfPresent);
  const inGameRecoveryEvidence = Boolean(
    canary?.recovery?.inGameEvidence
      || snapshotSelfPresent
      || Number(canary?.stats?.selfPresent?.true || 0) > 0
      || canary?.entry?.firstSelf
      || safetyReason === 'direct-leave-failed'
      || canary?.safety?.leaveFailure
  );
  const delayMs = Math.max(1000, Number(config.loopDelayMs || 30000));
  const snapshotEdgeEnabled = config.snapshotEdgeEnabled === true;
  const fastDelayMs = 1000;
  const loopNowMs = parseIsoTimeMs(canary?.completedAt) || parseIsoTimeMs(canary?.startedAt) || Date.now();
  const pendingExit = normalizePendingExit(canary?.pendingExit, loopNowMs, {
    maximumAgeMs: config.pendingExitPersistMaxMs
  });
  const stop = reason => ({
    continue: false,
    reason,
    delayMs: 0,
    previousRunId: runId,
    error,
    safetyReason
  });
  const resume = (reason, minimumDelayMs = 0, extra = null) => ({
    continue: true,
    reason,
    delayMs: /^snapshot safety not confirmed:/i.test(error)
      ? Math.max(delayMs, snapshotEdgeEnabled ? 0 : 60000, Number(minimumDelayMs || 0))
      : Math.max(delayMs, Number(minimumDelayMs || 0)),
    previousRunId: runId,
    error,
    safetyReason,
    ...(extra && typeof extra === 'object' ? extra : {})
  });
  const resumeFast = reason => ({
    continue: true,
    reason,
    delayMs: fastDelayMs,
    previousRunId: runId,
    error,
    safetyReason
  });

  const decisionDelayMs = Number(
    safetyEvent?.detail?.decision?.reloginDelayMs
    ?? safetyEvent?.detail?.decision?.staminaBudgetExit?.reloginDelayMs
    ?? 0
  );
  const inferredStaminaExhaustion = inferredLongStaminaExhaustionFromCanary(canary, config);
  const fastRecoverableTransportReasons = new Set([
    'action-settlement-stalled',
    'frame-gap',
    'stale-self',
    'ws-closed',
    'ws-error'
  ]);

  if (config.once) return stop('once');
  if (!result) return resume('missing-result');
  if (result.reason === 'missing-manual-session') return resume('missing-manual-session');
  if (safetyReason === 'explicit-stop' || safetyReason === 'restart-drain-ready') return stop(safetyReason);
  if (pendingExit) {
    const nextRetryAtMs = Math.max(0, Number(pendingExit.nextRetryAtMs || 0));
    const retryDelayMs = Math.max(0, nextRetryAtMs - loopNowMs);
    return {
      continue: true,
      reason: 'exit-recovery',
      delayMs: retryDelayMs,
      previousRunId: runId,
      error,
      safetyReason: pendingExit.reason || safetyReason,
      pendingExit,
      nextRunAt: pendingExit.nextRetryAt,
      explicitDelay: false,
      deadlineType: 'pending-exit-retry'
    };
  }
  if (fastRecoverableTransportReasons.has(safetyReason)) {
    return resumeFast(safetyReason);
  }
  if (/websocket unexpected response 403|http 403|not logged in/i.test(error) && snapshotSelfPresent) {
    return resumeFast('ws-auth-blocked-self-present');
  }
  if (safetyReason === 'direct-leave-failed' || canary?.safety?.leaveFailure) return resumeFast('direct-leave-failed');
  if (inferredStaminaExhaustion && (safetyReason === 'no-self' || error === 'no-self')) {
    return resume('stamina-exhausted-leave', inferredStaminaExhaustion.reloginDelayMs, {
      explicitDelay: true,
      forceExitReason: true,
      staminaExhausted: inferredStaminaExhaustion
    });
  }
  if (safetyReason === 'no-self') return resume('no-self');
  if (/websocket unexpected response 403|http 403|missing-manual-session|login-point-bootstrap-failed/i.test(error)) {
    return resume(error || 'auth-or-bootstrap-retry');
  }
  if (result.ok) return resume('cycle-complete');
  if (safetyReason === 'stamina-budget-coin-leave' || safetyReason === 'stamina-exhausted-leave') {
    return resume(
      safetyReason,
      Math.max(
        Number.isFinite(decisionDelayMs) ? decisionDelayMs : 0,
        inferredStaminaExhaustion?.reloginDelayMs || 0
      ),
      {
        explicitDelay: true,
        ...(inferredStaminaExhaustion ? { staminaExhausted: inferredStaminaExhaustion } : {})
      }
    );
  }
  if ([
    'combat-action-settlement-stalled',
    'profit-live-snapshot-active-threat',
    'combat-critical-hp-leave',
    'combat-hp-disadvantage-leave',
    'combat-low-hp-disadvantage-leave',
    'combat-miss-close-timeout-leave',
    'combat-no-damage-generation-limit-leave',
    'recovery-low-hp-active-threat-leave',
    'injury-leave',
    'pursuit-leave'
  ].includes(safetyReason)) {
    return resume(safetyReason);
  }
  if (/^websocket connect timeout$/i.test(error)) return resumeFast('ws-connect-timeout');
  if (/^snapshot safety not confirmed:/i.test(error)) {
    if (inGameRecoveryEvidence) return resumeFast('in-game-snapshot-safety-retry');
    const snapshotReason = String(canary?.snapshotSafety?.reason || 'snapshot-safety-retry');
    if (snapshotEdgeEnabled && ['snapshot-edge-timeout', 'snapshot-edge-error-limit'].includes(snapshotReason)) {
      return resume(snapshotReason, Number(config.snapshotEdgeBackoffMs || 60000), { explicitDelay: true });
    }
    return resume('snapshot-safety-retry', 0, snapshotEdgeEnabled ? { snapshotEdgeRetry: true } : null);
  }
  return resume(error || safetyReason || 'unknown-error');
}

function browserlessTerminalStopRequestsRuntimeClose(result, reason = '') {
  if (reason === 'restart-drain-ready') return true;
  const event = result?.event || result?.canary?.safety?.event || null;
  const source = String(event?.detail?.source || '');
  return reason === 'explicit-stop' && /^(?:signal|restart-drain)(?:-|$)/.test(source);
}

function summarizeBrowserlessRunnerResult(result = {}) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const safetyEvent = canary?.safety?.event || result?.event || null;
  const leaveAttempts = Array.isArray(canary?.leave?.attempts) ? canary.leave.attempts : [];
  const lastLeave = leaveAttempts.length ? leaveAttempts[leaveAttempts.length - 1] : null;
  const reason = redactSecrets(result.reason
    || safetyEvent?.reason
    || canary?.safety?.leaveFailure?.reason
    || canary?.error
    || result.error
    || '');
  const startedAt = canary.startedAt || result.startedAt || '';
  const completedAt = canary.completedAt || result.completedAt || '';
  const measuredDurationMs = Date.parse(completedAt) - Date.parse(startedAt);
  const maxTask = canary?.hotPath?.maxTask || null;
  return {
    ok: Boolean(result.ok),
    mode: result.mode || canary.mode || '',
    reason,
    runId: canary.runId || result.runId || '',
    startedAt,
    completedAt,
    durationMs: Number(canary.durationMs || result.durationMs || (Number.isFinite(measuredDurationMs) ? Math.max(0, measuredDurationMs) : 0)),
    error: redactSecrets(canary.error || result.error || ''),
    safety: safetyEvent ? {
      reason: safetyEvent.reason || '',
      at: safetyEvent.at || '',
      source: safetyEvent.detail?.source || ''
    } : null,
    leave: lastLeave ? {
      ok: Boolean(lastLeave.ok),
      stage: lastLeave.stage || '',
      status: Number(lastLeave.status || 0),
      durationMs: Number(lastLeave.durationMs || 0)
    } : null,
    frames: {
      count: Number(canary?.stats?.frameCount || 0),
      lastAt: canary?.stats?.lastFrameAt || '',
      lastTick: Number(canary?.stats?.tick?.last || 0)
    },
    hotPath: {
      overBudget: Boolean(canary?.hotPath?.overBudget),
      maxTask: maxTask ? {
        task: maxTask.task || '',
        durationMs: Number(maxTask.durationMs || 0),
        frameType: maxTask.frameType || '',
        tick: maxTask.tick ?? null
      } : null
    }
  };
}

async function closeBrowserlessStatusHandle(statusHandle) {
  if (!statusHandle?.close) return false;
  const pending = statusHandle.close();
  statusHandle.server?.closeAllConnections?.();
  await pending;
  return true;
}

function runnerResultExitDetail(result, fallbackReason = '') {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  const reason = safetyReason || result?.reason || canary?.error || result?.error || fallbackReason || '';
  const finalSelf = lastLeaveResponseFromCanary(canary);
  const stamina1dRemainingMilli = numberOrNull(finalSelf?.stamina_1d_remaining_milli ?? finalSelf?.stamina1dRemainingMilli);
  const stamina1dLimitMilli = numberOrNull(finalSelf?.stamina_1d_limit_milli ?? finalSelf?.stamina1dLimitMilli);
  return {
    at: canary?.completedAt || result?.completedAt || '',
    reason,
    runId: String(canary?.runId || result?.runId || ''),
    stamina: stamina1dRemainingMilli !== null || stamina1dLimitMilli !== null
      ? { stamina1dRemainingMilli, stamina1dLimitMilli }
      : null
  };
}

function runnerResultConfirmedLeave(result) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : null;
  if (!canary) return false;
  return Boolean(canary.leave?.ok || canary.safety?.exit?.leave?.ok);
}

function preserveOnlineSessionForLoopWait(result, loopPlan = {}) {
  return Boolean(
    loopPlan?.continue
      && ['action-settlement-stalled', 'exit-recovery'].includes(String(loopPlan.reason || ''))
      && !runnerResultConfirmedLeave(result)
  );
}

function latestRealtimeTickFromResult(result) {
  const canary = result?.canary && typeof result.canary === 'object' ? result.canary : {};
  const candidates = [
    canary?.state?.realtime?.tick,
    canary?.decisions?.last?.input?.realtime?.tick,
    canary?.decisions?.last?.tick
  ].map(Number).filter(value => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

function snapshotSelfForUser(payload, userId) {
  const id = Number(userId || 0);
  if (!id) return null;
  const direct = payload?.self;
  if (direct && Number(direct.user_id ?? direct.userId) === id) return direct;
  return (Array.isArray(payload?.entities) ? payload.entities : [])
    .find(entity => Number(entity?.user_id ?? entity?.userId) === id) || null;
}

function confirmedLeaveStateFromResult(result, nowMs = Date.now()) {
  if (!runnerResultConfirmedLeave(result)) return null;
  const confirmedAtMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const ignoreUntilMs = confirmedAtMs + CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS;
  return {
    confirmedAt: new Date(confirmedAtMs).toISOString(),
    snapshotIgnoreUntil: new Date(ignoreUntilMs).toISOString(),
    lastRealtimeTick: latestRealtimeTickFromResult(result),
    runId: String(result?.canary?.runId || ''),
    ignoreUntilMs,
    quarantineRemainingMs: CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS
  };
}

function activeConfirmedLeaveState(state, nowMs = Date.now()) {
  const value = state?.runner?.confirmedLeave;
  if (!value || typeof value !== 'object') return null;
  const ignoreUntilMs = Date.parse(String(value.snapshotIgnoreUntil || ''));
  return {
    ...value,
    ignoreUntilMs: Number.isFinite(ignoreUntilMs) ? ignoreUntilMs : 0,
    quarantineRemainingMs: Number.isFinite(ignoreUntilMs)
      ? Math.max(0, ignoreUntilMs - Number(nowMs || Date.now()))
      : 0
  };
}

function snapshotSafetyAllowsImmediateResume(snapshotSafety) {
  const summary = snapshotSafety?.response?.summary || {};
  return Boolean(
    snapshotSafety?.ok
      && snapshotSafety?.reason === 'self-present-reentry'
      && snapshotSafety?.bypassedPreLoginSafety
      && summary.selfPresent === true
      && summary.freshness?.ok !== false
  );
}

function snapshotSafetyConfirmsOffline(snapshotSafety) {
  const summary = snapshotSafety?.response?.summary || {};
  return Boolean(
    summary.selfPresent === false
      && summary.freshness?.ok === true
      && !snapshotSafetyAllowsImmediateResume(snapshotSafety)
  );
}

function snapshotOfflineTransitionPatch(state, snapshotSafety, nowMs = Date.now()) {
  if (!snapshotSafetyConfirmsOffline(snapshotSafety)) return {};
  const safetyReady = Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false);
  const action = state?.runner?.currentAction || {};
  const session = state?.stats?.currentSession || {};
  const lastExit = state?.stats?.lastExit || {};
  const enteredAtMs = Date.parse(String(session.enteredAt || ''));
  const lastExitAtMs = Date.parse(String(lastExit.at || ''));
  const lastExitMatchesSession = Boolean(
    Number.isFinite(lastExitAtMs)
      && (!Number.isFinite(enteredAtMs) || lastExitAtMs >= enteredAtMs)
  );
  const checkedAt = snapshotSafety?.checkedAt || new Date(nowMs).toISOString();
  const patch = {
    runner: {
      currentAction: {
        kind: 'loop-wait',
        band: 'recover',
        reason: safetyReady ? 'login-point-safe-connecting' : 'snapshot-safety-retry',
        delayMs: Math.max(0, Number(action.delayMs || 0)),
        nextRunAt: String(action.nextRunAt || ''),
        previousRunId: String(action.previousRunId || lastExit.runId || '')
      }
    },
    stats: browserlessStatsForOffline(state, {
      at: lastExitMatchesSession ? lastExit.at : checkedAt,
      reason: lastExitMatchesSession
        ? (lastExit.reason || session.exitReason || 'snapshot-confirmed-offline')
        : (session.exitReason || 'snapshot-confirmed-offline'),
      runId: lastExitMatchesSession ? lastExit.runId : '',
      nextRunAt: String(action.nextRunAt || ''),
      delayMs: Math.max(0, Number(action.delayMs || 0))
    }, { nowMs })
  };
  return patch;
}

async function runBrowserlessRunner(config, deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const sleep = typeof deps.sleep === 'function'
    ? deps.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const supervisorErrors = [];
  const recordSupervisorError = (err, detail = {}) => {
    supervisorErrors.push({
      at: new Date(now()).toISOString(),
      error: errorMessage(err),
      detail
    });
    if (supervisorErrors.length > 20) supervisorErrors.splice(0, supervisorErrors.length - 20);
  };
  const ownsBackgroundIo = !deps.backgroundIo && !deps.disableBackgroundIo;
  const backgroundIo = deps.backgroundIo || (deps.disableBackgroundIo
    ? null
    : createBrowserlessBackgroundIo({
        onError: (err, detail) => recordSupervisorError(err, { operation: 'background-io', ...detail })
      }));
  const ownsStatusRenderIo = !deps.statusRenderIo && !deps.disableBackgroundIo;
  const statusRenderIo = deps.statusRenderIo || (deps.disableBackgroundIo
    ? null
    : createBrowserlessBackgroundIo({
        onError: (err, detail) => recordSupervisorError(err, { operation: 'status-render-io', ...detail })
      }));
  const rawLogStore = deps.logStore || createLocalLogStore({ logDir: config.logDir, now, backgroundIo });
  const logStore = createNoThrowLogStore(rawLogStore, recordSupervisorError);
  const publishBackgroundIo = typeof deps.onBackgroundIoReady === 'function'
    ? deps.onBackgroundIoReady
    : null;
  const publishLiveState = typeof deps.onLiveStateReady === 'function'
    ? deps.onLiveStateReady
    : null;
  const publishLifecycleControl = typeof deps.onLifecycleControlReady === 'function'
    ? deps.onLifecycleControlReady
    : null;
  if (publishBackgroundIo && backgroundIo) {
    try {
      publishBackgroundIo(backgroundIo);
    } catch (err) {
      recordSupervisorError(err, { operation: 'background-io-publish' });
    }
  }
  let snapshotGapPoller = null;
  let statusHandle = null;
  let closeRuntimeHandlesOnReturn = false;
  try {
  let liveState = null;
  if (publishLiveState) {
    try {
      publishLiveState(() => liveState);
    } catch (err) {
      recordSupervisorError(err, { operation: 'live-state-publish' });
    }
  }
  const patchLiveState = (patch, options = {}) => {
    const updatedAt = options.updatedAt || new Date(now()).toISOString();
    const base = liveState || readBrowserlessStateFile(config.stateFile || stateFilePath(config));
    liveState = mergeLiveState(base, { ...patch, updatedAt });
    return liveState;
  };
  const safetyController = deps.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs: config.frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    staleSelfConfirmMs: config.staleSelfConfirmMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs
  });
  const stateFile = config.stateFile || stateFilePath(config);
  const restartDrain = deps.restartDrainCoordinator || createRestartDrainCoordinator({ now });
  const updateState = (patch, options = {}) => {
    try {
      return updateBrowserlessStateFile(stateFile, patch, options);
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-update' });
      logStore.append('runner', 'state-update-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  const writeState = state => {
    try {
      return writeBrowserlessStateFile(stateFile, state);
    } catch (err) {
      recordSupervisorError(err, { operation: 'state-write' });
      logStore.append('runner', 'state-write-error', { error: errorMessage(err) });
      return readBrowserlessStateFile(stateFile);
    }
  };
  let lastRestartDrainLogKey = '';
  const publishRestartDrainStatus = (status, eventType = 'restart-drain-status') => {
    if (!status?.requested) return status;
    const publicStatus = {
      requested: true,
      reason: status.reason || 'restart-drain',
      requestedAt: status.requestedAt || '',
      requestedAtMs: Number(status.requestedAtMs || 0),
      commitmentKey: status.commitmentKey || '',
      waitMs: Number(status.waitMs || 0),
      readySince: Number(status.readySince || 0),
      stableMs: Number(status.stableMs || 0),
      ready: Boolean(status.ready),
      assessment: status.assessment || null
    };
    const key = JSON.stringify({
      eventType,
      ready: publicStatus.ready,
      assessment: publicStatus.assessment?.reason || '',
      commitmentKey: publicStatus.commitmentKey
    });
    const updatedAt = new Date(now()).toISOString();
    const processStop = {
      reason: publicStatus.reason,
      source: 'restart-drain',
      requestedAt: publicStatus.requestedAt || updatedAt
    };
    if (liveState) patchLiveState({ runner: { restartDrain: publicStatus, processStop } }, { updatedAt });
    else updateState({ runner: { restartDrain: publicStatus, processStop } }, { updatedAt });
    if (key !== lastRestartDrainLogKey) {
      lastRestartDrainLogKey = key;
      logStore.append('runner', eventType, publicStatus);
    }
    return publicStatus;
  };
  const lifecycleControl = {
    requestDrain(reason = 'restart-drain', detail = {}) {
      const currentState = liveState || readBrowserlessStateFile(stateFile);
      const action = currentState?.current?.decision?.action || currentState?.runner?.currentAction || {};
      const status = restartDrain.requestDrain(reason, {
        ...detail,
        commitmentKey: detail.commitmentKey || actionTargetKey(action)
      });
      const kind = String(currentState?.runner?.currentAction?.kind || action.kind || '');
      if (['loop-wait', 'stopped'].includes(kind) || currentState?.runner?.running === false) {
        restartDrain.observe(evaluateRestartReadiness({ online: false }));
        safetyController.requestStop('restart-drain-ready', {
          source: detail.source || 'lifecycle-control',
          offline: true,
          drain: restartDrain.status()
        });
      }
      return publishRestartDrainStatus(restartDrain.status(), 'restart-drain-requested');
    },
    forceStop(reason = 'explicit-stop', detail = {}) {
      const event = safetyController.requestStop(reason, {
        ...detail,
        source: detail.source || 'lifecycle-force-stop'
      });
      logStore.append('exits', 'stop-request', event);
      return { ok: true, event };
    },
    status: () => restartDrain.status()
  };
  if (publishLifecycleControl) {
    try {
      publishLifecycleControl(lifecycleControl);
    } catch (err) {
      recordSupervisorError(err, { operation: 'lifecycle-control-publish' });
    }
  }
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
  } catch (err) {
    recordSupervisorError(err, { operation: 'data-dir-create', dataDir: config.dataDir });
  }
  const highDropPlayerTracker = deps.highDropPlayerTracker || createHighDropPlayerTracker({
    file: path.join(config.dataDir, 'high-drop-players.json'),
    now,
    backgroundIo
  });
  const combatCompletionTracker = deps.combatCompletionTracker || createCombatCompletionTracker({
    file: path.join(config.dataDir, 'combat-learning.json'),
    now,
    backgroundIo
  });
  const easyKillPlayerTracker = deps.easyKillPlayerTracker || createEasyKillPlayerTracker({
    file: path.join(config.dataDir, 'easy-kill-players.json'),
    now,
    backgroundIo,
    onEvent: event => {
      combatCompletionTracker.observe(event);
      logStore.append('runner', 'easy-kill-player-outcome', event);
    }
  });
  const damagePlayerTracker = deps.damagePlayerTracker || createDailyDamagePlayerTracker({
    file: path.join(config.dataDir, 'daily-damage-players.json'),
    now,
    backgroundIo,
    onEvent: event => logStore.append('runner', 'daily-damage-player', event)
  });
  const dynamicWhitelist = deps.dynamicWhitelist || createDynamicWhitelist({
    file: path.join(config.dataDir, 'dynamic-whitelist.json'),
    now,
    backgroundIo
  });
  const easyKillPlayerStatus = () => {
    easyKillPlayerTracker.expirePendingOutcomes?.(now());
    return easyKillPlayerTracker.status();
  };
  const chatSeedPlayers = [
    ...(highDropPlayerTracker.status?.(now())?.players || []),
    ...(easyKillPlayerTracker.status?.(now())?.players || []),
    ...(damagePlayerTracker.status?.(now())?.players || []),
    ...(dynamicWhitelist.status?.().players || [])
  ];
  const chatService = deps.chatService || createChatService({
    now,
    getSelfUserId: () => config.userId,
    nameCacheFile: path.join(config.dataDir, 'chat-player-names.json'),
    backgroundIo,
    seedPlayers: chatSeedPlayers,
    onPollingDemandChange: () => snapshotGapPoller?.refreshSchedule?.()
  });
  let activeRunKillConfirmations = [];
  const observeSnapshotPayload = (payload, detail = {}) => {
    const observedAtMs = Number(detail.observedAtMs ?? now());
    const snapshotSource = String(detail.source || 'snapshot');
    snapshotGapPoller?.noteSnapshot(observedAtMs, {
      global: detail.global === true || snapshotSource !== 'ws'
    });
    let chatResult = null;
    let easyKillNameResult = null;
    let easyKillEvidenceResult = null;
    let damageNameResult = null;
    try {
      chatResult = chatService.observeSnapshot?.(payload, {
        ...detail,
        observedAtMs
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'chat-snapshot-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'chat-snapshot-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      easyKillNameResult = easyKillPlayerTracker.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'easy-kill-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'easy-kill-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      const evidence = snapshotSelfKillEvidence(payload, config.userId);
      const snapshotSelf = snapshotSelfForUser(payload, config.userId);
      const latestSelf = snapshotSelf
        || liveState?.current?.self
        || liveState?.lastKnown?.self
        || null;
      easyKillEvidenceResult = easyKillPlayerTracker.observeKillEvidence?.(evidence, {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick,
        selfHp: latestSelf?.hp,
        selfMaxHp: latestSelf?.max_hp ?? latestSelf?.maxHp
      }) || null;
      const confirmed = (easyKillEvidenceResult?.confirmed || []).map(item => ({
        ...item,
        source: detail.source || 'snapshot'
      }));
      if (confirmed.length) {
        activeRunKillConfirmations = [...activeRunKillConfirmations, ...confirmed].slice(-100);
        if (liveState) {
          patchLiveState({
            stats: browserlessStatsForKillEvidence(liveState, confirmed, { nowMs: observedAtMs })
          }, { updatedAt: new Date(observedAtMs).toISOString() });
        }
      }
    } catch (err) {
      recordSupervisorError(err, { operation: 'easy-kill-snapshot-kill-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'easy-kill-snapshot-kill-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      damageNameResult = damagePlayerTracker.observePlayerNames?.(payload?.entities || [], {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
    } catch (err) {
      recordSupervisorError(err, { operation: 'daily-damage-player-name-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'daily-damage-player-name-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
    }
    try {
      const result = highDropPlayerTracker.observeSnapshot(payload, {
        ...detail,
        observedAtMs,
        selfUserId: config.userId
      });
      if (result.updated > 0) {
        logStore.append('runner', 'high-drop-player-observation', {
          source: detail.source || 'snapshot',
          observed: result.observed,
          updated: result.updated,
          playerCount: result.playerCount
        });
      }
      return {
        ...result,
        chatMessagesObserved: Number(chatResult?.observed || 0),
        chatMessagesUpdated: Number(chatResult?.updated || 0),
        chatSendConfirmed: Boolean(chatResult?.confirmed),
        easyKillNamesUpdated: Number(easyKillNameResult?.updated || 0),
        easyKillKillsConfirmed: Number(easyKillEvidenceResult?.confirmed?.length || 0),
        damageNamesUpdated: Number(damageNameResult?.updated || 0)
      };
    } catch (err) {
      recordSupervisorError(err, { operation: 'high-drop-player-observe', source: detail.source || 'snapshot' });
      logStore.append('runner', 'high-drop-player-observation-error', {
        source: detail.source || 'snapshot',
        error: errorMessage(err)
      });
      return {
        ok: false,
        error: errorMessage(err),
        chatMessagesObserved: Number(chatResult?.observed || 0),
        chatMessagesUpdated: Number(chatResult?.updated || 0),
        chatSendConfirmed: Boolean(chatResult?.confirmed)
      };
    }
  };
  let retention = null;
  try {
    retention = cleanupOldLogDays(config.logDir, {
      nowMs: now(),
      keepDays: config.logRetentionDays
    });
  } catch (err) {
    recordSupervisorError(err, { operation: 'log-retention' });
    retention = { ok: false, error: errorMessage(err) };
  }
  let persisted = readBrowserlessStateFile(stateFile);
  const envSessionTokenProvided = Boolean(config.sessionToken);
  const envLoginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  const persistedLoginPoint = loginPointFromAnyState(persisted);
  config = hydrateConfigFromState(config, persisted);
  let loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
  persisted = writeState({
    ...persisted,
    updatedAt: new Date(now()).toISOString(),
    session: {
      ...persisted.session,
      userId: config.userId || persisted.session.userId,
      sessionToken: config.sessionToken || persisted.session.sessionToken,
      tokenUpdatedAt: envSessionTokenProvided ? new Date(now()).toISOString() : persisted.session.tokenUpdatedAt
    },
    runner: {
      ...persisted.runner,
      running: true,
      mode: config.dryRun ? 'dry-run' : config.controlMode,
      readOnly: config.readOnly,
      controlMode: config.controlMode,
      canaryProfile: config.canaryProfile || '',
      dryRun: config.dryRun,
      combatEnabled: Boolean(config.combatEnabled),
      lastError: ''
    },
    loginPointSafety: loginPointProvided
      ? pendingLoginPointSafetyPatch(config, 'manual-login-point-pending-snapshot-safety', {
          x: Number(config.loginPointX),
          y: Number(config.loginPointY),
          hp: hasConfigNumber(config.loginPointHp) ? Number(config.loginPointHp) : null,
          source: envLoginPointProvided ? 'cli' : (persistedLoginPoint?.source || 'state')
        })
      : persisted.loginPointSafety,
    logs: {
      ...persisted.logs,
      dataDir: config.dataDir,
      logDir: config.logDir,
      stateFile,
      currentDayDir: logStore.dayDirFor(now())
    }
  });

  const sourceIpController = deps.sourceIpController || createSourceIpController({
    config,
    stateFile,
    state: persisted,
    logStore,
    now,
    fetchWithTimeout: deps.fetchWithTimeout,
    openBrowserlessWs: deps.openBrowserlessWs,
    requestAuthUrl: deps.requestAuthUrl,
    submitCallbackInput: deps.submitCallbackInput,
    leaveWithVerification: deps.leaveWithVerification
  });
  config.sourceIp = sourceIpController.currentSourceIp();
  config.sourceIps = sourceIpController.sourceIps();
  persisted = readBrowserlessStateFile(stateFile);

  const highDropStatusAtStart = highDropPlayerTracker.status(now());
  const lastHighDropSnapshotAtMs = Date.parse(highDropStatusAtStart.lastSnapshotAt || '');
  const lastHighDropGlobalSnapshotAtMs = Date.parse(highDropStatusAtStart.lastGlobalSnapshotAt || '');
  snapshotGapPoller = deps.snapshotGapPoller || createSnapshotGapPoller({
    now,
    intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
    minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
    getIntervalMs: () => chatService.desiredSnapshotIntervalMs?.(now()) || DEFAULT_CHAT_IDLE_INTERVAL_MS,
    lastSnapshotAtMs: Number.isFinite(lastHighDropSnapshotAtMs) ? lastHighDropSnapshotAtMs : 0,
    globalIntervalMs: DEFAULT_SNAPSHOT_GAP_MS,
    lastGlobalSnapshotAtMs: Number.isFinite(lastHighDropGlobalSnapshotAtMs) ? lastHighDropGlobalSnapshotAtMs : 0,
    isReady: () => Boolean(config.userId && config.sessionToken),
    fetchSnapshot: async () => {
      const url = buildSnapshotProbeUrl({
        gameOrigin: config.gameOrigin,
        snapshotPath: config.snapshotPath || '/snapshot',
        userId: config.userId,
        sessionToken: config.sessionToken,
        nowMs: now()
      });
      const response = await sourceIpController.fetchWithTimeout(url, {
        timeoutMs: config.httpTimeoutMs || config.wsConnectTimeoutMs || 10000,
        method: 'GET',
        cache: 'no-store'
      });
      const body = await readResponseBody(response);
      if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
      if (!body.json || typeof body.json !== 'object') throw new Error('snapshot returned no JSON payload');
      return body.json;
    },
    onSnapshot: observeSnapshotPayload,
    onError: err => {
      recordSupervisorError(err, { operation: 'shared-gap-snapshot' });
      logStore.append('runner', 'shared-gap-snapshot-error', { error: errorMessage(err) });
    }
  });

  const refreshFromPersistedState = () => {
    persisted = readBrowserlessStateFile(stateFile);
    config = hydrateConfigFromState(config, persisted);
    try {
      sourceIpController.refreshFromState(persisted);
      config.sourceIp = sourceIpController.currentSourceIp();
      config.sourceIps = sourceIpController.sourceIps();
    } catch (err) {
      recordSupervisorError(err, { operation: 'source-ip-refresh' });
      logStore.append('runner', 'source-ip-refresh-error', { error: errorMessage(err) });
    }
  };

  let preparedSnapshotSafety = null;
  const waitForLoopPlan = async (loopPlan, resultForStop = null) => {
    if (!loopPlan.continue) {
      if (!config.once) {
        const currentBeforeStop = readBrowserlessStateFile(stateFile);
        const stopDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
        updateState({
          runner: {
            running: false,
            currentAction: {
              kind: 'stopped',
              band: 'recover',
              reason: loopPlan.reason,
              previousRunId: loopPlan.previousRunId || ''
            }
          },
          stats: browserlessStatsForOffline(currentBeforeStop, {
            ...stopDetail,
            reason: stopDetail.reason || loopPlan.reason,
            nextRunAt: '',
            delayMs: 0
          }, { nowMs: now() })
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-loop-stop', loopPlan);
      }
      if (resultForStop && loopPlan.reason === 'once') return resultForStop;
      const stopped = {
        ...(resultForStop || {
          ok: false,
          mode: config.controlMode || 'read-only'
        }),
        reason: loopPlan.reason || resultForStop?.reason || 'runner-loop-stop'
      };
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }

    const currentBeforeWait = readBrowserlessStateFile(stateFile);
    const newConfirmedLeave = confirmedLeaveStateFromResult(resultForStop, now());
    const confirmedLeave = newConfirmedLeave || activeConfirmedLeaveState(currentBeforeWait, now());
    const preserveOnlineSession = preserveOnlineSessionForLoopWait(resultForStop, loopPlan)
      && !confirmedLeave;
    const waitExitDetail = runnerResultExitDetail(resultForStop, loopPlan.reason);
    const waitReason = loopPlan.forceExitReason
      ? loopPlan.reason
      : (waitExitDetail.reason || loopPlan.reason);
    const resetLoginPointForNextEntry = Boolean(
      runnerResultConfirmedLeave(resultForStop)
        && loopPlan.reason !== 'snapshot-safety-retry'
        && loopPlan.reason !== 'in-game-snapshot-safety-retry'
    );
    const schedulingNowMs = now();
    const pendingExit = normalizePendingExit(
      loopPlan.pendingExit || currentBeforeWait?.runner?.pendingExit,
      schedulingNowMs,
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const pendingExitDeadlineMs = pendingExit
      ? Math.max(schedulingNowMs, Number(pendingExit.nextRetryAtMs || schedulingNowMs))
      : 0;
    const initialPlannedNextRunAtMs = pendingExit
      ? pendingExitDeadlineMs
      : schedulingNowMs + loopPlan.delayMs;
    const dailyFirstLoginNotBeforeMs = pendingExit ? 0 : browserlessDailyFirstLoginNotBeforeMs(
      currentBeforeWait,
      config,
      initialPlannedNextRunAtMs
    );
    const dailyFirstLoginDeadlineApplied = dailyFirstLoginNotBeforeMs > initialPlannedNextRunAtMs;
    const plannedNextRunAtMs = dailyFirstLoginDeadlineApplied
      ? dailyFirstLoginNotBeforeMs
      : initialPlannedNextRunAtMs;
    const scheduledLoopPlan = dailyFirstLoginDeadlineApplied
      ? {
          ...loopPlan,
          explicitDelay: true,
          notBeforeAt: new Date(dailyFirstLoginNotBeforeMs).toISOString(),
          dailyFirstLoginDeadlineApplied: true,
          originalDelayMs: loopPlan.delayMs
        }
      : loopPlan;
    const firstDailyLoginAtNextRun = !pendingExit
      && isFirstBrowserlessLoginOfDay(currentBeforeWait, plannedNextRunAtMs);
    const shouldPrepareSnapshotSafety = Boolean(
      !pendingExit && !firstDailyLoginAtNextRun && (
        confirmedLeave
        || (
          resetLoginPointForNextEntry
            || loopPlan.reason === 'snapshot-safety-retry'
        )
      )
    );
    const plannedDelayMs = Math.max(0, plannedNextRunAtMs - schedulingNowMs);
    const effectiveDelayMs = pendingExit
      ? Math.max(0, pendingExitDeadlineMs - schedulingNowMs)
      : (shouldPrepareSnapshotSafety
          ? (config.snapshotEdgeEnabled === true && !scheduledLoopPlan.explicitDelay
              ? 0
              : Math.max(
                  plannedDelayMs,
                  preLoginSafetyLeadMs(config) + Number(confirmedLeave?.quarantineRemainingMs || 0)
                ))
          : plannedDelayMs);
    const nextRunAtMs = effectiveDelayMs === plannedDelayMs
      ? plannedNextRunAtMs
      : schedulingNowMs + effectiveDelayMs;
    const nextRunAt = new Date(nextRunAtMs).toISOString();
    const waitDetail = {
      ...scheduledLoopPlan,
      delayMs: effectiveDelayMs,
      nextRunAt,
      supervisorErrors: supervisorErrors.slice(-5)
    };
    const exitRecoveryWait = loopPlan.reason === 'exit-recovery';
    const currentActionReason = resetLoginPointForNextEntry
      ? 'next-login-point-pending-snapshot-safety'
      : loopPlan.reason;
    updateState({
      runner: {
        running: true,
        mode: exitRecoveryWait ? 'exit-recovery' : (config.controlMode || 'read-only'),
        lastError: '',
        currentAction: {
          kind: exitRecoveryWait ? 'exit-recovery' : 'loop-wait',
          band: exitRecoveryWait ? 'exit' : 'recover',
          reason: currentActionReason,
          delayMs: effectiveDelayMs,
          nextRunAt,
          explicitDelay: Boolean(scheduledLoopPlan.explicitDelay),
          dailyFirstLoginDeadlineApplied,
          previousRunId: loopPlan.previousRunId || '',
          ...(exitRecoveryWait ? { pendingExit: pendingExit || null } : {})
        },
        gameplayDeadline: pendingExit
          ? null
          : gameplayDeadlineFromLoopPlan(scheduledLoopPlan, nextRunAt, loopPlan.previousRunId),
        confirmedLeave: confirmedLeave
          ? {
              confirmedAt: confirmedLeave.confirmedAt || '',
              snapshotIgnoreUntil: confirmedLeave.snapshotIgnoreUntil || '',
              lastRealtimeTick: Number(confirmedLeave.lastRealtimeTick || 0),
              runId: confirmedLeave.runId || loopPlan.previousRunId || ''
            }
          : null
      },
      ...(resetLoginPointForNextEntry ? {
        loginPointSafety: pendingLoginPointSafetyPatch(
          config,
          'next-login-point-pending-snapshot-safety',
          loginPointFromAnyState(currentBeforeWait)
        )
      } : {}),
      stats: preserveOnlineSession
        ? currentBeforeWait.stats
        : browserlessStatsForOffline(currentBeforeWait, {
            ...waitExitDetail,
            reason: waitReason,
            nextRunAt,
            delayMs: effectiveDelayMs
          }, { nowMs: now() })
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-loop-wait', waitDetail);
    try {
      if (shouldPrepareSnapshotSafety) {
        const leadMs = preLoginSafetyLeadMs(config);
        const waitBeforeProbeMs = Math.max(0, effectiveDelayMs - leadMs);
        if (waitBeforeProbeMs > 0) {
          const waitResult = await restartDrain.wait(waitBeforeProbeMs, sleep);
          if (waitResult?.interrupted) {
            const interrupted = new Error('restart drain interrupted pre-login wait');
            interrupted.code = 'RESTART_DRAIN_WAIT_INTERRUPTED';
            throw interrupted;
          }
        }
        preparedSnapshotSafety = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(
          config,
          readBrowserlessStateFile(stateFile),
          {
            now,
            sleep,
            fetchWithTimeout: sourceIpController.fetchWithTimeout,
            onSnapshotPayload: observeSnapshotPayload,
            onSnapshotSafety: recordSnapshotSafetyProgress,
            onSnapshotEdge: progress => logStore.append('runner', `snapshot-edge-${progress.type || 'progress'}`, progress),
            easyKillPlayerTracker,
            damagePlayerTracker
          }
        );
        recordSnapshotSafetyProgress(preparedSnapshotSafety);
        const preparedSummary = preparedSnapshotSafety?.response?.summary || {};
        const preparedFreshness = preparedSummary?.freshness || {};
        logStore.append('runner', 'runner-prelogin-safety-prepared', {
          checkedAt: preparedSnapshotSafety?.checkedAt || '',
          ok: Boolean(preparedSnapshotSafety?.ok),
          reason: preparedSnapshotSafety?.reason || '',
          originalReason: preparedSnapshotSafety?.originalReason || preparedSummary?.safety?.reason || '',
          selfPresent: preparedSummary.selfPresent === undefined ? null : Boolean(preparedSummary.selfPresent),
          tick: preparedSummary.tick ?? null,
          freshness: {
            ok: preparedFreshness.ok === undefined ? null : Boolean(preparedFreshness.ok),
            reason: preparedFreshness.reason || '',
            latestKnownTick: preparedFreshness.latestKnownTick ?? null,
            tickDelta: preparedFreshness.tickDelta ?? null
          },
          self: preparedSummary.self ? {
            userId: preparedSummary.self.user_id ?? preparedSummary.self.userId ?? null,
            x: preparedSummary.self.x ?? null,
            y: preparedSummary.self.y ?? null,
            hp: preparedSummary.self.hp ?? null,
            joined: preparedSummary.self.joined || '',
            mode: preparedSummary.self.current_join_mode || ''
          } : null,
          streak: preparedSnapshotSafety?.streak ?? null,
          required: preparedSnapshotSafety?.required ?? null,
          nextRunAt,
          confirmedLeave: preparedSnapshotSafety?.confirmedLeave
            ? {
                confirmedAt: preparedSnapshotSafety.confirmedLeave.confirmedAt || '',
                snapshotIgnoreUntil: preparedSnapshotSafety.confirmedLeave.snapshotIgnoreUntil || '',
                lastRealtimeTick: Number(preparedSnapshotSafety.confirmedLeave.lastRealtimeTick || 0),
                quarantined: Boolean(preparedSnapshotSafety.confirmedLeave.quarantined)
              }
            : null
        });
        if (snapshotSafetyAllowsImmediateResume(preparedSnapshotSafety)) {
          const currentBeforeResume = readBrowserlessStateFile(stateFile);
          const pendingExit = normalizePendingExit(currentBeforeResume?.runner?.pendingExit, now(), {
            maximumAgeMs: config.pendingExitPersistMaxMs
          });
          updateState({
            runner: {
              running: true,
              mode: pendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
              lastError: '',
              currentAction: {
                kind: pendingExit ? 'exit-recovery' : 'loop-wait',
                band: pendingExit ? 'exit' : 'recover',
                reason: pendingExit ? 'exit-recovery' : 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                previousRunId: loopPlan.previousRunId || '',
                ...(pendingExit ? { pendingExit } : {})
              },
              gameplayDeadline: null
            },
            stats: pendingExit
              ? currentBeforeResume.stats
              : browserlessStatsForOffline(currentBeforeResume, {
                  ...waitExitDetail,
                  reason: waitReason,
                  nextRunAt: '',
                  delayMs: 0
                }, { nowMs: now() })
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'runner-loop-wait-self-present-resume', {
            previousRunId: loopPlan.previousRunId || '',
            previousReason: loopPlan.reason,
            checkedAt: preparedSnapshotSafety?.checkedAt || '',
            tick: preparedSummary.tick ?? null,
            self: preparedSummary.self ? {
              x: preparedSummary.self.x ?? null,
              y: preparedSummary.self.y ?? null,
              hp: preparedSummary.self.hp ?? null,
              joined: preparedSummary.self.joined || '',
              mode: preparedSummary.self.current_join_mode || ''
            } : null
          });
          refreshFromPersistedState();
          return null;
        }
        const remainingMs = Math.max(0, nextRunAtMs - now());
        if (remainingMs > 0) {
          const waitResult = await restartDrain.wait(remainingMs, sleep);
          if (waitResult?.interrupted) {
            const interrupted = new Error('restart drain interrupted post-probe wait');
            interrupted.code = 'RESTART_DRAIN_WAIT_INTERRUPTED';
            throw interrupted;
          }
        }
      } else {
        await restartDrain.wait(effectiveDelayMs, sleep);
      }
    } catch (err) {
      if (err?.code !== 'RESTART_DRAIN_WAIT_INTERRUPTED') {
        recordSupervisorError(err, { operation: 'loop-sleep', delayMs: effectiveDelayMs });
        logStore.append('runner', 'loop-sleep-error', { error: errorMessage(err), delayMs: effectiveDelayMs });
      }
    }
    const requestedStop = safetyController.getStopEvent();
    if (requestedStop) {
      const stopped = {
        ok: false,
        mode: config.controlMode || 'read-only',
        reason: requestedStop.reason || 'explicit-stop',
        event: requestedStop
      };
      const currentBeforeStop = readBrowserlessStateFile(stateFile);
      updateState({
        runner: {
          running: false,
          lastRun: stopped,
          lastError: stopped.reason,
          currentAction: {
            kind: 'stopped',
            band: 'recover',
            reason: stopped.reason,
            previousRunId: loopPlan.previousRunId || ''
          }
        },
        stats: browserlessStatsForOffline(currentBeforeStop, {
          at: requestedStop.at,
          reason: stopped.reason,
          nextRunAt: '',
          delayMs: 0
        }, { nowMs: now() })
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-loop-stop', {
        ...loopPlan,
        reason: stopped.reason,
        requestedStop
      });
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }
    safetyController.clearStop();
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    refreshFromPersistedState();
    return null;
  };

  const loginPointSafetyPatchFromSnapshot = snapshotSafety => {
    const currentState = readBrowserlessStateFile(stateFile);
    const summary = snapshotSafety?.response?.summary && typeof snapshotSafety.response.summary === 'object'
      ? snapshotSafety.response.summary
      : {};
    const safety = summary.safety && typeof summary.safety === 'object' ? summary.safety : {};
    const checkedAt = snapshotSafety?.checkedAt || new Date(now()).toISOString();
    const point = safety.point || snapshotSafety?.loginPoint || currentState.loginPointSafety?.point || null;
    const required = Number(snapshotSafety?.required ?? safety.required ?? currentState.loginPointSafety?.detail?.required ?? 1);
    const streak = Number(snapshotSafety?.streak ?? safety.streak ?? 0);
    return {
      ok: Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false),
      reason: snapshotSafety?.reason || safety.reason || 'snapshot-safety-check',
      checkedAt,
      point,
      detail: {
        ...safety,
        ok: Boolean(snapshotSafety?.ok && snapshotSafety?.satisfied !== false),
        reason: snapshotSafety?.reason || safety.reason || '',
        originalReason: snapshotSafety?.originalReason || safety.reason || '',
        checkedAt,
        required: Number.isFinite(required) ? Math.max(1, Math.round(required)) : 1,
        streak: Number.isFinite(streak) ? Math.max(0, Math.round(streak)) : 0,
        satisfied: Boolean(snapshotSafety?.satisfied ?? safety.satisfied ?? (snapshotSafety?.ok && snapshotSafety?.satisfied !== false)),
        bypassedPreLoginSafety: Boolean(snapshotSafety?.bypassedPreLoginSafety),
        bypassKind: snapshotSafety?.bypassKind || '',
        selfPresent: summary.selfPresent === undefined ? null : Boolean(summary.selfPresent)
      }
    };
  };

  const recordSnapshotSafetyProgress = snapshotSafety => {
    if (!snapshotSafety || typeof snapshotSafety !== 'object') return;
    const summary = snapshotSafety?.response?.summary || {};
    const freshness = summary?.freshness || {};
    const clearsConfirmedLeave = Boolean(
      freshness.ok
        && (summary.selfPresent === false || snapshotSafetyAllowsImmediateResume(snapshotSafety))
    );
    const currentState = readBrowserlessStateFile(stateFile);
    const pendingResolution = pendingExitSnapshotResolution(currentState?.runner?.pendingExit, snapshotSafety);
    const patch = mergeState(snapshotOfflineTransitionPatch(currentState, snapshotSafety, now()), {
      loginPointSafety: loginPointSafetyPatchFromSnapshot(snapshotSafety),
      ...((clearsConfirmedLeave || pendingResolution.cleared) ? {
        runner: {
          ...(clearsConfirmedLeave ? { confirmedLeave: null } : {}),
          ...(pendingResolution.cleared ? { pendingExit: null } : {})
        }
      } : {})
    });
    const updatedAt = new Date(now()).toISOString();
    updateState(patch, { updatedAt });
    if (liveState) patchLiveState(patch, { updatedAt });
    logStore.append('runner', 'snapshot-safety-observation', {
      checkedAt: snapshotSafety?.checkedAt || '',
      ok: Boolean(snapshotSafety?.ok),
      reason: snapshotSafety?.reason || '',
      originalReason: snapshotSafety?.originalReason || summary?.safety?.reason || '',
      attempt: snapshotSafety?.attempt ?? null,
      streak: snapshotSafety?.streak ?? null,
      required: snapshotSafety?.required ?? null,
      selfPresent: summary.selfPresent === undefined ? null : Boolean(summary.selfPresent),
      tick: summary.tick ?? null,
      freshness: {
        ok: freshness.ok === undefined ? null : Boolean(freshness.ok),
        reason: freshness.reason || '',
        latestKnownTick: freshness.latestKnownTick ?? null,
        tickDelta: freshness.tickDelta ?? null
      },
      self: summary.self ? {
        userId: summary.self.user_id ?? summary.self.userId ?? null,
        x: summary.self.x ?? null,
        y: summary.self.y ?? null,
        hp: summary.self.hp ?? null,
        joined: summary.self.joined || '',
        mode: summary.self.current_join_mode || ''
      } : null,
      confirmedLeave: snapshotSafety?.confirmedLeave
        ? {
            confirmedAt: snapshotSafety.confirmedLeave.confirmedAt || '',
            snapshotIgnoreUntil: snapshotSafety.confirmedLeave.snapshotIgnoreUntil || '',
            lastRealtimeTick: Number(snapshotSafety.confirmedLeave.lastRealtimeTick || 0),
            quarantined: Boolean(snapshotSafety.confirmedLeave.quarantined)
          }
        : null,
      blockingPlayers: Array.isArray(summary?.safety?.blockingPlayers)
        ? summary.safety.blockingPlayers
        : [],
      blockingFactors: Array.isArray(summary?.safety?.blockingFactors)
        ? summary.safety.blockingFactors
        : [],
      singleBlockerHold: summary?.safety?.singleBlockerHold || null,
      bypassKind: snapshotSafety?.bypassKind || ''
    });
    if (pendingResolution.cleared) {
      logStore.append('runner', 'pending-exit-cleared-by-snapshot', {
        reason: pendingResolution.reason,
        checkedAt: snapshotSafety?.checkedAt || '',
        tick: summary.tick ?? null
      });
    }
  };

  const onTransportOpen = (transport, detail = {}) => {
    chatService.attachTransport?.(transport, detail);
    logStore.append('runner', 'chat-transport-online', {
      runId: detail.runId || '',
      mode: detail.mode || ''
    });
  };
  const onTransportClose = (transport, detail = {}) => {
    const detached = chatService.detachTransport?.(transport);
    if (detached === false) return;
    logStore.append('runner', 'chat-transport-offline', {
      runId: detail.runId || '',
      mode: detail.mode || '',
      reason: detail.reason || ''
    });
  };

  let statusRenderDiagnostics = null;
  const backgroundIoStatus = io => {
    const status = io?.status?.() || null;
    if (!status) return null;
    return {
      ok: Boolean(status.ok),
      pending: Number(status.pending || 0),
      pendingRequests: Number(status.pendingRequests || 0),
      operationErrorCount: Number(status.operationErrorCount || 0)
    };
  };
  const buildStatusSource = compact => {
    const sourceStarted = performance.now();
    const source = {
      ...(liveState || readBrowserlessStateFile(stateFile)),
      highDropPlayers: highDropPlayerTracker.status(now()),
      easyKillPlayers: easyKillPlayerStatus(),
      dailyDamagePlayers: damagePlayerTracker.status(now()),
      dynamicWhitelist: dynamicWhitelist.status(),
      chat: chatService.status?.(now()) || null,
      statusRender: {
        ...(statusRenderDiagnostics || {}),
        cacheMaxStaleMs: STATUS_COMPACT_MAX_STALE_MS,
        logQueue: backgroundIoStatus(backgroundIo),
        renderQueue: backgroundIoStatus(statusRenderIo)
      }
    };
    const sourceBuildMs = performance.now() - sourceStarted;
    if (!compact) return { source, sourceBuildMs, compactProjectionMs: 0 };
    const projectionStarted = performance.now();
    const projected = browserlessCompactStatusSource(source);
    return {
      source: projected,
      sourceBuildMs,
      compactProjectionMs: performance.now() - projectionStarted
    };
  };
  const statusRenderConfig = {
    ...publicConfig(config),
    webToken: config.webToken ? 'present' : '',
    webVersion: BROWSERLESS_WEB_PANEL_VERSION
  };
  let fullStatusCacheText = '';
  let fullStatusCacheAtMs = 0;
  let fullStatusInFlight = null;
  let compactStatusCacheText = '';
  let compactStatusCacheAtMs = 0;
  let compactStatusInFlight = null;
  const renderStatusTextNow = async compact => {
    const built = buildStatusSource(compact);
    const source = built.source;
    if (statusRenderIo?.renderStatus) {
      const rendered = await statusRenderIo.renderStatus(source, statusRenderConfig, compact, {
        timeoutMs: STATUS_RENDER_TIMEOUT_MS
      });
      if (compact) {
        statusRenderDiagnostics = {
          sourceBuildMs: Math.round(built.sourceBuildMs * 1000) / 1000,
          compactProjectionMs: Math.round(built.compactProjectionMs * 1000) / 1000,
          postMessageMs: Math.round(Number(rendered.postMs || 0) * 1000) / 1000,
          workerComputeMs: Math.round(Number(rendered.computeMs || 0) * 1000) / 1000,
          roundTripMs: Math.round(Number(rendered.roundTripMs || 0) * 1000) / 1000,
          responseSendMs: numberOrNull(statusRenderDiagnostics?.responseSendMs),
          bytes: Number(rendered.bytes || 0),
          renderedAt: new Date(now()).toISOString()
        };
      }
      return rendered.text;
    }
    const status = compact
      ? buildCompactBrowserlessStatus(source, statusRenderConfig)
      : {
          ...buildPublicBrowserlessStatus(source, statusRenderConfig),
          highDropPlayers: source.highDropPlayers,
          easyKillPlayers: source.easyKillPlayers,
          dailyDamagePlayers: source.dailyDamagePlayers,
          dynamicWhitelist: source.dynamicWhitelist,
          chat: source.chat
        };
    return JSON.stringify(status, null, 2);
  };
  const refreshCompactStatusText = () => {
    if (compactStatusInFlight) return compactStatusInFlight;
    compactStatusInFlight = renderStatusTextNow(true)
      .then(text => {
        compactStatusCacheText = text;
        compactStatusCacheAtMs = performance.now();
        return text;
      })
      .finally(() => {
        compactStatusInFlight = null;
      });
    return compactStatusInFlight;
  };
  const renderStatusText = compact => {
    if (compact) {
      const atMs = performance.now();
      if (compactStatusCacheText) {
        const cacheAgeMs = atMs - compactStatusCacheAtMs;
        if (cacheAgeMs >= STATUS_COMPACT_MAX_STALE_MS) {
          return refreshCompactStatusText().catch(err => {
            recordSupervisorError(err, { operation: 'compact-status-required-refresh', cacheAgeMs });
            throw err;
          });
        }
        if (cacheAgeMs >= STATUS_COMPACT_REFRESH_MS && !compactStatusInFlight) {
          setImmediate(() => refreshCompactStatusText().catch(err => {
            recordSupervisorError(err, { operation: 'compact-status-refresh' });
          }));
        }
        return Promise.resolve(compactStatusCacheText);
      }
      return refreshCompactStatusText();
    }
    const atMs = performance.now();
    if (fullStatusCacheText && atMs - fullStatusCacheAtMs < 1000) {
      return Promise.resolve(fullStatusCacheText);
    }
    if (fullStatusInFlight) return fullStatusInFlight;
    fullStatusInFlight = renderStatusTextNow(false)
      .then(text => {
        fullStatusCacheText = text;
        fullStatusCacheAtMs = performance.now();
        return text;
      })
      .finally(() => {
        fullStatusInFlight = null;
      });
    return fullStatusInFlight;
  };

  if (!config.once && Number(config.statusPort || 0) > 0 && deps.startStatusServer !== false) {
    const starter = deps.startStatusServer || startStatusServer;
    try {
      await refreshCompactStatusText();
      statusHandle = await starter({
        host: config.statusHost,
        port: config.statusPort,
        webToken: config.webToken,
        getStatusText: () => renderStatusText(false),
        getCompactStatusText: () => renderStatusText(true),
        onMainThreadTask: (task, durationMs, detail = {}) => {
          if (task === 'status-response' && detail.compact) {
            statusRenderDiagnostics = {
              ...(statusRenderDiagnostics || {}),
              responseSendMs: Math.round(Number(durationMs || 0) * 1000) / 1000
            };
          }
          if (Number(durationMs) < 50) return;
          logStore.append('runner', 'main-thread-budget-exceeded', {
            task,
            durationMs: Math.round(Number(durationMs) * 1000) / 1000,
            ...detail
          });
        },
        getChat: () => chatService.status?.(now()) || { ok: true, messages: [] },
        onChatActivity: () => chatService.notePageActivity?.(now()),
        onChatSend: text => {
          const result = chatService.sendChat?.(text) || {
            ok: false,
            statusCode: 409,
            reason: 'chat-unavailable',
            error: '聊天服务不可用'
          };
          logStore.append('runner', result.ok ? 'chat-send' : 'chat-send-rejected', {
            ok: Boolean(result.ok),
            reason: result.reason || '',
            textLength: Number(result.textLength || String(text ?? '').length),
            statusCode: Number(result.statusCode || (result.ok ? 200 : 409))
          });
          return result;
        },
        onDynamicWhitelistAdd: name => {
          const requestedName = String(name || '').trim();
          if (!requestedName) return { ok: false, statusCode: 400, reason: 'empty-name', error: '请输入玩家名称' };
          const matches = chatService.findPlayersByName?.(requestedName) || [];
          if (!matches.length) return { ok: false, statusCode: 404, reason: 'player-not-found', error: '未找到该玩家，请等待全局快照记录后重试' };
          if (matches.length > 1) return { ok: false, statusCode: 409, reason: 'ambiguous-name', error: '存在同名玩家，无法安全添加' };
          const result = dynamicWhitelist.add(matches[0], now());
          logStore.append('runner', 'dynamic-whitelist-added', {
            userId: result.player?.userId ?? null,
            name: result.player?.name || requestedName,
            added: Boolean(result.added)
          });
          compactStatusCacheText = '';
          return { ok: true, added: Boolean(result.added), player: result.player };
        },
        onStop: async () => {
          const event = safetyController.requestStop('explicit-stop', { source: 'status-api' });
          const currentState = liveState || readBrowserlessStateFile(stateFile);
          const patch = {
            runner: {
              lastError: event.reason,
              currentAction: { kind: 'stop', band: 'safety', reason: event.reason }
            },
            recentExits: [...(currentState.recentExits || []), event].slice(-20)
          };
          const updatedAt = new Date(now()).toISOString();
          if (liveState) patchLiveState(patch, { updatedAt });
          else updateState(patch, { updatedAt });
          logStore.append('exits', 'stop-request', event);
          return { ok: true, event };
        },
        onAuthUrl: async () => {
          const authUrl = await sourceIpController.requestAuthUrl({
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              lastAuthUrl: authUrl,
              lastAuthUrlAt: new Date(now()).toISOString()
            }
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'auth-url', { authUrlPresent: Boolean(authUrl) });
          return { ok: true, authUrl };
        },
        onCallback: async input => {
          const result = await sourceIpController.submitCallbackInput(input, {
            gameOrigin: config.gameOrigin,
            timeoutMs: config.httpTimeoutMs
          });
          updateState({
            session: {
              userId: result.login.userId,
              sessionToken: result.login.sessionToken,
              tokenUpdatedAt: new Date(now()).toISOString(),
              lastLoginSource: result.source || '',
              lastLoginSummary: result.summary || null
            },
            runner: {
              lastError: '',
              currentAction: {
                kind: 'loop-wait',
                band: 'recover',
                reason: 'manual-session-updated'
              }
            }
          }, { updatedAt: new Date(now()).toISOString() });
          refreshFromPersistedState();
          logStore.append('runner', 'login-ok', {
            userId: result.login.userId,
            tokenPresent: true,
            source: result.source || '',
            summary: result.summary || null
          });
          return {
            ok: true,
            userId: result.login.userId,
            tokenPresent: true,
            source: result.source || '',
            summary: result.summary || null
          };
        }
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'status-server-start', host: config.statusHost, port: config.statusPort });
      logStore.append('runner', 'status-server-error', { error: errorMessage(err), host: config.statusHost, port: config.statusPort });
    }
  }

  if (!config.once && !config.dryRun) snapshotGapPoller.start();

  logStore.append('runner', 'runner-start', {
    runtimeRevision: browserlessRuntimeRevision(),
    runtimeRevisionResolution: browserlessRuntimeRevisionStatus(),
    strategySchemaVersion: 2,
    config: publicConfig(config),
    retention,
    statusServer: statusHandle ? { host: config.statusHost, port: statusHandle.port } : null
  });
  updateState({ runner: { restartDrain: null, processStop: null } }, { updatedAt: new Date(now()).toISOString() });

  let persistedDelayPlan = !config.once && !config.dryRun
    ? persistedReconnectDelayPlan(readBrowserlessStateFile(stateFile), config, now())
    : null;
  if (!persistedDelayPlan) {
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
  }
  if (persistedDelayPlan && config.snapshotEdgeEnabled === true) {
    const persistedState = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || persistedState?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const confirmed = activeConfirmedLeaveState(persistedState, now());
    const explicitCooldown = Boolean(persistedDelayPlan.explicitCooldown || persistedDelayPlan.explicitDelay);
    if (confirmed && !explicitCooldown && !persistedPendingExit) {
      logStore.append('runner', 'runner-persisted-delay-replaced-by-snapshot-edge', {
        previousReason: persistedDelayPlan.reason || '',
        previousNextRunAt: persistedDelayPlan.nextRunAt || '',
        confirmedAt: confirmed.confirmedAt || ''
      });
      persistedDelayPlan = null;
      updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    }
  }
  let preservePersistedOnlineSession = false;
  if (persistedDelayPlan) {
    const persistedStateBeforeProbe = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || persistedStateBeforeProbe?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    const persistedConfirmedLeave = activeConfirmedLeaveState(persistedStateBeforeProbe, now());
    const explicitCooldown = Boolean(persistedDelayPlan.explicitCooldown || persistedDelayPlan.explicitDelay);
    preservePersistedOnlineSession = Boolean(persistedPendingExit) || (
      preserveOnlineSessionForLoopWait(null, persistedDelayPlan)
        && !persistedConfirmedLeave
    );
    if (persistedPendingExit) {
      logStore.append('runner', 'runner-persisted-pending-exit-deadline', {
        previousRunId: persistedPendingExit.sourceRunId || '',
        reason: persistedPendingExit.reason,
        nextRetryAt: persistedPendingExit.nextRetryAt,
        delayMs: Math.max(0, Number(persistedPendingExit.nextRetryAtMs || now()) - now())
      });
    } else if (explicitCooldown) {
      logStore.append('runner', 'runner-persisted-explicit-cooldown-self-probe-skipped', {
        previousRunId: persistedDelayPlan.previousRunId || '',
        previousReason: persistedDelayPlan.reason,
        deadlineType: persistedDelayPlan.deadlineType || '',
        nextRunAt: persistedDelayPlan.nextRunAt || ''
      });
    } else if (persistedConfirmedLeave?.quarantineRemainingMs > 0) {
      logStore.append('runner', 'runner-persisted-wait-confirmed-leave-quarantine', {
        previousRunId: persistedDelayPlan.previousRunId || '',
        previousReason: persistedDelayPlan.reason,
        confirmedAt: persistedConfirmedLeave.confirmedAt || '',
        snapshotIgnoreUntil: persistedConfirmedLeave.snapshotIgnoreUntil || '',
        lastRealtimeTick: Number(persistedConfirmedLeave.lastRealtimeTick || 0),
        remainingMs: persistedConfirmedLeave.quarantineRemainingMs
      });
    } else {
      try {
        const probe = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)({
          ...config,
          snapshotEdgeEnabled: false,
          loginPointSafetySuccessRequired: 1,
          loginPointSafetyProbeIntervalMs: 0
        }, persistedStateBeforeProbe, {
          now,
          sleep,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          onSnapshotPayload: observeSnapshotPayload,
          easyKillPlayerTracker,
          damagePlayerTracker,
          dynamicWhitelist
        });
        const selfPresent = snapshotSafetyAllowsImmediateResume(probe);
        logStore.append('runner', 'runner-persisted-wait-self-probe', {
          checkedAt: probe?.checkedAt || '',
          ok: Boolean(probe?.ok),
          reason: probe?.reason || '',
          selfPresent,
          tick: probe?.response?.summary?.tick ?? null,
          nextRunAt: persistedDelayPlan.nextRunAt
        });
        if (selfPresent) {
          recordSnapshotSafetyProgress(probe);
          const currentBeforeResume = readBrowserlessStateFile(stateFile);
          const pendingExit = normalizePendingExit(currentBeforeResume?.runner?.pendingExit, now(), {
            maximumAgeMs: config.pendingExitPersistMaxMs
          });
          updateState({
            runner: {
              running: true,
              mode: pendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
              lastError: '',
              currentAction: {
                kind: pendingExit ? 'exit-recovery' : 'loop-wait',
                band: pendingExit ? 'exit' : 'recover',
                reason: pendingExit ? 'exit-recovery' : 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                previousRunId: persistedDelayPlan.previousRunId || '',
                persisted: true,
                ...(pendingExit ? { pendingExit } : {})
              },
              gameplayDeadline: null
            },
            stats: (preservePersistedOnlineSession || pendingExit)
              ? currentBeforeResume.stats
              : browserlessStatsForOffline(currentBeforeResume, {
                  reason: persistedDelayPlan.safetyReason || persistedDelayPlan.reason,
                  nextRunAt: '',
                  delayMs: 0
                }, { nowMs: now() })
          }, { updatedAt: new Date(now()).toISOString() });
          logStore.append('runner', 'runner-persisted-wait-self-present-resume', {
            previousRunId: persistedDelayPlan.previousRunId || '',
            previousReason: persistedDelayPlan.reason,
            checkedAt: probe?.checkedAt || '',
            tick: probe?.response?.summary?.tick ?? null
          });
          persistedDelayPlan = null;
        }
      } catch (err) {
        recordSupervisorError(err, { operation: 'persisted-wait-self-probe' });
        logStore.append('runner', 'runner-persisted-wait-self-probe-error', {
          error: errorMessage(err),
          nextRunAt: persistedDelayPlan.nextRunAt
        });
      }
    }
  }
  if (persistedDelayPlan) {
    const currentBeforeWait = readBrowserlessStateFile(stateFile);
    const persistedPendingExit = normalizePendingExit(
      persistedDelayPlan.pendingExit || currentBeforeWait?.runner?.pendingExit,
      now(),
      { maximumAgeMs: config.pendingExitPersistMaxMs }
    );
    updateState({
      runner: {
        running: true,
        mode: persistedPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
        lastError: '',
        currentAction: {
          kind: persistedPendingExit ? 'exit-recovery' : 'loop-wait',
          band: persistedPendingExit ? 'exit' : 'recover',
          reason: persistedDelayPlan.reason,
          delayMs: persistedDelayPlan.delayMs,
          nextRunAt: persistedDelayPlan.nextRunAt,
          previousRunId: persistedDelayPlan.previousRunId || '',
          persisted: true,
          ...(persistedPendingExit ? { pendingExit: persistedPendingExit } : {})
        },
        gameplayDeadline: persistedPendingExit
          ? null
          : (persistedDelayPlan.gameplayDeadline || gameplayDeadlineFromLoopPlan(
              persistedDelayPlan,
              persistedDelayPlan.nextRunAt,
              persistedDelayPlan.previousRunId
            ))
      },
      stats: preservePersistedOnlineSession
        ? currentBeforeWait.stats
        : browserlessStatsForOffline(currentBeforeWait, {
            reason: persistedDelayPlan.safetyReason || persistedDelayPlan.reason,
            nextRunAt: persistedDelayPlan.nextRunAt,
            delayMs: persistedDelayPlan.delayMs
          }, { nowMs: now() })
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-persisted-loop-wait', {
      ...persistedDelayPlan,
      supervisorErrors: supervisorErrors.slice(-5)
    });
    try {
      const waitMs = persistedPendingExit
        ? Math.max(0, Number(persistedPendingExit.nextRetryAtMs || now()) - now())
        : persistedDelayPlan.delayMs;
      await restartDrain.wait(waitMs, sleep);
    } catch (err) {
      recordSupervisorError(err, { operation: 'persisted-loop-sleep', delayMs: persistedDelayPlan.delayMs });
      logStore.append('runner', 'persisted-loop-sleep-error', { error: errorMessage(err), delayMs: persistedDelayPlan.delayMs });
    }
    const requestedStop = safetyController.getStopEvent();
    if (requestedStop) {
      const stopped = {
        ok: false,
        mode: config.controlMode || 'read-only',
        reason: requestedStop.reason || 'explicit-stop',
        event: requestedStop
      };
      const currentBeforeStop = readBrowserlessStateFile(stateFile);
      updateState({
        runner: {
          running: false,
          lastRun: stopped,
          lastError: stopped.reason,
          currentAction: {
            kind: 'stopped',
            band: 'recover',
            reason: stopped.reason,
            previousRunId: persistedDelayPlan.previousRunId || ''
          }
        },
        stats: browserlessStatsForOffline(currentBeforeStop, {
          at: requestedStop.at,
          reason: stopped.reason,
          nextRunAt: '',
          delayMs: 0
        }, { nowMs: now() })
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-loop-stop', {
        ...persistedDelayPlan,
        reason: stopped.reason,
        requestedStop
      });
      closeRuntimeHandlesOnReturn = closeRuntimeHandlesOnReturn
        || browserlessTerminalStopRequestsRuntimeClose(stopped, stopped.reason);
      return stopped;
    }
    safetyController.clearStop();
    updateState({ runner: { gameplayDeadline: null } }, { updatedAt: new Date(now()).toISOString() });
    refreshFromPersistedState();
  }

  if (!['read-only', 'movement-only', 'non-combat-profit', 'profit-live', 'combat-dry-run', 'combat-live'].includes(String(config.controlMode || ''))) {
    const result = { ok: false, reason: 'unsupported-control-mode' };
    updateState({
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  if (config.dryRun) {
    const result = {
      ok: true,
      mode: 'dry-run',
      controlMode: config.controlMode || 'read-only',
      once: Boolean(config.once),
      statusPort: config.statusPort,
      message: 'browserless runner skeleton initialized without live transport'
    };
    updateState({
      runner: {
        running: !config.once,
        mode: 'dry-run',
        lastRun: result,
        lastError: ''
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-dry-run', result);
    return result;
  }

  if (config.once && (!config.userId || !config.sessionToken)) {
    const result = { ok: false, reason: 'missing-manual-session' };
    updateState({
      runner: {
        running: false,
        lastRun: result,
        lastError: result.reason
      }
    }, { updatedAt: new Date(now()).toISOString() });
    logStore.append('runner', 'runner-stop', result);
    return result;
  }

  const readOnlyCanary = deps.runReadOnlyOnce || runReadOnlyCanary;
  while (true) {
    if (!config.userId || !config.sessionToken) {
      const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'missing-manual-session' };
      updateState({
        runner: {
          running: true,
          mode: config.controlMode || 'read-only',
          lastRun: result,
          lastError: result.reason,
          currentAction: {
            kind: 'loop-wait',
            band: 'recover',
            reason: result.reason
          }
        }
      }, { updatedAt: new Date(now()).toISOString() });
      logStore.append('runner', 'runner-session-wait', result);
      const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
      if (stopped) return stopped;
      continue;
    }
    const loopState = readBrowserlessStateFile(stateFile);
    const activePendingExit = normalizePendingExit(loopState?.runner?.pendingExit, now(), {
      maximumAgeMs: config.pendingExitPersistMaxMs
    });
    const dailyFirstLoginPlan = activePendingExit ? null : browserlessDailyFirstLoginDelayPlan(
      loopState,
      config,
      now()
    );
    if (dailyFirstLoginPlan) {
      const stopped = await waitForLoopPlan(dailyFirstLoginPlan);
      if (stopped) return stopped;
      continue;
    }
    loginPointProvided = hasConfigNumber(config.loginPointX) && hasConfigNumber(config.loginPointY);
    if (!loginPointProvided && config.controlMode === 'read-only') {
      let bootstrap;
      try {
        bootstrap = await readOnlyCanary(config, {
          logStore,
          now,
          persistedState: readBrowserlessStateFile(stateFile),
          safetyController,
          easyKillPlayerTracker,
          combatCompletionTracker,
          damagePlayerTracker,
          dynamicWhitelist,
          allowMissingLoginPointBootstrap: true,
          onSnapshotSafety: recordSnapshotSafetyProgress,
          onSnapshotPayload: observeSnapshotPayload,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          openBrowserlessWs: sourceIpController.openBrowserlessWs,
          onTransportOpen,
          onTransportClose,
          leaveWithVerification: sourceIpController.leaveWithVerification
        });
      } catch (err) {
        recordSupervisorError(err, { operation: 'login-point-bootstrap-canary' });
        bootstrap = buildRunnerErrorCanary(err, config, { now, runId: 'login-point-bootstrap-error' });
        logStore.append('runner', 'runner-canary-error', bootstrap);
      }
      const learned = learnedLoginPointFromCanary(bootstrap);
      if (learned.loginPoint) {
        updateState({
          loginPointSafety: {
            ok: false,
            reason: 'learned-login-point-pending-snapshot-safety',
            point: learned.loginPoint,
            checkedAt: bootstrap.completedAt || new Date(now()).toISOString()
          },
          current: {
            self: learned.finalSelf
          },
          probes: {
            lastReadOnlyProbe: bootstrap
          }
        }, { updatedAt: new Date(now()).toISOString() });
        persisted = readBrowserlessStateFile(stateFile);
        config = hydrateConfigFromState(config, persisted);
        logStore.append('runner', 'login-point-learned', {
          point: learned.loginPoint,
          bootstrapRunId: bootstrap.runId || ''
        });
      } else {
        const result = { ok: false, mode: config.controlMode || 'read-only', reason: 'login-point-bootstrap-failed', canary: bootstrap };
        updateState({
          runner: {
            running: !config.once,
            mode: config.controlMode || 'read-only',
            lastRun: result,
            lastError: result.reason
          },
          probes: {
            lastReadOnlyProbe: bootstrap
          }
        }, { updatedAt: new Date(now()).toISOString() });
        logStore.append('runner', 'runner-bootstrap-failed', result);
        const stopped = await waitForLoopPlan(browserlessLoopPlan(result, config), result);
        if (stopped) return stopped;
        continue;
      }
    }
    let canary;
    let stateBeforeCanary = null;
    try {
      stateBeforeCanary = readBrowserlessStateFile(stateFile);
      liveState = stateBeforeCanary;
      activeRunKillConfirmations = [];
      const bypassPreLoginSafetyReason = isFirstBrowserlessLoginOfDay(stateBeforeCanary, now())
        ? 'daily-first-login-invulnerability'
        : '';
      const precheckedSnapshotSafety = bypassPreLoginSafetyReason ? null : preparedSnapshotSafety;
      preparedSnapshotSafety = null;
      canary = await readOnlyCanary(config, {
        logStore,
        now,
        persistedState: stateBeforeCanary,
        safetyController,
        easyKillPlayerTracker,
        combatCompletionTracker,
        damagePlayerTracker,
        dynamicWhitelist,
        bypassPreLoginSafetyReason,
        precheckedSnapshotSafety,
        onSnapshotSafety: recordSnapshotSafetyProgress,
        onSnapshotPayload: observeSnapshotPayload,
        onSnapshotEdge: progress => logStore.append('runner', `snapshot-edge-${progress.type || 'progress'}`, progress),
        fetchWithTimeout: sourceIpController.fetchWithTimeout,
        openBrowserlessWs: sourceIpController.openBrowserlessWs,
        onTransportOpen,
        onTransportClose,
        leaveWithVerification: sourceIpController.leaveWithVerification,
        restartDrainCoordinator: restartDrain,
        onRestartDrainStatus: status => publishRestartDrainStatus(status),
        useDecisionWorker: deps.useDecisionWorker !== false,
        onDecision: decision => {
          const currentBeforeDecision = liveState || stateBeforeCanary;
          const decisionPatch = decisionStatePatch(decision);
          patchLiveState({
            ...decisionPatch,
            current: {
              ...(decisionPatch.current || {}),
              battlePresentation: browserlessBattlePresentation(
                currentBeforeDecision.current?.battlePresentation,
                decision
              )
            },
            stats: browserlessStatsForDecision(currentBeforeDecision, decision, { nowMs: now() })
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        },
        onCombatControl: decision => {
          const currentBeforeDecision = liveState || stateBeforeCanary;
          const decisionPatch = decisionStatePatch(decision);
          patchLiveState({
            ...decisionPatch,
            current: {
              ...(decisionPatch.current || {}),
              battlePresentation: browserlessBattlePresentation(
                currentBeforeDecision.current?.battlePresentation,
                decision
              )
            },
            stats: browserlessStatsForDecision(currentBeforeDecision, decision, { nowMs: now() })
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        },
        onAction: (action, context = {}) => {
          patchLiveState({
            runner: {
              currentAction: {
                ...(action || {}),
                actionState: context.actionState || null
              }
            },
            current: {
              action: {
                ...(action || {}),
                actionState: context.actionState || null
              }
            }
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        }
      });
    } catch (err) {
      recordSupervisorError(err, { operation: 'canary' });
      canary = buildRunnerErrorCanary(err, config, { now });
      logStore.append('runner', 'runner-canary-error', canary);
    }
    const { finalSelf, loginPoint: learnedLoginPoint } = learnedLoginPointFromCanary(canary);
    const previousPendingExit = stateBeforeCanary?.runner?.pendingExit || null;
    const snapshotClearedPendingExit = canary?.recovery?.pendingExitResolution === 'fresh-snapshot-self-absent';
    const nextPendingExit = snapshotClearedPendingExit
      ? null
      : pendingExitFromCanary(previousPendingExit, canary, now(), {
          maximumAgeMs: config.pendingExitPersistMaxMs
        });
    if (canary && typeof canary === 'object') canary.pendingExit = nextPendingExit;
    const result = {
      ok: Boolean(canary?.ok),
      mode: nextPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
      canary: canary || null
    };
    const finalDecisionPatch = canary?.decisions?.last ? decisionStatePatch(canary.decisions.last) : {};
    const safetyEvents = [canary?.safety?.event, canary?.safety?.leaveFailure]
      .filter(Boolean)
      .map(event => reconcileBrowserlessExitKillEvidence({
        ...event,
        runId: event.runId || canary?.runId || ''
      }, activeRunKillConfirmations));
    const currentStateBeforeFinish = readBrowserlessStateFile(stateFile);
    const finalStateBase = liveState || currentStateBeforeFinish;
    const finalState = mergeState(finalStateBase, {
      ...finalDecisionPatch,
      ...(safetyEvents.length ? {
        recentExits: [...(finalStateBase.recentExits || []), ...safetyEvents].slice(-20)
      } : {}),
      runner: {
        ...(finalDecisionPatch.runner || {}),
        running: !config.once,
        mode: nextPendingExit ? 'exit-recovery' : (config.controlMode || 'read-only'),
        pendingExit: nextPendingExit,
        lastRun: result,
        lastError: result.ok ? '' : (canary?.error || 'read-only-canary-failed')
      },
      ...(learnedLoginPoint ? {
        loginPointSafety: {
          ...loginPointSafetyPatchFromSnapshot(canary?.snapshotSafety || {}),
          ok: Boolean(canary?.snapshotSafety?.ok && canary?.snapshotSafety?.satisfied !== false),
          reason: canary?.snapshotSafety?.reason || 'learned-from-canary-self',
          point: learnedLoginPoint,
          checkedAt: canary?.completedAt || canary?.snapshotSafety?.checkedAt || new Date(now()).toISOString()
        },
        current: {
          ...(finalDecisionPatch.current || {}),
          self: finalSelf
        }
      } : {}),
      probes: {
        lastReadOnlyProbe: canary || null
      }
    });
    finalState.updatedAt = new Date(now()).toISOString();
    writeState(finalState);
    liveState = null;
    logStore.append('runner', result.ok ? 'runner-finish' : 'runner-stop', summarizeBrowserlessRunnerResult(result));

    const loopPlan = browserlessLoopPlan(result, config);
    const stopped = await waitForLoopPlan(loopPlan, result);
    if (stopped) return stopped;
  }
  } finally {
    try {
      if (closeRuntimeHandlesOnReturn) {
        try {
          snapshotGapPoller?.stop?.();
        } catch (err) {
          recordSupervisorError(err, { operation: 'snapshot-gap-poller-stop' });
        }
        try {
          await closeBrowserlessStatusHandle(statusHandle);
        } catch (err) {
          recordSupervisorError(err, { operation: 'status-server-close' });
        }
      }
      if (ownsStatusRenderIo) await statusRenderIo.close({ timeoutMs: STATUS_IO_CLOSE_TIMEOUT_MS });
      if (ownsBackgroundIo) await backgroundIo.close({ timeoutMs: BACKGROUND_IO_CLOSE_TIMEOUT_MS });
    } finally {
      if (publishBackgroundIo) {
        try {
          publishBackgroundIo(null);
        } catch (_) {}
      }
      if (publishLiveState) {
        try {
          publishLiveState(null);
        } catch (_) {}
      }
      if (publishLifecycleControl) {
        try {
          publishLifecycleControl(null);
        } catch (_) {}
      }
    }
  }
}

function encodeBrowserlessSelfTestFrame(value) {
  return Buffer.concat([
    Buffer.from('GRZ1', 'ascii'),
    Buffer.from([1]),
    zlib.gzipSync(Buffer.from(JSON.stringify(value), 'utf8'))
  ]);
}

function currentMainThreadCpuMs() {
  try {
    const text = fs.readFileSync(`/proc/self/task/${process.pid}/schedstat`, 'utf8').trim();
    const runtimeNs = Number(text.split(/\s+/)[0]);
    return Number.isFinite(runtimeNs) ? runtimeNs / 1e6 : null;
  } catch (_) {
    return null;
  }
}

function complexCombatSelfTestFrames(userId = 7, frameCount = 48) {
  const passiveCount = 68;
  const snapshotCoins = Array.from({ length: 88 }, (_, index) => ({
    drop_id: 5000 + index,
    x: 2000 + (index % 11) * 3600,
    y: 1500 + Math.floor(index / 11) * 4200,
    amount: index % 17 === 0 ? 10 : 1
  }));
  const frameAt = index => {
    const tick = 500000 + index;
    const self = {
      entity_id: 1,
      user_id: userId,
      name: 'self-test-self',
      x: index * 20,
      y: index % 4 < 2 ? 0 : 20,
      vx: 20,
      vy: index % 4 < 2 ? 0 : 20,
      hp: 82,
      max_hp: 100,
      current_join_mode: 'Active',
      stamina_5s_remaining_milli: 6400,
      stamina_5s_limit_milli: 10000,
      stamina_1h_remaining_milli: 2400000,
      stamina_1h_limit_milli: 3000000,
      stamina_1d_remaining_milli: 16000000,
      stamina_1d_limit_milli: 20000000,
      death_drop_coins: 900
    };
    const activeTargets = Array.from({ length: 8 }, (_, targetIndex) => {
      const primary = targetIndex === 0;
      const direction = (index + targetIndex) % 6 < 3 ? -1 : 1;
      return {
        entity_id: 10 + targetIndex,
        user_id: 20 + targetIndex,
        name: primary ? 'complex-primary' : `complex-active-${targetIndex}`,
        x: 6500 + targetIndex * 900 + direction * index * 15,
        y: 800 + targetIndex * 550 + direction * index * 10,
        vx: direction * 35,
        vy: direction * 25,
        hp: primary ? 68 : 90 - targetIndex,
        max_hp: 100,
        current_join_mode: 'Active',
        firing: primary || targetIndex < 4,
        stamina_5s_remaining_milli: 4200 + targetIndex * 250,
        stamina_5s_limit_milli: 10000,
        death_drop_coins: primary ? 1800 : 80 + targetIndex * 10
      };
    });
    const passives = Array.from({ length: passiveCount }, (_, passiveIndex) => {
      const angle = passiveIndex / passiveCount * Math.PI * 2;
      const distance = 18000 + passiveIndex * 450;
      return {
        entity_id: 100 + passiveIndex,
        user_id: 1000 + passiveIndex,
        name: `complex-passive-${passiveIndex}`,
        x: Math.round(self.x + Math.cos(angle) * distance),
        y: Math.round(self.y + Math.sin(angle) * distance),
        vx: 0,
        vy: 0,
        hp: 100,
        max_hp: 100,
        current_join_mode: 'Passive',
        stamina_5s_remaining_milli: 10000,
        stamina_5s_limit_milli: 10000,
        death_drop_coins: passiveIndex % 5
      };
    });
    const bullets = activeTargets.slice(0, 6).map((target, bulletIndex) => ({
      bullet_id: index * 10 + bulletIndex + 1,
      owner_user_id: target.user_id,
      start_x: target.x,
      start_y: target.y,
      target_x: self.x,
      target_y: self.y,
      range_cm: 15000,
      speed_per_tick: 500,
      created_tick: tick - 2,
      expire_tick: tick + 28
    }));
    return { tick, self, entities: [self, ...activeTargets, ...passives], bullets };
  };
  const first = frameAt(0);
  const frames = [encodeBrowserlessSelfTestFrame({
    type: 'snapshot',
    tick: first.tick,
    entities: first.entities,
    bullets: first.bullets,
    coin_drops: snapshotCoins,
    messages: []
  })];
  for (let index = 1; index < frameCount; index += 1) {
    const frame = frameAt(index);
    frames.push(encodeBrowserlessSelfTestFrame({
      type: 'pos',
      tick: frame.tick,
      entities: frame.entities,
      bullets: frame.bullets
    }));
  }
  return frames;
}

async function runComplexCombatMainThreadBudgetSelfTest(tmp) {
  const frames = complexCombatSelfTestFrames();
  let nowMs = Date.UTC(2026, 6, 15, 9, 0, 0);
  let frameIndex = 0;
  let receiveFrame = null;
  let transportOpen = true;
  const frameCpuDurations = [];
  const backgroundIo = createBrowserlessBackgroundIo();
  const logStore = createLocalLogStore({
    logDir: path.join(tmp, 'frame-budget-logs'),
    now: () => nowMs,
    backgroundIo
  });
  const targetWhitelist = {
    names: [],
    userIds: [],
    nameSet: new Set(),
    userIdSet: new Set(),
    refresh: async () => ({ loaded: true, count: 0 }),
    isWhitelistedTarget: () => false
  };
  try {
    const result = await runReadOnlyCanary({
      gameOrigin: 'https://self-test.invalid',
      userId: 7,
      sessionToken: 'complex-combat-self-test-token',
      readOnly: false,
      controlMode: 'profit-live',
      combatEnabled: true,
      readOnlyProbeMs: 3000,
      decisionIntervalMs: 1000,
      combatControlIntervalMs: 50,
      movementCommandIntervalMs: 500,
      frameGapAlertMs: 5000,
      wsTraceEnabled: true,
      wsTracePayload: false
    }, {
      now: () => nowMs,
      sleep: async ms => {
        const deadline = nowMs + Number(ms || 0);
        while (receiveFrame && frameIndex < frames.length && nowMs + 50 <= deadline) {
          nowMs += 50;
          const wallStarted = performance.now();
          const cpuStarted = currentMainThreadCpuMs();
          receiveFrame(frames[frameIndex]);
          const cpuFinished = currentMainThreadCpuMs();
          frameCpuDurations.push(
            cpuStarted !== null && cpuFinished !== null
              ? Math.max(0, cpuFinished - cpuStarted)
              : performance.now() - wallStarted
          );
          frameIndex += 1;
          await new Promise(resolve => setImmediate(resolve));
        }
        nowMs = deadline;
        await new Promise(resolve => setImmediate(resolve));
      },
      logStore,
      mainThreadBudgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
      useDecisionWorker: true,
      targetWhitelist,
      precheckedSnapshotSafety: { ok: true, reason: 'self-test-prechecked', satisfied: true },
      persistedState: {
        loginPointSafety: { point: { x: 0, y: 0, hp: 100, source: 'self-test' } }
      },
      openBrowserlessWs: async options => {
        receiveFrame = options.onMessage;
        return {
          isOpen: () => transportOpen,
          close() { transportOpen = false; },
          sendVelocity() {},
          sendShoot() {}
        };
      },
      leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true }] })
    });
    const frameTiming = result.hotPath?.tasks?.['ws-message'] || {};
    const maxFrameMs = Number(frameTiming.maxMs || 0);
    const wallOverBudgetCount = Number(frameTiming.overBudgetCount || 0);
    const measuredFrameCount = Number(frameTiming.count || 0);
    const maxFrameCpuMs = frameCpuDurations.length ? Math.max(...frameCpuDurations) : Infinity;
    const cpuOverBudgetCount = frameCpuDurations.filter(durationMs => durationMs >= SELF_TEST_MAIN_THREAD_BUDGET_MS).length;
    const warmup = result.decisions?.realtimeControlWarmup || null;
    const expectedWorkProfileSource = currentMainThreadCpuMs() === null
      ? null
      : 'linux-main-thread-schedstat';
    const workProfileSource = String(result.hotPath?.maxTask?.workProfile?.cpuUsageSource || '');
    return {
      ok: Boolean(
        result.ok
        && warmup?.ok
        && warmup?.iterations === 6
        && measuredFrameCount >= 40
        && Number(result.decisions?.realtimeControlCount || 0) >= 40
        && Number(result.decisions?.realtimeControlSchedule?.minimumTickStride || 0) === 1
        && frameCpuDurations.length === measuredFrameCount
        && cpuOverBudgetCount === 0
        && maxFrameCpuMs < SELF_TEST_MAIN_THREAD_BUDGET_MS
        && (!expectedWorkProfileSource || workProfileSource === expectedWorkProfileSource)
      ),
      budgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
      frameCount: measuredFrameCount,
      realtimeControlCount: Number(result.decisions?.realtimeControlCount || 0),
      maxFrameCpuMs: Math.round(maxFrameCpuMs * 1000) / 1000,
      cpuOverBudgetCount,
      maxFrameWallMs: Math.round(maxFrameMs * 1000) / 1000,
      wallOverBudgetCount,
      timingSource: currentMainThreadCpuMs() === null ? 'performance-now-fallback' : 'linux-main-thread-schedstat',
      workProfileSource,
      warmup,
      maxTask: result.hotPath?.maxTask || null,
      canaryOk: Boolean(result.ok),
      canaryError: result.error || ''
    };
  } finally {
    await backgroundIo.close();
  }
}

async function runBrowserlessRunnerSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-browserless-runner-'));
  try {
    const dryConfig = parseBrowserlessRunnerArgs(['--once', '--dry-run', '--data-dir', tmp], {});
    const dryRun = await runBrowserlessRunner(dryConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 0, 0),
      disableBackgroundIo: true
    });
    const liveConfig = parseBrowserlessRunnerArgs([
      '--once',
      '--live',
      '--data-dir',
      tmp,
      '--user-id',
      '7',
      '--session-token',
      'self-test-token',
      '--login-point-x',
      '1',
      '--login-point-y',
      '2',
      '--login-point-hp',
      '100'
    ], {});
    updateBrowserlessStateFile(stateFilePath(liveConfig), {
      runner: {
        restartDrain: {
          requested: true,
          reason: 'stale-previous-process',
          requestedAt: '2026-07-08T00:00:00.000Z'
        }
      }
    }, { updatedAt: '2026-07-08T00:00:00.000Z' });
    const liveRun = await runBrowserlessRunner(liveConfig, {
      now: () => Date.UTC(2026, 6, 8, 1, 1, 0),
      disableBackgroundIo: true,
      runReadOnlyOnce: async () => ({ ok: true, frames: 0, fake: true })
    });
    const runnerResultSummary = summarizeBrowserlessRunnerResult({
      ok: false,
      mode: 'profit-live',
      canary: {
        runId: 'summary-self-test',
        startedAt: '2026-07-08T01:00:00.000Z',
        completedAt: '2026-07-08T01:01:00.000Z',
        error: 'restart-drain-ready',
        safety: { event: { reason: 'restart-drain-ready', detail: { source: 'restart-drain' } } },
        stats: { frameCount: 100, lastFrameAt: '2026-07-08T01:00:59.000Z', tick: { last: 200 } },
        decisions: { huge: 'x'.repeat(100000) },
        sessionToken: 'summary-secret-token'
      }
    });
    const runnerResultSummaryText = JSON.stringify(runnerResultSummary);
    const runnerResultSummaryOk = Boolean(
      runnerResultSummary.reason === 'restart-drain-ready'
        && runnerResultSummary.runId === 'summary-self-test'
        && runnerResultSummaryText.length < 2048
        && !runnerResultSummaryText.includes('summary-secret-token')
        && !runnerResultSummaryText.includes('"huge"')
    );
    const statusQueueProjection = buildCompactBrowserlessStatus({
      updatedAt: '2026-07-08T01:01:00.000Z',
      statusRender: {
        renderedAt: '2026-07-08T01:00:59.000Z',
        cacheMaxStaleMs: STATUS_COMPACT_MAX_STALE_MS,
        logQueue: { ok: true, pending: 123, pendingRequests: 0, operationErrorCount: 1 },
        renderQueue: { ok: true, pending: 0, pendingRequests: 1, operationErrorCount: 0 }
      }
    }, { statusHost: '127.0.0.1', statusPort: 18767 });
    const statusQueueProjectionOk = Boolean(
      statusQueueProjection.statusServer?.renderTiming?.cacheMaxStaleMs === STATUS_COMPACT_MAX_STALE_MS
        && statusQueueProjection.statusServer?.renderTiming?.logQueue?.pending === 123
        && statusQueueProjection.statusServer?.renderTiming?.renderQueue?.pendingRequests === 1
    );
    const loginPointSingleBlocker = runLoginPointSingleBlockerSelfTest();
    const singleBlockerConfig = parseBrowserlessRunnerArgs([
      '--login-point-single-blocker-bypass-ms',
      '1234'
    ], {});
    const singleBlockerConfigOk = singleBlockerConfig.loginPointSingleBlockerBypassMs === 1234;
    const staleRestartDrainCleared = readBrowserlessStateFile(stateFilePath(liveConfig)).runner.restartDrain === null;
    const pendingDeadlineNowMs = Date.parse('2026-07-20T06:00:01.900Z');
    const pendingDeadline = normalizePendingExit({
      active: true,
      reason: 'frame-gap',
      sourceRunId: 'pending-deadline-self-test',
      firstAtMs: pendingDeadlineNowMs - 1900,
      lastAttemptAtMs: pendingDeadlineNowMs - 1900,
      attemptCount: 1,
      requestAttemptCount: 4,
      nextRetryAtMs: pendingDeadlineNowMs + 100,
      lastError: 'HTTP 502'
    }, pendingDeadlineNowMs);
    const pendingLoopPlan = browserlessLoopPlan({
      canary: {
        runId: 'pending-deadline-self-test',
        completedAt: new Date(pendingDeadlineNowMs).toISOString(),
        pendingExit: pendingDeadline,
        safety: { event: { reason: 'frame-gap' } }
      }
    }, { once: false, loopDelayMs: 30000 });
    const pendingPersistedPlan = persistedReconnectDelayPlan({
      runner: {
        pendingExit: pendingDeadline,
        currentAction: {
          reason: 'ordinary-loop-wait',
          nextRunAt: new Date(pendingDeadlineNowMs + 79000).toISOString()
        }
      },
      stats: { currentSession: { online: true } }
    }, { pendingExitPersistMaxMs: 3600000 }, pendingDeadlineNowMs);
    const pendingStaleResolution = pendingExitSnapshotResolution(pendingDeadline, {
      ok: false,
      response: { summary: { selfPresent: false, freshness: { ok: false } } }
    });
    const pendingAbsentResolution = pendingExitSnapshotResolution(pendingDeadline, {
      ok: true,
      response: { summary: { selfPresent: false, freshness: { ok: true } } }
    });
    const pendingDeadlineSelfTest = {
      ok: Boolean(
        pendingLoopPlan.reason === 'exit-recovery'
          && pendingLoopPlan.delayMs === 100
          && pendingPersistedPlan.reason === 'exit-recovery'
          && pendingPersistedPlan.delayMs === 100
          && pendingPersistedPlan.deadlineSource === 'pending-exit'
          && pendingStaleResolution.active
          && !pendingStaleResolution.cleared
          && pendingAbsentResolution.cleared
      ),
      loopDelayMs: pendingLoopPlan.delayMs,
      persistedDelayMs: pendingPersistedPlan.delayMs,
      deadlineSource: pendingPersistedPlan.deadlineSource,
      staleCleared: pendingStaleResolution.cleared,
      freshAbsentCleared: pendingAbsentResolution.cleared
    };
    const wsClosedPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-ws-closed',
        error: 'ws-closed',
        safety: { event: { reason: 'ws-closed' } }
      }
    }, { loopDelayMs: 30000 });
    const combatExitPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-combat-exit',
        error: 'combat-hp-disadvantage-leave',
        safety: { event: { reason: 'combat-hp-disadvantage-leave' } }
      }
    }, { loopDelayMs: 30000 });
    const restartDrainPlan = browserlessLoopPlan({
      ok: false,
      canary: {
        runId: 'self-test-restart-drain',
        error: 'restart-drain-ready',
        safety: { event: { reason: 'restart-drain-ready' } }
      }
    }, { loopDelayMs: 30000 });
    const restartDrainClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      canary: { safety: { event: { reason: 'restart-drain-ready', detail: { source: 'restart-drain' } } } }
    }, 'restart-drain-ready');
    const signalForceClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      event: { reason: 'explicit-stop', detail: { source: 'signal-force' } }
    }, 'explicit-stop');
    const apiStopKeepsRuntime = browserlessTerminalStopRequestsRuntimeClose({
      event: { reason: 'explicit-stop', detail: { source: 'status-api' } }
    }, 'explicit-stop');
    const legacyRestartDrainExplicitStopClosesRuntime = browserlessTerminalStopRequestsRuntimeClose({
      canary: { safety: { event: { reason: 'explicit-stop', detail: { source: 'restart-drain' } } } }
    }, 'explicit-stop');
    const restartDrainSafetyController = createBrowserlessSafetyController({ now: () => 1000 });
    restartDrainSafetyController.requestStop('restart-drain-ready', { source: 'restart-drain' });
    const restartDrainSafetyReason = restartDrainSafetyController.evaluate({
      realtime: { self: { user_id: 7, hp: 100, x: 0, y: 0 }, frameAgeMs: 0 },
      frameAges: {}
    }, { nowMs: 1000 }).reason;
    let statusCloseResolved = null;
    const statusCloseHandle = {
      close: () => new Promise(resolve => {
        statusCloseResolved = resolve;
      }),
      server: {
        closeAllConnections() {
          statusCloseResolved?.();
        }
      }
    };
    const forcedStatusConnectionsClosed = await closeBrowserlessStatusHandle(statusCloseHandle);
    let drainNowMs = 1000;
    const restartDrain = createRestartDrainCoordinator({ now: () => drainNowMs, idleStableMs: 500 });
    restartDrain.requestDrain('restart-drain', { commitmentKey: 'player:9667' });
    const restartDrainCombat = evaluateRestartReadiness({
      online: true,
      decision: { action: { kind: 'combat-live', band: 'combat', target: { userId: 9667 } } }
    });
    restartDrain.observe(restartDrainCombat);
    const restartDrainIdle = evaluateRestartReadiness({
      online: true,
      decision: { action: { kind: 'coin', band: 'profit', target: { id: 7293, amount: 1 } } }
    });
    restartDrain.observe(restartDrainIdle);
    drainNowMs = 1500;
    restartDrain.observe(restartDrainIdle);
    const restartDrainStatus = restartDrain.status();
    const committedDropAllowed = restartDrainAllowsDecision({
      action: {
        kind: 'coin',
        band: 'profit',
        reason: 'post-kill-drop-priority',
        target: {
          id: 'id:299',
          amount: 10,
          sourceUserId: 9667,
          selfKilledPlayerDrop: true
        }
      }
    }, restartDrainStatus);
    const unrelatedDropBlocked = restartDrainAllowsDecision({
      action: {
        kind: 'coin',
        band: 'profit',
        reason: 'post-kill-drop-priority',
        target: {
          id: 'id:300',
          amount: 10,
          sourceUserId: 9555,
          selfKilledPlayerDrop: true
        }
      }
    }, restartDrainStatus);
    const closedTransportAdapter = createBrowserlessActionAdapter({
      transport: {
        sendVelocity() {
          throw new Error('websocket is not open');
        }
      },
      now: () => Date.UTC(2026, 6, 8, 1, 2, 0),
      commandIntervalMs: 0
    });
    const closedTransportAction = closedTransportAdapter.applyDecision({}, {
      kind: 'wait',
      band: 'wait',
      reason: 'missing-realtime-self',
      action: { kind: 'wait', band: 'wait', reason: 'missing-realtime-self' }
    });
    const chatService = runChatServiceSelfTest();
    const dynamicSnapshotPoller = createSnapshotGapPoller({
      now: () => Date.UTC(2026, 6, 8, 1, 3, 0),
      intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
      minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
      getIntervalMs: () => 1000,
      fetchSnapshot: async () => ({})
    });
    const dynamicSnapshotPollerStatus = dynamicSnapshotPoller.status();
    const routeAction = {
      kind: 'coin',
      target: { id: 'route-a', x: 20, y: 0, amount: 4 },
      coinRoute: {
        points: [
          { id: 'route-a', x: 20, y: 0, amount: 4, order: 1 },
          { id: 'route-b', x: 40, y: 0, amount: 4, order: 2 },
          { id: 'route-c', x: 60, y: 0, amount: 4, order: 3 }
        ]
      }
    };
    const routePanelInput = firstCoinPresent => ({
      self: { x: 0, y: 0 },
      profitCoins: [
        ...(firstCoinPresent ? [{ drop_id: 'route-a', id: 'route-a', x: 20, y: 0, amount: 4, distance: 20, authority: 'realtime' }] : []),
        { drop_id: 'route-b', id: 'route-b', x: 40, y: 0, amount: 4, distance: 40, authority: 'realtime' },
        { drop_id: 'route-c', id: 'route-c', x: 60, y: 0, amount: 4, distance: 60, authority: 'realtime' }
      ],
      visibleTargets: []
    });
    const routeRowsWhenFirstMissing = summarizeNearbyForPanel(
      routePanelInput(false),
      routeAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const routeRowsWhenFirstPresent = summarizeNearbyForPanel(
      routePanelInput(true),
      routeAction,
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const previewRows = summarizeNearbyForPanel(
      routePanelInput(true),
      {
        kind: 'coin',
        band: 'profit',
        reason: 'best-opportunity-coin',
        target: { type: 'coin', id: 'route-a', amount: 4, distance: 20 },
        coinRoutePreview: routeAction.coinRoute
      },
      {},
      { globalCoinMaxDistance: 50000 }
    ).c;
    const expectedRouteRows = 'route-a:1:1,route-b:0:2,route-c:0:3';
    const expectedPreviewRows = 'route-a:1:0,route-b:0:0,route-c:0:0';
    const routeRowsText = rows => rows.map(row => `${row[0]}:${row[3]}:${row[4]}`).join(',');
    const nearbyCoinRoutePanelTest = {
      ok: routeRowsText(routeRowsWhenFirstMissing) === expectedRouteRows
        && routeRowsText(routeRowsWhenFirstPresent) === expectedRouteRows
        && routeRowsText(previewRows) === expectedPreviewRows
        && new Set(routeRowsWhenFirstMissing.map(row => row[0])).size === routeRowsWhenFirstMissing.length
        && new Set(routeRowsWhenFirstPresent.map(row => row[0])).size === routeRowsWhenFirstPresent.length
        && new Set(previewRows.map(row => row[0])).size === previewRows.length,
      missingFirst: routeRowsText(routeRowsWhenFirstMissing),
      presentFirst: routeRowsText(routeRowsWhenFirstPresent),
      previewOnly: routeRowsText(previewRows)
    };
    const fleePanelInput = {
      self: { x: 0, y: 0 },
      visibleTargets: [
        { userId: 21557, name: 'Pyro', x: 10000, y: 0, distance: 10000, hp: 100, active: true, invulnerable: true },
        { userId: 34711, name: 'xuanze00', x: 5000, y: 0, distance: 5000, hp: 4, active: true }
      ],
      avoidanceThreats: [{ userId: 21557, name: 'Pyro', x: 10000, y: 0, distance: 10000, hp: 100, active: true, invulnerable: true }],
      activeThreats: [],
      firingThreats: [],
      snapshotActiveThreats: [],
      afkTargets: [],
      easyKillTargets: []
    };
    const fleePanelRows = summarizeNearbyForPanel(
      fleePanelInput,
      { kind: 'flee', target: { userId: 21557, name: 'Pyro' } },
      { target: { userId: 34711, name: 'xuanze00' } },
      { globalCoinMaxDistance: 50000 }
    ).p;
    const nearbyFleeTargetPanelTest = {
      ok: fleePanelRows.find(row => row[0] === 'Pyro')?.[9] === '21557'
        && fleePanelRows.find(row => row[0] === 'xuanze00')?.[9] === '34711',
      rows: fleePanelRows.map(row => `${row[0]}:${row[6]}:${row[9]}`).join(',')
    };
    const realtimeLootFixture = (selfHp, includeCoin) => {
      const nowMs = Date.UTC(2026, 6, 23, 1, 29, 48);
      return buildBrowserlessRealtimeControlDecision({
        userId: 28886,
        realtime: {
          tick: 100,
          receivedAtMs: nowMs,
          frameAgeMs: 0,
          self: {
            user_id: 28886,
            name: 'self',
            x: 0,
            y: 0,
            hp: selfHp,
            stamina_5s: 8000,
            stamina_1h: 2000000,
            stamina_1d: 10000000,
            current_join_mode: 'Active'
          },
          entities: [{
            user_id: 21557,
            name: 'Pyro',
            x: 10000,
            y: 0,
            hp: 100,
            stamina_5s: 8000,
            stamina_1h: 2000000,
            stamina_1d: 10000000,
            current_join_mode: 'Active',
            invulnerable: true,
            invulnerable_remaining_ms: 120000
          }],
          bullets: []
        },
        fallback: {
          tick: 99,
          receivedAtMs: nowMs - 50,
          frameAgeMs: 50,
          entities: [],
          coinDrops: includeCoin ? [{ id: 5422, x: 5000, y: 0, amount: 22 }] : []
        }
      }, {}, {
        nowMs,
        controlMode: 'profit-live',
        combatEnabled: true,
        attackRange: 14500,
        globalCoinMaxDistance: 50000,
        realtimeLootMaxDistanceCm: 14500,
        activeAvoidMaxDistance: 25000,
        profitLiveThreatExitRange: 14500
      });
    };
    const healthyLootRealtimeDecision = realtimeLootFixture(100, true);
    const lowHpLootRealtimeDecision = realtimeLootFixture(49, true);
    const realtimeLootSafetyArbitrationTest = {
      ok: healthyLootRealtimeDecision.kind === 'coin'
        && healthyLootRealtimeDecision.action?.target?.id === 5422
        && lowHpLootRealtimeDecision.kind === 'flee'
        && lowHpLootRealtimeDecision.reason === 'avoid-invulnerable-target',
      healthy: { kind: healthyLootRealtimeDecision.kind, reason: healthyLootRealtimeDecision.reason },
      lowHp: { kind: lowHpLootRealtimeDecision.kind, reason: lowHpLootRealtimeDecision.reason }
    };
    const pickupObservationState = {};
    const pickupObservationAt = Date.parse('2026-07-20T00:00:00.000Z');
    const pickupBefore = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt,
      self: { x: 0, y: 0 },
      rawRealtime: { coinDropsObserved: true },
      realtimeObservedCoins: [{ drop_id: 'single-coin', amount: 1, x: 1000, y: 0 }]
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const pickupMissingAuthority = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 500,
      self: { x: 500, y: 0 },
      rawRealtime: { coinDropsObserved: false },
      realtimeObservedCoins: []
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const pickupAfter = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 1000,
      self: { x: 1000, y: 0 },
      rawRealtime: { coinDropsObserved: true },
      realtimeObservedCoins: []
    }, pickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const browserlessCoinPickupObservationTest = {
      ok: pickupBefore.length === 0
        && pickupMissingAuthority.length === 0
        && pickupAfter.length === 1
        && pickupAfter[0].amount === 1,
      pickupCount: pickupAfter.length,
      amount: pickupAfter[0]?.amount ?? null
    };
    const snapshotPickupObservationState = {};
    const snapshotPickupBefore = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt,
      self: { x: 0, y: 0 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 100, coinDropsObserved: true },
      snapshotObservedCoins: [
        { drop_id: 'snapshot-single', amount: 1, x: 0, y: 4000 },
        { drop_id: 'snapshot-far', amount: 1, x: 10000, y: 10000 }
      ]
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupSameFrame = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 5000,
      self: { x: 0, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 100, coinDropsObserved: true },
      snapshotObservedCoins: [
        { drop_id: 'snapshot-single', amount: 1, x: 0, y: 4000 },
        { drop_id: 'snapshot-far', amount: 1, x: 10000, y: 10000 }
      ]
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupAfter = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 10000,
      self: { x: 4000, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 200, coinDropsObserved: true },
      snapshotObservedCoins: []
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const snapshotPickupRepeated = observeBrowserlessCoinPickups({
      nowMs: pickupObservationAt + 11000,
      self: { x: 4000, y: 4000 },
      rawRealtime: { coinDropsObserved: false },
      fallback: { tick: 200, coinDropsObserved: true },
      snapshotObservedCoins: []
    }, snapshotPickupObservationState, { coinCollectedConfirmDistance: 1800 });
    const browserlessSnapshotCoinPickupObservationTest = {
      ok: snapshotPickupBefore.length === 0
        && snapshotPickupSameFrame.length === 0
        && snapshotPickupAfter.length === 1
        && snapshotPickupAfter[0].amount === 1
        && snapshotPickupAfter[0].reason === 'snapshot-coin-disappeared-near-path'
        && snapshotPickupRepeated.length === 0,
      pickupCount: snapshotPickupAfter.length,
      amount: snapshotPickupAfter[0]?.amount ?? null,
      reason: snapshotPickupAfter[0]?.reason || ''
    };
    const highDropRankingTest = [
      ['self', 500, 700, 600],
      ['other', 500, 650, 650]
    ].sort((left, right) => highDropRankValueCore(right) - highDropRankValueCore(left))
      .map(item => item[0])
      .join(',') === 'other,self';
    const staminaExhaustionPanelTest = isStaminaExhaustionExitReasonCore('stamina-exhausted-leave')
      && isStaminaExhaustionExitReasonCore('体力耗尽')
      && !isStaminaExhaustionExitReasonCore('stamina-budget-coin-leave');
    const panelStatsState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, mode: 'profit-live', controlMode: 'profit-live' }
    };
    const panelStatsDecision = (atMs, drop, coinPickups = []) => ({
      at: new Date(atMs).toISOString(),
      input: {
        self: { userId: 7, name: 'self', drop, dropKnown: true },
        stamina: {},
        coinPickups,
        selfKillEvidence: []
      }
    });
    const panelStatsStartedAt = Date.parse('2026-07-20T00:00:00.000Z');
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt, 100),
      { nowMs: panelStatsStartedAt }
    );
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 1000, 100, [{ key: 'id:single-coin', amount: 1, at: panelStatsStartedAt + 1000 }]),
      { nowMs: panelStatsStartedAt + 1000 }
    );
    const panelSingleCoinCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 1000 });
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 2000, 101, [{ key: 'id:second-single-coin', amount: 1, at: panelStatsStartedAt + 2000 }]),
      { nowMs: panelStatsStartedAt + 2000 }
    );
    const panelTwoCoinCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 2000 });
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 3000, 110),
      { nowMs: panelStatsStartedAt + 3000 }
    );
    panelStatsState.stats = browserlessStatsForDecision(
      panelStatsState,
      panelStatsDecision(panelStatsStartedAt + 4000, 20),
      { nowMs: panelStatsStartedAt + 4000 }
    );
    const panelStatsCompact = buildCompactBrowserlessStatus(panelStatsState, { nowMs: panelStatsStartedAt + 4000 });
    const panelOfflineTransitionAt = panelStatsStartedAt + 120000;
    const panelOfflineTransitionState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: {
        running: true,
        currentAction: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-attack',
          target: { userId: 8, name: 'previous-enemy' }
        }
      },
      current: {
        self: { userId: 7, name: 'self', hp: 49 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          reason: 'combat-attack',
          action: { kind: 'combat-live', reason: 'combat-attack', target: { userId: 8 } }
        }
      },
      stats: {
        currentSession: {
          online: true,
          sessionId: '7:panel-transition',
          userId: 7,
          enteredAt: new Date(panelStatsStartedAt).toISOString(),
          lastSeenAt: new Date(panelStatsStartedAt + 30000).toISOString()
        },
        lastExit: {
          at: new Date(panelStatsStartedAt + 60000).toISOString(),
          reason: 'combat-low-hp-disadvantage-leave',
          runId: 'panel-previous-run'
        }
      }
    };
    const panelOfflinePersistedState = mergeState(panelOfflineTransitionState, {
      stats: browserlessStatsForOffline(panelOfflineTransitionState, {
        at: new Date(panelStatsStartedAt + 60000).toISOString(),
        reason: 'combat-low-hp-disadvantage-leave',
        runId: 'panel-previous-run'
      }, { nowMs: panelStatsStartedAt + 60000 })
    });
    const panelOfflineTransitionPatch = snapshotOfflineTransitionPatch(panelOfflinePersistedState, {
      ok: true,
      reason: 'safe',
      satisfied: true,
      checkedAt: new Date(panelOfflineTransitionAt).toISOString(),
      response: {
        summary: {
          selfPresent: false,
          freshness: { ok: true },
          safety: { ok: true, reason: 'safe' }
        }
      }
    }, panelOfflineTransitionAt);
    const panelOfflineTransitionCompact = buildCompactBrowserlessStatus(
      mergeState(panelOfflineTransitionState, panelOfflineTransitionPatch),
      { nowMs: panelOfflineTransitionAt }
    );
    const panelBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'combat-live', target: { userId: 8, distance: 5600 } } },
      current: {
        self: { userId: 7, name: 'self', hp: 86, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          at: '2026-07-20T00:00:15.000Z',
          target: { userId: 8, name: 'enemy', distance: 5600 }
        },
        combatSummary: {
          startedAt: '2026-07-20T00:00:00.000Z',
          durationMs: 15000,
          movementDistance: 20000,
          self: { userId: 7, name: 'self', hp: 86, maxHp: 100 },
          target: { userId: 8, name: 'enemy', hp: 73, maxHp: 100, distance: 5700, moving: true, firing: true }
        }
      }
    }, {});
    const panelAfkPresentationInitial = browserlessBattlePresentation(null, {
      kind: 'attack',
      band: 'profit',
      at: '2026-07-20T00:01:00.000Z',
      action: { kind: 'attack', band: 'profit', target: { userId: 9, distance: 900 } },
      input: { self: { userId: 7, x: 0, y: 0 } }
    });
    const panelAfkPresentationMoved = browserlessBattlePresentation(panelAfkPresentationInitial, {
      kind: 'attack',
      band: 'profit',
      at: '2026-07-20T00:01:01.000Z',
      action: { kind: 'attack', band: 'profit', target: { userId: 9, distance: 800 } },
      input: { self: { userId: 7, x: 300, y: 400 } }
    });
    const panelActivityStartedAt = Date.parse('2026-07-20T00:02:00.000Z');
    const panelActivityInitial = browserlessBattlePresentation(null, {
      kind: 'combat-live',
      band: 'combat',
      at: new Date(panelActivityStartedAt).toISOString(),
      action: { kind: 'combat-live', band: 'combat', target: { userId: 8, distance: 5000 } },
      input: { self: { userId: 7, x: 0, y: 0, vx: 50, vy: 0 } },
      combat: {
        target: { userId: 8, name: 'enemy', distance: 5000, vx: 0, vy: -50, firing: false },
        shooting: { actualLastShotAt: panelActivityStartedAt },
        behavior: { metrics: { shotEvents: [{ bulletId: 'activity-shot', observedAt: panelActivityStartedAt }] } }
      }
    });
    const panelActivityIdle = browserlessBattlePresentation(panelActivityInitial, {
      kind: 'combat-live',
      band: 'combat',
      at: new Date(panelActivityStartedAt + 1000).toISOString(),
      action: { kind: 'combat-live', band: 'combat', target: { userId: 8, distance: 5000 } },
      input: { self: { userId: 7, x: 0, y: 0, vx: 0, vy: 0 } },
      combat: {
        target: { userId: 8, name: 'enemy', distance: 5000, vx: 0, vy: 0, firing: false },
        shooting: { actualLastShotAt: panelActivityStartedAt },
        behavior: { metrics: { shotEvents: [{ bulletId: 'activity-shot', observedAt: panelActivityStartedAt }] } }
      }
    });
    const panelActivityState = {
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'combat-live', target: { userId: 8, distance: 5000 } } },
      current: {
        self: { userId: 7, name: 'self', x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100 },
        decision: {
          kind: 'combat-live',
          band: 'combat',
          at: new Date(panelActivityStartedAt + 1000).toISOString(),
          action: { kind: 'combat-live', band: 'combat', target: { userId: 8, name: 'enemy', distance: 5000 } }
        },
        combatSummary: {
          self: { userId: 7, name: 'self', hp: 100, maxHp: 100, moving: false, firing: false },
          target: { userId: 8, name: 'enemy', hp: 100, maxHp: 100, distance: 5000, moving: false, firing: false }
        },
        battlePresentation: panelActivityIdle
      }
    };
    const panelActivityRecent = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource(panelActivityState),
      { nowMs: panelActivityStartedAt + 2999 }
    );
    const panelActivityExpired = buildCompactBrowserlessStatus(
      browserlessCompactStatusSource(panelActivityState),
      { nowMs: panelActivityStartedAt + 3001 }
    );
    const groupedBlockingFactors = groupBlockingFactorsCore([
      { type: 'player', userId: 31361, name: 'mango', reason: 'active-near-login-point' },
      { type: 'player', userId: 31361, name: 'mango', reason: 'damage-actor-near-login-point' }
    ]);
    const panelAfkBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'attack', target: { userId: 9, distance: 800 } } },
      current: {
        self: { userId: 7, name: 'self', x: 300, y: 400, hp: 100, maxHp: 100 },
        decision: {
          kind: 'attack',
          band: 'profit',
          at: '2026-07-20T00:01:01.000Z',
          target: { userId: 9, name: 'afk-enemy', hp: 100, distance: 800, active: false }
        },
        battlePresentation: panelAfkPresentationMoved
      }
    }, {});
    const panelMismatchedBattleCompact = buildCompactBrowserlessStatus({
      session: { userId: 7, sessionToken: 'panel-self-test-token' },
      runner: { running: true, currentAction: { kind: 'attack', target: { userId: 9, distance: 800 } } },
      current: {
        self: { userId: 7, name: 'self', x: 300, y: 400, hp: 100, maxHp: 100 },
        decision: {
          kind: 'attack',
          band: 'profit',
          at: '2026-07-20T00:01:01.000Z',
          target: { userId: 9, name: 'afk-enemy', hp: 100, distance: 800, active: false }
        },
        battlePresentation: { ...panelAfkPresentationMoved, targetKey: 'player:10' }
      }
    }, {});
    const panelCombatState = {};
    const panelCombatInput = (nowMs, selfX, selfY) => ({
      userId: 7,
      realtime: {
        tick: Math.round(nowMs / 50),
        self: { entity_id: 1, user_id: 7, x: selfX, y: selfY, hp: 100 },
        entities: [
          { entity_id: 1, user_id: 7, x: selfX, y: selfY, hp: 100 },
          { entity_id: 2, user_id: 8, name: 'enemy', x: 1000, y: 0, hp: 100, current_join_mode: 'Active', firing: true }
        ],
        bullets: []
      }
    });
    const panelCombatInitial = buildBrowserlessCombatDryRun(panelCombatInput(1000, 0, 0), {
      nowMs: 1000,
      decisionState: panelCombatState,
      combatAttackRange: 11000
    });
    const panelCombatMoved = buildBrowserlessCombatDryRun(panelCombatInput(1500, 300, 400), {
      nowMs: 1500,
      decisionState: panelCombatState,
      combatAttackRange: 11000
    });
    let chatActivityCount = 0;
    const chatSendInputs = [];
    const statusTestHandle = await startStatusServer({
      host: '127.0.0.1',
      port: 0,
      webToken: 'status-self-test-token',
      getChat: () => ({ ok: true, sendAvailable: true, activityCount: chatActivityCount, messages: [] }),
      onChatActivity: () => { chatActivityCount += 1; },
      onChatSend: text => {
        chatSendInputs.push(text);
        return { ok: true, reason: 'self-test-chat-sent', textLength: String(text).length };
      }
    });
    let statusServerChatTest;
    try {
      const base = `http://127.0.0.1:${statusTestHandle.port}`;
      const pageResponse = await fetch(`${base}/`);
      const pageHtml = await pageResponse.text();
      const unauthorizedResponse = await fetch(`${base}/api/chat`);
      const chatResponse = await fetch(`${base}/api/chat?token=status-self-test-token`);
      const chatBody = await chatResponse.json();
      const sendResponse = await fetch(`${base}/api/chat/send?token=status-self-test-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hello' })
      });
      const sendBody = await sendResponse.json();
      const targetMarkerCoversOuterBorders = pageHtml.includes('right:100%;top:-1px;bottom:-1px;width:3px');
      const targetMarkerAvoidsAdjacentOverlap = pageHtml.includes('.target-current+.target-current::before,.target-current+.target-route-next::before,.target-route-next+.target-current::before,.target-route-next+.target-route-next::before{top:0}');
      const targetMarkerBoundaryOwnership = targetMarkerCoversOuterBorders && targetMarkerAvoidsAdjacentOverlap;
      const loginPointBlockerPanelPresent = pageHtml.includes('function blockingFactorsText(status)')
        && pageHtml.includes("addRow(rowsOut, '阻碍因素', blockingFactorsText(status))")
        && pageHtml.includes("addRow(rowsOut, '单人阻挡', singleBlocker)");
      const panelDetailTest = {
        ok: Boolean(
          pageHtml.includes('>Drop排行</h2>')
          && pageHtml.includes("{ text: '更新于', className: 'meta-label' }")
          && pageHtml.includes("{ text: stamp(status.highDropPlayers?.lastSnapshotAt) }")
          && pageHtml.includes("createHighDropRow('玩家名称', 'Drop', '推测额度', true)")
          && pageHtml.includes('rankedItems.sort((left, right) => highDropRankValue(right.item) - highDropRankValue(left.item)')
          && pageHtml.includes('initial * 20 + (latest - initial) * 2')
          && pageHtml.includes('if (latest !== maximum) return null')
          && pageHtml.includes('.high-drop-name.self.online,.high-drop-values.self.online{color:var(--green)}')
          && pageHtml.includes("+ (self ? ' self' : '')")
          && pageHtml.includes("if (reason === 'single-coin-bait-hold') return '正在等待'")
          && pageHtml.includes("if (kind === 'seek-enemy') return '正在靠近高Drop挂机玩家'")
          && pageHtml.includes("chatKillsCollapsed = !chatKillsCollapsed")
          && !pageHtml.includes("togglePanelCollapse(document.getElementById('chatPanel'))")
          && pageHtml.includes('id="battleMovementDistance"')
          && pageHtml.includes('id="lastExitPanel"')
          && pageHtml.includes("return '等待重连冷却时间'")
          && pageHtml.includes("return '等待登录点快照安全检查'")
          && pageHtml.includes("if (reason === 'login-point-safe-connecting') return '登录点已安全，正在连接游戏'")
          && pageHtml.includes("if (online && !liveCombat) addRow(rowsOut, '原因', actionReasonDisplay(status), true)")
          && pageHtml.includes("const liveCombat = Boolean(realtimeOnline && (kind === 'combat-live' || action.kind === 'combat-live'))")
          && pageHtml.includes("'活动 ' + bool(target.active)")
          && !pageHtml.includes("'危险 ' + bool(target.active)")
          && pageHtml.includes('const exit = status.game?.inGame')
          && pageHtml.includes("if (!online && offlineStats.nextReconnectAt)")
          && !pageHtml.includes("addRow(rowsOut, '原因', online ? actionReasonDisplay(status) : reasonText(reason), true)")
          && pageHtml.includes("translated === '正在退出游戏' ? '已退出游戏' : translated")
          && pageHtml.includes('防守交战持续无进展，撤退后仍无法脱离，主动退出')
          && pageHtml.includes('groupBlockingFactors(factors).map(row =>')
          && !pageHtml.includes("[offlineRole ? '上次血量' : '血量'")
          && !pageHtml.includes("[offlineRole ? '上次Drop' : 'Drop'")
          && pageHtml.includes("updateBattlePanel(s);\n      updateLastExitPanel(s);")
          && pageHtml.includes('const staminaExhausted = isStaminaExhaustionExitReason(reason);')
          && pageHtml.includes('if (battle && !staminaExhausted)')
          && pageHtml.includes('grid-column:2;grid-row:2')
          && pageHtml.includes("setText(prefix + 'Hp', hp === null ? '--' : integer(hp))")
          && pageHtml.includes('const fleeTargetId = targetIdentity(status.action?.target);')
          && pageHtml.includes('const isFleeTarget = fleeTarget && selected')
          && pageHtml.includes("{ text: unit(actor?.stamina5s), className: battleStaminaClass(actor) }")
          && pageHtml.includes("{ text: spentStaminaUnit(currentSession.staminaSpentMs), className: 'ok' }")
          && pageHtml.includes("{ text: integer(currentSession.kills), className: 'bad' }")
          && panelStatsCompact.stats.today.initialDrop === 100
          && panelStatsCompact.stats.today.maxDrop === 110
          && panelStatsCompact.stats.today.latestDrop === 20
          && panelSingleCoinCompact.stats.currentSession.coinsGained === 1
          && panelSingleCoinCompact.stats.today.coinsGained === 1
          && panelTwoCoinCompact.stats.currentSession.coinsGained === 2
          && panelTwoCoinCompact.stats.today.coinsGained === 2
          && panelStatsCompact.stats.currentSession.coinsGained === 20
          && panelStatsCompact.stats.today.coinsGained === 20
          && panelOfflineTransitionCompact.game.inGame === false
          && panelOfflineTransitionCompact.stats.currentSession.online === false
          && panelOfflineTransitionCompact.stats.currentSession.durationMs === 60000
          && panelOfflineTransitionCompact.stats.offline.lastExitReason === 'combat-low-hp-disadvantage-leave'
          && panelOfflineTransitionCompact.action.kind === 'loop-wait'
          && panelOfflineTransitionCompact.action.reason === 'login-point-safe-connecting'
          && browserlessCoinPickupObservationTest.ok
          && browserlessSnapshotCoinPickupObservationTest.ok
          && highDropRankingTest
          && staminaExhaustionPanelTest
          && panelBattleCompact.battle.distance === 5600
          && panelBattleCompact.battle.movementDistance === 20000
          && panelAfkPresentationInitial.movementDistance === 0
          && panelAfkPresentationMoved.movementDistance === 500
          && panelAfkBattleCompact.battle.movementDistance === 500
          && panelMismatchedBattleCompact.battle.movementDistance === null
          && panelActivityRecent.battle.self.moving === true
          && panelActivityRecent.battle.self.firing === true
          && panelActivityRecent.battle.target.moving === true
          && panelActivityRecent.battle.target.firing === true
          && panelActivityExpired.battle.self.moving === false
          && panelActivityExpired.battle.self.firing === false
          && panelActivityExpired.battle.target.moving === false
          && panelActivityExpired.battle.target.firing === false
          && groupedBlockingFactors.length === 1
          && groupedBlockingFactors[0].reasons.length === 2
          && panelCombatInitial.movementDistance === 0
          && panelCombatMoved.movementDistance === 500
          && nearbyFleeTargetPanelTest.ok
          && realtimeLootSafetyArbitrationTest.ok
        ),
        selfDropRange: {
          initial: panelStatsCompact.stats.today.initialDrop,
          max: panelStatsCompact.stats.today.maxDrop,
          latest: panelStatsCompact.stats.today.latestDrop
        },
        pickedCoins: {
          single: panelSingleCoinCompact.stats.currentSession.coinsGained,
          pair: panelTwoCoinCompact.stats.currentSession.coinsGained,
          calibrated: panelStatsCompact.stats.currentSession.coinsGained
        },
        coinPickupObservation: browserlessCoinPickupObservationTest,
        snapshotCoinPickupObservation: browserlessSnapshotCoinPickupObservationTest,
        highDropRanking: highDropRankingTest,
        staminaExhaustionPanel: staminaExhaustionPanelTest,
        offlineTransition: {
          online: panelOfflineTransitionCompact.stats.currentSession.online,
          durationMs: panelOfflineTransitionCompact.stats.currentSession.durationMs,
          lastExitReason: panelOfflineTransitionCompact.stats.offline.lastExitReason,
          actionReason: panelOfflineTransitionCompact.action.reason
        },
        battleDistance: panelBattleCompact.battle.distance,
        battleMovementDistance: panelBattleCompact.battle.movementDistance,
        afkBattleMovementDistance: panelAfkBattleCompact.battle.movementDistance,
        measuredMovementDistance: panelCombatMoved.movementDistance,
        nearbyFleeTargetPanel: nearbyFleeTargetPanelTest,
        realtimeLootSafetyArbitration: realtimeLootSafetyArbitrationTest
      };
      statusServerChatTest = {
        ok: Boolean(
          pageResponse.ok
          && pageHtml.includes('id="chatPanel"')
          && pageHtml.includes('/api/chat/send')
          && unauthorizedResponse.status === 401
          && chatResponse.ok
          && chatBody.activityCount === 1
          && sendResponse.ok
          && sendBody.reason === 'self-test-chat-sent'
          && chatSendInputs[0] === 'hello'
          && targetMarkerBoundaryOwnership
          && loginPointBlockerPanelPresent
          && panelDetailTest.ok
        ),
        unauthorizedStatus: unauthorizedResponse.status,
        activityCount: chatActivityCount,
        sendInputs: chatSendInputs.slice(),
        webChatPanelPresent: pageHtml.includes('id="chatPanel"'),
        targetMarkerCoversOuterBorders,
        targetMarkerAvoidsAdjacentOverlap,
        targetMarkerBoundaryOwnership,
        loginPointBlockerPanelPresent,
        panelDetailTest
      };
    } finally {
      await statusTestHandle.close();
    }
    const complexCombatMainThreadBudget = await runComplexCombatMainThreadBudgetSelfTest(tmp);
    const snapshotEdge = await runSnapshotEdgeSelfTest();
    const runnerLog = path.join(tmp, 'logs', '2026-07-08', 'runner.jsonl');
    const text = fs.readFileSync(runnerLog, 'utf8');
    return {
      ok: Boolean(
        dryRun.ok
        && liveRun.ok
        && runnerResultSummaryOk
        && statusQueueProjectionOk
        && loginPointSingleBlocker.ok
        && singleBlockerConfigOk
        && staleRestartDrainCleared
        && pendingDeadlineSelfTest.ok
        && /runner-dry-run/.test(text)
        && /runner-finish/.test(text)
        && !/self-test-token/.test(text)
        && wsClosedPlan.continue
        && wsClosedPlan.delayMs === 1000
        && combatExitPlan.continue
        && combatExitPlan.delayMs === 30000
        && restartDrainPlan.continue === false
        && restartDrainPlan.reason === 'restart-drain-ready'
        && restartDrainClosesRuntime
        && signalForceClosesRuntime
        && !apiStopKeepsRuntime
        && legacyRestartDrainExplicitStopClosesRuntime
        && restartDrainSafetyReason === 'restart-drain-ready'
        && forcedStatusConnectionsClosed
        && restartDrainCombat.ready === false
        && restartDrainIdle.ready === true
        && restartDrainStatus.ready === true
        && committedDropAllowed
        && !unrelatedDropBlocked
        && closedTransportAction.ok === false
        && closedTransportAction.transportClosed === true
        && chatService.ok
        && dynamicSnapshotPollerStatus.currentIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        && nearbyCoinRoutePanelTest.ok
        && statusServerChatTest.ok
        && snapshotEdge.ok
        // Host scheduling/GC timing is diagnostic; functional runner blocks
        // remain release-gating without turning an external pause into a
        // product failure.
        && complexCombatMainThreadBudget.canaryOk
      ),
      dryRun,
      liveRun,
      runnerResultSummary: {
        ok: runnerResultSummaryOk,
        bytes: Buffer.byteLength(runnerResultSummaryText),
        value: runnerResultSummary
      },
      statusQueueProjection: {
        ok: statusQueueProjectionOk,
        renderTiming: statusQueueProjection.statusServer?.renderTiming || null
      },
      loginPointSingleBlocker,
      singleBlockerConfigOk,
      staleRestartDrainCleared,
      pendingDeadlineSelfTest,
      wsClosedPlan,
      combatExitPlan,
      restartDrainPlan,
      restartDrainClosesRuntime,
      signalForceClosesRuntime,
      apiStopKeepsRuntime,
      legacyRestartDrainExplicitStopClosesRuntime,
      restartDrainSafetyReason,
      forcedStatusConnectionsClosed,
      restartDrainStatus,
      committedDropAllowed,
      unrelatedDropBlocked,
      closedTransportAction,
      chatService,
      dynamicSnapshotPollerStatus,
      nearbyCoinRoutePanelTest,
      statusServerChatTest,
      snapshotEdge,
      complexCombatMainThreadBudget,
      logFile: runnerLog
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS,
  browserlessDayKey,
  browserlessDailyFirstLoginDelayPlan,
  browserlessLoopPlan,
  browserlessTerminalStopRequestsRuntimeClose,
  closeBrowserlessStatusHandle,
  confirmedLeaveStateFromResult,
  hydrateConfigFromState,
  isFirstBrowserlessLoginOfDay,
  learnedLoginPointFromCanary,
  preLoginSafetyLeadMs,
  snapshotSafetyAllowsImmediateResume,
  persistedReconnectDelayPlan,
  preserveOnlineSessionForLoopWait,
  publicConfig,
  runnerResultExitDetail,
  summarizeBrowserlessRunnerResult,
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
};
