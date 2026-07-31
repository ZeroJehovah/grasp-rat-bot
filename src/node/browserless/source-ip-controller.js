'use strict';

const os = require('os');
const {
  fetchWithTimeout,
  requestAuthUrl,
  submitCallbackInput
} = require('./session-client');
const {
  leaveWithVerification
} = require('./leave-client');
const {
  createWebSocketConnectAbortError,
  isWebSocketConnectAbortError,
  openBrowserlessWs
} = require('./ws-transport');
const {
  readBrowserlessStateFile,
  updateBrowserlessStateFile
} = require('./state-file');
const {
  createCloudflareChallengeError,
  cloudflareChallengeFailure,
  detectCloudflareChallenge
} = require('./cloudflare-challenge');

const MAX_LEAVE_SOURCE_IP_SWITCHES = 2;

function splitSourceIpList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings(String(value || '')
    .split(/[\s,;]+/g)
    .map(item => item.trim())
    .filter(Boolean));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function discoverLocalSourceIps(preferredIp = '') {
  const interfaces = os.networkInterfaces();
  const entries = [];
  let preferredInterface = '';
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address?.family !== 'IPv4' || address.internal || !address.address) continue;
      entries.push({ name, address: address.address });
      if (preferredIp && address.address === preferredIp) preferredInterface = name;
    }
  }
  const ordered = preferredInterface
    ? [
        ...entries.filter(item => item.name === preferredInterface),
        ...entries.filter(item => item.name !== preferredInterface)
      ]
    : entries;
  return uniqueStrings(ordered.map(item => item.address));
}

function resolveSourceIpCandidates(config = {}, state = {}) {
  const explicit = splitSourceIpList(config.sourceIps);
  const persisted = state?.network?.sourceIp || '';
  if (explicit.length) return explicit;
  const seed = config.sourceIp || persisted;
  if (!seed) return [];
  return uniqueStrings([
    seed,
    ...discoverLocalSourceIps(seed)
  ]);
}

function chooseInitialSourceIp(candidates, config = {}, state = {}) {
  const persisted = String(state?.network?.sourceIp || '').trim();
  const configured = String(config.sourceIp || '').trim();
  if (persisted && candidates.includes(persisted)) return persisted;
  if (configured && candidates.includes(configured)) return configured;
  return candidates[0] || '';
}

function isWebSocketForbiddenError(value) {
  const status = Number(value?.statusCode || value?.status || 0);
  if (status === 403) return true;
  const message = value?.message || String(value || '');
  return /(?:unexpected response|http)\s*403\b|\b403\s+forbidden\b/i.test(message);
}

async function inspectResponseChallenge(response) {
  if (!response || typeof response.text !== 'function') return null;
  let body = '';
  let bodyRead = false;
  try {
    if (typeof response.clone === 'function') body = await response.clone().text();
    else {
      body = await response.text();
      bodyRead = true;
    }
  } catch (_) {}
  const challenge = detectCloudflareChallenge({
    status: response.status,
    headers: response.headers,
    contentType: response.headers?.get?.('content-type') || '',
    body
  });
  if (typeof response.clone !== 'function' && bodyRead) response.text = async () => body;
  if (!challenge.detected) return null;
  return challenge;
}

function createSourceIpController(options = {}) {
  const config = options.config || {};
  const stateFile = options.stateFile || '';
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const logStore = options.logStore || null;
  let state = options.state || (stateFile ? readBrowserlessStateFile(stateFile) : {});
  let candidates = resolveSourceIpCandidates(config, state);
  let currentSourceIp = chooseInitialSourceIp(candidates, config, state);
  let selectionGeneration = Math.max(0, Number(state?.network?.sourceIpSelectionGeneration || 0));
  let selectedAtMs = Date.parse(state?.network?.lastSelectedAt || '') || 0;
  let transportGeneration = 0;
  let authoritativeTransportGeneration = 0;

  if (currentSourceIp && selectionGeneration <= 0) selectionGeneration = 1;

  const persist = patch => {
    if (!stateFile) return;
    const updatedAt = new Date(now()).toISOString();
    const network = {
      sourceIp: currentSourceIp,
      sourceIps: candidates,
      sourceIpSelectionGeneration: selectionGeneration,
      ...patch
    };
    try {
      state = updateBrowserlessStateFile(stateFile, {
        network
      }, { updatedAt });
    } catch (err) {
      state = {
        ...(state || {}),
        updatedAt,
        network: {
          ...(state?.network || {}),
          ...network
        }
      };
      if (logStore) {
        try {
          logStore.append('runner', 'source-ip-state-persist-error', {
            error: err?.message || String(err),
            sourceIp: currentSourceIp,
            sourceIps: candidates
          });
        } catch (_) {}
      }
    }
  };
  const log = (type, detail) => {
    if (logStore) logStore.append('runner', type, {
      sourceIp: currentSourceIp,
      sourceIps: candidates,
      ...(detail || {})
    });
  };
  const applyCurrentToConfig = () => {
    config.sourceIp = currentSourceIp;
    config.sourceIps = candidates;
  };

  applyCurrentToConfig();
  selectedAtMs = selectedAtMs || now();
  persist({
    lastSelectedAt: state?.network?.sourceIp === currentSourceIp
      ? state?.network?.lastSelectedAt || ''
      : new Date(now()).toISOString(),
    lastSelectionReason: state?.network?.sourceIp === currentSourceIp ? (state?.network?.lastSelectionReason || 'persisted') : 'startup'
  });

  async function fetchWithCurrentSourceIp(url, requestOptions = {}) {
    const challengePolicy = String(requestOptions.challengePolicy || '');
    const { challengePolicy: _challengePolicy, ...forwardOptions } = requestOptions;
    const sourceIp = currentSourceIp;
    const response = await (options.fetchWithTimeout || fetchWithTimeout)(url, {
      ...forwardOptions,
      localAddress: sourceIp || undefined
    });
    if (challengePolicy === 'login-stop') {
      const challenge = await inspectResponseChallenge(response);
      if (challenge?.detected) {
        throw createCloudflareChallengeError(challenge, {
          operation: 'login',
          source: 'http-response',
          sourceIp
        });
      }
    }
    return response;
  }

  const nextLeaveSourceIp = triedSourceIps => {
    if (!candidates.length) return '';
    const currentIndex = candidates.indexOf(currentSourceIp);
    const startIndex = currentIndex >= 0 ? currentIndex : -1;
    for (let offset = 1; offset <= candidates.length; offset += 1) {
      const candidate = candidates[(startIndex + offset) % candidates.length];
      if (candidate && !triedSourceIps.has(candidate)) return candidate;
    }
    return '';
  };

  const switchSourceIpForLeave = (nextSourceIp, switchCount) => {
    const previousSourceIp = currentSourceIp;
    currentSourceIp = nextSourceIp;
    selectionGeneration += 1;
    selectedAtMs = now();
    applyCurrentToConfig();
    persist({
      lastSelectedAt: new Date(selectedAtMs).toISOString(),
      lastSelectionReason: 'leave-failed-source-ip-switch'
    });
    log('leave-source-ip-switch', {
      from: previousSourceIp,
      to: nextSourceIp,
      reason: 'leave-not-confirmed',
      switchCount,
      maxSwitches: MAX_LEAVE_SOURCE_IP_SWITCHES
    });
  };

  return {
    currentSourceIp() {
      return currentSourceIp;
    },
    sourceIps() {
      return candidates.slice();
    },
    refreshFromState(nextState = null) {
      const incomingState = nextState || (stateFile ? readBrowserlessStateFile(stateFile) : state);
      state = incomingState;
      const nextCandidates = resolveSourceIpCandidates(config, state);
      candidates = nextCandidates.length ? nextCandidates : candidates;
      const incomingGeneration = Math.max(0, Number(state?.network?.sourceIpSelectionGeneration || 0));
      const incomingSelectedAtMs = Date.parse(state?.network?.lastSelectedAt || '') || 0;
      const incomingSourceIp = String(state?.network?.sourceIp || '');
      const incomingIsNewer = incomingGeneration > selectionGeneration
        || (incomingGeneration === selectionGeneration && incomingSelectedAtMs > selectedAtMs);
      if (incomingIsNewer && candidates.includes(incomingSourceIp)) {
        currentSourceIp = incomingSourceIp;
        selectionGeneration = incomingGeneration;
        selectedAtMs = incomingSelectedAtMs;
      } else if (!currentSourceIp || !candidates.includes(currentSourceIp)) {
        currentSourceIp = chooseInitialSourceIp(candidates, config, state);
        if (currentSourceIp) selectionGeneration += 1;
        selectedAtMs = now();
      }
      applyCurrentToConfig();
      persist({});
      return currentSourceIp;
    },
    fetchWithTimeout: fetchWithCurrentSourceIp,
    async openBrowserlessWs(wsOptions = {}) {
      const attemptDiagnostics = [];
      const open = options.openBrowserlessWs || openBrowserlessWs;
      const signal = wsOptions.signal || null;
      let connectionFailure = null;
      if (signal?.aborted) {
        const error = createWebSocketConnectAbortError(signal.reason);
        error.attempts = attemptDiagnostics;
        throw error;
      }
      const sourceIp = currentSourceIp;
      const generation = ++transportGeneration;
      let opened = false;
      let attemptError = null;
      let challengeFailure = null;
      const withGeneration = event => ({
        ...(event && typeof event === 'object' ? event : {}),
        transportGeneration: generation,
        sourceIp
      });
      try {
        const transport = await open({
          ...wsOptions,
          localAddress: sourceIp || undefined,
          onConnectStart: event => {
            if (typeof wsOptions.onConnectStart === 'function') wsOptions.onConnectStart(withGeneration(event));
          },
          onConnectAbort: event => {
            if (typeof wsOptions.onConnectAbort === 'function') wsOptions.onConnectAbort(withGeneration(event));
          },
          onAbortedOpen: event => {
            if (typeof wsOptions.onAbortedOpen === 'function') wsOptions.onAbortedOpen(withGeneration(event));
          },
          onOpen: event => {
            opened = true;
            authoritativeTransportGeneration = generation;
            if (typeof wsOptions.onOpen === 'function') wsOptions.onOpen(withGeneration(event));
          },
          onError: event => {
            const decorated = withGeneration(event);
            if (signal?.aborted) return;
            const challenge = detectCloudflareChallenge({
              status: event?.statusCode,
              headers: event?.headers,
              contentType: event?.contentType,
              body: event?.body
            });
            if (!opened && challenge.detected) {
              challengeFailure = cloudflareChallengeFailure(challenge, {
                operation: 'login',
                source: 'ws-response',
                sourceIp
              });
            }
            attemptError = decorated;
            if (!opened && (isWebSocketForbiddenError(event) || challenge.detected)) {
              log('ws-attempt-error', {
                generation,
                attemptedSourceIp: sourceIp,
                retryable: false,
                opened: false,
                statusCode: Number(event?.statusCode || 403),
                challenge: challenge.detected ? challengeFailure : null,
                message: event?.message || ''
              });
              return;
            }
            if (generation !== authoritativeTransportGeneration && authoritativeTransportGeneration > 0) {
              log('ws-stale-attempt-event', {
                event: 'error',
                generation,
                authoritativeTransportGeneration,
                attemptedSourceIp: sourceIp,
                message: event?.message || ''
              });
              return;
            }
            if (opened && typeof wsOptions.onError === 'function') wsOptions.onError(decorated);
          },
          onClose: event => {
            const decorated = withGeneration(event);
            if (!opened || generation !== authoritativeTransportGeneration) {
              log('ws-stale-attempt-event', {
                event: 'close',
                generation,
                authoritativeTransportGeneration,
                attemptedSourceIp: sourceIp,
                code: Number(event?.code || 0)
              });
              return;
            }
            if (typeof wsOptions.onClose === 'function') wsOptions.onClose(decorated);
          },
          onSend: event => {
            if (generation === authoritativeTransportGeneration && typeof wsOptions.onSend === 'function') {
              wsOptions.onSend(withGeneration(event));
            }
          },
          onMessage: data => {
            if (generation !== authoritativeTransportGeneration) {
              log('ws-stale-attempt-event', {
                event: 'message',
                generation,
                authoritativeTransportGeneration,
                attemptedSourceIp: sourceIp
              });
              return;
            }
            if (typeof wsOptions.onMessage === 'function') {
              wsOptions.onMessage(data, { transportGeneration: generation, sourceIp });
            }
          }
        });
        opened = true;
        authoritativeTransportGeneration = generation;
        attemptDiagnostics.push({ generation, sourceIp, opened: true, status: 101, error: '' });
        return transport;
      } catch (err) {
        attemptError = attemptError || err;
        const forbidden = isWebSocketForbiddenError(err) || isWebSocketForbiddenError(attemptError);
        const errorChallenge = detectCloudflareChallenge({
          status: err?.statusCode || attemptError?.statusCode,
          headers: err?.headers || attemptError?.headers,
          contentType: err?.contentType || attemptError?.contentType,
          body: err?.body || attemptError?.body
        });
        if (!challengeFailure && errorChallenge.detected) {
          challengeFailure = cloudflareChallengeFailure(errorChallenge, {
            operation: 'login',
            source: 'ws-error',
            sourceIp
          });
        }
        connectionFailure = err.connectionFailure || challengeFailure;
        attemptDiagnostics.push({
          generation,
          sourceIp,
          opened,
          status: forbidden ? 403 : Number(attemptError?.statusCode || 0),
          error: err?.message || String(err)
        });
        if (signal?.aborted || isWebSocketConnectAbortError(err)) {
          err.attempts = attemptDiagnostics;
          throw err;
        }
      }
      const error = new Error(attemptError?.message || 'websocket source IP attempt failed');
      error.attempts = attemptDiagnostics;
      if (connectionFailure) {
        error.code = connectionFailure.type;
        error.connectionFailure = connectionFailure;
      }
      if (typeof wsOptions.onError === 'function') {
        wsOptions.onError({
          message: error.message,
          opened: false,
          final: true,
          attempts: attemptDiagnostics,
          connectionFailure
        });
      }
      throw error;
    },
    requestAuthUrl(authOptions = {}) {
      return (options.requestAuthUrl || requestAuthUrl)({
        ...authOptions,
        localAddress: currentSourceIp || undefined
      });
    },
    submitCallbackInput(input, callbackOptions = {}) {
      return (options.submitCallbackInput || submitCallbackInput)(input, {
        ...callbackOptions,
        localAddress: currentSourceIp || undefined
      });
    },
    async leaveWithVerification(leaveOptions = {}) {
      const leave = options.leaveWithVerification || leaveWithVerification;
      const onRequest = leaveOptions.onRequest;
      const onResult = leaveOptions.onResult;
      const triedSourceIps = new Set();
      const attempts = [];
      let switchCount = 0;
      let result = null;

      while (true) {
        const sourceIp = currentSourceIp;
        if (sourceIp) triedSourceIps.add(sourceIp);
        const attemptOptions = {
          ...leaveOptions,
          localAddress: sourceIp || undefined
        };
        if (typeof onRequest === 'function') {
          attemptOptions.onRequest = request => onRequest({
            ...request,
            sourceIp,
            sourceIpSwitchCount: switchCount
          });
        }
        if (typeof onResult === 'function') {
          attemptOptions.onResult = attempt => onResult({
            ...attempt,
            sourceIp,
            sourceIpSwitchCount: switchCount
          });
        }
        result = await leave(attemptOptions);
        const sourceAttempts = Array.isArray(result?.attempts)
          ? result.attempts.map(attempt => ({
              ...attempt,
              sourceIp,
              sourceIpSwitchCount: switchCount
            }))
          : [];
        attempts.push(...sourceAttempts);
        if (result?.ok || switchCount >= MAX_LEAVE_SOURCE_IP_SWITCHES) {
          return { ...(result || { ok: false }), attempts };
        }
        const nextSourceIp = nextLeaveSourceIp(triedSourceIps);
        if (!nextSourceIp) return { ...(result || { ok: false }), attempts };
        switchCount += 1;
        triedSourceIps.add(nextSourceIp);
        switchSourceIpForLeave(nextSourceIp, switchCount);
      }
    }
  };
}

module.exports = {
  MAX_LEAVE_SOURCE_IP_SWITCHES,
  chooseInitialSourceIp,
  createSourceIpController,
  discoverLocalSourceIps,
  resolveSourceIpCandidates,
  splitSourceIpList
};
