'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');
const { leaveResponseConfirmsExitCore, summarizeLeaveResponseCore } = require('../src/shared/leave-response');

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
  return String(value || '')
    .replace(/([?&](?:code|token|session|auth|secret)[^=]*=)[^&"'\\\s]+/ig, '$1[redacted]')
    .replace(/("(?:code|token|sessionToken|auth|secret|cookie|set-cookie)"\s*:\s*")[^"]+/ig, '$1[redacted]')
    .replace(/((?:auth\.session-token|cf_clearance|_cfuvid|__stripe_mid)=)[^;"'\s]+/ig, '$1[redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/ig, '$1[redacted]');
}

function redactStructured(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 8) return redact(JSON.stringify(value));
  if (Array.isArray(value)) return value.map(item => redactStructured(item, depth + 1));
  if (typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:token|sessionToken|session_token|tmpGameSessionToken|cookie|set-cookie|authorization)$/i.test(key)) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactStructured(item, depth + 1);
    }
  }
  return output;
}

function summarizeLeaveAttemptForPublic(attempt) {
  if (!attempt || typeof attempt !== 'object') return attempt;
  return {
    stage: attempt.stage || '',
    httpOk: Boolean(attempt.httpOk),
    status: Number(attempt.status || 0),
    statusText: attempt.statusText || '',
    durationMs: Number(attempt.durationMs || 0),
    ok: Boolean(attempt.ok),
    summary: attempt.summary || null
  };
}

function summarizeLeaveResultForPublic(leave) {
  if (!leave || typeof leave !== 'object') return leave || null;
  return {
    ok: Boolean(leave.ok),
    attempts: Array.isArray(leave.attempts)
      ? leave.attempts.map(summarizeLeaveAttemptForPublic)
      : []
  };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || HTTP_TIMEOUT_MS));
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch (_) {
    return { text, json: null };
  }
}

function snapshotProbeUrl() {
  const url = new URL(SNAPSHOT_PATH, GAME_ORIGIN);
  url.searchParams.set('user_id', String(state.userId || 0));
  url.searchParams.set('token', state.sessionToken || '');
  url.searchParams.set('_graspRatProbeTs', String(Date.now()));
  return url.toString();
}

function isAliveEntity(entity) {
  const life = String(entity?.life || '').toLowerCase();
  return !life || life === 'alive';
}

function isActiveEntity(entity) {
  const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
  return mode === 'active';
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

function summarizeSnapshotFreshness(payload) {
  const tick = Number(payload?.tick);
  const latestKnownTick = latestKnownFrameTick();
  if (!Number.isFinite(tick)) {
    return {
      ok: false,
      reason: 'missing-snapshot-tick',
      tick: null,
      latestKnownTick: latestKnownTick || null
    };
  }
  if (!latestKnownTick) {
    return {
      ok: true,
      reason: 'no-prior-tick',
      tick,
      latestKnownTick: null
    };
  }
  return {
    ok: tick >= latestKnownTick,
    reason: tick >= latestKnownTick ? 'fresh' : 'stale-snapshot-tick',
    tick,
    latestKnownTick,
    tickDelta: tick - latestKnownTick
  };
}

function summarizeSnapshotSafety(payload, loginPoint, freshness = null) {
  const entities = Array.isArray(payload?.entities) ? payload.entities : [];
  const point = loginPoint
    && Number.isFinite(Number(loginPoint.x))
    && Number.isFinite(Number(loginPoint.y))
    ? {
        x: Number(loginPoint.x),
        y: Number(loginPoint.y),
        hp: Number.isFinite(Number(loginPoint.hp)) ? Number(loginPoint.hp) : null,
        source: String(loginPoint.source || 'last-self')
      }
    : null;
  if (!point) {
    return {
      ok: false,
      reason: 'missing-login-point',
      entityCount: entities.length
    };
  }
  const healthy = Number.isFinite(point.hp) && point.hp >= LOGIN_POINT_HEALTHY_HP_THRESHOLD;
  const radius = healthy ? LOGIN_POINT_HEALTHY_RADIUS : LOGIN_POINT_LOW_RADIUS;
  const nearby = [];
  const activeNearby = [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    if (Number(entity.user_id) === Number(state.userId)) continue;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance > radius) continue;
    const base = summarizeEntity(entity) || {};
    const item = {
      ...base,
      distance: Math.round(distance),
      active: isActiveEntity(entity),
      alive: isAliveEntity(entity)
    };
    nearby.push(item);
    if (item.active && item.alive) activeNearby.push(item);
  }
  activeNearby.sort((a, b) => a.distance - b.distance);
  nearby.sort((a, b) => a.distance - b.distance);
  const fresh = freshness || summarizeSnapshotFreshness(payload);
  const activeSafe = activeNearby.length === 0;
  const ok = Boolean(fresh.ok && activeSafe);
  return {
    ok,
    reason: fresh.ok ? (activeSafe ? 'safe' : 'active-near-login-point') : fresh.reason,
    freshness: fresh,
    point,
    radius,
    radiusReason: healthy ? 'last-self-healthy' : 'last-self-low-or-unknown',
    entityCount: entities.length,
    nearbyCount: nearby.length,
    activeNearbyCount: activeNearby.length,
    nearestActive: activeNearby[0] || null,
    nearest: nearby[0] || null
  };
}

function summarizeSnapshotPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'non-json-payload' };
  }
  const entities = Array.isArray(payload.entities) ? payload.entities : [];
  const bullets = Array.isArray(payload.bullets) ? payload.bullets : [];
  const coinDrops = Array.isArray(payload.coin_drops) ? payload.coin_drops : [];
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const self = entities.find(entity => Number(entity?.user_id) === Number(state.userId));
  const freshness = summarizeSnapshotFreshness(payload);
  return {
    valid: Array.isArray(payload.entities),
    jsonKeys: Object.keys(payload).slice(0, 20),
    tick: Number.isFinite(Number(payload.tick)) ? Number(payload.tick) : null,
    totalEntities: payload.total_entities ?? null,
    inGameCount: payload.in_game ?? null,
    visibleCount: payload.visible ?? null,
    occupiedCells: payload.occupied_cells ?? null,
    entityCount: entities.length,
    bulletCount: bullets.length,
    coinDropCount: coinDrops.length,
    messageCount: messages.length,
    selfPresent: Boolean(self),
    self: summarizeEntity(self),
    freshness,
    safety: summarizeSnapshotSafety(payload, state.lastSelfSummary, freshness)
  };
}

function extractAuthUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.auth_url || payload.authUrl || payload.url || payload.location || '');
}

async function getAuthUrl() {
  const response = await fetchWithTimeout(`${GAME_ORIGIN}/auth/linuxdo/start`, { cache: 'no-store' });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(`/auth/linuxdo/start HTTP ${response.status}: ${body.text.slice(0, 240)}`);
  const authUrl = extractAuthUrl(body.json);
  if (!authUrl || !/^https:\/\/connect\.linux\.do\/oauth2\/authorize\b/i.test(authUrl)) {
    throw new Error('auth_url missing or unexpected: ' + body.text.slice(0, 240));
  }
  state.authUrl = authUrl;
  state.authUrlAt = Date.now();
  state.lastError = '';
  persistState();
  logEvent('auth-url', { authUrl });
  return authUrl;
}

function normalizeCallbackUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('callback URL is empty');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error('invalid callback URL: ' + (err.message || String(err)));
  }
  if (parsed.origin === 'https://connect.linux.do' && parsed.pathname.startsWith('/oauth2/approve/')) {
    throw new Error('this is a LinuxDO approve URL; open it in your browser, complete approval, then paste the final game callback URL or callback JSON');
  }
  if (parsed.origin !== GAME_ORIGIN || (!parsed.pathname.startsWith('/auth/linuxdo/callback') && !isDirectLoginUrl(parsed))) {
    throw new Error(`callback origin/path mismatch: ${parsed.origin}${parsed.pathname}`);
  }
  return parsed.toString();
}

function isDirectLoginUrl(parsed) {
  return parsed
    && parsed.pathname === '/'
    && parsed.searchParams.get('login') === 'ok'
    && parsed.searchParams.get('user_id')
    && parsed.searchParams.get('token');
}

function extractLoginData(payload) {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.user,
    payload?.session
  ].filter(Boolean);
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const token = item.token || item.sessionToken || item.session_token || item.tmpGameSessionToken;
    const id = item.user_id || item.userId || item.id || item.tmpGameUserId;
    if (token && id) return { userId: Number(id), sessionToken: String(token) };
  }
  const found = findLoginFields(payload);
  if (found.userId && found.sessionToken) return found;
  return { userId: 0, sessionToken: '' };
}

function extractLoginDataFromText(text) {
  const raw = String(text || '');
  if (!raw) return { userId: 0, sessionToken: '' };
  const tokenPatterns = [
    /localStorage\.setItem\(\s*['"]tmpGameSessionToken['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i,
    /['"]tmpGameSessionToken['"]\s*[,=:]\s*['"]([^'"]+)['"]/i,
    /['"]sessionToken['"]\s*[,=:]\s*['"]([^'"]+)['"]/i,
    /['"]session_token['"]\s*[,=:]\s*['"]([^'"]+)['"]/i,
    /['"]token['"]\s*[,=:]\s*['"]([^'"]+)['"]/i
  ];
  const idPatterns = [
    /localStorage\.setItem\(\s*['"]tmpGameUserId['"]\s*,\s*['"]?(\d+)['"]?\s*\)/i,
    /['"]tmpGameUserId['"]\s*[,=:]\s*['"]?(\d+)['"]?/i,
    /['"]user_id['"]\s*[,=:]\s*['"]?(\d+)['"]?/i,
    /['"]userId['"]\s*[,=:]\s*['"]?(\d+)['"]?/i,
    /['"]id['"]\s*[,=:]\s*['"]?(\d+)['"]?/i
  ];
  const token = firstPattern(raw, tokenPatterns);
  const id = firstPattern(raw, idPatterns);
  return { userId: Number(id || 0), sessionToken: token || '' };
}

function extractLoginDataFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    const hashParams = new URLSearchParams(String(parsed.hash || '').replace(/^#/, ''));
    const token = firstSearchParam(parsed.searchParams, hashParams, ['token', 'sessionToken', 'session_token', 'tmpGameSessionToken']);
    const id = firstSearchParam(parsed.searchParams, hashParams, ['user_id', 'userId', 'id', 'tmpGameUserId']);
    return { userId: Number(id || 0), sessionToken: token };
  } catch (_) {
    return { userId: 0, sessionToken: '' };
  }
}

function extractMetaRefreshUrl(text, baseUrl) {
  const raw = String(text || '');
  const tags = raw.match(/<meta\b[^>]*>/ig) || [];
  for (const tag of tags) {
    const httpEquiv = readHtmlAttribute(tag, 'http-equiv');
    if (!/^refresh$/i.test(String(httpEquiv || '').trim())) continue;
    const content = readHtmlAttribute(tag, 'content');
    const match = /(?:^|;)\s*url\s*=\s*(.+?)\s*$/i.exec(content);
    if (!match?.[1]) continue;
    const target = decodeHtmlEntities(match[1].trim().replace(/^['"]|['"]$/g, ''));
    const resolved = resolveLocation(target, baseUrl);
    if (resolved) return resolved;
  }
  return '';
}

function readHtmlAttribute(tag, name) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(String(tag || ''));
  return decodeHtmlEntities(match?.[1] || match?.[2] || match?.[3] || '');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/ig, '&')
    .replace(/&quot;/ig, '"')
    .replace(/&#39;|&apos;/ig, "'")
    .replace(/&lt;/ig, '<')
    .replace(/&gt;/ig, '>')
    .replace(/&#x([0-9a-f]+);/ig, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstSearchParam(primary, secondary, keys) {
  for (const key of keys) {
    const value = primary.get(key) || secondary.get(key);
    if (value) return value;
  }
  return '';
}

function firstPattern(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return '';
}

function findLoginFields(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return { userId: 0, sessionToken: '' };
  let userId = 0;
  let sessionToken = '';
  if (!Array.isArray(value)) {
    const token = value.token || value.sessionToken || value.session_token || value.tmpGameSessionToken;
    const id = value.user_id || value.userId || value.id || value.tmpGameUserId;
    if (token) sessionToken = String(token);
    if (id) userId = Number(id);
  }
  for (const child of Object.values(value)) {
    if (userId && sessionToken) break;
    const found = findLoginFields(child, depth + 1);
    if (!userId && found.userId) userId = found.userId;
    if (!sessionToken && found.sessionToken) sessionToken = found.sessionToken;
  }
  return { userId: Number(userId || 0), sessionToken };
}

function summarizeLoginPayload(payload) {
  return {
    jsonKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 20) : [],
    source: 'manual-payload'
  };
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
  if (/^curl\s+/i.test(rawInput) && /connect\.linux\.do\/oauth2\/approve\//i.test(rawInput)) {
    return submitApproveCurl(rawInput);
  }
  if (/^\{/.test(rawInput)) {
    let payload;
    try {
      payload = JSON.parse(rawInput);
    } catch (err) {
      throw new Error('invalid JSON login payload: ' + (err.message || String(err)));
    }
    const login = extractLoginData(payload);
    return applyLogin(login, summarizeLoginPayload(payload));
  }
  const url = normalizeCallbackUrl(callbackUrl);
  const directLogin = extractLoginDataFromUrl(url);
  if (directLogin.userId && directLogin.sessionToken) {
    state.callbackUrl = url;
    return applyLogin(directLogin, { source: 'direct-login-url' });
  }
  logEvent('callback-submit', { callbackUrl: url });
  return submitGameCallbackUrl(url);
}

async function submitApproveCurl(rawInput) {
  const request = parseCurlCommand(rawInput);
  const parsed = new URL(request.url);
  if (parsed.origin !== 'https://connect.linux.do' || !parsed.pathname.startsWith('/oauth2/approve/')) {
    throw new Error('approve curl must target https://connect.linux.do/oauth2/approve/...');
  }
  if (!request.headers.cookie) {
    throw new Error('approve curl is missing Cookie header; use browser DevTools "Copy as cURL" for the LinuxDO approve request');
  }
  logEvent('approve-curl-submit', {
    url: request.url,
    method: request.method,
    headerNames: Object.keys(request.headers)
  });
  const approveResponse = await fetchWithTimeout(request.url, {
    method: request.method,
    redirect: 'manual',
    headers: request.headers,
    body: request.body,
    cache: 'no-store'
  });
  const approveLocation = resolveLocation(approveResponse.headers.get('location') || '', request.url);
  const approveBody = await readResponseBody(approveResponse);
  const approveSummary = {
    status: approveResponse.status,
    location: redact(approveLocation),
    contentType: approveResponse.headers.get('content-type') || '',
    textLength: approveBody.text.length,
    textSample: redact(approveBody.text.slice(0, 500))
  };
  logEvent('approve-curl-result', approveSummary);
  if (!approveLocation || new URL(approveLocation).origin !== GAME_ORIGIN) {
    state.lastCallbackDebug = redactStructured({ source: 'approve-curl', approve: approveSummary });
    state.lastError = 'approve request did not redirect to game callback';
    persistState();
    throw new Error(`approve request did not redirect to game callback; status=${approveResponse.status}, location=${approveSummary.location || 'none'}`);
  }
  return submitGameCallbackUrl(approveLocation, { source: 'approve-curl', approve: approveSummary });
}

async function submitGameCallbackUrl(url, extraSummary = {}) {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    redirect: 'manual',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const location = resolveLocation(response.headers.get('location') || '', url);
  const refreshUrl = extractMetaRefreshUrl(body.text, url);
  const summary = {
    ...extraSummary,
    status: response.status,
    ok: response.ok,
    finalUrl: redact(response.url || url),
    location: redact(location),
    refreshUrl: redact(refreshUrl),
    redirected: response.status >= 300 && response.status < 400,
    contentType: response.headers.get('content-type') || '',
    setCookiePresent: Boolean(response.headers.get('set-cookie')),
    jsonKeys: body.json && typeof body.json === 'object' ? Object.keys(body.json).slice(0, 20) : [],
    textLength: body.text.length,
    textSample: body.json ? '' : redact(body.text.slice(0, 500))
  };
  let login = extractLoginData(body.json || {});
  if (!login.userId || !login.sessionToken) login = extractLoginDataFromText(body.text);
  if ((!login.userId || !login.sessionToken) && location) login = extractLoginDataFromUrl(location);
  if ((!login.userId || !login.sessionToken) && refreshUrl) login = extractLoginDataFromUrl(refreshUrl);
  if (!login.userId || !login.sessionToken) login = extractLoginDataFromUrl(response.url);
  const safeSummary = redactStructured(summary);
  state.lastCallbackDebug = safeSummary;
  if (!response.ok && !summary.redirected) {
    state.lastError = `callback HTTP ${response.status}`;
    state.loginPayloadSummary = safeSummary;
    persistState();
    logEvent('callback-failed', { callbackUrl: url, summary: safeSummary });
    throw new Error(`callback HTTP ${response.status}: ${redact((body.text || '<empty body>').slice(0, 240))}`);
  }
  if (!login.userId || !login.sessionToken) {
    state.lastError = 'callback did not return userId/sessionToken';
    state.loginPayloadSummary = safeSummary;
    persistState();
    logEvent('callback-unrecognized', { callbackUrl: url, summary: safeSummary, body: body.json || body.text.slice(0, 1000) });
    throw new Error(`callback response did not expose userId/sessionToken; status=${response.status}, content-type=${summary.contentType || 'unknown'}, location=${summary.location || 'none'}, refresh=${summary.refreshUrl || 'none'}, body=${body.text ? redact(body.text.slice(0, 240)) : 'empty'}`);
  }
  state.callbackUrl = redact(url);
  return applyLogin(login, safeSummary);
}

function parseCurlCommand(input) {
  const tokens = tokenizeShellLike(input);
  if (!tokens.length || tokens[0] !== 'curl') throw new Error('expected a curl command');
  const request = {
    url: '',
    method: 'GET',
    headers: {},
    body: null
  };
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-H' || token === '--header') {
      const header = tokens[++i] || '';
      const index = header.indexOf(':');
      if (index > 0) {
        const name = header.slice(0, index).trim().toLowerCase();
        const value = header.slice(index + 1).trim();
        if (name && !forbiddenForwardHeader(name)) request.headers[name] = value;
      }
      continue;
    }
    if (token === '-b' || token === '--cookie' || token === '--cookie-jar') {
      const cookie = tokens[++i] || '';
      if (cookie && token !== '--cookie-jar') request.headers.cookie = cookie;
      continue;
    }
    if (token === '-X' || token === '--request') {
      request.method = String(tokens[++i] || 'GET').toUpperCase();
      continue;
    }
    if (token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '-d') {
      request.body = tokens[++i] || '';
      if (request.method === 'GET') request.method = 'POST';
      continue;
    }
    if (token === '-A' || token === '--user-agent') {
      request.headers['user-agent'] = tokens[++i] || '';
      continue;
    }
    if (token === '-e' || token === '--referer') {
      request.headers.referer = tokens[++i] || '';
      continue;
    }
    if (token.startsWith('http://') || token.startsWith('https://')) {
      request.url = token;
    }
  }
  if (!request.url) throw new Error('curl command did not contain a URL');
  if (request.body !== null) request.headers['content-type'] = request.headers['content-type'] || 'application/x-www-form-urlencoded';
  return request;
}

function forbiddenForwardHeader(name) {
  return [
    'host',
    'connection',
    'content-length',
    'upgrade',
    'sec-websocket-key',
    'sec-websocket-version',
    'sec-websocket-extensions'
  ].includes(String(name || '').toLowerCase());
}

function tokenizeShellLike(input) {
  const text = String(input || '').replace(/\\\r?\n/g, ' ');
  const tokens = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = '';
      } else if (ch === '\\' && quote === '"' && i + 1 < text.length) {
        current += text[++i];
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    if (ch === '\\' && i + 1 < text.length) {
      current += text[++i];
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error('unterminated quote in curl command');
  if (current) tokens.push(current);
  return tokens;
}

function resolveLocation(location, baseUrl) {
  if (!location) return '';
  try {
    return new URL(location, baseUrl).toString();
  } catch (_) {
    return String(location || '');
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

function summarizeEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const output = {};
  for (const key of [
    'entity_id',
    'user_id',
    'name',
    'x',
    'y',
    'vx',
    'vy',
    'hp',
    'max_hp',
    'life',
    'visible',
    'joined',
    'current_join_mode',
    'coins'
  ]) {
    if (entity[key] !== undefined) output[key] = entity[key];
  }
  if (Array.isArray(entity.cell)) output.cell = entity.cell.slice(0, 2);
  return Object.keys(output).length ? output : null;
}

function summarizeShotAck(json) {
  const output = {};
  for (const key of [
    'type',
    'bullet_id',
    'owner_user_id',
    'start_x',
    'start_y',
    'target_x',
    'target_y',
    'dir_x_micros',
    'dir_y_micros',
    'range_cm',
    'speed_per_tick',
    'created_tick',
    'expire_tick'
  ]) {
    if (json[key] !== undefined) output[key] = json[key];
  }
  return output;
}

function summarizeDecodedJson(json, userId) {
  if (!json || typeof json !== 'object') return null;
  const hasEntities = Array.isArray(json.entities);
  const hasBullets = Array.isArray(json.bullets);
  const entities = hasEntities ? json.entities : [];
  const bullets = hasBullets ? json.bullets : [];
  const summary = {
    type: typeof json.type === 'string' ? json.type : '',
    tick: Number.isFinite(Number(json.tick)) ? Number(json.tick) : undefined,
    keyCount: Object.keys(json).length
  };
  if (hasEntities) summary.entityCount = entities.length;
  if (hasBullets) summary.bulletCount = bullets.length;
  if (Array.isArray(json.coin_drops)) summary.coinDropCount = json.coin_drops.length;
  if (Array.isArray(json.messages)) summary.messageCount = json.messages.length;
  if (json.total_entities !== undefined) summary.totalEntities = json.total_entities;
  if (json.in_game !== undefined) summary.inGameCount = json.in_game;
  if (json.visible !== undefined) summary.visibleCount = json.visible;
  if (json.occupied_cells !== undefined) summary.occupiedCells = json.occupied_cells;

  const self = userId ? entities.find(entity => Number(entity?.user_id) === Number(userId)) : null;
  if (userId && hasEntities) summary.selfPresent = Boolean(self);
  if (self) summary.self = summarizeEntity(self);

  if (summary.type === 'shoot_ok') {
    summary.ack = summarizeShotAck(json);
  }
  return summary;
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
    frame.format = 'GRZ1';
    frame.version = buffer[4];
    const payload = buffer.subarray(5);
    if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
      frame.compression = 'gzip';
      try {
        const decoded = zlib.gunzipSync(payload);
        const decodedText = decoded.toString('utf8');
        frame.decodedByteLength = decoded.length;
        try {
          const json = JSON.parse(decodedText);
          frame.decodedJsonKeys = json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [];
          frame.decodedType = typeof json?.type === 'string' ? json.type : '';
          if (Number.isFinite(Number(json?.tick))) frame.decodedTick = Number(json.tick);
          frame.decodedSummary = summarizeDecodedJson(json, state.userId);
          if (!frame.decodedSummary && WS_FRAME_DECODED_SAMPLE_BYTES > 0) {
            frame.decodedSample = redact(decodedText.slice(0, WS_FRAME_DECODED_SAMPLE_BYTES));
          }
        } catch (_) {}
        if (!frame.decodedJsonKeys && WS_FRAME_DECODED_SAMPLE_BYTES > 0) {
          frame.decodedSample = redact(decodedText.slice(0, WS_FRAME_DECODED_SAMPLE_BYTES));
        }
      } catch (err) {
        frame.decodeError = err?.message || String(err);
      }
    } else {
      frame.compression = 'unknown';
    }
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
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  const url = `${GAME_ORIGIN}/leave?user_id=${encodeURIComponent(state.userId)}&token=${encodeURIComponent(state.sessionToken)}`;
  const startedAt = Date.now();
  logEvent('leave-request', { stage, url });
  const response = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store' });
  const body = await readResponseBody(response);
  const result = {
    stage,
    httpOk: response.ok,
    status: response.status,
    statusText: response.statusText || '',
    durationMs: Date.now() - startedAt,
    response: body.json || { textSample: body.text.slice(0, 1000) }
  };
  result.ok = leaveResponseConfirmsExitCore(result.response);
  result.summary = summarizeLeaveResponseCore(result.response);
  logEvent('leave-result', result);
  return result;
}

async function leaveWithVerification() {
  const attempts = [];
  for (let index = 0; index <= LEAVE_RETRY_MAX; index += 1) {
    const result = await leaveOnce(index === 0 ? 'initial' : `retry-${index}`);
    attempts.push(result);
    if (result.ok) {
      state.inGame = false;
      state.lastLeaveAt = Date.now();
      state.lastLeaveSummary = result.summary || null;
      state.lastSelfSummary = summarizeEntity(result.response) || state.lastSelfSummary;
      state.leaveAlert = '';
      state.lastError = '';
      persistState();
      return { ok: true, attempts };
    }
    if (index < LEAVE_RETRY_MAX) await sleep(LEAVE_RETRY_MS);
  }
  const last = attempts[attempts.length - 1] || null;
  state.leaveAlert = `LEAVE NOT CONFIRMED${last ? `: HTTP ${last.status}, response ${JSON.stringify(last.summary || last.response || {}).slice(0, 200)}` : ''}`;
  state.lastError = state.leaveAlert;
  persistState();
  logEvent('leave-alert', { leaveAlert: state.leaveAlert, attempts });
  return { ok: false, attempts };
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
