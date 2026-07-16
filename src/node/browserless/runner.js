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
  browserlessStatsForOffline,
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  loginPointFromAnyState,
  mergeState,
  readBrowserlessStateFile,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
} = require('./state-file');
const { startStatusServer } = require('./status-server');
const { BROWSERLESS_WEB_PANEL_VERSION } = require('./web-panel');
const { runPreLoginSnapshotSafety, runReadOnlyCanary } = require('./canary');
const {
  DEFAULT_SNAPSHOT_GAP_MS,
  createHighDropPlayerTracker,
  createSnapshotGapPoller
} = require('./high-drop-player-tracker');
const { createEasyKillPlayerTracker } = require('./easy-kill-player-tracker');
const { createCombatCompletionTracker } = require('./combat-completion-tracker');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const {
  DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
  DEFAULT_CHAT_IDLE_INTERVAL_MS,
  createChatService,
  runChatServiceSelfTest
} = require('./chat-service');
const {
  BROWSER_RUNTIME_DEFAULTS,
  decisionStatePatch,
  snapshotSelfKillEvidence,
  summarizeNearbyForPanel
} = require('./decision-adapter');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { createSourceIpController } = require('./source-ip-controller');
const { createBrowserlessSafetyController } = require('./safety-controller');
const {
  actionTargetKey,
  createRestartDrainCoordinator,
  evaluateRestartReadiness
} = require('./restart-readiness');
const { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus } = require('./runtime-revision');
const {
  buildSnapshotProbeUrl,
  readResponseBody,
  redactSecrets
} = require('./session-client');

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const CONFIRMED_LEAVE_SNAPSHOT_IGNORE_MS = 40000;
const SELF_TEST_MAIN_THREAD_BUDGET_MS = 50;

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
    browserlessProfitPursuitMaxMs: Number(config.browserlessProfitPursuitMaxMs || 0),
    browserlessProfitPursuitSuppressMs: Number(config.browserlessProfitPursuitSuppressMs || 0),
    browserlessDangerousTargetCooldownMs: Number(config.browserlessDangerousTargetCooldownMs || 0),
    browserlessProfitPursuitMinDamageMs: Number(config.browserlessProfitPursuitMinDamageMs || 0),
    browserlessProfitPursuitMinDamageHp: Number(config.browserlessProfitPursuitMinDamageHp || 0),
    combatEnabled: Boolean(config.combatEnabled),
    combatShootMinIntervalMs: Number(config.combatShootMinIntervalMs || 0),
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

function browserlessDailyFirstLoginDelayPlan(state, config = {}, nowMs = Date.now()) {
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (!isFirstBrowserlessLoginOfDay(state, nowValue)) return null;
  const delayAfterMidnightMs = Math.max(0, Number(config.dailyFirstLoginDelayMs ?? 120000));
  const notBeforeMs = browserlessDayStartMs(nowValue) + delayAfterMidnightMs;
  const delayMs = Math.max(0, notBeforeMs - nowValue);
  if (delayMs <= 0) return null;
  return {
    continue: true,
    reason: 'daily-first-login-delay',
    delayMs,
    previousRunId: '',
    error: 'daily-first-login-delay',
    safetyReason: '',
    notBeforeAt: new Date(notBeforeMs).toISOString()
  };
}

function preLoginSafetyLeadMs(config = {}) {
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

function persistedReconnectDelayPlan(state, config = {}, nowMs = Date.now()) {
  const action = state?.runner?.currentAction || {};
  const stats = state?.stats || {};
  const lastExit = stats.lastExit || {};
  const candidates = [
    action.nextRunAt,
    lastExit.nextRunAt
  ];
  let nextRunAtMs = 0;
  let nextRunAt = '';
  for (const candidate of candidates) {
    const parsed = parseIsoTimeMs(candidate);
    if (parsed > nextRunAtMs) {
      nextRunAtMs = parsed;
      nextRunAt = String(candidate || '');
    }
  }
  const nowValue = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const remainingMs = Math.max(0, nextRunAtMs - nowValue);
  if (remainingMs <= 0) return null;
  const maxDelayMs = Math.max(
    1000,
    Number(config.maxPersistedReconnectDelayMs || 0) || DAY_MS
  );
  if (remainingMs > maxDelayMs) return null;
  const reason = String(action.reason || lastExit.reason || 'persisted-reconnect-wait');
  return {
    continue: true,
    reason: reason || 'persisted-reconnect-wait',
    delayMs: remainingMs,
    previousRunId: action.previousRunId || '',
    error: reason || 'persisted-reconnect-wait',
    safetyReason: lastExit.reason || reason || '',
    nextRunAt,
    persisted: true
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
  const fastDelayMs = 1000;
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
      ? Math.max(delayMs, 60000, Number(minimumDelayMs || 0))
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
  if (fastRecoverableTransportReasons.has(safetyReason)) {
    return resumeFast(safetyReason);
  }
  if (/websocket unexpected response 403|http 403|not logged in/i.test(error) && snapshotSelfPresent) {
    return resumeFast('ws-auth-blocked-self-present');
  }
  if (safetyReason === 'direct-leave-failed' || canary?.safety?.leaveFailure) return resumeFast('direct-leave-failed');
  if (inferredStaminaExhaustion && (safetyReason === 'no-self' || error === 'no-self')) {
    return resume('stamina-exhausted-leave', inferredStaminaExhaustion.reloginDelayMs, {
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
      inferredStaminaExhaustion ? { staminaExhausted: inferredStaminaExhaustion } : null
    );
  }
  if ([
    'combat-action-settlement-stalled',
    'profit-live-snapshot-active-threat',
    'combat-critical-hp-leave',
    'combat-hp-disadvantage-leave',
    'combat-low-hp-disadvantage-leave',
    'recovery-low-hp-active-threat-leave',
    'injury-leave',
    'pursuit-leave'
  ].includes(safetyReason)) {
    return resume(safetyReason);
  }
  if (/^websocket connect timeout$/i.test(error)) return resumeFast('ws-connect-timeout');
  if (/^snapshot safety not confirmed:/i.test(error)) {
    if (inGameRecoveryEvidence) return resumeFast('in-game-snapshot-safety-retry');
    return resume('snapshot-safety-retry');
  }
  return resume(error || safetyReason || 'unknown-error');
}

function browserlessTerminalStopRequestsRuntimeClose(result, reason = '') {
  if (reason === 'restart-drain-ready') return true;
  const event = result?.event || result?.canary?.safety?.event || null;
  const source = String(event?.detail?.source || '');
  return reason === 'explicit-stop' && /^signal(?:-|$)/.test(source);
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
      && String(loopPlan.reason || '') === 'action-settlement-stalled'
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
    liveState = mergeState(base, { ...patch, updatedAt });
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
    if (liveState) patchLiveState({ runner: { restartDrain: publicStatus } }, { updatedAt });
    else updateState({ runner: { restartDrain: publicStatus } }, { updatedAt });
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
  const easyKillPlayerStatus = () => {
    easyKillPlayerTracker.expirePendingOutcomes?.(now());
    return easyKillPlayerTracker.status();
  };
  const chatSeedPlayers = [
    ...(highDropPlayerTracker.status?.(now())?.players || []),
    ...(easyKillPlayerTracker.status?.(now())?.players || []),
    ...(damagePlayerTracker.status?.(now())?.players || [])
  ];
  const chatService = deps.chatService || createChatService({
    now,
    getSelfUserId: () => config.userId,
    nameCacheFile: path.join(config.dataDir, 'chat-player-names.json'),
    backgroundIo,
    seedPlayers: chatSeedPlayers,
    onPollingDemandChange: () => snapshotGapPoller?.refreshSchedule?.()
  });
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
      easyKillEvidenceResult = easyKillPlayerTracker.observeKillEvidence?.(evidence, {
        atMs: observedAtMs,
        source: detail.source || 'snapshot',
        tick: payload?.tick
      }) || null;
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
  const lastHighDropSnapshotWasGlobal = Boolean(
    highDropStatusAtStart.lastSnapshotSource
      && highDropStatusAtStart.lastSnapshotSource !== 'ws'
  );
  snapshotGapPoller = deps.snapshotGapPoller || createSnapshotGapPoller({
    now,
    intervalMs: DEFAULT_CHAT_IDLE_INTERVAL_MS,
    minimumIntervalMs: DEFAULT_CHAT_ACTIVE_INTERVAL_MS,
    getIntervalMs: () => chatService.desiredSnapshotIntervalMs?.(now()) || DEFAULT_CHAT_IDLE_INTERVAL_MS,
    lastSnapshotAtMs: Number.isFinite(lastHighDropSnapshotAtMs) ? lastHighDropSnapshotAtMs : 0,
    globalIntervalMs: DEFAULT_SNAPSHOT_GAP_MS,
    lastGlobalSnapshotAtMs: lastHighDropSnapshotWasGlobal && Number.isFinite(lastHighDropSnapshotAtMs)
      ? lastHighDropSnapshotAtMs
      : 0,
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
    const plannedNextRunAtMs = now() + loopPlan.delayMs;
    const firstDailyLoginAtNextRun = isFirstBrowserlessLoginOfDay(currentBeforeWait, plannedNextRunAtMs);
    const shouldPrepareSnapshotSafety = Boolean(
      confirmedLeave
        || (!firstDailyLoginAtNextRun && (
          resetLoginPointForNextEntry
            || loopPlan.reason === 'snapshot-safety-retry'
        ))
    );
    const effectiveDelayMs = shouldPrepareSnapshotSafety
      ? Math.max(
          loopPlan.delayMs,
          preLoginSafetyLeadMs(config) + Number(confirmedLeave?.quarantineRemainingMs || 0)
        )
      : loopPlan.delayMs;
    const nextRunAtMs = now() + effectiveDelayMs;
    const nextRunAt = new Date(nextRunAtMs).toISOString();
    const waitDetail = {
      ...loopPlan,
      delayMs: effectiveDelayMs,
      nextRunAt,
      supervisorErrors: supervisorErrors.slice(-5)
    };
    updateState({
      runner: {
        running: true,
        mode: config.controlMode || 'read-only',
        lastError: '',
        currentAction: {
          kind: 'loop-wait',
          band: 'recover',
          reason: loopPlan.reason,
          delayMs: effectiveDelayMs,
          nextRunAt,
          previousRunId: loopPlan.previousRunId || ''
        },
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
        if (waitBeforeProbeMs > 0) await sleep(waitBeforeProbeMs);
        preparedSnapshotSafety = await (deps.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(
          config,
          readBrowserlessStateFile(stateFile),
          {
            now,
            sleep,
            fetchWithTimeout: sourceIpController.fetchWithTimeout,
            onSnapshotPayload: observeSnapshotPayload,
            onSnapshotSafety: recordSnapshotSafetyProgress,
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
          updateState({
            runner: {
              running: true,
              mode: config.controlMode || 'read-only',
              lastError: '',
              currentAction: {
                kind: 'loop-wait',
                band: 'recover',
                reason: 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                previousRunId: loopPlan.previousRunId || ''
              }
            },
            stats: browserlessStatsForOffline(currentBeforeResume, {
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
        if (remainingMs > 0) await sleep(remainingMs);
      } else {
        await restartDrain.wait(effectiveDelayMs, sleep);
      }
    } catch (err) {
      recordSupervisorError(err, { operation: 'loop-sleep', delayMs: effectiveDelayMs });
      logStore.append('runner', 'loop-sleep-error', { error: errorMessage(err), delayMs: effectiveDelayMs });
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
    const patch = {
      loginPointSafety: loginPointSafetyPatchFromSnapshot(snapshotSafety),
      ...(clearsConfirmedLeave ? { runner: { confirmedLeave: null } } : {})
    };
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
        : null
    });
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

  const buildStatusSource = compact => {
    const source = {
      ...(liveState || readBrowserlessStateFile(stateFile)),
      highDropPlayers: highDropPlayerTracker.status(now()),
      easyKillPlayers: easyKillPlayerStatus(),
      dailyDamagePlayers: damagePlayerTracker.status(now()),
      chat: chatService.status?.(now()) || null
    };
    return compact ? browserlessCompactStatusSource(source) : source;
  };
  const statusRenderConfig = {
    ...publicConfig(config),
    webToken: config.webToken ? 'present' : '',
    webVersion: BROWSERLESS_WEB_PANEL_VERSION
  };
  let fullStatusCacheText = '';
  let fullStatusCacheAtMs = 0;
  let fullStatusInFlight = null;
  const renderStatusTextNow = async compact => {
    const source = buildStatusSource(compact);
    if (backgroundIo?.renderStatus) {
      const rendered = await backgroundIo.renderStatus(source, statusRenderConfig, compact);
      return rendered.text;
    }
    const status = compact
      ? buildCompactBrowserlessStatus(source, statusRenderConfig)
      : {
          ...buildPublicBrowserlessStatus(source, statusRenderConfig),
          highDropPlayers: source.highDropPlayers,
          easyKillPlayers: source.easyKillPlayers,
          dailyDamagePlayers: source.dailyDamagePlayers,
          chat: source.chat
        };
    return JSON.stringify(status, null, 2);
  };
  const renderStatusText = compact => {
    if (compact) return renderStatusTextNow(true);
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
      statusHandle = await starter({
        host: config.statusHost,
        port: config.statusPort,
        webToken: config.webToken,
        getStatusText: () => renderStatusText(false),
        getCompactStatusText: () => renderStatusText(true),
        onMainThreadTask: (task, durationMs, detail = {}) => {
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
  updateState({ runner: { restartDrain: null } }, { updatedAt: new Date(now()).toISOString() });

  let persistedDelayPlan = !config.once && !config.dryRun
    ? persistedReconnectDelayPlan(readBrowserlessStateFile(stateFile), config, now())
    : null;
  let preservePersistedOnlineSession = false;
  if (persistedDelayPlan) {
    const persistedStateBeforeProbe = readBrowserlessStateFile(stateFile);
    const persistedConfirmedLeave = activeConfirmedLeaveState(persistedStateBeforeProbe, now());
    preservePersistedOnlineSession = preserveOnlineSessionForLoopWait(null, persistedDelayPlan)
      && !persistedConfirmedLeave;
    if (persistedConfirmedLeave?.quarantineRemainingMs > 0) {
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
          loginPointSafetySuccessRequired: 1,
          loginPointSafetyProbeIntervalMs: 0
        }, persistedStateBeforeProbe, {
          now,
          sleep,
          fetchWithTimeout: sourceIpController.fetchWithTimeout,
          onSnapshotPayload: observeSnapshotPayload,
          easyKillPlayerTracker,
          damagePlayerTracker
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
          updateState({
            runner: {
              running: true,
              mode: config.controlMode || 'read-only',
              lastError: '',
              currentAction: {
                kind: 'loop-wait',
                band: 'recover',
                reason: 'self-present-reentry',
                delayMs: 0,
                nextRunAt: '',
                previousRunId: persistedDelayPlan.previousRunId || '',
                persisted: true
              }
            },
            stats: preservePersistedOnlineSession
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
    updateState({
      runner: {
        running: true,
        mode: config.controlMode || 'read-only',
        lastError: '',
        currentAction: {
          kind: 'loop-wait',
          band: 'recover',
          reason: persistedDelayPlan.reason,
          delayMs: persistedDelayPlan.delayMs,
          nextRunAt: persistedDelayPlan.nextRunAt,
          previousRunId: persistedDelayPlan.previousRunId || '',
          persisted: true
        }
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
      await restartDrain.wait(persistedDelayPlan.delayMs, sleep);
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
    const dailyFirstLoginPlan = browserlessDailyFirstLoginDelayPlan(
      readBrowserlessStateFile(stateFile),
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
    try {
      const stateBeforeCanary = readBrowserlessStateFile(stateFile);
      liveState = stateBeforeCanary;
      const hasConfirmedLeaveRecovery = Boolean(activeConfirmedLeaveState(stateBeforeCanary, now()));
      const bypassPreLoginSafetyReason = !hasConfirmedLeaveRecovery && isFirstBrowserlessLoginOfDay(stateBeforeCanary, now())
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
        bypassPreLoginSafetyReason,
        precheckedSnapshotSafety,
        onSnapshotSafety: recordSnapshotSafetyProgress,
        onSnapshotPayload: observeSnapshotPayload,
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
          patchLiveState({
            ...decisionStatePatch(decision),
            stats: browserlessStatsForDecision(currentBeforeDecision, decision, { nowMs: now() })
          }, {
            updatedAt: new Date(now()).toISOString()
          });
        },
        onCombatControl: decision => {
          const currentBeforeDecision = liveState || stateBeforeCanary;
          patchLiveState({
            ...decisionStatePatch(decision),
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
    const result = { ok: Boolean(canary?.ok), mode: config.controlMode || 'read-only', canary: canary || null };
    const finalDecisionPatch = canary?.decisions?.last ? decisionStatePatch(canary.decisions.last) : {};
    const safetyEvents = [canary?.safety?.event, canary?.safety?.leaveFailure]
      .filter(Boolean)
      .map(event => ({
        ...event,
        runId: event.runId || canary?.runId || ''
      }));
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
        mode: config.controlMode || 'read-only',
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
    logStore.append('runner', result.ok ? 'runner-finish' : 'runner-stop', result);

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
      if (ownsBackgroundIo) await backgroundIo.close();
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
      readOnlyProbeMs: 1000,
      decisionIntervalMs: 1000,
      combatControlIntervalMs: 160,
      movementCommandIntervalMs: 500,
      frameGapAlertMs: 5000,
      wsTraceEnabled: true,
      wsTracePayload: false
    }, {
      now: () => nowMs,
      sleep: async ms => {
        const deadline = nowMs + Number(ms || 0);
        while (receiveFrame && frameIndex < frames.length && nowMs + 10 <= deadline) {
          nowMs += 10;
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
    return {
      ok: Boolean(
        result.ok
        && warmup?.ok
        && warmup?.iterations === 6
        && measuredFrameCount >= 40
        && Number(result.decisions?.realtimeControlCount || 0) > 0
        && frameCpuDurations.length === measuredFrameCount
        && cpuOverBudgetCount === 0
        && maxFrameCpuMs < SELF_TEST_MAIN_THREAD_BUDGET_MS
      ),
      budgetMs: SELF_TEST_MAIN_THREAD_BUDGET_MS,
      frameCount: measuredFrameCount,
      realtimeControlCount: Number(result.decisions?.realtimeControlCount || 0),
      maxFrameCpuMs: Math.round(maxFrameCpuMs * 1000) / 1000,
      cpuOverBudgetCount,
      maxFrameWallMs: Math.round(maxFrameMs * 1000) / 1000,
      wallOverBudgetCount,
      timingSource: currentMainThreadCpuMs() === null ? 'performance-now-fallback' : 'linux-main-thread-schedstat',
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
    const staleRestartDrainCleared = readBrowserlessStateFile(stateFilePath(liveConfig)).runner.restartDrain === null;
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
    const expectedRouteRows = 'route-a:1:1,route-b:0:2,route-c:0:3';
    const routeRowsText = rows => rows.map(row => `${row[0]}:${row[3]}:${row[4]}`).join(',');
    const nearbyCoinRoutePanelTest = {
      ok: routeRowsText(routeRowsWhenFirstMissing) === expectedRouteRows
        && routeRowsText(routeRowsWhenFirstPresent) === expectedRouteRows
        && new Set(routeRowsWhenFirstMissing.map(row => row[0])).size === routeRowsWhenFirstMissing.length
        && new Set(routeRowsWhenFirstPresent.map(row => row[0])).size === routeRowsWhenFirstPresent.length,
      missingFirst: routeRowsText(routeRowsWhenFirstMissing),
      presentFirst: routeRowsText(routeRowsWhenFirstPresent)
    };
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
        ),
        unauthorizedStatus: unauthorizedResponse.status,
        activityCount: chatActivityCount,
        sendInputs: chatSendInputs.slice(),
        webChatPanelPresent: pageHtml.includes('id="chatPanel"'),
        targetMarkerCoversOuterBorders,
        targetMarkerAvoidsAdjacentOverlap,
        targetMarkerBoundaryOwnership
      };
    } finally {
      await statusTestHandle.close();
    }
    const complexCombatMainThreadBudget = await runComplexCombatMainThreadBudgetSelfTest(tmp);
    const runnerLog = path.join(tmp, 'logs', '2026-07-08', 'runner.jsonl');
    const text = fs.readFileSync(runnerLog, 'utf8');
    return {
      ok: Boolean(
        dryRun.ok
        && liveRun.ok
        && staleRestartDrainCleared
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
        && forcedStatusConnectionsClosed
        && restartDrainCombat.ready === false
        && restartDrainIdle.ready === true
        && restartDrainStatus.ready === true
        && closedTransportAction.ok === false
        && closedTransportAction.transportClosed === true
        && chatService.ok
        && dynamicSnapshotPollerStatus.currentIntervalMs === DEFAULT_CHAT_ACTIVE_INTERVAL_MS
        && nearbyCoinRoutePanelTest.ok
        && statusServerChatTest.ok
        && complexCombatMainThreadBudget.ok
      ),
      dryRun,
      liveRun,
      staleRestartDrainCleared,
      wsClosedPlan,
      combatExitPlan,
      restartDrainPlan,
      restartDrainClosesRuntime,
      signalForceClosesRuntime,
      apiStopKeepsRuntime,
      forcedStatusConnectionsClosed,
      restartDrainStatus,
      closedTransportAction,
      chatService,
      dynamicSnapshotPollerStatus,
      nearbyCoinRoutePanelTest,
      statusServerChatTest,
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
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
};
