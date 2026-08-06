'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const {
  DEFAULT_REMOTE_PROFIT_TARGET_CONFIG
} = require('../../strategy/remote-profit-targets');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TTL_MS = 210000;
const DEFAULT_PENDING_GRACE_MS = 5000;
const MAX_CANDIDATES = 64;

function isRemoteProfitSnapshotEligible(source, detail = {}, sessionOnline, realtimeSelf) {
  if (String(source || '') !== 'gap-http' || detail.global !== true || sessionOnline !== true) return false;
  const authority = String(realtimeSelf?.authority || realtimeSelf?.source || '').toLowerCase();
  if (!['realtime', 'pos', 'native'].includes(authority)) return false;
  if (realtimeSelf?.x === null || realtimeSelf?.x === undefined || realtimeSelf?.x === '') return false;
  if (realtimeSelf?.y === null || realtimeSelf?.y === undefined || realtimeSelf?.y === '') return false;
  return Number.isFinite(Number(realtimeSelf.x)) && Number.isFinite(Number(realtimeSelf.y));
}

function remoteProfitRealtimeSelfFromLiveState(liveState, fallbackUserId) {
  const self = liveState?.current?.self || null;
  const authority = String(self?.authority || self?.source || '').toLowerCase();
  if (!self || !['realtime', 'pos', 'native'].includes(authority)) return null;
  if (self.x === null || self.x === undefined || self.x === '') return null;
  if (self.y === null || self.y === undefined || self.y === '') return null;
  const x = Number(self.x);
  const y = Number(self.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    authority,
    userId: Number(self.userId ?? self.user_id ?? fallbackUserId) || fallbackUserId,
    x,
    y,
    hp: Number.isFinite(Number(self.hp)) ? Number(self.hp) : null,
    stamina5s: self.stamina5s,
    stamina5sLimit: self.stamina5sLimit,
    stamina1d: self.stamina1d,
    stamina1dRemaining: self.stamina1dRemaining,
    stamina1dLimit: self.stamina1dLimit
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function cpuUsageMs(start) {
  if (typeof process.cpuUsage !== 'function') return 0;
  const delta = process.cpuUsage(start);
  return (Number(delta.user || 0) + Number(delta.system || 0)) / 1000;
}

function createRemoteProfitWorker(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const enabled = options.enabled !== false;
  const timeoutMs = Math.max(100, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const ttlMs = Math.max(1000, Number(options.ttlMs || DEFAULT_TTL_MS));
  const pendingGraceMs = Math.max(0, Number(options.pendingGraceMs || DEFAULT_PENDING_GRACE_MS));
  const maxCandidates = Math.max(1, Math.min(MAX_CANDIDATES, Math.round(Number(options.maxCandidates || MAX_CANDIDATES))));
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const workerFactory = typeof options.workerFactory === 'function'
    ? options.workerFactory
    : () => new Worker(path.join(__dirname, 'remote-profit-worker-thread.js'));
  let worker = null;
  let ready = false;
  let closed = false;
  let failed = false;
  let workerNice = null;
  let busy = false;
  let nextRequestId = 1;
  let nextGeneration = 0;
  let pending = null;
  let batch = null;
  let lastError = '';
  let lastErrorAtMs = 0;
  let completed = 0;
  let discarded = 0;
  let timeouts = 0;
  let maxPostMs = 0;
  let maxComputeMs = 0;
  let maxRoundTripMs = 0;
  let maxPostCpuMs = 0;
  let maxPublicationCpuMs = 0;
  let maxContextSerializationCpuMs = 0;
  let maxContextSerializationMs = 0;
  let latestRequestedGeneration = 0;
  let latestPublishedGeneration = 0;
  let supersededIds = new Set();
  let missSuppressedIds = new Set();
  let publishedCandidateIds = new Set();
  let selectedSummary = null;

  function emit(type, detail = {}) {
    try { onEvent(type, { ...detail, generation: detail.generation ?? latestRequestedGeneration }); } catch (_) {}
  }

  function markFailed(error, type = 'worker-error', sourceWorker = null) {
    if (sourceWorker && worker !== sourceWorker) return false;
    const message = error?.message || String(error || 'remote profit worker failure');
    lastError = message.slice(0, 240);
    lastErrorAtMs = now();
    failed = true;
    ready = false;
    workerNice = null;
    busy = false;
    if (pending?.timer) clearTimeout(pending.timer);
    pending?.reject?.(new Error(lastError));
    pending = null;
    emit(type, { error: lastError });
    const failedWorker = worker;
    worker = null;
    try { failedWorker?.terminate(); } catch (_) {}
    clearPublished('worker-failure');
    return true;
  }

  function attach(nextWorker) {
    worker = nextWorker;
    const attachedWorker = nextWorker;
    ready = false;
    workerNice = null;
    failed = false;
    worker.unref();
    worker.on('message', message => {
      if (message?.kind === 'ready') {
        ready = true;
        workerNice = message.nice !== null && message.nice !== undefined && Number.isFinite(Number(message.nice))
          ? Number(message.nice)
          : null;
        return;
      }
      if (message?.kind === 'result') {
        const request = pending;
        if (!request || request.id !== message.id) return;
        pending = null;
        busy = false;
        if (request.timer) clearTimeout(request.timer);
        const roundTripMs = performance.now() - request.started;
        const computeMs = Number(message.computeMs || 0);
        maxComputeMs = Math.max(maxComputeMs, computeMs);
        maxRoundTripMs = Math.max(maxRoundTripMs, roundTripMs);
        completed += 1;
        request.resolve({
          ...(message.result || {}),
          generation: request.generation,
          computeMs,
          postMs: request.postMs,
          postCpuMs: request.postCpuMs,
          roundTripMs
        });
        return;
      }
      if (message?.kind === 'request-error') {
        const request = pending;
        if (!request || request.id !== message.id) return;
        pending = null;
        busy = false;
        if (request.timer) clearTimeout(request.timer);
        request.reject(new Error(message.error || 'remote profit worker request failed'));
        markFailed(new Error(message.error || 'remote profit worker request failed'), 'worker-error', attachedWorker);
        return;
      }
      if (message?.kind === 'barrier') return;
    });
    worker.on('error', error => markFailed(error, 'worker-error', attachedWorker));
    worker.on('exit', code => {
      if (!closed && worker === attachedWorker) {
        markFailed(new Error(`remote profit worker exited with code ${code}`), 'worker-error', attachedWorker);
      }
    });
  }

  function ensureWorker() {
    if (!enabled || closed) return false;
    if (worker && !failed) return true;
    try {
      attach(workerFactory());
      return true;
    } catch (error) {
      markFailed(error);
      return false;
    }
  }

  function clearPublished(reason = '') {
    batch = null;
    supersededIds = new Set();
    missSuppressedIds = new Set();
    publishedCandidateIds = new Set();
    selectedSummary = null;
    if (reason) emit('discarded', { reason });
  }

  function request(payload = {}) {
    if (!enabled || closed) return Promise.resolve(null);
    if (busy) {
      discarded += 1;
      emit('discarded', { reason: 'worker-busy' });
      return Promise.resolve(null);
    }
    const observedAtMs = Number(payload.observedAtMs || now());
    const generation = ++nextGeneration;
    latestRequestedGeneration = generation;
    if (!ensureWorker()) return Promise.resolve(null);
    busy = true;
    const id = nextRequestId++;
    const started = performance.now();
    const requestPayload = {
      ...payload,
      generation,
      observedAtMs,
      online: payload.online !== false,
      config: {
        ...DEFAULT_REMOTE_PROFIT_TARGET_CONFIG,
        ...(payload.config || {}),
        maxCandidates
      },
      entities: Array.isArray(payload.entities) ? payload.entities : []
    };
    return new Promise((resolve, reject) => {
      const item = { id, generation, started, startedAtMs: now(), postMs: 0, resolve, reject, timer: null };
      pending = item;
      try {
        const postStarted = performance.now();
        const postCpuStarted = typeof process.cpuUsage === 'function' ? process.cpuUsage() : null;
        worker.postMessage({ kind: 'evaluate', id, request: requestPayload });
        item.postMs = performance.now() - postStarted;
        item.postCpuMs = postCpuStarted ? cpuUsageMs(postCpuStarted) : 0;
        maxPostMs = Math.max(maxPostMs, item.postMs);
        maxPostCpuMs = Math.max(maxPostCpuMs, item.postCpuMs);
      } catch (error) {
        pending = null;
        busy = false;
        markFailed(error, 'worker-error', worker);
        resolve(null);
        return;
      }
      item.timer = setTimeout(() => {
        if (pending !== item) return;
        timeouts += 1;
        pending = null;
        busy = false;
        discarded += 1;
        clearPublished('worker-timeout');
        emit('timeout', { generation, timeoutMs });
        const timedOutWorker = worker;
        worker = null;
        try { timedOutWorker?.terminate(); } catch (_) {}
        failed = true;
        ready = false;
        lastError = `timeout after ${timeoutMs}ms`;
        lastErrorAtMs = now();
        resolve(null);
      }, timeoutMs);
      item.timer.unref?.();
    });
  }

  function publish(result) {
    if (!result || Number(result.generation) !== latestRequestedGeneration) {
      discarded += 1;
      emit('discarded', { reason: 'late-generation', resultGeneration: result?.generation ?? null });
      return false;
    }
    const observedAtMs = Number(result.observedAtMs || now());
    const publicationCpuStarted = typeof process.cpuUsage === 'function' ? process.cpuUsage() : null;
    const frozenCandidates = Object.freeze((result.candidates || [])
      .slice(0, maxCandidates)
      .map(item => Object.freeze({ ...item })));
    batch = Object.freeze({
      generation: Number(result.generation),
      tick: result.tick ?? null,
      source: result.source || '',
      observedAtMs,
      expiresAtMs: observedAtMs + ttlMs,
      candidates: frozenCandidates,
      diagnostics: result.diagnostics || {},
      publishedAtMs: now(),
      postMs: Number(result.postMs || 0),
      postCpuMs: Number(result.postCpuMs || 0),
      computeMs: Number(result.computeMs || 0),
      roundTripMs: Number(result.roundTripMs || 0),
      publicationCpuMs: publicationCpuStarted ? cpuUsageMs(publicationCpuStarted) : 0
    });
    maxPublicationCpuMs = Math.max(maxPublicationCpuMs, batch.publicationCpuMs);
    latestPublishedGeneration = batch.generation;
    supersededIds = new Set();
    missSuppressedIds = new Set();
    publishedCandidateIds = new Set(frozenCandidates
      .map(item => item?.userId ?? item?.user_id)
      .filter(value => value !== null && value !== undefined && value !== '')
      .map(String));
    emit('published', {
      generation: batch.generation,
      candidateCount: batch.candidates.length,
      diagnostics: batch.diagnostics,
      postMs: batch.postMs,
      postCpuMs: batch.postCpuMs,
      publicationCpuMs: batch.publicationCpuMs,
      computeMs: batch.computeMs,
      roundTripMs: batch.roundTripMs
    });
    return true;
  }

  function publishRequest(payload) {
    const generation = nextGeneration + 1;
    const previousBatch = batch;
    return request(payload).then(result => {
      if (result) publish(result);
      else if (!busy && previousBatch && Number(previousBatch.generation) < generation) clearPublished('worker-result-unavailable');
      return result;
    }).catch(error => {
      if (!failed) markFailed(error);
      clearPublished('worker-request-error');
      return null;
    });
  }

  function context(atMs = now()) {
    if (!enabled || !batch) return null;
    const t = Number(atMs);
    if (Number.isFinite(t) && t >= batch.expiresAtMs) {
      clearPublished('ttl-expired');
      return null;
    }
    const pendingGeneration = Number(latestRequestedGeneration) > Number(batch.generation);
    if (pendingGeneration && pending?.startedAtMs) {
      const graceUntil = pending.startedAtMs + pendingGraceMs;
      if (Number.isFinite(t) && t > graceUntil) return null;
    }
    const contextCpuStarted = typeof process.cpuUsage === 'function' ? process.cpuUsage() : null;
    const contextStarted = performance.now();
    const contextValue = Object.freeze({
      ...batch,
      realtimeSupersededIds: Object.freeze(Array.from(supersededIds).slice(0, MAX_CANDIDATES)),
      missSuppressedIds: Object.freeze(Array.from(missSuppressedIds).slice(0, MAX_CANDIDATES))
    });
    const contextWallMs = performance.now() - contextStarted;
    const contextCpuMs = contextCpuStarted ? cpuUsageMs(contextCpuStarted) : 0;
    maxContextSerializationCpuMs = Math.max(maxContextSerializationCpuMs, contextCpuMs);
    maxContextSerializationMs = Math.max(maxContextSerializationMs, contextWallMs);
    return contextValue;
  }

  function observeDecision(decision = {}) {
    const remote = decision?.remoteProfit || decision?.profit?.remoteProfit || null;
    if (!remote || Number(remote.generation) !== latestPublishedGeneration) return false;
    selectedSummary = remote.selected ? cloneJson(remote.selected) : null;
    for (const id of remote.realtimeSupersededIds || []) supersededIds.add(String(id));
    for (const id of remote.missSuppressedIds || []) missSuppressedIds.add(String(id));
    return true;
  }

  function observeRealtimeEntities(entities = []) {
    if (!batch || !Array.isArray(entities) || entities.length === 0) return 0;
    if (!publishedCandidateIds.size) return 0;
    let added = 0;
    for (const entity of entities.slice(0, 256)) {
      const userId = entity?.user_id ?? entity?.userId ?? entity?.target_user_id ?? entity?.targetUserId;
      if (userId === null || userId === undefined || userId === '') continue;
      const id = String(userId);
      if (!publishedCandidateIds.has(id) || supersededIds.has(id)) continue;
      supersededIds.add(id);
      added += 1;
    }
    return added;
  }

  async function close() {
    if (closed) return status();
    closed = true;
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
    busy = false;
    try { await worker?.terminate(); } catch (_) {}
    worker = null;
    ready = false;
    workerNice = null;
    return status();
  }

  function status(atMs = now()) {
    const current = batch && Number(atMs) < batch.expiresAtMs ? batch : null;
    return {
      enabled,
      ready,
      busy,
      closed,
      failed,
      workerNice,
      generation: latestPublishedGeneration,
      latestRequestedGeneration,
      latestPublishedGeneration,
      snapshotAt: current ? new Date(current.observedAtMs).toISOString() : '',
      ageMs: current ? Math.max(0, Number(atMs) - current.observedAtMs) : null,
      expiresAt: current ? new Date(current.expiresAtMs).toISOString() : '',
      pending: Boolean(pending),
      candidateCount: current?.candidates?.length || 0,
      highDropAfkCount: Number(current?.diagnostics?.highDropAfkCount || 0),
      easyKillActiveCount: Number(current?.diagnostics?.easyKillActiveCount || 0),
      postMs: current?.postMs ?? null,
      postCpuMs: current?.postCpuMs ?? null,
      publicationCpuMs: current?.publicationCpuMs ?? null,
      computeMs: current?.computeMs ?? null,
      roundTripMs: current?.roundTripMs ?? null,
      maxPostMs,
      maxPostCpuMs,
      maxPublicationCpuMs,
      maxContextSerializationCpuMs,
      maxContextSerializationMs,
      maxComputeMs,
      maxRoundTripMs,
      completed,
      discarded,
      timeouts,
      realtimeSupersededCount: supersededIds.size,
      missSuppressedCount: missSuppressedIds.size,
      selected: selectedSummary,
      lastError,
      lastErrorAt: lastErrorAtMs ? new Date(lastErrorAtMs).toISOString() : ''
    };
  }

  return {
    close,
    context,
    observeDecision,
    observeRealtimeEntities,
    publish: publishRequest,
    request: publishRequest,
    status
  };
}

module.exports = {
  DEFAULT_PENDING_GRACE_MS,
  DEFAULT_REMOTE_PROFIT_WORKER_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
  DEFAULT_REMOTE_PROFIT_WORKER_TTL_MS: DEFAULT_TTL_MS,
  createRemoteProfitWorker,
  isRemoteProfitSnapshotEligible,
  remoteProfitRealtimeSelfFromLiveState
};
