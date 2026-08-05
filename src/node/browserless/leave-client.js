'use strict';

const {
  leaveResponseConfirmsExitCore,
  summarizeLeaveResponseCore
} = require('../../shared/leave-response');
const {
  fetchWithTimeout,
  readResponseBody,
  redactSecrets
} = require('./session-client');

const DEFAULT_GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const DEFAULT_LEAVE_RETRY_MAX = 3;
const DEFAULT_LEAVE_RETRY_MS = 200;
const DEFAULT_LEAVE_HEDGE_MS = 1000;
const MAX_RESPONSE_RETRY_DELAY_MS = 120000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildLeaveUrl(options = {}) {
  const url = new URL('/leave', options.gameOrigin || DEFAULT_GAME_ORIGIN);
  url.searchParams.set('user_id', String(options.userId || 0));
  url.searchParams.set('token', String(options.sessionToken || ''));
  return url.toString();
}

async function leaveOnce(options = {}) {
  const userId = Number(options.userId || 0);
  const sessionToken = String(options.sessionToken || '');
  if (!userId || !sessionToken) throw new Error('not logged in');
  const url = buildLeaveUrl(options);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const startedAt = now();
  const scheduledAtMs = Number(options.scheduledAtMs || 0) || null;
  const timerFiredAtMs = Number(options.timerFiredAtMs || 0) || null;
  const dispatchDriftMs = scheduledAtMs === null ? null : Math.max(0, startedAt - scheduledAtMs);
  if (typeof options.onRequest === 'function') {
    options.onRequest({
      stage: options.stage || 'initial',
      url: redactSecrets(url),
      startedAtMs: startedAt,
      scheduledAtMs,
      timerFiredAtMs,
      dispatchDriftMs,
      hedged: Boolean(options.hedged)
    });
  }
  const requestWithTimeout = options.fetchWithTimeout || fetchWithTimeout;
  const response = await requestWithTimeout(url, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    localAddress: options.localAddress,
    method: 'GET',
    cache: 'no-store'
  });
  const body = await readResponseBody(response);
  const result = {
    stage: options.stage || 'initial',
    httpOk: response.ok,
    status: response.status,
    statusText: response.statusText || '',
    durationMs: now() - startedAt,
    scheduledAtMs,
    timerFiredAtMs,
    dispatchDriftMs,
    connectionReused: Boolean(response.connectionReused),
    response: body.json || { textSample: body.text.slice(0, 1000) }
  };
  result.ok = leaveResponseConfirmsExitCore(result.response);
  result.summary = summarizeLeaveResponseCore(result.response);
  if (typeof options.onResult === 'function') options.onResult(result);
  return result;
}

async function leaveWithVerification(options = {}) {
  const attempts = [];
  const retryMax = Math.max(0, Number(options.retryMax ?? DEFAULT_LEAVE_RETRY_MAX));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_LEAVE_RETRY_MS));
  const hedgeDelayMs = Math.max(0, Number(options.hedgeDelayMs ?? DEFAULT_LEAVE_HEDGE_MS));
  const sleepImpl = typeof options.sleep === 'function' ? options.sleep : sleep;
  const setTimeoutImpl = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimeoutImpl = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const leaveOnceImpl = typeof options.leaveOnceImpl === 'function' ? options.leaveOnceImpl : leaveOnce;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const verificationState = { confirmed: false };
  const runAttempt = (index, attemptOptions = {}) => {
    const stage = attemptOptions.hedged ? `hedge-${index}` : (index === 0 ? 'initial' : `retry-${index}`);
    const startedAt = now();
    let attemptPromise;
    try {
      attemptPromise = Promise.resolve(leaveOnceImpl({
        ...options,
        ...attemptOptions,
        stage,
        verificationState
      }));
    } catch (err) {
      attemptPromise = Promise.reject(err);
    }
    return attemptPromise
      .catch(err => ({
        stage,
        httpOk: false,
        status: 0,
        statusText: '',
        durationMs: Math.max(0, now() - startedAt),
        response: {},
        ok: false,
        summary: { leaveConfirmed: false },
        error: err?.message || String(err)
      }))
      .then(result => {
        if (result && typeof result === 'object') {
          const scheduledAtMs = Number(attemptOptions.scheduledAtMs || 0) || null;
          const timerFiredAtMs = Number(attemptOptions.timerFiredAtMs || 0) || null;
          if (result.scheduledAtMs === undefined) result.scheduledAtMs = scheduledAtMs;
          if (result.timerFiredAtMs === undefined) result.timerFiredAtMs = timerFiredAtMs;
          if (result.dispatchDriftMs === undefined) {
            result.dispatchDriftMs = scheduledAtMs === null
              ? null
              : Math.max(0, startedAt - scheduledAtMs);
          }
        }
        attempts.push(result);
        if (result?.ok) verificationState.confirmed = true;
        return result;
      });
  };
  const success = () => ({ ok: true, attempts: attempts.slice() });
  let nextIndex = 0;

  if (retryMax >= 1 && hedgeDelayMs > 0) {
    const hedgeScheduledAtMs = now() + hedgeDelayMs;
    const initialPromise = runAttempt(0, { deferForbiddenRecovery: true });
    let hedgeTimerId = null;
    const hedgeTimerPromise = new Promise(resolve => {
      hedgeTimerId = setTimeoutImpl(() => resolve({
        kind: 'timer',
        scheduledAtMs: hedgeScheduledAtMs,
        firedAtMs: now()
      }), hedgeDelayMs);
    });
    const first = await Promise.race([
      initialPromise.then(result => ({ kind: 'result', result })),
      hedgeTimerPromise
    ]);
    if (first.kind === 'result') {
      if (hedgeTimerId !== null) clearTimeoutImpl(hedgeTimerId);
      if (first.result?.ok) return success();
      nextIndex = 1;
      await sleepImpl(retryDelayMsForAttempt(first.result, retryDelayMs));
    } else {
      const hedgePromise = runAttempt(1, {
        hedged: true,
        deferForbiddenRecovery: true,
        scheduledAtMs: first.scheduledAtMs,
        timerFiredAtMs: first.firedAtMs
      });
      const pending = [
        initialPromise.then(result => ({ source: 'initial', result })),
        hedgePromise.then(result => ({ source: 'hedge', result }))
      ];
      const firstSettled = await Promise.race(pending);
      if (firstSettled.result?.ok) {
        pending.forEach(promise => promise.catch(() => {}));
        return success();
      }
      const remaining = firstSettled.source === 'initial' ? pending[1] : pending[0];
      const secondSettled = await remaining;
      if (secondSettled.result?.ok) return success();
      nextIndex = 2;
      if (nextIndex <= retryMax) {
        const delayMs = Math.max(
          retryDelayMsForAttempt(firstSettled.result, retryDelayMs),
          retryDelayMsForAttempt(secondSettled.result, retryDelayMs)
        );
        await sleepImpl(delayMs);
      }
    }
  }

  for (let index = nextIndex; index <= retryMax; index += 1) {
    const result = await runAttempt(index);
    if (result?.ok) return success();
    if (index < retryMax) await sleepImpl(retryDelayMsForAttempt(result, retryDelayMs));
  }
  return {
    ok: false,
    attempts: attempts.slice(),
    alert: buildLeaveFailureAlert(attempts)
  };
}

function retryDelayMsForAttempt(attempt, fallbackMs = DEFAULT_LEAVE_RETRY_MS) {
  const fallback = Math.max(0, Number(fallbackMs) || 0);
  const response = attempt?.response && typeof attempt.response === 'object' ? attempt.response : {};
  const retryAfterSeconds = Number(
    response.retry_after
      ?? response.retryAfter
      ?? response.retryAfterSeconds
  );
  if (!response.retryable || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return fallback;
  }
  return Math.min(MAX_RESPONSE_RETRY_DELAY_MS, Math.max(fallback, retryAfterSeconds * 1000));
}

function buildLeaveFailureAlert(attempts = []) {
  const last = attempts[attempts.length - 1] || null;
  return `LEAVE NOT CONFIRMED${last ? `: HTTP ${last.status}, response ${JSON.stringify(last.summary || last.response || {}).slice(0, 200)}` : ''}`;
}

function summarizeLeaveAttemptForPublic(attempt) {
  if (!attempt || typeof attempt !== 'object') return attempt;
  return {
    stage: attempt.stage || '',
    httpOk: Boolean(attempt.httpOk),
    status: Number(attempt.status || 0),
    statusText: attempt.statusText || '',
    durationMs: Number(attempt.durationMs || 0),
    scheduledAtMs: Number(attempt.scheduledAtMs || 0) || null,
    timerFiredAtMs: Number(attempt.timerFiredAtMs || 0) || null,
    dispatchDriftMs: attempt.dispatchDriftMs === null || attempt.dispatchDriftMs === undefined
      ? null
      : Number(attempt.dispatchDriftMs || 0),
    connectionReused: Boolean(attempt.connectionReused),
    ok: Boolean(attempt.ok),
    summary: attempt.summary || null
  };
}

function summarizeLeaveResultForPublic(leave) {
  if (!leave || typeof leave !== 'object') return leave || null;
  return {
    ok: Boolean(leave.ok),
    attempts: Array.isArray(leave.attempts)
      ? leave.attempts.map(summarizeLeaveAttemptForPublic)
      : []
  };
}

module.exports = {
  buildLeaveFailureAlert,
  buildLeaveUrl,
  leaveOnce,
  leaveWithVerification,
  retryDelayMsForAttempt,
  summarizeLeaveAttemptForPublic,
  summarizeLeaveResultForPublic
};
