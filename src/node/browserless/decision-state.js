'use strict';

const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_SUMMARY_DEPTH = 4;
const SECRET_KEY_RE = /token|secret|cookie|authorization|password|api[-_]?key|session/i;

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? cloneJson(value) : {};
}

function asSwitchDiagnostics(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const diagnostics = cloneJson(value);
    if (!Array.isArray(diagnostics.events)) diagnostics.events = [];
    return diagnostics;
  }
  return { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
}

function boundedList(value, limit = DEFAULT_RECENT_LIMIT) {
  const array = Array.isArray(value) ? value : [];
  const max = Math.max(0, Number(limit || DEFAULT_RECENT_LIMIT));
  return array.slice(-max).map(item => redactBoundedValue(item));
}

function recordEntries(record, limit = DEFAULT_RECENT_LIMIT) {
  const entries = Object.entries(record || {});
  const max = Math.max(0, Number(limit || DEFAULT_RECENT_LIMIT));
  return entries.slice(-max).map(([key, value]) => ({
    key,
    value: redactBoundedValue(value)
  }));
}

function redactBoundedValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  if (typeof value !== 'object') return value;
  if (depth >= DEFAULT_SUMMARY_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, DEFAULT_RECENT_LIMIT).map(item => redactBoundedValue(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY_RE.test(key) ? '[redacted]' : redactBoundedValue(item, depth + 1);
  }
  return output;
}

function createInitialDecisionState(options = {}) {
  return {
    lastTarget: cloneJson(options.lastTarget || null),
    lastTargetAt: options.lastTargetAt || '',
    opportunityChoice: cloneJson(options.opportunityChoice || options.currentOpportunity || null),
    opportunitySwitchLock: cloneJson(options.opportunitySwitchLock || options.switchLock || null),
    coinProgress: asRecord(options.coinProgress),
    coinAttempts: asRecord(options.coinAttempts),
    coinFailures: asRecord(options.coinFailures),
    ignoredCoins: asRecord(options.ignoredCoins),
    coinApproachLock: cloneJson(options.coinApproachLock || null),
    staleCoinEscape: cloneJson(options.staleCoinEscape || null),
    singleCoinBait: cloneJson(options.singleCoinBait || null),
    opportunityAfkStamina: asRecord(options.opportunityAfkStamina),
    attackHistory: asArray(options.attackHistory),
    combatTarget: cloneJson(options.combatTarget || null),
    combatAim: cloneJson(options.combatAim || null),
    combatMetrics: cloneJson(options.combatMetrics || null),
    opponentBehaviorStates: asRecord(options.opponentBehaviorStates),
    combatLearning: cloneJson(options.combatLearning || null),
    seenEntities: asRecord(options.seenEntities),
    browserlessLastSelf: cloneJson(options.browserlessLastSelf || null),
    browserlessInjury: cloneJson(options.browserlessInjury || null),
    browserlessPursuit: cloneJson(options.browserlessPursuit || null),
    profitPursuitSuppressions: asRecord(options.profitPursuitSuppressions),
    dangerousCombatTargets: asRecord(options.dangerousCombatTargets),
    easyKillApproach: cloneJson(options.easyKillApproach || null),
    easyKillTargetSuppressions: asRecord(options.easyKillTargetSuppressions),
    fleeLock: cloneJson(options.fleeLock || null),
    returnBlockLock: cloneJson(options.returnBlockLock || null),
    returnBlockScan: cloneJson(options.returnBlockScan || null),
    finalActionArbitration: cloneJson(options.finalActionArbitration || null),
    targetSwitchDiagnostics: asSwitchDiagnostics(options.targetSwitchDiagnostics),
    killHistory: asArray(options.killHistory),
    recentSelfKillEvidence: asArray(options.recentSelfKillEvidence)
  };
}

function defineCompatibilityAlias(state, alias, canonical) {
  Object.defineProperty(state, alias, {
    enumerable: true,
    configurable: true,
    get() {
      return this[canonical] || null;
    },
    set(value) {
      this[canonical] = cloneJson(value || null);
    }
  });
}

function createBrowserlessDecisionState(options = {}) {
  const state = createInitialDecisionState(options);
  defineCompatibilityAlias(state, 'currentOpportunity', 'opportunityChoice');
  defineCompatibilityAlias(state, 'switchLock', 'opportunitySwitchLock');
  return state;
}

function summarizeBrowserlessDecisionState(state, options = {}) {
  if (!state || typeof state !== 'object') return null;
  const limit = Math.max(1, Number(options.recentLimit || DEFAULT_RECENT_LIMIT));
  const coinProgress = state.coinProgress || {};
  const coinAttempts = state.coinAttempts || {};
  const coinFailures = state.coinFailures || {};
  const ignoredCoins = state.ignoredCoins || {};
  return {
    lastTarget: redactBoundedValue(state.lastTarget || null),
    lastTargetAt: state.lastTargetAt || '',
    opportunity: {
      choice: redactBoundedValue(state.opportunityChoice || state.currentOpportunity || null),
      switchLock: redactBoundedValue(state.opportunitySwitchLock || state.switchLock || null)
    },
    coin: {
      progressCount: Object.keys(coinProgress).length,
      attemptCount: Object.keys(coinAttempts).length,
      failureCount: Object.keys(coinFailures).length,
      ignoredCount: Object.keys(ignoredCoins).length,
      approachLock: redactBoundedValue(state.coinApproachLock || null),
      staleEscape: redactBoundedValue(state.staleCoinEscape || null),
      bait: redactBoundedValue(state.singleCoinBait || null),
      recentProgress: recordEntries(coinProgress, limit),
      recentAttempts: recordEntries(coinAttempts, limit),
      recentFailures: recordEntries(coinFailures, limit),
      recentIgnored: recordEntries(ignoredCoins, limit)
    },
    attackHistory: {
      count: Array.isArray(state.attackHistory) ? state.attackHistory.length : 0,
      recent: boundedList(state.attackHistory, limit)
    },
    combat: {
      target: redactBoundedValue(state.combatTarget || null),
      aim: redactBoundedValue(state.combatAim || null),
      metrics: redactBoundedValue(state.combatMetrics || null),
      opponentBehaviorStates: recordEntries(state.opponentBehaviorStates || {}, limit),
      learning: redactBoundedValue(state.combatLearning || null)
    },
    browserlessSafety: {
      seenEntityCount: Object.keys(state.seenEntities || {}).length,
      recentSeenEntities: recordEntries(state.seenEntities || {}, limit),
      opportunityAfkStamina: recordEntries(state.opportunityAfkStamina || {}, limit),
      lastSelf: redactBoundedValue(state.browserlessLastSelf || null),
      injury: redactBoundedValue(state.browserlessInjury || null),
      pursuit: redactBoundedValue(state.browserlessPursuit || null),
      profitPursuitSuppressions: recordEntries(state.profitPursuitSuppressions || {}, limit),
      dangerousCombatTargets: recordEntries(state.dangerousCombatTargets || {}, limit),
      easyKillApproach: redactBoundedValue(state.easyKillApproach || null),
      easyKillTargetSuppressions: recordEntries(state.easyKillTargetSuppressions || {}, limit)
    },
    safety: {
      fleeLock: redactBoundedValue(state.fleeLock || null),
      returnBlockLock: redactBoundedValue(state.returnBlockLock || null),
      returnBlockScan: redactBoundedValue(state.returnBlockScan || null)
    },
    finalActionArbitration: redactBoundedValue(state.finalActionArbitration || null),
    targetSwitchDiagnostics: (() => {
      const diagnostics = state.targetSwitchDiagnostics;
      const events = Array.isArray(diagnostics) ? diagnostics : (Array.isArray(diagnostics?.events) ? diagnostics.events : []);
      return {
        count: events.length,
        recent: boundedList(events, limit),
        lastFocus: redactBoundedValue(Array.isArray(diagnostics) ? null : diagnostics?.lastFocus || null),
        lastTargetFocus: redactBoundedValue(Array.isArray(diagnostics) ? null : diagnostics?.lastTargetFocus || null),
        lastSwitch: redactBoundedValue(Array.isArray(diagnostics) ? null : diagnostics?.lastSwitch || null)
      };
    })(),
    killHistory: {
      count: Array.isArray(state.killHistory) ? state.killHistory.length : 0,
      recent: boundedList(state.killHistory, limit)
    },
    recentSelfKillEvidence: {
      count: Array.isArray(state.recentSelfKillEvidence) ? state.recentSelfKillEvidence.length : 0,
      recent: boundedList(state.recentSelfKillEvidence, limit)
    }
  };
}

module.exports = {
  createBrowserlessDecisionState,
  createInitialDecisionState,
  summarizeBrowserlessDecisionState
};
