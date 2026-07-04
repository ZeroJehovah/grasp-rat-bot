'use strict';

const {
  pageGlobalObject,
  resolvePageGlobal,
  readPageGlobal,
  installPageGlobal,
  readPageLocalStorageJson
} = require('../page-global-core');
const {
  buildBrowserPreservedState
} = require('./browser-preserved-state');
const {
  buildRuntimeDefaults
} = require('./runtime-defaults');
const {
  normalizeTargetWhitelistName,
  parseTargetWhitelistNames,
  deriveTargetWhitelistUrl
} = require('./target-whitelist');
const {
  staminaExhaustedLongWindows,
  staminaEvidenceRemaining,
  staminaHoldContradictedByStaminaEvidence
} = require('./exit-summary');
const {
  OPPORTUNITY_CONSTANTS
} = require('./opportunity-constants');

const RUNTIME_KEYS = Object.freeze({
  BOT_KEY: '__graspRatBot',
  PANEL_ID: 'grasp-rat-bot-panel',
  TARGET_OVERLAY_ID: 'grasp-rat-target-overlay',
  PAUSED_KEY: 'graspRatBotPaused',
  PAUSE_REASON_KEY: 'graspRatBotPauseReason',
  LOGIN_SUPPRESS_KEY: 'graspRatLoginSuppressUntil',
  LOGIN_SUPPRESS_REASON_KEY: 'graspRatLoginSuppressReason',
  LOGIN_POINT_SAFETY_KEY: 'graspRatLoginPointSafety',
  SESSION_MISMATCH_RECOVERY_KEY: 'graspRatSessionMismatchRecovery',
  EXIT_AUDIT_PENDING_LOGS_KEY: 'graspRatExitAuditPendingLogs',
  COMBAT_LOG_PENDING_ENTRIES_KEY: 'graspRatCombatLogPendingEntries',
  IMPORTANT_LOGS_KEY: 'graspRatImportantLogs',
  PENDING_EXIT_STATE_KEY: 'graspRatPendingExitState',
  ENEMY_LEAVE_STREAK_KEY: 'graspRatEnemyLeaveStreak',
  ENEMY_LEAVE_STATE_KEY: 'graspRatEnemyLeaveState',
  OFFLINE_LEAVE_STATE_KEY: 'graspRatOfflineLeaveState',
  LAST_SELF_STATE_KEY: 'graspRatLastSelfState',
  CLOUDFLARE_RELOAD_KEY: 'graspRatCloudflareReloadAt'
});

function readRuntimeConfig(pageGlobal) {
  try {
    const value = readPageGlobal('__graspRatBotRuntimeConfig', {}, pageGlobal);
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

function createRuntimeBootstrapBindings(baseConfig = {}, options = {}) {
  const pageGlobal = options.pageGlobal || resolvePageGlobal();
  const runtimeConfig = readRuntimeConfig(pageGlobal);
  const config = { ...(baseConfig && typeof baseConfig === 'object' ? baseConfig : {}), ...runtimeConfig };
  const previousBot = readPageGlobal(RUNTIME_KEYS.BOT_KEY, null, pageGlobal);
  const preserved = buildBrowserPreservedState(previousBot);
  const combatLogEndpointConfigured = Boolean(config.combatLogEndpointConfigured);
  const cfg = buildRuntimeDefaults(config, combatLogEndpointConfigured);
  const targetWhitelistUrl = deriveTargetWhitelistUrl(cfg.sourceUrl, cfg.targetWhitelistUrl);
  const preservedTargetWhitelistUrl = String(preserved.targetWhitelist?.url || '');
  const preservedTargetWhitelistMatchesUrl = Boolean(targetWhitelistUrl && preservedTargetWhitelistUrl === targetWhitelistUrl);
  const preservedTargetWhitelistNames = preservedTargetWhitelistMatchesUrl
    ? parseTargetWhitelistNames(preserved.targetWhitelist?.names || [], cfg.targetWhitelistMaxNames)
    : [];
  const targetWhitelistState = {
    url: targetWhitelistUrl,
    names: preservedTargetWhitelistNames,
    nameSet: new Set(preservedTargetWhitelistNames),
    timer: 0,
    fetching: false,
    lastFetchAt: 0,
    lastOkAt: preservedTargetWhitelistMatchesUrl ? Number(preserved.targetWhitelist?.lastOkAt || 0) || 0 : 0,
    lastErrorAt: 0,
    lastError: '',
    lastReason: preservedTargetWhitelistNames.length ? 'preserved' : 'empty'
  };

  return {
    pageGlobalObject,
    resolvePageGlobal,
    readPageGlobal,
    installPageGlobal,
    readPageLocalStorageJson,
    pageGlobal,
    baseConfig,
    runtimeConfig,
    config,
    OPPORTUNITY_CONSTANTS,
    ...RUNTIME_KEYS,
    buildBrowserPreservedState,
    buildRuntimeDefaults,
    normalizeTargetWhitelistName,
    parseTargetWhitelistNames,
    deriveTargetWhitelistUrl,
    staminaExhaustedLongWindows,
    staminaEvidenceRemaining,
    staminaHoldContradictedByStaminaEvidence,
    previousBot,
    preserved,
    combatLogEndpointConfigured,
    cfg,
    targetWhitelistUrl,
    preservedTargetWhitelistUrl,
    preservedTargetWhitelistMatchesUrl,
    preservedTargetWhitelistNames,
    targetWhitelistState
  };
}

module.exports = {
  RUNTIME_KEYS,
  createRuntimeBootstrapBindings,
  readRuntimeConfig
};
