'use strict';

const fs = require('fs');
const path = require('path');
const { redactStructuredSecrets } = require('./session-client');
const {
  normalizeSourceIpPreflight,
  normalizeSourceIpRisk,
  uniqueIpv4
} = require('./source-ip-preflight');

const SCHEMA_VERSION = 1;
const KILL_ACCOUNTING_VERSION = 3;
const COIN_ACCOUNTING_VERSION = 4;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PICKED_COINS_PER_SELF_DROP = 2;
const DEFAULT_STAMINA_EXHAUSTED_THRESHOLD_MS = 1000;
const DEFAULT_STAMINA_RESET_GRACE_MS = 30000;
const RECENT_EXIT_MATCH_WINDOW_MS = 60000;
const RECENT_EXIT_COMBAT_ASSOCIATION_MAX_AGE_MS = 6000;
const HIGH_DROP_PANEL_THRESHOLD = 500;
const COMPACT_NEARBY_VERSION = 3;
const COMPACT_MAP_TRAILS_VERSION = 1;
const COMPACT_MAP_TRAILS_MAX_ITEMS = 161;
let stateWriteSequence = 0;

function defaultBrowserlessState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: '',
    session: {
      userId: 0,
      sessionToken: '',
      authenticated: false,
      tokenUpdatedAt: '',
      lastAuthUrl: '',
      lastAuthUrlAt: '',
      lastLoginSource: '',
      lastLoginSummary: null
    },
    runner: {
      running: false,
      mode: 'idle',
      readOnly: true,
      controlMode: 'read-only',
      canaryProfile: '',
      dryRun: true,
      combatEnabled: false,
      confirmedLeave: null,
      pendingExit: null,
      lastLoginAt: '',
      restartDrain: null,
      currentAction: null,
      lastRun: null,
      connectionFailure: null,
      remoteProfit: null,
      lastError: ''
    },
    probes: {
      lastSnapshotProbe: null,
      lastReadOnlyProbe: null
    },
    loginPointSafety: {
      ok: false,
      reason: 'unknown',
      point: null,
      checkedAt: '',
      detail: null
    },
    current: {
      self: null,
      stamina: null,
      profit: null,
      combatSummary: null,
      battlePresentation: null,
      decision: null,
      decisionState: null,
      action: null
    },
    mapTrails: null,
    lastKnown: null,
    recentExits: [],
    network: {
      sourceIp: '',
      sourceIps: [],
      sourceIpRisk: {},
      sourceIpPreflight: null,
      lifecycleSourceIps: [],
      lifecycleSourceIpIndex: 0,
      lifecyclePreparedAt: '',
      lastSelectedAt: '',
      lastSelectionReason: '',
      transportHealth: null
    },
    stats: defaultBrowserlessStats(),
    logs: {
      dataDir: '',
      logDir: '',
      stateFile: '',
      currentDayDir: ''
    }
  };
}

function defaultBrowserlessStats() {
  return {
    killAccountingVersion: KILL_ACCOUNTING_VERSION,
    coinAccountingVersion: COIN_ACCOUNTING_VERSION,
    currentSession: {
      online: false,
      sessionId: '',
      userId: 0,
      enteredAt: '',
      enteredTick: null,
      lastRealtimeTick: null,
      lastSeenAt: '',
      exitedAt: '',
      exitReason: '',
      baseDrop: null,
      lastDrop: null,
      coinsGained: 0,
      pickupObservedCoins: 0,
      dropCalibratedCoins: 0,
      coinPickupKeys: [],
      pendingCoinPickupCalibration: null,
      pendingDropCalibration: null,
      dropResetCount: 0,
      lastStamina1dRemaining: null,
      lastStamina1dLimit: null,
      staminaSpentMs: 0,
      killBaselineInitialized: false,
      killBaselineKeys: [],
      killKeys: [],
      kills: 0
    },
    today: {
      day: '',
      initialDrop: null,
      maxDrop: null,
      latestDrop: null,
      uptimeMs: 0,
      staminaSpentMs: 0,
      staminaSpentBeforeResetMs: 0,
      staminaResetCount: 0,
      lastStamina1dRemaining: null,
      lastStamina1dLimit: null,
      lastStamina1dObservedAt: '',
      coinsGained: 0,
      dropResetCount: 0,
      kills: 0,
      sessionCount: 0,
      activeSessionId: '',
      activeEnteredAt: '',
      activeBaseStaminaSpentMs: 0,
      activeBaseCoinsGained: 0,
      activeBaseKills: 0,
      crossDayDropPending: null
    },
    lastExit: {
      at: '',
      reason: '',
      runId: '',
      nextRunAt: '',
      reconnectDelayMs: null
    }
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shouldReplaceStatePath(pathKey) {
  return pathKey === 'runner.currentAction'
    || pathKey === 'runner.lastRun'
    || pathKey === 'runner.pendingExit'
    || pathKey === 'probes.lastSnapshotProbe'
    || pathKey === 'probes.lastReadOnlyProbe'
    || pathKey === 'loginPointSafety.detail'
    || pathKey === 'current.action'
    || pathKey === 'current.decision'
    || pathKey === 'current.decisionState'
    || pathKey === 'network.sourceIpRisk'
    || pathKey === 'network.sourceIpPreflight'
    || pathKey === 'network.transportHealth'
    || pathKey === 'lastKnown.self'
    || pathKey === 'lastKnown.stamina';
}

function shouldReplaceStateObject(pathParts) {
  return shouldReplaceStatePath(pathParts.join('.'));
}

function shouldReplaceLiveStatePath(pathKey) {
  return shouldReplaceStatePath(pathKey)
    || pathKey === 'current.combatSummary';
}

function mergeState(base, patch, pathParts = []) {
  const output = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch || {})) {
    const nextPath = [...pathParts, key];
    if (shouldReplaceStateObject(nextPath)) {
      output[key] = cloneJson(value);
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeState(output[key], value, nextPath);
    } else {
      output[key] = cloneJson(value);
    }
  }
  return output;
}

function mergeLiveState(base, patch, pathKey = '') {
  const output = isPlainObject(base) ? { ...base } : {};
  for (const key in (patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    const nextPath = pathKey ? `${pathKey}.${key}` : key;
    if (shouldReplaceLiveStatePath(nextPath)) {
      output[key] = value;
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeLiveState(output[key], value, nextPath);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function mergeLiveActionState(base, actionSnapshot, options = {}) {
  const currentBase = isPlainObject(base) ? base : {};
  const runnerBase = isPlainObject(currentBase.runner) ? currentBase.runner : {};
  const actionBase = isPlainObject(currentBase.current) ? currentBase.current : {};
  const current = {
    ...actionBase,
    action: actionSnapshot
  };
  if (Object.prototype.hasOwnProperty.call(options, 'battlePresentation')) {
    current.battlePresentation = options.battlePresentation;
  }
  return {
    ...currentBase,
    updatedAt: options.updatedAt || new Date().toISOString(),
    runner: {
      ...runnerBase,
      currentAction: actionSnapshot
    },
    current
  };
}

function stateFilePath(config) {
  if (config?.stateFile) return path.resolve(config.stateFile);
  return path.join(path.resolve(config?.dataDir || path.join(process.cwd(), 'data', 'browserless-runner')), 'state.json');
}

function readBrowserlessStateFile(file, fallback = null) {
  const base = fallback || defaultBrowserlessState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeBrowserlessState(mergeState(base, parsed), file);
  } catch (_) {
    return normalizeBrowserlessState(base, file);
  }
}

function writeBrowserlessStateFile(file, state) {
  const normalized = normalizeBrowserlessState(state, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  stateWriteSequence += 1;
  const temporary = `${file}.${process.pid}.${stateWriteSequence}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2) + '\n');
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch (_) {}
    throw error;
  }
  return normalized;
}

function updateBrowserlessStateFile(file, patch, options = {}) {
  const current = readBrowserlessStateFile(file);
  const updated = mergeState(current, {
    ...patch,
    updatedAt: options.updatedAt || new Date().toISOString()
  });
  return writeBrowserlessStateFile(file, updated);
}

function normalizeBrowserlessState(state, file = '') {
  const normalized = mergeState(defaultBrowserlessState(), state || {});
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.session.userId = Number(normalized.session.userId || 0);
  normalized.session.sessionToken = String(normalized.session.sessionToken || '');
  normalized.session.authenticated = Boolean(normalized.session.userId && normalized.session.sessionToken);
  normalized.runner.running = Boolean(normalized.runner.running);
  normalized.runner.readOnly = normalized.runner.readOnly !== false;
  normalized.runner.dryRun = normalized.runner.dryRun !== false;
  normalized.runner.pendingExit = normalized.runner.pendingExit && typeof normalized.runner.pendingExit === 'object'
    ? cloneJson(normalized.runner.pendingExit)
    : null;
  normalized.lastKnown = normalizeBrowserlessLastKnown(
    normalized.lastKnown,
    normalized.current,
    normalized.updatedAt
  );
  normalized.recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits.slice(-20) : [];
  normalized.stats = normalizeBrowserlessStats(normalized.stats, state?.stats);
  delete normalized.network.lastProbe;
  delete normalized.network.lastSwitch;
  delete normalized.network.sourceIpQuarantine;
  normalized.network.sourceIp = String(normalized.network.sourceIp || '');
  normalized.network.sourceIps = Array.isArray(normalized.network.sourceIps)
    ? normalized.network.sourceIps.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  normalized.network.sourceIpRisk = normalizeSourceIpRisk(normalized.network.sourceIpRisk);
  normalized.network.sourceIpPreflight = normalizeSourceIpPreflight(
    normalized.network.sourceIpPreflight,
    Object.keys(normalized.network.sourceIpRisk).length
  );
  normalized.network.lifecycleSourceIps = uniqueIpv4(normalized.network.lifecycleSourceIps).slice(0, 3);
  normalized.network.lifecycleSourceIpIndex = Math.min(
    Math.max(0, Math.round(Number(normalized.network.lifecycleSourceIpIndex || 0))),
    Math.max(0, normalized.network.lifecycleSourceIps.length - 1)
  );
  normalized.network.lifecyclePreparedAt = Number.isFinite(Date.parse(normalized.network.lifecyclePreparedAt || ''))
    ? String(normalized.network.lifecyclePreparedAt)
    : '';
  normalized.network.transportHealth = normalized.network.transportHealth
    && typeof normalized.network.transportHealth === 'object'
    ? cloneJson(normalized.network.transportHealth)
    : null;
  normalized.mapTrails = normalized.mapTrails && typeof normalized.mapTrails === 'object'
    ? cloneJson(normalized.mapTrails)
    : null;
  if (file) normalized.logs.stateFile = path.resolve(file);
  return normalized;
}

function loginPointFromAnyState(state) {
  const point = state?.loginPointSafety?.point
    || state?.current?.self
    || state?.lastSelfSummary
    || null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    hp: Number.isFinite(Number(point.hp)) ? Number(point.hp) : null,
    source: point.source || 'state'
  };
}

function sessionFromAnyState(state) {
  const userId = Number(state?.session?.userId || state?.userId || 0);
  const sessionToken = String(state?.session?.sessionToken || state?.sessionToken || '');
  return {
    userId: Number.isFinite(userId) ? userId : 0,
    sessionToken
  };
}

function browserlessPatchFromLegacyState(state, options = {}) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  const nowIso = options.updatedAt || new Date().toISOString();
  const patch = {};
  if (session.userId || session.sessionToken) {
    patch.session = {
      userId: session.userId,
      sessionToken: session.sessionToken,
      tokenUpdatedAt: state?.session?.tokenUpdatedAt || (session.sessionToken ? nowIso : '')
    };
  }
  if (loginPoint) {
    patch.loginPointSafety = {
      ok: Boolean(state?.loginPointSafety?.ok),
      reason: state?.loginPointSafety?.reason || 'imported-login-point-pending-snapshot-safety',
      point: {
        ...loginPoint,
        source: options.source || loginPoint.source || 'import'
      },
      checkedAt: state?.loginPointSafety?.checkedAt || ''
    };
    patch.current = {
      self: {
        ...loginPoint,
        name: state?.lastSelfSummary?.name || state?.current?.self?.name || ''
      }
    };
  }
  return patch;
}

function compactNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceIpRiskCount(network = {}) {
  const tableCount = Object.keys(normalizeSourceIpRisk(network.sourceIpRisk)).length;
  const projectedCount = compactNumber(network.sourceIpRiskCount);
  return Math.max(tableCount, projectedCount === null ? 0 : Math.max(0, Math.round(projectedCount)));
}

function compactSourceIpPreflight(network = {}) {
  const riskCount = sourceIpRiskCount(network);
  const preflight = normalizeSourceIpPreflight(network.sourceIpPreflight, riskCount);
  return {
    phase: compactString(preflight.phase, 48),
    reason: compactString(preflight.reason, 120),
    queuePhase: compactString(preflight.queuePhase, 32),
    startedAt: compactString(preflight.startedAt, 48),
    completedAt: compactString(preflight.completedAt, 48),
    elapsedMs: compactNumber(preflight.elapsedMs),
    discoveredCount: compactNumber(preflight.discoveredCount),
    ordinaryQueueCount: compactNumber(preflight.ordinaryQueueCount),
    riskQueueCount: compactNumber(preflight.riskQueueCount),
    testedCount: compactNumber(preflight.testedCount),
    requestCount: compactNumber(preflight.requestCount),
    currentIp: compactString(preflight.currentIp, 48),
    currentAttempt: compactNumber(preflight.currentAttempt),
    lastStatus: compactNumber(preflight.lastStatus),
    lastErrorCategory: compactString(preflight.lastErrorCategory, 48),
    availableIps: uniqueIpv4(preflight.availableIps).slice(0, 3),
    availableCount: compactNumber(preflight.availableCount),
    requiredCount: 3,
    riskCount: compactNumber(riskCount),
    nextRetryAt: compactString(preflight.nextRetryAt, 48),
    deferredForNextLoginPoint: Boolean(preflight.deferredForNextLoginPoint),
    deferredAt: compactString(preflight.deferredAt, 48),
    reuseWithoutRetest: Boolean(preflight.reuseWithoutRetest),
    reusedAt: compactString(preflight.reusedAt, 48)
  };
}

function compactSourceIpProbe(network = {}) {
  const probe = network.sourceIpProbe && typeof network.sourceIpProbe === 'object'
    ? network.sourceIpProbe
    : {};
  const lastRound = probe.lastRound && typeof probe.lastRound === 'object'
    ? probe.lastRound
    : null;
  return {
    inFlight: Boolean(probe.inFlight),
    nextRoundAt: compactString(probe.nextRoundAt, 48),
    lastRound: lastRound ? {
      ok: Boolean(lastRound.ok),
      roundStartedAt: compactString(lastRound.roundStartedAt, 48),
      roundCompletedAt: compactString(lastRound.roundCompletedAt, 48),
      elapsedMs: compactNumber(lastRound.elapsedMs),
      discoveredCount: compactNumber(lastRound.discoveredCount),
      requestCount: compactNumber(lastRound.requestCount),
      successCount: compactNumber(lastRound.successCount),
      failureCount: compactNumber(lastRound.failureCount),
      errorCategory: compactString(lastRound.errorCategory, 48)
    } : null
  };
}

function compactBoolean(value) {
  return value === null || value === undefined ? null : Boolean(value);
}

function compactString(value, maxLength = 160) {
  const text = String(value || '');
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '...' : text;
}

function compactRecoveryContact(value) {
  if (!value || typeof value !== 'object') return null;
  const evidence = value.evidence && typeof value.evidence === 'object'
    ? value.evidence
    : {};
  if (!Object.keys(evidence).length && !Object.keys(value).length) return null;
  return {
    retained: compactBoolean(value.retained),
    evidence: {
      trigger: compactString(evidence.trigger, 48),
      firing: compactBoolean(evidence.firing),
      realBullet: compactBoolean(evidence.realBullet),
      inRange: compactBoolean(evidence.inRange),
      directClosing: compactBoolean(evidence.directClosing),
      velocityDirect: compactBoolean(evidence.velocityDirect),
      historyDirect: compactBoolean(evidence.historyDirect),
      closingSpeed: compactNumber(evidence.closingSpeed),
      closingAlignment: compactNumber(evidence.closingAlignment),
      closingConfirmations: compactNumber(evidence.closingConfirmations),
      confirmationsRequired: compactNumber(evidence.confirmationsRequired),
      selfHp: compactNumber(evidence.selfHp),
      lowHpThreshold: compactNumber(evidence.lowHpThreshold)
    }
  };
}

function compactTransportHealth(value) {
  if (!value || typeof value !== 'object') return null;
  const activity = value.activity && typeof value.activity === 'object' ? value.activity : {};
  const latency = value.latency && typeof value.latency === 'object' ? value.latency : {};
  const processingQueue = value.processingQueue && typeof value.processingQueue === 'object'
    ? value.processingQueue
    : {};
  const frameLoss = value.frameLoss && typeof value.frameLoss === 'object' ? value.frameLoss : {};
  const command = value.command && typeof value.command === 'object' ? value.command : {};
  const frames = value.frames && typeof value.frames === 'object' ? value.frames : {};
  const exit = value.exit && typeof value.exit === 'object' ? value.exit : {};
  return {
    enabled: value.enabled !== false,
    connected: Boolean(value.connected),
    mode: compactString(value.mode, 24),
    modeLabel: compactString(value.modeLabel, 32),
    connectedAt: compactString(value.connectedAt, 48),
    activity: {
      activeEvidence: Boolean(activity.activeEvidence),
      reasons: Array.isArray(activity.reasons)
        ? activity.reasons.map(reason => compactString(reason, 40)).filter(Boolean).slice(0, 12)
        : [],
      evidenceAt: compactString(activity.evidenceAt, 48),
      activeSince: compactString(activity.activeSince, 48),
      warmupRemainingMs: compactNumber(activity.warmupRemainingMs),
      holdRemainingMs: compactNumber(activity.holdRemainingMs),
      decisionKind: compactString(activity.decisionKind, 64),
      decisionBand: compactString(activity.decisionBand, 32)
    },
    latency: {
      source: compactString(latency.source, 64),
      currentMs: compactNumber(latency.currentMs),
      p90Ms: compactNumber(latency.p90Ms),
      sampleCount: compactNumber(latency.sampleCount),
      decisionWindowMs: compactNumber(latency.decisionWindowMs),
      exitThresholdMs: compactNumber(latency.exitThresholdMs),
      exitSustainMs: compactNumber(latency.exitSustainMs)
    },
    processingQueue: {
      currentMs: compactNumber(processingQueue.currentMs),
      p90Ms: compactNumber(processingQueue.p90Ms),
      sampleCount: compactNumber(processingQueue.sampleCount),
      windowMs: compactNumber(processingQueue.windowMs)
    },
    frameLoss: {
      source: compactString(frameLoss.source, 64),
      rate: compactNumber(frameLoss.rate),
      percent: compactNumber(frameLoss.percent),
      missingTicks: compactNumber(frameLoss.missingTicks),
      expectedTicks: compactNumber(frameLoss.expectedTicks),
      sampleCount: compactNumber(frameLoss.sampleCount),
      windowMs: compactNumber(frameLoss.windowMs),
      exitRate: compactNumber(frameLoss.exitRate),
      exitPercent: compactNumber(frameLoss.exitPercent),
      exitSustainMs: compactNumber(frameLoss.exitSustainMs),
      minimumExpectedTicks: compactNumber(frameLoss.minimumExpectedTicks)
    },
    command: {
      movementP90Ms: compactNumber(command.movementP90Ms),
      movementSampleCount: compactNumber(command.movementSampleCount),
      movementSource: compactString(command.movementSource, 80),
      shootingAckP90Ms: compactNumber(command.shootingAckP90Ms),
      shootingAckSampleCount: compactNumber(command.shootingAckSampleCount)
    },
    frames: {
      count: compactNumber(frames.count),
      lastAt: compactString(frames.lastAt, 48),
      lastAgeMs: compactNumber(frames.lastAgeMs),
      lastType: compactString(frames.lastType, 24),
      lastTick: compactNumber(frames.lastTick),
      duplicateTickCount: compactNumber(frames.duplicateTickCount),
      outOfOrderTickCount: compactNumber(frames.outOfOrderTickCount),
      tickResetCount: compactNumber(frames.tickResetCount)
    },
    exit: {
      hostilePressure: Boolean(exit.hostilePressure),
      latencyBreached: Boolean(exit.latencyBreached),
      latencyBreachForMs: compactNumber(exit.latencyBreachForMs),
      latencyTriggered: Boolean(exit.latencyTriggered),
      frameLossBreached: Boolean(exit.frameLossBreached),
      frameLossBreachForMs: compactNumber(exit.frameLossBreachForMs),
      frameLossTriggered: Boolean(exit.frameLossTriggered),
      triggered: Boolean(exit.triggered),
      failureModes: Array.isArray(exit.failureModes)
        ? exit.failureModes.map(mode => compactString(mode, 40)).filter(Boolean).slice(0, 4)
        : []
    }
  };
}

function parseTimeMs(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoFromMs(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : '';
}

function eventTimeMs(value, fallbackMs = Date.now()) {
  const parsed = parseTimeMs(value);
  if (parsed > 0) return parsed;
  const fallback = Number(fallbackMs);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Date.now();
}

function browserlessStatsDayKey(ms) {
  return new Date(eventTimeMs(ms, Date.now()) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function browserlessStatsDayStartMs(dayKey) {
  const parsed = Date.parse(String(dayKey || '') + 'T00:00:00.000Z');
  return Number.isFinite(parsed) ? parsed - UTC8_OFFSET_MS : 0;
}

function nextDailyStaminaResetAt(ms = Date.now()) {
  return Math.floor((Number(ms) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS + DAY_MS;
}

function compactDailyFirstLoginNotBeforeMs(stats, config = {}, candidateMs = 0) {
  const nextRunAtMs = Number(candidateMs);
  if (!Number.isFinite(nextRunAtMs) || nextRunAtMs <= 0) return 0;
  const session = stats?.currentSession || {};
  if (session.online) return 0;
  const candidateDay = browserlessStatsDayKey(nextRunAtMs);
  const today = stats?.today || {};
  if (String(today.day || '') === candidateDay && Math.max(0, Number(today.sessionCount || 0)) > 0) {
    return 0;
  }
  const delayAfterMidnightMs = Math.max(0, Number(config.dailyFirstLoginDelayMs ?? 30000));
  return browserlessStatsDayStartMs(candidateDay) + delayAfterMidnightMs;
}

function normalizeSessionCoinPickupKeys(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => ({
      key: compactString(item?.key, 160),
      at: compactNumber(item?.at),
      amount: Math.max(0, Math.round(Number(item?.amount || 0) || 0))
    }))
    .filter(item => item.key && item.at !== null && item.amount > 0)
    .slice(-300);
}

function normalizePendingCoinCalibration(value) {
  if (!value || typeof value !== 'object') return null;
  const amount = Math.max(0, Math.round(Number(value.amount || 0) || 0));
  const at = compactNumber(value.at);
  if (!(amount > 0) || at === null) return null;
  return {
    amount,
    at,
    startedAt: compactNumber(value.startedAt) ?? at,
    previousCoinsGained: Math.max(0, Math.round(Number(value.previousCoinsGained || 0) || 0)),
    previousCalibratedCoins: Math.max(0, Math.round(Number(value.previousCalibratedCoins || 0) || 0))
  };
}

function normalizeCrossDayDropPending(value) {
  if (!value || typeof value !== 'object') return null;
  const sessionId = compactString(value.sessionId, 96);
  const previousDrop = compactNumber(value.previousDrop);
  const previousTick = compactNumber(value.previousTick);
  if (!sessionId || (previousDrop === null && previousTick === null)) return null;
  return { sessionId, previousDrop, previousTick };
}

function normalizeBrowserlessStats(stats, rawStats = stats) {
  const inputKillAccountingVersion = Number(rawStats?.killAccountingVersion || 0);
  const inputCoinAccountingVersion = Number(rawStats?.coinAccountingVersion || 0);
  const resetUntrustedKills = inputKillAccountingVersion !== KILL_ACCOUNTING_VERSION;
  const migrateLegacyCoins = inputCoinAccountingVersion < 2;
  const normalized = mergeState(defaultBrowserlessStats(), stats || {});
  const session = normalized.currentSession || {};
  const today = normalized.today || {};
  const lastExit = normalized.lastExit || {};
  const enteredTick = resetUntrustedKills ? null : compactNumber(session.enteredTick);
  const lastRealtimeTick = compactNumber(session.lastRealtimeTick);
  const killBaselineKeys = resetUntrustedKills
    ? []
    : (Array.isArray(session.killBaselineKeys)
        ? session.killBaselineKeys.map(item => compactString(item, 120)).filter(Boolean).slice(-300)
        : []);
  const killKeys = resetUntrustedKills
    ? []
    : normalizeSessionKillKeys(session.killKeys, {
        ...session,
        enteredTick,
        killBaselineKeys
      });
  const coinMultiplier = migrateLegacyCoins ? PICKED_COINS_PER_SELF_DROP : 1;
  const sessionBaseDrop = compactNumber(session.baseDrop);
  const sessionLastDrop = compactNumber(session.lastDrop);
  const migratedSessionDropFloor = inputCoinAccountingVersion < COIN_ACCOUNTING_VERSION
    && sessionBaseDrop !== null
    && sessionLastDrop !== null
    && sessionLastDrop >= sessionBaseDrop
    ? Math.max(0, Math.round((sessionLastDrop - sessionBaseDrop) * PICKED_COINS_PER_SELF_DROP))
    : 0;
  const sessionDropCalibratedCoins = Math.max(
    0,
    Math.round(Number(session.dropCalibratedCoins || 0) * coinMultiplier || 0),
    migratedSessionDropFloor
  );
  const sessionCoinsGained = Math.max(
    0,
    Math.round(Number(session.coinsGained || 0) * coinMultiplier || 0),
    sessionDropCalibratedCoins
  );
  const todayInitialDrop = compactNumber(today.initialDrop);
  const todayLatestDrop = compactNumber(today.latestDrop ?? today.maxDrop);
  const migratedTodayDropFloor = inputCoinAccountingVersion < COIN_ACCOUNTING_VERSION
    && todayInitialDrop !== null
    && todayLatestDrop !== null
    ? Math.max(0, Math.round((todayLatestDrop - todayInitialDrop) * PICKED_COINS_PER_SELF_DROP))
    : 0;
  const todayCoinsGained = Math.max(
    0,
    Math.round(Number(today.coinsGained || 0) * coinMultiplier || 0),
    migratedTodayDropFloor
  );
  const activeBaseCoinsGained = Math.max(0, Math.round(Number(today.activeBaseCoinsGained || 0) * coinMultiplier || 0));
  normalized.killAccountingVersion = KILL_ACCOUNTING_VERSION;
  normalized.coinAccountingVersion = COIN_ACCOUNTING_VERSION;
  normalized.currentSession = {
    ...session,
    online: Boolean(session.online),
    sessionId: compactString(session.sessionId, 96),
    userId: compactNumber(session.userId) || 0,
    enteredAt: compactString(session.enteredAt, 48),
    enteredTick,
    lastRealtimeTick,
    lastSeenAt: compactString(session.lastSeenAt, 48),
    exitedAt: compactString(session.exitedAt, 48),
    exitReason: compactString(session.exitReason, 160),
    baseDrop: sessionBaseDrop,
    lastDrop: sessionLastDrop,
    coinsGained: sessionCoinsGained,
    pickupObservedCoins: migrateLegacyCoins
      ? sessionCoinsGained
      : Math.max(0, Math.round(Number(session.pickupObservedCoins || 0) || 0)),
    dropCalibratedCoins: sessionDropCalibratedCoins,
    coinPickupKeys: normalizeSessionCoinPickupKeys(session.coinPickupKeys),
    pendingCoinPickupCalibration: normalizePendingCoinCalibration(session.pendingCoinPickupCalibration),
    pendingDropCalibration: normalizePendingCoinCalibration(session.pendingDropCalibration),
    dropResetCount: Math.max(0, Math.round(Number(session.dropResetCount || 0) || 0)),
    lastStamina1dRemaining: compactNumber(session.lastStamina1dRemaining),
    lastStamina1dLimit: compactNumber(session.lastStamina1dLimit),
    staminaSpentMs: Math.max(0, Math.round(Number(session.staminaSpentMs || 0) || 0)),
    killBaselineInitialized: resetUntrustedKills ? false : Boolean(session.killBaselineInitialized),
    killBaselineKeys,
    killKeys,
    kills: killKeys.length
  };
  normalized.today = {
    ...today,
    day: compactString(today.day, 16),
    initialDrop: compactNumber(today.initialDrop),
    maxDrop: compactNumber(today.maxDrop),
    latestDrop: compactNumber(today.latestDrop),
    uptimeMs: Math.max(0, Math.round(Number(today.uptimeMs || 0) || 0)),
    staminaSpentMs: Math.max(0, Math.round(Number(today.staminaSpentMs || 0) || 0)),
    staminaSpentBeforeResetMs: Math.max(0, Math.round(Number(today.staminaSpentBeforeResetMs || 0) || 0)),
    staminaResetCount: Math.max(0, Math.round(Number(today.staminaResetCount || 0) || 0)),
    lastStamina1dRemaining: compactNumber(today.lastStamina1dRemaining),
    lastStamina1dLimit: compactNumber(today.lastStamina1dLimit),
    lastStamina1dObservedAt: compactString(today.lastStamina1dObservedAt, 48),
    coinsGained: todayCoinsGained,
    dropResetCount: Math.max(0, Math.round(Number(today.dropResetCount || 0) || 0)),
    kills: resetUntrustedKills ? 0 : Math.max(0, Math.round(Number(today.kills || 0) || 0)),
    sessionCount: Math.max(0, Math.round(Number(today.sessionCount || 0) || 0)),
    activeSessionId: compactString(today.activeSessionId, 96),
    activeEnteredAt: compactString(today.activeEnteredAt, 48),
    activeBaseStaminaSpentMs: Math.max(0, Math.round(Number(today.activeBaseStaminaSpentMs || 0) || 0)),
    activeBaseCoinsGained,
    activeBaseKills: resetUntrustedKills ? 0 : Math.max(0, Math.round(Number(today.activeBaseKills || 0) || 0)),
    crossDayDropPending: normalizeCrossDayDropPending(today.crossDayDropPending)
  };
  normalized.lastExit = {
    at: compactString(lastExit.at, 48),
    reason: compactString(lastExit.reason, 160),
    runId: compactString(lastExit.runId, 96),
    nextRunAt: compactString(lastExit.nextRunAt, 48),
    reconnectDelayMs: compactNumber(lastExit.reconnectDelayMs)
  };
  return normalized;
}

function browserlessStatsReadyForLiveUpdate(stats) {
  return Boolean(
    stats
      && Number(stats.killAccountingVersion) === KILL_ACCOUNTING_VERSION
      && Number(stats.coinAccountingVersion) === COIN_ACCOUNTING_VERSION
      && isPlainObject(stats.currentSession)
      && isPlainObject(stats.today)
      && isPlainObject(stats.lastExit)
      && Array.isArray(stats.currentSession.killBaselineKeys)
      && Array.isArray(stats.currentSession.killKeys)
      && Array.isArray(stats.currentSession.coinPickupKeys)
  );
}

function browserlessSnapshotSafetyCheckInFlight(action = {}) {
  const kind = String(action?.kind || '');
  const reason = String(action?.reason || '');
  const nextRunAt = String(action?.nextRunAt || '');
  if (kind === 'snapshot-wait') return true;
  if (/source-ip-.*snapshot-safety-wait/i.test(reason)) return true;
  if (nextRunAt) return false;
  return /pending-snapshot-safety/i.test(reason)
    || (kind === 'loop-wait' && /snapshot-safety/i.test(reason));
}

function cloneBrowserlessStatsForLiveUpdate(stats) {
  return {
    ...stats,
    currentSession: { ...stats.currentSession },
    today: {
      ...stats.today,
      crossDayDropPending: stats.today.crossDayDropPending
        ? { ...stats.today.crossDayDropPending }
        : null
    },
    lastExit: { ...stats.lastExit }
  };
}

function resetBrowserlessTodayStats(day) {
  return {
    ...defaultBrowserlessStats().today,
    day
  };
}

function ensureBrowserlessStatsDay(stats, nowMs) {
  const day = browserlessStatsDayKey(nowMs);
  if (stats.today.day === day) return stats;
  const session = stats.currentSession || {};
  const crossDayDropPending = session.online && session.sessionId
    && (compactNumber(session.lastDrop) !== null || compactNumber(session.lastRealtimeTick) !== null)
    ? {
        sessionId: session.sessionId,
        previousDrop: compactNumber(session.lastDrop),
        previousTick: compactNumber(session.lastRealtimeTick)
      }
    : null;
  stats.today = resetBrowserlessTodayStats(day);
  stats.today.crossDayDropPending = crossDayDropPending;
  if (session.online && session.sessionId) {
    stats.today.activeSessionId = session.sessionId;
    stats.today.activeEnteredAt = isoFromMs(Math.max(eventTimeMs(nowMs), browserlessStatsDayStartMs(day)));
    stats.today.activeBaseStaminaSpentMs = Math.max(0, Number(session.staminaSpentMs || 0) || 0);
    stats.today.activeBaseCoinsGained = Math.max(0, Number(session.coinsGained || 0) || 0);
    stats.today.activeBaseKills = Math.max(0, Number(session.kills || 0) || 0);
  }
  return stats;
}

function statsSelfDrop(self) {
  if (self?.dropKnown === false) return null;
  return compactNumber(self?.drop ?? self?.death_drop_coins ?? self?.coinsGained);
}

function pickedCoinsFromStatsValue(value) {
  const pickedCoins = compactNumber(value);
  if (pickedCoins === null) return null;
  return Math.max(0, Math.round(pickedCoins));
}

function statsSelfUserId(self, state) {
  return compactNumber(self?.userId ?? self?.user_id ?? state?.session?.userId);
}

function statsStamina1dRemaining(stamina, self) {
  return compactNumber(
    stamina?.stamina1dRemainingMilli
      ?? stamina?.remaining1d
      ?? stamina?.stamina1d
      ?? self?.stamina1dRemainingMilli
      ?? self?.stamina_1d_remaining_milli
      ?? self?.stamina1d
  );
}

function statsStamina1dLimit(stamina, self) {
  return compactNumber(
    stamina?.stamina1dLimitMilli
      ?? stamina?.stamina1dLimitMs
      ?? stamina?.stamina1dLimit
      ?? stamina?.limit1d
      ?? self?.stamina1dLimitMilli
      ?? self?.stamina_1d_limit_milli
      ?? self?.stamina1dLimit
      ?? self?.stamina_1d_limit
  );
}

function actualBrowserlessDailyStaminaSpentMs(stats) {
  const today = stats?.today || {};
  const observedAt = parseTimeMs(today.lastStamina1dObservedAt);
  if (!today.day || !observedAt || browserlessStatsDayKey(observedAt) !== today.day) return null;
  const remaining = compactNumber(today.lastStamina1dRemaining);
  const limit = compactNumber(today.lastStamina1dLimit);
  if (remaining === null || limit === null || limit <= 0) return null;
  const spentBeforeReset = Math.max(0, Number(today.staminaSpentBeforeResetMs || 0) || 0);
  return Math.max(0, Math.round(spentBeforeReset + limit - remaining));
}

function statsKillKey(item) {
  const target = item?.targetUserId ?? item?.target_user_id ?? item?.targetId ?? item?.userId ?? item?.user_id ?? item?.id;
  const tick = statsKillTick(item);
  if (target === null || target === undefined || target === '') return '';
  return 'self-kill:' + String(target) + ':' + String(tick || 'unknown');
}

function statsKillTick(item) {
  return compactNumber(item?.tick ?? item?.createdTick ?? item?.created_tick);
}

function statsKillTickFromKey(key) {
  const match = /^self-kill:[^:]+:(.+)$/.exec(String(key || ''));
  if (!match || match[1] === 'unknown') return null;
  return compactNumber(match[1]);
}

function normalizeSessionKillKeys(keys, session) {
  if (!Array.isArray(keys)) return [];
  const baseline = new Set(Array.isArray(session?.killBaselineKeys) ? session.killBaselineKeys : []);
  const enteredTick = compactNumber(session?.enteredTick);
  const output = [];
  const seen = new Set();
  for (const rawKey of keys) {
    const key = compactString(rawKey, 120);
    if (!key || seen.has(key) || baseline.has(key)) continue;
    const tick = statsKillTickFromKey(key);
    if (enteredTick !== null) {
      if (tick === null || tick < enteredTick) continue;
    }
    seen.add(key);
    output.push(key);
  }
  return output.slice(-1000);
}

function statsDecisionTick(decision) {
  return compactNumber(decision?.input?.realtime?.tick ?? decision?.tick ?? decision?.input?.fallback?.tick);
}

function statsKillEvidenceFromDecision(decision) {
  const evidence = Array.isArray(decision?.input?.selfKillEvidence) ? decision.input.selfKillEvidence : [];
  if (!evidence.length) return [];
  return evidence
    .map(item => ({
      key: statsKillKey(item),
      tick: statsKillTick(item)
    }))
    .filter(item => item.key);
}

function statsCoinPickupEvidenceFromDecision(decision, nowMs = Date.now()) {
  const evidence = Array.isArray(decision?.input?.coinPickups) ? decision.input.coinPickups : [];
  if (!evidence.length) return [];
  return evidence
    .map(item => ({
      key: compactString(item?.key, 160),
      amount: Math.max(0, Math.round(Number(item?.amount || 0) || 0)),
      at: eventTimeMs(item?.at, nowMs)
    }))
    .filter(item => item.key && item.amount > 0 && item.at > 0);
}

function ensureSessionKillBaseline(session, decision) {
  const evidence = statsKillEvidenceFromDecision(decision);
  const decisionTick = statsDecisionTick(decision);
  if (session.enteredTick === null && decisionTick !== null) session.enteredTick = decisionTick;
  if (!session.killBaselineInitialized) {
    const baseline = new Set(Array.isArray(session.killBaselineKeys) ? session.killBaselineKeys : []);
    for (const item of evidence) baseline.add(item.key);
    session.killBaselineKeys = Array.from(baseline).slice(-300);
    session.killBaselineInitialized = true;
  }
  return evidence;
}

function startBrowserlessStatsSession(stats, state, self, stamina, nowMs, decision = null) {
  const userId = statsSelfUserId(self, state) || 0;
  const enteredAt = isoFromMs(nowMs);
  const sessionId = `${userId || 'user'}:${enteredAt}`;
  const drop = statsSelfDrop(self);
  const stamina1d = statsStamina1dRemaining(stamina, self);
  const stamina1dLimit = statsStamina1dLimit(stamina, self);
  const killEvidence = statsKillEvidenceFromDecision(decision);
  stats.currentSession = {
    ...defaultBrowserlessStats().currentSession,
    online: true,
    sessionId,
    userId,
    enteredAt,
    enteredTick: statsDecisionTick(decision),
    lastRealtimeTick: statsDecisionTick(decision),
    lastSeenAt: enteredAt,
    baseDrop: drop,
    lastDrop: drop,
    lastStamina1dRemaining: stamina1d,
    lastStamina1dLimit: stamina1dLimit,
    killBaselineInitialized: true,
    killBaselineKeys: killEvidence.map(item => item.key).slice(-300)
  };
  stats.today.crossDayDropPending = null;
  stats.today.activeSessionId = sessionId;
  stats.today.activeEnteredAt = enteredAt;
  stats.today.activeBaseStaminaSpentMs = 0;
  stats.today.activeBaseCoinsGained = 0;
  stats.today.activeBaseKills = 0;
  return stats.currentSession;
}

function updateBrowserlessStatsSessionStamina(stats, session, stamina, self, nowMs = Date.now()) {
  const stamina1d = statsStamina1dRemaining(stamina, self);
  const stamina1dLimit = statsStamina1dLimit(stamina, self);
  const previousStamina = compactNumber(session.lastStamina1dRemaining);
  if (stamina1d !== null) {
    if (previousStamina !== null && stamina1d < previousStamina) {
      const previousSpent = Math.max(0, Number(session.staminaSpentMs || 0) || 0);
      session.staminaSpentMs = Math.max(0, Math.round(previousSpent + previousStamina - stamina1d));
    }
    session.lastStamina1dRemaining = stamina1d;
  }
  if (stamina1dLimit !== null && stamina1dLimit > 0) session.lastStamina1dLimit = stamina1dLimit;
  if (stamina1d !== null) {
    const today = stats.today || (stats.today = resetBrowserlessTodayStats(browserlessStatsDayKey(nowMs)));
    const previousDailyStamina = compactNumber(today.lastStamina1dRemaining);
    const previousDailyLimit = compactNumber(today.lastStamina1dLimit);
    const effectiveLimit = stamina1dLimit !== null && stamina1dLimit > 0
      ? stamina1dLimit
      : previousDailyLimit;
    const fullDailyRefill = previousDailyStamina !== null
      && effectiveLimit !== null
      && effectiveLimit > 0
      && stamina1d > previousDailyStamina
      && stamina1d >= effectiveLimit;
    if (fullDailyRefill) {
      const completedSegmentLimit = previousDailyLimit !== null && previousDailyLimit > 0
        ? previousDailyLimit
        : effectiveLimit;
      today.staminaSpentBeforeResetMs = Math.max(0, Math.round(
        Number(today.staminaSpentBeforeResetMs || 0)
          + Math.max(0, completedSegmentLimit - previousDailyStamina)
      ));
      today.staminaResetCount = Math.max(0, Math.round(Number(today.staminaResetCount || 0) + 1));
    }
    today.lastStamina1dRemaining = stamina1d;
    if (effectiveLimit !== null && effectiveLimit > 0) today.lastStamina1dLimit = effectiveLimit;
    today.lastStamina1dObservedAt = isoFromMs(nowMs);
  }
  return stamina1d !== null;
}

function updateBrowserlessStatsSessionDrop(session, self) {
  const drop = statsSelfDrop(self);
  if (drop === null) return false;
  const previousDrop = compactNumber(session.lastDrop);
  if (previousDrop === null) {
    if (session.baseDrop === null) session.baseDrop = drop;
    session.lastDrop = drop;
    return true;
  }
  if (drop >= previousDrop) {
    session.dropCalibratedCoins = Math.max(0, Math.round(
      Number(session.dropCalibratedCoins || 0)
        + (drop - previousDrop) * PICKED_COINS_PER_SELF_DROP
    ));
    session.coinsGained = Math.max(
      Math.max(0, Math.round(Number(session.coinsGained || 0) || 0)),
      session.dropCalibratedCoins
    );
  } else {
    session.baseDrop = drop;
    session.dropResetCount = Math.max(0, Math.round(Number(session.dropResetCount || 0) + 1));
  }
  session.lastDrop = drop;
  return true;
}

function resetBrowserlessSessionDropBaseline(session, self) {
  const drop = statsSelfDrop(self);
  if (drop === null) return false;
  session.baseDrop = drop;
  session.lastDrop = drop;
  session.pendingCoinPickupCalibration = null;
  session.pendingDropCalibration = null;
  return true;
}

function sessionCoinUpperBound(session) {
  const calibrated = Math.max(0, Math.round(Number(session?.dropCalibratedCoins || 0) || 0));
  const hasDropObservation = compactNumber(session?.lastDrop) !== null
    || compactNumber(session?.baseDrop) !== null;
  if (!hasDropObservation) return null;
  const lifecycleAllowance = Math.max(1, Math.round(Number(session?.dropResetCount || 0) || 0) + 1);
  return calibrated + lifecycleAllowance;
}

function updateBrowserlessStatsSessionCoinPickups(session, decision, nowMs, previousCoinsGained = null, dropTransition = {}) {
  const memoryMs = 60000;
  const duplicateWindowMs = 5000;
  const rawPickupEvidence = Array.isArray(decision?.input?.coinPickups) ? decision.input.coinPickups : [];
  const existingPickupKeys = Array.isArray(session.coinPickupKeys) ? session.coinPickupKeys : [];
  let expiredPickupKey = false;
  for (const item of existingPickupKeys) {
    if (nowMs - Number(item?.at || 0) <= memoryMs) continue;
    expiredPickupKey = true;
    break;
  }
  const pickupKeys = rawPickupEvidence.length || expiredPickupKey
    ? normalizeSessionCoinPickupKeys(existingPickupKeys)
      .filter(item => nowMs - Number(item.at || 0) <= memoryMs)
    : existingPickupKeys;
  let added = 0;
  const pickupEvidence = rawPickupEvidence.length
    ? statsCoinPickupEvidenceFromDecision(decision, nowMs)
    : [];
  for (const pickup of pickupEvidence) {
    const duplicate = pickupKeys.some(item => item.key === pickup.key
      && Math.abs(Number(item.at || 0) - pickup.at) <= duplicateWindowMs);
    if (duplicate) continue;
    pickupKeys.push(pickup);
    added += pickup.amount;
  }
  session.coinPickupKeys = pickupKeys.length > 300 ? pickupKeys.slice(-300) : pickupKeys;
  const dropCalibrationAdded = Math.max(0, Math.round(Number(dropTransition.added || 0) || 0));
  const previousDropCalibratedCoins = Math.max(
    0,
    Math.round(Number(dropTransition.previousCalibratedCoins || 0) || 0)
  );
  const calibrationMemoryMs = 5000;
  const freshPending = value => {
    const normalized = normalizePendingCoinCalibration(value);
    return normalized && nowMs - normalized.at <= calibrationMemoryMs ? normalized : null;
  };
  const mergePending = (earlier, later) => {
    if (!earlier) return later;
    if (!later) return earlier;
    return {
      amount: earlier.amount + later.amount,
      at: Math.max(earlier.at, later.at),
      startedAt: Math.min(earlier.startedAt, later.startedAt),
      previousCoinsGained: earlier.startedAt <= later.startedAt
        ? earlier.previousCoinsGained
        : later.previousCoinsGained,
      previousCalibratedCoins: earlier.startedAt <= later.startedAt
        ? earlier.previousCalibratedCoins
        : later.previousCalibratedCoins
    };
  };
  const currentPickup = added > 0 ? {
    amount: added,
    at: nowMs,
    startedAt: nowMs,
    previousCoinsGained: previousCoinsGained === null
      ? Math.max(0, Math.round(Number(session.coinsGained || 0) || 0))
      : Math.max(0, Math.round(Number(previousCoinsGained) || 0)),
    previousCalibratedCoins: previousDropCalibratedCoins
  } : null;
  const currentDrop = dropCalibrationAdded > 0 ? {
    amount: dropCalibrationAdded,
    at: nowMs,
    startedAt: nowMs,
    previousCoinsGained: currentPickup?.previousCoinsGained
      ?? Math.max(0, Math.round(Number(previousCoinsGained || 0) || 0)),
    previousCalibratedCoins: previousDropCalibratedCoins
  } : null;
  const pickupCandidate = mergePending(freshPending(session.pendingCoinPickupCalibration), currentPickup);
  const dropCandidate = mergePending(freshPending(session.pendingDropCalibration), currentDrop);
  const matchedCalibration = pickupCandidate && dropCandidate
    && Math.abs(pickupCandidate.amount - dropCandidate.amount) <= 1;
  let matchedCoinsCandidate = null;
  if (matchedCalibration) {
    const exactBase = dropCandidate.startedAt <= pickupCandidate.startedAt
      ? dropCandidate.previousCoinsGained
      : pickupCandidate.previousCoinsGained;
    matchedCoinsCandidate = Math.max(
      dropCandidate.previousCalibratedCoins + dropCandidate.amount,
      exactBase + pickupCandidate.amount
    );
    session.pendingCoinPickupCalibration = null;
    session.pendingDropCalibration = null;
  } else {
    session.pendingCoinPickupCalibration = pickupCandidate;
    session.pendingDropCalibration = dropCandidate;
  }
  // Drop growth is the cumulative authority. Pickup evidence may lead the
  // next Drop observation by one parity coin, but it must never rewrite the
  // accumulated two-coins-per-Drop calibration.
  const upperBound = sessionCoinUpperBound(session);
  if (added > 0) {
    // Keep explicit pickup increments relative to the displayed total. The
    // Drop calibration can be ahead of pickup evidence, so adding to the
    // hidden pickup-only subtotal would make a later pickup appear short.
    const pickupBase = previousCoinsGained === null
      ? Math.max(0, Math.round(Number(session.coinsGained || 0) || 0))
      : Math.max(0, Math.round(Number(previousCoinsGained) || 0));
    session.pickupObservedCoins = Math.max(0, Math.round(Number(session.pickupObservedCoins || 0) + added));
    session.coinsGained = Math.max(pickupBase + added, session.pickupObservedCoins);
  }
  if (matchedCoinsCandidate !== null) {
    session.coinsGained = Math.max(
      matchedCoinsCandidate,
      Math.max(0, Math.round(Number(session.dropCalibratedCoins || 0) || 0))
    );
  }
  const reconciledCoins = Math.max(
    Math.max(0, Math.round(Number(session.coinsGained || 0) || 0)),
    Math.max(0, Math.round(Number(session.pickupObservedCoins || 0) || 0)),
    Math.max(0, Math.round(Number(session.dropCalibratedCoins || 0) || 0))
  );
  session.coinsGained = upperBound === null
    ? reconciledCoins
    : Math.max(
        Math.max(0, Math.round(Number(session.dropCalibratedCoins || 0) || 0)),
        Math.min(reconciledCoins, upperBound)
      );
  return added;
}

function updateBrowserlessStatsTodayDrop(stats, self, options = {}) {
  const drop = statsSelfDrop(self);
  if (drop === null) return { observed: false, addedCoins: 0, reset: false };
  if (options.mode === 'stale') {
    return { observed: false, addedCoins: 0, reset: false, stale: true };
  }
  const today = stats.today || (stats.today = resetBrowserlessTodayStats(browserlessStatsDayKey()));
  if (options.mode === 'baseline') {
    today.initialDrop = drop;
    today.maxDrop = drop;
    today.latestDrop = drop;
    return { observed: true, addedCoins: 0, reset: false, baseline: true };
  }
  const initialDrop = compactNumber(today.initialDrop);
  const maxDrop = compactNumber(today.maxDrop);
  const previousDrop = compactNumber(today.latestDrop);
  const addedCoins = previousDrop !== null && drop >= previousDrop
    ? Math.max(0, Math.round((drop - previousDrop) * PICKED_COINS_PER_SELF_DROP))
    : 0;
  const reset = previousDrop !== null && drop < previousDrop;
  if (initialDrop === null) today.initialDrop = drop;
  today.maxDrop = maxDrop === null ? drop : Math.max(maxDrop, drop);
  today.latestDrop = drop;
  if (reset) {
    today.dropResetCount = Math.max(0, Math.round(Number(today.dropResetCount || 0) + 1));
  }
  return { observed: true, addedCoins, reset };
}

function observeBrowserlessCrossDayDrop(stats, session, self, decision) {
  const pending = normalizeCrossDayDropPending(stats.today?.crossDayDropPending);
  if (!pending) return { mode: 'normal', tick: statsDecisionTick(decision) };
  if (!session?.sessionId || pending.sessionId !== session.sessionId) {
    stats.today.crossDayDropPending = null;
    return { mode: 'normal', tick: statsDecisionTick(decision) };
  }
  const drop = statsSelfDrop(self);
  const tick = statsDecisionTick(decision);
  const epochReset = tick !== null
    && pending.previousTick !== null
    && tick < pending.previousTick;
  const dropMovedForwardWithoutTick = tick === null
    && drop !== null
    && (pending.previousDrop === null || drop > pending.previousDrop);
  if (epochReset || dropMovedForwardWithoutTick || (pending.previousDrop === null && drop !== null && tick === null)) {
    stats.today.crossDayDropPending = null;
    return { mode: 'baseline', tick };
  }
  return { mode: 'stale', tick };
}

function updateBrowserlessStatsSession(stats, session, decision, self, stamina, nowMs, options = {}) {
  session.lastSeenAt = isoFromMs(nowMs);
  session.exitedAt = '';
  session.exitReason = '';
  const decisionTick = statsDecisionTick(decision);
  if (decisionTick !== null) session.lastRealtimeTick = decisionTick;
  const previousCoinsGained = Math.max(0, Math.round(Number(session.coinsGained || 0) || 0));
  const previousDropCalibratedCoins = Math.max(0, Math.round(Number(session.dropCalibratedCoins || 0) || 0));
  if (options.dropMode === 'baseline') resetBrowserlessSessionDropBaseline(session, self);
  else if (options.dropMode !== 'stale') updateBrowserlessStatsSessionDrop(session, self);
  const dropCalibrationAdded = Math.max(
    0,
    Math.round(Number(session.dropCalibratedCoins || 0) || 0) - previousDropCalibratedCoins
  );
  updateBrowserlessStatsSessionCoinPickups(session, decision, nowMs, previousCoinsGained, {
    added: dropCalibrationAdded,
    previousCalibratedCoins: previousDropCalibratedCoins
  });
  updateBrowserlessStatsSessionStamina(stats, session, stamina, self, nowMs);
  const evidence = ensureSessionKillBaseline(session, decision);
  if (!evidence.length && session.killBaselineInitialized && Array.isArray(session.killKeys)) {
    session.kills = session.killKeys.length;
    return;
  }
  const baselineKeys = new Set(Array.isArray(session.killBaselineKeys) ? session.killBaselineKeys : []);
  const killKeys = new Set(normalizeSessionKillKeys(session.killKeys, session));
  const enteredTick = compactNumber(session.enteredTick);
  for (const item of evidence) {
    if (baselineKeys.has(item.key)) continue;
    if (enteredTick !== null) {
      if (item.tick === null) continue;
      if (item.tick < enteredTick) {
        baselineKeys.add(item.key);
        continue;
      }
    }
    killKeys.add(item.key);
  }
  session.killBaselineKeys = Array.from(baselineKeys).slice(-300);
  session.killKeys = Array.from(killKeys).slice(-1000);
  session.kills = session.killKeys.length;
}

function browserlessStatsForDecision(state, decision, options = {}) {
  const liveUpdate = options.assumeNormalized === true
    && browserlessStatsReadyForLiveUpdate(state?.stats);
  const stats = liveUpdate
    ? cloneBrowserlessStatsForLiveUpdate(state.stats)
    : normalizeBrowserlessStats(state?.stats);
  const nowMs = eventTimeMs(decision?.at, options.nowMs);
  ensureBrowserlessStatsDay(stats, nowMs);
  const self = decision?.input?.self || null;
  if (!self || typeof self !== 'object') return stats;
  const stamina = decision?.input?.stamina || null;
  const userId = statsSelfUserId(self, state) || 0;
  const session = stats.currentSession || {};
  if (session.online && session.userId && userId && Number(session.userId) !== Number(userId)) {
    finalizeBrowserlessStatsSession(stats, {
      at: isoFromMs(nowMs),
      reason: 'user-changed'
    }, nowMs);
  }
  const active = stats.currentSession || {};
  if (!active.online || !active.sessionId) {
    startBrowserlessStatsSession(stats, state, self, stamina, nowMs, decision);
  }
  const crossDayDrop = observeBrowserlessCrossDayDrop(stats, stats.currentSession, self, decision);
  const todayDropTransition = updateBrowserlessStatsTodayDrop(stats, self, { mode: crossDayDrop.mode });
  updateBrowserlessStatsSession(stats, stats.currentSession, decision, self, stamina, nowMs, {
    dropMode: crossDayDrop.mode
  });
  stats.today.coinsGained = Math.max(0, Math.round(
    Number(stats.today.coinsGained || 0)
      + todayDropTransition.addedCoins
  ));
  return liveUpdate ? stats : normalizeBrowserlessStats(stats);
}

function browserlessStatsForKillEvidence(state, evidence = [], options = {}) {
  const stats = normalizeBrowserlessStats(state?.stats);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  ensureBrowserlessStatsDay(stats, nowMs);
  const session = stats.currentSession || {};
  if (!session.online || !session.sessionId) return stats;
  const baselineKeys = new Set(Array.isArray(session.killBaselineKeys) ? session.killBaselineKeys : []);
  const killKeys = new Set(normalizeSessionKillKeys(session.killKeys, session));
  const enteredTick = compactNumber(session.enteredTick);
  let latestAtMs = parseTimeMs(session.lastSeenAt);
  for (const item of evidence || []) {
    const key = statsKillKey(item);
    if (!key || baselineKeys.has(key)) continue;
    const tick = statsKillTick(item);
    if (enteredTick !== null && (tick === null || tick < enteredTick)) continue;
    killKeys.add(key);
    latestAtMs = Math.max(latestAtMs, parseTimeMs(item?.at) || nowMs);
  }
  session.killKeys = Array.from(killKeys).slice(-1000);
  session.kills = session.killKeys.length;
  if (latestAtMs > 0) session.lastSeenAt = isoFromMs(latestAtMs);
  return normalizeBrowserlessStats(stats);
}

function todayActiveDelta(stats, nowMs) {
  const session = stats.currentSession || {};
  const today = stats.today || {};
  if (!session.online || !session.sessionId || today.activeSessionId !== session.sessionId) {
    return { uptimeMs: 0, staminaSpentMs: 0, coinsGained: 0, kills: 0 };
  }
  const dayStart = browserlessStatsDayStartMs(today.day || browserlessStatsDayKey(nowMs));
  const enteredMs = Math.max(parseTimeMs(today.activeEnteredAt || session.enteredAt), dayStart);
  const endMs = Math.max(enteredMs, nowMs);
  return {
    uptimeMs: Math.max(0, Math.round(endMs - enteredMs)),
    staminaSpentMs: Math.max(0, Math.round(Number(session.staminaSpentMs || 0) - Number(today.activeBaseStaminaSpentMs || 0))),
    // Coin changes are posted from authoritative day-level Drop transitions,
    // so compact projection never adds the active session a second time.
    coinsGained: 0,
    kills: Math.max(0, Math.round(Number(session.kills || 0) - Number(today.activeBaseKills || 0)))
  };
}

function finalizeBrowserlessStatsSession(stats, detail = {}, nowMs = Date.now()) {
  ensureBrowserlessStatsDay(stats, nowMs);
  const session = stats.currentSession || {};
  const reason = compactString(detail.reason || session.exitReason || 'offline', 160);
  const at = compactString(detail.at || detail.completedAt || isoFromMs(nowMs), 48);
  let lastExitAt = stats.lastExit.at || '';
  let lastExitReason = stats.lastExit.reason || '';
  let lastExitRunId = stats.lastExit.runId || '';
  if (session.online && session.sessionId) {
    const finalDecision = { tick: detail.realtimeTick ?? detail.tick };
    const crossDayDrop = observeBrowserlessCrossDayDrop(stats, session, detail.self, finalDecision);
    const todayDropTransition = updateBrowserlessStatsTodayDrop(stats, detail.self, {
      mode: crossDayDrop.mode
    });
    const finalDropObserved = crossDayDrop.mode === 'baseline'
      ? resetBrowserlessSessionDropBaseline(session, detail.self)
      : crossDayDrop.mode === 'stale'
        ? false
        : updateBrowserlessStatsSessionDrop(session, detail.self);
    stats.today.coinsGained = Math.max(0, Math.round(
      Number(stats.today.coinsGained || 0)
        + todayDropTransition.addedCoins
    ));
    const finalStaminaObserved = updateBrowserlessStatsSessionStamina(stats, session, detail.stamina, detail.self, nowMs);
    if ((finalDropObserved || finalStaminaObserved) && at) {
      session.lastSeenAt = at;
    }
    const delta = todayActiveDelta(stats, eventTimeMs(at, nowMs));
    stats.today.uptimeMs += delta.uptimeMs;
    stats.today.staminaSpentMs += delta.staminaSpentMs;
    const actualStaminaSpentMs = actualBrowserlessDailyStaminaSpentMs(stats);
    if (actualStaminaSpentMs !== null) {
      stats.today.staminaSpentMs = actualStaminaSpentMs;
    }
    stats.today.kills += delta.kills;
    stats.today.sessionCount += 1;
    if (stats.today.activeSessionId === session.sessionId) {
      stats.today.activeSessionId = '';
      stats.today.activeEnteredAt = '';
      stats.today.activeBaseStaminaSpentMs = 0;
      stats.today.activeBaseCoinsGained = 0;
      stats.today.activeBaseKills = 0;
    }
    session.online = false;
    stats.today.crossDayDropPending = null;
    session.exitedAt = at;
    session.exitReason = reason;
    lastExitAt = at || lastExitAt;
    lastExitReason = reason || lastExitReason;
    lastExitRunId = compactString(detail.runId || lastExitRunId, 96);
  } else if (detail.forceLastExit) {
    lastExitAt = at || lastExitAt;
    lastExitReason = reason || lastExitReason;
    lastExitRunId = compactString(detail.runId || lastExitRunId, 96);
  }
  stats.lastExit = {
    at: lastExitAt,
    reason: lastExitReason,
    runId: lastExitRunId,
    nextRunAt: compactString(detail.nextRunAt || stats.lastExit.nextRunAt, 48),
    reconnectDelayMs: compactNumber(detail.reconnectDelayMs ?? detail.delayMs ?? stats.lastExit.reconnectDelayMs)
  };
  return normalizeBrowserlessStats(stats);
}

function browserlessStatsForOffline(state, detail = {}, options = {}) {
  const stats = normalizeBrowserlessStats(state?.stats);
  const nowMs = eventTimeMs(detail.at || detail.completedAt, options.nowMs);
  return finalizeBrowserlessStatsSession(stats, detail, nowMs);
}

function compactBrowserlessStats(normalized, game, action, options = {}, lastKnown = null) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const stats = normalizeBrowserlessStats(normalized?.stats);
  ensureBrowserlessStatsDay(stats, nowMs);
  const session = stats.currentSession || {};
  // The realtime projection may observe the next session before a lagging
  // statistics overlay publishes its online flag. Keep the compact response
  // internally consistent without mutating persisted session accounting.
  const online = Boolean(session.online || game?.inGame);
  const realtimeOnline = Boolean(game?.inGame && online);
  const enteredMs = parseTimeMs(session.enteredAt);
  const lastSeenMs = parseTimeMs(session.lastSeenAt);
  const exitedMs = parseTimeMs(session.exitedAt);
  const durationEndMs = online ? nowMs : (exitedMs || lastSeenMs || nowMs);
  const activeDelta = todayActiveDelta(stats, nowMs);
  const summedTodayStaminaSpentMs = Math.max(0, Math.round(Number(stats.today.staminaSpentMs || 0) + activeDelta.staminaSpentMs));
  const actualTodayStaminaSpentMs = actualBrowserlessDailyStaminaSpentMs(stats);
  const todayCoinsGained = Math.max(0, Math.round(Number(stats.today.coinsGained || 0) + activeDelta.coinsGained));
  // Do not project a completed wait deadline while a new snapshot safety check is in flight.
  const snapshotSafetyCheckInFlight = browserlessSnapshotSafetyCheckInFlight(action);
  const rawNextRunAt = snapshotSafetyCheckInFlight
    ? ''
    : (action?.nextRunAt || stats.lastExit.nextRunAt || '');
  const offlineBlocker = compactOfflineBlocker(normalized, lastKnown, options, nowMs);
  // A confirmed exit is emitted to recentExits before the asynchronous stats
  // projection necessarily catches up. Prefer that newer actual exit for the
  // public status so a new cooldown cannot display an older process-restart
  // timestamp. Safety/preflight observations are excluded by shouldLeave.
  const recentActualExit = latestMatchingRecentActualExit(
    normalized.recentExits,
    {}
  );
  const recentExitAt = parseTimeMs(recentActualExit?.at || recentActualExit?.time || recentActualExit?.createdAt);
  const persistedExitAt = parseTimeMs(stats.lastExit.at);
  const effectiveLastExit = recentActualExit && recentExitAt > persistedExitAt
    ? {
        at: compactString(recentActualExit.at || recentActualExit.time || recentActualExit.createdAt, 48),
        reason: compactString(recentActualExit.reason || recentActualExit.type, 160),
        runId: compactString(recentExitRunId(recentActualExit), 96)
      }
    : stats.lastExit;
  const rawNextRunAtMs = parseTimeMs(rawNextRunAt);
  const blockerReadyAtMs = parseTimeMs(offlineBlocker?.nextReadyAt);
  let nextRunAt = blockerReadyAtMs > rawNextRunAtMs
    ? offlineBlocker.nextReadyAt
    : rawNextRunAt;
  let nextRunAtMs = parseTimeMs(nextRunAt);
  const dailyFirstLoginNotBeforeMs = compactDailyFirstLoginNotBeforeMs(stats, options, nextRunAtMs);
  if (dailyFirstLoginNotBeforeMs > nextRunAtMs) {
    nextRunAtMs = dailyFirstLoginNotBeforeMs;
    nextRunAt = new Date(nextRunAtMs).toISOString();
  }
  return {
    currentSession: {
      online,
      realtimeOnline,
      enteredAt: session.enteredAt || '',
      durationMs: enteredMs ? Math.max(0, Math.round(durationEndMs - enteredMs)) : 0,
      staminaSpentMs: compactNumber(session.staminaSpentMs),
      coinsGained: pickedCoinsFromStatsValue(session.coinsGained),
      kills: compactNumber(session.kills)
    },
    offline: {
      lastExitAt: effectiveLastExit.at || session.exitedAt || '',
      lastExitReason: effectiveLastExit.reason || session.exitReason || '',
      lastExitRunId: effectiveLastExit.runId || '',
      nextReconnectAt: compactString(nextRunAt, 48),
      reconnectRemainingMs: nextRunAtMs ? Math.max(0, Math.round(nextRunAtMs - nowMs)) : null,
      scheduledReconnectAt: compactString(rawNextRunAt, 48),
      blocker: offlineBlocker
    },
    today: {
      day: stats.today.day || browserlessStatsDayKey(nowMs),
      sessionCount: Math.max(0, Math.round(Number(stats.today.sessionCount || 0))),
      initialDrop: compactNumber(stats.today.initialDrop),
      maxDrop: compactNumber(stats.today.maxDrop),
      latestDrop: compactNumber(stats.today.latestDrop),
      dropBaselinePending: Boolean(stats.today.crossDayDropPending),
      inGameDurationMs: Math.max(0, Math.round(Number(stats.today.uptimeMs || 0) + activeDelta.uptimeMs)),
      staminaSpentMs: actualTodayStaminaSpentMs === null
        ? summedTodayStaminaSpentMs
        : actualTodayStaminaSpentMs,
      coinsGained: pickedCoinsFromStatsValue(todayCoinsGained),
      kills: Math.max(0, Math.round(Number(stats.today.kills || 0) + activeDelta.kills))
    }
  };
}

function compactPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = compactNumber(value.x);
  const y = compactNumber(value.y);
  if (x === null && y === null) return null;
  return {
    x,
    y,
    hp: compactNumber(value.hp),
    maxHp: compactNumber(value.maxHp ?? value.max_hp),
    source: compactString(value.source, 48)
  };
}

function compactSafetyEntity(value) {
  if (!value || typeof value !== 'object') return null;
  const target = compactTarget({
    type: value.type || 'player',
    id: value.id ?? value.entity_id ?? value.entityId ?? null,
    userId: value.userId ?? value.user_id,
    entityId: value.entityId ?? value.entity_id ?? null,
    name: value.name || value.label,
    authority: value.authority || 'snapshot',
    hp: value.hp,
    drop: value.drop ?? value.Drop ?? value.reward ?? value.coin_reward ?? value.death_reward_preview ?? value.death_drop_coins,
    stamina5s: value.stamina5s ?? value.stamina5sRemainingMilli ?? value.stamina_5s_remaining_milli,
    stamina5sLimit: value.stamina5sLimit ?? value.stamina5sLimitMilli ?? value.stamina_5s_limit_milli,
    amount: value.amount ?? value.value,
    distance: value.distance,
    active: value.active,
    moving: value.moving,
    firing: value.firing
  });
  if (!target) return null;
  return {
    ...target,
    x: compactNumber(value.x),
    y: compactNumber(value.y),
    alive: value.alive === undefined ? null : Boolean(value.alive),
    mode: compactString(value.current_join_mode || value.mode || value.joined, 48),
    joinModeActive: value.joinModeActive === undefined ? null : Boolean(value.joinModeActive),
    stamina5sKnown: value.stamina5sKnown === undefined ? null : Boolean(value.stamina5sKnown),
    fullStamina5s: value.fullStamina5s === undefined ? null : Boolean(value.fullStamina5s),
    knownEasyKill: value.knownEasyKill === undefined ? null : Boolean(value.knownEasyKill),
    knownDamageActor: value.knownDamageActor === undefined ? null : Boolean(value.knownDamageActor),
    trustedEasyKill: value.trustedEasyKill === undefined ? null : Boolean(value.trustedEasyKill),
    blockingReasons: Array.isArray(value.blockingReasons)
      ? value.blockingReasons.map(reason => compactString(reason, 120)).filter(Boolean)
      : []
  };
}

function compactSafetyFactor(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    type: compactString(value.type, 32),
    reason: compactString(value.reason, 120),
    userId: compactNumber(value.userId ?? value.user_id),
    entityId: compactNumber(value.entityId ?? value.entity_id),
    name: compactString(value.name, 120),
    distance: compactNumber(value.distance),
    hp: compactNumber(value.hp)
  };
}

function compactSingleBlockerHold(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    active: Boolean(value.active),
    userId: compactNumber(value.userId),
    name: compactString(value.name, 120),
    firstBlockedAt: compactString(value.firstBlockedAt, 48),
    lastBlockedAt: compactString(value.lastBlockedAt, 48),
    durationMs: compactNumber(value.durationMs),
    thresholdMs: compactNumber(value.thresholdMs),
    remainingMs: compactNumber(value.remainingMs),
    observationCount: compactNumber(value.observationCount),
    fullHp: Boolean(value.fullHp),
    pointHp: compactNumber(value.pointHp),
    requiredFullHp: compactNumber(value.requiredFullHp),
    blockingPlayerCount: compactNumber(value.blockingPlayerCount),
    blockingFactorCount: compactNumber(value.blockingFactorCount),
    eligible: Boolean(value.eligible),
    bypassedAt: compactString(value.bypassedAt, 48),
    resetReason: compactString(value.resetReason, 120)
  };
}

function compactSafetyFreshness(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ok: value.ok === undefined ? null : Boolean(value.ok),
    reason: compactString(value.reason, 120),
    tick: compactNumber(value.tick),
    latestKnownTick: compactNumber(value.latestKnownTick),
    tickDelta: compactNumber(value.tickDelta)
  };
}

function snapshotSafetyCandidate(value, owner = {}) {
  if (!value || typeof value !== 'object') return null;
  return {
    value,
    timeMs: parseTimeMs(
      value.checkedAt
        || owner.completedAt
        || owner.updatedAt
        || owner.at
        || owner.startedAt
    )
  };
}

function snapshotSafetyCandidatesForLoginPoint(normalized) {
  const candidates = [
    snapshotSafetyCandidate(normalized?.loginPointSafety?.snapshotSafety, normalized?.loginPointSafety),
    snapshotSafetyCandidate(normalized?.probes?.lastSnapshotProbe?.snapshotSafety, normalized?.probes?.lastSnapshotProbe),
    snapshotSafetyCandidate(normalized?.probes?.lastReadOnlyProbe?.snapshotSafety, normalized?.probes?.lastReadOnlyProbe),
    snapshotSafetyCandidate(normalized?.runner?.lastRun?.canary?.snapshotSafety, normalized?.runner?.lastRun?.canary)
  ].filter(Boolean);
  candidates.sort((a, b) => b.timeMs - a.timeMs);
  return candidates;
}

function latestSnapshotSafetyCandidateForLoginPoint(normalized) {
  return snapshotSafetyCandidatesForLoginPoint(normalized)[0] || null;
}

function latestSnapshotSafetyForLoginPoint(normalized) {
  return latestSnapshotSafetyCandidateForLoginPoint(normalized)?.value || null;
}

function loginPointSafetyReasonPending(reason) {
  return /pending-snapshot-safety|snapshot-safety-streak-pending/i.test(String(reason || ''));
}

function compactCompletedLoginPointSafetyCheck(normalized) {
  for (const candidate of snapshotSafetyCandidatesForLoginPoint(normalized)) {
    const snapshotSafety = candidate.value;
    const response = snapshotSafety?.response && typeof snapshotSafety.response === 'object'
      ? snapshotSafety.response
      : {};
    const summary = response.summary && typeof response.summary === 'object'
      ? response.summary
      : {};
    const safety = summary.safety && typeof summary.safety === 'object'
      ? summary.safety
      : {};
    const reason = snapshotSafety?.reason || safety.reason || '';
    const checkedAt = snapshotSafety?.checkedAt || safety.checkedAt || '';
    if (!checkedAt || loginPointSafetyReasonPending(reason)) continue;
    if (/self-present-reentry|confirmed-leave-snapshot-quarantine|stale-confirmed-leave-snapshot-tick/i.test(String(reason))) continue;
    const ok = snapshotSafety?.ok ?? safety.ok;
    if (ok === undefined || ok === null) continue;
    return {
      ok: Boolean(ok),
      reason: compactString(reason || (ok ? 'safe' : 'unsafe'), 120),
      checkedAt: compactString(checkedAt, 48),
      streak: compactNumber(snapshotSafety?.streak ?? safety.streak),
      required: compactNumber(snapshotSafety?.required ?? safety.required)
    };
  }
  return null;
}

function compactLoginPointSafetyDetail(loginPointSafety, normalized) {
  const snapshotCandidate = latestSnapshotSafetyCandidateForLoginPoint(normalized);
  const snapshotSafety = snapshotCandidate?.value || null;
  const response = snapshotSafety?.response && typeof snapshotSafety.response === 'object'
    ? snapshotSafety.response
    : {};
  const summary = response.summary && typeof response.summary === 'object'
    ? response.summary
    : {};
  const snapshotSummarySafety = summary.safety && typeof summary.safety === 'object'
    ? summary.safety
    : {};
  const directDetail = loginPointSafety?.detail && typeof loginPointSafety.detail === 'object'
    ? loginPointSafety.detail
    : {};
  const directDetailTimeMs = parseTimeMs(loginPointSafety?.checkedAt || directDetail.checkedAt);
  const snapshotDetailTimeMs = snapshotCandidate?.timeMs || 0;
  const directDetailPending = loginPointSafetyReasonPending(loginPointSafety?.reason)
    || loginPointSafetyReasonPending(directDetail.reason);
  const hasDirectDetail = Object.keys(directDetail).length > 0;
  const hasSnapshotDetail = Object.keys(snapshotSummarySafety).length > 0;
  const useDirectDetail = hasDirectDetail && (
    directDetailPending
      || !hasSnapshotDetail
      || directDetailTimeMs >= snapshotDetailTimeMs
  );
  const detail = useDirectDetail ? directDetail : (hasSnapshotDetail ? snapshotSummarySafety : directDetail);
  const isolatePendingDetail = Boolean(useDirectDetail && directDetailPending);
  const previousCheck = isolatePendingDetail
    ? compactCompletedLoginPointSafetyCheck(normalized)
    : null;
  const okValue = detail.ok ?? (isolatePendingDetail ? loginPointSafety?.ok : snapshotSafety?.ok) ?? loginPointSafety?.ok;
  const reason = detail.reason || (useDirectDetail ? loginPointSafety?.reason : snapshotSafety?.reason) || loginPointSafety?.reason || '';
  const unsafeReason = okValue === false
    ? (reason || (useDirectDetail ? directDetail.originalReason : snapshotSafety?.originalReason) || loginPointSafety?.reason || 'unsafe')
    : '';
  const point = compactPoint(
    detail.point
      || snapshotSafety?.loginPoint
      || loginPointSafety?.point
  );
  const hasDetail = Boolean(
    snapshotSafety
      || Object.keys(directDetail).length
      || reason
      || point
  );
  if (!hasDetail) return null;
  const required = compactNumber(detail.required ?? (isolatePendingDetail ? undefined : snapshotSafety?.required) ?? directDetail.required);
  const effectiveRequired = required !== null ? required : 1;
  const streak = compactNumber(detail.streak ?? snapshotSafety?.streak ?? directDetail.streak);
  const effectiveStreak = streak !== null ? streak : (okValue === true ? effectiveRequired : 0);
  const nearestActive = detail.nearestActive
    || (isolatePendingDetail ? null : directDetail.nearestActive);
  const nearestDamageActor = detail.nearestDamageActor
    || (isolatePendingDetail ? null : directDetail.nearestDamageActor);
  const nearestTrustedEasyKill = detail.nearestTrustedEasyKill
    || (isolatePendingDetail ? null : directDetail.nearestTrustedEasyKill);
  const nearestDangerous = detail.nearestDangerous
    || (isolatePendingDetail ? null : directDetail.nearestDangerous)
    || nearestDamageActor
    || (nearestActive?.trustedEasyKill ? null : nearestActive);
  const blockingPlayers = Array.isArray(detail.blockingPlayers)
    ? detail.blockingPlayers.map(compactSafetyEntity).filter(Boolean)
    : [];
  const blockingFactors = Array.isArray(detail.blockingFactors)
    ? detail.blockingFactors.map(compactSafetyFactor).filter(Boolean)
    : [];
  return {
    ok: okValue === undefined ? null : Boolean(okValue),
    reason: compactString(reason, 120),
    unsafeReason: compactString(unsafeReason, 120),
    originalReason: compactString((isolatePendingDetail || useDirectDetail)
      ? directDetail.originalReason
      : (snapshotSafety?.originalReason || directDetail.originalReason), 120),
    checkedAt: compactString(loginPointSafety?.checkedAt || directDetail.checkedAt, 48),
    streak: effectiveStreak,
    required: effectiveRequired,
    satisfied: detail.satisfied === undefined ? null : Boolean(detail.satisfied),
    bypassedPreLoginSafety: Boolean(detail.bypassedPreLoginSafety
      ?? (isolatePendingDetail ? undefined : snapshotSafety?.bypassedPreLoginSafety)
      ?? directDetail.bypassedPreLoginSafety),
    bypassKind: compactString(detail.bypassKind
      ?? (isolatePendingDetail ? '' : snapshotSafety?.bypassKind)
      ?? directDetail.bypassKind, 64),
    point,
    selfPresent: isolatePendingDetail
      ? (detail.selfPresent === undefined ? null : Boolean(detail.selfPresent))
      : (summary.selfPresent === undefined
      ? (detail.selfPresent === undefined ? null : Boolean(detail.selfPresent))
      : Boolean(summary.selfPresent)),
    previousCheck,
    nearestActive: compactSafetyEntity(nearestActive),
    nearestDamageActor: compactSafetyEntity(nearestDamageActor),
    nearestTrustedEasyKill: compactSafetyEntity(nearestTrustedEasyKill),
    nearestDangerous: compactSafetyEntity(nearestDangerous),
    blockingPlayers,
    blockingFactors,
    blockingFactorCount: compactNumber(detail.blockingFactorCount ?? blockingFactors.length),
    singleBlockerHold: compactSingleBlockerHold(detail.singleBlockerHold),
    damageActorNearbyCount: compactNumber(detail.damageActorNearbyCount),
    trustedEasyKillNearbyCount: compactNumber(detail.trustedEasyKillNearbyCount),
    dangerousNearbyCount: compactNumber(detail.dangerousNearbyCount)
  };
}

function compactTarget(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    type: compactString(value.type, 48),
    id: value.id ?? value.coinId ?? null,
    userId: compactNumber(value.userId),
    entityId: value.entityId ?? null,
    name: compactString(value.name || value.label, 80),
    authority: compactString(value.authority, 48),
    x: compactNumber(value.x),
    y: compactNumber(value.y),
    vx: compactNumber(value.vx),
    vy: compactNumber(value.vy),
    hp: compactNumber(value.hp),
    maxHp: compactNumber(value.maxHp ?? value.max_hp),
    drop: compactNumber(value.drop),
    dropAuthority: compactString(value.dropAuthority, 24),
    stamina5s: compactNumber(value.stamina5s ?? value.stamina5sRemainingMilli ?? value.stamina_5s_remaining_milli),
    stamina5sLimit: compactNumber(value.stamina5sLimit ?? value.stamina5sLimitMilli ?? value.stamina_5s_limit_milli),
    stamina1h: compactNumber(value.stamina1h ?? value.stamina1hRemainingMilli ?? value.stamina_1h_remaining_milli),
    stamina1d: compactNumber(value.stamina1d ?? value.stamina1dRemainingMilli ?? value.stamina_1d_remaining_milli),
    staminaMetadataAuthority: compactString(value.staminaMetadataAuthority, 48),
    invulnerable: value.invulnerable === undefined || value.invulnerable === null ? null : Boolean(value.invulnerable),
    invulnerableRemainingMs: compactNumber(value.invulnerableRemainingMs ?? value.invulnerable_remaining_ms),
    invulnerableMetadataAuthority: compactString(value.invulnerableMetadataAuthority, 48),
    amount: compactNumber(value.amount ?? value.value),
    distance: compactNumber(value.distance ?? value.d),
    active: compactBoolean(value.active),
    moving: compactBoolean(value.moving),
    firing: compactBoolean(value.firing),
    recentlyActive: compactBoolean(value.recentlyActive),
    recentlyMoved: compactBoolean(value.recentlyMoved),
    easyKillKnown: compactBoolean(value.easyKillKnown),
    easyKillDamagedToday: compactBoolean(value.easyKillDamagedToday),
    easyKillThreatExempt: compactBoolean(value.easyKillThreatExempt),
    profitMetadataMode: compactString(value.profitMetadataMode, 48),
    profitMetadataActive: compactBoolean(value.profitMetadataActive)
  };
}

function compactCommand(command) {
  if (!command || typeof command !== 'object') return null;
  return {
    type: compactString(command.type || command.kind, 48),
    dx: compactNumber(command.dx),
    dy: compactNumber(command.dy),
    vx: compactNumber(command.vx),
    vy: compactNumber(command.vy),
    x: compactNumber(command.x),
    y: compactNumber(command.y)
  };
}

function compactAction(action) {
  if (!action || typeof action !== 'object') return null;
  const state = action.actionState && typeof action.actionState === 'object' ? action.actionState : {};
  return {
    ok: compactBoolean(action.ok),
    kind: compactString(action.kind, 48),
    reason: compactString(action.reason, 120),
    delayMs: compactNumber(action.delayMs),
    nextRunAt: compactString(action.nextRunAt, 48),
    nextSnapshotCheckAt: compactString(action.nextSnapshotCheckAt, 48),
    explicitDelay: compactBoolean(action.explicitDelay),
    target: compactTarget(action.target),
    blockedAction: action.blockedAction && typeof action.blockedAction === 'object'
      ? {
          kind: compactString(action.blockedAction.kind, 48),
          reason: compactString(action.blockedAction.reason, 120),
          targetKey: compactString(action.blockedAction.targetKey, 128)
        }
      : null,
    movement: action.movement && typeof action.movement === 'object'
      ? {
          ok: compactBoolean(action.movement.ok),
          skipped: compactBoolean(action.movement.skipped),
          reason: compactString(action.movement.reason, 120),
          command: compactCommand(action.movement.command)
        }
      : null,
    shoot: action.shoot && typeof action.shoot === 'object'
      ? {
          ok: compactBoolean(action.shoot.ok),
          skipped: compactBoolean(action.shoot.skipped),
          reason: compactString(action.shoot.reason, 120),
          cadenceMs: compactNumber(action.shoot.cadenceMs),
          command: compactCommand(action.shoot.command)
        }
      : null,
    counts: {
      sent: compactNumber(state.sentCount),
      velocity: compactNumber(state.velocitySentCount),
      shoot: compactNumber(state.shootSentCount),
      stop: compactNumber(state.stopCount),
      skipped: compactNumber(state.skippedCount),
      shootRepeat: compactNumber(state.shootRepeatSentCount)
    },
    lastShootAck: state.lastShootAck && typeof state.lastShootAck === 'object'
      ? {
          ok: compactBoolean(state.lastShootAck.ok),
          type: compactString(state.lastShootAck.type || state.lastShootAck.kind, 48),
          at: compactString(state.lastShootAck.at, 48)
        }
      : null
  };
}

function compactCenterActivity(centerActivity) {
  if (!centerActivity || typeof centerActivity !== 'object') return null;
  const hardBoundary = centerActivity.hardBoundary && typeof centerActivity.hardBoundary === 'object'
    ? centerActivity.hardBoundary
    : null;
  const outsideIdle = centerActivity.outsideIdle && typeof centerActivity.outsideIdle === 'object'
    ? centerActivity.outsideIdle
    : null;
  return {
    radiusCm: compactNumber(centerActivity.radiusCm),
    hardBoundaryRadiusCm: compactNumber(centerActivity.hardBoundaryRadiusCm),
    selfRadiusCm: compactNumber(centerActivity.selfRadiusCm),
    selfOutsideCm: compactNumber(centerActivity.selfOutsideCm),
    selfOutsideHardBoundaryCm: compactNumber(centerActivity.selfOutsideHardBoundaryCm),
    targetPositionRestricted: Boolean(centerActivity.targetPositionRestricted),
    hardBoundary: hardBoundary ? {
      boundaryRadiusCm: compactNumber(hardBoundary.boundaryRadiusCm),
      selfRadiusCm: compactNumber(hardBoundary.selfRadiusCm),
      outsideByCm: compactNumber(hardBoundary.outsideByCm),
      allowedHighValueCoin: Boolean(hardBoundary.allowedHighValueCoin),
      highValueCoin: hardBoundary.highValueCoin ? {
        id: compactString(hardBoundary.highValueCoin.id, 128),
        amount: compactNumber(hardBoundary.highValueCoin.amount),
        minAmount: compactNumber(hardBoundary.highValueCoin.minAmount),
        source: compactString(hardBoundary.highValueCoin.source, 32)
      } : null
    } : null,
    outsideIdle: outsideIdle ? {
      active: Boolean(outsideIdle.active),
      startedAt: compactNumber(outsideIdle.startedAt),
      ageMs: compactNumber(outsideIdle.ageMs),
      timeoutMs: compactNumber(outsideIdle.timeoutMs),
      selfRadiusCm: compactNumber(outsideIdle.selfRadiusCm),
      outsideByCm: compactNumber(outsideIdle.outsideByCm),
      actionReason: compactString(outsideIdle.actionReason, 80),
      resetReason: compactString(outsideIdle.resetReason, 80)
    } : null
  };
}

function compactDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  const dataGaps = Array.isArray(decision.input?.dataGaps) ? decision.input.dataGaps : [];
  const kind = String(decision.kind || decision.action?.kind || '');
  const shouldExposeProfitTarget = [
    'coin',
    'seek-coin',
    'profit-candidate',
    'attack',
    'seek-enemy',
    'seek-drop',
    'post-attack-drop-wait'
  ].includes(kind);
  return {
    kind: compactString(decision.kind, 48),
    band: compactString(decision.band, 48),
    reason: compactString(decision.reason, 120),
    at: compactString(decision.at, 48),
    tick: compactNumber(decision.tick),
    actionKind: compactString(decision.action?.kind, 48),
    action: compactAction(decision.action),
    target: compactTarget(decision.target || decision.action?.target || (shouldExposeProfitTarget ? (decision.profit?.best?.target || decision.profit?.best?.coin) : null)),
    threshold: decision.profit?.threshold && typeof decision.profit.threshold === 'object'
      ? {
          active: compactBoolean(decision.profit.threshold.active),
          reason: compactString(decision.profit.threshold.reason, 48),
          coinsPer10Stamina: compactNumber(decision.profit.threshold.threshold?.coinsPer10Stamina),
          remaining1dMilli: compactNumber(decision.profit.threshold.remaining1dMilli),
          burnCapacityMilli: compactNumber(decision.profit.threshold.burnCapacityMilli),
          resetAt: compactNumber(decision.profit.threshold.resetAt),
          reserveMs: compactNumber(decision.profit.threshold.reserveMs),
          rawCount: compactNumber(decision.profit.threshold.rawCount),
          eligibleCount: compactNumber(decision.profit.threshold.eligibleCount),
          filteredCount: compactNumber(decision.profit.threshold.filteredCount)
        }
      : null,
    centerActivity: compactCenterActivity(decision.input?.centerActivity),
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: compactNumber(decision.input?.dataGapCount) ?? dataGaps.length
  };
}

function compactStamina(stamina, self) {
  const source = stamina && typeof stamina === 'object' ? stamina : {};
  const selfSource = self && typeof self === 'object' ? self : {};
  return {
    current: compactNumber(source.stamina ?? selfSource.stamina),
    spent: compactNumber(source.staminaSpent),
    remaining5s: compactNumber(source.remaining5s ?? source.stamina5sRemainingMilli ?? source.stamina5s ?? selfSource.stamina5s ?? selfSource.stamina_5s_remaining_milli),
    remaining1h: compactNumber(source.remaining1h ?? source.stamina1hRemainingMilli ?? source.stamina1h ?? selfSource.stamina1h ?? selfSource.stamina_1h_remaining_milli),
    remaining1d: compactNumber(source.remaining1d ?? source.stamina1dRemainingMilli ?? source.stamina1d ?? selfSource.stamina1d ?? selfSource.stamina_1d_remaining_milli)
  };
}

function compactSelf(self) {
  if (!self || typeof self !== 'object') return null;
  return {
    userId: compactNumber(self.userId ?? self.user_id),
    entityId: self.entityId ?? self.entity_id ?? null,
    name: compactString(self.name || self.label, 80),
    authority: compactString(self.authority, 48),
    x: compactNumber(self.x),
    y: compactNumber(self.y),
    vx: compactNumber(self.vx),
    vy: compactNumber(self.vy),
    hp: compactNumber(self.hp),
    drop: compactNumber(self.drop ?? self.Drop ?? self.death_drop_coins ?? self.death_reward_preview),
    active: compactBoolean(self.active),
    moving: compactBoolean(self.moving),
    firing: compactBoolean(self.firing),
    alive: compactBoolean(self.alive)
  };
}

function normalizeBrowserlessLastKnown(value, current = {}, updatedAt = '') {
  const source = value && typeof value === 'object' ? value : {};
  const hasStoredSelf = Boolean(source.self && typeof source.self === 'object');
  const fallbackSelf = current?.self && typeof current.self === 'object' ? current.self : null;
  const rawSelf = hasStoredSelf ? source.self : fallbackSelf;
  const rawStamina = source.stamina && typeof source.stamina === 'object'
    ? source.stamina
    : (!hasStoredSelf ? current?.stamina : null);
  const self = compactSelf(rawSelf);
  const stamina = compactStamina(rawStamina, rawSelf);
  const hasStamina = stamina.remaining5s !== null
    || stamina.remaining1h !== null
    || stamina.remaining1d !== null;
  if (!self && !hasStamina) return null;
  const fallbackDecisionAt = !hasStoredSelf ? current?.decision?.at : '';
  const fallbackTick = !hasStoredSelf
    ? current?.decision?.tick ?? current?.decision?.input?.realtime?.tick
    : null;
  return {
    self,
    stamina,
    at: compactString(source.at || fallbackDecisionAt || updatedAt, 48),
    tick: compactNumber(source.tick ?? fallbackTick)
  };
}

function latestAttemptResponse(leave) {
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts : [];
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const response = attempts[i]?.response;
    if (response && typeof response === 'object') return response;
  }
  return null;
}

function latestKnownSelfSource(normalized) {
  const canary = normalized?.runner?.lastRun?.canary || null;
  const candidates = [
    normalized?.current?.self,
    latestAttemptResponse(canary?.leave),
    latestAttemptResponse(canary?.safety?.exit?.leave),
    canary?.state?.realtime?.self,
    canary?.state?.fallback?.self,
    normalized?.probes?.lastReadOnlyProbe?.state?.realtime?.self,
    normalized?.probes?.lastReadOnlyProbe?.state?.fallback?.self
  ];
  return candidates.find(item => item && typeof item === 'object') || null;
}

function compactLastKnown(normalized) {
  const persisted = normalized?.lastKnown && typeof normalized.lastKnown === 'object'
    ? normalized.lastKnown
    : null;
  const source = persisted?.self || latestKnownSelfSource(normalized);
  const self = compactSelf(source);
  const stamina = compactStamina(persisted?.stamina || normalized?.current?.stamina, source);
  const at = compactString(
    persisted?.at
      || normalized?.runner?.lastRun?.canary?.completedAt
      || normalized?.runner?.lastRun?.completedAt
      || normalized?.updatedAt,
    48
  );
  return self || stamina.remaining5s !== null || stamina.remaining1h !== null || stamina.remaining1d !== null
    ? { self, stamina, at }
    : null;
}

function compactOfflineBlocker(normalized, lastKnown, options = {}, nowMs = Date.now()) {
  const offlineReason = String(
    normalized?.runner?.currentAction?.reason
      || normalized?.stats?.lastExit?.reason
      || normalized?.stats?.currentSession?.exitReason
      || ''
  );
  const stamina = lastKnown?.stamina || compactStamina(normalized?.current?.stamina, normalized?.current?.self);
  const lastKnownAtMs = parseTimeMs(lastKnown?.at);
  const currentDayStartMs = browserlessStatsDayStartMs(browserlessStatsDayKey(nowMs));
  const staminaIsFromCurrentDay = !lastKnownAtMs || lastKnownAtMs >= currentDayStartMs;
  const thresholdMs = Math.max(0, Number(options.staminaExhaustedBelowMs ?? DEFAULT_STAMINA_EXHAUSTED_THRESHOLD_MS));
  const exhausted = [];
  if (staminaIsFromCurrentDay && stamina.remaining1h !== null && stamina.remaining1h < thresholdMs) exhausted.push('1h');
  if (staminaIsFromCurrentDay && stamina.remaining1d !== null && stamina.remaining1d < thresholdMs) exhausted.push('1d');
  if (!staminaIsFromCurrentDay) return null;
  if (!exhausted.length && !/stamina-exhausted-leave|体力耗尽/i.test(offlineReason)) return null;
  const resetGraceMs = Math.max(0, Number(options.staminaResetGraceMs ?? DEFAULT_STAMINA_RESET_GRACE_MS));
  const resetAt = exhausted.includes('1d') ? nextDailyStaminaResetAt(nowMs) : 0;
  const nextReadyAt = resetAt ? new Date(resetAt + resetGraceMs).toISOString() : '';
  return {
    reason: 'stamina-exhausted-leave',
    exhausted,
    thresholdMs,
    remaining1h: stamina.remaining1h,
    remaining1d: stamina.remaining1d,
    nextReadyAt
  };
}

function compactProfit(profit) {
  if (!profit || typeof profit !== 'object') return null;
  const best = profit.best && typeof profit.best === 'object' ? profit.best : null;
  const candidates = Array.isArray(profit.candidates) ? profit.candidates : [];
  return {
    best: best
      ? {
          type: compactString(best.type, 48),
          actionKind: compactString(best.actionKind, 48),
          reason: compactString(best.reason, 120),
          score: compactNumber(best.score),
          staminaCost: compactNumber(best.staminaCost),
          distance: compactNumber(best.distance),
          amount: compactNumber(best.amount),
          target: compactTarget(best.target || best.coin)
        }
      : null,
    candidateCount: compactNumber(profit.candidateCount) ?? candidates.length,
    threshold: profit.threshold && typeof profit.threshold === 'object'
      ? {
          active: compactBoolean(profit.threshold.active),
          reason: compactString(profit.threshold.reason, 48),
          coinsPer10Stamina: compactNumber(profit.threshold.threshold?.coinsPer10Stamina),
          remaining1dMilli: compactNumber(profit.threshold.remaining1dMilli),
          burnCapacityMilli: compactNumber(profit.threshold.burnCapacityMilli),
          resetAt: compactNumber(profit.threshold.resetAt),
          reserveMs: compactNumber(profit.threshold.reserveMs),
          rawCount: compactNumber(profit.threshold.rawCount),
          eligibleCount: compactNumber(profit.threshold.eligibleCount),
          filteredCount: compactNumber(profit.threshold.filteredCount)
        }
      : null
  };
}

function compactCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  const candidates = Array.isArray(combat.candidates) ? combat.candidates : [];
  const dataGaps = Array.isArray(combat.dataGaps) ? combat.dataGaps : [];
  return {
    ok: compactBoolean(combat.ok),
    actionEligible: compactBoolean(combat.actionEligible),
    dryRun: compactBoolean(combat.dryRun),
    liveEnabled: compactBoolean(combat.liveEnabled),
    authority: compactString(combat.authority, 48),
    tick: compactNumber(combat.tick),
    startedAt: compactString(combat.startedAt, 48),
    durationMs: compactNumber(combat.durationMs),
    movementDistance: compactNumber(combat.movementDistance),
    self: compactTarget(combat.self),
    target: compactTarget(combat.target),
    candidateCount: compactNumber(combat.candidateCount) ?? candidates.length,
    movement: combat.movement && typeof combat.movement === 'object'
      ? {
          dx: compactNumber(combat.movement.dx),
          dy: compactNumber(combat.movement.dy),
          reason: compactString(combat.movement.reason, 120)
        }
      : null,
    shooting: combat.shooting && typeof combat.shooting === 'object'
      ? {
          wouldShoot: compactBoolean(combat.shooting.wouldShoot),
          inRange: compactBoolean(combat.shooting.inRange),
          reason: compactString(combat.shooting.reason, 120),
          cadenceMs: compactNumber(combat.shooting.cadenceMs ?? combat.shooting.effectiveCadenceMs),
          stamina5s: compactNumber(combat.shooting.stamina5s)
        }
      : null,
    exit: combat.exit && typeof combat.exit === 'object'
      ? {
          kind: compactString(combat.exit.kind, 48),
          reason: compactString(combat.exit.reason, 120),
          selfHp: compactNumber(combat.exit.selfHp),
          targetHp: compactNumber(combat.exit.targetHp),
          hpGap: compactNumber(combat.exit.hpGap),
          threshold: compactNumber(combat.exit.threshold),
          minHpGap: compactNumber(combat.exit.minHpGap),
          targetHpSource: compactString(combat.exit.targetHpSource, 80),
          engagedTargets: compactEngagedExitTargets(combat.exit.engagedTargets)
        }
      : null,
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: dataGaps.length
  };
}

function compactEngagedExitTargets(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(item => {
    if (!item || typeof item !== 'object') return null;
    const id = item.id ?? item.userId ?? item.user_id ?? item.entityId ?? item.entity_id;
    return {
      id: id === null || id === undefined || id === '' ? '' : compactString(id, 80),
      name: compactString(item.name || item.label, 80),
      hp: compactNumber(item.hp),
      source: compactString(item.source, 80)
    };
  }).filter(Boolean);
}

function compactBattleActor(value, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const compact = compactTarget({ ...fallback, ...source }) || {};
  return {
    userId: compact.userId ?? compactNumber(fallback.userId ?? fallback.user_id),
    name: compact.name || compactString(fallback.name || fallback.label, 80),
    hp: compact.hp ?? compactNumber(fallback.hp),
    maxHp: compact.maxHp ?? compactNumber(fallback.maxHp ?? fallback.max_hp),
    drop: compact.drop ?? compactNumber(fallback.drop ?? fallback.Drop),
    stamina5s: compact.stamina5s ?? compactNumber(fallback.stamina5s ?? fallback.stamina5sRemainingMilli),
    stamina5sLimit: compact.stamina5sLimit ?? compactNumber(fallback.stamina5sLimit ?? fallback.stamina5sLimitMilli),
    stamina1h: compact.stamina1h ?? compactNumber(fallback.stamina1h ?? fallback.stamina1hRemainingMilli),
    stamina1d: compact.stamina1d ?? compactNumber(fallback.stamina1d ?? fallback.stamina1dRemainingMilli),
    active: compact.active ?? (fallback.active === undefined || fallback.active === null ? null : Boolean(fallback.active)),
    moving: compact.moving ?? (fallback.moving === undefined || fallback.moving === null ? null : Boolean(fallback.moving)),
    firing: compact.firing ?? (fallback.firing === undefined || fallback.firing === null ? null : Boolean(fallback.firing))
  };
}

function recentBattleActivity(activity, nowMs, windowMs) {
  const atMs = compactNumber(activity);
  if (atMs === null || atMs <= 0) return false;
  const ageMs = nowMs - atMs;
  return ageMs >= -500 && ageMs <= windowMs;
}

function rejectedTargetlessCombatDecision(decision, combat) {
  const actionKind = String(decision?.action?.kind || decision?.actionKind || decision?.kind || '');
  return actionKind === 'combat-live'
    && combat?.actionEligible === false
    && !combat?.target;
}

function lifecycleActionKind(kind, reason) {
  const normalizedKind = String(kind || '');
  const normalizedReason = String(reason || '');
  return [
    'loop-wait', 'stopped', 'snapshot-wait',
    'source-ip-preflight', 'source-ip-preflight-cooldown',
    'source-ip-preflight-login', 'source-ip-preflight-retry',
    'exit-recovery', 'leave', 'safety-exit'
  ].includes(normalizedKind)
    || /(?:^|-)leave$|^restart-drain|pending-snapshot-safety|snapshot-safety-retry|source-ip-(?:preflight|snapshot)/i.test(normalizedReason);
}

function compactBattleStatus(normalized, game, action, decision, combat, options = {}) {
  if (!game?.inGame) return null;
  if (rejectedTargetlessCombatDecision(decision, combat)) return null;
  const kind = String(action?.kind || decision?.kind || decision?.actionKind || '');
  const band = String(decision?.band || '');
  const combatLike = kind === 'attack' || kind === 'combat-live' || band === 'combat';
  const target = combat?.target || action?.target || decision?.target || null;
  if (!combatLike || !target || target.type === 'coin') return null;

  const current = normalized?.current || {};
  const rawCombat = current.combatSummary || current.decision?.combat || {};
  const battlePresentation = current.battlePresentation && typeof current.battlePresentation === 'object'
    ? current.battlePresentation
    : {};
  const targetIdentity = target.userId ?? target.user_id ?? target.entityId ?? target.entity_id ?? target.id;
  const presentationMatchesTarget = targetIdentity !== null && targetIdentity !== undefined
    && String(battlePresentation.targetKey || '') === `player:${String(targetIdentity)}`;
  const stateCombatTarget = current.decisionState?.combat?.target || null;
  const stateStartedAtMs = compactNumber(stateCombatTarget?.firstSeenAt ?? stateCombatTarget?.at);
  const startedAt = compactString(
    combat?.startedAt
      || rawCombat.startedAt
      || (presentationMatchesTarget ? battlePresentation.startedAt : '')
      || (stateStartedAtMs !== null ? isoFromMs(stateStartedAtMs) : '')
      || decision?.at,
    48
  );
  const selfFallback = {
    ...(current.self && typeof current.self === 'object' ? current.self : {}),
    stamina5s: current.stamina?.stamina5sRemainingMilli ?? current.stamina?.stamina5s,
    stamina1h: current.stamina?.stamina1hRemainingMilli ?? current.stamina?.stamina1h,
    stamina1d: current.stamina?.stamina1dRemainingMilli ?? current.stamina?.stamina1d
  };
  const samePlayer = candidate => {
    if (!candidate || !target) return false;
    const candidateUserId = compactNumber(candidate.userId ?? candidate.user_id);
    const targetUserId = compactNumber(target.userId ?? target.user_id);
    if (candidateUserId !== null && targetUserId !== null) return candidateUserId === targetUserId;
    const candidateEntityId = candidate.entityId ?? candidate.entity_id;
    const targetEntityId = target.entityId ?? target.entity_id;
    return candidateEntityId !== null && candidateEntityId !== undefined
      && targetEntityId !== null && targetEntityId !== undefined
      && String(candidateEntityId) === String(targetEntityId);
  };
  const synchronizedTarget = [action?.target, decision?.target].find(candidate => (
    samePlayer(candidate) && compactNumber(candidate?.distance) !== null
  ));
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const activity = presentationMatchesTarget && battlePresentation.activity && typeof battlePresentation.activity === 'object'
    ? battlePresentation.activity
    : {};
  const activityWindowMs = Math.max(1000, compactNumber(activity.windowMs) || 3000);
  const selfActor = compactBattleActor(combat?.self, selfFallback);
  const targetActor = compactBattleActor(target);
  selfActor.moving = Boolean(selfActor.moving || recentBattleActivity(activity.self?.movingAt, nowMs, activityWindowMs));
  selfActor.firing = Boolean(selfActor.firing || recentBattleActivity(activity.self?.firingAt, nowMs, activityWindowMs));
  targetActor.moving = Boolean(targetActor.moving || recentBattleActivity(activity.target?.movingAt, nowMs, activityWindowMs));
  targetActor.firing = Boolean(targetActor.firing || recentBattleActivity(activity.target?.firingAt, nowMs, activityWindowMs));
  return {
    active: true,
    kind: compactString(kind, 48),
    startedAt,
    durationMs: compactNumber(combat?.durationMs ?? rawCombat.durationMs),
    distance: compactNumber(synchronizedTarget?.distance ?? target.distance),
    movementDistance: compactNumber(
      (presentationMatchesTarget ? battlePresentation.movementDistance : null)
        ?? combat?.movementDistance
        ?? rawCombat.movementDistance
    ),
    self: selfActor,
    target: targetActor,
    targetAfk: kind === 'attack' && target.active !== true
  };
}

function compactNearbyList(list, rowSize, limit = 160) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => Array.isArray(item))
    .map(item => item.slice(0, rowSize).map(value => {
      if (typeof value === 'number') return compactNumber(value);
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === null || value === undefined || value === '') return null;
      return compactString(value, 96);
    }))
    .slice(0, limit);
}

function compactNearbyFixedList(list, rowSize, limit = 160) {
  return compactNearbyList(list, rowSize, limit)
    .map(row => row.length < rowSize
      ? [...row, ...Array(rowSize - row.length).fill(null)]
      : row);
}

function sortCompactNearbyCoins(a, b) {
  const distanceA = compactNumber(a?.[2]);
  const distanceB = compactNumber(b?.[2]);
  const amountA = compactNumber(a?.[1]);
  const amountB = compactNumber(b?.[1]);
  return (distanceA ?? Number.POSITIVE_INFINITY) - (distanceB ?? Number.POSITIVE_INFINITY)
    || (amountB ?? 0) - (amountA ?? 0);
}

function compactNearbyCoins(list) {
  const rows = compactNearbyList(list, 9, Number.POSITIVE_INFINITY)
    .filter(row => compactNumber(row?.[1]) !== null && compactNumber(row?.[2]) !== null);
  const highValueRows = rows.filter(row => Number(row[1]) > 1);
  const lowValueRows = rows
    .filter(row => Number(row[1]) === 1)
    .sort(sortCompactNearbyCoins);
  const forcedLowValueRows = lowValueRows.filter(row => Boolean(row?.[3]) || Number(row?.[4] || 0) > 0 || Boolean(row?.[6]));
  const visibleLowValueRows = lowValueRows.slice(0, 10);
  const byId = new Map();
  for (const row of [...highValueRows, ...visibleLowValueRows, ...forcedLowValueRows]) {
    const key = compactString(row?.[0], 96) || String(byId.size);
    if (!byId.has(key)) byId.set(key, row);
  }
  return {
    rows: Array.from(byId.values()).sort(sortCompactNearbyCoins),
    lowHiddenCount: Math.max(0, lowValueRows.length - new Set([...visibleLowValueRows, ...forcedLowValueRows].map(row => compactString(row?.[0], 96))).size)
  };
}

function compactNearbyPlayers(list) {
  const rows = compactNearbyList(list, 17, Number.POSITIVE_INFINITY);
  const visibleRows = [];
  let lowHiddenCount = 0;
  for (const row of rows) {
    const currentShape = row.length >= 13;
    const foldAsLowValueAfk = currentShape ? row?.[12] : row?.[10];
    const selected = Boolean(row?.[6]);
    if (foldAsLowValueAfk && !selected) {
      lowHiddenCount += 1;
      continue;
    }
    if (currentShape) {
      visibleRows.push([
        ...row.slice(0, 12),
        row.length >= 15 ? row[13] : null,
        row.length >= 15 ? row[14] : null,
        row.length >= 17 ? row[15] : null,
        row.length >= 17 ? row[16] : null
      ]);
      continue;
    }
    const legacy = row.slice(0, 10);
    legacy.push(Boolean(row?.[9]) ? 1 : 0, Boolean(row?.[9]) ? 1 : 0);
    while (legacy.length < 16) legacy.push(null);
    visibleRows.push(legacy);
  }
  return {
    rows: visibleRows,
    lowHiddenCount
  };
}

function compactNearbyCount(value) {
  const count = compactNumber(value);
  return count === null ? 0 : Math.max(0, Math.round(count));
}

function compactNearby(nearby) {
  if (!nearby || typeof nearby !== 'object') return null;
  if ([1, 2, COMPACT_NEARBY_VERSION].includes(Number(nearby.compactVersion))) {
    return {
      compactVersion: COMPACT_NEARBY_VERSION,
      ar: compactNumber(nearby.ar ?? nearby.attackRange),
      vr: compactNumber(nearby.vr ?? nearby.visibleRange),
      c: compactNearbyFixedList(nearby.c || nearby.coins, 9, Number.POSITIVE_INFINITY),
      coinLowHiddenCount: compactNearbyCount(nearby.coinLowHiddenCount),
      p: compactNearbyFixedList(nearby.p || nearby.players, 16, Number.POSITIVE_INFINITY),
      playerLowHiddenCount: compactNearbyCount(nearby.playerLowHiddenCount),
      observedAt: nearby.observedAt || '',
      tick: compactNumber(nearby.tick),
      ageMs: compactNumber(nearby.ageMs)
    };
  }
  const coins = compactNearbyCoins(nearby.c || nearby.coins);
  const players = compactNearbyPlayers(nearby.p || nearby.players);
  return {
    compactVersion: COMPACT_NEARBY_VERSION,
    ar: compactNumber(nearby.ar ?? nearby.attackRange),
    vr: compactNumber(nearby.vr ?? nearby.visibleRange),
    c: coins.rows,
    coinLowHiddenCount: coins.lowHiddenCount,
    p: players.rows,
    playerLowHiddenCount: players.lowHiddenCount,
    observedAt: nearby.observedAt || '',
    tick: compactNumber(nearby.tick),
    ageMs: compactNumber(nearby.ageMs)
  };
}

function compactMapTrailSample(sample) {
  const array = Array.isArray(sample) ? sample : null;
  const x = compactNumber(array ? array[0] : sample?.x);
  const y = compactNumber(array ? array[1] : sample?.y);
  const at = compactNumber(array ? array[2] : sample?.at);
  const tick = compactNumber(array ? array[3] : sample?.tick);
  if (x === null || y === null || at === null) return null;
  return tick === null ? [x, y, at] : [x, y, at, tick];
}

function compactMapTrails(value) {
  if (!value || typeof value !== 'object') return null;
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    version: COMPACT_MAP_TRAILS_VERSION,
    authority: compactString(value.authority || 'realtime', 32),
    source: compactString(value.source || 'pos', 32),
    visibleRange: compactNumber(value.visibleRange),
    maxAgeMs: compactNumber(value.maxAgeMs),
    observedAt: compactString(value.observedAt, 48),
    ageMs: compactNumber(value.ageMs),
    tick: compactNumber(value.tick),
    items: items.slice(0, COMPACT_MAP_TRAILS_MAX_ITEMS).map(item => ({
      k: compactString(item?.k ?? item?.key, 96),
      n: compactString(item?.n ?? item?.name, 96),
      s: (Array.isArray(item?.s) ? item.s : (Array.isArray(item?.samples) ? item.samples : []))
        .map(compactMapTrailSample)
        .filter(Boolean)
        .slice(-180),
      at: compactNumber(item?.at ?? item?.lastSeenAtMs),
      tick: compactNumber(item?.tick ?? item?.lastTick)
    })).filter(item => item.k && item.s.length)
  };
}

function compactHighDropPlayers(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.p)) {
    return {
      day: compactString(value.day, 10),
      updatedAt: value.updatedAt || '',
      lastSnapshotAt: value.lastSnapshotAt || '',
      lastGlobalSnapshotAt: value.lastGlobalSnapshotAt || '',
      source: compactString(value.source, 32),
      globalSource: compactString(value.globalSource, 32),
      p: value.p.slice(0, 160).map(row => Array.isArray(row) ? row.slice(0, 6) : row)
    };
  }
  const players = Array.isArray(value.players) ? value.players : [];
  const rows = players.map(player => [
    compactString(player?.name, 96),
    compactNumber(player?.initialDrop),
    compactNumber(player?.maxDrop),
    compactNumber(player?.latestDrop),
    compactNumber(player?.userId),
    player?.online === true ? true : (player?.online === false ? false : null)
  ]).filter(row => row[0] && row.slice(1, 5).every(item => item !== null))
    .filter(row => row.slice(1, 4).some(item => item >= HIGH_DROP_PANEL_THRESHOLD))
    .slice(0, 160);
  return {
    day: compactString(value.day, 10),
    updatedAt: value.updatedAt || '',
    lastSnapshotAt: value.lastSnapshotAt || '',
    lastGlobalSnapshotAt: value.lastGlobalSnapshotAt || '',
    source: compactString(value.lastSnapshotSource, 32),
    globalSource: compactString(value.lastGlobalSnapshotSource, 32),
    p: rows
  };
}

function compactEasyKillPlayers(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.p)) return { updatedAt: value.updatedAt || '', p: value.p.slice(0, 160) };
  const players = Array.isArray(value.players) ? value.players : [];
  return {
    updatedAt: value.updatedAt || '',
    p: players.map(player => {
      const scoreValue = compactNumber(player?.score ?? player?.killScore ?? player?.killCount);
      const rounded = scoreValue === null ? null : Math.round(scoreValue);
      const score = rounded === null || rounded <= 0 ? null : Math.min(3, rounded);
      return [compactString(player?.name, 96), score];
    }).filter(row => row[0] && row[1] !== null).slice(0, 160)
  };
}

function compactDailyDamagePlayers(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.p)) return { day: compactString(value.day, 10), updatedAt: value.updatedAt || '', p: value.p.slice(0, 160) };
  const players = Array.isArray(value.players) ? value.players : [];
  return {
    day: compactString(value.day, 10),
    updatedAt: value.updatedAt || '',
    p: players.map(player => compactString(player?.name, 96)).filter(Boolean).slice(0, 160)
  };
}

function compactDynamicWhitelist(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.p)) return { updatedAt: value.updatedAt || '', p: value.p.slice(0, 160) };
  const players = Array.isArray(value.players) ? value.players : [];
  return {
    updatedAt: value.updatedAt || '',
    p: players.map(player => compactString(player?.name, 96)).filter(Boolean).slice(0, 160)
  };
}

function compactRun(run) {
  if (!run || typeof run !== 'object') return null;
  const canary = run.canary && typeof run.canary === 'object' ? run.canary : null;
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  return {
    ok: run.ok === undefined ? null : Boolean(run.ok),
    mode: compactString(run.mode || run.controlMode, 48),
    runId: compactString(run.runId || canary?.runId, 96),
    startedAt: compactString(run.startedAt || canary?.startedAt, 48),
    completedAt: compactString(run.completedAt || canary?.completedAt, 48),
    reason: compactString(run.reason || safetyReason, 120),
    error: compactString(run.error || canary?.error, 160),
    frames: compactNumber(canary?.stats?.frameCount),
    decisions: compactNumber(canary?.decisions?.evaluatedCount),
    actions: compactNumber(canary?.actions?.sentCount)
  };
}

function reconcileBrowserlessExitKillEvidence(event, evidence = [], options = {}) {
  if (!event || typeof event !== 'object') return event;
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
  const decision = detail.decision && typeof detail.decision === 'object'
    ? detail.decision
    : (detail.lastDecision && typeof detail.lastDecision === 'object' ? detail.lastDecision : {});
  const combat = decision.combat && typeof decision.combat === 'object'
    ? decision.combat
    : (detail.combat && typeof detail.combat === 'object' ? detail.combat : {});
  const metrics = combat.metrics && typeof combat.metrics === 'object' ? combat.metrics : {};
  const target = event.target || detail.target || decision.target || combat.exit?.target || combat.target || null;
  const targetId = compactNumber(metrics.targetId ?? target?.userId ?? target?.user_id);
  if (targetId === null) return event;
  const eventAtMs = parseTimeMs(event.at || decision.at || detail.at);
  const currentTargetHp = compactNumber(
    combat.exit?.targetHp
      ?? combat.exit?.target?.hp
      ?? decision.target?.hp
      ?? detail.target?.hp
      ?? combat.target?.hp
      ?? metrics.lastTargetHp
  );
  const startedAtMs = compactNumber(metrics.startedAt) || parseTimeMs(combat.startedAt);
  const startedTick = compactNumber(metrics.startedTick);
  const maxAfterExitMs = Math.max(1000, Number(options.maxAfterExitMs || 5000));
  const match = (evidence || []).find(item => {
    const evidenceTargetId = compactNumber(
      item?.targetUserId ?? item?.target_user_id ?? item?.targetId ?? item?.userId ?? item?.user_id
    );
    if (evidenceTargetId === null || evidenceTargetId !== targetId) return false;
    const tick = statsKillTick(item);
    if (startedTick !== null && tick !== null && tick < startedTick) return false;
    const atMs = parseTimeMs(item?.at);
    if (startedAtMs > 0 && atMs > 0 && atMs < startedAtMs) return false;
    if (eventAtMs > 0 && atMs > 0 && atMs - eventAtMs > maxAfterExitMs) return false;
    return true;
  }) || null;
  if (!match) return event;
  const confirmation = {
    targetUserId: targetId,
    targetName: compactString(match.name || match.targetName, 80),
    tick: statsKillTick(match),
    at: compactString(match.at, 48),
    source: compactString(match.source || 'self-kill-evidence', 48)
  };
  const killAtMs = parseTimeMs(confirmation.at);
  // A player can respawn/reappear with the same stable user ID before the
  // canary finishes. Do not let the prior life turn a later full-HP safety
  // exit into a fabricated victory. Keep the confirmed kill as bounded
  // history so the panel can render the two phases separately.
  if (eventAtMs > 0
    && killAtMs > 0
    && killAtMs < eventAtMs
    && currentTargetHp !== null
    && currentTargetHp > 1) {
    const separatedEvent = cloneJson(event);
    delete separatedEvent.killConfirmation;
    if (separatedEvent.detail && typeof separatedEvent.detail === 'object') {
      delete separatedEvent.detail.killConfirmation;
    }
    return {
      ...separatedEvent,
      priorKillConfirmation: {
        ...confirmation,
        targetReappearedAt: compactString(event.at || decision.at || detail.at, 48)
      }
    };
  }
  return {
    ...cloneJson(event),
    killConfirmation: confirmation
  };
}

function compactExit(event) {
  if (!event || typeof event !== 'object') return null;
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
  const decision = detail.decision && typeof detail.decision === 'object'
    ? detail.decision
    : (detail.lastDecision && typeof detail.lastDecision === 'object' ? detail.lastDecision : {});
  const combat = decision.combat && typeof decision.combat === 'object'
    ? decision.combat
    : (detail.combat && typeof detail.combat === 'object' ? detail.combat : {});
  const combatExit = decision.combat?.exit && typeof decision.combat.exit === 'object'
    ? decision.combat.exit
    : (decision.action?.combatExit && typeof decision.action.combatExit === 'object'
        ? decision.action.combatExit
        : (detail.combat?.exit && typeof detail.combat.exit === 'object'
            ? detail.combat.exit
            : (detail.action?.combatExit && typeof detail.action.combatExit === 'object'
                ? detail.action.combatExit
                : {})));
  const metrics = combat.metrics && typeof combat.metrics === 'object' ? combat.metrics : {};
  const injury = decision.injury && typeof decision.injury === 'object'
    ? decision.injury
    : (detail.injury && typeof detail.injury === 'object' ? detail.injury : {});
  const leaveConfirmation = event.leaveConfirmation && typeof event.leaveConfirmation === 'object'
    ? event.leaveConfirmation
    : (detail.leaveConfirmation && typeof detail.leaveConfirmation === 'object' ? detail.leaveConfirmation : {});
  const missClose = combatExit.missClose && typeof combatExit.missClose === 'object'
    ? combatExit.missClose
    : {};
  const recoveryContact = event.recoveryContact && typeof event.recoveryContact === 'object'
    ? event.recoveryContact
    : (event.action?.recoveryContact && typeof event.action.recoveryContact === 'object'
        ? event.action.recoveryContact
        : (decision.action?.recoveryContact && typeof decision.action.recoveryContact === 'object'
            ? decision.action.recoveryContact
            : (detail.action?.recoveryContact && typeof detail.action.recoveryContact === 'object'
                ? detail.action.recoveryContact
                : (combatExit.recoveryContact && typeof combatExit.recoveryContact === 'object'
                    ? combatExit.recoveryContact
                    : {}))));
  const sourceSelf = decision.self || detail.self || decision.input?.self || combat.self || null;
  const sourceTarget = event.target || detail.target || decision.target || combatExit.target || combat.target || null;
  const combatTarget = combat.target || combat.dryRun?.target || null;
  const sourceTargetId = compactNumber(sourceTarget?.userId ?? sourceTarget?.user_id);
  const combatTargetId = compactNumber(combatTarget?.userId ?? combatTarget?.user_id);
  const metricsTargetId = compactNumber(metrics.targetId);
  const killConfirmation = event.killConfirmation && typeof event.killConfirmation === 'object'
    ? event.killConfirmation
    : (detail.killConfirmation && typeof detail.killConfirmation === 'object' ? detail.killConfirmation : {});
  const priorKillConfirmation = event.priorKillConfirmation && typeof event.priorKillConfirmation === 'object'
    ? event.priorKillConfirmation
    : (detail.priorKillConfirmation && typeof detail.priorKillConfirmation === 'object' ? detail.priorKillConfirmation : {});
  const killTargetId = compactNumber(
    killConfirmation.targetUserId
      ?? killConfirmation.target_user_id
      ?? killConfirmation.targetId
      ?? killConfirmation.userId
  );
  const priorKillTargetId = compactNumber(
    priorKillConfirmation.targetUserId
      ?? priorKillConfirmation.target_user_id
      ?? priorKillConfirmation.targetId
      ?? priorKillConfirmation.userId
  );
  const sourceTargetName = compactString(sourceTarget?.name || sourceTarget?.label, 80);
  const metricsTargetName = compactString(metrics.targetName, 80);
  const hasMetricsTarget = metricsTargetId !== null || Boolean(metricsTargetName);
  const metricsMatchSourceTarget = Boolean(sourceTarget && (
    (sourceTargetId !== null && metricsTargetId !== null && sourceTargetId === metricsTargetId)
      || ((sourceTargetId === null || metricsTargetId === null)
        && sourceTargetName
        && metricsTargetName
        && sourceTargetName === metricsTargetName)
  ));
  const metricsMatchCombatTarget = Boolean(combatTarget && (
    (combatTargetId !== null && metricsTargetId !== null && combatTargetId === metricsTargetId)
      || ((combatTargetId === null || metricsTargetId === null)
        && compactString(combatTarget?.name || combatTarget?.label, 80)
        && metricsTargetName
        && compactString(combatTarget?.name || combatTarget?.label, 80) === metricsTargetName)
  ));
  const at = compactString(event.at || event.time || event.createdAt, 48);
  const eventAtMs = parseTimeMs(at) || parseTimeMs(decision.at);
  const metricsLastObservedAtMs = compactNumber(metrics.lastObservedAt);
  const reason = compactString(event.reason || event.type, 120);
  const explicitBattleReason = reason.startsWith('combat-') || reason === 'injury-leave';
  const explicitCombatExit = Object.keys(combatExit).length > 0;
  const metricsFreshForExit = metricsLastObservedAtMs !== null
    ? eventAtMs > 0
      && metricsLastObservedAtMs <= eventAtMs
      && eventAtMs - metricsLastObservedAtMs <= RECENT_EXIT_COMBAT_ASSOCIATION_MAX_AGE_MS
    : explicitBattleReason;
  const metricsAssociated = Boolean(
    Object.keys(metrics).length
      && (!hasMetricsTarget || metricsMatchCombatTarget || (!combatTarget && metricsMatchSourceTarget))
      && metricsFreshForExit
  );
  const confirmedKill = Boolean(
    killTargetId !== null
      && ((metricsTargetId !== null && killTargetId === metricsTargetId)
        || (sourceTargetId !== null && killTargetId === sourceTargetId))
  );
  const confirmedKillAtMs = confirmedKill ? parseTimeMs(killConfirmation.at) : 0;
  const priorKillMatchesTarget = Boolean(
    compactString(priorKillConfirmation.targetReappearedAt, 48)
      && priorKillTargetId !== null
      && ((metricsTargetId !== null && priorKillTargetId === metricsTargetId)
        || (sourceTargetId !== null && priorKillTargetId === sourceTargetId))
  );
  const targetHpAtExit = compactNumber(
    combatExit.targetHp
      ?? combatExit.target?.hp
      ?? sourceTarget?.hp
      ?? combatTarget?.hp
      ?? metrics.lastTargetHp
  );
  // Older persisted exit events already contain `killConfirmation`. Reapply
  // the same separation at projection time so an upgrade immediately fixes
  // their presentation without rewriting historical logs.
  const legacyKillPrecedesReappearance = Boolean(
    confirmedKill
      && eventAtMs > 0
      && confirmedKillAtMs > 0
      && confirmedKillAtMs < eventAtMs
      && targetHpAtExit !== null
      && targetHpAtExit > 1
  );
  const targetReappearedAfterKill = priorKillMatchesTarget || legacyKillPrecedesReappearance;
  const reappearanceKillConfirmation = priorKillMatchesTarget ? priorKillConfirmation : killConfirmation;
  const terminalConfirmedKill = confirmedKill && !targetReappearedAfterKill;
  const battleMetrics = metricsAssociated ? metrics : {};
  const injuryEpisodeStartedAtMs = compactNumber(injury.episodeStartedAt);
  const injuryStartHp = compactNumber(injury.startHp);
  const injuryEndHp = compactNumber(injury.currentHp);
  const injuryTotalHpDrop = compactNumber(injury.totalHpDrop);
  const hasInjuryEpisode = injuryEpisodeStartedAtMs !== null
    && injuryStartHp !== null
    && injuryEndHp !== null
    && injuryTotalHpDrop !== null;
  const metricStartedAtMs = compactNumber(battleMetrics.startedAt);
  const combatStartedAtMs = (metricsAssociated || explicitBattleReason || explicitCombatExit)
    ? parseTimeMs(combat.startedAt)
    : 0;
  const startedAtMs = metricStartedAtMs !== null && metricStartedAtMs > 0
    ? metricStartedAtMs
    : (combatStartedAtMs > 0
        ? combatStartedAtMs
        : (explicitBattleReason && hasInjuryEpisode ? injuryEpisodeStartedAtMs : null));
  const endedAtMs = (terminalConfirmedKill ? confirmedKillAtMs : 0)
    || compactNumber(battleMetrics.lastObservedAt)
    || eventAtMs;
  const durationMs = ((metricsAssociated || explicitBattleReason || explicitCombatExit) ? compactNumber(combat.durationMs) : null)
    ?? (startedAtMs !== null && endedAtMs > 0 ? Math.max(0, endedAtMs - startedAtMs) : null);
  const selfDamage = metricsAssociated
    ? compactNumber(battleMetrics.selfDamage)
    : (explicitBattleReason && hasInjuryEpisode ? injuryTotalHpDrop : null);
  const rawTargetDamage = metricsAssociated ? compactNumber(battleMetrics.targetDamage) : null;
  const selfHealing = metricsAssociated ? compactNumber(battleMetrics.selfHealing) : null;
  const rawTargetHealing = metricsAssociated ? compactNumber(battleMetrics.targetHealing) : null;
  const selfHpEnd = metricsAssociated
    ? (compactNumber(battleMetrics.lastSelfHp)
      ?? compactNumber(combatExit.selfHp)
      ?? compactNumber(sourceSelf?.hp))
    : (explicitBattleReason && hasInjuryEpisode ? injuryEndHp : null);
  const selfHpStart = metricsAssociated
    ? (compactNumber(battleMetrics.initialSelfHp)
      ?? (selfHpEnd !== null && selfDamage !== null
        ? selfHpEnd + selfDamage - (selfHealing ?? 0)
        : null))
    : (explicitBattleReason && hasInjuryEpisode ? injuryStartHp : null);
  const targetHpEnd = metricsAssociated
    ? (terminalConfirmedKill
      ? 0
      : (compactNumber(battleMetrics.lastTargetHp)
        ?? (explicitCombatExit ? compactNumber(combatExit.targetHp) : null)))
    : null;
  const targetHpStart = metricsAssociated
    ? (compactNumber(battleMetrics.initialTargetHp)
      ?? (targetHpEnd !== null && rawTargetDamage !== null
        ? targetHpEnd + rawTargetDamage - (rawTargetHealing ?? 0)
        : null))
    : null;
  const targetDamage = terminalConfirmedKill && targetHpStart !== null
    ? Math.max(rawTargetDamage ?? 0, targetHpStart + (rawTargetHealing ?? 0))
    : rawTargetDamage;
  // A post-kill respawn is not combat healing. The raw metric is retained in
  // detailed logs, but omitted from the compact exit summary in favor of the
  // explicit reappearance marker below.
  const targetHealing = targetReappearedAfterKill ? null : rawTargetHealing;
  const battleTargetSource = metricsAssociated
    ? (metricsMatchCombatTarget ? combatTarget : (metricsMatchSourceTarget ? sourceTarget : null))
      || { userId: metricsTargetId, name: metricsTargetName }
    : sourceTarget;
  const target = compactTarget({
    ...(battleTargetSource && typeof battleTargetSource === 'object' ? battleTargetSource : {}),
    userId: battleTargetSource?.userId ?? battleTargetSource?.user_id ?? metricsTargetId,
    name: battleTargetSource?.name || metricsTargetName || '',
    hp: targetHpEnd ?? battleTargetSource?.hp
  });
  const rawRequestedShots = compactNumber(battleMetrics.requestedShots ?? battleMetrics.actualShots);
  const requestedShots = rawRequestedShots === null ? null : Math.max(0, rawRequestedShots);
  const rawAcceptedShots = compactNumber(battleMetrics.acceptedShots ?? battleMetrics.actualShots);
  const acceptedShots = rawAcceptedShots === null ? null : Math.max(0, rawAcceptedShots);
  const actualShots = acceptedShots;
  const rawConfirmedHits = compactNumber(battleMetrics.confirmedHits);
  const confirmedHits = rawConfirmedHits === null || acceptedShots === null
    ? null
    : Math.min(acceptedShots, Math.max(0, rawConfirmedHits));
  const estimatedHitRate = acceptedShots !== null && acceptedShots > 0 && confirmedHits !== null
    ? Number((confirmedHits / acceptedShots * 100).toFixed(1))
    : null;
  const hasBattleEvidence = Boolean(
    target
      && (
        (metricsAssociated && startedAtMs !== null)
        || requestedShots !== null
        || acceptedShots !== null
        || compactNumber(battleMetrics.confirmedHits) !== null
        || selfDamage !== null
        || targetDamage !== null
        || explicitCombatExit
        || explicitBattleReason
      )
  );
  let outcome = '';
  if (hasBattleEvidence) {
    if (targetHpEnd !== null && targetHpEnd <= 0) outcome = 'victory';
    else if (selfHpEnd !== null && selfHpEnd <= 0) outcome = 'defeat';
    else if (event.shouldLeave !== false && (metricsAssociated || explicitCombatExit || explicitBattleReason)) outcome = 'self-left';
    else outcome = 'ended';
  }
  return {
    at,
    reason,
    runId: compactString(event.runId || event.detail?.runId, 96),
    shouldLeave: event.shouldLeave === undefined ? null : Boolean(event.shouldLeave),
    target: compactTarget(sourceTarget),
    selfHp: compactNumber(event.selfHp ?? detail.selfHp ?? combatExit.selfHp),
    targetHp: compactNumber(event.targetHp ?? detail.targetHp ?? combatExit.targetHp ?? sourceTarget?.hp),
    hpGap: compactNumber(event.hpGap ?? detail.hpGap ?? combatExit.hpGap),
    threshold: compactNumber(event.threshold ?? detail.threshold ?? combatExit.threshold),
    minHpGap: compactNumber(event.minHpGap ?? detail.minHpGap ?? combatExit.minHpGap),
    targetHpSource: compactString(combatExit.targetHpSource, 80),
    engagedTargets: compactEngagedExitTargets(combatExit.engagedTargets),
    recoveryContact: compactRecoveryContact(recoveryContact),
    missClose: Object.keys(missClose).length
      ? {
          timeoutMs: compactNumber(missClose.timeoutMs),
          evaluationWindowMs: compactNumber(missClose.evaluationWindowMs),
          windowMode: compactString(missClose.attackEfficiency?.windowMode, 40),
          referenceDamageHp: compactNumber(missClose.attackEfficiency?.referenceDamageHp),
          expectedHitRate: compactNumber(missClose.attackEfficiency?.expectedHitRate),
          expectedShotsForReferenceDamage: compactNumber(missClose.attackEfficiency?.expectedShotsForReferenceDamage),
          expectedStaminaForReferenceDamage: compactNumber(missClose.attackEfficiency?.expectedStaminaForReferenceDamage),
          derivedWindowMs: compactNumber(missClose.attackEfficiency?.derivedWindowMs),
          stepElapsedMs: compactNumber(missClose.stepElapsedMs),
          stepIndex: compactNumber(missClose.stepIndex),
          stepStartDistanceCm: compactNumber(missClose.stepStartDistanceCm),
          goalDistanceCm: compactNumber(missClose.goalDistanceCm),
          bestDistanceCm: compactNumber(missClose.bestDistanceCm),
          targetDistance: compactNumber(missClose.targetDistance),
          closerTimeMs: compactNumber(missClose.closerTimeMs),
          closerRatio: compactNumber(missClose.closerRatio),
          outsideCloserRatio: compactNumber(missClose.outsideCloserRatio),
          requiredCloserRatio: compactNumber(missClose.requiredCloserRatio),
          acceptedShotsSinceDamage: compactNumber(missClose.acceptedShotsSinceDamage),
          damageFromStart: compactNumber(missClose.damageFromStart),
          targetDamageHp: compactNumber(missClose.attackEfficiency?.targetDamageHp
            ?? missClose.lastCompletedWindow?.targetDamageHp),
          staminaSpentMilli: compactNumber(missClose.attackEfficiency?.staminaSpentMilli
            ?? missClose.lastCompletedWindow?.staminaSpentMilli),
          damageEfficiencyHpPerStamina: compactNumber(
            missClose.attackEfficiency?.hpPerStamina
              ?? missClose.lastCompletedWindow?.damageEfficiencyHpPerStamina
          ),
          requiredHpPerStamina: compactNumber(
            missClose.attackEfficiency?.requiredHpPerStamina
              ?? missClose.lastCompletedWindow?.requiredHpPerStamina
          ),
          efficiencyLow: compactBoolean(missClose.attackEfficiency?.low
            ?? missClose.lastCompletedWindow?.lowDamageEfficiency),
          efficiencyMeasurable: compactBoolean(missClose.attackEfficiency?.measurable
            ?? missClose.lastCompletedWindow?.efficiencyMeasurable),
          rewardMultiplier: compactNumber(
            missClose.attackEfficiency?.reward?.rewardMultiplier
              ?? missClose.lastCompletedWindow?.rewardMultiplier
          ),
          effectiveRewardCoins: compactNumber(
            missClose.attackEfficiency?.reward?.effectiveRewardCoins
              ?? missClose.lastCompletedWindow?.effectiveRewardCoins
          ),
          targetDrop: compactNumber(
            missClose.attackEfficiency?.reward?.targetDrop
              ?? missClose.lastCompletedWindow?.targetDrop
          ),
          stepTimedOut: compactBoolean(missClose.stepTimedOut),
          distanceControlFailed: compactBoolean(missClose.distanceControlFailed),
          minimumRangeNoProgress: compactBoolean(missClose.minimumRangeNoProgress),
          exitRule: compactString(missClose.exitRule, 80)
        }
      : null,
    injury: Object.keys(injury).length
      ? {
          episodeStartedAt: compactNumber(injury.episodeStartedAt),
          startHp: compactNumber(injury.startHp),
          previousHp: compactNumber(injury.previousHp),
          currentHp: compactNumber(injury.currentHp),
          hpDrop: compactNumber(injury.hpDrop),
          totalHpDrop: compactNumber(injury.totalHpDrop),
          hitCount: compactNumber(injury.hitCount)
        }
      : null,
    leaveConfirmation: Object.keys(leaveConfirmation).length
      ? {
          at: compactString(leaveConfirmation.at, 48),
          selfHp: compactNumber(leaveConfirmation.selfHp),
          maxHp: compactNumber(leaveConfirmation.maxHp),
          triggerSelfHp: compactNumber(leaveConfirmation.triggerSelfHp),
          hpLossAfterTrigger: compactNumber(leaveConfirmation.hpLossAfterTrigger),
          source: compactString(leaveConfirmation.source, 48)
        }
      : null,
    battle: hasBattleEvidence
      ? {
          outcome,
          outcomeReason: compactString(event.reason || event.type, 120),
          startedAt: startedAtMs === null ? '' : isoFromMs(startedAtMs),
          endedAt: endedAtMs > 0 ? isoFromMs(endedAtMs) : at,
          durationMs,
          target,
          selfHpStart,
          selfHpEnd,
          targetHpStart,
          targetHpEnd,
          selfDamage,
          targetDamage,
          selfHealing,
          targetHealing,
          actualShots,
          requestedShots,
          acceptedShots,
          confirmedHits,
          estimatedHitRate,
          staminaSpentMs: compactNumber(battleMetrics.totalStaminaSpent),
          engagementId: compactString(battleMetrics.engagementId, 128),
          targetReappearedAfterKill,
          priorKillConfirmation: targetReappearedAfterKill
            ? {
                at: compactString(reappearanceKillConfirmation.at, 48),
                tick: compactNumber(reappearanceKillConfirmation.tick),
                source: compactString(reappearanceKillConfirmation.source, 48),
                targetReappearedAt: compactString(
                  priorKillMatchesTarget
                    ? priorKillConfirmation.targetReappearedAt
                    : (at || decision.at || detail.at),
                  48
                )
              }
            : null,
          killConfirmation: terminalConfirmedKill
            ? {
                at: compactString(killConfirmation.at, 48),
                tick: compactNumber(killConfirmation.tick),
                source: compactString(killConfirmation.source, 48)
              }
            : null
        }
      : null
  };
}

function recentExitRunId(event) {
  return compactString(event?.runId || event?.detail?.runId, 96);
}

function recentExitMatchesLastExit(event, lastExit = {}) {
  if (!event || typeof event !== 'object') return false;
  const lastReason = compactString(lastExit.reason, 160);
  const eventReason = compactString(event.reason || event.type, 160);
  if (lastReason && eventReason && lastReason !== eventReason) return false;

  const lastRunId = compactString(lastExit.runId, 96);
  const eventRunId = recentExitRunId(event);
  if (lastRunId && eventRunId) return lastRunId === eventRunId;

  const lastAtMs = parseTimeMs(lastExit.at);
  const eventAtMs = parseTimeMs(event.at || event.time || event.createdAt);
  if (lastAtMs > 0 && eventAtMs > 0) {
    return Math.abs(lastAtMs - eventAtMs) <= RECENT_EXIT_MATCH_WINDOW_MS;
  }
  return Boolean(lastReason && eventReason && lastReason === eventReason);
}

function latestMatchingRecentActualExit(recentExits, lastExit = {}) {
  const actualExits = (Array.isArray(recentExits) ? recentExits : [])
    .filter(event => event?.shouldLeave !== false)
    .reverse();
  if (!actualExits.length) return null;
  const hasLastExitIdentity = Boolean(lastExit?.at || lastExit?.reason || lastExit?.runId);
  if (!hasLastExitIdentity) return actualExits[0];
  return actualExits.find(event => recentExitMatchesLastExit(event, lastExit)) || null;
}

function compactAuthReason(normalized) {
  const runner = normalized?.runner || {};
  const run = runner.lastRun && typeof runner.lastRun === 'object' ? runner.lastRun : {};
  const canary = run.canary && typeof run.canary === 'object' ? run.canary : {};
  const candidates = [
    runner.lastError,
    runner.currentAction?.reason,
    run.error,
    run.reason,
    canary.error,
    canary.safety?.event?.reason,
    canary.safety?.leaveFailure?.reason
  ];
  return compactString(candidates.find(Boolean), 160);
}

function reasonLooksInvalidSession(reason) {
  return /websocket unexpected response 403|http 403|not logged in|unauthori[sz]ed|forbidden|invalid.*(?:token|session)|(?:token|session).*(?:expired|invalid)/i.test(String(reason || ''));
}

function compactAuthStatus(normalized, session = {}) {
  const tokenPresent = Boolean(session.tokenPresent);
  const userId = compactNumber(normalized?.session?.userId);
  const reason = compactAuthReason(normalized);
  const invalid = Boolean(userId && tokenPresent && reasonLooksInvalidSession(reason));
  const missing = Boolean(!userId || !tokenPresent || /^missing-manual-session$/i.test(reason));
  const state = invalid ? 'invalid' : (missing ? 'missing' : 'ready');
  const needsReauth = invalid || missing;
  return {
    state,
    needsReauth,
    invalid,
    missing,
    authenticated: Boolean(userId && tokenPresent && !invalid),
    userId,
    tokenPresent,
    tokenUpdatedAt: compactString(normalized?.session?.tokenUpdatedAt, 48),
    authUrl: compactString(normalized?.session?.lastAuthUrl, 4096),
    authUrlAt: compactString(normalized?.session?.lastAuthUrlAt, 48),
    lastLoginSource: compactString(normalized?.session?.lastLoginSource, 80),
    reason,
    prompt: invalid
      ? '登录信息可能已经失效，请重新授权'
      : (missing ? '缺少可用登录信息，请先授权' : '登录信息可用')
  };
}

function compactGameStatus(normalized) {
  const current = normalized.current || {};
  const self = current.self && typeof current.self === 'object' ? current.self : null;
  const currentSession = normalized.stats?.currentSession || {};
  const lastExit = normalized.stats?.lastExit || {};
  const action = normalized.runner?.currentAction || current.action || current.decision || {};
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  // `stop` is also the normal in-game zero-velocity action (for example,
  // combat-live-no-target). Only lifecycle waits/stopped state mean that
  // realtime control is offline.
  // These actions belong to the offline/exit lifecycle.  The previous
  // realtime decision may still be retained in `current.decision` while
  // preflight or snapshot safety is running; it must not make that stale
  // combat state look current.
  const waiting = [
    'loop-wait',
    'stopped',
    'snapshot-wait',
    'source-ip-preflight',
    'source-ip-preflight-cooldown',
    'source-ip-preflight-login',
    'source-ip-preflight-retry'
  ].includes(kind)
    || [
      'missing-manual-session',
      'snapshot-safety-retry',
      'login-point-bootstrap-failed',
      'unsupported-control-mode'
    ].includes(reason);
  const finalizedSession = Boolean(
    currentSession.online === false
      && (currentSession.exitedAt || lastExit.at)
  );
  const identifiedSelf = Boolean(self?.userId || self?.entityId || self?.name);
  const lastExitAtMs = Math.max(
    parseTimeMs(currentSession.exitedAt),
    parseTimeMs(lastExit.at)
  );
  const realtimeSelfAtMs = /^(?:realtime|pos)$/i.test(String(self?.authority || self?.source || ''))
    ? parseTimeMs(self?.receivedAtMs || self?.receivedAt)
    : 0;
  const realtimeEvidenceAtMs = Math.max(
    realtimeSelfAtMs,
    parseTimeMs(current.decision?.at),
    parseTimeMs(current.action?.command?.sentAt),
    parseTimeMs(normalized.runner?.currentAction?.command?.sentAt)
  );
  const postExitRealtimeEvidence = Boolean(
    lastExitAtMs > 0
      && realtimeEvidenceAtMs > lastExitAtMs
  );
  // An online session plus an active action remains authoritative during a
  // transient status projection that omits current.self. Fresh realtime
  // evidence after the recorded exit also closes a lagging stats projection;
  // cached pre-exit self data remains offline after a confirmed leave.
  const selfPresent = Boolean(identifiedSelf || currentSession.online === true)
    && !waiting
    && (!finalizedSession || postExitRealtimeEvidence);
  return {
    inGame: selfPresent,
    selfPresent,
    state: selfPresent ? 'in-game' : (waiting ? 'waiting' : 'not-in-game')
  };
}

function buildPublicBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const publicState = {
    schemaVersion: normalized.schemaVersion,
    updatedAt: normalized.updatedAt || '',
    session: {
      userId: normalized.session.userId,
      authenticated: normalized.session.authenticated,
      tokenPresent: Boolean(normalized.session.sessionToken),
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || '',
      lastAuthUrl: normalized.session.lastAuthUrl || '',
      lastAuthUrlAt: normalized.session.lastAuthUrlAt || '',
      lastLoginSource: normalized.session.lastLoginSource || '',
      lastLoginSummary: normalized.session.lastLoginSummary || null
    },
    runner: normalized.runner,
    probes: normalized.probes,
    loginPointSafety: normalized.loginPointSafety,
    current: normalized.current,
    mapTrails: normalized.mapTrails,
    lastKnown: normalized.lastKnown,
    recentExits: normalized.recentExits,
    network: normalized.network,
    stats: normalized.stats,
    logs: {
      dataDir: normalized.logs.dataDir || config.dataDir || '',
      logDir: normalized.logs.logDir || config.logDir || '',
      stateFile: normalized.logs.stateFile || (config.dataDir ? stateFilePath(config) : ''),
      currentDayDir: normalized.logs.currentDayDir || ''
    },
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken),
      webVersion: compactString(config.webVersion, 48)
    }
  };
  return redactStructuredSecrets(publicState);
}

function compactSnapshotProbeSource(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    startedAt: value.startedAt || '',
    completedAt: value.completedAt || '',
    checkedAt: value.checkedAt || '',
    updatedAt: value.updatedAt || '',
    at: value.at || '',
    snapshotSafety: value.snapshotSafety || null
  };
}

function compactLastRunSource(value) {
  if (!value || typeof value !== 'object') return null;
  const canary = value.canary && typeof value.canary === 'object' ? value.canary : {};
  return {
    error: value.error || '',
    reason: value.reason || '',
    canary: {
      error: canary.error || '',
      startedAt: canary.startedAt || '',
      completedAt: canary.completedAt || '',
      updatedAt: canary.updatedAt || '',
      at: canary.at || '',
      snapshotSafety: canary.snapshotSafety || null,
      safety: {
        event: canary.safety?.event ? { reason: canary.safety.event.reason || '' } : null,
        leaveFailure: canary.safety?.leaveFailure ? { reason: canary.safety.leaveFailure.reason || '' } : null
      }
    }
  };
}

function compactConnectionFailure(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    type: compactString(value.type, 80),
    operation: compactString(value.operation, 40),
    source: compactString(value.source, 100),
    detectedAt: compactString(value.detectedAt, 48),
    status: compactNumber(value.status),
    contentType: compactString(value.contentType, 120),
    cfRay: compactString(value.cfRay, 120),
    evidence: Array.isArray(value.evidence)
      ? value.evidence.map(item => compactString(item, 100)).filter(Boolean).slice(0, 8)
      : [],
    sourceIp: compactString(value.sourceIp, 64),
    inGameEvidence: value.inGameEvidence === undefined ? null : Boolean(value.inGameEvidence),
    leaveAttempted: value.leaveAttempted === undefined ? null : Boolean(value.leaveAttempted),
    leaveConfirmed: value.leaveConfirmed === undefined ? null : Boolean(value.leaveConfirmed)
  };
}

function compactRestartDrain(value) {
  if (!value || typeof value !== 'object' || !value.requested) return null;
  const assessment = value.assessment && typeof value.assessment === 'object'
    ? {
        ready: Boolean(value.assessment.ready),
        exiting: Boolean(value.assessment.exiting),
        reason: compactString(value.assessment.reason, 120)
      }
    : null;
  return {
    requested: true,
    reason: compactString(value.reason, 80),
    requestedAt: compactString(value.requestedAt, 48),
    commitmentKey: compactString(value.commitmentKey, 96),
    waitMs: compactNumber(value.waitMs),
    stableMs: compactNumber(value.stableMs),
    ready: Boolean(value.ready),
    assessment
  };
}

function compactProfitSource(profit) {
  if (!profit || typeof profit !== 'object') return null;
  const compact = compactProfit(profit);
  const threshold = profit.threshold && typeof profit.threshold === 'object' ? profit.threshold : null;
  return compact ? {
    best: compact.best,
    candidateCount: compact.candidateCount,
    threshold: threshold ? {
      active: threshold.active,
      reason: threshold.reason || '',
      threshold: {
        coinsPer10Stamina: threshold.threshold?.coinsPer10Stamina
      },
      remaining1dMilli: threshold.remaining1dMilli,
      burnCapacityMilli: threshold.burnCapacityMilli,
      resetAt: threshold.resetAt,
      reserveMs: threshold.reserveMs,
      rawCount: threshold.rawCount,
      eligibleCount: threshold.eligibleCount,
      filteredCount: threshold.filteredCount
    } : null
  } : null;
}

function compactRemoteProfitStatus(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    enabled: value.enabled !== false,
    ready: value.ready === true,
    busy: value.busy === true,
    failed: value.failed === true,
    workerNice: compactNumber(value.workerNice),
    generation: compactNumber(value.generation),
    latestRequestedGeneration: compactNumber(value.latestRequestedGeneration),
    latestPublishedGeneration: compactNumber(value.latestPublishedGeneration),
    snapshotAt: compactString(value.snapshotAt, 48),
    ageMs: compactNumber(value.ageMs),
    expiresAt: compactString(value.expiresAt, 48),
    pending: value.pending === true,
    candidateCount: compactNumber(value.candidateCount),
    highDropAfkCount: compactNumber(value.highDropAfkCount),
    easyKillActiveCount: compactNumber(value.easyKillActiveCount),
    postMs: compactNumber(value.postMs),
    postCpuMs: compactNumber(value.postCpuMs),
    publicationCpuMs: compactNumber(value.publicationCpuMs),
    computeMs: compactNumber(value.computeMs),
    roundTripMs: compactNumber(value.roundTripMs),
    maxPostMs: compactNumber(value.maxPostMs),
    maxPostCpuMs: compactNumber(value.maxPostCpuMs),
    maxPublicationCpuMs: compactNumber(value.maxPublicationCpuMs),
    maxContextSerializationCpuMs: compactNumber(value.maxContextSerializationCpuMs),
    maxContextSerializationMs: compactNumber(value.maxContextSerializationMs),
    maxComputeMs: compactNumber(value.maxComputeMs),
    maxRoundTripMs: compactNumber(value.maxRoundTripMs),
    completed: compactNumber(value.completed),
    discarded: compactNumber(value.discarded),
    timeouts: compactNumber(value.timeouts),
    realtimeSupersededCount: compactNumber(value.realtimeSupersededCount),
    missSuppressedCount: compactNumber(value.missSuppressedCount),
    selected: value.selected && typeof value.selected === 'object'
      ? {
          userId: compactNumber(value.selected.userId),
          classification: compactString(value.selected.remoteClassification, 40),
          x: compactNumber(value.selected.x),
          y: compactNumber(value.selected.y),
          adjustedScore: compactNumber(value.selected.adjustedScore),
          distanceFactor: compactNumber(value.selected.distanceFactor)
        }
      : null,
    lastError: compactString(value.lastError, 160),
    lastErrorAt: compactString(value.lastErrorAt, 48)
  };
}

function compactDecisionSource(decision) {
  if (!decision || typeof decision !== 'object') return null;
  const compact = compactDecision(decision);
  const dataGaps = Array.isArray(decision.input?.dataGaps) ? decision.input.dataGaps : [];
  return {
    kind: compact?.kind || '',
    band: compact?.band || '',
    reason: compact?.reason || '',
    at: compact?.at || '',
    tick: compact?.tick,
    target: compact?.target || null,
    action: compact?.action || {
      kind: compact?.actionKind || '',
      target: compact?.target || null
    },
    profit: compactProfitSource(decision.profit),
    combat: compactCombat(decision.combat),
    input: {
      centerActivity: compactCenterActivity(decision.input?.centerActivity),
      nearby: compactNearby(decision.input?.nearby),
      dataGaps: dataGaps.slice(0, 5),
      dataGapCount: dataGaps.length,
      realtime: { tick: decision.input?.realtime?.tick ?? decision.tick ?? null }
    }
  };
}

function browserlessCompactStatusSource(state = {}) {
  const runner = state.runner && typeof state.runner === 'object' ? state.runner : {};
  const probes = state.probes && typeof state.probes === 'object' ? state.probes : {};
  const current = state.current && typeof state.current === 'object' ? state.current : {};
  return {
    schemaVersion: state.schemaVersion,
    updatedAt: state.updatedAt || '',
    snapshotAt: state.snapshotAt || '',
    snapshotTick: compactNumber(state.snapshotTick),
    session: {
      userId: state.session?.userId ?? null,
      authenticated: Boolean(state.session?.authenticated),
      tokenPresent: Boolean(state.session?.tokenPresent || state.session?.sessionToken),
      tokenUpdatedAt: state.session?.tokenUpdatedAt || ''
    },
    runner: {
      running: Boolean(runner.running),
      mode: runner.mode || '',
      readOnly: runner.readOnly !== false,
      controlMode: runner.controlMode || 'read-only',
      canaryProfile: runner.canaryProfile || '',
      dryRun: runner.dryRun !== false,
      combatEnabled: Boolean(runner.combatEnabled),
      lastError: runner.lastError || '',
      connectionFailure: compactConnectionFailure(runner.connectionFailure),
      restartDrain: runner.restartDrain || null,
      currentAction: compactAction(runner.currentAction),
      remoteProfit: compactRemoteProfitStatus(runner.remoteProfit || state.remoteProfit),
      lastRun: compactLastRunSource(runner.lastRun)
    },
    probes: {
      lastSnapshotProbe: compactSnapshotProbeSource(probes.lastSnapshotProbe),
      lastReadOnlyProbe: compactSnapshotProbeSource(probes.lastReadOnlyProbe)
    },
    loginPointSafety: state.loginPointSafety || {},
    current: {
      self: compactSelf(current.self),
      stamina: compactStamina(current.stamina, current.self),
      action: compactAction(current.action),
      decision: compactDecisionSource(current.decision),
      profit: compactProfitSource(current.profit || current.decision?.profit),
      combatSummary: compactCombat(current.combatSummary || current.decision?.combat),
      battlePresentation: current.battlePresentation && typeof current.battlePresentation === 'object'
        ? {
            targetKey: compactString(current.battlePresentation.targetKey, 128),
            startedAt: compactString(current.battlePresentation.startedAt, 48),
            startX: compactNumber(current.battlePresentation.startX),
            startY: compactNumber(current.battlePresentation.startY),
            movementDistance: compactNumber(current.battlePresentation.movementDistance),
            activity: current.battlePresentation.activity && typeof current.battlePresentation.activity === 'object'
              ? {
                  windowMs: compactNumber(current.battlePresentation.activity.windowMs),
                  self: {
                    movingAt: compactNumber(current.battlePresentation.activity.self?.movingAt),
                    firingAt: compactNumber(current.battlePresentation.activity.self?.firingAt)
                  },
                  target: {
                    movingAt: compactNumber(current.battlePresentation.activity.target?.movingAt),
                    firingAt: compactNumber(current.battlePresentation.activity.target?.firingAt)
                  }
                }
              : null
          }
        : null
    },
    lastKnown: state.lastKnown || {},
    recentExits: Array.isArray(state.recentExits) ? state.recentExits : [],
    network: {
      sourceIp: compactString(state.network?.sourceIp, 48),
      sourceIps: uniqueIpv4(state.network?.sourceIps).slice(0, 3),
      lifecycleSourceIps: uniqueIpv4(state.network?.lifecycleSourceIps).slice(0, 3),
      lifecycleSourceIpIndex: compactNumber(state.network?.lifecycleSourceIpIndex),
      lifecyclePreparedAt: compactString(state.network?.lifecyclePreparedAt, 48),
      sourceIpRiskCount: sourceIpRiskCount(state.network || {}),
      sourceIpPreflight: compactSourceIpPreflight(state.network || {}),
      sourceIpProbe: compactSourceIpProbe(state.network || {}),
      lastSelectedAt: compactString(state.network?.lastSelectedAt, 48),
      lastSelectionReason: compactString(state.network?.lastSelectionReason, 120),
      transportHealth: compactTransportHealth(state.network?.transportHealth)
    },
    stats: state.stats || {},
    logs: { stateFile: state.logs?.stateFile || '' },
    highDropPlayers: compactHighDropPlayers(state.highDropPlayers),
    easyKillPlayers: compactEasyKillPlayers(state.easyKillPlayers),
    dailyDamagePlayers: compactDailyDamagePlayers(state.dailyDamagePlayers),
    dynamicWhitelist: compactDynamicWhitelist(state.dynamicWhitelist),
    remoteProfit: compactRemoteProfitStatus(state.remoteProfit || runner.remoteProfit),
    mapTrails: compactMapTrails(state.mapTrails),
    statusRender: state.statusRender || null
  };
}

function buildCompactBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const inputSession = state?.session && typeof state.session === 'object' ? state.session : {};
  const tokenPresent = Boolean(normalized.session.sessionToken || inputSession.tokenPresent);
  const authenticated = Boolean(inputSession.authenticated || (normalized.session.userId && tokenPresent));
  const auth = compactAuthStatus(normalized, { tokenPresent, authenticated });
  const current = normalized.current || {};
  const inputCurrent = state?.current && typeof state.current === 'object' ? state.current : {};
  const decision = compactDecision(inputCurrent.decision || current.decision);
  const game = compactGameStatus(normalized);
  const combat = compactCombat(current.combatSummary || current.decision?.combat);
  const executedAction = compactAction(normalized.runner.currentAction) || compactAction(current.action);
  const rejectedCombatDecision = rejectedTargetlessCombatDecision(decision, combat);
  // The decision input and nearby panel are one realtime observation. Prefer
  // its action summary so a later action-result callback cannot leave the UI
  // showing an older wait state beside newly observed loot. When the combat
  // adapter explicitly rejects a missing target, the executed stop is newer
  // authority than the retained arbitration action.
  const executedIsLifecycle = lifecycleActionKind(executedAction?.kind, executedAction?.reason);
  const action = game.inGame
    ? (executedIsLifecycle || rejectedCombatDecision
      ? (executedAction || decision?.action)
      : (decision?.action || executedAction))
    : (executedAction || decision?.action);
  const recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits : [];
  const recentActualExit = latestMatchingRecentActualExit(recentExits, normalized.stats?.lastExit);
  const loginPointSafetyDetail = compactLoginPointSafetyDetail(normalized.loginPointSafety || {}, normalized);
  const loginPoint = compactPoint(normalized.loginPointSafety?.point) || loginPointSafetyDetail?.point || null;
  const lastKnown = compactLastKnown(normalized);
  const sourceIp = normalized.network.sourceIp || '';
  const lifecycleSourceIps = uniqueIpv4(normalized.network.lifecycleSourceIps).slice(0, 3);
  const sourceIps = lifecycleSourceIps.length
    ? lifecycleSourceIps
    : (Array.isArray(normalized.network.sourceIps) ? normalized.network.sourceIps.slice(0, 3) : []);
  const sourceIpIndex = sourceIp ? sourceIps.findIndex(item => item === sourceIp) + 1 : 0;
  const recentExit = compactExit(recentActualExit);
  const displayCombat = !game.inGame && recentExit?.battle?.target
    ? {
        ...(combat || {}),
        target: recentExit.battle.target
      }
    : combat;
  const compactState = {
    schemaVersion: normalized.schemaVersion,
    compact: true,
    updatedAt: normalized.updatedAt || '',
    snapshotAt: decision?.at || normalized.updatedAt || '',
    snapshotTick: decision?.tick ?? null,
    session: {
      userId: normalized.session.userId,
      authenticated: auth.authenticated,
      tokenPresent,
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || ''
    },
    auth,
    runner: {
      running: normalized.runner.running,
      mode: normalized.runner.mode || '',
      readOnly: normalized.runner.readOnly,
      controlMode: normalized.runner.controlMode || '',
      canaryProfile: normalized.runner.canaryProfile || '',
      dryRun: normalized.runner.dryRun,
      combatEnabled: Boolean(normalized.runner.combatEnabled),
      connectionFailure: compactConnectionFailure(
        normalized.runner.connectionFailure
          || normalized.runner.lastRun?.canary?.connectionFailure
      ),
      restartDrain: compactRestartDrain(normalized.runner.restartDrain),
      lastError: compactString(normalized.runner.lastError, 160)
    },
    game,
    self: compactSelf(current.self),
    stamina: compactStamina(current.stamina, current.self),
    lastKnown,
    decision,
    action,
    profit: compactProfit(current.profit || current.decision?.profit),
    combat: displayCombat,
    battle: compactBattleStatus(normalized, game, action, decision, displayCombat, config),
    nearby: compactNearby(current.decision?.input?.nearby),
    mapTrails: compactMapTrails(normalized.mapTrails),
    highDropPlayers: compactHighDropPlayers(normalized.highDropPlayers),
    easyKillPlayers: compactEasyKillPlayers(normalized.easyKillPlayers),
    dailyDamagePlayers: compactDailyDamagePlayers(normalized.dailyDamagePlayers),
    dynamicWhitelist: compactDynamicWhitelist(normalized.dynamicWhitelist),
    stats: compactBrowserlessStats(normalized, game, action, config, lastKnown),
    loginPointSafety: {
      ok: Boolean(normalized.loginPointSafety?.ok),
      reason: compactString(normalized.loginPointSafety?.reason, 120),
      checkedAt: normalized.loginPointSafety?.checkedAt || '',
      point: loginPoint,
      detail: loginPointSafetyDetail
    },
    network: {
      sourceIp,
      sourceIpIndex: sourceIpIndex > 0 ? sourceIpIndex : null,
      sourceIpCount: sourceIps.length,
      lifecycleSourceIps,
      lifecycleSourceIpIndex: compactNumber(normalized.network.lifecycleSourceIpIndex),
      lifecyclePreparedAt: normalized.network.lifecyclePreparedAt || '',
      sourceIpRiskCount: sourceIpRiskCount(normalized.network),
      sourceIpPreflight: compactSourceIpPreflight(normalized.network),
      sourceIpProbe: compactSourceIpProbe(normalized.network),
      lastSelectedAt: normalized.network.lastSelectedAt || '',
      lastSelectionReason: compactString(normalized.network.lastSelectionReason, 120),
      transportHealth: compactTransportHealth(normalized.network.transportHealth)
    },
    recentExit,
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken),
      webVersion: compactString(config.webVersion, 48),
      renderTiming: normalized.statusRender && typeof normalized.statusRender === 'object'
        ? {
            sourceBuildMs: compactNumber(normalized.statusRender.sourceBuildMs),
            compactProjectionMs: compactNumber(normalized.statusRender.compactProjectionMs),
            postMessageMs: compactNumber(normalized.statusRender.postMessageMs),
            workerComputeMs: compactNumber(normalized.statusRender.workerComputeMs),
            roundTripMs: compactNumber(normalized.statusRender.roundTripMs),
            responseSendMs: compactNumber(normalized.statusRender.responseSendMs),
            bytes: compactNumber(normalized.statusRender.bytes),
            renderedAt: compactString(normalized.statusRender.renderedAt, 48),
            cacheMaxStaleMs: compactNumber(normalized.statusRender.cacheMaxStaleMs),
            logQueue: normalized.statusRender.logQueue && typeof normalized.statusRender.logQueue === 'object'
              ? {
                  ok: Boolean(normalized.statusRender.logQueue.ok),
                  pending: compactNumber(normalized.statusRender.logQueue.pending),
                  pendingRequests: compactNumber(normalized.statusRender.logQueue.pendingRequests),
                  operationErrorCount: compactNumber(normalized.statusRender.logQueue.operationErrorCount)
                }
              : null,
            renderQueue: normalized.statusRender.renderQueue && typeof normalized.statusRender.renderQueue === 'object'
              ? {
                  ok: Boolean(normalized.statusRender.renderQueue.ok),
                  pending: compactNumber(normalized.statusRender.renderQueue.pending),
                  pendingRequests: compactNumber(normalized.statusRender.renderQueue.pendingRequests),
                  operationErrorCount: compactNumber(normalized.statusRender.renderQueue.operationErrorCount)
                }
              : null
          }
        : null
    }
  };
  return redactStructuredSecrets(compactState);
}

module.exports = {
  browserlessPatchFromLegacyState,
  browserlessStatsForDecision,
  browserlessStatsForKillEvidence,
  browserlessStatsForOffline,
  browserlessCompactStatusSource,
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus,
  compactSourceIpPreflight,
  defaultBrowserlessState,
  loginPointFromAnyState,
  mergeLiveActionState,
  mergeLiveState,
  mergeState,
  reconcileBrowserlessExitKillEvidence,
  readBrowserlessStateFile,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
};
