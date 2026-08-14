'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REQUEST_MIN_INTERVAL_MS = 30000;
const PERSIST_STATE_SCHEMA_VERSION = 1;

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

function readPersistedOrdinaryStart(persistFile, nowMs) {
  if (!persistFile) return { status: 'disabled', reason: '', value: null };
  let raw = '';
  try {
    raw = fs.readFileSync(persistFile, 'utf8');
  } catch (error) {
    return {
      status: error?.code === 'ENOENT' ? 'missing' : 'error',
      reason: error?.code === 'ENOENT' ? 'file-missing' : 'read-failed',
      value: null
    };
  }
  let state = null;
  try {
    state = JSON.parse(raw);
  } catch (_) {
    return { status: 'invalid', reason: 'invalid-json', value: null };
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { status: 'invalid', reason: 'invalid-state', value: null };
  }
  if (Number(state.schemaVersion || 0) !== PERSIST_STATE_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'unsupported-schema', value: null };
  }
  const value = state.lastOrdinaryStartAtMs;
  if (!Number.isFinite(value) || value < 0 || value > nowMs) {
    return { status: 'invalid', reason: 'invalid-start-time', value: null };
  }
  return { status: 'loaded', reason: '', value };
}

function writePersistedOrdinaryStart(persistFile, lastOrdinaryStartAtMs, nowMs) {
  if (!persistFile || !Number.isFinite(lastOrdinaryStartAtMs)) {
    return { ok: false, reason: 'invalid-write-input' };
  }
  const payload = JSON.stringify({
    schemaVersion: PERSIST_STATE_SCHEMA_VERSION,
    lastOrdinaryStartAtMs,
    updatedAt: new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString()
  });
  const temporary = `${persistFile}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(persistFile), { recursive: true });
    fs.writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, persistFile);
    return { ok: true, reason: '' };
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch (_) {}
    return { ok: false, reason: error?.code ? `write-${String(error.code).toLowerCase()}` : 'write-failed' };
  }
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
  const persistFile = options.persistFile ? path.resolve(String(options.persistFile)) : '';
  const persistNow = typeof options.persistNow === 'function' ? options.persistNow : now;
  const onPersistenceEvent = typeof options.onPersistenceEvent === 'function'
    ? options.onPersistenceEvent
    : null;
  const persistedState = readPersistedOrdinaryStart(persistFile, finiteNow(persistNow));
  let lastOrdinaryStartAtMs = persistedState.value;
  let lastPersistedStartAtMs = persistedState.status === 'loaded' ? persistedState.value : null;
  let persistenceWriteErrorCount = 0;
  let lastPersistenceWriteError = '';
  let sequence = 0;
  let ordinaryQueue = Promise.resolve();

  function emitPersistenceEvent(event) {
    if (!onPersistenceEvent) return;
    try {
      onPersistenceEvent(event);
    } catch (_) {}
  }

  if (persistFile) {
    emitPersistenceEvent({
      operation: 'load',
      status: persistedState.status,
      reason: persistedState.reason,
      lastOrdinaryStartAtMs: persistedState.value
    });
  }

  function persistOrdinaryStart(startedAtMs) {
    if (!persistFile) return;
    const result = writePersistedOrdinaryStart(persistFile, startedAtMs, finiteNow(persistNow));
    if (result.ok) {
      lastPersistedStartAtMs = startedAtMs;
      lastPersistenceWriteError = '';
      return;
    }
    persistenceWriteErrorCount += 1;
    lastPersistenceWriteError = result.reason;
    emitPersistenceEvent({
      operation: 'write',
      status: 'error',
      reason: result.reason,
      lastOrdinaryStartAtMs: startedAtMs,
      writeErrorCount: persistenceWriteErrorCount
    });
  }

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
      const scheduledStartAtMs = lastOrdinaryStartAtMs === null
        ? beforeWaitMs
        : lastOrdinaryStartAtMs + minimumIntervalMs;
      let waitMs = 0;
      // Timers can resolve slightly early. Recheck the monotonic boundary after
      // every sleep so an early wake cannot authorize a sub-interval request.
      while (true) {
        const remainingMs = scheduledStartAtMs - finiteNow(now);
        if (!(remainingMs > 0)) break;
        waitMs += remainingMs;
        await sleep(remainingMs);
      }
      const permittedStartAtMs = finiteNow(now);
      lastOrdinaryStartAtMs = permittedStartAtMs;
      persistOrdinaryStart(permittedStartAtMs);
      sequence += 1;
      return {
        requestClass: normalizedClass,
        exempt: false,
        sequence,
        waitMs,
        startedAtMs: permittedStartAtMs,
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
      sequence,
      persistence: {
        enabled: Boolean(persistFile),
        loadStatus: persistedState.status,
        loadReason: persistedState.reason,
        hydratedLastOrdinaryStartAtMs: persistedState.value,
        lastPersistedStartAtMs,
        writeErrorCount: persistenceWriteErrorCount,
        lastWriteError: lastPersistenceWriteError
      }
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
  let earlyWakeNowMs = 0;
  const earlyWakePolicy = createRequestRatePolicy({
    now: () => earlyWakeNowMs,
    sleep: async delayMs => {
      earlyWakeNowMs += Math.max(1, delayMs - 1);
    }
  });
  const earlyWakeStarts = [];
  await earlyWakePolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    earlyWakeStarts.push(permit.startedAtMs);
  });
  await earlyWakePolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    earlyWakeStarts.push(permit.startedAtMs);
  });
  const earlyWakeGaps = earlyWakeStarts.slice(1)
    .map((atMs, index) => atMs - earlyWakeStarts[index]);
  const earlyWakeOk = earlyWakeGaps.length === 1
    && earlyWakeGaps[0] >= DEFAULT_REQUEST_MIN_INTERVAL_MS;

  const persistTmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rrp-persist-'));
  const persistFile = path.join(persistTmpDir, 'request-rate-state.json');
  const persistenceEvents = [];
  let persistNowMs = 0;
  const persistPolicy = createRequestRatePolicy({
    now: () => persistNowMs,
    sleep: async delayMs => { persistNowMs += delayMs; },
    persistFile,
    onPersistenceEvent: event => persistenceEvents.push(event)
  });
  await persistPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    if (permit.startedAtMs !== 0) throw new Error('first persisted start must be immediate');
  });
  const firstPersistedState = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
  const firstPersistedOk = Number(firstPersistedState.lastOrdinaryStartAtMs) === 0;
  persistNowMs = 30000;
  await persistPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    if (permit.startedAtMs !== 30000) throw new Error('second persisted start must honor the 30000ms boundary');
  });
  const persistedState = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
  const persistedOk = Number(persistedState.lastOrdinaryStartAtMs) === 30000;

  let restartNowMs = 30001;
  const restartPolicy = createRequestRatePolicy({
    now: () => restartNowMs,
    sleep: async delayMs => { restartNowMs += delayMs; },
    persistFile
  });
  const restartStarts = [];
  await restartPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    restartStarts.push(permit.startedAtMs);
  });
  await restartPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    restartStarts.push(permit.startedAtMs);
  });
  const crossProcessGap = restartStarts[0] - Number(persistedState.lastOrdinaryStartAtMs);
  const restartGap = restartStarts[1] - restartStarts[0];
  const restartBoundaryOk = crossProcessGap >= DEFAULT_REQUEST_MIN_INTERVAL_MS
    && restartGap >= DEFAULT_REQUEST_MIN_INTERVAL_MS;

  let longGapNowMs = restartStarts[1] + DEFAULT_REQUEST_MIN_INTERVAL_MS + 1;
  const longGapPolicy = createRequestRatePolicy({
    now: () => longGapNowMs,
    sleep: async delayMs => { longGapNowMs += delayMs; },
    persistFile
  });
  const longGapStart = [];
  await longGapPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    longGapStart.push(permit.startedAtMs);
  });
  const longGapOk = longGapStart[0] === restartStarts[1] + DEFAULT_REQUEST_MIN_INTERVAL_MS + 1;

  let corruptedThenMs = 0;
  const corruptedFile = path.join(persistTmpDir, 'corrupted-state.json');
  const corruptedEvents = [];
  fs.writeFileSync(corruptedFile, '{not-json');
  const corruptedPolicy = createRequestRatePolicy({
    now: () => corruptedThenMs,
    sleep: async delayMs => { corruptedThenMs += delayMs; },
    persistFile: corruptedFile,
    onPersistenceEvent: event => corruptedEvents.push(event)
  });
  const corruptedStart = [];
  await corruptedPolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async permit => {
    corruptedStart.push(permit.startedAtMs);
  });
  const corruptedOk = corruptedStart[0] === 0
    && corruptedEvents.some(event => event.operation === 'load'
      && event.status === 'invalid'
      && event.reason === 'invalid-json');

  const exemptFile = path.join(persistTmpDir, 'exempt-state.json');
  const exemptPersistPolicy = createRequestRatePolicy({ persistFile: exemptFile });
  for (const requestClass of EXEMPT_REQUEST_CLASSES) {
    await exemptPersistPolicy.run(requestClass, async () => {});
  }
  const exemptPersistenceOk = !fs.existsSync(exemptFile);

  const blockedParent = path.join(persistTmpDir, 'blocked-parent');
  fs.writeFileSync(blockedParent, 'not-a-directory');
  const writeFailureEvents = [];
  const writeFailurePolicy = createRequestRatePolicy({
    now: () => 0,
    persistNow: () => 0,
    persistFile: path.join(blockedParent, 'request-rate-state.json'),
    onPersistenceEvent: event => writeFailureEvents.push(event)
  });
  await writeFailurePolicy.run(REQUEST_CLASSES.GAMEPLAY_SNAPSHOT, async () => {});
  const writeFailureStatus = writeFailurePolicy.status().persistence;
  const writeFailureDiagnosticOk = writeFailureStatus.writeErrorCount === 1
    && writeFailureEvents.some(event => event.operation === 'write'
      && event.status === 'error'
      && /^write-/.test(event.reason));

  try {
    fs.rmSync(persistTmpDir, { recursive: true, force: true });
  } catch (_) {}

  return {
    ok: ordinaryOk
      && exemptOk
      && waits.every(waitMs => waitMs >= DEFAULT_REQUEST_MIN_INTERVAL_MS)
      && earlyWakeOk
      && firstPersistedOk
      && persistedOk
      && restartBoundaryOk
      && longGapOk
      && corruptedOk
      && exemptPersistenceOk
      && writeFailureDiagnosticOk,
    ordinaryStarts,
    ordinaryGaps,
    exemptLabels,
    waits,
    earlyWakeStarts,
    earlyWakeGaps,
    earlyWakeOk,
    persistenceLoadStatus: persistenceEvents[0]?.status || '',
    firstPersistedOk,
    persistedLastStartAtMs: Number(persistedState.lastOrdinaryStartAtMs),
    restartStarts,
    crossProcessGap,
    restartGap,
    restartBoundaryOk,
    longGapStart,
    longGapOk,
    corruptedOk,
    exemptPersistenceOk,
    writeFailureDiagnosticOk
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
