'use strict';

// Per-battle combat logging for the browserless runner.
//
// Instead of appending every combat frame to one unbounded `combat.jsonl`, each
// distinct engagement (`metrics.engagementId` = `<targetId>:<startedAt>`) is
// written to its own JSONL file under `<day>/battles/`. When the engagement
// ends (a different engagement takes over, the fight idles out, or the runner
// shuts down) the file is gzip-compressed to `<name>.jsonl.gz` and a one-line
// summary is appended to `<day>/battles/index.jsonl`.
//
// Frames without an engagement id (idle/search diagnostic frames, the bulk of
// the raw combat volume) are intentionally discarded here; they are not battle
// records.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { redactStructuredSecrets } = require('./session-client');
const { utc8DayKey } = require('./utc8-day');

const DEFAULT_IDLE_FINALIZE_MS = 15000;
const BATTLES_DIR = 'battles';
const INDEX_FILE = 'index.jsonl';
const SHOT_AMENDMENTS_FILE = 'shot-amendments.jsonl';
const MAX_INDEX_LINE_BYTES = 8192;
const BATTLE_INDEX_FORMAT_VERSION = 2;
const MAX_TRACKED_ENGAGEMENT_SEGMENTS = 256;
const MAX_TRAJECTORY_COVERAGE_SHOT_EVENTS = 128;
const SEGMENT_METRIC_FIELDS = Object.freeze([
  'intentShotCount',
  'wireRequestCount',
  'requestedShots',
  'acceptedShots',
  'confirmedHits',
  'targetDamage',
  'targetHealing',
  'selfDamage',
  'selfHealing',
  'incomingHits',
  'totalStaminaSpent',
  'shootingStaminaSpent',
  'movementStaminaSpent'
]);
const SEGMENT_METRIC_FIELD_NAMES = Object.freeze({
  intentShotCount: 'IntentShotCount',
  wireRequestCount: 'WireRequestCount',
  requestedShots: 'RequestedShots',
  acceptedShots: 'AcceptedShots',
  confirmedHits: 'ConfirmedHits',
  targetDamage: 'TargetDamage',
  targetHealing: 'TargetHealing',
  selfDamage: 'SelfDamage',
  selfHealing: 'SelfHealing',
  incomingHits: 'IncomingHits',
  totalStaminaSpent: 'TotalStaminaSpent',
  shootingStaminaSpent: 'ShootingStaminaSpent',
  movementStaminaSpent: 'MovementStaminaSpent'
});
const BEHAVIOR_MODE_KEYS = Object.freeze([
  'zigzag-strafe',
  'retreat-kite',
  'charge-close',
  'stationary',
  'mixed/unknown'
]);
const TRAJECTORY_COVERAGE_REASON_KEYS = Object.freeze([
  'coverage-disabled',
  'no-route-coverage',
  'intercept-unreachable',
  'coverage-evidence-not-ready',
  'live-single-applied',
  'live-volley-awaits-live-single-acceptance',
  'live-single-successful-aim-protected',
  'live-single-requires-coverage-qualification',
  'live-single-insufficient-aim-improvement',
  'no-trajectory-paths',
  'marginal-coverage-selected',
  'aim-improvement-below-threshold',
  'marginal-coverage-below-threshold',
  'no-shot-candidates',
  'other'
]);

function sanitizeEngagementId(value, fallback = 'battle') {
  const text = String(value == null ? '' : value)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return text || fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricSnapshot(metrics = {}) {
  const source = metrics && typeof metrics === 'object' ? metrics : {};
  return Object.fromEntries(SEGMENT_METRIC_FIELDS.map(field => [field, numberOrNull(source[field])]));
}

function zeroMetricBaseline(metrics = {}) {
  const snapshot = metricSnapshot(metrics);
  return Object.fromEntries(SEGMENT_METRIC_FIELDS.map(field => [
    field,
    snapshot[field] === null ? null : 0
  ]));
}

function segmentMetricDeltas(baseline = {}, metrics = {}) {
  const current = metricSnapshot(metrics);
  const prior = metricSnapshot(baseline);
  const values = {};
  const counterResetFields = [];
  for (const field of SEGMENT_METRIC_FIELDS) {
    const currentValue = current[field];
    const baselineValue = prior[field];
    if (currentValue === null) {
      values[field] = null;
      continue;
    }
    if (baselineValue === null) {
      values[field] = Math.max(0, currentValue);
      continue;
    }
    if (currentValue < baselineValue) {
      values[field] = Math.max(0, currentValue);
      counterResetFields.push(field);
      continue;
    }
    values[field] = Math.max(0, currentValue - baselineValue);
  }
  return { values, counterResetFields };
}

function segmentMetricSummary(values = {}) {
  const result = {};
  for (const field of SEGMENT_METRIC_FIELDS) {
    result[`segment${SEGMENT_METRIC_FIELD_NAMES[field]}`] = numberOrNull(values[field]);
  }
  const accepted = numberOrNull(values.acceptedShots);
  const hits = numberOrNull(values.confirmedHits);
  result.segmentEstimatedHitRate = accepted !== null && accepted > 0 && hits !== null
    ? Number((hits / accepted * 100).toFixed(1))
    : null;
  return result;
}

function physicalHpValue(detail, kind) {
  const value = detail && typeof detail === 'object' ? detail : {};
  const entity = value[kind] && typeof value[kind] === 'object' ? value[kind] : null;
  const direct = numberOrNull(entity?.hp ?? entity?.knownHp ?? entity?.displayHp);
  if (direct !== null) return direct;
  const scalar = kind === 'self' ? value.selfHp : value.targetHp;
  return numberOrNull(scalar);
}

function createPhysicalSegmentLedger() {
  return {
    dispatchCount: 0,
    acceptedCount: 0,
    skipCount: 0,
    executionEventCount: 0,
    firstMetrics: null,
    lastMetrics: null,
    firstSelfHp: null,
    lastSelfHp: null,
    firstTargetHp: null,
    lastTargetHp: null,
    selfHpSamples: 0,
    targetHpSamples: 0,
    selfDamage: 0,
    selfHealing: 0,
    targetDamage: 0,
    targetHealing: 0,
    selfDamageEvents: 0,
    targetDamageEvents: 0,
    generationSet: new Set(),
    eventTypes: Object.create(null)
  };
}

function observePhysicalSegmentFrame(ledger, detail) {
  const next = ledger || createPhysicalSegmentLedger();
  const value = detail && typeof detail === 'object' ? detail : {};
  const metrics = value.metrics && typeof value.metrics === 'object' ? value.metrics : null;
  if (metrics) {
    if (!next.firstMetrics) next.firstMetrics = metricSnapshot(metrics);
    next.lastMetrics = metricSnapshot(metrics);
  }
  for (const kind of ['self', 'target']) {
    const hp = physicalHpValue(value, kind);
    if (hp === null) continue;
    const firstKey = kind === 'self' ? 'firstSelfHp' : 'firstTargetHp';
    const lastKey = kind === 'self' ? 'lastSelfHp' : 'lastTargetHp';
    const samplesKey = kind === 'self' ? 'selfHpSamples' : 'targetHpSamples';
    const damageKey = kind === 'self' ? 'selfDamage' : 'targetDamage';
    const healingKey = kind === 'self' ? 'selfHealing' : 'targetHealing';
    const damageEventsKey = kind === 'self' ? 'selfDamageEvents' : 'targetDamageEvents';
    if (next[firstKey] === null) next[firstKey] = hp;
    const previous = next[lastKey];
    next[samplesKey] += 1;
    if (previous !== null && hp < previous - 0.01) {
      next[damageKey] += previous - hp;
      next[damageEventsKey] += 1;
    } else if (previous !== null && hp > previous + 0.01) {
      next[healingKey] += hp - previous;
    }
    next[lastKey] = hp;
  }
  return next;
}

function recordPhysicalExecution(ledger, event) {
  const next = ledger || createPhysicalSegmentLedger();
  const value = event && typeof event === 'object' ? event : {};
  const type = String(value.type || '');
  if (!type) return next;
  next.executionEventCount += 1;
  next.eventTypes[type] = Number(next.eventTypes[type] || 0) + 1;
  if (value.engagementGeneration) next.generationSet.add(String(value.engagementGeneration));
  if (type === 'shoot-dispatch') next.dispatchCount += 1;
  if (type === 'shoot-ack-accepted') next.acceptedCount += 1;
  if (type === 'shoot-skip') next.skipCount += 1;
  return next;
}

function physicalSegmentSummary(ledger, fallbackValues = {}) {
  const value = ledger || createPhysicalSegmentLedger();
  const fallback = metricSnapshot(fallbackValues);
  const hasExecution = value.executionEventCount > 0;
  const hasSelfHp = value.selfHpSamples > 0;
  const hasTargetHp = value.targetHpSamples > 0;
  const hasSelfHpDelta = value.selfHpSamples > 1;
  const hasTargetHpDelta = value.targetHpSamples > 1;
  const fields = {
    intentShotCount: fallback.intentShotCount,
    wireRequestCount: hasExecution ? value.dispatchCount : 0,
    requestedShots: hasExecution ? value.dispatchCount : 0,
    acceptedShots: hasExecution ? value.acceptedCount : 0,
    confirmedHits: hasExecution
      ? Math.min(value.acceptedCount, Math.max(0, Number(fallback.confirmedHits || 0)))
      : 0,
    targetDamage: hasTargetHp ? value.targetDamage : 0,
    targetHealing: hasTargetHp ? value.targetHealing : 0,
    selfDamage: hasSelfHp ? value.selfDamage : 0,
    selfHealing: hasSelfHp ? value.selfHealing : 0,
    incomingHits: hasSelfHp ? value.selfDamageEvents : 0,
    totalStaminaSpent: fallback.totalStaminaSpent,
    shootingStaminaSpent: fallback.shootingStaminaSpent,
    movementStaminaSpent: fallback.movementStaminaSpent
  };
  const requested = Math.max(0, Number(fields.requestedShots || 0));
  const accepted = Math.max(0, Number(fields.acceptedShots || 0));
  return {
    values: fields,
    source: hasExecution || hasSelfHp || hasTargetHp ? 'physical-ledger' : 'runtime-cumulative-fallback',
    sourceFields: {
      intentShotCount: 'runtime-cumulative-fallback',
      wireRequestCount: hasExecution ? 'physical-execution-events' : 'physical-execution-events-empty',
      requestedShots: hasExecution ? 'physical-execution-events' : 'physical-execution-events-empty',
      acceptedShots: hasExecution ? 'physical-execution-events' : 'physical-execution-events-empty',
      confirmedHits: hasExecution ? 'runtime-cumulative-fallback-within-segment' : 'physical-execution-events-empty',
      targetDamage: hasTargetHpDelta ? 'adjacent-realtime-target-hp' : 'unresolved-no-adjacent-target-hp',
      targetHealing: hasTargetHpDelta ? 'adjacent-realtime-target-hp' : 'unresolved-no-adjacent-target-hp',
      selfDamage: hasSelfHpDelta ? 'adjacent-realtime-self-hp' : 'unresolved-no-adjacent-self-hp',
      selfHealing: hasSelfHpDelta ? 'adjacent-realtime-self-hp' : 'unresolved-no-adjacent-self-hp',
      incomingHits: hasSelfHpDelta ? 'adjacent-realtime-self-hp-events' : 'unresolved-no-adjacent-self-hp',
      totalStaminaSpent: 'runtime-cumulative-fallback',
      shootingStaminaSpent: 'runtime-cumulative-fallback',
      movementStaminaSpent: 'runtime-cumulative-fallback'
    },
    invariant: {
      acceptedNotOverRequested: accepted <= requested,
      physicalDispatchCount: value.dispatchCount,
      physicalAcceptedCount: value.acceptedCount,
      physicalSkipCount: value.skipCount,
      selfDamageMatchesAdjacentHp: !hasSelfHpDelta || Math.abs(value.selfDamage
        - value.selfHealing
        - (Number(value.firstSelfHp) - Number(value.lastSelfHp))) < 0.01,
      targetDamageMatchesAdjacentHp: !hasTargetHpDelta || Math.abs(value.targetDamage
        - value.targetHealing
        - (Number(value.firstTargetHp) - Number(value.lastTargetHp))) < 0.01,
      healingSeparate: true,
      generationCount: value.generationSet.size,
      selfDamageEvidence: hasSelfHpDelta ? 'complete-adjacent-hp' : (hasSelfHp ? 'single-hp-sample' : 'missing'),
      targetDamageEvidence: hasTargetHpDelta ? 'complete-adjacent-hp' : (hasTargetHp ? 'single-hp-sample' : 'missing')
    },
    raw: {
      dispatchCount: value.dispatchCount,
      acceptedCount: value.acceptedCount,
      skipCount: value.skipCount,
      selfHpSamples: value.selfHpSamples,
      targetHpSamples: value.targetHpSamples,
      firstSelfHp: value.firstSelfHp,
      lastSelfHp: value.lastSelfHp,
      firstTargetHp: value.firstTargetHp,
      lastTargetHp: value.lastTargetHp,
      selfDamage: value.selfDamage,
      selfHealing: value.selfHealing,
      targetDamage: value.targetDamage,
      targetHealing: value.targetHealing,
      selfDamageEvents: value.selfDamageEvents,
      targetDamageEvents: value.targetDamageEvents,
      eventTypes: { ...value.eventTypes }
    }
  };
}

function cumulativeMetricSummary(metrics = {}) {
  const snapshot = metricSnapshot(metrics);
  const result = {};
  for (const field of SEGMENT_METRIC_FIELDS) {
    result[`engagementCumulative${SEGMENT_METRIC_FIELD_NAMES[field]}`] = snapshot[field];
  }
  const accepted = snapshot.acceptedShots;
  const hits = snapshot.confirmedHits;
  result.engagementEstimatedHitRate = accepted !== null && accepted > 0 && hits !== null
    ? Number((hits / accepted * 100).toFixed(1))
    : null;
  return result;
}

function extractEngagementId(detail) {
  const metrics = detail && typeof detail === 'object' ? detail.metrics : null;
  if (!metrics || typeof metrics !== 'object') return '';
  const id = metrics.engagementId;
  return id === null || id === undefined ? '' : String(id);
}

function boundedCounter(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function normalizeBehaviorMode(value) {
  const mode = String(value || '');
  return BEHAVIOR_MODE_KEYS.includes(mode) ? mode : 'mixed/unknown';
}

function normalizeTrajectoryCoverageReason(value) {
  const reason = String(value || '');
  return TRAJECTORY_COVERAGE_REASON_KEYS.includes(reason) ? reason : 'other';
}

function boundedIncrement(counter, key, limit = 8) {
  const normalized = String(key || 'other').slice(0, 64) || 'other';
  if (Object.prototype.hasOwnProperty.call(counter, normalized)) {
    counter[normalized] += 1;
    return;
  }
  const keys = Object.keys(counter);
  if (keys.length >= limit) {
    counter.other = Number(counter.other || 0) + 1;
    return;
  }
  counter[normalized] = 1;
}

function createTrajectoryCoverageShotObservations(acceptedShotFloor = 0) {
  return {
    acceptedShotFloor: Math.max(0, Number(acceptedShotFloor || 0)),
    events: new Map(),
    appliedAcceptedShots: 0,
    appliedConfirmedHits: 0,
    baselineExpectedMissTotal: 0,
    baselineExpectedMissSamples: 0,
    selectedExpectedMissTotal: 0,
    selectedExpectedMissSamples: 0,
    expectedMissImprovementTotal: 0,
    expectedMissImprovementSamples: 0,
    hypothesisCounts: {},
    variantCounts: {},
    selectionModeCounts: {}
  };
}

function finiteAttributionNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = numberOrNull(value);
  return number === null ? null : number;
}

function trajectoryCoverageEventId(event = {}) {
  const bulletId = String(event.bulletId ?? event.bullet_id ?? '');
  if (bulletId) return `bullet:${bulletId}`;
  const ordinal = finiteAttributionNumber(event.acceptedShotOrdinal);
  return ordinal === null ? '' : `accepted:${Math.round(ordinal)}`;
}

function addTrajectoryCoverageShotObservation(observed, event = {}, options = {}) {
  const value = event && typeof event === 'object' ? event : {};
  if (value.coverageApplied !== true) return false;
  const id = trajectoryCoverageEventId(value);
  if (!id) return false;
  const ordinal = finiteAttributionNumber(value.acceptedShotOrdinal);
  const floor = Math.max(0, Number(options.acceptedShotFloor ?? observed.acceptedShotFloor ?? 0));
  if (ordinal !== null && ordinal <= floor) return false;
  let row = observed.events.get(id);
  if (!row) {
    if (observed.events.size >= MAX_TRAJECTORY_COVERAGE_SHOT_EVENTS) {
      const oldest = observed.events.keys().next().value;
      if (oldest) observed.events.delete(oldest);
    }
    row = {
      id,
      confirmedHit: false,
      baselineExpectedMissCm: finiteAttributionNumber(value.baselineExpectedMissCm),
      selectedExpectedMissCm: finiteAttributionNumber(value.selectedExpectedMissCm),
      expectedMissImprovementCm: finiteAttributionNumber(value.expectedMissImprovementCm),
      hypothesis: String(value.hypothesis || '').slice(0, 64),
      variant: String(value.variant || '').slice(0, 64),
      selectionMode: String(value.selectionMode || '').slice(0, 64)
    };
    observed.events.set(id, row);
    observed.appliedAcceptedShots += 1;
    if (row.baselineExpectedMissCm !== null) {
      observed.baselineExpectedMissTotal += row.baselineExpectedMissCm;
      observed.baselineExpectedMissSamples += 1;
    }
    if (row.selectedExpectedMissCm !== null) {
      observed.selectedExpectedMissTotal += row.selectedExpectedMissCm;
      observed.selectedExpectedMissSamples += 1;
    }
    if (row.expectedMissImprovementCm !== null) {
      observed.expectedMissImprovementTotal += row.expectedMissImprovementCm;
      observed.expectedMissImprovementSamples += 1;
    }
    boundedIncrement(observed.hypothesisCounts, row.hypothesis || 'other');
    boundedIncrement(observed.variantCounts, row.variant || 'other');
    boundedIncrement(observed.selectionModeCounts, row.selectionMode || 'other');
  }
  if (!row.confirmedHit && value.confirmedHit === true) {
    row.confirmedHit = true;
    observed.appliedConfirmedHits += 1;
  }
  return true;
}

function observeTrajectoryCoverageShots(observed, metrics = {}) {
  const entries = Array.isArray(metrics?.coverageShotAttribution)
    ? metrics.coverageShotAttribution
    : [];
  for (const entry of entries) addTrajectoryCoverageShotObservation(observed, entry);
  return observed;
}

function roundedMean(total, samples) {
  return samples > 0 ? Number((total / samples).toFixed(1)) : null;
}

function summarizeTrajectoryCoverageShots(observed, prefix) {
  const value = observed || createTrajectoryCoverageShotObservations();
  const appliedAcceptedShots = Math.max(0, Number(value.appliedAcceptedShots || 0));
  const appliedConfirmedHits = Math.max(0, Number(value.appliedConfirmedHits || 0));
  return {
    [`${prefix}TrajectoryCoverageAppliedAcceptedShots`]: appliedAcceptedShots,
    [`${prefix}TrajectoryCoverageAppliedConfirmedHits`]: appliedConfirmedHits,
    [`${prefix}TrajectoryCoverageAppliedEstimatedHitRate`]: appliedAcceptedShots > 0
      ? Number((appliedConfirmedHits / appliedAcceptedShots * 100).toFixed(1))
      : null,
    [`${prefix}TrajectoryCoverageBaselineExpectedMissCmMean`]: roundedMean(
      Number(value.baselineExpectedMissTotal || 0),
      Number(value.baselineExpectedMissSamples || 0)
    ),
    [`${prefix}TrajectoryCoverageSelectedExpectedMissCmMean`]: roundedMean(
      Number(value.selectedExpectedMissTotal || 0),
      Number(value.selectedExpectedMissSamples || 0)
    ),
    [`${prefix}TrajectoryCoverageExpectedMissImprovementCmMean`]: roundedMean(
      Number(value.expectedMissImprovementTotal || 0),
      Number(value.expectedMissImprovementSamples || 0)
    ),
    [`${prefix}TrajectoryCoverageHypothesisCounts`]: { ...(value.hypothesisCounts || {}) },
    [`${prefix}TrajectoryCoverageVariantCounts`]: { ...(value.variantCounts || {}) },
    [`${prefix}TrajectoryCoverageSelectionModeCounts`]: { ...(value.selectionModeCounts || {}) },
    [`${prefix}TrajectoryCoverageHitAttribution`]: {
      confirmedByAcceptedShotMetadata: appliedConfirmedHits,
      pendingOrUnattributedAppliedShots: Math.max(0, appliedAcceptedShots - appliedConfirmedHits)
    }
  };
}

function mergeTrajectoryCoverageShotObservations(target, source) {
  const ledger = target || createTrajectoryCoverageShotObservations();
  const rows = source?.events instanceof Map ? source.events.values() : [];
  for (const row of rows) {
    addTrajectoryCoverageShotObservation(ledger, {
      bulletId: row.id.startsWith('bullet:') ? row.id.slice('bullet:'.length) : '',
      acceptedShotOrdinal: row.id.startsWith('accepted:') ? Number(row.id.slice('accepted:'.length)) : null,
      coverageApplied: true,
      confirmedHit: row.confirmedHit === true,
      baselineExpectedMissCm: row.baselineExpectedMissCm,
      selectedExpectedMissCm: row.selectedExpectedMissCm,
      expectedMissImprovementCm: row.expectedMissImprovementCm,
      hypothesis: row.hypothesis,
      variant: row.variant,
      selectionMode: row.selectionMode
    }, { acceptedShotFloor: 0 });
  }
  return ledger;
}

function createBattleObservations(options = {}) {
  return {
    targetActiveObserved: false,
    targetMovingObserved: false,
    opponentFireObserved: false,
    opponentBulletIds: new Set(),
    opponentShotEventIds: new Set(),
    behaviorModeFrameCounts: boundedCounter(BEHAVIOR_MODE_KEYS),
    routeCoverageCandidateFrames: 0,
    trajectoryCoverageAppliedFrames: 0,
    trajectoryCoverageReasonCounts: boundedCounter(TRAJECTORY_COVERAGE_REASON_KEYS),
    trajectoryCoverageShots: createTrajectoryCoverageShotObservations(options.acceptedShotFloor)
  };
}

function createBattleExitTail() {
  return {
    active: false,
    triggerReason: '',
    triggerAtMs: null,
    triggerTick: null,
    triggerHp: null,
    frames: 0,
    lastObservedAtMs: null,
    lastObservedTick: null,
    finalObservedHp: null,
    minPostTriggerHp: null,
    hpObservationEndedReason: '',
    lastRealHpObservedAtMs: null,
    lastRealHpObservedTick: null,
    selfMissingBeforeConfirmation: false,
    deathObserved: false,
    deathAtMs: null,
    deathTick: null,
    deathEvidence: '',
    firstRequestAtMs: null,
    firstRequestDelayMs: null,
    hedgeStartedAtMs: null,
    hedgeDispatchDriftMs: null,
    leaveConfirmed: false,
    leaveCompletedAtMs: null
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function observeBattleExitTail(tail, type, detail, atMs) {
  const next = tail || createBattleExitTail();
  const value = detail && typeof detail === 'object' ? detail : {};
  const pending = value.pending && typeof value.pending === 'object' ? value.pending : {};
  const response = value.response && typeof value.response === 'object' ? value.response : {};
  const normalizedType = String(type || '');
  const tick = firstFiniteNumber(value.tick, pending.tick, response.tick);
  const responseHp = numberOrNull(response.hp);
  const hp = responseHp !== null
    ? responseHp
    : (value.selfPresent === false
        ? null
        : firstFiniteNumber(value.selfHp, pending.lastHp, pending.minHp, value.lastKnownHp));

  if (normalizedType === 'safety-trigger') {
    next.active = true;
    next.triggerReason = String(value.reason || '');
    next.triggerAtMs = firstFiniteNumber(value.atMs, atMs);
    next.triggerTick = tick;
    next.triggerHp = hp;
    next.finalObservedHp = hp;
    next.minPostTriggerHp = hp;
  }
  if (!next.active) return next;

  next.frames += 1;
  next.lastObservedAtMs = firstFiniteNumber(value.atMs, value.startedAtMs, atMs);
  if (tick !== null) next.lastObservedTick = tick;
  if (hp !== null) {
    next.finalObservedHp = hp;
    next.minPostTriggerHp = next.minPostTriggerHp === null ? hp : Math.min(next.minPostTriggerHp, hp);
    next.lastRealHpObservedAtMs = firstFiniteNumber(value.atMs, value.startedAtMs, atMs);
    next.lastRealHpObservedTick = tick;
  }
  if (value.selfPresent === false) {
    next.hpObservationEndedReason = 'self-missing';
    if (!next.leaveConfirmed) next.selfMissingBeforeConfirmation = true;
  }

  const deathTicks = Array.isArray(response.death_ticks)
    ? response.death_ticks.map(Number).filter(Number.isFinite)
    : [];
  const responseDead = (responseHp !== null && responseHp <= 0)
    || /^dead$/i.test(String(response.life || ''));
  if (value.deathObserved === true || responseDead) {
    next.deathObserved = true;
    next.hpObservationEndedReason = 'death-observed';
    next.deathAtMs = firstFiniteNumber(value.deathAtMs, value.atMs, atMs);
    next.deathTick = firstFiniteNumber(value.deathTick, deathTicks.at(-1), tick);
    next.deathEvidence = String(value.deathEvidence || (responseDead ? 'leave-response-dead' : 'frame-death-evidence'));
  }

  const stage = String(value.stage || '');
  const requestAtMs = firstFiniteNumber(value.startedAtMs, value.firstRequestAtMs);
  if (normalizedType === 'leave-request-start' && requestAtMs !== null) {
    if (next.firstRequestAtMs === null || requestAtMs < next.firstRequestAtMs) next.firstRequestAtMs = requestAtMs;
    const firstDelay = firstFiniteNumber(value.firstRequestDelayMs);
    if (firstDelay !== null && (next.firstRequestDelayMs === null || firstDelay < next.firstRequestDelayMs)) {
      next.firstRequestDelayMs = firstDelay;
    }
    if (/^hedge-/.test(stage)) {
      next.hedgeStartedAtMs = requestAtMs;
      const drift = firstFiniteNumber(value.dispatchDriftMs);
      if (drift !== null) next.hedgeDispatchDriftMs = drift;
    }
  }
  if (normalizedType === 'leave-request-result' && value.ok === true) next.leaveConfirmed = true;
  if (normalizedType === 'leave-confirmed') next.leaveConfirmed = true;
  if (normalizedType === 'leave-pending-finish') {
    if (pending.ok === true || value.ok === true) next.leaveConfirmed = true;
    next.leaveCompletedAtMs = firstFiniteNumber(pending.completedAtMs, value.completedAtMs, atMs);
  }
  return next;
}

function summarizeBattleExitTail(tail) {
  const value = tail || createBattleExitTail();
  if (!value.active) return null;
  const triggerHp = numberOrNull(value.triggerHp);
  const minHp = numberOrNull(value.minPostTriggerHp);
  const postTriggerDamage = triggerHp === null || minHp === null
    ? null
    : Math.max(0, triggerHp - minHp);
  const terminalOutcome = value.deathObserved
    ? 'death-observed'
    : (value.leaveConfirmed
        ? 'leave-confirmed'
        : (value.selfMissingBeforeConfirmation ? 'self-missing-before-confirmation' : 'leave-unconfirmed'));
  return {
    triggerReason: String(value.triggerReason || ''),
    triggerAtMs: numberOrNull(value.triggerAtMs),
    triggerTick: numberOrNull(value.triggerTick),
    triggerHp,
    tailFrames: Math.max(0, Number(value.frames || 0)),
    finalObservedHp: numberOrNull(value.finalObservedHp),
    minPostTriggerHp: minHp,
    postTriggerDamage,
    hpObservationEndedReason: String(value.hpObservationEndedReason || ''),
    lastRealHpObservedAtMs: numberOrNull(value.lastRealHpObservedAtMs),
    lastRealHpObservedTick: numberOrNull(value.lastRealHpObservedTick),
    finalObservedTick: numberOrNull(value.lastObservedTick),
    selfMissingBeforeConfirmation: Boolean(value.selfMissingBeforeConfirmation),
    deathObserved: Boolean(value.deathObserved),
    deathAtMs: numberOrNull(value.deathAtMs),
    deathTick: numberOrNull(value.deathTick),
    deathEvidence: String(value.deathEvidence || ''),
    firstRequestAtMs: numberOrNull(value.firstRequestAtMs),
    firstRequestDelayMs: numberOrNull(value.firstRequestDelayMs),
    hedgeStartedAtMs: numberOrNull(value.hedgeStartedAtMs),
    hedgeDispatchDriftMs: numberOrNull(value.hedgeDispatchDriftMs),
    leaveConfirmed: Boolean(value.leaveConfirmed),
    leaveCompletedAtMs: numberOrNull(value.leaveCompletedAtMs),
    terminalOutcome
  };
}

function stableShotEventId(event, targetId) {
  const bulletId = event?.bulletId ?? event?.bullet_id ?? event?.id;
  if (bulletId !== null && bulletId !== undefined && String(bulletId)) return `bullet:${String(bulletId)}`;
  const createdTick = event?.createdTick ?? event?.created_tick ?? event?.tick;
  if (createdTick === null || createdTick === undefined || String(createdTick) === '') return '';
  return `tick:${String(targetId || '')}:${String(createdTick)}`;
}

function observeBattleDetail(observations, detail) {
  const next = observations || createBattleObservations();
  const frame = detail && typeof detail === 'object' ? detail : {};
  const target = frame.target && typeof frame.target === 'object' ? frame.target : {};
  const metrics = frame.metrics && typeof frame.metrics === 'object' ? frame.metrics : {};
  const behavior = frame.behavior && typeof frame.behavior === 'object' ? frame.behavior : {};
  const aim = frame.aim && typeof frame.aim === 'object' ? frame.aim : {};
  const targetId = metrics.targetId ?? target.userId ?? target.user_id ?? '';

  if (target.active === true) next.targetActiveObserved = true;
  const vx = Number(target.vx);
  const vy = Number(target.vy);
  if ((Number.isFinite(vx) && vx !== 0) || (Number.isFinite(vy) && vy !== 0)) next.targetMovingObserved = true;

  const bulletIds = Array.isArray(metrics.threatBulletIds) ? metrics.threatBulletIds : [];
  for (const id of bulletIds) {
    if (id !== null && id !== undefined && String(id)) next.opponentBulletIds.add(String(id));
  }
  const shotEvents = Array.isArray(behavior.metrics?.shotEvents) ? behavior.metrics.shotEvents : [];
  for (const event of shotEvents) {
    const eventId = stableShotEventId(event, targetId);
    if (eventId) next.opponentShotEventIds.add(eventId);
    const bulletId = event?.bulletId ?? event?.bullet_id ?? event?.id;
    if (bulletId !== null && bulletId !== undefined && String(bulletId)) next.opponentBulletIds.add(String(bulletId));
  }
  if (target.firing === true || bulletIds.length > 0 || shotEvents.length > 0) next.opponentFireObserved = true;

  next.behaviorModeFrameCounts[normalizeBehaviorMode(behavior.mode)] += 1;
  if (Array.isArray(aim.routeCoverage?.candidates) && aim.routeCoverage.candidates.length > 0) {
    next.routeCoverageCandidateFrames += 1;
  }
  const trajectoryCoverage = aim.trajectoryCoverage && typeof aim.trajectoryCoverage === 'object'
    ? aim.trajectoryCoverage
    : null;
  if (trajectoryCoverage?.applied === true) next.trajectoryCoverageAppliedFrames += 1;
  if (trajectoryCoverage) {
    next.trajectoryCoverageReasonCounts[normalizeTrajectoryCoverageReason(trajectoryCoverage.reason)] += 1;
  }
  observeTrajectoryCoverageShots(next.trajectoryCoverageShots, metrics);
  return next;
}

function summarizeBattleObservations(observations) {
  const observed = observations || createBattleObservations();
  return {
    targetActiveObserved: Boolean(observed.targetActiveObserved),
    targetMovingObserved: Boolean(observed.targetMovingObserved),
    opponentFireObserved: Boolean(observed.opponentFireObserved),
    opponentUniqueBulletCount: observed.opponentBulletIds instanceof Set ? observed.opponentBulletIds.size : 0,
    opponentShotEventCount: observed.opponentShotEventIds instanceof Set ? observed.opponentShotEventIds.size : 0,
    behaviorModeFrameCounts: { ...observed.behaviorModeFrameCounts },
    routeCoverageCandidateFrames: Number(observed.routeCoverageCandidateFrames || 0),
    trajectoryCoverageAppliedFrames: Number(observed.trajectoryCoverageAppliedFrames || 0),
    trajectoryCoverageReasonCounts: { ...observed.trajectoryCoverageReasonCounts },
    ...summarizeTrajectoryCoverageShots(observed.trajectoryCoverageShots, 'segment')
  };
}

// Build the persisted per-segment summary. Runtime combat metrics are
// engagement-cumulative, while every physical gzip file is a segment; retain
// the two namespaces separately so index rows can be added without double
// counting after A -> B -> A target switches.
function buildBattleSummary(battle, reason, finalizeMs) {
  const metrics = battle.lastMetrics && typeof battle.lastMetrics === 'object'
    ? { ...battle.lastMetrics }
    : {};
  const executionEvents = Array.isArray(battle.shotExecutionEvents) ? battle.shotExecutionEvents : [];
  const lastExecutionSequence = Math.max(0, Number(metrics.lastExecutionSequence || 0));
  const unsyncedDispatches = executionEvents.filter(event => event.type === 'shoot-dispatch'
    && Number(event.sequence || 0) > lastExecutionSequence);
  if (unsyncedDispatches.length) {
    metrics.wireRequestCount = Math.max(0, Number(metrics.wireRequestCount || 0)) + unsyncedDispatches.length;
    metrics.requestedShots = metrics.wireRequestCount;
    metrics.actualShots = metrics.wireRequestCount;
  }
  const dispatchEvents = executionEvents.filter(event => event.type === 'shoot-dispatch');
  const stopEvent = executionEvents.find(event => event.type === 'shoot-stop') || null;
  if (dispatchEvents.length) {
    metrics.firstDispatchAt = numberOrNull(metrics.firstDispatchAt) ?? numberOrNull(dispatchEvents[0].atMs);
    metrics.lastDispatchAt = numberOrNull(dispatchEvents.at(-1)?.atMs) ?? numberOrNull(metrics.lastDispatchAt);
  }
  if (stopEvent) metrics.stopDispatchAt = numberOrNull(metrics.stopDispatchAt) ?? numberOrNull(stopEvent.atMs);
  battle.lastMetrics = metrics;
  const segmentEndedAtMs = battle.lastFrameAtMs || finalizeMs;
  const engagementEndedAtMs = Number(metrics.lastObservedAt) || segmentEndedAtMs;
  const engagementStartedAtMs = numberOrNull(metrics.startedAt) ?? battle.engagementStartedAtMs ?? battle.firstFrameAtMs;
  const segmentMetrics = segmentMetricDeltas(battle.segmentMetricBaseline, metrics);
  const physicalSegment = physicalSegmentSummary(battle.physicalLedger, segmentMetrics.values);
  const cumulativePhysical = { ...(battle.engagementPhysicalBaseline || {}) };
  for (const field of SEGMENT_METRIC_FIELDS) {
    const value = numberOrNull(physicalSegment.values[field]);
    if (value !== null) cumulativePhysical[field] = Math.max(
      0,
      Number(cumulativePhysical[field] || 0) + value
    );
  }
  const cumulativeMetrics = { ...metrics };
  for (const field of SEGMENT_METRIC_FIELDS) {
    if (cumulativePhysical[field] !== undefined) cumulativeMetrics[field] = cumulativePhysical[field];
  }
  const segmentAcceptedShots = numberOrNull(physicalSegment.values.acceptedShots) ?? 0;
  const segmentRequestedShots = numberOrNull(physicalSegment.values.requestedShots) ?? 0;
  const cumulativeAcceptedShots = numberOrNull(cumulativeMetrics.acceptedShots) ?? 0;
  const cumulativeRequestedShots = numberOrNull(cumulativeMetrics.requestedShots) ?? 0;
  const shotOwnershipInvariantOk = physicalSegment.invariant.acceptedNotOverRequested
    && cumulativeAcceptedShots <= cumulativeRequestedShots;
  const exitTail = summarizeBattleExitTail(battle.exitTail);
  const engagementTrajectoryCoverage = mergeTrajectoryCoverageShotObservations(
    battle.trajectoryCoverageLedger,
    battle.observations?.trajectoryCoverageShots
  );
  return {
    formatVersion: BATTLE_INDEX_FORMAT_VERSION,
    segmentId: battle.segmentId,
    segmentOrdinal: battle.segmentOrdinal,
    at: new Date(finalizeMs).toISOString(),
    engagementId: battle.engagementId,
    controlGeneration: String(metrics.controlGeneration || ''),
    engagementGeneration: String(metrics.engagementGeneration || ''),
    file: path.basename(battle.gzFile),
    priorSegmentFile: String(battle.priorSegmentFile || ''),
    reason,
    targetId: metrics.targetId != null ? String(metrics.targetId) : (battle.targetId || ''),
    targetName: String(metrics.targetName || battle.targetName || ''),
    segmentFrames: battle.frames,
    segmentStartedAt: battle.firstFrameAtMs,
    segmentStartedAtIso: new Date(battle.firstFrameAtMs).toISOString(),
    segmentEndedAt: segmentEndedAtMs,
    segmentEndedAtIso: new Date(segmentEndedAtMs).toISOString(),
    segmentDurationMs: Math.max(0, segmentEndedAtMs - battle.firstFrameAtMs),
    engagementStartedAt: engagementStartedAtMs,
    engagementStartedAtIso: new Date(engagementStartedAtMs).toISOString(),
    engagementEndedAt: engagementEndedAtMs,
    engagementEndedAtIso: new Date(engagementEndedAtMs).toISOString(),
    engagementDurationMs: Math.max(0, engagementEndedAtMs - engagementStartedAtMs),
    ...segmentMetricSummary(physicalSegment.values),
    segmentMetricSource: physicalSegment.source,
    segmentMetricSourceFields: physicalSegment.sourceFields,
    segmentInvariant: physicalSegment.invariant,
    physicalSegmentLedger: physicalSegment.raw,
    counterResetFields: segmentMetrics.counterResetFields,
    ...cumulativeMetricSummary(cumulativeMetrics),
    engagementInitialSelfHp: numberOrNull(metrics.initialSelfHp),
    engagementMinSelfHp: numberOrNull(metrics.minSelfHp),
    engagementLastSelfHp: numberOrNull(metrics.lastSelfHp),
    engagementInitialTargetHp: numberOrNull(metrics.initialTargetHp),
    engagementMinTargetHp: numberOrNull(metrics.minTargetHp),
    engagementLastTargetHp: numberOrNull(metrics.lastTargetHp),
    engagementFirstDamageDelayMs: numberOrNull(metrics.firstDamageDelayMs),
    engagementLateAckCount: Math.max(0, Number(metrics.lateAckCount || 0)),
    engagementOrphanAckCount: Math.max(0, Number(metrics.orphanAckCount || 0)),
    engagementExecutionSkipCount: Math.max(0, Number(metrics.executionSkipCount || 0)),
    engagementExecutionSkipReasons: { ...(metrics.executionSkipReasons || {}) },
    firstEligibleAt: numberOrNull(metrics.firstEligibleAt),
    firstDispatchAt: numberOrNull(metrics.firstDispatchAt),
    lastEligibleAt: numberOrNull(metrics.lastEligibleAt),
    lastDispatchAt: numberOrNull(metrics.lastDispatchAt),
    stopEligibleAt: numberOrNull(metrics.stopEligibleAt),
    stopDispatchAt: numberOrNull(metrics.stopDispatchAt),
    shotOwnershipInvariantOk,
    shotOwnershipInvariant: {
      segmentAcceptedShots,
      segmentRequestedShots,
      cumulativeAcceptedShots,
      cumulativeRequestedShots
    },
    engagementInvariant: {
      cumulativeAcceptedNotOverRequested: cumulativeAcceptedShots <= cumulativeRequestedShots,
      cumulativeSource: 'merged-physical-segment-deltas'
    },
    engagementPhysicalMetrics: { ...cumulativePhysical },
    exitTriggerHp: exitTail?.triggerHp ?? null,
    finalObservedHp: exitTail?.finalObservedHp ?? numberOrNull(metrics.lastSelfHp),
    postTriggerDamage: exitTail?.postTriggerDamage ?? null,
    deathTick: exitTail?.deathTick ?? null,
    leaveHedgeDispatchDriftMs: exitTail?.hedgeDispatchDriftMs ?? null,
    terminalOutcome: exitTail?.terminalOutcome ?? null,
    exitTail,
    ...summarizeBattleObservations(battle.observations),
    ...summarizeTrajectoryCoverageShots(engagementTrajectoryCoverage, 'engagementCumulative'),
    runId: String(battle.runId || ''),
    runtimeRevision: String(battle.runtimeRevision || '')
  };
}

// IO shim: prefer the shared background-IO worker so gzip/compression never
// runs on the 20Hz combat event loop; fall back to synchronous fs/zlib when no
// worker is available (self-tests, background IO disabled).
function createIo(backgroundIo) {
  if (backgroundIo && typeof backgroundIo.appendLog === 'function'
    && typeof backgroundIo.finalizeGz === 'function'
    && typeof backgroundIo.appendRawLine === 'function') {
    return {
      appendFrame(file, atMs, type, detail) {
        if (!backgroundIo.appendLog({ file, atMs, type, detail })) throw new Error('battle-log frame queue unavailable');
      },
      finalize(file) {
        if (!backgroundIo.finalizeGz(file)) throw new Error('battle-log finalize queue unavailable');
      },
      appendIndex(file, summary) {
        if (!backgroundIo.appendRawLine(file, summary)) throw new Error('battle-log index queue unavailable');
      },
      background: true
    };
  }
  return {
    appendFrame(file, atMs, type, detail) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const entry = {
        at: new Date(Number(atMs) || Date.now()).toISOString(),
        type: String(type || 'event'),
        detail: redactStructuredSecrets(detail || {})
      };
      fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    },
    finalize(file) {
      if (!fs.existsSync(file)) return;
      const gzFile = `${file}.gz`;
      fs.writeFileSync(gzFile, zlib.gzipSync(fs.readFileSync(file)));
      fs.rmSync(file, { force: true });
    },
    appendIndex(file, summary) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(redactStructuredSecrets(summary)) + '\n');
    },
    background: false
  };
}

function createCombatBattleLog(options = {}) {
  const logDir = path.resolve(String(options.logDir || path.join(process.cwd(), 'data', 'logs')));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const idleFinalizeMs = Math.max(1000, Number(options.idleFinalizeMs || DEFAULT_IDLE_FINALIZE_MS));
  const io = createIo(options.backgroundIo);

  let active = null;
  let battlesFinalized = 0;
  let framesWritten = 0;
  let framesDiscarded = 0;
  const allocatedBattleFiles = new Set();
  // A root engagement can be physically split whenever another target takes
  // control. Keep only the bounded cumulative baseline needed to make the
  // next segment additive; this state is process-local and never persisted.
  const engagementSegments = new Map();
  const executionOrigins = new Map();
  const executionRequestOrigins = new Map();

  function rememberExecutionOrigin(key, origin) {
    const normalized = String(key || '');
    if (!normalized) return;
    executionOrigins.set(normalized, origin);
    while (executionOrigins.size > 4096) executionOrigins.delete(executionOrigins.keys().next().value);
  }

  function rememberRequestOrigin(key, origin) {
    const normalized = String(key || '');
    if (!normalized) return;
    executionRequestOrigins.set(normalized, origin);
    while (executionRequestOrigins.size > 4096) {
      executionRequestOrigins.delete(executionRequestOrigins.keys().next().value);
    }
  }

  function battlesDirFor(atMs) {
    return path.join(logDir, utc8DayKey(atMs), BATTLES_DIR);
  }

  // Pick a raw file name that does not collide with an already-finalized battle
  // (e.g. the same engagement re-opening after an idle finalize).
  function chooseBattleFile(dir, engagementId) {
    const base = sanitizeEngagementId(engagementId);
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const name = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const rawFile = path.join(dir, `${name}.jsonl`);
      const gzFile = `${rawFile}.gz`;
      if (!allocatedBattleFiles.has(rawFile) && !fs.existsSync(rawFile) && !fs.existsSync(gzFile)) {
        allocatedBattleFiles.add(rawFile);
        return { rawFile, gzFile };
      }
    }
    const fallback = path.join(dir, `${base}-${Date.now()}-${allocatedBattleFiles.size + 1}.jsonl`);
    allocatedBattleFiles.add(fallback);
    return { rawFile: fallback, gzFile: `${fallback}.gz` };
  }

  function touchEngagementSegment(engagementId, update = {}) {
    const id = String(engagementId || '');
    const existing = engagementSegments.get(id) || {
      nextOrdinal: 0,
      lastSegmentFile: '',
      lastMetrics: null,
      cumulativePhysicalMetrics: null,
      trajectoryCoverageLedger: createTrajectoryCoverageShotObservations(),
      engagementStartedAtMs: 0,
      touchedAtMs: 0
    };
    const next = { ...existing, ...update, touchedAtMs: Number(update.touchedAtMs || now()) };
    engagementSegments.delete(id);
    engagementSegments.set(id, next);
    while (engagementSegments.size > MAX_TRACKED_ENGAGEMENT_SEGMENTS) {
      const oldest = engagementSegments.keys().next().value;
      if (oldest === id) break;
      engagementSegments.delete(oldest);
    }
    return next;
  }

  function finalizeActive(reason = 'engagement-switch', atMs = now()) {
    if (!active) return null;
    const battle = active;
    active = null;
    let summary = null;
    try {
      io.finalize(battle.rawFile);
      summary = buildBattleSummary(battle, reason, atMs);
      io.appendIndex(path.join(battle.dir, INDEX_FILE), summary);
      const finalizedGeneration = String(battle.lastMetrics?.engagementGeneration || '');
      if (finalizedGeneration && executionOrigins.has(finalizedGeneration)) {
        const origin = executionOrigins.get(finalizedGeneration);
        executionOrigins.set(finalizedGeneration, { ...origin, status: 'finalized-segment' });
      }
      touchEngagementSegment(battle.engagementId, {
        nextOrdinal: battle.segmentOrdinal,
        lastSegmentFile: summary.file,
        lastMetrics: metricSnapshot(battle.lastMetrics),
        cumulativePhysicalMetrics: summary.engagementPhysicalMetrics || null,
        trajectoryCoverageLedger: battle.trajectoryCoverageLedger,
        engagementStartedAtMs: battle.engagementStartedAtMs,
        touchedAtMs: atMs
      });
      battlesFinalized += 1;
    } catch (err) {
      if (typeof options.onError === 'function') options.onError(err, { operation: 'battle-finalize', engagementId: battle.engagementId });
      else throw err;
    }
    return summary;
  }

  function startBattle(engagementId, detail, atMs) {
    const dir = battlesDirFor(atMs);
    const { rawFile, gzFile } = chooseBattleFile(dir, engagementId);
    const metrics = detail && typeof detail === 'object' ? detail.metrics : null;
    const previous = engagementSegments.get(String(engagementId || '')) || null;
    const segmentOrdinal = Math.max(0, Number(previous?.nextOrdinal || 0)) + 1;
    const engagementStartedAtMs = numberOrNull(metrics?.startedAt)
      ?? numberOrNull(previous?.engagementStartedAtMs)
      ?? atMs;
    const priorMetrics = previous?.lastMetrics && typeof previous.lastMetrics === 'object'
      ? previous.lastMetrics
      : null;
    const priorAcceptedShots = numberOrNull(priorMetrics?.acceptedShots);
    const currentAcceptedShots = numberOrNull(metrics?.acceptedShots);
    const acceptedShotFloor = priorAcceptedShots !== null
      && currentAcceptedShots !== null
      && currentAcceptedShots < priorAcceptedShots
      ? 0
      : Math.max(0, Number(priorAcceptedShots || 0));
    active = {
      engagementId,
      dir,
      rawFile,
      gzFile,
      segmentId: `${String(engagementId)}#${segmentOrdinal}`,
      segmentOrdinal,
      priorSegmentFile: String(previous?.lastSegmentFile || ''),
      engagementStartedAtMs,
      // The first segment starts from zero. Re-opened files start from the
      // previous segment's final cumulative counters, which makes all
      // segment* metrics additive without relying on a filename suffix.
      segmentMetricBaseline: priorMetrics || zeroMetricBaseline(metrics),
      engagementPhysicalBaseline: previous?.cumulativePhysicalMetrics || {},
      physicalLedger: createPhysicalSegmentLedger(),
      trajectoryCoverageLedger: previous?.trajectoryCoverageLedger || createTrajectoryCoverageShotObservations(),
      frames: 0,
      firstFrameAtMs: atMs,
      lastFrameAtMs: atMs,
      targetId: metrics && metrics.targetId != null ? String(metrics.targetId) : '',
      targetName: metrics ? String(metrics.targetName || '') : '',
      runId: detail && detail.runId ? String(detail.runId) : '',
      runtimeRevision: detail && detail.runtimeRevision ? String(detail.runtimeRevision) : '',
      observations: createBattleObservations({
        acceptedShotFloor: previous ? acceptedShotFloor : 0
      }),
      exitTail: createBattleExitTail(),
      shotExecutionEvents: [],
      lastMetrics: null
    };
    touchEngagementSegment(engagementId, {
      nextOrdinal: segmentOrdinal,
      engagementStartedAtMs,
      touchedAtMs: atMs
    });
    const origin = {
      segmentId: active.segmentId,
      engagementId: String(active.engagementId || ''),
      file: path.basename(active.gzFile),
      controlGeneration: String(metrics?.controlGeneration || ''),
      engagementGeneration: String(metrics?.engagementGeneration || ''),
      status: 'active-segment'
    };
    if (origin.engagementGeneration) rememberExecutionOrigin(origin.engagementGeneration, origin);
  }

  // Record one combat frame. `detail` is the same enriched combat payload that
  // was previously appended to `combat.jsonl`, so per-battle files keep an
  // identical `{at,type,detail}` shape for replay tooling.
  function record(type, detail, recordOptions = {}) {
    const atMs = Number(recordOptions.atMs || now());
    const engagementId = extractEngagementId(detail);
    if (!engagementId) {
      framesDiscarded += 1;
      // No live engagement: if a fight just ended, idle-finalize it.
      if (active && atMs - active.lastFrameAtMs >= idleFinalizeMs) finalizeActive('idle', atMs);
      return { recorded: false, reason: 'no-engagement' };
    }
    if (active && active.engagementId !== engagementId) finalizeActive('engagement-switch', atMs);
    else if (active && atMs - active.lastFrameAtMs >= idleFinalizeMs) {
      // Same id but a long gap: treat the prior span as a finished battle.
      finalizeActive('idle', atMs);
    }
    if (!active) startBattle(engagementId, detail, atMs);
    io.appendFrame(active.rawFile, atMs, type, detail);
    active.frames += 1;
    active.lastFrameAtMs = atMs;
    active.physicalLedger = observePhysicalSegmentFrame(active.physicalLedger, detail);
    active.lastMetrics = detail && typeof detail === 'object' && detail.metrics && typeof detail.metrics === 'object'
      ? detail.metrics
      : active.lastMetrics;
    if (active.lastMetrics) {
      const generation = String(active.lastMetrics.engagementGeneration || '');
      if (generation) rememberExecutionOrigin(generation, {
        segmentId: active.segmentId,
        engagementId: String(active.engagementId || ''),
        file: path.basename(active.gzFile),
        controlGeneration: String(active.lastMetrics.controlGeneration || ''),
        engagementGeneration: generation,
        status: 'active-segment'
      });
      touchEngagementSegment(active.engagementId, {
        lastMetrics: metricSnapshot(active.lastMetrics),
        trajectoryCoverageLedger: active.trajectoryCoverageLedger,
        engagementStartedAtMs: active.engagementStartedAtMs,
        touchedAtMs: atMs
      });
    }
    observeBattleDetail(active.observations, detail);
    if (!active.targetName && active.lastMetrics) active.targetName = String(active.lastMetrics.targetName || '');
    framesWritten += 1;
    return { recorded: true, file: active.rawFile, engagementId };
  }

  function recordTail(type, detail, recordOptions = {}) {
    if (!active) return { recorded: false, reason: 'no-active-battle' };
    const atMs = Number(recordOptions.atMs || now());
    io.appendFrame(active.rawFile, atMs, type, detail);
    active.lastFrameAtMs = Math.max(active.lastFrameAtMs, atMs);
    active.exitTail = observeBattleExitTail(active.exitTail, type, detail, atMs);
    framesWritten += 1;
    return { recorded: true, file: active.rawFile, engagementId: active.engagementId, tail: true };
  }

  function recordShotExecution(detail, recordOptions = {}) {
    const atMs = Number(recordOptions.atMs || detail?.atMs || now());
    const event = {
      sequence: Math.max(0, Number(detail?.sequence || 0)),
      type: String(detail?.type || 'shoot-execution'),
      atMs,
      requestId: detail?.requestId ?? null,
      commandId: detail?.commandId ?? null,
      controlGeneration: String(detail?.controlGeneration || ''),
      engagementGeneration: String(detail?.engagementGeneration || ''),
      targetId: detail?.targetId ?? null,
      baseCadenceMs: numberOrNull(detail?.baseCadenceMs),
      executionCadenceMs: numberOrNull(detail?.executionCadenceMs),
      advisoryCadenceMs: numberOrNull(detail?.advisoryCadenceMs),
      lastDispatchAt: numberOrNull(detail?.lastDispatchAt),
      skipReason: String(detail?.skipReason || ''),
      outcome: String(detail?.outcome || ''),
      observedTick: numberOrNull(detail?.observedTick),
      runId: String(detail?.runId || ''),
      runtimeRevision: String(detail?.runtimeRevision || '')
    };
    const activeGeneration = String(active?.lastMetrics?.engagementGeneration || '');
    const requestKey = event.requestId ?? event.commandId ?? '';
    const origin = (event.engagementGeneration && executionOrigins.get(event.engagementGeneration))
      || (requestKey && executionRequestOrigins.get(requestKey))
      || null;
    const activeOrigin = active && (
      (event.engagementGeneration && event.engagementGeneration === activeGeneration)
        || (origin && String(origin.segmentId) === String(active.segmentId))
    );
    event.originSegmentId = origin?.segmentId ?? (activeOrigin ? active.segmentId : null);
    event.originEngagementId = origin?.engagementId ?? (activeOrigin ? String(active.engagementId || '') : null);
    event.originFile = origin?.file ?? (activeOrigin ? path.basename(active.gzFile) : null);
    event.originStatus = origin?.status ?? (activeOrigin ? 'active-segment' : 'unresolved');
    if (activeOrigin) {
      io.appendFrame(active.rawFile, atMs, 'shoot-execution', event);
      active.shotExecutionEvents.push(event);
      active.physicalLedger = recordPhysicalExecution(active.physicalLedger, event);
      active.shotExecutionEvents = active.shotExecutionEvents.slice(-256);
      active.frames += 1;
      active.lastFrameAtMs = Math.max(active.lastFrameAtMs, atMs);
      framesWritten += 1;
    }
    if (event.type === 'shoot-dispatch') {
      const eventOrigin = {
        segmentId: event.originSegmentId,
        engagementId: event.originEngagementId,
        file: event.originFile,
        controlGeneration: event.controlGeneration,
        engagementGeneration: event.engagementGeneration,
        status: event.originStatus
      };
      if (event.engagementGeneration) rememberExecutionOrigin(event.engagementGeneration, eventOrigin);
      if (requestKey) rememberRequestOrigin(requestKey, eventOrigin);
    }
    if (!activeOrigin || ['shoot-ack-late', 'shoot-ack-orphan', 'shoot-ack-duplicate'].includes(event.type)) {
      io.appendIndex(path.join(battlesDirFor(atMs), SHOT_AMENDMENTS_FILE), event);
    }
    return event;
  }

  function flush(reason = 'flush') {
    return finalizeActive(reason, now());
  }

  function status() {
    return {
      logDir,
      activeEngagementId: active ? active.engagementId : '',
      activeFrames: active ? active.frames : 0,
      activeTailFrames: active ? Number(active.exitTail?.frames || 0) : 0,
      battlesFinalized,
      framesWritten,
      framesDiscarded,
      idleFinalizeMs,
      background: io.background
    };
  }

  return { record, recordTail, recordShotExecution, finalizeActive, flush, status };
}

function runCombatBattleLogSelfTest() {
  const os = require('os');
  const zlibSync = require('zlib');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-battle-log-'));
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`battle-log self-test failed: ${name}`);
  };
  try {
    // Fixed clock so engagement/day boundaries are deterministic.
    let nowMs = Date.UTC(2026, 6, 24, 4, 0, 0);
    assert('nullable metric conversion preserves only explicit zero', numberOrNull(null) === null
      && numberOrNull(undefined) === null
      && numberOrNull('') === null
      && numberOrNull('   ') === null
      && numberOrNull(0) === 0
      && numberOrNull('0') === 0);
    const missingSelfTail = createBattleExitTail();
    observeBattleExitTail(missingSelfTail, 'safety-trigger', {
      atMs: nowMs,
      tick: 90,
      selfHp: 90,
      selfPresent: true
    }, nowMs);
    observeBattleExitTail(missingSelfTail, 'leave-pending-frame', {
      atMs: nowMs + 50,
      tick: 91,
      selfPresent: false,
      selfHp: null,
      lastKnownHp: 90
    }, nowMs + 50);
    observeBattleExitTail(missingSelfTail, 'leave-pending-finish', {
      ok: true,
      pending: { ok: true, completedAtMs: nowMs + 100 }
    }, nowMs + 100);
    const missingSelfSummary = summarizeBattleExitTail(missingSelfTail);
    assert('missing self ends HP observation without fabricating zero damage', missingSelfSummary.finalObservedHp === 90
      && missingSelfSummary.minPostTriggerHp === 90
      && missingSelfSummary.postTriggerDamage === 0
      && missingSelfSummary.hpObservationEndedReason === 'self-missing'
      && missingSelfSummary.lastRealHpObservedTick === 90
      && missingSelfSummary.deathObserved === false);
    const explicitDeathTail = createBattleExitTail();
    observeBattleExitTail(explicitDeathTail, 'safety-trigger', { selfHp: 12, tick: 95 }, nowMs);
    observeBattleExitTail(explicitDeathTail, 'leave-request-result', {
      ok: false,
      selfPresent: false,
      response: { hp: 0, life: 'Dead', tick: 96 }
    }, nowMs + 50);
    const explicitDeathSummary = summarizeBattleExitTail(explicitDeathTail);
    assert('explicit death remains authoritative zero HP evidence', explicitDeathSummary.finalObservedHp === 0
      && explicitDeathSummary.minPostTriggerHp === 0
      && explicitDeathSummary.postTriggerDamage === 12
      && explicitDeathSummary.hpObservationEndedReason === 'death-observed'
      && explicitDeathSummary.deathObserved === true);
    const historicalDeathTail = createBattleExitTail();
    observeBattleExitTail(historicalDeathTail, 'safety-trigger', { selfHp: 90 }, nowMs);
    observeBattleExitTail(historicalDeathTail, 'leave-request-result', {
      ok: true,
      response: { hp: 90, life: 'Alive', death_ticks: [100] }
    }, nowMs + 1);
    assert('historical death ticks alone do not mark the exit tail dead', historicalDeathTail.deathObserved === false);
    const dayKey = utc8DayKey(nowMs);
    const battlesDir = path.join(root, dayKey, BATTLES_DIR);
    const log = createCombatBattleLog({ logDir: root, now: () => nowMs, idleFinalizeMs: 15000 });

    const frame = (engagementId, extra = {}, detailExtra = {}) => ({
      metrics: engagementId
        ? { engagementId, targetId: engagementId.split(':')[0], targetName: 'Foe', ...extra }
        : null,
      runId: 'run-1',
      runtimeRevision: 'rev-1',
      ...detailExtra
    });
    const physicalEntities = (targetId, targetHp, selfHp) => ({
      self: { userId: 7, hp: selfHp, x: 0, y: 0 },
      target: { userId: targetId, hp: targetHp, active: true, x: 1000, y: 0 }
    });
    const recordExecutionBatch = (generation, targetId, count, acceptedCount, prefix) => {
      for (let index = 0; index < count; index += 1) {
        nowMs += 1;
        log.recordShotExecution({
          sequence: index + 1,
          type: 'shoot-dispatch',
          atMs: nowMs,
          requestId: `${prefix}-dispatch-${index + 1}`,
          controlGeneration: 'control:test',
          engagementGeneration: generation,
          targetId: String(targetId),
          outcome: 'transport-accepted'
        });
      }
      for (let index = 0; index < acceptedCount; index += 1) {
        nowMs += 1;
        log.recordShotExecution({
          sequence: count + index + 1,
          type: 'shoot-ack-accepted',
          atMs: nowMs,
          requestId: `${prefix}-dispatch-${index + 1}`,
          controlGeneration: 'control:test',
          engagementGeneration: generation,
          targetId: String(targetId),
          outcome: 'accepted'
        });
      }
    };

    // First battle: two frames.
    log.record('combat-live', frame('100:1000', {
      requestedShots: 2,
      acceptedShots: 2,
      confirmedHits: 1,
      targetDamage: 40,
      selfDamage: 4,
      incomingHits: 1,
      totalStaminaSpent: 1500,
      shootingStaminaSpent: 1000,
      movementStaminaSpent: 500,
      lastObservedAt: nowMs,
      threatBulletIds: ['bullet-a'],
      coverageShotAttribution: [{
        bulletId: 'coverage-2',
        acceptedShotOrdinal: 2,
        coverageApplied: true,
        coverageImprovementQualified: true,
        baselineExpectedMissCm: 540,
        selectedExpectedMissCm: 260,
        expectedMissImprovementCm: 280,
        hypothesis: 'stop',
        variant: 'immediate',
        selectionMode: 'weighted-primary',
        confirmedHit: false
      }]
    }, {
      ...physicalEntities(100, 100, 100),
      target: { ...physicalEntities(100, 100, 100).target, active: true, firing: false, vx: 20, vy: 0 },
      behavior: { mode: 'zigzag-strafe', metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 10 }] } },
      aim: {
        routeCoverage: { candidates: [{ hypothesis: 'continue' }] },
        trajectoryCoverage: { applied: true, reason: 'live-single-applied' }
      }
    }));
    nowMs += 50;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 5,
      wireRequestCount: 5,
      acceptedShots: 5,
      confirmedHits: 3,
      targetDamage: 90,
      selfDamage: 6,
      incomingHits: 2,
      totalStaminaSpent: 3600,
      shootingStaminaSpent: 2500,
      movementStaminaSpent: 1100,
      lastObservedAt: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:1',
      lastExecutionSequence: 6,
      sessionToken: 'leak-token',
      threatBulletIds: ['bullet-a', 'bullet-b'],
      coverageShotAttribution: [{
        bulletId: 'coverage-2',
        acceptedShotOrdinal: 2,
        coverageApplied: true,
        coverageImprovementQualified: true,
        baselineExpectedMissCm: 540,
        selectedExpectedMissCm: 260,
        expectedMissImprovementCm: 280,
        hypothesis: 'stop',
        variant: 'immediate',
        selectionMode: 'weighted-primary',
        confirmedHit: true
      }]
    }, {
      ...physicalEntities(100, 90, 94),
      target: { ...physicalEntities(100, 90, 94).target, active: true, firing: false, vx: 0, vy: 0 },
      behavior: {
        mode: 'retreat-kite',
        metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 10 }, { bulletId: 'bullet-b', createdTick: 12 }] }
      },
      aim: { trajectoryCoverage: { applied: false, reason: 'coverage-evidence-not-ready' } }
    }));
    recordExecutionBatch('control:test:100:1', 100, 6, 5, 'a1');
    nowMs += 1;
    log.recordShotExecution({
      sequence: 7,
      type: 'shoot-stop',
      atMs: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:1',
      targetId: '100',
      outcome: 'sealed'
    });
    // Idle diagnostic frames are discarded and do not create files yet.
    nowMs += 50;
    log.record('combat-dry-run', frame(''));
    log.recordTail('safety-trigger', {
      reason: 'realtime-transport-degraded',
      atMs: nowMs,
      tick: 120,
      selfHp: 79
    });
    nowMs += 50;
    log.recordTail('leave-pending-frame', {
      atMs: nowMs,
      tick: 121,
      selfPresent: true,
      selfHp: 40
    });
    nowMs += 50;
    log.recordTail('leave-request-start', {
      stage: 'hedge-1',
      startedAtMs: nowMs,
      scheduledAtMs: nowMs - 12,
      dispatchDriftMs: 12,
      firstRequestDelayMs: 350
    });
    nowMs += 50;
    log.recordTail('leave-request-result', {
      stage: 'hedge-1',
      ok: true,
      response: { hp: 0, life: 'Dead', death_ticks: [122] }
    });
    nowMs += 50;
    log.recordTail('leave-pending-finish', {
      ok: true,
      pending: { ok: true, completedAtMs: nowMs }
    });
    assert('active battle raw file exists before switch', fs.existsSync(path.join(battlesDir, '100_1000.jsonl')));

    // Switching to a new engagement finalizes the first battle.
    nowMs += 50;
    log.record('combat-live', frame('200:2000', {
      requestedShots: 1,
      acceptedShots: 1,
      confirmedHits: 0,
      targetDamage: 0,
      selfDamage: 0,
      incomingHits: 0,
      totalStaminaSpent: 500,
      shootingStaminaSpent: 500,
      movementStaminaSpent: 0,
      lastObservedAt: nowMs,
      threatBulletIds: ['bullet-a']
    }, {
      target: { userId: 200, active: true, firing: false, vx: 0, vy: 0 },
      behavior: { mode: 'stationary', metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 20 }] } },
      aim: { trajectoryCoverage: { applied: false, reason: 'no-route-coverage' } }
    }));
    assert('first battle compressed', fs.existsSync(path.join(battlesDir, '100_1000.jsonl.gz')));
    assert('first battle raw removed', !fs.existsSync(path.join(battlesDir, '100_1000.jsonl')));
    assert('index file created', fs.existsSync(path.join(battlesDir, INDEX_FILE)));

    // Flush finalizes the currently active battle.
    nowMs += 50;
    log.flush('shutdown');
    assert('second battle compressed', fs.existsSync(path.join(battlesDir, '200_2000.jsonl.gz')));

    // Index has exactly two battle summaries with the expected shape.
    const indexLines = fs.readFileSync(path.join(battlesDir, INDEX_FILE), 'utf8').trim().split('\n').filter(Boolean);
    assert('index has two battles', indexLines.length === 2);
    const first = JSON.parse(indexLines[0]);
    assert('index summary keeps engagement id', first.engagementId === '100:1000');
    assert('index summary has versioned segment identity', first.formatVersion === BATTLE_INDEX_FORMAT_VERSION
      && first.segmentId === '100:1000#1' && first.segmentOrdinal === 1 && first.priorSegmentFile === '');
    assert('index summary counts physical segment frames', first.segmentFrames === 14);
    assert('index summary separates physical segment and cumulative metrics', first.segmentConfirmedHits === 3
      && first.segmentTargetDamage === 10
      && first.segmentSelfDamage === 6
      && first.segmentAcceptedShots === 5
      && first.segmentRequestedShots === 6
      && first.engagementCumulativeConfirmedHits === 3
      && first.engagementCumulativeTargetDamage === 10
      && first.engagementCumulativeAcceptedShots === 5
      && first.engagementCumulativeRequestedShots === 6
      && first.segmentMetricSource === 'physical-ledger'
      && first.segmentInvariant.selfDamageMatchesAdjacentHp === true
      && first.segmentInvariant.targetDamageMatchesAdjacentHp === true);
    assert('index summary merges terminal execution events without a later combat frame', first.firstDispatchAt !== null
      && first.lastDispatchAt > first.firstDispatchAt
      && first.stopDispatchAt > first.lastDispatchAt
      && first.shotOwnershipInvariantOk === true);
    assert('index summary reason recorded', first.reason === 'engagement-switch');
    assert('index summary points at gz file', first.file === '100_1000.jsonl.gz');
    assert('index summary observes target activity and movement', first.targetActiveObserved === true && first.targetMovingObserved === true);
    assert('index summary de-duplicates opponent bullets and shot events', first.opponentFireObserved === true
      && first.opponentUniqueBulletCount === 2 && first.opponentShotEventCount === 2);
    assert('index summary counts bounded behavior modes', first.behaviorModeFrameCounts['zigzag-strafe'] === 1
      && first.behaviorModeFrameCounts['retreat-kite'] === 1);
    assert('index summary counts route and trajectory coverage', first.routeCoverageCandidateFrames === 1
      && first.trajectoryCoverageAppliedFrames === 1
      && first.trajectoryCoverageReasonCounts['live-single-applied'] === 1
      && first.trajectoryCoverageReasonCounts['coverage-evidence-not-ready'] === 1);
    assert('index summary keeps bounded applied-shot trajectory attribution', first.segmentTrajectoryCoverageAppliedAcceptedShots === 1
      && first.segmentTrajectoryCoverageAppliedConfirmedHits === 1
      && first.segmentTrajectoryCoverageBaselineExpectedMissCmMean === 540
      && first.segmentTrajectoryCoverageSelectedExpectedMissCmMean === 260
      && first.segmentTrajectoryCoverageHypothesisCounts.stop === 1
      && first.segmentTrajectoryCoverageHitAttribution.confirmedByAcceptedShotMetadata === 1
      && first.engagementCumulativeTrajectoryCoverageAppliedAcceptedShots === 1
      && first.engagementCumulativeTrajectoryCoverageAppliedConfirmedHits === 1);
    assert('index summary preserves exit and death tail', first.exitTriggerHp === 79
      && first.finalObservedHp === 0
      && first.postTriggerDamage === 79
      && first.deathTick === 122
      && first.leaveHedgeDispatchDriftMs === 12
      && first.terminalOutcome === 'death-observed'
      && first.exitTail?.tailFrames === 5
      && first.exitTail?.terminalOutcome === 'death-observed');
    assert('index summary remains below eight KiB', Buffer.byteLength(JSON.stringify(first), 'utf8') <= MAX_INDEX_LINE_BYTES);
    const second = JSON.parse(indexLines[1]);
    assert('battle observation sets are isolated across targets', second.targetId === '200'
      && second.opponentUniqueBulletCount === 1 && second.opponentShotEventCount === 1);

    // Compressed content round-trips and secrets were redacted at append time.
    const decompressed = zlibSync.gunzipSync(fs.readFileSync(path.join(battlesDir, '100_1000.jsonl.gz'))).toString('utf8');
    const gzLines = decompressed.trim().split('\n').filter(Boolean);
    assert('gz has combat frames, execution events, and terminal tail', gzLines.length === 19);
    assert('gz frames keep {at,type,detail} shape', gzLines.every(line => {
      const entry = JSON.parse(line);
      return entry.at && entry.type && entry.detail && typeof entry.detail === 'object';
    }));
    assert('gz frames redacted secrets', !decompressed.includes('leak-token'));

    nowMs += 1;
    log.recordShotExecution({
      sequence: 99,
      type: 'shoot-ack-late',
      atMs: nowMs,
      requestId: 'a1-dispatch-1',
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:1',
      targetId: '100',
      outcome: 'late-ack'
    });
    const amendmentLines = fs.readFileSync(path.join(battlesDir, SHOT_AMENDMENTS_FILE), 'utf8')
      .trim().split('\n').filter(Boolean).map(JSON.parse);
    const lateAmendment = amendmentLines.at(-1);
    assert('late ACK keeps its original segment ownership', lateAmendment.type === 'shoot-ack-late'
      && lateAmendment.originSegmentId === '100:1000#1'
      && lateAmendment.originFile === '100_1000.jsonl.gz'
      && lateAmendment.originStatus === 'finalized-segment');

    // A -> B -> A carries an explicit prior file and only the new segment
    // delta, rather than duplicating the root engagement cumulative metrics.
    nowMs += 100000;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 9,
      acceptedShots: 8,
      confirmedHits: 4,
      targetDamage: 120,
      selfDamage: 8,
      incomingHits: 3,
      totalStaminaSpent: 5100,
      shootingStaminaSpent: 4000,
      movementStaminaSpent: 1100,
      lastObservedAt: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:2'
    }, {
      ...physicalEntities(100, 60, 92)
    }));
    recordExecutionBatch('control:test:100:2', 100, 3, 3, 'a2');
    nowMs += 50;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 9,
      acceptedShots: 8,
      confirmedHits: 4,
      targetDamage: 120,
      selfDamage: 8,
      incomingHits: 3,
      totalStaminaSpent: 5100,
      shootingStaminaSpent: 4000,
      movementStaminaSpent: 1100,
      lastObservedAt: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:2'
    }, {
      ...physicalEntities(100, 30, 90)
    }));
    log.flush('shutdown');
    assert('re-opened battle uses distinct file', fs.existsSync(path.join(battlesDir, '100_1000-2.jsonl.gz')));
    const afterReopen = fs.readFileSync(path.join(battlesDir, INDEX_FILE), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const reopened = afterReopen.at(-1);
    assert('re-opened segment uses additive deltas and prior file', reopened.segmentOrdinal === 2
      && reopened.priorSegmentFile === '100_1000.jsonl.gz'
      && reopened.segmentRequestedShots === 3
      && reopened.segmentAcceptedShots === 3
      && reopened.segmentConfirmedHits === 1
      && reopened.segmentTargetDamage === 30
      && reopened.segmentSelfDamage === 2
      && reopened.engagementCumulativeAcceptedShots === 8
      && reopened.engagementCumulativeRequestedShots === 9
      && reopened.engagementCumulativeTargetDamage === 40
      && reopened.engagementCumulativeSelfDamage === 8);
    const additiveAccepted = afterReopen
      .filter(item => item.engagementId === '100:1000')
      .reduce((sum, item) => sum + Number(item.segmentAcceptedShots || 0), 0);
    assert('segments sum to the final root cumulative metrics', additiveAccepted === reopened.engagementCumulativeAcceptedShots);

    // A counter reset is explicit and never produces a negative segment value.
    nowMs += 100000;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 2,
      acceptedShots: 2,
      confirmedHits: 1,
      targetDamage: 6,
      selfDamage: 1,
      incomingHits: 1,
      totalStaminaSpent: 1200,
      shootingStaminaSpent: 1000,
      movementStaminaSpent: 200,
      lastObservedAt: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:3',
      coverageShotAttribution: [{
        bulletId: 'coverage-reset-1',
        acceptedShotOrdinal: 1,
        coverageApplied: true,
        coverageImprovementQualified: true,
        baselineExpectedMissCm: 500,
        selectedExpectedMissCm: 300,
        expectedMissImprovementCm: 200,
        hypothesis: 'continue',
        variant: 'immediate',
        selectionMode: 'weighted-sample',
        confirmedHit: false
      }]
    }, {
      ...physicalEntities(100, 20, 89)
    }));
    recordExecutionBatch('control:test:100:3', 100, 2, 2, 'a3');
    nowMs += 50;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 2,
      acceptedShots: 2,
      confirmedHits: 1,
      targetDamage: 6,
      selfDamage: 1,
      incomingHits: 1,
      totalStaminaSpent: 1200,
      shootingStaminaSpent: 1000,
      movementStaminaSpent: 200,
      lastObservedAt: nowMs,
      controlGeneration: 'control:test',
      engagementGeneration: 'control:test:100:3'
    }, {
      ...physicalEntities(100, 14, 88)
    }));
    log.flush('counter-reset');
    const resetSummary = fs.readFileSync(path.join(battlesDir, INDEX_FILE), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).at(-1);
    assert('counter resets stay non-negative and are labeled', resetSummary.segmentOrdinal === 3
      && resetSummary.segmentAcceptedShots === 2
      && resetSummary.segmentTargetDamage === 6
      && resetSummary.segmentTrajectoryCoverageAppliedAcceptedShots === 1
      && resetSummary.counterResetFields.includes('acceptedShots')
      && resetSummary.counterResetFields.includes('targetDamage'));

    // The background worker may not have created either the raw or gz path by
    // the time the same engagement reopens. In-memory path allocation must
    // still prevent the later battle from overwriting the queued first one.
    const queuedOperations = [];
    const queuedLog = createCombatBattleLog({
      logDir: path.join(root, 'queued'),
      now: () => nowMs,
      idleFinalizeMs: 15000,
      backgroundIo: {
        appendLog(message) { queuedOperations.push({ kind: 'log', ...message }); return true; },
        finalizeGz(file) { queuedOperations.push({ kind: 'finalize-gz', file }); return true; },
        appendRawLine(file, value) { queuedOperations.push({ kind: 'append-raw-line', file, value }); return true; }
      }
    });
    const queuedFirst = queuedLog.record('combat-live', frame('300:3000'));
    queuedLog.flush('idle');
    const queuedReopen = queuedLog.record('combat-live', frame('300:3000'));
    assert('queued re-open reserves a distinct file before worker writes', queuedFirst.file !== queuedReopen.file);
    assert('queued background operations exercised', queuedOperations.length >= 4);

    const status = log.status();
    assert('status counts finalized battles', status.battlesFinalized === 4);
    assert('status counts discarded idle frames', status.framesDiscarded >= 1);

    return { ok: true, cases };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), cases };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = {
  BATTLE_INDEX_FORMAT_VERSION,
  DEFAULT_IDLE_FINALIZE_MS,
  MAX_INDEX_LINE_BYTES,
  BEHAVIOR_MODE_KEYS,
  TRAJECTORY_COVERAGE_REASON_KEYS,
  buildBattleSummary,
  createBattleObservations,
  createBattleExitTail,
  createPhysicalSegmentLedger,
  createCombatBattleLog,
  extractEngagementId,
  observeBattleDetail,
  observeBattleExitTail,
  observePhysicalSegmentFrame,
  physicalSegmentSummary,
  recordPhysicalExecution,
  runCombatBattleLogSelfTest,
  sanitizeEngagementId,
  summarizeBattleObservations,
  summarizeBattleExitTail
};
