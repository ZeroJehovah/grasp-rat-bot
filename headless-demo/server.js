'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
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
const LEAVE_RETRY_MAX = Math.max(0, Number(process.env.GRASP_RAT_DEMO_LEAVE_RETRY_MAX || 3));
const LEAVE_RETRY_MS = Math.max(250, Number(process.env.GRASP_RAT_DEMO_LEAVE_RETRY_MS || 1200));
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.GRASP_RAT_DEMO_HTTP_TIMEOUT_MS || 10000));
const WS_CONNECT_TIMEOUT_MS = Math.max(1000, Number(process.env.GRASP_RAT_DEMO_WS_CONNECT_TIMEOUT_MS || 10000));
const WS_FRAME_LIMIT = Math.max(0, Number(process.env.GRASP_RAT_DEMO_WS_FRAME_LIMIT || 80));
const WS_PATH = process.env.GRASP_RAT_DEMO_WS_PATH || '/ws';
const WS_EXTRA_QUERY = process.env.GRASP_RAT_DEMO_WS_EXTRA_QUERY || 'view=50000';

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
  wsUrl: '',
  wsOpen: false,
  wsLastMessageAt: 0,
  lastFrames: [],
  running: false,
  lastRun: null,
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
    .replace(/([?&](?:code|token|session|auth|secret)[^=]*=)[^&]+/ig, '$1[redacted]')
    .replace(/("(?:code|token|sessionToken|auth|secret)"\s*:\s*")[^"]+/ig, '$1[redacted]');
}

function publicState() {
  return {
    authUrl: state.authUrl,
    authUrlAt: state.authUrlAt,
    callbackAt: state.callbackAt,
    loggedIn: Boolean(state.userId && state.sessionToken),
    userId: state.userId || 0,
    tokenPresent: Boolean(state.sessionToken),
    loginPayloadSummary: state.loginPayloadSummary,
    wsUrl: redact(state.wsUrl),
    wsOpen: state.wsOpen,
    wsLastMessageAt: state.wsLastMessageAt,
    running: state.running,
    lastRun: state.lastRun,
    leaveAlert: state.leaveAlert,
    lastError: state.lastError,
    logFile: state.logFile,
    recentFrames: state.lastFrames.slice(-10)
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
    wsUrl: state.wsUrl,
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
  if (parsed.origin !== GAME_ORIGIN || !parsed.pathname.startsWith('/auth/linuxdo/callback')) {
    throw new Error(`callback origin/path mismatch: ${parsed.origin}${parsed.pathname}`);
  }
  return parsed.toString();
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
  state.callbackAt = Date.now();
  state.userId = login.userId;
  state.sessionToken = login.sessionToken;
  state.loginPayloadSummary = summary;
  state.leaveAlert = '';
  state.lastError = '';
  persistState();
  logEvent('login-ok', { userId: login.userId, tokenPresent: true, summary });
  return { userId: login.userId, tokenPresent: true, summary };
}

async function submitCallback(callbackUrl) {
  const rawInput = String(callbackUrl || '').trim();
  if (!rawInput) throw new Error('callback URL is empty');
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
  logEvent('callback-submit', { callbackUrl: url });
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const summary = {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    jsonKeys: body.json && typeof body.json === 'object' ? Object.keys(body.json).slice(0, 20) : [],
    textSample: body.json ? '' : body.text.slice(0, 500)
  };
  const login = extractLoginData(body.json || {});
  if (!response.ok) {
    state.lastError = `callback HTTP ${response.status}`;
    state.loginPayloadSummary = summary;
    persistState();
    logEvent('callback-failed', { callbackUrl: url, summary });
    throw new Error(`callback HTTP ${response.status}: ${body.text.slice(0, 240)}`);
  }
  if (!login.userId || !login.sessionToken) {
    state.lastError = 'callback did not return userId/sessionToken';
    state.loginPayloadSummary = summary;
    persistState();
    logEvent('callback-unrecognized', { callbackUrl: url, summary, body: body.json || body.text.slice(0, 1000) });
    throw new Error('callback response did not expose userId/sessionToken; check log for response shape');
  }
  state.callbackUrl = url;
  return applyLogin(login, summary);
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

function recordFrame(data) {
  const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  const frame = {
    at: new Date().toISOString(),
    sample: text.slice(0, 1000)
  };
  state.wsLastMessageAt = Date.now();
  state.lastFrames.push(frame);
  if (state.lastFrames.length > WS_FRAME_LIMIT) state.lastFrames.splice(0, state.lastFrames.length - WS_FRAME_LIMIT);
  logEvent('ws-frame', frame);
}

function openWs() {
  if (!state.userId || !state.sessionToken) throw new Error('not logged in');
  if (typeof WebSocket !== 'function') {
    throw new Error('Node.js global WebSocket is unavailable; use Node 20+ or Node 18.13+ with WebSocket support');
  }
  const wsUrl = wsUrlForUser(state.userId);
  state.wsUrl = wsUrl;
  persistState();
  logEvent('ws-connect-start', { wsUrl });
  const ws = new WebSocket(wsUrl);
  let opened = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!opened) {
        try { ws.close(); } catch (_) {}
        reject(new Error('websocket connect timeout'));
      }
    }, WS_CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      opened = true;
      clearTimeout(timer);
      state.wsOpen = true;
      state.lastError = '';
      logEvent('ws-open', { wsUrl });
      resolve(ws);
    };
    ws.onerror = event => {
      const message = event?.message || 'websocket error';
      state.lastError = message;
      logEvent('ws-error', { message });
      if (!opened) {
        clearTimeout(timer);
        reject(new Error(message));
      }
    };
    ws.onclose = event => {
      state.wsOpen = false;
      logEvent('ws-close', { code: event?.code || 0, reason: event?.reason || '', wasClean: Boolean(event?.wasClean) });
    };
    ws.onmessage = event => recordFrame(event.data);
  });
}

function wsSend(ws, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('websocket is not open');
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
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch (_) {}
    state.wsOpen = false;
    state.running = false;
    state.lastRun.completedAt = Date.now();
    persistState();
    logEvent('demo-finish', state.lastRun);
  }
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
      <textarea id="callbackInput" placeholder="https://grasp-rat-game.h-e.top/auth/linuxdo/callback?code=...&#10;或粘贴包含 user_id/userId/id 和 token/sessionToken 的 JSON"></textarea>
      <div class="row" style="margin-top:8px">
        <button id="callbackBtn">提交回调并登录</button>
      </div>
    </section>
    <section>
      <div class="row">
        <button class="danger" id="runBtn">运行一次移动/开枪/退出 Demo</button>
      </div>
      <p class="muted">只在点击后运行一次：上、下、左、右、开枪、leave。leave 未被服务端明确确认时会醒目报警。</p>
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
      document.getElementById('runBtn').disabled = data.state.running || !data.state.loggedIn;
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
  if (!text) return {};
  return JSON.parse(text);
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
    return sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    const message = err?.message || String(err);
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
