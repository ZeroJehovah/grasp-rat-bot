'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');

const OMIT_OPTION_KEYS = new Set([
  'now',
  'easyKillPlayerTracker',
  'damagePlayerTracker',
  'combatCompletionTracker',
  'creatorCheck',
  'dynamicWhitelistMemberCheck',
  'dynamicWhitelistEnabledCheck',
  'damagedSelfTodayCheck',
  'whitelistCheck',
  'targetWhitelist',
  'targetWhitelistNameSet',
  'targetWhitelistUserIdSet'
]);

function serializableValue(value, seen = new Set()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const output = value.map(item => serializableValue(item, seen)).filter(item => item !== undefined);
    seen.delete(value);
    return output;
  }
  if (value instanceof Set) {
    const output = Array.from(value).map(item => serializableValue(item, seen)).filter(item => item !== undefined);
    seen.delete(value);
    return output;
  }
  if (value instanceof Map) {
    const output = {};
    for (const [key, item] of value.entries()) {
      const normalized = serializableValue(item, seen);
      if (normalized !== undefined) output[String(key)] = normalized;
    }
    seen.delete(value);
    return output;
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (OMIT_OPTION_KEYS.has(key)) continue;
      const normalized = serializableValue(item, seen);
      if (normalized !== undefined) output[key] = normalized;
    }
    seen.delete(value);
    return output;
  }
  seen.delete(value);
  return undefined;
}

function serializableDecisionOptions(options = {}) {
  return serializableValue(options) || {};
}

function createBrowserlessDecisionWorker(options = {}) {
  const worker = new Worker(path.join(__dirname, 'decision-worker-thread.js'), {
    workerData: { options: serializableDecisionOptions(options) }
  });
  worker.unref();
  const pending = new Map();
  const barriers = new Map();
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
    failed = true;
    lastError = error?.message || String(error || 'decision worker failure');
    const normalized = error instanceof Error ? error : new Error(lastError);
    readyReject?.(normalized);
    for (const request of pending.values()) request.reject(normalized);
    for (const request of barriers.values()) request.reject(normalized);
    pending.clear();
    barriers.clear();
    busy = false;
  }

  worker.on('message', message => {
    if (message?.kind === 'ready') {
      ready = true;
      readyResolve?.(true);
      return;
    }
    if (message?.kind === 'decision') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      busy = false;
      completed += 1;
      maxComputeMs = Math.max(maxComputeMs, Number(message.computeMs || 0));
      request.resolve({
        decision: message.decision,
        summary: message.summary || null,
        effects: message.effects || [],
        responseScale: message.responseScale || null,
        computeMs: Number(message.computeMs || 0),
        postMs: request.postMs,
        roundTripMs: performance.now() - request.started,
        requestAtMs: message.requestAtMs || request.requestAtMs
      });
      return;
    }
    if (message?.kind === 'barrier') {
      const request = barriers.get(message.id);
      if (request) {
        barriers.delete(message.id);
        request.resolve(true);
      }
      return;
    }
    if (message?.kind === 'request-error') {
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        busy = false;
        request.reject(new Error(message.error || 'decision worker request failed'));
      }
    }
  });
  worker.on('error', fail);
  worker.on('exit', code => {
    if (!closed && code !== 0) fail(new Error(`decision worker exited with code ${code}`));
  });

  async function waitUntilReady() {
    if (ready) return true;
    return readyPromise;
  }

  function decide(state, nextOptions = {}, context = {}, statePatch = null) {
    if (closed || failed) return Promise.reject(new Error(lastError || 'decision worker unavailable'));
    if (busy) return Promise.reject(new Error('decision worker busy'));
    const id = nextId++;
    const started = performance.now();
    const requestAtMs = Number(nextOptions.nowMs || Date.now());
    return new Promise((resolve, reject) => {
      const request = { resolve, reject, started, requestAtMs, postMs: 0 };
      pending.set(id, request);
      busy = true;
      try {
        const postStarted = performance.now();
        worker.postMessage({
          kind: 'decide',
          id,
          state,
          options: serializableDecisionOptions(nextOptions),
          context: serializableValue(context) || {},
          // Persistence snapshots come from the decision adapter as plain
          // structured-clone-compatible data. Avoid a full recursive copy on
          // the WebSocket callback before postMessage performs the required
          // clone into the Worker.
          statePatch,
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

  function observeActionResult(actionResult, decision, eventOptions = {}) {
    if (closed || failed) return false;
    try {
      worker.postMessage({
        kind: 'observe-action',
        actionResult,
        decision,
        options: serializableDecisionOptions(eventOptions)
      });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  function flush() {
    if (closed || failed) return Promise.resolve(false);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      barriers.set(id, { resolve, reject });
      worker.postMessage({ kind: 'barrier', id });
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
    decide,
    flush,
    observeActionResult,
    ready: waitUntilReady,
    status
  };
}

module.exports = {
  createBrowserlessDecisionWorker,
  serializableDecisionOptions
};
