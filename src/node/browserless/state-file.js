'use strict';

const fs = require('fs');
const path = require('path');
const { redactStructuredSecrets } = require('./session-client');

const SCHEMA_VERSION = 1;

function defaultBrowserlessState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: '',
    session: {
      userId: 0,
      sessionToken: '',
      authenticated: false,
      tokenUpdatedAt: ''
    },
    runner: {
      running: false,
      mode: 'idle',
      readOnly: true,
      dryRun: true,
      currentAction: null,
      lastRun: null,
      lastError: ''
    },
    probes: {
      lastSnapshotProbe: null,
      lastReadOnlyProbe: null
    },
    loginPointSafety: {
      ok: false,
      reason: 'unknown',
      point: null,
      checkedAt: ''
    },
    current: {
      self: null,
      stamina: null,
      profit: null,
      combatSummary: null,
      decision: null
    },
    recentExits: [],
    logs: {
      dataDir: '',
      logDir: '',
      stateFile: '',
      currentDayDir: ''
    }
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeState(base, patch) {
  const output = cloneJson(base || {});
  for (const [key, value] of Object.entries(patch || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeState(output[key], value);
    } else {
      output[key] = cloneJson(value);
    }
  }
  return output;
}

function stateFilePath(config) {
  if (config?.stateFile) return path.resolve(config.stateFile);
  return path.join(path.resolve(config?.dataDir || path.join(process.cwd(), 'data', 'browserless-runner')), 'state.json');
}

function readBrowserlessStateFile(file, fallback = null) {
  const base = fallback || defaultBrowserlessState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return normalizeBrowserlessState(mergeState(base, parsed), file);
  } catch (_) {
    return normalizeBrowserlessState(base, file);
  }
}

function writeBrowserlessStateFile(file, state) {
  const normalized = normalizeBrowserlessState(state, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n');
  return normalized;
}

function updateBrowserlessStateFile(file, patch, options = {}) {
  const current = readBrowserlessStateFile(file);
  const updated = mergeState(current, {
    ...patch,
    updatedAt: options.updatedAt || new Date().toISOString()
  });
  return writeBrowserlessStateFile(file, updated);
}

function normalizeBrowserlessState(state, file = '') {
  const normalized = mergeState(defaultBrowserlessState(), state || {});
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.session.userId = Number(normalized.session.userId || 0);
  normalized.session.sessionToken = String(normalized.session.sessionToken || '');
  normalized.session.authenticated = Boolean(normalized.session.userId && normalized.session.sessionToken);
  normalized.runner.running = Boolean(normalized.runner.running);
  normalized.runner.readOnly = normalized.runner.readOnly !== false;
  normalized.runner.dryRun = normalized.runner.dryRun !== false;
  normalized.recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits.slice(-20) : [];
  if (file) normalized.logs.stateFile = path.resolve(file);
  return normalized;
}

function buildPublicBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const publicState = {
    schemaVersion: normalized.schemaVersion,
    updatedAt: normalized.updatedAt || '',
    session: {
      userId: normalized.session.userId,
      authenticated: normalized.session.authenticated,
      tokenPresent: Boolean(normalized.session.sessionToken),
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || ''
    },
    runner: normalized.runner,
    probes: normalized.probes,
    loginPointSafety: normalized.loginPointSafety,
    current: normalized.current,
    recentExits: normalized.recentExits,
    logs: {
      dataDir: normalized.logs.dataDir || config.dataDir || '',
      logDir: normalized.logs.logDir || config.logDir || '',
      stateFile: normalized.logs.stateFile || (config.dataDir ? stateFilePath(config) : ''),
      currentDayDir: normalized.logs.currentDayDir || ''
    },
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken)
    }
  };
  return redactStructuredSecrets(publicState);
}

module.exports = {
  buildPublicBrowserlessStatus,
  defaultBrowserlessState,
  mergeState,
  readBrowserlessStateFile,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
};
