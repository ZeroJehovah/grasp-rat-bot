'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { parseGrzFrame, summarizeGrzEntity } = require('../src/shared/grz-frame');
const {
  buildSnapshotProbeUrl,
  fetchWithTimeout: browserlessFetchWithTimeout,
  readResponseBody: browserlessReadResponseBody,
  redactSecrets,
  redactStructuredSecrets,
  requestAuthUrl,
  submitCallbackInput,
  summarizeSnapshotPayload: summarizeSnapshotPayloadCore
} = require('../src/node/browserless/session-client');
const {
  leaveOnce: browserlessLeaveOnce,
  leaveWithVerification: browserlessLeaveWithVerification,
  summarizeLeaveResultForPublic
} = require('../src/node/browserless/leave-client');

const GAME_ORIGIN = process.env.GRASP_RAT_GAME_ORIGIN || 'https://grasp-rat-game.h-e.top';
const HOST = process.env.GRASP_RAT_DEMO_HOST || '127.0.0.1';
const PORT = Number(process.env.GRASP_RAT_DEMO_PORT || 18766);
const WEB_TOKEN = process.env.GRASP_RAT_DEMO_WEB_TOKEN || '';
const DATA_DIR = process.env.GRASP_RAT_DEMO_DATA_DIR || path.join(__dirname, 'data');
const LOG_DIR = process.env.GRASP_RAT_DEMO_LOG_DIR || path.join(DATA_DIR, 'logs');
const STATE_FILE = process.env.GRASP_RAT_DEMO_STATE_FILE || path.join(DATA_DIR, 'state.json');
const ACTION_DELAY_MS = Math.max(50, Number(process.env.GRASP_RAT_DEMO_ACTION_DELAY_MS || 550));
const READONLY_PROBE_MS = Math.max(1000, Number(process.env.GRASP_RAT_DEMO_READONLY_PROBE_MS || 30000));
const LEAVE_RETRY_MAX = Math.max(0, Number(process.env.GRASP_RAT_DEMO_LEAVE_RETRY_MAX || 3));
const LEAVE_RETRY_MS = Math.max(250, Number(process.env.GRASP_RAT_DEMO_LEAVE_RETRY_MS || 1200));
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.GRASP_RAT_DEMO_HTTP_TIMEOUT_MS || 10000));
const WS_CONNECT_TIMEOUT_MS = Math.max(1000, Number(process.env.GRASP_RAT_DEMO_WS_CONNECT_TIMEOUT_MS || 10000));
const WS_FRAME_LIMIT = Math.max(0, Number(process.env.GRASP_RAT_DEMO_WS_FRAME_LIMIT || 80));
const WS_FRAME_BASE64_BYTES = Math.max(0, Number(process.env.GRASP_RAT_DEMO_WS_FRAME_BASE64_BYTES || 256));
const WS_FRAME_DECODED_SAMPLE_BYTES = Math.max(0, Number(process.env.GRASP_RAT_DEMO_DECODED_SAMPLE_BYTES || 500));
const WS_PATH = process.env.GRASP_RAT_DEMO_WS_PATH || '/ws';
const WS_EXTRA_QUERY = process.env.GRASP_RAT_DEMO_WS_EXTRA_QUERY || 'compress=gzip%2Cdeflate';
const SNAPSHOT_PATH = process.env.GRASP_RAT_DEMO_SNAPSHOT_PATH || '/snapshot';
const LOGIN_POINT_HEALTHY_HP_THRESHOLD = Math.max(0, Number(process.env.GRASP_RAT_DEMO_LOGIN_POINT_HEALTHY_HP || 80));
const LOGIN_POINT_HEALTHY_RADIUS = Math.max(0, Number(process.env.GRASP_RAT_DEMO_LOGIN_POINT_HEALTHY_RADIUS || 17000));
const LOGIN_POINT_LOW_RADIUS = Math.max(0, Number(process.env.GRASP_RAT_DEMO_LOGIN_POINT_LOW_RADIUS || 30000));
let cachedWebSocketRuntime = null;
const frameObservers = new Set();

if (!isLoopbackHost(HOST) && (!WEB_TOKEN || WEB_TOKEN === 'change-this-before-start')) {
  console.error('Refusing to listen on a non-loopback host without a non-placeholder GRASP_RAT_DEMO_WEB_TOKEN.');
  process.exit(1);
}

const state = {
  authUrl: '',
  authUrlAt: 0,
  callbackUrl: '',
  callbackAt: 0,
  userId: 0,
  sessionToken: '',
  loginPayloadSummary: null,
  lastCallbackDebug: null,
  wsUrl: '',
  wsOpen: false,
  wsLastMessageAt: 0,
  lastFrames: [],
  lastFrameSummary: null,
  lastCommandAck: null,
  lastSelfSummary: null,
  lastSnapshotProbe: null,
  inGame: false,
  lastJoinAt: 0,
  lastLeaveAt: 0,
  lastLeaveSummary: null,
  running: false,
  lastRun: null,
  lastProbe: null,
  leaveAlert: '',
  lastError: '',
  logFile: ''
};

fs.mkdirSync(LOG_DIR, { recursive: true });
loadState();

function isLoopbackHost(host) {
  const value = String(host || '').trim().toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

function redact(value) {
  return redactSecrets(value);
}

function redactStructured(value, depth = 0) {
  return redactStructuredSecrets(value, depth);
}

function summarizeRunForPublic(run) {
  if (!run || typeof run !== 'object') return run;
  return {
    startedAt: Number(run.startedAt || 0),
    completedAt: Number(run.completedAt || 0),
    ok: Boolean(run.ok),
    error: run.error || '',
    leave: summarizeLeaveResultForPublic(run.leave)
  };
}

function summarizeFrameForPublic(frame) {
  if (!frame || typeof frame !== 'object') return frame;
  const output = {
    at: frame.at || '',
    kind: frame.kind || ''
  };
  if (frame.byteLength !== undefined) output.byteLength = frame.byteLength;
  if (frame.format) output.format = frame.format;
  if (frame.version !== undefined) output.version = frame.version;
  if (frame.compression) output.compression = frame.compression;
  if (frame.decodedByteLength !== undefined) output.decodedByteLength = frame.decodedByteLength;
  if (frame.decodedType) output.decodedType = frame.decodedType;
  if (frame.decodedTick !== undefined) output.decodedTick = frame.decodedTick;
  if (frame.decodedSummary) output.decodedSummary = frame.decodedSummary;
  if (frame.decodeError) output.decodeError = frame.decodeError;
  if (frame.sample) output.sample = frame.sample;
  return output;
}

function publicState() {
  const authenticated = Boolean(state.userId && state.sessionToken);
  return {
    authUrl: redact(state.authUrl),
    authUrlAt: state.authUrlAt,
    callbackAt: state.callbackAt,
    authenticated,
    loggedIn: authenticated,
    inGame: Boolean(state.inGame),
    userId: state.userId || 0,
    tokenPresent: Boolean(state.sessionToken),
    loginPayloadSummary: redactStructured(state.loginPayloadSummary),
    lastCallbackDebug: redactStructured(state.lastCallbackDebug),
    wsUrl: redact(state.wsUrl),
    wsOpen: state.wsOpen,
    wsLastMessageAt: state.wsLastMessageAt,
    lastJoinAt: state.lastJoinAt || 0,
    lastLeaveAt: state.lastLeaveAt || 0,
    lastLeaveSummary: redactStructured(state.lastLeaveSummary),
    running: state.running,
    lastRun: redactStructured(summarizeRunForPublic(state.lastRun)),
    lastProbe: redactStructured(state.lastProbe),
    leaveAlert: redact(state.leaveAlert),
    lastError: redact(state.lastError),
    logFile: state.logFile,
    lastFrameSummary: redactStructured(state.lastFrameSummary),
    lastCommandAck: redactStructured(state.lastCommandAck),
    lastSelfSummary: redactStructured(state.lastSelfSummary),
    lastSnapshotProbe: redactStructured(state.lastSnapshotProbe),
    recentFrames: redactStructured(state.lastFrames.slice(-10).map(summarizeFrameForPublic))
  };
}

function persistState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const saved = {
    authUrl: state.authUrl,
    authUrlAt: state.authUrlAt,
    callbackUrl: state.callbackUrl,
    callbackAt: state.callbackAt,
    userId: state.userId,
    sessionToken: state.sessionToken,
    loginPayloadSummary: state.loginPayloadSummary,
    lastCallbackDebug: state.lastCallbackDebug,
    wsUrl: state.wsUrl,
    lastSelfSummary: state.lastSelfSummary,
    lastSnapshotProbe: state.lastSnapshotProbe,
    inGame: state.inGame,
    lastJoinAt: state.lastJoinAt,
    lastLeaveAt: state.lastLeaveAt,
    lastLeaveSummary: state.lastLeaveSummary,
    lastProbe: state.lastProbe,
    leaveAlert: state.leaveAlert,
    lastError: state.lastError,
    logFile: state.logFile
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(saved, null, 2));
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      Object.assign(state, parsed);
      state.sessionToken = String(state.sessionToken || '');
      state.userId = Number(state.userId || 0);
      state.inGame = Boolean(state.inGame);
      state.lastJoinAt = Number(state.lastJoinAt || 0);
      state.lastLeaveAt = Number(state.lastLeaveAt || 0);
    }
  } catch (_) {}
}

function logEvent(type, detail = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `${day}.jsonl`);
  state.logFile = file;
  const entry = {
    at: new Date().toISOString(),
    type,
    detail: JSON.parse(redact(JSON.stringify(detail || {})))
  };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  return entry;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  return browserlessFetchWithTimeout(url, {
    timeoutMs: HTTP_TIMEOUT_MS,
    ...options
  });
}

async function readResponseBody(response) {
  return browserlessReadResponseBody(response);
}

function snapshotProbeUrl() {
  return buildSnapshotProbeUrl({
    gameOrigin: GAME_ORIGIN,
    snapshotPath: SNAPSHOT_PATH,
    userId: state.userId,
    sessionToken: state.sessionToken
  });
}

function latestKnownFrameTick() {
  const candidates = [
    state.lastFrameSummary?.tick,
    state.lastFrameSummary?.decodedTick,
    state.lastProbe?.stats?.tick?.last
  ];
  let latest = 0;
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > latest) latest = n;
  }
  return latest;
}

function summarizeSnapshotPayload(payload) {
  return summarizeSnapshotPayloadCore(payload, {
    userId: state.userId,
    loginPoint: state.lastSelfSummary,
    latestKnownTick: latestKnownFrameTick(),
    healthyHpThreshold: LOGIN_POINT_HEALTHY_HP_THRESHOLD,
    healthyRadius: LOGIN_POINT_HEALTHY_RADIUS,
    lowRadius: LOGIN_POINT_LOW_RADIUS
  });
}

async function getAuthUrl() {
  const authUrl = await requestAuthUrl({
    gameOrigin: GAME_ORIGIN,
    timeoutMs: HTTP_TIMEOUT_MS
  });
  state.authUrl = authUrl;
  state.authUrlAt = Date.now();
  state.lastError = '';
  persistState();
  logEvent('auth-url', { authUrl });
  return authUrl;
}

function applyLogin(login, summary = null) {
  if (!login.userId || !login.sessionToken) {
    throw new Error('login payload did not expose userId/sessionToken');
  }
  const safeSummary = redactStructured(summary);
  state.callbackAt = Date.now();
  state.userId = login.userId;
  state.sessionToken = login.sessionToken;
  state.loginPayloadSummary = safeSummary;
  state.lastCallbackDebug = null;
  state.inGame = false;
  state.leaveAlert = '';
  state.lastError = '';
  persistState();
  logEvent('login-ok', { userId: login.userId, tokenPresent: true, summary: safeSummary });
  return { userId: login.userId, tokenPresent: true, summary: safeSummary };
}

async function submitCallback(callbackUrl) {
  const rawInput = String(callbackUrl || '').trim();
  if (!rawInput) throw new Error('callback URL is empty');
  logEvent('callback-submit', { callbackUrl: redact(rawInput.slice(0, 1000)) });
  try {
    const result = await submitCallbackInput(rawInput, {
      gameOrigin: GAME_ORIGIN,
      timeoutMs: HTTP_TIMEOUT_MS
    });
    if (result.callbackUrl) state.callbackUrl = redact(result.callbackUrl);
    if (result.debug || result.summary) state.lastCallbackDebug = redactStructured(result.debug || result.summary);
    return applyLogin(result.login, result.summary);
  } catch (err) {
    const safeSummary = err?.summary ? redactStructured(err.summary) : null;
    if (safeSummary) {
      state.lastCallbackDebug = safeSummary;
      state.loginPayloadSummary = safeSummary;
    }
    state.lastError = err?.message || String(err);
    persistState();
    logEvent('callback-failed', { error: state.lastError, summary: safeSummary });
    throw err;
  }
}

function wsUrlForUser(userId) {
  const origin = new URL(GAME_ORIGIN);
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  origin.pathname = WS_PATH;
  origin.search = `?user_id=${encodeURIComponent(userId)}&token=${encodeURIComponent(state.sessionToken)}`;
  if (WS_EXTRA_QUERY) {
    const extra = new URLSearchParams(WS_EXTRA_QUERY.replace(/^\?/, ''));
    for (const [key, value] of extra) origin.searchParams.set(key, value);
  }
  return origin.toString();
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

function frameDataToText(data) {
  const value = normalizeFrameData(data);
  if (typeof value === 'string') return value;
  const buffer = frameDataToBuffer(value);
  if (buffer) return buffer.toString('utf8');
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(redactStructured(value));
    } catch (_) {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function rangeInitial() {
  return { min: null, max: null, last: null };
}

function updateRange(range, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  if (range.min === null || number < range.min) range.min = number;
  if (range.max === null || number > range.max) range.max = number;
  range.last = number;
}

function createProbeStats(durationTargetMs) {
  return {
    durationTargetMs,
    frameCount: 0,
    decodedFrameCount: 0,
    binaryFrameCount: 0,
    textFrameCount: 0,
    typeCounts: {},
    keySetCounts: {},
    firstFrameAt: '',
    lastFrameAt: '',
    tick: rangeInitial(),
    entityCount: rangeInitial(),
    bulletCount: rangeInitial(),
    coinDropCount: rangeInitial(),
    messageCount: rangeInitial(),
    selfPresent: { true: 0, false: 0, unknown: 0 },
    decodeErrors: 0
  };
}

function incrementCount(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function updateProbeStats(stats, frame) {
  stats.frameCount += 1;
  if (!stats.firstFrameAt) stats.firstFrameAt = frame.at || '';
  stats.lastFrameAt = frame.at || stats.lastFrameAt;
  if (frame.kind === 'binary') stats.binaryFrameCount += 1;
  if (frame.kind === 'text') stats.textFrameCount += 1;
  if (frame.decodeError) stats.decodeErrors += 1;

  const keys = Array.isArray(frame.decodedJsonKeys) ? frame.decodedJsonKeys.join(',') : '';
  if (keys) incrementCount(stats.keySetCounts, keys);

  const summary = frame.decodedSummary;
  if (!summary || typeof summary !== 'object') return;
  stats.decodedFrameCount += 1;
  incrementCount(stats.typeCounts, summary.type || frame.decodedType || 'unknown');
  updateRange(stats.tick, summary.tick);
  updateRange(stats.entityCount, summary.entityCount);
  updateRange(stats.bulletCount, summary.bulletCount);
  updateRange(stats.coinDropCount, summary.coinDropCount);
  updateRange(stats.messageCount, summary.messageCount);
  if (summary.selfPresent === true) {
    stats.selfPresent.true += 1;
  } else if (summary.selfPresent === false) {
    stats.selfPresent.false += 1;
  } else {
    stats.selfPresent.unknown += 1;
  }
}

async function collectProbeStats(durationMs) {
  const stats = createProbeStats(durationMs);
  const observer = frame => updateProbeStats(stats, frame);
  frameObservers.add(observer);
  try {
    await sleep(durationMs);
  } finally {
    frameObservers.delete(observer);
  }
  return stats;
}

function inspectBinaryFrame(buffer) {
  const frame = {
    kind: 'binary',
    byteLength: buffer.length,
    prefixHex: buffer.subarray(0, 16).toString('hex')
  };
  if (WS_FRAME_BASE64_BYTES > 0) {
    frame.base64Sample = buffer.subarray(0, WS_FRAME_BASE64_BYTES).toString('base64');
  }
  if (buffer.length >= 5 && buffer.subarray(0, 4).toString('ascii') === 'GRZ1') {
    const parsed = parseGrzFrame(buffer, {
      userId: state.userId,
      decodedTextSampleBytes: WS_FRAME_DECODED_SAMPLE_BYTES
    });
    Object.assign(frame, parsed);
    if (!frame.decodedJsonKeys && frame.decodedTextSample) {
      frame.decodedSample = redact(frame.decodedTextSample);
    }
    delete frame.decodedTextSample;
  }
  return frame;
}

function recordFrame(data) {
  const buffer = frameDataToBuffer(data);
  const frame = buffer
    ? { at: new Date().toISOString(), ...inspectBinaryFrame(buffer) }
    : { at: new Date().toISOString(), kind: 'text', sample: frameDataToText(data).slice(0, 1000) };
  state.wsLastMessageAt = Date.now();
  state.lastFrameSummary = frame.decodedSummary || {
    kind: frame.kind,
    byteLength: frame.byteLength,
    sample: frame.sample
  };
  if (frame.decodedSummary?.ack) state.lastCommandAck = frame.decodedSummary.ack;
  if (frame.decodedSummary?.self) state.lastSelfSummary = frame.decodedSummary.self;
  state.lastFrames.push(frame);
  if (state.lastFrames.length > WS_FRAME_LIMIT) state.lastFrames.splice(0, state.lastFrames.length - WS_FRAME_LIMIT);
  for (const observer of frameObservers) {
    try {
      observer(frame);
    } catch (err) {
      logEvent('ws-frame-observer-error', { message: err?.message || String(err) });
    }
  }
  logEvent('ws-frame', frame);
  return frame;
}

function getWebSocketRuntime() {
  if (cachedWebSocketRuntime) return cachedWebSocketRuntime;
  if (typeof globalThis.WebSocket === 'function') {
    cachedWebSocketRuntime = {
      name: 'global',
      WebSocket: globalThis.WebSocket,
      supportsOptions: false
    };
    return cachedWebSocketRuntime;
  }
  try {
    const wsModule = require('ws');
    const WebSocketImpl = wsModule.WebSocket || wsModule;
    if (typeof WebSocketImpl === 'function') {
      cachedWebSocketRuntime = {
        name: 'ws-package',
        WebSocket: WebSocketImpl,
        supportsOptions: true
      };
      return cachedWebSocketRuntime;
    }
  } catch (err) {
    throw new Error('WebSocket runtime unavailable. Run `npm install` in the repo on Node 18, or use Node 22+ with global WebSocket support. Original error: ' + (err?.message || String(err)));
  }
  throw new Error('WebSocket runtime unavailable. Run `npm install` in the repo on Node 18, or use Node 22+ with global WebSocket support.');
}

function wsOpenState(runtime) {
  const value = Number(runtime?.WebSocket?.OPEN);
  return Number.isFinite(value) ? value : 1;
}

function isWsOpen(ws, runtime = cachedWebSocketRuntime) {
  return Boolean(ws && Number(ws.readyState) === wsOpenState(runtime));
}

function addWsHandler(ws, eventName, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener(eventName, handler);
    return;
  }
  if (typeof ws.on === 'function') {
    ws.on(eventName, handler);
    return;
  }
  ws['on' + eventName] = handler;
}

function closeReasonText(reason) {
  if (!reason) return '';
  if (Buffer.isBuffer(reason)) return reason.toString('utf8');
  return String(reason || '');
}

function createWebSocket(runtime, wsUrl) {
  if (!runtime.supportsOptions) return new runtime.WebSocket(wsUrl);
  return new runtime.WebSocket(wsUrl, [], {
    headers: { Origin: GAME_ORIGIN },
    perMessageDeflate: false
  });
}

function openWs() {
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  const runtime = getWebSocketRuntime();
  const wsUrl = wsUrlForUser(state.userId);
  state.wsUrl = wsUrl;
  persistState();
  logEvent('ws-connect-start', { wsUrl, runtime: runtime.name });
  const ws = createWebSocket(runtime, wsUrl);
  let opened = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!opened) {
        try { ws.close(); } catch (_) {}
        reject(new Error('websocket connect timeout'));
      }
    }, WS_CONNECT_TIMEOUT_MS);
    addWsHandler(ws, 'open', () => {
      opened = true;
      clearTimeout(timer);
      state.wsOpen = true;
      state.inGame = true;
      state.lastJoinAt = Date.now();
      state.lastError = '';
      persistState();
      logEvent('ws-open', { wsUrl, runtime: runtime.name });
      resolve(ws);
    });
    addWsHandler(ws, 'error', event => {
      const message = event?.message || event?.error?.message || String(event || 'websocket error');
      state.lastError = message;
      logEvent('ws-error', { message });
      if (!opened) {
        clearTimeout(timer);
        reject(new Error(message));
      }
    });
    addWsHandler(ws, 'close', (eventOrCode, reason) => {
      state.wsOpen = false;
      const code = typeof eventOrCode === 'number' ? eventOrCode : eventOrCode?.code || 0;
      const textReason = typeof eventOrCode === 'number' ? closeReasonText(reason) : closeReasonText(eventOrCode?.reason);
      const wasClean = typeof eventOrCode === 'number' ? code === 1000 : Boolean(eventOrCode?.wasClean);
      logEvent('ws-close', { code, reason: textReason, wasClean });
    });
    addWsHandler(ws, 'message', (eventOrData) => {
      try {
        recordFrame(eventOrData);
      } catch (err) {
        const message = err?.message || String(err);
        state.lastError = 'websocket frame record failed: ' + message;
        logEvent('ws-frame-error', { message });
      }
    });
  });
}

function wsSend(ws, message) {
  if (!isWsOpen(ws)) throw new Error('websocket is not open');
  ws.send(message);
  logEvent('ws-send', { message });
}

async function leaveOnce(stage = 'initial') {
  const result = await browserlessLeaveOnce({
    gameOrigin: GAME_ORIGIN,
    userId: state.userId,
    sessionToken: state.sessionToken,
    timeoutMs: HTTP_TIMEOUT_MS,
    stage,
    onRequest: detail => logEvent('leave-request', detail)
  });
  logEvent('leave-result', result);
  return result;
}

async function leaveWithVerification() {
  const result = await browserlessLeaveWithVerification({
    gameOrigin: GAME_ORIGIN,
    userId: state.userId,
    sessionToken: state.sessionToken,
    timeoutMs: HTTP_TIMEOUT_MS,
    retryMax: LEAVE_RETRY_MAX,
    retryDelayMs: LEAVE_RETRY_MS,
    sleep,
    leaveOnceImpl: options => leaveOnce(options.stage)
  });
  const confirmed = result.attempts.find(attempt => attempt?.ok);
  if (confirmed) {
    state.inGame = false;
    state.lastLeaveAt = Date.now();
    state.lastLeaveSummary = confirmed.summary || null;
    state.lastSelfSummary = summarizeGrzEntity(confirmed.response) || state.lastSelfSummary;
    state.leaveAlert = '';
    state.lastError = '';
    persistState();
    return result;
  }
  state.leaveAlert = result.alert || 'LEAVE NOT CONFIRMED';
  state.lastError = state.leaveAlert;
  persistState();
  logEvent('leave-alert', { leaveAlert: state.leaveAlert, attempts: result.attempts });
  return result;
}

async function runActionDemo() {
  if (state.running) throw new Error('demo already running');
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  state.running = true;
  state.leaveAlert = '';
  state.lastFrameSummary = null;
  state.lastCommandAck = null;
  state.lastRun = {
    startedAt: Date.now(),
    completedAt: 0,
    ok: false,
    error: '',
    leave: null
  };
  persistState();
  logEvent('demo-start', { userId: state.userId });
  let ws = null;
  try {
    ws = await openWs();
    const actions = [
      'vel 0 -1',
      'vel 0 0',
      'vel 0 1',
      'vel 0 0',
      'vel -1 0',
      'vel 0 0',
      'vel 1 0',
      'vel 0 0',
      'shoot 0 0 0 0'
    ];
    for (const action of actions) {
      wsSend(ws, action);
      await sleep(ACTION_DELAY_MS);
    }
    try {
      wsSend(ws, 'vel 0 0');
    } catch (_) {}
    await sleep(250);
    const leave = await leaveWithVerification();
    state.lastRun.leave = leave;
    state.lastRun.ok = Boolean(leave.ok);
    if (!leave.ok) throw new Error(state.leaveAlert || 'leave not confirmed');
    return state.lastRun;
  } catch (err) {
    state.lastRun.error = err?.message || String(err);
    state.lastError = state.lastRun.error;
    logEvent('demo-error', { error: state.lastRun.error });
    throw err;
  } finally {
    try {
      if (isWsOpen(ws)) ws.close();
    } catch (_) {}
    state.wsOpen = false;
    if (state.lastRun?.leave?.ok) state.inGame = false;
    state.running = false;
    state.lastRun.completedAt = Date.now();
    persistState();
    logEvent('demo-finish', state.lastRun);
  }
}

async function runReadOnlyProbe() {
  if (state.running) throw new Error('demo already running');
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  const startedAt = Date.now();
  state.running = true;
  state.leaveAlert = '';
  state.lastFrameSummary = null;
  state.lastCommandAck = null;
  state.lastProbe = {
    startedAt,
    completedAt: 0,
    durationTargetMs: READONLY_PROBE_MS,
    ok: false,
    error: '',
    stats: null,
    leave: null
  };
  persistState();
  logEvent('readonly-probe-start', { userId: state.userId, durationMs: READONLY_PROBE_MS });

  let ws = null;
  let leave = null;
  let error = '';
  try {
    ws = await openWs();
    state.lastProbe.stats = await collectProbeStats(READONLY_PROBE_MS);
  } catch (err) {
    error = err?.message || String(err);
    state.lastProbe.error = error;
    state.lastError = error;
    logEvent('readonly-probe-error', { error });
  }

  if (ws || state.inGame) {
    try {
      leave = await leaveWithVerification();
      state.lastProbe.leave = summarizeLeaveResultForPublic(leave);
    } catch (err) {
      const leaveError = err?.message || String(err);
      state.lastProbe.leave = { ok: false, error: leaveError, attempts: [] };
      if (!error) error = leaveError;
      state.lastProbe.error = error;
      state.lastError = error;
      logEvent('readonly-probe-leave-error', { error: leaveError });
    }
  }

  try {
    if (isWsOpen(ws)) ws.close();
  } catch (_) {}
  state.wsOpen = false;
  if (leave?.ok) state.inGame = false;
  state.running = false;
  state.lastProbe.completedAt = Date.now();
  state.lastProbe.ok = Boolean(!error && leave?.ok);
  if (!state.lastProbe.ok && !state.lastProbe.error) {
    state.lastProbe.error = state.leaveAlert || 'read-only probe leave not confirmed';
    state.lastError = state.lastProbe.error;
  }
  persistState();
  logEvent('readonly-probe-finish', state.lastProbe);
  if (!state.lastProbe.ok) throw new Error(state.lastProbe.error || 'read-only probe failed');
  return state.lastProbe;
}

async function runSnapshotProbe() {
  if (state.running) throw new Error('demo already running');
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  const startedAt = Date.now();
  state.running = true;
  state.leaveAlert = '';
  state.lastSnapshotProbe = {
    startedAt,
    completedAt: 0,
    ok: false,
    error: '',
    request: null,
    response: null
  };
  persistState();

  const url = snapshotProbeUrl();
  logEvent('snapshot-probe-start', { url, loginPoint: state.lastSelfSummary });
  try {
    const response = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store' });
    const body = await readResponseBody(response);
    const summary = summarizeSnapshotPayload(body.json);
    state.lastSnapshotProbe.request = {
      url: redact(url),
      loginPoint: state.lastSelfSummary || null
    };
    state.lastSnapshotProbe.response = {
      httpOk: response.ok,
      status: response.status,
      statusText: response.statusText || '',
      durationMs: Date.now() - startedAt,
      contentType: response.headers.get('content-type') || '',
      textLength: body.text.length,
      textSample: body.json ? '' : redact(body.text.slice(0, 500)),
      summary
    };
    state.lastSnapshotProbe.ok = Boolean(response.ok && summary.valid && summary.safety?.ok);
    if (!state.lastSnapshotProbe.ok) {
      state.lastSnapshotProbe.error = response.ok
        ? `snapshot safety not confirmed: ${summary.safety?.reason || 'invalid-payload'}`
        : `snapshot HTTP ${response.status}`;
      state.lastError = state.lastSnapshotProbe.error;
    } else {
      state.lastError = '';
    }
    logEvent('snapshot-probe-result', state.lastSnapshotProbe);
  } catch (err) {
    const message = err?.message || String(err);
    state.lastSnapshotProbe.error = message;
    state.lastError = message;
    logEvent('snapshot-probe-error', { error: message });
  } finally {
    state.running = false;
    state.lastSnapshotProbe.completedAt = Date.now();
    persistState();
  }
  if (!state.lastSnapshotProbe.ok) throw new Error(state.lastSnapshotProbe.error || 'snapshot probe failed');
  return state.lastSnapshotProbe;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function sendHtml(res) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grasp Rat Headless Demo</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#101418;color:#e5edf5}
    main{max-width:980px;margin:0 auto;padding:24px}
    h1{font-size:22px;margin:0 0 16px}
    section{border:1px solid #2f3a45;border-radius:8px;padding:16px;margin:12px 0;background:#151b22}
    button,input,textarea{font:inherit}
    button{background:#2f81f7;color:#fff;border:0;border-radius:6px;padding:8px 12px;cursor:pointer}
    button.danger{background:#da3633}
    button:disabled{opacity:.5;cursor:not-allowed}
    input,textarea{width:100%;box-sizing:border-box;background:#0d1117;color:#e5edf5;border:1px solid #30363d;border-radius:6px;padding:8px}
    textarea{min-height:92px}
    code,pre{background:#0d1117;border:1px solid #30363d;border-radius:6px}
    pre{padding:12px;overflow:auto;white-space:pre-wrap}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .alert{border-color:#f85149;background:#2d1113;color:#ffd8d8;font-weight:700}
    .muted{color:#95a1ad}
    .ok{color:#56d364}
  </style>
</head>
<body>
  <main>
    <h1>Grasp Rat Headless Demo</h1>
    <section id="alert" class="alert" hidden></section>
    <section>
      <div class="row">
        <button id="authBtn">获取授权链接</button>
        <button id="refreshBtn">刷新状态</button>
      </div>
      <p class="muted">打开授权链接，完成授权后把最终回调 URL 粘贴到下面。服务端不会自动尝试登录。</p>
      <p><a id="authLink" href="#" target="_blank" rel="noreferrer" class="ok"></a></p>
      <pre id="authUrl"></pre>
    </section>
    <section>
      <label>回调 URL 或回调响应 JSON</label>
      <textarea id="callbackInput" placeholder="https://grasp-rat-game.h-e.top/auth/linuxdo/callback?code=...&#10;或 https://grasp-rat-game.h-e.top/?login=ok&user_id=...&token=...&#10;或粘贴包含 user_id/userId/id 和 token/sessionToken 的 JSON"></textarea>
      <div class="row" style="margin-top:8px">
        <button id="callbackBtn">提交回调并登录</button>
      </div>
    </section>
    <section>
      <div class="row">
        <button id="snapshotProbeBtn">运行登录点快照 Probe</button>
        <button id="probeBtn">运行只读 WS Probe</button>
        <button class="danger" id="runBtn">运行一次移动/开枪/退出 Demo</button>
      </div>
      <p class="muted">快照 Probe 不进入 WS，用于验证登录点安全校验接口。只读 WS Probe 会连接 WS、收集帧统计、再 leave，不发送移动或开枪。Demo 会运行一次上、下、左、右、开枪、leave。leave 未被服务端明确确认时会醒目报警。</p>
    </section>
    <section>
      <h2>状态</h2>
      <pre id="status"></pre>
    </section>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get('token') || localStorage.graspRatDemoToken || '';
    if (token) localStorage.graspRatDemoToken = token;
    async function api(path, options = {}) {
      const res = await fetch(path, {
        ...options,
        headers: { 'content-type': 'application/json', 'x-demo-token': token, ...(options.headers || {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + res.status));
      return data;
    }
    function showError(err) {
      const el = document.getElementById('alert');
      el.hidden = false;
      el.textContent = err.message || String(err);
    }
    function clearError() {
      const el = document.getElementById('alert');
      el.hidden = true;
      el.textContent = '';
    }
    async function refresh() {
      const data = await api('/api/status');
      document.getElementById('status').textContent = JSON.stringify(data.state, null, 2);
      document.getElementById('authUrl').textContent = data.state.authUrl || '';
      const authLink = document.getElementById('authLink');
      authLink.href = data.state.authUrl || '#';
      authLink.textContent = data.state.authUrl ? '打开授权页' : '';
      const alert = document.getElementById('alert');
      if (data.state.leaveAlert || data.state.lastError) {
        alert.hidden = false;
        alert.textContent = data.state.leaveAlert || data.state.lastError;
      } else {
        clearError();
      }
      const disabled = data.state.running || !(data.state.authenticated || data.state.loggedIn);
      document.getElementById('snapshotProbeBtn').disabled = disabled;
      document.getElementById('probeBtn').disabled = disabled;
      document.getElementById('runBtn').disabled = disabled;
    }
    document.getElementById('authBtn').onclick = async () => {
      try { clearError(); const data = await api('/api/auth-url', { method: 'POST' }); document.getElementById('authUrl').textContent = data.authUrl; await refresh(); }
      catch (err) { showError(err); }
    };
    document.getElementById('callbackBtn').onclick = async () => {
      try { clearError(); await api('/api/callback', { method: 'POST', body: JSON.stringify({ callbackUrl: document.getElementById('callbackInput').value }) }); await refresh(); }
      catch (err) { showError(err); await refresh().catch(() => {}); }
    };
    document.getElementById('runBtn').onclick = async () => {
      if (!confirm('确认运行一次移动/开枪/退出 demo？')) return;
      try { clearError(); await api('/api/run-demo', { method: 'POST' }); await refresh(); }
      catch (err) { showError(err); await refresh().catch(() => {}); }
    };
    document.getElementById('probeBtn').onclick = async () => {
      if (!confirm('确认运行只读 WS Probe？它会进入游戏但不会移动或开枪，结束后会 leave。')) return;
      try { clearError(); await api('/api/run-readonly-probe', { method: 'POST' }); await refresh(); }
      catch (err) { showError(err); await refresh().catch(() => {}); }
    };
    document.getElementById('snapshotProbeBtn').onclick = async () => {
      if (!confirm('确认运行登录点快照 Probe？它不会进入 WS，只会请求一次 snapshot 并评估最近 self 坐标附近风险。')) return;
      try { clearError(); await api('/api/run-snapshot-probe', { method: 'POST' }); await refresh(); }
      catch (err) { showError(err); await refresh().catch(() => {}); }
    };
    document.getElementById('refreshBtn').onclick = () => refresh().catch(showError);
    refresh().catch(showError);
    setInterval(() => refresh().catch(() => {}), 3000);
  </script>
</body>
</html>`);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('invalid JSON request body: ' + (err.message || String(err)));
  }
}

function authorized(req) {
  if (!WEB_TOKEN) return true;
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return req.headers['x-demo-token'] === WEB_TOKEN || parsed.searchParams.get('token') === WEB_TOKEN;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (parsed.pathname === '/' && req.method === 'GET') return sendHtml(res);
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    if (parsed.pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, state: publicState() });
    }
    if (parsed.pathname === '/api/auth-url' && req.method === 'POST') {
      const authUrl = await getAuthUrl();
      return sendJson(res, 200, { ok: true, authUrl });
    }
    if (parsed.pathname === '/api/callback' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await submitCallback(body.callbackUrl);
      return sendJson(res, 200, { ok: true, result, state: publicState() });
    }
    if (parsed.pathname === '/api/run-demo' && req.method === 'POST') {
      const result = await runActionDemo();
      return sendJson(res, 200, { ok: Boolean(result.ok), result, state: publicState() });
    }
    if (parsed.pathname === '/api/run-readonly-probe' && req.method === 'POST') {
      const result = await runReadOnlyProbe();
      return sendJson(res, 200, { ok: Boolean(result.ok), result, state: publicState() });
    }
    if (parsed.pathname === '/api/run-snapshot-probe' && req.method === 'POST') {
      const result = await runSnapshotProbe();
      return sendJson(res, 200, { ok: Boolean(result.ok), result, state: publicState() });
    }
    return sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    const message = redact(err?.message || String(err));
    state.lastError = message;
    persistState();
    logEvent('http-error', { method: req.method, url: req.url, error: message });
    return sendJson(res, 500, { ok: false, error: message, state: publicState() });
  }
});

server.listen(PORT, HOST, () => {
  logEvent('server-start', { host: HOST, port: PORT, gameOrigin: GAME_ORIGIN, dataDir: DATA_DIR, webTokenConfigured: Boolean(WEB_TOKEN) });
  console.log(`grasp-rat headless demo listening on http://${HOST}:${PORT}/`);
  if (WEB_TOKEN) console.log(`open http://${HOST}:${PORT}/?token=${encodeURIComponent(WEB_TOKEN)}`);
});
