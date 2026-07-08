'use strict';

const DEFAULT_TARGET_DEAD_ZONE_CM = 900;
const DEFAULT_COMMAND_INTERVAL_MS = 500;
const DEFAULT_SETTLEMENT_FRAMES = 2;

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
  const deadZone = Math.max(0, Number(options.targetDeadZoneCm ?? DEFAULT_TARGET_DEAD_ZONE_CM));
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

function movementTargetFromDecision(decision) {
  const action = decision?.action || decision || {};
  const target = action.target || null;
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (band !== 'profit') return null;
  if (kind !== 'coin' && kind !== 'seek-coin' && kind !== 'profit-candidate') return null;
  if (!target || target.type !== 'coin') return null;
  return target;
}

function createInitialActionState() {
  return {
    sentCount: 0,
    stopCount: 0,
    skippedCount: 0,
    lastCommand: null,
    lastSettlement: null
  };
}

function summarizeCommand(command) {
  if (!command) return null;
  return {
    id: command.id,
    type: command.type,
    dx: command.dx,
    dy: command.dy,
    reason: command.reason,
    sentAt: command.sentAt,
    target: command.target || null
  };
}

function createBrowserlessActionAdapter(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const transport = options.transport || null;
  const commandIntervalMs = Math.max(0, Number(options.commandIntervalMs ?? DEFAULT_COMMAND_INTERVAL_MS));
  const settlementFrames = Math.max(1, Number(options.settlementFrames ?? DEFAULT_SETTLEMENT_FRAMES));
  const state = createInitialActionState();
  let nextCommandId = 1;

  function sendVelocity(dx, dy, reason, target = null) {
    const atMs = now();
    if (!transport || typeof transport.sendVelocity !== 'function') {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: 'missing-transport' };
    }
    const last = state.lastCommand;
    const changed = !last || Number(last.dx) !== Number(dx) || Number(last.dy) !== Number(dy);
    if (!changed && atMs - Number(last.sentAtMs || 0) < commandIntervalMs) {
      state.skippedCount += 1;
      return { ok: true, skipped: true, reason: 'unchanged-command-throttled', command: summarizeCommand(last) };
    }
    transport.sendVelocity(dx, dy);
    const command = {
      id: nextCommandId,
      type: 'velocity',
      dx: roundVelocity(dx),
      dy: roundVelocity(dy),
      reason,
      sentAtMs: atMs,
      sentAt: new Date(atMs).toISOString(),
      target,
      settleAfterTick: null,
      observedFrames: 0
    };
    nextCommandId += 1;
    state.sentCount += 1;
    if (Number(command.dx) === 0 && Number(command.dy) === 0) state.stopCount += 1;
    state.lastCommand = command;
    state.lastSettlement = {
      ok: false,
      commandId: command.id,
      reason: 'pending',
      observedFrames: 0,
      tick: null
    };
    return { ok: true, skipped: false, command: summarizeCommand(command) };
  }

  function stop(reason = 'stop') {
    return sendVelocity(0, 0, reason);
  }

  function applyDecision(stateSnapshot, decision) {
    const self = stateSnapshot?.realtime?.self || decision?.input?.self || null;
    const target = movementTargetFromDecision(decision);
    if (!target) {
      const stopped = stop('unsupported-or-wait-decision');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'unsupported-or-wait-decision',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped)
      };
    }
    const vector = movementVectorToTarget(self, target, options);
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
    return {
      ok: sent.ok,
      kind: 'velocity',
      reason: vector.reason,
      vector,
      command: sent.command || null,
      skipped: Boolean(sent.skipped)
    };
  }

  function observeState(stateSnapshot) {
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
      stopCount: state.stopCount,
      skippedCount: state.skippedCount,
      lastCommand: summarizeCommand(state.lastCommand),
      lastSettlement: state.lastSettlement
    };
  }

  return {
    applyDecision,
    getState,
    observeState,
    stop
  };
}

module.exports = {
  DEFAULT_COMMAND_INTERVAL_MS,
  DEFAULT_SETTLEMENT_FRAMES,
  DEFAULT_TARGET_DEAD_ZONE_CM,
  createBrowserlessActionAdapter,
  movementTargetFromDecision,
  movementVectorToTarget
};
