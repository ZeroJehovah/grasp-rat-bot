'use strict';

const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 30000;
const DEFAULT_PERSIST_MAX_MS = 60 * 60 * 1000;
const EXIT_RECOVERY_OUTCOMES = new Set([
  'confirmed-absent',
  'self-present-recovered',
  'timeout-unconfirmed'
]);

// Offline fixture for the ten supervisor fallback records indexed in the
// 2026-07-29 runtime-log report. These are historical transport outcomes,
// not production routing rules: the fixture proves that every original
// status sequence stays associated with exactly one safe terminal outcome.
const REPORTED_FALLBACK_SEQUENCES_2026_07_29 = Object.freeze([
  { sourceRunId: 'profit-live-20260729T040132532Z', statuses: [403, 403, 403, 403], terminal: 'confirmed-absent' },
  { sourceRunId: 'profit-live-20260729T100602883Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T111826960Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T112041768Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T113626086Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T113737344Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T115626372Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T121147326Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T124033674Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' },
  { sourceRunId: 'profit-live-20260729T125112049Z', statuses: [502, 502, 502, 502], terminal: 'timeout-unconfirmed' }
]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMs(value) {
  const number = finiteNumber(value);
  if (number !== null && number > 0) return number;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeAttemptPart(value, fallback = 'unknown') {
  const text = String(value == null ? '' : value)
    .replace(/[^A-Za-z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return text || fallback;
}

function createExitAttemptId(sourceRunId, startedAtMs = Date.now(), sequence = 0) {
  const started = Math.max(0, Math.floor(Number(startedAtMs) || 0));
  const ordinal = Math.max(0, Math.floor(Number(sequence) || 0));
  return `exit:${safeAttemptPart(sourceRunId, 'run')}:${started}:${ordinal}`;
}

function normalizedHttpStatuses(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map(item => Math.max(0, Math.round(Number(item))))
    .filter(Number.isFinite)
    .slice(-16);
}

const RECOVERY_OBSERVATION_MAX_AGE_MS = 60000;
const RECOVERY_EPOCH_MIN_SAMPLES = 2;

// A recovery observation is only absence authority when it came back from a
// real authenticated HTTP snapshot that carried one complete global entity
// list. Login bypasses, error pages, partial payloads, and reused local state
// never qualify, and every rejection keeps its own reason so operators can see
// why the exit lock is still held.
const RECOVERY_EVIDENCE_REASONS = Object.freeze({
  usable: 'usable',
  noHttpResponse: 'no-http-response',
  httpError: 'snapshot-http-error',
  invalidPayload: 'invalid-snapshot-payload',
  incompleteGlobal: 'incomplete-global-snapshot',
  missingTick: 'missing-snapshot-tick',
  missingSelfAuthority: 'missing-self-authority',
  staleObservation: 'stale-observation',
  noLineageAdvance: 'no-http-lineage-advance',
  epochUnconfirmed: 'epoch-rollover-unconfirmed'
});

function recoveryDayKey(ms) {
  const value = finiteNumber(ms);
  if (value === null || value <= 0) return '';
  return new Date(value + (8 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function normalizeRecoverySnapshotEvidence(snapshotSafety, options = {}) {
  const response = snapshotSafety?.response && typeof snapshotSafety.response === 'object'
    ? snapshotSafety.response
    : null;
  const summary = response?.summary && typeof response.summary === 'object' ? response.summary : null;
  const status = finiteNumber(response?.status);
  const httpOk = Boolean(response) && (
    response.httpOk === true || (status !== null && status >= 200 && status < 300)
  );
  const checkedAt = String(snapshotSafety?.checkedAt || '');
  const observedAtMs = timestampMs(checkedAt) || timestampMs(snapshotSafety?.observedAtMs);
  const tick = finiteNumber(summary?.tick);
  const selfPresent = typeof summary?.selfPresent === 'boolean' ? summary.selfPresent : null;
  const valid = summary?.valid === true;
  // The maintained HTTP snapshot path answers with one global entity list, so
  // completeness follows from a real 2xx response plus a JSON entity array, the
  // same rule the snapshot audit uses (`completeHttpSnapshot`). A caller that
  // knows it holds a partial list, and a payload without an entity array, both
  // stay disqualified: absence must never be inferred from a partial view.
  const completeGlobal = Boolean(
    valid
      && httpOk
      && options.global !== false
      && summary?.completeEntityList !== false
      && finiteNumber(summary?.entityCount) !== null
  );
  const freshnessOk = summary?.freshness?.ok === true;
  let reason = RECOVERY_EVIDENCE_REASONS.usable;
  if (!response) reason = RECOVERY_EVIDENCE_REASONS.noHttpResponse;
  else if (!httpOk) reason = RECOVERY_EVIDENCE_REASONS.httpError;
  else if (!valid) reason = RECOVERY_EVIDENCE_REASONS.invalidPayload;
  else if (!completeGlobal) reason = RECOVERY_EVIDENCE_REASONS.incompleteGlobal;
  else if (tick === null) reason = RECOVERY_EVIDENCE_REASONS.missingTick;
  else if (selfPresent === null) reason = RECOVERY_EVIDENCE_REASONS.missingSelfAuthority;
  else if (!observedAtMs) reason = RECOVERY_EVIDENCE_REASONS.staleObservation;
  return {
    usable: reason === RECOVERY_EVIDENCE_REASONS.usable,
    reason,
    checkedAt,
    observedAtMs,
    dayKey: recoveryDayKey(observedAtMs),
    httpOk,
    status,
    valid,
    completeGlobal,
    selfPresent,
    tick,
    freshnessOk,
    source: String(options.evidenceSource || snapshotSafety?.snapshotPurpose || '')
  };
}

// The HTTP snapshot endpoint counts ticks in its own per-day lineage. A
// midnight roll moves that counter backwards while the crashed session's
// realtime watermark still holds the previous day's value, so absence is only
// trustworthy after the reset has been seen and the new lineage has advanced
// monotonically with self absent in every sample.
function updateSnapshotTickLineage(previous, evidence, options = {}) {
  const minimumSamples = Math.max(
    1,
    Math.round(Number(options.minimumSamples || RECOVERY_EPOCH_MIN_SAMPLES) || RECOVERY_EPOCH_MIN_SAMPLES)
  );
  const dayKey = String(evidence?.dayKey || '');
  const tick = finiteNumber(evidence?.tick);
  const absent = evidence?.selfPresent === false;
  const priorDay = String(previous?.dayKey || '');
  const priorTick = finiteNumber(previous?.lastTick);
  const hasPrior = Boolean(previous) && priorTick !== null;
  const dayChanged = hasPrior && priorDay !== dayKey;
  // Re-establishing a rolled epoch needs genuinely increasing global
  // observations, so a repeated tick neither counts as progress nor loses the
  // fact that a reset was already seen.
  const advanced = hasPrior && !dayChanged && tick !== null && priorTick < tick;
  const repeated = hasPrior && !dayChanged && tick !== null && priorTick === tick;
  const resetObserved = hasPrior && (dayChanged || priorTick > tick)
    ? true
    : Boolean((advanced || repeated) && previous.resetObserved === true);
  const samples = advanced ? Math.max(1, Math.round(Number(previous.samples || 0))) + 1 : 1;
  const selfAbsentSamples = advanced
    ? (absent ? Math.max(0, Math.round(Number(previous.selfAbsentSamples || 0))) + 1 : 0)
    : (absent ? 1 : 0);
  const lineage = {
    dayKey,
    lastTick: tick,
    samples,
    selfAbsentSamples,
    resetObserved,
    previousLastTick: hasPrior ? priorTick : null,
    previousDayKey: hasPrior ? priorDay : '',
    firstObservedAt: advanced ? String(previous.firstObservedAt || '') : String(evidence?.checkedAt || ''),
    lastObservedAt: String(evidence?.checkedAt || ''),
    lastSelfPresent: evidence?.selfPresent === null ? null : Boolean(evidence?.selfPresent)
  };
  return {
    lineage,
    epochReestablished: Boolean(
      tick !== null
        && lineage.resetObserved
        && samples >= minimumSamples
        && selfAbsentSamples === samples
    )
  };
}

function pendingExitIsExpired(value, nowMs = Date.now(), options = {}) {
  const firstAtMs = timestampMs(value?.firstAtMs ?? value?.firstAt);
  if (!firstAtMs) return false;
  const maximumAgeMs = Math.max(1000, Number(options.maximumAgeMs || DEFAULT_PERSIST_MAX_MS));
  return Number(nowMs) - firstAtMs > maximumAgeMs;
}

function pendingExitRetryDelayMs(attemptCount, options = {}) {
  const baseMs = Math.max(250, Number(options.baseMs || DEFAULT_RETRY_BASE_MS));
  const maxMs = Math.max(baseMs, Number(options.maxMs || DEFAULT_RETRY_MAX_MS));
  const exponent = Math.min(10, Math.max(0, Math.floor(Number(attemptCount || 0))));
  return Math.min(maxMs, baseMs * (2 ** exponent));
}

function normalizePendingExit(value, nowMs = Date.now(), options = {}) {
  if (!value || typeof value !== 'object') return null;
  const firstAtMs = timestampMs(
    value.firstAtMs
      ?? value.firstAt
      ?? value.startedAtMs
      ?? value.startedAt
  );
  if (!firstAtMs) return null;
  const maximumAgeMs = Math.max(1000, Number(options.maximumAgeMs || DEFAULT_PERSIST_MAX_MS));
  const expired = Number(nowMs) - firstAtMs > maximumAgeMs;
  if (expired && options.allowExpired !== true) return null;
  const attemptCount = Math.max(0, Math.round(Number(value.attemptCount || 0)));
  const requestAttemptCount = Math.max(0, Math.round(Number(value.requestAttemptCount || 0)));
  const retryDelayMs = pendingExitRetryDelayMs(attemptCount, options);
  const lastAttemptAtMs = timestampMs(value.lastAttemptAtMs ?? value.lastAttemptAt) || firstAtMs;
  const nextRetryAtMs = timestampMs(value.nextRetryAtMs ?? value.nextRetryAt)
    || lastAttemptAtMs + retryDelayMs;
  const sourceRunId = String(value.sourceRunId || value.runId || '');
  const exitAttemptId = String(value.exitAttemptId || createExitAttemptId(sourceRunId, firstAtMs, 0));
  return {
    active: value.active !== false,
    reason: String(value.reason || 'unconfirmed-leave'),
    targetId: value.targetId === null || value.targetId === undefined ? '' : String(value.targetId),
    sourceRunId,
    exitAttemptId,
    recoveredFromExitAttemptId: String(value.recoveredFromExitAttemptId || ''),
    originalReason: String(value.originalReason || value.reason || 'unconfirmed-leave'),
    entryUnconfirmed: value.entryUnconfirmed === true,
    firstAt: new Date(firstAtMs).toISOString(),
    firstAtMs,
    lastAttemptAt: new Date(lastAttemptAtMs).toISOString(),
    lastAttemptAtMs,
    attemptCount,
    requestAttemptCount,
    startHp: finiteNumber(value.startHp),
    minHp: finiteNumber(value.minHp),
    lastHp: finiteNumber(value.lastHp),
    retryDelayMs,
    nextRetryAt: new Date(nextRetryAtMs).toISOString(),
    nextRetryAtMs,
    lastError: String(value.lastError || value.error || ''),
    httpStatuses: normalizedHttpStatuses(value.httpStatuses ?? value.statuses),
    outcomeEmitted: value.outcomeEmitted === true,
    expired,
    recoveryMode: 'exit-recovery'
  };
}

function buildExitRecoveryOutcome(pendingExit, detail = {}) {
  const completedAtMs = timestampMs(detail.completedAtMs ?? detail.atMs) || Date.now();
  const pending = normalizePendingExit(pendingExit, completedAtMs, {
    maximumAgeMs: Number.MAX_SAFE_INTEGER,
    allowExpired: true
  });
  if (!pending) return null;
  const outcome = EXIT_RECOVERY_OUTCOMES.has(String(detail.outcome || ''))
    ? String(detail.outcome)
    : 'timeout-unconfirmed';
  const authority = ['snapshot', 'realtime', 'HTTP'].includes(String(detail.authority || ''))
    ? String(detail.authority)
    : 'HTTP';
  const statuses = normalizedHttpStatuses([
    ...(pending.httpStatuses || []),
    ...(detail.httpStatuses || [])
  ]);
  return {
    exitAttemptId: pending.exitAttemptId,
    originalReason: pending.originalReason || pending.reason,
    outcome,
    authority,
    startedAt: pending.firstAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - pending.firstAtMs),
    httpStatuses: statuses,
    lastHp: finiteNumber(detail.lastHp ?? pending.lastHp),
    minHp: finiteNumber(detail.minHp ?? pending.minHp),
    reloginAllowed: outcome === 'confirmed-absent',
    sourceRunId: pending.sourceRunId || '',
    recoveredFromExitAttemptId: pending.recoveredFromExitAttemptId || ''
  };
}

function hasCanaryInGameEvidence(canary) {
  const stats = canary?.stats || {};
  return Boolean(
    canary?.snapshotSafety?.response?.summary?.selfPresent === true
      || canary?.entry?.firstSelf
      || Number(stats.selfPresent?.true || 0) > 0
  );
}

function isExplicitZeroFrameCanary(canary) {
  const stats = canary?.stats;
  return Boolean(
    stats
      && Object.prototype.hasOwnProperty.call(stats, 'frameCount')
      && Number(stats.frameCount) === 0
  );
}

function pendingExitFromCanary(previous, canary, nowMs = Date.now(), options = {}) {
  const leave = canary?.leave || canary?.safety?.exit?.leave || null;
  if (leave?.ok) return null;
  const event = canary?.safety?.event || null;
  const leaveFailed = Boolean(leave && leave.ok !== true);
  if (!event?.shouldLeave && !leaveFailed) return normalizePendingExit(previous, nowMs, options);
  const prior = normalizePendingExit(previous, nowMs, options);
  const pending = canary?.safety?.leavePending || null;
  const pendingAttemptId = String(pending?.exitAttemptId || '');
  const renewedRecoveryChain = Boolean(
    pending?.recoveredFromExitAttemptId
      || event?.detail?.exitRecovery === true
  );
  const entryUnconfirmed = event?.detail?.entryUnconfirmed === true
    || event?.detail?.pendingExit?.entryUnconfirmed === true
    || pending?.entryUnconfirmed === true
    || prior?.entryUnconfirmed === true;
  // A rejected handshake can still make the generic leave fallback fail. It
  // is not an in-game exit, so it must not start a relogin-blocking chain.
  // An expired pending-exit chain is different: its fresh protected leave has
  // an explicit recovered-from link and must remain persisted even though the
  // recovery canary intentionally opens no WebSocket frames.
  if (!prior
    && isExplicitZeroFrameCanary(canary)
    && !hasCanaryInGameEvidence(canary)
    && !renewedRecoveryChain
    && !entryUnconfirmed) return null;
  const continuesPriorAttempt = Boolean(
    prior && (!pendingAttemptId || pendingAttemptId === String(prior.exitAttemptId || ''))
  );
  // A fresh protected leave after self-present recovery owns a fresh audit
  // chain. The explicit recovered-from link preserves causality; counters,
  // timestamps, HP, and HTTP statuses must not be relabelled under the new ID.
  const chainPrior = continuesPriorAttempt ? prior : null;
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts.length : 0;
  const attemptCount = Math.max(0, Number(chainPrior?.attemptCount || 0)) + 1;
  const requestAttemptCount = Math.max(0, Number(chainPrior?.requestAttemptCount || 0)) + attempts;
  const retryDelayMs = pendingExitRetryDelayMs(attemptCount, options);
  const firstAtMs = chainPrior?.firstAtMs
    || timestampMs(pending?.startedAtMs ?? pending?.startedAt)
    || timestampMs(event?.at)
    || timestampMs(canary?.startedAt)
    || Number(nowMs);
  const eventDecision = event?.detail?.decision || event?.detail?.lastDecision || event?.decision || {};
  const targetId = pending?.targetId
    ?? eventDecision?.action?.target?.userId
    ?? eventDecision?.combat?.target?.userId
    ?? eventDecision?.target?.userId
    ?? '';
  // `leavePending.httpStatuses` is populated by each leave-result callback.
  // The final leave object contains the same attempts, so concatenating both
  // would turn one four-502 fallback into eight statuses in persisted audit
  // state. Prefer that in-flight sequence when it is available; only append
  // a final result when no pending callback observed it.
  const pendingStatuses = normalizedHttpStatuses(pending?.httpStatuses);
  const finalAttemptStatuses = normalizedHttpStatuses(
    Array.isArray(leave?.attempts) ? leave.attempts.map(item => item?.status) : []
  );
  const requestResultCountKnown = Boolean(
    pending
      && Object.prototype.hasOwnProperty.call(pending, 'requestResultCount')
  );
  const observedCurrentRequestResults = Math.max(0, Number(pending?.requestResultCount || 0)) > 0;
  const httpStatuses = pendingStatuses.length
    ? (!requestResultCountKnown || observedCurrentRequestResults
        ? pendingStatuses
        : normalizedHttpStatuses([
            ...pendingStatuses,
            ...finalAttemptStatuses
          ]))
    : normalizedHttpStatuses([
        ...(chainPrior?.httpStatuses || []),
        ...finalAttemptStatuses
      ]);
  return normalizePendingExit({
    active: true,
    reason: pending?.originalReason || chainPrior?.reason || event?.reason || canary?.error || 'unconfirmed-leave',
    targetId: chainPrior?.targetId || targetId,
    sourceRunId: pending?.sourceRunId || canary?.runId || chainPrior?.sourceRunId || '',
    exitAttemptId: pendingAttemptId || chainPrior?.exitAttemptId || createExitAttemptId(canary?.runId || '', firstAtMs, 0),
    recoveredFromExitAttemptId: pending?.recoveredFromExitAttemptId || '',
    originalReason: pending?.originalReason || chainPrior?.originalReason || event?.reason || 'unconfirmed-leave',
    entryUnconfirmed,
    firstAtMs,
    lastAttemptAtMs: Number(nowMs),
    attemptCount,
    requestAttemptCount,
    startHp: chainPrior?.startHp ?? pending?.startHp,
    minHp: pending?.minHp ?? chainPrior?.minHp,
    lastHp: pending?.lastHp ?? chainPrior?.lastHp,
    nextRetryAtMs: Number(nowMs) + retryDelayMs,
    lastError: leave?.error || pending?.error || canary?.error || chainPrior?.lastError || '',
    httpStatuses
  }, nowMs, options);
}

function pendingExitSnapshotResolution(pendingExit, snapshotSafety, options = {}) {
  const referenceNowMs = timestampMs(pendingExit?.lastAttemptAtMs ?? pendingExit?.lastAttemptAt)
    || timestampMs(snapshotSafety?.checkedAt)
    || Date.now();
  const pending = normalizePendingExit(pendingExit, referenceNowMs, {
    maximumAgeMs: options.maximumAgeMs,
    allowExpired: options.allowExpired === true
  });
  if (!pending) return { active: false, cleared: false, reason: 'inactive', pendingExit: null, evidence: null };
  const summary = snapshotSafety?.response?.summary || {};
  const evidence = normalizeRecoverySnapshotEvidence(snapshotSafety, options);
  const nowMs = finiteNumber(options.nowMs) ?? referenceNowMs;
  const maximumObservationAgeMs = Math.max(
    0,
    Number(options.maximumObservationAgeMs || RECOVERY_OBSERVATION_MAX_AGE_MS)
  );
  const observationAgeMs = evidence.observedAtMs ? nowMs - evidence.observedAtMs : null;
  const observationFresh = evidence.usable
    && evidence.observedAtMs > 0
    && observationAgeMs !== null
    && observationAgeMs <= maximumObservationAgeMs;
  const lineageState = options.lineageState && typeof options.lineageState === 'object'
    ? options.lineageState
    : {};
  const lineage = lineageState.lineage && typeof lineageState.lineage === 'object'
    ? lineageState.lineage
    : null;
  const lineageTick = finiteNumber(lineage?.lastTick);
  const lineageAdvance = Boolean(
    lineage
      && lineageTick !== null
      && evidence.tick !== null
      && String(lineage.dayKey || '') === evidence.dayKey
      && lineageTick < evidence.tick
  );
  const epochReestablished = Boolean(lineageState.epochReestablished);
  // Realtime frame ticks belong to the session's own clock. The HTTP snapshot
  // lineage is the only comparable watermark for snapshot evidence, so a
  // snapshot that neither advances that lineage nor re-establishes it after a
  // day rollover cannot clear the lock. Without a first realtime frame there is
  // no post-upgrade watermark at all, so an ordinary pending exit still accepts
  // a fresh complete snapshot; a hidden join needs verified HTTP leave.
  const freshnessAuthority = observationFresh && (
    lineageAdvance
      || (options.requireLineageAuthority !== true && evidence.freshnessOk)
      || epochReestablished
  );
  const evidenceReason = !evidence.usable
    ? evidence.reason
    : (!observationFresh
        ? RECOVERY_EVIDENCE_REASONS.staleObservation
        : (freshnessAuthority
            ? RECOVERY_EVIDENCE_REASONS.usable
            : (evidence.freshnessOk
                ? RECOVERY_EVIDENCE_REASONS.noLineageAdvance
                : RECOVERY_EVIDENCE_REASONS.epochUnconfirmed)));
  const authority = {
    source: evidence.source,
    httpOk: evidence.httpOk,
    status: evidence.status,
    completeGlobal: evidence.completeGlobal,
    selfPresent: evidence.selfPresent,
    tick: evidence.tick,
    dayKey: evidence.dayKey,
    freshnessOk: evidence.freshnessOk,
    lineageAdvance,
    epochReestablished,
    observationAgeMs,
    reason: evidenceReason
  };
  if (evidence.usable && observationFresh && evidence.selfPresent === true) {
    return {
      active: true,
      cleared: false,
      reason: 'snapshot-self-present',
      pendingExit: pending,
      outcome: null,
      evidence: authority
    };
  }
  if (freshnessAuthority && evidence.selfPresent === false && !pending.entryUnconfirmed) {
    return {
      active: false,
      cleared: true,
      reason: 'fresh-snapshot-self-absent',
      pendingExit: null,
      evidence: authority,
      outcome: buildExitRecoveryOutcome(pending, {
        outcome: 'confirmed-absent',
        authority: 'snapshot',
        completedAtMs: evidence.observedAtMs || referenceNowMs,
        lastHp: summary?.self?.hp ?? pending.lastHp
      })
    };
  }
  return {
    active: true,
    cleared: false,
    reason: evidenceReason === RECOVERY_EVIDENCE_REASONS.usable
      ? 'self-absence-unconfirmed'
      : evidenceReason,
    pendingExit: pending,
    outcome: null,
    evidence: authority
  };
}

function pendingExitRecoveryEvent(pendingExit, nowMs = Date.now(), options = {}) {
  const pending = normalizePendingExit(pendingExit, nowMs, {
    maximumAgeMs: options.maximumAgeMs,
    allowExpired: options.allowExpired === true
  });
  if (!pending) return null;
  return {
    ok: false,
    at: new Date(Number(nowMs)).toISOString(),
    reason: pending.reason,
    classification: 'exit-recovery',
    shouldLeave: true,
    stopMotion: false,
    detail: {
      source: 'persisted-pending-exit',
      exitRecovery: true,
      exitAttemptId: pending.exitAttemptId,
      continuePendingExit: options.continueAttempt === true,
      pendingExit: pending
    }
  };
}

function runPendingExitRecoverySelfTest() {
  const nowMs = Date.parse('2026-07-29T00:00:00.000Z');
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`pending exit recovery self-test failed: ${name}`);
  };
  // Complete global HTTP snapshot fixtures: absence authority in this module
  // now requires a real 200 response, a valid global entity list, an explicit
  // selfPresent flag, and a tick that advances the HTTP lineage.
  const recoveryDay = '2026-07-29';
  const recoveryObservation = (overrides = {}) => ({
    checkedAt: new Date(nowMs).toISOString(),
    observedAtMs: nowMs,
    ok: true,
    response: {
      httpOk: true,
      status: 200,
      summary: {
        valid: true,
        tick: 900000,
        totalEntities: 1200,
        inGameCount: 1100,
        visibleCount: 1100,
        entityCount: 1100,
        selfPresent: false,
        freshness: { ok: true },
        ...overrides
      }
    }
  });
  const lineage = (overrides = {}, epochReestablished = false) => ({
    lineage: { dayKey: recoveryDay, lastTick: 899000, samples: 2, selfAbsentSamples: 2, ...overrides },
    epochReestablished
  });
  try {
    const attemptId = createExitAttemptId('p3-self-test', nowMs - 1000, 2);
    const pending = normalizePendingExit({
      active: true,
      exitAttemptId: attemptId,
      originalReason: 'ws-closed',
      reason: 'ws-closed',
      sourceRunId: 'p3-self-test',
      firstAtMs: nowMs - 1000,
      lastAttemptAtMs: nowMs - 200,
      attemptCount: 1,
      requestAttemptCount: 4,
      startHp: 90,
      minHp: 88,
      lastHp: 88,
      httpStatuses: [200, 403, 502, 502]
    }, nowMs);
    assert('stable ids and HTTP status sequence survive persistence', pending.exitAttemptId === attemptId
      && pending.httpStatuses.join(',') === '200,403,502,502');
    const deduplicatedPersist = pendingExitFromCanary(null, {
      runId: 'p3-no-duplicate-statuses',
      startedAt: new Date(nowMs - 1000).toISOString(),
      safety: {
        event: { reason: 'frame-gap', shouldLeave: true, at: new Date(nowMs - 900).toISOString() },
        leavePending: {
          exitAttemptId: createExitAttemptId('p3-no-duplicate-statuses', nowMs - 900, 0),
          originalReason: 'frame-gap',
          sourceRunId: 'p3-no-duplicate-statuses',
          httpStatuses: [502, 502, 502, 502]
        }
      },
      leave: { ok: false, attempts: [{ status: 502 }, { status: 502 }, { status: 502 }, { status: 502 }] }
    }, nowMs);
    assert('persisted fallback status sequence is not duplicated from final leave attempts',
      deduplicatedPersist?.httpStatuses.join(',') === '502,502,502,502');
    const rejectedInitialHandshake = pendingExitFromCanary(null, {
      runId: 'zero-frame-cf-rejection',
      startedAt: new Date(nowMs - 750).toISOString(),
      error: 'websocket source IP attempts exhausted',
      // This flag can be inherited from an earlier canary, so it cannot on
      // its own authorize a new zero-frame exit-recovery chain.
      recovery: { inGameEvidence: true, source: 'previous-canary' },
      entry: { firstSelf: null },
      stats: {
        frameCount: 0,
        realtimeFrameCount: 0,
        selfPresent: { true: 0, false: 0, unknown: 0 }
      },
      safety: {
        leaveFailure: { reason: 'direct-leave-failed' }
      },
      leave: {
        ok: false,
        error: 'HTTP 403',
        attempts: [{ status: 403 }, { status: 403 }, { status: 403 }, { status: 403 }]
      }
    }, nowMs);
    assert('zero-frame rejected handshakes never start a pending-exit chain', rejectedInitialHandshake === null);
    const liveSafetyLeave = pendingExitFromCanary(null, {
      runId: 'live-safety-leave',
      startedAt: new Date(nowMs - 750).toISOString(),
      recovery: { inGameEvidence: true },
      stats: { frameCount: 12, selfPresent: { true: 12, false: 0, unknown: 0 } },
      safety: {
        event: { reason: 'frame-gap', shouldLeave: true, at: new Date(nowMs - 700).toISOString() }
      },
      leave: { ok: false, error: 'HTTP 502', attempts: [{ status: 502 }] }
    }, nowMs);
    assert('an in-game safety leave failure still starts protected recovery', liveSafetyLeave?.active === true
      && liveSafetyLeave.reason === 'frame-gap'
      && liveSafetyLeave.httpStatuses.join(',') === '502');
    const continuedProtectedExit = pendingExitFromCanary({
      active: true,
      exitAttemptId: createExitAttemptId('existing-live-exit', nowMs - 2000, 0),
      originalReason: 'frame-gap',
      reason: 'frame-gap',
      sourceRunId: 'existing-live-exit',
      firstAtMs: nowMs - 2000,
      lastAttemptAtMs: nowMs - 1000,
      attemptCount: 1,
      requestAttemptCount: 4,
      httpStatuses: [502, 502, 502, 502]
    }, {
      runId: 'zero-frame-retry-of-existing-exit',
      recovery: { inGameEvidence: false },
      stats: { frameCount: 0, selfPresent: { true: 0, false: 0, unknown: 0 } },
      leave: { ok: false, error: 'HTTP 502', attempts: [{ status: 502 }] }
    }, nowMs);
    assert('an existing protected exit continues through a later zero-frame retry',
      continuedProtectedExit?.exitAttemptId === createExitAttemptId('existing-live-exit', nowMs - 2000, 0)
        && continuedProtectedExit.attemptCount === 2
        && continuedProtectedExit.httpStatuses.join(',') === '502,502,502,502,502');
    const previousAttemptId = createExitAttemptId('p3-old-chain', nowMs - 5000, 0);
    const nextAttemptId = createExitAttemptId('p3-new-chain', nowMs - 500, 0);
    const freshChain = pendingExitFromCanary({
      active: true,
      exitAttemptId: previousAttemptId,
      originalReason: 'frame-gap',
      reason: 'frame-gap',
      sourceRunId: 'p3-old-chain',
      firstAtMs: nowMs - 5000,
      lastAttemptAtMs: nowMs - 4000,
      attemptCount: 3,
      requestAttemptCount: 12,
      startHp: 91,
      minHp: 70,
      lastHp: 70,
      httpStatuses: [502, 502, 502, 502]
    }, {
      runId: 'p3-new-chain',
      safety: {
        event: { reason: 'frame-gap', shouldLeave: true, at: new Date(nowMs - 500).toISOString() },
        leavePending: {
          exitAttemptId: nextAttemptId,
          recoveredFromExitAttemptId: previousAttemptId,
          originalReason: 'frame-gap',
          sourceRunId: 'p3-new-chain',
          startedAtMs: nowMs - 500,
          startHp: 84,
          minHp: 83,
          lastHp: 83,
          httpStatuses: [502]
        }
      },
      leave: { ok: false, error: 'HTTP 502', attempts: [{ status: 502 }] }
    }, nowMs);
    assert('a recovered leave ID starts a clean linked audit chain', freshChain?.exitAttemptId === nextAttemptId
      && freshChain.recoveredFromExitAttemptId === previousAttemptId
      && freshChain.firstAtMs === nowMs - 500
      && freshChain.attemptCount === 1
      && freshChain.requestAttemptCount === 1
      && freshChain.startHp === 84
      && freshChain.httpStatuses.join(',') === '502');
    const absent = pendingExitSnapshotResolution(pending, recoveryObservation(), {
      nowMs,
      lineageState: lineage()
    });
    assert('fresh snapshot absence produces the only relogin-permitting outcome', absent.cleared
      && absent.outcome?.outcome === 'confirmed-absent'
      && absent.outcome?.authority === 'snapshot'
      && absent.outcome?.reloginAllowed === true
      && absent.evidence?.lineageAdvance === true);
    const present = pendingExitSnapshotResolution(pending, recoveryObservation({ selfPresent: true }), {
      nowMs,
      lineageState: lineage()
    });
    const bypassOnly = pendingExitSnapshotResolution(pending, {
      ok: true,
      reason: 'daily-first-login-invulnerability',
      bypassedPreLoginSafety: true,
      bypassKind: 'daily-first-login',
      required: 1,
      streak: 1,
      satisfied: true,
      checkedAt: new Date(nowMs).toISOString()
    }, { nowMs, lineageState: lineage() });
    assert('a login bypass object is never absence authority', bypassOnly.active
      && bypassOnly.cleared === false
      && bypassOnly.reason === RECOVERY_EVIDENCE_REASONS.noHttpResponse
      && bypassOnly.evidence?.selfPresent === null);
    const partialList = pendingExitSnapshotResolution(pending, recoveryObservation({
      completeEntityList: false
    }), { nowMs, lineageState: lineage() });
    assert('a declared partial entity list cannot clear the lock', partialList.active
      && partialList.cleared === false
      && partialList.reason === RECOVERY_EVIDENCE_REASONS.incompleteGlobal);
    const nonArrayList = pendingExitSnapshotResolution(pending, recoveryObservation({
      valid: false,
      entityCount: undefined
    }), { nowMs, lineageState: lineage() });
    assert('a payload without a global entity array cannot clear the lock', nonArrayList.active
      && nonArrayList.cleared === false
      && nonArrayList.reason === RECOVERY_EVIDENCE_REASONS.invalidPayload);
    const noSelfFlag = pendingExitSnapshotResolution(pending, recoveryObservation({ selfPresent: undefined }), {
      nowMs,
      lineageState: lineage()
    });
    assert('missing self authority stays unknown instead of absent', noSelfFlag.active
      && noSelfFlag.cleared === false
      && noSelfFlag.reason === RECOVERY_EVIDENCE_REASONS.missingSelfAuthority);
    const staleObservation = pendingExitSnapshotResolution(pending, {
      ...recoveryObservation(),
      checkedAt: new Date(nowMs - 120000).toISOString(),
      observedAtMs: nowMs - 120000
    }, { nowMs, lineageState: lineage() });
    assert('an old observation cannot clear the lock', staleObservation.active
      && staleObservation.cleared === false
      && staleObservation.reason === RECOVERY_EVIDENCE_REASONS.staleObservation);
    const noLineage = pendingExitSnapshotResolution(pending, recoveryObservation(), {
      nowMs,
      lineageState: { lineage: null, epochReestablished: false },
      requireLineageAuthority: true
    });
    assert('periodic reuse needs HTTP lineage advance', noLineage.active
      && noLineage.cleared === false
      && noLineage.reason === RECOVERY_EVIDENCE_REASONS.noLineageAdvance);
    const staleLineage = pendingExitSnapshotResolution(pending, recoveryObservation({
      tick: 12,
      freshness: { ok: false, reason: 'stale-snapshot-tick' }
    }), {
      nowMs,
      lineageState: lineage({ dayKey: '2026-07-28', lastTick: 1700000 }),
      requireLineageAuthority: true
    });
    assert('a midnight tick reset alone is not absence authority', staleLineage.active
      && staleLineage.cleared === false
      && staleLineage.reason === RECOVERY_EVIDENCE_REASONS.epochUnconfirmed);
    const priorDayLineage = lineage({ dayKey: '2026-07-28', lastTick: 1700000 });
    const firstRollSample = updateSnapshotTickLineage(priorDayLineage.lineage, normalizeRecoverySnapshotEvidence(recoveryObservation({ tick: 12 }), {}), {});
    const secondRollSample = updateSnapshotTickLineage(firstRollSample.lineage, normalizeRecoverySnapshotEvidence(recoveryObservation({ tick: 640 }), {}), {});
    assert('one post-midnight sample cannot re-establish the epoch', firstRollSample.epochReestablished === false
      && secondRollSample.epochReestablished === true
      && secondRollSample.lineage.samples === 2
      && secondRollSample.lineage.resetObserved === true);
    const restoredAfterRollover = pendingExitSnapshotResolution(pending, recoveryObservation({
      tick: 640,
      freshness: { ok: false, reason: 'stale-snapshot-tick' }
    }), {
      nowMs,
      lineageState: {
        lineage: { ...secondRollSample.lineage, lastTick: 1700000 },
        epochReestablished: true
      },
      requireLineageAuthority: true
    });
    assert('a re-established daily epoch restores absence authority', restoredAfterRollover.cleared === true
      && restoredAfterRollover.evidence?.epochReestablished === true);
    const rolledPresent = updateSnapshotTickLineage(firstRollSample.lineage, normalizeRecoverySnapshotEvidence(recoveryObservation({ tick: 641, selfPresent: true }), {}), {});
    const hiddenEntry = normalizePendingExit({ ...pending, entryUnconfirmed: true }, nowMs);
    assert('self presence inside a rolled epoch never clears the lock', rolledPresent.epochReestablished === false
      && pendingExitSnapshotResolution(hiddenEntry, recoveryObservation({ tick: 640 }), {
        nowMs,
        lineageState: secondRollSample,
        requireLineageAuthority: true
      }).active === true);
    const wsRecovery = pendingExitRecoveryEvent(pending, nowMs);
    assert('self presence remains exit-only until a new protected leave', present.active
      && present.reason === 'snapshot-self-present'
      && wsRecovery?.detail?.exitAttemptId === attemptId);
    const httpOutcome = buildExitRecoveryOutcome(pending, {
      outcome: 'confirmed-absent',
      authority: 'HTTP',
      completedAtMs: nowMs,
      httpStatuses: [200]
    });
    assert('HTTP-confirmed outcome retains status history and last HP', httpOutcome?.httpStatuses.join(',') === '200,403,502,502,200'
      && httpOutcome.lastHp === 88);
    const livePendingOutcome = buildExitRecoveryOutcome({
      exitAttemptId: createExitAttemptId('p3-live-pending', nowMs - 750, 0),
      originalReason: 'frame-gap',
      sourceRunId: 'p3-live-pending',
      startedAtMs: nowMs - 750,
      httpStatuses: [200],
      lastHp: 86
    }, {
      outcome: 'confirmed-absent',
      authority: 'HTTP',
      completedAtMs: nowMs
    });
    assert('live leave-pending timestamps produce an HTTP terminal outcome', livePendingOutcome?.outcome === 'confirmed-absent'
      && livePendingOutcome.durationMs === 750
      && livePendingOutcome.httpStatuses.join(',') === '200');
    const expired = normalizePendingExit({
      ...pending,
      firstAtMs: nowMs - DEFAULT_PERSIST_MAX_MS - 1
    }, nowMs, { allowExpired: true });
    const timeout = buildExitRecoveryOutcome(expired, {
      outcome: 'timeout-unconfirmed',
      authority: 'HTTP',
      completedAtMs: nowMs
    });
    assert('expired unconfirmed attempts receive a non-relogin timeout terminal state', expired?.expired === true
      && timeout?.outcome === 'timeout-unconfirmed'
      && timeout?.reloginAllowed === false);
    const emitted = new Set();
    for (const outcome of [absent.outcome, absent.outcome, httpOutcome]) {
      if (!outcome?.exitAttemptId || emitted.has(outcome.exitAttemptId)) continue;
      emitted.add(outcome.exitAttemptId);
    }
    assert('duplicate fallback emission is deduplicated by exitAttemptId', emitted.size === 1);

    // Replay every status sequence cited in the report. A 403 sequence is
    // never trusted by itself; this fixture grants the one recorded
    // post-close fresh-self-absent observation. The nine 502 sequences have
    // no such authority in the source data, so their safe terminal state is
    // explicitly timeout-unconfirmed. Before either terminal path, both 403
    // and 502 remain in protected exit recovery when self is still present.
    const reportedOutcomes = REPORTED_FALLBACK_SEQUENCES_2026_07_29.map((fixture, index) => {
      const startedAtMs = nowMs - 60000 - index;
      const reportPending = normalizePendingExit({
        active: true,
        exitAttemptId: createExitAttemptId(fixture.sourceRunId, startedAtMs, 0),
        originalReason: 'reported-unconfirmed-fallback',
        reason: 'reported-unconfirmed-fallback',
        sourceRunId: fixture.sourceRunId,
        firstAtMs: startedAtMs,
        lastAttemptAtMs: nowMs - 1000,
        attemptCount: 1,
        requestAttemptCount: fixture.statuses.length,
        startHp: 90,
        minHp: 88,
        lastHp: 88,
        httpStatuses: fixture.statuses
      }, nowMs);
      const selfPresent = pendingExitSnapshotResolution(reportPending, recoveryObservation({ selfPresent: true }), {
        nowMs,
        lineageState: lineage()
      });
      const recovery = pendingExitRecoveryEvent(reportPending, nowMs);
      let outcome;
      if (fixture.terminal === 'confirmed-absent') {
        outcome = pendingExitSnapshotResolution(reportPending, recoveryObservation(), {
          nowMs,
          lineageState: lineage()
        }).outcome;
      } else {
        const expired = normalizePendingExit({
          ...reportPending,
          firstAtMs: nowMs - DEFAULT_PERSIST_MAX_MS - 1
        }, nowMs, { allowExpired: true });
        outcome = buildExitRecoveryOutcome(expired, {
          outcome: 'timeout-unconfirmed',
          authority: 'HTTP',
          completedAtMs: nowMs
        });
      }
      return { fixture, reportPending, selfPresent, recovery, outcome };
    });
    assert('all ten reported fallback sequences remain protected while self is present', reportedOutcomes.every(item => (
      item.selfPresent.active
        && item.selfPresent.cleared === false
        && item.recovery?.shouldLeave === true
        && item.recovery?.detail?.exitAttemptId === item.reportPending.exitAttemptId
    )));
    assert('all ten reported fallback sequences produce one matching terminal outcome', reportedOutcomes.length === 10
      && new Set(reportedOutcomes.map(item => item.outcome?.exitAttemptId)).size === 10
      && reportedOutcomes.every(item => (
        item.outcome?.outcome === item.fixture.terminal
          && item.outcome?.httpStatuses.join(',') === item.fixture.statuses.join(',')
          && item.outcome?.reloginAllowed === (item.fixture.terminal === 'confirmed-absent')
      )));
    return { ok: true, cases };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), cases };
  }
}

module.exports = {
  DEFAULT_PERSIST_MAX_MS,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_RETRY_MAX_MS,
  RECOVERY_EPOCH_MIN_SAMPLES,
  RECOVERY_EVIDENCE_REASONS,
  RECOVERY_OBSERVATION_MAX_AGE_MS,
  EXIT_RECOVERY_OUTCOMES,
  buildExitRecoveryOutcome,
  createExitAttemptId,
  normalizePendingExit,
  normalizeRecoverySnapshotEvidence,
  pendingExitFromCanary,
  pendingExitRecoveryEvent,
  pendingExitRetryDelayMs,
  pendingExitIsExpired,
  pendingExitSnapshotResolution,
  runPendingExitRecoverySelfTest,
  updateSnapshotTickLineage
};
