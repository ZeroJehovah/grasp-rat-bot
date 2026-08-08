'use strict';

const DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS = 30000;

function finiteNow(now) {
  const value = Number(now());
  return Number.isFinite(value) ? value : Date.now();
}

function finitePositive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function snapshotTick(result) {
  const tick = Number(result?.payload?.tick ?? result?.tick);
  return Number.isFinite(tick) ? tick : null;
}

function createSnapshotRequestScheduler(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const fetchSnapshot = options.fetchSnapshot;
  if (typeof fetchSnapshot !== 'function') throw new TypeError('snapshot scheduler fetchSnapshot is required');
  const requestedIntervalMs = Number(options.minimumIntervalMs ?? DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS);
  const minimumIntervalMs = Number.isFinite(requestedIntervalMs)
    ? Math.max(DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS, requestedIntervalMs)
    : DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS;
  const onRequest = typeof options.onRequest === 'function' ? options.onRequest : null;
  const onResult = typeof options.onResult === 'function' ? options.onResult : null;
  let inFlight = null;
  let sequence = 0;
  let lastStartedAtMs = null;
  let lastCompletedAtMs = null;
  let lastRequestClass = '';
  let lastPurpose = '';
  let lastError = '';
  let lastResult = null;

  function latestCanSatisfy(detail = {}) {
    if (detail.reuseLatest !== true || !lastResult || lastResult.ok === false) return false;
    const afterAtMs = finitePositive(detail.afterAtMs, 0);
    if (afterAtMs > 0 && Number(lastResult.observedAtMs || 0) <= afterAtMs) return false;
    const hasMinimumTick = detail.minTick !== null
      && detail.minTick !== undefined
      && Number.isFinite(Number(detail.minTick));
    const minimumTick = hasMinimumTick ? Number(detail.minTick) : null;
    const latestTick = snapshotTick(lastResult);
    if (hasMinimumTick && (!Number.isFinite(latestTick) || latestTick <= minimumTick)) return false;
    return true;
  }

  async function execute(detail = {}) {
    const allowBurst = detail.allowBurst === true;
    const beforeWaitAtMs = finiteNow(now);
    const waitMs = allowBurst || lastStartedAtMs === null
      ? 0
      : Math.max(0, lastStartedAtMs + minimumIntervalMs - beforeWaitAtMs);
    if (waitMs > 0) await sleep(waitMs);

    const startedAtMs = finiteNow(now);
    const requestSequence = ++sequence;
    lastStartedAtMs = startedAtMs;
    lastRequestClass = String(detail.requestClass || '');
    lastPurpose = String(detail.purpose || '');
    lastError = '';
    const request = {
      ...detail,
      requestSequence,
      startedAtMs,
      waitMs,
      minimumIntervalMs
    };
    try {
      onRequest?.(request);
      const fetched = await fetchSnapshot(request);
      if (!fetched || typeof fetched !== 'object') {
        throw new Error('snapshot scheduler fetch returned no result');
      }
      const result = {
        ...fetched,
        requestSequence,
        startedAtMs,
        waitMs,
        requestClass: String(detail.requestClass || fetched.requestClass || ''),
        purpose: String(detail.purpose || fetched.purpose || '')
      };
      lastResult = result;
      lastCompletedAtMs = finiteNow(now);
      onResult?.(result);
      return result;
    } catch (error) {
      lastCompletedAtMs = finiteNow(now);
      lastError = error?.message || String(error);
      onResult?.({
        ok: false,
        requestSequence,
        startedAtMs,
        waitMs,
        requestClass: String(detail.requestClass || ''),
        purpose: String(detail.purpose || ''),
        error: lastError
      });
      throw error;
    }
  }

  function request(detail = {}) {
    if (inFlight) return inFlight;
    if (latestCanSatisfy(detail)) {
      return Promise.resolve({
        ...lastResult,
        reused: true,
        reuseReason: 'latest-snapshot-satisfies-request'
      });
    }
    const promise = execute(detail);
    inFlight = promise;
    promise.finally(() => {
      if (inFlight === promise) inFlight = null;
    }).catch(() => {});
    return promise;
  }

  function status() {
    return {
      enabled: true,
      minimumIntervalMs,
      inFlight: Boolean(inFlight),
      sequence,
      lastStartedAtMs,
      lastCompletedAtMs,
      lastRequestClass,
      lastPurpose,
      lastError,
      lastResult: lastResult
        ? {
            ok: lastResult.ok !== false,
            observedAtMs: Number(lastResult.observedAtMs || 0) || null,
            tick: snapshotTick(lastResult),
            requestSequence: Number(lastResult.requestSequence || 0) || null,
            requestClass: String(lastResult.requestClass || ''),
            purpose: String(lastResult.purpose || '')
          }
        : null
    };
  }

  return {
    request,
    status
  };
}

async function runSnapshotRequestSchedulerSelfTest() {
  let nowMs = 1000;
  const sleeps = [];
  let fetchCount = 0;
  let releaseFirst;
  const scheduler = createSnapshotRequestScheduler({
    now: () => nowMs,
    sleep: async delayMs => {
      sleeps.push(delayMs);
      nowMs += delayMs;
    },
    fetchSnapshot: async detail => {
      fetchCount += 1;
      if (fetchCount === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return {
        ok: true,
        payload: { tick: fetchCount },
        observedAtMs: nowMs,
        requestClass: detail.requestClass,
        purpose: detail.purpose
      };
    }
  });
  const first = scheduler.request({ requestClass: 'gameplay-snapshot', purpose: 'offline-poll' });
  const joined = scheduler.request({ requestClass: 'login', purpose: 'login-safety', allowBurst: true });
  const joinedSamePromise = first === joined;
  releaseFirst?.();
  const firstResult = await first;
  const joinedResult = await joined;
  nowMs = 2000;
  const second = await scheduler.request({ requestClass: 'gameplay-snapshot', purpose: 'offline-poll' });
  const reused = await scheduler.request({
    requestClass: 'login',
    purpose: 'snapshot-edge',
    reuseLatest: true,
    afterAtMs: firstResult.observedAtMs,
    minTick: firstResult.payload.tick
  });
  const thirdPromise = scheduler.request({
    requestClass: 'login',
    purpose: 'daily-first-login',
    allowBurst: true
  });
  const third = await thirdPromise;
  const status = scheduler.status();
  const secondStartGapMs = Number(second.startedAtMs) - Number(firstResult.startedAtMs);
  let failureNowMs = 5000;
  let failureFetchCount = 0;
  const failureSleeps = [];
  const failureScheduler = createSnapshotRequestScheduler({
    now: () => failureNowMs,
    sleep: async delayMs => {
      failureSleeps.push(delayMs);
      failureNowMs += delayMs;
    },
    fetchSnapshot: async detail => {
      failureFetchCount += 1;
      return failureFetchCount === 1
        ? {
            ok: false,
            status: 503,
            payload: null,
            observedAtMs: failureNowMs,
            requestClass: detail.requestClass,
            purpose: detail.purpose
          }
        : {
            ok: true,
            status: 200,
            payload: { tick: 2 },
            observedAtMs: failureNowMs,
            requestClass: detail.requestClass,
            purpose: detail.purpose
          };
    }
  });
  const failed = await failureScheduler.request({
    requestClass: 'gameplay-snapshot',
    purpose: 'failure-retry',
    allowBurst: true
  });
  failureNowMs += 1000;
  const recovered = await failureScheduler.request({
    requestClass: 'gameplay-snapshot',
    purpose: 'failure-retry'
  });
  const failureRecovery = {
    ok: failed.ok === false
      && recovered.ok === true
      && failureFetchCount === 2
      && Number(recovered.startedAtMs) - Number(failed.startedAtMs) >= DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS,
    failedStatus: failed.status,
    recoveredStatus: recovered.status,
    fetchCount: failureFetchCount,
    sleeps: failureSleeps,
    startGapMs: Number(recovered.startedAtMs) - Number(failed.startedAtMs)
  };
  return {
    ok: joinedSamePromise
      && firstResult.payload.tick === 1
      && joinedResult.payload.tick === 1
      && second.payload.tick === 2
      && reused.reused === true
      && third.payload.tick === 3
      && fetchCount === 3
      && secondStartGapMs >= DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS
      && failureRecovery.ok
      && status.inFlight === false,
    joinedSamePromise,
    fetchCount,
    sleeps,
    first: firstResult,
    joined: joinedResult,
    second,
    secondStartGapMs,
    reused,
    third,
    failureRecovery,
    status
  };
}

module.exports = {
  DEFAULT_SNAPSHOT_REQUEST_INTERVAL_MS,
  createSnapshotRequestScheduler,
  runSnapshotRequestSchedulerSelfTest
};
