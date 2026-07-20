'use strict';

const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 30000;
const DEFAULT_PERSIST_MAX_MS = 60 * 60 * 1000;

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

function pendingExitRetryDelayMs(attemptCount, options = {}) {
  const baseMs = Math.max(250, Number(options.baseMs || DEFAULT_RETRY_BASE_MS));
  const maxMs = Math.max(baseMs, Number(options.maxMs || DEFAULT_RETRY_MAX_MS));
  const exponent = Math.min(10, Math.max(0, Math.floor(Number(attemptCount || 0))));
  return Math.min(maxMs, baseMs * (2 ** exponent));
}

function normalizePendingExit(value, nowMs = Date.now(), options = {}) {
  if (!value || typeof value !== 'object') return null;
  const firstAtMs = timestampMs(value.firstAtMs ?? value.firstAt);
  if (!firstAtMs) return null;
  const maximumAgeMs = Math.max(1000, Number(options.maximumAgeMs || DEFAULT_PERSIST_MAX_MS));
  if (Number(nowMs) - firstAtMs > maximumAgeMs) return null;
  const attemptCount = Math.max(0, Math.round(Number(value.attemptCount || 0)));
  const requestAttemptCount = Math.max(0, Math.round(Number(value.requestAttemptCount || 0)));
  const retryDelayMs = pendingExitRetryDelayMs(attemptCount, options);
  const lastAttemptAtMs = timestampMs(value.lastAttemptAtMs ?? value.lastAttemptAt) || firstAtMs;
  const nextRetryAtMs = timestampMs(value.nextRetryAtMs ?? value.nextRetryAt)
    || lastAttemptAtMs + retryDelayMs;
  return {
    active: value.active !== false,
    reason: String(value.reason || 'unconfirmed-leave'),
    targetId: value.targetId === null || value.targetId === undefined ? '' : String(value.targetId),
    sourceRunId: String(value.sourceRunId || value.runId || ''),
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
    recoveryMode: 'exit-recovery'
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
  const attempts = Array.isArray(leave?.attempts) ? leave.attempts.length : 0;
  const attemptCount = Math.max(0, Number(prior?.attemptCount || 0)) + 1;
  const requestAttemptCount = Math.max(0, Number(prior?.requestAttemptCount || 0)) + attempts;
  const retryDelayMs = pendingExitRetryDelayMs(attemptCount, options);
  const firstAtMs = prior?.firstAtMs
    || timestampMs(event?.at)
    || timestampMs(canary?.startedAt)
    || Number(nowMs);
  const targetId = pending?.targetId
    ?? event?.detail?.decision?.action?.target?.userId
    ?? event?.detail?.decision?.combat?.target?.userId
    ?? '';
  return normalizePendingExit({
    active: true,
    reason: prior?.reason || event?.reason || canary?.error || 'unconfirmed-leave',
    targetId: prior?.targetId || targetId,
    sourceRunId: prior?.sourceRunId || canary?.runId || '',
    firstAtMs,
    lastAttemptAtMs: Number(nowMs),
    attemptCount,
    requestAttemptCount,
    startHp: prior?.startHp ?? pending?.startHp,
    minHp: pending?.minHp ?? prior?.minHp,
    lastHp: pending?.lastHp ?? prior?.lastHp,
    nextRetryAtMs: Number(nowMs) + retryDelayMs,
    lastError: leave?.error || pending?.error || canary?.error || prior?.lastError || ''
  }, nowMs, options);
}

function pendingExitSnapshotResolution(pendingExit, snapshotSafety) {
  const referenceNowMs = timestampMs(pendingExit?.lastAttemptAtMs ?? pendingExit?.lastAttemptAt)
    || timestampMs(snapshotSafety?.checkedAt)
    || Date.now();
  const pending = normalizePendingExit(pendingExit, referenceNowMs);
  if (!pending) return { active: false, cleared: false, reason: 'inactive', pendingExit: null };
  const summary = snapshotSafety?.response?.summary || {};
  const freshnessOk = summary?.freshness?.ok === true
    || (summary?.freshness?.ok === undefined && snapshotSafety?.ok === true);
  if (freshnessOk && summary.selfPresent === false) {
    return { active: false, cleared: true, reason: 'fresh-snapshot-self-absent', pendingExit: null };
  }
  return {
    active: true,
    cleared: false,
    reason: summary.selfPresent === true ? 'snapshot-self-present' : 'self-absence-unconfirmed',
    pendingExit: pending
  };
}

function pendingExitRecoveryEvent(pendingExit, nowMs = Date.now()) {
  const pending = normalizePendingExit(pendingExit, nowMs);
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
      pendingExit: pending
    }
  };
}

module.exports = {
  DEFAULT_PERSIST_MAX_MS,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_RETRY_MAX_MS,
  normalizePendingExit,
  pendingExitFromCanary,
  pendingExitRecoveryEvent,
  pendingExitRetryDelayMs,
  pendingExitSnapshotResolution
};
