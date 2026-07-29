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

function pendingExitFromCanary(previous, canary, nowMs = Date.now(), options = {}) {
  const leave = canary?.leave || canary?.safety?.exit?.leave || null;
  if (leave?.ok) return null;
  const event = canary?.safety?.event || null;
  const leaveFailed = Boolean(leave && leave.ok !== true);
  if (!event?.shouldLeave && !leaveFailed) return normalizePendingExit(previous, nowMs, options);
  const prior = normalizePendingExit(previous, nowMs, options);
  const pending = canary?.safety?.leavePending || null;
  const pendingAttemptId = String(pending?.exitAttemptId || '');
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
  if (!pending) return { active: false, cleared: false, reason: 'inactive', pendingExit: null };
  const summary = snapshotSafety?.response?.summary || {};
  const freshnessOk = summary?.freshness?.ok === true
    || (summary?.freshness?.ok === undefined && snapshotSafety?.ok === true);
  if (freshnessOk && summary.selfPresent === false) {
    return {
      active: false,
      cleared: true,
      reason: 'fresh-snapshot-self-absent',
      pendingExit: null,
      outcome: buildExitRecoveryOutcome(pending, {
        outcome: 'confirmed-absent',
        authority: 'snapshot',
        completedAtMs: timestampMs(snapshotSafety?.checkedAt) || referenceNowMs,
        lastHp: summary?.self?.hp ?? pending.lastHp
      })
    };
  }
  return {
    active: true,
    cleared: false,
    reason: freshnessOk && summary.selfPresent === true
      ? 'snapshot-self-present'
      : 'self-absence-unconfirmed',
    pendingExit: pending,
    outcome: null
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
    const absent = pendingExitSnapshotResolution(pending, {
      checkedAt: new Date(nowMs).toISOString(),
      ok: true,
      response: { summary: { selfPresent: false, freshness: { ok: true } } }
    });
    assert('fresh snapshot absence produces the only relogin-permitting outcome', absent.cleared
      && absent.outcome?.outcome === 'confirmed-absent'
      && absent.outcome?.authority === 'snapshot'
      && absent.outcome?.reloginAllowed === true);
    const present = pendingExitSnapshotResolution(pending, {
      checkedAt: new Date(nowMs).toISOString(),
      ok: true,
      response: { summary: { selfPresent: true, freshness: { ok: true } } }
    });
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
      const selfPresent = pendingExitSnapshotResolution(reportPending, {
        checkedAt: new Date(nowMs).toISOString(),
        ok: true,
        response: { summary: { selfPresent: true, freshness: { ok: true } } }
      });
      const recovery = pendingExitRecoveryEvent(reportPending, nowMs);
      let outcome;
      if (fixture.terminal === 'confirmed-absent') {
        outcome = pendingExitSnapshotResolution(reportPending, {
          checkedAt: new Date(nowMs).toISOString(),
          ok: true,
          response: { summary: { selfPresent: false, freshness: { ok: true } } }
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
  EXIT_RECOVERY_OUTCOMES,
  buildExitRecoveryOutcome,
  createExitAttemptId,
  normalizePendingExit,
  pendingExitFromCanary,
  pendingExitRecoveryEvent,
  pendingExitRetryDelayMs,
  pendingExitIsExpired,
  pendingExitSnapshotResolution,
  runPendingExitRecoverySelfTest
};
