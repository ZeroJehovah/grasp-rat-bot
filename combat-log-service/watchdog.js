'use strict';

const fs = require('fs');
const path = require('path');

const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const SECRET_KEY_RE = /(?:secret|token|cookie|authorization|password|credential|session)/i;
const NON_SECRET_CONFIG_KEY_RE = /^(?:requiredCookieNames|requiredHeaders)$/i;

const DEFAULT_WATCHDOG_CONFIG = {
  enabled: false,
  activeRescueEnabled: false,
  dryRun: true,
  intervalMs: 500,
  heartbeatMaxBodyBytes: 64 * 1024,
  heartbeatStaleMs: 3000,
  combatHeartbeatStaleMs: 2500,
  damagedCombatStaleMs: 2000,
  hpThreshold: 60,
  targetRecentMs: 8000,
  rescueSuppressMs: 15000,
  auditEnabled: true,
  auditFile: 'watchdog.jsonl',
  directLeave: {
    enabled: false,
    verified: false,
    requireAuthEvidence: true,
    timeoutMs: 3000,
    retryMax: 2,
    retryBackoffMs: 1200,
    descriptorTtlMs: 30000,
    successConfirmsExit: false,
    allowedOrigins: [GAME_ORIGIN],
    requiredHeaders: [],
    requiredCookieNames: []
  },
  clash: {
    enabled: false,
    controllerUrl: 'http://127.0.0.1:9097',
    secret: '',
    group: 'GRASP-RAT-GAME',
    autoProxy: 'S2-自动',
    manualProxy: 'S2-手动',
    directProxy: 'DIRECT',
    rescueStage: 'auto',
    timeoutMs: 3000,
    closeConnections: true
  }
};

function nowMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function boolValue(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return /^(?:1|true|yes|on)$/i.test(value);
  return Boolean(value);
}

function shallowObject(value) {
  return isObject(value) ? value : {};
}

function clonePlain(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return null;
  }
}

function mergeConfig(base, update) {
  const next = clonePlain(base) || clonePlain(DEFAULT_WATCHDOG_CONFIG);
  const patch = shallowObject(update);
  const assignBool = key => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = boolValue(patch[key], next[key]);
  };
  const assignMs = (key, min, max) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = positiveInt(patch[key], next[key], min, max);
  };
  assignBool('enabled');
  assignBool('activeRescueEnabled');
  assignBool('dryRun');
  assignBool('auditEnabled');
  assignMs('intervalMs', 100, 60000);
  assignMs('heartbeatMaxBodyBytes', 1024, 1024 * 1024);
  assignMs('heartbeatStaleMs', 250, 60000);
  assignMs('combatHeartbeatStaleMs', 250, 60000);
  assignMs('damagedCombatStaleMs', 250, 60000);
  assignMs('targetRecentMs', 0, 60000);
  assignMs('rescueSuppressMs', 1000, 300000);
  if (Object.prototype.hasOwnProperty.call(patch, 'hpThreshold')) {
    next.hpThreshold = positiveInt(patch.hpThreshold, next.hpThreshold, 1, 100000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'auditFile')) {
    next.auditFile = sanitizeFilePart(patch.auditFile || next.auditFile, 'watchdog.jsonl');
  }
  if (isObject(patch.directLeave)) {
    const src = patch.directLeave;
    if (Object.prototype.hasOwnProperty.call(src, 'enabled')) next.directLeave.enabled = boolValue(src.enabled, next.directLeave.enabled);
    if (Object.prototype.hasOwnProperty.call(src, 'verified')) next.directLeave.verified = boolValue(src.verified, next.directLeave.verified);
    if (Object.prototype.hasOwnProperty.call(src, 'requireAuthEvidence')) next.directLeave.requireAuthEvidence = boolValue(src.requireAuthEvidence, next.directLeave.requireAuthEvidence);
    if (Object.prototype.hasOwnProperty.call(src, 'successConfirmsExit')) next.directLeave.successConfirmsExit = boolValue(src.successConfirmsExit, next.directLeave.successConfirmsExit);
    if (Object.prototype.hasOwnProperty.call(src, 'timeoutMs')) next.directLeave.timeoutMs = positiveInt(src.timeoutMs, next.directLeave.timeoutMs, 250, 60000);
    if (Object.prototype.hasOwnProperty.call(src, 'retryMax')) next.directLeave.retryMax = positiveInt(src.retryMax, next.directLeave.retryMax, 0, 10);
    if (Object.prototype.hasOwnProperty.call(src, 'retryBackoffMs')) next.directLeave.retryBackoffMs = positiveInt(src.retryBackoffMs, next.directLeave.retryBackoffMs, 250, 60000);
    if (Object.prototype.hasOwnProperty.call(src, 'descriptorTtlMs')) next.directLeave.descriptorTtlMs = positiveInt(src.descriptorTtlMs, next.directLeave.descriptorTtlMs, 1000, 300000);
    if (Array.isArray(src.allowedOrigins)) {
      next.directLeave.allowedOrigins = src.allowedOrigins.map(item => stringValue(item).replace(/\/+$/, '')).filter(Boolean).slice(0, 12);
    }
    if (Array.isArray(src.requiredHeaders)) next.directLeave.requiredHeaders = uniqueStrings(src.requiredHeaders, 12);
    if (Array.isArray(src.requiredCookieNames)) next.directLeave.requiredCookieNames = uniqueStrings(src.requiredCookieNames, 12);
  }
  if (isObject(patch.clash)) {
    const src = patch.clash;
    if (Object.prototype.hasOwnProperty.call(src, 'enabled')) next.clash.enabled = boolValue(src.enabled, next.clash.enabled);
    if (Object.prototype.hasOwnProperty.call(src, 'controllerUrl')) next.clash.controllerUrl = normalizeLocalHttpBase(src.controllerUrl || next.clash.controllerUrl);
    if (Object.prototype.hasOwnProperty.call(src, 'secret')) next.clash.secret = stringValue(src.secret);
    if (Object.prototype.hasOwnProperty.call(src, 'group')) next.clash.group = stringValue(src.group || next.clash.group);
    if (Object.prototype.hasOwnProperty.call(src, 'autoProxy')) next.clash.autoProxy = stringValue(src.autoProxy || next.clash.autoProxy);
    if (Object.prototype.hasOwnProperty.call(src, 'manualProxy')) next.clash.manualProxy = stringValue(src.manualProxy || next.clash.manualProxy);
    if (Object.prototype.hasOwnProperty.call(src, 'directProxy')) next.clash.directProxy = stringValue(src.directProxy || next.clash.directProxy);
    if (Object.prototype.hasOwnProperty.call(src, 'rescueStage')) next.clash.rescueStage = normalizeClashStage(src.rescueStage || next.clash.rescueStage);
    if (Object.prototype.hasOwnProperty.call(src, 'timeoutMs')) next.clash.timeoutMs = positiveInt(src.timeoutMs, next.clash.timeoutMs, 250, 60000);
    if (Object.prototype.hasOwnProperty.call(src, 'closeConnections')) next.clash.closeConnections = boolValue(src.closeConnections, next.clash.closeConnections);
  }
  return next;
}

function sanitizeFilePart(value, fallback = 'watchdog.jsonl') {
  const text = stringValue(value || fallback)
    .replace(/[\\/]+/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return text || fallback;
}

function normalizeLocalHttpBase(value) {
  const text = stringValue(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(text)) {
    throw new Error('Clash controller URL must be localhost');
  }
  return text;
}

function normalizeClashStage(value) {
  const stage = stringValue(value || 'auto').toLowerCase();
  if (!['auto', 'manual', 'direct'].includes(stage)) throw new Error(`unknown Clash rescue stage: ${value}`);
  return stage;
}

function redact(value, seen = new WeakSet(), key = '') {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY_RE.test(key) && !NON_SECRET_CONFIG_KEY_RE.test(key)) return value ? '[redacted]' : '';
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redact(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out = {};
    for (const [itemKey, itemValue] of Object.entries(value)) {
      out[itemKey] = redact(itemValue, seen, itemKey);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return value.slice(0, 300) + '...';
  return value;
}

function datePart(value = Date.now()) {
  const d = new Date(Number(value) || Date.now());
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

function normalizeEntity(value) {
  if (!isObject(value)) return null;
  const out = {};
  const id = value.id ?? value.user_id ?? value.userId ?? value.targetId;
  if (id !== undefined && id !== null && id !== '') out.id = id;
  if (value.name || value.label) out.name = stringValue(value.name || value.label);
  const hp = finiteNumber(value.hp ?? value.knownHp ?? value.health ?? value.currentHp, null);
  if (hp !== null) out.hp = hp;
  const maxHp = finiteNumber(value.maxHp ?? value.max_hp ?? value.hpMax ?? value.maxHealth, null);
  if (maxHp !== null) out.maxHp = maxHp;
  const distance = finiteNumber(value.distance ?? value.d, null);
  if (distance !== null) out.distance = Math.round(distance);
  if (value.life) out.life = stringValue(value.life);
  if (Object.prototype.hasOwnProperty.call(value, 'drop')) out.drop = finiteNumber(value.drop, value.drop);
  return Object.keys(out).length ? out : null;
}

function normalizeSmallObject(value, allowedKeys = []) {
  if (!isObject(value)) return null;
  const out = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = clonePlain(value[key]);
  }
  return Object.keys(out).length ? out : null;
}

function heartbeatKey(pageId, userId) {
  return `${pageId || 'page'}:${userId === null || userId === undefined || userId === '' ? 'unknown' : String(userId)}`;
}

function headerValue(headers, name) {
  if (!isObject(headers)) return '';
  const wanted = stringValue(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return stringValue(value);
  }
  return '';
}

function cookieHeaderHas(cookieHeader, cookieName) {
  const wanted = stringValue(cookieName || '').trim();
  if (!wanted) return false;
  return stringValue(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .some(part => part.startsWith(`${wanted}=`));
}

function summarizeLeaveAuth(authState, config, now) {
  if (!authState) {
    return {
      available: false,
      descriptorReady: false,
      directLeaveReady: false,
      missing: ['leaveAuth']
    };
  }
  const fresh = !authState.expiresAt || Number(authState.expiresAt) > now;
  const descriptorAgeMs = authState.receivedAt ? Math.max(0, Math.round(now - Number(authState.receivedAt))) : null;
  const ttlOk = descriptorAgeMs === null || descriptorAgeMs <= Math.max(1000, Number(config.directLeave.descriptorTtlMs || 30000));
  const descriptorReady = Boolean(authState.available && authState.complete && fresh && ttlOk);
  const directLeaveReady = Boolean(config.directLeave.enabled && config.directLeave.verified && descriptorReady);
  const missing = [];
  if (!authState.available) missing.push('available');
  if (!authState.complete) missing.push(...authState.missing);
  if (!fresh) missing.push('expired');
  if (!ttlOk) missing.push('stale');
  if (!config.directLeave.enabled) missing.push('direct-leave-disabled');
  if (!config.directLeave.verified) missing.push('direct-leave-unverified');
  return {
    available: Boolean(authState.available),
    descriptorReady,
    directLeaveReady,
    descriptorAgeMs,
    expiresAt: Number(authState.expiresAt || 0) || 0,
    userId: authState.userId ?? null,
    origin: authState.origin || '',
    method: authState.method || '',
    url: authState.redactedUrl || '',
    missing: Array.from(new Set(missing)).slice(0, 12)
  };
}

function normalizeLeaveAuth(raw, payload, config, receivedAt) {
  if (!isObject(raw)) return null;
  const descriptor = shallowObject(raw.descriptor || raw.request || raw);
  const userId = raw.userId ?? descriptor.userId ?? payload.userId ?? null;
  const origin = stringValue(raw.origin || descriptor.origin || GAME_ORIGIN).replace(/\/+$/, '');
  const url = stringValue(descriptor.url || descriptor.endpoint || descriptor.path || '');
  const method = stringValue(descriptor.method || 'POST').toUpperCase();
  const headers = isObject(descriptor.headers) ? clonePlain(descriptor.headers) : {};
  const bodyJson = Object.prototype.hasOwnProperty.call(descriptor, 'bodyJson') ? clonePlain(descriptor.bodyJson) : undefined;
  const body = Object.prototype.hasOwnProperty.call(descriptor, 'body') ? descriptor.body : undefined;
  const sessionToken = stringValue(raw.sessionToken || raw.token || descriptor.sessionToken || descriptor.token || '');
  const expiresAt = finiteNumber(raw.expiresAt ?? descriptor.expiresAt, 0) || 0;
  const available = boolValue(raw.available, Boolean(url || sessionToken || raw.sessionTokenPresent || raw.hasToken));
  const authEvidence = leaveAuthHasAuthEvidence({ url, headers, bodyJson, body, sessionToken, descriptor });
  const authRequired = !config?.directLeave || config.directLeave.requireAuthEvidence !== false;
  const missing = [];
  if (!available) missing.push('available');
  if (!url) missing.push('url');
  if (!method) missing.push('method');
  if (!sessionToken && !Object.keys(headers).some(key => SECRET_KEY_RE.test(key)) && !stringValue(headers.Authorization || headers.authorization || '').includes('${sessionToken}')) {
    if (raw.sessionTokenPresent && !sessionToken) missing.push('session-token-not-sent');
  }
  if (authRequired && !authEvidence) missing.push('auth-missing');
  for (const header of uniqueStrings(config?.directLeave?.requiredHeaders || [], 12)) {
    if (!headerValue(headers, header)) missing.push(`header:${header}`);
  }
  const cookieHeader = headerValue(headers, 'cookie');
  for (const cookieName of uniqueStrings(config?.directLeave?.requiredCookieNames || [], 12)) {
    if (!cookieHeaderHas(cookieHeader, cookieName)) missing.push(`cookie:${cookieName}`);
  }
  const complete = Boolean(available && url && method && (!authRequired || authEvidence) && missing.length === 0);
  return {
    available,
    complete,
    missing: Array.from(new Set(missing)),
    receivedAt,
    userId,
    origin,
    url,
    redactedUrl: redactUrl(url),
    method,
    headers,
    bodyJson,
    body,
    sessionToken,
    authEvidence,
    expiresAt,
    rawSummary: redact({
      available: raw.available,
      userId,
      origin,
      url,
      method,
      headers,
      expiresAt,
      sessionTokenPresent: Boolean(sessionToken || raw.sessionTokenPresent)
    })
  };
}

function leaveAuthHasAuthEvidence(auth = {}) {
  if (auth.sessionToken) return true;
  const headers = isObject(auth.headers) ? auth.headers : {};
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_KEY_RE.test(key)) return true;
    if (/\$\{sessionToken\}|bearer\s+\S+|token|session|cookie|authorization/i.test(stringValue(value))) return true;
  }
  const bodyText = (() => {
    try {
      return JSON.stringify({ bodyJson: auth.bodyJson, body: auth.body, descriptor: auth.descriptor });
    } catch (_) {
      return '';
    }
  })();
  if (/\$\{sessionToken\}|token|session|authorization|cookie/i.test(bodyText)) return true;
  try {
    const u = new URL(stringValue(auth.url || ''), GAME_ORIGIN);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SECRET_KEY_RE.test(key)) return true;
    }
  } catch (_) {}
  return false;
}

function redactUrl(value) {
  try {
    const u = new URL(stringValue(value), GAME_ORIGIN);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SECRET_KEY_RE.test(key)) u.searchParams.set(key, '[redacted]');
    }
    return u.toString();
  } catch (_) {
    return stringValue(value).replace(/([?&][^=]*(?:token|secret|session|auth)[^=]*=)[^&]+/ig, '$1[redacted]');
  }
}

function renderTemplate(value, vars) {
  if (typeof value === 'string') {
    return value
      .replace(/\$\{userId\}/g, stringValue(vars.userId ?? ''))
      .replace(/\$\{sessionToken\}/g, stringValue(vars.sessionToken ?? ''))
      .replace(/\$\{origin\}/g, stringValue(vars.origin ?? GAME_ORIGIN));
  }
  if (Array.isArray(value)) return value.map(item => renderTemplate(item, vars));
  if (isObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = renderTemplate(item, vars);
    return out;
  }
  return value;
}

function buildDirectLeaveRequest(authState, config) {
  if (!authState || !authState.complete) throw new Error('direct leave descriptor is incomplete');
  const vars = {
    userId: authState.userId,
    sessionToken: authState.sessionToken,
    origin: authState.origin || GAME_ORIGIN
  };
  const urlText = renderTemplate(authState.url, vars);
  const url = new URL(urlText, authState.origin || GAME_ORIGIN);
  const allowed = Array.isArray(config.directLeave.allowedOrigins) && config.directLeave.allowedOrigins.length
    ? config.directLeave.allowedOrigins
    : [GAME_ORIGIN];
  if (!allowed.map(item => stringValue(item).replace(/\/+$/, '')).includes(url.origin)) {
    throw new Error(`direct leave origin is not allowed: ${url.origin}`);
  }
  const method = stringValue(authState.method || 'POST').toUpperCase();
  const headers = renderTemplate(authState.headers || {}, vars);
  let body = undefined;
  if (authState.bodyJson !== undefined) {
    body = JSON.stringify(renderTemplate(authState.bodyJson, vars));
    if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  } else if (authState.body !== undefined) {
    body = typeof authState.body === 'string'
      ? renderTemplate(authState.body, vars)
      : JSON.stringify(renderTemplate(authState.body, vars));
  }
  return { url: url.toString(), method, headers, body };
}

function responseSummary(text, max = 180) {
  const raw = stringValue(text || '');
  return {
    bodyLength: raw.length,
    bodySample: raw
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .slice(0, max)
  };
}

function uniqueStrings(values, limit = 24) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = stringValue(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 3000) {
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('fetch is unavailable'));
  const AbortControllerImpl = typeof AbortController !== 'undefined' ? AbortController : null;
  if (!AbortControllerImpl) return fetchImpl(url, options);
  const controller = new AbortControllerImpl();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 3000));
  return Promise.resolve()
    .then(() => fetchImpl(url, { ...options, signal: controller.signal }))
    .finally(() => clearTimeout(timer));
}

async function responseText(res) {
  if (!res) return '';
  if (typeof res.text === 'function') return res.text();
  if (typeof res.body === 'string') return res.body;
  return '';
}

function entryUserId(entry) {
  if (!isObject(entry)) return null;
  const userId = entry.userId
    ?? entry.currentUserId
    ?? entry.self?.id
    ?? entry.exit?.userId
    ?? entry.exit?.self?.id
    ?? entry.session?.userId
    ?? entry.control?.currentUserId
    ?? null;
  return userId === null || userId === undefined || userId === '' ? null : userId;
}

function entryConfirmationSignal(entry, fallbackAt = Date.now()) {
  if (!isObject(entry)) return null;
  const type = stringValue(entry.type || '').toLowerCase();
  const auditKind = stringValue(entry.auditKind || '').toLowerCase();
  const importantType = stringValue(entry.importantType || '').toLowerCase();
  const exitReason = stringValue(entry.exitReason || entry.reason || entry.exit?.reason || entry.exit?.summary || entry.displayReason || entry.exitSummary || '');
  const combined = `${type} ${auditKind} ${importantType} ${exitReason}`.toLowerCase();
  const at = Number(entry.at || entry.exitAt || entry.exit?.at || entry.exit?.exitAt || entry.session?.exitAt || entry.receivedAt || fallbackAt) || fallbackAt;
  const explicitExitAudit = type === 'exit-audit'
    && (auditKind === 'exit-confirmed' || /exit-confirmed|leave-success|leave-http-403|external-left-user-exit-confirmed|snapshot-no-self-exit-confirmed|login-required-no-self-exit-confirmed/.test(combined));
  const sessionEnded = importantType === 'session-end'
    && (Number(entry.exitAt || entry.session?.exitAt || 0) > 0 || /exit-confirmed|leave-success|left-user|no-self-exit-confirmed/.test(combined));
  if (!explicitExitAudit && !sessionEnded) return null;
  return {
    at,
    userId: entryUserId(entry),
    source: type || (importantType ? 'important-log' : 'combat-log'),
    auditKind,
    importantType,
    exitReason,
    exitAuditId: entry.exitAuditId || entry.exit?.exitAuditId || '',
    exitAuditLogId: entry.exitAuditLogId || '',
    importantLogId: entry.importantLogId || '',
    combatId: entry.combatId || ''
  };
}

class WatchdogService {
  constructor(options = {}) {
    this.dir = path.resolve(options.dir || path.join(__dirname, 'logs'));
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.fetch = typeof options.fetch === 'function' ? options.fetch : global.fetch;
    this.setInterval = typeof options.setInterval === 'function' ? options.setInterval : setInterval;
    this.clearInterval = typeof options.clearInterval === 'function' ? options.clearInterval : clearInterval;
    this.setTimeout = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
    this.clearTimeout = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
    this.config = mergeConfig(DEFAULT_WATCHDOG_CONFIG, options.config || options);
    this.states = new Map();
    this.timer = null;
    this.auditQueue = Promise.resolve();
    this.lastDecision = null;
    this.lastConfigWarning = '';
    this.clashValidation = {
      ok: false,
      enabled: Boolean(this.config.clash.enabled),
      checkedAt: 0,
      error: this.config.clash.enabled ? 'not validated' : 'disabled'
    };
    if (options.autoStart !== false) this.start();
  }

  start() {
    this.stop();
    const intervalMs = Math.max(100, Number(this.config.intervalMs || 500) || 500);
    this.timer = this.setInterval(() => {
      this.checkNow().catch(() => {});
    }, intervalMs);
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    if (this.config.clash.enabled) {
      this.validateClash('startup').catch(err => {
        this.clashValidation = { ok: false, enabled: true, checkedAt: this.now(), error: err?.message || String(err) };
      });
    }
    return this.timer;
  }

  stop() {
    if (this.timer) this.clearInterval(this.timer);
    this.timer = null;
  }

  bodyLimit(pathname) {
    if (pathname === '/watchdog/heartbeat') return Math.max(1024, Number(this.config.heartbeatMaxBodyBytes || 65536) || 65536);
    return 256 * 1024;
  }

  async updateConfig(update = {}) {
    const beforeEnabled = Boolean(this.config.enabled);
    const beforeClash = JSON.stringify(redact(this.config.clash));
    this.config = mergeConfig(this.config, update);
    this.lastConfigWarning = '';
    if (this.config.activeRescueEnabled && (!this.config.directLeave.enabled || !this.config.directLeave.verified)) {
      this.lastConfigWarning = 'active rescue is enabled but direct leave is disabled or unverified';
    }
    this.start();
    if (beforeEnabled && !this.config.enabled) {
      await this.appendAudit({
        type: 'watchdog-disabled',
        reason: 'config-update'
      });
    }
    if (this.config.clash.enabled && beforeClash !== JSON.stringify(redact(this.config.clash))) {
      await this.validateClash('config-update').catch(err => {
        this.clashValidation = { ok: false, enabled: true, checkedAt: this.now(), error: err?.message || String(err) };
      });
    }
    return this.status();
  }

  normalizeHeartbeat(payload, reqInfo = {}) {
    if (!isObject(payload)) throw new Error('heartbeat payload must be an object');
    const type = stringValue(payload.type || 'watchdog-heartbeat');
    if (type !== 'watchdog-heartbeat') throw new Error(`unexpected heartbeat type: ${type}`);
    const pageId = stringValue(payload.pageId || payload.page || '').trim();
    if (!pageId) throw new Error('heartbeat pageId is required');
    const userIdRaw = payload.userId ?? payload.self?.id ?? payload.self?.user_id ?? null;
    const userId = userIdRaw === null || userIdRaw === undefined || userIdRaw === '' ? null : userIdRaw;
    const receivedAt = this.now();
    const pageAt = finiteNumber(payload.at, 0) || 0;
    const sequence = finiteNumber(payload.sequence, null);
    const self = normalizeEntity(payload.self);
    const target = normalizeEntity(payload.target);
    const decision = normalizeSmallObject(payload.decision, ['kind', 'reason', 'pendingExit', 'displayReason', 'exitSummary']);
    const control = normalizeSmallObject(payload.control, ['wsOpen', 'nativeWsOpen', 'rawWsOpen', 'hasToken', 'connecting', 'currentUserId']);
    const runtime = normalizeSmallObject(payload.runtime, ['lastCombatTickAt', 'lastTickCompletedAt', 'lastTickAt', 'tickGapMs', 'diagnosis']);
    const combatActive = boolValue(payload.combatActive, false);
    const damagedInCombat = boolValue(payload.damagedInCombat, false);
    const visibilityState = stringValue(payload.visibilityState || '');
    const pageLifecycle = stringValue(payload.pageLifecycle || payload.lifecycle || '');
    const leaveAuth = normalizeLeaveAuth(payload.leaveAuth, { userId }, this.config, receivedAt);
    return {
      key: heartbeatKey(pageId, userId),
      pageId,
      userId,
      type,
      at: pageAt,
      receivedAt,
      sequence,
      visibilityState,
      pageLifecycle,
      combatActive,
      damagedInCombat,
      self,
      target,
      decision,
      control,
      runtime,
      leaveAuth,
      collector: {
        remoteAddress: reqInfo.remoteAddress || '',
        userAgent: reqInfo.userAgent || ''
      }
    };
  }

  handleHeartbeat(payload, reqInfo = {}) {
    const hb = this.normalizeHeartbeat(payload, reqInfo);
    const previous = this.states.get(hb.key) || null;
    const sequenceGap = previous && hb.sequence !== null && previous.sequence !== null && hb.sequence > previous.sequence + 1
      ? Math.round(hb.sequence - previous.sequence - 1)
      : 0;
    const record = {
      ...(previous || {}),
      key: hb.key,
      pageId: hb.pageId,
      userId: hb.userId,
      lastHeartbeatReceivedAt: hb.receivedAt,
      lastPageAt: hb.at,
      sequence: hb.sequence,
      sequenceGapCount: Math.max(0, Number(previous?.sequenceGapCount || 0) + sequenceGap),
      lastSequenceGap: sequenceGap || 0,
      combatActive: hb.combatActive,
      damagedInCombat: hb.damagedInCombat,
      visibilityState: hb.visibilityState,
      pageLifecycle: hb.pageLifecycle,
      self: hb.self,
      target: hb.target,
      decision: hb.decision,
      control: hb.control,
      runtime: hb.runtime,
      leaveAuth: hb.leaveAuth || previous?.leaveAuth || null,
      collector: hb.collector,
      lastCombatActiveAt: hb.combatActive ? hb.receivedAt : Number(previous?.lastCombatActiveAt || 0),
      lastDamagedCombatAt: hb.damagedInCombat ? hb.receivedAt : Number(previous?.lastDamagedCombatAt || 0),
      lastTargetAt: hb.target ? hb.receivedAt : Number(previous?.lastTargetAt || 0),
      rescue: previous?.rescue || null,
      lastWouldRescueKey: previous?.lastWouldRescueKey || '',
      lastWouldRescueAt: Number(previous?.lastWouldRescueAt || 0),
      lastWatchdogState: previous?.lastWatchdogState || ''
    };
    if (record.rescue && !hb.combatActive) {
      record.rescue.confirmed = true;
      record.rescue.confirmedAt = hb.receivedAt;
      record.rescue.confirmation = 'heartbeat-combat-inactive';
      record.rescue.active = false;
    }
    this.states.set(hb.key, record);
    return {
      ok: true,
      key: hb.key,
      enabled: Boolean(this.config.enabled),
      activeRescueEnabled: Boolean(this.config.activeRescueEnabled),
      heartbeatAgeMs: 0,
      sequenceGap
    };
  }

  async handleCombatLogEntries(entries, context = {}) {
    const list = Array.isArray(entries) ? entries : [entries];
    let confirmed = 0;
    for (const entry of list) {
      const signal = entryConfirmationSignal(entry, Number(context?.receivedAt || this.now()) || this.now());
      if (!signal) continue;
      const matches = this.matchRecordsForConfirmation(signal);
      for (const record of matches) {
        if (await this.confirmRecordFromSignal(record, signal)) confirmed += 1;
      }
    }
    return { ok: true, checked: list.length, confirmed };
  }

  matchRecordsForConfirmation(signal) {
    const states = Array.from(this.states.values());
    if (!states.length) return [];
    const signalUserId = signal?.userId;
    if (signalUserId !== null && signalUserId !== undefined && signalUserId !== '') {
      return states.filter(record => record.userId !== null && record.userId !== undefined && String(record.userId) === String(signalUserId));
    }
    const active = states.filter(record => record.rescue?.active);
    return active.length === 1 ? active : [];
  }

  async confirmRecordFromSignal(record, signal) {
    if (!record?.rescue) return false;
    const rescue = record.rescue;
    const signalAt = Number(signal?.at || this.now()) || this.now();
    const rescueStartedAt = Number(rescue.startedAt || 0);
    if (rescueStartedAt && signalAt < rescueStartedAt - 5000) return false;
    if (rescue.confirmed && rescue.confirmation) return false;
    rescue.confirmed = true;
    rescue.confirmedAt = signalAt;
    rescue.confirmation = `combat-log:${signal.auditKind || signal.importantType || signal.source || 'exit-confirmed'}`;
    rescue.confirmationSignal = redact(signal);
    rescue.active = false;
    record.combatActive = false;
    await this.appendAudit({
      type: 'watchdog-exit-confirmed',
      at: signalAt,
      key: record.key,
      rescueId: rescue.id || '',
      confirmation: rescue.confirmation,
      signal
    });
    return true;
  }

  summarizeRecord(record, now = this.now()) {
    const heartbeatAgeMs = record.lastHeartbeatReceivedAt ? Math.max(0, Math.round(now - Number(record.lastHeartbeatReceivedAt))) : null;
    const leaveAuth = summarizeLeaveAuth(record.leaveAuth, this.config, now);
    const rescue = record.rescue ? redact(record.rescue) : null;
    return {
      key: record.key,
      pageId: record.pageId,
      userId: record.userId,
      lastHeartbeatReceivedAt: Number(record.lastHeartbeatReceivedAt || 0),
      heartbeatAgeMs,
      lastPageAt: Number(record.lastPageAt || 0),
      pageClockSkewMs: record.lastPageAt ? Math.round(Number(record.lastHeartbeatReceivedAt || now) - Number(record.lastPageAt)) : null,
      sequence: record.sequence,
      sequenceGapCount: Number(record.sequenceGapCount || 0),
      lastSequenceGap: Number(record.lastSequenceGap || 0),
      combatActive: Boolean(record.combatActive),
      damagedInCombat: Boolean(record.damagedInCombat),
      lastCombatActiveAgeMs: record.lastCombatActiveAt ? Math.max(0, Math.round(now - Number(record.lastCombatActiveAt))) : null,
      lastDamagedCombatAgeMs: record.lastDamagedCombatAt ? Math.max(0, Math.round(now - Number(record.lastDamagedCombatAt))) : null,
      visibilityState: record.visibilityState || '',
      pageLifecycle: record.pageLifecycle || '',
      self: record.self || null,
      target: record.target || null,
      targetAgeMs: record.lastTargetAt ? Math.max(0, Math.round(now - Number(record.lastTargetAt))) : null,
      decision: record.decision || null,
      control: record.control || null,
      runtime: record.runtime || null,
      leaveAuth,
      rescue
    };
  }

  directLeaveMissingReasons(states) {
    return uniqueStrings(states.flatMap(item => item.leaveAuth?.missing || []), 12);
  }

  activeRescueReadiness(states) {
    const readyStates = states.filter(item => item.leaveAuth?.directLeaveReady).length;
    const descriptorReadyStates = states.filter(item => item.leaveAuth?.descriptorReady).length;
    const directLeaveMissing = this.directLeaveMissingReasons(states);
    const reasons = [];
    if (!this.config.enabled) reasons.push('watchdog-disabled');
    if (!this.config.activeRescueEnabled) reasons.push('active-rescue-disabled');
    if (this.config.dryRun) reasons.push('dry-run');
    if (!this.config.directLeave.enabled) reasons.push('direct-leave-disabled');
    if (!this.config.directLeave.verified) reasons.push('direct-leave-unverified');
    if (!states.length) reasons.push('no-heartbeat-state');
    if (!readyStates) reasons.push('no-direct-leave-ready-state');
    const armed = Boolean(
      this.config.enabled
      && this.config.activeRescueEnabled
      && !this.config.dryRun
      && this.config.directLeave.enabled
      && this.config.directLeave.verified
      && readyStates > 0
    );
    return {
      armed,
      readyStates,
      descriptorReadyStates,
      reasons: armed ? [] : uniqueStrings(reasons, 12),
      directLeaveMissing
    };
  }

  statusWarnings(states, readiness) {
    const warnings = [];
    if (this.lastConfigWarning) warnings.push(this.lastConfigWarning);
    if (this.config.activeRescueEnabled) {
      if (!this.config.enabled) warnings.push('active rescue is enabled but watchdog is disabled');
      if (this.config.dryRun) warnings.push('active rescue is enabled but dry-run is still on');
      if (!this.config.directLeave.enabled) warnings.push('active rescue is enabled but direct leave is disabled');
      if (!this.config.directLeave.verified) warnings.push('active rescue is enabled but direct leave is unverified');
      if (this.config.directLeave.enabled && this.config.directLeave.verified) {
        if (!states.length) {
          warnings.push('active rescue has no heartbeat state');
        } else if (!readiness.readyStates) {
          const suffix = readiness.directLeaveMissing.length
            ? `: ${readiness.directLeaveMissing.join(', ')}`
            : '';
          warnings.push(`active rescue has no direct-leave-ready state${suffix}`);
        }
      }
    }
    if (this.config.clash.enabled && !this.clashValidation.ok) {
      warnings.push(`Clash rescue is configured but not ready: ${this.clashValidation.error || 'not validated'}`);
    }
    return uniqueStrings(warnings, 12);
  }

  status() {
    const now = this.now();
    const states = Array.from(this.states.values()).map(record => this.summarizeRecord(record, now));
    const activeRescue = this.activeRescueReadiness(states);
    const warnings = this.statusWarnings(states, activeRescue);
    return {
      ok: true,
      enabled: Boolean(this.config.enabled),
      activeRescueEnabled: Boolean(this.config.activeRescueEnabled),
      dryRun: Boolean(this.config.dryRun),
      config: redact(this.config),
      stateCount: states.length,
      states,
      lastDecision: redact(this.lastDecision),
      directLeave: {
        enabled: Boolean(this.config.directLeave.enabled),
        verified: Boolean(this.config.directLeave.verified),
        readyStates: activeRescue.readyStates,
        descriptorReadyStates: activeRescue.descriptorReadyStates,
        missing: activeRescue.directLeaveMissing
      },
      activeRescue,
      clash: redact({
        enabled: Boolean(this.config.clash.enabled),
        controllerUrl: this.config.clash.controllerUrl,
        group: this.config.clash.group,
        rescueStage: this.config.clash.rescueStage,
        validation: this.clashValidation
      }),
      warnings,
      warning: warnings.join('; ')
    };
  }

  highRiskState(record, now = this.now()) {
    const heartbeatAgeMs = record.lastHeartbeatReceivedAt ? Math.max(0, Math.round(now - Number(record.lastHeartbeatReceivedAt))) : Number.POSITIVE_INFINITY;
    const combatActive = Boolean(record.combatActive);
    const selfHp = finiteNumber(record.self?.hp, null);
    const hpRisk = selfHp !== null && selfHp <= Number(this.config.hpThreshold || 60);
    const damagedRisk = Boolean(record.damagedInCombat);
    const targetAgeMs = record.lastTargetAt ? Math.max(0, Math.round(now - Number(record.lastTargetAt))) : Number.POSITIVE_INFINITY;
    const targetRecent = Boolean(record.target && targetAgeMs <= Math.max(0, Number(this.config.targetRecentMs || 0)));
    const hiddenOrFrozen = /hidden|freeze|frozen|pagehide/i.test(`${record.visibilityState || ''} ${record.pageLifecycle || ''}`);
    const thresholdMs = damagedRisk || hpRisk
      ? Math.max(250, Number(this.config.damagedCombatStaleMs || 2000))
      : combatActive
        ? Math.max(250, Number(this.config.combatHeartbeatStaleMs || 2500))
        : Math.max(250, Number(this.config.heartbeatStaleMs || 3000));
    const stale = heartbeatAgeMs >= thresholdMs;
    const risky = Boolean(combatActive && stale && (damagedRisk || hpRisk) && (targetRecent || record.target));
    return {
      risky,
      stale,
      reason: risky ? 'damaged-combat-heartbeat-stale' : '',
      heartbeatAgeMs,
      thresholdMs,
      combatActive,
      damagedRisk,
      hpRisk,
      selfHp,
      targetRecent,
      targetAgeMs: Number.isFinite(targetAgeMs) ? targetAgeMs : null,
      hiddenOrFrozen
    };
  }

  watchdogStateKey(risk) {
    if (risk.risky) return 'risky';
    if (risk.combatActive && risk.stale) return 'stale-not-high-risk';
    if (risk.combatActive) return 'combat-fresh';
    return 'idle';
  }

  async appendWatchdogStateChange(record, risk, now) {
    const state = this.watchdogStateKey(risk);
    if (record.lastWatchdogState === state) return false;
    const previous = record.lastWatchdogState || '';
    record.lastWatchdogState = state;
    await this.appendAudit({
      type: 'watchdog-state-change',
      at: now,
      key: record.key,
      previous,
      state,
      risk
    });
    return true;
  }

  async checkNow() {
    if (!this.config.enabled) return { checked: 0, rescues: 0 };
    const now = this.now();
    let checked = 0;
    let rescues = 0;
    for (const record of this.states.values()) {
      checked += 1;
      const risk = this.highRiskState(record, now);
      await this.appendWatchdogStateChange(record, risk, now);
      if (!risk.risky) continue;
      const rescueKey = `${record.key}:${record.sequence ?? ''}:${record.lastHeartbeatReceivedAt}:${risk.thresholdMs}`;
      if (record.lastWouldRescueKey === rescueKey) continue;
      record.lastWouldRescueKey = rescueKey;
      record.lastWouldRescueAt = now;
      if (!this.config.activeRescueEnabled || this.config.dryRun) {
        rescues += 1;
        this.lastDecision = {
          type: 'watchdog-would-rescue',
          at: now,
          mode: 'dry-run',
          key: record.key,
          risk
        };
        await this.appendAudit(this.lastDecision);
        continue;
      }
      rescues += 1;
      await this.startRescue(record, risk);
    }
    return { checked, rescues };
  }

  delay(ms) {
    return new Promise(resolve => {
      const timer = this.setTimeout(resolve, Math.max(0, Number(ms) || 0));
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
  }

  async skipClashRescue(rescue, reason, detail = {}) {
    const result = {
      ok: false,
      skipped: true,
      at: this.now(),
      reason,
      ...redact(detail)
    };
    rescue.clash = result;
    await this.appendAudit({
      type: 'watchdog-clash-rescue-result',
      at: result.at,
      rescueId: rescue.id,
      result
    });
    return result;
  }

  async finalizeRescue(record, rescue, results = null) {
    rescue.completedAt = rescue.completedAt || this.now();
    rescue.active = false;
    if (results) rescue.results = redact(results);
    await this.appendAudit({
      type: 'watchdog-rescue-result',
      at: rescue.completedAt,
      rescueId: rescue.id,
      key: record.key,
      rescue
    });
    return rescue;
  }

  async startRescue(record, risk) {
    const now = this.now();
    if (record.rescue?.active) return record.rescue;
    const rescue = {
      id: `watchdog-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      key: record.key,
      active: true,
      startedAt: now,
      reason: risk.reason,
      risk,
      directLeave: null,
      clash: null,
      confirmed: false,
      completedAt: 0,
      error: ''
    };
    record.rescue = rescue;
    this.lastDecision = {
      type: 'watchdog-rescue-start',
      at: now,
      rescueId: rescue.id,
      key: record.key,
      risk
    };
    await this.appendAudit(this.lastDecision);

    const leaveSummary = summarizeLeaveAuth(record.leaveAuth, this.config, now);
    if (!leaveSummary.directLeaveReady) {
      rescue.directLeave = {
        ok: false,
        skipped: true,
        reason: 'direct-leave-not-ready',
        missing: leaveSummary.missing
      };
      await this.appendAudit({
        type: 'watchdog-direct-leave-not-ready',
        at: this.now(),
        rescueId: rescue.id,
        key: record.key,
        missing: leaveSummary.missing
      });
      const clashResult = this.config.clash.enabled && this.clashValidation.ok
        ? await this.runClashRescue(rescue)
        : this.config.clash.enabled
          ? await this.skipClashRescue(rescue, 'clash-validation-failed', { validation: this.clashValidation })
          : null;
      await this.finalizeRescue(record, rescue, clashResult ? [{ status: 'fulfilled', value: clashResult }] : []);
      return rescue;
    }
    const leavePromise = this.runDirectLeaveAttempt(record, rescue, 'initial');
    const clashPromise = this.config.clash.enabled && this.clashValidation.ok
      ? this.runClashRescue(rescue)
      : this.config.clash.enabled
        ? this.skipClashRescue(rescue, 'clash-validation-failed', { validation: this.clashValidation })
        : Promise.resolve(null);
    Promise.allSettled([leavePromise, clashPromise]).then(results => {
      this.finalizeRescue(record, rescue, results).catch(() => {});
    });
    return rescue;
  }

  async runDirectLeaveAttempt(record, rescue, stage = 'initial') {
    if (rescue.confirmed) {
      const result = {
        ok: false,
        skipped: true,
        at: this.now(),
        reason: 'exit-already-confirmed',
        confirmation: rescue.confirmation || ''
      };
      rescue.directLeave = result;
      await this.appendAudit({
        type: 'watchdog-direct-leave-result',
        at: result.at,
        rescueId: rescue.id,
        key: record.key,
        stage,
        result
      });
      return result;
    }
    const readiness = summarizeLeaveAuth(record.leaveAuth, this.config, this.now());
    if (!readiness.directLeaveReady) {
      const result = {
        ok: false,
        skipped: true,
        at: this.now(),
        reason: 'direct-leave-not-ready',
        missing: readiness.missing
      };
      rescue.directLeave = result;
      await this.appendAudit({
        type: 'watchdog-direct-leave-result',
        at: result.at,
        rescueId: rescue.id,
        key: record.key,
        stage,
        result
      });
      return result;
    }
    const at = this.now();
    const request = buildDirectLeaveRequest(record.leaveAuth, this.config);
    const auditRequest = {
      type: 'watchdog-direct-leave-request',
      at,
      rescueId: rescue.id,
      key: record.key,
      stage,
      request: redact({
        url: redactUrl(request.url),
        method: request.method,
        headers: request.headers,
        bodyPresent: request.body !== undefined
      })
    };
    const requestAudit = this.appendAudit(auditRequest);
    const result = await this.sendDirectLeaveRequest(request, this.config.directLeave.timeoutMs);
    await requestAudit;
    rescue.directLeave = result;
    if (!Array.isArray(rescue.directLeaveAttempts)) rescue.directLeaveAttempts = [];
    rescue.directLeaveAttempts.push({ stage, result });
    if (result.ok && this.config.directLeave.successConfirmsExit) {
      rescue.confirmed = true;
      rescue.confirmedAt = this.now();
      rescue.confirmation = 'direct-leave-success-response';
      rescue.active = false;
    }
    await this.appendAudit({
      type: 'watchdog-direct-leave-result',
      at: this.now(),
      rescueId: rescue.id,
      key: record.key,
      stage,
      result
    });
    if (!result.ok && stage !== 'manual' && !rescue.confirmed) {
      const retryMax = Math.max(0, Number(this.config.directLeave.retryMax || 0));
      const retryCount = Number(rescue.directLeaveRetryCount || 0);
      if (retryCount < retryMax && summarizeLeaveAuth(record.leaveAuth, this.config, this.now()).directLeaveReady) {
        rescue.directLeaveRetryCount = retryCount + 1;
        const retryStage = `retry-${rescue.directLeaveRetryCount}`;
        const backoffMs = Math.max(250, Number(this.config.directLeave.retryBackoffMs || 1200));
        await this.delay(backoffMs);
        return this.runDirectLeaveAttempt(record, rescue, retryStage);
      }
    }
    return result;
  }

  async sendDirectLeaveRequest(request, timeoutMs) {
    const startedAt = this.now();
    try {
      const res = await fetchWithTimeout(this.fetch, request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        cache: 'no-store',
        redirect: 'follow'
      }, timeoutMs);
      const text = await responseText(res);
      const status = Number(res?.status || 0) || 0;
      return {
        ok: status >= 200 && status < 300,
        at: startedAt,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
        status,
        statusText: stringValue(res?.statusText || ''),
        response: responseSummary(text)
      };
    } catch (err) {
      return {
        ok: false,
        at: startedAt,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
        error: err?.name === 'AbortError' ? 'direct leave timed out' : (err?.message || String(err))
      };
    }
  }

  clashTargetForStage(stage = this.config.clash.rescueStage) {
    const normalized = normalizeClashStage(stage);
    if (normalized === 'auto') return this.config.clash.autoProxy;
    if (normalized === 'manual') return this.config.clash.manualProxy;
    return this.config.clash.directProxy;
  }

  async clashFetch(pathname, options = {}) {
    const base = normalizeLocalHttpBase(this.config.clash.controllerUrl);
    const headers = {
      ...(this.config.clash.secret ? { Authorization: `Bearer ${this.config.clash.secret}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetchWithTimeout(this.fetch, `${base}${pathname}`, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      cache: 'no-store'
    }, this.config.clash.timeoutMs);
    const text = await responseText(res);
    const status = Number(res?.status || 0) || 0;
    if (status < 200 || status >= 300) {
      throw new Error(`${options.method || 'GET'} ${pathname} failed: ${status}`);
    }
    return { status, text, json: safeJsonParse(text) };
  }

  async validateClash(reason = 'manual') {
    const checkedAt = this.now();
    if (!this.config.clash.enabled) {
      this.clashValidation = { ok: false, enabled: false, checkedAt, error: 'disabled', reason };
      return this.clashValidation;
    }
    if (!this.config.clash.secret) {
      this.clashValidation = { ok: false, enabled: true, checkedAt, error: 'secret missing', reason };
      return this.clashValidation;
    }
    if (!this.config.clash.group) {
      this.clashValidation = { ok: false, enabled: true, checkedAt, error: 'proxy group missing', reason };
      return this.clashValidation;
    }
    const groupPath = `/proxies/${encodeURIComponent(this.config.clash.group)}`;
    try {
      const result = await this.clashFetch(groupPath);
      const group = result.json || {};
      const all = Array.isArray(group.all) ? group.all.map(String) : [];
      const targets = ['autoProxy', 'manualProxy', 'directProxy']
        .map(key => this.config.clash[key])
        .filter(Boolean);
      const missing = all.length ? targets.filter(name => !all.includes(String(name))) : [];
      if (missing.length) throw new Error(`Clash proxy targets missing: ${missing.join(', ')}`);
      this.clashValidation = {
        ok: true,
        enabled: true,
        checkedAt,
        reason,
        controllerUrl: this.config.clash.controllerUrl,
        group: this.config.clash.group,
        now: group.now || '',
        targets
      };
    } catch (err) {
      this.clashValidation = {
        ok: false,
        enabled: true,
        checkedAt,
        reason,
        error: err?.message || String(err)
      };
    }
    await this.appendAudit({
      type: 'watchdog-clash-validation',
      at: checkedAt,
      reason,
      validation: this.clashValidation
    });
    return this.clashValidation;
  }

  async runClashRescue(rescue, stage = this.config.clash.rescueStage) {
    const startedAt = this.now();
    const normalized = normalizeClashStage(stage);
    const target = this.clashTargetForStage(normalized);
    const group = this.config.clash.group;
    const detail = {
      type: 'watchdog-clash-rescue-request',
      at: startedAt,
      rescueId: rescue.id,
      stage: normalized,
      target,
      group
    };
    await this.appendAudit(detail);
    try {
      const switchResult = await this.clashFetch(`/proxies/${encodeURIComponent(group)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: target })
      });
      let closeConnections = null;
      if (this.config.clash.closeConnections) {
        try {
          closeConnections = await this.clashFetch('/connections', { method: 'DELETE' });
        } catch (err) {
          closeConnections = { ok: false, error: err?.message || String(err) };
        }
      }
      const result = {
        ok: true,
        at: startedAt,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
        stage: normalized,
        target,
        group,
        switched: { status: switchResult.status },
        closeConnections: closeConnections ? redact({ status: closeConnections.status, error: closeConnections.error || '' }) : null
      };
      rescue.clash = result;
      await this.appendAudit({
        type: 'watchdog-clash-rescue-result',
        at: this.now(),
        rescueId: rescue.id,
        result
      });
      return result;
    } catch (err) {
      const result = {
        ok: false,
        at: startedAt,
        durationMs: Math.max(0, Math.round(this.now() - startedAt)),
        stage: normalized,
        target,
        group,
        error: err?.message || String(err)
      };
      rescue.clash = result;
      await this.appendAudit({
        type: 'watchdog-clash-rescue-result',
        at: this.now(),
        rescueId: rescue.id,
        result
      });
      return result;
    }
  }

  latestLeaveRecord(key = '') {
    if (key && this.states.has(key)) return this.states.get(key);
    return Array.from(this.states.values())
      .filter(record => record.leaveAuth)
      .sort((a, b) => Number(b.lastHeartbeatReceivedAt || 0) - Number(a.lastHeartbeatReceivedAt || 0))[0] || null;
  }

  async testLeave(payload = {}) {
    if (!payload || payload.confirm !== true) throw new Error('manual leave test requires confirm: true');
    const now = this.now();
    let record = this.latestLeaveRecord(payload.key || '');
    let authState = record?.leaveAuth || null;
    if (payload.leaveAuth || payload.descriptor) {
      authState = normalizeLeaveAuth(payload.leaveAuth || { descriptor: payload.descriptor, available: true }, { userId: payload.userId ?? record?.userId ?? null }, this.config, now);
      record = {
        key: payload.key || 'manual',
        userId: payload.userId ?? authState?.userId ?? null,
        leaveAuth: authState
      };
    }
    const summary = summarizeLeaveAuth(authState, this.config, now);
    if (!summary.descriptorReady) throw new Error(`direct leave descriptor is not ready: ${summary.missing.join(', ')}`);
    const request = buildDirectLeaveRequest(authState, this.config);
    const result = await this.sendDirectLeaveRequest(request, this.config.directLeave.timeoutMs);
    await this.appendAudit({
      type: 'watchdog-manual-direct-leave-test',
      at: now,
      key: record?.key || 'manual',
      request: redact({
        url: redactUrl(request.url),
        method: request.method,
        headers: request.headers,
        bodyPresent: request.body !== undefined
      }),
      result
    });
    return {
      ok: Boolean(result.ok),
      key: record?.key || 'manual',
      request: redact({
        url: redactUrl(request.url),
        method: request.method,
        headers: request.headers,
        bodyPresent: request.body !== undefined
      }),
      result
    };
  }

  auditPath(at = this.now()) {
    return path.join(this.dir, datePart(at), 'audit', sanitizeFilePart(this.config.auditFile || 'watchdog.jsonl'));
  }

  appendAudit(event) {
    if (!this.config.auditEnabled) return Promise.resolve(false);
    const at = Number(event?.at || this.now()) || this.now();
    const record = {
      ...redact(event || {}),
      at,
      service: 'grasp-rat-watchdog'
    };
    const filePath = this.auditPath(at);
    this.auditQueue = this.auditQueue
      .then(async () => {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.appendFile(filePath, JSON.stringify(record) + '\n');
        return true;
      })
      .catch(() => false);
    return this.auditQueue;
  }

  async flushAudit() {
    await this.auditQueue;
  }
}

function createWatchdogService(options = {}) {
  return new WatchdogService(options);
}

async function runWatchdogSelfTest(options = {}) {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-watchdog-'));
  let currentNow = Date.UTC(2026, 6, 7, 8, 0, 0, 0);
  const calls = [];
  const fakeFetch = async (url, req = {}) => {
    calls.push({ url: String(url), req });
    const text = String(url).includes('/proxies/')
      ? JSON.stringify({ now: 'S2-自动', all: ['S2-自动', 'S2-手动', 'DIRECT'] })
      : JSON.stringify({ ok: true });
    return {
      status: 200,
      statusText: 'OK',
      text: async () => text
    };
  };
  const countMatches = (text, pattern) => (text.match(pattern) || []).length;
  const makeLeaveAuth = (config, userId, receivedAt, expiresAt, token = 'secret-token') => normalizeLeaveAuth({
    available: true,
    userId,
    origin: GAME_ORIGIN,
    sessionToken: token,
    expiresAt,
    descriptor: {
      url: `${GAME_ORIGIN}/api/leave`,
      method: 'POST',
      headers: { authorization: 'Bearer ${sessionToken}' },
      bodyJson: { userId: '${userId}' }
    }
  }, { userId }, config, receivedAt);
  const watchdog = createWatchdogService({
    dir: root,
    autoStart: false,
    now: () => currentNow,
    fetch: fakeFetch,
    config: { auditEnabled: true }
  });
  try {
    let status = watchdog.status();
    if (status.enabled !== false || status.activeRescueEnabled !== false || status.stateCount !== 0) {
      throw new Error('default watchdog status is not disabled and empty');
    }
    if (status.activeRescue?.armed !== false || !status.activeRescue?.reasons?.includes('watchdog-disabled')) {
      throw new Error('default watchdog status does not explain unarmed active rescue');
    }
    await watchdog.updateConfig({
      enabled: true,
      heartbeatStaleMs: 2000,
      combatHeartbeatStaleMs: 2000,
      damagedCombatStaleMs: 2000,
      directLeave: {
        enabled: true,
        verified: true,
        allowedOrigins: [GAME_ORIGIN]
      },
      clash: {
        enabled: true,
        secret: 'abc\\def',
        group: 'GRASP-RAT-GAME'
      }
    });
    const validation = await watchdog.validateClash('self-test');
    if (!validation.ok) throw new Error(`Clash validation failed in self-test: ${validation.error}`);
    const authHeader = calls.find(call => String(call.url).includes('/proxies/'))?.req?.headers?.Authorization;
    if (authHeader !== 'Bearer abc\\def') throw new Error('Clash secret was not preserved exactly');
    const heartbeat = {
      type: 'watchdog-heartbeat',
      pageId: 'page-a',
      userId: 28886,
      at: currentNow - 10,
      sequence: 1,
      visibilityState: 'hidden',
      combatActive: true,
      damagedInCombat: true,
      self: { id: 28886, hp: 58, maxHp: 100, life: 'Alive' },
      target: { id: 27355, name: 'RIS_YI', hp: 100, distance: 12665 },
      decision: { reason: 'combat-hp-disadvantage-leave', pendingExit: false },
      control: { wsOpen: true, nativeWsOpen: true, hasToken: true },
      runtime: { lastCombatTickAt: currentNow - 20, lastTickCompletedAt: currentNow - 30 },
      leaveAuth: {
        available: true,
        userId: 28886,
        origin: GAME_ORIGIN,
        sessionToken: 'secret-token',
        expiresAt: currentNow + 30000,
        descriptor: {
          url: `${GAME_ORIGIN}/api/leave`,
          method: 'POST',
          headers: { authorization: 'Bearer ${sessionToken}' },
          bodyJson: { userId: '${userId}' }
        }
      }
    };
    const hbResult = watchdog.handleHeartbeat(heartbeat, { remoteAddress: '127.0.0.1' });
    if (!hbResult.ok) throw new Error('heartbeat ingest failed');
    status = watchdog.status();
    const state = status.states[0];
    if (!state || state.leaveAuth.directLeaveReady !== true) throw new Error('direct leave readiness missing after heartbeat');
    if (status.directLeave.readyStates !== 1 || status.directLeave.descriptorReadyStates !== 1) {
      throw new Error('direct leave readiness counters missing after heartbeat');
    }
    watchdog.handleHeartbeat({
      ...heartbeat,
      pageId: 'page-no-combat',
      userId: 10001,
      sequence: 1,
      combatActive: false,
      damagedInCombat: false,
      self: { id: 10001, hp: 100, maxHp: 100, life: 'Alive' },
      target: null,
      leaveAuth: null
    });
    watchdog.handleHeartbeat({
      ...heartbeat,
      pageId: 'page-combat-undamaged',
      userId: 10002,
      sequence: 1,
      combatActive: true,
      damagedInCombat: false,
      self: { id: 10002, hp: 100, maxHp: 100, life: 'Alive' },
      target: { id: 20002, name: 'safe-target', hp: 100, distance: 12000 },
      leaveAuth: null
    });
    currentNow += 2500;
    const noCombatRisk = watchdog.highRiskState(watchdog.states.get('page-no-combat:10001'), currentNow);
    if (noCombatRisk.risky) throw new Error('no-combat heartbeat was classified as high risk');
    const undamagedRisk = watchdog.highRiskState(watchdog.states.get('page-combat-undamaged:10002'), currentNow);
    if (undamagedRisk.risky) throw new Error('undamaged high-HP combat heartbeat was classified as high risk');
    await watchdog.checkNow();
    await watchdog.flushAudit();
    const auditFile = watchdog.auditPath(currentNow);
    let auditText = fs.readFileSync(auditFile, 'utf8');
    if (!auditText.includes('watchdog-would-rescue')) throw new Error('dry-run rescue audit was not written');
    if (!auditText.includes('watchdog-state-change')) throw new Error('watchdog state-change audit was not written');
    if (/secret-token/.test(auditText)) throw new Error('secret token leaked into watchdog audit');
    const wouldRescueCount = countMatches(auditText, /watchdog-would-rescue/g);
    currentNow += 100;
    await watchdog.checkNow();
    await watchdog.flushAudit();
    auditText = fs.readFileSync(auditFile, 'utf8');
    if (countMatches(auditText, /watchdog-would-rescue/g) !== wouldRescueCount) throw new Error('duplicate dry-run rescue audit was not suppressed');
    watchdog.handleHeartbeat({ ...heartbeat, sequence: 2, at: currentNow - 5 });
    await watchdog.checkNow();
    await watchdog.flushAudit();
    auditText = fs.readFileSync(auditFile, 'utf8');
    if (!/"state":"combat-fresh"/.test(auditText)) throw new Error('fresh heartbeat recovery state-change audit was not written');
    currentNow += 2500;
    await watchdog.checkNow();
    await watchdog.flushAudit();
    auditText = fs.readFileSync(auditFile, 'utf8');
    if (countMatches(auditText, /watchdog-would-rescue/g) <= wouldRescueCount) throw new Error('fresh heartbeat did not open a new dry-run stale window');
    await watchdog.updateConfig({ activeRescueEnabled: true, dryRun: false });
    currentNow += 20000;
    watchdog.handleHeartbeat({ ...heartbeat, sequence: 3, at: currentNow - 5 });
    currentNow += 2500;
    const activeLeaveCountBefore = calls.filter(call => String(call.url).includes('/api/leave')).length;
    await watchdog.checkNow();
    await new Promise(resolve => setTimeout(resolve, 20));
    await watchdog.flushAudit();
    const activeLeaveCountAfter = calls.filter(call => String(call.url).includes('/api/leave')).length;
    if (activeLeaveCountAfter !== activeLeaveCountBefore + 1) throw new Error('active rescue did not call direct leave exactly once');
    const leaveIndex = calls.findIndex(call => String(call.url).includes('/api/leave'));
    const switchIndex = calls.findIndex((call, index) => index > leaveIndex && String(call.url).includes('/proxies/'));
    if (leaveIndex < 0 || switchIndex < 0) throw new Error('active rescue did not run direct leave before Clash switch');
    currentNow += 20000;
    await watchdog.checkNow();
    await new Promise(resolve => setTimeout(resolve, 20));
    await watchdog.flushAudit();
    const activeLeaveCountAfterDuplicateCheck = calls.filter(call => String(call.url).includes('/api/leave')).length;
    if (activeLeaveCountAfterDuplicateCheck !== activeLeaveCountAfter) {
      throw new Error('active rescue repeated direct leave for the same stale heartbeat window');
    }
    watchdog.handleHeartbeat({
      ...heartbeat,
      sequence: 4,
      at: currentNow - 5,
      leaveAuth: {
        ...heartbeat.leaveAuth,
        expiresAt: currentNow + 30000
      }
    });
    let malformed = false;
    try {
      watchdog.handleHeartbeat({ type: 'watchdog-heartbeat' });
    } catch (_) {
      malformed = true;
    }
    if (!malformed) throw new Error('malformed heartbeat was not rejected');
    const manual = await watchdog.testLeave({ confirm: true, key: 'page-a:28886' });
    if (!manual.ok) throw new Error('manual direct leave test failed');
    const noAuth = normalizeLeaveAuth({
      available: true,
      userId: 28886,
      origin: GAME_ORIGIN,
      descriptor: {
        url: `${GAME_ORIGIN}/api/leave`,
        method: 'POST',
        bodyJson: { userId: '${userId}' }
      }
    }, { userId: 28886 }, watchdog.config, currentNow);
    const noAuthSummary = summarizeLeaveAuth(noAuth, watchdog.config, currentNow);
    if (noAuthSummary.directLeaveReady || !noAuthSummary.missing.includes('auth-missing')) {
      throw new Error('direct leave descriptor without auth evidence was treated as ready');
    }
    const cookieRequiredConfig = mergeConfig(watchdog.config, {
      directLeave: {
        requiredCookieNames: ['cf_clearance']
      }
    });
    const missingCookieAuth = normalizeLeaveAuth({
      available: true,
      userId: 28886,
      origin: GAME_ORIGIN,
      sessionToken: 'secret-token',
      expiresAt: currentNow + 30000,
      descriptor: {
        url: `${GAME_ORIGIN}/leave?user_id=\${userId}&token=\${sessionToken}`,
        method: 'GET'
      }
    }, { userId: 28886 }, cookieRequiredConfig, currentNow);
    const missingCookieSummary = summarizeLeaveAuth(missingCookieAuth, cookieRequiredConfig, currentNow);
    if (missingCookieSummary.directLeaveReady || !missingCookieSummary.missing.includes('cookie:cf_clearance')) {
      throw new Error('direct leave descriptor without required Cloudflare cookie was treated as ready');
    }
    const cookieAuth = normalizeLeaveAuth({
      available: true,
      userId: 28886,
      origin: GAME_ORIGIN,
      sessionToken: 'secret-token',
      expiresAt: currentNow + 30000,
      descriptor: {
        url: `${GAME_ORIGIN}/leave?user_id=\${userId}&token=\${sessionToken}`,
        method: 'GET',
        headers: {
          Cookie: 'cf_clearance=test-clearance',
          'User-Agent': 'self-test'
        }
      }
    }, { userId: 28886 }, cookieRequiredConfig, currentNow);
    const cookieSummary = summarizeLeaveAuth(cookieAuth, cookieRequiredConfig, currentNow);
    if (!cookieSummary.directLeaveReady || cookieSummary.missing.length) {
      throw new Error('direct leave descriptor with required Cloudflare cookie was not ready');
    }

    const warningWatchdog = createWatchdogService({
      dir: root,
      autoStart: false,
      now: () => currentNow,
      config: {
        enabled: true,
        activeRescueEnabled: true,
        dryRun: false,
        auditEnabled: false,
        directLeave: { enabled: true, verified: true }
      }
    });
    let warningStatus = warningWatchdog.status();
    if (warningStatus.activeRescue.armed || !warningStatus.activeRescue.reasons.includes('no-heartbeat-state')) {
      throw new Error('active rescue status did not report missing heartbeat state');
    }
    if (!warningStatus.warnings.includes('active rescue has no heartbeat state')) {
      throw new Error('active rescue status did not warn about missing heartbeat state');
    }
    warningWatchdog.handleHeartbeat({
      ...heartbeat,
      pageId: 'warning-page',
      userId: 28886,
      leaveAuth: {
        available: true,
        userId: 28886,
        origin: GAME_ORIGIN,
        descriptor: {
          url: `${GAME_ORIGIN}/api/leave`,
          method: 'POST',
          bodyJson: { userId: '${userId}' }
        }
      }
    });
    warningStatus = warningWatchdog.status();
    if (warningStatus.activeRescue.armed || !warningStatus.directLeave.missing.includes('auth-missing')) {
      throw new Error('active rescue status did not expose auth-missing readiness reason');
    }
    if (!warningStatus.warning.includes('auth-missing')) {
      throw new Error('active rescue warning did not include direct-leave missing reasons');
    }

    let successNow = currentNow;
    const successCalls = [];
    const successWatchdog = createWatchdogService({
      dir: root,
      autoStart: false,
      now: () => successNow,
      fetch: async (url, req = {}) => {
        successCalls.push({ url: String(url), req });
        return { status: 200, statusText: 'OK', text: async () => '{"left":true}' };
      },
      config: {
        auditEnabled: false,
        directLeave: { enabled: true, verified: true, successConfirmsExit: true, retryMax: 2 }
      }
    });
    const successRecord = {
      key: 'success:1',
      userId: 1,
      leaveAuth: makeLeaveAuth(successWatchdog.config, 1, successNow, successNow + 30000, 'success-token')
    };
    const successRescue = { id: 'success-rescue', key: successRecord.key, active: true, confirmed: false };
    await successWatchdog.runDirectLeaveAttempt(successRecord, successRescue, 'initial');
    if (!successRescue.confirmed || successCalls.length !== 1) throw new Error('direct leave success response did not confirm exit once');

    let retryNow = currentNow;
    const retryCalls = [];
    const retryWatchdog = createWatchdogService({
      dir: root,
      autoStart: false,
      now: () => retryNow,
      setTimeout: fn => {
        fn();
        return 1;
      },
      fetch: async (url, req = {}) => {
        retryCalls.push({ url: String(url), req });
        if (retryCalls.length === 1) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return { status: 200, statusText: 'OK', text: async () => '{"ok":true}' };
      },
      config: {
        auditEnabled: false,
        directLeave: { enabled: true, verified: true, retryMax: 1, retryBackoffMs: 250 }
      }
    });
    const retryRecord = {
      key: 'retry:1',
      userId: 1,
      leaveAuth: makeLeaveAuth(retryWatchdog.config, 1, retryNow, retryNow + 30000, 'retry-token')
    };
    const retryRescue = { id: 'retry-rescue', key: retryRecord.key, active: true, confirmed: false };
    await retryWatchdog.runDirectLeaveAttempt(retryRecord, retryRescue, 'initial');
    if (retryCalls.length !== 2 || retryRescue.directLeave?.ok !== true) throw new Error('direct leave timeout retry did not run exactly once');

    let expiryNow = currentNow;
    const expiryCalls = [];
    const expiryWatchdog = createWatchdogService({
      dir: root,
      autoStart: false,
      now: () => expiryNow,
      setTimeout: fn => {
        expiryNow += 5000;
        fn();
        return 1;
      },
      fetch: async (url, req = {}) => {
        expiryCalls.push({ url: String(url), req });
        return { status: 504, statusText: 'Gateway Timeout', text: async () => 'timeout' };
      },
      config: {
        auditEnabled: false,
        directLeave: { enabled: true, verified: true, retryMax: 1, retryBackoffMs: 250 }
      }
    });
    const expiryRecord = {
      key: 'expiry:1',
      userId: 1,
      leaveAuth: makeLeaveAuth(expiryWatchdog.config, 1, expiryNow, expiryNow + 1000, 'expiry-token')
    };
    const expiryRescue = { id: 'expiry-rescue', key: expiryRecord.key, active: true, confirmed: false };
    await expiryWatchdog.runDirectLeaveAttempt(expiryRecord, expiryRescue, 'initial');
    if (expiryCalls.length !== 1 || expiryRescue.directLeave?.reason !== 'direct-leave-not-ready') {
      throw new Error('direct leave retry did not stop after credential expiry');
    }

    let confirmNow = currentNow;
    const confirmCalls = [];
    let confirmRescue = null;
    const confirmWatchdog = createWatchdogService({
      dir: root,
      autoStart: false,
      now: () => confirmNow,
      setTimeout: fn => {
        confirmWatchdog.handleCombatLogEntries([{
          type: 'exit-audit',
          auditKind: 'exit-confirmed',
          at: confirmNow,
          userId: 1,
          exitAuditId: 'confirm-exit',
          exitAuditLogId: 'confirm-exit:exit-confirmed'
        }]).then(() => fn());
        return 1;
      },
      fetch: async (url, req = {}) => {
        confirmCalls.push({ url: String(url), req });
        return { status: 503, statusText: 'Service Unavailable', text: async () => 'retry later' };
      },
      config: {
        auditEnabled: false,
        directLeave: { enabled: true, verified: true, retryMax: 1, retryBackoffMs: 250 }
      }
    });
    const confirmRecord = {
      key: 'confirm:1',
      userId: 1,
      leaveAuth: makeLeaveAuth(confirmWatchdog.config, 1, confirmNow, confirmNow + 30000, 'confirm-token')
    };
    confirmRescue = { id: 'confirm-rescue', key: confirmRecord.key, active: true, confirmed: false };
    confirmRecord.rescue = confirmRescue;
    confirmWatchdog.states.set(confirmRecord.key, confirmRecord);
    await confirmWatchdog.runDirectLeaveAttempt(confirmRecord, confirmRescue, 'initial');
    if (confirmCalls.length !== 1 || confirmRescue.directLeave?.reason !== 'exit-already-confirmed' || confirmRescue.confirmation !== 'combat-log:exit-confirmed') {
      throw new Error('direct leave retry did not stop after combat-log exit confirmation');
    }

    console.log(JSON.stringify({ ok: true, cases: 25 }, null, 2));
  } finally {
    watchdog.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = {
  DEFAULT_WATCHDOG_CONFIG,
  createWatchdogService,
  runWatchdogSelfTest,
  mergeConfig,
  redact,
  buildDirectLeaveRequest,
  normalizeLeaveAuth,
  leaveAuthHasAuthEvidence,
  entryConfirmationSignal
};
