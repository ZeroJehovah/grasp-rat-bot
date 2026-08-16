'use strict';

const fs = require('fs');
const http = require('http');
const { performance } = require('perf_hooks');
const { buildCompactBrowserlessStatus } = require('./state-file');
const { redactStructuredSecrets } = require('./session-client');
const {
  BROWSERLESS_WEB_PANEL_VERSION,
  renderBrowserlessWebPanel
} = require('./web-panel');

function isLoopbackHost(host) {
  const value = String(host || '').trim().toLowerCase();
  return value === '127.0.0.1' || value === 'localhost' || value === '::1';
}

function tokenFromRequest(req, parsedUrl) {
  const queryToken = parsedUrl.searchParams.get('token') || '';
  if (queryToken) return queryToken;
  const headerToken = req.headers['x-web-token'];
  if (headerToken) return String(headerToken);
  const auth = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1] || '';
}

function requestAuthorized(req, parsedUrl, webToken) {
  const expected = String(webToken || '');
  if (!expected) return true;
  return tokenFromRequest(req, parsedUrl) === expected;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  sendJsonText(res, status, text);
}

function sendJsonText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(html);
}

function statusServerConfig(options = {}, server = null, webToken = '') {
  const address = server?.address?.();
  return {
    statusHost: options.host || options.statusHost || '',
    statusPort: typeof address === 'object' && address ? address.port : Number(options.port || options.statusPort || 0),
    webToken,
    webVersion: BROWSERLESS_WEB_PANEL_VERSION
  };
}

function withStatusServerMeta(status, config, preRedacted = false) {
  const output = preRedacted
    ? { ...(status && typeof status === 'object' && !Array.isArray(status) ? status : {}) }
    : redactStructuredSecrets(status);
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  output.statusServer = {
    ...(output.statusServer && typeof output.statusServer === 'object' ? output.statusServer : {}),
    webVersion: config.webVersion
  };
  return output;
}

function currentMainThreadCpuSample() {
  try {
    const text = fs.readFileSync(`/proc/self/task/${process.pid}/schedstat`, 'utf8').trim();
    const runtimeNs = Number(text.split(/\s+/)[0]);
    return Number.isFinite(runtimeNs)
      ? { source: 'linux-main-thread-schedstat', value: runtimeNs / 1e6 }
      : null;
  } catch (_) {
    return null;
  }
}

function taskWorkProfile(started, finished, wallMs) {
  const compatible = started
    && finished
    && started.source === 'linux-main-thread-schedstat'
    && finished.source === started.source
    && Number.isFinite(Number(started.value))
    && Number.isFinite(Number(finished.value))
    && Number(finished.value) >= Number(started.value);
  if (!compatible) {
    return {
      cpuUsageSource: 'unavailable',
      cpuWorkMs: null,
      nonCpuWallMs: null,
      likelyPauseOrContention: null,
      classification: 'cpu-sampler-unavailable'
    };
  }
  const cpuWorkMs = Math.max(0, Number(finished.value) - Number(started.value));
  const nonCpuWallMs = Math.max(0, Number(wallMs || 0) - cpuWorkMs);
  return {
    cpuUsageSource: started.source,
    cpuWorkMs: Math.round(cpuWorkMs * 1000) / 1000,
    nonCpuWallMs: Math.round(nonCpuWallMs * 1000) / 1000,
    likelyPauseOrContention: nonCpuWallMs >= 5,
    classification: nonCpuWallMs >= Math.max(5, cpuWorkMs * 0.35)
      ? 'pause-gc-or-contention'
      : 'cpu-work'
  };
}

function createStatusServer(options = {}) {
  const webToken = String(options.webToken || '');
  const getStatus = typeof options.getStatus === 'function' ? options.getStatus : () => ({ ok: true });
  const getCompactStatus = typeof options.getCompactStatus === 'function' ? options.getCompactStatus : null;
  const getStatusText = typeof options.getStatusText === 'function' ? options.getStatusText : null;
  const getCompactStatusText = typeof options.getCompactStatusText === 'function' ? options.getCompactStatusText : null;
  const statusPreRedacted = options.statusPreRedacted === true;
  const onMainThreadTask = typeof options.onMainThreadTask === 'function'
    ? options.onMainThreadTask
    : null;
  const taskPerformanceNow = typeof options.taskPerformanceNow === 'function'
    ? options.taskPerformanceNow
    : () => performance.now();
  const mainThreadCpuSampler = typeof options.mainThreadCpuSampler === 'function'
    ? options.mainThreadCpuSampler
    : currentMainThreadCpuSample;
  const onStop = typeof options.onStop === 'function' ? options.onStop : null;
  const onAuthUrl = typeof options.onAuthUrl === 'function' ? options.onAuthUrl : null;
  const onCallback = typeof options.onCallback === 'function' ? options.onCallback : null;
  const getChat = typeof options.getChat === 'function' ? options.getChat : () => ({ ok: true, messages: [] });
  const onChatActivity = typeof options.onChatActivity === 'function' ? options.onChatActivity : null;
  const onChatSend = typeof options.onChatSend === 'function' ? options.onChatSend : null;
  const onDynamicWhitelistAdd = typeof options.onDynamicWhitelistAdd === 'function'
    ? options.onDynamicWhitelistAdd
    : null;
  const recordTask = (task, started, detail = {}) => {
    if (!onMainThreadTask) return;
    try {
      const cpuFinished = mainThreadCpuSampler();
      const durationMs = taskPerformanceNow() - started.wallStarted;
      onMainThreadTask(task, durationMs, {
        ...detail,
        ...taskWorkProfile(started.cpuStarted, cpuFinished, durationMs)
      });
    } catch (_) {}
  };
  const startTask = () => ({
    wallStarted: taskPerformanceNow(),
    cpuStarted: onMainThreadTask ? mainThreadCpuSampler() : null
  });
  const dispatchStatus = async (getter, task, detail = {}) => {
    const started = startTask();
    let pending;
    try {
      pending = getter();
    } finally {
      recordTask(task, started, detail);
    }
    return await pending;
  };
  const sendStatusJson = (res, body, detail = {}) => {
    const started = startTask();
    try {
      sendJson(res, 200, body);
    } finally {
      recordTask('status-response', started, detail);
    }
  };
  const sendStatusText = (res, text, detail = {}) => {
    const started = startTask();
    try {
      sendJsonText(res, 200, String(text || '{}'));
    } finally {
      recordTask('status-response', started, detail);
    }
  };
  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      const config = statusServerConfig(options, server, webToken);
      if (req.method === 'GET' && parsed.pathname === '/') {
        sendHtml(res, 200, renderBrowserlessWebPanel());
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, webVersion: BROWSERLESS_WEB_PANEL_VERSION });
        return;
      }
      if (!requestAuthorized(req, parsed, webToken)) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/status') {
        if (/^(1|true|yes)$/i.test(parsed.searchParams.get('compact') || '')) {
          if (getCompactStatusText) {
            const text = await dispatchStatus(
              () => getCompactStatusText(config),
              'status-compact-dispatch',
              { path: parsed.pathname }
            );
            sendStatusText(res, text, { path: parsed.pathname, compact: true });
            return;
          }
          const status = getCompactStatus
            ? await dispatchStatus(getCompactStatus, 'status-compact-dispatch', { path: parsed.pathname })
            : buildCompactBrowserlessStatus(
                await dispatchStatus(getStatus, 'status-full-dispatch', { path: parsed.pathname }),
                config
              );
          sendStatusJson(res, withStatusServerMeta(status, config, true), { path: parsed.pathname, compact: true });
          return;
        }
        if (getStatusText) {
          const text = await dispatchStatus(
            () => getStatusText(config),
            'status-full-dispatch',
            { path: parsed.pathname }
          );
          sendStatusText(res, text, { path: parsed.pathname, compact: false });
          return;
        }
        const status = await dispatchStatus(getStatus, 'status-full-dispatch', { path: parsed.pathname });
        sendStatusJson(res, withStatusServerMeta(status, config, statusPreRedacted), { path: parsed.pathname, compact: false });
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/panel-status') {
        if (getCompactStatusText) {
          const text = await dispatchStatus(
            () => getCompactStatusText(config),
            'status-compact-dispatch',
            { path: parsed.pathname }
          );
          sendStatusText(res, text, { path: parsed.pathname, compact: true });
          return;
        }
        const status = getCompactStatus
          ? await dispatchStatus(getCompactStatus, 'status-compact-dispatch', { path: parsed.pathname })
          : buildCompactBrowserlessStatus(
              await dispatchStatus(getStatus, 'status-full-dispatch', { path: parsed.pathname }),
              config
            );
        sendStatusJson(res, withStatusServerMeta(status, config, true), { path: parsed.pathname, compact: true });
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/chat') {
        if (onChatActivity) await onChatActivity();
        sendJson(res, 200, getChat());
        return;
      }
      if (req.method === 'POST' && parsed.pathname === '/api/auth-url') {
        const result = onAuthUrl ? await onAuthUrl() : { ok: false, reason: 'auth-not-implemented' };
        sendJson(res, result?.ok === false ? 409 : 200, redactStructuredSecrets(result || { ok: true }));
        return;
      }
      if (req.method === 'POST' && parsed.pathname === '/api/callback') {
        const body = await readRequestJson(req);
        const result = onCallback ? await onCallback(body.callbackUrl || body.input || '') : { ok: false, reason: 'auth-not-implemented' };
        sendJson(res, result?.ok === false ? 409 : 200, redactStructuredSecrets(result || { ok: true }));
        return;
      }
      if (req.method === 'POST' && parsed.pathname === '/api/chat/send') {
        const body = await readRequestJson(req);
        const result = onChatSend
          ? await onChatSend(body.text ?? body.message ?? '')
          : { ok: false, statusCode: 409, reason: 'chat-not-implemented', error: 'chat sending is unavailable' };
        const responseBody = {
          ...(result || { ok: true }),
          chat: getChat()
        };
        const statusCode = result?.ok === false
          ? Math.max(400, Math.min(599, Number(result.statusCode || 409)))
          : 200;
        sendJson(res, statusCode, responseBody);
        return;
      }
      if (req.method === 'POST' && parsed.pathname === '/api/dynamic-whitelist') {
        const body = await readRequestJson(req);
        const result = onDynamicWhitelistAdd
          ? await onDynamicWhitelistAdd(body.name ?? '')
          : { ok: false, statusCode: 409, reason: 'dynamic-whitelist-not-implemented', error: '白名单管理不可用' };
        const statusCode = result?.ok === false
          ? Math.max(400, Math.min(599, Number(result.statusCode || 409)))
          : 200;
        sendJson(res, statusCode, result || { ok: true });
        return;
      }
      if (req.method === 'POST' && parsed.pathname === '/api/stop') {
        const result = onStop ? await onStop() : { ok: false, reason: 'control-not-implemented' };
        sendJson(res, result?.ok === false ? 409 : 200, result || { ok: true });
        return;
      }
      sendJson(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err?.message || String(err) });
    }
  });
  return server;
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => {
      text += chunk;
      if (text.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new Error('invalid JSON request body: ' + (err?.message || String(err))));
      }
    });
  });
}

function startStatusServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 0);
  if (!isLoopbackHost(host) && !options.webToken) {
    throw new Error('browserless status server requires a web token on non-loopback hosts');
  }
  const server = createStatusServer(options);
  return new Promise((resolve, reject) => {
    const onError = err => {
      server.off('error', onError);
      reject(err);
    };
    server.on('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const address = server.address();
      resolve({
        server,
        host,
        port: typeof address === 'object' && address ? address.port : port,
        close: () => new Promise(closeResolve => server.close(() => closeResolve()))
      });
    });
  });
}

module.exports = {
  createStatusServer,
  isLoopbackHost,
  readRequestJson,
  requestAuthorized,
  startStatusServer,
  tokenFromRequest
};
