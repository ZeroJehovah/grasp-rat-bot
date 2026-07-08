'use strict';

const http = require('http');
const { redactStructuredSecrets } = require('./session-client');
const { renderBrowserlessWebPanel } = require('./web-panel');

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

function createStatusServer(options = {}) {
  const webToken = String(options.webToken || '');
  const getStatus = typeof options.getStatus === 'function' ? options.getStatus : () => ({ ok: true });
  const onStop = typeof options.onStop === 'function' ? options.onStop : null;
  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && parsed.pathname === '/') {
        sendHtml(res, 200, renderBrowserlessWebPanel());
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (!requestAuthorized(req, parsed, webToken)) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      if (req.method === 'GET' && parsed.pathname === '/api/status') {
        sendJson(res, 200, redactStructuredSecrets(getStatus()));
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
  requestAuthorized,
  startStatusServer,
  tokenFromRequest
};
