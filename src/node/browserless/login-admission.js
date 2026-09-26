'use strict';

const { DAY_MS, UTC8_OFFSET_MS } = require('./utc8-day');

const LOGIN_INTERVAL_MS = 60000;
const TRANSPORT_RETRY_BASE_MS = 60000;
const TRANSPORT_RETRY_MAX_MS = 300000;
const HEALTHY_CONTROL_RESET_MS = 60000;
const TRANSPORT_EXIT_REASONS = new Set([
  'frame-gap', 'stale-self', 'ws-closed', 'ws-error',
  'action-settlement-stalled', 'transport-degraded', 'transport-recovery-deadline-leave'
]);

function nullableNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timeMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function iso(value) {
  const parsed = timeMs(value);
  return parsed ? new Date(parsed).toISOString() : '';
}

function boundedText(value) {
  return String(value || '').slice(0, 160);
}

function nonnegativeInteger(value) {
  const number = nullableNumber(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function normalizeAttempt(value) {
  if (!value?.runId || !timeMs(value.at)) return null;
  return {
    runId: boundedText(value.runId), at: iso(value.at),
    firstSelfAt: iso(value.firstSelfAt), firstSelfTick: nonnegativeInteger(value.firstSelfTick)
  };
}

function normalizeServerObservation(value) {
  if (!value || !timeMs(value.observedAt)) return null;
  const userId = nonnegativeInteger(value.userId);
  const dayIndex = nonnegativeInteger(value.dayIndex);
  const count = nonnegativeInteger(value.count);
  const latestTick = nonnegativeInteger(value.latestTick);
  if (!userId || dayIndex === null || (count === null && latestTick === null)) return null;
  return { userId, dayIndex, count, latestTick, observedAt: iso(value.observedAt) };
}

function normalizeLoginAdmission(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const entry = value.lastServerEntry;
  const failure = value.lastFailure;
  return {
    lastAttempt: normalizeAttempt(value.lastAttempt),
    serverObservation: normalizeServerObservation(value.serverObservation),
    lastServerEntry: entry && timeMs(entry.latestAt) ? {
      runId: boundedText(entry.runId),
      userId: nonnegativeInteger(entry.userId),
      dayIndex: nonnegativeInteger(entry.dayIndex),
      count: nonnegativeInteger(entry.count),
      latestTick: nonnegativeInteger(entry.latestTick),
      earliestAt: iso(entry.earliestAt), latestAt: iso(entry.latestAt),
      timeEvidence: boundedText(entry.timeEvidence)
    } : null,
    entryNotBeforeAt: iso(value.entryNotBeforeAt),
    consecutiveFailures: Math.min(32, Math.max(0, nonnegativeInteger(value.consecutiveFailures) || 0)),
    lastFailure: failure?.runId && timeMs(failure.at) ? {
      runId: boundedText(failure.runId), at: iso(failure.at),
      reason: boundedText(failure.reason), awaitingLeave: failure.awaitingLeave === true
    } : null,
    retryNotBeforeAt: iso(value.retryNotBeforeAt),
    lastHealthyAt: iso(value.lastHealthyAt)
  };
}

function loginAttemptStarted(value, event = {}) {
  const state = normalizeLoginAdmission(value);
  const attempt = normalizeAttempt({ runId: event.runId, at: event.attemptedAt });
  if (attempt && attempt.runId !== state.lastAttempt?.runId) state.lastAttempt = attempt;
  return state;
}

function loginAttemptControlled(value, event = {}) {
  const state = normalizeLoginAdmission(value);
  if (state.lastAttempt?.runId === event.runId && timeMs(event.firstSelfAt)) {
    state.lastAttempt.firstSelfAt = iso(event.firstSelfAt);
    state.lastAttempt.firstSelfTick = nonnegativeInteger(event.firstSelfTick);
  }
  // One frame proves control exists; it does not prove the transport is stable.
  return state;
}

function serverJoinObservation(self, observedAtMs, expectedUserId) {
  if (!self || typeof self !== 'object' || !Number.isFinite(observedAtMs) || observedAtMs <= 0) return null;
  const userId = nonnegativeInteger(self.user_id ?? self.userId);
  if (!userId || (expectedUserId && userId !== Number(expectedUserId))) return null;
  const observedDay = Math.floor((observedAtMs + UTC8_OFFSET_MS) / DAY_MS);
  const explicitDay = nonnegativeInteger(self.daily_budget_day_key_utc8 ?? self.dailyBudgetDayKeyUtc8);
  // A previous-day reply cannot advance today's join clock. No tick-to-wall
  // extrapolation is used: server ticks reset at midnight and can drift.
  if (explicitDay !== null && explicitDay !== observedDay) return null;
  const ticks = self.active_join_ticks ?? self.activeJoinTicks;
  const latestTick = Array.isArray(ticks)
    ? ticks.slice(-64).map(nonnegativeInteger).filter(tick => tick !== null).at(-1) ?? null
    : null;
  return normalizeServerObservation({
    userId, dayIndex: explicitDay ?? observedDay,
    count: self.active_join_count ?? self.activeJoinCount, latestTick,
    observedAt: new Date(observedAtMs).toISOString()
  });
}

function compareServerObservations(before, after) {
  if (!after) return { accept: false, grew: false };
  if (!before || before.userId !== after.userId) return { accept: true, grew: false };
  if (timeMs(after.observedAt) < timeMs(before.observedAt) || after.dayIndex < before.dayIndex) {
    return { accept: false, grew: false };
  }
  if (after.dayIndex > before.dayIndex) {
    return { accept: true, grew: (after.count || 0) > 0 || after.latestTick !== null };
  }
  const countDelta = before.count !== null && after.count !== null ? after.count - before.count : null;
  const tickDelta = before.latestTick !== null && after.latestTick !== null ? after.latestTick - before.latestTick : null;
  if ((countDelta !== null && countDelta < 0) || (tickDelta !== null && tickDelta < 0)) {
    return { accept: false, grew: false };
  }
  return { accept: true, grew: countDelta > 0 || tickDelta > 0 };
}

function transportRetryDelayMs(failures) {
  return Math.min(TRANSPORT_RETRY_MAX_MS, TRANSPORT_RETRY_BASE_MS * (2 ** Math.min(4, Math.max(0, failures - 1))));
}

function hasHealthyControlWindow(canary, config = {}) {
  const firstAt = timeMs(canary?.entry?.firstSelfAt);
  const lastAt = nullableNumber(canary?.state?.realtime?.receivedAtMs);
  const maxGap = nullableNumber(canary?.frameHealth?.maxFrameGapMs);
  return Boolean(canary?.entry?.firstSelf && firstAt && lastAt !== null
    && lastAt - firstAt >= HEALTHY_CONTROL_RESET_MS
    && Number(canary?.stats?.selfPresent?.true || 0) >= 60
    && maxGap !== null && maxGap <= Math.max(1000, Number(config.frameGapAlertMs || 2000)));
}

function reconcileLoginAdmission(value, options = {}) {
  const { canary = {}, previousState = {}, config = {}, confirmedLeaveSelf = null } = options;
  const completedAtMs = timeMs(canary.completedAt) || Number(options.nowMs || Date.now());
  const completedAt = new Date(completedAtMs).toISOString();
  const state = loginAttemptStarted(value, {
    runId: canary.runId, attemptedAt: canary.entry?.attemptedAt
  });
  const attempt = state.lastAttempt;
  const pendingSourceRunId = String(previousState.runner?.pendingExit?.sourceRunId || '');
  const recoveryContinuation = !canary.entry?.attemptedAt
    && Boolean(previousState.runner?.pendingExit || canary.recovery?.exitRecovery);
  const associatedAttempt = attempt && (attempt.runId === canary.runId || attempt.runId === pendingSourceRunId
    || (recoveryContinuation && state.lastFailure?.awaitingLeave && state.lastFailure.runId === attempt.runId))
    ? attempt : null;
  const firstSelfAt = timeMs(canary.entry?.firstSelfAt) || timeMs(associatedAttempt?.firstSelfAt);
  const firstSelfTick = nonnegativeInteger(canary.entry?.firstSelfTick ?? associatedAttempt?.firstSelfTick);
  const confirmedAbsent = Boolean(options.confirmedLeave
    || canary.recovery?.pendingExitResolution === 'fresh-snapshot-self-absent');
  const before = state.serverObservation
    || serverJoinObservation(previousState.lastKnown?.self, timeMs(previousState.lastKnown?.at), config.userId)
    || serverJoinObservation(previousState.current?.self, timeMs(previousState.updatedAt), config.userId);
  const after = options.confirmedLeave
    ? serverJoinObservation(confirmedLeaveSelf, completedAtMs, config.userId) : null;
  const comparison = compareServerObservations(before, after);
  if (comparison.accept) {
    state.serverObservation = after;
    if (comparison.grew) {
      const sameDaySelf = firstSelfAt && Math.floor((firstSelfAt + UTC8_OFFSET_MS) / DAY_MS) === after.dayIndex;
      const laterUnobservedJoin = firstSelfTick !== null && after.latestTick !== null && after.latestTick > firstSelfTick;
      const exactUpperBound = sameDaySelf && !laterUnobservedJoin;
      const latestAtMs = exactUpperBound ? firstSelfAt : completedAtMs;
      const attemptedAtMs = timeMs(associatedAttempt?.at);
      state.lastServerEntry = {
        runId: boundedText(associatedAttempt?.runId || canary.runId),
        userId: after.userId, dayIndex: after.dayIndex, count: after.count, latestTick: after.latestTick,
        earliestAt: attemptedAtMs && attemptedAtMs <= latestAtMs ? new Date(attemptedAtMs).toISOString() : '',
        latestAt: new Date(latestAtMs).toISOString(),
        timeEvidence: exactUpperBound ? 'first-self' : 'confirmed-leave-upper-bound'
      };
      state.entryNotBeforeAt = new Date(Math.max(
        timeMs(state.entryNotBeforeAt), latestAtMs + Math.max(LOGIN_INTERVAL_MS, Number(config.loginIntervalMs || LOGIN_INTERVAL_MS))
      )).toISOString();
    }
  } else if (!state.serverObservation && before) {
    state.serverObservation = before;
  }

  const reason = String(canary.safety?.event?.reason || canary.safety?.leaveFailure?.reason || '');
  const uncertainEntry = reason === 'ws-connect-unconfirmed-leave'
    || canary.safety?.leavePending?.entryUnconfirmed === true
    || (Boolean(canary.entry?.attemptedAt) && !canary.entry?.firstSelf
      && /websocket connect timeout|closed before the connection|unexpected response 50[234]/i.test(String(canary.error || '')));
  const leaves = [canary.leave, canary.safety?.exit?.leave];
  const slowTransportExit = TRANSPORT_EXIT_REASONS.has(reason) && leaves.some(leave => (
    (leave?.attempts || []).some(item => /timeout|timed out/i.test(String(item?.error || '')))
  ));
  const failedRunId = boundedText(associatedAttempt?.runId
    || (recoveryContinuation && state.lastFailure?.awaitingLeave ? state.lastFailure.runId : '')
    || pendingSourceRunId || canary.runId);
  const newFailure = (uncertainEntry || slowTransportExit) && failedRunId && state.lastFailure?.runId !== failedRunId;
  if (hasHealthyControlWindow(canary, config) && state.lastFailure?.runId !== failedRunId) {
    state.consecutiveFailures = 0;
    state.lastFailure = null;
    state.retryNotBeforeAt = '';
    state.lastHealthyAt = completedAt;
  }
  if (newFailure) {
    state.consecutiveFailures = Math.min(32, state.consecutiveFailures + 1);
    state.lastFailure = { runId: failedRunId, at: completedAt, reason: uncertainEntry ? 'unconfirmed-entry' : reason, awaitingLeave: !confirmedAbsent };
    state.retryNotBeforeAt = confirmedAbsent
      ? new Date(completedAtMs + transportRetryDelayMs(state.consecutiveFailures)).toISOString() : '';
  } else if (confirmedAbsent && state.lastFailure?.awaitingLeave) {
    state.lastFailure.awaitingLeave = false;
    state.retryNotBeforeAt = new Date(completedAtMs + transportRetryDelayMs(state.consecutiveFailures)).toISOString();
  }
  return normalizeLoginAdmission(state);
}

function loginAdmissionDeadline(state = {}, config = {}) {
  const admission = normalizeLoginAdmission(state.runner?.loginAdmission);
  const lastLoginAtMs = timeMs(state.runner?.lastLoginAt);
  const intervalMs = Math.max(LOGIN_INTERVAL_MS, Number(config.loginIntervalMs || LOGIN_INTERVAL_MS));
  const candidates = [
    { reason: 'login-interval', atMs: lastLoginAtMs ? lastLoginAtMs + intervalMs : 0 },
    { reason: 'server-entry-interval', atMs: timeMs(admission.entryNotBeforeAt) },
    { reason: 'login-transport-backoff', atMs: timeMs(admission.retryNotBeforeAt) }
  ];
  return candidates.reduce((best, item) => item.atMs >= best.atMs ? item : best);
}

function serverEntryObservedToday(state = {}, nowMs = Date.now()) {
  const entry = state.runner?.loginAdmission?.serverObservation;
  return Boolean(entry?.userId === Number(state.session?.userId)
    && entry.dayIndex === Math.floor((Number(nowMs) + UTC8_OFFSET_MS) / DAY_MS)
    && ((entry.count || 0) > 0 || nullableNumber(entry.latestTick) !== null));
}

module.exports = {
  HEALTHY_CONTROL_RESET_MS, LOGIN_INTERVAL_MS, TRANSPORT_RETRY_BASE_MS, TRANSPORT_RETRY_MAX_MS,
  hasHealthyControlWindow, loginAdmissionDeadline, loginAttemptControlled, loginAttemptStarted,
  normalizeLoginAdmission, nullableNumber, reconcileLoginAdmission, serverEntryObservedToday, serverJoinObservation, transportRetryDelayMs
};
