'use strict';

const DEFAULT_TARGET_DEAD_ZONE_CM = 900;
const DEFAULT_COIN_TARGET_DEAD_ZONE_CM = 150;
const DEFAULT_COMMAND_INTERVAL_MS = 500;
const DEFAULT_SETTLEMENT_FRAMES = 2;
const DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS = 160;
const DEFAULT_ATTACK_RANGE_CM = 14500;

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

function createInitialActionState() {
  return {
    sentCount: 0,
    velocitySentCount: 0,
    shootSentCount: 0,
    stopCount: 0,
    skippedCount: 0,
    lastCommand: null,
    lastShootCommand: null,
    lastShootAck: null,
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
  const settlementFrames = Math.max(1, Number(options.settlementFrames ?? DEFAULT_SETTLEMENT_FRAMES));
  const combatShootMinIntervalMs = Math.max(1, Number(options.combatShootMinIntervalMs ?? DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS));
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
    return { ok: true, skipped: false, command: summarizeCommand(command) };
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
    const self = stateSnapshot?.realtime?.self || decision?.input?.self || null;
    const profitAction = profitActionFromDecision(decision);
    if (!profitAction) {
      const stopped = stop('unsupported-or-wait-decision');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'unsupported-or-wait-decision',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped)
      };
    }
    if (profitAction.type === 'enemy') {
      return applyProfitEnemyDecision(self, profitAction.target, decision);
    }
    const target = profitAction.target;
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
  profitActionFromDecision,
  movementVectorToTarget
};
