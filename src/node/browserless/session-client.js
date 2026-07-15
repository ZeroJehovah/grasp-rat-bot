'use strict';

const http = require('http');
const https = require('https');
const { summarizeGrzEntity } = require('../../shared/grz-frame');
const { summarizeStaminaWindow } = require('./stamina-metadata');

const DEFAULT_GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const DEFAULT_HTTP_TIMEOUT_MS = 10000;
const DEFAULT_ACCEPT_HEADER = 'application/json,text/plain,*/*';

let undiciAgentConstructor = null;
let undiciAgentLoaded = false;
const localAddressDispatchers = new Map();

function getUndiciAgentConstructor() {
  if (undiciAgentLoaded) return undiciAgentConstructor;
  undiciAgentLoaded = true;
  try {
    undiciAgentConstructor = require('undici').Agent;
  } catch (_) {
    undiciAgentConstructor = null;
  }
  return undiciAgentConstructor;
}

function dispatcherForLocalAddress(localAddress) {
  const value = String(localAddress || '').trim();
  if (!value) return null;
  if (localAddressDispatchers.has(value)) return localAddressDispatchers.get(value);
  const Agent = getUndiciAgentConstructor();
  if (typeof Agent !== 'function') {
    throw new Error('HTTP source IP binding requires undici Agent support');
  }
  const dispatcher = new Agent({ connect: { localAddress: value } });
  localAddressDispatchers.set(value, dispatcher);
  return dispatcher;
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/((?:[?&]|&amp;)(?:code|token|session|auth|secret)[^=]*=)[^&"'\\\s]+/ig, '$1[redacted]')
    .replace(/("(?:code|token|sessionToken|auth|secret|cookie|set-cookie)"\s*:\s*")[^"]+/ig, '$1[redacted]')
    .replace(/((?:auth\.session-token|cf_clearance|_cfuvid|__stripe_mid)=)[^;"'\s]+/ig, '$1[redacted]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/ig, '$1[redacted]');
}

function redactStructuredSecrets(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 8) return redactSecrets(JSON.stringify(value));
  if (Array.isArray(value)) return value.map(item => redactStructuredSecrets(item, depth + 1));
  if (typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:code|token|sessionToken|session_token|tmpGameSessionToken|cookie|set-cookie|authorization)$/i.test(key)) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactStructuredSecrets(item, depth + 1);
    }
  }
  return output;
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS));
  const hasCustomFetchImpl = typeof options.fetchImpl === 'function';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation unavailable');
  if (options.localAddress && !hasCustomFetchImpl) {
    return fetchWithLocalAddress(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, fetchImpl: _fetchImpl, localAddress, ...fetchOptions } = options;
  if (localAddress) {
    fetchOptions.dispatcher = fetchOptions.dispatcher || dispatcherForLocalAddress(localAddress);
    fetchOptions.localAddress = localAddress;
  }
  try {
    return await fetchImpl(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        accept: DEFAULT_ACCEPT_HEADER,
        ...(fetchOptions.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function fetchWithLocalAddress(url, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS));
  const parsed = new URL(String(url));
  const client = parsed.protocol === 'http:' ? http : https;
  const headers = {
    accept: DEFAULT_ACCEPT_HEADER,
    ...(options.headers || {})
  };
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body === undefined || options.body === null ? null : options.body;
  return new Promise((resolve, reject) => {
    const request = client.request(parsed, {
      method,
      headers,
      localAddress: String(options.localAddress || ''),
      family: String(options.localAddress || '').includes(':') ? 6 : 4,
      timeout: timeoutMs
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const responseHeaders = response.headers || {};
        resolve({
          ok: Number(response.statusCode || 0) >= 200 && Number(response.statusCode || 0) < 300,
          status: Number(response.statusCode || 0),
          statusText: response.statusMessage || '',
          url: String(url),
          headers: {
            get(name) {
              const value = responseHeaders[String(name || '').toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : (value || '');
            }
          },
          text: async () => buffer.toString('utf8')
        });
      });
    });
    request.on('timeout', () => request.destroy(new Error('request timeout')));
    request.on('error', reject);
    if (body !== null) request.write(body);
    request.end();
  });
}

async function readResponseBody(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch (_) {
    return { text, json: null };
  }
}

function resolveLocation(location, baseUrl) {
  if (!location) return '';
  try {
    return new URL(location, baseUrl).toString();
  } catch (_) {
    return String(location || '');
  }
}

function extractAuthUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.auth_url || payload.authUrl || payload.url || payload.location || '');
}

async function requestAuthUrl(options = {}) {
  const gameOrigin = String(options.gameOrigin || DEFAULT_GAME_ORIGIN).replace(/\/$/, '');
  const response = await fetchWithTimeout(`${gameOrigin}/auth/linuxdo/start`, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    localAddress: options.localAddress,
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(`/auth/linuxdo/start HTTP ${response.status}: ${body.text.slice(0, 240)}`);
  const authUrl = extractAuthUrl(body.json);
  if (!authUrl || !/^https:\/\/connect\.linux\.do\/oauth2\/authorize\b/i.test(authUrl)) {
    throw new Error('auth_url missing or unexpected: ' + body.text.slice(0, 240));
  }
  return authUrl;
}

function normalizeCallbackUrl(input, options = {}) {
  const gameOrigin = String(options.gameOrigin || DEFAULT_GAME_ORIGIN).replace(/\/$/, '');
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
  if (parsed.origin !== gameOrigin || (!parsed.pathname.startsWith('/auth/linuxdo/callback') && !isDirectLoginUrl(parsed))) {
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

async function submitCallbackInput(input, options = {}) {
  const rawInput = String(input || '').trim();
  const gameOrigin = String(options.gameOrigin || DEFAULT_GAME_ORIGIN).replace(/\/$/, '');
  if (!rawInput) throw new Error('callback URL is empty');
  if (/^curl\s+/i.test(rawInput) && /connect\.linux\.do\/oauth2\/approve\//i.test(rawInput)) {
    return submitApproveCurl(rawInput, options);
  }
  if (/^\{/.test(rawInput)) {
    let payload;
    try {
      payload = JSON.parse(rawInput);
    } catch (err) {
      throw new Error('invalid JSON login payload: ' + (err.message || String(err)));
    }
    return {
      source: 'manual-payload',
      login: extractLoginData(payload),
      summary: redactStructuredSecrets(summarizeLoginPayload(payload)),
      callbackUrl: ''
    };
  }
  const url = normalizeCallbackUrl(rawInput, { gameOrigin });
  const directLogin = extractLoginDataFromUrl(url);
  if (directLogin.userId && directLogin.sessionToken) {
    return {
      source: 'direct-login-url',
      login: directLogin,
      summary: { source: 'direct-login-url' },
      callbackUrl: url
    };
  }
  return submitGameCallbackUrl(url, options);
}

async function submitApproveCurl(rawInput, options = {}) {
  const gameOrigin = String(options.gameOrigin || DEFAULT_GAME_ORIGIN).replace(/\/$/, '');
  const request = parseCurlCommand(rawInput);
  const parsed = new URL(request.url);
  if (parsed.origin !== 'https://connect.linux.do' || !parsed.pathname.startsWith('/oauth2/approve/')) {
    throw new Error('approve curl must target https://connect.linux.do/oauth2/approve/...');
  }
  if (!request.headers.cookie) {
    throw new Error('approve curl is missing Cookie header; use browser DevTools "Copy as cURL" for the LinuxDO approve request');
  }
  const approveResponse = await fetchWithTimeout(request.url, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    localAddress: options.localAddress,
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
    location: redactSecrets(approveLocation),
    contentType: approveResponse.headers.get('content-type') || '',
    textLength: approveBody.text.length,
    textSample: redactSecrets(approveBody.text.slice(0, 500))
  };
  if (!approveLocation || new URL(approveLocation).origin !== gameOrigin) {
    const err = new Error(`approve request did not redirect to game callback; status=${approveResponse.status}, location=${approveSummary.location || 'none'}`);
    err.summary = redactStructuredSecrets({ source: 'approve-curl', approve: approveSummary });
    throw err;
  }
  return submitGameCallbackUrl(approveLocation, {
    ...options,
    extraSummary: { source: 'approve-curl', approve: approveSummary }
  });
}

async function submitGameCallbackUrl(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    localAddress: options.localAddress,
    method: 'GET',
    redirect: 'manual',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const location = resolveLocation(response.headers.get('location') || '', url);
  const refreshUrl = extractMetaRefreshUrl(body.text, url);
  const summary = {
    ...(options.extraSummary || {}),
    status: response.status,
    ok: response.ok,
    finalUrl: redactSecrets(response.url || url),
    location: redactSecrets(location),
    refreshUrl: redactSecrets(refreshUrl),
    redirected: response.status >= 300 && response.status < 400,
    contentType: response.headers.get('content-type') || '',
    setCookiePresent: Boolean(response.headers.get('set-cookie')),
    jsonKeys: body.json && typeof body.json === 'object' ? Object.keys(body.json).slice(0, 20) : [],
    textLength: body.text.length,
    textSample: body.json ? '' : redactSecrets(body.text.slice(0, 500))
  };
  let login = extractLoginData(body.json || {});
  if (!login.userId || !login.sessionToken) login = extractLoginDataFromText(body.text);
  if ((!login.userId || !login.sessionToken) && location) login = extractLoginDataFromUrl(location);
  if ((!login.userId || !login.sessionToken) && refreshUrl) login = extractLoginDataFromUrl(refreshUrl);
  if (!login.userId || !login.sessionToken) login = extractLoginDataFromUrl(response.url);
  const safeSummary = redactStructuredSecrets(summary);
  if (!response.ok && !summary.redirected) {
    const err = new Error(`callback HTTP ${response.status}: ${redactSecrets((body.text || '<empty body>').slice(0, 240))}`);
    err.summary = safeSummary;
    err.status = response.status;
    throw err;
  }
  if (!login.userId || !login.sessionToken) {
    const err = new Error(`callback response did not expose userId/sessionToken; status=${response.status}, content-type=${summary.contentType || 'unknown'}, location=${summary.location || 'none'}, refresh=${summary.refreshUrl || 'none'}, body=${body.text ? redactSecrets(body.text.slice(0, 240)) : 'empty'}`);
    err.summary = safeSummary;
    err.body = body.json || body.text.slice(0, 1000);
    throw err;
  }
  return {
    source: safeSummary.source || 'game-callback-url',
    login,
    summary: safeSummary,
    callbackUrl: redactSecrets(url),
    debug: safeSummary
  };
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

function buildSnapshotProbeUrl(options = {}) {
  const url = new URL(options.snapshotPath || '/snapshot', options.gameOrigin || DEFAULT_GAME_ORIGIN);
  url.searchParams.set('user_id', String(options.userId || 0));
  url.searchParams.set('token', options.sessionToken || '');
  url.searchParams.set('_graspRatProbeTs', String(options.nowMs || Date.now()));
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

function entityUserId(entity) {
  const value = entity?.user_id ?? entity?.userId;
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function userIdSet(values) {
  const output = new Set();
  const list = values instanceof Set ? Array.from(values) : (Array.isArray(values) ? values : []);
  for (const value of list) {
    const userId = Number(value?.userId ?? value?.user_id ?? value);
    if (Number.isFinite(userId)) output.add(String(userId));
  }
  return output;
}

function summarizeSnapshotFreshness(payload, latestKnownTick = 0, options = {}) {
  const tick = Number(payload?.tick);
  const latest = Number(latestKnownTick || 0);
  const latestKnown = Number.isFinite(latest) && latest > 0 ? latest : 0;
  const requireAdvance = Boolean(options.requireAdvance);
  if (!Number.isFinite(tick)) {
    return {
      ok: false,
      reason: 'missing-snapshot-tick',
      tick: null,
      latestKnownTick: latestKnown || null
    };
  }
  if (!latestKnown) {
    return {
      ok: true,
      reason: 'no-prior-tick',
      tick,
      latestKnownTick: null
    };
  }
  const fresh = requireAdvance ? tick > latestKnown : tick >= latestKnown;
  return {
    ok: fresh,
    reason: fresh
      ? (requireAdvance ? 'fresh-after-confirmed-leave' : 'fresh')
      : (requireAdvance ? 'stale-confirmed-leave-snapshot-tick' : 'stale-snapshot-tick'),
    tick,
    latestKnownTick: latestKnown,
    tickDelta: tick - latestKnown
  };
}

function summarizeSnapshotSafety(payload, loginPoint, options = {}) {
  const entities = Array.isArray(payload?.entities) ? payload.entities : [];
  const damageActorUserIds = userIdSet(options.damageActorUserIds ?? options.dangerousUserIds);
  const easyKillUserIds = userIdSet(options.easyKillUserIds ?? options.recentKillUserIds);
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
  const healthyHpThreshold = Math.max(0, Number(options.healthyHpThreshold ?? 80));
  const healthyRadius = Math.max(0, Number(options.healthyRadius ?? 17000));
  const lowRadius = Math.max(0, Number(options.lowRadius ?? 30000));
  const healthy = Number.isFinite(point.hp) && point.hp >= healthyHpThreshold;
  const radius = healthy ? healthyRadius : lowRadius;
  const nearby = [];
  const activeNearby = [];
  const damageActorNearby = [];
  const trustedEasyKillNearby = [];
  const dangerousNearby = [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const userId = entityUserId(entity);
    if (userId !== null && userId === Number(options.userId || 0)) continue;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance > radius) continue;
    const base = summarizeGrzEntity(entity) || {};
    const stamina5s = summarizeStaminaWindow(entity, '5s', {
      staminaFullRatio: options.staminaFullRatio,
      defaultLimit: 10000
    });
    const item = {
      ...base,
      distance: Math.round(distance),
      active: Boolean(stamina5s.known && !stamina5s.full),
      joinModeActive: isActiveEntity(entity),
      stamina5sKnown: stamina5s.known,
      stamina5sRemainingMilli: stamina5s.remaining,
      stamina5sLimitMilli: stamina5s.limit,
      fullStamina5s: stamina5s.full,
      knownEasyKill: userId !== null && easyKillUserIds.has(String(userId)),
      knownDamageActor: userId !== null && damageActorUserIds.has(String(userId)),
      alive: isAliveEntity(entity)
    };
    item.trustedEasyKill = Boolean(item.knownEasyKill && !item.knownDamageActor);
    nearby.push(item);
    if (item.active && item.alive) activeNearby.push(item);
    if (item.knownDamageActor && item.alive) damageActorNearby.push(item);
    if (item.trustedEasyKill && item.alive) trustedEasyKillNearby.push(item);
    if (((item.active && !item.trustedEasyKill) || item.knownDamageActor) && item.alive) dangerousNearby.push(item);
  }
  activeNearby.sort((a, b) => a.distance - b.distance);
  damageActorNearby.sort((a, b) => a.distance - b.distance);
  trustedEasyKillNearby.sort((a, b) => a.distance - b.distance);
  dangerousNearby.sort((a, b) => a.distance - b.distance);
  nearby.sort((a, b) => a.distance - b.distance);
  const fresh = options.freshness || summarizeSnapshotFreshness(payload, options.latestKnownTick);
  const dangerousSafe = dangerousNearby.length === 0;
  const ok = Boolean(fresh.ok && dangerousSafe);
  return {
    ok,
    reason: fresh.ok
      ? (dangerousSafe
          ? 'safe'
          : (damageActorNearby.length ? 'damage-actor-near-login-point' : 'active-near-login-point'))
      : fresh.reason,
    freshness: fresh,
    point,
    radius,
    radiusReason: healthy ? 'last-self-healthy' : 'last-self-low-or-unknown',
    entityCount: entities.length,
    nearbyCount: nearby.length,
    activeNearbyCount: activeNearby.length,
    damageActorNearbyCount: damageActorNearby.length,
    trustedEasyKillNearbyCount: trustedEasyKillNearby.length,
    dangerousNearbyCount: dangerousNearby.length,
    nearestActive: activeNearby[0] || null,
    nearestDamageActor: damageActorNearby[0] || null,
    nearestTrustedEasyKill: trustedEasyKillNearby[0] || null,
    nearestDangerous: dangerousNearby[0] || null,
    nearest: nearby[0] || null
  };
}

function summarizeSnapshotPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'non-json-payload' };
  }
  const entities = Array.isArray(payload.entities) ? payload.entities : [];
  const bullets = Array.isArray(payload.bullets) ? payload.bullets : [];
  const coinDrops = Array.isArray(payload.coin_drops) ? payload.coin_drops : [];
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const self = entities.find(entity => Number(entity?.user_id) === Number(options.userId || 0));
  const freshness = summarizeSnapshotFreshness(payload, options.latestKnownTick, {
    requireAdvance: options.requireTickAdvance
  });
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
    self: summarizeGrzEntity(self),
    freshness,
    safety: summarizeSnapshotSafety(payload, options.loginPoint, { ...options, freshness })
  };
}

module.exports = {
  buildSnapshotProbeUrl,
  decodeHtmlEntities,
  extractAuthUrl,
  extractLoginData,
  extractLoginDataFromText,
  extractLoginDataFromUrl,
  extractMetaRefreshUrl,
  fetchWithTimeout,
  normalizeCallbackUrl,
  parseCurlCommand,
  readResponseBody,
  redactSecrets,
  redactStructuredSecrets,
  requestAuthUrl,
  resolveLocation,
  submitApproveCurl,
  submitCallbackInput,
  submitGameCallbackUrl,
  summarizeLoginPayload,
  summarizeSnapshotFreshness,
  summarizeSnapshotPayload,
  summarizeSnapshotSafety
};
