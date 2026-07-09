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
const DEFAULT_LEAVE_RETRY_MS = 1200;
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
  if (typeof options.onRequest === 'function') {
    options.onRequest({ stage: options.stage || 'initial', url: redactSecrets(url) });
  }
  const response = await fetchWithTimeout(url, {
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
  const sleepImpl = typeof options.sleep === 'function' ? options.sleep : sleep;
  const leaveOnceImpl = typeof options.leaveOnceImpl === 'function' ? options.leaveOnceImpl : leaveOnce;
  for (let index = 0; index <= retryMax; index += 1) {
    const result = await leaveOnceImpl({
      ...options,
      stage: index === 0 ? 'initial' : `retry-${index}`
    });
    attempts.push(result);
    if (result.ok) return { ok: true, attempts };
    if (index < retryMax) await sleepImpl(retryDelayMsForAttempt(result, retryDelayMs));
  }
  return {
    ok: false,
    attempts,
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
