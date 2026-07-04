'use strict';

function runtimeBootstrapSource(config) {
  return `
		  const { createRuntimeBootstrapBindings } = require('./src/browser/runtime/runtime-bootstrap-bindings');
		  const runtimeBootstrapBindings = createRuntimeBootstrapBindings(${JSON.stringify(config)});
		  const {
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
		    BOT_KEY,
		    PANEL_ID,
		    TARGET_OVERLAY_ID,
		    PAUSED_KEY,
		    PAUSE_REASON_KEY,
		    LOGIN_SUPPRESS_KEY,
		    LOGIN_SUPPRESS_REASON_KEY,
		    LOGIN_POINT_SAFETY_KEY,
		    SESSION_MISMATCH_RECOVERY_KEY,
		    EXIT_AUDIT_PENDING_LOGS_KEY,
		    COMBAT_LOG_PENDING_ENTRIES_KEY,
		    IMPORTANT_LOGS_KEY,
		    PENDING_EXIT_STATE_KEY,
		    ENEMY_LEAVE_STREAK_KEY,
		    ENEMY_LEAVE_STATE_KEY,
		    OFFLINE_LEAVE_STATE_KEY,
		    LAST_SELF_STATE_KEY,
		    CLOUDFLARE_RELOAD_KEY,
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
		  } = runtimeBootstrapBindings;
`;
}

module.exports = {
  runtimeBootstrapSource
};
