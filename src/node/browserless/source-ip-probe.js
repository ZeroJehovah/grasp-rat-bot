'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const {
  DEFAULT_SOURCE_IP_INTERFACE,
  compareIpv4Numeric,
  discoverInterfaceIpv4,
  requestAnonymousGameRoot,
  sourceIpPreflightErrorCategory,
  uniqueIpv4
} = require('./source-ip-preflight');

const SOURCE_IP_PROBE_SCHEMA_VERSION = 2;
const SOURCE_IP_PROBE_RETENTION_MS = 24 * 60 * 60 * 1000;
const SOURCE_IP_PROBE_HALF_LIFE_MS = 6 * 60 * 60 * 1000;
const SOURCE_IP_PROBE_REQUIRED_COUNT = 3;
const SOURCE_IP_PROBE_TIMEOUT_MS = 60 * 1000;
const SOURCE_IP_PROBE_BETWEEN_IP_MIN_MS = 5 * 1000;
const SOURCE_IP_PROBE_BETWEEN_IP_MAX_MS = 10 * 1000;
const SOURCE_IP_PROBE_BETWEEN_ROUND_MIN_MS = 30 * 60 * 1000;
const SOURCE_IP_PROBE_BETWEEN_ROUND_MAX_MS = 60 * 60 * 1000;
const SOURCE_IP_PROBE_MIN_SUCCESS_RATE = 0.5;
const SOURCE_IP_PROBE_MAX_SAMPLES = 10000;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedMetricOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function isProbeSuccessStatus(status) {
  return Number(status) === 200;
}

function randomIntegerInclusive(min, max, random = Math.random) {
  const lower = Math.ceil(Number(min));
  const upper = Math.floor(Number(max));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return Math.max(0, lower || 0);
  const value = Number(random());
  const ratio = Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0;
  return lower + Math.floor(ratio * (upper - lower + 1));
}

function normalizeProbeSample(value, nowMs = Date.now()) {
  const input = value && typeof value === 'object' ? value : {};
  const ip = String(input.ip || '').trim();
  const observedAtMs = Date.parse(String(input.observedAt || ''));
  if (net.isIP(ip) !== 4 || !Number.isFinite(observedAtMs)) return null;
  const status = numberOrNull(input.status);
  const rawElapsedMs = numberOrNull(input.elapsedMs);
  const rawTotalMs = numberOrNull(input.totalMs);
  const elapsedMs = rawElapsedMs === null ? rawTotalMs : rawElapsedMs;
  const totalMs = rawTotalMs === null ? rawElapsedMs : rawTotalMs;
  const normalizeTiming = key => {
    const timing = numberOrNull(input[key]);
    return timing === null ? null : Math.max(0, Math.round(timing * 10) / 10);
  };
  const errorCategory = String(input.errorCategory || '').slice(0, 48);
  return {
    ip,
    observedAt: new Date(observedAtMs).toISOString(),
    status: status === null || status <= 0 ? null : Math.round(status),
    elapsedMs: elapsedMs === null ? null : Math.max(0, Math.round(elapsedMs)),
    dnsMs: normalizeTiming('dnsMs'),
    tcpMs: normalizeTiming('tcpMs'),
    tlsMs: normalizeTiming('tlsMs'),
    ttfbMs: normalizeTiming('ttfbMs'),
    totalMs: totalMs === null ? null : Math.max(0, Math.round(totalMs * 10) / 10),
    ok: isProbeSuccessStatus(status),
    errorCategory
  };
}

function normalizeProbeHistory(value = {}, nowMs = Date.now(), retentionMs = SOURCE_IP_PROBE_RETENTION_MS) {
  const input = value && typeof value === 'object' ? value : {};
  const currentMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const keepMs = Math.max(1, Number(retentionMs) || SOURCE_IP_PROBE_RETENTION_MS);
  const cutoffMs = currentMs - keepMs;
  const samples = [];
  for (const rawSample of Array.isArray(input.samples) ? input.samples : []) {
    const sample = normalizeProbeSample(rawSample, currentMs);
    if (!sample) continue;
    const observedAtMs = Date.parse(sample.observedAt);
    if (observedAtMs < cutoffMs) continue;
    samples.push(sample);
  }
  samples.sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
  const rawLastRound = input.lastCompletedRound && typeof input.lastCompletedRound === 'object'
    ? input.lastCompletedRound
    : null;
  const lastCompletedAtMs = Date.parse(String(rawLastRound?.roundCompletedAt || ''));
  const nextRoundAtMs = Date.parse(String(input.nextRoundAt || ''));
  const updatedAtMs = Date.parse(String(input.updatedAt || ''));
  const lastCompletedRound = Number.isFinite(lastCompletedAtMs)
    ? {
        ok: Boolean(rawLastRound.ok),
        roundStartedAt: Number.isFinite(Date.parse(String(rawLastRound.roundStartedAt || '')))
          ? new Date(Date.parse(rawLastRound.roundStartedAt)).toISOString()
          : '',
        roundCompletedAt: new Date(lastCompletedAtMs).toISOString(),
        elapsedMs: Math.max(0, Math.round(Number(rawLastRound.elapsedMs || 0))),
        discoveredCount: Math.max(0, Math.round(Number(rawLastRound.discoveredCount || 0))),
        requestCount: Math.max(0, Math.round(Number(rawLastRound.requestCount || 0))),
        successCount: Math.max(0, Math.round(Number(rawLastRound.successCount || 0))),
        failureCount: Math.max(0, Math.round(Number(rawLastRound.failureCount || 0))),
        errorCategory: String(rawLastRound.errorCategory || '').slice(0, 48)
      }
    : null;
  return {
    schemaVersion: SOURCE_IP_PROBE_SCHEMA_VERSION,
    updatedAt: Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toISOString() : new Date(currentMs).toISOString(),
    retentionMs: keepMs,
    samples: samples.slice(-SOURCE_IP_PROBE_MAX_SAMPLES),
    lastCompletedRound,
    nextRoundAt: Number.isFinite(nextRoundAtMs) ? new Date(nextRoundAtMs).toISOString() : ''
  };
}

function readSourceIpProbeHistory(file, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const retentionMs = options.retentionMs || SOURCE_IP_PROBE_RETENTION_MS;
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return normalizeProbeHistory(value, now(), retentionMs);
}

function writeSourceIpProbeHistory(file, value, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const retentionMs = options.retentionMs || SOURCE_IP_PROBE_RETENTION_MS;
  const history = normalizeProbeHistory(value, now(), retentionMs);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryFile = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(temporaryFile, 0o600);
    fs.renameSync(temporaryFile, file);
  } catch (error) {
    try { fs.unlinkSync(temporaryFile); } catch (_) {}
    throw error;
  }
  return history;
}

function createSourceIpProbeStore(options = {}) {
  const file = path.resolve(String(options.file || 'source-ip-probe-results.json'));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const retentionMs = Math.max(1, Number(options.retentionMs || SOURCE_IP_PROBE_RETENTION_MS));
  let history = readSourceIpProbeHistory(file, { now, retentionMs });

  function persist() {
    history = writeSourceIpProbeHistory(file, history, { now, retentionMs });
    return cloneJson(history);
  }

  function prune() {
    const current = normalizeProbeHistory(history, now(), retentionMs);
    const changed = JSON.stringify(current) !== JSON.stringify(history);
    history = current;
    if (changed) {
      history.updatedAt = new Date(now()).toISOString();
      persist();
    }
    return cloneJson(history);
  }

  return {
    file,
    snapshot() {
      return prune();
    },
    record(sample) {
      const normalized = normalizeProbeSample(sample, now());
      if (!normalized) throw new Error('invalid source IP probe sample');
      history = normalizeProbeHistory({
        ...history,
        updatedAt: new Date(now()).toISOString(),
        samples: [...history.samples, normalized]
      }, now(), retentionMs);
      persist();
      return cloneJson(normalized);
    },
    commitRound(samples, summary, nextRoundAt) {
      const normalizedSamples = (Array.isArray(samples) ? samples : []).map(sample => {
        const normalized = normalizeProbeSample(sample, now());
        if (!normalized) throw new Error('invalid source IP probe sample');
        return normalized;
      });
      history = normalizeProbeHistory({
        ...history,
        updatedAt: new Date(now()).toISOString(),
        samples: [...history.samples, ...normalizedSamples],
        lastCompletedRound: summary,
        nextRoundAt
      }, now(), retentionMs);
      persist();
      return cloneJson(history);
    },
    initializeSchedule(nextRoundAt) {
      if (history.nextRoundAt) return cloneJson(history);
      history = normalizeProbeHistory({
        ...history,
        updatedAt: new Date(now()).toISOString(),
        nextRoundAt
      }, now(), retentionMs);
      persist();
      return cloneJson(history);
    },
    prune,
    status() {
      const current = prune();
      return {
        file,
        updatedAt: current.updatedAt,
        retentionMs,
        sampleCount: current.samples.length,
        sourceIpCount: new Set(current.samples.map(sample => sample.ip)).size,
        lastCompletedRound: current.lastCompletedRound,
        nextRoundAt: current.nextRoundAt
      };
    }
  };
}

function weightedQuantile(values, quantile) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left.value - right.value);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) return null;
  const target = totalWeight * Math.min(1, Math.max(0, Number(quantile) || 0));
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

function weightedLatencyMetrics(samples, nowMs, halfLifeMs, valueOf) {
  const values = [];
  let weightedValueTotal = 0;
  let valueWeightTotal = 0;
  for (const sample of samples) {
    if (!isProbeSuccessStatus(sample.status)) continue;
    const value = Number(valueOf(sample));
    if (!Number.isFinite(value)) continue;
    const observedAtMs = Date.parse(sample.observedAt);
    const ageMs = Math.max(0, nowMs - observedAtMs);
    const weight = Math.exp(-ageMs / halfLifeMs);
    values.push({ value, weight });
    weightedValueTotal += value * weight;
    valueWeightTotal += weight;
  }
  const weightedMeanMs = valueWeightTotal > 0 ? weightedValueTotal / valueWeightTotal : null;
  const weightedP90Ms = weightedQuantile(values, 0.9);
  const latencyMetricMs = weightedMeanMs === null
    ? null
    : (weightedMeanMs * 0.7) + ((weightedP90Ms ?? weightedMeanMs) * 0.3);
  return {
    sampleCount: values.length,
    weightedMeanMs,
    weightedP90Ms,
    latencyMetricMs
  };
}

function sourceIpProbeMetrics(samples, nowMs = Date.now(), options = {}) {
  const halfLifeMs = Math.max(1, Number(options.halfLifeMs || SOURCE_IP_PROBE_HALF_LIFE_MS));
  const currentMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const ordered = (Array.isArray(samples) ? samples : [])
    .map(sample => normalizeProbeSample(sample, currentMs))
    .filter(Boolean)
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
  let totalWeight = 0;
  let successWeight = 0;
  let successCount = 0;
  let lastSuccessAtMs = 0;
  for (const sample of ordered) {
    const observedAtMs = Date.parse(sample.observedAt);
    const ageMs = Math.max(0, currentMs - observedAtMs);
    const weight = Math.exp(-ageMs / halfLifeMs);
    totalWeight += weight;
    if (isProbeSuccessStatus(sample.status)) {
      successCount += 1;
      successWeight += weight;
      lastSuccessAtMs = Math.max(lastSuccessAtMs, observedAtMs);
    }
  }
  const latest = ordered[ordered.length - 1] || null;
  const totalMetrics = weightedLatencyMetrics(
    ordered,
    currentMs,
    halfLifeMs,
    sample => sample.totalMs ?? sample.elapsedMs
  );
  const ttfbMetrics = weightedLatencyMetrics(ordered, currentMs, halfLifeMs, sample => sample.ttfbMs);
  const latencySource = ttfbMetrics.latencyMetricMs === null ? 'total' : 'ttfb';
  const selectedMetrics = latencySource === 'ttfb' ? ttfbMetrics : totalMetrics;
  return {
    sampleCount: ordered.length,
    successCount,
    failureCount: Math.max(0, ordered.length - successCount),
    weightedSampleWeight: totalWeight,
    weightedSuccessRate: totalWeight > 0 ? successWeight / totalWeight : 0,
    weightedMeanMs: selectedMetrics.weightedMeanMs,
    weightedP90Ms: selectedMetrics.weightedP90Ms,
    latencyMetricMs: selectedMetrics.latencyMetricMs,
    latencySource,
    weightedTotalMeanMs: totalMetrics.weightedMeanMs,
    weightedTotalP90Ms: totalMetrics.weightedP90Ms,
    totalLatencyMetricMs: totalMetrics.latencyMetricMs,
    ttfbSampleCount: ttfbMetrics.sampleCount,
    weightedTtfbMeanMs: ttfbMetrics.weightedMeanMs,
    weightedTtfbP90Ms: ttfbMetrics.weightedP90Ms,
    ttfbLatencyMetricMs: ttfbMetrics.latencyMetricMs,
    confidence: Math.min(1, totalWeight / 4),
    latestAt: latest?.observedAt || '',
    latestAtMs: latest ? Date.parse(latest.observedAt) : 0,
    latestStatus: latest?.status ?? null,
    latestErrorCategory: latest?.errorCategory || '',
    lastSuccessAtMs,
    latestWas403: Number(latest?.status) === 403
  };
}

function selectSourceIpsFromProbeHistory(history, discoveredIps, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const requiredCount = Math.max(1, Math.round(Number(options.requiredCount || SOURCE_IP_PROBE_REQUIRED_COUNT)));
  const retentionMs = Math.max(1, Number(options.retentionMs || SOURCE_IP_PROBE_RETENTION_MS));
  const normalized = normalizeProbeHistory(history, nowMs, retentionMs);
  const discovered = uniqueIpv4(discoveredIps).sort(compareIpv4Numeric);
  const samplesByIp = new Map();
  for (const sample of normalized.samples) {
    if (!discovered.includes(sample.ip)) continue;
    const bucket = samplesByIp.get(sample.ip) || [];
    bucket.push(sample);
    samplesByIp.set(sample.ip, bucket);
  }
  const metrics = discovered.map(ip => ({
    ip,
    ...sourceIpProbeMetrics(samplesByIp.get(ip) || [], nowMs, options)
  }));
  const eligible = metrics.filter(item => (
    item.successCount > 0
      && item.lastSuccessAtMs > 0
      && item.weightedSuccessRate >= SOURCE_IP_PROBE_MIN_SUCCESS_RATE
      && !item.latestWas403
      && item.latencyMetricMs !== null
  ));
  const useTtfbForSelection = eligible.length > 0
    && eligible.every(item => item.ttfbLatencyMetricMs !== null);
  for (const item of eligible) {
    item.selectionLatencySource = useTtfbForSelection ? 'ttfb' : 'total';
    item.selectionLatencyMetricMs = useTtfbForSelection
      ? item.ttfbLatencyMetricMs
      : item.totalLatencyMetricMs;
    item.selectionWeightedMeanMs = useTtfbForSelection
      ? item.weightedTtfbMeanMs
      : item.weightedTotalMeanMs;
    item.selectionWeightedP90Ms = useTtfbForSelection
      ? item.weightedTtfbP90Ms
      : item.weightedTotalP90Ms;
  }
  const speedEligible = eligible.filter(item => Number.isFinite(item.selectionLatencyMetricMs));
  const latencyReference = speedEligible.length
    ? speedEligible.map(item => item.selectionLatencyMetricMs)
      .sort((left, right) => left - right)[Math.floor(speedEligible.length / 2)]
    : null;
  for (const item of speedEligible) {
    const speedScore = latencyReference > 0
      ? Math.min(1, latencyReference / item.selectionLatencyMetricMs)
      : 0;
    item.speedScore = speedScore;
    item.score = (item.weightedSuccessRate * 0.65) + (speedScore * 0.25) + (item.confidence * 0.1);
  }
  speedEligible.sort((left, right) => (
    right.score - left.score
      || right.weightedSuccessRate - left.weightedSuccessRate
      || left.selectionLatencyMetricMs - right.selectionLatencyMetricMs
      || right.latestAtMs - left.latestAtMs
      || compareIpv4Numeric(left.ip, right.ip)
  ));
  const selected = speedEligible.slice(0, requiredCount).map(item => item.ip);
  const diagnostics = {
    selectedAt: new Date(nowMs).toISOString(),
    discoveredCount: discovered.length,
    sampleCount: normalized.samples.length,
    eligibleCount: eligible.length,
    requiredCount,
    blockedCount: metrics.filter(item => item.latestWas403).length,
    candidates: metrics.map(item => ({
      ip: item.ip,
      sampleCount: item.sampleCount,
      successCount: item.successCount,
      weightedSuccessRate: Math.round(item.weightedSuccessRate * 1000) / 1000,
      weightedMeanMs: roundedMetricOrNull(item.selectionWeightedMeanMs),
      weightedP90Ms: roundedMetricOrNull(item.selectionWeightedP90Ms),
      latencyMetricMs: roundedMetricOrNull(item.selectionLatencyMetricMs),
      latencySource: item.selectionLatencySource || 'total',
      weightedTotalMeanMs: roundedMetricOrNull(item.weightedTotalMeanMs),
      weightedTotalP90Ms: roundedMetricOrNull(item.weightedTotalP90Ms),
      totalLatencyMetricMs: roundedMetricOrNull(item.totalLatencyMetricMs),
      ttfbSampleCount: item.ttfbSampleCount,
      weightedTtfbMeanMs: roundedMetricOrNull(item.weightedTtfbMeanMs),
      weightedTtfbP90Ms: roundedMetricOrNull(item.weightedTtfbP90Ms),
      ttfbLatencyMetricMs: roundedMetricOrNull(item.ttfbLatencyMetricMs),
      confidence: Math.round(item.confidence * 1000) / 1000,
      score: Number.isFinite(item.score) ? Math.round(item.score * 1000) / 1000 : null,
      latestAt: item.latestAt,
      latestStatus: item.latestStatus,
      latestErrorCategory: item.latestErrorCategory,
      eligible: speedEligible.some(candidate => candidate.ip === item.ip)
    }))
  };
  const completedAt = new Date(nowMs).toISOString();
  const sourceIpPreflight = {
    phase: selected.length === requiredCount ? 'ready' : 'insufficient',
    reason: selected.length === requiredCount
      ? 'source-ip-probe-selected'
      : 'source-ip-probe-insufficient',
    queuePhase: 'cached-history',
    startedAt: '',
    completedAt,
    elapsedMs: 0,
    discoveredCount: discovered.length,
    ordinaryQueueCount: discovered.length,
    riskQueueCount: diagnostics.blockedCount,
    testedCount: 0,
    requestCount: 0,
    currentIp: selected[selected.length - 1] || '',
    currentAttempt: 0,
    lastStatus: null,
    lastErrorCategory: '',
    availableIps: selected,
    availableCount: selected.length,
    requiredCount,
    riskCount: diagnostics.blockedCount,
    nextRetryAt: '',
    deferredForNextLoginPoint: false,
    deferredAt: '',
    reuseWithoutRetest: false,
    reusedAt: ''
  };
  return {
    ok: selected.length === requiredCount,
    insufficient: selected.length < requiredCount,
    cached: true,
    reason: sourceIpPreflight.reason,
    availableIps: selected,
    sourceIpPreflight,
    diagnostics
  };
}

function createSourceIpProbeScheduler(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const monotonicNow = typeof options.monotonicNow === 'function' ? options.monotonicNow : () => performance.now();
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const interfaceName = String(options.interfaceName || DEFAULT_SOURCE_IP_INTERFACE);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || SOURCE_IP_PROBE_TIMEOUT_MS));
  const retentionMs = Math.max(1, Number(options.retentionMs || SOURCE_IP_PROBE_RETENTION_MS));
  const store = options.store || createSourceIpProbeStore({
    file: options.file,
    now,
    retentionMs
  });
  const discoverIps = typeof options.discoverIps === 'function'
    ? options.discoverIps
    : () => discoverInterfaceIpv4(interfaceName, options.networkInterfaces || os.networkInterfaces);
  const request = typeof options.request === 'function'
    ? options.request
    : (gameOrigin, ip, requestOptions) => requestAnonymousGameRoot(gameOrigin, ip, requestOptions);
  const gameOrigin = String(options.gameOrigin || '');
  let stopped = true;
  let timer = null;
  let activeRoundPromise = null;
  const initialStoreStatus = store.status();
  let lastRound = initialStoreStatus.lastCompletedRound || null;
  let nextRoundAtMs = Date.parse(initialStoreStatus.nextRoundAt || '') || 0;

  const safeCallback = (callback, ...args) => {
    if (typeof callback !== 'function') return;
    try { callback(...args); } catch (_) {}
  };

  function randomNextRoundAtMs() {
    return now() + randomIntegerInclusive(
      SOURCE_IP_PROBE_BETWEEN_ROUND_MIN_MS,
      SOURCE_IP_PROBE_BETWEEN_ROUND_MAX_MS,
      random
    );
  }

  function scheduleRoundAt(targetMs) {
    if (stopped) return 0;
    nextRoundAtMs = Math.max(0, Number(targetMs) || 0);
    const delayMs = Math.max(0, nextRoundAtMs - now());
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void runRound();
    }, delayMs);
    timer?.unref?.();
    return delayMs;
  }

  async function executeRound(scheduleNext = true) {
    const startedAtMs = now();
    const startedMonotonicMs = monotonicNow();
    let ips;
    try {
      ips = uniqueIpv4(discoverIps()).sort(compareIpv4Numeric);
    } catch (error) {
      const summary = {
        ok: false,
        roundStartedAt: new Date(startedAtMs).toISOString(),
        roundCompletedAt: new Date(now()).toISOString(),
        discoveredCount: 0,
        requestCount: 0,
        errorCategory: 'discovery',
        error: error?.message || String(error)
      };
      safeCallback(options.onError, error, { operation: 'source-ip-probe-discovery' });
      if (!stopped) {
        const nextAtMs = randomNextRoundAtMs();
        try {
          store.commitRound([], summary, new Date(nextAtMs).toISOString());
          lastRound = summary;
          safeCallback(options.onRound, summary);
        } catch (storeError) {
          safeCallback(options.onError, storeError, { operation: 'source-ip-probe-persist-round' });
        }
        if (scheduleNext) scheduleRoundAt(nextAtMs);
      }
      return summary;
    }
    let requestCount = 0;
    const results = [];
    safeCallback(options.onRoundStart, {
      roundStartedAt: new Date(startedAtMs).toISOString(),
      discoveredIps: ips.slice()
    });
    for (let index = 0; index < ips.length; index += 1) {
      if (stopped) break;
      const ip = ips[index];
      const requestStartedAtMs = now();
      const requestStartedMonotonicMs = monotonicNow();
      let response = null;
      let error = null;
      try {
        requestCount += 1;
        response = await request(gameOrigin, ip, { timeoutMs });
      } catch (requestError) {
        error = requestError;
      }
      const status = error ? null : numberOrNull(response?.status ?? response?.statusCode);
      const timing = error?.timing || response?.timing || {};
      const sample = {
        ip,
        observedAt: new Date(now()).toISOString(),
        status,
        elapsedMs: Math.max(0, Math.round(monotonicNow() - requestStartedMonotonicMs)),
        dnsMs: numberOrNull(timing.dnsMs),
        tcpMs: numberOrNull(timing.tcpMs),
        tlsMs: numberOrNull(timing.tlsMs),
        ttfbMs: numberOrNull(timing.ttfbMs),
        totalMs: numberOrNull(timing.totalMs),
        errorCategory: error ? sourceIpPreflightErrorCategory(error) : ''
      };
      const result = {
        ...sample,
        ok: isProbeSuccessStatus(status),
        sequence: index + 1,
        sourceCount: ips.length,
        requestStartedAt: new Date(requestStartedAtMs).toISOString(),
        error: error ? String(error?.message || error).slice(0, 160) : ''
      };
      results.push(result);
      safeCallback(options.onResult, result);
      if (index < ips.length - 1 && !stopped) {
        await sleep(randomIntegerInclusive(
          SOURCE_IP_PROBE_BETWEEN_IP_MIN_MS,
          SOURCE_IP_PROBE_BETWEEN_IP_MAX_MS,
          random
        ));
      }
    }
    const completedAtMs = now();
    const summary = {
      ok: !stopped && ips.length > 0 && results.length === ips.length,
      stopped,
      roundStartedAt: new Date(startedAtMs).toISOString(),
      roundCompletedAt: new Date(completedAtMs).toISOString(),
      elapsedMs: Math.max(0, Math.round(monotonicNow() - startedMonotonicMs)),
      discoveredCount: ips.length,
      requestCount,
      successCount: results.filter(result => result.ok).length,
      failureCount: results.filter(result => !result.ok).length,
      results: results.map(result => ({
        ip: result.ip,
        status: result.status,
        elapsedMs: result.elapsedMs,
        dnsMs: result.dnsMs,
        tcpMs: result.tcpMs,
        tlsMs: result.tlsMs,
        ttfbMs: result.ttfbMs,
        totalMs: result.totalMs,
        ok: result.ok,
        errorCategory: result.errorCategory
      }))
    };
    if (!stopped && results.length === ips.length) {
      const nextAtMs = randomNextRoundAtMs();
      try {
        store.commitRound(
          results,
          summary,
          new Date(nextAtMs).toISOString()
        );
        lastRound = summary;
        safeCallback(options.onRound, summary);
      } catch (storeError) {
        safeCallback(options.onError, storeError, { operation: 'source-ip-probe-persist-round' });
      }
      if (scheduleNext) scheduleRoundAt(nextAtMs);
    }
    return summary;
  }

  function runRound(runOptions = {}) {
    if (activeRoundPromise) return activeRoundPromise;
    if (stopped && runOptions.force !== true) return Promise.resolve({ ok: false, skipped: true, reason: 'stopped' });
    const promise = executeRound(runOptions.scheduleNext !== false);
    activeRoundPromise = promise.finally(() => {
      activeRoundPromise = null;
    });
    return activeRoundPromise;
  }

  return {
    file: store.file,
    store,
    start() {
      if (!stopped) return activeRoundPromise || Promise.resolve(lastRound);
      stopped = false;
      const persistedNextAtMs = Date.parse(store.status().nextRoundAt || '') || 0;
      if (persistedNextAtMs > now()) {
        scheduleRoundAt(persistedNextAtMs);
        return Promise.resolve(lastRound);
      }
      if (persistedNextAtMs > 0) return runRound();
      const initialNextAtMs = randomNextRoundAtMs();
      store.initializeSchedule(new Date(initialNextAtMs).toISOString());
      scheduleRoundAt(initialNextAtMs);
      return Promise.resolve(lastRound);
    },
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
    },
    runRound,
    selectSourceIps(discoveredIps, selectOptions = {}) {
      const nowMs = Number.isFinite(Number(selectOptions.nowMs)) ? Number(selectOptions.nowMs) : now();
      const result = selectSourceIpsFromProbeHistory(
        store.snapshot(),
        discoveredIps,
        { ...selectOptions, nowMs, retentionMs }
      );
      if (!result.ok && nextRoundAtMs > nowMs) {
        result.sourceIpPreflight.nextRetryAt = new Date(nextRoundAtMs).toISOString();
      }
      return result;
    },
    status() {
      return {
        interfaceName,
        file: store.file,
        timeoutMs,
        retentionMs,
        stopped,
        inFlight: Boolean(activeRoundPromise),
        nextRoundAt: nextRoundAtMs ? new Date(nextRoundAtMs).toISOString() : store.status().nextRoundAt,
        lastRound,
        store: store.status()
      };
    }
  };
}

async function runSourceIpProbeSelfTest() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grasp-rat-source-ip-probe-'));
  try {
    const nowMs = Date.parse('2026-08-04T10:00:00.000Z');
    const file = path.join(tmp, 'results.json');
    const store = createSourceIpProbeStore({ file, now: () => nowMs });
    store.record({ ip: '10.0.0.1', observedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(), status: 200, elapsedMs: 100 });
    store.record({ ip: '10.0.0.1', observedAt: new Date(nowMs - 1000).toISOString(), status: 200, elapsedMs: 130 });
    store.record({ ip: '10.0.0.2', observedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(), status: 200, elapsedMs: 500 });
    store.record({ ip: '10.0.0.2', observedAt: new Date(nowMs - 1000).toISOString(), status: 403, elapsedMs: 90 });
    store.record({ ip: '10.0.0.3', observedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(), status: 200, elapsedMs: 300 });
    store.record({ ip: '10.0.0.5', observedAt: new Date(nowMs - 30 * 60 * 1000).toISOString(), status: 200, elapsedMs: 220 });
    store.record({ ip: '10.0.0.4', observedAt: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString(), status: 200, elapsedMs: 10 });
    const selection = selectSourceIpsFromProbeHistory(
      store.snapshot(),
      ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5'],
      { nowMs }
    );
    const selectionOk = Boolean(
      selection.ok
        && selection.availableIps.length === 3
        && selection.availableIps.includes('10.0.0.1')
        && selection.availableIps.includes('10.0.0.3')
        && selection.availableIps.includes('10.0.0.5')
        && !selection.availableIps.includes('10.0.0.4')
        && !selection.availableIps.includes('10.0.0.2')
        && store.snapshot().samples.every(sample => sample.ip !== '10.0.0.4')
        && ((fs.statSync(file).mode & 0o777) === 0o600)
    );

    const requestOrder = [];
    const waits = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const schedulerFile = path.join(tmp, 'scheduler.json');
    const schedulerStore = createSourceIpProbeStore({ file: schedulerFile, now: () => nowMs });
    schedulerStore.initializeSchedule(new Date(nowMs - 1).toISOString());
    const scheduler = createSourceIpProbeScheduler({
      gameOrigin: 'https://game.example',
      store: schedulerStore,
      now: () => nowMs,
      monotonicNow: () => 0,
      random: () => 0,
      discoverIps: () => ['10.0.0.13', '10.0.0.11', '10.0.0.12'],
      request: async (_origin, ip) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        requestOrder.push(ip);
        await Promise.resolve();
        activeRequests -= 1;
        return {
          status: 200,
          timing: {
            dnsMs: 1.1,
            tcpMs: 2.2,
            tlsMs: 3.3,
            ttfbMs: 10.4,
            totalMs: 11.5
          }
        };
      },
      sleep: async delayMs => { waits.push(delayMs); },
      onResult: result => { if (result.sequence !== requestOrder.length) throw new Error('unexpected probe sequence'); }
    });
    const round = await scheduler.start();
    const scheduledDelay = Date.parse(scheduler.status().nextRoundAt) - nowMs;
    const completedHistory = schedulerStore.snapshot();
    scheduler.stop();
    let restartRequestCount = 0;
    const restartedScheduler = createSourceIpProbeScheduler({
      gameOrigin: 'https://game.example',
      file: schedulerFile,
      now: () => nowMs,
      random: () => 0,
      discoverIps: () => ['10.0.0.11'],
      request: async () => { restartRequestCount += 1; return { status: 200 }; }
    });
    const restartedRound = await restartedScheduler.start();
    const restartedNextRoundAt = restartedScheduler.status().nextRoundAt;
    restartedScheduler.stop();

    const initialScheduleFile = path.join(tmp, 'initial-schedule.json');
    let initialRequestCount = 0;
    const initialScheduler = createSourceIpProbeScheduler({
      gameOrigin: 'https://game.example',
      file: initialScheduleFile,
      now: () => nowMs,
      random: () => 0,
      discoverIps: () => ['10.0.0.31'],
      request: async () => { initialRequestCount += 1; return { status: 200 }; }
    });
    const initialRound = await initialScheduler.start();
    const initialDelay = Date.parse(initialScheduler.status().nextRoundAt) - nowMs;
    initialScheduler.stop();

    const interruptedFile = path.join(tmp, 'interrupted.json');
    const interruptedStore = createSourceIpProbeStore({ file: interruptedFile, now: () => nowMs });
    const interruptedNextRoundAt = new Date(nowMs - 1).toISOString();
    interruptedStore.initializeSchedule(interruptedNextRoundAt);
    let interruptedScheduler;
    interruptedScheduler = createSourceIpProbeScheduler({
      gameOrigin: 'https://game.example',
      store: interruptedStore,
      now: () => nowMs,
      random: () => 0,
      discoverIps: () => ['10.0.0.41', '10.0.0.42'],
      request: async () => {
        interruptedScheduler.stop();
        return { status: 200 };
      },
      sleep: async () => {}
    });
    const interruptedRound = await interruptedScheduler.start();
    const interruptedHistory = interruptedStore.snapshot();
    const schedulerOk = Boolean(
      round.ok
        && JSON.stringify(requestOrder) === JSON.stringify(['10.0.0.11', '10.0.0.12', '10.0.0.13'])
        && waits.length === 2
        && waits.every(delayMs => delayMs >= SOURCE_IP_PROBE_BETWEEN_IP_MIN_MS && delayMs <= SOURCE_IP_PROBE_BETWEEN_IP_MAX_MS)
        && scheduledDelay >= SOURCE_IP_PROBE_BETWEEN_ROUND_MIN_MS
        && scheduledDelay <= SOURCE_IP_PROBE_BETWEEN_ROUND_MAX_MS
        && maxActiveRequests === 1
        && completedHistory.schemaVersion === SOURCE_IP_PROBE_SCHEMA_VERSION
        && completedHistory.samples.length === 3
        && completedHistory.lastCompletedRound?.ok === true
        && completedHistory.nextRoundAt === scheduler.status().nextRoundAt
        && restartedRound?.ok === true
        && restartRequestCount === 0
        && restartedNextRoundAt === completedHistory.nextRoundAt
        && initialRound === null
        && initialRequestCount === 0
        && initialDelay >= SOURCE_IP_PROBE_BETWEEN_ROUND_MIN_MS
        && initialDelay <= SOURCE_IP_PROBE_BETWEEN_ROUND_MAX_MS
        && interruptedRound.stopped === true
        && interruptedHistory.samples.length === 0
        && interruptedHistory.lastCompletedRound === null
        && interruptedHistory.nextRoundAt === interruptedNextRoundAt
        && round.results.every(result => (
          result.dnsMs === 1.1
            && result.tcpMs === 2.2
            && result.tlsMs === 3.3
            && result.ttfbMs === 10.4
            && result.totalMs === 11.5
        ))
    );

    const phaseAwareAt = new Date(nowMs - 1000).toISOString();
    const phaseAwareSelection = selectSourceIpsFromProbeHistory({
      samples: [
        { ip: '10.0.0.21', observedAt: phaseAwareAt, status: 200, elapsedMs: 1000, totalMs: 1000, ttfbMs: 50 },
        { ip: '10.0.0.22', observedAt: phaseAwareAt, status: 200, elapsedMs: 100, totalMs: 100, ttfbMs: 80 },
        { ip: '10.0.0.23', observedAt: phaseAwareAt, status: 200, elapsedMs: 90, totalMs: 90, ttfbMs: 90 }
      ]
    }, ['10.0.0.21', '10.0.0.22', '10.0.0.23'], { nowMs, requiredCount: 2 });
    const phaseAwareCandidates = phaseAwareSelection.diagnostics.candidates;
    const phaseAware21 = phaseAwareCandidates.find(candidate => candidate.ip === '10.0.0.21');
    const phaseAware23 = phaseAwareCandidates.find(candidate => candidate.ip === '10.0.0.23');
    const phaseAwareOk = Boolean(
      phaseAwareSelection.ok
        && JSON.stringify(phaseAwareSelection.availableIps) === JSON.stringify(['10.0.0.21', '10.0.0.22'])
        && phaseAware21?.latencySource === 'ttfb'
        && phaseAware21?.latencyMetricMs < phaseAware23?.latencyMetricMs
    );
    return {
      ok: selectionOk && schedulerOk && phaseAwareOk,
      selection: {
        ok: selectionOk,
        selected: selection.availableIps,
        candidateCount: selection.diagnostics.candidates.length,
        retainedSamples: store.snapshot().samples.length
      },
      scheduler: {
        ok: schedulerOk,
        requestOrder,
        waits,
        scheduledDelay,
        maxActiveRequests,
        restartRequestCount,
        initialRequestCount,
        interruptedSampleCount: interruptedHistory.samples.length,
        phaseAwareOk
      }
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  SOURCE_IP_PROBE_BETWEEN_IP_MAX_MS,
  SOURCE_IP_PROBE_BETWEEN_IP_MIN_MS,
  SOURCE_IP_PROBE_BETWEEN_ROUND_MAX_MS,
  SOURCE_IP_PROBE_BETWEEN_ROUND_MIN_MS,
  SOURCE_IP_PROBE_HALF_LIFE_MS,
  SOURCE_IP_PROBE_REQUIRED_COUNT,
  SOURCE_IP_PROBE_RETENTION_MS,
  SOURCE_IP_PROBE_TIMEOUT_MS,
  createSourceIpProbeScheduler,
  createSourceIpProbeStore,
  normalizeProbeHistory,
  normalizeProbeSample,
  readSourceIpProbeHistory,
  runSourceIpProbeSelfTest,
  selectSourceIpsFromProbeHistory,
  sourceIpProbeMetrics,
  writeSourceIpProbeHistory
};
