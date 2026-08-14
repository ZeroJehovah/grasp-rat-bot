'use strict';

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const MIN_SNAPSHOT_EDGE_INTERVAL_MS = 30000;

function finiteTick(payload) {
  const tick = Number(payload?.tick);
  return Number.isFinite(tick) && tick >= 0 ? tick : null;
}

function utc8DayKey(atMs) {
  const value = Number(atMs);
  if (!Number.isFinite(value)) return '';
  return new Date(value + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function snapshotVersion(payload, observedAtMs) {
  const tick = finiteTick(payload);
  if (tick === null) return null;
  return {
    tick,
    day: utc8DayKey(observedAtMs),
    observedAtMs: Number(observedAtMs)
  };
}

function snapshotVersionAdvanced(baseline, candidate) {
  if (!baseline || !candidate || !baseline.day || !candidate.day) return false;
  if (candidate.day === baseline.day) return candidate.tick > baseline.tick;
  if (candidate.day > baseline.day) return candidate.tick < baseline.tick;
  return false;
}

async function waitForSnapshotEdge(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const fetchSnapshot = options.fetchSnapshot;
  if (typeof fetchSnapshot !== 'function') throw new Error('snapshot edge fetchSnapshot is required');
  const intervalMs = Math.max(
    MIN_SNAPSHOT_EDGE_INTERVAL_MS,
    Number(options.intervalMs || MIN_SNAPSHOT_EDGE_INTERVAL_MS)
  );
  const maxWaitMs = Math.max(intervalMs, Number(options.maxWaitMs || 60000));
  const maxErrors = Math.max(1, Math.round(Number(options.maxErrors || 3)));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const startedAtMs = now();
  let requestCount = 0;
  let consecutiveErrors = 0;
  let baseline = null;
  const nextCheckAtMs = () => {
    const current = now();
    return current - startedAtMs + intervalMs <= maxWaitMs
      ? current + intervalMs
      : null;
  };

  while (now() - startedAtMs <= maxWaitMs) {
    if (requestCount > 0) {
      if (now() - startedAtMs + intervalMs > maxWaitMs) break;
      await sleep(intervalMs);
    }
    let fetched;
    try {
      fetched = await fetchSnapshot({ requestCount, baseline });
    } catch (error) {
      requestCount += 1;
      consecutiveErrors += 1;
      onProgress({
        type: 'error',
        requestCount,
        consecutiveErrors,
        error: error?.message || String(error),
        waitMs: now() - startedAtMs,
        nextCheckAtMs: consecutiveErrors < maxErrors ? nextCheckAtMs() : null
      });
      if (consecutiveErrors >= maxErrors) {
        return {
          ok: false,
          reason: 'snapshot-edge-error-limit',
          requestCount,
          consecutiveErrors,
          waitMs: now() - startedAtMs,
          baseline
        };
      }
      continue;
    }
    requestCount += 1;
    const observedAtMs = Number(fetched?.observedAtMs ?? now());
    const version = snapshotVersion(fetched?.payload, observedAtMs);
    if (fetched?.ok === false || !version) {
      consecutiveErrors += 1;
      onProgress({
        type: 'error',
        requestCount,
        consecutiveErrors,
        status: fetched?.status ?? null,
        reason: !version ? 'invalid-snapshot-version' : 'snapshot-http-error',
        waitMs: now() - startedAtMs,
        nextCheckAtMs: consecutiveErrors < maxErrors ? nextCheckAtMs() : null
      });
      if (consecutiveErrors >= maxErrors) {
        return {
          ok: false,
          reason: 'snapshot-edge-error-limit',
          requestCount,
          consecutiveErrors,
          waitMs: now() - startedAtMs,
          baseline
        };
      }
      continue;
    }
    consecutiveErrors = 0;
    if (!baseline) {
      baseline = { version, fetched };
      onProgress({
        type: 'baseline',
        requestCount,
        version,
        waitMs: now() - startedAtMs,
        nextCheckAtMs: nextCheckAtMs()
      });
      continue;
    }
    const advanced = snapshotVersionAdvanced(baseline.version, version);
    onProgress({
      type: advanced ? 'detected' : 'probe',
      requestCount,
      baseline: baseline.version,
      version,
      waitMs: now() - startedAtMs,
      nextCheckAtMs: advanced ? null : nextCheckAtMs()
    });
    if (advanced) {
      return {
        ok: true,
        reason: 'snapshot-edge-detected',
        requestCount,
        waitMs: now() - startedAtMs,
        baseline,
        detected: { version, fetched }
      };
    }
  }
  return {
    ok: false,
    reason: 'snapshot-edge-timeout',
    requestCount,
    consecutiveErrors,
    waitMs: now() - startedAtMs,
    baseline
  };
}

async function runSnapshotEdgeSelfTest() {
  const sameDay = snapshotVersionAdvanced(
    { day: '2026-07-16', tick: 100 },
    { day: '2026-07-16', tick: 101 }
  );
  const midnight = snapshotVersionAdvanced(
    { day: '2026-07-16', tick: 1719000 },
    { day: '2026-07-17', tick: 50 }
  );
  const stale = snapshotVersionAdvanced(
    { day: '2026-07-16', tick: 100 },
    { day: '2026-07-16', tick: 100 }
  );
  let nowMs = Date.UTC(2026, 6, 16, 12, 0, 0);
  const ticks = [100, 100, 120];
  let index = 0;
  const progress = [];
  const result = await waitForSnapshotEdge({
    now: () => nowMs,
    sleep: async ms => { nowMs += ms; },
    intervalMs: MIN_SNAPSHOT_EDGE_INTERVAL_MS,
    maxWaitMs: 60000,
    fetchSnapshot: async () => ({
      ok: true,
      payload: { tick: ticks[index++] },
      observedAtMs: nowMs
    }),
    onProgress: detail => progress.push(detail)
  });
  let timeoutNowMs = Date.UTC(2026, 6, 16, 12, 0, 0);
  const timeout = await waitForSnapshotEdge({
    now: () => timeoutNowMs,
    sleep: async ms => { timeoutNowMs += ms; },
    intervalMs: MIN_SNAPSHOT_EDGE_INTERVAL_MS,
    maxWaitMs: 60000,
    fetchSnapshot: async () => ({
      ok: true,
      payload: { tick: 200 },
      observedAtMs: timeoutNowMs
    })
  });
  let errorNowMs = Date.UTC(2026, 6, 16, 12, 0, 0);
  const errors = await waitForSnapshotEdge({
    now: () => errorNowMs,
    sleep: async ms => { errorNowMs += ms; },
    intervalMs: MIN_SNAPSHOT_EDGE_INTERVAL_MS,
    maxWaitMs: 60000,
    maxErrors: 3,
    fetchSnapshot: async () => { throw new Error('expected test error'); }
  });
  return {
    ok: sameDay && midnight && !stale
      && result.ok
      && result.requestCount === 3
      && result.detected?.version?.tick === 120
      && progress[0]?.type === 'baseline'
      && progress[0]?.nextCheckAtMs === Date.UTC(2026, 6, 16, 12, 0, 30)
      && progress[1]?.type === 'probe'
      && progress[1]?.nextCheckAtMs === Date.UTC(2026, 6, 16, 12, 1, 0)
      && progress[2]?.type === 'detected'
      && progress[2]?.nextCheckAtMs === null
      && timeout.reason === 'snapshot-edge-timeout'
      && timeout.requestCount === 3
      && timeout.waitMs === 60000
      && errors.reason === 'snapshot-edge-error-limit'
      && errors.requestCount === 3,
    sameDay,
    midnight,
    stale,
    progress,
    result,
    timeout,
    errors
  };
}

module.exports = {
  MIN_SNAPSHOT_EDGE_INTERVAL_MS,
  runSnapshotEdgeSelfTest,
  snapshotVersion,
  snapshotVersionAdvanced,
  utc8DayKey,
  waitForSnapshotEdge
};
