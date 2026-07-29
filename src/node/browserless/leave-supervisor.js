'use strict';

const path = require('path');
const { Worker } = require('worker_threads');

const OMIT_OPTION_KEYS = new Set([
  'fetchImpl',
  'sleep',
  'now',
  'setTimeout',
  'clearTimeout',
  'leaveOnceImpl',
  'onRequest',
  'onResult'
]);

function errorMessage(error) {
  return error?.message || String(error || 'leave supervisor failure');
}

function serializableLeaveOptions(options = {}) {
  const output = {};
  for (const [key, value] of Object.entries(options || {})) {
    if (OMIT_OPTION_KEYS.has(key) || typeof value === 'function' || typeof value === 'symbol') continue;
    if (value === undefined) continue;
    output[key] = value;
  }
  return output;
}

function createBrowserlessLeaveSupervisor(options = {}) {
  const WorkerImpl = options.WorkerImpl || Worker;
  const workerPath = options.workerPath || path.join(__dirname, 'leave-supervisor-worker.js');
  const worker = new WorkerImpl(workerPath);
  worker.unref?.();
  const pending = new Map();
  let nextId = 1;
  let ready = false;
  let closed = false;
  let failed = false;
  let lastError = '';
  let completedLeaves = 0;
  let completedPrewarms = 0;
  let readyResolve;
  let readyReject;
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function fail(error) {
    if (failed) return;
    failed = true;
    lastError = errorMessage(error);
    const normalized = error instanceof Error ? error : new Error(lastError);
    readyReject?.(normalized);
    for (const request of pending.values()) request.reject(normalized);
    pending.clear();
    try {
      options.onError?.(normalized);
    } catch (_) {}
  }

  worker.on('message', message => {
    if (message?.kind === 'ready') {
      ready = true;
      readyResolve?.(true);
      return;
    }
    const request = pending.get(message?.id);
    if (message?.kind === 'leave-request') {
      try { request?.hooks?.onRequest?.(message.request); } catch (_) {}
      return;
    }
    if (message?.kind === 'leave-attempt') {
      try { request?.hooks?.onResult?.(message.attempt); } catch (_) {}
      return;
    }
    if (message?.kind === 'leave-result' || message?.kind === 'prewarm-result') {
      if (!request) return;
      pending.delete(message.id);
      if (message.kind === 'leave-result') completedLeaves += 1;
      else completedPrewarms += 1;
      request.resolve(message.result);
      return;
    }
    if (message?.kind === 'request-error') {
      if (!request) return;
      pending.delete(message.id);
      request.reject(new Error(message.error || `${message.operation || 'worker'} failed`));
    }
  });
  worker.on('error', fail);
  worker.on('exit', code => {
    if (!closed) fail(new Error(`leave supervisor worker exited unexpectedly with code ${code}`));
  });

  function post(kind, requestOptions = {}, hooks = {}) {
    if (closed || failed) return Promise.reject(new Error(lastError || 'leave supervisor unavailable'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { kind, resolve, reject, hooks });
      try {
        worker.postMessage({ kind, id, options: serializableLeaveOptions(requestOptions) });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function waitUntilReady() {
    return ready ? Promise.resolve(true) : readyPromise;
  }

  function leave(requestOptions = {}, hooks = {}) {
    if (ready) return post('leave', requestOptions, hooks);
    return waitUntilReady().then(() => post('leave', requestOptions, hooks));
  }

  function prewarm(requestOptions = {}) {
    if (ready) return post('prewarm', requestOptions);
    return waitUntilReady().then(() => post('prewarm', requestOptions));
  }

  async function close() {
    if (closed) return status();
    closed = true;
    const error = new Error('leave supervisor closed');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    await worker.terminate();
    return status();
  }

  function status() {
    return {
      ready,
      closed,
      failed,
      pending: pending.size,
      completedLeaves,
      completedPrewarms,
      lastError
    };
  }

  return {
    close,
    leave,
    prewarm,
    ready: waitUntilReady,
    status
  };
}

module.exports = {
  createBrowserlessLeaveSupervisor,
  serializableLeaveOptions
};
