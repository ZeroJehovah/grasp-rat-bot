'use strict';

const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const net = require('net');
const os = require('os');
const { performance } = require('perf_hooks');

const DEFAULT_SOURCE_IP_INTERFACE = 'enp0s6';
const SOURCE_IP_PREFLIGHT_REQUIRED_COUNT = 3;
const SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS = 10000;
const SOURCE_IP_PREFLIGHT_DEFER_THRESHOLD_MS = 10000;
const SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS = 60 * 60 * 1000;
const SOURCE_IP_PREFLIGHT_RETRY_DELAYS_MS = Object.freeze([10000, 20000, 40000, 80000, 160000]);

function requestTimingNow() {
  return performance.now();
}

function roundRequestTimingMs(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : null;
}

function createRequestTiming(startedAtMs = requestTimingNow()) {
  return {
    startedAtMs,
    lookupAtMs: null,
    connectAtMs: null,
    secureConnectAtMs: null,
    responseAtMs: null,
    endAtMs: null
  };
}

function finiteTimingMark(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requestTimingSnapshot(timing, endAtMs = null) {
  const start = Number(timing?.startedAtMs);
  if (!Number.isFinite(start)) return {};
  const lookupEndMs = finiteTimingMark(timing.lookupAtMs);
  const connectEndMs = finiteTimingMark(timing.connectAtMs);
  const secureConnectEndMs = finiteTimingMark(timing.secureConnectAtMs);
  const responseStartMs = finiteTimingMark(timing.responseAtMs);
  const totalEndMs = finiteTimingMark(endAtMs ?? timing.endAtMs);
  const tcpStartMs = lookupEndMs ?? start;
  const tlsStartMs = connectEndMs ?? lookupEndMs ?? start;
  return {
    dnsMs: lookupEndMs === null ? null : roundRequestTimingMs(lookupEndMs - start),
    tcpMs: connectEndMs === null ? null : roundRequestTimingMs(connectEndMs - tcpStartMs),
    tlsMs: secureConnectEndMs === null ? null : roundRequestTimingMs(secureConnectEndMs - tlsStartMs),
    ttfbMs: responseStartMs === null ? null : roundRequestTimingMs(responseStartMs - start),
    totalMs: totalEndMs === null ? null : roundRequestTimingMs(totalEndMs - start)
  };
}

function attachRequestTiming(request, timing) {
  request.once?.('socket', socket => {
    socket.once?.('lookup', () => {
      if (timing.lookupAtMs === null) timing.lookupAtMs = requestTimingNow();
    });
    socket.once?.('connect', () => {
      if (timing.connectAtMs === null) timing.connectAtMs = requestTimingNow();
    });
    socket.once?.('secureConnect', () => {
      if (timing.secureConnectAtMs === null) timing.secureConnectAtMs = requestTimingNow();
    });
  });
}

function uniqueIpv4(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const ip = String(value || '').trim();
    if (net.isIP(ip) !== 4 || seen.has(ip)) continue;
    seen.add(ip);
    output.push(ip);
  }
  return output;
}

function ipv4NumericValue(value) {
  const ip = String(value || '').trim();
  if (net.isIP(ip) !== 4) return Number.POSITIVE_INFINITY;
  const octets = ip.split('.').map(Number);
  return octets[0] * 0x1000000 + octets[1] * 0x10000 + octets[2] * 0x100 + octets[3];
}

function compareIpv4Numeric(left, right) {
  return ipv4NumericValue(left) - ipv4NumericValue(right);
}

function discoverInterfaceIpv4(interfaceName = DEFAULT_SOURCE_IP_INTERFACE, networkInterfaces = os.networkInterfaces) {
  const interfaces = typeof networkInterfaces === 'function' ? networkInterfaces() : (networkInterfaces || {});
  const addresses = Array.isArray(interfaces?.[interfaceName]) ? interfaces[interfaceName] : [];
  return uniqueIpv4(addresses
    .filter(address => (address?.family === 'IPv4' || address?.family === 4) && address?.address)
    .map(address => address.address))
    .sort(compareIpv4Numeric);
}

function normalizeSourceIpRisk(value = {}) {
  const output = {};
  for (const [rawIp, rawRecord] of Object.entries(value && typeof value === 'object' ? value : {})) {
    const ip = String(rawRecord?.ip || rawIp || '').trim();
    const firstObserved403At = String(rawRecord?.firstObserved403At || '').trim();
    if (net.isIP(ip) !== 4 || !Number.isFinite(Date.parse(firstObserved403At))) continue;
    output[ip] = { ip, firstObserved403At };
  }
  return output;
}

function recordSourceIp403(value, ip, observedAt) {
  const risk = normalizeSourceIpRisk(value);
  const normalizedIp = String(ip || '').trim();
  if (net.isIP(normalizedIp) !== 4 || risk[normalizedIp]) return risk;
  const at = String(observedAt || '').trim();
  risk[normalizedIp] = {
    ip: normalizedIp,
    firstObserved403At: Number.isFinite(Date.parse(at)) ? at : new Date().toISOString()
  };
  return risk;
}

function clearSourceIpRisk(value, ip) {
  const risk = normalizeSourceIpRisk(value);
  delete risk[String(ip || '').trim()];
  return risk;
}

function buildSourceIpPreflightQueues(discoveredIps, sourceIpRisk = {}) {
  const discovered = uniqueIpv4(discoveredIps).sort(compareIpv4Numeric);
  const risk = normalizeSourceIpRisk(sourceIpRisk);
  const ordinaryIps = discovered.filter(ip => !risk[ip]);
  const riskIps = discovered
    .filter(ip => Boolean(risk[ip]))
    .sort((left, right) => {
      const timeDelta = Date.parse(risk[left].firstObserved403At) - Date.parse(risk[right].firstObserved403At);
      return timeDelta || compareIpv4Numeric(left, right);
    });
  return { discoveredIps: discovered, ordinaryIps, riskIps };
}

function normalizeGameRootUrl(gameOrigin) {
  const url = new URL(String(gameOrigin || ''));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported game origin protocol: ${url.protocol}`);
  }
  url.username = '';
  url.password = '';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function buildAnonymousRootRequest(gameOrigin, localAddress, timeoutMs = SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS) {
  const url = normalizeGameRootUrl(gameOrigin);
  const sourceIp = String(localAddress || '').trim();
  if (net.isIP(sourceIp) !== 4) throw new Error(`invalid local source IPv4: ${sourceIp || 'missing'}`);
  return {
    url,
    options: {
      method: 'GET',
      localAddress: sourceIp,
      family: 4,
      agent: false,
      timeout: Math.max(1, Number(timeoutMs || SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS)),
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        connection: 'close'
      }
    }
  };
}

function requestAnonymousGameRoot(gameOrigin, localAddress, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs || SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS));
  const requestShape = buildAnonymousRootRequest(gameOrigin, localAddress, timeoutMs);
  const requestFactory = options.requestFactory
    || (requestShape.url.protocol === 'http:' ? http.request : https.request);
  const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
  const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
  return new Promise((resolve, reject) => {
    let settled = false;
    let request = null;
    let hardTimeout = null;
    const timing = createRequestTiming();
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      if (hardTimeout !== null) clearTimer(hardTimeout);
      if (value && typeof value === 'object' && !value.timing) {
        value.timing = requestTimingSnapshot(timing, timing.endAtMs ?? requestTimingNow());
      }
      handler(value);
    };
    const abortForTimeout = () => {
      const error = new Error('source IP preflight request timeout');
      error.code = 'ETIMEDOUT';
      finish(reject, error);
      request?.destroy?.(error);
    };
    request = requestFactory(requestShape.url, requestShape.options, response => {
      if (timing.responseAtMs === null) timing.responseAtMs = requestTimingNow();
      const status = Number(response?.statusCode || 0);
      response.on?.('error', error => finish(reject, error));
      response.on?.('end', () => {
        if (timing.endAtMs === null) timing.endAtMs = requestTimingNow();
        finish(resolve, { status });
      });
      response.resume?.();
    });
    attachRequestTiming(request, timing);
    request.once?.('error', error => finish(reject, error));
    request.setTimeout?.(timeoutMs, abortForTimeout);
    hardTimeout = setTimer(abortForTimeout, timeoutMs);
    if (settled && hardTimeout !== null) clearTimer(hardTimeout);
    request.end?.();
  });
}

function sourceIpPreflightErrorCategory(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || /timeout|timed out/i.test(message)) return 'timeout';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'dns';
  if (/^(?:ERR_TLS|CERT_|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED)/.test(code) || /tls|certificate|ssl/i.test(message)) return 'tls';
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL'].includes(code)) return 'connect';
  return 'network';
}

function sourceIpPreflightRetryDelayMs(failedAttempt) {
  const attempt = Math.max(1, Math.round(Number(failedAttempt || 1)));
  return SOURCE_IP_PREFLIGHT_RETRY_DELAYS_MS[
    Math.min(SOURCE_IP_PREFLIGHT_RETRY_DELAYS_MS.length - 1, attempt - 1)
  ];
}

function defaultSourceIpPreflightStatus() {
  return {
    phase: 'idle',
    reason: '',
    queuePhase: '',
    startedAt: '',
    completedAt: '',
    elapsedMs: 0,
    discoveredCount: 0,
    ordinaryQueueCount: 0,
    riskQueueCount: 0,
    testedCount: 0,
    requestCount: 0,
    currentIp: '',
    currentAttempt: 0,
    lastStatus: null,
    lastErrorCategory: '',
    availableIps: [],
    availableCount: 0,
    requiredCount: SOURCE_IP_PREFLIGHT_REQUIRED_COUNT,
    riskCount: 0,
    nextRetryAt: '',
    deferredForNextLoginPoint: false,
    deferredAt: '',
    reuseWithoutRetest: false,
    reusedAt: ''
  };
}

function normalizeSourceIpPreflight(value = {}, riskCount = undefined) {
  const input = value && typeof value === 'object' ? value : {};
  const status = defaultSourceIpPreflightStatus();
  status.phase = String(input.phase || status.phase).slice(0, 48);
  status.reason = String(input.reason || '').slice(0, 120);
  status.queuePhase = String(input.queuePhase || '').slice(0, 32);
  for (const key of ['startedAt', 'completedAt', 'nextRetryAt', 'deferredAt', 'reusedAt']) {
    const text = String(input[key] || '');
    status[key] = Number.isFinite(Date.parse(text)) ? text : '';
  }
  for (const key of [
    'elapsedMs',
    'discoveredCount',
    'ordinaryQueueCount',
    'riskQueueCount',
    'testedCount',
    'requestCount',
    'currentAttempt'
  ]) {
    status[key] = Math.max(0, Math.round(Number(input[key] || 0)));
  }
  status.currentIp = net.isIP(String(input.currentIp || '').trim()) === 4
    ? String(input.currentIp).trim()
    : '';
  const lastStatus = Number(input.lastStatus);
  status.lastStatus = Number.isFinite(lastStatus) && lastStatus > 0 ? Math.round(lastStatus) : null;
  status.lastErrorCategory = String(input.lastErrorCategory || '').slice(0, 48);
  status.availableIps = uniqueIpv4(input.availableIps).slice(0, SOURCE_IP_PREFLIGHT_REQUIRED_COUNT);
  status.availableCount = status.availableIps.length;
  status.requiredCount = SOURCE_IP_PREFLIGHT_REQUIRED_COUNT;
  const explicitRiskCount = riskCount === undefined || riskCount === null
    ? Number.NaN
    : Number(riskCount);
  const effectiveRiskCount = Number.isFinite(explicitRiskCount)
    ? explicitRiskCount
    : Number(input.riskCount || 0);
  status.riskCount = Math.max(0, Math.round(Number.isFinite(effectiveRiskCount) ? effectiveRiskCount : 0));
  status.deferredForNextLoginPoint = input.deferredForNextLoginPoint === true;
  status.reuseWithoutRetest = input.reuseWithoutRetest === true;
  return status;
}

function reusableSourceIpPreflight(state = {}) {
  const network = state?.network && typeof state.network === 'object' ? state.network : {};
  const lifecycleSourceIps = uniqueIpv4(network.lifecycleSourceIps);
  const sourceIpPreflight = normalizeSourceIpPreflight(
    network.sourceIpPreflight,
    Object.keys(normalizeSourceIpRisk(network.sourceIpRisk)).length
  );
  if (
    lifecycleSourceIps.length !== SOURCE_IP_PREFLIGHT_REQUIRED_COUNT
    || sourceIpPreflight.reuseWithoutRetest !== true
    || !['deferred', 'snapshot-wait'].includes(sourceIpPreflight.phase)
  ) {
    return null;
  }
  return { lifecycleSourceIps, sourceIpPreflight };
}

function interruptionReason(shouldInterrupt) {
  if (typeof shouldInterrupt !== 'function') return '';
  const value = shouldInterrupt();
  if (!value) return '';
  return typeof value === 'string' ? value : 'interrupted';
}

async function runSourceIpPreflight(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const monotonicNow = typeof options.monotonicNow === 'function' ? options.monotonicNow : () => performance.now();
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  const request = typeof options.request === 'function'
    ? options.request
    : (gameOrigin, ip, requestOptions) => requestAnonymousGameRoot(gameOrigin, ip, requestOptions);
  const persistNetwork = typeof options.persistNetwork === 'function' ? options.persistNetwork : async () => null;
  const commitLifecycle = typeof options.commitLifecycle === 'function'
    ? options.commitLifecycle
    : async (ips, patch) => persistNetwork({
        ...patch,
        sourceIp: ips[0] || '',
        sourceIps: ips,
        lifecycleSourceIps: ips,
        lifecycleSourceIpIndex: 0,
        lifecyclePreparedAt: ips.length ? patch?.sourceIpPreflight?.completedAt || new Date(now()).toISOString() : ''
      });
  const clearLifecycle = typeof options.clearLifecycle === 'function'
    ? options.clearLifecycle
    : async patch => persistNetwork({
        ...patch,
        sourceIps: [],
        lifecycleSourceIps: [],
        lifecycleSourceIpIndex: 0,
        lifecyclePreparedAt: ''
      });
  const log = typeof options.log === 'function' ? options.log : () => {};
  const requiredCount = SOURCE_IP_PREFLIGHT_REQUIRED_COUNT;
  const startedAtMs = now();
  const startedMonotonicMs = monotonicNow();
  const initialNetwork = options.state?.network || {};
  let risk = normalizeSourceIpRisk(initialNetwork.sourceIpRisk);
  const queues = buildSourceIpPreflightQueues(
    typeof options.discoverIps === 'function'
      ? options.discoverIps()
      : discoverInterfaceIpv4(options.interfaceName || DEFAULT_SOURCE_IP_INTERFACE, options.networkInterfaces),
    risk
  );
  const availableIps = [];
  const testedIps = new Set();
  let requestCount = 0;
  let status = normalizeSourceIpPreflight({
    phase: 'testing',
    reason: 'testing-non-risk-ip',
    queuePhase: 'non-risk',
    startedAt: new Date(startedAtMs).toISOString(),
    discoveredCount: queues.discoveredIps.length,
    ordinaryQueueCount: queues.ordinaryIps.length,
    riskQueueCount: queues.riskIps.length,
    availableIps,
    requiredCount,
    riskCount: Object.keys(risk).length
  }, Object.keys(risk).length);

  const elapsedMs = () => Math.max(0, Math.round(monotonicNow() - startedMonotonicMs));
  const updateStatus = async patch => {
    status = normalizeSourceIpPreflight({
      ...status,
      ...patch,
      elapsedMs: elapsedMs(),
      testedCount: testedIps.size,
      requestCount,
      availableIps,
      riskCount: Object.keys(risk).length
    }, Object.keys(risk).length);
    await persistNetwork({ sourceIpRisk: risk, sourceIpPreflight: status });
    return status;
  };
  const interrupt = async reason => {
    await clearLifecycle({
      sourceIpRisk: risk,
      sourceIpPreflight: {
        ...status,
        phase: 'interrupted',
        reason: reason || 'interrupted',
        completedAt: new Date(now()).toISOString(),
        elapsedMs: elapsedMs(),
        nextRetryAt: '',
        reuseWithoutRetest: false,
        deferredForNextLoginPoint: false
      }
    });
    log('source-ip-preflight-interrupted', {
      reason: reason || 'interrupted',
      testedCount: testedIps.size,
      requestCount,
      availableCount: availableIps.length
    });
    return {
      ok: false,
      interrupted: true,
      reason: reason || 'interrupted',
      availableIps: availableIps.slice(),
      sourceIpRisk: risk,
      sourceIpPreflight: normalizeSourceIpPreflight({
        ...status,
        phase: 'interrupted',
        reason: reason || 'interrupted',
        completedAt: new Date(now()).toISOString(),
        elapsedMs: elapsedMs()
      }, Object.keys(risk).length)
    };
  };

  await clearLifecycle({ sourceIpRisk: risk, sourceIpPreflight: status });
  log('source-ip-preflight-start', {
    interfaceName: options.interfaceName || DEFAULT_SOURCE_IP_INTERFACE,
    discoveredCount: queues.discoveredIps.length,
    ordinaryQueueCount: queues.ordinaryIps.length,
    riskQueueCount: queues.riskIps.length,
    requiredCount
  });

  const testQueue = async (ips, queuePhase) => {
    for (const ip of ips) {
      if (availableIps.length >= requiredCount) break;
      if (testedIps.has(ip)) continue;
      let attempt = 0;
      while (true) {
        const beforeAttemptInterrupt = interruptionReason(options.shouldInterrupt);
        if (beforeAttemptInterrupt) return { interrupted: beforeAttemptInterrupt };
        attempt += 1;
        await updateStatus({
          phase: 'testing',
          reason: queuePhase === 'risk' ? 'testing-risk-ip' : 'testing-non-risk-ip',
          queuePhase,
          currentIp: ip,
          currentAttempt: attempt,
          lastStatus: null,
          lastErrorCategory: '',
          nextRetryAt: ''
        });
        requestCount += 1;
        let response = null;
        let requestError = null;
        let statusCode = 0;
        try {
          response = await request(options.gameOrigin, ip, {
            timeoutMs: options.requestTimeoutMs || SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS
          });
          statusCode = Number(response?.status || response?.statusCode || 0);
        } catch (error) {
          requestError = error;
        }

        if (!requestError && statusCode === 200) {
          const wasRisk = Boolean(risk[ip]);
          if (wasRisk) {
            risk = clearSourceIpRisk(risk, ip);
            log('source-ip-risk-cleared', { ip, queuePhase, attempt });
          }
          testedIps.add(ip);
          if (!availableIps.includes(ip)) availableIps.push(ip);
          await updateStatus({
            phase: 'testing',
            reason: 'source-ip-available',
            queuePhase,
            currentIp: ip,
            currentAttempt: attempt,
            lastStatus: 200,
            lastErrorCategory: '',
            nextRetryAt: ''
          });
          log('source-ip-preflight-result', {
            ip,
            queuePhase,
            attempt,
            status: 200,
            availableCount: availableIps.length,
            requiredCount,
            riskCleared: wasRisk
          });
          break;
        }

        if (!requestError && statusCode === 403) {
          const wasRisk = Boolean(risk[ip]);
          const firstObserved403At = wasRisk
            ? risk[ip].firstObserved403At
            : new Date(now()).toISOString();
          risk = recordSourceIp403(risk, ip, firstObserved403At);
          testedIps.add(ip);
          await updateStatus({
            phase: 'testing',
            reason: 'source-ip-risk-403',
            queuePhase,
            currentIp: ip,
            currentAttempt: attempt,
            lastStatus: 403,
            lastErrorCategory: '',
            nextRetryAt: ''
          });
          if (!wasRisk) {
            log('source-ip-risk-added', { ip, firstObserved403At, queuePhase, attempt });
          }
          log('source-ip-preflight-result', {
            ip,
            queuePhase,
            attempt,
            status: 403,
            availableCount: availableIps.length,
            requiredCount,
            firstObserved403At
          });
          break;
        }

        const errorCategory = requestError
          ? sourceIpPreflightErrorCategory(requestError)
          : 'http-status';
        const retryDelayMs = sourceIpPreflightRetryDelayMs(attempt);
        const nextRetryAt = new Date(now() + retryDelayMs).toISOString();
        await updateStatus({
          phase: 'retry-wait',
          reason: 'source-ip-preflight-temporary-error',
          queuePhase,
          currentIp: ip,
          currentAttempt: attempt,
          lastStatus: requestError ? null : statusCode,
          lastErrorCategory: errorCategory,
          nextRetryAt
        });
        log('source-ip-preflight-retry', {
          ip,
          queuePhase,
          attempt,
          status: requestError ? null : statusCode,
          errorCategory,
          retryDelayMs,
          nextRetryAt
        });
        const waitResult = await sleep(retryDelayMs);
        const afterWaitInterrupt = waitResult?.interrupted
          ? String(waitResult.reason || 'interrupted')
          : interruptionReason(options.shouldInterrupt);
        if (afterWaitInterrupt) return { interrupted: afterWaitInterrupt };
      }
    }
    return { interrupted: '' };
  };

  const ordinaryResult = await testQueue(queues.ordinaryIps, 'non-risk');
  if (ordinaryResult.interrupted) return interrupt(ordinaryResult.interrupted);
  if (availableIps.length < requiredCount) {
    const riskResult = await testQueue(queues.riskIps, 'risk');
    if (riskResult.interrupted) return interrupt(riskResult.interrupted);
  }

  const completedAt = new Date(now()).toISOString();
  const finalElapsedMs = elapsedMs();
  if (availableIps.length === requiredCount) {
    const deferredForNextLoginPoint = finalElapsedMs > Number(
      options.deferThresholdMs ?? SOURCE_IP_PREFLIGHT_DEFER_THRESHOLD_MS
    );
    status = normalizeSourceIpPreflight({
      ...status,
      phase: deferredForNextLoginPoint ? 'deferred' : 'ready',
      reason: deferredForNextLoginPoint
        ? 'source-ip-preflight-deferred-next-login-point'
        : 'source-ip-preflight-ready',
      completedAt,
      elapsedMs: finalElapsedMs,
      testedCount: testedIps.size,
      requestCount,
      currentIp: availableIps[availableIps.length - 1],
      availableIps,
      nextRetryAt: '',
      deferredForNextLoginPoint,
      deferredAt: deferredForNextLoginPoint ? completedAt : '',
      reuseWithoutRetest: deferredForNextLoginPoint,
      reusedAt: ''
    }, Object.keys(risk).length);
    await commitLifecycle(availableIps.slice(), {
      sourceIpRisk: risk,
      sourceIpPreflight: status
    });
    log('source-ip-preflight-selected', {
      sourceIps: availableIps.slice(),
      elapsedMs: finalElapsedMs,
      testedCount: testedIps.size,
      requestCount,
      deferredForNextLoginPoint
    });
    if (deferredForNextLoginPoint) {
      log('source-ip-preflight-deferred', {
        sourceIps: availableIps.slice(),
        elapsedMs: finalElapsedMs,
        deferredAt: completedAt
      });
    }
    return {
      ok: true,
      reused: false,
      deferredForNextLoginPoint,
      availableIps: availableIps.slice(),
      sourceIpRisk: risk,
      sourceIpPreflight: status
    };
  }

  status = normalizeSourceIpPreflight({
    ...status,
    phase: 'insufficient',
    reason: 'source-ip-preflight-insufficient',
    completedAt,
    elapsedMs: finalElapsedMs,
    testedCount: testedIps.size,
    requestCount,
    availableIps,
    nextRetryAt: '',
    deferredForNextLoginPoint: false,
    deferredAt: '',
    reuseWithoutRetest: false,
    reusedAt: ''
  }, Object.keys(risk).length);
  await clearLifecycle({ sourceIpRisk: risk, sourceIpPreflight: status });
  log('source-ip-preflight-insufficient', {
    availableCount: availableIps.length,
    requiredCount,
    discoveredCount: queues.discoveredIps.length,
    testedCount: testedIps.size,
    requestCount,
    elapsedMs: finalElapsedMs,
    cooldownMs: SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS
  });
  return {
    ok: false,
    insufficient: true,
    reason: 'source-ip-preflight-insufficient',
    availableIps: availableIps.slice(),
    sourceIpRisk: risk,
    sourceIpPreflight: status,
    cooldownMs: SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS
  };
}

async function ensureSourceIpPreflight(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const state = typeof options.readState === 'function' ? options.readState() : (options.state || {});
  const reusable = reusableSourceIpPreflight(state);
  if (!reusable) return runSourceIpPreflight({ ...options, state });
  const sourceIpPreflight = normalizeSourceIpPreflight({
    ...reusable.sourceIpPreflight,
    phase: 'ready',
    reason: 'source-ip-preflight-reused-without-retest',
    deferredForNextLoginPoint: false,
    reusedAt: new Date(now()).toISOString(),
    reuseWithoutRetest: false
  }, reusable.sourceIpPreflight.riskCount);
  if (typeof options.persistNetwork === 'function') {
    await options.persistNetwork({ sourceIpPreflight });
  }
  if (typeof options.log === 'function') {
    options.log('source-ip-preflight-reused', {
      sourceIps: reusable.lifecycleSourceIps.slice(),
      originalCompletedAt: reusable.sourceIpPreflight.completedAt || '',
      originalElapsedMs: reusable.sourceIpPreflight.elapsedMs,
      reusedAt: sourceIpPreflight.reusedAt,
      requestCount: 0
    });
  }
  return {
    ok: true,
    reused: true,
    deferredForNextLoginPoint: false,
    availableIps: reusable.lifecycleSourceIps.slice(),
    sourceIpRisk: normalizeSourceIpRisk(state?.network?.sourceIpRisk),
    sourceIpPreflight,
    requestCount: 0
  };
}

async function runSourceIpPreflightSelfTest() {
  const sorted = uniqueIpv4(['10.0.0.10', '10.0.0.9', '10.0.0.10', 'bad']).sort(compareIpv4Numeric);
  const discovered = discoverInterfaceIpv4('enp0s6', () => ({
    enp0s6: [
      { family: 'IPv4', address: '10.0.0.10' },
      { family: 4, address: '10.0.0.9' },
      { family: 'IPv6', address: 'fd00::1' },
      { family: 'IPv4', address: '10.0.0.10' }
    ],
    eth0: [{ family: 'IPv4', address: '192.0.2.1' }]
  }));
  const requestShape = buildAnonymousRootRequest('https://user:secret@game.example/path?token=secret#fragment', '10.0.0.9');
  const headerKeys = Object.keys(requestShape.options.headers).map(key => key.toLowerCase());
  const requestShapeOk = Boolean(
    requestShape.url.toString() === 'https://game.example/'
      && requestShape.options.method === 'GET'
      && requestShape.options.localAddress === '10.0.0.9'
      && requestShape.options.agent === false
      && !headerKeys.includes('cookie')
      && !headerKeys.includes('authorization')
      && !headerKeys.some(key => /token|session|user/.test(key))
  );
  let requestFactoryCalls = 0;
  let requestEndArgumentCount = -1;
  let capturedRequestUrl = '';
  let capturedRequestOptions = null;
  const redirectResponse = await requestAnonymousGameRoot(
    'https://user:secret@game.example/path?token=secret#fragment',
    '10.0.0.9',
    {
      requestFactory: (url, requestOptions, onResponse) => {
        requestFactoryCalls += 1;
        capturedRequestUrl = url.toString();
        capturedRequestOptions = requestOptions;
        const request = new EventEmitter();
        const socket = new EventEmitter();
        request.setTimeout = () => {};
        request.destroy = error => request.emit('error', error);
        request.end = (...args) => {
          requestEndArgumentCount = args.length;
          request.emit('socket', socket);
          socket.emit('lookup');
          socket.emit('connect');
          socket.emit('secureConnect');
          const response = new EventEmitter();
          response.statusCode = 302;
          response.resume = () => {};
          queueMicrotask(() => {
            onResponse(response);
            response.emit('end');
          });
        };
        return request;
      }
    }
  );
  const requestExecutionOk = Boolean(
    redirectResponse.status === 302
      && requestFactoryCalls === 1
      && requestEndArgumentCount === 0
      && capturedRequestUrl === 'https://game.example/'
      && capturedRequestOptions?.method === 'GET'
      && capturedRequestOptions?.localAddress === '10.0.0.9'
      && !Object.keys(capturedRequestOptions?.headers || {}).some(key => /cookie|authorization|token|session|user/i.test(key))
      && Number.isFinite(redirectResponse.timing?.dnsMs)
      && Number.isFinite(redirectResponse.timing?.tcpMs)
      && Number.isFinite(redirectResponse.timing?.tlsMs)
      && Number.isFinite(redirectResponse.timing?.ttfbMs)
      && Number.isFinite(redirectResponse.timing?.totalMs)
      && redirectResponse.timing.totalMs >= redirectResponse.timing.ttfbMs
  );
  let hardTimeoutCategory = '';
  let hardTimeoutTiming = null;
  try {
    await requestAnonymousGameRoot('https://game.example', '10.0.0.9', {
      timeoutMs: 5,
      requestFactory: () => {
        const request = new EventEmitter();
        request.setTimeout = () => {};
        request.destroy = () => {};
        request.end = () => {};
        return request;
      }
    });
  } catch (error) {
    hardTimeoutCategory = sourceIpPreflightErrorCategory(error);
    hardTimeoutTiming = error.timing || null;
  }
  const hardTimeoutOk = hardTimeoutCategory === 'timeout';
  const hardTimeoutTimingOk = Boolean(
    hardTimeoutTiming
      && hardTimeoutTiming.dnsMs === null
      && hardTimeoutTiming.tcpMs === null
      && hardTimeoutTiming.tlsMs === null
      && hardTimeoutTiming.ttfbMs === null
      && Number.isFinite(hardTimeoutTiming.totalMs)
  );
  const clearedRiskCountOk = normalizeSourceIpPreflight({ riskCount: 7 }, 0).riskCount === 0;

  let wallMs = Date.UTC(2026, 7, 2, 0, 0, 0);
  let monoMs = 0;
  let network = {
    sourceIpRisk: {
      '10.0.0.11': { ip: '10.0.0.11', firstObserved403At: '2026-08-01T00:00:00.000Z' },
      '10.0.0.12': { ip: '10.0.0.12', firstObserved403At: '2026-08-01T01:00:00.000Z' },
      '10.0.0.200': { ip: '10.0.0.200', firstObserved403At: '2026-07-01T00:00:00.000Z' }
    }
  };
  const requestOrder = [];
  const logs = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const applyNetworkPatch = patch => {
    network = { ...network, ...JSON.parse(JSON.stringify(patch || {})) };
  };
  const immediate = await ensureSourceIpPreflight({
    gameOrigin: 'https://game.example',
    state: { network },
    now: () => wallMs,
    monotonicNow: () => monoMs,
    discoverIps: () => ['10.0.0.13', '10.0.0.12', '10.0.0.11', '10.0.0.10', '10.0.0.9'],
    request: async (_origin, ip) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      requestOrder.push(ip);
      wallMs += 100;
      monoMs += 100;
      await Promise.resolve();
      activeRequests -= 1;
      return { status: ({
        '10.0.0.9': 403,
        '10.0.0.10': 200,
        '10.0.0.13': 200,
        '10.0.0.11': 200
      })[ip] || 403 };
    },
    persistNetwork: async patch => applyNetworkPatch(patch),
    commitLifecycle: async (ips, patch) => applyNetworkPatch({
      ...patch,
      sourceIp: ips[0],
      sourceIps: ips,
      lifecycleSourceIps: ips,
      lifecycleSourceIpIndex: 0,
      lifecyclePreparedAt: patch.sourceIpPreflight.completedAt
    }),
    clearLifecycle: async patch => applyNetworkPatch({
      ...patch,
      sourceIps: [],
      lifecycleSourceIps: [],
      lifecycleSourceIpIndex: 0,
      lifecyclePreparedAt: ''
    }),
    log: (type, detail) => logs.push({ type, detail })
  });
  const immediateRisk = normalizeSourceIpRisk(network.sourceIpRisk);
  const immediateOk = Boolean(
    immediate.ok
      && !immediate.deferredForNextLoginPoint
      && JSON.stringify(requestOrder) === JSON.stringify(['10.0.0.9', '10.0.0.10', '10.0.0.13', '10.0.0.11'])
      && JSON.stringify(immediate.availableIps) === JSON.stringify(['10.0.0.10', '10.0.0.13', '10.0.0.11'])
      && immediateRisk['10.0.0.9']
      && !immediateRisk['10.0.0.11']
      && immediateRisk['10.0.0.12']
      && immediateRisk['10.0.0.200']
      && maxActiveRequests === 1
      && !requestOrder.includes('10.0.0.12')
  );
  const immediateReuseBlocked = reusableSourceIpPreflight({ network }) === null;

  wallMs = Date.UTC(2026, 7, 2, 1, 0, 0);
  monoMs = 0;
  let retryNetwork = {};
  const retryWaits = [];
  const retryOrder = [];
  let firstIpAttempt = 0;
  const retryResult = await runSourceIpPreflight({
    gameOrigin: 'https://game.example',
    state: { network: retryNetwork },
    now: () => wallMs,
    monotonicNow: () => monoMs,
    discoverIps: () => ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'],
    request: async (_origin, ip) => {
      retryOrder.push(ip);
      monoMs += 25;
      wallMs += 25;
      if (ip === '10.0.0.1') {
        firstIpAttempt += 1;
        if (firstIpAttempt <= 6) return { status: 503 };
      }
      return { status: 200 };
    },
    sleep: async ms => {
      retryWaits.push(ms);
      monoMs += ms;
      wallMs += ms;
    },
    persistNetwork: async patch => { retryNetwork = { ...retryNetwork, ...JSON.parse(JSON.stringify(patch)) }; },
    commitLifecycle: async (ips, patch) => {
      retryNetwork = { ...retryNetwork, ...JSON.parse(JSON.stringify(patch)), lifecycleSourceIps: ips, sourceIps: ips, sourceIp: ips[0] };
    },
    clearLifecycle: async patch => {
      retryNetwork = { ...retryNetwork, ...JSON.parse(JSON.stringify(patch)), lifecycleSourceIps: [], sourceIps: [] };
    }
  });
  const retryOk = Boolean(
    retryResult.ok
      && retryResult.deferredForNextLoginPoint
      && JSON.stringify(retryWaits) === JSON.stringify([10000, 20000, 40000, 80000, 160000, 160000])
      && retryOrder.slice(0, 7).every(ip => ip === '10.0.0.1')
      && JSON.stringify(retryOrder.slice(7)) === JSON.stringify(['10.0.0.2', '10.0.0.3'])
      && retryNetwork.sourceIpPreflight.phase === 'deferred'
      && retryNetwork.sourceIpPreflight.reuseWithoutRetest === true
  );
  const requestsBeforeDeferredReuse = retryOrder.length;
  const reused = await ensureSourceIpPreflight({
    state: { network: retryNetwork },
    now: () => wallMs,
    readState: () => ({ network: retryNetwork }),
    request: async () => {
      retryOrder.push('unexpected-retest');
      return { status: 200 };
    },
    persistNetwork: async patch => {
      retryNetwork = { ...retryNetwork, ...JSON.parse(JSON.stringify(patch)) };
    },
    log: (type, detail) => logs.push({ type, detail })
  });
  const reuseOk = Boolean(
    reused.ok
      && reused.reused
      && retryOrder.length === requestsBeforeDeferredReuse
      && JSON.stringify(reused.availableIps) === JSON.stringify(retryResult.availableIps)
      && retryNetwork.sourceIpPreflight.reuseWithoutRetest === false
  );

  let insufficientNetwork = {};
  const insufficient = await runSourceIpPreflight({
    gameOrigin: 'https://game.example',
    state: { network: insufficientNetwork },
    now: () => wallMs,
    monotonicNow: () => monoMs,
    discoverIps: () => ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
    request: async (_origin, ip) => ({ status: ip === '10.0.0.1' || ip === '10.0.0.2' ? 200 : 403 }),
    persistNetwork: async patch => { insufficientNetwork = { ...insufficientNetwork, ...JSON.parse(JSON.stringify(patch)) }; },
    clearLifecycle: async patch => {
      insufficientNetwork = { ...insufficientNetwork, ...JSON.parse(JSON.stringify(patch)), lifecycleSourceIps: [], sourceIps: [] };
    }
  });
  const insufficientOk = Boolean(
    !insufficient.ok
      && insufficient.insufficient
      && insufficient.availableIps.length === 2
      && insufficient.cooldownMs === SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS
      && insufficientNetwork.sourceIpPreflight.phase === 'insufficient'
      && insufficientNetwork.lifecycleSourceIps.length === 0
  );

  const stableAt = '2026-08-01T00:00:00.000Z';
  const laterAt = '2026-08-02T00:00:00.000Z';
  const firstRisk = recordSourceIp403({}, '10.0.0.5', stableAt);
  const repeatedRisk = recordSourceIp403(firstRisk, '10.0.0.5', laterAt);
  const clearedRisk = clearSourceIpRisk(repeatedRisk, '10.0.0.5');
  const nextCycleRisk = recordSourceIp403(clearedRisk, '10.0.0.5', laterAt);
  const riskCycleOk = Boolean(
    repeatedRisk['10.0.0.5'].firstObserved403At === stableAt
      && nextCycleRisk['10.0.0.5'].firstObserved403At === laterAt
  );

  return {
    ok: Boolean(
      JSON.stringify(sorted) === JSON.stringify(['10.0.0.9', '10.0.0.10'])
        && JSON.stringify(discovered) === JSON.stringify(['10.0.0.9', '10.0.0.10'])
        && requestShapeOk
        && requestExecutionOk
        && hardTimeoutOk
        && hardTimeoutTimingOk
        && clearedRiskCountOk
        && immediateOk
        && immediateReuseBlocked
        && reuseOk
        && retryOk
        && insufficientOk
        && riskCycleOk
    ),
    numericSort: sorted,
    interfaceDiscovery: discovered,
    requestShapeOk,
    requestExecutionOk,
    hardTimeoutOk,
    hardTimeoutTimingOk,
    clearedRiskCountOk,
    immediate: {
      ok: immediateOk,
      requestOrder,
      availableIps: immediate.availableIps,
      riskCount: Object.keys(immediateRisk).length,
      maxActiveRequests
    },
    immediateReuseBlocked,
    reuse: { ok: reuseOk, requestCount: retryOrder.length - requestsBeforeDeferredReuse },
    retry: {
      ok: retryOk,
      waits: retryWaits,
      requestOrder: retryOrder,
      deferred: retryResult.deferredForNextLoginPoint
    },
    insufficient: {
      ok: insufficientOk,
      availableCount: insufficient.availableIps.length,
      cooldownMs: insufficient.cooldownMs
    },
    riskCycleOk,
    logTypes: Array.from(new Set(logs.map(item => item.type)))
  };
}

module.exports = {
  DEFAULT_SOURCE_IP_INTERFACE,
  SOURCE_IP_PREFLIGHT_DEFER_THRESHOLD_MS,
  SOURCE_IP_PREFLIGHT_INSUFFICIENT_COOLDOWN_MS,
  SOURCE_IP_PREFLIGHT_REQUEST_TIMEOUT_MS,
  SOURCE_IP_PREFLIGHT_REQUIRED_COUNT,
  SOURCE_IP_PREFLIGHT_RETRY_DELAYS_MS,
  buildAnonymousRootRequest,
  buildSourceIpPreflightQueues,
  clearSourceIpRisk,
  compareIpv4Numeric,
  defaultSourceIpPreflightStatus,
  discoverInterfaceIpv4,
  ensureSourceIpPreflight,
  ipv4NumericValue,
  normalizeGameRootUrl,
  normalizeSourceIpPreflight,
  normalizeSourceIpRisk,
  recordSourceIp403,
  requestAnonymousGameRoot,
  reusableSourceIpPreflight,
  runSourceIpPreflight,
  runSourceIpPreflightSelfTest,
  sourceIpPreflightErrorCategory,
  sourceIpPreflightRetryDelayMs,
  uniqueIpv4
};
