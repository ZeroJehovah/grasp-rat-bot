'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');

function errorMessage(error) {
  return error?.message || String(error || 'background IO failure');
}

function createBrowserlessBackgroundIo(options = {}) {
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const worker = new Worker(path.join(__dirname, 'background-io-worker.js'));
  worker.unref();
  const barriers = new Map();
  const requests = new Map();
  let nextBarrierId = 1;
  let nextRequestId = 1;
  let submitted = 0;
  let processed = 0;
  let closed = false;
  let failed = false;
  let lastError = '';
  let operationErrorCount = 0;

  function reportError(error, detail = {}, fatal = false) {
    if (fatal) failed = true;
    else operationErrorCount += 1;
    lastError = errorMessage(error);
    try {
      onError(error instanceof Error ? error : new Error(lastError), detail);
    } catch (_) {}
  }

  function post(message) {
    if (closed || failed) return false;
    try {
      worker.postMessage(message);
      if (message.kind !== 'barrier') submitted += 1;
      return true;
    } catch (error) {
      reportError(error, { operation: message.kind || '', file: message.file || '' });
      return false;
    }
  }

  worker.on('message', message => {
    if (message?.kind === 'barrier') {
      processed = Math.max(processed, Number(message.processed || 0));
      const pending = barriers.get(message.id);
      if (pending) {
        barriers.delete(message.id);
        pending.resolve({ ok: !failed, submitted, processed, pending: Math.max(0, submitted - processed), operationErrorCount, lastError });
      }
      return;
    }
    if (message?.kind === 'status-render') {
      processed = Math.max(processed, Number(message.processed || 0));
      const pending = requests.get(message.id);
      if (pending) {
        requests.delete(message.id);
        pending.resolve({
          text: String(message.text || ''),
          bytes: Number(message.bytes || 0),
          computeMs: Number(message.computeMs || 0),
          postMs: pending.postMs,
          roundTripMs: performance.now() - pending.started
        });
      }
      return;
    }
    if (message?.kind === 'error') {
      const error = new Error(message.error || 'background IO worker error');
      const pending = requests.get(message.id);
      if (pending) {
        requests.delete(message.id);
        pending.reject(error);
      }
      reportError(error, {
        operation: message.operation || '',
        file: message.file || ''
      });
    }
  });
  worker.on('error', error => {
    reportError(error, { operation: 'worker' }, true);
    for (const pending of barriers.values()) pending.reject(error);
    for (const pending of requests.values()) pending.reject(error);
    barriers.clear();
    requests.clear();
  });
  worker.on('exit', code => {
    if (!closed && code !== 0) reportError(new Error(`background IO worker exited with code ${code}`), { operation: 'worker-exit' }, true);
  });

  function appendLog(message = {}) {
    return post({
      kind: 'log',
      file: path.resolve(String(message.file || '')),
      atMs: Number(message.atMs || Date.now()),
      type: String(message.type || 'event'),
      detail: message.detail || {}
    });
  }

  function writeJsonAtomic(file, value) {
    return post({ kind: 'json-atomic', file: path.resolve(String(file || '')), value });
  }

  function renderStatus(state, config = {}, compact = false) {
    if (closed || failed) return Promise.reject(new Error(lastError || 'background IO worker unavailable'));
    const id = nextRequestId++;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, started, postMs: 0 };
      requests.set(id, pending);
      const postStarted = performance.now();
      if (!post({ kind: 'status-render', id, state, config, compact: Boolean(compact) })) {
        requests.delete(id);
        reject(new Error(lastError || 'background status render queue unavailable'));
        return;
      }
      pending.postMs = performance.now() - postStarted;
    });
  }

  function flush() {
    if (failed) return Promise.resolve({ ok: false, submitted, processed, pending: Math.max(0, submitted - processed), operationErrorCount, lastError });
    if (closed) return Promise.resolve({ ok: true, submitted, processed, pending: 0, operationErrorCount, lastError });
    const id = nextBarrierId++;
    return new Promise((resolve, reject) => {
      barriers.set(id, { resolve, reject });
      if (!post({ kind: 'barrier', id })) {
        barriers.delete(id);
        resolve({ ok: false, submitted, processed, pending: Math.max(0, submitted - processed), operationErrorCount, lastError });
      }
    });
  }

  async function close() {
    if (closed) return { ok: !failed, submitted, processed, pending: 0, operationErrorCount, lastError };
    const result = await flush();
    closed = true;
    await worker.terminate();
    return result;
  }

  function status() {
    return {
      ok: !failed,
      closed,
      submitted,
      processed,
      pending: Math.max(0, submitted - processed),
      pendingRequests: requests.size,
      operationErrorCount,
      lastError
    };
  }

  return {
    appendLog,
    close,
    flush,
    renderStatus,
    status,
    writeJsonAtomic
  };
}

module.exports = {
  createBrowserlessBackgroundIo
};
