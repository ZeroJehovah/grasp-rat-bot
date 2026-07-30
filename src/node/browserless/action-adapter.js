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
const DEFAULT_REPEAT_MAX_DRIFT_MS = 125;
const DEFAULT_TRANSPORT_HIGH_WATER_BYTES = 64 * 1024;
const DEFAULT_ATTACK_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.attackRange;
const DEFAULT_AFK_ATTACK_COMMIT_RANGE_CM = 10000;
const DEFAULT_AFK_ATTACK_FULL_RANGE_CM = BROWSER_RUNTIME_DEFAULTS.afkAttackFullRangeCm;
const DEFAULT_COIN_FEEDBACK_MIN_TIMEOUT_MS = 250;
const DEFAULT_COIN_FEEDBACK_MAX_TIMEOUT_MS = 800;
const DEFAULT_COIN_FEEDBACK_DELAY_SLACK_MS = 125;
const DEFAULT_COIN_FEEDBACK_MAX_MOVEMENT_P90_MS = 650;
const DEFAULT_COIN_FEEDBACK_MAX_INBOUND_P90_MS = 750;
const DEFAULT_COIN_FEEDBACK_MAX_QUEUE_P90_MS = 250;
const DEFAULT_COIN_FEEDBACK_MAX_FRAME_LOSS_RATE = 0.02;
const DEFAULT_COIN_FEEDBACK_MIN_EXPECTED_TICKS = 20;
const DEFAULT_COIN_FEEDBACK_MAX_REALTIME_FRAME_AGE_MS = 500;
const DEFAULT_NEAR_COIN_CONTINUATION_LEASE_SLACK_MS = 125;
const DEFAULT_NEAR_COIN_CONTINUATION_MIN_LEASE_MS = 250;
const DEFAULT_NEAR_COIN_CONTINUATION_STOP_SPEED_TOLERANCE = 1;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return numberOrNull(value);
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
    latestObservedAtMs: null,
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
    nearCoinContinuation: null,
    nearCoinContinuationStartCount: 0,
    nearCoinContinuationRenewCount: 0,
    nearCoinContinuationPulseCount: 0,
    nearCoinContinuationCancelCount: 0,
    nearCoinContinuationLastCancelReason: '',
    velocityPulseToken: 0,
    velocityStopTimer: null,
    velocityRepeatToken: 0,
    velocityRepeatUntilMs: 0,
    velocityStopRepeatsLeft: 0,
    velocityRepeatTimer: null,
    velocityRepeatOwnerCommandId: null,
    velocityRepeatDx: 0,
    velocityRepeatDy: 0,
    velocityDirectionGeneration: 0,
    velocityOwnership: null,
    velocityLogicalRefreshCount: 0,
    velocityOwnershipSuppressedCount: 0,
    velocityRepeatSuppressedCount: 0,
    shootRepeatSuppressedCount: 0,
    lastRepeatTimerDriftMs: 0,
    lastTransportBufferedAmount: 0,
    lastVelocityTelemetry: null,
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
    sentAtMs: command.sentAtMs,
    directionGeneration: command.directionGeneration ?? null,
    ownership: command.ownership || null,
    movementTelemetry: command.movementTelemetry || null,
    target: command.target || null
  };
}

function createBrowserlessActionAdapter(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const transport = options.transport || null;
  const onVelocityRequest = typeof options.onVelocityRequest === 'function' ? options.onVelocityRequest : null;
  const getTransportHealth = typeof options.getTransportHealth === 'function' ? options.getTransportHealth : null;
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
  const configuredRepeatMaxDriftMs = Number(
    options.repeatMaxDriftMs ?? options.velocityRepeatMaxDriftMs ?? DEFAULT_REPEAT_MAX_DRIFT_MS
  );
  const repeatMaxDriftMs = Math.max(
    velocityRepeatMs,
    Number.isFinite(configuredRepeatMaxDriftMs) ? configuredRepeatMaxDriftMs : DEFAULT_REPEAT_MAX_DRIFT_MS
  );
  const configuredTransportHighWaterBytes = Number(
    options.transportHighWaterBytes
      ?? options.wsBufferedAmountHighWaterBytes
      ?? DEFAULT_TRANSPORT_HIGH_WATER_BYTES
  );
  const transportHighWaterBytes = Math.max(
    1024,
    Number.isFinite(configuredTransportHighWaterBytes)
      ? configuredTransportHighWaterBytes
      : DEFAULT_TRANSPORT_HIGH_WATER_BYTES
  );
  const setTimeoutFn = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const state = createInitialActionState();
  let nextCommandId = 1;
  let activeApplyContext = null;

  function velocityOwnershipPriority(ownership = {}) {
    const band = String(ownership.band || '');
    const source = String(ownership.source || 'planner');
    if (ownership.hardSafety === true || band === 'exit') return 50;
    if (band === 'safety') return 40;
    if (source === 'realtime-control' || band === 'combat' || band === 'recover') return 30;
    if (source === 'leave-pending') return 45;
    return 10;
  }

  function actionApplyContext(stateSnapshot, decision, applyOptions = {}) {
    const action = decision?.action || decision || {};
    const frameReceivedAtMs = optionalNumber(
      applyOptions.frameReceivedAtMs
        ?? stateSnapshot?.realtime?.receivedAtMs
        ?? state.latestObservedAtMs
    );
    const decisionAtMs = optionalNumber(applyOptions.decisionAtMs) ?? now();
    const source = String(applyOptions.source || (
      decision?.combat?.highFrequencyControl === true ? 'realtime-control' : 'planner'
    ));
    const band = String(applyOptions.band || action.band || decision?.band || '');
    const hardSafety = applyOptions.hardSafety === true
      || action.shouldLeave === true
      || band === 'exit'
      || (band === 'safety' && action.urgent === true);
    const ownership = {
      source,
      band,
      hardSafety,
      observedTick: optionalNumber(applyOptions.observedTick ?? stateSnapshot?.realtime?.tick ?? state.latestObservedTick),
      frameReceivedAtMs,
      decisionAtMs
    };
    ownership.priority = velocityOwnershipPriority(ownership);
    return ownership;
  }

  function velocityOwnershipSuperseded(candidate, current) {
    if (!current) return false;
    if (candidate?.hardSafety === true && current?.hardSafety !== true) return false;
    const candidateTick = optionalNumber(candidate?.observedTick);
    const currentTick = optionalNumber(current?.observedTick);
    if (candidateTick !== null && currentTick !== null) {
      if (candidateTick < currentTick && candidate?.hardSafety !== true) return true;
      if (candidateTick === currentTick) {
        if (Number(candidate?.priority || 0) < Number(current?.priority || 0)) return true;
        if (String(candidate?.source || '') === 'planner'
          && String(current?.source || '') === 'realtime-control') return true;
      }
    }
    return Boolean(
      current?.hardSafety === true
        && candidate?.hardSafety !== true
        && (candidateTick === null || currentTick === null || candidateTick <= currentTick)
    );
  }

  function shouldRefreshVelocityOwnership(candidate, current) {
    if (!current) return true;
    if (candidate?.hardSafety === true && current?.hardSafety !== true) return true;
    if (candidate?.hardSafety !== true && current?.hardSafety === true) return false;
    const candidateTick = optionalNumber(candidate?.observedTick);
    const currentTick = optionalNumber(current?.observedTick);
    if (candidateTick !== null && currentTick !== null) {
      if (candidateTick > currentTick) return true;
      if (candidateTick < currentTick) return false;
    } else if (candidateTick !== null && currentTick === null) {
      return true;
    } else if (candidateTick === null && currentTick !== null) {
      return false;
    }
    const candidatePriority = Number(candidate?.priority || 0);
    const currentPriority = Number(current?.priority || 0);
    if (candidatePriority !== currentPriority) return candidatePriority > currentPriority;
    return String(candidate?.source || '') === 'realtime-control'
      && String(current?.source || '') !== 'realtime-control';
  }

  function refreshVelocityOwnership(candidate, command) {
    if (!command || !shouldRefreshVelocityOwnership(candidate, state.velocityOwnership)) return;
    const ownership = {
      ...(state.velocityOwnership || {}),
      ...candidate,
      directionGeneration: command.directionGeneration ?? state.velocityOwnership?.directionGeneration ?? null,
      commandId: command.id ?? state.velocityOwnership?.commandId ?? null,
      dx: command.dx,
      dy: command.dy,
      sentAtMs: command.sentAtMs ?? state.velocityOwnership?.sentAtMs ?? null
    };
    state.velocityOwnership = ownership;
    command.ownership = {
      source: ownership.source,
      band: ownership.band,
      hardSafety: ownership.hardSafety === true,
      observedTick: optionalNumber(ownership.observedTick),
      priority: Number(ownership.priority || 0)
    };
  }

  function velocityRequestTiming(atMs, sendOptions = {}) {
    const context = {
      ...(activeApplyContext || {}),
      ...(sendOptions.ownership || {})
    };
    const frameReceivedAtMs = optionalNumber(
      sendOptions.frameReceivedAtMs
        ?? sendOptions.observedAtMs
        ?? context.frameReceivedAtMs
        ?? state.latestObservedAtMs
    );
    const decisionAtMs = optionalNumber(sendOptions.decisionAtMs ?? context.decisionAtMs) ?? atMs;
    const ownership = {
      source: String(context.source || 'planner'),
      band: String(context.band || ''),
      hardSafety: context.hardSafety === true,
      observedTick: optionalNumber(sendOptions.observedTick ?? context.observedTick ?? state.latestObservedTick),
      priority: Number(context.priority || velocityOwnershipPriority(context))
    };
    return {
      frameReceivedAtMs,
      decisionAtMs,
      observedTick: ownership.observedTick,
      observedTickAgeAtSendMs: frameReceivedAtMs === null ? null : Math.max(0, atMs - frameReceivedAtMs),
      frameReceivedToDecisionMs: frameReceivedAtMs === null ? null : Math.max(0, decisionAtMs - frameReceivedAtMs),
      decisionToVelocitySendMs: Math.max(0, atMs - decisionAtMs),
      ownership
    };
  }

  function unrefTimer(timer) {
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function transportBufferedAmount() {
    let value = 0;
    try {
      value = typeof transport?.bufferedAmount === 'function'
        ? Number(transport.bufferedAmount())
        : Number(transport?.bufferedAmount ?? transport?.ws?.bufferedAmount ?? 0);
    } catch (_) {
      value = 0;
    }
    value = Number.isFinite(value) ? Math.max(0, value) : 0;
    state.lastTransportBufferedAmount = value;
    return value;
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
    state.velocityRepeatOwnerCommandId = null;
    state.velocityRepeatDx = 0;
    state.velocityRepeatDy = 0;
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

  function currentTransportHealth() {
    if (!getTransportHealth) return null;
    try {
      const health = getTransportHealth();
      return health && typeof health === 'object' ? health : null;
    } catch (_) {
      return null;
    }
  }

  function coinFeedbackPlan(stateSnapshot = {}) {
    const configuredTimeoutMs = optionalNumber(options.coinFeedbackTimeoutMs);
    const fallbackTimeoutMs = configuredTimeoutMs === null
      ? Math.max(1500, decisionIntervalMs * 2)
      : Math.max(DEFAULT_COIN_FEEDBACK_MIN_TIMEOUT_MS, configuredTimeoutMs);
    const timing = stateSnapshot?.command?.movement?.timing || {};
    const movementP90Ms = optionalNumber(timing.p90WallMs);
    const movementSampleCount = Math.max(0, Number(timing.exactSampleCount ?? timing.sampleCount ?? 0));
    const realtimeFrameAgeMs = optionalNumber(stateSnapshot?.realtime?.frameAgeMs);
    const transportHealth = currentTransportHealth();
    const frameLossRate = optionalNumber(transportHealth?.frameLoss?.rate);
    const frameLossExpectedTicks = Math.max(0, Number(transportHealth?.frameLoss?.expectedTicks || 0));
    const inboundLatencyP90Ms = optionalNumber(transportHealth?.latency?.p90Ms);
    const processingQueueP90Ms = optionalNumber(transportHealth?.processingQueue?.p90Ms);
    const transportFrameAgeMs = optionalNumber(transportHealth?.frames?.lastAgeMs);
    const summary = {
      movementP90Ms,
      movementSampleCount,
      frameLossRate,
      frameLossExpectedTicks,
      inboundLatencyP90Ms,
      processingQueueP90Ms,
      realtimeFrameAgeMs,
      transportFrameAgeMs
    };
    const conservative = reason => ({
      mode: configuredTimeoutMs === null ? 'conservative' : 'configured',
      reason,
      timeoutMs: Math.round(fallbackTimeoutMs),
      ...summary
    });

    if (configuredTimeoutMs !== null) return conservative('configured-timeout');
    if (timing.exactReady !== true || movementSampleCount < 4) return conservative('movement-timing-untrusted');
    if (movementP90Ms === null || movementP90Ms > DEFAULT_COIN_FEEDBACK_MAX_MOVEMENT_P90_MS) {
      return conservative('movement-p90-too-high');
    }
    if (!transportHealth || transportHealth.connected !== true) return conservative('transport-health-unavailable');
    if (transportHealth.exit?.triggered === true
      || transportHealth.exit?.latencyTriggered === true
      || transportHealth.exit?.frameLossTriggered === true) {
      return conservative('transport-health-degraded');
    }
    if (frameLossExpectedTicks >= DEFAULT_COIN_FEEDBACK_MIN_EXPECTED_TICKS
      && frameLossRate !== null
      && frameLossRate > DEFAULT_COIN_FEEDBACK_MAX_FRAME_LOSS_RATE) {
      return conservative('frame-loss-rate-high');
    }
    if (inboundLatencyP90Ms !== null && inboundLatencyP90Ms > DEFAULT_COIN_FEEDBACK_MAX_INBOUND_P90_MS) {
      return conservative('inbound-latency-high');
    }
    if (processingQueueP90Ms !== null && processingQueueP90Ms > DEFAULT_COIN_FEEDBACK_MAX_QUEUE_P90_MS) {
      return conservative('processing-queue-high');
    }
    if (realtimeFrameAgeMs !== null && realtimeFrameAgeMs > DEFAULT_COIN_FEEDBACK_MAX_REALTIME_FRAME_AGE_MS) {
      return conservative('realtime-frame-stale');
    }
    if (transportFrameAgeMs !== null && transportFrameAgeMs > DEFAULT_COIN_FEEDBACK_MAX_REALTIME_FRAME_AGE_MS) {
      return conservative('transport-frame-stale');
    }
    return {
      mode: 'adaptive-healthy',
      reason: 'trusted-movement-p90',
      timeoutMs: Math.round(clampNumber(
        movementP90Ms + DEFAULT_COIN_FEEDBACK_DELAY_SLACK_MS,
        DEFAULT_COIN_FEEDBACK_MIN_TIMEOUT_MS,
        DEFAULT_COIN_FEEDBACK_MAX_TIMEOUT_MS
      )),
      ...summary
    };
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

  function nearCoinContinuationSummary(continuation = state.nearCoinContinuation) {
    if (!continuation) return null;
    const pulse = continuation.lastPulse || null;
    return {
      targetKey: String(continuation.targetKey || ''),
      createdAtMs: Number(continuation.createdAtMs || 0),
      renewedAtMs: Number(continuation.renewedAtMs || 0),
      expiresAtMs: Number(continuation.expiresAtMs || 0),
      plannerTick: continuation.plannerTick ?? null,
      lastObservedTick: continuation.lastObservedTick ?? null,
      pulseCount: Math.max(0, Number(continuation.pulseCount || 0)),
      lastPulse: pulse ? {
        commandId: pulse.commandId ?? null,
        pulseToken: pulse.pulseToken ?? null,
        startedAtMs: Number(pulse.startedAtMs || 0),
        startTick: pulse.startTick ?? null,
        dx: Number(pulse.dx || 0),
        dy: Number(pulse.dy || 0),
        distance: Number.isFinite(Number(pulse.distance)) ? Number(pulse.distance) : null,
        stopSentAtMs: Number(pulse.stopSentAtMs || 0),
        stopSentTick: pulse.stopSentTick ?? null,
        stopCommandId: pulse.stopCommandId ?? null,
        stopFailed: pulse.stopFailed === true
      } : null
    };
  }

  function clearNearCoinContinuation(reason = '') {
    if (!state.nearCoinContinuation) return false;
    state.nearCoinContinuation = null;
    state.nearCoinContinuationCancelCount += 1;
    state.nearCoinContinuationLastCancelReason = String(reason || 'cleared');
    return true;
  }

  function nearCoinContinuationLeaseMs() {
    return Math.max(
      DEFAULT_NEAR_COIN_CONTINUATION_MIN_LEASE_MS,
      Math.round(decisionIntervalMs + DEFAULT_NEAR_COIN_CONTINUATION_LEASE_SLACK_MS)
    );
  }

  function feedbackGuidedCoinVector(vector) {
    return Boolean(vector?.ok) && Number(vector.distance) <= optionNumber(
      options,
      'coinFeedbackGuidedDistanceCm',
      BROWSER_RUNTIME_DEFAULTS.coinPickupSweepDistance
    );
  }

  function nearCoinContinuationEligible(target, vector, feedbackPlan) {
    return Boolean(
      coinTargetKey(target)
      && vector?.ok
      && feedbackGuidedCoinVector(vector)
      && Number(vector.precisionPulseMs) > 0
      && feedbackPlan?.mode === 'adaptive-healthy'
    );
  }

  function beginOrRenewNearCoinContinuation(stateSnapshot, target, vector, feedbackPlan, sent = null, renewLease = true) {
    if (!nearCoinContinuationEligible(target, vector, feedbackPlan)) {
      clearNearCoinContinuation('continuation-ineligible');
      return null;
    }
    const targetKey = coinTargetKey(target);
    const atMs = now();
    let continuation = state.nearCoinContinuation;
    if (!continuation || continuation.targetKey !== targetKey) {
      if (continuation) clearNearCoinContinuation('planner-target-changed');
      if (!renewLease || !sent?.command) return null;
      continuation = {
        targetKey,
        target: { ...target, type: 'coin' },
        createdAtMs: atMs,
        renewedAtMs: atMs,
        expiresAtMs: atMs + nearCoinContinuationLeaseMs(),
        plannerTick: optionalNumber(stateSnapshot?.realtime?.tick),
        lastObservedTick: null,
        pulseCount: 0,
        lastPulse: null
      };
      state.nearCoinContinuation = continuation;
      state.nearCoinContinuationStartCount += 1;
    } else {
      continuation.target = { ...target, type: 'coin' };
      if (renewLease) {
        continuation.renewedAtMs = atMs;
        continuation.expiresAtMs = atMs + nearCoinContinuationLeaseMs();
        continuation.plannerTick = optionalNumber(stateSnapshot?.realtime?.tick);
        state.nearCoinContinuationRenewCount += 1;
      }
    }
    if (sent?.command) {
      const self = stateSnapshot?.realtime?.self || null;
      const startX = numberOrNull(self?.x);
      const startY = numberOrNull(self?.y);
      if (startX === null || startY === null) {
        clearNearCoinContinuation('continuation-missing-position');
        return null;
      }
      continuation.pulseCount = Math.max(0, Number(continuation.pulseCount || 0)) + 1;
      continuation.lastPulse = {
        commandId: sent.command.id,
        pulseToken: sent.pulseToken ?? null,
        startedAtMs: atMs,
        startTick: optionalNumber(stateSnapshot?.realtime?.tick),
        startX,
        startY,
        dx: Number(sent.command.dx || 0),
        dy: Number(sent.command.dy || 0),
        distance: Number(vector.distance),
        minPositionDeltaCm: Math.max(1, optionNumber(options, 'coinFeedbackMinPositionDeltaCm', 1)),
        stopSentAtMs: 0,
        stopSentTick: null,
        stopCommandId: null,
        stopFailed: false
      };
      state.nearCoinContinuationPulseCount += 1;
    }
    return continuation;
  }

  function noteNearCoinContinuationPulseStop(commandId, pulseToken, stopped) {
    const continuation = state.nearCoinContinuation;
    const pulse = continuation?.lastPulse;
    if (!pulse
      || String(pulse.commandId ?? '') !== String(commandId ?? '')
      || String(pulse.pulseToken ?? '') !== String(pulseToken ?? '')) {
      return;
    }
    pulse.stopSentAtMs = now();
    pulse.stopSentTick = state.latestObservedTick;
    pulse.stopCommandId = stopped?.command?.id ?? null;
    pulse.stopFailed = !stopped?.ok || stopped?.skipped === true || !pulse.stopCommandId;
  }

  function armCoinFeedbackGate(stateSnapshot, target, feedbackPlan, sent, self = stateSnapshot?.realtime?.self || null) {
    if (!sent?.ok || sent.skipped || !sent.command) return null;
    const startX = numberOrNull(self?.x);
    const startY = numberOrNull(self?.y);
    if (startX === null || startY === null) return null;
    const feedbackStartedAtMs = now();
    state.coinFeedbackGate = {
      targetKey: coinTargetKey(target),
      commandId: sent.command.id,
      startX,
      startY,
      startTick: optionalNumber(stateSnapshot?.realtime?.tick),
      sentAtMs: feedbackStartedAtMs,
      expiresAtMs: feedbackStartedAtMs + Number(feedbackPlan?.timeoutMs || 0),
      timeoutMs: Number(feedbackPlan?.timeoutMs || 0),
      mode: String(feedbackPlan?.mode || 'conservative'),
      planReason: String(feedbackPlan?.reason || 'missing-feedback-plan'),
      movementP90Ms: feedbackPlan?.movementP90Ms ?? null,
      movementSampleCount: feedbackPlan?.movementSampleCount ?? 0,
      frameLossRate: feedbackPlan?.frameLossRate ?? null,
      frameLossExpectedTicks: feedbackPlan?.frameLossExpectedTicks ?? 0,
      inboundLatencyP90Ms: feedbackPlan?.inboundLatencyP90Ms ?? null,
      processingQueueP90Ms: feedbackPlan?.processingQueueP90Ms ?? null,
      realtimeFrameAgeMs: feedbackPlan?.realtimeFrameAgeMs ?? null,
      transportFrameAgeMs: feedbackPlan?.transportFrameAgeMs ?? null,
      minPositionDeltaCm: Math.max(1, optionNumber(options, 'coinFeedbackMinPositionDeltaCm', 1))
    };
    return state.coinFeedbackGate;
  }

  function realtimeCoinForContinuation(stateSnapshot, targetKey) {
    const realtime = stateSnapshot?.realtime || null;
    if (!realtime
      || (realtime.authority && realtime.authority !== 'realtime')
      || (realtime.source && realtime.source !== 'pos')
      || realtime.coinDropsObserved !== true
      || !Array.isArray(realtime.coinDrops)) {
      return null;
    }
    return realtime.coinDrops.find(coin => coinTargetKey(coin) === targetKey) || null;
  }

  function nearCoinPulsePositionObserved(pulse, self) {
    const x = numberOrNull(self?.x);
    const y = numberOrNull(self?.y);
    if (x === null || y === null) return false;
    return Math.hypot(x - Number(pulse.startX), y - Number(pulse.startY)) >= Number(pulse.minPositionDeltaCm || 1);
  }

  function nearCoinPulseStopSettled(pulse, self) {
    const vx = optionalNumber(self?.vx);
    const vy = optionalNumber(self?.vy);
    if (vx !== null && vy !== null) {
      return Math.hypot(vx, vy) <= DEFAULT_NEAR_COIN_CONTINUATION_STOP_SPEED_TOLERANCE;
    }
    const settlement = state.lastSettlement;
    return Boolean(
      settlement?.ok
      && pulse.stopCommandId !== null
      && String(settlement.commandId) === String(pulse.stopCommandId)
    );
  }

  function continueCloseCoinPickup(stateSnapshot) {
    const continuation = state.nearCoinContinuation;
    if (!continuation || state.transportSealed) return null;
    const atMs = now();
    if (atMs >= Number(continuation.expiresAtMs || 0)) {
      clearNearCoinContinuation('planner-lease-expired');
      return null;
    }
    const realtime = stateSnapshot?.realtime || null;
    const tick = optionalNumber(realtime?.tick);
    if (tick !== null && tick === optionalNumber(continuation.lastObservedTick)) return null;
    if (tick !== null) continuation.lastObservedTick = tick;
    const target = realtimeCoinForContinuation(stateSnapshot, continuation.targetKey);
    if (!target) {
      clearNearCoinContinuation('target-not-realtime-visible');
      return null;
    }
    const self = realtime?.self || null;
    const vector = coinMotionVectorToTarget(self, target, options, state, atMs);
    if (!vector.ok || !feedbackGuidedCoinVector(vector)) {
      clearNearCoinContinuation(vector.ok ? 'target-left-close-sweep' : vector.reason || 'target-unavailable');
      return null;
    }
    const feedbackPlan = coinFeedbackPlan(stateSnapshot);
    if (feedbackPlan.mode !== 'adaptive-healthy') {
      clearNearCoinContinuation('transport-or-timing-degraded');
      return null;
    }
    const pulse = continuation.lastPulse;
    if (!pulse || pulse.stopFailed) {
      clearNearCoinContinuation('pulse-stop-unavailable');
      return null;
    }
    if (!pulse.stopSentAtMs || pulse.stopCommandId === null) return null;
    const observedAtMs = optionalNumber(realtime?.receivedAtMs);
    const stopSentTick = optionalNumber(pulse.stopSentTick);
    if ((observedAtMs !== null && observedAtMs < Number(pulse.stopSentAtMs))
      || (tick !== null && stopSentTick !== null && tick <= stopSentTick)) {
      return null;
    }
    if (!nearCoinPulsePositionObserved(pulse, self)) return null;
    if (!nearCoinPulseStopSettled(pulse, self)) return null;
    const directionDot = Number(pulse.dx || 0) * Number(vector.dx || 0)
      + Number(pulse.dy || 0) * Number(vector.dy || 0);
    if (directionDot < 0) {
      clearNearCoinContinuation('locked-direction-reversal');
      return null;
    }
    const ownership = {
      source: 'near-coin-continuation',
      band: 'profit',
      hardSafety: false,
      observedTick: tick,
      frameReceivedAtMs: optionalNumber(realtime?.receivedAtMs),
      decisionAtMs: atMs,
      priority: 10
    };
    const sent = sendVelocity(vector.dx, vector.dy, vector.reason, target, {
      suppressRepeat: true,
      ownership
    });
    if (!sent.ok || sent.skipped || !sent.command) {
      clearNearCoinContinuation('continuation-send-not-accepted');
      return null;
    }
    const renewed = beginOrRenewNearCoinContinuation(stateSnapshot, target, vector, feedbackPlan, sent, false);
    if (!renewed) return null;
    armCoinFeedbackGate(stateSnapshot, target, feedbackPlan, sent, self);
    const precisionPulseMs = schedulePrecisionPulseStop(sent, vector.precisionPulseMs, 'coin', stopped => {
      noteNearCoinContinuationPulseStop(sent.command.id, sent.pulseToken, stopped);
    });
    if (!precisionPulseMs) {
      clearNearCoinContinuation('continuation-pulse-stop-unscheduled');
      return null;
    }
    return {
      ok: true,
      kind: 'velocity',
      reason: vector.reason,
      vector,
      command: sent.command,
      target,
      skipped: false,
      precisionPulseMs,
      feedbackGuided: true,
      nearCoinContinuation: nearCoinContinuationSummary(renewed)
    };
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
    const sameOwner = state.velocityRepeatOwnerCommandId !== null
      && String(state.velocityRepeatOwnerCommandId) === String(ownerCommand?.id ?? '')
      && Number(state.velocityRepeatDx) === Number(dx)
      && Number(state.velocityRepeatDy) === Number(dy);
    if (sameOwner && moving) {
      state.velocityRepeatUntilMs = Math.max(Number(state.velocityRepeatUntilMs || 0), now() + velocityRepeatHoldMs);
      state.velocityLogicalRefreshCount += 1;
      if (state.velocityRepeatTimer) {
        return {
          repeatMs: velocityRepeatMs,
          holdMs: velocityRepeatHoldMs,
          stopRepeats: 0,
          ownerReused: true
        };
      }
    }
    clearVelocityRepeatTimer();
    state.velocityRepeatToken += 1;
    const token = state.velocityRepeatToken;
    state.velocityRepeatOwnerCommandId = ownerCommand?.id ?? null;
    state.velocityRepeatDx = dx;
    state.velocityRepeatDy = dy;
    if (moving) {
      state.velocityRepeatUntilMs = now() + velocityRepeatHoldMs;
      state.velocityStopRepeatsLeft = 0;
    } else {
      state.velocityRepeatUntilMs = 0;
      state.velocityStopRepeatsLeft = velocityStopRepeatCount;
    }
    let scheduledForMs = now() + velocityRepeatMs;
    const scheduleNext = run => {
      scheduledForMs = now() + velocityRepeatMs;
      state.velocityRepeatTimer = setTimeoutFn(run, velocityRepeatMs);
      unrefTimer(state.velocityRepeatTimer);
    };
    const run = () => {
      if (state.velocityRepeatToken !== token) return;
      state.velocityRepeatTimer = null;
      const repeatAtMs = now();
      const timerDriftMs = Math.max(0, repeatAtMs - scheduledForMs);
      state.lastRepeatTimerDriftMs = timerDriftMs;
      const keepMoving = moving && repeatAtMs <= Number(state.velocityRepeatUntilMs || 0);
      const keepStopping = !moving && Number(state.velocityStopRepeatsLeft || 0) > 0;
      if (!keepMoving && !keepStopping) return;
      const ownerStillCurrent = state.lastCommand
        && String(state.lastCommand.id) === String(ownerCommand?.id ?? '')
        && Number(state.lastCommand.directionGeneration || 0) === Number(ownerCommand?.directionGeneration || 0);
      const overloaded = timerDriftMs > repeatMaxDriftMs || transportBufferedAmount() > transportHighWaterBytes;
      if (!ownerStillCurrent || overloaded) {
        state.velocityRepeatSuppressedCount += 1;
        if (keepMoving || keepStopping) scheduleNext(run);
        return;
      }
      if (!moving) state.velocityStopRepeatsLeft = Math.max(0, Number(state.velocityStopRepeatsLeft || 0) - 1);
      try {
        transport.sendVelocity(dx, dy);
        state.velocityRepeatSentCount += 1;
        state.lastVelocityRepeatError = '';
        if (onVelocityRequest) {
          try {
            const frameReceivedAtMs = optionalNumber(state.latestObservedAtMs);
            const telemetry = onVelocityRequest({
              commandId: ownerCommand?.id ?? null,
              repeatOwnerCommandId: ownerCommand?.id ?? null,
              dx,
              dy,
              reason: ownerCommand?.reason || 'velocity-repeat',
              requestedAtMs: repeatAtMs,
              observedTick: state.latestObservedTick,
              observedAtMs: frameReceivedAtMs,
              frameReceivedAtMs,
              observedTickAgeAtSendMs: frameReceivedAtMs === null ? null : Math.max(0, repeatAtMs - frameReceivedAtMs),
              generation: ownerCommand?.directionGeneration ?? null,
              ownership: ownerCommand?.ownership || null,
              repeat: true
            });
            if (telemetry) state.lastVelocityTelemetry = telemetry;
          } catch (_) {}
        }
      } catch (err) {
        state.lastVelocityRepeatError = err?.message || String(err);
        return;
      }
      scheduleNext(run);
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
    let scheduledForMs = now() + repeatCadenceMs;
    const scheduleNext = run => {
      scheduledForMs = now() + repeatCadenceMs;
      state.shootRepeatTimer = setTimeoutFn(run, repeatCadenceMs);
      unrefTimer(state.shootRepeatTimer);
    };
    const run = () => {
      if (state.shootRepeatToken !== token) return;
      state.shootRepeatTimer = null;
      const current = state.shootRepeat;
      if (!current || now() > Number(state.shootRepeatUntilMs || 0)) return;
      const timerDriftMs = Math.max(0, now() - scheduledForMs);
      state.lastRepeatTimerDriftMs = Math.max(state.lastRepeatTimerDriftMs, timerDriftMs);
      if (timerDriftMs > repeatMaxDriftMs || transportBufferedAmount() > transportHighWaterBytes) {
        state.shootRepeatSuppressedCount += 1;
        scheduleNext(run);
        return;
      }
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
      scheduledForMs = now() + current.cadenceMs;
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

  function schedulePrecisionPulseStop(sent, pulseMs, actionKind, onStopped = null) {
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
      const stopped = sendVelocity(0, 0, 'precision-pulse');
      if (typeof onStopped === 'function') {
        try {
          onStopped(stopped);
        } catch (_) {}
      }
    }, delayMs);
    return delayMs;
  }

  function sendVelocity(dx, dy, reason, target = null, sendOptions = {}) {
    const atMs = now();
    dx = quantizeVelocity(dx);
    dy = quantizeVelocity(dy);
    const requestTiming = velocityRequestTiming(atMs, sendOptions);
    const ownership = requestTiming.ownership;
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
    if (changed && velocityOwnershipSuperseded(ownership, state.velocityOwnership)) {
      state.skippedCount += 1;
      state.velocityOwnershipSuppressedCount += 1;
      return {
        ok: true,
        skipped: true,
        reason: 'velocity-ownership-superseded',
        command: summarizeCommand(last),
        ownership,
        currentOwnership: state.velocityOwnership ? { ...state.velocityOwnership } : null
      };
    }
    if (!changed) refreshVelocityOwnership(ownership, last);
    if (!changed && velocityRepeatEnabled && !sendOptions.suppressRepeat) {
      const repeat = scheduleVelocityRepeat(dx, dy, last);
      state.skippedCount += 1;
      return {
        ok: true,
        skipped: true,
        reason: 'unchanged-direction-repeat-owned',
        command: summarizeCommand(last),
        repeat,
        directionGeneration: last?.directionGeneration ?? null
      };
    }
    if (!changed && atMs - Number(last.sentAtMs || 0) < commandIntervalMs) {
      state.skippedCount += 1;
      return { ok: true, skipped: true, reason: 'unchanged-command-throttled', command: summarizeCommand(last) };
    }
    clearPrecisionPulseStop();
    state.velocityPulseToken += 1;
    const pulseToken = state.velocityPulseToken;
    if (changed) cancelVelocityRepeat();
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
    if (changed) state.velocityDirectionGeneration += 1;
    const command = {
      id: nextCommandId,
      type: 'velocity',
      dx,
      dy,
      reason,
      sentAtMs: atMs,
      sentAt: new Date(atMs).toISOString(),
      directionGeneration: Math.max(1, Number(state.velocityDirectionGeneration || 1)),
      ownership: { ...ownership },
      target,
      settleAfterTick: null,
      observedFrames: 0,
      settlementOrigin: state.latestSelfSample ? { ...state.latestSelfSample } : null,
      settlementMovedCm: 0
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
        const telemetry = onVelocityRequest({
          commandId: command.id,
          repeatOwnerCommandId: command.id,
          dx,
          dy,
          reason,
          requestedAtMs: atMs,
          observedTick: requestTiming.observedTick,
          observedAtMs: requestTiming.frameReceivedAtMs,
          frameReceivedAtMs: requestTiming.frameReceivedAtMs,
          frameReceivedToDecisionMs: requestTiming.frameReceivedToDecisionMs,
          decisionToVelocitySendMs: requestTiming.decisionToVelocitySendMs,
          observedTickAgeAtSendMs: requestTiming.observedTickAgeAtSendMs,
          generation: command.directionGeneration,
          ownership,
          repeat: false
        });
        if (telemetry) {
          command.movementTelemetry = telemetry;
          state.lastVelocityTelemetry = telemetry;
          if (Number.isFinite(Number(telemetry.directionGeneration))) {
            command.directionGeneration = Number(telemetry.directionGeneration);
          }
        }
      } catch (_) {}
    }
    const repeat = sendOptions.suppressRepeat
      ? (cancelVelocityRepeat(), null)
      : scheduleVelocityRepeat(dx, dy, command);
    updateMovementStallIntent(command);
    state.velocityOwnership = {
      ...ownership,
      directionGeneration: command.directionGeneration,
      commandId: command.id,
      dx,
      dy,
      sentAtMs: atMs
    };
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
      predictedTargetAtCreationY: numberOrNull(shotMeta.predictedTargetAtCreationY),
      coverageMode: String(shotMeta.coverageMode || ''),
      coverageSessionId: String(shotMeta.coverageSessionId || ''),
      coverageSlot: numberOrNull(shotMeta.coverageSlot),
      coverageSelectedTrajectory: String(shotMeta.coverageSelectedTrajectory || ''),
      coverageVariant: String(shotMeta.coverageVariant || ''),
      coverageMassBefore: numberOrNull(shotMeta.coverageMassBefore),
      coverageMassAfter: numberOrNull(shotMeta.coverageMassAfter),
      marginalCoverage: numberOrNull(shotMeta.marginalCoverage),
      hardMarginalCoverage: numberOrNull(shotMeta.hardMarginalCoverage),
      coverageAimX: numberOrNull(shotMeta.coverageAimX),
      coverageAimY: numberOrNull(shotMeta.coverageAimY),
      coverageApplied: shotMeta.coverageApplied === true,
      coverageBaselineExpectedMissCm: numberOrNull(shotMeta.coverageBaselineExpectedMissCm),
      coverageSelectedExpectedMissCm: numberOrNull(shotMeta.coverageSelectedExpectedMissCm),
      coverageExpectedMissImprovementCm: numberOrNull(shotMeta.coverageExpectedMissImprovementCm),
      coverageImprovementQualified: shotMeta.coverageImprovementQualified === true,
      coverageSelectionMode: String(shotMeta.coverageSelectionMode || ''),
      coverageRouteSelectionMode: String(shotMeta.coverageRouteSelectionMode || '')
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
          predictedTargetAtCreationY: command.predictedTargetAtCreationY,
          coverageMode: command.coverageMode,
          coverageSessionId: command.coverageSessionId,
          coverageSlot: command.coverageSlot,
          coverageSelectedTrajectory: command.coverageSelectedTrajectory,
          coverageVariant: command.coverageVariant,
          coverageMassBefore: command.coverageMassBefore,
          coverageMassAfter: command.coverageMassAfter,
          marginalCoverage: command.marginalCoverage,
          hardMarginalCoverage: command.hardMarginalCoverage,
          coverageAimX: command.coverageAimX,
          coverageAimY: command.coverageAimY,
          coverageApplied: command.coverageApplied,
          coverageBaselineExpectedMissCm: command.coverageBaselineExpectedMissCm,
          coverageSelectedExpectedMissCm: command.coverageSelectedExpectedMissCm,
          coverageExpectedMissImprovementCm: command.coverageExpectedMissImprovementCm,
          coverageImprovementQualified: command.coverageImprovementQualified,
          coverageSelectionMode: command.coverageSelectionMode,
          coverageRouteSelectionMode: command.coverageRouteSelectionMode
        });
      } catch (_) {}
    }
    return { ok: true, skipped: false, command: summarizeCommand(command), cadenceMs: intervalMs };
  }

  function stop(reason = 'stop', stopOptions = {}) {
    cancelShootRepeat('stop');
    clearNearCoinContinuation(`stop:${reason}`);
    const ownership = stopOptions.ownership || (!activeApplyContext
      ? {
          source: 'adapter-stop',
          band: 'safety',
          hardSafety: true,
          observedTick: state.latestObservedTick,
          priority: 50
        }
      : null);
    return sendVelocity(0, 0, reason, null, {
      ...stopOptions,
      ownership
    });
  }

  function sealTransport(reason = 'transport-sealed') {
    state.transportSealed = true;
    state.transportSealReason = String(reason || 'transport-sealed');
    clearPrecisionPulseStop();
    cancelVelocityRepeat();
    cancelShootRepeat(state.transportSealReason);
    clearCoinFeedbackGate();
    clearNearCoinContinuation(state.transportSealReason);
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

  function applyDecision(stateSnapshot, decision, applyOptions = {}) {
    const previousApplyContext = activeApplyContext;
    activeApplyContext = actionApplyContext(stateSnapshot, decision, applyOptions);
    try {
      cancelShootRepeat('new-decision');
      const profitAction = profitActionFromDecision(decision);
      if (profitAction?.type !== 'coin') clearNearCoinContinuation('planner-non-coin-action');
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
    const vector = coinMotionVectorToTarget(self, target, options, state, now());
    if (!vector.ok) {
      clearNearCoinContinuation(vector.reason || 'coin-vector-unavailable');
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
    const feedbackGuided = feedbackGuidedCoinVector(vector);
    const feedbackPlan = feedbackGuided ? coinFeedbackPlan(stateSnapshot) : null;
    if (!nearCoinContinuationEligible(target, vector, feedbackPlan)) {
      clearNearCoinContinuation('planner-close-coin-health-unavailable');
    } else {
      beginOrRenewNearCoinContinuation(stateSnapshot, target, vector, feedbackPlan);
    }
    if (coinFeedbackPending(self, target)) {
      return {
        ok: true,
        kind: 'feedback-wait',
        reason: 'coin-position-feedback-wait',
        skipped: true,
        target,
        feedbackGate: { ...state.coinFeedbackGate },
        nearCoinContinuation: nearCoinContinuationSummary()
      };
    }
    const sent = sendVelocity(vector.dx, vector.dy, vector.reason, target, { suppressRepeat: feedbackGuided });
    if (feedbackGuided) armCoinFeedbackGate(stateSnapshot, target, feedbackPlan, sent, self);
    const continuation = nearCoinContinuationEligible(target, vector, feedbackPlan)
      ? beginOrRenewNearCoinContinuation(stateSnapshot, target, vector, feedbackPlan, sent)
      : null;
    const opportunisticShot = opportunisticShotFromDecision(decision);
    const shoot = opportunisticShot
      ? sendOpportunisticShot(self, opportunisticShot, decision)
      : { ok: true, skipped: true, reason: 'no-opportunistic-shot' };
    const precisionPulseMs = schedulePrecisionPulseStop(sent, vector.precisionPulseMs, profitAction.kind, stopped => {
      if (continuation) noteNearCoinContinuationPulseStop(sent.command?.id, sent.pulseToken, stopped);
    });
    if (continuation && !precisionPulseMs) clearNearCoinContinuation('planner-pulse-stop-unscheduled');
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
        feedbackGate: state.coinFeedbackGate ? { ...state.coinFeedbackGate } : null,
        nearCoinContinuation: nearCoinContinuationSummary(),
        ...transportFailure(sent, shoot)
      };
    } finally {
      activeApplyContext = previousApplyContext;
    }
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
    clearNearCoinContinuation('patrol-motion');
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
    clearNearCoinContinuation('safety-motion');
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
    clearNearCoinContinuation('profit-enemy-action');
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

  function applyCombatDecision(stateSnapshot, decision, applyOptions = {}) {
    const previousApplyContext = activeApplyContext;
    if (!activeApplyContext) activeApplyContext = actionApplyContext(stateSnapshot, decision, applyOptions);
    try {
      cancelShootRepeat('combat-decision');
      clearNearCoinContinuation('combat-decision');
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
            predictedTargetAtCreationY: combat.aim?.predictedTargetAtCreation?.y,
            coverageMode: combat.aim?.trajectoryCoverage?.mode,
            coverageSessionId: combat.aim?.trajectoryCoverage?.sessionId,
            coverageSlot: combat.aim?.trajectoryCoverage?.slot,
            coverageSelectedTrajectory: combat.aim?.trajectoryCoverage?.selected?.hypothesis,
            coverageVariant: combat.aim?.trajectoryCoverage?.selected?.variant,
            coverageMassBefore: combat.aim?.trajectoryCoverage?.selected?.coverageMassBefore,
            coverageMassAfter: combat.aim?.trajectoryCoverage?.selected?.coverageMassAfter,
            marginalCoverage: combat.aim?.trajectoryCoverage?.selected?.marginalCoverage,
            hardMarginalCoverage: combat.aim?.trajectoryCoverage?.selected?.hardMarginalCoverage,
            coverageAimX: combat.aim?.trajectoryCoverage?.selected?.aimX,
            coverageAimY: combat.aim?.trajectoryCoverage?.selected?.aimY,
            coverageApplied: combat.aim?.trajectoryCoverage?.applied === true,
            coverageBaselineExpectedMissCm: combat.aim?.trajectoryCoverage?.selected?.baselineExpectedMissCm,
            coverageSelectedExpectedMissCm: combat.aim?.trajectoryCoverage?.selected?.selectedExpectedMissCm,
            coverageExpectedMissImprovementCm: combat.aim?.trajectoryCoverage?.selected?.expectedMissImprovementCm,
            coverageImprovementQualified: combat.aim?.trajectoryCoverage?.selected?.improvementQualified === true,
            coverageSelectionMode: combat.aim?.routeCoverage?.selection?.mode,
            coverageRouteSelectionMode: combat.aim?.routeCoverage?.selection?.mode === 'legacy-fixed'
              ? 'legacy-fixed'
              : 'weighted'
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
          reason: velocity.reason || movement.reason,
          command: velocity.command || null,
          ownership: velocity.ownership || null,
          currentOwnership: velocity.currentOwnership || null,
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
    } finally {
      if (!previousApplyContext) activeApplyContext = null;
    }
  }

  function observeState(stateSnapshot) {
    validateShootRepeatState(stateSnapshot);
    observeMovementStall(stateSnapshot);
    state.latestObservedTick = optionalNumber(stateSnapshot?.realtime?.tick);
    state.latestObservedAtMs = optionalNumber(stateSnapshot?.realtime?.receivedAtMs);
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
    const sample = state.latestSelfSample;
    if (!command.settlementOrigin && sample) command.settlementOrigin = { ...sample };
    command.settlementMovedCm = command.settlementOrigin && sample
      ? Math.hypot(
          Number(sample.x) - Number(command.settlementOrigin.x),
          Number(sample.y) - Number(command.settlementOrigin.y)
        )
      : 0;
    const moving = Boolean(Number(command.dx || 0) || Number(command.dy || 0));
    const movementObserved = moving && command.settlementMovedCm >= movementSettlementMinDistanceCm;
    const enoughFrames = command.observedFrames >= settlementFrames;
    if (movementObserved || (!moving && enoughFrames)) {
      state.lastSettlement = {
        ok: true,
        commandId: command.id,
        reason: movementObserved ? 'movement-progress-observed' : 'stop-frames-observed',
        observedFrames: command.observedFrames,
        movedCm: Math.round(command.settlementMovedCm),
        tick
      };
    } else {
      state.lastSettlement = {
        ok: false,
        commandId: command.id,
        reason: enoughFrames ? 'movement-not-observed' : 'waiting-for-movement',
        observedFrames: command.observedFrames,
        movedCm: Math.round(command.settlementMovedCm),
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
      velocityRepeatOwnerCommandId: state.velocityRepeatOwnerCommandId,
      velocityDirectionGeneration: state.velocityDirectionGeneration,
      velocityLogicalRefreshCount: state.velocityLogicalRefreshCount,
      velocityOwnershipSuppressedCount: state.velocityOwnershipSuppressedCount,
      velocityRepeatSuppressedCount: state.velocityRepeatSuppressedCount,
      shootRepeatSuppressedCount: state.shootRepeatSuppressedCount,
      lastRepeatTimerDriftMs: state.lastRepeatTimerDriftMs,
      lastTransportBufferedAmount: transportBufferedAmount(),
      transportHighWaterBytes,
      velocityOwnership: state.velocityOwnership ? { ...state.velocityOwnership } : null,
      lastVelocityTelemetry: state.lastVelocityTelemetry,
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
      coinFeedbackTimeoutCount: state.coinFeedbackTimeoutCount,
      nearCoinContinuation: nearCoinContinuationSummary(),
      nearCoinContinuationStartCount: state.nearCoinContinuationStartCount,
      nearCoinContinuationRenewCount: state.nearCoinContinuationRenewCount,
      nearCoinContinuationPulseCount: state.nearCoinContinuationPulseCount,
      nearCoinContinuationCancelCount: state.nearCoinContinuationCancelCount,
      nearCoinContinuationLastCancelReason: state.nearCoinContinuationLastCancelReason
    };
  }

  return {
    applyDecision,
    applyCombatDecision,
    continueCloseCoinPickup,
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
  DEFAULT_REPEAT_MAX_DRIFT_MS,
  DEFAULT_SETTLEMENT_FRAMES,
  DEFAULT_TARGET_DEAD_ZONE_CM,
  DEFAULT_TRANSPORT_HIGH_WATER_BYTES,
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
