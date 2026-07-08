'use strict';

const { parseGrzFrame } = require('../../shared/grz-frame');
const {
  buildSnapshotProbeUrl,
  fetchWithTimeout,
  readResponseBody,
  redactSecrets,
  summarizeSnapshotPayload
} = require('./session-client');
const { createFrameStats, updateFrameStats } = require('./frame-stats');
const { createBrowserlessStateStore } = require('./state-store');
const { openBrowserlessWs, isWsOpen } = require('./ws-transport');
const { leaveWithVerification } = require('./leave-client');
const {
  createBrowserlessDecisionAdapter,
  summarizeBrowserlessDecision
} = require('./decision-adapter');

const DEFAULT_READONLY_PROBE_MS = 30000;
const DEFAULT_FRAME_GAP_ALERT_MS = 5000;

function normalizeFrameData(data) {
  let value = data;
  const seen = new Set();
  while (
    value
    && typeof value === 'object'
    && typeof value !== 'string'
    && !Buffer.isBuffer(value)
    && !(value instanceof ArrayBuffer)
    && !ArrayBuffer.isView(value)
  ) {
    if (seen.has(value)) break;
    seen.add(value);
    if ('data' in value) {
      value = value.data;
      continue;
    }
    break;
  }
  return value;
}

function frameDataToBuffer(data) {
  const value = normalizeFrameData(data);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function loginPointFromState(state) {
  const point = state?.loginPointSafety?.point || state?.current?.self || state?.lastSelfSummary || null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    hp: Number.isFinite(Number(point.hp)) ? Number(point.hp) : null,
    source: point.source || 'state'
  };
}

async function runPreLoginSnapshotSafety(config, state, deps = {}) {
  const loginPoint = loginPointFromState(state);
  if (!loginPoint) {
    return {
      ok: false,
      reason: 'missing-login-point',
      loginPoint: null
    };
  }
  const url = buildSnapshotProbeUrl({
    gameOrigin: config.gameOrigin,
    snapshotPath: config.snapshotPath || '/snapshot',
    userId: config.userId,
    sessionToken: config.sessionToken
  });
  const fetchImpl = deps.fetchImpl;
  const response = await (deps.fetchWithTimeout || fetchWithTimeout)(url, {
    fetchImpl,
    timeoutMs: config.httpTimeoutMs || config.wsConnectTimeoutMs || 10000,
    method: 'GET',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const summary = summarizeSnapshotPayload(body.json, {
    userId: config.userId,
    loginPoint,
    latestKnownTick: state?.frameAges?.latestKnownTick || state?.latestKnownTick || 0
  });
  return {
    ok: Boolean(response.ok && summary.valid && summary.safety?.ok),
    reason: response.ok ? (summary.safety?.reason || 'invalid-payload') : `snapshot-http-${response.status}`,
    request: { url: redactSecrets(url) },
    response: {
      httpOk: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      summary
    },
    loginPoint
  };
}

function inspectCanaryFrame(data, options = {}) {
  const buffer = frameDataToBuffer(data);
  if (!buffer) return { kind: 'text', sample: String(normalizeFrameData(data) || '').slice(0, 240) };
  const frame = {
    kind: 'binary',
    byteLength: buffer.length,
    prefixHex: buffer.subarray(0, 16).toString('hex')
  };
  Object.assign(frame, parseGrzFrame(buffer, {
    userId: options.userId,
    includeJson: true
  }));
  return frame;
}

async function runReadOnlyCanary(config, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const logStore = options.logStore || null;
  const durationMs = Math.max(1000, Number(config.readOnlyProbeMs || DEFAULT_READONLY_PROBE_MS));
  const frameGapAlertMs = Math.max(1000, Number(config.frameGapAlertMs || DEFAULT_FRAME_GAP_ALERT_MS));
  const decisionIntervalMs = Math.max(250, Number(config.decisionIntervalMs || 1000));
  const stateStore = options.stateStore || createBrowserlessStateStore({ userId: config.userId, now });
  const decisionAdapter = options.decisionAdapter || createBrowserlessDecisionAdapter({ userId: config.userId, now });
  const stats = createFrameStats(durationMs);
  const frameHealth = {
    firstFrameAtMs: 0,
    lastFrameAtMs: 0,
    maxFrameGapMs: 0,
    decodeErrors: 0
  };
  const startedAt = now();
  const result = {
    ok: false,
    mode: 'read-only',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: '',
    durationTargetMs: durationMs,
    snapshotSafety: null,
    stats,
    frameHealth,
    decisions: {
      intervalMs: decisionIntervalMs,
      evaluatedCount: 0,
      loggedCount: 0,
      last: null
    },
    leave: null,
    error: ''
  };
  let lastDecisionAtMs = 0;

  const log = (type, detail) => {
    if (logStore) logStore.append('runner', type, detail);
  };
  const logDecision = detail => {
    if (logStore) logStore.append('decisions', 'decision', detail);
  };

  result.snapshotSafety = await (options.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(config, options.persistedState || {}, options);
  log('canary-snapshot-safety', result.snapshotSafety);
  if (!result.snapshotSafety.ok) {
    result.error = `snapshot safety not confirmed: ${result.snapshotSafety.reason}`;
    result.completedAt = new Date(now()).toISOString();
    log('canary-blocked', { error: result.error });
    return result;
  }

  let transport = null;
  try {
    const open = options.openBrowserlessWs || openBrowserlessWs;
    transport = await open({
      gameOrigin: config.gameOrigin,
      wsPath: config.wsPath,
      wsExtraQuery: config.wsExtraQuery,
      userId: config.userId,
      sessionToken: config.sessionToken,
      connectTimeoutMs: config.wsConnectTimeoutMs,
      onMessage: data => {
        const atMs = now();
        if (!frameHealth.firstFrameAtMs) frameHealth.firstFrameAtMs = atMs;
        if (frameHealth.lastFrameAtMs) frameHealth.maxFrameGapMs = Math.max(frameHealth.maxFrameGapMs, atMs - frameHealth.lastFrameAtMs);
        frameHealth.lastFrameAtMs = atMs;
        const frame = inspectCanaryFrame(data, { userId: config.userId });
        if (frame.decodeError || frame.jsonParseError) frameHealth.decodeErrors += 1;
        updateFrameStats(stats, {
          at: new Date(atMs).toISOString(),
          ...frame
        });
        if (frame.decodedJson) {
          stateStore.ingestFrame(frame.decodedJson, { receivedAtMs: atMs });
          if (!lastDecisionAtMs || atMs - lastDecisionAtMs >= decisionIntervalMs) {
            const currentState = stateStore.getState(atMs);
            const decision = decisionAdapter.decide(currentState, { nowMs: atMs });
            const summary = summarizeBrowserlessDecision(decision);
            result.decisions.evaluatedCount += 1;
            result.decisions.last = summary;
            lastDecisionAtMs = atMs;
            logDecision(summary);
            result.decisions.loggedCount += 1;
            if (typeof options.onDecision === 'function') {
              try {
                options.onDecision(summary, { state: currentState, decision });
              } catch (err) {
                log('canary-decision-status-error', { error: err?.message || String(err) });
              }
            }
          }
        }
      }
    });
    log('canary-ws-open', { durationMs });
    await sleep(durationMs);
  } catch (err) {
    result.error = err?.message || String(err);
    log('canary-error', { error: result.error });
  }

  if (transport || !result.error) {
    const leave = options.leaveWithVerification || leaveWithVerification;
    result.leave = await leave({
      gameOrigin: config.gameOrigin,
      userId: config.userId,
      sessionToken: config.sessionToken,
      timeoutMs: config.httpTimeoutMs || 10000,
      retryMax: config.leaveRetryMax ?? 3,
      retryDelayMs: config.leaveRetryMs ?? 1200
    });
  }

  try {
    if (transport && (transport.isOpen?.() || isWsOpen(transport.ws))) transport.close();
  } catch (_) {}

  const noFrames = Number(stats.decodedFrameCount || 0) <= 0;
  const noSelf = Number(stats.selfPresent.true || 0) <= 0;
  const frameGap = Number(frameHealth.maxFrameGapMs || 0) > frameGapAlertMs;
  const leaveFailed = !result.leave?.ok;
  if (!result.error && noFrames) result.error = 'no decoded frames received';
  if (!result.error && noSelf) result.error = 'self not observed in realtime frames';
  if (!result.error && frameGap) result.error = `frame gap exceeded ${frameGapAlertMs}ms`;
  if (!result.error && leaveFailed) result.error = 'leave not confirmed';
  result.state = stateStore.getState(now());
  result.ok = Boolean(!result.error);
  result.completedAt = new Date(now()).toISOString();
  log(result.ok ? 'canary-finish' : 'canary-failed', result);
  return result;
}

module.exports = {
  frameDataToBuffer,
  inspectCanaryFrame,
  loginPointFromState,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
};
