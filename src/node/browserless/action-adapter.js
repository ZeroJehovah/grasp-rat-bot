'use strict';

const { buildRuntimeDefaults } = require('../../shared/runtime-defaults');
const {
  coinDirectionToCore,
  coinMotionMetaCore
} = require('../../strategy/coin-motion');

const BROWSER_RUNTIME_DEFAULTS = buildRuntimeDefaults({}, false);
const DEFAULT_TARGET_DEAD_ZONE_CM = 900;
const DEFAULT_COIN_TARGET_DEAD_ZONE_CM = 150;
const DEFAULT_COMMAND_INTERVAL_MS = 500;
const DEFAULT_SETTLEMENT_FRAMES = 2;
const DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS = 160;
const DEFAULT_ATTACK_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.attackRange;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundVelocity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (Math.abs(number) < 0.0005) return 0;
  return Math.round(number * 1000) / 1000;
}

function quantizeVelocity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return clampNumber(Math.round(number), -1, 1);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function optionNumber(options, key, fallback) {
  const number = Number(options?.[key]);
  return Number.isFinite(number) ? number : fallback;
}

function coinMotionCoreOptions(options = {}, extra = {}) {
  return {
    tolerance: optionNumber(options, 'coinPrecisionTolerance', BROWSER_RUNTIME_DEFAULTS.coinPrecisionTolerance),
    coinPrecisionTolerance: optionNumber(options, 'coinPrecisionTolerance', BROWSER_RUNTIME_DEFAULTS.coinPrecisionTolerance),
    coinAxisApproachMinDistance: optionNumber(options, 'coinAxisApproachMinDistance', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachMinDistance),
    coinAxisApproachRatio: optionNumber(options, 'coinAxisApproachRatio', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachRatio),
    coinAxisApproachLaneTolerance: optionNumber(options, 'coinAxisApproachLaneTolerance', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachLaneTolerance),
    coinPickupStopDistance: optionNumber(options, 'coinPickupStopDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupStopDistance),
    coinPickupStopPulseMs: optionNumber(options, 'coinPickupStopPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupStopPulseMs),
    coinPickupMicroDistance: optionNumber(options, 'coinPickupMicroDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupMicroDistance),
    coinPickupMicroPulseMs: optionNumber(options, 'coinPickupMicroPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupMicroPulseMs),
    coinPickupFineDistance: optionNumber(options, 'coinPickupFineDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupFineDistance),
    coinPickupFinePulseMs: optionNumber(options, 'coinPickupFinePulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFinePulseMs),
    coinPickupBrakeDistance: optionNumber(options, 'coinPickupBrakeDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupBrakeDistance),
    coinPickupBrakePulseMs: optionNumber(options, 'coinPickupBrakePulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupBrakePulseMs),
    coinPickupSweepDistance: optionNumber(options, 'coinPickupSweepDistance', BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance),
    coinPickupSweepPulseMs: optionNumber(options, 'coinPickupSweepPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupSweepPulseMs),
    coinPickupPulseMs: optionNumber(options, 'coinPickupPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupPulseMs),
    coinPickupExactTolerance: optionNumber(options, 'coinPickupExactTolerance', BROWSER_RUNTIME_DEFAULTS.coinPickupExactTolerance),
    coinPickupFailureSlowStepMs: optionNumber(options, 'coinPickupFailureSlowStepMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFailureSlowStepMs),
    coinPickupFailureMinPulseMs: optionNumber(options, 'coinPickupFailureMinPulseMs', BROWSER_RUNTIME_DEFAULTS.coinPickupFailureMinPulseMs),
    coinApproachBrakeDistance: optionNumber(options, 'coinApproachBrakeDistance', BROWSER_RUNTIME_DEFAULTS.coinApproachBrakeDistance),
    coinAxisFlipTolerance: optionNumber(options, 'coinAxisFlipTolerance', BROWSER_RUNTIME_DEFAULTS.coinAxisFlipTolerance),
    coinApproachLockMs: optionNumber(options, 'coinApproachLockMs', BROWSER_RUNTIME_DEFAULTS.coinApproachLockMs),
    nearCoinStuckDistance: optionNumber(options, 'nearCoinStuckDistance', BROWSER_RUNTIME_DEFAULTS.nearCoinStuckDistance),
    ...extra
  };
}

function applyCoinApproachLockUpdate(state, update) {
  if (!state || !update) return;
  if (update.action === 'set' && update.lock) {
    state.coinApproachLock = update.lock;
    return;
  }
  if (update.action === 'clear') {
    if (update.all || !state.coinApproachLock || String(state.coinApproachLock.id) === String(update.id)) {
      state.coinApproachLock = null;
    }
  }
}

function coinMotionVectorToTarget(self, target, options = {}, state = null, nowMs = Date.now()) {
  const sx = numberOrNull(self?.x);
  const sy = numberOrNull(self?.y);
  const tx = numberOrNull(target?.x);
  const ty = numberOrNull(target?.y);
  if (sx === null || sy === null || tx === null || ty === null) {
    return { ok: false, reason: 'missing-position', dx: 0, dy: 0, distance: null };
  }
  const coin = {
    ...target,
    drop_id: target?.drop_id ?? target?.id,
    id: target?.id ?? target?.drop_id,
    x: tx,
    y: ty
  };
  const result = coinDirectionToCore({ x: sx, y: sy }, coin, coinMotionCoreOptions(options, {
    nowMs,
    lock: state?.coinApproachLock || null
  }));
  applyCoinApproachLockUpdate(state, result.lockUpdate);
  const direction = result.direction || {};
  const meta = coinMotionMetaCore(direction);
  const dx = clampNumber(Math.round(Number(direction.dx || 0)), -1, 1);
  const dy = clampNumber(Math.round(Number(direction.dy || 0)), -1, 1);
  const distance = Number.isFinite(Number(direction.distance))
    ? Math.round(Number(direction.distance))
    : Math.round(Math.hypot(tx - sx, ty - sy));
  const reason = meta.pickupMode
    ? 'coin-pickup-sweep'
    : (meta.routeMode ? 'coin-route-motion' : 'move-to-target');
  if (!(dx || dy)) {
    return {
      ok: false,
      reason: 'target-reached',
      dx,
      dy,
      distance,
      ...meta
    };
  }
  return {
    ok: true,
    reason,
    dx,
    dy,
    distance,
    ...meta
  };
}

function movementVectorToTarget(self, target, options = {}) {
  const sx = numberOrNull(self?.x);
  const sy = numberOrNull(self?.y);
  const tx = numberOrNull(target?.x);
  const ty = numberOrNull(target?.y);
  if (sx === null || sy === null || tx === null || ty === null) {
    return { ok: false, reason: 'missing-position', dx: 0, dy: 0, distance: null };
  }
  const rawDx = tx - sx;
  const rawDy = ty - sy;
  const distance = Math.hypot(rawDx, rawDy);
  const generalDeadZone = Math.max(0, Number(options.targetDeadZoneCm ?? DEFAULT_TARGET_DEAD_ZONE_CM));
  const deadZone = String(target?.type || '') === 'coin'
    ? Math.max(0, Number(options.coinTargetDeadZoneCm ?? Math.min(generalDeadZone, DEFAULT_COIN_TARGET_DEAD_ZONE_CM)))
    : generalDeadZone;
  if (!(distance > deadZone)) {
    return { ok: false, reason: 'target-reached', dx: 0, dy: 0, distance: Math.round(distance) };
  }
  return {
    ok: true,
    reason: 'move-to-target',
    dx: roundVelocity(rawDx / distance),
    dy: roundVelocity(rawDy / distance),
    distance: Math.round(distance)
  };
}

function profitActionFromDecision(decision) {
  const action = decision?.action || decision || {};
  const target = action.target || null;
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (band !== 'profit') return null;
  if ((kind === 'coin' || kind === 'seek-coin' || kind === 'profit-candidate') && target?.type === 'coin') {
    return { type: 'coin', kind, target };
  }
  if ((kind === 'attack' || kind === 'seek-enemy') && target?.type === 'enemy') {
    return { type: 'enemy', kind, target };
  }
  return null;
}

function combatSummaryFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (band !== 'combat' || kind !== 'combat-live') return null;
  return decision?.combat || null;
}

function safetyMotionFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (band !== 'safety') return null;
  if (kind !== 'flee' && kind !== 'return-block-scan') return null;
  return action;
}

function postAttackWaitFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  if (kind !== 'post-attack-drop-wait') return null;
  return action;
}

function patrolMotionFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  if (kind !== 'patrol') return null;
  if (!(Number(action.dx || 0) || Number(action.dy || 0))) return null;
  return action;
}

function controlActionFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (kind === 'leave' || kind === 'safety-exit' || action.shouldLeave === true) {
    return {
      type: 'leave',
      kind: kind || 'leave',
      band,
      reason: action.reason || decision?.reason || 'leave-decision',
      action
    };
  }
  if (kind === 'wait' || kind === 'recover') {
    return {
      type: 'stop',
      kind,
      band,
      reason: action.reason || decision?.reason || kind || 'wait',
      action
    };
  }
  return null;
}

function unsupportedActionDiagnostics(decision) {
  const action = decision?.action || decision || {};
  return {
    kind: String(action.kind || decision?.kind || ''),
    band: String(action.band || decision?.band || ''),
    reason: String(action.reason || decision?.reason || ''),
    targetType: action.target?.type || '',
    shouldLeave: action.shouldLeave === true
  };
}

function createInitialActionState() {
  return {
    sentCount: 0,
    velocitySentCount: 0,
    shootSentCount: 0,
    stopCount: 0,
    skippedCount: 0,
    velocityRepeatSentCount: 0,
    lastCommand: null,
    lastShootCommand: null,
    lastShootAck: null,
    lastSettlement: null,
    coinApproachLock: null,
    velocityPulseToken: 0,
    velocityStopTimer: null,
    velocityRepeatToken: 0,
    velocityRepeatUntilMs: 0,
    velocityStopRepeatsLeft: 0,
    velocityRepeatTimer: null,
    lastVelocityRepeatError: ''
  };
}

function summarizeCommand(command) {
  if (!command) return null;
  return {
    id: command.id,
    type: command.type,
    dx: command.dx,
    dy: command.dy,
    targetX: command.targetX,
    targetY: command.targetY,
    startX: command.startX,
    startY: command.startY,
    reason: command.reason,
    sentAt: command.sentAt,
    target: command.target || null
  };
}

function createBrowserlessActionAdapter(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const transport = options.transport || null;
  const commandIntervalMs = Math.max(0, Number(options.commandIntervalMs ?? DEFAULT_COMMAND_INTERVAL_MS));
  const decisionIntervalMs = Math.max(0, Number(options.decisionIntervalMs || 0));
  const velocityRepeatEnabled = options.velocityRepeatEnabled === true;
  const velocityRepeatMs = Math.max(20, Number(options.velocityRepeatMs ?? options.directWsVelocityRepeatMs ?? BROWSER_RUNTIME_DEFAULTS.directWsVelocityRepeatMs ?? 50));
  const configuredRepeatHoldMs = Math.max(0, Number(options.velocityRepeatHoldMs ?? options.directWsVelocityRepeatHoldMs ?? BROWSER_RUNTIME_DEFAULTS.directWsVelocityRepeatHoldMs ?? 220));
  const velocityRepeatHoldMs = Math.max(
    velocityRepeatMs,
    configuredRepeatHoldMs,
    commandIntervalMs + velocityRepeatMs,
    decisionIntervalMs + velocityRepeatMs
  );
  const velocityStopRepeatCount = Math.max(0, Math.round(Number(options.velocityStopRepeatCount ?? options.directWsStopRepeatCount ?? BROWSER_RUNTIME_DEFAULTS.directWsStopRepeatCount ?? 0)));
  const settlementFrames = Math.max(1, Number(options.settlementFrames ?? DEFAULT_SETTLEMENT_FRAMES));
  const combatShootMinIntervalMs = Math.max(1, Number(options.combatShootMinIntervalMs ?? DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS));
  const setTimeoutFn = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const state = createInitialActionState();
  let nextCommandId = 1;

  function unrefTimer(timer) {
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function clearPrecisionPulseStop() {
    if (!state.velocityStopTimer) return;
    clearTimeoutFn(state.velocityStopTimer);
    state.velocityStopTimer = null;
  }

  function clearVelocityRepeatTimer() {
    if (!state.velocityRepeatTimer) return;
    clearTimeoutFn(state.velocityRepeatTimer);
    state.velocityRepeatTimer = null;
  }

  function cancelVelocityRepeat() {
    state.velocityRepeatToken += 1;
    state.velocityRepeatUntilMs = 0;
    state.velocityStopRepeatsLeft = 0;
    clearVelocityRepeatTimer();
  }

  function scheduleVelocityRepeat(dx, dy) {
    if (!velocityRepeatEnabled) {
      cancelVelocityRepeat();
      return null;
    }
    const moving = Boolean(dx || dy);
    clearVelocityRepeatTimer();
    state.velocityRepeatToken += 1;
    const token = state.velocityRepeatToken;
    if (moving) {
      state.velocityRepeatUntilMs = now() + velocityRepeatHoldMs;
      state.velocityStopRepeatsLeft = 0;
    } else {
      state.velocityRepeatUntilMs = 0;
      state.velocityStopRepeatsLeft = velocityStopRepeatCount;
    }
    const run = () => {
      if (state.velocityRepeatToken !== token) return;
      state.velocityRepeatTimer = null;
      const keepMoving = moving && now() <= Number(state.velocityRepeatUntilMs || 0);
      const keepStopping = !moving && Number(state.velocityStopRepeatsLeft || 0) > 0;
      if (!keepMoving && !keepStopping) return;
      if (!moving) state.velocityStopRepeatsLeft = Math.max(0, Number(state.velocityStopRepeatsLeft || 0) - 1);
      try {
        transport.sendVelocity(dx, dy);
        state.velocityRepeatSentCount += 1;
        state.lastVelocityRepeatError = '';
      } catch (err) {
        state.lastVelocityRepeatError = err?.message || String(err);
        return;
      }
      state.velocityRepeatTimer = setTimeoutFn(run, velocityRepeatMs);
      unrefTimer(state.velocityRepeatTimer);
    };
    state.velocityRepeatTimer = setTimeoutFn(run, velocityRepeatMs);
    unrefTimer(state.velocityRepeatTimer);
    return {
      repeatMs: velocityRepeatMs,
      holdMs: moving ? velocityRepeatHoldMs : 0,
      stopRepeats: moving ? 0 : velocityStopRepeatCount
    };
  }

  function schedulePrecisionPulseStop(sent, pulseMs, actionKind) {
    const pulse = Number(pulseMs);
    if (!sent?.ok || sent.skipped || !(pulse > 0)) return null;
    const command = sent.command || null;
    if (!command || !(Number(command.dx || 0) || Number(command.dy || 0))) return null;
    if (actionKind !== 'coin' && actionKind !== 'seek-coin' && actionKind !== 'profit-candidate') return null;
    const pulseMaxMs = Math.max(110, Number(options.precisionPulseMaxMs || BROWSER_RUNTIME_DEFAULTS.precisionPulseMaxMs));
    const delayMs = Math.round(clampNumber(pulse, 20, pulseMaxMs));
    const token = sent.pulseToken;
    state.velocityStopTimer = setTimeoutFn(() => {
      if (state.velocityPulseToken !== token) return;
      state.velocityStopTimer = null;
      sendVelocity(0, 0, 'precision-pulse');
    }, delayMs);
    return delayMs;
  }

  function sendVelocity(dx, dy, reason, target = null) {
    const atMs = now();
    dx = quantizeVelocity(dx);
    dy = quantizeVelocity(dy);
    if (!transport || typeof transport.sendVelocity !== 'function') {
      cancelVelocityRepeat();
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: 'missing-transport' };
    }
    const last = state.lastCommand;
    const changed = !last || Number(last.dx) !== Number(dx) || Number(last.dy) !== Number(dy);
    if (!changed && atMs - Number(last.sentAtMs || 0) < commandIntervalMs) {
      state.skippedCount += 1;
      return { ok: true, skipped: true, reason: 'unchanged-command-throttled', command: summarizeCommand(last) };
    }
    clearPrecisionPulseStop();
    state.velocityPulseToken += 1;
    const pulseToken = state.velocityPulseToken;
    transport.sendVelocity(dx, dy);
    const repeat = scheduleVelocityRepeat(dx, dy);
    const command = {
      id: nextCommandId,
      type: 'velocity',
      dx,
      dy,
      reason,
      sentAtMs: atMs,
      sentAt: new Date(atMs).toISOString(),
      target,
      settleAfterTick: null,
      observedFrames: 0
    };
    nextCommandId += 1;
    state.sentCount += 1;
    state.velocitySentCount += 1;
    if (Number(command.dx) === 0 && Number(command.dy) === 0) state.stopCount += 1;
    state.lastCommand = command;
    state.lastSettlement = {
      ok: false,
      commandId: command.id,
      reason: 'pending',
      observedFrames: 0,
      tick: null
    };
    return { ok: true, skipped: false, command: summarizeCommand(command), pulseToken, repeat };
  }

  function sendShoot(targetX, targetY, startX, startY, reason, target = null, cadenceMs = combatShootMinIntervalMs) {
    const atMs = now();
    if (!transport || typeof transport.sendShoot !== 'function') {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: 'missing-transport' };
    }
    const last = state.lastShootCommand;
    const intervalMs = Math.max(combatShootMinIntervalMs, Number(cadenceMs || 0));
    if (last && atMs - Number(last.sentAtMs || 0) < intervalMs) {
      state.skippedCount += 1;
      return { ok: true, skipped: true, reason: 'shoot-command-throttled', command: summarizeCommand(last), cadenceMs: intervalMs };
    }
    transport.sendShoot(targetX, targetY, startX, startY);
    const command = {
      id: nextCommandId,
      type: 'shoot',
      targetX: Math.round(Number(targetX) || 0),
      targetY: Math.round(Number(targetY) || 0),
      startX: Math.round(Number(startX) || 0),
      startY: Math.round(Number(startY) || 0),
      reason,
      sentAtMs: atMs,
      sentAt: new Date(atMs).toISOString(),
      target,
      cadenceMs: intervalMs
    };
    nextCommandId += 1;
    state.sentCount += 1;
    state.shootSentCount += 1;
    state.lastShootCommand = command;
    return { ok: true, skipped: false, command: summarizeCommand(command), cadenceMs: intervalMs };
  }

  function stop(reason = 'stop') {
    return sendVelocity(0, 0, reason);
  }

  function applyDecision(stateSnapshot, decision) {
    if (combatSummaryFromDecision(decision)) {
      return applyCombatDecision(stateSnapshot, decision);
    }
    const safetyMotion = safetyMotionFromDecision(decision);
    if (safetyMotion) {
      return applySafetyMotionDecision(safetyMotion);
    }
    const postAttackWait = postAttackWaitFromDecision(decision);
    if (postAttackWait) {
      return applyPostAttackWaitDecision(stateSnapshot, postAttackWait);
    }
    const patrolMotion = patrolMotionFromDecision(decision);
    if (patrolMotion) {
      return applyPatrolMotionDecision(patrolMotion);
    }
    const controlAction = controlActionFromDecision(decision);
    if (controlAction) {
      return applyControlDecision(controlAction);
    }
    const self = stateSnapshot?.realtime?.self || decision?.input?.self || null;
    const profitAction = profitActionFromDecision(decision);
    if (!profitAction) {
      const diagnostics = unsupportedActionDiagnostics(decision);
      const stopped = stop('unsupported-action');
      return {
        ok: stopped.ok,
        kind: 'unsupported-action',
        reason: 'unsupported-action',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        unsupportedAction: diagnostics
      };
    }
    if (profitAction.type === 'enemy') {
      return applyProfitEnemyDecision(self, profitAction.target, decision);
    }
    const target = profitAction.target;
    const vector = coinMotionVectorToTarget(self, target, options, state, now());
    if (!vector.ok) {
      const stopped = stop(vector.reason);
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: vector.reason,
        vector,
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped)
      };
    }
    const sent = sendVelocity(vector.dx, vector.dy, vector.reason, target);
    const precisionPulseMs = schedulePrecisionPulseStop(sent, vector.precisionPulseMs, profitAction.kind);
    return {
      ok: sent.ok,
      kind: 'velocity',
      reason: vector.reason,
      vector,
      command: sent.command || null,
      skipped: Boolean(sent.skipped),
      precisionPulseMs
    };
  }

  function applyPostAttackWaitDecision(stateSnapshot, action) {
    const self = stateSnapshot?.realtime?.self || null;
    const target = action.target || null;
    const vector = movementVectorToTarget(self, target, options);
    if (!vector.ok) {
      const stopped = stop(vector.reason || 'post-attack-drop-wait-stop');
      return {
        ok: stopped.ok,
        kind: 'post-attack-drop-wait',
        reason: vector.reason || action.reason || 'post-attack-drop-wait-position',
        vector,
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        target
      };
    }
    const sent = sendVelocity(vector.dx, vector.dy, action.reason || 'post-attack-drop-wait-position', target);
    return {
      ok: sent.ok,
      kind: 'post-attack-drop-wait',
      reason: action.reason || 'post-attack-drop-wait-position',
      vector,
      command: sent.command || null,
      skipped: Boolean(sent.skipped),
      target
    };
  }

  function applyControlDecision(controlAction) {
    const stopReason = controlAction.type === 'leave'
      ? 'leave-decision-safety-controller'
      : controlAction.reason;
    const stopped = stop(stopReason);
    return {
      ok: stopped.ok,
      kind: controlAction.kind,
      reason: controlAction.reason,
      command: stopped.command || null,
      skipped: Boolean(stopped.skipped),
      handledBy: controlAction.type === 'leave' ? 'safety-controller' : 'action-adapter-stop',
      shouldLeave: controlAction.type === 'leave',
      target: controlAction.action?.target || null
    };
  }

  function applyPatrolMotionDecision(action) {
    const sent = sendVelocity(
      roundVelocity(action.dx),
      roundVelocity(action.dy),
      action.reason || 'patrol',
      action.target || null
    );
    return {
      ok: sent.ok,
      kind: action.kind || 'patrol',
      reason: action.reason || 'patrol',
      command: sent.command || null,
      skipped: Boolean(sent.skipped),
      target: action.target || null,
      staleCoinEscape: action.staleCoinEscape || null,
      ignoredCoin: action.ignoredCoin || null
    };
  }

  function applySafetyMotionDecision(action) {
    const sent = sendVelocity(
      roundVelocity(action.dx),
      roundVelocity(action.dy),
      action.reason || action.kind || 'safety-motion',
      action.target || action.threats?.[0] || null
    );
    return {
      ok: sent.ok,
      kind: action.kind || 'safety-motion',
      reason: action.reason || action.kind || 'safety-motion',
      command: sent.command || null,
      skipped: Boolean(sent.skipped),
      locked: Boolean(action.locked),
      target: action.target || null,
      threats: action.threats || [],
      blockedAction: action.blockedAction || null
    };
  }

  function applyProfitEnemyDecision(self, target, decision) {
    if (target?.active) {
      const stopped = stop('profit-active-target-blocked');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'profit-active-target-blocked',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        target
      };
    }
    const vector = movementVectorToTarget(self, target, options);
    const distance = Number.isFinite(Number(vector.distance))
      ? Number(vector.distance)
      : Math.hypot(Number(target?.x) - Number(self?.x), Number(target?.y) - Number(self?.y));
    const attackRange = Math.max(0, Number(options.attackRangeCm ?? options.attackRange ?? DEFAULT_ATTACK_RANGE_CM));
    if (!(Number.isFinite(distance) && distance <= attackRange)) {
      if (!vector.ok) {
        const stopped = stop(vector.reason || 'profit-afk-missing-position');
        return {
          ok: stopped.ok,
          kind: 'stop',
          reason: vector.reason || 'profit-afk-missing-position',
          vector,
          command: stopped.command || null,
          skipped: Boolean(stopped.skipped),
          target
        };
      }
      const sent = sendVelocity(vector.dx, vector.dy, 'profit-afk-seek', target);
      return {
        ok: sent.ok,
        kind: 'velocity',
        reason: 'profit-afk-seek',
        vector,
        command: sent.command || null,
        skipped: Boolean(sent.skipped),
        target
      };
    }

    const hold = sendVelocity(0, 0, 'profit-afk-attack-hold', target);
    const startX = numberOrNull(self?.x);
    const startY = numberOrNull(self?.y);
    const targetX = numberOrNull(target?.x);
    const targetY = numberOrNull(target?.y);
    let shoot = { ok: false, skipped: true, reason: 'missing-shoot-coordinates' };
    if (startX !== null && startY !== null && targetX !== null && targetY !== null) {
      shoot = sendShoot(
        targetX,
        targetY,
        startX,
        startY,
        decision?.action?.reason || decision?.reason || 'profit-afk-attack',
        target
      );
    } else {
      state.skippedCount += 1;
    }
    return {
      ok: Boolean(hold.ok && shoot.ok),
      kind: 'profit-attack',
      reason: 'profit-afk-attack',
      movement: {
        ok: hold.ok,
        skipped: Boolean(hold.skipped),
        reason: hold.reason || 'profit-afk-attack-hold',
        command: hold.command || null
      },
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null
      },
      target
    };
  }

  function applyCombatDecision(stateSnapshot, decision) {
    const combat = combatSummaryFromDecision(decision);
    const self = stateSnapshot?.realtime?.self || combat?.self || null;
    if (!combat?.target) {
      const stopped = stop('combat-live-no-target');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'combat-live-no-target',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped)
      };
    }
    const movement = combat.movement || {};
    const velocity = sendVelocity(
      roundVelocity(movement.dx),
      roundVelocity(movement.dy),
      movement.reason || 'combat-live-movement',
      combat.target
    );
    const shooting = combat.shooting || {};
    let shoot = {
      ok: true,
      skipped: true,
      reason: shooting.commandSuppressed ? (shooting.reason || 'shoot-command-suppressed') : 'shoot-not-requested'
    };
    if (shooting.wouldShoot && !shooting.commandSuppressed) {
      const aim = combat.aim || {};
      const startX = numberOrNull(self?.x ?? combat.self?.x);
      const startY = numberOrNull(self?.y ?? combat.self?.y);
      const targetX = numberOrNull(aim.x);
      const targetY = numberOrNull(aim.y);
      if (startX === null || startY === null || targetX === null || targetY === null) {
        state.skippedCount += 1;
        shoot = { ok: false, skipped: true, reason: 'missing-shoot-coordinates' };
      } else {
        shoot = sendShoot(
          targetX,
          targetY,
          startX,
          startY,
          shooting.reason || 'combat-live-shoot',
          combat.target,
          shooting.effectiveCadenceMs || shooting.cadenceMs
        );
      }
    }
    return {
      ok: Boolean(velocity.ok && shoot.ok),
      kind: 'combat-live',
      reason: decision?.action?.reason || decision?.reason || 'combat-live',
      movement: {
        ok: velocity.ok,
        skipped: Boolean(velocity.skipped),
        reason: movement.reason || velocity.reason,
        command: velocity.command || null
      },
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null
      },
      target: combat.target
    };
  }

  function observeState(stateSnapshot) {
    const ack = stateSnapshot?.command?.lastAck || null;
    if (ack && (!state.lastShootAck || Number(ack.receivedAtMs || 0) !== Number(state.lastShootAck.receivedAtMs || 0) || ack.bullet_id !== state.lastShootAck.bullet_id)) {
      state.lastShootAck = ack;
    }
    const command = state.lastCommand;
    if (!command) return null;
    const tick = numberOrNull(stateSnapshot?.realtime?.tick);
    if (tick === null) return state.lastSettlement;
    if (command.settleAfterTick === null) command.settleAfterTick = tick;
    if (tick >= command.settleAfterTick) command.observedFrames += 1;
    if (command.observedFrames >= settlementFrames) {
      state.lastSettlement = {
        ok: true,
        commandId: command.id,
        reason: 'frames-observed',
        observedFrames: command.observedFrames,
        tick
      };
    } else {
      state.lastSettlement = {
        ok: false,
        commandId: command.id,
        reason: 'waiting-for-frames',
        observedFrames: command.observedFrames,
        tick
      };
    }
    return state.lastSettlement;
  }

  function getState() {
    return {
      sentCount: state.sentCount,
      velocitySentCount: state.velocitySentCount,
      shootSentCount: state.shootSentCount,
      stopCount: state.stopCount,
      skippedCount: state.skippedCount,
      velocityRepeatSentCount: state.velocityRepeatSentCount,
      velocityRepeatUntilMs: state.velocityRepeatUntilMs,
      velocityStopRepeatsLeft: state.velocityStopRepeatsLeft,
      lastVelocityRepeatError: state.lastVelocityRepeatError,
      lastCommand: summarizeCommand(state.lastCommand),
      lastShootCommand: summarizeCommand(state.lastShootCommand),
      lastShootAck: state.lastShootAck,
      lastSettlement: state.lastSettlement
    };
  }

  return {
    applyDecision,
    applyCombatDecision,
    getState,
    observeState,
    stop
  };
}

module.exports = {
  DEFAULT_COMMAND_INTERVAL_MS,
  DEFAULT_COIN_TARGET_DEAD_ZONE_CM,
  DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS,
  DEFAULT_SETTLEMENT_FRAMES,
  DEFAULT_TARGET_DEAD_ZONE_CM,
  combatSummaryFromDecision,
  createBrowserlessActionAdapter,
  coinMotionCoreOptions,
  coinMotionVectorToTarget,
  controlActionFromDecision,
  profitActionFromDecision,
  safetyMotionFromDecision,
  unsupportedActionDiagnostics,
  movementVectorToTarget
};
