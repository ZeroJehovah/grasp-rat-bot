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
      tokenUpdatedAt: '',
      lastAuthUrl: '',
      lastAuthUrlAt: '',
      lastLoginSource: '',
      lastLoginSummary: null
    },
    runner: {
      running: false,
      mode: 'idle',
      readOnly: true,
      controlMode: 'read-only',
      canaryProfile: '',
      dryRun: true,
      combatEnabled: false,
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
      decision: null,
      action: null
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

function shouldReplaceStateObject(pathParts) {
  const pathKey = pathParts.join('.');
  return pathKey === 'runner.currentAction' || pathKey === 'current.action';
}

function mergeState(base, patch, pathParts = []) {
  const output = cloneJson(base || {});
  for (const [key, value] of Object.entries(patch || {})) {
    const nextPath = [...pathParts, key];
    if (shouldReplaceStateObject(nextPath)) {
      output[key] = cloneJson(value);
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeState(output[key], value, nextPath);
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

function loginPointFromAnyState(state) {
  const point = state?.loginPointSafety?.point
    || state?.current?.self
    || state?.lastSelfSummary
    || null;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    hp: Number.isFinite(Number(point.hp)) ? Number(point.hp) : null,
    source: point.source || 'state'
  };
}

function sessionFromAnyState(state) {
  const userId = Number(state?.session?.userId || state?.userId || 0);
  const sessionToken = String(state?.session?.sessionToken || state?.sessionToken || '');
  return {
    userId: Number.isFinite(userId) ? userId : 0,
    sessionToken
  };
}

function browserlessPatchFromLegacyState(state, options = {}) {
  const session = sessionFromAnyState(state);
  const loginPoint = loginPointFromAnyState(state);
  const nowIso = options.updatedAt || new Date().toISOString();
  const patch = {};
  if (session.userId || session.sessionToken) {
    patch.session = {
      userId: session.userId,
      sessionToken: session.sessionToken,
      tokenUpdatedAt: state?.session?.tokenUpdatedAt || (session.sessionToken ? nowIso : '')
    };
  }
  if (loginPoint) {
    patch.loginPointSafety = {
      ok: Boolean(state?.loginPointSafety?.ok),
      reason: state?.loginPointSafety?.reason || 'imported-login-point-pending-snapshot-safety',
      point: {
        ...loginPoint,
        source: options.source || loginPoint.source || 'import'
      },
      checkedAt: state?.loginPointSafety?.checkedAt || ''
    };
    patch.current = {
      self: {
        ...loginPoint,
        name: state?.lastSelfSummary?.name || state?.current?.self?.name || ''
      }
    };
  }
  return patch;
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
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || '',
      lastAuthUrl: normalized.session.lastAuthUrl || '',
      lastAuthUrlAt: normalized.session.lastAuthUrlAt || '',
      lastLoginSource: normalized.session.lastLoginSource || '',
      lastLoginSummary: normalized.session.lastLoginSummary || null
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
  browserlessPatchFromLegacyState,
  buildPublicBrowserlessStatus,
  defaultBrowserlessState,
  loginPointFromAnyState,
  mergeState,
  readBrowserlessStateFile,
  sessionFromAnyState,
  stateFilePath,
  updateBrowserlessStateFile,
  writeBrowserlessStateFile
};
