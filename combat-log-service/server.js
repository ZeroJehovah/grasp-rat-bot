#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { cleanupDetailedLogs } = require('./cleanup-logs');
const { DEFAULT_WATCHDOG_CONFIG, createWatchdogService, runWatchdogSelfTest, mergeConfig } = require('./watchdog');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 18765,
  dir: path.join(__dirname, 'logs'),
  maxBodyBytes: 8 * 1024 * 1024,
  splitFiles: true,
  cleanupEnabled: true,
  cleanupRetentionDays: 3,
  cleanupAt: '03:30',
  watchdog: DEFAULT_WATCHDOG_CONFIG,
  watchdogConfigFile: '',
  selfTest: false
};

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function loadJsonFile(filePath, label = 'JSON file') {
  const resolved = path.resolve(String(filePath || ''));
  if (!filePath) throw new Error(`${label} path is required`);
  let text = '';
  try {
    text = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${label} ${resolved}: ${err?.message || String(err)}`);
  }
  try {
    const data = JSON.parse(text);
    if (!isObject(data)) throw new Error('top-level value must be an object');
    return { path: resolved, data };
  } catch (err) {
    throw new Error(`invalid ${label} ${resolved}: ${err?.message || String(err)}`);
  }
}

function loadWatchdogConfigFile(filePath, baseConfig = DEFAULT_WATCHDOG_CONFIG) {
  const loaded = loadJsonFile(filePath, 'watchdog config');
  const patch = isObject(loaded.data.watchdog) ? loaded.data.watchdog : loaded.data;
  return {
    path: loaded.path,
    config: mergeConfig(baseConfig, patch)
  };
}

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--host') out.host = String(args[++i] || out.host);
    else if (arg === '--port') out.port = Math.max(1, Number(args[++i] || out.port) || out.port);
    else if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--max-body-bytes') out.maxBodyBytes = Math.max(1024, Number(args[++i] || out.maxBodyBytes) || out.maxBodyBytes);
    else if (arg === '--flat-files') out.splitFiles = false;
    else if (arg === '--no-cleanup') out.cleanupEnabled = false;
    else if (arg === '--cleanup-retention-days') out.cleanupRetentionDays = Math.max(1, Math.floor(Number(args[++i] || out.cleanupRetentionDays) || out.cleanupRetentionDays));
    else if (arg === '--cleanup-at') out.cleanupAt = String(args[++i] || out.cleanupAt).trim() || out.cleanupAt;
    else if (arg === '--watchdog-config') {
      const loaded = loadWatchdogConfigFile(args[++i] || '', out.watchdog);
      out.watchdog = loaded.config;
      out.watchdogConfigFile = loaded.path;
    }
    else if (arg === '--watchdog-enabled') out.watchdog = { ...out.watchdog, enabled: true };
    else if (arg === '--watchdog-active-rescue') out.watchdog = { ...out.watchdog, activeRescueEnabled: true, dryRun: false };
    else if (arg === '--watchdog-dry-run') out.watchdog = { ...out.watchdog, dryRun: true };
    else if (arg === '--watchdog-interval-ms') out.watchdog = { ...out.watchdog, intervalMs: Math.max(100, Number(args[++i] || out.watchdog.intervalMs) || out.watchdog.intervalMs) };
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node server.js [options]

Options:
  --host <host>             Listen host. Default: ${DEFAULTS.host}
  --port <port>             Listen port. Default: ${DEFAULTS.port}
  --dir <dir>               Log output directory. Default: ./logs
  --max-body-bytes <bytes>  Maximum POST body. Default: ${DEFAULTS.maxBodyBytes}
  --flat-files              Keep legacy logs/YYYY-MM-DD/<combatId>.jsonl layout
  --no-cleanup              Disable startup/daily detailed-log cleanup.
  --cleanup-retention-days <days>
                            Keep detailed combat/misc logs for this many local date directories. Default: ${DEFAULTS.cleanupRetentionDays}
  --cleanup-at <HH:MM>      Local time for daily cleanup. Default: ${DEFAULTS.cleanupAt}
  --watchdog-config <file>  Load watchdog runtime config from a local JSON file. Later flags override it.
  --watchdog-enabled        Start external watchdog enabled. Rescue still stays inactive by default.
  --watchdog-active-rescue  Allow active watchdog rescue at startup. Requires configured/verified direct leave.
  --watchdog-dry-run        Force watchdog dry-run mode.
  --watchdog-interval-ms <ms>
                            Watchdog stale-heartbeat scan interval. Default: ${DEFAULTS.watchdog.intervalMs}
  --self-test               Run collector regression checks
`);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2) + '\n';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-private-network': 'true'
  });
  res.end(text);
}

function sanitizePart(value, fallback = 'unknown') {
  const text = String(value || fallback)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return text || fallback;
}

function datePart(value = Date.now()) {
  const d = new Date(Number(value) || Date.now());
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function entryTime(entry, fallback = Date.now()) {
  return Number(entry?.at || entry?.receivedAt || fallback) || fallback;
}

function logKind(payload, entry) {
  const type = String(entry?.type || payload?.type || '').toLowerCase();
  if (entry?.criticalLog || entry?.exitAuditLogId || /audit|critical/.test(type)) return 'audit';
  if (entry?.importantLog || type === 'important-log') return 'important';
  if (/^combat(?:-|$)/.test(type)) return 'combat';
  return 'misc';
}

function combatFilePath(rootDir, payload, entry) {
  const combatId = sanitizePart(entry?.combatId || payload.combatId || 'combat');
  const day = datePart(payload.startedAt || entryTime(entry));
  if (!payload.__splitFiles) return path.join(rootDir, day, `${combatId}.jsonl`);
  return path.join(rootDir, day, logKind(payload, entry), `${combatId}.jsonl`);
}

function normalizeEntries(payload) {
  if (Array.isArray(payload.entries)) return payload.entries;
  if (payload.entry && typeof payload.entry === 'object') return [payload.entry];
  return [payload];
}

function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error(`request body exceeds ${maxBodyBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function requestPathname(req) {
  try {
    return new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch (_) {
    return req.url || '/';
  }
}

function isLocalRequest(req) {
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1'
    || addr === '::1'
    || addr === '::ffff:127.0.0.1'
    || addr === ''
    || addr === 'test';
}

async function appendCombatLog(options, payload, req) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
  const entries = normalizeEntries(payload);
  if (!entries.length) return { entries: 0, files: [] };
  const files = new Map();
  const receivedAt = Date.now();
  for (const raw of entries) {
    const entry = raw && typeof raw === 'object' ? raw : { value: raw };
    const filePath = combatFilePath(options.dir, { ...payload, __splitFiles: options.splitFiles }, entry);
    const record = {
      ...entry,
      combatId: entry.combatId || payload.combatId || '',
      version: entry.version || payload.version || '',
      sourceHash: entry.sourceHash || payload.sourceHash || '',
      receivedAt,
      collector: {
        remoteAddress: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }
    };
    const line = JSON.stringify(record) + '\n';
    files.set(filePath, (files.get(filePath) || '') + line);
  }
  for (const [filePath, text] of files) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.appendFile(filePath, text);
  }
  return { entries: entries.length, files: Array.from(files.keys()).map(file => path.relative(options.dir, file)) };
}

function createServer(options) {
  const watchdog = options.watchdogService || createWatchdogService({
    dir: options.dir,
    config: options.watchdog || DEFAULT_WATCHDOG_CONFIG,
    fetch: options.fetch
  });
  const server = http.createServer(async (req, res) => {
    const pathname = requestPathname(req);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-private-network', 'true');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'grasp-rat-combat-log-service', dir: options.dir, watchdog: watchdog.status() });
      return;
    }
    if (pathname.startsWith('/watchdog/')) {
      try {
        if (req.method === 'GET' && pathname === '/watchdog/status') {
          sendJson(res, 200, watchdog.status());
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        if (pathname !== '/watchdog/heartbeat' && !isLocalRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'watchdog configuration endpoints are local-only' });
          return;
        }
        const body = await readBody(req, watchdog.bodyLimit(pathname));
        const payload = body ? JSON.parse(body) : {};
        if (pathname === '/watchdog/config') {
          const status = await watchdog.updateConfig(payload);
          sendJson(res, 200, status);
          return;
        }
        if (pathname === '/watchdog/heartbeat') {
          const result = watchdog.handleHeartbeat(payload, {
            remoteAddress: req.socket.remoteAddress || '',
            userAgent: req.headers['user-agent'] || ''
          });
          sendJson(res, 200, result);
          return;
        }
        if (pathname === '/watchdog/test-clash') {
          const result = await watchdog.validateClash('manual-endpoint');
          sendJson(res, result.ok ? 200 : 400, { ok: Boolean(result.ok), validation: result });
          return;
        }
        if (pathname === '/watchdog/test-leave') {
          const result = await watchdog.testLeave(payload);
          sendJson(res, result.ok ? 200 : 400, result);
          return;
        }
        sendJson(res, 404, { ok: false, error: 'not found' });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err?.message || String(err) });
      }
      return;
    }
    if (req.method !== 'POST' || pathname !== '/combat-log') {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return;
    }
    try {
      const body = await readBody(req, options.maxBodyBytes);
      const payload = body ? JSON.parse(body) : null;
      const result = await appendCombatLog(options, payload, req);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err?.message || String(err) });
    }
  });
  server.watchdog = watchdog;
  server.on('close', () => watchdog.stop());
  return server;
}

function summarizeWatchdogStartup(status, configFile = '') {
  return {
    enabled: Boolean(status?.enabled),
    activeRescueEnabled: Boolean(status?.activeRescueEnabled),
    dryRun: Boolean(status?.dryRun),
    configFile: configFile || '',
    stateCount: Number(status?.stateCount || 0),
    warning: status?.warning || '',
    directLeave: {
      enabled: Boolean(status?.directLeave?.enabled),
      verified: Boolean(status?.directLeave?.verified),
      readyStates: Number(status?.directLeave?.readyStates || 0)
    },
    clash: {
      enabled: Boolean(status?.clash?.enabled),
      validationOk: Boolean(status?.clash?.validation?.ok),
      validationError: status?.clash?.validation?.error || ''
    }
  };
}

function parseCleanupAt(value) {
  const text = String(value || DEFAULTS.cleanupAt).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`Invalid --cleanup-at time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid --cleanup-at time: ${value}`);
  }
  return { hour, minute };
}

function nextCleanupDelayMs(nowMs = Date.now(), cleanupAt = DEFAULTS.cleanupAt) {
  const { hour, minute } = parseCleanupAt(cleanupAt);
  const now = new Date(Number(nowMs) || Date.now());
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return Math.max(1, next.getTime() - now.getTime());
}

function summarizeCleanup(result) {
  return {
    retentionDays: result.retentionDays,
    retainedSinceDay: result.retainedSinceDay,
    deletedFiles: result.deletedFiles,
    deletedDirs: result.deletedDirs,
    deletedBytes: result.deletedBytes,
    removedEmptyDirs: result.removedEmptyDirs
  };
}

async function runCleanupOnce(options, reason = 'scheduled') {
  const result = await cleanupDetailedLogs({
    dir: options.dir,
    retentionDays: options.cleanupRetentionDays
  });
  console.log(JSON.stringify({
    ok: true,
    service: 'grasp-rat-combat-log-service',
    event: 'detailed-log-cleanup',
    reason,
    ...summarizeCleanup(result)
  }, null, 2));
  return result;
}

function scheduleDailyCleanup(options) {
  if (!options.cleanupEnabled) return null;
  parseCleanupAt(options.cleanupAt);
  let timer = null;
  const scheduleNext = () => {
    const delayMs = nextCleanupDelayMs(Date.now(), options.cleanupAt);
    timer = setTimeout(async () => {
      try {
        await runCleanupOnce(options, 'daily');
      } catch (err) {
        console.error(JSON.stringify({
          ok: false,
          service: 'grasp-rat-combat-log-service',
          event: 'detailed-log-cleanup',
          reason: 'daily',
          error: err?.message || String(err)
        }, null, 2));
      } finally {
        scheduleNext();
      }
    }, delayMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    return timer;
  };
  return scheduleNext();
}

async function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-log-server-'));
  const req = { socket: { remoteAddress: 'test' }, headers: { 'user-agent': 'self-test' } };
  try {
    const result = await appendCombatLog({ ...DEFAULTS, dir: root, splitFiles: true }, {
      combatId: 'fight:one',
      startedAt: Date.UTC(2026, 5, 17),
      version: 'bootstrap-test',
      sourceHash: 'hash',
      entries: [
        { type: 'combat-frame', at: Date.UTC(2026, 5, 17), combatId: 'fight:one' },
        { type: 'important-log', importantLog: true, at: Date.UTC(2026, 5, 17), combatId: 'session:one' },
        { type: 'exit-audit', criticalLog: true, at: Date.UTC(2026, 5, 17), combatId: 'audit:one' }
      ]
    }, req);
    const files = result.files.sort();
    const expected = [
      '2026-06-17/audit/audit_one.jsonl',
      '2026-06-17/combat/fight_one.jsonl',
      '2026-06-17/important/session_one.jsonl'
    ];
    for (const file of expected) {
      if (!files.includes(file)) throw new Error(`missing split file ${file}; got ${files.join(', ')}`);
    }
    const flat = await appendCombatLog({ ...DEFAULTS, dir: root, splitFiles: false }, {
      combatId: 'flat:one',
      startedAt: Date.UTC(2026, 5, 17),
      entries: [{ type: 'combat-frame', at: Date.UTC(2026, 5, 17) }]
    }, req);
    if (!flat.files.includes('2026-06-17/flat_one.jsonl')) {
      throw new Error(`legacy flat file missing; got ${flat.files.join(', ')}`);
    }
    const morning = new Date(2026, 5, 26, 3, 0, 0, 0).getTime();
    const later = new Date(2026, 5, 26, 4, 0, 0, 0).getTime();
    if (nextCleanupDelayMs(morning, '03:30') !== 30 * 60 * 1000) throw new Error('same-day cleanup delay mismatch');
    if (nextCleanupDelayMs(later, '03:30') !== 23.5 * 60 * 60 * 1000) throw new Error('next-day cleanup delay mismatch');
    const watchdogConfigPath = path.join(root, 'watchdog-config.json');
    fs.writeFileSync(watchdogConfigPath, JSON.stringify({
      watchdog: {
        enabled: true,
        dryRun: true,
        intervalMs: 333,
        directLeave: {
          enabled: true,
          verified: false,
          allowedOrigins: ['https://grasp-rat-game.h-e.top']
        },
        clash: {
          enabled: true,
          controllerUrl: 'http://127.0.0.1:9097',
          secret: 'abc\\def',
          group: 'GRASP-RAT-GAME'
        }
      }
    }));
    const parsed = parseArgs(['--watchdog-config', watchdogConfigPath, '--watchdog-interval-ms', '444']);
    if (parsed.watchdogConfigFile !== watchdogConfigPath) throw new Error('watchdog config path was not retained');
    if (!parsed.watchdog.enabled || !parsed.watchdog.dryRun) throw new Error('watchdog config file did not apply booleans');
    if (parsed.watchdog.intervalMs !== 444) throw new Error('later watchdog flag did not override config file');
    if (parsed.watchdog.clash.secret !== 'abc\\def') throw new Error('watchdog config did not preserve exact Clash secret');
    const startup = summarizeWatchdogStartup({
      enabled: parsed.watchdog.enabled,
      activeRescueEnabled: parsed.watchdog.activeRescueEnabled,
      dryRun: parsed.watchdog.dryRun,
      stateCount: 0,
      directLeave: { enabled: parsed.watchdog.directLeave.enabled, verified: parsed.watchdog.directLeave.verified, readyStates: 0 },
      clash: { enabled: parsed.watchdog.clash.enabled, validation: { ok: false, error: 'not validated' } },
      warning: ''
    }, parsed.watchdogConfigFile);
    if (JSON.stringify(startup).includes('abc\\def')) throw new Error('watchdog startup summary leaked Clash secret');
    await runWatchdogSelfTest();
    console.log(JSON.stringify({ ok: true, cases: 6 }, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest().catch(err => {
      console.error(err.stack || err.message);
      process.exit(1);
    });
    return;
  }
  fs.mkdirSync(options.dir, { recursive: true });
  const server = createServer(options);
  server.listen(options.port, options.host, () => {
    console.log(JSON.stringify({
      ok: true,
      service: 'grasp-rat-combat-log-service',
      endpoint: `http://${options.host}:${options.port}/combat-log`,
      health: `http://${options.host}:${options.port}/health`,
      dir: options.dir,
      watchdog: summarizeWatchdogStartup(server.watchdog.status(), options.watchdogConfigFile),
      cleanup: options.cleanupEnabled ? {
        retentionDays: options.cleanupRetentionDays,
        dailyAt: options.cleanupAt
      } : { enabled: false }
    }, null, 2));
    if (options.cleanupEnabled) {
      runCleanupOnce(options, 'startup').catch(err => {
        console.error(JSON.stringify({
          ok: false,
          service: 'grasp-rat-combat-log-service',
          event: 'detailed-log-cleanup',
          reason: 'startup',
          error: err?.message || String(err)
        }, null, 2));
      });
      scheduleDailyCleanup(options);
    }
  });
}

if (require.main === module) main();

module.exports = {
  createServer,
  appendCombatLog,
  parseArgs,
  loadWatchdogConfigFile,
  summarizeWatchdogStartup,
  nextCleanupDelayMs,
  scheduleDailyCleanup,
  runSelfTest
};
