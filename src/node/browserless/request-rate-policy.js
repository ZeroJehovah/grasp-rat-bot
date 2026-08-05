'use strict';

const DEFAULT_REQUEST_MIN_INTERVAL_MS = 30000;

const REQUEST_CLASSES = Object.freeze({
  ORDINARY: 'ordinary',
  GAMEPLAY_SNAPSHOT: 'gameplay-snapshot',
  LOGIN: 'login',
  EXIT: 'exit',
  SOURCE_IP_PROBE: 'source-ip-probe',
  SOURCE_IP_PREFLIGHT: 'source-ip-preflight'
});

const EXEMPT_REQUEST_CLASSES = new Set([
  REQUEST_CLASSES.LOGIN,
  REQUEST_CLASSES.EXIT,
  REQUEST_CLASSES.SOURCE_IP_PROBE,
  REQUEST_CLASSES.SOURCE_IP_PREFLIGHT
]);

function normalizeRequestClass(value) {
  const normalized = String(value || REQUEST_CLASSES.ORDINARY).trim().toLowerCase();
  return Object.values(REQUEST_CLASSES).includes(normalized)
    ? normalized
    : REQUEST_CLASSES.ORDINARY;
}

function finiteNow(now) {
  const value = Number(now());
  return Number.isFinite(value) ? value : Date.now();
}

function createRequestRatePolicy(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const requestedIntervalMs = Number(options.minimumIntervalMs ?? DEFAULT_REQUEST_MIN_INTERVAL_MS);
  const minimumIntervalMs = Number.isFinite(requestedIntervalMs)
    ? Math.max(DEFAULT_REQUEST_MIN_INTERVAL_MS, requestedIntervalMs)
    : DEFAULT_REQUEST_MIN_INTERVAL_MS;
  let lastOrdinaryStartAtMs = null;
  let sequence = 0;
  let ordinaryQueue = Promise.resolve();

  async function acquire(requestClass = REQUEST_CLASSES.ORDINARY) {
    const normalizedClass = normalizeRequestClass(requestClass);
    const exempt = EXEMPT_REQUEST_CLASSES.has(normalizedClass);
    if (exempt) {
      const startedAtMs = finiteNow(now);
      sequence += 1;
      return {
        requestClass: normalizedClass,
        exempt: true,
        sequence,
        waitMs: 0,
        startedAtMs,
        release() {}
      };
    }

    let releaseQueue;
    const queued = new Promise(resolve => {
      releaseQueue = resolve;
    });
    const previous = ordinaryQueue;
    ordinaryQueue = ordinaryQueue.then(() => queued);
    await previous;

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseQueue();
    };
    try {
      const beforeWaitMs = finiteNow(now);
      const waitMs = lastOrdinaryStartAtMs === null
        ? 0
        : Math.max(0, lastOrdinaryStartAtMs + minimumIntervalMs - beforeWaitMs);
      if (waitMs > 0) await sleep(waitMs);
      const startedAtMs = finiteNow(now);
      lastOrdinaryStartAtMs = startedAtMs;
      sequence += 1;
      return {
        requestClass: normalizedClass,
        exempt: false,
        sequence,
        waitMs,
        startedAtMs,
        release
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  async function run(requestClass, operation) {
    if (typeof operation !== 'function') throw new TypeError('request-rate operation must be a function');
    const permit = await acquire(requestClass);
    try {
      return await operation(permit);
    } finally {
      permit.release();
    }
  }

  function status() {
    return {
      minimumIntervalMs,
      lastOrdinaryStartAtMs,
      sequence
    };
  }

  return {
    acquire,
    run,
    status
  };
}

async function runRequestRatePolicySelfTest() {
  let nowMs = 0;
  const waits = [];
  const starts = [];
  const policy = createRequestRatePolicy({
    now: () => nowMs,
    sleep: async delayMs => {
      waits.push(delayMs);
      nowMs += delayMs;
    }
  });
  const record = label => policy.run(label, async permit => {
    starts.push({ label, atMs: permit.startedAtMs, exempt: permit.exempt });
    return permit.startedAtMs;
  });

  await Promise.all([
    record(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT),
    record(REQUEST_CLASSES.ORDINARY)
  ]);
  await record(REQUEST_CLASSES.LOGIN);
  await record(REQUEST_CLASSES.EXIT);
  await record(REQUEST_CLASSES.SOURCE_IP_PROBE);
  await record(REQUEST_CLASSES.SOURCE_IP_PREFLIGHT);
  await record('unknown-class');

  const ordinaryStarts = starts.filter(item => !item.exempt);
  const ordinaryGaps = ordinaryStarts.slice(1).map((item, index) => item.atMs - ordinaryStarts[index].atMs);
  const ordinaryOk = ordinaryGaps.every(gap => gap >= DEFAULT_REQUEST_MIN_INTERVAL_MS);
  const exemptLabels = starts.filter(item => item.exempt).map(item => item.label);
  const exemptOk = JSON.stringify(exemptLabels) === JSON.stringify([
    REQUEST_CLASSES.LOGIN,
    REQUEST_CLASSES.EXIT,
    REQUEST_CLASSES.SOURCE_IP_PROBE,
    REQUEST_CLASSES.SOURCE_IP_PREFLIGHT
  ]);
  return {
    ok: ordinaryOk && exemptOk && waits.every(waitMs => waitMs >= DEFAULT_REQUEST_MIN_INTERVAL_MS),
    ordinaryStarts,
    ordinaryGaps,
    exemptLabels,
    waits
  };
}

module.exports = {
  DEFAULT_REQUEST_MIN_INTERVAL_MS,
  EXEMPT_REQUEST_CLASSES,
  REQUEST_CLASSES,
  createRequestRatePolicy,
  normalizeRequestClass,
  runRequestRatePolicySelfTest
};
