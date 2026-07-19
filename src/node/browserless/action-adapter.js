'use strict';

const { buildRuntimeDefaults } = require('../../shared/runtime-defaults');
const {
  coinDirectionToCore,
  coinMotionMetaCore,
  targetLaneAlignmentDirectionCore
} = require('../../strategy/coin-motion');

const BROWSER_RUNTIME_DEFAULTS = buildRuntimeDefaults({}, false);
const DEFAULT_TARGET_DEAD_ZONE_CM = 900;
const DEFAULT_COIN_TARGET_DEAD_ZONE_CM = 150;
const DEFAULT_COMMAND_INTERVAL_MS = 500;
const DEFAULT_SETTLEMENT_FRAMES = 2;
const DEFAULT_MOVEMENT_SETTLEMENT_STALL_MS = 5000;
const DEFAULT_MOVEMENT_SETTLEMENT_MIN_DISTANCE_CM = 80;
const DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS = 160;
const DEFAULT_ATTACK_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.attackRange;
const DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM = 10000;
const DEFAULT_AFK_ATTACK_FULL_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.afkAttackFullRangeCm;

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
    coinAlignNearAxisFirst: options.coinAlignNearAxisFirst !== false,
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
  const laneDirection = targetLaneAlignmentDirectionCore(rawDx, rawDy, distance, {
    tolerance: optionNumber(options, 'axisAlignmentToleranceCm', BROWSER_RUNTIME_DEFAULTS.coinPrecisionTolerance),
    axisAlignmentMinDistance: optionNumber(options, 'axisAlignmentMinDistanceCm', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachMinDistance),
    axisAlignmentLaneTolerance: optionNumber(options, 'axisAlignmentLaneToleranceCm', BROWSER_RUNTIME_DEFAULTS.coinAxisApproachLaneTolerance)
  });
  if (laneDirection) {
    return {
      ok: true,
      reason: laneDirection.laneAlignment
        ? 'align-target-' + laneDirection.laneAlignment + '-axis'
        : 'follow-target-' + laneDirection.laneAligned + '-axis',
      dx: laneDirection.dx,
      dy: laneDirection.dy,
      distance: Math.round(distance),
      routeMode: laneDirection.laneAlignment
        ? 'lane-align-' + laneDirection.laneAlignment
        : 'lane-follow-' + laneDirection.laneAligned
    };
  }
  return {
    ok: true,
    reason: 'move-to-target',
    dx: roundVelocity(rawDx / distance),
    dy: roundVelocity(rawDy / distance),
    distance: Math.round(distance)
  };
}

function afkAttackCommitRangeCm(options = {}) {
  const value = Number(options.afkAttackCommitRangeCm
    ?? options.afkAttackCommitRange
    ?? options.browserlessAfkAttackCommitRangeCm
    ?? DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM;
}

function afkAttackFullRangeCm(options = {}) {
  const value = Number(options.afkAttackFullRangeCm
    ?? options.afkAttackFullRange
    ?? options.browserlessAfkAttackFullRangeCm
    ?? DEFAULT_AFK_ATTACK_FULL_RANGE_CM);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_AFK_ATTACK_FULL_RANGE_CM;
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
  const combat = decision?.combat || null;
  if (!combat) return null;
  if (band === 'combat' && kind === 'combat-live') return combat;
  if (
    band === 'safety'
    && (kind === 'leave' || kind === 'safety-exit' || action.shouldLeave === true)
    && combat.target
    && combat.movement
  ) {
    return combat;
  }
  return null;
}

function safetyMotionFromDecision(decision) {
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  if (band !== 'safety') return null;
  if (kind !== 'flee' && kind !== 'return-block-scan' && kind !== 'leave-pending-cover') return null;
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

function opportunisticShotFromDecision(decision) {
  const action = decision?.action || decision || {};
  if (action.kind === 'opportunistic-shot' && action.opportunisticShot) return action.opportunisticShot;
  return action.opportunisticShot || null;
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
    shootAcceptedCount: 0,
    shootUnackedCount: 0,
    pendingShootCommands: [],
    latestObservedTick: null,
    shootAckTimeoutMs: 3000,
    stopCount: 0,
    skippedCount: 0,
    velocityRepeatSentCount: 0,
    shootRepeatSentCount: 0,
    lastCommand: null,
    lastShootCommand: null,
    lastShootAck: null,
    lastSettlement: null,
    latestSelfSample: null,
    movementStall: {
      active: false,
      stalled: false,
      reason: 'idle',
      startedAtMs: 0,
      lastProgressAtMs: 0,
      stalledAtMs: 0,
      observedFrames: 0,
      progressCount: 0,
      commandId: null,
      dx: 0,
      dy: 0,
      actionReason: '',
      origin: null,
      latest: null,
      movedCm: 0,
      noProgressMs: 0,
      stallMs: DEFAULT_MOVEMENT_SETTLEMENT_STALL_MS,
      minDistanceCm: DEFAULT_MOVEMENT_SETTLEMENT_MIN_DISTANCE_CM
    },
    lastMovementStall: null,
    coinApproachLock: null,
    coinFeedbackGate: null,
    coinFeedbackWaitCount: 0,
    coinFeedbackAckCount: 0,
    coinFeedbackTimeoutCount: 0,
    velocityPulseToken: 0,
    velocityStopTimer: null,
    velocityRepeatToken: 0,
    velocityRepeatUntilMs: 0,
    velocityStopRepeatsLeft: 0,
    velocityRepeatTimer: null,
    shootRepeatToken: 0,
    shootRepeatUntilMs: 0,
    shootRepeatTimer: null,
    shootRepeatTargetKey: '',
    shootRepeat: null,
    lastVelocityRepeatError: '',
    lastShootRepeatError: '',
    transportSealed: false,
    transportSealReason: ''
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
  const onVelocityRequest = typeof options.onVelocityRequest === 'function' ? options.onVelocityRequest : null;
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
  const movementSettlementStallMs = Math.max(1000, Number(
    options.movementSettlementStallMs ?? DEFAULT_MOVEMENT_SETTLEMENT_STALL_MS
  ));
  const movementSettlementMinDistanceCm = Math.max(1, Number(
    options.movementSettlementMinDistanceCm ?? DEFAULT_MOVEMENT_SETTLEMENT_MIN_DISTANCE_CM
  ));
  const combatShootMinIntervalMs = Math.max(1, Number(options.combatShootMinIntervalMs ?? DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS));
  const maxPendingShootCommands = Math.max(1, Math.round(Number(options.maxPendingShootCommands ?? 3)));
  const initialShootAckTimeoutMs = Math.max(500, Number(options.shootAckTimeoutMs ?? 3000));
  const onShootRequest = typeof options.onShootRequest === 'function' ? options.onShootRequest : null;
  const shootRepeatEnabled = options.shootRepeatEnabled === true;
  const shootRepeatMs = Math.max(
    combatShootMinIntervalMs,
    Number(options.shootRepeatMs ?? options.opportunisticShootEveryMs ?? options.combatShootMinIntervalMs ?? combatShootMinIntervalMs) || 0
  );
  const configuredShootRepeatHoldMs = Math.max(0, Number(options.shootRepeatHoldMs ?? options.opportunisticShootRepeatHoldMs ?? 0) || 0);
  const shootRepeatHoldMs = Math.max(
    shootRepeatMs,
    configuredShootRepeatHoldMs,
    decisionIntervalMs + shootRepeatMs
  );
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

  function movementSelfSample(stateSnapshot) {
    const self = stateSnapshot?.realtime?.self || null;
    const x = numberOrNull(self?.x);
    const y = numberOrNull(self?.y);
    if (x === null || y === null) return null;
    return {
      x,
      y,
      tick: numberOrNull(stateSnapshot?.realtime?.tick),
      atMs: numberOrNull(stateSnapshot?.realtime?.receivedAtMs) ?? now()
    };
  }

  function movementStallSummary(value = state.movementStall) {
    if (!value) return null;
    return {
      active: Boolean(value.active),
      stalled: Boolean(value.stalled),
      reason: String(value.reason || ''),
      startedAtMs: Number(value.startedAtMs || 0),
      lastProgressAtMs: Number(value.lastProgressAtMs || 0),
      stalledAtMs: Number(value.stalledAtMs || 0),
      observedFrames: Math.max(0, Number(value.observedFrames || 0)),
      progressCount: Math.max(0, Number(value.progressCount || 0)),
      commandId: value.commandId ?? null,
      dx: Number(value.dx || 0),
      dy: Number(value.dy || 0),
      actionReason: String(value.actionReason || ''),
      origin: value.origin ? { ...value.origin } : null,
      latest: value.latest ? { ...value.latest } : null,
      movedCm: Math.max(0, Math.round(Number(value.movedCm || 0))),
      noProgressMs: Math.max(0, Math.round(Number(value.noProgressMs || 0))),
      stallMs: movementSettlementStallMs,
      minDistanceCm: movementSettlementMinDistanceCm
    };
  }

  function resetMovementStall(reason = 'idle') {
    state.movementStall = {
      active: false,
      stalled: false,
      reason,
      startedAtMs: 0,
      lastProgressAtMs: 0,
      stalledAtMs: 0,
      observedFrames: 0,
      progressCount: 0,
      commandId: null,
      dx: 0,
      dy: 0,
      actionReason: '',
      origin: null,
      latest: state.latestSelfSample ? { ...state.latestSelfSample } : null,
      movedCm: 0,
      noProgressMs: 0,
      stallMs: movementSettlementStallMs,
      minDistanceCm: movementSettlementMinDistanceCm
    };
    return movementStallSummary();
  }

  function updateMovementStallIntent(command) {
    const moving = Boolean(Number(command?.dx || 0) || Number(command?.dy || 0));
    if (!moving) return resetMovementStall('stop-command');
    const atMs = Number(command.sentAtMs || now());
    if (!state.movementStall?.active) {
      const origin = state.latestSelfSample ? { ...state.latestSelfSample } : null;
      state.movementStall = {
        active: true,
        stalled: false,
        reason: origin ? 'tracking' : 'waiting-for-self',
        startedAtMs: atMs,
        lastProgressAtMs: atMs,
        stalledAtMs: 0,
        observedFrames: 0,
        progressCount: 0,
        commandId: command.id ?? null,
        dx: Number(command.dx || 0),
        dy: Number(command.dy || 0),
        actionReason: String(command.reason || ''),
        origin,
        latest: origin,
        movedCm: 0,
        noProgressMs: 0,
        stallMs: movementSettlementStallMs,
        minDistanceCm: movementSettlementMinDistanceCm
      };
    } else {
      Object.assign(state.movementStall, {
        commandId: command.id ?? state.movementStall.commandId,
        dx: Number(command.dx || 0),
        dy: Number(command.dy || 0),
        actionReason: String(command.reason || '')
      });
    }
    return movementStallSummary();
  }

  function observeMovementStall(stateSnapshot) {
    const sample = movementSelfSample(stateSnapshot);
    if (sample) state.latestSelfSample = sample;
    const stall = state.movementStall;
    if (!stall?.active) return movementStallSummary(stall);
    if (!sample) {
      stall.reason = 'waiting-for-self';
      return movementStallSummary(stall);
    }
    if (!stall.origin) {
      stall.origin = { ...sample };
      stall.latest = { ...sample };
      stall.startedAtMs = Number(stall.startedAtMs || sample.atMs);
      stall.lastProgressAtMs = Number(stall.lastProgressAtMs || sample.atMs);
      stall.reason = 'tracking';
      return movementStallSummary(stall);
    }
    const previousSample = stall.latest;
    const frameAdvanced = sample.tick !== null && previousSample?.tick !== null
      ? Number(sample.tick) > Number(previousSample.tick)
      : Number(sample.atMs) > Number(previousSample?.atMs || 0);
    if (frameAdvanced) stall.observedFrames = Math.max(0, Number(stall.observedFrames || 0)) + 1;
    stall.latest = { ...sample };
    const movedCm = Math.hypot(Number(sample.x) - Number(stall.origin.x), Number(sample.y) - Number(stall.origin.y));
    if (movedCm >= movementSettlementMinDistanceCm) {
      stall.stalled = false;
      stall.reason = 'self-progress';
      stall.stalledAtMs = 0;
      stall.origin = { ...sample };
      stall.lastProgressAtMs = sample.atMs;
      stall.progressCount = Math.max(0, Number(stall.progressCount || 0)) + 1;
      stall.movedCm = movedCm;
      stall.noProgressMs = 0;
      stall.observedFrames = 0;
      return movementStallSummary(stall);
    }
    const noProgressMs = Math.max(0, Number(sample.atMs) - Number(stall.lastProgressAtMs || stall.startedAtMs || sample.atMs));
    const stalled = noProgressMs >= movementSettlementStallMs
      && Number(stall.observedFrames || 0) >= settlementFrames;
    stall.stalled = stalled;
    stall.reason = stalled ? 'action-settlement-stalled' : 'tracking';
    stall.stalledAtMs = stalled ? Number(stall.stalledAtMs || sample.atMs) : 0;
    stall.movedCm = movedCm;
    stall.noProgressMs = noProgressMs;
    if (stalled) state.lastMovementStall = movementStallSummary(stall);
    return movementStallSummary(stall);
  }

  function clearVelocityRepeatTimer() {
    if (!state.velocityRepeatTimer) return;
    clearTimeoutFn(state.velocityRepeatTimer);
    state.velocityRepeatTimer = null;
  }

  function clearShootRepeatTimer() {
    if (!state.shootRepeatTimer) return;
    clearTimeoutFn(state.shootRepeatTimer);
    state.shootRepeatTimer = null;
  }

  function cancelVelocityRepeat() {
    state.velocityRepeatToken += 1;
    state.velocityRepeatUntilMs = 0;
    state.velocityStopRepeatsLeft = 0;
    clearVelocityRepeatTimer();
  }

  function coinTargetKey(target) {
    const id = target?.drop_id ?? target?.dropId ?? target?.id;
    if (id !== null && id !== undefined && id !== '') return String(id);
    const x = numberOrNull(target?.x);
    const y = numberOrNull(target?.y);
    return x === null || y === null ? '' : x + ':' + y;
  }

  function clearCoinFeedbackGate() {
    state.coinFeedbackGate = null;
  }

  function coinFeedbackPending(self, target, atMs = now()) {
    const gate = state.coinFeedbackGate;
    if (!gate || gate.targetKey !== coinTargetKey(target)) return false;
    const x = numberOrNull(self?.x);
    const y = numberOrNull(self?.y);
    const changed = x !== null && y !== null
      && Math.hypot(x - gate.startX, y - gate.startY) >= gate.minPositionDeltaCm;
    if (changed) {
      state.coinFeedbackAckCount += 1;
      clearCoinFeedbackGate();
      return false;
    }
    if (atMs >= gate.expiresAtMs) {
      state.coinFeedbackTimeoutCount += 1;
      clearCoinFeedbackGate();
      return false;
    }
    state.coinFeedbackWaitCount += 1;
    return true;
  }

  function cancelShootRepeat(reason = '', options = {}) {
    state.shootRepeatToken += 1;
    state.shootRepeatUntilMs = 0;
    state.shootRepeatTargetKey = '';
    state.shootRepeat = null;
    if (reason && options.error) state.lastShootRepeatError = reason;
    clearShootRepeatTimer();
  }

  function scheduleVelocityRepeat(dx, dy, ownerCommand) {
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
        if (onVelocityRequest) {
          try {
            onVelocityRequest({
              commandId: ownerCommand?.id ?? null,
              repeatOwnerCommandId: ownerCommand?.id ?? null,
              dx,
              dy,
              reason: ownerCommand?.reason || 'velocity-repeat',
              requestedAtMs: now(),
              observedTick: state.latestObservedTick,
              repeat: true
            });
          } catch (_) {}
        }
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

  function targetRepeatKey(target) {
    const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
    return id === null || id === undefined || id === '' ? '' : String(id);
  }

  function entityActiveLike(entity) {
    const mode = String(entity?.current_join_mode || entity?.mode || entity?.joined || '').toLowerCase();
    return Boolean(entity?.active === true || entity?.firing || entity?.shooting || entity?.is_firing || mode === 'active');
  }

  function findRealtimeEntity(stateSnapshot, key) {
    if (!key) return null;
    const entities = stateSnapshot?.realtime?.entities;
    if (!Array.isArray(entities)) return null;
    return entities.find(entity => targetRepeatKey(entity) === key) || null;
  }

  function validateShootRepeatState(stateSnapshot) {
    const repeat = state.shootRepeat;
    if (!repeat) return true;
    const realtime = stateSnapshot?.realtime || {};
    if (!realtime.self) {
      cancelShootRepeat('shoot-repeat-no-self', { error: true });
      return false;
    }
    if (repeat.targetKey && Array.isArray(realtime.entities)) {
      const entity = findRealtimeEntity(stateSnapshot, repeat.targetKey);
      if (!entity) {
        cancelShootRepeat('shoot-repeat-target-missing', { error: true });
        return false;
      }
      if (entityActiveLike(entity)) {
        cancelShootRepeat('shoot-repeat-target-active', { error: true });
        return false;
      }
    }
    return true;
  }

  function scheduleShootRepeat(self, target, reason, cadenceMs = shootRepeatMs) {
    cancelShootRepeat();
    if (!shootRepeatEnabled) return null;
    if (!transport || typeof transport.sendShoot !== 'function') return null;
    const startX = numberOrNull(self?.x);
    const startY = numberOrNull(self?.y);
    const targetX = numberOrNull(target?.x);
    const targetY = numberOrNull(target?.y);
    if (startX === null || startY === null || targetX === null || targetY === null) return null;
    const targetKey = targetRepeatKey(target);
    const repeatCadenceMs = Math.max(combatShootMinIntervalMs, Number(cadenceMs || 0), shootRepeatMs);
    const repeat = {
      targetX,
      targetY,
      startX,
      startY,
      reason,
      target,
      targetKey,
      cadenceMs: repeatCadenceMs
    };
    const token = state.shootRepeatToken + 1;
    state.shootRepeatToken = token;
    state.shootRepeat = repeat;
    state.shootRepeatTargetKey = targetKey;
    state.shootRepeatUntilMs = now() + shootRepeatHoldMs;
    state.lastShootRepeatError = '';
    const run = () => {
      if (state.shootRepeatToken !== token) return;
      state.shootRepeatTimer = null;
      const current = state.shootRepeat;
      if (!current || now() > Number(state.shootRepeatUntilMs || 0)) return;
      const sent = sendShoot(
        current.targetX,
        current.targetY,
        current.startX,
        current.startY,
        current.reason,
        current.target,
        current.cadenceMs
      );
      if (!sent.ok) {
        cancelShootRepeat(sent.error || sent.reason || 'shoot-repeat-failed', { error: true });
        return;
      }
      if (!sent.skipped) state.shootRepeatSentCount += 1;
      state.shootRepeatTimer = setTimeoutFn(run, current.cadenceMs);
      unrefTimer(state.shootRepeatTimer);
    };
    state.shootRepeatTimer = setTimeoutFn(run, repeatCadenceMs);
    unrefTimer(state.shootRepeatTimer);
    return {
      repeatMs: repeatCadenceMs,
      holdMs: shootRepeatHoldMs,
      targetKey
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

  function sendVelocity(dx, dy, reason, target = null, sendOptions = {}) {
    const atMs = now();
    dx = quantizeVelocity(dx);
    dy = quantizeVelocity(dy);
    if (state.transportSealed) {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: state.transportSealReason || 'transport-sealed' };
    }
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
    try {
      transport.sendVelocity(dx, dy);
    } catch (err) {
      const message = err?.message || String(err);
      cancelVelocityRepeat();
      state.lastVelocityRepeatError = message;
      state.skippedCount += 1;
      return {
        ok: false,
        skipped: false,
        reason: 'send-velocity-failed',
        error: message,
        transportClosed: /websocket is not open|not open|closed/i.test(message)
      };
    }
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
    if (onVelocityRequest) {
      try {
        onVelocityRequest({
          commandId: command.id,
          repeatOwnerCommandId: command.id,
          dx,
          dy,
          reason,
          requestedAtMs: atMs,
          observedTick: state.latestObservedTick,
          repeat: false
        });
      } catch (_) {}
    }
    const repeat = sendOptions.suppressRepeat
      ? (cancelVelocityRepeat(), null)
      : scheduleVelocityRepeat(dx, dy, command);
    updateMovementStallIntent(command);
    return { ok: true, skipped: false, command: summarizeCommand(command), pulseToken, repeat };
  }

  function expirePendingShootCommands(atMs = now()) {
    const retained = [];
    for (const command of state.pendingShootCommands) {
      if (Number(atMs) - Number(command.sentAtMs || 0) > Number(state.shootAckTimeoutMs || initialShootAckTimeoutMs)) state.shootUnackedCount += 1;
      else retained.push(command);
    }
    state.pendingShootCommands = retained;
  }

  function sendShoot(targetX, targetY, startX, startY, reason, target = null, cadenceMs = combatShootMinIntervalMs, shotMeta = {}) {
    const atMs = now();
    expirePendingShootCommands(atMs);
    if (state.transportSealed) {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: state.transportSealReason || 'transport-sealed' };
    }
    if (!transport || typeof transport.sendShoot !== 'function') {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: 'missing-transport' };
    }
    if (state.pendingShootCommands.length >= maxPendingShootCommands) {
      state.skippedCount += 1;
      return {
        ok: true,
        skipped: true,
        reason: 'shoot-unacked-backpressure',
        pendingCount: state.pendingShootCommands.length,
        maxPendingShootCommands
      };
    }
    const last = state.lastShootCommand;
    const intervalMs = Math.max(combatShootMinIntervalMs, Number(cadenceMs || 0));
    if (last && atMs - Number(last.sentAtMs || 0) < intervalMs) {
      state.skippedCount += 1;
      return { ok: true, skipped: true, reason: 'shoot-command-throttled', command: summarizeCommand(last), cadenceMs: intervalMs };
    }
    try {
      transport.sendShoot(targetX, targetY, startX, startY);
    } catch (err) {
      const message = err?.message || String(err);
      state.skippedCount += 1;
      return {
        ok: false,
        skipped: false,
        reason: 'send-shoot-failed',
        error: message,
        transportClosed: /websocket is not open|not open|closed/i.test(message)
      };
    }
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
      cadenceMs: intervalMs,
      observedTick: numberOrNull(shotMeta.observedTick ?? state.latestObservedTick),
      aimMode: String(shotMeta.aimMode || ''),
      hypothesis: String(shotMeta.hypothesis || ''),
      flightTicks: numberOrNull(shotMeta.flightTicks),
      routeContextKey: String(shotMeta.routeContextKey || ''),
      routeCandidate: String(shotMeta.routeCandidate || ''),
      routeProbability: numberOrNull(shotMeta.routeProbability),
      predictedDirectionState: String(shotMeta.predictedDirectionState || ''),
      aimConfidence: numberOrNull(shotMeta.aimConfidence),
      expectedHitProbability: numberOrNull(shotMeta.expectedHitProbability),
      predictedShooterX: numberOrNull(shotMeta.predictedShooterX),
      predictedShooterY: numberOrNull(shotMeta.predictedShooterY),
      predictedTargetAtCreationX: numberOrNull(shotMeta.predictedTargetAtCreationX),
      predictedTargetAtCreationY: numberOrNull(shotMeta.predictedTargetAtCreationY)
    };
    nextCommandId += 1;
    state.sentCount += 1;
    state.shootSentCount += 1;
    state.lastShootCommand = command;
    state.pendingShootCommands.push(command);
    if (onShootRequest) {
      try {
        onShootRequest({
          commandId: command.id,
          requestedAtMs: command.sentAtMs,
          targetId: targetRepeatKey(target),
          targetX: command.targetX,
          targetY: command.targetY,
          startX: command.startX,
          startY: command.startY,
          observedTick: command.observedTick,
          aimMode: command.aimMode,
          hypothesis: command.hypothesis,
          flightTicks: command.flightTicks,
          routeContextKey: command.routeContextKey,
          routeCandidate: command.routeCandidate,
          routeProbability: command.routeProbability,
          predictedDirectionState: command.predictedDirectionState,
          aimConfidence: command.aimConfidence,
          expectedHitProbability: command.expectedHitProbability,
          predictedShooterX: command.predictedShooterX,
          predictedShooterY: command.predictedShooterY,
          predictedTargetAtCreationX: command.predictedTargetAtCreationX,
          predictedTargetAtCreationY: command.predictedTargetAtCreationY
        });
      } catch (_) {}
    }
    return { ok: true, skipped: false, command: summarizeCommand(command), cadenceMs: intervalMs };
  }

  function stop(reason = 'stop') {
    cancelShootRepeat('stop');
    return sendVelocity(0, 0, reason);
  }

  function sealTransport(reason = 'transport-sealed') {
    state.transportSealed = true;
    state.transportSealReason = String(reason || 'transport-sealed');
    clearPrecisionPulseStop();
    cancelVelocityRepeat();
    cancelShootRepeat(state.transportSealReason);
    clearCoinFeedbackGate();
    return {
      sealed: true,
      reason: state.transportSealReason,
      lastCommand: summarizeCommand(state.lastCommand),
      lastShootCommand: summarizeCommand(state.lastShootCommand)
    };
  }

  function transportFailure(...results) {
    const transportClosed = results.some(result => Boolean(result?.transportClosed));
    const failed = results.find(result => result?.error);
    return transportClosed || failed
      ? { transportClosed, error: failed?.error || '' }
      : {};
  }

  function applyDecision(stateSnapshot, decision) {
    cancelShootRepeat('new-decision');
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
    const standaloneShot = (decision?.action || decision || {}).kind === 'opportunistic-shot'
      ? opportunisticShotFromDecision(decision)
      : null;
    if (standaloneShot) {
      return applyOpportunisticShotDecision(stateSnapshot, standaloneShot, decision);
    }
    const controlAction = controlActionFromDecision(decision);
    if (controlAction) {
      return applyControlDecision(controlAction);
    }
    const self = stateSnapshot?.realtime?.self || decision?.input?.self || null;
    const profitAction = profitActionFromDecision(decision);
    if (!profitAction) {
      clearCoinFeedbackGate();
      const diagnostics = unsupportedActionDiagnostics(decision);
      const stopped = stop('unsupported-action');
      return {
        ok: stopped.ok,
        kind: 'unsupported-action',
        reason: 'unsupported-action',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        ...transportFailure(stopped),
        unsupportedAction: diagnostics
      };
    }
    if (profitAction.type === 'enemy') {
      clearCoinFeedbackGate();
      return applyProfitEnemyDecision(self, profitAction.target, decision);
    }
    const target = profitAction.target;
    if (coinFeedbackPending(self, target)) {
      return {
        ok: true,
        kind: 'feedback-wait',
        reason: 'coin-position-feedback-wait',
        skipped: true,
        target,
        feedbackGate: { ...state.coinFeedbackGate }
      };
    }
    const vector = coinMotionVectorToTarget(self, target, options, state, now());
    if (!vector.ok) {
      const stopped = stop(vector.reason);
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: vector.reason,
        vector,
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        ...transportFailure(stopped)
      };
    }
    const feedbackGuided = Number(vector.distance) <= optionNumber(
      options,
      'coinFeedbackGuidedDistanceCm',
      BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance
    );
    const sent = sendVelocity(vector.dx, vector.dy, vector.reason, target, { suppressRepeat: feedbackGuided });
    if (feedbackGuided && sent.ok && !sent.skipped && sent.command) {
      const startX = numberOrNull(self?.x);
      const startY = numberOrNull(self?.y);
      if (startX !== null && startY !== null) {
        const feedbackTimeoutMs = Math.max(250, optionNumber(
          options,
          'coinFeedbackTimeoutMs',
          Math.max(1500, decisionIntervalMs * 2)
        ));
        state.coinFeedbackGate = {
          targetKey: coinTargetKey(target),
          commandId: sent.command.id,
          startX,
          startY,
          startTick: numberOrNull(stateSnapshot?.realtime?.tick),
          sentAtMs: now(),
          expiresAtMs: now() + feedbackTimeoutMs,
          minPositionDeltaCm: Math.max(1, optionNumber(options, 'coinFeedbackMinPositionDeltaCm', 1))
        };
      }
    }
    const opportunisticShot = opportunisticShotFromDecision(decision);
    const shoot = opportunisticShot
      ? sendOpportunisticShot(self, opportunisticShot, decision)
      : { ok: true, skipped: true, reason: 'no-opportunistic-shot' };
    const precisionPulseMs = schedulePrecisionPulseStop(sent, vector.precisionPulseMs, profitAction.kind);
    return {
      ok: Boolean(sent.ok && shoot.ok),
      kind: 'velocity',
      reason: vector.reason,
      vector,
      command: sent.command || null,
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null
      },
      opportunisticShot: opportunisticShot || null,
      target: opportunisticShot || target,
      skipped: Boolean(sent.skipped),
      precisionPulseMs,
      feedbackGuided,
      ...transportFailure(sent, shoot)
    };
  }

  function sendOpportunisticShot(self, target, decision) {
    const startX = numberOrNull(self?.x);
    const startY = numberOrNull(self?.y);
    const targetX = numberOrNull(target?.x);
    const targetY = numberOrNull(target?.y);
    if (startX === null || startY === null || targetX === null || targetY === null) {
      state.skippedCount += 1;
      return { ok: false, skipped: true, reason: 'missing-shoot-coordinates' };
    }
    return sendShoot(
      targetX,
      targetY,
      startX,
      startY,
      target?.reason || decision?.action?.reason || decision?.reason || 'opportunistic-afk-drop-shot',
      target,
      options.opportunisticShootEveryMs || options.combatShootMinIntervalMs
    );
  }

  function canScheduleShootRepeat(shoot) {
    return Boolean(shoot?.ok && shoot.command && (!shoot.skipped || shoot.reason === 'shoot-command-throttled'));
  }

  function applyOpportunisticShotDecision(stateSnapshot, target, decision) {
    const self = stateSnapshot?.realtime?.self || decision?.input?.self || null;
    const stopped = stop('opportunistic-shot-hold');
    const shoot = sendOpportunisticShot(self, target, decision);
    const repeat = canScheduleShootRepeat(shoot)
      ? scheduleShootRepeat(self, target, target?.reason || decision?.reason || 'opportunistic-afk-drop-shot', shoot.cadenceMs)
      : null;
    return {
      ok: Boolean(stopped.ok && shoot.ok),
      kind: 'opportunistic-shot',
      reason: target?.reason || decision?.reason || 'opportunistic-afk-drop-shot',
      movement: {
        ok: stopped.ok,
        skipped: Boolean(stopped.skipped),
        reason: stopped.reason || 'opportunistic-shot-hold',
        command: stopped.command || null,
        ...transportFailure(stopped)
      },
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null,
        repeat,
        ...transportFailure(shoot)
      },
      target,
      opportunisticShot: target,
      ...transportFailure(stopped, shoot)
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
        ...transportFailure(stopped),
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
      ...transportFailure(sent),
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
      ...transportFailure(stopped),
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
      ignoredCoin: action.ignoredCoin || null,
      ...transportFailure(sent)
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
      blockedAction: action.blockedAction || null,
      ...transportFailure(sent)
    };
  }

  function applyProfitEnemyDecision(self, target, decision) {
    if (target?.active && target?.easyKillProfitTarget) {
      const vector = movementVectorToTarget(self, target, options);
      const distance = Number.isFinite(Number(vector.distance))
        ? Number(vector.distance)
        : Math.hypot(Number(target?.x) - Number(self?.x), Number(target?.y) - Number(self?.y));
      const attackRange = Math.max(0, Number(options.combatAttackRange ?? options.attackRangeCm ?? options.attackRange ?? DEFAULT_ATTACK_RANGE_CM));
      if (target?.invulnerable) {
        const stopped = stop('profit-easy-kill-target-invulnerable');
        return {
          ok: stopped.ok,
          kind: 'stop',
          reason: 'profit-easy-kill-target-invulnerable',
          command: stopped.command || null,
          skipped: Boolean(stopped.skipped),
          ...transportFailure(stopped),
          target
        };
      }
      if (Number.isFinite(distance) && distance <= attackRange) {
        const stopped = stop('profit-easy-kill-combat-handoff');
        return {
          ok: stopped.ok,
          kind: 'stop',
          reason: 'profit-easy-kill-combat-handoff',
          command: stopped.command || null,
          skipped: Boolean(stopped.skipped),
          ...transportFailure(stopped),
          target
        };
      }
      if (!vector.ok) {
        const stopped = stop(vector.reason || 'profit-easy-kill-missing-position');
        return {
          ok: stopped.ok,
          kind: 'stop',
          reason: vector.reason || 'profit-easy-kill-missing-position',
          vector,
          command: stopped.command || null,
          skipped: Boolean(stopped.skipped),
          ...transportFailure(stopped),
          target
        };
      }
      const sent = sendVelocity(vector.dx, vector.dy, 'profit-easy-kill-seek', target);
      return {
        ok: sent.ok,
        kind: 'velocity',
        reason: 'profit-easy-kill-seek',
        vector,
        command: sent.command || null,
        skipped: Boolean(sent.skipped),
        ...transportFailure(sent),
        target,
        easyKillApproach: true
      };
    }
    if (target?.active) {
      const stopped = stop('profit-active-target-blocked');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'profit-active-target-blocked',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        ...transportFailure(stopped),
        target
      };
    }
    const vector = movementVectorToTarget(self, target, options);
    const distance = Number.isFinite(Number(vector.distance))
      ? Number(vector.distance)
      : Math.hypot(Number(target?.x) - Number(self?.x), Number(target?.y) - Number(self?.y));
    const attackRange = Math.max(0, Number(options.attackRangeCm ?? options.attackRange ?? DEFAULT_ATTACK_RANGE_CM));
    const commitRange = afkAttackCommitRangeCm(options);
    const shootRange = commitRange > 0 ? Math.min(attackRange, commitRange) : attackRange;
    const fullAttackRange = Math.min(shootRange, afkAttackFullRangeCm(options));
    if (target?.cachedNavigationOnly) {
      if (!vector.ok || (Number.isFinite(distance) && distance <= Math.max(300, Number(options.targetDeadZoneCm || DEFAULT_TARGET_DEAD_ZONE_CM)))) {
        const stopped = stop('cached-enemy-position-reached');
        return { ok: stopped.ok, kind: 'stop', reason: 'cached-enemy-position-reached', command: stopped.command || null, skipped: Boolean(stopped.skipped), target };
      }
      const sent = sendVelocity(vector.dx, vector.dy, 'missing-realtime-enemy-hold', target);
      return { ok: sent.ok, kind: 'velocity', reason: 'missing-realtime-enemy-hold', vector, command: sent.command || null, skipped: Boolean(sent.skipped), target, cachedNavigationOnly: true, ...transportFailure(sent) };
    }
    if (!(Number.isFinite(distance) && distance <= shootRange)) {
      if (!vector.ok) {
        const stopped = stop(vector.reason || 'profit-afk-missing-position');
        return {
          ok: stopped.ok,
          kind: 'stop',
          reason: vector.reason || 'profit-afk-missing-position',
          vector,
          command: stopped.command || null,
          skipped: Boolean(stopped.skipped),
          ...transportFailure(stopped),
          target
        };
      }
      const reason = Number.isFinite(distance) && distance <= attackRange ? 'profit-afk-preengage' : 'profit-afk-seek';
      const sent = sendVelocity(vector.dx, vector.dy, reason, target);
      return {
        ok: sent.ok,
        kind: 'velocity',
        reason,
        vector,
        command: sent.command || null,
        skipped: Boolean(sent.skipped),
        ...transportFailure(sent),
        target,
        afkAttackCommit: {
          commitRangeCm: Math.round(shootRange),
          attackRangeCm: Math.round(attackRange),
          distance: Math.round(distance)
        }
      };
    }

    if (target?.invulnerable) {
      const stopped = stop('profit-invulnerable-target-wait');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'profit-invulnerable-target-wait',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        target,
        afkAttackCommit: {
          commitRangeCm: Math.round(shootRange),
          attackRangeCm: Math.round(attackRange),
          distance: Math.round(distance)
        },
        ...transportFailure(stopped)
      };
    }

    const fullAttack = Number.isFinite(distance) && distance <= fullAttackRange;
    const movement = fullAttack
      ? sendVelocity(0, 0, 'profit-afk-attack-hold', target)
      : sendVelocity(vector.dx, vector.dy, 'profit-afk-attack-approach', target);
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
    const repeat = canScheduleShootRepeat(shoot)
      ? scheduleShootRepeat(self, target, decision?.action?.reason || decision?.reason || 'profit-afk-attack', shoot.cadenceMs)
      : null;
    return {
      ok: Boolean(movement.ok && shoot.ok),
      kind: 'profit-attack',
      reason: 'profit-afk-attack',
      movement: {
        ok: movement.ok,
        skipped: Boolean(movement.skipped),
        reason: fullAttack ? 'profit-afk-attack-hold' : 'profit-afk-attack-approach',
        command: movement.command || null,
        fullAttack,
        fullAttackRangeCm: Math.round(fullAttackRange),
        ...transportFailure(movement)
      },
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null,
        repeat,
        ...transportFailure(shoot)
      },
      target,
      ...transportFailure(movement, shoot)
    };
  }

  function applyCombatDecision(stateSnapshot, decision) {
    cancelShootRepeat('combat-decision');
    const combat = combatSummaryFromDecision(decision);
    const self = stateSnapshot?.realtime?.self || combat?.self || null;
    if (!combat?.target) {
      const stopped = stop('combat-live-no-target');
      return {
        ok: stopped.ok,
        kind: 'stop',
        reason: 'combat-live-no-target',
        command: stopped.command || null,
        skipped: Boolean(stopped.skipped),
        ...transportFailure(stopped)
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
          shooting.effectiveCadenceMs || shooting.cadenceMs,
          {
            observedTick: combat.timing?.observedTick ?? combat.tick,
            aimMode: combat.aim?.mode,
            hypothesis: combat.aim?.motionProbe?.hypothesis,
            flightTicks: combat.aim?.flightTicks,
            routeContextKey: combat.aim?.routeCoverage?.contextKey,
            routeCandidate: combat.aim?.routeCoverage?.selected,
            routeProbability: combat.shooting?.selectedRouteProbability,
            predictedDirectionState: combat.aim?.routeCoverage?.candidates?.find(candidate => candidate.hypothesis === combat.aim?.routeCoverage?.selected)?.directionState,
            aimConfidence: combat.aim?.confidence,
            expectedHitProbability: combat.shooting?.expectedHitProbability,
            predictedShooterX: combat.aim?.predictedShooterOrigin?.x,
            predictedShooterY: combat.aim?.predictedShooterOrigin?.y,
            predictedTargetAtCreationX: combat.aim?.predictedTargetAtCreation?.x,
            predictedTargetAtCreationY: combat.aim?.predictedTargetAtCreation?.y
          }
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
        command: velocity.command || null,
        ...transportFailure(velocity)
      },
      shoot: {
        ok: shoot.ok,
        skipped: Boolean(shoot.skipped),
        reason: shoot.reason,
        command: shoot.command || null,
        cadenceMs: shoot.cadenceMs || null,
        ...transportFailure(shoot)
      },
      target: combat.target,
      ...transportFailure(velocity, shoot)
    };
  }

  function observeState(stateSnapshot) {
    validateShootRepeatState(stateSnapshot);
    observeMovementStall(stateSnapshot);
    state.latestObservedTick = numberOrNull(stateSnapshot?.realtime?.tick);
    state.shootAckTimeoutMs = Math.max(500, Number(
      stateSnapshot?.command?.shooting?.ackTimeoutMs ?? state.shootAckTimeoutMs ?? initialShootAckTimeoutMs
    ));
    expirePendingShootCommands();
    const ack = stateSnapshot?.command?.lastAck || null;
    if (ack && (!state.lastShootAck || Number(ack.receivedAtMs || 0) !== Number(state.lastShootAck.receivedAtMs || 0) || ack.bullet_id !== state.lastShootAck.bullet_id)) {
      state.lastShootAck = ack;
      const matchedId = ack.matchedShot?.commandId;
      const index = matchedId === null || matchedId === undefined
        ? 0
        : state.pendingShootCommands.findIndex(command => Number(command.id) === Number(matchedId));
      if (state.pendingShootCommands.length && index >= 0) {
        state.pendingShootCommands.splice(index, 1);
        state.shootAcceptedCount += 1;
      }
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
      shootAcceptedCount: state.shootAcceptedCount,
      shootUnackedCount: state.shootUnackedCount,
      pendingShootCount: state.pendingShootCommands.length,
      shootAckTimeoutMs: state.shootAckTimeoutMs,
      stopCount: state.stopCount,
      skippedCount: state.skippedCount,
      velocityRepeatSentCount: state.velocityRepeatSentCount,
      shootRepeatSentCount: state.shootRepeatSentCount,
      velocityRepeatUntilMs: state.velocityRepeatUntilMs,
      velocityStopRepeatsLeft: state.velocityStopRepeatsLeft,
      shootRepeatUntilMs: state.shootRepeatUntilMs,
      shootRepeatTargetKey: state.shootRepeatTargetKey,
      lastVelocityRepeatError: state.lastVelocityRepeatError,
      lastShootRepeatError: state.lastShootRepeatError,
      transportSealed: state.transportSealed,
      transportSealReason: state.transportSealReason,
      lastCommand: summarizeCommand(state.lastCommand),
      lastShootCommand: summarizeCommand(state.lastShootCommand),
      lastShootAck: state.lastShootAck,
      lastSettlement: state.lastSettlement,
      movementStall: movementStallSummary(),
      lastMovementStall: state.lastMovementStall ? { ...state.lastMovementStall } : null,
      coinFeedbackGate: state.coinFeedbackGate ? { ...state.coinFeedbackGate } : null,
      coinFeedbackWaitCount: state.coinFeedbackWaitCount,
      coinFeedbackAckCount: state.coinFeedbackAckCount,
      coinFeedbackTimeoutCount: state.coinFeedbackTimeoutCount
    };
  }

  return {
    applyDecision,
    applyCombatDecision,
    getState,
    observeState,
    sealTransport,
    stop
  };
}

module.exports = {
  DEFAULT_COMMAND_INTERVAL_MS,
  DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM,
  DEFAULT_AFK_ATTACK_FULL_RANGE_CM,
  DEFAULT_COIN_TARGET_DEAD_ZONE_CM,
  DEFAULT_COMBAT_SHOOT_MIN_INTERVAL_MS,
  DEFAULT_MOVEMENT_SETTLEMENT_MIN_DISTANCE_CM,
  DEFAULT_MOVEMENT_SETTLEMENT_STALL_MS,
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
