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
const { openBrowserlessWs } = require('./ws-transport');
const {
  readBrowserlessStateFile,
  updateBrowserlessStateFile
} = require('./state-file');

const DEFAULT_PROBE_TIMEOUT_MS = 5000;

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

  const persist = patch => {
    if (!stateFile) return;
    const updatedAt = new Date(now()).toISOString();
    const network = {
      sourceIp: currentSourceIp,
      sourceIps: candidates,
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
          try { await response.text(); } catch (_) {}
        }
        results.push({
          name: probe.name,
          status: Number(response.status || 0),
          ok: Boolean(response.ok),
          forbidden: isForbiddenResponse(response)
        });
      } catch (err) {
        results.push({
          name: probe.name,
          status: 0,
          ok: false,
          forbidden: false,
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
    const index = candidates.indexOf(currentSourceIp);
    const next = candidates[(index >= 0 ? index + 1 : 0) % candidates.length];
    const previous = currentSourceIp;
    currentSourceIp = next;
    applyCurrentToConfig();
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
      lastSelectionReason: reason
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
          if (probe.allForbidden) return switchToNext('all-probes-403', probe);
          return { switched: false, reason: 'not-all-probes-403', probe };
        } finally {
          probePromise = null;
        }
      })();
    }
    return probePromise;
  }

  async function fetchWithCurrentSourceIp(url, requestOptions = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sourceIp = currentSourceIp;
      const response = await (options.fetchWithTimeout || fetchWithTimeout)(url, {
        ...requestOptions,
        localAddress: sourceIp || undefined
      });
      if (!isForbiddenResponse(response)) return response;
      const decision = await handleForbidden({
        kind: 'http',
        url: redactSecrets(url),
        status: response.status,
        sourceIp
      });
      if (decision.switched && attempt === 0) continue;
      return response;
    }
    return (options.fetchWithTimeout || fetchWithTimeout)(url, {
      ...requestOptions,
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
      state = nextState || (stateFile ? readBrowserlessStateFile(stateFile) : state);
      const nextCandidates = resolveSourceIpCandidates(config, state);
      candidates = nextCandidates.length ? nextCandidates : candidates;
      currentSourceIp = chooseInitialSourceIp(candidates, config, state);
      applyCurrentToConfig();
      persist({});
      return currentSourceIp;
    },
    handleForbidden,
    fetchWithTimeout: fetchWithCurrentSourceIp,
    async openBrowserlessWs(wsOptions = {}) {
      return retryForbiddenOperation(async sourceIp => {
        let sawForbidden = false;
        return await (options.openBrowserlessWs || openBrowserlessWs)({
          ...wsOptions,
          localAddress: sourceIp || undefined,
          onError: event => {
            sawForbidden = sawForbidden || Number(event?.statusCode || 0) === 403 || isForbiddenError(event?.message || '');
            if (typeof wsOptions.onError === 'function') wsOptions.onError(event);
          }
        }).catch(err => {
          if (sawForbidden || isForbiddenError(err)) {
            const wrapped = new Error(err?.message || String(err));
            wrapped.status = 403;
            throw wrapped;
          }
          throw err;
        });
      }, { kind: 'ws', url: redactSecrets(wsOptions.wsUrl || ''), status: 403 });
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
