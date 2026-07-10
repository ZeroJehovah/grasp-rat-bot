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
      decisionState: null,
      action: null
    },
    recentExits: [],
    network: {
      sourceIp: '',
      sourceIps: [],
      lastSelectedAt: '',
      lastSelectionReason: '',
      lastProbe: null,
      lastSwitch: null
    },
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
  return pathKey === 'runner.currentAction'
    || pathKey === 'current.action'
    || pathKey === 'current.decision'
    || pathKey === 'current.decisionState';
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
  normalized.network.sourceIp = String(normalized.network.sourceIp || '');
  normalized.network.sourceIps = Array.isArray(normalized.network.sourceIps)
    ? normalized.network.sourceIps.map(item => String(item || '').trim()).filter(Boolean)
    : [];
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

function compactNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactString(value, maxLength = 160) {
  const text = String(value || '');
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '...' : text;
}

function compactPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = compactNumber(value.x);
  const y = compactNumber(value.y);
  if (x === null && y === null) return null;
  return {
    x,
    y,
    hp: compactNumber(value.hp),
    source: compactString(value.source, 48)
  };
}

function compactTarget(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    type: compactString(value.type, 48),
    id: value.id ?? value.coinId ?? null,
    userId: compactNumber(value.userId),
    entityId: value.entityId ?? null,
    name: compactString(value.name, 80),
    authority: compactString(value.authority, 48),
    hp: compactNumber(value.hp),
    drop: compactNumber(value.drop),
    stamina5s: compactNumber(value.stamina5s ?? value.stamina5sRemainingMilli ?? value.stamina_5s_remaining_milli),
    staminaMetadataAuthority: compactString(value.staminaMetadataAuthority, 48),
    amount: compactNumber(value.amount ?? value.value),
    distance: compactNumber(value.distance ?? value.d),
    active: value.active === undefined ? null : Boolean(value.active),
    moving: value.moving === undefined ? null : Boolean(value.moving),
    firing: value.firing === undefined ? null : Boolean(value.firing)
  };
}

function compactCommand(command) {
  if (!command || typeof command !== 'object') return null;
  return {
    type: compactString(command.type || command.kind, 48),
    dx: compactNumber(command.dx),
    dy: compactNumber(command.dy),
    vx: compactNumber(command.vx),
    vy: compactNumber(command.vy),
    x: compactNumber(command.x),
    y: compactNumber(command.y)
  };
}

function compactAction(action) {
  if (!action || typeof action !== 'object') return null;
  const state = action.actionState && typeof action.actionState === 'object' ? action.actionState : {};
  return {
    ok: action.ok === undefined ? null : Boolean(action.ok),
    kind: compactString(action.kind, 48),
    reason: compactString(action.reason, 120),
    delayMs: compactNumber(action.delayMs),
    nextRunAt: compactString(action.nextRunAt, 48),
    target: compactTarget(action.target),
    movement: action.movement && typeof action.movement === 'object'
      ? {
          ok: action.movement.ok === undefined ? null : Boolean(action.movement.ok),
          skipped: action.movement.skipped === undefined ? null : Boolean(action.movement.skipped),
          reason: compactString(action.movement.reason, 120),
          command: compactCommand(action.movement.command)
        }
      : null,
    shoot: action.shoot && typeof action.shoot === 'object'
      ? {
          ok: action.shoot.ok === undefined ? null : Boolean(action.shoot.ok),
          skipped: action.shoot.skipped === undefined ? null : Boolean(action.shoot.skipped),
          reason: compactString(action.shoot.reason, 120),
          cadenceMs: compactNumber(action.shoot.cadenceMs),
          command: compactCommand(action.shoot.command)
        }
      : null,
    counts: {
      sent: compactNumber(state.sentCount),
      velocity: compactNumber(state.velocitySentCount),
      shoot: compactNumber(state.shootSentCount),
      stop: compactNumber(state.stopCount),
      skipped: compactNumber(state.skippedCount),
      shootRepeat: compactNumber(state.shootRepeatSentCount)
    },
    lastShootAck: state.lastShootAck && typeof state.lastShootAck === 'object'
      ? {
          ok: state.lastShootAck.ok === undefined ? null : Boolean(state.lastShootAck.ok),
          type: compactString(state.lastShootAck.type || state.lastShootAck.kind, 48),
          at: compactString(state.lastShootAck.at, 48)
        }
      : null
  };
}

function compactDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  const dataGaps = Array.isArray(decision.input?.dataGaps) ? decision.input.dataGaps : [];
  const kind = String(decision.kind || decision.action?.kind || '');
  const shouldExposeProfitTarget = [
    'coin',
    'seek-coin',
    'profit-candidate',
    'attack',
    'seek-enemy',
    'seek-drop',
    'post-attack-drop-wait'
  ].includes(kind);
  return {
    kind: compactString(decision.kind, 48),
    band: compactString(decision.band, 48),
    reason: compactString(decision.reason, 120),
    at: compactString(decision.at, 48),
    tick: compactNumber(decision.tick),
    actionKind: compactString(decision.action?.kind, 48),
    target: compactTarget(decision.target || decision.action?.target || (shouldExposeProfitTarget ? (decision.profit?.best?.target || decision.profit?.best?.coin) : null)),
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: dataGaps.length
  };
}

function compactStamina(stamina, self) {
  const source = stamina && typeof stamina === 'object' ? stamina : {};
  const selfSource = self && typeof self === 'object' ? self : {};
  return {
    current: compactNumber(source.stamina ?? selfSource.stamina),
    spent: compactNumber(source.staminaSpent),
    remaining5s: compactNumber(source.stamina5sRemainingMilli ?? source.stamina5s ?? selfSource.stamina5s ?? selfSource.stamina_5s_remaining_milli),
    remaining1h: compactNumber(source.stamina1hRemainingMilli ?? source.stamina1h ?? selfSource.stamina1h ?? selfSource.stamina_1h_remaining_milli),
    remaining1d: compactNumber(source.stamina1dRemainingMilli ?? source.stamina1d ?? selfSource.stamina1d ?? selfSource.stamina_1d_remaining_milli)
  };
}

function compactSelf(self) {
  if (!self || typeof self !== 'object') return null;
  return {
    userId: compactNumber(self.userId),
    entityId: self.entityId ?? null,
    name: compactString(self.name, 80),
    authority: compactString(self.authority, 48),
    x: compactNumber(self.x),
    y: compactNumber(self.y),
    hp: compactNumber(self.hp),
    drop: compactNumber(self.drop),
    active: self.active === undefined ? null : Boolean(self.active),
    moving: self.moving === undefined ? null : Boolean(self.moving),
    firing: self.firing === undefined ? null : Boolean(self.firing),
    alive: self.alive === undefined ? null : Boolean(self.alive)
  };
}

function compactProfit(profit) {
  if (!profit || typeof profit !== 'object') return null;
  const best = profit.best && typeof profit.best === 'object' ? profit.best : null;
  const candidates = Array.isArray(profit.candidates) ? profit.candidates : [];
  return {
    best: best
      ? {
          type: compactString(best.type, 48),
          actionKind: compactString(best.actionKind, 48),
          reason: compactString(best.reason, 120),
          score: compactNumber(best.score),
          staminaCost: compactNumber(best.staminaCost),
          distance: compactNumber(best.distance),
          amount: compactNumber(best.amount),
          target: compactTarget(best.target || best.coin)
        }
      : null,
    candidateCount: candidates.length
  };
}

function compactCombat(combat) {
  if (!combat || typeof combat !== 'object') return null;
  const candidates = Array.isArray(combat.candidates) ? combat.candidates : [];
  const dataGaps = Array.isArray(combat.dataGaps) ? combat.dataGaps : [];
  return {
    ok: combat.ok === undefined ? null : Boolean(combat.ok),
    dryRun: combat.dryRun === undefined ? null : Boolean(combat.dryRun),
    liveEnabled: combat.liveEnabled === undefined ? null : Boolean(combat.liveEnabled),
    authority: compactString(combat.authority, 48),
    tick: compactNumber(combat.tick),
    self: compactTarget(combat.self),
    target: compactTarget(combat.target),
    candidateCount: candidates.length,
    movement: combat.movement && typeof combat.movement === 'object'
      ? {
          dx: compactNumber(combat.movement.dx),
          dy: compactNumber(combat.movement.dy),
          reason: compactString(combat.movement.reason, 120)
        }
      : null,
    shooting: combat.shooting && typeof combat.shooting === 'object'
      ? {
          wouldShoot: combat.shooting.wouldShoot === undefined ? null : Boolean(combat.shooting.wouldShoot),
          inRange: combat.shooting.inRange === undefined ? null : Boolean(combat.shooting.inRange),
          reason: compactString(combat.shooting.reason, 120),
          cadenceMs: compactNumber(combat.shooting.cadenceMs ?? combat.shooting.effectiveCadenceMs),
          stamina5s: compactNumber(combat.shooting.stamina5s)
        }
      : null,
    exit: combat.exit && typeof combat.exit === 'object'
      ? {
          kind: compactString(combat.exit.kind, 48),
          reason: compactString(combat.exit.reason, 120)
        }
      : null,
    dataGaps: dataGaps.slice(0, 5).map(item => compactString(item, 80)),
    dataGapCount: dataGaps.length
  };
}

function compactRun(run) {
  if (!run || typeof run !== 'object') return null;
  const canary = run.canary && typeof run.canary === 'object' ? run.canary : null;
  const safetyReason = canary?.safety?.event?.reason || canary?.safety?.leaveFailure?.reason || '';
  return {
    ok: run.ok === undefined ? null : Boolean(run.ok),
    mode: compactString(run.mode || run.controlMode, 48),
    runId: compactString(run.runId || canary?.runId, 96),
    startedAt: compactString(run.startedAt || canary?.startedAt, 48),
    completedAt: compactString(run.completedAt || canary?.completedAt, 48),
    reason: compactString(run.reason || safetyReason, 120),
    error: compactString(run.error || canary?.error, 160),
    frames: compactNumber(canary?.stats?.frameCount),
    decisions: compactNumber(canary?.decisions?.evaluatedCount),
    actions: compactNumber(canary?.actions?.sentCount)
  };
}

function compactExit(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    at: compactString(event.at || event.time || event.createdAt, 48),
    reason: compactString(event.reason || event.type, 120),
    runId: compactString(event.runId || event.detail?.runId, 96),
    shouldLeave: event.shouldLeave === undefined ? null : Boolean(event.shouldLeave)
  };
}

function compactGameStatus(normalized) {
  const current = normalized.current || {};
  const self = current.self && typeof current.self === 'object' ? current.self : null;
  const action = normalized.runner?.currentAction || current.action || current.decision || {};
  const kind = String(action.kind || '');
  const reason = String(action.reason || '');
  const waiting = ['loop-wait', 'stop', 'stopped'].includes(kind)
    || [
      'missing-manual-session',
      'snapshot-safety-retry',
      'login-point-bootstrap-failed',
      'unsupported-control-mode'
    ].includes(reason);
  const selfPresent = Boolean(self?.userId || self?.entityId || self?.name);
  return {
    inGame: Boolean(selfPresent && !waiting),
    selfPresent,
    state: selfPresent && !waiting ? 'in-game' : (waiting ? 'waiting' : 'not-in-game')
  };
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
    network: normalized.network,
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

function buildCompactBrowserlessStatus(state, config = {}) {
  const normalized = normalizeBrowserlessState(state, state?.logs?.stateFile || '');
  const inputSession = state?.session && typeof state.session === 'object' ? state.session : {};
  const tokenPresent = Boolean(normalized.session.sessionToken || inputSession.tokenPresent);
  const authenticated = Boolean(inputSession.authenticated || (normalized.session.userId && tokenPresent));
  const current = normalized.current || {};
  const action = compactAction(normalized.runner.currentAction) || compactAction(current.action);
  const recentExits = Array.isArray(normalized.recentExits) ? normalized.recentExits : [];
  const recentActualExit = recentExits.slice().reverse().find(event => event?.shouldLeave !== false) || null;
  const recentBlock = recentExits.slice().reverse().find(event => event?.shouldLeave === false) || null;
  const compactState = {
    schemaVersion: normalized.schemaVersion,
    compact: true,
    updatedAt: normalized.updatedAt || '',
    session: {
      userId: normalized.session.userId,
      authenticated,
      tokenPresent,
      tokenUpdatedAt: normalized.session.tokenUpdatedAt || ''
    },
    runner: {
      running: normalized.runner.running,
      mode: normalized.runner.mode || '',
      readOnly: normalized.runner.readOnly,
      controlMode: normalized.runner.controlMode || '',
      canaryProfile: normalized.runner.canaryProfile || '',
      dryRun: normalized.runner.dryRun,
      combatEnabled: Boolean(normalized.runner.combatEnabled),
      lastError: compactString(normalized.runner.lastError, 160),
      currentAction: compactAction(normalized.runner.currentAction),
      lastRun: compactRun(normalized.runner.lastRun)
    },
    game: compactGameStatus(normalized),
    self: compactSelf(current.self),
    stamina: compactStamina(current.stamina, current.self),
    decision: compactDecision(current.decision),
    action,
    profit: compactProfit(current.profit || current.decision?.profit),
    combat: compactCombat(current.combatSummary || current.decision?.combat),
    loginPointSafety: {
      ok: Boolean(normalized.loginPointSafety?.ok),
      reason: compactString(normalized.loginPointSafety?.reason, 120),
      checkedAt: normalized.loginPointSafety?.checkedAt || '',
      point: compactPoint(normalized.loginPointSafety?.point)
    },
    network: {
      sourceIp: normalized.network.sourceIp || '',
      sourceIpCount: normalized.network.sourceIps.length,
      lastSelectedAt: normalized.network.lastSelectedAt || '',
      lastSelectionReason: compactString(normalized.network.lastSelectionReason, 120)
    },
    recentExit: compactExit(recentActualExit),
    recentBlock: compactExit(recentBlock),
    statusServer: {
      host: config.statusHost || '',
      port: Number(config.statusPort || 0),
      webTokenPresent: Boolean(config.webToken)
    }
  };
  return redactStructuredSecrets(compactState);
}

module.exports = {
  browserlessPatchFromLegacyState,
  buildCompactBrowserlessStatus,
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
