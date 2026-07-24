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
  let closePromise = null;

  function rejectPending(error) {
    for (const pending of barriers.values()) pending.reject(error);
    for (const pending of requests.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    barriers.clear();
    requests.clear();
  }

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
        if (pending.timer) clearTimeout(pending.timer);
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
    rejectPending(error);
  });
  worker.on('exit', code => {
    if (closed) return;
    const error = new Error(`background IO worker exited with code ${code}`);
    if (code !== 0) reportError(error, { operation: 'worker-exit' }, true);
    rejectPending(error);
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

  function writeJsonPatchAtomic(file, patch, deletePaths = []) {
    return post({
      kind: 'json-patch-atomic',
      file: path.resolve(String(file || '')),
      patch: patch && typeof patch === 'object' ? patch : {},
      deletePaths: Array.isArray(deletePaths) ? deletePaths : []
    });
  }

  function finalizeGz(file) {
    return post({ kind: 'finalize-gz', file: path.resolve(String(file || '')) });
  }

  function appendRawLine(file, value) {
    return post({ kind: 'append-raw-line', file: path.resolve(String(file || '')), value });
  }

  function renderStatus(state, config = {}, compact = false, optionsForRequest = {}) {
    if (closed || failed) return Promise.reject(new Error(lastError || 'background IO worker unavailable'));
    const id = nextRequestId++;
    const started = performance.now();
    const timeoutMs = Math.max(0, Number(optionsForRequest.timeoutMs || 0));
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject, started, postMs: 0, timer: null };
      requests.set(id, pending);
      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          if (!requests.delete(id)) return;
          reject(new Error(`background status render timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.timer.unref?.();
      }
      const postStarted = performance.now();
      if (!post({ kind: 'status-render', id, state, config, compact: Boolean(compact) })) {
        requests.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
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

  function close(optionsForClose = {}) {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (closed) return { ok: !failed, submitted, processed, pending: 0, operationErrorCount, lastError };
      const timeoutMs = Math.max(0, Number(optionsForClose.timeoutMs || 0));
      let timedOut = false;
      let result;
      if (timeoutMs > 0) {
        let timeoutHandle = null;
        result = await Promise.race([
          flush(),
          new Promise(resolve => {
            timeoutHandle = setTimeout(() => {
              timedOut = true;
              resolve({
                ok: false,
                submitted,
                processed,
                pending: Math.max(0, submitted - processed),
                operationErrorCount,
                lastError: `background IO flush timed out after ${timeoutMs}ms`
              });
            }, timeoutMs);
            timeoutHandle.unref?.();
          })
        ]);
        if (timeoutHandle) clearTimeout(timeoutHandle);
      } else {
        result = await flush();
      }
      closed = true;
      if (timedOut || requests.size || barriers.size) {
        rejectPending(new Error(result.lastError || 'background IO worker closed'));
      }
      await worker.terminate();
      return {
        ...result,
        timedOut,
        dropped: timedOut ? Math.max(0, submitted - processed) : 0
      };
    })();
    return closePromise;
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
    appendRawLine,
    close,
    finalizeGz,
    flush,
    renderStatus,
    status,
    writeJsonAtomic,
    writeJsonPatchAtomic
  };
}

module.exports = {
  createBrowserlessBackgroundIo
};
