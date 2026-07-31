'use strict';

const os = require('os');
const {
  buildSnapshotProbeUrl,
  fetchWithTimeout,
  requestAuthUrl,
  redactSecrets,
  submitCallbackInput
} = require('./session-client');
const {
  leaveOnce,
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
  detectCloudflareChallenge,
  isCloudflareChallengeError
} = require('./cloudflare-challenge');

const DEFAULT_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_QUARANTINE_BASE_MS = 5 * 60 * 1000;
const DEFAULT_QUARANTINE_MAX_MS = 15 * 60 * 1000;

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

function isForbiddenResponse(response) {
  return Number(response?.status || 0) === 403;
}

function isForbiddenError(error) {
  return /(?:^|\s)(?:http\s*)?403(?:\s|$)|forbidden|unexpected response 403/i.test(error?.message || String(error || ''));
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

function buildProbeUrls(config = {}) {
  const origin = String(config.gameOrigin || 'https://grasp-rat-game.h-e.top').replace(/\/$/, '');
  const probes = [
    { name: 'home', url: `${origin}/` },
    { name: 'auth-start', url: `${origin}/auth/linuxdo/start` }
  ];
  if (Number(config.userId || 0) && config.sessionToken) {
    probes.push({
      name: 'snapshot',
      url: buildSnapshotProbeUrl({
        gameOrigin: origin,
        snapshotPath: config.snapshotPath || '/snapshot',
        userId: config.userId,
        sessionToken: config.sessionToken,
        nowMs: Date.now()
      })
    });
  }
  return probes;
}

function summarizeProbeResult(result) {
  return {
    name: result.name || '',
    status: Number(result.status || 0),
    ok: Boolean(result.ok),
    forbidden: Boolean(result.forbidden),
    challenge: result.challenge?.detected ? {
      evidence: Array.isArray(result.challenge.evidence) ? result.challenge.evidence.slice(0, 8) : [],
      cfRay: result.challenge.cfRay || ''
    } : null,
    error: result.error || ''
  };
}

function createSourceIpController(options = {}) {
  const config = options.config || {};
  const stateFile = options.stateFile || '';
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const logStore = options.logStore || null;
  let state = options.state || (stateFile ? readBrowserlessStateFile(stateFile) : {});
  let candidates = resolveSourceIpCandidates(config, state);
  let currentSourceIp = chooseInitialSourceIp(candidates, config, state);
  let probePromise = null;
  let selectionGeneration = Math.max(0, Number(state?.network?.sourceIpSelectionGeneration || 0));
  let selectedAtMs = Date.parse(state?.network?.lastSelectedAt || '') || 0;
  let transportGeneration = 0;
  let authoritativeTransportGeneration = 0;
  const quarantines = new Map(Object.entries(state?.network?.sourceIpQuarantine || {})
    .map(([sourceIp, record]) => [sourceIp, {
      failureCount: Math.max(0, Number(record?.failureCount || 0)),
      until: Math.max(0, Number(record?.until || 0)),
      reason: String(record?.reason || '')
    }]));

  if (currentSourceIp && selectionGeneration <= 0) selectionGeneration = 1;

  const quarantineSnapshot = () => Object.fromEntries(Array.from(quarantines.entries())
    .filter(([sourceIp]) => candidates.includes(sourceIp))
    .map(([sourceIp, record]) => [sourceIp, { ...record }]));

  const persist = patch => {
    if (!stateFile) return;
    const updatedAt = new Date(now()).toISOString();
    const network = {
      sourceIp: currentSourceIp,
      sourceIps: candidates,
      sourceIpSelectionGeneration: selectionGeneration,
      sourceIpQuarantine: quarantineSnapshot(),
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

  const quarantineRecord = sourceIp => {
    const record = quarantines.get(String(sourceIp || '')) || null;
    if (!record || Number(record.until || 0) <= now()) return null;
    return record;
  };

  const sourceIpAvailable = sourceIp => Boolean(sourceIp) && !quarantineRecord(sourceIp);

  const nextAvailableSourceIp = (fromSourceIp = currentSourceIp, excluded = new Set()) => {
    if (!candidates.length) return '';
    const start = Math.max(0, candidates.indexOf(fromSourceIp));
    for (let offset = 1; offset <= candidates.length; offset += 1) {
      const candidate = candidates[(start + offset) % candidates.length];
      if (excluded.has(candidate) || !sourceIpAvailable(candidate)) continue;
      return candidate;
    }
    return '';
  };

  const selectSourceIp = (sourceIp, reason) => {
    const next = String(sourceIp || '');
    if (!next || next === currentSourceIp) return false;
    currentSourceIp = next;
    selectionGeneration += 1;
    selectedAtMs = now();
    applyCurrentToConfig();
    persist({
      lastSelectedAt: new Date(selectedAtMs).toISOString(),
      lastSelectionReason: reason
    });
    return true;
  };

  const quarantineSourceIp = (sourceIp, reason) => {
    const key = String(sourceIp || '');
    if (!key) return null;
    const previous = quarantines.get(key) || {};
    const failureCount = Math.max(1, Number(previous.failureCount || 0) + 1);
    const baseMs = Math.max(1000, Number(config.sourceIpQuarantineBaseMs || DEFAULT_QUARANTINE_BASE_MS));
    const maxMs = Math.max(baseMs, Number(config.sourceIpQuarantineMaxMs || DEFAULT_QUARANTINE_MAX_MS));
    const durationMs = Math.min(maxMs, baseMs * (2 ** Math.min(8, failureCount - 1)));
    const record = {
      failureCount,
      until: now() + durationMs,
      reason: String(reason || 'all-probes-403')
    };
    quarantines.set(key, record);
    persist({});
    log('source-ip-quarantine', {
      quarantinedSourceIp: key,
      failureCount,
      durationMs,
      until: new Date(record.until).toISOString(),
      reason: record.reason
    });
    return record;
  };

  applyCurrentToConfig();
  selectedAtMs = selectedAtMs || now();
  persist({
    lastSelectedAt: state?.network?.sourceIp === currentSourceIp
      ? state?.network?.lastSelectedAt || ''
      : new Date(now()).toISOString(),
    lastSelectionReason: state?.network?.sourceIp === currentSourceIp ? (state?.network?.lastSelectionReason || 'persisted') : 'startup'
  });

  async function probeCurrentIp(context = {}) {
    const sourceIp = currentSourceIp;
    const probes = buildProbeUrls(config);
    const timeoutMs = Math.max(1, Math.min(
      Number(config.httpTimeoutMs || DEFAULT_PROBE_TIMEOUT_MS),
      Number(config.sourceIpProbeTimeoutMs || DEFAULT_PROBE_TIMEOUT_MS)
    ));
    const results = [];
    for (const probe of probes) {
      try {
        const response = await (options.fetchWithTimeout || fetchWithTimeout)(probe.url, {
          timeoutMs,
          localAddress: sourceIp,
          method: 'GET',
          cache: 'no-store'
        });
        if (typeof response.text === 'function') {
          try {
            const body = await response.text();
            const challenge = detectCloudflareChallenge({
              status: response.status,
              headers: response.headers,
              contentType: response.headers?.get?.('content-type') || '',
              body
            });
            results.push({
              name: probe.name,
              status: Number(response.status || 0),
              ok: Boolean(response.ok),
              forbidden: isForbiddenResponse(response),
              challenge: challenge.detected ? challenge : null
            });
            continue;
          } catch (_) {}
        }
        results.push({
          name: probe.name,
          status: Number(response.status || 0),
          ok: Boolean(response.ok),
          forbidden: isForbiddenResponse(response),
          challenge: null
        });
      } catch (err) {
        results.push({
          name: probe.name,
          status: 0,
          ok: false,
          forbidden: false,
          challenge: null,
          error: err?.message || String(err)
        });
      }
    }
    const allForbidden = results.length > 0 && results.every(result => result.forbidden);
    const summary = {
      at: new Date(now()).toISOString(),
      trigger: context,
      sourceIp,
      allForbidden,
      challenge: results.find(result => result.challenge)?.challenge || null,
      results: results.map(summarizeProbeResult)
    };
    persist({ lastProbe: summary });
    log('source-ip-probe', summary);
    return summary;
  }

  function switchToNext(reason, probe) {
    if (!currentSourceIp || candidates.length < 2) {
      const blocked = {
        at: new Date(now()).toISOString(),
        reason,
        from: currentSourceIp,
        to: currentSourceIp,
        switched: false,
        probe
      };
      persist({ lastSwitch: blocked });
      log('source-ip-switch-unavailable', blocked);
      return { switched: false, from: currentSourceIp, to: currentSourceIp, probe };
    }
    const next = nextAvailableSourceIp(currentSourceIp);
    if (!next) {
      const blocked = {
        at: new Date(now()).toISOString(),
        reason: 'all-alternates-quarantined',
        from: currentSourceIp,
        to: currentSourceIp,
        switched: false,
        probe
      };
      persist({ lastSwitch: blocked });
      log('source-ip-switch-unavailable', blocked);
      return { switched: false, from: currentSourceIp, to: currentSourceIp, probe };
    }
    const previous = currentSourceIp;
    selectSourceIp(next, reason);
    const detail = {
      at: new Date(now()).toISOString(),
      reason,
      from: previous,
      to: next,
      switched: true,
      probe
    };
    persist({
      lastSwitch: detail,
      lastSelectedAt: detail.at,
      lastSelectionReason: reason,
      sourceIpSelectionGeneration: selectionGeneration
    });
    log('source-ip-switch', detail);
    return { switched: true, from: previous, to: next, probe };
  }

  async function handleForbidden(context = {}) {
    if (!currentSourceIp) return { switched: false, reason: 'missing-source-ip' };
    if (!probePromise) {
      probePromise = (async () => {
        try {
          const probe = await probeCurrentIp(context);
          if (context.stopOnChallenge && probe.challenge?.detected) {
            return {
              switched: false,
              reason: 'cloudflare-challenge',
              probe,
              connectionFailure: cloudflareChallengeFailure(probe.challenge, {
                operation: context.operation || 'login',
                source: context.source || 'http-probe',
                sourceIp: probe.sourceIp
              })
            };
          }
          if (probe.allForbidden) {
            quarantineSourceIp(probe.sourceIp, 'all-probes-403');
            return switchToNext('all-probes-403', probe);
          }
          return { switched: false, reason: 'not-all-probes-403', probe };
        } finally {
          probePromise = null;
        }
      })();
    }
    return probePromise;
  }

  async function fetchWithCurrentSourceIp(url, requestOptions = {}) {
    const challengePolicy = String(requestOptions.challengePolicy || '');
    const { challengePolicy: _challengePolicy, ...forwardOptions } = requestOptions;
    for (let attempt = 0; attempt < 2; attempt += 1) {
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
      if (!isForbiddenResponse(response)) return response;
      const decision = await handleForbidden({
        kind: 'http',
        url: redactSecrets(url),
        status: response.status,
        sourceIp,
        stopOnChallenge: challengePolicy === 'login-stop',
        operation: 'login',
        source: 'http-probe'
      });
      if (decision.connectionFailure) {
        const error = createCloudflareChallengeError(
          decision.probe?.challenge,
          decision.connectionFailure
        );
        error.connectionFailure = decision.connectionFailure;
        throw error;
      }
      if (decision.switched && attempt === 0) continue;
      return response;
    }
    return (options.fetchWithTimeout || fetchWithTimeout)(url, {
      ...forwardOptions,
      localAddress: currentSourceIp || undefined
    });
  }

  async function retryForbiddenOperation(operation, context = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceIp = currentSourceIp;
      try {
        return await operation(sourceIp);
      } catch (err) {
        if (!isForbiddenError(err)) throw err;
        if (isCloudflareChallengeError(err)) throw err;
        const decision = await handleForbidden({
          ...context,
          sourceIp,
          error: err?.message || String(err)
        });
        if (!decision.switched || attempt > 0) throw err;
      }
    }
    return operation(currentSourceIp);
  }

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
    handleForbidden,
    fetchWithTimeout: fetchWithCurrentSourceIp,
    async openBrowserlessWs(wsOptions = {}) {
      const attemptedSourceIps = new Set();
      const attemptDiagnostics = [];
      const open = options.openBrowserlessWs || openBrowserlessWs;
      const maxAttempts = Math.max(1, candidates.length || 1);
      const signal = wsOptions.signal || null;
      let lastError = null;
      let connectionFailure = null;

      for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
        if (signal?.aborted) {
          const error = createWebSocketConnectAbortError(signal.reason);
          error.attempts = attemptDiagnostics;
          throw error;
        }
        if (currentSourceIp && (!sourceIpAvailable(currentSourceIp) || attemptedSourceIps.has(currentSourceIp))) {
          const next = nextAvailableSourceIp(currentSourceIp, attemptedSourceIps);
          if (!next) break;
          selectSourceIp(next, 'ws-skip-quarantined');
        }
        const sourceIp = currentSourceIp;
        const generation = ++transportGeneration;
        let opened = false;
        let sawForbidden = false;
        let challengeFailure = null;
        let attemptError = null;
        attemptedSourceIps.add(sourceIp);
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
              const forbidden = !opened && isWebSocketForbiddenError(event);
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
              sawForbidden = sawForbidden || forbidden;
              attemptError = decorated;
              if (forbidden || challenge.detected) {
                log('ws-attempt-error', {
                  generation,
                  attemptedSourceIp: sourceIp,
                  retryable: true,
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
          lastError = err;
          const forbidden = sawForbidden || isWebSocketForbiddenError(err) || isWebSocketForbiddenError(attemptError);
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
          if (!forbidden) {
            connectionFailure = null;
            break;
          }
          if (challengeFailure) {
            connectionFailure = challengeFailure;
            break;
          }
          const decision = await handleForbidden({
            kind: 'ws',
            url: redactSecrets(wsOptions.wsUrl || ''),
            status: 403,
            sourceIp,
            generation,
            stopOnChallenge: true,
            operation: 'login',
            source: 'ws-probe'
          });
          connectionFailure = decision.connectionFailure || null;
          if (!decision.switched) break;
        }
      }
      const error = new Error(lastError?.message || 'websocket source IP attempts exhausted');
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
      return retryForbiddenOperation(sourceIp => (options.requestAuthUrl || requestAuthUrl)({
        ...authOptions,
        localAddress: sourceIp || undefined
      }), { kind: 'auth-url', url: `${config.gameOrigin || ''}/auth/linuxdo/start`, status: 403 });
    },
    submitCallbackInput(input, callbackOptions = {}) {
      return retryForbiddenOperation(sourceIp => (options.submitCallbackInput || submitCallbackInput)(input, {
        ...callbackOptions,
        localAddress: sourceIp || undefined
      }), { kind: 'callback', status: 403 });
    },
    leaveWithVerification(leaveOptions = {}) {
      return (options.leaveWithVerification || leaveWithVerification)({
        ...leaveOptions,
        localAddress: currentSourceIp || undefined,
        leaveOnceImpl: async onceOptions => {
          const attempt = await leaveOnce({
            ...onceOptions,
            localAddress: currentSourceIp || undefined
          });
          if (Number(attempt.status || 0) !== 403) return attempt;
          if (onceOptions.deferForbiddenRecovery) return attempt;
          const decision = await handleForbidden({
            kind: 'leave',
            status: attempt.status,
            stage: attempt.stage || '',
            sourceIp: currentSourceIp
          });
          if (!decision.switched) return attempt;
          return leaveOnce({
            ...onceOptions,
            localAddress: currentSourceIp || undefined,
            stage: `${onceOptions.stage || 'initial'}-after-ip-switch`
          });
        }
      });
    }
  };
}

module.exports = {
  buildProbeUrls,
  chooseInitialSourceIp,
  createSourceIpController,
  discoverLocalSourceIps,
  resolveSourceIpCandidates,
  splitSourceIpList
};
