'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const { serializableDecisionOptions } = require('./decision-worker');

function createBrowserlessRealtimeControlWorker(options = {}) {
  const worker = new Worker(path.join(__dirname, 'realtime-control-worker-thread.js'), {
    workerData: { options: serializableDecisionOptions(options) }
  });
  worker.unref();
  const pending = new Map();
  let nextId = 1;
  let ready = false;
  let busy = false;
  let closed = false;
  let failed = false;
  let lastError = '';
  let completed = 0;
  let maxPostMs = 0;
  let maxComputeMs = 0;
  let readyResolve;
  let readyReject;
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function fail(error) {
    if (failed || closed) return;
    failed = true;
    lastError = error?.message || String(error || 'realtime control worker failure');
    const normalized = error instanceof Error ? error : new Error(lastError);
    readyReject?.(normalized);
    for (const request of pending.values()) request.reject(normalized);
    pending.clear();
    busy = false;
  }

  worker.on('message', message => {
    if (message?.kind === 'ready') {
      ready = true;
      readyResolve?.(true);
      return;
    }
    if (message?.kind === 'request-error') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (request.kind === 'evaluation') busy = false;
      request.reject(new Error(message.error || 'realtime control worker request failed'));
      return;
    }
    if (!['evaluation', 'persistence', 'finalize', 'barrier'].includes(message?.kind)) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (request.kind === 'evaluation') {
      busy = false;
      completed += 1;
      maxComputeMs = Math.max(maxComputeMs, Number(message.computeMs || 0));
    }
    if (message.kind === 'evaluation') {
      request.resolve({
        control: message.control || null,
        effects: message.effects || [],
        stageTimings: message.stageTimings || null,
        inputScale: message.inputScale || null,
        persistenceState: message.persistenceState || null,
        statusSummary: message.statusSummary || null,
        computeMs: Number(message.computeMs || 0),
        postMs: request.postMs,
        roundTripMs: performance.now() - request.started,
        requestAtMs: message.requestAtMs || request.requestAtMs,
        tick: message.tick ?? null
      });
    } else if (message.kind === 'persistence') {
      request.resolve({
        persistenceState: message.persistenceState || null,
        statusSummary: message.statusSummary || null
      });
    } else if (message.kind === 'finalize') {
      request.resolve(message.result || null);
    } else {
      request.resolve(true);
    }
  });
  worker.on('error', fail);
  worker.on('exit', code => {
    if (!closed && code !== 0) fail(new Error(`realtime control worker exited with code ${code}`));
  });

  async function waitUntilReady() {
    if (ready) return true;
    return readyPromise;
  }

  function evaluate(state, nextOptions = {}, context = {}, statePatch = null, includePersistence = false) {
    if (closed || failed) return Promise.reject(new Error(lastError || 'realtime control worker unavailable'));
    if (busy) return Promise.reject(new Error('realtime control worker busy'));
    const id = nextId++;
    const started = performance.now();
    const requestAtMs = Number(nextOptions.nowMs || Date.now());
    return new Promise((resolve, reject) => {
      const request = { kind: 'evaluation', resolve, reject, started, requestAtMs, postMs: 0 };
      pending.set(id, request);
      busy = true;
      try {
        const postStarted = performance.now();
        worker.postMessage({
          kind: 'evaluate',
          id,
          // Decision-state views are already plain data assembled by the
          // state store. Let Worker.postMessage perform the one required
          // structured clone instead of recursively copying the full frame
          // on the latency-sensitive WebSocket callback first.
          state,
          options: serializableDecisionOptions(nextOptions),
          context: serializableDecisionOptions(context) || {},
          statePatch,
          includePersistence: includePersistence === true,
          requestAtMs
        });
        request.postMs = performance.now() - postStarted;
        maxPostMs = Math.max(maxPostMs, request.postMs);
      } catch (error) {
        pending.delete(id);
        busy = false;
        reject(error);
      }
    });
  }

  function post(kind, payload = {}) {
    if (closed || failed) return false;
    try {
      worker.postMessage({ kind, ...payload });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  function syncPlannerDecision(decision) {
    return post('sync-planner', { decision: serializableDecisionOptions(decision) });
  }

  function observeActionResult(actionResult, decision, eventOptions = {}) {
    return post('observe-action', {
      actionResult: serializableDecisionOptions(actionResult),
      decision: serializableDecisionOptions(decision),
      options: serializableDecisionOptions(eventOptions)
    });
  }

  function noteRealtimeFinalActionPreemption(action, atMs) {
    return post('note-preemption', {
      action: serializableDecisionOptions(action),
      atMs: Number(atMs || Date.now())
    });
  }

  function patchState(statePatch) {
    return post('patch-state', { statePatch: serializableDecisionOptions(statePatch) });
  }

  function requestPersistence() {
    if (closed || failed) return Promise.reject(new Error(lastError || 'realtime control worker unavailable'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { kind: 'persistence', resolve, reject, started: performance.now(), postMs: 0 });
      try {
        worker.postMessage({ kind: 'persistence', id });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function finalize(reason, eventOptions = {}) {
    if (closed || failed) return Promise.resolve(null);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { kind: 'finalize', resolve, reject, started: performance.now(), postMs: 0 });
      try {
        worker.postMessage({
          kind: 'finalize',
          id,
          reason: String(reason || 'canary-ended'),
          options: serializableDecisionOptions(eventOptions)
        });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function flush() {
    if (closed || failed) return Promise.resolve(false);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { kind: 'barrier', resolve, reject, started: performance.now(), postMs: 0 });
      try {
        worker.postMessage({ kind: 'barrier', id });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  async function close() {
    if (closed) return status();
    try {
      await flush();
    } catch (_) {}
    closed = true;
    await worker.terminate();
    return status();
  }

  function status() {
    return {
      ready,
      busy,
      closed,
      failed,
      completed,
      maxPostMs,
      maxComputeMs,
      lastError
    };
  }

  return {
    close,
    evaluate,
    finalize,
    flush,
    noteRealtimeFinalActionPreemption,
    observeActionResult,
    patchState,
    ready: waitUntilReady,
    requestPersistence,
    status,
    syncPlannerDecision
  };
}

module.exports = {
  createBrowserlessRealtimeControlWorker
};
