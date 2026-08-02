'use strict';

const DEFAULT_TRANSPORT_HEALTH_WINDOW_MS = 10000;
const DEFAULT_TRANSPORT_HEALTH_ACTIVE_WARMUP_MS = 1000;
const DEFAULT_TRANSPORT_HEALTH_ACTIVE_HOLD_MS = 2500;
const DEFAULT_TRANSPORT_LATENCY_BASELINE_WINDOW_MS = 60000;
const DEFAULT_TRANSPORT_LATENCY_DECISION_WINDOW_MS = 3000;
const DEFAULT_TRANSPORT_LATENCY_EXIT_MS = 2500;
const DEFAULT_TRANSPORT_LATENCY_EXIT_SUSTAIN_MS = 2000;
const CRITICAL_TRANSPORT_LATENCY_NON_COMBAT_P90_MS = 5000;
const CRITICAL_TRANSPORT_LATENCY_COMBAT_P90_MS = 3000;
const CRITICAL_TRANSPORT_LATENCY_LOW_HP_COMBAT_P90_MS = 2000;
const CRITICAL_TRANSPORT_LATENCY_P90_SUSTAIN_MS = 1000;
const CRITICAL_TRANSPORT_LATENCY_CURRENT_MULTIPLIER = 2;
const CRITICAL_TRANSPORT_LATENCY_CURRENT_FRAMES = 3;
const CRITICAL_TRANSPORT_LATENCY_LOW_HP = 50;
const DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_RATE = 0.05;
const DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_SUSTAIN_MS = 2000;
const DEFAULT_TRANSPORT_FRAME_LOSS_MINIMUM_EXPECTED_TICKS = 100;
const DEFAULT_TRANSPORT_SERVER_TICK_MS = 50;
const DEFAULT_TRANSPORT_LATENCY_MINIMUM_SAMPLES = 10;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function rounded(value, digits = 0) {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  const factor = 10 ** Math.max(0, Number(digits || 0));
  return Math.round(numeric * factor) / factor;
}

function percentile(values, ratio) {
  const sorted = (values || []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function nonzeroDirection(direction) {
  return Boolean(Number(direction?.dx || 0) || Number(direction?.dy || 0));
}

function criticalTransportLatencyProfile(context = {}) {
  const combatActive = context.combatActive === true;
  const selfHp = numberOrNull(context.selfHp);
  const lowHpCombat = Boolean(combatActive && selfHp !== null && selfHp <= CRITICAL_TRANSPORT_LATENCY_LOW_HP);
  const p90ThresholdMs = lowHpCombat
    ? CRITICAL_TRANSPORT_LATENCY_LOW_HP_COMBAT_P90_MS
    : (combatActive ? CRITICAL_TRANSPORT_LATENCY_COMBAT_P90_MS : CRITICAL_TRANSPORT_LATENCY_NON_COMBAT_P90_MS);
  return {
    key: lowHpCombat ? 'combat-low-hp' : (combatActive ? 'combat' : 'non-combat'),
    combatActive,
    lowHpCombat,
    selfHp,
    lowHpThreshold: CRITICAL_TRANSPORT_LATENCY_LOW_HP,
    p90ThresholdMs,
    currentThresholdMs: p90ThresholdMs * CRITICAL_TRANSPORT_LATENCY_CURRENT_MULTIPLIER
  };
}

function bulletOwnerId(bullet) {
  const value = bullet?.owner_user_id
    ?? bullet?.ownerUserId
    ?? bullet?.owner_id
    ?? bullet?.ownerId
    ?? bullet?.user_id
    ?? bullet?.userId;
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function commandTimingSummary(state = {}) {
  const movementTiming = state?.command?.movement?.timing || {};
  const movementSource = String(movementTiming.source || '');
  const movementMeasured = movementSource && movementSource !== 'startup-default';
  const movementP90WallMs = numberOrNull(movementTiming.p90WallMs);
  const movementP90Ticks = numberOrNull(movementTiming.p90Ticks);
  const movementP90Ms = movementMeasured
    ? (movementP90WallMs ?? (movementP90Ticks === null ? null : movementP90Ticks * DEFAULT_TRANSPORT_SERVER_TICK_MS))
    : null;
  const confirmedShots = Array.isArray(state?.command?.shooting?.confirmedShots)
    ? state.command.shooting.confirmedShots
    : [];
  const shootingAckValues = confirmedShots
    .map(shot => numberOrNull(shot?.requestToAckMs))
    .filter(value => value !== null)
    .slice(-64);
  return {
    movementP90Ms: rounded(movementP90Ms),
    movementSampleCount: Math.max(
      0,
      Number(movementTiming.sampleCount || 0),
      Number(movementTiming.exactSampleCount || 0),
      Number(movementTiming.boundedSampleCount || 0)
    ),
    movementSource,
    shootingAckP90Ms: rounded(percentile(shootingAckValues, 0.9)),
    shootingAckSampleCount: shootingAckValues.length
  };
}

function realtimeTransportActivityAssessment(state = {}, context = {}) {
  const self = state?.realtime?.self || null;
  const selfId = String(self?.user_id ?? self?.userId ?? '');
  const movement = state?.command?.movement || {};
  const shooting = state?.command?.shooting || {};
  const decision = context.lastDecision || context.decision || null;
  const action = decision?.action || decision || {};
  const kind = String(action.kind || decision?.kind || '');
  const band = String(action.band || decision?.band || '');
  const pendingVelocityCommands = Array.isArray(movement.pendingVelocityCommands)
    ? movement.pendingVelocityCommands
    : [];
  const pendingShots = Array.isArray(shooting.pendingShots) ? shooting.pendingShots : [];
  const bullets = Array.isArray(state?.realtime?.bullets) ? state.realtime.bullets : [];
  const nonSelfBullets = bullets.filter(bullet => !selfId || bulletOwnerId(bullet) !== selfId);
  const selfMoving = Boolean(Math.abs(Number(self?.vx || 0)) > 0.001 || Math.abs(Number(self?.vy || 0)) > 0.001);
  const requestedMovement = nonzeroDirection(movement.lastRequestedDirection);
  const pendingMovement = pendingVelocityCommands.some(nonzeroDirection);
  const combatControl = band === 'combat'
    || kind === 'combat-live'
    || kind === 'combat-candidate'
    || Boolean(decision?.combat?.target);
  const safetyControl = band === 'safety'
    || kind === 'flee'
    || kind === 'safety-exit';
  const recentInjury = Boolean(
    action.injury?.active
      || decision?.injury?.active
      || action.threatEvidence?.recentDamage
  );
  const reasons = [
    selfMoving ? 'self-moving' : '',
    requestedMovement ? 'movement-requested' : '',
    pendingMovement ? 'movement-pending' : '',
    pendingShots.length ? 'shoot-pending' : '',
    combatControl ? 'combat-control' : '',
    safetyControl ? 'safety-control' : '',
    nonSelfBullets.length ? 'hostile-bullet-visible' : '',
    recentInjury ? 'recent-injury' : ''
  ].filter(Boolean);
  return {
    active: reasons.length > 0,
    reasons,
    decisionKind: kind,
    decisionBand: band,
    selfMoving,
    requestedMovement,
    pendingMovement,
    pendingMovementCount: pendingVelocityCommands.length,
    pendingShotCount: pendingShots.length,
    nonSelfBulletCount: nonSelfBullets.length,
    combatControl,
    safetyControl,
    recentInjury,
    command: commandTimingSummary(state)
  };
}

function createTransportHealthMonitor(options = {}) {
  const serverTickMs = Math.max(1, Number(options.serverTickMs || DEFAULT_TRANSPORT_SERVER_TICK_MS));
  const windowMs = Math.max(1000, Number(options.windowMs || DEFAULT_TRANSPORT_HEALTH_WINDOW_MS));
  const activeWarmupMs = Math.max(0, Number(options.activeWarmupMs ?? DEFAULT_TRANSPORT_HEALTH_ACTIVE_WARMUP_MS));
  const activeHoldMs = Math.max(0, Number(options.activeHoldMs ?? DEFAULT_TRANSPORT_HEALTH_ACTIVE_HOLD_MS));
  const latencyBaselineWindowMs = Math.max(
    windowMs,
    Number(options.latencyBaselineWindowMs || DEFAULT_TRANSPORT_LATENCY_BASELINE_WINDOW_MS)
  );
  const latencyDecisionWindowMs = Math.max(
    serverTickMs,
    Number(options.latencyDecisionWindowMs || DEFAULT_TRANSPORT_LATENCY_DECISION_WINDOW_MS)
  );
  const latencyExitMs = Math.max(100, Number(options.latencyExitMs || DEFAULT_TRANSPORT_LATENCY_EXIT_MS));
  const latencyExitSustainMs = Math.max(
    0,
    Number(options.latencyExitSustainMs ?? DEFAULT_TRANSPORT_LATENCY_EXIT_SUSTAIN_MS)
  );
  const latencyMinimumSamples = Math.max(
    1,
    Number(options.latencyMinimumSamples || DEFAULT_TRANSPORT_LATENCY_MINIMUM_SAMPLES)
  );
  const frameLossExitRate = Math.max(
    0,
    Math.min(1, Number(options.frameLossExitRate ?? DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_RATE))
  );
  const frameLossExitSustainMs = Math.max(
    0,
    Number(options.frameLossExitSustainMs ?? DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_SUSTAIN_MS)
  );
  const frameLossMinimumExpectedTicks = Math.max(
    1,
    Number(options.frameLossMinimumExpectedTicks || DEFAULT_TRANSPORT_FRAME_LOSS_MINIMUM_EXPECTED_TICKS)
  );
  const maximumSamples = Math.max(256, Number(options.maximumSamples || 4096));

  let connected = false;
  let connectedAtMs = 0;
  let activityEvidenceAtMs = null;
  let activityStartedAtMs = null;
  let activityInactiveAtMs = null;
  let lastActivity = realtimeTransportActivityAssessment();
  let lastObservedTick = null;
  let lastSampledTick = null;
  let lastFrameAtMs = 0;
  let lastFrameType = '';
  let currentLatencyOffset = null;
  let currentQueueDelayMs = null;
  let frameCount = 0;
  let duplicateTickCount = 0;
  let outOfOrderTickCount = 0;
  let tickResetCount = 0;
  let latencyBreachSinceMs = null;
  let criticalLatencyBreachSinceMs = null;
  let criticalCurrentLatencyFrameStreak = 0;
  let lastCriticalAssessedTick = null;
  let lastCriticalLatencyProfile = criticalTransportLatencyProfile();
  let frameLossBreachSinceMs = null;
  let lastAssessment = null;
  const offsetSamples = [];
  const latencySamples = [];
  const frameLossSamples = [];
  const queueSamples = [];

  function trimBounded(list) {
    if (list.length > maximumSamples) list.splice(0, list.length - maximumSamples);
  }

  function prune(list, cutoffMs) {
    while (list.length && Number(list[0]?.atMs || 0) < cutoffMs) list.shift();
  }

  function resetSamplingBaseline() {
    lastSampledTick = null;
    latencyBreachSinceMs = null;
    frameLossBreachSinceMs = null;
    lastAssessment = null;
  }

  function phaseAt(nowMs) {
    if (!connected) return 'offline';
    if (activityStartedAtMs === null) return 'paused';
    if (activityInactiveAtMs !== null && nowMs - activityInactiveAtMs > activeHoldMs) {
      if (activityStartedAtMs !== null) {
        activityStartedAtMs = null;
        activityInactiveAtMs = null;
        resetSamplingBaseline();
      }
      return 'paused';
    }
    return nowMs - activityStartedAtMs < activeWarmupMs ? 'warming' : 'active';
  }

  function setConnected(value, atMs = Date.now()) {
    const next = Boolean(value);
    if (connected === next) return snapshot(atMs);
    connected = next;
    connectedAtMs = next ? Number(atMs || Date.now()) : 0;
    activityEvidenceAtMs = null;
    activityStartedAtMs = null;
    activityInactiveAtMs = null;
    lastSampledTick = null;
    latencyBreachSinceMs = null;
    criticalLatencyBreachSinceMs = null;
    criticalCurrentLatencyFrameStreak = 0;
    lastCriticalAssessedTick = null;
    lastCriticalLatencyProfile = criticalTransportLatencyProfile();
    frameLossBreachSinceMs = null;
    lastAssessment = null;
    if (!next) currentQueueDelayMs = null;
    return snapshot(atMs);
  }

  function updateActivity(activity, atMs = Date.now()) {
    const current = activity && typeof activity === 'object'
      ? activity
      : { active: Boolean(activity), reasons: [] };
    const nowMs = Number(atMs || Date.now());
    const wasExpired = activityStartedAtMs === null
      || (activityInactiveAtMs !== null && nowMs - activityInactiveAtMs > activeHoldMs);
    lastActivity = {
      ...current,
      active: Boolean(current.active),
      reasons: Array.isArray(current.reasons) ? current.reasons.slice(0, 12) : []
    };
    if (current.active) {
      if (activityStartedAtMs === null || wasExpired) {
        activityStartedAtMs = nowMs;
        resetSamplingBaseline();
      }
      activityEvidenceAtMs = nowMs;
      activityInactiveAtMs = null;
    } else if (activityStartedAtMs !== null && activityInactiveAtMs === null) {
      activityInactiveAtMs = nowMs;
    }
    return {
      ...lastActivity,
      mode: phaseAt(nowMs)
    };
  }

  function resetForTickRegression(tick) {
    offsetSamples.length = 0;
    latencySamples.length = 0;
    frameLossSamples.length = 0;
    lastObservedTick = tick;
    lastSampledTick = null;
    currentLatencyOffset = null;
    latencyBreachSinceMs = null;
    criticalLatencyBreachSinceMs = null;
    criticalCurrentLatencyFrameStreak = 0;
    lastCriticalAssessedTick = null;
    frameLossBreachSinceMs = null;
    tickResetCount += 1;
  }

  function observeFrame(frame = {}, meta = {}) {
    const type = String(frame?.decodedType || frame?.decodedJson?.type || '');
    const tick = numberOrNull(frame?.decodedTick ?? frame?.decodedJson?.tick);
    if (!['pos', 'snapshot'].includes(type) || tick === null) return null;
    const receivedAtMs = Number(meta.receivedAtMs || Date.now());
    frameCount += 1;
    lastFrameAtMs = receivedAtMs;
    lastFrameType = type;
    if (lastObservedTick !== null && tick < lastObservedTick) {
      outOfOrderTickCount += 1;
      if (lastObservedTick - tick > 5) resetForTickRegression(tick);
      return true;
    }
    if (lastObservedTick !== null && tick === lastObservedTick) {
      duplicateTickCount += 1;
      return true;
    }

    lastObservedTick = tick;
    const offset = receivedAtMs - tick * serverTickMs;
    currentLatencyOffset = offset;
    offsetSamples.push({ atMs: receivedAtMs, offset });
    trimBounded(offsetSamples);
    prune(offsetSamples, receivedAtMs - latencyBaselineWindowMs);
    const phase = phaseAt(receivedAtMs);
    if (phase !== 'active') {
      lastSampledTick = null;
      return true;
    }

    latencySamples.push({ atMs: receivedAtMs, offset });
    trimBounded(latencySamples);
    if (lastSampledTick !== null && tick > lastSampledTick) {
      const expected = tick - lastSampledTick;
      frameLossSamples.push({
        atMs: receivedAtMs,
        expected,
        missing: Math.max(0, expected - 1)
      });
      trimBounded(frameLossSamples);
    }
    lastSampledTick = tick;
    return true;
  }

  function observeProcessing(meta = {}) {
    const processedAtMs = Number(meta.processedAtMs || Date.now());
    const receivedAtMs = numberOrNull(meta.receivedAtMs);
    if (receivedAtMs === null) return null;
    currentQueueDelayMs = Math.max(0, processedAtMs - receivedAtMs);
    if (phaseAt(processedAtMs) === 'active') {
      queueSamples.push({ atMs: processedAtMs, delayMs: currentQueueDelayMs });
      trimBounded(queueSamples);
    }
    return currentQueueDelayMs;
  }

  function metricSnapshot(nowMs) {
    const phase = phaseAt(nowMs);
    prune(offsetSamples, nowMs - latencyBaselineWindowMs);
    prune(latencySamples, nowMs - Math.max(windowMs, latencyDecisionWindowMs));
    prune(frameLossSamples, nowMs - windowMs);
    prune(queueSamples, nowMs - Math.max(windowMs, latencyDecisionWindowMs));
    const baselineOffset = offsetSamples.length
      ? Math.min(...offsetSamples.map(sample => Number(sample.offset)))
      : null;
    const relativeLatency = sample => baselineOffset === null
      ? null
      : Math.max(0, Number(sample.offset) - baselineOffset);
    const currentLatencyMs = currentLatencyOffset === null || baselineOffset === null
      ? null
      : Math.max(0, currentLatencyOffset - baselineOffset);
    const latencyDecisionSamples = latencySamples.filter(sample => sample.atMs >= nowMs - latencyDecisionWindowMs);
    const latencyValues = latencyDecisionSamples.map(relativeLatency).filter(value => value !== null);
    const criticalLatencyValues = offsetSamples
      .filter(sample => sample.atMs >= nowMs - latencyDecisionWindowMs)
      .map(relativeLatency)
      .filter(value => value !== null);
    const queueDecisionSamples = queueSamples.filter(sample => sample.atMs >= nowMs - latencyDecisionWindowMs);
    let missingTicks = 0;
    let expectedTicks = 0;
    for (const sample of frameLossSamples) {
      missingTicks += Math.max(0, Number(sample.missing || 0));
      expectedTicks += Math.max(0, Number(sample.expected || 0));
    }
    const frameLossRate = expectedTicks > 0 ? missingTicks / expectedTicks : null;
    const lastFrameAgeMs = lastFrameAtMs ? Math.max(0, nowMs - lastFrameAtMs) : null;
    return {
      enabled: true,
      connected,
      mode: phase,
      modeLabel: phase === 'active'
        ? 'active-sampling'
        : (phase === 'warming' ? 'warming' : (phase === 'paused' ? 'idle-paused' : 'offline')),
      connectedAt: connectedAtMs ? new Date(connectedAtMs).toISOString() : '',
      activity: {
        activeEvidence: Boolean(lastActivity?.active),
        reasons: Array.isArray(lastActivity?.reasons) ? lastActivity.reasons.slice(0, 12) : [],
        evidenceAt: activityEvidenceAtMs === null ? '' : new Date(activityEvidenceAtMs).toISOString(),
        activeSince: activityStartedAtMs === null ? '' : new Date(activityStartedAtMs).toISOString(),
        warmupRemainingMs: phase === 'warming'
          ? Math.max(0, activeWarmupMs - (nowMs - Number(activityStartedAtMs || nowMs)))
          : 0,
        holdRemainingMs: activityInactiveAtMs === null
          ? 0
          : Math.max(0, activeHoldMs - (nowMs - activityInactiveAtMs)),
        decisionKind: String(lastActivity?.decisionKind || ''),
        decisionBand: String(lastActivity?.decisionBand || '')
      },
      latency: {
        source: 'state-tick-relative-best-offset',
        currentMs: rounded(currentLatencyMs),
        p90Ms: rounded(percentile(latencyValues, 0.9)),
        sampleCount: latencyValues.length,
        decisionWindowMs: latencyDecisionWindowMs,
        baselineWindowMs: latencyBaselineWindowMs,
        exitThresholdMs: latencyExitMs,
        exitSustainMs: latencyExitSustainMs,
        minimumSamples: latencyMinimumSamples,
        critical: {
          p90Ms: rounded(percentile(criticalLatencyValues, 0.9)),
          sampleCount: criticalLatencyValues.length,
          profile: lastCriticalLatencyProfile.key,
          combatActive: lastCriticalLatencyProfile.combatActive,
          lowHpCombat: lastCriticalLatencyProfile.lowHpCombat,
          selfHp: lastCriticalLatencyProfile.selfHp,
          lowHpThreshold: lastCriticalLatencyProfile.lowHpThreshold,
          p90ThresholdMs: lastCriticalLatencyProfile.p90ThresholdMs,
          p90SustainMs: CRITICAL_TRANSPORT_LATENCY_P90_SUSTAIN_MS,
          currentThresholdMs: lastCriticalLatencyProfile.currentThresholdMs,
          currentMultiplier: CRITICAL_TRANSPORT_LATENCY_CURRENT_MULTIPLIER,
          currentFrameStreak: criticalCurrentLatencyFrameStreak,
          currentFrameThreshold: CRITICAL_TRANSPORT_LATENCY_CURRENT_FRAMES
        }
      },
      processingQueue: {
        currentMs: rounded(currentQueueDelayMs),
        p90Ms: rounded(percentile(queueDecisionSamples.map(sample => sample.delayMs), 0.9)),
        sampleCount: queueDecisionSamples.length,
        windowMs: latencyDecisionWindowMs
      },
      frameLoss: {
        source: 'state-tick-gap-inferred',
        rate: frameLossRate,
        percent: frameLossRate === null ? null : rounded(frameLossRate * 100, 2),
        missingTicks,
        expectedTicks,
        sampleCount: frameLossSamples.length,
        windowMs,
        exitRate: frameLossExitRate,
        exitPercent: rounded(frameLossExitRate * 100, 2),
        exitSustainMs: frameLossExitSustainMs,
        minimumExpectedTicks: frameLossMinimumExpectedTicks
      },
      command: {
        movementP90Ms: rounded(lastActivity?.command?.movementP90Ms),
        movementSampleCount: Math.max(0, Number(lastActivity?.command?.movementSampleCount || 0)),
        movementSource: String(lastActivity?.command?.movementSource || ''),
        shootingAckP90Ms: rounded(lastActivity?.command?.shootingAckP90Ms),
        shootingAckSampleCount: Math.max(0, Number(lastActivity?.command?.shootingAckSampleCount || 0))
      },
      frames: {
        count: frameCount,
        lastAt: lastFrameAtMs ? new Date(lastFrameAtMs).toISOString() : '',
        lastAgeMs: rounded(lastFrameAgeMs),
        lastType: lastFrameType,
        lastTick: lastObservedTick,
        duplicateTickCount,
        outOfOrderTickCount,
        tickResetCount
      }
    };
  }

  function snapshot(atMs = Date.now()) {
    const nowMs = Number(atMs || Date.now());
    const metrics = metricSnapshot(nowMs);
    if (!lastAssessment) {
      return {
        ...metrics,
        exit: {
          hostilePressure: false,
          criticalLatencyBreached: false,
          criticalLatencyBreachForMs: 0,
          criticalLatencyP90Triggered: false,
          criticalCurrentLatencyTriggered: false,
          criticalLatencyTriggered: false,
          latencyBreached: false,
          latencyBreachForMs: 0,
          latencyTriggered: false,
          frameLossBreached: false,
          frameLossBreachForMs: 0,
          frameLossTriggered: false,
          triggered: false,
          failureModes: []
        }
      };
    }
    return { ...metrics, exit: { ...lastAssessment.exit } };
  }

  function assess(context = {}) {
    const nowMs = Number(context.nowMs || Date.now());
    const criticalProfile = criticalTransportLatencyProfile(context);
    if (criticalProfile.key !== lastCriticalLatencyProfile.key) {
      criticalLatencyBreachSinceMs = null;
      criticalCurrentLatencyFrameStreak = 0;
      lastCriticalAssessedTick = null;
    }
    lastCriticalLatencyProfile = criticalProfile;
    const metrics = metricSnapshot(nowMs);
    const hostilePressure = Boolean(context.hostilePressure);
    const eligible = metrics.mode === 'active' && hostilePressure;
    const criticalLatencyBreached = Boolean(
      metrics.connected
        && numberOrNull(metrics.latency.critical?.p90Ms) !== null
        && Number(metrics.latency.critical.p90Ms) >= criticalProfile.p90ThresholdMs
    );
    criticalLatencyBreachSinceMs = criticalLatencyBreached
      ? (criticalLatencyBreachSinceMs ?? nowMs)
      : null;
    const criticalLatencyBreachForMs = criticalLatencyBreachSinceMs === null
      ? 0
      : Math.max(0, nowMs - criticalLatencyBreachSinceMs);
    const criticalLatencyP90Triggered = Boolean(
      criticalLatencyBreached
        && criticalLatencyBreachForMs >= CRITICAL_TRANSPORT_LATENCY_P90_SUSTAIN_MS
    );
    if (lastObservedTick !== null && lastObservedTick !== lastCriticalAssessedTick) {
      criticalCurrentLatencyFrameStreak = Number(metrics.latency.currentMs || 0) >= criticalProfile.currentThresholdMs
        ? criticalCurrentLatencyFrameStreak + 1
        : 0;
      lastCriticalAssessedTick = lastObservedTick;
      metrics.latency.critical.currentFrameStreak = criticalCurrentLatencyFrameStreak;
    }
    const criticalCurrentLatencyTriggered = Boolean(
      metrics.connected
        && Number(metrics.latency.currentMs || 0) >= criticalProfile.currentThresholdMs
        && criticalCurrentLatencyFrameStreak >= CRITICAL_TRANSPORT_LATENCY_CURRENT_FRAMES
    );
    const criticalLatencyTriggered = criticalLatencyP90Triggered || criticalCurrentLatencyTriggered;
    const latencyBreached = Boolean(
      eligible
        && Number(metrics.latency.sampleCount || 0) >= latencyMinimumSamples
        && numberOrNull(metrics.latency.p90Ms) !== null
        && Number(metrics.latency.p90Ms) >= latencyExitMs
    );
    const frameLossBreached = Boolean(
      eligible
        && Number(metrics.frameLoss.expectedTicks || 0) >= frameLossMinimumExpectedTicks
        && numberOrNull(metrics.frameLoss.rate) !== null
        && Number(metrics.frameLoss.rate) >= frameLossExitRate
    );
    latencyBreachSinceMs = latencyBreached
      ? (latencyBreachSinceMs ?? nowMs)
      : null;
    frameLossBreachSinceMs = frameLossBreached
      ? (frameLossBreachSinceMs ?? nowMs)
      : null;
    const latencyBreachForMs = latencyBreachSinceMs === null ? 0 : Math.max(0, nowMs - latencyBreachSinceMs);
    const frameLossBreachForMs = frameLossBreachSinceMs === null ? 0 : Math.max(0, nowMs - frameLossBreachSinceMs);
    const latencyTriggered = Boolean(latencyBreached && latencyBreachForMs >= latencyExitSustainMs);
    const frameLossTriggered = Boolean(frameLossBreached && frameLossBreachForMs >= frameLossExitSustainMs);
    const failureModes = [
      criticalLatencyTriggered ? 'critical-inbound-latency' : '',
      latencyTriggered ? 'inbound-latency' : '',
      frameLossTriggered ? 'frame-loss' : ''
    ].filter(Boolean);
    lastAssessment = {
      ...metrics,
      exit: {
        hostilePressure,
        criticalLatencyBreached,
        criticalLatencyBreachForMs,
        criticalLatencyP90Triggered,
        criticalCurrentLatencyTriggered,
        criticalLatencyTriggered,
        latencyBreached,
        latencyBreachForMs,
        latencyTriggered,
        frameLossBreached,
        frameLossBreachForMs,
        frameLossTriggered,
        triggered: failureModes.length > 0,
        failureModes
      }
    };
    return lastAssessment;
  }

  function reset() {
    connected = false;
    connectedAtMs = 0;
    activityEvidenceAtMs = null;
    activityStartedAtMs = null;
    activityInactiveAtMs = null;
    lastActivity = realtimeTransportActivityAssessment();
    lastObservedTick = null;
    lastSampledTick = null;
    lastFrameAtMs = 0;
    lastFrameType = '';
    currentLatencyOffset = null;
    currentQueueDelayMs = null;
    frameCount = 0;
    duplicateTickCount = 0;
    outOfOrderTickCount = 0;
    tickResetCount = 0;
    latencyBreachSinceMs = null;
    criticalLatencyBreachSinceMs = null;
    criticalCurrentLatencyFrameStreak = 0;
    lastCriticalAssessedTick = null;
    lastCriticalLatencyProfile = criticalTransportLatencyProfile();
    frameLossBreachSinceMs = null;
    lastAssessment = null;
    offsetSamples.length = 0;
    latencySamples.length = 0;
    frameLossSamples.length = 0;
    queueSamples.length = 0;
  }

  return {
    assess,
    observeFrame,
    observeProcessing,
    reset,
    setConnected,
    snapshot,
    updateActivity
  };
}

function runTransportHealthSelfTest() {
  const frame = tick => ({ decodedType: 'pos', decodedTick: tick, decodedJson: { type: 'pos', tick } });
  const activeState = {
    realtime: {
      self: { user_id: 7, vx: 10, vy: 0 },
      bullets: []
    },
    command: {
      movement: {
        timing: { source: 'startup-default', p90Ticks: 5 },
        lastRequestedDirection: { dx: 1, dy: 0 },
        pendingVelocityCommands: []
      },
      shooting: { pendingShots: [], confirmedShots: [] }
    }
  };
  const idleMonitor = createTransportHealthMonitor({ activeWarmupMs: 0, frameLossMinimumExpectedTicks: 2 });
  idleMonitor.setConnected(true, 1000);
  idleMonitor.updateActivity(realtimeTransportActivityAssessment({ realtime: { self: { user_id: 7, vx: 0, vy: 0 }, bullets: [] } }), 1000);
  idleMonitor.observeFrame(frame(10), { receivedAtMs: 1500 });
  idleMonitor.observeFrame(frame(20), { receivedAtMs: 2000 });
  const idle = idleMonitor.assess({ nowMs: 2000, hostilePressure: true });

  const duplicateMonitor = createTransportHealthMonitor({ activeWarmupMs: 0, frameLossMinimumExpectedTicks: 1 });
  duplicateMonitor.setConnected(true, 1000);
  duplicateMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  duplicateMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  duplicateMonitor.observeFrame({ decodedType: 'snapshot', decodedTick: 100, decodedJson: { type: 'snapshot', tick: 100 } }, { receivedAtMs: 5010 });
  duplicateMonitor.observeFrame(frame(101), { receivedAtMs: 5050 });
  const duplicate = duplicateMonitor.assess({ nowMs: 5050, hostilePressure: true });

  const noPressureMonitor = createTransportHealthMonitor({
    activeWarmupMs: 0,
    latencyExitMs: 100,
    latencyExitSustainMs: 0,
    latencyMinimumSamples: 1
  });
  noPressureMonitor.setConnected(true, 1000);
  noPressureMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  noPressureMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  noPressureMonitor.observeFrame(frame(101), { receivedAtMs: 6050 });
  const noPressure = noPressureMonitor.assess({ nowMs: 6050, hostilePressure: false });

  const criticalMonitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  criticalMonitor.setConnected(true, 1000);
  criticalMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  criticalMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  for (let index = 1; index <= 3; index += 1) {
    const atMs = 5000 + index * 50 + 29600;
    criticalMonitor.observeFrame(frame(100 + index), { receivedAtMs: atMs });
    criticalMonitor.assess({ nowMs: atMs, hostilePressure: false });
  }
  const critical = criticalMonitor.assess({ nowMs: 34750, hostilePressure: false });

  const criticalP90Monitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  criticalP90Monitor.setConnected(true, 1000);
  criticalP90Monitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  criticalP90Monitor.observeFrame(frame(101), { receivedAtMs: 11050 });
  criticalP90Monitor.assess({ nowMs: 11050, hostilePressure: false });
  const criticalP90 = criticalP90Monitor.assess({ nowMs: 12050, hostilePressure: false });

  const allowedNonCombatMonitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  allowedNonCombatMonitor.setConnected(true, 1000);
  allowedNonCombatMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  allowedNonCombatMonitor.observeFrame(frame(101), { receivedAtMs: 9550 });
  allowedNonCombatMonitor.assess({ nowMs: 9550, hostilePressure: false });
  const allowedNonCombat = allowedNonCombatMonitor.assess({ nowMs: 10550, hostilePressure: false });

  const combatP90Monitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  combatP90Monitor.setConnected(true, 1000);
  combatP90Monitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  combatP90Monitor.observeFrame(frame(101), { receivedAtMs: 8550 });
  combatP90Monitor.assess({ nowMs: 8550, hostilePressure: false, combatActive: true, selfHp: 80 });
  const combatP90 = combatP90Monitor.assess({
    nowMs: 9550,
    hostilePressure: false,
    combatActive: true,
    selfHp: 80
  });

  const lowHpCombatP90Monitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  lowHpCombatP90Monitor.setConnected(true, 1000);
  lowHpCombatP90Monitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  lowHpCombatP90Monitor.observeFrame(frame(101), { receivedAtMs: 7550 });
  lowHpCombatP90Monitor.assess({ nowMs: 7550, hostilePressure: false, combatActive: true, selfHp: 50 });
  const lowHpCombatP90 = lowHpCombatP90Monitor.assess({
    nowMs: 8550,
    hostilePressure: false,
    combatActive: true,
    selfHp: 50
  });

  const combatMonitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  combatMonitor.setConnected(true, 1000);
  combatMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  for (let index = 1; index <= 3; index += 1) {
    const atMs = 5000 + index * 50 + 6500;
    combatMonitor.observeFrame(frame(100 + index), { receivedAtMs: atMs });
    combatMonitor.assess({ nowMs: atMs, hostilePressure: false, combatActive: true, selfHp: 80 });
  }
  const combat = combatMonitor.assess({ nowMs: 11650, hostilePressure: false, combatActive: true, selfHp: 80 });

  const lowHpCombatMonitor = createTransportHealthMonitor({ activeWarmupMs: 0 });
  lowHpCombatMonitor.setConnected(true, 1000);
  lowHpCombatMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  for (let index = 1; index <= 3; index += 1) {
    const atMs = 5000 + index * 50 + 4500;
    lowHpCombatMonitor.observeFrame(frame(100 + index), { receivedAtMs: atMs });
    lowHpCombatMonitor.assess({ nowMs: atMs, hostilePressure: false, combatActive: true, selfHp: 50 });
  }
  const lowHpCombat = lowHpCombatMonitor.assess({
    nowMs: 9650,
    hostilePressure: false,
    combatActive: true,
    selfHp: 50
  });

  const latencyMonitor = createTransportHealthMonitor({
    activeWarmupMs: 0,
    activeHoldMs: 5000,
    latencyExitMs: 2500,
    latencyExitSustainMs: 2000,
    latencyMinimumSamples: 2
  });
  latencyMonitor.setConnected(true, 1000);
  latencyMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  latencyMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  for (let index = 1; index <= 50; index += 1) {
    const atMs = 5000 + index * 50 + 3000;
    latencyMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), atMs);
    latencyMonitor.observeFrame(frame(100 + index), { receivedAtMs: atMs });
    latencyMonitor.assess({ nowMs: atMs, hostilePressure: true });
  }
  const latency = latencyMonitor.assess({ nowMs: 10500, hostilePressure: true });

  const lossMonitor = createTransportHealthMonitor({
    activeWarmupMs: 0,
    activeHoldMs: 5000,
    frameLossMinimumExpectedTicks: 20,
    frameLossExitRate: 0.05,
    frameLossExitSustainMs: 2000
  });
  lossMonitor.setConnected(true, 1000);
  lossMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  lossMonitor.observeFrame(frame(100), { receivedAtMs: 5000 });
  lossMonitor.observeFrame(frame(102), { receivedAtMs: 5100 });
  for (let tick = 103; tick <= 120; tick += 1) {
    const atMs = 5100 + (tick - 102) * 50;
    lossMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), atMs);
    lossMonitor.observeFrame(frame(tick), { receivedAtMs: atMs });
    lossMonitor.assess({ nowMs: atMs, hostilePressure: true });
  }
  for (let tick = 122; tick <= 140; tick += 1) {
    const atMs = 6000 + (tick - 120) * 50;
    lossMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), atMs);
    lossMonitor.observeFrame(frame(tick), { receivedAtMs: atMs });
    lossMonitor.assess({ nowMs: atMs, hostilePressure: true });
  }
  for (let tick = 142; tick <= 160; tick += 1) {
    const atMs = 6000 + (tick - 120) * 50;
    lossMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), atMs);
    lossMonitor.observeFrame(frame(tick), { receivedAtMs: atMs });
    lossMonitor.assess({ nowMs: atMs, hostilePressure: true });
  }
  const loss = lossMonitor.assess({ nowMs: 8000, hostilePressure: true });

  const holdMonitor = createTransportHealthMonitor({ activeWarmupMs: 1000, activeHoldMs: 2500 });
  holdMonitor.setConnected(true, 1000);
  holdMonitor.updateActivity(realtimeTransportActivityAssessment(activeState), 1000);
  const warming = holdMonitor.snapshot(1500);
  holdMonitor.updateActivity({ active: false, reasons: [] }, 2000);
  const held = holdMonitor.snapshot(3000);
  const paused = holdMonitor.snapshot(4601);

  return {
    ok: Boolean(
      idle.mode === 'paused'
        && idle.frameLoss.expectedTicks === 0
        && idle.exit.triggered === false
        && duplicate.frameLoss.missingTicks === 0
        && duplicate.frameLoss.expectedTicks === 1
        && duplicate.frames.duplicateTickCount === 1
        && noPressure.exit.triggered === false
        && critical.exit.criticalLatencyTriggered === true
        && critical.exit.criticalCurrentLatencyTriggered === true
        && critical.latency.critical.currentFrameStreak === 3
        && criticalP90.exit.criticalLatencyP90Triggered === true
        && criticalP90.exit.criticalCurrentLatencyTriggered === false
        && allowedNonCombat.latency.critical.p90Ms === 4500
        && allowedNonCombat.exit.criticalLatencyTriggered === false
        && combatP90.latency.critical.p90ThresholdMs === 3000
        && combatP90.exit.criticalLatencyP90Triggered === true
        && combatP90.exit.criticalCurrentLatencyTriggered === false
        && lowHpCombatP90.latency.critical.p90ThresholdMs === 2000
        && lowHpCombatP90.exit.criticalLatencyP90Triggered === true
        && lowHpCombatP90.exit.criticalCurrentLatencyTriggered === false
        && combat.latency.critical.profile === 'combat'
        && combat.latency.critical.p90ThresholdMs === 3000
        && combat.latency.critical.currentThresholdMs === 6000
        && combat.exit.criticalCurrentLatencyTriggered === true
        && lowHpCombat.latency.critical.profile === 'combat-low-hp'
        && lowHpCombat.latency.critical.p90ThresholdMs === 2000
        && lowHpCombat.latency.critical.currentThresholdMs === 4000
        && lowHpCombat.exit.criticalCurrentLatencyTriggered === true
        && latency.exit.latencyTriggered === true
        && loss.exit.frameLossTriggered === true
        && warming.mode === 'warming'
        && held.mode === 'active'
        && paused.mode === 'paused'
    ),
    idle,
    duplicate,
    noPressure,
    critical,
    criticalP90,
    allowedNonCombat,
    combatP90,
    lowHpCombatP90,
    combat,
    lowHpCombat,
    latency,
    loss,
    activityHold: {
      warming: warming.mode,
      held: held.mode,
      paused: paused.mode
    }
  };
}

module.exports = {
  DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_RATE,
  DEFAULT_TRANSPORT_FRAME_LOSS_EXIT_SUSTAIN_MS,
  DEFAULT_TRANSPORT_FRAME_LOSS_MINIMUM_EXPECTED_TICKS,
  DEFAULT_TRANSPORT_HEALTH_ACTIVE_HOLD_MS,
  DEFAULT_TRANSPORT_HEALTH_ACTIVE_WARMUP_MS,
  DEFAULT_TRANSPORT_HEALTH_WINDOW_MS,
  DEFAULT_TRANSPORT_LATENCY_DECISION_WINDOW_MS,
  DEFAULT_TRANSPORT_LATENCY_EXIT_MS,
  DEFAULT_TRANSPORT_LATENCY_EXIT_SUSTAIN_MS,
  CRITICAL_TRANSPORT_LATENCY_COMBAT_P90_MS,
  CRITICAL_TRANSPORT_LATENCY_CURRENT_FRAMES,
  CRITICAL_TRANSPORT_LATENCY_CURRENT_MULTIPLIER,
  CRITICAL_TRANSPORT_LATENCY_LOW_HP,
  CRITICAL_TRANSPORT_LATENCY_LOW_HP_COMBAT_P90_MS,
  CRITICAL_TRANSPORT_LATENCY_NON_COMBAT_P90_MS,
  CRITICAL_TRANSPORT_LATENCY_P90_SUSTAIN_MS,
  criticalTransportLatencyProfile,
  DEFAULT_TRANSPORT_SERVER_TICK_MS,
  commandTimingSummary,
  createTransportHealthMonitor,
  realtimeTransportActivityAssessment,
  runTransportHealthSelfTest
};
