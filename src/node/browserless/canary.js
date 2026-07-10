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
  buildBrowserlessRuntimeDefaults,
  createBrowserlessDecisionAdapter,
  summarizeBrowserlessDecision
} = require('./decision-adapter');
const {
  createBrowserlessSafetyController,
  createSafetyEvent,
  executeSafetyExit
} = require('./safety-controller');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { createBrowserlessTargetWhitelist } = require('./target-whitelist');

const DEFAULT_READONLY_PROBE_MS = 30000;
const DEFAULT_FRAME_GAP_ALERT_MS = 5000;

function snapshotSafetySelfPresent(snapshotSafety) {
  return Boolean(snapshotSafety?.response?.summary?.selfPresent);
}

function allowSelfPresentSnapshotControl(snapshotSafety) {
  if (!snapshotSafety || snapshotSafety.ok || !snapshotSafetySelfPresent(snapshotSafety)) return snapshotSafety;
  return {
    ...snapshotSafety,
    ok: true,
    reason: 'self-present-reentry',
    originalReason: snapshotSafety.reason || '',
    bypassedPreLoginSafety: true
  };
}

function errorMessage(error) {
  return error?.message || String(error || 'unknown error');
}

function createCanaryRunId(mode, startedAtMs) {
  const stamp = new Date(startedAtMs).toISOString().replace(/[-:.]/g, '');
  return `${String(mode || 'canary')}-${stamp}`;
}

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
    localAddress: config.sourceIp,
    method: 'GET',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const summary = summarizeSnapshotPayload(body.json, {
    userId: config.userId,
    loginPoint,
    latestKnownTick: state?.frameAges?.latestKnownTick || state?.latestKnownTick || 0
  });
  if (response.ok && summary.valid && summary.selfPresent) {
    return {
      ok: true,
      reason: 'self-present-reentry',
      originalReason: summary.safety?.reason || '',
      bypassedPreLoginSafety: true,
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
  if (!loginPoint) {
    return {
      ok: false,
      reason: 'missing-login-point',
      request: { url: redactSecrets(url) },
      response: {
        httpOk: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        summary
      },
      loginPoint: null
    };
  }
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

function wsTracePayloadPatch(payload, config = {}) {
  if (config.wsTracePayload === false || payload === undefined) return {};
  const maxChars = Math.max(0, Number(config.wsTraceMaxPayloadChars || 0));
  if (maxChars > 0) {
    const text = redactSecrets(JSON.stringify(payload));
    return {
      payloadJsonSample: text.slice(0, maxChars),
      payloadTruncated: text.length > maxChars,
      payloadJsonLength: text.length
    };
  }
  return { payload };
}

function buildWsFrameTrace(frame, config = {}) {
  const base = {
    direction: 'in',
    kind: frame?.kind || '',
    byteLength: frame?.byteLength ?? null,
    prefixHex: frame?.prefixHex || '',
    format: frame?.format || '',
    version: frame?.version ?? null,
    compression: frame?.compression || '',
    payloadByteLength: frame?.payloadByteLength ?? null,
    decodedByteLength: frame?.decodedByteLength ?? null,
    decodedType: frame?.decodedType || '',
    decodedTick: frame?.decodedTick ?? null,
    decodedJsonKeys: frame?.decodedJsonKeys || [],
    decodedSummary: frame?.decodedSummary || null,
    decodeError: frame?.decodeError || '',
    jsonParseError: frame?.jsonParseError || ''
  };
  if (frame?.kind === 'text') {
    return {
      ...base,
      sample: redactSecrets(frame.sample || '')
    };
  }
  return {
    ...base,
    ...wsTracePayloadPatch(frame?.decodedJson, config)
  };
}

async function runReadOnlyCanary(config, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const logStore = options.logStore || null;
  const controlMode = config.controlMode || (config.readOnly === false ? 'movement-only' : 'read-only');
  const combatLiveEnabled = (controlMode === 'combat-live' || controlMode === 'profit-live') && config.combatEnabled === true;
  const actionEnabled = controlMode === 'movement-only' || controlMode === 'non-combat-profit' || controlMode === 'profit-live' || combatLiveEnabled;
  const durationMs = Math.max(1000, Number(config.readOnlyProbeMs || DEFAULT_READONLY_PROBE_MS));
  const frameGapAlertMs = Math.max(1000, Number(config.frameGapAlertMs || DEFAULT_FRAME_GAP_ALERT_MS));
  const decisionIntervalMs = Math.max(250, Number(config.decisionIntervalMs || 1000));
  const stateStore = options.stateStore || createBrowserlessStateStore({ userId: config.userId, now });
  const runtimeDefaults = buildBrowserlessRuntimeDefaults(config);
  const targetWhitelist = options.targetWhitelist || createBrowserlessTargetWhitelist({
    url: Object.prototype.hasOwnProperty.call(config, 'targetWhitelistUrl') ? config.targetWhitelistUrl : '',
    file: Object.prototype.hasOwnProperty.call(config, 'targetWhitelistFile') ? config.targetWhitelistFile : '',
    timeoutMs: config.targetWhitelistTimeoutMs,
    maxNames: config.targetWhitelistMaxNames,
    localAddress: config.sourceIp,
    fetchWithTimeout: options.fetchWithTimeout,
    fetchImpl: options.fetchImpl,
    now
  });
  let targetWhitelistSummary = null;
  try {
    targetWhitelistSummary = await targetWhitelist.refresh('canary-startup');
  } catch (err) {
    targetWhitelistSummary = {
      loaded: false,
      lastReason: 'canary-startup-failed',
      lastError: errorMessage(err)
    };
  }
  const decisionAdapter = options.decisionAdapter || createBrowserlessDecisionAdapter({
    ...runtimeDefaults,
    userId: config.userId,
    now,
    controlMode,
    decisionIntervalMs,
    readOnlyProbeMs: durationMs,
    loopDelayMs: config.loopDelayMs,
    targetWhitelistNames: targetWhitelist.names,
    targetWhitelistNameSet: targetWhitelist.nameSet,
    whitelistCheck: target => targetWhitelist.isWhitelistedTarget(target)
  });
  const safetyController = options.safetyController || createBrowserlessSafetyController({
    now,
    frameGapAlertMs,
    staleSelfMs: config.staleSelfMs,
    noSelfGraceMs: config.noSelfGraceMs,
    staminaExhaustedBelowMs: config.staminaExhaustedBelowMs
  });
  const stats = createFrameStats(durationMs);
  const frameHealth = {
    firstFrameAtMs: 0,
    lastFrameAtMs: 0,
    maxFrameGapMs: 0,
    decodeErrors: 0
  };
  const startedAt = now();
  const runId = String(options.runId || createCanaryRunId(controlMode, startedAt));
  const result = {
    ok: false,
    runId,
    mode: controlMode,
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
    safety: {
      event: null,
      exit: null,
      leaveFailure: null
    },
    actions: {
      enabled: actionEnabled,
      sentCount: 0,
      velocitySentCount: 0,
      velocityRepeatSentCount: 0,
      shootSentCount: 0,
      shootRepeatSentCount: 0,
      stopCount: 0,
      skippedCount: 0,
      last: null,
      settlement: null,
      lastShootAck: null
    },
    entry: {
      firstSelf: null,
      firstSelfAt: '',
      firstSelfTick: null
    },
    leave: null,
    targetWhitelist: targetWhitelistSummary,
    error: ''
  };
  let lastDecisionAtMs = 0;
  let wsError = null;
  let wsClosed = null;
  let ending = false;
  let deadlineAtMs = 0;
  let actionAdapter = null;
  let openFailedBeforeTransport = false;
  const addRunMeta = detail => {
    const base = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail
      : { value: detail };
    return {
      ...base,
      runId,
      canaryMode: controlMode,
      canaryStartedAt: result.startedAt
    };
  };

  const log = (type, detail) => {
    if (logStore) logStore.append('runner', type, addRunMeta(detail));
  };
  const logDecision = detail => {
    if (logStore) logStore.append('decisions', 'decision', addRunMeta(detail));
  };
  const logSafety = detail => {
    if (logStore) logStore.append('exits', 'safety-event', addRunMeta(detail));
  };
  const logAction = detail => {
    if (logStore) logStore.append('runner', 'movement-command', addRunMeta(detail));
  };
  const logCombat = detail => {
    if (logStore) logStore.append('combat', combatLiveEnabled ? 'combat-live' : 'combat-dry-run', addRunMeta(detail));
  };
  const logWs = (type, detail) => {
    if (config.wsTraceEnabled && logStore) logStore.append('ws', type, addRunMeta(detail));
  };
  log('canary-target-whitelist', targetWhitelistSummary || {});
  const updateActionResult = actionResult => {
    if (!actionResult) return;
    const adapterState = actionAdapter?.getState?.() || {};
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.last = actionResult;
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
    logAction({ action: actionResult, state: adapterState });
    if (typeof options.onAction === 'function') {
      try {
        options.onAction(actionResult, { actionState: adapterState });
      } catch (err) {
        log('canary-action-status-error', { error: err?.message || String(err) });
      }
    }
  };
  const recordSafetyEvent = event => {
    if (!event || event.ok || result.safety.event) return false;
    result.safety.event = event;
    result.error = event.reason;
    logSafety(event);
    return true;
  };

  try {
    result.snapshotSafety = await (options.runPreLoginSnapshotSafety || runPreLoginSnapshotSafety)(config, options.persistedState || {}, options);
  } catch (err) {
    const message = errorMessage(err);
    result.snapshotSafety = {
      ok: false,
      reason: 'snapshot-error',
      error: message
    };
    log('canary-snapshot-safety-error', { error: message });
  }
  log('canary-snapshot-safety', result.snapshotSafety);
  result.snapshotSafety = allowSelfPresentSnapshotControl(result.snapshotSafety);
  if (result.snapshotSafety?.bypassedPreLoginSafety) {
    log('canary-snapshot-self-present-reentry', result.snapshotSafety);
  }
  if (!result.snapshotSafety.ok) {
    if (options.allowMissingLoginPointBootstrap && result.snapshotSafety.reason === 'missing-login-point') {
      result.snapshotSafety = {
        ...result.snapshotSafety,
        ok: true,
        bootstrapOnly: true,
        reason: 'bootstrap-missing-login-point'
      };
      log('canary-bootstrap-login-point', result.snapshotSafety);
    } else {
      recordSafetyEvent(safetyController.evaluate(null, {
        snapshotSafety: result.snapshotSafety,
        nowMs: now()
      }));
      result.error = `snapshot safety not confirmed: ${result.snapshotSafety.reason}`;
      result.completedAt = new Date(now()).toISOString();
      log('canary-blocked', { error: result.error });
      return result;
    }
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
      localAddress: config.sourceIp,
      connectTimeoutMs: config.wsConnectTimeoutMs,
      onConnectStart: event => {
        logWs('connect-start', {
          runtime: event?.runtime || '',
          localAddress: event?.localAddress || ''
        });
      },
      onOpen: event => {
        logWs('open', {
          runtime: event?.runtime || ''
        });
      },
      onError: event => {
        wsError = event;
        logWs('error', {
          message: event?.message || '',
          opened: Boolean(event?.opened),
          statusCode: event?.statusCode || null,
          statusMessage: event?.statusMessage || '',
          contentType: event?.contentType || '',
          body: event?.body || ''
        });
      },
      onClose: event => {
        if (!ending) wsClosed = event;
        logWs('close', event || {});
      },
      onSend: event => {
        logWs('send', {
          direction: 'out',
          message: event?.message || ''
        });
      },
      onMessage: data => {
        if (ending || result.safety.event) return;
        const atMs = now();
        if (!frameHealth.firstFrameAtMs) frameHealth.firstFrameAtMs = atMs;
        if (frameHealth.lastFrameAtMs) frameHealth.maxFrameGapMs = Math.max(frameHealth.maxFrameGapMs, atMs - frameHealth.lastFrameAtMs);
        frameHealth.lastFrameAtMs = atMs;
        const frame = inspectCanaryFrame(data, { userId: config.userId });
        logWs('message', buildWsFrameTrace(frame, config));
        if (frame.decodeError || frame.jsonParseError) frameHealth.decodeErrors += 1;
        updateFrameStats(stats, {
          at: new Date(atMs).toISOString(),
          ...frame
        });
        if (frame.decodedJson) {
          stateStore.ingestFrame(frame.decodedJson, { receivedAtMs: atMs });
          const currentState = stateStore.getState(atMs);
          const currentSelf = currentState?.realtime?.self || null;
          if (
            !result.entry.firstSelf
            && currentSelf
            && Number.isFinite(Number(currentSelf.x))
            && Number.isFinite(Number(currentSelf.y))
          ) {
            result.entry.firstSelf = {
              userId: Number.isFinite(Number(currentSelf.user_id ?? currentSelf.userId)) ? Number(currentSelf.user_id ?? currentSelf.userId) : null,
              entityId: Number.isFinite(Number(currentSelf.entity_id ?? currentSelf.entityId)) ? Number(currentSelf.entity_id ?? currentSelf.entityId) : null,
              name: currentSelf.name || '',
              x: Number(currentSelf.x),
              y: Number(currentSelf.y),
              hp: Number.isFinite(Number(currentSelf.hp)) ? Number(currentSelf.hp) : null
            };
            result.entry.firstSelfAt = new Date(atMs).toISOString();
            result.entry.firstSelfTick = currentState?.realtime?.tick ?? frame.decodedTick ?? null;
          }
          if (actionAdapter) {
            const settlement = actionAdapter.observeState(currentState);
            if (settlement) {
              result.actions.settlement = settlement;
            }
          }
          if (deadlineAtMs && atMs >= deadlineAtMs) return;
          if (!lastDecisionAtMs || atMs - lastDecisionAtMs >= decisionIntervalMs) {
            const decision = decisionAdapter.decide(currentState, {
              ...runtimeDefaults,
              nowMs: atMs,
              controlMode,
              combatEnabled: config.combatEnabled
            });
            const summary = summarizeBrowserlessDecision(decision);
            result.decisions.evaluatedCount += 1;
            result.decisions.last = summary;
            lastDecisionAtMs = atMs;
            logDecision(summary);
            result.decisions.loggedCount += 1;
            if (controlMode === 'combat-dry-run' || controlMode === 'combat-live' || combatLiveEnabled) {
              logCombat(summary.combat || {});
            }
            if (typeof options.onDecision === 'function') {
              try {
                options.onDecision(summary, { state: currentState, decision });
              } catch (err) {
                log('canary-decision-status-error', { error: err?.message || String(err) });
              }
            }
            const decisionSafetyEvent = safetyController.evaluate(currentState, {
              startedAtMs: startedAt,
              frameGapAlertMs,
              staleSelfMs: config.staleSelfMs,
              noSelfGraceMs: config.noSelfGraceMs,
              staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
              decision: summary,
              nowMs: atMs
            });
            if (recordSafetyEvent(decisionSafetyEvent)) return;
            if (actionAdapter) {
              let actionResult;
              try {
                actionResult = actionAdapter.applyDecision(currentState, summary);
              } catch (err) {
                const message = err?.message || String(err);
                actionResult = {
                  ok: false,
                  kind: 'action-error',
                  reason: 'action-apply-failed',
                  error: message,
                  transportClosed: /websocket is not open|not open|closed/i.test(message)
                };
              }
              updateActionResult(actionResult);
              if (actionResult?.transportClosed) {
                recordSafetyEvent(createSafetyEvent('ws-closed', {
                  source: 'action-send',
                  action: actionResult
                }, { nowMs: atMs, stopMotion: false }));
                return;
              }
              if (actionResult?.ok === false && actionResult?.error) {
                recordSafetyEvent(createSafetyEvent('ws-error', {
                  source: actionResult.reason === 'action-apply-failed' ? 'action-apply' : 'action-send',
                  error: actionResult.error || 'action failed'
                }, { nowMs: atMs, stopMotion: false }));
                return;
              }
              if (typeof decisionAdapter.observeActionResult === 'function') {
                decisionAdapter.observeActionResult(actionResult, decision, { nowMs: atMs });
              }
            }
          }
          recordSafetyEvent(safetyController.evaluate(currentState, {
            startedAtMs: startedAt,
            frameGapAlertMs,
            staleSelfMs: config.staleSelfMs,
            noSelfGraceMs: config.noSelfGraceMs,
            staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
            nowMs: atMs
          }));
        }
      }
    });
    if (actionEnabled) {
      actionAdapter = options.actionAdapter || createBrowserlessActionAdapter({
        ...runtimeDefaults,
        transport,
        now,
        decisionIntervalMs: config.decisionIntervalMs,
        commandIntervalMs: config.movementCommandIntervalMs,
        velocityRepeatEnabled: true,
        shootRepeatEnabled: true,
        targetDeadZoneCm: config.movementTargetDeadZoneCm,
        settlementFrames: config.movementSettlementFrames,
        combatShootMinIntervalMs: config.combatShootMinIntervalMs
      });
    }
    log('canary-ws-open', { durationMs });
    deadlineAtMs = now() + durationMs;
    while (now() < deadlineAtMs && !result.safety.event) {
      const waitMs = Math.min(250, Math.max(0, deadlineAtMs - now()));
      if (waitMs > 0) await sleep(waitMs);
      const atMs = now();
      if (atMs >= deadlineAtMs) break;
      const frameGapMs = frameHealth.lastFrameAtMs ? atMs - frameHealth.lastFrameAtMs : null;
      const safetyEvent = safetyController.evaluate(stateStore.getState(atMs), {
        startedAtMs: startedAt,
        frameGapMs,
        frameGapAlertMs,
        staleSelfMs: config.staleSelfMs,
        noSelfGraceMs: config.noSelfGraceMs,
        staminaExhaustedBelowMs: config.staminaExhaustedBelowMs,
        wsError,
        wsClosed,
        nowMs: atMs
      });
      recordSafetyEvent(safetyEvent);
    }
  } catch (err) {
    openFailedBeforeTransport = !transport;
    result.error = err?.message || String(err);
    log('canary-error', { error: result.error });
  }

  const authOpenFailure = /websocket unexpected response 403|http 403|not logged in/i.test(result.error || '');
  const shouldVerifyExitAfterOpenFailure = Boolean(
    openFailedBeforeTransport
      && result.snapshotSafety?.ok
      && config.userId
      && config.sessionToken
      && (!authOpenFailure || snapshotSafetySelfPresent(result.snapshotSafety))
  );

  if (transport || !result.error || shouldVerifyExitAfterOpenFailure) {
    try {
      if (result.safety.event) {
        result.safety.exit = await executeSafetyExit(result.safety.event, config, {
          transport,
          allowStopMotion: actionEnabled,
          leaveWithVerification: options.leaveWithVerification,
          now,
          sleep
        });
        result.leave = result.safety.exit.leave;
      } else {
        if (actionAdapter) updateActionResult(actionAdapter.stop('normal-complete'));
        if (shouldVerifyExitAfterOpenFailure) log('canary-open-failed-leave', { error: result.error });
        const leave = options.leaveWithVerification || leaveWithVerification;
        result.leave = await leave({
          gameOrigin: config.gameOrigin,
          userId: config.userId,
          sessionToken: config.sessionToken,
          localAddress: config.sourceIp,
          timeoutMs: config.httpTimeoutMs || 10000,
          retryMax: config.leaveRetryMax ?? 3,
          retryDelayMs: config.leaveRetryMs ?? 1200
        });
      }
    } catch (err) {
      const message = errorMessage(err);
      result.leave = { ok: false, error: message, attempts: [] };
      if (result.safety.event) {
        result.safety.exit = {
          ok: false,
          event: result.safety.event,
          stopMotion: null,
          leave: result.leave,
          error: message
        };
      }
      const leaveFailure = safetyController.evaluate(null, {
        leaveResult: result.leave,
        nowMs: now()
      });
      if (!leaveFailure.ok) {
        result.safety.leaveFailure = leaveFailure;
        logSafety(leaveFailure);
      }
      if (!result.error) result.error = `leave failed: ${message}`;
      log('canary-leave-error', { error: message });
    }
  }

  try {
    ending = true;
    if (transport && (transport.isOpen?.() || isWsOpen(transport.ws))) transport.close();
  } catch (_) {}

  const noFrames = Number(stats.decodedFrameCount || 0) <= 0;
  const noSelf = Number(stats.selfPresent.true || 0) <= 0;
  const frameGap = Number(frameHealth.maxFrameGapMs || 0) > frameGapAlertMs;
  const leaveFailed = !result.leave?.ok;
  if (!result.error && noFrames) result.error = 'no decoded frames received';
  if (!result.error && noSelf) result.error = 'self not observed in realtime frames';
  if (!result.error && frameGap) result.error = `frame gap exceeded ${frameGapAlertMs}ms`;
  if (leaveFailed && result.leave) {
    const leaveFailure = safetyController.evaluate(null, {
      leaveResult: result.leave,
      nowMs: now()
    });
    if (!leaveFailure.ok) {
      result.safety.leaveFailure = leaveFailure;
      logSafety(leaveFailure);
    }
  }
  if (!result.error && leaveFailed) result.error = 'leave not confirmed';
  result.state = stateStore.getState(now());
  if (typeof decisionAdapter.getStatusSummary === 'function') {
    result.decisionState = decisionAdapter.getStatusSummary();
  }
  if (actionAdapter) {
    const adapterState = actionAdapter.getState();
    result.actions.sentCount = Number(adapterState.sentCount || 0);
    result.actions.velocitySentCount = Number(adapterState.velocitySentCount || 0);
    result.actions.velocityRepeatSentCount = Number(adapterState.velocityRepeatSentCount || 0);
    result.actions.shootSentCount = Number(adapterState.shootSentCount || 0);
    result.actions.shootRepeatSentCount = Number(adapterState.shootRepeatSentCount || 0);
    result.actions.stopCount = Number(adapterState.stopCount || 0);
    result.actions.skippedCount = Number(adapterState.skippedCount || 0);
    result.actions.settlement = adapterState.lastSettlement || result.actions.settlement;
    result.actions.lastShootAck = adapterState.lastShootAck || result.actions.lastShootAck;
  }
  result.ok = Boolean(!result.error);
  if (result.ok && result.snapshotSafety?.bootstrapOnly && !result.state?.realtime?.self) {
    result.error = 'bootstrap login point was not observed';
    result.ok = false;
  }
  result.completedAt = new Date(now()).toISOString();
  log(result.ok ? 'canary-finish' : 'canary-failed', result);
  return result;
}

module.exports = {
  createCanaryRunId,
  frameDataToBuffer,
  inspectCanaryFrame,
  loginPointFromState,
  runPreLoginSnapshotSafety,
  runReadOnlyCanary
};
