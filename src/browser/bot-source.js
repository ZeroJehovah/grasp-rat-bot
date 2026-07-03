'use strict';

const {
  staminaExhaustedLongWindows,
  staminaExhaustedWindowLabel,
  staminaEvidenceRemaining,
  staminaHoldContradictedByStaminaEvidence,
  offlineLeaveSummaryText,
  combatLogExitSummaryFromDecision
} = require('../shared/exit-summary');
const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('../shared/runtime-utils');
const {
  buildBrowserPreservedState
} = require('../shared/browser-preserved-state');
const {
  buildRuntimeDefaults
} = require('../shared/runtime-defaults');
const {
  browserPageGlobalSource
} = require('./page-global-core');
const {
  normalizeTargetWhitelistName,
  parseTargetWhitelistNames,
  deriveTargetWhitelistUrl
} = require('../shared/target-whitelist');
const {
  escapeHtml,
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('../shared/display-format');
const { targetOverlaySource } = require('./target-overlay-source');
const { targetWhitelistSource } = require('./target-whitelist-source');
const { statusPanelSource } = require('./status-panel-source');
const { combatLogSource } = require('./combat-log-source');
const { importantLogSource } = require('./important-log-source');
const { combatHistorySource } = require('./combat-history-source');
const { entityRefreshSource } = require('./entity-refresh-source');
const { classifySource } = require('./classify-source');
const { coinSafetySource } = require('./coin-safety-source');
const { targetSelectionSource } = require('./target-selection-source');
const { combatMovementSource } = require('./combat-movement-source');
const { combatAimSource } = require('./combat-aim-source');
const { combatFireSource } = require('./combat-fire-source');
const { coinTargetRuntimeSource } = require('./coin-target-runtime-source');
const { controlLoginSource } = require('./control-login-source');
const { nativeStateSource } = require('./native-state-source');
const { nativeControlSource } = require('./native-control-source');
const { coinMotionRuntimeSource } = require('./coin-motion-runtime-source');
const { returnBlockSource } = require('./return-block-source');
const { entityActivitySource } = require('./entity-activity-source');
const { staminaRuntimeSource } = require('./stamina-runtime-source');
const { exitReloginSource } = require('./exit-relogin-source');
const { pendingExitSource } = require('./pending-exit-source');
const { leaveCommandSource } = require('./leave-command-source');
const { autoLoginSource } = require('./auto-login-source');
const { leaveFlowSource } = require('./leave-flow-source');
const { offlineSafetySource } = require('./offline-safety-source');
const { pageNativeSnapshotSource } = require('./page-native-snapshot-source');
const { actionArbitrationSource } = require('./action-arbitration-source');
const { networkQualitySource } = require('./network-quality-source');
const { networkQualitySummarySource } = require('./network-quality-summary-source');
const { runtimeSummarySource } = require('./runtime-summary-source');
// Strategy modules for centralized constants and logic.
const { COMBAT_CONSTANTS } = require('../strategy/combat-constants');
const { OPPORTUNITY_CONSTANTS } = require('../strategy/opportunity-constants');
const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('../strategy/coin-progress');
const {
  defaultDist,
  coinRouteKey,
  coinRouteIdsFrom,
  coinRouteLegStaminaCostCore,
  coinRouteLegClearCore,
  coinRoutePointLimitCore,
  coinRouteSummaryCore,
  coinRoutePoints,
  coinRouteActionMetaCore,
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsHeldSingleCoinCore,
  coinRouteMatchesHeldChoiceCore,
  heldCoinRouteBeatsSwitchCore,
  pickCoinRouteOpportunityCore
} = require('../strategy/coin-route');
const {
  opportunityKey,
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityPairKey,
  opportunityByKey,
  opportunityMatchesChoiceCore,
  isHighValueCoinOpportunityCore,
  highValueCoinHoldBlocksEnemySwitchCore,
  lockedOpportunityChoiceCore,
  applyOpportunityOscillationLockCore,
  chooseStableOpportunityCore,
  opportunityMissingHoldUntilCore,
  missingHeldCoinCoveredByVisibleAuthorityCore,
  buildMissingHeldOpportunityCore,
  opportunityRouteIds,
  rememberOpportunityChoiceCore
} = require('../strategy/opportunity-choice');
const {
  opportunityEffectiveStaminaCostCore,
  opportunityValueScoreCore,
  opportunityPriorityTierCore,
  mergeCoinRouteDisplayCore,
  uniqueVisibleRouteCoinsCore,
  buildCoinOpportunityCandidatesCore,
  buildEnemyOpportunityCandidatesCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('../strategy/opportunity-candidates');
const {
  postAttackVisibleCoinExistsCore,
  resolvedRecentPostAttackDropsCore,
  buildPostAttackDropCoinCandidateCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('../strategy/post-attack-drop');
const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('../strategy/stamina-budget');

function browserBotSource(config) {
  return `
(() => {
		  ${browserPageGlobalSource()}

		  const pageGlobal = resolvePageGlobal();
		  const baseConfig = ${JSON.stringify(config)};
		  const runtimeConfig = (() => {
		    try {
		      const value = readPageGlobal('__graspRatBotRuntimeConfig', {}, pageGlobal);
		      return value && typeof value === 'object'
		        ? value
		        : {};
		    } catch (_) {
		      return {};
		    }
		  })();
		  const config = { ...baseConfig, ...runtimeConfig };
		  const OPPORTUNITY_CONSTANTS = ${JSON.stringify(OPPORTUNITY_CONSTANTS)};
		  const BOT_KEY = '__graspRatBot';
		  const PANEL_ID = 'grasp-rat-bot-panel';
		  const TARGET_OVERLAY_ID = 'grasp-rat-target-overlay';
		  const PAUSED_KEY = 'graspRatBotPaused';
		  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
		  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
		  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
		      const LOGIN_POINT_SAFETY_KEY = 'graspRatLoginPointSafety';
		      const SESSION_MISMATCH_RECOVERY_KEY = 'graspRatSessionMismatchRecovery';
		      const EXIT_AUDIT_PENDING_LOGS_KEY = 'graspRatExitAuditPendingLogs';
		      const COMBAT_LOG_PENDING_ENTRIES_KEY = 'graspRatCombatLogPendingEntries';
		      const IMPORTANT_LOGS_KEY = 'graspRatImportantLogs';
		      const PENDING_EXIT_STATE_KEY = 'graspRatPendingExitState';
		      const ENEMY_LEAVE_STREAK_KEY = 'graspRatEnemyLeaveStreak';
	      const ENEMY_LEAVE_STATE_KEY = 'graspRatEnemyLeaveState';
	      const OFFLINE_LEAVE_STATE_KEY = 'graspRatOfflineLeaveState';
	      const LAST_SELF_STATE_KEY = 'graspRatLastSelfState';
	      const CLOUDFLARE_RELOAD_KEY = 'graspRatCloudflareReloadAt';
		  ${buildBrowserPreservedState.toString()}

		  ${buildRuntimeDefaults.toString()}

		  ${normalizeTargetWhitelistName.toString()}

		  ${parseTargetWhitelistNames.toString()}

		  ${deriveTargetWhitelistUrl.toString()}

		  ${staminaExhaustedLongWindows.toString()}

		  ${staminaEvidenceRemaining.toString()}

		  ${staminaHoldContradictedByStaminaEvidence.toString()}

		  const previousBot = readPageGlobal(BOT_KEY, null, pageGlobal);
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

	  function readPersistentLastSelfState(t = Date.now()) {
	    let state = null;
	    try {
	      state = JSON.parse(localStorage.getItem(LAST_SELF_STATE_KEY) || 'null');
	    } catch (_) {
	      state = null;
	    }
	    if (!state || typeof state !== 'object') return null;
	    const at = Number(state.at || state.updatedAt || 0) || 0;
	    const maxAgeMs = Math.max(3600000, Number(cfg.lastSelfPersistMaxMs || 172800000) || 172800000);
	    if (at && t - at > maxAgeMs) return null;
	    const self = state.self && typeof state.self === 'object' ? state.self : state;
	    return self && typeof self === 'object' ? { ...self } : null;
	  }

	  function writePersistentLastSelfState(selfSummary, t = Date.now()) {
	    if (!selfSummary || typeof selfSummary !== 'object') return;
	    try {
	      localStorage.setItem(LAST_SELF_STATE_KEY, JSON.stringify({
	        at: t,
	        self: selfSummary
	      }));
	    } catch (_) {}
	  }

	  function readPersistentExitState(key, t = Date.now()) {
	    let state = null;
	    try {
	      state = JSON.parse(localStorage.getItem(key) || 'null');
	    } catch (_) {
	      state = null;
	    }
	    if (!state || typeof state !== 'object') return null;
	    const reloginUntil = Number(state.reloginUntil || 0);
	    if (reloginUntil && reloginUntil <= t) {
	      state.reloginUntil = 0;
	      state.holdRemainingMs = 0;
	      state.reloginDelayMs = 0;
	    }
	    return refreshExitDetail({ ...state, restored: true }, t);
	  }

	  function writePersistentExitState(key, detail) {
	    if (!detail || typeof detail !== 'object') return;
	    const t = Date.now();
	    let reloginUntil = Number(detail.reloginUntil || 0);
	    if (reloginUntil && reloginUntil <= t) {
	      detail.reloginUntil = 0;
	      detail.holdRemainingMs = 0;
	      reloginUntil = 0;
	    }
	    const state = refreshExitDetail({
	      at: Number(detail.at || t),
	      updatedAt: t,
	      attempted: Boolean(detail.attempted),
	      method: detail.method || '',
	      error: detail.error || '',
	      reason: detail.reason || '',
	      summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
	      reloginUntil,
	      reloginDelayMs: Number(detail.reloginDelayMs || 0),
	      reloginHpDelayMs: Number(detail.reloginHpDelayMs || 0),
	      reloginDelayRangeMs: detail.reloginDelayRangeMs || null,
	      reloginRepeatDelayMs: Number(detail.reloginRepeatDelayMs || 0),
	      reloginRepeatCount: Number(detail.reloginRepeatCount || 0),
	      reloginMinimumDelayMs: Number(detail.reloginMinimumDelayMs || 0),
	      reloginMinimumReason: detail.reloginMinimumReason || '',
	      enemyActor: detail.enemyActor || null,
	      enemyLeaveStreak: detail.enemyLeaveStreak || null,
	      enemyLeaveReason: detail.enemyLeaveReason || '',
	      loginSuppressReason: detail.loginSuppressReason || '',
	      target: detail.target || null,
	      pursuit: detail.pursuit || null,
	      injury: detail.injury || null,
	      self: detail.self || null,
	      offlineSafety: detail.offlineSafety || null,
	      staminaReset: detail.staminaReset || null
	    }, t);
	    try {
	      localStorage.setItem(key, JSON.stringify(state));
	    } catch (_) {}
	  }

		  function clearPersistentExitState(key) {
		    try {
		      localStorage.removeItem(key);
		    } catch (_) {}
		  }

		  function clearPersistentPendingExitState() {
		    try {
		      localStorage.removeItem(PENDING_EXIT_STATE_KEY);
		    } catch (_) {}
		  }

		  function normalizePendingExitReloadConfirmation(value, pending = null, t = Date.now(), options = {}) {
		    const raw = value && typeof value === 'object'
		      ? value
		      : (pending?.lastResult?.reloadConfirmation && typeof pending.lastResult.reloadConfirmation === 'object' ? pending.lastResult.reloadConfirmation : null);
		    if (!raw?.required) return null;
		    const requestedAt = Number(raw.requestedAt || raw.reloadRequestedAt || 0) || 0;
		    let reloadedAt = Number(raw.reloadedAt || raw.restoredAt || 0) || 0;
		    const restoredAfterReload = Boolean(raw.restoredAfterReload || (options.markReloaded && requestedAt));
		    if (restoredAfterReload && requestedAt && !reloadedAt) reloadedAt = t;
		    return {
		      required: true,
		      reason: String(raw.reason || 'leave-success'),
		      leaveSucceededAt: Number(raw.leaveSucceededAt || raw.succeededAt || pending?.lastResult?.lastLeaveRequest?.completedAt || pending?.lastResult?.at || 0) || 0,
		      requestId: String(raw.requestId || pending?.lastResult?.lastLeaveRequest?.requestId || ''),
		      requestedAt,
		      reloadedAt,
		      restoredAfterReload,
		      count: Math.max(0, Math.round(Number(raw.count || raw.reloadCount || 0) || 0)),
		      lastResult: raw.lastResult || null,
		      lastBlocked: raw.lastBlocked || null
		    };
		  }

		  function normalizePendingExitStateForStorage(value, t = Date.now(), options = {}) {
		    if (!value || typeof value !== 'object') return null;
		    const at = Number(value.at || value.lastAttemptAt || value.updatedAt || 0) || 0;
		    const maxAgeMs = Math.max(60000, Number(cfg.pendingExitPersistMaxMs || 3600000) || 3600000);
		    if (at && t - at > maxAgeMs) return null;
		    const summary = String(value.summary || value.lastResult?.summary || value.reason || '').trim();
		    const normalized = {
		      schemaVersion: 1,
		      scope: String(value.scope || ''),
		      source: String(value.source || ''),
		      reason: String(value.reason || value.lastResult?.reason || ''),
		      summary,
		      displayReason: String(value.displayReason || (summary ? pendingExitDisplayReason(summary) : '')),
		      at: at || t,
		      updatedAt: Number(value.updatedAt || t) || t,
		      lastAttemptAt: Number(value.lastAttemptAt || value.lastResult?.at || at || 0) || 0,
		      retryCount: Math.max(0, Math.round(Number(value.retryCount || 0) || 0)),
		      retryMs: Math.max(0, Math.round(Number(value.retryMs || 0) || 0)),
		      userId: value.userId || value.lastResult?.userId || null,
		      self: cloneForPendingExit(value.self || value.lastResult?.self || null),
		      offlineSafety: cloneForPendingExit(value.offlineSafety || value.lastResult?.offlineSafety || null),
		      target: cloneForPendingExit(value.target || value.lastResult?.target || null),
		      pursuit: cloneForPendingExit(value.pursuit || value.lastResult?.pursuit || null),
		      injury: cloneForPendingExit(value.injury || value.lastResult?.injury || null),
		      combat: cloneForPendingExit(value.combat || value.lastResult?.combat || null),
		      combatCover: cloneForPendingExit(value.combatCover || value.lastResult?.combatCover || value.lastResult?.combat?.leaveCover || null),
		      lastResult: cloneForPendingExit(value.lastResult || null)
		    };
		    const reloadConfirmation = normalizePendingExitReloadConfirmation(value.reloadConfirmation || normalized.lastResult?.reloadConfirmation, normalized, t, options);
		    if (reloadConfirmation) {
		      normalized.reloadConfirmation = reloadConfirmation;
		      if (normalized.lastResult && typeof normalized.lastResult === 'object') {
		        normalized.lastResult.reloadConfirmation = reloadConfirmation;
		        normalized.lastResult.exitPending = true;
		        normalized.lastResult.exitConfirmed = false;
		      }
		    }
		    if (!normalized.retryMs) normalized.retryMs = pendingExitRetryMs(normalized);
		    return normalized;
		  }

		  function readPersistedPendingExitState(t = Date.now(), options = {}) {
		    let raw = null;
		    try {
		      raw = JSON.parse(localStorage.getItem(PENDING_EXIT_STATE_KEY) || 'null');
		    } catch (_) {
		      raw = null;
		    }
		    const normalized = normalizePendingExitStateForStorage(raw, t, options);
		    if (!normalized && raw) clearPersistentPendingExitState();
		    return normalized;
		  }

		  function writePersistentPendingExitState(pending = null) {
		    const normalized = normalizePendingExitStateForStorage(pending || bot.pendingExit, Date.now());
		    if (!normalized) {
		      clearPersistentPendingExitState();
		      return null;
		    }
		    try {
		      localStorage.setItem(PENDING_EXIT_STATE_KEY, safeStringify(normalized));
		    } catch (_) {}
		    return normalized;
		  }

		  function chooseInitialPendingExitState(memoryState, storedState, t = Date.now(), options = {}) {
		    const memory = normalizePendingExitStateForStorage(memoryState, t);
		    const stored = normalizePendingExitStateForStorage(storedState, t, options);
		    if (!memory) return stored;
		    if (!stored) return memory;
		    const memoryStamp = Math.max(Number(memory.updatedAt || 0), Number(memory.lastAttemptAt || 0), Number(memory.at || 0));
		    const storedStamp = Math.max(Number(stored.updatedAt || 0), Number(stored.lastAttemptAt || 0), Number(stored.at || 0));
		    return storedStamp > memoryStamp ? stored : memory;
		  }

		  function refreshExitDetail(detail, t = Date.now()) {
	    if (!detail || typeof detail !== 'object') return detail;
	    const reloginUntil = Number(detail.reloginUntil || 0);
	    if (reloginUntil) detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));
	    if (detail.offlineSafety?.staminaBudgetExit) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina budget coin leave', detail.offlineSafety);
	    } else if (detail.offlineSafety?.staminaExhausted) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina exhausted', detail.offlineSafety);
	    }
	    return finalizeLeaveDisplayReason(detail);
	  }

	  function restoredCoinFailures() {
    const t = performance.now();
    return (preserved.coinFailures || []).map(([id, item]) => {
      const next = { ...(item || {}) };
      const count = Number(next.count || 0);
      const lastAt = Number(next.lastAt || 0);
      const staleFailure = lastAt && t - lastAt > cfg.coinFailureDecayMs;
      let ignoreUntil = Number(next.ignoreUntil || 0);
      if ((next.reason === 'near' || next.reason === 'close') && count <= 1) {
        return null;
      }
      if (!staleFailure) {
        if (count >= cfg.coinFailureSevereIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureSevereIgnoreMs);
        } else if (count >= cfg.coinFailureHardIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureHardIgnoreMs);
        }
      }
      next.ignoreUntil = ignoreUntil;
      return [String(id), next];
    }).filter(Boolean);
  }

			  const restoredFailures = restoredCoinFailures();
			  const restoredEnemyLeaveState = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
			  const restoredOfflineLeaveState = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
			  const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot });
			  const initialPendingExitState = chooseInitialPendingExitState(preserved.pendingExit, restoredPendingExitState, Date.now(), { markReloaded: !previousBot });

			  function loginSnapshotSuccessRequired() {
			    return 0;
			  }

		  function normalizeLoginSnapshotGateState(state = null) {
		    const required = loginSnapshotSuccessRequired();
		    return {
		      streak: Math.max(0, Math.round(Number(state?.streak || 0) || 0)),
		      required,
		      lastOkAt: Number(state?.lastOkAt || 0) || 0,
		      lastErrorAt: Number(state?.lastErrorAt || 0) || 0,
		      lastSampleAt: Number(state?.lastSampleAt || state?.lastOkAt || state?.lastErrorAt || 0) || 0,
		      lastError: String(state?.lastError || ''),
		      lastTick: Number(state?.lastTick || 0) || 0,
		      resetAt: Number(state?.resetAt || 0) || 0,
		      resetReason: String(state?.resetReason || '')
		    };
		  }

  function recordRuntimeDiagnostics(values = {}) {
    try {
      if (!bot.runtimeDiagnostics || typeof bot.runtimeDiagnostics !== 'object') bot.runtimeDiagnostics = {};
      Object.assign(bot.runtimeDiagnostics, values);
    } catch (_) {}
  }

		  const bot = {
	    running: true,
	    version: cfg.version,
	    sourceHash: cfg.sourceHash,
	    sourceUrl: cfg.sourceUrl,
	    injectedBy: cfg.injectedBy,
	    startedAt: Date.now(),
    lastTickAt: 0,
    previousTickAt: 0,
    previousTickSource: '',
    previousTickCombatActive: false,
    lastTickSource: '',
    lastTickGapMs: null,
    lastTickCompletedAt: 0,
    lastTickCombatActive: false,
    lastCombatTickGap: null,
    lastTickReentryGapAt: 0,
    runtimeDiagnostics: {},
    lastStatusAt: 0,
	    lastShotAt: 0,
	    lastAction: null,
	    waitSince: 0,
	    offlineSince: 0,
	    lastLoginAt: Number(preserved.lastLoginAt || 0) || 0,
	    lastLoginResult: preserved.lastLoginResult,
	    lastManualLoginResult: preserved.lastManualLoginResult,
		    pendingExit: initialPendingExitState,
	    lastOfflineLeaveAt: 0,
		    lastOfflineLeaveResult: restoredOfflineLeaveState,
	    offlineReloginUntil: Math.max(0, Number(restoredOfflineLeaveState?.reloginUntil || 0)),
	    lastOfflineLeaveWaitMs: Number(restoredOfflineLeaveState?.reloginDelayMs || restoredOfflineLeaveState?.holdRemainingMs || 0),
    lastOfflineSafety: null,
	    serverPositionStall: null,
	    actionSettlementStall: null,
	    networkQuality: null,
	    lastPursuitLeaveAt: 0,
    lastPursuitLeaveResult: null,
    lastCombatLeaveAt: 0,
    lastCombatLeaveResult: null,
    pendingCombatLeave: null,
	    lastInjuryLeaveAt: 0,
	    lastInjuryLeaveResult: null,
	    pendingInjuryLeave: null,
	    lastEnemyLeaveResult: restoredEnemyLeaveState,
	    lastEnemyLeaveWaitMs: Number(restoredEnemyLeaveState?.reloginDelayMs || restoredEnemyLeaveState?.holdRemainingMs || 0),
	    lastEnemyLeaveRetryAt: 0,
    lastEnemyLeaveRetryResult: null,
	    pursuitReloginUntil: Math.max(0, Number(restoredEnemyLeaveState?.reloginUntil || 0)),
    enemyLeaveStreak: null,
    pursuit: null,
    combatStrafe: null,
    combatTarget: preserved.combatTarget,
    combatRetreatIgnore: preserved.combatRetreatIgnore,
    combatAim: preserved.combatAim,
    combatDisadvantageObservation: preserved.combatDisadvantageObservation,
    lastCombatLogMetric: preserved.lastCombatLogMetric,
    lastCombatShot: preserved.lastCombatShot,
    combatLogging: {
      enabled: Boolean(cfg.combatLoggingEnabled && cfg.combatLogEndpointConfigured),
      endpoint: cfg.combatLogEndpointConfigured ? String(cfg.combatLogEndpoint || 'http://127.0.0.1:18765/combat-log') : '',
      endpointConfigured: Boolean(cfg.combatLogEndpointConfigured),
      combatId: String(preserved.combatLogging?.combatId || ''),
      active: Boolean(preserved.combatLogging?.active),
      startedAt: Number(preserved.combatLogging?.startedAt || 0),
      lastCombatAt: Number(preserved.combatLogging?.lastCombatAt || 0),
      lastQueuedFrameAt: Number(preserved.combatLogging?.lastQueuedFrameAt || 0),
      lastBuiltFrameAt: Number(preserved.combatLogging?.lastBuiltFrameAt || 0),
      lastCoinDiagnosticsAt: Number(preserved.combatLogging?.lastCoinDiagnosticsAt || 0),
      lastCoinDiagnosticsSignature: String(preserved.combatLogging?.lastCoinDiagnosticsSignature || ''),
      lastTargetSwitchDiagnosticsAt: Number(preserved.combatLogging?.lastTargetSwitchDiagnosticsAt || 0),
      lastTargetSwitchDiagnosticsSignature: String(preserved.combatLogging?.lastTargetSwitchDiagnosticsSignature || ''),
      lastFlushAt: 0,
      preBuffer: Array.isArray(preserved.combatLogging?.preBuffer) ? preserved.combatLogging.preBuffer : [],
      pending: Array.isArray(preserved.combatLogging?.pending) ? preserved.combatLogging.pending : [],
      dropped: Number(preserved.combatLogging?.dropped || 0),
      sent: Number(preserved.combatLogging?.sent || 0),
      failed: Number(preserved.combatLogging?.failed || 0),
      failedEntryKeys: Array.isArray(preserved.combatLogging?.failedEntryKeys) ? preserved.combatLogging.failedEntryKeys.slice(-1000) : [],
      sending: false,
      sendingExitAuditIds: [],
      pendingExitAuditIds: [],
      lastError: String(preserved.combatLogging?.lastError || ''),
      lastOkAt: Number(preserved.combatLogging?.lastOkAt || 0),
      sequence: Number(preserved.combatLogging?.sequence || 0)
	    },
	    exitAudit: {
	      sequence: Number(preserved.exitAudit?.sequence || previousBot?.exitAudit?.sequence || 0),
	      requestSequence: Number(preserved.exitAudit?.requestSequence || previousBot?.exitAudit?.requestSequence || 0),
	      restored: 0,
	      lastBlockedReload: null,
	      lastBlockedLogin: null,
	      lastEvent: null
	    },
	    importantLogging: {
	      activeCombat: preserved.importantLogging?.activeCombat || null,
	      queuedRemoteIds: Array.isArray(preserved.importantLogging?.queuedRemoteIds) ? preserved.importantLogging.queuedRemoteIds.slice(-500) : [],
	      restoredRemote: 0,
	      lastEventAt: Number(preserved.importantLogging?.lastEventAt || 0) || 0,
	      lastRemoteQueuedAt: Number(preserved.importantLogging?.lastRemoteQueuedAt || 0) || 0,
	      localWriteError: String(preserved.importantLogging?.localWriteError || ''),
	      lastRemoteError: String(preserved.importantLogging?.lastRemoteError || '')
	    },
		    loginSnapshotGate: normalizeLoginSnapshotGateState(preserved.loginSnapshotGate),
		    loginPointSafety: preserved.loginPointSafety && typeof preserved.loginPointSafety === 'object' ? { ...preserved.loginPointSafety } : null,
		    sessionMismatchRecovery: null,
		    leave403SnapshotRecovery: {
      streak: Math.max(0, Number(preserved.leave403SnapshotRecovery?.streak || 0) || 0),
      required: Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5)),
      lastOkAt: Number(preserved.leave403SnapshotRecovery?.lastOkAt || 0) || 0,
      lastErrorAt: Number(preserved.leave403SnapshotRecovery?.lastErrorAt || 0) || 0,
      lastError: String(preserved.leave403SnapshotRecovery?.lastError || ''),
      clearedAt: Number(preserved.leave403SnapshotRecovery?.clearedAt || 0) || 0,
      clearedReason: String(preserved.leave403SnapshotRecovery?.clearedReason || '')
    },
    clashLeaveRescue: {
      enabled: Boolean(cfg.clashLeaveRescueEnabled),
      running: false,
      lastAt: Number(preserved.clashLeaveRescue?.lastAt || 0) || 0,
      lastStage: String(preserved.clashLeaveRescue?.lastStage || ''),
      lastResult: preserved.clashLeaveRescue?.lastResult && typeof preserved.clashLeaveRescue.lastResult === 'object'
        ? { ...preserved.clashLeaveRescue.lastResult }
        : null,
      attempts: Array.isArray(preserved.clashLeaveRescue?.attempts) ? preserved.clashLeaveRescue.attempts.slice(-8) : []
    },
    postLoginZoom: {
      armed: preserved.postLoginZoom ? Boolean(preserved.postLoginZoom.armed) : true,
      missingSince: Number(preserved.postLoginZoom?.missingSince || 0) || 0,
      generation: Number(preserved.postLoginZoom?.generation || 0) || 0,
      appliedKey: String(preserved.postLoginZoom?.appliedKey || ''),
      scheduledKey: String(preserved.postLoginZoom?.scheduledKey || ''),
      scheduledAt: Number(preserved.postLoginZoom?.scheduledAt || 0) || 0,
      lastSeenSelfAt: Number(preserved.postLoginZoom?.lastSeenSelfAt || 0) || 0,
      lastResult: preserved.postLoginZoom?.lastResult && typeof preserved.postLoginZoom.lastResult === 'object'
        ? { ...preserved.postLoginZoom.lastResult }
        : null
    },
	    reloadRequestedAt: 0,
    lastTarget: null,
	    lastTargetAt: 0,
	    snapshotCoinWaitSince: Number(previousBot?.snapshotCoinWaitSince || 0) || 0,
	    lastSnapshotCoinWaitAgeMs: Number(previousBot?.lastSnapshotCoinWaitAgeMs || 0) || 0,
	    lastCoinSourceSummary: previousBot?.lastCoinSourceSummary || null,
	    coinDiagnostics: null,
	    targetSwitchDiagnostics: {
	      lastFocus: preserved.targetSwitchDiagnostics?.lastFocus || null,
	      lastTargetFocus: preserved.targetSwitchDiagnostics?.lastTargetFocus || null,
	      lastSwitch: preserved.targetSwitchDiagnostics?.lastSwitch || null,
	      events: Array.isArray(preserved.targetSwitchDiagnostics?.events) ? preserved.targetSwitchDiagnostics.events.slice(-24) : []
	    },
	    finalActionArbitration: {
	      lastAction: preserved.finalActionArbitration?.lastAction || null,
	      lastFocus: preserved.finalActionArbitration?.lastFocus || null,
	      lastSelectedAt: Number(preserved.finalActionArbitration?.lastSelectedAt || 0) || 0,
	      lastOverride: preserved.finalActionArbitration?.lastOverride || null,
	      history: Array.isArray(preserved.finalActionArbitration?.history) ? preserved.finalActionArbitration.history.slice(-24) : []
	    },
		    lastSelf: preserved.lastSelf || readPersistentLastSelfState() || null,
		    lastSafety: null,
			    actionThreats: [],
			    opportunityChoice: preserved.opportunityChoice,
			    opportunitySwitchLock: preserved.opportunitySwitchLock,
			    opportunityAfkStamina: preserved.opportunityAfkStamina instanceof Map ? new Map(preserved.opportunityAfkStamina) : new Map(),
			    returnBlockLock: null,
    returnBlockScan: null,
    returnBlockCooldownUntil: 0,
    returnBlockRecentThreatId: '',
    fleeLock: null,
    patrolHeading: null,
    velocityStopTimer: 0,
    velocityPulseToken: 0,
    lastExitMotionStopAt: 0,
    lastExitMotionStopReason: '',
    coinApproachLock: null,
    staleCoinEscape: null,
    coinProgress: null,
    lastCoinCollected: null,
    lastNativeCoinSnapshot: Array.isArray(preserved.lastNativeCoinSnapshot) ? preserved.lastNativeCoinSnapshot.slice(-160) : [],
    coinAttempts: new Map(),
    ignoredCoins: new Map(restoredFailures
      .filter(([, item]) => Number(item?.ignoreUntil || 0) > performance.now())
      .map(([id, item]) => [String(id), Number(item.ignoreUntil)])),
    coinFailures: new Map(restoredFailures),
    nativeMessageWs: null,
    nativeMessageHandler: null,
    nativeOpenHandler: null,
    nativeCloseHandler: null,
    nativeErrorHandler: null,
    directVelocityTimer: 0,
    directVelocityRepeatToken: 0,
    directVelocityRepeatUntil: 0,
    directVelocityStopRepeatsLeft: 0,
    lastDirectVelocityAt: 0,
    lastDirectVelocity: '',
    lastNativeTickAt: 0,
    seenEntities: new Map(),
    session: {
      startedAt: Number(preserved.session?.startedAt || 0) || 0,
      userId: preserved.session?.userId ?? null,
      importantSessionId: String(preserved.session?.importantSessionId || ''),
      importantStartEventId: String(preserved.session?.importantStartEventId || ''),
      importantEndEventId: String(preserved.session?.importantEndEventId || ''),
      exitAt: Number(preserved.session?.exitAt || 0) || 0,
      exitReason: String(preserved.session?.exitReason || ''),
      exitSummary: String(preserved.session?.exitSummary || ''),
      baseCoins: Number.isFinite(Number(preserved.session?.baseCoins)) ? Number(preserved.session.baseCoins) : null,
      coinsGained: Math.max(0, Number(preserved.session?.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(preserved.session?.coinPickupTotal || 0) || 0),
      coinPickupKeys: Array.isArray(preserved.session?.coinPickupKeys) ? preserved.session.coinPickupKeys.slice(-80) : [],
      kills: Math.max(0, Number(preserved.session?.kills || 0) || 0),
      stamina1dSpentBeforeSegment: Math.max(0, Number(preserved.session?.stamina1dSpentBeforeSegment || 0) || 0),
      stamina1dSpentMs: Math.max(0, Number(preserved.session?.stamina1dSpentMs || 0) || 0),
      stamina1dSegmentStartedAt: Number(preserved.session?.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dSegmentBase: Number.isFinite(Number(preserved.session?.stamina1dSegmentBase)) ? Number(preserved.session.stamina1dSegmentBase) : null,
      stamina1dObservedMax: Number.isFinite(Number(preserved.session?.stamina1dObservedMax)) ? Number(preserved.session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(preserved.session?.stamina1dObservedMin)) ? Number(preserved.session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(preserved.session?.stamina1dLastRemaining)) ? Number(preserved.session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(preserved.session?.stamina1dLastLimit)) ? Number(preserved.session.stamina1dLastLimit) : null,
      combatLogSentBase: Number.isFinite(Number(preserved.session?.combatLogSentBase)) ? Number(preserved.session.combatLogSentBase) : null,
      combatLogFailedBase: Number.isFinite(Number(preserved.session?.combatLogFailedBase)) ? Number(preserved.session.combatLogFailedBase) : null,
      missingSince: Number(preserved.session?.missingSince || 0) || 0
    },
	    globalState: { refreshedAt: 0, snapshotRefreshedAt: 0, tick: 0, entities: [], bullets: [], coinDrops: [], messages: [], minimap: null, error: '', samplingOutage: null },
	    control: {
	      ws: null,
	      wsOpen: false,
	      wsReadyState: null,
	      wsUrl: '',
	      currentUserId: 0,
	      hasToken: false,
	      connecting: false,
	      transport: '',
	      nativeWsOpen: false,
	      nativeWsReadyState: null,
	      nativeReconnectEvents: [],
	      nativeReconnectChurn: false,
	      nativeReconnectEventCount: 0,
	      nativeReconnectWindowMs: 0,
	      lastOpenAt: 0,
	      lastMessageAt: 0,
	      lastError: '',
	      lastVelocity: '',
	      lastVelocityAt: 0,
	      nonZeroVelocitySince: 0,
	      lastNonZeroVelocityAt: 0
	    },
    attackHistory: preserved.attackHistory,
    killHistory: preserved.killHistory,
    seenKillKeys: new Set(preserved.seenKillKeys),
    seenKillKeysList: preserved.seenKillKeys,
	    tickCount: 0,
	    starting: true,
	    ticking: false,
	    lastDecision: null,
	    errors: [],
	    lastDebugAt: 0,
	    stopReason: '',
	    targetWhitelist: targetWhitelistState,
	    paused: Boolean(config.paused || readPageGlobal('__graspRatBotPaused', false, pageGlobal)),
	    pauseReason: '',
	    pauseChangedAt: 0,
	    stop(reason = 'manual') {
	      this.running = false;
	      this.stopReason = reason;
	      if (this.velocityStopTimer) clearTimeout(this.velocityStopTimer);
	      this.velocityStopTimer = 0;
	      this.velocityPulseToken += 1;
	      stopMotionSafely('stop');
	      detachNativeMessagePump();
	      closeControlWs(reason);
	      if (this.timer) clearInterval(this.timer);
	      this.timer = 0;
	      if (this.targetWhitelist?.timer) clearInterval(this.targetWhitelist.timer);
	      if (this.targetWhitelist) this.targetWhitelist.timer = 0;
	      try {
	        if (!String(reason || '').startsWith('replaced by ')) flushCombatLogs(true);
	      } catch (_) {}
	      logStatus('stopped: ' + reason);
	      if (readPageGlobal(BOT_KEY, null, pageGlobal) === this) {
	        removeBotPanel();
	        removeTargetOverlay();
	      }
	    },
	    setPaused(paused, reason = 'external') {
	      const next = Boolean(paused);
	      const previousReason = this.pauseReason || '';
	      const changed = this.paused !== next;
	      this.paused = next;
	      this.pauseReason = next ? String(reason || 'manual') : '';
	      const reasonChanged = previousReason !== this.pauseReason;
	      if (changed) this.pauseChangedAt = Date.now();
	      installPageGlobal('__graspRatBotPaused', next, pageGlobal);
	      installPageGlobal('__graspRatBotPauseReason', this.pauseReason, pageGlobal);
	      try {
	        localStorage.setItem(PAUSED_KEY, next ? 'true' : 'false');
	        if (next) localStorage.setItem(PAUSE_REASON_KEY, this.pauseReason || 'manual');
	        else localStorage.removeItem(PAUSE_REASON_KEY);
	      } catch (_) {}
	      if (changed && next) {
	        stopMotionSafely('paused');
	        removeTargetOverlay();
	      }
	      if (next) {
	        this.lastDecision = {
	          kind: 'idle',
	          reason: 'paused',
	          dx: 0,
	          dy: 0,
	          self: this.lastSelf,
	          paused: true,
	          pauseReason: this.pauseReason || 'manual'
	        };
	        renderTargetOverlay(this.lastDecision);
	      }
	      return this.status();
	    },
	    forceLoginNow(reason = 'panel immediate login') {
	      return forceLoginNow(reason);
	    },
	    configureCombatLogging(options = {}) {
	      return configureCombatLogging(options);
	    },
	    configureClashLeaveRescue(options = {}) {
	      if (Object.prototype.hasOwnProperty.call(options || {}, 'enabled')) {
	        cfg.clashLeaveRescueEnabled = Boolean(options.enabled);
	      }
	      if (Object.prototype.hasOwnProperty.call(options || {}, 'timeoutMs')) {
	        cfg.clashLeaveRescueTimeoutMs = Math.max(1000, Number(options.timeoutMs || cfg.clashLeaveRescueTimeoutMs || 9000) || 9000);
	      }
	      this.clashLeaveRescue.enabled = Boolean(cfg.clashLeaveRescueEnabled);
	      return {
	        enabled: Boolean(cfg.clashLeaveRescueEnabled),
	        timeoutMs: Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
	        lastResult: this.clashLeaveRescue.lastResult || null
	      };
	    },
	    step(source = 'external') {
	      return tick(source);
	    },
	    status() {
      try {
        if (!this.ticking) syncPausedFromPage(false);
      } catch (_) {}
      if (this.running && !this.ticking && this.lastTickAt && Date.now() - this.lastTickAt > Math.max(3000, cfg.tickMs * 10)) {
        triggerNativeTick('status-watchdog', false);
      }
      const self = getSelf();
      const currentSelfSummary = self ? summarizeSelf(self) : null;
      const displaySelf = currentSelfSummary || this.lastSelf;
      if (self) updateKillHistory(self);
	      updateSessionStats(currentSelfSummary);
	      const session = summarizeSessionStats(displaySelf);
	      const todaySession = summarizeTodaySessionStats(session, displaySelf);
	      const enemyLeaveDetail = activeEnemyLeaveDetail();
	      const offlineLeaveDetail = activeOfflineLeaveDetail();
	      const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
	      const displayLastDecision = exitMotionLockRemainingMs > 0
	        ? postExitDecisionWithoutTarget(this.lastDecision, this.lastExitMotionStopReason || 'exit-motion-stopped')
	        : this.lastDecision;
		      return {
	        version: cfg.version,
	        sourceHash: cfg.sourceHash,
	        sourceUrl: cfg.sourceUrl,
	        injectedBy: cfg.injectedBy,
	        running: this.running,
	        paused: Boolean(this.paused),
	        pauseReason: this.pauseReason || '',
	        pauseChangedAt: this.pauseChangedAt || 0,
        ticking: Boolean(this.ticking),
        timerActive: Boolean(this.timer),
        dryRun: cfg.dryRun,
        starting: Boolean(this.starting),
        tickCount: this.tickCount,
        uptimeMs: Date.now() - this.startedAt,
        lastTickAt: this.lastTickAt,
        lastTickAgeMs: this.lastTickAt ? Date.now() - this.lastTickAt : null,
        lastTickGapMs: this.lastTickGapMs,
        lastTickSource: this.lastTickSource || '',
        lastTickCompletedAt: this.lastTickCompletedAt || 0,
        lastTickCombatActive: Boolean(this.lastTickCombatActive),
        combatTickGap: this.lastCombatTickGap || null,
        lastTickReentryGapAt: this.lastTickReentryGapAt || 0,
        lastNativeTickAgeMs: this.lastNativeTickAt ? now() - this.lastNativeTickAt : null,
        lastAction: this.lastAction,
	        lastDecision: displayLastDecision,
	        lastTarget: this.lastTarget,
	        combatTarget: this.combatTarget,
	        combatAim: this.combatAim,
	        networkQuality: summarizeNetworkQuality(),
	        targetWhitelist: summarizeTargetWhitelistStatus(),
		        combatLogging: summarizeCombatLoggingStatus(),
		        importantLogging: summarizeImportantLoggingStatus(),
		        exitAudit: {
		          pending: unresolvedExitAuditLogCount(),
		          pendingIds: pendingExitAuditLogIds().slice(0, 12),
		          restored: Number(this.exitAudit?.restored || 0),
		          lastEvent: this.exitAudit?.lastEvent || null,
		          lastBlockedReload: this.exitAudit?.lastBlockedReload || null,
		          lastBlockedLogin: this.exitAudit?.lastBlockedLogin || null
		        },
			        opportunityChoice: this.opportunityChoice,
			        opportunitySwitchLock: this.opportunitySwitchLock,
		        leave403SnapshotRecovery: this.leave403SnapshotRecovery,
		        clashLeaveRescue: {
		          enabled: Boolean(cfg.clashLeaveRescueEnabled),
		          running: Boolean(this.clashLeaveRescue?.running),
		          lastAt: Number(this.clashLeaveRescue?.lastAt || 0) || 0,
		          lastAgeMs: this.clashLeaveRescue?.lastAt ? Math.max(0, Math.round(Date.now() - Number(this.clashLeaveRescue.lastAt || Date.now()))) : null,
		          lastStage: this.clashLeaveRescue?.lastStage || '',
		          lastResult: this.clashLeaveRescue?.lastResult || null,
		          attempts: Array.isArray(this.clashLeaveRescue?.attempts) ? this.clashLeaveRescue.attempts.slice(-8) : []
		        },
		        sessionMismatchRecovery: summarizeSessionMismatchRecoveryStatus(),
		        loginSnapshotGate: snapshotLoginGateStatus(),
	        reloginGate: summarizeReloginGateStatus(),
	        postLoginZoom: this.postLoginZoom,
		        exitMotionStop: {
		          at: this.lastExitMotionStopAt || 0,
		          reason: this.lastExitMotionStopReason || '',
		          lockRemainingMs: exitMotionLockRemainingMs
		        },
		        self: displaySelf,
		        lastSelf: displaySelf,
	        session,
	        todaySession,
        safety: this.lastSafety,
        attackHistory: this.attackHistory.slice(-10),
        killHistory: this.killHistory.slice(-10),
        coinProgress: this.coinProgress,
        lastCoinCollected: this.lastCoinCollected,
        coinAttempts: Array.from(this.coinAttempts.values()).slice(-8).map(item => ({
          id: item.id,
          bestDistance: Math.round(item.bestDistance),
          lastDistance: Math.round(item.lastDistance),
          closeAgeMs: item.closeStartedAt ? Math.max(0, Math.round(now() - item.closeStartedAt)) : 0,
          lastSeenAgeMs: item.lastSeenAt ? Math.max(0, Math.round(now() - item.lastSeenAt)) : 0
        })),
        ignoredCoins: Array.from(this.ignoredCoins.entries()).map(([id, until]) => ({
          id,
          remainingMs: Math.max(0, Math.round(until - now()))
        })),
	        coinFailures: Array.from(this.coinFailures.entries()).slice(-8).map(([id, item]) => ({
	          id,
	          count: Number(item.count || 0),
	          reason: item.reason || '',
	          remainingMs: Math.max(0, Math.round(Number(item.ignoreUntil || 0) - now()))
	        })),
	        snapshotCoinWait: {
	          since: this.snapshotCoinWaitSince || 0,
	          ageMs: Math.max(0, Math.round(Number(this.lastSnapshotCoinWaitAgeMs || 0))),
	          maxMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0))),
	          remainingMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0) - Number(this.lastSnapshotCoinWaitAgeMs || 0)))
	        },
	        coinSources: this.lastCoinSourceSummary,
	        coinDiagnostics: this.coinDiagnostics,
	        targetSwitchDiagnostics: this.targetSwitchDiagnostics,
	        finalActionArbitration: this.finalActionArbitration,
			        globalState: {
			          refreshedAt: this.globalState.refreshedAt,
		          snapshotRefreshedAt: this.globalState.snapshotRefreshedAt,
		          snapshotAgeMs: this.globalState.snapshotRefreshedAt ? Date.now() - this.globalState.snapshotRefreshedAt : null,
		          tick: this.globalState.tick,
	          entities: arrayCount(this.globalState.entities),
	          bullets: arrayCount(this.globalState.bullets),
		          coinDrops: arrayCount(this.globalState.coinDrops),
		          minimapPoints: this.globalState.minimap?.points?.length || 0,
		          error: this.globalState.error,
		          samplingOutage: this.globalState.samplingOutage || null,
		          loginSnapshotGate: snapshotLoginGateStatus()
		        },
        control: summarizeControl(),
        serverPositionStall: summarizeServerPositionStall(),
        actionSettlementStall: summarizeActionSettlementStall(),
        login: {
          lastAt: this.lastLoginAt || 0,
          lastAgeMs: this.lastLoginAt ? Date.now() - this.lastLoginAt : null,
          lastResult: this.lastLoginResult
        },
        pendingExit: summarizePendingExit(this.pendingExit),
        offlineLeave: {
          lastAt: this.lastOfflineLeaveAt || 0,
          lastAgeMs: this.lastOfflineLeaveAt ? Date.now() - this.lastOfflineLeaveAt : null,
          holdUntil: this.offlineReloginUntil || 0,
          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.offlineReloginUntil || 0) - Date.now())),
          safety: this.lastOfflineSafety,
          summary: offlineLeaveDetail?.summary || '',
          displayReason: offlineLeaveDetail?.displayReason || '',
          lastWaitMs: this.lastOfflineLeaveWaitMs || offlineLeaveDetail?.reloginDelayMs || offlineLeaveDetail?.holdRemainingMs || 0,
          lastResult: this.lastOfflineLeaveResult
        },
        pursuit: summarizePursuit(this.pursuit),
	        pursuitLeave: {
	          lastAt: this.lastPursuitLeaveAt || 0,
	          lastAgeMs: this.lastPursuitLeaveAt ? Date.now() - this.lastPursuitLeaveAt : null,
		          holdUntil: this.pursuitReloginUntil || 0,
		          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
		          lastResult: this.lastPursuitLeaveResult
		        },
			        enemyLeave: {
			          holdUntil: this.pursuitReloginUntil || 0,
			          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
			          reason: enemyLeaveDetail?.reason || this.lastInjuryLeaveResult?.reason || this.lastPursuitLeaveResult?.reason || this.lastCombatLeaveResult?.reason || '',
	          summary: enemyLeaveDetail?.summary || latestEnemyLeaveSummary(),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          streak: readEnemyLeaveStreak(),
	          lastWaitMs: this.lastEnemyLeaveWaitMs || enemyLeaveDetail?.reloginDelayMs || enemyLeaveDetail?.holdRemainingMs || 0,
	          enemyActor: enemyLeaveDetail?.enemyActor || null,
	          reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
			          lastInjuryResult: this.lastInjuryLeaveResult,
		          lastPursuitResult: this.lastPursuitLeaveResult,
		          lastCombatResult: this.lastCombatLeaveResult,
	          lastRetryResult: this.lastEnemyLeaveRetryResult
	        },
	        combatLeave: {
	          lastAt: this.lastCombatLeaveAt || 0,
	          lastAgeMs: this.lastCombatLeaveAt ? Date.now() - this.lastCombatLeaveAt : null,
	          lastResult: this.lastCombatLeaveResult,
	          pending: summarizePendingCombatLeave(this.pendingCombatLeave)
	        },
	        stopReason: this.stopReason,
	        errors: this.errors.slice(-5)
	      };
	    }
	  };

${entityActivitySource()}
${targetWhitelistSource()}
${staminaRuntimeSource()}
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkProfitTarget(target)) return targetDrop >= Math.max(0, Number(cfg.attackMinAfkDrop ?? cfg.attackMinDrop));
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };

  function exitMotionStopLockRemainingMs(t = Date.now()) {
    const stoppedAt = Number(bot.lastExitMotionStopAt || 0);
    if (!stoppedAt) return 0;
    const lockMs = Math.max(0, Number(cfg.exitMotionStopLockMs || 0) || 0);
    return Math.max(0, Math.round(stoppedAt + lockMs - t));
  }

  function exitMotionStopActive(t = Date.now()) {
    return exitMotionStopLockRemainingMs(t) > 0;
  }

  function postExitDecisionWithoutTarget(decision, reason = '') {
    const previous = decision && typeof decision === 'object' ? decision : {};
    return {
      ...previous,
      kind: 'wait',
      reason: reason || previous.reason || 'exit-motion-stopped',
      dx: 0,
      dy: 0,
      target: null,
      aimTarget: null,
      opportunisticShot: null,
      combat: false,
      shoot: false,
      forceShoot: false,
      combatCover: null,
      exitMotionStopped: true,
      exitMotionStopReason: reason || bot.lastExitMotionStopReason || '',
      exitMotionLockRemainingMs: exitMotionStopLockRemainingMs()
    };
  }

  function clearPostExitTargetState(reason = 'exit-confirmed') {
    bot.lastTarget = null;
    bot.lastTargetAt = 0;
    bot.opportunityChoice = null;
    resetOpportunitySwitchLock();
    bot.staleCoinEscape = null;
    bot.coinApproachLock = null;
    removeTargetOverlay();
    if (bot.lastDecision && typeof bot.lastDecision === 'object') {
      bot.lastDecision = postExitDecisionWithoutTarget(bot.lastDecision, reason);
      try {
        updateBotPanel(bot.lastDecision);
      } catch (_) {}
    }
  }

${targetOverlaySource()}

${statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay })}

      ${safeStringify.toString()}

      function arrayCount(value) {
        return Array.isArray(value) ? value.length : 0;
      }

      ${safeJsonClone.toString()}

      ${sanitizeCombatLogIdPart.toString()}

${combatLogSource({ combatLogExitSummaryFromDecision })}

      function recordUnhandledTickError(source, err) {
        const entry = {
          at: Date.now(),
          source,
          message: err?.message || String(err),
          stack: String(err?.stack || '')
        };
        try {
          if (!Array.isArray(bot.errors)) bot.errors = [];
          bot.errors.push(entry);
          if (bot.errors.length > 20) bot.errors.splice(0, bot.errors.length - 20);
        } catch (_) {}
        try {
          console.error('[grasp-rat-bot:unhandled-tick]', err);
        } catch (_) {}
        return entry;
      }

      function runTickSafely(source = 'timer') {
        const tickStartedAt = Date.now();
        const tickStartedPerf = now();
        recordRuntimeDiagnostics({
          lastTickStartedAt: tickStartedAt,
          lastTickSource: source
        });
        return Promise.resolve()
          .then(() => tick(source))
          .catch(err => {
            recordUnhandledTickError(source, err);
          })
          .finally(() => {
            recordRuntimeDiagnostics({
              lastTickCompletedAt: Date.now(),
              lastTickDurationMs: Math.max(0, Math.round(now() - tickStartedPerf)),
              lastTickSource: source
            });
          });
      }

      function runCallbackSafely(label, fn) {
        return function (...args) {
          try {
            const result = fn.apply(this, args);
            if (result && typeof result.then === 'function') {
              result.catch(err => recordUnhandledTickError(label, err));
            }
            return result;
          } catch (err) {
            recordUnhandledTickError(label, err);
            return undefined;
          }
        };
      }

			${controlLoginSource({ staminaExhaustedWindowLabel })}

${pageNativeSnapshotSource()}

${exitReloginSource()}
${pendingExitSource()}${leaveCommandSource()}${autoLoginSource()}${leaveFlowSource()}${nativeStateSource()}

${runtimeSummarySource()}

${networkQualitySource()}

${networkQualitySummarySource()}

${importantLogSource()}
${combatHistorySource()}
${entityRefreshSource()}${nativeControlSource()}

${coinMotionRuntimeSource()}

${returnBlockSource()}

${classifySource()}${offlineSafetySource()}
	${coinSafetySource()}${targetSelectionSource()}${combatMovementSource()}${combatAimSource()}  function opportunityEffectiveStaminaCost(staminaCost) {
    return opportunityEffectiveStaminaCostCore(staminaCost, {
      distanceFloor: cfg.opportunityDistanceFloor
    });
  }

  function opportunityMoveStaminaCost(distance, stopDistance = 0) {
    const travel = Math.max(0, Number(distance || 0) - Math.max(0, Number(stopDistance || 0)));
    return travel * Math.max(0, Number(cfg.opportunityMoveStaminaPerCm ?? 1));
  }

  function opportunityCoinStaminaCost(coin) {
    const override = Number(coin?.opportunityStaminaCost ?? coin?.staminaCost ?? NaN);
    if (Number.isFinite(override) && override >= 0) return override;
    return opportunityMoveStaminaCost(coin?.distance, 0)
      + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
  }

  function estimatedKillShots(target) {
    const damage = Math.max(0.1, Number(cfg.opportunityEstimatedDamagePerShot || 3));
    const hp = Math.max(1, Number(combatHpValue(target) || 100));
    return Math.max(1, Math.ceil(hp / damage));
  }

  function opportunityEnemyStaminaCost(target) {
    const moveCost = opportunityMoveStaminaCost(target?.distance, 0);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }

	  function opportunityWindowStaminaBudget(self, windowName) {
	    const remaining = staminaRemaining(self, windowName);
	    if (!Number.isFinite(remaining)) return Infinity;
	    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
	    return Math.max(0, remaining - reserve);
	  }

	  function opportunityLongStaminaBudget(self) {
	    const values = ['1h', '1d']
	      .map(key => opportunityWindowStaminaBudget(self, key))
	      .filter(value => Number.isFinite(value));
	    if (!values.length) return Infinity;
	    return Math.min(...values);
	  }

	  ${dailyStaminaBudgetIsLimitingCore.toString()}
	  ${summarizeBlockedStaminaOpportunityCore.toString()}
	  ${summarizeNearestCoinStaminaBudgetExitCore.toString()}
	  ${pickNearestDailyStaminaFinalCoinCore.toString()}

	  function dailyStaminaBudgetIsLimiting(self, staminaCost = 0) {
	    return dailyStaminaBudgetIsLimitingCore(
	      staminaCost,
	      opportunityWindowStaminaBudget(self, '1h'),
	      opportunityWindowStaminaBudget(self, '1d')
	    );
	  }

  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

	  function summarizeBlockedStaminaOpportunity(self, coins, targets = []) {
	    return summarizeBlockedStaminaOpportunityCore(coins, targets, {
	      budget: opportunityLongStaminaBudget(self),
	      coinStaminaCost: opportunityCoinStaminaCost,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      targetDrop: dropValue
	    });
	  }

	  function summarizeNearestCoinStaminaBudgetExit(self, coins) {
	    return summarizeNearestCoinStaminaBudgetExitCore(self, coins, {
	      budget: opportunityWindowStaminaBudget(self, '1h'),
	      dist,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      reloginDelayMs: staminaBudgetReloginDelayMs()
	    });
	  }

	  function pickNearestDailyStaminaFinalCoin(self, coins, activeThreats) {
	    return pickNearestDailyStaminaFinalCoinCore(
	      safeCoinCandidates(coins, activeThreats, cfg.globalCoinMaxDistance, self),
	      {
	        isSnapshotOnlyCoin,
	        coinStaminaCost: opportunityCoinStaminaCost,
	        dailyStaminaBudgetIsLimiting: staminaCost => dailyStaminaBudgetIsLimiting(self, staminaCost)
	      }
	    );
	  }

	  function dailyStaminaFinalCoinAction(self, coin) {
	    if (!coin) return null;
	    const action = buildCoinAction(
	      self,
	      coin,
	      'daily-stamina-final-visible-coin',
	      coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
	    );
	    return {
	      ...action,
	      dailyStaminaFinalRun: {
	        staminaCost: Math.round(opportunityCoinStaminaCost(coin)),
	        budgetMs: Math.max(0, Math.round(opportunityWindowStaminaBudget(self, '1d'))),
	        distance: Math.round(Number(coin.distance || 0)),
	        amount: Math.max(0, Math.round(Number(coin.amount || 0)))
	      }
	    };
	  }

	  function staminaBudgetCoinLeaveSummary(staminaBudgetExit) {
	    const detail = staminaBudgetExit || {};
	    return '一小时体力预算不足，最近金币距离' + formatDistance(detail.distance)
	      + '，预算' + formatDurationMs(detail.budgetMs)
	      + '，需要' + formatDurationMs(detail.requiredMs)
	      + '，差' + formatDurationMs(detail.shortageMs)
	      + '，退出等待重连';
	  }

	  function staminaBudgetCoinLeaveDisplay(staminaBudgetExit) {
	    return staminaBudgetCoinLeaveSummary(staminaBudgetExit)
	      + '，等待' + formatDurationMs(staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs());
	  }

	  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
	    return {
	      kind: 'leave',
	      reason: 'stamina-budget-coin-leave',
	      dx: 0,
	      dy: 0,
	      offline: true,
	      ignoreReturnBlock: true,
	      displayReason: staminaBudgetCoinLeaveDisplay(staminaBudgetExit),
	      staminaBudgetExit,
	      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs()
	    };
	  }

  function opportunityValueScore(value, staminaCost, weight = cfg.coinOpportunityValue) {
    return opportunityValueScoreCore(value, staminaCost, {
      weight,
      distanceFloor: cfg.opportunityDistanceFloor,
      distanceScoreScale: cfg.opportunityDistanceScoreScale
    });
  }

	  function compareCoinOpportunity(a, b) {
	    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
	    if (scoreDiff) return scoreDiff;
	    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
	    if (amountDiff) return amountDiff;
	    return Number(a.distance || 0) - Number(b.distance || 0);
	  }

	  function mergeCoinRouteDisplay(base, routeCoin) {
	    return mergeCoinRouteDisplayCore(base, routeCoin);
	  }

  function combatTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === null || id === undefined ? '' : String(id);
  }

  function combatRetreatIgnoreActive(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id || !bot.combatRetreatIgnore) return false;
    const until = Number(bot.combatRetreatIgnore.get(id) || 0);
    if (!until) return false;
    if (until <= t) {
      bot.combatRetreatIgnore.delete(id);
      return false;
    }
    return true;
  }

  function rememberCombatRetreatIgnore(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id) return;
    if (!bot.combatRetreatIgnore) bot.combatRetreatIgnore = new Map();
    bot.combatRetreatIgnore.set(id, t + Math.max(1000, Number(cfg.combatRetreatIgnoreMs || 0) || 15000));
  }

  function clearCombatDisadvantageObservation(reason = '') {
    if (!bot.combatDisadvantageObservation) return;
    bot.lastCombatDisadvantageObservationClear = { at: Date.now(), reason };
    bot.combatDisadvantageObservation = null;
  }

  function combatDisadvantageObservationState(target, kind, evidence = {}) {
    const id = combatTargetId(target);
    if (!id || !kind) return null;
    const t = Date.now();
    const previous = bot.combatDisadvantageObservation || null;
    const same = previous && String(previous.id || '') === id && String(previous.kind || '') === String(kind);
    const currentTarget = bot.combatTarget && String(bot.combatTarget.id ?? '') === id ? bot.combatTarget : null;
    const firstAt = same ? Number(previous.firstAt || previous.at || t) : t;
    const count = Math.max(1, same ? Number(previous.count || 1) + 1 : 1);
    const engagedAt = Number(currentTarget?.firstSeenAt || currentTarget?.at || firstAt || t);
    const observedMs = Math.max(0, t - firstAt);
    const engagedMs = Math.max(0, t - engagedAt);
    const confirmMs = Math.max(0, Number(cfg.combatDisadvantageConfirmMs || 0));
    const minEngageMs = Math.max(0, Number(cfg.combatDisadvantageMinEngageMs || 0));
    const minSamples = Math.max(1, Math.round(Number(cfg.combatDisadvantageMinSamples || 1)));
    const sampleCount = Math.max(
      count,
      Math.round(Number(evidence?.sampleCount || 0)),
      Array.isArray(currentTarget?.motionSamples) ? currentTarget.motionSamples.length : 0
    );
    const remainingMs = Math.max(0, confirmMs - observedMs, minEngageMs - engagedMs);
    const samplesRemaining = Math.max(0, minSamples - sampleCount);
    const state = {
      active: true,
      id,
      kind: String(kind),
      firstAt,
      at: t,
      observedMs: Math.round(observedMs),
      engagedMs: Math.round(engagedMs),
      count,
      sampleCount,
      confirmMs,
      minEngageMs,
      minSamples,
      remainingMs: Math.round(remainingMs),
      samplesRemaining,
      ready: remainingMs <= 0 && samplesRemaining <= 0,
      evidence
    };
    bot.combatDisadvantageObservation = state;
    return state;
  }

  function combatAimDamageState(target) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget;
    const same = previous && id && String(previous.id ?? '') === id;
    const t = Date.now();
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
    const noDamageMs = Math.max(0, t - lastDamageAt);
    return {
      damaged,
      currentHp,
      previousHp,
      lastDamageAt,
      noDamageMs,
      widenMs: Math.max(0, noDamageMs - Math.max(0, Number(cfg.combatAimNoDamageMs) || 0))
    };
  }

  function combatLowHpNoDamageLeaveState(selfHp, targetHp, damageState) {
    const threshold = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveThreshold || 0));
    const waitMs = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveMs || 0));
    const minGap = Number.isFinite(Number(cfg.combatLowHpNoDamageMinGap))
      ? Number(cfg.combatLowHpNoDamageMinGap)
      : 0;
    const hpGap = Number(targetHp) - Number(selfHp);
    const noDamageMs = Number(damageState?.noDamageMs || 0);
    if (!threshold || !waitMs || !(Number(selfHp) < threshold) || !(hpGap >= minGap) || !(noDamageMs >= waitMs)) return null;
    return { selfHp, targetHp, hpGap, noDamageMs, threshold, waitMs, minGap };
  }

  function combatRetreatingTargetState(self, target, targetDistance, damageState = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const disengageRange = Math.max(attackRange, Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || attackRange || 0));
    const edgeRange = Math.min(
      attackRange || Infinity,
      Math.max(0, Number(cfg.combatRetreatEdgeRange || 0) || attackRange * 0.95)
    );
    const minRadialSpeed = Math.max(0, Number(cfg.combatRetreatRadialSpeedMin || cfg.combatStationarySpeed || 0));
    const minDistanceDelta = Math.max(0, Number(cfg.combatRetreatDistanceDeltaMin || 0));
    const dx = Number(target?.x) - Number(self?.x);
    const dy = Number(target?.y) - Number(self?.y);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : Math.hypot(dx, dy);
    const d = Math.max(1, Number.isFinite(distance) ? distance : Math.hypot(dx, dy));
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    const radialSpeed = (dx / d) * vx + (dy / d) * vy;
    const previous = bot.combatTarget;
    const same = previous && combatTargetId(previous) && combatTargetId(previous) === combatTargetId(target);
    const previousDistance = same && Number.isFinite(Number(previous.distance)) ? Number(previous.distance) : null;
    const distanceDelta = previousDistance === null ? 0 : distance - previousDistance;
    const receding = Boolean(
      (minRadialSpeed > 0 && radialSpeed >= minRadialSpeed)
      || (minDistanceDelta > 0 && distanceDelta >= minDistanceDelta)
    );
    const outOfRange = attackRange > 0 && distance > attackRange;
    const beyondDisengage = disengageRange > 0 && distance > disengageRange;
    const edge = edgeRange > 0 && distance >= edgeRange;
    const active = Boolean(receding && (outOfRange || edge));
    return {
      active,
      disengage: Boolean(beyondDisengage),
      suppressFire: Boolean(active && edge),
      reason: beyondDisengage ? 'target-beyond-disengage-range' : (outOfRange ? 'target-out-of-attack-range' : 'target-retreating-edge'),
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      attackRange: Math.round(attackRange),
      disengageRange: Math.round(disengageRange),
      edgeRange: Math.round(edgeRange),
      radialSpeed: Number.isFinite(radialSpeed) ? Math.round(radialSpeed) : 0,
      distanceDelta: Number.isFinite(distanceDelta) ? Math.round(distanceDelta) : 0,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, realBulletPressure = false, serverPositionStall = null) {
    const waitMs = Math.max(0, Number(cfg.combatServerStallNoDamageLeaveMs || 0));
    const precisionWaitMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const precisionGraceMs = Math.max(0, Number(cfg.combatServerStallNoDamagePrecisionGraceMs || 0));
    const effectiveWaitMs = Math.max(waitMs, precisionWaitMs ? precisionWaitMs + precisionGraceMs : waitMs);
    const minGap = Math.max(0, Number(cfg.combatServerStallNoDamageHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - hp;
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const stall = serverPositionStall || {};
    if (!waitMs || !stall.stalled || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(hpGap)) return null;
    if (elapsed < effectiveWaitMs || hpGap < minGap) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      waitMs,
      effectiveWaitMs,
      precisionWaitMs,
      precisionGraceMs,
      minGap,
      realBulletPressure: true,
      serverPositionStall: {
        stalled: true,
        reason: stall.reason || 'server-position-stalled',
        movingMs: Number.isFinite(Number(stall.movingMs)) ? Math.round(Number(stall.movingMs)) : null,
        gap: Number.isFinite(Number(stall.gap)) ? Math.round(Number(stall.gap)) : null,
        gapDelta: Number.isFinite(Number(stall.gapDelta)) ? Math.round(Number(stall.gapDelta)) : null,
        holdRemainingMs: Number.isFinite(Number(stall.holdRemainingMs)) ? Math.round(Number(stall.holdRemainingMs)) : null
      }
    };
  }

  function combatTrendState(self, options = {}) {
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const targetDistance = Number(options.targetDistance);
    const noDamageMs = Math.max(0, Number(options.noDamageMs || 0));
    const hpGap = Number(targetHp) - Number(selfHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const finishLowThreatMinHp = Math.max(0, Number(cfg.combatShootFinishLowThreatMinHp || 0));
    const finishLowThreatTargetHpMax = Math.max(0, Number(cfg.combatShootFinishLowThreatTargetHpMax || 0));
    const finishLowThreatMaxHpGap = Math.max(0, Number(cfg.combatShootFinishLowThreatMaxHpGap || 0));
    const finishLowThreatRange = Math.max(0, Number(cfg.combatShootFinishLowThreatRange || 0));
    const finishLowThreatFireWindow = !Boolean(options.realBulletPressure)
      && finishLowThreatMinHp > 0
      && finishLowThreatRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= finishLowThreatMinHp
      && targetHp <= finishLowThreatTargetHpMax
      && hpGap <= finishLowThreatMaxHpGap
      && targetDistance <= finishLowThreatRange;
    const passiveRunnerFireWindow = Boolean(options.passiveRunner)
      && !Boolean(options.realBulletPressure)
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const targetPressureFire = options.targetRealBulletPressure !== undefined
      ? Boolean(options.targetRealBulletPressure)
      : Boolean(options.realBulletPressure);
    const opponentProbeMs = Math.max(0, Number(cfg.combatOpponentProbeMs || 0));
    const opponentProbeEngagedMs = Math.max(0, Number(options.opponentProbeEngagedMs || 0));
    const opponentProbeSeenTargetRealBullet = Math.max(0, Number(options.opponentProbeSeenTargetRealBulletMs || 0)) > 0;
    const pressureMinHp = Math.max(0, Number(cfg.combatShootPressureMinHp || 0));
    const pressureRange = Math.max(0, Number(cfg.combatShootPressureRange || 0));
    const pressureMaxHpGap = Math.max(0, Number(cfg.combatShootPressureMaxHpGap || 0));
    const closePressureFireWindow = targetPressureFire
      && pressureMinHp > 0
      && pressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= pressureMinHp
      && hpGap <= pressureMaxHpGap
      && targetDistance <= pressureRange;
    const winningPressureMinHp = Math.max(0, Number(cfg.combatShootWinningPressureMinHp || 0));
    const winningPressureTargetHpMax = Math.max(0, Number(cfg.combatShootWinningPressureTargetHpMax || 0));
    const winningPressureLeadHp = Math.max(0, Number(cfg.combatShootWinningPressureLeadHp || 0));
    const winningPressureRange = Math.max(0, Number(cfg.combatShootWinningPressureRange || 0));
    const winningPressureNoDamageMs = Math.max(0, Number(cfg.combatShootWinningPressureNoDamageMs || 0));
    const winningPressureFireWindow = targetPressureFire
      && winningPressureMinHp > 0
      && winningPressureTargetHpMax > 0
      && winningPressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= winningPressureMinHp
      && targetHp <= winningPressureTargetHpMax
      && hpGap <= -winningPressureLeadHp
      && noDamageMs >= winningPressureNoDamageMs
      && targetDistance <= winningPressureRange;
    const steadyAimMinHp = Math.max(0, Number(cfg.combatShootSteadyAimMinHp || 0));
    const steadyAimMaxHpGap = Math.max(0, Number(cfg.combatShootSteadyAimMaxHpGap || 0));
    const steadyAimNoDamageMs = Math.max(0, Number(cfg.combatShootSteadyAimNoDamageMs || cfg.combatAimSteadyNoDamageMs || 0));
    const steadyAimFireWindow = Boolean(options.steadyAim)
      && steadyAimMinHp > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && selfHp >= steadyAimMinHp
      && hpGap <= steadyAimMaxHpGap
      && noDamageMs >= steadyAimNoDamageMs;
    const noDamageDuelMinHp = Math.max(0, Number(cfg.combatShootNoDamageDuelMinHp || 0));
    const noDamageDuelMaxHpGap = Math.max(0, Number(cfg.combatShootNoDamageDuelMaxHpGap || 0));
    const noDamageDuelNoDamageMs = Math.max(0, Number(cfg.combatShootNoDamageDuelNoDamageMs || 0));
    const noDamageDuelRange = Math.max(0, Number(cfg.combatShootNoDamageDuelRange || cfg.combatAttackRange || 0));
    const farNoDamageCloseMinHp = Math.max(noDamageDuelMinHp, Number(cfg.combatFarNoDamageCloseMinHp || 0));
    const farNoDamageCloseFireWindow = Boolean(options.farNoDamageClose)
      && farNoDamageCloseMinHp > 0
      && Number.isFinite(selfHp)
      && selfHp >= farNoDamageCloseMinHp;
    const noDamageDuelFireWindow = Boolean(options.engagedCombat || options.targetActive || options.targetMoving)
      && noDamageDuelMinHp > 0
      && noDamageDuelNoDamageMs > 0
      && noDamageDuelRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= noDamageDuelMinHp
      && hpGap <= noDamageDuelMaxHpGap
      && noDamageMs >= noDamageDuelNoDamageMs
      && targetDistance <= noDamageDuelRange;
    const opponentProbeFireWindow = Boolean(
      opponentProbeMs > 0
      && opponentProbeEngagedMs < opponentProbeMs
      && Boolean(options.targetActive)
      && !Boolean(options.realBulletPressure)
      && !targetPressureFire
      && !opponentProbeSeenTargetRealBullet
      && !finishLowThreatFireWindow
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0))
    );
    let stance = 'normal';
    if (winningPressureFireWindow) stance = 'winning-pressure';
    else if (closePressureFireWindow) stance = 'close-pressure';
    else if (opponentProbeFireWindow) stance = 'opponent-probe';
    else if (passiveRunnerFireWindow) stance = 'passive-runner';
    else if (finishLowThreatFireWindow) stance = 'finish-low-threat';
    else if (steadyAimFireWindow) stance = 'steady-aim';
    else if (noDamageDuelFireWindow) stance = 'no-damage-duel';
    else if (farNoDamageCloseFireWindow) stance = 'far-no-damage-close';
    else if (highHpFireWindow) stance = 'high-hp-pressure';
    else if (Number.isFinite(hpGap) && hpGap > 0) stance = 'guarded';
    return {
      stance,
      selfHp,
      targetHp,
      hpGap,
      targetDistance,
      noDamageMs,
      highHpFireWindow,
      passiveRunnerFireWindow,
      opponentProbeFireWindow,
      opponentProbeEngagedMs,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
      noDamageDuelFireWindow,
      farNoDamageCloseFireWindow,
      engagedCombat: Boolean(options.engagedCombat),
      targetActive: Boolean(options.targetActive),
      targetMoving: Boolean(options.targetMoving),
      passiveRunner: Boolean(options.passiveRunner),
      opponentProbe: opponentProbeFireWindow,
      realBulletPressure: Boolean(options.realBulletPressure),
      targetRealBulletPressure: targetPressureFire,
      steadyAim: Boolean(options.steadyAim),
      farNoDamageClose: farNoDamageCloseFireWindow
    };
  }

  function combatTickActiveFromState(state = {}) {
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const decision = state.decision || null;
    const recentCombatMs = Math.max(1000, Number(cfg.combatEngageStickMs || 0), Number(cfg.combatEngageGraceMs || 0));
    const combatAt = Number(state.combatTarget?.at || 0);
    if (decision?.combat || decision?.combatCover || /^combat-/.test(String(decision?.reason || ''))) return true;
    if (combatAt && t - combatAt <= recentCombatMs) return true;
    if (state.pendingExit && /^combat-/.test(String(state.pendingExit.reason || state.pendingExit.rootReason || ''))) return true;
    return false;
  }

  function globalSamplingOutageOfflineState(self = null, options = {}) {
    if (!cfg.globalSamplingOutageOfflineEnabled) return null;
    const outage = options.outage || bot.globalState.samplingOutage || null;
    if (!outage?.active) return null;
    const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const minErrors = Math.max(1, Number(cfg.globalSamplingOutageMinErrors || 1));
    const errorCount = Math.max(0, Number(outage.errorCount || 0));
    if (errorCount < minErrors) return null;
    const firstAt = Number(outage.firstAt || 0) || t;
    const ageMs = Math.max(Number(outage.ageMs || 0), Math.max(0, t - firstAt));
    const minAgeMs = Math.max(0, Number(cfg.globalSamplingOutageMinAgeMs || 0));
    if (ageMs < minAgeMs) return null;
    const combatActive = Boolean(outage.combatActive) || combatTickActiveFromState({
      decision: bot.lastDecision,
      combatTarget: bot.combatTarget,
      pendingExit: bot.pendingExit || bot.pendingCombatLeave,
      nowMs: t
    });
    if (cfg.globalSamplingOutageCombatOnly && !combatActive) return null;
    return {
      active: true,
      reason: 'global sampling outage',
      firstAt,
      lastAt: Number(outage.lastAt || 0) || t,
      ageMs,
      errorCount,
      minErrors,
      minAgeMs,
      combatOnly: Boolean(cfg.globalSamplingOutageCombatOnly),
      combatActive,
      visibilityState: outage.visibilityState || document.visibilityState || '',
      self: self ? summarizeSelf(self) : null,
      error: outage.error || bot.globalState.error || '',
      snapshotError: outage.snapshotError || '',
      minimapError: outage.minimapError || '',
      snapshotTimedOut: Boolean(outage.snapshotTimedOut),
      minimapTimedOut: Boolean(outage.minimapTimedOut),
      snapshotAgeMs: Number.isFinite(Number(outage.snapshotAgeMs)) ? Math.max(0, Math.round(Number(outage.snapshotAgeMs))) : null,
      refreshDurationMs: Number.isFinite(Number(outage.refreshDurationMs)) ? Math.max(0, Math.round(Number(outage.refreshDurationMs))) : null,
      snapshotDurationMs: Number.isFinite(Number(outage.snapshotDurationMs)) ? Math.max(0, Math.round(Number(outage.snapshotDurationMs))) : null,
      minimapDurationMs: Number.isFinite(Number(outage.minimapDurationMs)) ? Math.max(0, Math.round(Number(outage.minimapDurationMs))) : null,
      lastTickDurationMs: Number.isFinite(Number(outage.lastTickDurationMs ?? bot.runtimeDiagnostics?.lastTickDurationMs)) ? Math.max(0, Math.round(Number(outage.lastTickDurationMs ?? bot.runtimeDiagnostics?.lastTickDurationMs))) : null,
      lastTickSource: outage.lastTickSource || bot.runtimeDiagnostics?.lastTickSource || '',
      lastCombatLogBuildMs: Number.isFinite(Number(outage.lastCombatLogBuildMs ?? bot.runtimeDiagnostics?.lastCombatLogBuildMs)) ? Math.max(0, Math.round(Number(outage.lastCombatLogBuildMs ?? bot.runtimeDiagnostics?.lastCombatLogBuildMs))) : null,
      lastCombatLogRecordMs: Number.isFinite(Number(outage.lastCombatLogRecordMs ?? bot.runtimeDiagnostics?.lastCombatLogRecordMs)) ? Math.max(0, Math.round(Number(outage.lastCombatLogRecordMs ?? bot.runtimeDiagnostics?.lastCombatLogRecordMs))) : null
    };
  }

  function combatTickGapOfflineState(self = null, options = {}) {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const previousTickAt = Number(options.previousTickAt ?? bot.previousTickAt ?? 0) || 0;
    const tickGapMs = Number.isFinite(Number(options.tickGapMs ?? bot.lastTickGapMs))
      ? Math.max(0, Math.round(Number(options.tickGapMs ?? bot.lastTickGapMs)))
      : null;
    const tickInProgressMs = Number.isFinite(Number(options.tickInProgressMs))
      ? Math.max(0, Math.round(Number(options.tickInProgressMs)))
      : null;
    const lastTickCompletedGapMs = Number.isFinite(Number(options.lastTickCompletedGapMs))
      ? Math.max(0, Math.round(Number(options.lastTickCompletedGapMs)))
      : null;
    const combatLogActive = Boolean(bot.combatLogging?.active);
    const queuedCombatFrameAt = Number(bot.combatLogging?.lastQueuedFrameAt || 0) || 0;
    const metricCombatFrameAt = Number(bot.lastCombatLogMetric?.at || 0) || 0;
    const lastCombatFrameAt = queuedCombatFrameAt || (combatLogActive ? metricCombatFrameAt : 0);
    const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
    const lastBuiltFrameAt = Number(bot.combatLogging?.lastBuiltFrameAt || 0) || 0;
    const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
    const lastCombatAt = Number(bot.combatLogging?.lastCombatAt || 0) || 0;
    const combatLogGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
    const previousCombatActive = Boolean(options.previousCombatActive ?? bot.previousTickCombatActive ?? bot.lastTickCombatActive);
    const currentCombatActive = combatTickActiveFromState({
      decision: bot.lastDecision,
      combatTarget: bot.combatTarget,
      pendingExit: bot.pendingExit || bot.pendingCombatLeave,
      nowMs: t
    });
    const recentCombatContextMs = Math.max(
      thresholdMs,
      Number(cfg.combatEngageStickMs || 0),
      Number(cfg.combatEngageGraceMs || 0),
      Number(cfg.combatLogPostBufferMs || 0)
    );
    const recentCombatFrameContext = Boolean(lastCombatFrameAt
      && recentCombatContextMs > 0
      && t - lastCombatFrameAt <= recentCombatContextMs);
    if (!previousCombatActive && !currentCombatActive && !combatLogActive && !recentCombatFrameContext) return null;
    const liveCombatContext = previousCombatActive || currentCombatActive || combatLogActive;
    const reentryGap = Boolean(options.reentry && (
      (tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
      || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)
    ));
    const mainLoopGap = Boolean(!reentryGap && previousTickAt && tickGapMs !== null && tickGapMs >= thresholdMs);
    const combatFrameGap = !reentryGap && !mainLoopGap && liveCombatContext && combatFrameGapMs !== null && combatFrameGapMs >= thresholdMs;
    if (!reentryGap && !mainLoopGap && !combatFrameGap) return null;
    const diagnosis = reentryGap ? 'tick-reentry-gap'
      : (mainLoopGap ? 'main-loop-gap' : 'combat-log-gap-with-active-tick');
    const likelyCause = reentryGap ? 'main-loop-stuck-or-awaiting-async'
      : (mainLoopGap ? 'js-or-main-loop-paused' : 'combat-state-or-log-gating-gap');
    return {
      active: true,
      reason: 'combat tick gap',
      diagnosis,
      likelyCause,
      thresholdMs,
      tickGapMs,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt,
      currentTickAt: t,
      previousTickSource: options.previousTickSource || bot.previousTickSource || '',
      currentTickSource: options.source || bot.lastTickSource || '',
      previousCombatActive,
      currentCombatActive,
      combatLogActive,
      liveCombatContext,
      recentCombatFrameContext,
      recentCombatContextMs,
      queuedCombatFrameAt,
      metricCombatFrameAt,
      lastCombatFrameAt,
      combatFrameGapMs,
      lastBuiltFrameAt,
      builtFrameGapMs,
      lastCombatAt,
      combatLogGapMs,
      self: self ? summarizeSelf(self) : null,
      lastDecisionReason: bot.lastDecision?.reason || '',
      visibilityState: document.visibilityState || ''
    };
  }

  async function handleTickReentryCombatGap(source = 'timer') {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Date.now();
    const tickInProgressMs = bot.lastTickAt ? Math.max(0, Math.round(t - Number(bot.lastTickAt || t))) : null;
    const lastTickCompletedGapMs = bot.lastTickCompletedAt ? Math.max(0, Math.round(t - Number(bot.lastTickCompletedAt || t))) : null;
    if ((tickInProgressMs === null || tickInProgressMs < thresholdMs)
      && (lastTickCompletedGapMs === null || lastTickCompletedGapMs < thresholdMs)) {
      return null;
    }
    const self = getSelf();
    if (!self || !isAlive(self)) return null;
    const combatTickGap = combatTickGapOfflineState(self, {
      source,
      nowMs: t,
      reentry: true,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt: bot.lastTickAt || bot.previousTickAt || 0,
      previousTickSource: bot.lastTickSource || bot.previousTickSource || '',
      previousCombatActive: Boolean(bot.previousTickCombatActive || bot.lastTickCombatActive)
    });
    if (!combatTickGap) return null;
    bot.lastCombatTickGap = combatTickGap;
    if (t - Number(bot.lastTickReentryGapAt || 0) < thresholdMs) return combatTickGap;
    bot.lastTickReentryGapAt = t;
    const currentSummary = summarizeSelf(self);
    bot.lastSelf = currentSummary;
    updateSessionStats(currentSummary);
    stopMotionSafely('combat-tick-reentry-gap');
    if (!bot.offlineSince) bot.offlineSince = t;
    const offlineAgeMs = Math.max(0, Date.now() - Number(bot.offlineSince || Date.now()));
    const offlineSafety = {
      ...assessOfflineSafety(self),
      combatTickGap
    };
    bot.lastOfflineSafety = offlineSafety;
    const leaveResult = !cfg.dryRun && !cfg.once
      ? await leaveOffline('combat tick gap', currentSummary, offlineSafety)
      : null;
    const offlineDetail = activeOfflineLeaveDetail();
    bot.lastDecision = {
      kind: 'wait',
      reason: leaveResult?.attempted && !leaveResult?.error ? 'offline-leave' : 'control-combat-tick-gap',
      control: summarizeControl(),
      self: currentSummary,
      offlineAgeMs,
      leaveDelayMs: 0,
      offlineSafety,
      combatTickGap,
      displayReason: currentOfflineDisplayReason('combat tick gap', offlineSafety, leaveResult, offlineDetail, '战斗主循环断档，正在退出'),
      leave: leaveResult,
      tickReentry: true
    };
    updateBotPanel(bot.lastDecision);
    if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
      requestReload('combat tick gap too long');
    }
    return combatTickGap;
  }

  function nativeTickMinIntervalMs(state = {}) {
    const normalMs = Math.max(1, Number(cfg.nativeTickMinMs || cfg.tickMs || 120));
    const combatMs = Math.max(1, Number(cfg.combatNativeTickMinMs || normalMs));
    return combatTickActiveFromState(state) ? Math.min(normalMs, combatMs) : normalMs;
  }

${combatFireSource()}  function combatLeaveCoverAction(self, target, bullets, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const pressure = combatPressureThreat(self, target, bullets);
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const dodging = Boolean(pressure || strafe.active);
    const spacing = combatSpacingVector(self, target, distance);
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const aim = combatAimTarget(self, target, { realBulletPressure });
    const shooting = combatShootingPlan(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetDistance: distance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
	      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isCurrentlyActive(target),
	      targetMoving: speed(target) >= cfg.combatStationarySpeed,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale
	    });
    return {
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed
          ? 'combat-stamina-conserve'
          : (realBulletPressure && !spacingOverride
            ? 'combat-leave-dodge'
            : (spacing.active && (combatMove.dx || combatMove.dy) ? 'combat-leave-spacing' : 'combat-leave-cover'))),
      dx: combatMove.dx,
      dy: combatMove.dy,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        strategy: aim.aimStrategy || '',
        strategyReason: aim.aimStrategyReason || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        precision: Boolean(aim.precisionAim),
        steady: Boolean(aim.steadyAim),
        locked: Boolean(aim.lockedAim),
        live: Boolean(aim.liveAim),
        liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
        sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
        sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
        serverStall: Boolean(aim.serverStallAim),
        realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
        radialPrecision: Boolean(aim.radialPrecisionAim),
        fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
	        intercept: Boolean(aim.interceptAim),
	        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
	        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      movementSuppressed,
      shooting,
      strafe: dodging ? {
        dx: combatMove.dx,
        dy: combatMove.dy,
        sign: strafe.sign,
        precise: Boolean(strafe.precise),
        locked: Boolean(strafe.locked),
        lockOverridden: Boolean(strafe.lockOverridden),
        carried: Boolean(strafe.carried),
        threatField: strafe.threatField ? {
          dx: strafe.threatField.dx,
          dy: strafe.threatField.dy,
          directHitCount: strafe.threatField.directHitCount,
          minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
          minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
        } : null
      } : null,
      spacing: spacing.active ? {
        dx: spacing.dx,
        dy: spacing.dy,
        reason: spacing.reason,
        distance: Math.round(spacing.distance),
        minRange: Math.round(spacing.minRange),
        preferredRange: Math.round(spacing.preferredRange),
        merged: Boolean(combatMove.spacingMerged),
        overrideBullet: Boolean(spacingOverride)
      } : null
    };
  }

  function buildCombatAction(self, target, bullets) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const targetMotionScale = combatAimMotionScale(target);
    const currentCombatTarget = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target)
      ? bot.combatTarget
      : null;
    const combatOriginIntent = String(target?.combatEngagement?.originIntent || currentCombatTarget?.originIntent || target.combatIntent || '');
    const combatOriginReason = String(target?.combatEngagement?.originReason || currentCombatTarget?.originReason || '');
    const seenTargetRealBulletAt = Number(target?.combatEngagement?.seenTargetRealBulletAt || currentCombatTarget?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, Date.now() - seenTargetRealBulletAt) : 0;
    const targetMoving = speed(target) >= cfg.combatStationarySpeed
      || targetMotionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const baseTarget = {
      id: target.user_id,
      name: target.name,
      x: target.x,
      y: target.y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      hp: targetHp,
      knownHp: knownHpValue(target),
      drop: target.drop,
      distance: Math.round(targetDistance),
      moving: targetMoving,
      motionScale: Number(targetMotionScale.toFixed(2)),
      combatIntent: target.combatIntent || '',
      score: Number.isFinite(Number(target.combatOpportunityScore)) ? Number(target.combatOpportunityScore) : null,
      competingCoinScore: Number.isFinite(Number(target.competingCoinScore)) ? Number(target.competingCoinScore) : null,
      mode: target.current_join_mode || target.mode || '',
      life: target.life || '',
      active: isCurrentlyActive(target),
      firing: isFiringEntity(target),
      invulnerable: isInvulnerable(target),
      combatOriginIntent,
      combatOriginReason: combatOriginReason || '',
      seenTargetRealBulletMs: seenTargetRealBulletMs || 0
	    };
	    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
	      return combatLeaveAction('combat-critical-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance));
	    }
	    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
	      return combatLeaveAction('combat-low-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance));
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    let disadvantageObservation = null;
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'hp-gap', { selfHp, targetHp, hpGap });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, { selfHp, targetHp, hpGap, disadvantageObservation }, combatLeaveCoverAction(self, target, bullets, targetDistance));
      }
    }
    let pressure = combatPressureThreat(self, target, bullets);
    const spacing = combatSpacingVector(self, target, targetDistance);
    const damageState = combatAimDamageState(target);
    let passiveRunner = combatPassiveRunnerState(self, target, targetDistance, damageState, pressure, targetMotionScale);
    const retreatingTarget = combatRetreatingTargetState(self, target, targetDistance, damageState);
    if (retreatingTarget.active && passiveRunner.active) {
      passiveRunner = { ...passiveRunner, active: false, suppressedBy: retreatingTarget.reason || 'retreating-target' };
    }
    if (passiveRunner.active && pressure?.synthetic && pressure.reason === 'target-pressure') pressure = null;
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const targetRealBulletPressure = Boolean(
      pressure
      && !pressure.synthetic
      && pressure.ownerId !== null
      && pressure.ownerId !== undefined
      && combatTargetId(target)
      && String(pressure.ownerId) === String(combatTargetId(target))
    );
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure);
    if (closeRisk) {
      return combatLeaveAction('combat-low-hp-leave', baseTarget, { selfHp, targetHp, closeRisk }, combatLeaveCoverAction(self, target, bullets, targetDistance));
    }
	    const pressureDisadvantage = combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure);
		    if (pressureDisadvantage) {
		      return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, {
		        selfHp,
		        targetHp,
		        hpGap: pressureDisadvantage.hpGap,
		        pressureDisadvantage
		      }, combatLeaveCoverAction(self, target, bullets, targetDistance));
		    }
	    const sustainedPressureDisadvantage = combatSustainedPressureDisadvantageState(
	      selfHp,
	      targetHp,
	      targetDistance,
	      damageState.noDamageMs,
	      targetRealBulletPressure
	    );
	    if (sustainedPressureDisadvantage) {
	      return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, {
	        selfHp,
	        targetHp,
	        hpGap: sustainedPressureDisadvantage.hpGap,
	        sustainedPressureDisadvantage
	      }, combatLeaveCoverAction(self, target, bullets, targetDistance));
	    }
	    const tradeEstimate = combatTradeEstimate(self, target);
    if (!disadvantageObservation && tradeEstimate?.active) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'trade-estimate', {
        selfHp,
        targetHp,
        hpGap,
        ...tradeEstimate
      });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, {
          selfHp,
          targetHp,
          hpGap,
          tradeEstimate,
          disadvantageObservation
        }, combatLeaveCoverAction(self, target, bullets, targetDistance));
      }
    }
    if (!disadvantageObservation) clearCombatDisadvantageObservation('not-disadvantaged');
	    const serverStallNoDamage = combatServerStallNoDamageLeaveState(
      selfHp,
      targetHp,
      damageState.noDamageMs,
      realBulletPressure,
      summarizeServerPositionStall()
    );
    if (serverStallNoDamage && !retreatingTarget.disengage) {
      return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, {
        selfHp,
        targetHp,
        hpGap: serverStallNoDamage.hpGap,
        noDamageMs: damageState.noDamageMs,
        serverStallNoDamage
      }, combatLeaveCoverAction(self, target, bullets, targetDistance));
    }
    if (retreatingTarget.disengage) {
      clearCombatDisadvantageObservation('combat-disengage-range');
      clearCombatEngagement('combat-disengage-range');
      return {
        kind: 'wait',
        reason: 'combat-disengage-range',
        combat: false,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        combatDisengage: retreatingTarget
      };
    }
    const outOfRangeFinishPressure = combatOutOfRangeFinishPressureState(
      self,
      target,
      targetDistance,
      selfHp,
      targetHp,
      damageState,
      retreatingTarget
    );
    const outOfRangeReengage = combatOutOfRangeReengageState(
      self,
      target,
      targetDistance,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    if (targetDistance > Number(cfg.combatAttackRange || 0)) {
      const outOfRangeCloseMove = outOfRangeFinishPressure.active
        ? outOfRangeFinishPressure
        : (outOfRangeReengage.active ? outOfRangeReengage : null);
      const outOfRangeDodge = combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget, outOfRangeCloseMove);
      if (outOfRangeDodge) return outOfRangeDodge;
      if (outOfRangeFinishPressure.active) {
        return {
          kind: 'attack',
          reason: 'combat-finish-reengage',
          combat: true,
          ignoreReturnBlock: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeFinishPressure.dx,
          dy: outOfRangeFinishPressure.dy,
          target: baseTarget,
          combatState: {
            selfHp,
            targetHp,
            outOfRangeFinishPressure,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      if (outOfRangeReengage.active) {
        return {
          kind: 'attack',
          reason: 'combat-out-of-range-reengage',
          combat: true,
          ignoreReturnBlock: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeReengage.dx,
          dy: outOfRangeReengage.dy,
          target: baseTarget,
          combatState: {
            selfHp,
            targetHp,
            outOfRangeReengage,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      return {
        kind: 'wait',
        reason: 'combat-out-of-range-hold',
        combat: true,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        target: baseTarget,
        combatState: {
          selfHp,
          targetHp,
          outOfRangeHold: {
            distance: Math.round(targetDistance),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            disengageRange: Math.round(Math.max(Number(cfg.combatAttackRange || 0), Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || 0))),
            outOfRangeMs: target.combatEngagement?.outOfRangeMs || 0,
            graceRemainingMs: target.combatEngagement?.graceRemainingMs || 0
          }
        }
      };
    }
    const finishPressure = combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget);
    const farNoDamageClose = combatFarNoDamageCloseVector(
      self,
      target,
      targetDistance,
      damageState.noDamageMs,
      selfHp,
      targetHp
    );
    const retreatingFighterClose = combatRetreatingFighterCloseVector(
      self,
      target,
      targetDistance,
      damageState.noDamageMs,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    const retreatingBlocksClose = retreatingTarget.active && !retreatingFighterClose.active;
    const basePressureClose = finishPressure.active
      ? finishPressure
      : (retreatingFighterClose.active
        ? retreatingFighterClose
        : (retreatingBlocksClose
        ? { active: false, dx: 0, dy: 0, distance: targetDistance, closeRange: cfg.combatPressureCloseRange, noDamageMs: damageState.noDamageMs, retreatingTarget }
        : (farNoDamageClose.active
          ? farNoDamageClose
          : combatPressureCloseVector(self, target, targetDistance, damageState.noDamageMs, selfHp))));
    const passiveRunnerClose = !basePressureClose.active && !retreatingTarget.active
      ? combatPassiveRunnerCloseVector(self, target, targetDistance, passiveRunner)
      : { active: false, dx: 0, dy: 0, distance: targetDistance, closeRange: Number(cfg.combatPassiveRunnerCloseRange || 0), noDamageMs: damageState.noDamageMs, reason: 'passive-runner' };
    const pressureClose = passiveRunnerClose.active ? passiveRunnerClose : basePressureClose;
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: pressureClose.active });
    const dodging = Boolean(pressure || strafe.active);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    const safePressureCloseOverride = realBulletPressure
      ? combatSafeCloseMoveOverride(self, target, pressure, pressureClose)
      : null;
    combatMove = safePressureCloseOverride
      ? {
        ...combatMove,
        dx: safePressureCloseOverride.dx,
        dy: safePressureCloseOverride.dy,
        safeCloseOverride: safePressureCloseOverride
      }
      : mergeCombatMove(combatMove, pressureClose, !realBulletPressure);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const spacingActive = Boolean(spacing.active && (combatMove.dx || combatMove.dy));
    const aim = combatAimTarget(self, target, { realBulletPressure, passiveRunner: passiveRunner.active });
    const pressureCloseActive = Boolean(pressureClose.active && (combatMove.dx || combatMove.dy));
    const farNoDamageCloseForTrend = Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage');
    const trend = combatTrendState(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetRealBulletPressure,
      pressureClose: pressureClose.active,
      targetDistance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
      engagedCombat: target.combatIntent === 'engaged',
      targetActive: isCurrentlyActive(target),
      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    let shooting = combatShootingPlan(self, {
      trend,
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetRealBulletPressure,
      pressureClose: pressureClose.active,
      targetDistance: targetDistance,
      targetHp,
      steadyAim: Boolean(aim.steadyAim),
	      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isCurrentlyActive(target),
	      passiveRunner: passiveRunner.active,
      opponentProbeEngagedMs: passiveRunner.engagedMs,
      opponentProbeSeenTargetRealBulletMs: passiveRunner.seenTargetRealBulletMs,
	      targetMoving,
	      noDamageMs: Number(aim.noDamageMs || 0),
	      aimConfidence: aim.aimConfidence,
	      motionScale: aim.motionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    if (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active) {
      shooting = {
        ...shooting,
        shoot: false,
        forceShoot: false,
        suppressed: true,
        reason: 'target-retreating-edge',
        retreatingTarget
      };
    }
    if (finishPressure.active && !shooting.suppressed) {
      const finishEveryMs = Math.max(
        Number(shooting.shootEveryMs || 0),
        Number(cfg.combatFinishPressureShootEveryMs || cfg.combatShootConserveEveryMs || cfg.combatShootEveryMs || 0)
      );
      shooting = {
        ...shooting,
        shoot: true,
        shootEveryMs: finishEveryMs || shooting.shootEveryMs,
        reason: 'finish-pressure',
        throttled: true,
        finishPressure
      };
    }
    const baseReason = realBulletPressure
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
        : (pressureCloseActive && pressureClose.reason === 'passive-runner'
        ? 'combat-passive-runner-close'
        : (spacingActive
        ? (dodging ? 'combat-spacing-dodge' : 'combat-spacing')
        : (pressureCloseActive ? (finishPressure.active ? 'combat-finish-pressure' : (retreatingFighterClose.active ? 'combat-retreating-fighter-close' : (farNoDamageClose.active ? 'combat-far-pressure-close' : 'combat-pressure-close'))) : (dodging ? 'combat-tangent-dodge' : 'combat-attack'))));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active ? 'combat-target-retreating' : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.reason === 'finish-pressure' ? 'combat-finish-pressure' : (shooting.throttled && shooting.reason !== 'opponent-probe' ? 'combat-burst-fire' : baseReason)))),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: baseTarget,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        strategy: aim.aimStrategy || '',
        strategyReason: aim.aimStrategyReason || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        precision: Boolean(aim.precisionAim),
        steady: Boolean(aim.steadyAim),
        locked: Boolean(aim.lockedAim),
        live: Boolean(aim.liveAim),
        liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
        sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
        sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
        serverStall: Boolean(aim.serverStallAim),
        realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
        radialPrecision: Boolean(aim.radialPrecisionAim),
        fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
        passiveRunner: Boolean(aim.passiveRunnerAim),
	        intercept: Boolean(aim.interceptAim),
	        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
	        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      combatState: {
        selfHp,
        targetHp,
        combatOriginIntent,
        combatOriginReason: combatOriginReason || '',
        seenTargetRealBulletMs: seenTargetRealBulletMs || 0,
        targetRealBulletPressure,
        aim: {
          movementMode: aim.movementMode || '',
          strategy: aim.aimStrategy || '',
          strategyReason: aim.aimStrategyReason || '',
          angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
          motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
          noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
          widened: Boolean(aim.noDamageWidened),
          precision: Boolean(aim.precisionAim),
          steady: Boolean(aim.steadyAim),
          locked: Boolean(aim.lockedAim),
          live: Boolean(aim.liveAim),
          liveDistance: Number.isFinite(Number(aim.liveDistance)) ? Math.round(Number(aim.liveDistance)) : null,
          sourceDivergenceCm: Number.isFinite(Number(aim.sourceDivergenceCm)) ? Math.round(Number(aim.sourceDivergenceCm)) : null,
          sourceDivergenceThresholdCm: Number.isFinite(Number(aim.sourceDivergenceThresholdCm)) ? Math.round(Number(aim.sourceDivergenceThresholdCm)) : null,
          serverStall: Boolean(aim.serverStallAim),
          realBulletPrecision: Boolean(aim.realBulletPrecisionAim),
          radialPrecision: Boolean(aim.radialPrecisionAim),
          fallbackPrecision: Boolean(aim.fallbackPrecisionAim),
          passiveRunner: Boolean(aim.passiveRunnerAim),
        intercept: Boolean(aim.interceptAim),
        interceptFlightMs: Number.isFinite(Number(aim.interceptFlightMs)) ? Math.round(Number(aim.interceptFlightMs)) : null,
        interceptLeadDistance: Number.isFinite(Number(aim.interceptLeadDistance)) ? Math.round(Number(aim.interceptLeadDistance)) : null,
	        interceptConfidence: Number.isFinite(Number(aim.interceptConfidence)) ? Number(Number(aim.interceptConfidence).toFixed(2)) : null,
	        aimConfidence: Number.isFinite(Number(aim.aimConfidence)) ? Number(Number(aim.aimConfidence).toFixed(2)) : null,
	        opponentProfile: aim.opponentProfile || null
	        },
        strafe: dodging ? {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
	          precise: Boolean(strafe.precise),
	          locked: Boolean(strafe.locked),
	          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
	          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0,
          spacingMerged: Boolean(combatMove.spacingMerged),
          threatField: strafe.threatField ? {
            dx: strafe.threatField.dx,
            dy: strafe.threatField.dy,
            directHitCount: strafe.threatField.directHitCount,
            minCpaDistance: Number.isFinite(Number(strafe.threatField.minCpaDistance)) ? Math.round(Number(strafe.threatField.minCpaDistance)) : null,
            minTimeToImpactMs: Number.isFinite(Number(strafe.threatField.minTimeToImpactMs)) ? Math.round(Number(strafe.threatField.minTimeToImpactMs)) : null
          } : null
        } : null,
        spacing: spacingActive ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          radialSpeed: Number.isFinite(Number(spacing.radialSpeed)) ? Math.round(Number(spacing.radialSpeed)) : null,
          merged: Boolean(combatMove.spacingMerged),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        pressureClose: pressureClose.active ? {
          dx: pressureClose.dx,
          dy: pressureClose.dy,
          reason: pressureClose.reason,
          distance: Math.round(pressureClose.distance),
          closeRange: Math.round(pressureClose.closeRange),
          startRange: Number.isFinite(Number(pressureClose.startRange)) ? Math.round(Number(pressureClose.startRange)) : null,
          noDamageMs: Math.round(pressureClose.noDamageMs),
          farNoDamageClose: Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage'),
          preferClosing: Boolean(pressureClose.active),
          merged: Boolean(!realBulletPressure || safePressureCloseOverride),
          safeCloseOverride: safePressureCloseOverride ? {
            dx: safePressureCloseOverride.dx,
            dy: safePressureCloseOverride.dy,
            reason: safePressureCloseOverride.reason,
            minCpaDistance: Number.isFinite(Number(safePressureCloseOverride.threatField?.minCpaDistance)) ? Math.round(Number(safePressureCloseOverride.threatField.minCpaDistance)) : null,
            directHitCount: Number(safePressureCloseOverride.threatField?.directHitCount || 0)
          } : null
        } : null,
        passiveRunner,
        movementSuppressed,
        shooting,
        disadvantageObservation,
        retreatingTarget: retreatingTarget.active ? retreatingTarget : null
      }
    };
  }

	  function snapshotCoinAgeMs() {
	    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
	  }

	  function isSnapshotCoinWaitAction(action) {
	    const reason = String(action?.reason || '');
	    return reason === 'wait-for-snapshot-coin'
	      || reason === 'wait-for-stamina-budget'
	      || reason === 'snapshot-coin-idle-timeout';
	  }

	  function pickSnapshotCoinDestination(self, allCoins, activeThreats, options = {}) {
	    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
	    const ageMs = snapshotCoinAgeMs();
	    if (ageMs > cfg.snapshotCoinStaleMs) return null;
		    const candidates = safeCoinCandidates((allCoins || []).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance, self);
	    if (!candidates.length) return null;
	    const buildSnapshotItem = coin => {
	      const members = candidates.filter(other => dist(coin, other) <= Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius));
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
	      return {
	        ...coin,
	        snapshotMembers: members.length,
	        snapshotAmount: totalAmount,
	        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	    };
	    const asOpportunity = item => ({ ...item, opportunityScore: item.snapshotScore });
	    const asIdleFallback = item => ({ ...asOpportunity(item), snapshotIdleFallback: true });
	    let stickyFallback = null;
	    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
	      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
	      if (sticky) {
	        const stickyItem = buildSnapshotItem(sticky);
	        if (coinStaminaAffordableWithDiagnostic(self, sticky, stickyItem.opportunityStaminaCost)
	          && snapshotCoinWorthLongTravel(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount)) return asOpportunity(stickyItem);
	        if (allowIdleFallback) stickyFallback = stickyItem;
	      }
	    }
	    let best = null;
	    let idleBest = stickyFallback;
	    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
	    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
	    for (const coin of candidates.slice(0, 300)) {
	      const members = candidates.filter(other => dist(coin, other) <= radius);
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
	      const item = {
	        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	      const affordable = coinStaminaAffordableWithDiagnostic(self, coin, staminaCost);
	      if (affordable && snapshotCoinWorthLongTravel(coin, members.length, totalAmount)) {
	        if (!best
	          || item.snapshotScore > best.snapshotScore
	          || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
	          || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
	      }
	      if (allowIdleFallback && (!idleBest
	        || item.snapshotScore > idleBest.snapshotScore
	        || (item.snapshotScore === idleBest.snapshotScore && item.distance < idleBest.distance))) {
	        idleBest = item;
	      }
	    }
	    if (best) return asOpportunity(best);
	    return idleBest ? asIdleFallback(idleBest) : null;
	  }

  function snapshotCoinWorthLongTravel(coin, members = 1, totalAmount = null) {
    return snapshotCoinWorthLongTravelCore(coin, members, totalAmount, coinTargetCoreOptions());
  }

	  function snapshotCoinNavigationReason(coin) {
	    return snapshotCoinNavigationReasonCore(coin, coinTargetCoreOptions());
  }

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue)
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityAfkTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function targetStamina5sRemaining(target) {
    const value = Number(target?.stamina_5s_remaining_milli ?? target?.stamina5s ?? target?.stamina_5s ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  function opportunityAfkStaminaState() {
    if (!(bot.opportunityAfkStamina instanceof Map)) bot.opportunityAfkStamina = new Map();
    return bot.opportunityAfkStamina;
  }

  function opportunityAfkStaminaCooldownMs() {
    const value = Number(cfg.opportunityAfkStaminaCooldownMs ?? 60000);
    return Math.max(0, Number.isFinite(value) ? value : 60000);
  }

  function opportunityAfkStaminaDropThresholdMs() {
    const value = Number(cfg.opportunityAfkStaminaDropThresholdMs ?? 100);
    return Math.max(0, Number.isFinite(value) ? value : 100);
  }

  function updateOpportunityAfkStaminaObservations(targets, t = now()) {
    const state = opportunityAfkStaminaState();
    const cooldownMs = opportunityAfkStaminaCooldownMs();
    const dropThreshold = opportunityAfkStaminaDropThresholdMs();
    const observationGapMs = Math.max(1000, Number(cfg.activeSeenMs || 0) * 2, Number(cfg.tickMs || 0) * 8);
    for (const target of targets || []) {
      const id = opportunityAfkTargetId(target);
      if (!id) continue;
      const stamina5s = targetStamina5sRemaining(target);
      const previous = state.get(id) || {};
      const previousStamina = Number(previous.stamina5s);
      const previousSeenAt = Number(previous.lastSeenAt || 0);
      const continuous = previousSeenAt > 0 && t - previousSeenAt <= observationGapMs;
      let cooldownUntil = Math.max(0, Number(previous.cooldownUntil || 0));
      let consumedAt = Math.max(0, Number(previous.consumedAt || 0));
      if (Number.isFinite(stamina5s) && continuous && Number.isFinite(previousStamina) && stamina5s + dropThreshold < previousStamina) {
        cooldownUntil = Math.max(cooldownUntil, t + cooldownMs);
        consumedAt = t;
      }
      state.set(id, {
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null),
        lastSeenAt: t,
        cooldownUntil,
        consumedAt
      });
    }
    const ttlMs = Math.max(300000, cooldownMs * 5);
    for (const [id, item] of state.entries()) {
      const lastSeenAt = Number(item?.lastSeenAt || 0);
      const cooldownUntil = Number(item?.cooldownUntil || 0);
      if (cooldownUntil <= t && lastSeenAt > 0 && t - lastSeenAt > ttlMs) state.delete(id);
    }
  }

  function opportunityAfkStaminaCooldownRemaining(target, t = now()) {
    const id = opportunityAfkTargetId(target);
    if (!id) return 0;
    const item = opportunityAfkStaminaState().get(id);
    return Math.max(0, Math.round(Number(item?.cooldownUntil || 0) - t));
  }

  function afkOpportunityBlockedByStaminaCooldown(target, t = now()) {
    if (!isAfkProfitTarget(target)) return false;
    const distance = Number(target?.distance ?? Infinity);
    if (Number.isFinite(distance) && distance <= Number(cfg.attackRange || 0)) return false;
    return opportunityAfkStaminaCooldownRemaining(target, t) > 0;
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = Number(target.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (afk && !inRange && afkOpportunityBlockedByStaminaCooldown(target)) return null;
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && now() - bot.lastTargetAt < cfg.targetStickMs;
    return opportunityValueScore(
      target.drop,
      opportunityEnemyStaminaCost(target),
      afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue
    ) + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityPriorityTier(item) {
    return opportunityPriorityTierCore(item, {
      visibleDistance: cfg.opportunityVisibleDistance,
      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
    });
  }

	  ${opportunityEffectiveStaminaCostCore.toString()}
	  ${opportunityValueScoreCore.toString()}
	  ${opportunityPriorityTierCore.toString()}
	  ${mergeCoinRouteDisplayCore.toString()}
	  ${uniqueVisibleRouteCoinsCore.toString()}
	  ${buildCoinOpportunityCandidatesCore.toString()}
	  ${buildEnemyOpportunityCandidatesCore.toString()}
	  ${buildOpportunityCandidatesCore.toString()}
	  ${bestCoinOpportunityScoreCore.toString()}

	  ${defaultDist.toString()}
	  ${coinRouteKey.toString()}
	  ${coinRouteIdsFrom.toString()}
	  ${coinRouteLegStaminaCostCore.toString()}
	  ${coinRouteLegClearCore.toString()}
			  ${coinRoutePointLimitCore.toString()}
			  ${coinRouteSummaryCore.toString()}
			  ${coinRoutePoints.toString()}
			  ${coinRouteActionMetaCore.toString()}
			  ${buildCoinRouteFromAnchorCore.toString()}
	  ${coinRouteSkipsCloserFirstCoinCore.toString()}
	  ${coinRouteSkipsHeldSingleCoinCore.toString()}
	  ${coinRouteMatchesHeldChoiceCore.toString()}
	  ${heldCoinRouteBeatsSwitchCore.toString()}
	  ${pickCoinRouteOpportunityCore.toString()}

	  function coinRouteCoreOptions(self = null) {
	    return {
	      dist,
	      moveStaminaCost: opportunityMoveStaminaCost,
	      pickupStaminaMs: cfg.opportunityCoinPickupStaminaMs,
	      sampleDistance: cfg.coinRouteLegSampleDistance,
	      threatDangerRadius: coinThreatDangerRadius,
	      coinBlockedByThreat,
	      clusterRadius: cfg.coinRouteClusterRadius,
	      maxPointsDense: cfg.coinRouteMaxPointsDense,
	      maxPointsMid: cfg.coinRouteMaxPointsMid,
	      maxPointsSparse: cfg.coinRouteMaxPointsSparse,
	      linkDistance: cfg.coinRouteLinkDistance,
	      maxLinkDistance: cfg.coinRouteMaxLinkDistance,
	      coinOpportunityValue: cfg.coinOpportunityValue,
	      valueScore: opportunityValueScore,
	      staminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      recordDiagnostic: (coin, reason, detail) => recordCoinFilterDiagnostic(coin, reason, detail),
	      nearbyFirstCoinDistance: cfg.coinRouteNearbyFirstCoinDistance,
	      firstCoinDistanceRatio: cfg.coinRouteFirstCoinDistanceRatio,
	      firstCoinDistanceSlack: cfg.coinRouteFirstCoinDistanceSlack,
	      choiceType: opportunityChoiceType,
	      choiceId: opportunityChoiceId,
	      heldMinOverlap: cfg.coinRouteHeldMinOverlap,
	      switchMargin: cfg.coinRouteSwitchMargin,
	      opportunitySwitchMargin: cfg.opportunitySwitchMargin,
	      switchRelativeMargin: cfg.coinRouteSwitchRelativeMargin,
	      opportunitySwitchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
	      maxDistance: Math.max(0, Number(cfg.coinRouteMaxDistance || cfg.globalCoinMaxDistance || 0)),
	      poolLimit: cfg.coinRoutePoolLimit,
	      anchorLimit: cfg.coinRouteAnchorLimit,
	      safeCoinCandidates,
	      isSnapshotOnlyCoin
	    };
	  }

	  function coinRouteLegStaminaCost(from, to) {
	    return coinRouteLegStaminaCostCore(from, to, coinRouteCoreOptions());
	  }

	  function coinRouteLegClear(from, to, activeThreats) {
	    return coinRouteLegClearCore(from, to, activeThreats, coinRouteCoreOptions());
	  }

	  function coinRoutePointLimit(anchor, candidates) {
	    return coinRoutePointLimitCore(anchor, candidates, coinRouteCoreOptions());
	  }

	  function coinRouteSummary(route, self) {
	    return coinRouteSummaryCore(route, self, coinRouteCoreOptions());
	  }

	  function buildCoinRouteFromAnchor(self, anchor, candidates, activeThreats) {
	    return buildCoinRouteFromAnchorCore(self, anchor, candidates, activeThreats, coinRouteCoreOptions(self));
	  }

	  function coinRouteSkipsCloserFirstCoin(self, route, candidates) {
	    return coinRouteSkipsCloserFirstCoinCore(self, route, candidates, coinRouteCoreOptions());
	  }

  function currentHeldCoinRouteChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function currentHeldCoinChoice(t = now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    return choice;
  }

	  function coinRouteSkipsHeldSingleCoin(self, route, choice) {
	    return coinRouteSkipsHeldSingleCoinCore(self, route, choice, coinRouteCoreOptions());
	  }

	  function coinRouteMatchesHeldChoice(route, choice) {
	    return coinRouteMatchesHeldChoiceCore(route, choice, coinRouteCoreOptions());
	  }

	  function heldCoinRouteBeatsSwitch(heldRoute, bestRoute) {
	    return heldCoinRouteBeatsSwitchCore(heldRoute, bestRoute, coinRouteCoreOptions());
	  }

	  function pickCoinRouteOpportunity(self, coins, activeThreats) {
	    return pickCoinRouteOpportunityCore(self, coins, activeThreats, {
	      ...coinRouteCoreOptions(self),
	      heldChoice: currentHeldCoinChoice(),
	      heldRouteChoice: currentHeldCoinRouteChoice()
	    });
	  }

	  function opportunityCandidateCoreOptions(self = null) {
	    return {
	      safeCoinCandidates,
	      coinStaminaCost: opportunityCoinStaminaCost,
	      coinStaminaAffordable: (coin, staminaCost = opportunityCoinStaminaCost(coin)) => coinStaminaAffordableWithDiagnostic(self, coin, staminaCost),
	      scoreCoinOpportunity,
	      snapshotCoinNavigationReason,
	      maxCoinDistance: cfg.coinMaxDistance,
	      routeMaxDistance: cfg.coinRouteMaxDistance,
	      scoreEnemyOpportunity,
	      enemyStaminaCost: opportunityEnemyStaminaCost,
	      opportunityStaminaAffordable: staminaCost => opportunityStaminaAffordable(self, staminaCost),
	      isAfkProfitTarget,
	      attackRange: cfg.attackRange,
	      attackEngageRange: cfg.attackEngageRange,
	      priorityTier: opportunityPriorityTier,
	      visibleDistance: cfg.opportunityVisibleDistance,
	      nearbyPriorityDistance: cfg.opportunityNearbyPriorityDistance
	    };
	  }

  function uniqueVisibleRouteCoins(coinGroups) {
    return uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey });
  }

  function bestCoinOpportunityScore(self, coinGroups, activeThreats) {
    const route = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats);
    return bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self));
  }

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = bestCoinOpportunityScore(self, coinGroups, activeThreats);
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

  function attackEntityMatches(entity, attack) {
    const id = String(attack?.id ?? '');
    const name = String(attack?.name || '');
    if (id && String(entity?.user_id ?? entity?.id ?? '') === id) return true;
    return Boolean(name && String(entity?.name || '') === name);
  }

  function recentAttackTargetStillAttackable(attack, entities) {
    const target = (entities || []).find(entity => entityFreshEnoughForOffense(entity) && attackEntityMatches(entity, attack));
    if (!target || !isAlive(target)) return false;
    const hp = knownHpValue(target);
    if (hp !== null && hp <= 0) return false;
    if (isWhitelistedTarget(target)) return false;
    if (isCurrentlyActive(target)) return false;
    if (isInvulnerable(target)) return false;
    return dropValue(target) > 0;
  }

  function postAttackDropResolvedAt(attack, entities, t = Date.now()) {
    if (!attack || recentAttackTargetStillAttackable(attack, entities)) {
      if (attack) attack.postAttackDropResolvedAt = 0;
      return 0;
    }
    const existing = Number(attack.postAttackDropResolvedAt || 0);
    if (existing > 0) return existing;
    attack.postAttackDropResolvedAt = t;
    return t;
  }

  function pickPostAttackDropCoin(self, coins, activeThreats, entities, options = {}) {
    const t = Date.now();
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
    const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
    const candidateCoins = safeCoinCandidates(coins, activeThreats, maxDistance, self)
      .filter(coin => Number(coin.amount || 0) > minAmount)
      .filter(coin => Number.isFinite(Number(coin.distance)))
      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin));
    const result = pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {
      nowMs: t,
      dist,
      priorityMs: cfg.postAttackDropCoinPriorityMs,
      includeSingle: options.includeSingle,
      minAmount,
      maxDistance,
      minScore,
      dropCoinRadius: cfg.postAttackDropCoinRadius,
      resolveAttack: attack => postAttackDropResolvedAt(attack, entities, t),
      scoreCoin: scoreCoinOpportunity
    });
    for (const candidate of result.candidates || []) {
      recordDropMatchedKill(candidate, candidate.amount, summarizeSelf(self), 'post-attack-drop-visible');
    }
    return result.selected || null;
  }

  ${postAttackVisibleCoinExistsCore.toString()}
  ${resolvedRecentPostAttackDropsCore.toString()}
  ${buildPostAttackDropCoinCandidateCore.toString()}
  ${pickPostAttackDropCoinCore.toString()}
  ${pickPostAttackDropWaitTargetCore.toString()}

  function postAttackVisibleCoinExists(coins, attack) {
    return postAttackVisibleCoinExistsCore(coins, attack, {
      dist,
      dropCoinRadius: cfg.postAttackDropCoinRadius
    });
  }

  function pickPostAttackDropWaitTarget(self, coins, activeThreats, entities) {
    const t = Date.now();
    const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
    return pickPostAttackDropWaitTargetCore(bot.attackHistory, coins, activeThreats, {
      nowMs: t,
      self,
      dist,
      waitMs,
      minDrop: Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0),
      resolveMaxMs: Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs),
      maxDistance: Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0)),
      stopDistance: Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0)),
      dropCoinRadius: cfg.postAttackDropCoinRadius,
      resolveAttack: item => postAttackDropResolvedAt(item, entities, t),
      coinBlockedByThreat: (origin, item, threat) => coinBlockedByThreat(origin, item, threat)
    });
  }

  function buildPostAttackDropWaitAction(self, target) {
    const dir = coinDirectionTo(self, target, cfg.patrolPrecisionTolerance);
    return {
      kind: 'patrol',
      reason: 'post-attack-drop-wait-position',
      dx: dir.dx,
      dy: dir.dy,
      postAttackTarget: {
        id: target.id,
        name: target.name || '',
        x: target.x,
        y: target.y,
        drop: target.drop,
        playerCategory: target.playerCategory || (target.afk === false ? 'active' : 'afk'),
        afk: target.afk !== false,
        active: target.active === true || target.playerCategory === 'active',
        combat: Boolean(target.combat),
        combatIntent: target.combatIntent || '',
        mode: target.mode || '',
        distance: Math.round(dir.distance),
        ageMs: Math.max(0, Math.round(Date.now() - Number(target.at || Date.now()))),
        resolvedAgeMs: Math.max(0, Math.round(Date.now() - Number(target.postAttackDropResolvedAt || Date.now()))),
        currentlyActive: Boolean(target.currentlyActive),
        moving: Boolean(target.moving),
        firing: Boolean(target.firing),
        battleStartedAt: target.battleStartedAt || target.at || 0,
        battleStaminaSpentStartMs: Number.isFinite(Number(target.battleStaminaSpentStartMs)) ? Math.max(0, Math.round(Number(target.battleStaminaSpentStartMs))) : null,
        staminaSpentMs: Number.isFinite(Number(target.staminaSpentMs)) ? Math.max(0, Math.round(Number(target.staminaSpentMs))) : null
      },
      ...coinMotionMeta(dir)
    };
  }

  function enemyOpportunityCandidates(self, targets, activeThreats) {
    const byId = new Map();
    for (const raw of targets) {
      const id = raw?.user_id;
      if (!id && id !== 0) continue;
      const drop = Number(raw.drop ?? dropValue(raw) ?? 0);
      const distance = Number(raw.distance ?? Infinity);
      if (!drop || !Number.isFinite(distance) || distance > cfg.attackApproachRange) continue;
      if (isWhitelistedTarget(raw)) continue;
      if (isInvulnerable(raw)) continue;
      if (!attackWorthTaking(self, { ...raw, drop })) continue;
      if (activeThreats.some(t => dist(raw, t) <= cfg.attackDangerRadius)) continue;
      const item = { ...raw, drop, distance };
      const previous = byId.get(String(id));
      if (!previous || item.drop > previous.drop || item.distance < previous.distance || !item.minimapOnly) {
        byId.set(String(id), item);
      }
    }
    return Array.from(byId.values());
  }

  function buildCoinAction(self, coin, reason, kind = null) {
    const dir = coinDirectionTo(self, coin);
    const staminaCost = opportunityCoinStaminaCost(coin);
    const routeMeta = coinRouteActionMetaCore(coin?.coinRoute || null, dir.distance);
    return {
      kind: kind || (coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'),
      reason,
      target: {
        id: coin.drop_id,
        x: coin.x,
        y: coin.y,
        amount: coin.amount,
        distance: Math.round(dir.distance),
        fieldMembers: coin.snapshotMembers ?? coin.fieldMembers ?? null,
        fieldAmount: coin.snapshotAmount ?? coin.fieldAmount ?? null,
        snapshotAgeMs: Number.isFinite(Number(coin.snapshotAgeMs)) ? Math.round(Number(coin.snapshotAgeMs)) : null,
        coinRoute: routeMeta
      },
      dx: dir.dx,
      dy: dir.dy,
      ...coinMotionMeta(dir),
      score: Math.round(scoreCoinOpportunity(coin)),
      staminaCost: Math.round(staminaCost),
      coinRoute: routeMeta
    };
  }

  function buildEnemyAction(self, target, reason = '') {
    if (isWhitelistedTarget(target)) return { kind: 'wait', reason: 'target-whitelisted', dx: 0, dy: 0 };
    const dir = directionTo(self, target);
    const afk = isAfkProfitTarget(target);
    const inRange = Number(dir.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    const staminaCost = opportunityEnemyStaminaCost(target);
    return {
      kind: inRange ? 'attack' : 'seek-enemy',
      reason: reason || (afk
        ? (inRange ? 'best-opportunity-afk-drop-target' : 'approach-afk-drop-target')
        : (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target')),
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        hp: target.hp,
        afk,
        mode: target.current_join_mode || ''
      },
      dx: inRange ? 0 : dir.dx,
      dy: inRange ? 0 : dir.dy,
      shoot: inRange,
      score: Math.round(scoreEnemyOpportunity(target) || 0),
      staminaCost: Math.round(staminaCost),
      estimatedShots: estimatedKillShots(target)
    };
  }

			  ${opportunityKey.toString()}
			  ${opportunityChoiceType.toString()}
			  ${opportunityChoiceId.toString()}
			  ${opportunityChoiceKey.toString()}
			  ${opportunityPairKey.toString()}
			  ${opportunityByKey.toString()}
			  ${opportunityMatchesChoiceCore.toString()}
			  ${isHighValueCoinOpportunityCore.toString()}
			  ${highValueCoinHoldBlocksEnemySwitchCore.toString()}
			  ${lockedOpportunityChoiceCore.toString()}
			  ${applyOpportunityOscillationLockCore.toString()}
			  ${chooseStableOpportunityCore.toString()}
			  ${opportunityMissingHoldUntilCore.toString()}
			  ${missingHeldCoinCoveredByVisibleAuthorityCore.toString()}
			  ${buildMissingHeldOpportunityCore.toString()}
			  ${opportunityRouteIds.toString()}
			  ${rememberOpportunityChoiceCore.toString()}

			  function opportunityChoiceCoreOptions(extra = {}) {
			    return {
			      dist,
			      sameCoinRadius: opportunitySameCoinRadius(),
			      highValueCoinPriorityAmount: highValueCoinPriorityAmount(),
			      switchMargin: cfg.opportunitySwitchMargin,
			      switchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
			      switchHoldMs: cfg.opportunitySwitchHoldMs,
			      oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit,
			      nowMs: now(),
			      ...extra
			    };
			  }

		  function resetOpportunitySwitchLock() {
		    bot.opportunitySwitchLock = null;
		  }

			  function lockedOpportunityChoice(sorted) {
			    const result = lockedOpportunityChoiceCore(sorted, bot.opportunitySwitchLock);
			    bot.opportunitySwitchLock = result.switchLock;
			    return result.choice;
			  }

			  function applyOpportunityOscillationLock(sorted, current, chosen) {
			    const result = applyOpportunityOscillationLockCore(sorted, current, chosen, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
			    bot.opportunitySwitchLock = result.switchLock;
			    return result.chosen;
			  }

		  function opportunitySameCoinRadius() {
		    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
		  }

			  function opportunityMatchesChoice(item, choice) {
			    return opportunityMatchesChoiceCore(item, choice, opportunityChoiceCoreOptions());
			  }

			  function opportunityMissingHoldUntil(choice, t) {
			    return opportunityMissingHoldUntilCore(choice, opportunityChoiceCoreOptions({
			      nowMs: t,
			      missingHoldMs: cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs
			    }));
			  }

			  function currentVisibleCoinListForMissingHold() {
			    if (typeof getNativeCoinSources !== 'function') return null;
			    let sources = [];
			    try {
			      sources = getNativeCoinSources();
			    } catch (_) {
			      return null;
			    }
			    if (!Array.isArray(sources) || !sources.length) return null;
			    const visibleSources = sources.filter(source => {
			      if (!source || !Array.isArray(source.list)) return false;
			      const label = String(source.label || '').toLowerCase();
			      return !label.includes('snapshot');
			    });
			    if (!visibleSources.length) return null;
			    const coins = [];
			    for (const source of visibleSources) {
			      for (const raw of source.list) {
			        const coin = normalizeCoinDrop(raw, 'native');
			        if (coin) coins.push(coin);
			      }
			    }
			    return coins;
			  }

			  function visibleCoinSourcesConfirmTargetMissing(target) {
			    const visibleCoins = currentVisibleCoinListForMissingHold();
			    if (!Array.isArray(visibleCoins)) return false;
			    return !visibleCoins.some(coin => coinMatchesTrackedTarget(coin, target));
			  }

			  function missingHeldCoinCoveredByVisibleAuthority(choice, coin) {
			    return missingHeldCoinCoveredByVisibleAuthorityCore(choice, coin, opportunityChoiceCoreOptions({
			      nativeCoinAuthoritativeRadius: typeof snapshotCoinLocalSuppressRadius === 'function' ? snapshotCoinLocalSuppressRadius() : cfg.nativeCoinAuthoritativeRadius
			    }));
			  }

			  function clearMissingVisibleCoinTarget(choice, coin, reason, t) {
			    const id = opportunityChoiceId(choice);
			    const idText = id || id === '0' ? String(id) : '';
			    if (coin) recordCoinFilterDiagnostic(coin, 'visible-missing');
			    if (idText) {
			      const ignoreMs = Math.max(0, Number(cfg.coinCollectedIgnoreMs || 0));
			      if (ignoreMs > 0) bot.ignoredCoins.set(idText, t + ignoreMs);
			      bot.coinAttempts.delete(idText);
			    }
			    if (!idText || (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === idText)) {
			      bot.lastTarget = null;
			      bot.lastTargetAt = 0;
			    }
			    if (!idText || (bot.coinProgress?.id && String(bot.coinProgress.id) === idText)) bot.coinProgress = null;
			    if (!idText || bot.coinApproachLock?.id === idText) bot.coinApproachLock = null;
			    clearOpportunityChoiceFor('coin', idText || null);
			    bot.lastCoinClearReason = reason;
			    bot.lastMissingVisibleCoin = {
			      id: idText,
			      reason,
			      amount: Number.isFinite(Number(coin?.amount)) ? Math.round(Number(coin.amount)) : null,
			      distance: Number.isFinite(Number(coin?.distance)) ? Math.round(Number(coin.distance)) : null,
			      at: Date.now()
			    };
			  }

			  function buildMissingHeldOpportunity(self, activeThreats, opportunities) {
			    const t = now();
			    const result = buildMissingHeldOpportunityCore(bot.opportunityChoice, opportunities, opportunityChoiceCoreOptions({
			      nowMs: t,
			      self,
			      activeThreats,
			      missingHoldMs: cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs,
			      nativeCoinAuthoritativeRadius: typeof snapshotCoinLocalSuppressRadius === 'function' ? snapshotCoinLocalSuppressRadius() : cfg.nativeCoinAuthoritativeRadius,
			      snapshotCoinMaxDistance: cfg.snapshotCoinMaxDistance,
			      globalCoinMaxDistance: cfg.globalCoinMaxDistance,
			      coinMaxDistance: cfg.coinMaxDistance,
			      visibleSourcesConfirmMissing: choice => visibleCoinSourcesConfirmTargetMissing(choice),
			      ignoredCoin: id => Boolean(bot.ignoredCoins && typeof bot.ignoredCoins.has === 'function' && bot.ignoredCoins.has(String(id))),
			      coinBlockedByThreat: (origin, coin, threat) => {
			        const blocked = coinBlockedByThreat(origin, coin, threat);
			        if (blocked) recordCoinFilterDiagnostic(coin, 'threat-blocked', { threat: coinThreatDiagnostics(threat) });
			        return blocked;
			      },
			      coinStaminaCost: opportunityCoinStaminaCost,
			      coinStaminaAffordable: (origin, coin, staminaCost) => coinStaminaAffordableWithDiagnostic(origin, coin, staminaCost),
			      scoreCoinOpportunity,
			      priorityTier: opportunityPriorityTier
			    }));
			    if (result?.clearMissing) {
			      clearMissingVisibleCoinTarget(bot.opportunityChoice, result.coin, result.clearReason || 'visible-coin-disappeared', t);
			      return null;
			    }
			    const item = result?.opportunity || null;
			    if (!item) return null;
			    const coin = result.coin || item.sourceCoin || item;
			    const { sourceCoin, ...opportunity } = item;
			    return {
			      ...opportunity,
			      action: () => buildCoinAction(self, coin, opportunity.reason, opportunity.actionKind === 'seek-coin' ? 'seek-coin' : null)
			    };
		  }

			  function rememberOpportunityChoice(item, action, previous = bot.opportunityChoice) {
	    if (!item) return action;
	    const result = rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions());
	    bot.opportunityChoice = result.choice;
	    return result.action;
	  }

		  function isHighValueCoinOpportunity(item) {
		    return isHighValueCoinOpportunityCore(item, opportunityChoiceCoreOptions());
		  }

		  function highValueCoinHoldBlocksEnemySwitch(held, best) {
		    return highValueCoinHoldBlocksEnemySwitchCore(held, best, opportunityChoiceCoreOptions());
		  }

		  function chooseStableOpportunity(opportunities) {
		    const result = chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
		    bot.opportunitySwitchLock = result.switchLock;
		    return result.chosen;
		  }

  function pickBestOpportunity(self, activeThreats, coinGroups, enemyGroups, options = {}) {
    const enemyTargets = enemyOpportunityCandidates(self, enemyGroups.flat(), activeThreats);
    const routeCoin = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coinGroups), activeThreats);
	    const opportunities = buildOpportunityCandidatesCore(
	      self,
	      activeThreats,
	      coinGroups,
	      enemyTargets,
	      routeCoin,
	      opportunityCandidateCoreOptions(self)
	    ).map(item => {
	      if (item.type === 'coin') {
	        const coin = item.sourceCoin || item;
	        return {
	          ...item,
	          action: () => buildCoinAction(self, coin, item.reason, item.actionKind === 'seek-coin' ? 'seek-coin' : 'coin')
	        };
	      }
	      const target = item.sourceTarget || item;
	      return {
	        ...item,
	        action: () => buildEnemyAction(self, target, item.reason || '')
	      };
	    });

	    if (!options.disableMissingHold) {
	      const missingHeld = buildMissingHeldOpportunity(self, activeThreats, opportunities);
	      if (missingHeld) opportunities.push(missingHeld);
	    }
			    const best = chooseStableOpportunity(opportunities);
		    if (!best) return null;
		    const action = best.action();
		    return rememberOpportunityChoice(best, action);
		  }

	  function patrolDirection(self, activeThreats, nearbyHumans, scanCoin = null) {
    if (scanCoin) {
      const dir = directionTo(self, scanCoin, cfg.patrolPrecisionTolerance);
      if ((dir.dx || dir.dy) && dir.distance <= cfg.patrolCoinMaxDistance) {
        return {
          ...dir,
          reason: 'scan-toward-distant-coin'
        };
      }
    }

    let vx = 0;
    let vy = 0;
    for (const human of nearbyHumans.slice(0, 8)) {
      const d = Math.max(1, dist(self, human));
      if (d > 50000) continue;
      const weight = (50000 - d + 1000) / d;
      vx += (Number(self.x) - Number(human.x)) * weight / d;
      vy += (Number(self.y) - Number(human.y)) * weight / d;
    }
    for (const threat of activeThreats.slice(0, 4)) {
      const d = Math.max(1, dist(self, threat));
      const activeLimit = Math.max(cfg.dangerRadius, Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius));
      if (d > activeLimit) continue;
      const weight = (activeLimit - d + 1000) / d;
      vx += (Number(self.x) - Number(threat.x)) * weight / d;
      vy += (Number(self.y) - Number(threat.y)) * weight / d;
    }
	    let dx = Math.abs(vx) > 0.01 ? Math.sign(vx) : 0;
	    let dy = Math.abs(vy) > 0.01 ? Math.sign(vy) : 0;
	    if (dx || dy) {
	      bot.patrolHeading = null;
	      return { dx, dy, distance: 0, reason: 'maintain-safe-spacing' };
	    }
	    bot.patrolHeading = null;
		    return { dx: 0, dy: 0, distance: 0, reason: 'wait-for-visible-coin-refresh' };
		  }

		  function clearOpportunityChoiceFor(type, id = null) {
		    const choice = bot.opportunityChoice;
		    if (!choice || opportunityChoiceType(choice) !== String(type || '')) return;
		    if (id === null || id === undefined || id === '') {
		      bot.opportunityChoice = null;
		      resetOpportunitySwitchLock();
		      return;
		    }
		    const choiceId = opportunityChoiceId(choice);
		    if (String(choiceId) === String(id)) {
		      bot.opportunityChoice = null;
		      resetOpportunitySwitchLock();
		    }
		  }

  ${coinFailureIgnoreCore.toString()}
  ${staleCoinEscapeDirectionCore.toString()}
  ${coinProgressIntentCore.toString()}
  ${coinAttemptExpiredCore.toString()}
  ${updateCoinAttemptCore.toString()}
  ${updateCoinProgressRecordCore.toString()}
  ${buildIgnoredCoinProgressCore.toString()}
  ${buildIgnoredCoinPatrolActionCore.toString()}
  ${coinIgnoreCleanupIntentCore.toString()}

  function coinProgressCoreOptions(extra = {}) {
    return {
      coinIgnoreMs: cfg.coinIgnoreMs,
      coinProgressMinGain: cfg.coinProgressMinGain,
      coinNearStuckResetGain: cfg.coinNearStuckResetGain,
      closeCoinStuckDistance: cfg.closeCoinStuckDistance,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      closeCoinStuckMs: cfg.closeCoinStuckMs,
      nearCoinStuckMs: cfg.nearCoinStuckMs,
      coinNoProgressMs: cfg.coinNoProgressMs,
      coinFailureDecayMs: cfg.coinFailureDecayMs,
      coinCloseFailureIgnoreMs: cfg.coinCloseFailureIgnoreMs,
      coinNearFailureIgnoreMs: cfg.coinNearFailureIgnoreMs,
      coinNoProgressIgnoreMs: cfg.coinNoProgressIgnoreMs,
      coinFailureMaxIgnoreMs: cfg.coinFailureMaxIgnoreMs,
      staleCoinEscapeMs: cfg.staleCoinEscapeMs,
      ...extra
    };
  }

	  function coinFailureIgnore(id, reason, t) {
    const result = coinFailureIgnoreCore(bot.coinFailures.get(id) || {}, reason, t, coinProgressCoreOptions());
    bot.coinFailures.set(id, {
      count: result.count,
      reason: result.reason,
      lastAt: result.lastAt,
      ignoreUntil: result.ignoreUntil
    });
    bot.ignoredCoins.set(id, result.ignoreUntil);
    return { count: result.count, ignoreMs: result.ignoreMs, ignoreUntil: result.ignoreUntil };
  }

  function staleCoinEscapeDirection(action, self, t) {
    const result = staleCoinEscapeDirectionCore(action, self, t, coinProgressCoreOptions());
    bot.staleCoinEscape = result.state;
    return { dx: result.dx, dy: result.dy };
  }

  function clearIgnoredCoinRuntimeState(id) {
    const cleanup = coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, id);
    if (cleanup.clearLastTarget) {
      bot.lastTarget = null;
      bot.lastTargetAt = 0;
    }
    clearOpportunityChoiceFor('coin', id);
    if (cleanup.clearCoinApproachLock) bot.coinApproachLock = null;
  }

  function trackCoinProgress(action, self) {
    const t = now();
    const options = coinProgressCoreOptions();
    for (const [id, attempt] of bot.coinAttempts.entries()) {
      if (coinAttemptExpiredCore(attempt, t, options)) {
        bot.coinAttempts.delete(id);
      }
    }

    if (!coinProgressIntentCore(action)) {
      bot.coinProgress = null;
      if (!bot.staleCoinEscape || t >= Number(bot.staleCoinEscape.until || 0)) bot.coinApproachLock = null;
      return action;
    }

    const attemptResult = updateCoinAttemptCore(bot.coinAttempts.get(String(action.target.id)), action, t, options);
    const id = attemptResult.id;
    const distance = attemptResult.distance;
    const attempt = attemptResult.attempt;
    bot.coinAttempts.set(id, attempt);

    const closeStuck = attemptResult.closeStuck;
    const nearStuck = attemptResult.nearStuck;
    if (closeStuck || nearStuck) {
      const failure = coinFailureIgnore(id, closeStuck ? 'close' : 'near', t);
      const ignoreUntil = failure.ignoreUntil;
      bot.coinAttempts.delete(id);
      bot.coinProgress = buildIgnoredCoinProgressCore(id, attempt, distance, t, ignoreUntil, 'stuck');
      clearIgnoredCoinRuntimeState(id);
      const escape = staleCoinEscapeDirection(action, self, t);
      return buildIgnoredCoinPatrolActionCore(
        action,
        id,
        distance,
        attempt,
        failure,
        escape,
        t,
        closeStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
        true
      );
    }

    const previous = bot.coinProgress;
    const progressResult = updateCoinProgressRecordCore(previous, attempt, distance, t, options);
    bot.coinProgress = progressResult.progress;
    if (!progressResult.stale) {
      return action;
    }

    const failure = coinFailureIgnore(id, 'progress', t);
    const ignoreUntil = failure.ignoreUntil;
    bot.coinAttempts.delete(id);
    bot.coinProgress = buildIgnoredCoinProgressCore(id, bot.coinProgress, distance, t, ignoreUntil, 'progress');
    clearIgnoredCoinRuntimeState(id);
    const escape = staleCoinEscapeDirection(action, self, t);
    return buildIgnoredCoinPatrolActionCore(
      action,
      id,
      distance,
      previous,
      failure,
      escape,
      t,
      'ignore-stale-coin-no-progress'
    );
  }

${actionArbitrationSource()}
${coinTargetRuntimeSource()}
  function chooseAction(self) {
    const {
      entities,
      realtimeEntities,
      activeThreats,
      inactiveTargets,
      realtimeInactiveTargets,
      coins,
      realtimeNearCoins,
      allCoins,
      realtimeCoins,
      snapshotCoins,
      globalTargets,
      realtimeGlobalTargets,
      minimapDropTargets,
      globalCoins,
      realtimeGlobalCoins,
      patrolCoins,
      realtimePatrolCoins,
      scanCoins,
      realtimeScanCoins,
      nearbyHumans,
      combatTargets,
      combatDodgeOnlyTargets,
      bullets
    } = classify(self);
    bot.coinDiagnostics = buildCoinDiagnostics(self, {
      realtimeNearCoins,
      realtimeCoins,
      realtimeGlobalCoins,
      realtimePatrolCoins,
      snapshotCoins
    }, {
      nearDistance: coinDiagnosticsNearDistance(),
      limit: coinDiagnosticsLimit(),
      nowMs: now(),
      ignoredCoinUntil: coin => bot.ignoredCoins.get(String(coin?.drop_id))
    });
    bot.lastActionEntities = entities;
    updateOpportunityAfkStaminaObservations(realtimeEntities);
    const fullHp = isFullHp(self);
    const avoidanceThreats = activeThreats.filter(isAvoidanceThreat);
    const nearbyAvoidanceRadius = Math.max(
      Number(cfg.dangerRadius || 0) || 0,
      Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) || 0,
      Number(cfg.recoveryAvoidRadius || 0) || 0
    );
    const nearbyAvoidanceThreats = nearbyHumans.filter(e => e.distance <= nearbyAvoidanceRadius && isAvoidanceThreat(e));
    const highValueCoinThreats = mergeThreatLists(
      avoidanceThreats,
      nearbyHumans.filter(e => e.native && isAvoidanceThreat(e))
    );
    const coinThreats = highValueCoinThreats;
    bot.actionThreats = coinThreats;
    const recovery = !fullHp && isRecovering(self);
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const engagedCombatTarget = pickEngagedCombatTarget(self, combatTargets, entities, bullets);
    const defensiveCombatTarget = pickCombatTarget(self, [...combatTargets, ...combatDodgeOnlyTargets], bullets, { mode: 'defensive' });
    const safetyIncomingBullet = incomingBulletThreat(self, null, bullets);
    const safetyIncomingOwnerId = safetyIncomingBullet?.ownerId ?? null;
    bot.lastSafety = {
      fullHp,
      combatTargets: combatTargets.length,
      engagedCombat: engagedCombatTarget ? {
        id: engagedCombatTarget.user_id,
        name: engagedCombatTarget.name,
        distance: Math.round(engagedCombatTarget.distance),
        intent: engagedCombatTarget.combatIntent || '',
        ageMs: engagedCombatTarget.combatEngagement?.ageMs || 0,
        outOfRangeMs: engagedCombatTarget.combatEngagement?.outOfRangeMs || 0,
        graceRemainingMs: engagedCombatTarget.combatEngagement?.graceRemainingMs || 0
      } : null,
      nearestActive: activeThreats[0] ? {
        id: activeThreats[0].user_id,
        name: activeThreats[0].name,
        distance: Math.round(activeThreats[0].distance),
        speed: Math.round(activeThreats[0].speed),
        moving: Boolean(activeThreats[0].moving),
        firing: isFiringEntity(activeThreats[0]),
        combatIntent: activeThreats[0].combatIntent || '',
        incomingBulletOwnerId: safetyIncomingOwnerId !== null && safetyIncomingOwnerId !== undefined && String(safetyIncomingOwnerId) === String(activeThreats[0].user_id)
          ? String(safetyIncomingOwnerId)
          : '',
        mode: activeThreats[0].current_join_mode || activeThreats[0].mode || '',
        threatRadius: Math.round(activeThreats[0].threatRadius),
        cautionRadius: Math.round(activeThreats[0].cautionRadius),
        returnBlockRadius: Math.round(returnBlockRadius(activeThreats[0])),
        returnBlockExitRadius: Math.round(returnBlockExitRadius(activeThreats[0])),
        returnBlockResumeRadius: Math.round(returnBlockResumeRadius(activeThreats[0]))
      } : null,
      nearestHuman: nearbyHumans[0] ? {
        id: nearbyHumans[0].user_id,
        name: nearbyHumans[0].name,
        distance: Math.round(nearbyHumans[0].distance),
        mode: nearbyHumans[0].current_join_mode
      } : null,
      recovery,
      avoidanceThreats: coinThreats.length,
      activeAvoidanceThreats: avoidanceThreats.length,
      nearbyAvoidanceThreats: nearbyAvoidanceThreats.length,
      nearestAvoidance: coinThreats[0] ? {
        id: coinThreats[0].user_id,
        name: coinThreats[0].name,
        distance: Math.round(coinThreats[0].distance),
        firing: isFiringEntity(coinThreats[0]),
        combatIntent: coinThreats[0].combatIntent || '',
        incomingBulletOwnerId: safetyIncomingOwnerId !== null && safetyIncomingOwnerId !== undefined && String(safetyIncomingOwnerId) === String(coinThreats[0].user_id)
          ? String(safetyIncomingOwnerId)
          : '',
        mode: coinThreats[0].current_join_mode || coinThreats[0].mode || '',
        invulnerable: isInvulnerable(coinThreats[0])
      } : null,
      conservingStamina: isConservingStamina(self)
    };
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    const pendingPostAttackWaitTarget = pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, entities);
    const highValuePriorityCoin = pickHighValueVisibleCoin(self, realtimeCoins, highValueCoinThreats, {
      ignoreThreats: hpValue(self) >= highValueCoinPriorityHealthyHp()
    });
    const highValuePriorityContext = {
      recovery,
      engagedCombatTarget,
      defensiveCombatTarget,
      activeThreats,
      avoidanceThreats,
      bullets,
      highValuePriorityCoin
    };
    if (!pendingPostAttackWaitTarget
      && highValueVisibleCoinPriorityNeeded(self, highValuePriorityContext)
      && canPrioritizeHighValueVisibleCoin(self, highValuePriorityCoin, highValuePriorityContext)) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      if (engagedCombatTarget) clearCombatEngagement('high-value-visible-coin-priority');
      const action = buildCoinAction(self, highValuePriorityCoin, 'high-value-visible-coin-priority');
      action.ignoreReturnBlock = true;
      action.highValueCoinPriority = {
        amount: Number(highValuePriorityCoin.amount || 0),
        minAmount: highValueCoinPriorityAmount(),
        hp: Math.round(hpValue(self)),
        healthyHp: highValueCoinPriorityHealthyHp()
      };
      return action;
    }
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = buildCombatAction(self, recoveryCombatTarget, bullets);
      if (recoveryCombatAction) {
        bot.fleeLock = null;
        bot.returnBlockScan = null;
        return recoveryCombatAction;
      }
      clearCombatEngagement('recovery-hold');
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, engagedCombatTarget, bullets);
    }
    if (fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.threatRadius) }))
      };
    }
    if (fullHp && cautionThreats.length) {
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.cautionRadius) }))
      };
    }
    if (!recovery && defensiveCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    const activeCombatWaitThreat = pickActiveCombatWaitThreat(self, activeThreats, bullets);
    if (!recovery && activeCombatWaitThreat) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      bot.lastSafety.activeCombatWaitThreat = {
        id: activeCombatWaitThreat.user_id,
        name: activeCombatWaitThreat.name,
        distance: Math.round(activeCombatWaitThreat.distance),
        speed: Math.round(activeCombatWaitThreat.speed),
        moving: Boolean(activeCombatWaitThreat.moving),
        firing: isFiringEntity(activeCombatWaitThreat)
      };
      return activeCombatThreatWaitAction(activeCombatWaitThreat);
    }
    if (!fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.threatRadius) }))
      };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = pickCoin(self, realtimeNearCoins, coinThreats, nearCoinLimit);
    const footCoin = pickCoin(self, realtimeNearCoins, coinThreats, cfg.footCoinPriorityDistance);
    const postAttackCoin = pickPostAttackDropCoin(self, realtimeCoins, coinThreats, entities, {
      includeSingle: !recovery,
      maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance,
      minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0
    });
    if (postAttackCoin) {
      bot.fleeLock = null;
      if (bot.lastTarget?.kind === 'enemy') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
      }
      clearOpportunityChoiceFor('enemy', postAttackCoin.postAttackTarget?.id);
      const action = buildCoinAction(self, postAttackCoin, 'post-attack-drop-coin');
      action.postAttackTarget = postAttackCoin.postAttackTarget;
      return action;
    }
    const postAttackWaitTarget = pendingPostAttackWaitTarget || pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, entities);
    if (postAttackWaitTarget) {
      bot.fleeLock = null;
      clearOpportunityChoiceFor('enemy', postAttackWaitTarget.id);
      return buildPostAttackDropWaitAction(self, postAttackWaitTarget);
    }
	    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExit(
	      self,
	      safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self)
	    );
	    if (staminaBudgetExit) {
	      bot.fleeLock = null;
	      return staminaBudgetCoinLeaveAction(staminaBudgetExit);
	    }
    if (nearbyAvoidanceThreats.length) {
      const reason = 'avoid-invulnerable-target';
      const flee = lockedFleeDirection(self, nearbyAvoidanceThreats, reason);
      return {
        kind: 'flee',
        reason,
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: nearbyAvoidanceThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), mode: e.current_join_mode, drop: e.drop, speed: Math.round(e.speed), invulnerable: isInvulnerable(e) }))
      };
    }

	    if (recovery && nearCoin) {
	      bot.fleeLock = null;
	      const dir = coinDirectionTo(self, nearCoin);
      return {
        kind: 'coin',
        reason: 'recovery-foot-coin',
        target: { id: nearCoin.drop_id, x: nearCoin.x, y: nearCoin.y, amount: nearCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      };
    }

			    if (recovery) {
	      bot.fleeLock = null;
	      return {
        kind: 'recover',
        reason: 'wait-for-full-stamina-and-hp',
        dx: 0,
        dy: 0,
        recovery: {
          hp: Number(self.hp || 0),
          stamina5s: Number(self.stamina_5s_remaining_milli || 0),
          stamina5sLimit: Number(self.stamina_5s_limit_milli || 10000)
        }
      };
    }

	    if (!fullHp && cautionThreats.length) {
	      if (footCoin) {
	        bot.fleeLock = null;
	        const dir = coinDirectionTo(self, footCoin);
        return {
          kind: 'coin',
          reason: 'foot-coin-before-active-caution',
          target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
          dx: dir.dx,
          dy: dir.dy,
          ...coinMotionMeta(dir)
        };
      }
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.cautionRadius) }))
	      };
	    }

			    if (footCoin) {
	      bot.fleeLock = null;
	      const dir = coinDirectionTo(self, footCoin);
      return attachOpportunisticShot({
        kind: 'coin',
        reason: 'foot-coin-priority',
        target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      }, self, realtimeEntities, { recovery });
    }

    const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoin(self, realtimeCoins, coinThreats);
    if (dailyStaminaFinalCoin) {
      bot.fleeLock = null;
      clearOpportunityChoiceFor('coin');
      return attachOpportunisticShot(
        dailyStaminaFinalCoinAction(self, dailyStaminaFinalCoin),
        self,
        realtimeEntities,
        { recovery }
      );
    }

    const localRealtimeCoin = pickRealtimeLocalCoin(self, realtimeCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickCoinField(self, realtimeCoins, coinThreats)
      : null;
    const opportunityCoinGroups = [
      { coins: realtimeNearCoins, maxDistance: cfg.coinMaxDistance },
      { coins: realtimeGlobalCoins, maxDistance: cfg.globalCoinMaxDistance },
      { coins: realtimePatrolCoins, maxDistance: cfg.patrolCoinMaxDistance },
      ...(fieldCompetitionCoin ? [{ coins: [fieldCompetitionCoin], maxDistance: cfg.fieldMigrationMaxDistance }] : [])
    ];
    const profitableCombatTarget = pickProfitableCombatTarget(self, combatTargets, bullets, opportunityCoinGroups, coinThreats);
    if (profitableCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, profitableCombatTarget, bullets);
    }

    const opportunityEnemyGroups = fullHp
      ? [
        realtimeInactiveTargets.filter(isAfkProfitTarget),
        realtimeGlobalTargets.filter(isAfkProfitTarget)
      ]
      : [realtimeInactiveTargets, realtimeGlobalTargets];
    const opportunity = pickBestOpportunity(
      self,
      coinThreats,
      opportunityCoinGroups,
      opportunityEnemyGroups
    );
    if (opportunity) {
      bot.fleeLock = null;
      return attachOpportunisticShot(opportunity, self, realtimeEntities, { recovery });
    }

    const distantCoin = pickDistantCoin(self, realtimeCoins, coinThreats);
    if (distantCoin) {
      bot.fleeLock = null;
      const dir = coinDirectionTo(self, distantCoin);
      return attachOpportunisticShot({
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        target: { id: distantCoin.drop_id, x: distantCoin.x, y: distantCoin.y, amount: distantCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      }, self, realtimeEntities, { recovery });
    }

    if (localRealtimeCoin) {
      bot.fleeLock = null;
      const action = buildCoinAction(
        self,
        localRealtimeCoin,
        snapshotCoinNavigationReason(localRealtimeCoin),
        localRealtimeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
      );
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, action), self, realtimeEntities, { recovery });
    }

    if (hasReturnBlockThreat(avoidanceThreats)) {
      bot.fleeLock = null;
      return buildReturnBlockScanAction(self, avoidanceThreats, nearbyHumans);
    }

	    bot.fleeLock = null;
	    const shotWait = buildOpportunisticShotWait(self, realtimeEntities, { recovery });
	    if (shotWait) return shotWait;

	    bot.snapshotCoinWaitSince = 0;
	    bot.lastSnapshotCoinWaitAgeMs = 0;
	    const hasRealtimeCoinForBudgetWait = (realtimeCoins || []).some(coin => Number(coin?.amount || 0) > 0);
	    const staminaBlocked = hasRealtimeCoinForBudgetWait
	      ? summarizeBlockedStaminaOpportunity(self, realtimeCoins, [])
	      : null;
	    const waitReason = staminaBlocked ? 'wait-for-stamina-budget' : 'wait-for-visible-coin-refresh';
	    const sourceSummary = bot.lastCoinSourceSummary || {};
	    const waitDisplay = staminaBlocked
	      ? '长期体力预算不足，预算' + formatDurationMs(staminaBlocked.budgetMs)
	        + '，最近目标需' + formatDurationMs(staminaBlocked.requiredMs)
	        + '，差' + formatDurationMs(staminaBlocked.shortageMs)
	      : '等待视野内金币刷新';
	    return {
	      kind: 'wait',
	      reason: waitReason,
	      dx: 0,
	      dy: 0,
	      displayReason: waitDisplay,
	      staminaBlocked,
	      coinSources: sourceSummary,
	      visibleCoins: {
	        realtime: arrayCount(realtimeCoins),
	        near: arrayCount(realtimeNearCoins),
	        patrol: arrayCount(realtimePatrolCoins),
	        global: arrayCount(realtimeGlobalCoins)
	      },
	      sampling: {
	        snapshotAgeMs: Number.isFinite(snapshotCoinAgeMs()) ? Math.round(snapshotCoinAgeMs()) : null,
	        error: bot.globalState.error || ''
	      }
	    };
  }

  async function tick(source = 'timer') {
    if (!bot.running) return;
    if (bot.ticking) {
      await handleTickReentryCombatGap(source);
      return bot.status();
    }
    bot.ticking = true;
    try {
      const tickStartedAt = Date.now();
      const previousTickAt = Number(bot.lastTickAt || 0) || 0;
      bot.previousTickAt = previousTickAt;
      bot.previousTickSource = bot.lastTickSource || '';
      bot.previousTickCombatActive = Boolean(bot.lastTickCombatActive);
      bot.lastTickGapMs = previousTickAt ? Math.max(0, Math.round(tickStartedAt - previousTickAt)) : null;
      bot.lastTickSource = source;
      bot.lastTickAt = tickStartedAt;
      bot.lastCombatTickGap = null;
      bot.tickCount += 1;
      const cloudflare = cloudflareErrorInfo();
      if (cloudflare) {
        bot.lastDecision = {
          kind: 'wait',
          reason: 'cloudflare-error-refresh',
          dx: 0,
          dy: 0,
          currentUserId: getCurrentUserId(),
          cloudflare,
          displayReason: cloudflare.displayReason,
          holdRemainingMs: cloudflare.remainingMs
        };
        updateBotPanel(bot.lastDecision);
        maybeReloadCloudflareError(cloudflare);
        if (cfg.once) bot.stop('once');
        return;
      }
      if (syncPausedFromPage()) {
        bot.lastDecision = {
          kind: 'idle',
          reason: 'paused',
          dx: 0,
          dy: 0,
          self: bot.lastSelf,
          paused: true,
          pauseReason: bot.pauseReason || 'manual'
        };
        if (cfg.once) bot.stop('once');
        return;
      }
				      const self = getSelf();
      const pendingExitDecision = await handlePendingExit(self);
      if (pendingExitDecision) {
        bot.lastDecision = pendingExitDecision;
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs();
      if (exitMotionLockRemainingMs > 0) {
        bot.pursuit = null;
        stopMotionSafely(bot.lastExitMotionStopReason || 'exit-motion-stopped');
        refreshGlobalState(false).catch(err => {
          bot.globalState.error = err.message || String(err);
        });
        bot.lastDecision = postExitDecisionWithoutTarget({
          kind: 'wait',
          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
          dx: 0,
          dy: 0,
          self: self ? summarizeSelf(self) : bot.lastSelf,
          currentUserId: getCurrentUserId(),
          control: summarizeControl(),
          holdRemainingMs: exitMotionLockRemainingMs
        }, bot.lastExitMotionStopReason || 'exit-motion-stopped');
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
	      const enemyHoldControl = summarizeControl();
	      let enemyHoldRemainingMs = enemyReloginHoldRemainingMs();
	      if (enemyHoldRemainingMs > 0 && self && isAlive(self) && enemyHoldControl.wsOpen) {
	        clearEnemyReloginHold('online self restored during enemy hold');
	        enemyHoldRemainingMs = 0;
	      }
		      if (enemyHoldRemainingMs > 0) {
		        const enemyLeaveDetail = activeEnemyLeaveDetail();
		        bot.pursuit = null;
		        stopMotionSafely('enemy-leave-wait');
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
	        bot.lastDecision = {
          kind: 'wait',
          reason: 'enemy-leave-wait',
          dx: 0,
	          dy: 0,
	          self: self ? summarizeSelf(self) : null,
		          currentUserId: getCurrentUserId(),
		          control: enemyHoldControl,
	          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs(),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          leave: null,
	          pursuit: enemyLeaveDetail?.pursuit || bot.lastPursuitLeaveResult?.pursuit || null,
	          enemyLeave: {
	            displayReason: enemyLeaveDetail?.displayReason || '',
            summary: enemyLeaveDetail?.summary || '',
            enemyActor: enemyLeaveDetail?.enemyActor || null,
            reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
            lastPursuitResult: bot.lastPursuitLeaveResult,
            lastCombatResult: bot.lastCombatLeaveResult,
            lastRetryResult: bot.lastEnemyLeaveRetryResult
          }
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const offlineHoldControl = summarizeControl();
      let offlineHoldRemainingMs = offlineReloginHoldRemainingMs();
      if (offlineHoldRemainingMs > 0 && self && isAlive(self) && offlineHoldControl.wsOpen) {
        clearOfflineReloginHold('online self restored during offline hold');
        offlineHoldRemainingMs = 0;
      }
      if (offlineHoldRemainingMs > 0) {
        const offlineLeaveDetail = activeOfflineLeaveDetail();
        bot.pursuit = null;
	        stopMotionSafely('offline-leave-wait');
	        const currentSummary = self && isAlive(self) ? summarizeSelf(self) : (offlineLeaveDetail?.self || bot.lastSelf || null);
	        const offlineSafety = bot.lastOfflineSafety || offlineLeaveDetail?.offlineSafety || (self && isAlive(self) ? assessOfflineSafety(self) : null);
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
        bot.lastDecision = {
          kind: 'wait',
          reason: 'offline-leave-wait',
          dx: 0,
          dy: 0,
          self: currentSummary,
          currentUserId: getCurrentUserId(),
	          control: offlineHoldControl,
	          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs(),
	          displayReason: offlineLeaveDetail?.displayReason || offlineLeaveSummary('offline leave wait', offlineSafety),
	          offlineSafety,
	          leave: null,
	          offlineLeave: {
	            displayReason: offlineLeaveDetail?.displayReason || '',
	            summary: offlineLeaveDetail?.summary || '',
	            lastResult: bot.lastOfflineLeaveResult,
	            lastRetryResult: null
	          }
	        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
					      if (!self || !isAlive(self)) {
					        if (self && !isAlive(self)) {
					          const unavailableSummary = summarizeSelf(self);
					          updateSessionStats(unavailableSummary);
					          finishImportantCombat('not-alive:' + (unavailableSummary.life || 'unknown'), { at: Date.now(), selfHp: unavailableSummary.hp });
					        } else if (!self && bot.session?.startedAt && !bot.session.missingSince) {
					          bot.session.missingSince = Date.now();
					        }
					        noteSelfUnavailableForPostLoginZoom();
					        bot.pursuit = null;
		        stopMotionSafely('no-self');
		        if (!bot.waitSince) bot.waitSince = Date.now();
	        const control = summarizeControl();
        const noSelfAgeMs = Math.max(0, Date.now() - Number(bot.waitSince || Date.now()));
        const noSelfExit = !self ? noSelfGameSessionExitState(control, noSelfAgeMs) : null;
        const liveSessionTakeover = !self && noSelfExit?.sessionMismatch && noSelfExit?.mismatchTimedOut
          ? liveSessionMismatchTakeoverState(control, noSelfExit)
          : null;
        if (!cfg.dryRun && liveSessionTakeover?.allowed) {
          const recoveryReload = sessionMismatchRecoveryReloadSatisfied(control, noSelfExit);
          if (!recoveryReload) {
            const reload = requestSessionMismatchRecoveryReload(control, noSelfExit, liveSessionTakeover);
            const waitReason = reload?.reason === 'exit-log-flush-pending'
              ? 'exit-log-flush-pending'
              : 'session-mismatch-refresh';
            const displayReason = reload?.displayReason
              || (waitReason === 'exit-log-flush-pending'
                ? '等待退出日志发送完成，暂不刷新确认会话状态'
                : (reload?.reason === 'state-persist-failed'
                  ? '无法记录刷新确认状态，暂不接管'
                  : '界面显示未登录但原生会话仍在线，先刷新页面确认状态'));
            refreshGlobalState(false).catch(err => {
              bot.globalState.error = err.message || String(err);
            });
            bot.lastDecision = {
              kind: 'wait',
              reason: waitReason,
              dx: 0,
              dy: 0,
              currentUserId: getCurrentUserId(),
              control,
              visibleEntities: arrayCount(bot.globalState.entities),
              self: null,
              noSelfAgeMs,
              noSelfGameSession: noSelfExit,
              liveSessionTakeover,
              sessionMismatchRecovery: reload?.state || summarizeSessionMismatchRecoveryStatus(),
              sessionMismatchRecoveryReload: reload || null,
              exitAuditFlush: reload?.exitAuditFlush || null,
              displayReason
            };
            updateBotPanel(bot.lastDecision);
            if (cfg.once) bot.stop('once');
            return;
          }
          const login = await maybeStartAutoLogin('session-mismatch-recovery', {
            force: true,
            ignoreSuppress: true,
            ignoreLoginCooldown: true,
            allowLiveSessionTakeoverBypass: true,
            liveSessionTakeover
          });
          const sessionMismatchWaitReason = login?.attempted
            ? 'auto-login'
            : (login?.reason === 'snapshot-gate'
              ? 'login-snapshot-gate'
              : (login?.reason === 'exit-log-flush-pending'
                ? 'exit-log-flush-pending'
                : (login?.reason === 'important-log-flush-pending'
                  ? 'important-log-flush-pending'
                  : 'session-mismatch-recovery')));
          const sessionMismatchDisplayReason = login?.attempted
            ? '界面显示未登录但原生会话仍在线，已通过接管门禁，正在重登接管'
            : (sessionMismatchWaitReason === 'login-snapshot-gate'
              ? loginSnapshotGateDisplayReason(login?.snapshotGate)
              : (sessionMismatchWaitReason === 'exit-log-flush-pending'
                ? '等待退出日志发送完成，暂不刷新或重新登录'
                : (sessionMismatchWaitReason === 'important-log-flush-pending'
                  ? '等待会话结束日志发送完成，暂不刷新或重新登录'
                  : '界面显示未登录但原生会话仍在线，等待接管')));
          const sessionMismatchLoginPending = Boolean(login?.attempted || (login?.needed && !login?.error));
          refreshGlobalState(false).catch(err => {
            bot.globalState.error = err.message || String(err);
          });
          bot.lastDecision = {
            kind: 'wait',
            reason: sessionMismatchWaitReason,
            dx: 0,
            dy: 0,
            currentUserId: getCurrentUserId(),
            control,
            visibleEntities: arrayCount(bot.globalState.entities),
            self: null,
            noSelfAgeMs,
            noSelfGameSession: noSelfExit,
            liveSessionTakeover,
            sessionMismatchRecovery: recoveryReload || summarizeSessionMismatchRecoveryStatus(),
            login,
            displayReason: sessionMismatchDisplayReason
          };
          updateBotPanel(bot.lastDecision);
          if (!sessionMismatchLoginPending && Date.now() - bot.waitSince > Math.max(10000, Number(cfg.loginCooldownMs || 5000) * 2)) {
            requestReload('session mismatch recovery stalled');
          }
          if (cfg.once) bot.stop('once');
          return;
        }
        if (!noSelfExit?.sessionMismatch && bot.sessionMismatchRecovery) {
          clearSessionMismatchRecoveryState('session mismatch resolved');
        }
        if (!cfg.dryRun && noSelfExit?.shouldLeave) {
	          if (!bot.offlineSince) bot.offlineSince = Date.now();
	          const offlineAgeMs = Math.max(0, Date.now() - Number(bot.offlineSince || Date.now()));
	          const offlineSafety = {
	            unsafe: true,
	            noSelfGameSession: noSelfExit,
	            reconnectChurn: noSelfExit.reconnectChurn,
	            liveSessionTakeover,
	            passiveDangerRadius: Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0)),
	            nearestHuman: null,
	            nearestActive: null
	          };
	          bot.lastOfflineSafety = offlineSafety;
	          stopMotionSafely(noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session');
	          const leaveResult = await leaveOffline(noSelfExit.reason, bot.lastSelf, offlineSafety);
	          noteImportantSessionExit(noSelfExit.reason || 'no-self-game-session', bot.lastSelf, Date.now(), { exit: leaveResult });
	          const offlineDetail = activeOfflineLeaveDetail();
	          refreshGlobalState(false).catch(err => {
	            bot.globalState.error = err.message || String(err);
	          });
	          bot.lastDecision = {
	            kind: 'wait',
	            reason: leaveResult?.attempted && !leaveResult?.error
	              ? 'offline-leave'
	              : (noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session'),
	            dx: 0,
	            dy: 0,
	            currentUserId: getCurrentUserId(),
	            control,
	            visibleEntities: arrayCount(bot.globalState.entities),
	            self: null,
	            offlineAgeMs,
	            noSelfAgeMs,
	            noSelfGameSession: noSelfExit,
	            liveSessionTakeover,
	            offlineSafety,
	            displayReason: currentOfflineDisplayReason(noSelfExit.reason, offlineSafety, leaveResult, offlineDetail, noSelfExit.displayReason),
	            leave: leaveResult
	          };
	          updateBotPanel(bot.lastDecision);
	          if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	            requestReload('game session missing self too long');
	          }
          if (cfg.once) bot.stop('once');
          return;
        }
        const login = await maybeStartAutoLogin(self ? 'not-alive' : 'no-self');
        const gameSessionPending = !self && controlHasNativeGameSession(control);
        const waitReason = login?.attempted
          ? 'auto-login'
          : (login?.needed
            ? (login?.reason === 'snapshot-gate'
              ? 'login-snapshot-gate'
              : (login?.error ? 'login-control-missing' : (login?.reason === 'suppressed' ? 'login-suppressed' : (login?.reason === 'exit-log-flush-pending' ? 'exit-log-flush-pending' : (login?.reason === 'important-log-flush-pending' ? 'important-log-flush-pending' : (login?.reason === 'session-mismatch-recovery' ? 'session-mismatch-recovery' : 'login-cooldown'))))))
            : (noSelfExit?.sessionMismatch ? 'session-mismatch-recovery' : (gameSessionPending ? 'game-session-connecting' : (self ? 'not-alive' : 'no-self'))));
        const loginDisplayReason = waitReason === 'game-session-connecting'
          ? '已登录，等待游戏连接/自身实体'
          : (waitReason === 'session-mismatch-recovery'
            ? '界面显示未登录但原生会话仍在线，等待安全重登'
          : (waitReason === 'exit-log-flush-pending'
            ? '等待退出日志发送完成，暂不刷新或重新登录'
          : (waitReason === 'important-log-flush-pending'
            ? '等待会话结束日志发送完成，暂不刷新或重新登录'
          : (waitReason === 'login-snapshot-gate'
            ? loginSnapshotGateDisplayReason(login?.snapshotGate)
          : (waitReason === 'login-suppressed'
            ? '等待重连：' + (login?.suppressReason || 'login suppressed')
              + (Number(login?.cooldownRemainingMs || 0) > 0 ? '，剩余' + formatDurationMs(login.cooldownRemainingMs) : '')
            : '')))));
		        refreshGlobalState(false).catch(err => {
		          bot.globalState.error = err.message || String(err);
		        });
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: waitReason,
		          displayReason: loginDisplayReason,
	          currentUserId: getCurrentUserId(),
			          control,
			          visibleEntities: arrayCount(bot.globalState.entities),
		          self,
		          noSelfAgeMs,
		          noSelfGameSession: noSelfExit,
	          login
		        };
	        updateBotPanel(bot.lastDecision);
	        const loginPending = Boolean(login?.attempted || (login?.needed && !login?.error));
	        if (!loginPending && Date.now() - bot.waitSince > cfg.reloadAfterNoSelfMs) {
	          requestReload('no self for too long');
        }
        if (cfg.once) bot.stop('once');
        return;
	      }
	      bot.waitSince = 0;
	      const hadPreviousSelf = Boolean(bot.lastSelf);
	      const previousHp = Number(bot.lastSelf?.hp ?? NaN);
	      const previousDrop = Number(bot.lastSelf?.drop ?? 0);
	      const previousCoins = Number(bot.lastSelf?.coins ?? 0);
	      const currentSummary = summarizeSelf(self);
	      observeNetworkQualitySelf(currentSummary);
	      if (bot.sessionMismatchRecovery) clearSessionMismatchRecoveryState('self restored');
      updateSessionStats(currentSummary);
      const staminaState = currentSummary.stamina || summarizeStamina(self);
      maybeRecordLoginPoint(currentSummary);
      const deferredStaminaLeave = deferredStaminaExhaustionLeave(staminaState);
      if (deferredStaminaLeave) {
        stopMotionSafely('stamina-sample-wait');
        bot.lastDecision = {
          kind: 'wait',
          reason: 'game-session-connecting',
          dx: 0,
          dy: 0,
          control: summarizeControl(),
          self: currentSummary,
          stamina: staminaState,
          staminaExhaustionDeferred: deferredStaminaLeave,
          displayReason: '已登录，等待有效体力数据'
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      schedulePostLoginZoomOut(currentSummary);
		      const currentHp = Number(currentSummary.hp ?? NaN);
      if (staminaState.mustLeave && !bot.pendingExit) {
        bot.pursuit = null;
        bot.lastSelf = currentSummary;
        updateKillHistory(self);
        updateSessionStats(currentSummary);
        stopMotionSafely('stamina-exhausted');
        if (!bot.offlineSince) bot.offlineSince = Date.now();
        const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          staminaExhausted: staminaState
        };
        bot.lastOfflineSafety = offlineSafety;
        const staminaDisplayReason = offlineLeaveSummary('stamina exhausted', offlineSafety);
        const leaveResult = await leaveOffline('stamina exhausted', currentSummary, offlineSafety);
        const offlineDetail = activeOfflineLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveResult?.attempted && !leaveResult?.error ? 'stamina-exhausted-leave' : 'control-stamina-exhausted',
          dx: 0,
          dy: 0,
          control: summarizeControl(),
          self: currentSummary,
          offlineAgeMs,
          leaveDelayMs: 0,
          stamina: staminaState,
          offlineSafety,
          displayReason: currentOfflineDisplayReason('stamina exhausted', offlineSafety, leaveResult, offlineDetail, staminaDisplayReason),
          leave: leaveResult
        };
        updateBotPanel(bot.lastDecision);
        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
          requestReload('stamina exhausted too long');
        }
        if (cfg.once) bot.stop('once');
        return;
      }
      let coinMarked = false;
      if (hadPreviousSelf) {
        coinMarked = markCoinCollected(self, currentSummary, previousCoins);
        if (!coinMarked) {
          coinMarked = recordIncidentalCoinPickups(self, currentSummary, bot.lastSelf, previousCoins);
        }
      } else {
        rememberNativeCoinSnapshot();
      }
	      if (!coinMarked && Number(currentSummary.drop || 0) > previousDrop) {
	        clearCoinTracking('drop-increased');
	      }
	      bot.lastSelf = currentSummary;
	      updateKillHistory(self);
      if (hadPreviousSelf && Number.isFinite(previousHp) && Number.isFinite(currentHp) && currentHp > 0 && previousHp > currentHp) {
        bot.pendingInjuryLeave = {
          at: Date.now(),
          previousHp,
          currentHp,
          lostHp: Math.max(0, previousHp - currentHp),
          self: currentSummary,
          incomingBullet: bot.lastDecision?.incomingBullet || null,
          nearestActive: bot.lastSafety?.nearestActive || null,
          nearestHuman: bot.lastSafety?.nearestHuman || null
        };
        rememberLoginPointDamageThreat(bot.pendingInjuryLeave, 'self-hp-drop');
      }
	      ensureControlWs();
      const serverPositionStall = assessServerPositionStall(self);
      const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
      const actionSettlementStall = assessActionSettlementStall(self, bot.lastDecision);
      const actionSettlementStallOffline = Boolean(cfg.actionSettlementStallOfflineEnabled && actionSettlementStall?.stalled);
      const reconnectChurn = Boolean(bot.control.nativeReconnectChurn);
	      const reconnectChurnDetail = reconnectChurn ? {
	        count: Number(bot.control.nativeReconnectEventCount || 0),
	        windowMs: Number(bot.control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0)
	      } : null;
      const samplingOutage = globalSamplingOutageOfflineState(self);
      const combatTickGap = combatTickGapOfflineState(self, { source });
      bot.lastCombatTickGap = combatTickGap;
      const controlOffline = !bot.control.wsOpen || serverPositionStallOffline || actionSettlementStallOffline || reconnectChurn || Boolean(samplingOutage) || Boolean(combatTickGap);
      const pendingExitAlive = Boolean(bot.pendingExit && self && isAlive(self));
		    if (!cfg.dryRun && controlOffline && !pendingExitAlive) {
		      bot.pursuit = null;
		      stopMotionSafely(samplingOutage ? 'global-sampling-outage' : (combatTickGap ? 'combat-tick-gap' : (actionSettlementStallOffline ? 'action-settlement-stalled' : (serverPositionStallOffline ? 'server-position-stalled' : (reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-offline')))));
		      if (!bot.offlineSince) bot.offlineSince = Date.now();
		      const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          reconnectChurn: reconnectChurnDetail,
          actionSettlementStall,
          samplingOutage,
          combatTickGap
        };
        bot.lastOfflineSafety = offlineSafety;
        const safeLeaveMs = Math.min(3000, Math.max(0, Number(cfg.offlineSafeLeaveMs ?? cfg.offlineLeaveMs ?? 3000)));
        const unsafeLeaveMs = Math.max(0, Number(cfg.offlineUnsafeLeaveMs ?? 0));
        const leaveDelayMs = reconnectChurn || samplingOutage || combatTickGap ? 0 : (offlineSafety.unsafe ? unsafeLeaveMs : safeLeaveMs);
        const offlineLeaveReason = samplingOutage
          ? 'global sampling outage'
          : (combatTickGap
            ? 'combat tick gap'
            : (actionSettlementStallOffline
              ? 'action settlement stalled'
              : (serverPositionStallOffline ? 'server position stalled' : (reconnectChurn ? 'websocket reconnect churn' : 'websocket offline'))));
        const leaveResult = offlineAgeMs >= leaveDelayMs
			        ? await leaveOffline(offlineLeaveReason, currentSummary, offlineSafety)
			        : null;
        const offlineDetail = activeOfflineLeaveDetail();
        const offlineWaitReason = leaveResult?.attempted && !leaveResult?.error
          ? 'offline-leave'
          : (samplingOutage
            ? 'control-global-sampling-outage'
          : (combatTickGap
            ? 'control-combat-tick-gap'
          : (actionSettlementStallOffline
            ? 'control-action-settlement-stalled'
          : (serverPositionStallOffline
            ? 'control-ws-server-position-stalled'
            : (reconnectChurn
              ? 'control-ws-reconnect-churn'
              : (offlineSafety.unsafe ? 'control-ws-offline-unsafe' : 'control-ws-offline-safe-wait'))))));
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: offlineWaitReason,
	          control: summarizeControl(),
	          self: summarizeSelf(self),
	          offlineAgeMs,
          leaveDelayMs,
          offlineSafety,
          reconnectChurn: reconnectChurnDetail,
          actionSettlementStall,
          serverPositionStall,
          samplingOutage,
          combatTickGap,
	          displayReason: currentOfflineDisplayReason(offlineLeaveReason, offlineSafety, leaveResult, offlineDetail, (samplingOutage ? '网络采样超时，正在退出' : (combatTickGap ? '战斗主循环断档，正在退出' : (actionSettlementStallOffline ? '动作结算卡死，正在退出' : (reconnectChurn ? '网络连接反复重连，正在退出' : ''))))),
	          leave: leaveResult
	        };
	        updateBotPanel(bot.lastDecision);
	        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	          requestReload(samplingOutage ? 'global sampling outage too long' : (combatTickGap ? 'combat tick gap too long' : (actionSettlementStallOffline ? 'action settlement stalled too long' : 'websocket offline too long')));
	        }
        if (cfg.once) bot.stop('once');
        return;
      }
      bot.offlineSince = 0;
      if (!serverPositionStall?.active) resetServerPositionStall('online');
      refreshGlobalState(false).catch(err => {
        bot.globalState.error = err.message || String(err);
      });

      const pendingCombatLeave = pendingCombatLeaveAction();
      if (pendingCombatLeave) {
        bot.pursuit = null;
        sendActionVelocity(pendingCombatLeave);
        if (pendingCombatLeave.shoot && pendingCombatLeave.target) {
          shootAt(self, pendingCombatLeave.aimTarget || pendingCombatLeave.target, Boolean(pendingCombatLeave.forceShoot), { shootEveryMs: pendingCombatLeave.shootEveryMs });
        }
        const leaveResult = await leaveForCombat(pendingCombatLeave, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveIssued ? 'combat-leave' : 'combat-leave-retry',
          dx: pendingCombatLeave.dx,
          dy: pendingCombatLeave.dy,
          self: currentSummary,
          target: pendingCombatLeave.target || null,
          combat: true,
          shoot: Boolean(pendingCombatLeave.shoot),
          forceShoot: Boolean(pendingCombatLeave.forceShoot),
          aimTarget: pendingCombatLeave.aimTarget || null,
          combatCover: pendingCombatLeave.combatCover || null,
          combatState: pendingCombatLeave.combatState || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || pendingCombatLeave.displayReason || pendingCombatLeave.exitSummary || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }

      let action = attachCoinDiagnostics(chooseAction(self));
	      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      if (bot.pendingInjuryLeave && isCombatStateForInjuryLeave(action)) {
        action = {
          ...action,
          injury: {
            ...bot.pendingInjuryLeave,
            self: currentSummary,
            currentHp,
            suppressedByCombat: true,
            suppressedReason: 'combat-state'
          }
        };
        bot.pendingInjuryLeave = null;
      }
	      if (action.kind === 'leave' && action.combat) {
	        sendActionVelocity(action);
	        if (action.shoot && action.target) {
	          shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
	        }
        const leaveResult = await leaveForCombat(action, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = leaveIssued
          ? {
            ...action,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            source,
            self: summarizeSelf(self)
          }
          : {
            kind: 'wait',
            reason: 'combat-leave-retry',
            dx: 0,
            dy: 0,
            self: currentSummary,
            source,
            target: action.target || null,
            combat: true,
            combatState: action.combatState || null,
            pendingCombatLeave: summarizePendingCombatLeave(),
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
          };
        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (action.kind === 'leave') {
	        const offlineSafety = {
	          ...assessOfflineSafety(self),
	          staminaBudgetExit: action.staminaBudgetExit || null
	        };
	        const skippedLeave = pendingExitSkipNewLeave('offline', action.reason || 'stamina budget coin leave', {
	          self: currentSummary,
	          offlineSafety,
	          summary: action.displayReason || offlineLeaveSummary(action.reason || 'stamina budget coin leave', offlineSafety)
	        });
	        if (skippedLeave) {
	          bot.lastDecision = {
	            ...action,
	            kind: 'wait',
	            reason: 'pending-exit-active',
	            dx: 0,
	            dy: 0,
	            source,
	            control: summarizeControl(),
	            self: currentSummary,
	            offlineSafety,
	            displayReason: skippedLeave.displayReason || action.displayReason || '',
	            leave: skippedLeave,
	            pendingExit: summarizePendingExit()
	          };
	          updateBotPanel(bot.lastDecision);
	          if (cfg.once) bot.stop('once');
	          return;
	        }
	        bot.pursuit = null;
	        stopMotionSafely(action.reason || 'leave');
	        bot.lastOfflineSafety = offlineSafety;
	        const leaveResult = await leaveOffline(action.reason || 'stamina budget coin leave', currentSummary, offlineSafety);
	        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
	        const offlineDetail = activeOfflineLeaveDetail();
	        bot.lastDecision = {
	          ...action,
	          kind: 'wait',
	          reason: leaveIssued ? action.reason : (action.reason ? action.reason + '-retry' : 'leave-retry'),
	          dx: 0,
	          dy: 0,
	          source,
	          control: summarizeControl(),
	          self: currentSummary,
	          offlineSafety,
	          displayReason: currentOfflineDisplayReason(action.reason || 'stamina budget coin leave', offlineSafety, leaveResult, offlineDetail, action.displayReason || ''),
	          leave: leaveResult,
	          holdRemainingMs: offlineDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs()
	        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (bot.pendingInjuryLeave) {
	        const injury = {
	          ...bot.pendingInjuryLeave,
	          self: currentSummary,
	          currentHp,
	          nearestActive: bot.lastSafety?.nearestAvoidance || bot.lastSafety?.nearestActive || bot.pendingInjuryLeave.nearestActive || null,
	          nearestHuman: bot.lastSafety?.nearestHuman || bot.pendingInjuryLeave.nearestHuman || null
	        };
	        bot.pendingInjuryLeave = null;
	        const skippedLeave = pendingExitSkipNewLeave('injury', 'injury hp drop', {
	          injury,
	          summary: injuryLeaveSummary(injury)
	        });
	        if (!skippedLeave) {
	          Promise.resolve(leaveForInjury(injury)).catch(err => recordUnhandledTickError('injury-leave', err));
	        }
	        action = {
	          ...action,
	          injury: skippedLeave ? { ...injury, suppressedByPendingExit: true } : injury,
	          pendingExitIntent: skippedLeave
	            ? pendingExitIntentForSkippedLeave('injury', 'injury hp drop', skippedLeave)
	            : {
	              reason: 'injury-leave',
	              summary: injuryLeaveSummary(injury)
	            }
	        };
	      }
	      action = attachCoinDiagnostics(trackCoinProgress(action, self));
      const escape = bot.staleCoinEscape;
      const escapeActive = escape && now() < Number(escape.until || 0) && (escape.dx || escape.dy);
      if (escapeActive && action.kind !== 'flee') {
        action = {
          ...action,
          kind: 'patrol',
          reason: action.reason && String(action.reason).startsWith('ignore-') ? action.reason : 'leave-stale-coin',
          dx: escape.dx,
          dy: escape.dy,
          staleCoinEscape: {
            id: escape.id,
            remainingMs: Math.max(0, Math.round(Number(escape.until || 0) - now()))
          }
        };
      } else if (!escapeActive) {
        bot.staleCoinEscape = null;
      }
      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      const pursuit = updatePursuitTracking(self, bot.actionThreats || [], action);
      const pursuitSummary = summarizePursuit(pursuit);
	      if (pursuitSummary && pursuitSummary.durationMs >= Math.max(0, Number(pursuitSummary.thresholdMs || cfg.pursuitLeaveMs))) {
	        const skippedLeave = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
	          self: currentSummary,
	          pursuit: pursuitSummary,
	          summary: pursuitLeaveSummary(pursuitSummary)
	        });
	        if (skippedLeave) {
	          action = {
	            ...action,
	            pursuit: pursuitSummary,
	            leave: skippedLeave,
	            pendingExitIntent: pendingExitIntentForSkippedLeave('pursuit', 'sustained pursuit', skippedLeave)
	          };
	        } else {
	        const leaveResult = await leaveForPursuit(pursuit, currentSummary);
	        const enemyDetail = activeEnemyLeaveDetail();
	        stopMotionSafely('pursuit-leave');
        if (leaveResult?.attempted && !leaveResult?.error) {
          bot.lastDecision = {
            kind: 'wait',
            reason: 'pursuit-leave',
            dx: 0,
            dy: 0,
            self: summarizeSelf(self),
            pursuit: pursuitSummary,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
            leave: leaveResult,
            reloginDelayMs: leaveResult.reloginDelayMs,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
          };
          updateBotPanel(bot.lastDecision);
          if (cfg.once) bot.stop('once');
          return;
        }
        bot.lastDecision = {
          kind: 'wait',
          reason: 'pursuit-leave-retry',
          dx: 0,
          dy: 0,
          self: summarizeSelf(self),
          pursuit: pursuitSummary,
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	        }
	      } else if (pursuitSummary) {
        action = {
          ...action,
          pursuit: pursuitSummary
        };
	      }
	      action = applyFinalActionArbitration(action, source);
	      action = recordActionSwitchDiagnostics(action, source);
	      const canMove = true;
	      const canAttack = true;
	      if (!isSnapshotCoinWaitAction(action)) {
	        bot.snapshotCoinWaitSince = 0;
	        bot.lastSnapshotCoinWaitAgeMs = 0;
	      }
      sendActionVelocity(action);
      if (action.opportunisticShot) {
        const shotSent = shootAt(self, action.opportunisticShot, false, { shootEveryMs: cfg.opportunisticShootEveryMs });
        if (shotSent) rememberAttack(self, action.opportunisticShot, 'opportunistic-shot', action);
      }
      if (action.kind === 'attack' && action.target) {
        if (action.shoot) {
          shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
          rememberAttack(self, action.target, action.kind, action);
        }
        setLastTarget('enemy', action.target.id);
        if (action.combat && !action.combatDodgeOnly) rememberCombatEngagement(self, action.target, action);
      } else if (action.kind === 'wait' && action.combat && action.target) {
        setLastTarget('enemy', action.target.id);
        rememberCombatEngagement(self, action.target, action);
      } else if ((action.kind === 'coin' || action.kind === 'seek-coin') && action.target) {
        setLastTarget('coin', action.target.id);
      } else if ((action.kind === 'seek-enemy' || action.kind === 'seek-drop') && action.target) {
        setLastTarget('enemy', action.target.id);
        if (action.combat && !action.combatDodgeOnly) rememberCombatEngagement(self, action.target, action);
        else rememberAttack(self, action.target, action.kind, action);
      } else if (action.kind === 'flee') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
        clearCombatEngagement(action.reason || 'flee');
      }
      bot.lastDecision = {
        ...action,
        source,
        pendingExit: summarizePendingExit(),
        coinDiagnostics: action.coinDiagnostics || safeJsonClone(bot.coinDiagnostics) || bot.coinDiagnostics || null,
        self: {
          ...summarizeSelf(self),
          canMove,
          canAttack
        }
      };
      updateBotPanel(bot.lastDecision);

	      if (cfg.statusEvery > 0 && Date.now() - bot.lastStatusAt >= cfg.statusEvery) {
	        bot.lastStatusAt = Date.now();
	        console.log('[grasp-rat-bot:status]', safeStringify(bot.lastDecision));
	      }

	      if (cfg.once) bot.stop('once');
		    } catch (err) {
		      recordUnhandledTickError(source, err);
		      try {
		        stopMotionSafely('bot-error');
		      } catch (stopErr) {
		        recordUnhandledTickError(source + ':stop-motion', stopErr);
		      }
		      bot.lastDecision = {
		        kind: 'wait',
		        reason: 'bot-error',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        error: err?.message || String(err)
		      };
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError(source + ':error-panel', panelErr);
		      }
		      try {
		        console.error('[grasp-rat-bot:error]', err);
		      } catch (_) {}
		    } finally {
		      try {
		        recordImportantCombatTick(source, bot.lastDecision);
		      } catch (importantErr) {
		        try {
		          bot.importantLogging.localWriteError = 'combat summary failed: ' + (importantErr?.message || String(importantErr));
		        } catch (_) {}
		      }
		      try {
		        recordCombatLogTick(source, bot.lastDecision);
		      } catch (logErr) {
		        try {
		          bot.combatLogging.lastError = 'record failed: ' + (logErr?.message || String(logErr));
		        } catch (_) {}
		      }
		      try {
		        bot.lastTickCombatActive = combatTickActiveFromState({
		          decision: bot.lastDecision,
		          combatTarget: bot.combatTarget,
		          pendingExit: bot.pendingExit || bot.pendingCombatLeave,
		          nowMs: Date.now()
		        });
		      } catch (_) {
		        bot.lastTickCombatActive = false;
		      }
		      bot.lastTickCompletedAt = Date.now();
		      bot.ticking = false;
		    }
		  }

	  restorePersistedExitAuditLogs();
	  restorePersistedCombatLogPendingEntries();
	  restoreImportantLogsForRemote();
	  installNativeLoginGateInterceptors();

	  installPageGlobal(BOT_KEY, bot, pageGlobal);
		  if (previousBot && previousBot !== bot && previousBot.stop) {
		    try {
		      previousBot.stop('replaced by ' + cfg.version);
	    } catch (err) {
		      console.warn('[grasp-rat-bot] previous stop failed', err);
		    }
		  }
		  installPageNativeSnapshotObserver();
		  startTargetWhitelistPolling();

			  return refreshGlobalState(true)
		    .catch(err => {
		      bot.globalState.error = err?.message || String(err);
		      recordUnhandledTickError('startup-refresh', err);
		    })
		    .then(() => tick('startup'))
		    .then(() => {
		      bot.starting = false;
		      if (!cfg.once && bot.running) {
		        bot.timer = setInterval(() => {
		          runTickSafely('timer');
		        }, cfg.tickMs);
		      }
		      logStatus(cfg.dryRun ? 'started dry-run' : 'started live control');
		      return bot.status();
		    })
		    .catch(err => {
		      recordUnhandledTickError('startup-finalize', err);
		      bot.starting = false;
		      bot.ticking = false;
		      try {
		        stopMotionSafely('startup-error');
		      } catch (stopErr) {
		        recordUnhandledTickError('startup-finalize:stop-motion', stopErr);
		      }
		      if (!bot.lastDecision) {
		        bot.lastDecision = {
		          kind: 'wait',
		          reason: 'startup-error',
		          dx: 0,
		          dy: 0,
		          self: bot.lastSelf,
		          error: err?.message || String(err)
		        };
		      }
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError('startup-finalize:panel', panelErr);
		      }
		      try {
		        if (!cfg.once && bot.running && !bot.timer) {
		          bot.timer = setInterval(() => {
		            runTickSafely('timer');
		          }, cfg.tickMs);
		        }
		      } catch (timerErr) {
		        recordUnhandledTickError('startup-finalize:timer', timerErr);
		      }
		      try {
		        return bot.status();
		      } catch (statusErr) {
		        recordUnhandledTickError('startup-finalize:status', statusErr);
		        return { running: Boolean(bot.running), starting: Boolean(bot.starting), error: err?.message || String(err) };
		      }
		    });
	})()
`;
}

module.exports = {
  browserBotSource
};
