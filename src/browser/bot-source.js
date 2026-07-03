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
const { statusPanelSource } = require('./status-panel-source');
const { combatLogSource } = require('./combat-log-source');
const { importantLogSource } = require('./important-log-source');
const { controlLoginSource } = require('./control-login-source');
const { nativeStateSource } = require('./native-state-source');
const { pageNativeSnapshotSource } = require('./page-native-snapshot-source');
const { runtimeSummarySource } = require('./runtime-summary-source');
// Strategy modules for centralized constants and logic.
const { COMBAT_CONSTANTS } = require('../strategy/combat-constants');
const { OPPORTUNITY_CONSTANTS } = require('../strategy/opportunity-constants');
const {
  actionPriorityBand,
  actionFocusTargetType,
  actionFocusId,
  actionFocusSummary
} = require('../strategy/action-priority');
const {
  finalActionBandRank,
  finalActionReusable,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore
} = require('../strategy/action-arbitration');
const {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  recordActionSwitchDiagnosticsCore
} = require('../strategy/action-switch-diagnostics');
const {
  coinDiagnosticsSummary,
  summarizeCoinDiagnosticsList,
  addCoinFilterDiagnostic,
  buildCoinDiagnostics
} = require('../strategy/coin-diagnostics');
const {
  coinMotionNumber,
  coinMotionTolerance,
  coinAxisApproachDirectionCore,
  coinPickupPrecisionPulseMsCore,
  coinAxisLockShouldHoldCore,
  coinNearApproachAxisCore,
  coinDirectionToCore,
  coinMotionMetaCore
} = require('../strategy/coin-motion');
const {
  coinTargetKeyCore,
  coinTargetDistance,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('../strategy/coin-target');
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

	  const hypot = Math.hypot;
  const now = () => performance.now();
  const dist = (a, b) => hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const speed = e => hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const anyPositiveNumber = (...values) => values.some(value => Number(value) > 0);
  const isInvulnerable = e => anyPositiveNumber(
      e?.invulnerable_remaining_ticks,
      e?.invincible_remaining_ticks,
      e?.invulnerability_remaining_ticks,
      e?.invulnerableTicks,
      e?.invulnerableRemainingTicks,
      e?.invincibleRemainingTicks,
      e?.invulnerabilityRemainingTicks,
      e?.invulnerable_ticks,
      e?.invincible_ticks,
      e?.invulnerability_ticks,
      e?.invulnerable_remaining_ms,
      e?.invincible_remaining_ms,
      e?.invulnerability_remaining_ms,
      e?.invulnerableRemainingMs,
      e?.invincibleRemainingMs,
      e?.invulnerabilityRemainingMs,
      e?.invulnerable_ms,
      e?.invincible_ms,
      e?.invulnerability_ms,
      e?.immune_remaining_ms,
      e?.immuneRemainingMs,
      e?.invulnerable_remaining,
      e?.invincible_remaining,
      e?.invulnerability_remaining,
      e?.invulnerableRemaining,
      e?.invincibleRemaining,
      e?.invulnerabilityRemaining
    )
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaLimitValue = (e, windowName, fallback) => {
    const value = Number(e?.['stamina_' + windowName + '_limit_milli'] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const isStaminaWindowExhausted = (e, windowName) => {
    const value = staminaRemaining(e, windowName);
    return value !== null && value < staminaExhaustedThreshold();
  };
  const combatMovementBlockedByStamina = self => isStaminaWindowExhausted(self, '5s');
  const hasLongWindowStamina = e => !isStaminaWindowExhausted(e, '1h') && !isStaminaWindowExhausted(e, '1d');
  const hasMoveStamina = e => Number(e?.stamina_5s_remaining_milli || 0) > 250 && hasLongWindowStamina(e);
  const hasAttackStamina = e => Number(e?.stamina_5s_remaining_milli || 0) >= cfg.attackMinStamina && hasLongWindowStamina(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  const isMovingThreat = e => speed(e) >= cfg.activeSpeedMin || Boolean(e.recentlyMoved);
  const isCurrentlyActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const hasCombatActivitySignal = e => isCurrentlyActive(e)
    || truthyFlag(e?.active)
    || truthyFlag(e?.currentlyActive)
    || truthyFlag(e?.combat)
    || truthyFlag(e?.engagedCombat)
    || String(e?.combatIntent || '') === 'engaged';
  function entityRecentActivityAgeMs(e) {
    const value = Number(e?.recentActivityAgeMs ?? e?.activityAgeMs ?? e?.motionAgeMs ?? NaN);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  function recentlyActionedForAfk(e) {
    const cooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
    if (!(cooldownMs > 0)) return false;
    const ageMs = entityRecentActivityAgeMs(e);
    return Boolean(e?.recentlyActive || (ageMs !== null && ageMs <= cooldownMs));
  }
  function isIdleInvulnerableTarget(e) {
    return Boolean(isInvulnerable(e)
      && !isMovingThreat(e)
      && !isFiringEntity(e)
      && hasFullStamina(e)
      && !recentlyActionedForAfk(e));
  }
  const isAvoidanceThreat = e => isInvulnerable(e) && !isIdleInvulnerableTarget(e);
  const isAfkTarget = e => !recentlyActionedForAfk(e) && !isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => !recentlyActionedForAfk(e) && (isAfkTarget(e) || (isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e) && !isFiringEntity(e)));
  function isWhitelistedTarget(e) {
    if (!e) return false;
    const name = normalizeTargetWhitelistName(e.name);
    return Boolean(name && bot.targetWhitelist?.nameSet?.has(name));
  }
  function summarizeTargetWhitelistStatus() {
    const state = bot.targetWhitelist || targetWhitelistState;
    return {
      url: String(state?.url || ''),
      names: Array.isArray(state?.names) ? state.names.slice() : [],
      count: Array.isArray(state?.names) ? state.names.length : 0,
      loaded: Boolean(state?.lastOkAt),
      fetching: Boolean(state?.fetching),
      lastFetchAt: Number(state?.lastFetchAt || 0) || 0,
      lastOkAt: Number(state?.lastOkAt || 0) || 0,
      lastErrorAt: Number(state?.lastErrorAt || 0) || 0,
      lastError: String(state?.lastError || ''),
      lastReason: String(state?.lastReason || '')
    };
  }
  const hpValue = e => Number(e?.hp ?? 0) || 0;
  const combatHpValue = e => Number.isFinite(Number(e?.hp)) ? Number(e.hp) : 100;
  const knownHpValue = e => {
    if (e && Object.prototype.hasOwnProperty.call(e, 'knownHp')) {
      return Number.isFinite(Number(e.knownHp)) ? Number(e.knownHp) : null;
    }
    return e?.hp !== undefined && e?.hp !== null && Number.isFinite(Number(e.hp)) ? Number(e.hp) : null;
  };
  const maxHpValue = e => Number(e?.max_hp ?? e?.maxHp ?? 0) || 0;
  const isFullHp = self => {
    const hp = hpValue(self);
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hp >= maxHp;
    return hp >= 100;
  };
  const decorateActiveThreat = (self, e) => {
    const moving = isMovingThreat(e);
    return {
      ...e,
      distance: dist(self, e),
      drop: dropValue(e),
      speed: speed(e),
      moving,
      threatRadius: moving ? cfg.dangerRadius : cfg.stationaryActiveDangerRadius,
      cautionRadius: moving ? cfg.activeCautionRadius : cfg.stationaryActiveCautionRadius,
      coinDangerRadius: moving ? cfg.coinDangerRadius : cfg.stationaryActiveCoinDangerRadius
    };
  };
  const isRecovering = self => {
    if (!self) return false;
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hpValue(self) < maxHp;
    return hpValue(self) < cfg.recoverHpThreshold;
  };
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  function summarizeStamina(self) {
    const windows = [
      { key: '5s', fallback: 10000 },
      { key: '1h', fallback: 3000000 },
      { key: '1d', fallback: 20000000 }
    ];
    const thresholdMs = staminaExhaustedThreshold();
    const items = windows.map(item => {
      const remaining = staminaRemaining(self, item.key);
      const limit = staminaLimitValue(self, item.key, item.fallback);
      return {
        key: item.key,
        remaining,
        limit,
        exhausted: remaining !== null && remaining < thresholdMs
      };
    });
    const exhausted = items.filter(item => item.exhausted).map(item => item.key);
    const longExhausted = exhausted.filter(key => key === '1h' || key === '1d');
    const byKey = Object.fromEntries(items.map(item => [item.key, item]));
    return {
      thresholdMs,
      stamina5s: byKey['5s'].remaining,
      stamina5sLimit: byKey['5s'].limit,
      stamina1h: byKey['1h'].remaining,
      stamina1hLimit: byKey['1h'].limit,
      stamina1d: byKey['1d'].remaining,
      stamina1dLimit: byKey['1d'].limit,
      exhausted,
      longExhausted,
      movementBlocked: exhausted.length > 0,
      mustLeave: longExhausted.length > 0
    };
  }
  function dailyStaminaWindowStartAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return Math.floor((t + utc8OffsetMs) / dayMs) * dayMs - utc8OffsetMs;
  }
  function nextDailyStaminaResetAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    return dailyStaminaWindowStartAt(t) + dayMs;
  }
  function staminaBudgetReloginDelayMs() {
    return Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000));
  }
  function staminaResetHoldUntil(staminaState, t = Date.now()) {
    const exhausted = Array.isArray(staminaState?.longExhausted)
      ? staminaState.longExhausted
      : [];
    let until = 0;
    let resetAt = 0;
    let fixedDelayMs = 0;
    if (exhausted.includes('1h')) {
      fixedDelayMs = staminaBudgetReloginDelayMs();
      until = Math.max(until, t + fixedDelayMs);
    }
    if (exhausted.includes('1d')) {
      resetAt = nextDailyStaminaResetAt(t);
      until = Math.max(until, resetAt);
    }
    if (!until) return null;
    const graceMs = resetAt && until === resetAt ? Math.max(0, Number(cfg.staminaResetGraceMs || 0)) : 0;
    return {
      until: until + graceMs,
      resetAt,
      graceMs,
      fixedDelayMs: resetAt && resetAt >= t + fixedDelayMs ? 0 : fixedDelayMs,
      fixed: Boolean(fixedDelayMs && !(resetAt && resetAt >= t + fixedDelayMs)),
      exhausted
    };
  }
  function longStaminaHoldContradictedByKnownStamina(staminaState) {
    const thresholdMs = staminaExhaustedThreshold();
    const sources = [
      bot.lastSelf,
      bot.lastDecision?.self,
      bot.session
    ];
    return sources.some(source => staminaHoldContradictedByStaminaEvidence(staminaState, source, thresholdMs));
  }
  function startupStaminaSampleLooksUnsettled(staminaState, t = Date.now()) {
    const windows = staminaExhaustedLongWindows(staminaState);
    if (!windows.length) return false;
    const allZero = ['5s', '1h', '1d'].every(key => Number(staminaState?.['stamina' + key] ?? NaN) === 0);
    if (!allZero) return false;
    const graceMs = Math.max(0, Number(cfg.staminaExhaustionPostLoginGraceMs ?? 15000));
    if (!graceMs) return false;
    const sessionAgeMs = bot.session?.startedAt ? t - Number(bot.session.startedAt || t) : Infinity;
    const loginAgeMs = bot.lastLoginAt ? t - Number(bot.lastLoginAt || t) : Infinity;
    return sessionAgeMs <= graceMs || loginAgeMs <= graceMs;
  }
  function deferredStaminaExhaustionLeave(staminaState, t = Date.now()) {
    if (!staminaState?.mustLeave) return null;
    if (startupStaminaSampleLooksUnsettled(staminaState, t)) {
      return {
        reason: 'startup-zero-stamina-sample',
        graceMs: Math.max(0, Number(cfg.staminaExhaustionPostLoginGraceMs ?? 15000)),
        sessionAgeMs: bot.session?.startedAt ? Math.max(0, Math.round(t - Number(bot.session.startedAt || t))) : null,
        loginAgeMs: bot.lastLoginAt ? Math.max(0, Math.round(t - Number(bot.lastLoginAt || t))) : null
      };
    }
    return null;
  }
  function staleOfflineStaminaHoldContradicted(detail) {
    const staminaState = detail?.offlineSafety?.staminaExhausted;
    return Boolean(staminaState && longStaminaHoldContradictedByKnownStamina(staminaState));
  }
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

      function targetWhitelistFetchUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        try {
          const parsed = new URL(raw, location.href);
          parsed.searchParams.set('_graspRatWhitelistTs', String(Date.now()));
          return parsed.toString();
        } catch (_) {
          return raw + (raw.includes('?') ? '&' : '?') + '_graspRatWhitelistTs=' + Date.now();
        }
      }

      async function refreshTargetWhitelist(reason = 'manual') {
        const state = bot.targetWhitelist || targetWhitelistState;
        const url = String(state.url || '').trim();
        const t = Date.now();
        if (!url) {
          state.lastFetchAt = t;
          state.lastReason = 'no-url';
          return summarizeTargetWhitelistStatus();
        }
        if (state.fetching) return summarizeTargetWhitelistStatus();
        state.fetching = true;
        state.lastFetchAt = t;
        try {
          const payload = await fetchJsonNoStore(targetWhitelistFetchUrl(url), cfg.targetWhitelistTimeoutMs);
          const validPayload = Array.isArray(payload)
            || Array.isArray(payload?.names)
            || Array.isArray(payload?.usernames);
          if (!validPayload) throw new Error('target whitelist JSON must be an array or contain names/usernames array');
          const names = parseTargetWhitelistNames(payload, cfg.targetWhitelistMaxNames);
          state.names = names;
          state.nameSet = new Set(names);
          state.lastOkAt = Date.now();
          state.lastError = '';
          state.lastErrorAt = 0;
          state.lastReason = String(reason || 'refresh');
          return summarizeTargetWhitelistStatus();
        } catch (err) {
          state.lastError = err?.message || String(err);
          state.lastErrorAt = Date.now();
          state.lastReason = String(reason || 'refresh') + '-failed';
          return summarizeTargetWhitelistStatus();
        } finally {
          state.fetching = false;
        }
      }

      function startTargetWhitelistPolling() {
        const state = bot.targetWhitelist || targetWhitelistState;
        if (!String(state.url || '').trim()) {
          state.lastReason = 'no-url';
          return;
        }
        refreshTargetWhitelist('startup').catch(err => recordUnhandledTickError('target-whitelist-startup', err));
        const pollMs = Math.max(0, Number(cfg.targetWhitelistPollMs || 0) || 0);
        if (pollMs > 0 && !cfg.once) {
          state.timer = setInterval(() => {
            refreshTargetWhitelist('interval').catch(err => recordUnhandledTickError('target-whitelist-interval', err));
          }, pollMs);
        }
      }

			${controlLoginSource({ staminaExhaustedWindowLabel })}

${pageNativeSnapshotSource()}

	  function leaveWaitDisplay(base, detail) {
	    const summary = String(base || '').trim();
	    const waitMs = Number(detail?.holdRemainingMs ?? detail?.reloginDelayMs ?? 0);
	    if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
    return summary + '，等待' + formatDurationMs(waitMs);
  }

  function finalizeLeaveDisplayReason(detail) {
    if (!detail) return detail;
    const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
    if (!base) return detail;
    detail.summary = base;
    detail.displayReason = leaveWaitDisplay(base, detail);
    return detail;
  }

  function normalizeEnemyActor(actor) {
    if (!actor) return null;
    const rawId = actor.user_id ?? actor.id ?? actor.targetId;
    const id = rawId !== undefined && rawId !== null && rawId !== '' ? String(rawId) : '';
    const name = String(actor.name ?? actor.targetName ?? '').trim();
    const key = id ? 'id:' + id : (name ? 'name:' + name : '');
    if (!key) return null;
    return {
      key,
      id,
      name,
      label: name || ('#' + id)
    };
  }

  function enemyActorFromLeaveDetail(detail) {
    return normalizeEnemyActor(detail?.enemyActor)
      || normalizeEnemyActor(detail?.target)
      || normalizeEnemyActor(detail?.pursuit)
      || normalizeEnemyActor(detail?.injury?.nearestActive)
      || normalizeEnemyActor(detail?.injury?.nearestAvoidance)
      || normalizeEnemyActor(detail?.injury?.nearestHuman)
      || null;
  }

  function enemyRepeatDelayMsForCount(count) {
    const n = Math.max(0, Number(count) || 0);
    const secondMs = Math.max(0, Number(cfg.enemyReloginRepeatSecondMaxMs) || 0);
    const thirdMs = Math.max(secondMs, Number(cfg.enemyReloginRepeatThirdMaxMs) || 0);
    if (n >= 3) return thirdMs;
    if (n >= 2) return secondMs;
    return 0;
  }

  function readEnemyLeaveStreak(t = Date.now()) {
    let streak = null;
    try {
      streak = JSON.parse(localStorage.getItem(ENEMY_LEAVE_STREAK_KEY) || 'null');
    } catch (_) {
      streak = null;
    }
    if (!streak || typeof streak !== 'object' || !streak.key) return null;
    const resetMs = Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0);
    if (resetMs && t - Number(streak.at || 0) > resetMs) {
      try {
        localStorage.removeItem(ENEMY_LEAVE_STREAK_KEY);
      } catch (_) {}
      if (bot.enemyLeaveStreak?.key === streak.key) bot.enemyLeaveStreak = null;
      return null;
    }
    const normalized = {
      key: String(streak.key),
      id: streak.id === undefined || streak.id === null ? '' : String(streak.id),
      name: String(streak.name || ''),
      label: String(streak.label || streak.name || (streak.id ? '#' + streak.id : '')),
      count: Math.max(1, Number(streak.count || 1)),
      firstAt: Number(streak.firstAt || streak.at || t),
      previousAt: Number(streak.previousAt || 0),
      at: Number(streak.at || t),
      resetMs
    };
    normalized.reloginMinMs = enemyRepeatDelayMsForCount(normalized.count);
    bot.enemyLeaveStreak = normalized;
    return normalized;
  }

  function writeEnemyLeaveStreak(streak) {
    bot.enemyLeaveStreak = streak;
    try {
      localStorage.setItem(ENEMY_LEAVE_STREAK_KEY, JSON.stringify(streak));
    } catch (_) {}
  }

	  function updateEnemyLeaveStreak(detail, t = Date.now()) {
	    const actor = enemyActorFromLeaveDetail(detail);
	    if (!actor) {
	      readEnemyLeaveStreak(t);
	      if (detail) detail.enemyLeaveStreak = null;
	      return null;
	    }
    const previous = readEnemyLeaveStreak(t);
    const same = previous && previous.key === actor.key;
    const count = same ? Number(previous.count || 1) + 1 : 1;
    const streak = {
      ...actor,
      count,
      firstAt: same ? Number(previous.firstAt || previous.at || t) : t,
      previousAt: same ? Number(previous.at || 0) : 0,
      at: t,
      resetMs: Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0),
      reloginMinMs: enemyRepeatDelayMsForCount(count)
    };
    writeEnemyLeaveStreak(streak);
    if (detail) {
      detail.enemyActor = actor;
      detail.enemyLeaveStreak = streak;
      if (streak.reloginMinMs > 0) {
        detail.reloginRepeatDelayMs = streak.reloginMinMs;
        detail.reloginRepeatCount = streak.count;
      }
    }
    return streak;
  }

  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? combatState.hp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      if (combatState?.serverStallNoDamage) {
        const noDamageText = Number.isFinite(Number(combatState.serverStallNoDamage.noDamageMs))
          ? '，' + Math.round(Number(combatState.serverStallNoDamage.noDamageMs) / 1000) + '秒未造成伤害'
          : '';
        const gapText = Number.isFinite(hpGap) ? '，差距' + hpDisplay(hpGap) : '';
        return '与' + actorLabel(target) + '战斗，服务端位置停滞下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + gapText + noDamageText + '，劣势退出';
      }
      if (combatState?.pressureDisadvantage) {
        const distanceText = Number.isFinite(Number(combatState.pressureDisadvantage.distance))
          ? '，距离' + Math.round(Number(combatState.pressureDisadvantage.distance) / 100) + '米'
          : '';
	        return '与' + actorLabel(target) + '战斗，近身弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + distanceText + '，提前劣势退出';
	      }
	      if (combatState?.sustainedPressureDisadvantage) {
	        const pressure = combatState.sustainedPressureDisadvantage;
	        const noDamageText = Number.isFinite(Number(pressure.noDamageMs))
	          ? '，' + Math.round(Number(pressure.noDamageMs) / 1000) + '秒未造成伤害'
	          : '';
	        const distanceText = Number.isFinite(Number(pressure.distance))
	          ? '，距离' + Math.round(Number(pressure.distance) / 100) + '米'
	          : '';
	        return '与' + actorLabel(target) + '战斗，持续弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + noDamageText + distanceText + '，提前劣势退出';
	      }
	      if (combatState?.tradeEstimate) {
	        const estimate = combatState.tradeEstimate;
	        const deathText = Number.isFinite(Number(estimate.tDeathMs)) ? '，预计承伤倒计时' + formatDurationMs(estimate.tDeathMs) : '';
	        const killText = Number.isFinite(Number(estimate.tKillMs)) ? '，预计击杀需' + formatDurationMs(estimate.tKillMs) : '';
	        return '与' + actorLabel(target) + '战斗，交换比劣势' + deathText + killText + '，提前退出';
	      }
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
	    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
	    }
	    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + '，劣势退出';
  }

  function combatLeaveAction(reason, baseTarget, combatState = {}, cover = null) {
    const exitSummary = combatExitSummary(reason, baseTarget, combatState);
    const normalizedCover = cover ? { ...cover, target: cover.target || baseTarget } : null;
    return {
      kind: 'leave',
      reason,
      exitSummary,
      displayReason: exitSummary,
      combat: true,
      ignoreReturnBlock: true,
      dx: normalizedCover ? clamp(Math.round(Number(normalizedCover.dx) || 0), -1, 1) : 0,
      dy: normalizedCover ? clamp(Math.round(Number(normalizedCover.dy) || 0), -1, 1) : 0,
      shoot: Boolean(normalizedCover?.shoot),
      forceShoot: Boolean(normalizedCover?.forceShoot),
      shootEveryMs: normalizedCover?.shootEveryMs,
      aimTarget: normalizedCover?.aimTarget || null,
      incomingBullet: normalizedCover?.incomingBullet || null,
      target: baseTarget,
      combatCover: normalizedCover,
      combatState: {
        ...combatState,
        leaveCover: normalizedCover
      }
    };
  }

  function pursuitLeaveSummary(pursuit) {
    const target = pursuit || {};
    const duration = Number(target.durationMs);
    const durationText = Number.isFinite(duration) && duration > 0 ? '，持续' + formatDurationMs(duration) : '';
    const distance = Number(target.distance);
    const distanceText = Number.isFinite(distance) ? '，距离' + formatDistance(distance) : '';
    return '被' + actorLabel(target) + '持续追击' + durationText + distanceText + '，退出等待重连';
  }

	  function injuryLeaveSummary(injury) {
	    const actor = injury?.nearestActive || injury?.nearestAvoidance || injury?.nearestHuman || null;
	    const previousHp = Number(injury?.previousHp ?? NaN);
    const currentHp = Number(injury?.currentHp ?? injury?.self?.hp ?? NaN);
    const hpText = Number.isFinite(previousHp) && Number.isFinite(currentHp)
      ? '，血量从' + hpDisplay(previousHp) + '降到' + hpDisplay(currentHp)
      : (Number.isFinite(currentHp) ? '，当前血量' + hpDisplay(currentHp) : '');
	    return (actor ? '受到' + actorLabel(actor) + '伤害/附近威胁' : '检测到血量下降') + hpText + '，退出等待重连';
	  }

			  function offlineLeaveSummary(reason, offlineSafety) {
			    if (offlineSafety?.staminaBudgetExit) {
			      return staminaBudgetCoinLeaveSummary(offlineSafety.staminaBudgetExit);
			    }
			    const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
				    if (staminaLabel === '1h') return '一小时体力到达限制，退出等待重连';
				    if (staminaLabel === '1d') return '一天体力到达限制，退出等待重连';
				    if (staminaLabel === '1h/1d') return '一小时和一天体力到达限制，退出等待重连';
				    const text = String(reason || '').toLowerCase();
				    if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
				    if (offlineSafety?.loginPointSafetyGate || text.includes('login point safety')) return '登录点安全快照未满足，退出等待安全重连';
				    if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
				    if (text.includes('combat tick gap') || offlineSafety?.combatTickGap) return '战斗主循环断档，按网络波动退出等待重连';
				    if (text.includes('sampling outage') || offlineSafety?.samplingOutage) return '网络采样超时，按网络波动退出等待重连';
				    if (text.includes('reconnect churn') || offlineSafety?.reconnectChurn) return '网络连接反复重连，退出等待重连';
			    if (text.includes('action settlement') || offlineSafety?.actionSettlementStall) return '移动/开火结算卡死，按离线处理，退出等待重连';
			    if (text.includes('server position')) return '服务端位置停止，按离线处理，退出等待重连';
			    if (offlineSafety?.unsafe) return '网络连接离线且周围危险，退出等待重连';
			    return '网络连接离线，退出等待重连';
		  }

		  function currentOfflineDisplayReason(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = '') {
		    const currentSummary = offlineLeaveSummary(reason, offlineSafety);
		    const leaveDisplay = String(leaveResult?.displayReason || '');
		    const leaveSummary = String(leaveResult?.summary || leaveResult?.exitSummary || '');
		    if (currentSummary && leaveDisplay && (leaveSummary === currentSummary || leaveDisplay.includes(currentSummary))) {
		      return leaveDisplay;
		    }
		    if (currentSummary) return currentSummary;
		    return leaveDisplay || String(offlineDetail?.displayReason || '') || String(fallback || '');
		  }

	  function reloginDelayForHp(selfLike, detail) {
	    const info = hpInfoForRelogin(selfLike, detail);
	    const minMs = Math.max(0, Number(cfg.enemyReloginMinDelayMs ?? 0) || 0);
    const repeatMinMs = Math.max(0, Number(detail?.enemyLeaveStreak?.reloginMinMs ?? detail?.reloginRepeatDelayMs ?? 0) || 0);
    const baseMaxMs = Math.max(minMs, Number(cfg.enemyReloginMaxDelayMs ?? minMs) || 0);
	    const maxMs = Math.max(baseMaxMs, repeatMinMs);
	    const dangerFactor = Math.pow(1 - info.ratio, 1.35);
	    const jitterMs = Math.max(0, Number(cfg.enemyReloginJitterMs) || 0);
	    const hpDelayMs = clamp(
	      Math.round(minMs + (maxMs - minMs) * dangerFactor + randomBetween(0, jitterMs)),
	      minMs,
	      maxMs
	    );
    const delayMs = Math.max(hpDelayMs, repeatMinMs);
	    return { delayMs, hpDelayMs, minMs, maxMs, baseMaxMs, repeatMinMs, hp: info };
	  }

  function isExitLoginSuppressReason(reason) {
    return /enemy leave|offline.*leave|combat leave|pursuit leave/i.test(String(reason || ''));
  }

  function setExitReloginSuppress(storageReason, reason, detail, selfLike, options = {}) {
    let existingUntil = Number(options.existingUntil || 0);
    let existingReason = '';
    const minimumUntil = Math.max(0, Number(options.minimumUntil || 0) || 0);
    try {
      const storedReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      const storedUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      if (isExitLoginSuppressReason(storedReason) && storedUntil > existingUntil) {
        existingUntil = storedUntil;
        existingReason = storedReason;
      }
    } catch (_) {}
    const t = Date.now();
	    const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
	    const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
	    const delay = fixedDelayMs
	      ? {
	        delayMs: fixedDelayMs,
	        hpDelayMs: fixedDelayMs,
	        minMs: fixedDelayMs,
	        maxMs: fixedDelayMs,
	        baseMaxMs: fixedDelayMs,
	        repeatMinMs: 0,
	        hp: hpInfoForRelogin(selfLike, detail)
	      }
	      : reloginDelayForHp(selfLike, detail);
	    const minimumDelayMs = minimumUntil > t ? Math.max(0, Math.round(minimumUntil - t)) : 0;
	    const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
	    if (existingUntil > t && existingUntil >= minimumUntil && reloginDelayMs > 0) {
	      const holdReason = existingReason || storageReason;
	      if (storageReason === 'enemy leave' || /enemy leave|combat leave|pursuit leave/i.test(holdReason)) bot.pursuitReloginUntil = existingUntil;
	      if (storageReason === 'offline leave' || /offline.*leave/i.test(holdReason)) bot.offlineReloginUntil = existingUntil;
		      if (detail) {
		        detail.reloginUntil = existingUntil;
		        detail.holdRemainingMs = Math.max(0, Math.round(existingUntil - Date.now()));
		        detail.enemyLeaveReason = reason;
		        detail.loginSuppressReason = holdReason;
		        detail.reusedExitSuppress = true;
		        finalizeLeaveDisplayReason(detail);
		        if (storageReason === 'enemy leave') {
		          bot.lastEnemyLeaveResult = detail;
		          bot.lastEnemyLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastEnemyLeaveWaitMs || 0);
		          writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		        } else if (storageReason === 'offline leave') {
		          bot.lastOfflineLeaveResult = detail;
		          bot.lastOfflineLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastOfflineLeaveWaitMs || 0);
		          writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		        }
		      }
		      return existingUntil;
		    }
	    if (storageReason === 'enemy leave') updateEnemyLeaveStreak(detail, t);
	    if (!(reloginDelayMs > 0)) {
	      if (storageReason === 'enemy leave') {
	        bot.pursuitReloginUntil = 0;
	        bot.lastEnemyLeaveWaitMs = 0;
	        clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
	      } else if (storageReason === 'offline leave') {
	        bot.offlineReloginUntil = 0;
	        bot.lastOfflineLeaveWaitMs = 0;
	        clearLoginSuppressMatching(/offline.*leave/i);
	      }
	      if (detail) {
	        detail.reloginDelayMs = 0;
	        detail.reloginHpDelayMs = delay.hpDelayMs || 0;
	        detail.reloginDelayRangeMs = {
	          min: delay.minMs || 0,
	          max: delay.maxMs || 0,
	          baseMax: delay.baseMaxMs || 0,
	          repeatMin: delay.repeatMinMs || 0
	        };
	        detail.reloginHp = delay.hp;
	        detail.reloginUntil = 0;
	        detail.holdRemainingMs = 0;
	        detail.enemyLeaveReason = reason;
	        detail.loginSuppressReason = '';
	        detail.defensiveReloginDelaySkipped = true;
	        finalizeLeaveDisplayReason(detail);
	        if (storageReason === 'enemy leave') {
	          bot.lastEnemyLeaveResult = detail;
	          writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
	        } else if (storageReason === 'offline leave') {
	          bot.lastOfflineLeaveResult = detail;
	          writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
	        }
	      }
	      return 0;
	    }
	    const reloginUntil = setLoginSuppress(storageReason, reloginDelayMs);
    if (storageReason === 'enemy leave') {
      bot.pursuitReloginUntil = reloginUntil;
      bot.lastEnemyLeaveWaitMs = reloginDelayMs;
    } else if (storageReason === 'offline leave') {
      bot.offlineReloginUntil = reloginUntil;
      bot.lastOfflineLeaveWaitMs = reloginDelayMs;
    }
	    if (detail) {
	      detail.reloginDelayMs = reloginDelayMs;
	      detail.reloginHpDelayMs = delay.hpDelayMs;
	      detail.reloginDelayRangeMs = {
	        min: delay.minMs,
	        max: delay.maxMs,
	        baseMax: delay.baseMaxMs,
	        repeatMin: delay.repeatMinMs
	      };
	      if (minimumDelayMs) {
	        detail.reloginMinimumDelayMs = minimumDelayMs;
	        detail.reloginMinimumUntil = minimumUntil;
	        detail.reloginMinimumReason = options.minimumReason || '';
	      }
	      if (fixedDelayMs) detail.reloginFixedDelayMs = fixedDelayMs;
	      detail.reloginHp = delay.hp;
	      detail.reloginUntil = reloginUntil;
	      detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - Date.now()));
		      detail.enemyLeaveReason = reason;
		      detail.loginSuppressReason = storageReason;
		      finalizeLeaveDisplayReason(detail);
		      if (storageReason === 'enemy leave') {
		        bot.lastEnemyLeaveResult = detail;
		        writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		      } else if (storageReason === 'offline leave') {
		        bot.lastOfflineLeaveResult = detail;
		        writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		      }
		    }
    return reloginUntil;
  }

  function unsafeExitReloginMinDelayMs() {
    return Math.max(0, Number(cfg.unsafeExitReloginMinDelayMs ?? 0) || 0);
  }

  function pendingExitSuppressReason(storageReason) {
    const text = String(storageReason || '').toLowerCase();
    if (text.includes('offline')) return 'pending unsafe disconnect exit';
    if (text.includes('enemy') || text.includes('combat') || text.includes('pursuit') || text.includes('injury')) {
      return 'pending unsafe hostile exit';
    }
    return 'pending unsafe exit';
  }

	  function startExitAudit(detail, meta = {}) {
	    if (!detail || typeof detail !== 'object') return null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate(
	      'exit-trigger:' + (meta.reason || detail.reason || ''),
	      loginPointSafetyExitSelfForDetail(detail, meta, bot.lastSelf)
	    );
	    ensureExitAuditDetail(detail, meta);
	    recordExitAuditEvent('exit-trigger', detail, {
      ...meta,
      at: Number(detail.exitTriggeredAt || detail.at || Date.now())
    });
    return detail.exitAuditId;
  }

  function primePendingUnsafeExitLoginSuppress(storageReason, reason, detail, selfLike = null, options = {}) {
    if (!detail || !detail.attempted) return 0;
    const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
    const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
    const delay = fixedDelayMs
      ? { delayMs: fixedDelayMs, hpDelayMs: fixedDelayMs, hp: hpInfoForRelogin(selfLike, detail) }
      : reloginDelayForHp(selfLike, detail);
    const minimumDelayMs = Math.max(
      unsafeExitReloginMinDelayMs(),
      Math.max(0, Number(options.minimumDelayMs || 0) || 0)
    );
    const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
    if (!(delayMs > 0)) return 0;
    const suppressReason = pendingExitSuppressReason(storageReason);
    const until = setLoginSuppress(suppressReason, delayMs);
    detail.pendingLoginSuppressReason = suppressReason;
    detail.pendingLoginSuppressUntil = until;
    detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
    detail.pendingLoginSuppressMinimumDelayMs = minimumDelayMs;
    detail.pendingLoginSuppressHpDelayMs = delay.hpDelayMs || 0;
    detail.pendingLoginSuppressHp = delay.hp || null;
    if (reason) detail.enemyLeaveReason = detail.enemyLeaveReason || reason;
    return until;
  }

  function setEnemyLeaveSuppress(reason, detail, selfLike = null, options = {}) {
    return setExitReloginSuppress('enemy leave', reason, detail, selfLike, options);
  }

	  function staminaBudgetExitHoldUntil(staminaBudgetExit, t = Date.now()) {
	    if (!staminaBudgetExit) return null;
	    const delayMs = staminaBudgetReloginDelayMs();
	    return {
	      until: t + delayMs,
	      fixedDelayMs: delayMs,
	      fixed: true,
	      reason: 'stamina budget',
	      staminaBudgetExit
	    };
	  }

  function staminaExitHoldUntilForDetail(detail, t = Date.now()) {
    const holds = [
      staminaBudgetExitHoldUntil(detail?.offlineSafety?.staminaBudgetExit, t),
      staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted, t)
    ].filter(Boolean);
    if (!holds.length) return null;
    return holds.sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || null;
  }

	  function offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety) {
	    if (!offlineSafety) return false;
	    if (offlineSafety.unsafe || offlineSafety.reconnectChurn || offlineSafety.noSelfGameSession || offlineSafety.staminaExhausted || offlineSafety.samplingOutage || offlineSafety.combatTickGap) return true;
	    const text = String(reason || '').toLowerCase();
	    return text.includes('reconnect churn') || text.includes('server position') || text.includes('stamina') || text.includes('missing self') || text.includes('sampling outage') || text.includes('combat tick gap');
	  }

	  function setOfflineLeaveSuppress(reason, detail, selfLike = null, options = {}) {
		    const staminaHold = staminaExitHoldUntilForDetail(detail);
		    if (staminaHold && detail) {
		      if (staminaHold.staminaBudgetExit) detail.staminaBudgetHold = staminaHold;
		      else detail.staminaReset = staminaHold;
		    }
		    if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now())) {
		      const unsafeOfflineExit = offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null);
		      bot.offlineReloginUntil = 0;
		      bot.lastOfflineLeaveWaitMs = 0;
		      if (detail) {
		        detail.reloginUntil = 0;
		        detail.holdRemainingMs = 0;
		        detail.reloginDelayMs = 0;
		        detail.safeReloginAllowed = !unsafeOfflineExit;
		        if (unsafeOfflineExit) detail.defensiveReloginDelaySkipped = true;
			        detail.loginSuppressReason = '';
			        finalizeLeaveDisplayReason(detail);
			        bot.lastOfflineLeaveResult = detail;
			        writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
			      }
			      return 0;
		    }
		    return setExitReloginSuppress('offline leave', reason, detail, selfLike, {
		      existingUntil: bot.offlineReloginUntil,
		      minimumUntil: Math.max(Number(options.minimumUntil || 0) || 0, staminaHold?.until || 0),
	      minimumReason: options.minimumReason || staminaHold?.reason || (staminaHold ? 'stamina reset' : ''),
	      fixedDelayMs: staminaHold?.fixed ? staminaHold.fixedDelayMs : 0
	    });
	  }

	  function primePendingStaminaExitLoginSuppress(detail) {
	    const hold = staminaExitHoldUntilForDetail(detail);
	    if (!hold) return 0;
	    const delayMs = hold.fixed
	      ? hold.fixedDelayMs
	      : Math.max(1000, Math.round(Number(hold.until || 0) - Date.now()));
	    const until = setLoginSuppress('stamina leave pending', delayMs);
	    if (detail) {
	      detail.pendingLoginSuppressUntil = until;
	      detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
	      if (hold.staminaBudgetExit) detail.staminaBudgetHold = hold;
	      else detail.staminaReset = hold;
	    }
	    return until;
	  }

  function enemyReloginHoldRemainingMs() {
    let until = Number(bot.pursuitReloginUntil || 0);
    const persistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.pursuitReloginUntil = until;
      bot.lastEnemyLeaveResult = persistent;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if ((suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave') && suppressUntil > until) {
        until = suppressUntil;
        bot.pursuitReloginUntil = suppressUntil;
      }
    } catch (_) {}
	    const remaining = Math.max(0, until - Date.now());
	    if (!remaining && bot.pursuitReloginUntil) {
	      bot.pursuitReloginUntil = 0;
	    }
	    return Math.round(remaining);
  }

  function offlineReloginHoldRemainingMs() {
    let until = Number(bot.offlineReloginUntil || 0);
    const persistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.offlineReloginUntil = until;
      bot.lastOfflineLeaveResult = persistent;
    }
    if (until > Date.now() && staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
      clearOfflineReloginHold('stale stamina hold contradicted by known stamina');
      return 0;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if (/offline.*leave/i.test(suppressReason) && suppressUntil > until) {
        until = suppressUntil;
        bot.offlineReloginUntil = suppressUntil;
      }
    } catch (_) {}
    if (until > Date.now() && staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
      clearOfflineReloginHold('stale offline suppress contradicted by known stamina');
      return 0;
    }
	    const remaining = Math.max(0, until - Date.now());
	    if (!remaining && bot.offlineReloginUntil) {
	      bot.offlineReloginUntil = 0;
	    }
    return Math.round(remaining);
  }

	  function clearLoginSuppressMatching(pattern) {
	    try {
	      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
	      if (!pattern.test(suppressReason)) return false;
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      return true;
    } catch (_) {
      return false;
	    }
	  }

	  function clearEnemyReloginHold(reason = 'online self restored') {
	    const t = Date.now();
	    const details = [
	      activeEnemyLeaveDetail(t),
	      bot.lastEnemyLeaveResult,
	      bot.lastPursuitLeaveResult,
	      bot.lastCombatLeaveResult,
	      bot.lastInjuryLeaveResult
	    ].filter(Boolean);
		    bot.pursuitReloginUntil = 0;
		    bot.lastEnemyLeaveWaitMs = 0;
		    bot.pendingExit = bot.pendingExit?.scope === 'offline' ? bot.pendingExit : null;
		    if (bot.pendingExit) writePersistentPendingExitState(bot.pendingExit);
		    else clearPersistentPendingExitState();
	    for (const detail of details) {
	      if (!detail || typeof detail !== 'object') continue;
	      detail.onlineRecoveryAt = t;
	      detail.onlineRecoveryReason = String(reason || 'online self restored');
	      clearExitHoldDetail(detail, reason, t);
	    }
	    bot.lastEnemyLeaveResult = null;
	    bot.lastPursuitLeaveResult = null;
	    bot.lastCombatLeaveResult = null;
	    bot.lastInjuryLeaveResult = null;
	    clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	    clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
	  }

	  function clearOfflineReloginHold(reason = 'online self restored') {
	    const t = Date.now();
	    bot.offlineReloginUntil = 0;
	    bot.lastOfflineLeaveWaitMs = 0;
	    bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;
	    if (bot.pendingExit) writePersistentPendingExitState(bot.pendingExit);
	    else clearPersistentPendingExitState();
    if (bot.lastOfflineLeaveResult && typeof bot.lastOfflineLeaveResult === 'object') {
      bot.lastOfflineLeaveResult.onlineRecoveryAt = t;
      bot.lastOfflineLeaveResult.onlineRecoveryReason = String(reason || 'online self restored');
      bot.lastOfflineLeaveResult.reloginUntil = 0;
      bot.lastOfflineLeaveResult.holdRemainingMs = 0;
      bot.lastOfflineLeaveResult.reloginDelayMs = 0;
    }
    bot.lastOfflineLeaveResult = null;
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    clearLoginSuppressMatching(/offline.*leave/i);
  }

	  function summarizePursuit(pursuit = bot.pursuit) {
	    if (!pursuit) return null;
	    const t = now();
	    const lastSeenAt = Number(pursuit.lastSeenAt || pursuit.startedAt || t);
	    const thresholdMs = Number.isFinite(Number(pursuit.thresholdMs)) ? Number(pursuit.thresholdMs) : cfg.pursuitLeaveMs;
	    return {
	      id: pursuit.id,
	      name: pursuit.name || '',
      distance: Number.isFinite(Number(pursuit.distance)) ? Math.round(Number(pursuit.distance)) : null,
      speed: Number.isFinite(Number(pursuit.speed)) ? Math.round(Number(pursuit.speed)) : null,
      moving: Boolean(pursuit.moving),
	      active: Boolean(pursuit.active),
	      reason: pursuit.reason || '',
	      durationMs: Math.max(0, Math.round(Number(pursuit.durationMs ?? (lastSeenAt - Number(pursuit.startedAt || lastSeenAt))))),
	      thresholdMs,
	      invulnerable: Boolean(pursuit.invulnerable),
	      nonFullHp: Boolean(pursuit.nonFullHp),
	      combatSuppressed: Boolean(pursuit.combatSuppressed),
      lastSeenAgeMs: Math.max(0, Math.round(t - lastSeenAt)),
      towardScore: Number.isFinite(Number(pursuit.towardScore)) ? Number(pursuit.towardScore).toFixed(2) : null,
      closingDistance: Number.isFinite(Number(pursuit.closingDistance)) ? Math.round(Number(pursuit.closingDistance)) : null
    };
  }

  function cloneForPendingExit(value) {
    if (!value || typeof value !== 'object') return value || null;
    return safeJsonClone(value) || { ...value };
  }

  function pendingExitRetryMs(pending) {
    const source = String(pending?.source || '');
    const retryFloorMs = Math.max(
      1000,
      Number(cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000) || 10000
    );
    if (pending?.scope === 'offline' || source === 'offline') {
      return Math.max(retryFloorMs, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    if (source === 'pursuit') {
      return Math.max(retryFloorMs, Number(cfg.pursuitLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    return Math.max(retryFloorMs, Number(cfg.combatLeaveRetryMs || cfg.pursuitLeaveRetryMs || 1000));
  }

  function pendingExitDisplayReason(summary) {
    const base = String(summary || '退出请求已发送').trim();
    return base + '，等待退出确认，未退出会继续补发';
  }

	  function summarizePendingExit(pending = bot.pendingExit) {
	    if (!pending) return null;
	    const t = Date.now();
	    const retryMs = pendingExitRetryMs(pending);
	    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
	    const reloadConfirmation = normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending, t);
	    return {
	      scope: pending.scope || '',
	      source: pending.source || '',
	      reason: pending.reason || '',
	      summary: pending.summary || '',
      displayReason: pending.displayReason || '',
      at: Number(pending.at || 0),
      ageMs: pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0,
      lastAttemptAt,
      lastAttemptAgeMs: lastAttemptAt ? Math.max(0, Math.round(t - lastAttemptAt)) : null,
	      retryMs,
	      retryRemainingMs: lastAttemptAt ? Math.max(0, Math.round(retryMs - (t - lastAttemptAt))) : 0,
	      retryCount: Number(pending.retryCount || 0),
	      leaveRequestPending: Boolean(pending.lastResult?.leaveRequestPending),
	      reloadConfirmation: reloadConfirmation ? {
	        required: Boolean(reloadConfirmation.required),
	        requestedAt: Number(reloadConfirmation.requestedAt || 0),
	        reloadedAt: Number(reloadConfirmation.reloadedAt || 0),
	        restoredAfterReload: Boolean(reloadConfirmation.restoredAfterReload),
	        ageAfterReloadMs: reloadConfirmation.reloadedAt ? Math.max(0, Math.round(t - Number(reloadConfirmation.reloadedAt || t))) : null,
	        count: Number(reloadConfirmation.count || 0),
	        reason: reloadConfirmation.reason || ''
	      } : null,
	      userId: pending.userId || null,
	      combatCover: pending.combatCover ? {
        reason: pending.combatCover.reason || '',
        dx: clamp(Math.round(Number(pending.combatCover.dx) || 0), -1, 1),
        dy: clamp(Math.round(Number(pending.combatCover.dy) || 0), -1, 1),
        shoot: Boolean(pending.combatCover.shoot)
      } : null,
      lastError: pending.lastResult?.error || ''
    };
  }

  function pendingExitSkipNewLeave(source, reason, extra = {}) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const summary = pending.summary || extra.summary || String(reason || '').trim() || '退出请求已发送';
    return finalizeLeaveDisplayReason({
      ...extra,
      attempted: false,
      method: '',
      reason: 'pending-exit-active',
      skippedNewLeave: true,
      skippedSource: source || '',
      skippedReason: reason || '',
      exitPending: true,
      exitConfirmed: false,
      pendingExit: summarizePendingExit(pending),
      summary,
      error: ''
    });
  }

  function pendingExitIntentForSkippedLeave(source, reason, detail = null) {
    return {
      reason: 'pending-exit-active',
      source: source || '',
      skippedReason: reason || '',
      summary: detail?.summary || bot.pendingExit?.summary || '',
      pendingExit: summarizePendingExit()
    };
  }

  function recordPendingExitResult(source, detail, t = Date.now()) {
    if (source === 'offline') {
      bot.lastOfflineLeaveAt = t;
      bot.lastOfflineLeaveResult = detail;
    } else if (source === 'pursuit') {
      bot.lastPursuitLeaveAt = t;
      bot.lastPursuitLeaveResult = detail;
    } else if (source === 'injury') {
      bot.lastInjuryLeaveAt = t;
      bot.lastInjuryLeaveResult = detail;
    } else {
      bot.lastCombatLeaveAt = t;
      bot.lastCombatLeaveResult = detail;
    }
  }

  function rememberPendingExit(scope, source, detail, selfLike = null) {
    if (!detail?.attempted && !detail?.exitAuditId) return null;
    const t = Date.now();
    const previous = bot.pendingExit && bot.pendingExit.scope === scope ? bot.pendingExit : null;
    const summary = detail.summary || detail.exitSummary || detail.enemyLeaveSummary || previous?.summary || detail.reason || '';
    const pending = {
      scope,
      source,
      reason: detail.reason || previous?.reason || '',
      summary,
      displayReason: pendingExitDisplayReason(summary),
      at: Number(previous?.at || detail.at || t),
      updatedAt: t,
      lastAttemptAt: Number(detail.at || t),
      retryCount: Number(previous?.retryCount || 0) + 1,
      retryMs: pendingExitRetryMs({ scope, source }),
      userId: detail.userId || getCurrentUserId() || previous?.userId || null,
      self: cloneForPendingExit(selfLike || detail.self || previous?.self || null),
      offlineSafety: cloneForPendingExit(detail.offlineSafety || previous?.offlineSafety || null),
      target: cloneForPendingExit(detail.target || previous?.target || null),
      pursuit: cloneForPendingExit(detail.pursuit || previous?.pursuit || null),
      injury: cloneForPendingExit(detail.injury || previous?.injury || null),
      combat: cloneForPendingExit(detail.combat || previous?.combat || null),
      combatCover: cloneForPendingExit(detail.combatCover || detail.combat?.leaveCover || previous?.combatCover || null),
      lastResult: cloneForPendingExit(detail)
    };
	    bot.pendingExit = pending;
	    detail.exitPending = true;
	    detail.exitConfirmed = false;
	    detail.pendingExit = summarizePendingExit(pending);
	    detail.displayReason = pending.displayReason;
	    writePersistentPendingExitState(pending);
	    if (leaveDetailSucceeded(detail) && !leaveDetailHasHttp403(detail)) {
	      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
	    }
	    return pending;
	  }

  function pendingExitSelfState(self) {
    const userId = getCurrentUserId();
    if (!userId) return { known: true, alive: false, source: 'no-current-user-id', self: null };
    try {
      const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
      if (nativeSelf && Number(nativeSelf.user_id) === userId) {
        return { known: true, alive: Boolean(isAlive(nativeSelf)), source: 'native-own', self: summarizeSelf(nativeSelf) };
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === userId) || null;
      if (nativeSelf) {
        return {
          known: true,
          alive: Boolean(isAlive(nativeSelf)),
          source: 'native-entities',
          self: summarizeSelf(nativeSelf)
        };
      }
    }
    if (self) {
      return { known: true, alive: Boolean(isAlive(self)), source: 'tick-self', self: summarizeSelf(self) };
    }
    if (hasNativeGameSession(getNativeControl(), userId)) {
      return { known: false, alive: false, source: 'native-session-pending', self: null };
    }
    if (hasLoginRequiredText() || findLoginControl()) {
      return { known: true, alive: false, source: 'login-required', self: null };
    }
    if (snapshotSelfFreshEnough()) {
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === userId) || null;
      return {
        known: true,
        alive: Boolean(snapshotSelf && isAlive(snapshotSelf)),
        source: 'snapshot',
        self: snapshotSelf ? summarizeSelf(snapshotSelf) : null
      };
    }
    return { known: false, alive: false, source: 'unknown', self: null };
  }

  function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  }

  function chatLeftUserMessageSeen(userId = getCurrentUserId()) {
    const id = String(userId || '').trim();
    if (!id) return false;
    const pattern = new RegExp('(?:^|\\\\b)left\\\\s+user\\\\s+' + escapeRegExpLiteral(id) + '(?:\\\\b|$)', 'i');
    const selectors = [
      '#chat',
      '#chatLog',
      '#chatMessages',
      '.chat',
      '.chat-log',
      '.chat-messages',
      '.messages',
      '.side'
    ];
    const roots = [];
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el && !roots.includes(el)) roots.push(el);
        });
      } catch (_) {}
    }
    if (!roots.length && document.body) roots.push(document.body);
    for (const root of roots) {
      const text = String(root?.innerText || root?.textContent || '');
      if (pattern.test(text)) return true;
    }
    return false;
  }

  function ownEntityDisappearedState(self, userId = getCurrentUserId()) {
    const id = Number(userId || 0);
    if (!id) return { known: false, present: false, disappeared: false, sources: [] };
    let known = false;
    let present = false;
    const sources = [];
    try {
      if (typeof getOwnEntity === 'function') {
        known = true;
        sources.push('native-own');
        const nativeSelf = getOwnEntity();
        if (nativeSelf && Number(nativeSelf.user_id) === id && isAlive(nativeSelf)) present = true;
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      known = true;
      sources.push('native-entities');
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === id) || null;
      if (nativeSelf && isAlive(nativeSelf)) present = true;
    }
    if (self) {
      known = true;
      sources.push('tick-self');
      if (Number(self.user_id) === id && isAlive(self)) present = true;
    }
    if (snapshotSelfFreshEnough()) {
      known = true;
      sources.push('snapshot');
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === id) || null;
      if (snapshotSelf && isAlive(snapshotSelf)) present = true;
    }
    return {
      known,
      present,
      disappeared: Boolean(known && !present),
      sources
    };
  }

  function pendingExitLocalConfirmationState(pending, self, state = null) {
    const userId = Number(pending?.userId || getCurrentUserId() || 0);
    const tokenCleared = !getSessionToken();
    const chatLeftUser = chatLeftUserMessageSeen(userId);
    const ownEntity = ownEntityDisappearedState(self, userId);
    const control = summarizeControl();
    const sessionMismatch = controlHasAuthoritativeSessionMismatch(control);
    const confirmed = Boolean(tokenCleared && chatLeftUser && ownEntity.disappeared && !sessionMismatch);
    return {
      known: confirmed,
      alive: false,
      source: confirmed
        ? 'token-chat-left-user-self-missing'
        : (sessionMismatch ? 'local-exit-session-mismatch' : 'local-exit-evidence-incomplete'),
      self: null,
      localExitConfirmation: true,
      confirmed,
      tokenCleared,
      chatLeftUser,
      ownEntity,
      control,
      sessionMismatch,
      previousState: state || null
    };
  }

  function leaveRequestHasHttp403(request) {
    if (!request || typeof request !== 'object') return false;
    const status = Number(request.status ?? request.statusCode ?? request.result?.status ?? request.result?.statusCode ?? NaN);
    if (status === 403) return true;
    const fields = [
      request.error,
      request.message,
      request.statusText,
      request.result?.error,
      request.result?.message,
      request.result?.statusText
    ];
    return fields.some(value => /(?:^|\D)403(?:\D|$)|forbidden/i.test(String(value || '')));
  }

  function leaveDetailHasHttp403(detail) {
    if (!detail || typeof detail !== 'object') return false;
    if (leaveRequestHasHttp403(detail) || leaveRequestHasHttp403(detail.lastLeaveRequest)) return true;
    return Array.isArray(detail.leaveRequests) && detail.leaveRequests.some(leaveRequestHasHttp403);
  }

	  function leaveDetailSucceeded(detail) {
	    if (!detail || typeof detail !== 'object') return false;
	    if (!detail.attempted || detail.leaveRequestPending || detail.error || leaveDetailHasHttp403(detail)) return false;
	    const request = detail.lastLeaveRequest || (Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null);
	    return !request || Boolean(request.completedAt || request.method || detail.method);
	  }

	  function leaveSuccessReloadConfirmationForDetail(detail, pending = null, t = Date.now()) {
	    if (!leaveDetailSucceeded(detail) || leaveDetailHasHttp403(detail)) return normalizePendingExitReloadConfirmation(pending?.reloadConfirmation, pending, t);
	    const existing = normalizePendingExitReloadConfirmation(detail.reloadConfirmation || pending?.reloadConfirmation, pending, t);
	    const request = detail.lastLeaveRequest || (Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null);
	    return {
	      required: true,
	      reason: 'leave-success',
	      leaveSucceededAt: Number(existing?.leaveSucceededAt || request?.completedAt || detail.at || t) || t,
	      requestId: String(existing?.requestId || request?.requestId || ''),
	      requestedAt: Number(existing?.requestedAt || 0) || 0,
	      reloadedAt: Number(existing?.reloadedAt || 0) || 0,
	      restoredAfterReload: Boolean(existing?.restoredAfterReload),
	      count: Math.max(0, Math.round(Number(existing?.count || 0) || 0)),
	      lastResult: existing?.lastResult || null,
	      lastBlocked: existing?.lastBlocked || null
	    };
	  }

	  function attachLeaveSuccessReloadConfirmation(pending, detail, t = Date.now()) {
	    if (!pending || !leaveDetailSucceeded(detail) || leaveDetailHasHttp403(detail)) return null;
	    const reloadConfirmation = leaveSuccessReloadConfirmationForDetail(detail, pending, t);
	    pending.reloadConfirmation = reloadConfirmation;
	    pending.updatedAt = t;
	    if (pending.lastResult && typeof pending.lastResult === 'object') {
	      pending.lastResult.reloadConfirmation = reloadConfirmation;
	      pending.lastResult.exitPending = true;
	      pending.lastResult.exitConfirmed = false;
	    }
	    detail.reloadConfirmation = reloadConfirmation;
	    detail.exitPending = true;
	    detail.exitConfirmed = false;
	    detail.pendingExit = summarizePendingExit(pending);
	    writePersistentPendingExitState(pending);
	    return reloadConfirmation;
	  }

	  function pendingExitLeaveSuccessReloadWaitDetail(pending, detail, state, reason, displayReason) {
	    const wait = cloneForPendingExit(detail || pending?.lastResult || {}) || {};
	    wait.attempted = Boolean(wait.attempted);
	    wait.error = '';
	    wait.exitPending = true;
	    wait.exitConfirmed = false;
	    wait.reason = reason || wait.reason || pending?.reason || 'leave-success';
	    wait.summary = wait.summary || pending?.summary || wait.reason || '';
	    wait.displayReason = displayReason || wait.displayReason || 'leave接口已返回成功，刷新页面确认服务端在线状态';
	    wait.pendingExit = summarizePendingExit(pending);
	    wait.exitConfirmation = state || null;
	    return wait;
	  }

	  function requestPendingExitLeaveSuccessReload(detail, label = 'leave-success') {
	    const pending = bot.pendingExit;
	    if (!pending || !detail?.exitAuditId) return false;
	    const pendingAuditId = pending.lastResult?.exitAuditId || '';
	    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return false;
	    const reloadConfirmation = attachLeaveSuccessReloadConfirmation(pending, detail);
	    if (!reloadConfirmation) return false;
	    return requestLeaveConfirmationReload(label, pending);
	  }

	  function leaveSuccessReloadConfirmationSatisfied(reloadConfirmation) {
	    return Boolean(reloadConfirmation?.restoredAfterReload || Number(reloadConfirmation?.reloadedAt || 0) > 0);
	  }

	  function leaveSuccessReloadUnknownGraceMs() {
	    return Math.max(0, Number(cfg.leaveSuccessReloadUnknownGraceMs || 12000) || 0);
	  }

  function leave403ReloginDelayMs() {
    return Math.max(3600000, Number(cfg.leave403ReloginDelayMs || 0) || 0);
  }

  function leave403SnapshotSuccessRequired() {
    return Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5));
  }

  function leaveDetailHasHttp403RiskControl(detail) {
    if (!detail || typeof detail !== 'object') return false;
    return Boolean(
      detail.http403RiskControl
        || detail.http403RiskControlCleared
        || String(detail.reloginMinimumReason || '').includes('leave HTTP 403')
        || leaveDetailHasHttp403(detail)
    );
  }

  function leave403RiskHoldActive(detail, t = Date.now()) {
    return Boolean(
      leaveDetailHasHttp403RiskControl(detail)
        && Number(detail?.reloginUntil || 0) > t
    );
  }

  function currentLeave403RiskHolds(t = Date.now()) {
    const enemy = activeEnemyLeaveDetail(t);
    const offline = activeOfflineLeaveDetail(t);
    const enemyActive = leave403RiskHoldActive(enemy, t);
    const offlineActive = leave403RiskHoldActive(offline, t);
    return {
      enemy: enemyActive ? enemy : null,
      offline: offlineActive ? offline : null,
      active: Boolean(enemyActive || offlineActive)
    };
  }

  function clearLeave403RiskDetail(detail, reason, recovery, t = Date.now()) {
    if (!leaveDetailHasHttp403RiskControl(detail)) return false;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.leave403PreviousReloginUntil) detail.leave403PreviousReloginUntil = reloginUntil;
    if (previousHoldMs && !detail.leave403PreviousHoldMs) detail.leave403PreviousHoldMs = previousHoldMs;
    detail.leave403SnapshotRecoveredAt = t;
    detail.leave403SnapshotRecoveryReason = reason;
    detail.leave403SnapshotSuccessStreak = Number(recovery?.streak || 0);
    detail.leave403SnapshotSuccessRequired = leave403SnapshotSuccessRequired();
    detail.http403RiskControlCleared = true;
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    detail.reloginMinimumUntil = 0;
    detail.reloginMinimumReason = '';
    finalizeLeaveDisplayReason(detail);
    return true;
  }

  function clearLeave403RiskHolds(reason = 'snapshot success streak') {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const enemyPersistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
    const offlinePersistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
    const enemyDetails = [
      bot.lastEnemyLeaveResult,
      bot.lastCombatLeaveResult,
      bot.lastPursuitLeaveResult,
      bot.lastInjuryLeaveResult,
      enemyPersistent
    ].filter(Boolean);
    const offlineDetails = [bot.lastOfflineLeaveResult, offlinePersistent].filter(Boolean);
    let clearedEnemy = false;
    let clearedOffline = false;
    for (const detail of enemyDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedEnemy = true;
    }
    for (const detail of offlineDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedOffline = true;
    }
    if (!clearedEnemy && !clearedOffline) return false;
    if (clearedEnemy) {
      bot.pursuitReloginUntil = 0;
      bot.lastEnemyLeaveWaitMs = 0;
      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    }
    if (clearedOffline) {
      bot.offlineReloginUntil = 0;
      bot.lastOfflineLeaveWaitMs = 0;
      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    }
    clearLoginSuppressMatching(
      clearedEnemy && clearedOffline
        ? /enemy leave|offline.*leave|combat leave|pursuit leave/i
        : (clearedEnemy ? /enemy leave|combat leave|pursuit leave/i : /offline.*leave/i)
    );
    bot.leave403SnapshotRecovery = {
      ...recovery,
      required: leave403SnapshotSuccessRequired(),
      clearedAt: t,
      clearedReason: reason,
      lastError: ''
    };
    logStatus('leave 403 risk control cleared by snapshot success', {
      kind: 'wait',
      reason: 'leave-403-snapshot-recovered',
      leave403SnapshotRecovery: bot.leave403SnapshotRecovery,
      clearedEnemy,
      clearedOffline
    });
    return true;
  }

  function noteLeave403SnapshotProbe(success, detail = {}) {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const required = leave403SnapshotSuccessRequired();
    bot.leave403SnapshotRecovery = {
      streak: Math.max(0, Number(recovery.streak || 0) || 0),
      required,
      lastOkAt: Number(recovery.lastOkAt || 0) || 0,
      lastErrorAt: Number(recovery.lastErrorAt || 0) || 0,
      lastError: String(recovery.lastError || ''),
      clearedAt: Number(recovery.clearedAt || 0) || 0,
      clearedReason: String(recovery.clearedReason || '')
    };
    const holds = currentLeave403RiskHolds(t);
    if (!holds.active) {
      bot.leave403SnapshotRecovery.streak = 0;
      return false;
    }
    if (success) {
      bot.leave403SnapshotRecovery.streak = Math.min(required, bot.leave403SnapshotRecovery.streak + 1);
      bot.leave403SnapshotRecovery.lastOkAt = t;
      bot.leave403SnapshotRecovery.lastError = '';
      if (bot.leave403SnapshotRecovery.streak >= required) {
        return clearLeave403RiskHolds('snapshot success streak');
      }
      return false;
    }
    bot.leave403SnapshotRecovery.streak = 0;
    bot.leave403SnapshotRecovery.lastErrorAt = t;
    bot.leave403SnapshotRecovery.lastError = String(detail.error || detail.message || '');
    return false;
  }

	  function confirmPendingExit(pending, state) {
	    const t = Date.now();
	    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
	    stopMotionAfterExit('exit-confirmed');
	    detail.reason = detail.reason || pending.reason || '';
	    detail.summary = detail.summary || pending.summary || detail.reason || '';
	    detail.userId = detail.userId || pending.userId || getCurrentUserId() || null;
    detail.self = detail.self || pending.self || null;
    detail.attempted = Boolean(detail.attempted);
    detail.error = '';
    detail.exitPending = false;
	    detail.exitConfirmed = true;
	    detail.exitConfirmedAt = t;
	    detail.exitConfirmation = state || null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate(
	      'exit-confirmed:' + (detail.reason || pending.reason || ''),
	      loginPointSafetyExitSelfForDetail(detail, { self: pending.self || state?.self || null }, bot.lastSelf)
	    );
	    detail.pendingExitAgeMs = pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0;
    detail.pendingExitRetryCount = Number(pending.retryCount || 0);
    const http403 = Boolean(state?.http403 || leaveDetailHasHttp403(detail));
    const suppressOptions = http403
      ? {
        minimumUntil: t + leave403ReloginDelayMs(),
        minimumReason: 'leave HTTP 403 risk control'
      }
      : {};
    if (http403) {
      detail.http403RiskControl = true;
      detail.riskControlReloginDelayMs = leave403ReloginDelayMs();
    }
	    bot.pendingCombatLeave = null;
	    bot.pendingInjuryLeave = null;
	    bot.pursuit = null;
	    if (bot.lastSafety) bot.lastSafety.pursuit = null;
	    clearCombatEngagement('exit-confirmed');
	    if (pending.scope === 'offline') {
	      setOfflineLeaveSuppress(detail.reason || 'websocket offline', detail, detail.self || pending.self || null, suppressOptions);
	    } else {
	      setEnemyLeaveSuppress(detail.reason || 'enemy leave', detail, detail.self || pending.self || detail.injury?.self || detail.injury || null, suppressOptions);
	      if (pending.source === 'combat') bot.lastCombatLeaveResult = detail;
	      if (pending.source === 'pursuit') bot.lastPursuitLeaveResult = detail;
	      if (pending.source === 'injury') bot.lastInjuryLeaveResult = detail;
	    }
    bot.pendingExit = null;
    clearPersistentPendingExitState();
    recordExitAuditEvent('exit-confirmed', detail, {
      at: t,
      confirmedAt: t,
      confirmation: state || null,
      source: pending.source || detail.exitAuditSource || '',
      scope: pending.scope || detail.exitAuditScope || ''
    });
    noteImportantSessionExit('exit-confirmed:' + (detail.reason || pending.reason || ''), detail.self || pending.self || bot.lastSelf, t, { exit: detail });
    return detail;
  }

  function pendingExitWaitReason(pending, confirmed = false) {
    if (confirmed) return pending.scope === 'offline' ? 'offline-leave-wait' : 'enemy-leave-wait';
    if (pending.scope === 'offline') return 'offline-leave';
    if (pending.source === 'pursuit') return 'pursuit-leave-retry';
    return 'combat-leave-retry';
  }

  function pendingExitWaitDecision(pending, self, leaveResult, state, confirmed = false) {
    const activeDetail = pending.scope === 'offline' ? activeOfflineLeaveDetail() : activeEnemyLeaveDetail();
    const currentSummary = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || bot.lastSelf || null));
    const cover = !confirmed && pending.source === 'combat' ? pending.combatCover : null;
    return {
      kind: 'wait',
      reason: pendingExitWaitReason(pending, confirmed),
      dx: cover ? clamp(Math.round(Number(cover.dx) || 0), -1, 1) : 0,
      dy: cover ? clamp(Math.round(Number(cover.dy) || 0), -1, 1) : 0,
      self: currentSummary,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      combat: !confirmed && Boolean(cover),
      shoot: Boolean(cover?.shoot),
      forceShoot: Boolean(cover?.forceShoot),
      shootEveryMs: cover?.shootEveryMs,
      target: confirmed ? null : (cover?.target || pending.target || null),
      aimTarget: confirmed ? null : (cover?.aimTarget || null),
      incomingBullet: cover?.incomingBullet || null,
      combatState: pending.combat || null,
      combatCover: confirmed ? null : (cover || null),
      displayReason: leaveResult?.displayReason || activeDetail?.displayReason || pending.displayReason || '',
      leave: leaveResult,
      pendingExit: summarizePendingExit(bot.pendingExit || pending),
      exitConfirmation: state || null,
      holdRemainingMs: activeDetail?.holdRemainingMs ?? (pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs())
    };
  }

  function applyCombatExitCover(pending, self = null) {
    const cover = pending?.source === 'combat' ? pending.combatCover : null;
    if (!cover || !self || !isAlive(self)) return false;
    const action = {
      kind: 'wait',
      combat: true,
      dx: cover.dx,
      dy: cover.dy
    };
    sendActionVelocity(action);
    if (cover.shoot && cover.target && self) {
      shootAt(self, cover.aimTarget || cover.target, Boolean(cover.forceShoot), { shootEveryMs: cover.shootEveryMs });
    }
    return true;
  }

  async function retryPendingExit(pending, self, state) {
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - lastAttemptAt))),
        summary: pending.summary || '',
        displayReason: pending.displayReason || '',
        exitPending: true,
        exitConfirmed: false,
        pendingExit: summarizePendingExit(pending),
        exitConfirmation: state || null
      };
      return detail;
    }
    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
    detail.at = t;
    detail.attempted = false;
    detail.method = '';
    detail.error = '';
    detail.reason = pending.reason || detail.reason || '';
    detail.summary = pending.summary || detail.summary || detail.reason || '';
    detail.userId = getCurrentUserId() || pending.userId || detail.userId || null;
    detail.self = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || detail.self || null));
    detail.offlineSafety = detail.offlineSafety || pending.offlineSafety || null;
    detail.target = detail.target || pending.target || null;
    detail.pursuit = detail.pursuit || pending.pursuit || null;
    detail.injury = detail.injury || pending.injury || null;
    detail.combat = detail.combat || pending.combat || null;
    detail.combatCover = detail.combatCover || pending.combatCover || detail.combat?.leaveCover || null;
    resetClashLeaveRescueRound(detail);
    detail.exitPending = true;
    detail.exitConfirmed = false;
    detail.pendingExitRetry = true;
    detail.exitConfirmation = state || null;
    bot.pendingExit = {
      ...pending,
      updatedAt: t,
      lastAttemptAt: t,
      lastResult: cloneForPendingExit(detail)
    };
    writePersistentPendingExitState(bot.pendingExit);
    detail.pendingExit = summarizePendingExit(bot.pendingExit);
    recordPendingExitResult(pending.source, detail, t);
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      rememberPendingExit(pending.scope, pending.source, detail, detail.self || pending.self || null);
    } else {
      const next = {
        ...pending,
        updatedAt: t,
        lastAttemptAt: t,
        retryCount: Number(pending.retryCount || 0) + 1,
        lastResult: cloneForPendingExit(detail)
      };
      bot.pendingExit = next;
      writePersistentPendingExitState(next);
      detail.pendingExit = summarizePendingExit(next);
      detail.displayReason = detail.displayReason || pending.displayReason || pendingExitDisplayReason(detail.summary || pending.summary || detail.reason);
    }
    recordPendingExitResult(pending.source, detail, t);
    return detail;
  }

  function schedulePendingExitRetry(pending, self, state) {
    if (!pending) return false;
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) return false;
    Promise.resolve()
      .then(() => retryPendingExit(pending, self, state))
      .catch(err => recordUnhandledTickError('pending-exit-retry', err));
    return true;
  }

  async function handlePendingExit(self) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const existingHoldMs = pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs();
    if (existingHoldMs > 0) {
      bot.pendingExit = null;
      clearPersistentPendingExitState();
      return null;
    }
    const state = pendingExitSelfState(self);
    const lastDetail = pending.lastResult || {};
    if (leaveDetailHasHttp403(lastDetail)) {
      if (scheduleClashLeaveRescueRetry(lastDetail)) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-http-403-clash-rescue');
        const detail = cloneForPendingExit(lastDetail) || {};
        detail.exitPending = true;
        detail.exitConfirmed = false;
        detail.pendingExit = summarizePendingExit(pending);
        detail.exitConfirmation = {
          ...state,
          source: bot.clashLeaveRescue.running ? 'leave-http-403-clash-rescue-running' : 'leave-http-403-clash-rescue-scheduled',
          http403: true,
          clashLeaveRescue: bot.clashLeaveRescue?.lastResult || null
        };
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      const detail = confirmPendingExit(pending, {
        ...state,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
    }
    if (leaveDetailSucceeded(lastDetail)) {
      const reloadConfirmation = attachLeaveSuccessReloadConfirmation(pending, lastDetail) || normalizePendingExitReloadConfirmation(pending.reloadConfirmation, pending);
      if (!leaveSuccessReloadConfirmationSatisfied(reloadConfirmation)) {
        requestLeaveConfirmationReload('leave-success', pending);
        const detail = pendingExitLeaveSuccessReloadWaitDetail(
          pending,
          lastDetail,
          {
            ...state,
            leaveSuccessReloadConfirmation: reloadConfirmation || null,
            awaitingReload: true
          },
          'leave-success-refresh-confirmation',
          'leave接口已返回成功，刷新页面确认服务端在线状态'
        );
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      const localState = pendingExitLocalConfirmationState(pending, self, state);
      if (localState.confirmed) {
        const detail = confirmPendingExit(pending, {
          ...localState,
          source: 'leave-success-refresh-local-confirmed',
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
      }
      if (state.known && !state.alive) {
        const detail = confirmPendingExit(pending, {
          ...state,
          known: true,
          alive: false,
          source: 'leave-success-refresh-confirmed',
          self: null,
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
      }
      if (state.known && state.alive) {
        schedulePendingExitRetry(pending, self, {
          ...state,
          source: 'leave-success-refresh-still-online',
          leaveSuccessReloadConfirmation: reloadConfirmation || null
        });
        return null;
      }
      const reloadAgeMs = reloadConfirmation?.reloadedAt ? Math.max(0, Math.round(Date.now() - Number(reloadConfirmation.reloadedAt || Date.now()))) : 0;
      if (reloadAgeMs < leaveSuccessReloadUnknownGraceMs()) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-refresh-confirmation');
        const detail = pendingExitLeaveSuccessReloadWaitDetail(
          pending,
          lastDetail,
          {
            ...state,
            source: 'leave-success-refresh-unknown',
            leaveSuccessReloadConfirmation: reloadConfirmation || null,
            reloadAgeMs,
            graceMs: leaveSuccessReloadUnknownGraceMs()
          },
          'leave-success-refresh-confirmation',
          '刷新后正在确认服务端在线状态'
        );
        return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
      }
      bot.pursuit = null;
      if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-refresh-retry');
      const detail = await retryPendingExit(pending, self, {
        ...state,
        source: 'leave-success-refresh-unknown-timeout',
        leaveSuccessReloadConfirmation: reloadConfirmation || null,
        reloadAgeMs
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, false);
    }
    const localState = pendingExitLocalConfirmationState(pending, self, state);
    if (localState.confirmed) {
      const detail = confirmPendingExit(pending, localState);
      return pendingExitWaitDecision(pending, self, detail, localState, true);
    }
    if (state.known && state.alive) {
      schedulePendingExitRetry(pending, self, state);
      return null;
    }
    if (state.known && !state.alive) {
      const lastError = String(pending.lastResult?.error || '');
      const weakConfirmation = /^(login-required|no-current-user-id)$/.test(String(state.source || ''));
      if (lastError && weakConfirmation) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-unconfirmed-auth-state');
        const detail = await retryPendingExit(pending, self, { ...state, weakConfirmation: true, ignoredBecauseLastLeaveError: lastError });
        return pendingExitWaitDecision(pending, self, detail, { ...state, weakConfirmation: true }, false);
      }
      const detail = confirmPendingExit(pending, state);
      return pendingExitWaitDecision(pending, self, detail, state, true);
    }
    bot.pursuit = null;
    if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-confirmation');
    const detail = await retryPendingExit(pending, self, state);
    return pendingExitWaitDecision(pending, self, detail, state, false);
  }

	  function summarizePendingCombatLeave(pending = bot.pendingCombatLeave) {
	    if (!pending) return null;
	    return {
	      reason: pending.reason || '',
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || '',
	      at: pending.at || 0,
	      ageMs: pending.at ? Math.max(0, Math.round(Date.now() - Number(pending.at || Date.now()))) : 0,
	      retryCount: Number(pending.retryCount || 0),
      target: pending.target || null,
      combatState: pending.combatState || null,
      lastResult: pending.lastResult || null
    };
  }

  function rememberPendingCombatLeave(action, selfSummary, leaveResult) {
    const previous = bot.pendingCombatLeave || {};
    const retryCount = Number(previous.retryCount || 0) + (leaveResult?.attempted || !previous.at ? 1 : 0);
    bot.pendingCombatLeave = {
      at: previous.at || Date.now(),
      lastRetryAt: Date.now(),
	      retryCount,
	      reason: action?.reason || previous.reason || 'combat-leave-retry',
      exitSummary: action?.exitSummary || previous.exitSummary || leaveResult?.exitSummary || leaveResult?.summary || '',
      displayReason: action?.displayReason || previous.displayReason || leaveResult?.displayReason || leaveResult?.summary || '',
	      target: action?.target || previous.target || null,
	      combatState: action?.combatState || previous.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || previous.combatCover || null,
      self: selfSummary || previous.self || null,
      lastResult: leaveResult || previous.lastResult || null
    };
    return bot.pendingCombatLeave;
  }

  function pendingCombatLeaveAction(pending = bot.pendingCombatLeave) {
    if (!pending) return null;
    return {
      kind: 'leave',
      reason: pending.reason || 'combat-leave-retry',
      combat: true,
      ignoreReturnBlock: true,
      dx: clamp(Math.round(Number(pending.combatCover?.dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(pending.combatCover?.dy) || 0), -1, 1),
      shoot: Boolean(pending.combatCover?.shoot),
      forceShoot: Boolean(pending.combatCover?.forceShoot),
      shootEveryMs: pending.combatCover?.shootEveryMs,
      aimTarget: pending.combatCover?.aimTarget || null,
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || pending.exitSummary || '',
	      target: pending.target || null,
      combatCover: pending.combatCover || null,
      combatState: pending.combatState || null
    };
  }

  function hasRecentCombatEngagementForInjuryLeave() {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return false;
    const maxAgeMs = Math.max(0, Number(cfg.targetStickMs || 0), Number(cfg.combatEngageStickMs || 0));
    if (!maxAgeMs) return true;
    return Date.now() - Number(engaged.at || 0) <= maxAgeMs;
  }

  function isCombatStateForInjuryLeave(action) {
    return Boolean(
      action?.combat
      || bot.pendingCombatLeave
      || bot.lastSafety?.engagedCombat
      || hasRecentCombatEngagementForInjuryLeave()
    );
  }

  function actionCombatTargetId(action) {
    const target = action?.target || null;
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function pursuitLeaveSuppressedByCombatAction(pursuit, action) {
    const pursuitId = pursuit?.id ?? pursuit?.user_id;
    const actionId = actionCombatTargetId(action);
    return Boolean(action?.combat && pursuitId !== null && pursuitId !== undefined && actionId && String(pursuitId) === actionId);
  }

  function actionThreatId(action) {
    const threat = Array.isArray(action?.threats) ? action.threats[0] : null;
    return threat ? String(threat.id ?? threat.user_id ?? '') : '';
  }

	  function pursuitPressure(self, threat, previous, action) {
    if (!threat) return null;
    const distance = Number(threat.distance ?? dist(self, threat));
    if (!Number.isFinite(distance) || distance > cfg.pursuitTrackRadius) return null;
    const id = threatKey(threat);
    const vx = Number(threat.vx || 0);
    const vy = Number(threat.vy || 0);
    const s = Math.max(0, Number(threat.speed ?? speed(threat)) || 0);
    const tx = Number(self.x) - Number(threat.x);
    const ty = Number(self.y) - Number(threat.y);
    const d = Math.max(1, Math.hypot(tx, ty));
    const towardScore = s > 0 ? ((vx * tx) + (vy * ty)) / (s * d) : 0;
    const closingDistance = previous && String(previous.id) === id
      ? Number(previous.distance) - distance
      : 0;
    const actionMatches = actionThreatId(action) === id
      && (action?.kind === 'flee' || action?.reason === 'return-block-lateral-scan');
    const closePressure = distance <= Number(threat.threatRadius || cfg.dangerRadius);
    const cautionPressure = distance <= Number(threat.cautionRadius || cfg.activeCautionRadius) + cfg.activeCautionExitMargin;
    const towardPressure = cautionPressure && towardScore >= cfg.pursuitTowardCosMin;
    const closingPressure = cautionPressure && closingDistance >= cfg.pursuitClosingMinDistance;
    const returnBlockPressure = distance <= returnBlockRadius(threat);
    if (!closePressure && !towardPressure && !closingPressure && !actionMatches && !returnBlockPressure) return null;
    return {
      threat,
      id,
      score: (actionMatches ? 100000 : 0)
        + (closePressure ? 30000 : 0)
        + (returnBlockPressure ? 15000 : 0)
        + Math.max(0, towardScore) * 10000
        + Math.max(0, closingDistance)
        - distance / 10,
      reason: actionMatches ? 'bot-fleeing-from-threat'
        : closePressure ? 'inside-danger-radius'
          : returnBlockPressure ? 'return-block-pressure'
            : towardPressure ? 'moving-toward-self'
              : 'closing-distance',
      distance,
      speed: s,
      moving: Boolean(threat.moving),
      towardScore,
	      closingDistance
	    };
	  }

	  function pursuitLeaveThresholdFor(self, threat) {
	    const normalMs = Math.max(0, Number(cfg.pursuitLeaveMs || 0));
	    const nonFullHp = !isFullHp(self);
	    const invulnerable = isInvulnerable(threat);
	    const candidates = [normalMs];
	    if (nonFullHp) candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpMs || normalMs)));
	    if (invulnerable) candidates.push(Math.max(0, Number(cfg.pursuitLeaveInvulnerableMs || normalMs)));
	    if (nonFullHp && invulnerable) {
	      candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpInvulnerableMs || cfg.pursuitLeaveInvulnerableMs || cfg.pursuitLeaveNonFullHpMs || normalMs)));
	    }
	    return Math.max(0, Math.min(...candidates.filter(value => Number.isFinite(value))));
	  }

	  function updatePursuitTracking(self, activeThreats, action) {
    const t = now();
    const previous = bot.pursuit;
    const candidates = (activeThreats || [])
      .map(threat => pursuitPressure(self, threat, previous, action))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const picked = candidates[0] || null;
    if (!picked) {
      if (previous && t - Number(previous.lastSeenAt || 0) <= cfg.pursuitLostGraceMs) {
        previous.active = false;
        previous.durationMs = Math.max(0, Number(previous.lastSeenAt || t) - Number(previous.startedAt || t));
        if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(previous);
        return previous;
      }
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
      return null;
    }
    const same = previous && String(previous.id) === String(picked.id)
      && t - Number(previous.lastSeenAt || t) <= cfg.pursuitLostGraceMs;
	    const combatSuppressed = pursuitLeaveSuppressedByCombatAction(picked, action);
	    const startedAt = combatSuppressed ? t : (same ? Number(previous.startedAt || t) : t);
	    const thresholdMs = pursuitLeaveThresholdFor(self, picked.threat);
	    bot.pursuit = {
	      id: picked.id,
	      name: picked.threat.name || '',
      startedAt,
      lastSeenAt: t,
      durationMs: Math.max(0, t - startedAt),
      distance: picked.distance,
      speed: picked.speed,
      moving: picked.moving,
	      active: true,
	      reason: picked.reason,
	      towardScore: picked.towardScore,
	      closingDistance: picked.closingDistance,
	      thresholdMs,
	      invulnerable: isInvulnerable(picked.threat),
	      nonFullHp: !isFullHp(self),
	      combatSuppressed
	    };
    if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(bot.pursuit);
    return bot.pursuit;
  }

  function waitWithTimeout(promise, timeoutMs, label) {
    const ms = Math.max(100, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function leaveCommandFailureMessage(value) {
    if (value === false) return 'leave request returned false';
    if (!value || typeof value !== 'object') return '';
    if (value.ok === false || value.success === false) {
      return value.message || value.error || 'leave request returned failure';
    }
    if (value.error && value.ok !== true && value.success !== true) {
      return value.message || value.error || 'leave request returned error';
    }
    const status = Number(value.status || value.statusCode || 0);
    if (status >= 400) return value.statusText || value.message || ('leave request HTTP ' + status);
    return '';
  }

  function summarizeLeaveCommandResult(value) {
    if (value === undefined) return { type: 'undefined' };
    if (value === null) return { type: 'null' };
    if (value === false || value === true) return { type: 'boolean', value: Boolean(value) };
    if (typeof value !== 'object') return { type: typeof value, value: String(value).slice(0, 200) };
    return {
      type: Array.isArray(value) ? 'array' : 'object',
      ok: value.ok ?? null,
      success: value.success ?? null,
      status: value.status ?? value.statusCode ?? null,
      statusText: value.statusText || '',
      message: value.message || '',
      error: value.error || ''
    };
  }

  function clashLeaveRescueHook() {
    try {
      const hook = readPageGlobal('__graspRatBotClashLeaveRescue', null, pageGlobal);
      return typeof hook === 'function' ? hook : null;
    } catch (_) {
      return null;
    }
  }

  function leaveDetailFailedForClashRescue(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (!detail.attempted || detail.leaveRequestPending) return false;
    if (detail.exitConfirmed) return false;
    const http403 = leaveDetailHasHttp403(detail);
    if (!detail.error && !http403) return false;
    if (leaveDetailSucceeded(detail)) return false;
    return Boolean(clashLeaveRescueHook());
  }

  function clashLeaveRescueAttempts(detail) {
    return Array.isArray(detail?.clashLeaveRescueAttempts)
      ? detail.clashLeaveRescueAttempts.filter(item => item && typeof item === 'object')
      : [];
  }

  const CLASH_LEAVE_RESCUE_STAGE_ORDER = ['auto', 'direct', 'manual'];

  function nextClashLeaveRescueStage(detail) {
    const stages = new Set(clashLeaveRescueAttempts(detail).map(item => String(item.stage || '')));
    for (const stage of CLASH_LEAVE_RESCUE_STAGE_ORDER) {
      if (!stages.has(stage)) return stage;
    }
    return '';
  }

  function summarizeClashLeaveRescueResult(result, stage, error = '') {
    const raw = result && typeof result === 'object' ? result : {};
    return {
      stage,
      ok: Boolean(!error && raw.ok !== false),
      target: raw.target || '',
      group: raw.group || '',
      at: Number(raw.at || Date.now()) || Date.now(),
      durationMs: Math.max(0, Math.round(Number(raw.durationMs || 0) || 0)),
      switched: raw.switched ? {
        ok: Boolean(raw.switched.ok !== false),
        status: Number(raw.switched.status || 0) || 0
      } : null,
      closeConnections: raw.closeConnections ? {
        ok: Boolean(raw.closeConnections.ok !== false),
        status: Number(raw.closeConnections.status || 0) || 0,
        error: raw.closeConnections.error || ''
      } : null,
      error: error || raw.error || ''
    };
  }

  function appendClashLeaveRescueAttempt(detail, attempt) {
    if (!detail || !attempt) return;
    const attempts = clashLeaveRescueAttempts(detail).concat([attempt]).slice(-6);
    detail.clashLeaveRescueAttempts = attempts;
    detail.clashLeaveRescue = attempt;
    bot.clashLeaveRescue.lastAt = Number(attempt.at || Date.now()) || Date.now();
    bot.clashLeaveRescue.lastStage = attempt.stage || '';
    bot.clashLeaveRescue.lastResult = attempt;
    bot.clashLeaveRescue.attempts = (Array.isArray(bot.clashLeaveRescue.attempts) ? bot.clashLeaveRescue.attempts : [])
      .concat([attempt])
      .slice(-8);
  }

  function clashLeaveRescueRetryDetail(detail, stage) {
    const retryDetail = cloneForPendingExit(detail) || {};
    retryDetail.at = Date.now();
    retryDetail.attempted = false;
    retryDetail.method = '';
    retryDetail.error = '';
    retryDetail.leaveRequestPending = false;
    retryDetail.lastLeaveRequest = null;
    retryDetail.leaveRequests = [];
    retryDetail.pendingExitRetry = true;
    retryDetail.clashLeaveRescueRetry = true;
    retryDetail.clashLeaveRescueStage = stage;
    retryDetail.clashLeaveRescueAttempts = clashLeaveRescueAttempts(detail);
    retryDetail.summary = detail.summary || detail.exitSummary || detail.reason || '';
    retryDetail.displayReason = detail.displayReason || pendingExitDisplayReason(retryDetail.summary);
    return retryDetail;
  }

  function resetClashLeaveRescueRound(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    detail.clashLeaveRescueAttempts = [];
    detail.clashLeaveRescue = null;
    detail.clashLeaveRescueStage = '';
    detail.clashLeaveRescueRetry = false;
    return detail;
  }

  async function prepareDefaultClashLeaveProxy(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (detail.clashLeaveRescueRetry || clashLeaveRescueAttempts(detail).length) return false;
    if (bot.clashLeaveRescue.running) return false;
    const hook = clashLeaveRescueHook();
    if (!hook) return false;
    const stage = 'auto';
    bot.clashLeaveRescue.running = true;
    try {
      let attempt = null;
      try {
        const result = await waitWithTimeout(
          hook({
            stage,
            reason: detail.reason || '',
            scope: detail.exitAuditScope || '',
            source: detail.exitAuditSource || '',
            exitAuditId: detail.exitAuditId || '',
            requestId: ''
          }),
          Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
          'Clash leave default ' + stage
        );
        attempt = summarizeClashLeaveRescueResult(result, stage);
      } catch (err) {
        attempt = summarizeClashLeaveRescueResult(null, stage, err?.message || String(err));
      }
      appendClashLeaveRescueAttempt(detail, attempt);
      updatePendingExitLastResult(detail);
      recordExitAuditEvent('clash-leave-rescue', detail, {
        at: attempt.at || Date.now(),
        source: detail.exitAuditSource || 'leave-command',
        scope: detail.exitAuditScope || '',
        request: attempt
      });
      logStatus(
        attempt.ok ? 'clash leave default switched ' + stage : 'clash leave default failed ' + stage,
        { stage, clashLeaveRescue: attempt }
      );
      return Boolean(attempt.ok);
    } finally {
      bot.clashLeaveRescue.running = false;
    }
  }

  async function runClashLeaveRescueRetry(detail) {
    if (bot.clashLeaveRescue.running) return null;
    if (!leaveDetailFailedForClashRescue(detail)) return null;
    let stage = nextClashLeaveRescueStage(detail);
    if (!stage) return null;
    bot.clashLeaveRescue.running = true;
    try {
      while (stage) {
        const hook = clashLeaveRescueHook();
        if (!hook) return null;
        let attempt = null;
        try {
          const result = await waitWithTimeout(
            hook({
              stage,
              reason: detail.reason || '',
              scope: detail.exitAuditScope || '',
              source: detail.exitAuditSource || '',
              exitAuditId: detail.exitAuditId || '',
              requestId: detail.lastLeaveRequest?.requestId || ''
            }),
            Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
            'Clash leave rescue ' + stage
          );
          attempt = summarizeClashLeaveRescueResult(result, stage);
        } catch (err) {
          attempt = summarizeClashLeaveRescueResult(null, stage, err?.message || String(err));
        }
        appendClashLeaveRescueAttempt(detail, attempt);
        updatePendingExitLastResult(detail);
        recordExitAuditEvent('clash-leave-rescue', detail, {
          at: attempt.at || Date.now(),
          source: detail.exitAuditSource || 'leave-command',
          scope: detail.exitAuditScope || '',
          request: attempt
        });
        if (attempt.ok) {
          logStatus('clash leave rescue switched ' + stage, { stage, clashLeaveRescue: attempt });
          const retryDetail = clashLeaveRescueRetryDetail(detail, stage);
          const pending = bot.pendingExit;
          const retryAt = Number(retryDetail.at || Date.now()) || Date.now();
          if (pending) {
            bot.pendingExit = {
              ...pending,
              updatedAt: retryAt,
              lastAttemptAt: retryAt,
              retryCount: Number(pending.retryCount || 0) + 1,
              lastResult: cloneForPendingExit(retryDetail)
            };
            writePersistentPendingExitState(bot.pendingExit);
            retryDetail.pendingExit = summarizePendingExit(bot.pendingExit);
          }
          recordPendingExitResult(pending?.source || detail.exitAuditSource || 'offline', retryDetail, retryAt);
          await issueLeaveCommand(retryDetail);
          if (
            !retryDetail.leaveRequestPending
            && leaveDetailFailedForClashRescue(retryDetail)
            && nextClashLeaveRescueStage(retryDetail)
          ) {
            detail = retryDetail;
            stage = nextClashLeaveRescueStage(detail);
            continue;
          }
          return retryDetail;
        }
        logStatus('clash leave rescue failed ' + stage, { stage, clashLeaveRescue: attempt });
        stage = nextClashLeaveRescueStage(detail);
      }
    } finally {
      bot.clashLeaveRescue.running = false;
    }
    return null;
  }

  function scheduleClashLeaveRescueRetry(detail) {
    if (!leaveDetailFailedForClashRescue(detail)) return false;
    if (!nextClashLeaveRescueStage(detail)) return false;
    if (bot.clashLeaveRescue.running) return true;
    Promise.resolve()
      .then(() => runClashLeaveRescueRetry(detail))
      .catch(err => recordUnhandledTickError('clash-leave-rescue', err));
    return true;
  }

  function updatePendingExitLastResult(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return;
    bot.pendingExit = {
      ...pending,
      updatedAt: Date.now(),
      lastAttemptAt: Number(detail.at || detail.lastLeaveRequest?.sentAt || pending.lastAttemptAt || Date.now()),
      lastResult: cloneForPendingExit(detail)
    };
    writePersistentPendingExitState(bot.pendingExit);
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (leaveDetailHasHttp403(detail)) {
      if (scheduleClashLeaveRescueRetry(detail)) return null;
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
    }
    if (leaveDetailSucceeded(detail)) {
      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
      return null;
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || leaveCommandFailureMessage(rawResult);
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = summarizeLeaveCommandResult(rawResult);
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
    detail.leaveRequests = detail.leaveRequests.slice(-20);
    detail.lastLeaveRequest = request;
    const http403 = leaveDetailHasHttp403(detail);
    const clashRescuePending = http403 && leaveDetailFailedForClashRescue(detail) && Boolean(nextClashLeaveRescueStage(detail));
    if (leaveDetailSucceeded(detail) || http403) {
      stopMotionAfterExit(http403 ? 'leave-http-403' : 'leave-success');
      if (http403 && !clashRescuePending) {
        noteImportantSessionExit('leave-http-403:' + (detail.reason || ''), detail.self || bot.lastSelf, request.completedAt, { exit: detail });
      }
    }
	    updatePendingExitLastResult(detail);
	    recordExitAuditEvent('leave-request', detail, {
	      at: request.completedAt,
      request,
      source: detail.exitAuditSource || detail.reason || 'leave-command',
      scope: detail.exitAuditScope || ''
    });
    if (leaveDetailSucceeded(detail)) requestPendingExitLeaveSuccessReload(detail, 'leave-success');
    const rescueScheduled = scheduleClashLeaveRescueRetry(detail);
    if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail);
    return detail;
  }

  async function issueLeaveCommand(detail) {
    if (bot.pendingExit && !detail?.pendingExitRetry) {
      const skipped = pendingExitSkipNewLeave(detail?.exitAuditSource || detail?.reason || 'leave-command', detail?.reason || '', detail || {});
      if (skipped) {
        Object.assign(detail, skipped);
        return detail;
      }
    }
    ensureExitAuditDetail(detail, {
      source: detail?.exitAuditSource || detail?.reason || 'leave-command',
      scope: detail?.exitAuditScope || ''
    });
    await prepareDefaultClashLeaveProxy(detail);
    const request = {
      requestId: newExitAuditRequestId(detail.exitAuditId),
      exitAuditId: detail.exitAuditId || '',
      sentAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      attempted: false,
      method: '',
      error: '',
      result: null,
      pending: false
    };
	    try {
	      if (typeof leave === 'function') {
	        detail.attempted = true;
	        detail.method = detail.userId ? 'leave(userId)' : 'leave';
	        const result = detail.userId ? leave(detail.userId) : leave();
	        if (result && typeof result.then === 'function') {
          detail.leaveRequestPending = true;
          detail.leaveRequestSentAt = request.sentAt;
          detail.leaveRequestTimeoutMs = Math.max(1000, Number(cfg.leaveCommandTimeoutMs || 0) || 3000);
          request.attempted = true;
          request.method = detail.method;
          request.pending = true;
          detail.lastLeaveRequest = request;
          let settled = false;
          const timeoutMs = detail.leaveRequestTimeoutMs;
          const finish = (rawResult, errorMessage = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            completeLeaveRequest(detail, request, rawResult, errorMessage);
          };
          const timer = setTimeout(() => {
            finish({ error: 'leave request timed out after ' + timeoutMs + 'ms' }, 'leave request timed out after ' + timeoutMs + 'ms');
          }, timeoutMs);
          Promise.resolve(result).then(
            value => finish(value, ''),
            err => finish({ error: err?.message || String(err) }, err?.message || String(err))
          );
          return detail;
	        }
        return completeLeaveRequest(detail, request, result, '');
	      } else {
	        const leaveBtn = document.querySelector('#leaveBtn');
	        if (leaveBtn && isVisible(leaveBtn)) {
	          detail.attempted = true;
	          detail.method = '#leaveBtn';
	          leaveBtn.click();
          return completeLeaveRequest(detail, request, undefined, '');
	        } else {
	          detail.error = 'leave control not found';
          return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	        }
	      }
	    } catch (err) {
	      detail.error = err?.message || String(err);
      return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	    }
	    return detail;
	  }

  async function maybeStartAutoLogin(reason, options = {}) {
    const force = Boolean(options.force || options.immediate || options.manual);
    const manualOverride = Boolean(options.manualOverride || options.manual);
    const ignoreSuppress = Boolean(options.ignoreSuppress || force);
    const ignoreLoginCooldown = Boolean(options.ignoreLoginCooldown || force);
    const liveSessionTakeover = options.liveSessionTakeover || null;
    const allowLiveSessionTakeoverBypass = Boolean(options.allowLiveSessionTakeoverBypass && liveSessionTakeover?.allowed);
    if (syncPausedFromPage() && !manualOverride) {
      return {
        needed: false,
        attempted: false,
	        reason: 'paused',
	        error: '',
	        hasToken: Boolean(getSessionToken()),
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    if (!cfg.autoLogin || cfg.dryRun || cfg.once) return null;
    const t = Date.now();
    if (exitAuditFlushPending() && !manualOverride) {
      const blocked = exitAuditFlushBlockDetail('login:' + (reason || ''));
      bot.exitAudit.lastBlockedLogin = blocked;
      flushCombatLogs(true);
      return {
        needed: true,
        attempted: false,
        reason: 'exit-log-flush-pending',
        cooldownRemainingMs: 0,
        error: '',
	        exitAuditFlush: blocked,
	        hasToken: Boolean(getSessionToken()),
	        hasNativeSession: false,
	        nativeWsReadyState: getNativeControl()?.wsReadyState ?? null,
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    if (manualOverride && exitAuditFlushPending()) {
      bot.exitAudit.lastManualLoginBypass = exitAuditFlushBlockDetail('manual-login:' + (reason || ''));
      flushCombatLogs(true);
    }
    const userId = getCurrentUserId();
    const hasToken = Boolean(getSessionToken());
    const native = getNativeControl();
    const hasNativeSession = hasNativeGameSession(native, userId);
    const loginControl = findLoginControl();
    const loginRequired = hasLoginRequiredText();
    const self = getSelf();
    const hasAliveSelf = Boolean(self && isAlive(self));
    const currentStartLinuxDoLogin = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
    const canStartLogin = Boolean(loginControl || typeof currentStartLinuxDoLogin === 'function');
    const hasPageSession = Boolean(hasToken || hasNativeSession);
    const needsLogin = !hasAliveSelf && (
      loginRequired
        || !hasPageSession
        || (force && canStartLogin && (!hasNativeSession || allowLiveSessionTakeoverBypass))
    );
	    if (!needsLogin) {
	      return force ? {
	        needed: false,
	        attempted: false,
        reason: hasAliveSelf ? 'already-alive' : (hasNativeSession ? 'game-session-active' : 'already-logged-in'),
        error: '',
        forced: true,
        hasToken,
        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover,
	        self: hasAliveSelf ? summarizeSelf(self) : null
	      } : null;
	    }
	    closeCurrentImportantSessionBeforeLogin('login-before-session-end:' + String(reason || 'login'));
	    if (importantSessionEndFlushPending() && !manualOverride) {
	      const blocked = importantSessionEndFlushBlockDetail('login:' + (reason || ''));
	      bot.importantLogging.lastBlockedLogin = blocked;
	      return {
	        needed: true,
	        attempted: false,
	        reason: 'important-log-flush-pending',
	        cooldownRemainingMs: 0,
	        error: '',
	        importantLogFlush: blocked,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
	    if (manualOverride && importantSessionEndFlushPending()) {
	      bot.importantLogging.lastManualLoginBypass = importantSessionEndFlushBlockDetail('manual-login:' + (reason || ''));
	    }
	    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0 && !ignoreSuppress) {
      return {
        needed: true,
        attempted: false,
        reason: 'suppressed',
        cooldownRemainingMs: Math.round(suppressRemainingMs),
        error: '',
        suppressReason: localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || 'login flow',
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
    if (!ignoreLoginCooldown && t - Number(bot.lastLoginAt || 0) < cfg.loginCooldownMs) {
      const lastError = bot.lastLoginResult?.error || '';
      return {
        needed: true,
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.loginCooldownMs - (t - Number(bot.lastLoginAt || 0)))),
        error: lastError,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        liveSessionTakeover
	      };
	    }
	    const snapshotGate = manualOverride
	      ? {
	        ...snapshotLoginGateStatus(),
	        blockReason: String(reason || 'manual login'),
	        manualLoginBypass: true
	      }
	      : await ensureLoginSnapshotGate(reason, {
	        allowLiveSessionTakeoverBypass,
	        liveSessionTakeover
	      });
	    if (!manualOverride && !loginSnapshotGateAllowsLogin(snapshotGate)) {
	      return {
	        needed: true,
	        attempted: false,
	        reason: 'snapshot-gate',
	        cooldownRemainingMs: 0,
	        error: '',
	        snapshotGate,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        liveSessionTakeover
	      };
	    }
	    const detail = {
	      needed: true,
	      attempted: false,
      reason,
      hasToken,
      hasNativeSession,
      nativeWsReadyState: native?.wsReadyState ?? null,
      currentUserId: userId,
	      loginRequired,
	      forced: force,
	      manualLoginBypass: manualOverride,
	      ignoredSuppressMs: ignoreSuppress ? Math.round(suppressRemainingMs) : 0,
	      snapshotGate,
	      liveSessionTakeover,
	      snapshotGateBypassed: Boolean(snapshotGate.liveSessionTakeoverBypass),
	      loginControl: loginControl ? (loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase())) : '',
      method: '',
      error: ''
    };
    bot.lastLoginAt = t;
    try {
      const rawStartLinuxDoLoginCandidate = manualOverride
        ? readPageGlobal('__graspRatBotRawStartLinuxDoLogin', null, pageGlobal)
        : null;
      const rawStartLinuxDoLogin = typeof rawStartLinuxDoLoginCandidate === 'function'
        ? rawStartLinuxDoLoginCandidate
        : null;
      const startLinuxDoLoginFn = readPageGlobal('startLinuxDoLogin', null, pageGlobal);
      const startLoginFn = rawStartLinuxDoLogin || (typeof startLinuxDoLoginFn === 'function' ? startLinuxDoLoginFn : null);
      if (manualOverride) markManualLoginBypass(String(reason || 'manual login'));
      if (typeof startLoginFn === 'function') {
        const result = startLoginFn.call(pageGlobal);
        if (result && typeof result.then === 'function') await result;
        detail.attempted = true;
        detail.method = rawStartLinuxDoLogin ? 'rawStartLinuxDoLogin' : 'startLinuxDoLogin';
      } else if (loginControl) {
        if (manualOverride) markManualLoginBypass(String(reason || 'manual login'));
        loginControl.click();
        detail.attempted = true;
        detail.method = loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase());
      } else {
        detail.error = 'login control not found';
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.attempted && !detail.error) setLoginSuppress('bot login started', cfg.postLoginGraceMs);
    bot.lastLoginResult = detail;
    return detail;
  }

		  async function forceLoginNow(reason = 'panel immediate login') {
		    const manualReason = String(reason || 'panel immediate login');
		    const snapshotGate = {
		      ...snapshotLoginGateStatus(),
		      blockReason: manualReason,
		      manualLoginBypass: true
		    };
		    const currentSelf = getSelf();
		    if (!(currentSelf && isAlive(currentSelf))) {
		      closeCurrentImportantSessionBeforeLogin('manual-login-before-session-end:' + manualReason);
		    }
		    const cleared = clearCurrentReloginHold(manualReason);
		    cleared.manualLoginBypass = true;
		    cleared.snapshotGate = snapshotGate;
		    if (exitAuditFlushPending()) {
		      cleared.exitAuditFlush = exitAuditFlushBlockDetail('manual-login:' + manualReason);
		      bot.exitAudit.lastManualLoginBypass = cleared.exitAuditFlush;
		      flushCombatLogs(true);
		    }
		    if (importantSessionEndFlushPending()) {
		      cleared.importantLogFlush = importantSessionEndFlushBlockDetail('manual-login:' + manualReason);
		      bot.importantLogging.lastManualLoginBypass = cleared.importantLogFlush;
		    }
	    bot.lastLoginAt = 0;
	    markManualLoginBypass(manualReason);
	    const login = await maybeStartAutoLogin(manualReason, {
	        force: true,
	        manual: true,
	        manualOverride: true,
	        ignoreSuppress: true,
	        ignoreLoginCooldown: true
	      });
    const detail = {
      at: Date.now(),
      reason: manualReason,
      cleared,
      login
    };
    bot.lastManualLoginResult = detail;
    bot.lastLoginResult = login || bot.lastLoginResult;
    bot.lastDecision = {
      kind: 'wait',
      reason: login?.attempted ? 'manual-login' : (login?.reason || 'manual-login'),
      dx: 0,
      dy: 0,
      self: getSelf() ? summarizeSelf(getSelf()) : bot.lastSelf,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      login,
      manualLogin: detail
    };
    updateBotPanel(bot.lastDecision);
    setTimeout(() => triggerNativeTick('manual-login', false), 0);
    return detail;
  }

  async function leaveOffline(reason, selfSummary = null, offlineSafety = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('offline', reason, {
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummary(reason, offlineSafety)
    });
    if (skipped) return skipped;
    const retryMs = Math.max(200, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    if (t - Number(bot.lastOfflineLeaveAt || 0) < retryMs) {
      const active = activeOfflineLeaveDetail(t);
      const summary = offlineLeaveSummary(reason, offlineSafety);
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastOfflineLeaveAt || 0)))),
        offlineSafety,
        summary: summary || active?.summary || '',
        reloginUntil: active?.reloginUntil || bot.offlineReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || 0
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummary(reason, offlineSafety),
      error: ''
    };
    startExitAudit(detail, { scope: 'offline', source: 'offline', reason, self: selfSummary, offlineSafety });
    bot.lastOfflineLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      const staminaSuppress = primePendingStaminaExitLoginSuppress(detail);
      if (!staminaSuppress && offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety)) {
        primePendingUnsafeExitLoginSuppress('offline leave', reason, detail, selfSummary);
      }
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('offline', 'offline', detail, selfSummary);
    }
    finalizeLeaveDisplayReason(detail);
    bot.lastOfflineLeaveResult = detail;
    return detail;
  }

  async function leaveForInjury(injury) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('injury', 'injury hp drop', {
      injury,
      summary: injuryLeaveSummary(injury)
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastInjuryLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastInjuryLeaveAt || 0)))),
        injury,
        summary: injuryLeaveSummary(injury)
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'injury hp drop',
      at: t,
      userId: getCurrentUserId() || null,
      injury,
      summary: injuryLeaveSummary(injury),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'injury', reason: detail.reason, self: injury?.self || injury, injury });
    bot.lastInjuryLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, injury?.self || injury);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'injury', detail, injury?.self || injury);
      bot.pendingInjuryLeave = null;
    }
    bot.lastInjuryLeaveResult = detail;
    return detail;
  }

  async function leaveForPursuit(pursuit, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const pursuitSummary = summarizePursuit(pursuit);
    const skipped = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummary(pursuitSummary)
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastPursuitLeaveAt || 0) < cfg.pursuitLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.pursuitLeaveRetryMs - (t - Number(bot.lastPursuitLeaveAt || 0)))),
        pursuit: pursuitSummary,
        summary: pursuitLeaveSummary(pursuitSummary)
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'sustained pursuit',
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummary(pursuitSummary),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'pursuit', reason: detail.reason, self: selfSummary, pursuit: pursuitSummary });
    bot.lastPursuitLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, selfSummary);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'pursuit', detail, selfSummary);
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
    }
    bot.lastPursuitLeaveResult = detail;
    return detail;
  }

  async function leaveForCombat(action, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const reason = action?.reason === 'combat-critical-hp-leave'
      ? 'combat critical hp'
      : action?.reason === 'combat-hp-disadvantage-leave'
        ? 'combat hp disadvantage'
        : action?.reason === 'combat-low-hp-no-damage-leave'
          ? 'combat low hp no damage'
          : 'combat low hp disadvantage';
    const skipped = pendingExitSkipNewLeave('combat', reason, {
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastCombatLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastCombatLeaveAt || 0)))),
        combat: action?.combatState || null,
        combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
        target: action?.target || null,
        summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
      };
      finalizeLeaveDisplayReason(detail);
      rememberPendingCombatLeave(action, selfSummary, detail);
      return detail;
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'combat', reason, self: selfSummary, target: action?.target || null, combat: action?.combatState || null });
    bot.lastCombatLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, selfSummary);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'combat', detail, selfSummary);
      bot.pendingCombatLeave = null;
    } else {
      rememberPendingCombatLeave(action, selfSummary, detail);
    }
    bot.lastCombatLeaveResult = detail;
    return detail;
  }

  async function leaveDuringEnemyHold(reason = 'enemy leave wait') {
    const t = Date.now();
    const retryMs = Math.max(cfg.pursuitLeaveRetryMs, cfg.combatLeaveRetryMs);
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('enemy-hold-retry', reason, {
      summary: activeEnemyLeaveDetail(t)?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || ''
    });
    if (skipped) return skipped;
	    const active = activeEnemyLeaveDetail(t);
	    if (t - Number(bot.lastEnemyLeaveRetryAt || 0) < retryMs) {
	      const detail = {
	        attempted: false,
	        reason: 'cooldown',
	        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastEnemyLeaveRetryAt || 0)))),
	        holdRemainingMs: enemyReloginHoldRemainingMs(),
        summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
        reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0
	      };
      return finalizeLeaveDisplayReason(detail);
	    }
		    const detail = {
		      attempted: false,
		      method: '',
		      reason,
      at: t,
		      userId: getCurrentUserId() || null,
		      holdRemainingMs: enemyReloginHoldRemainingMs(),
      summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
      reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
      reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0,
	      error: ''
	    };
    startExitAudit(detail, { scope: 'enemy', source: 'enemy-hold-retry', reason });
    bot.lastEnemyLeaveRetryAt = t;
    await issueLeaveCommand(detail);
	    if (detail.attempted && !detail.error) bot.pendingCombatLeave = null;
	    detail.holdRemainingMs = enemyReloginHoldRemainingMs();
    finalizeLeaveDisplayReason(detail);
	    bot.lastEnemyLeaveRetryResult = detail;
    return detail;
  }

${nativeStateSource()}

${runtimeSummarySource()}

  function networkQualityRound(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, Math.max(0, Math.round(Number(digits) || 0)));
    return Math.round(n * factor) / factor;
  }

  function networkQualityEma(previous, sample, alpha = 0.2) {
    const value = Number(sample);
    if (!Number.isFinite(value)) return Number.isFinite(Number(previous)) ? Number(previous) : null;
    const prev = Number(previous);
    if (!Number.isFinite(prev)) return value;
    const a = clamp(Number(alpha) || 0.2, 0.01, 1);
    return prev + (value - prev) * a;
  }

  function ensureNetworkQualityState() {
    if (!bot.networkQuality || typeof bot.networkQuality !== 'object') {
      bot.networkQuality = {
        startedAt: Date.now(),
        frameSamples: [],
        pendingShots: [],
        pendingMovement: null,
        frameCount: 0,
        frameGapCount: 0,
        estimatedLostFrames: 0,
        expectedFrames: 0,
        movementCommandCount: 0,
        movementAckCount: 0,
        movementTimeoutCount: 0,
        attackShotCount: 0,
        attackAckCount: 0,
        attackTimeoutCount: 0,
        lastDiagnosticLogAt: 0,
        lastDiagnosticSignature: ''
      };
    }
    if (!Array.isArray(bot.networkQuality.frameSamples)) bot.networkQuality.frameSamples = [];
    if (!Array.isArray(bot.networkQuality.pendingShots)) bot.networkQuality.pendingShots = [];
    return bot.networkQuality;
  }

  function networkQualityPoint(entity) {
    const x = Number(entity?.x);
    const y = Number(entity?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function networkQualityDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function networkQualityWindowMs() {
    return Math.max(5000, Number(cfg.networkQualityWindowMs || 30000) || 30000);
  }

  function networkQualityBaseFrameMs() {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return Math.max(40, Number(cfg.combatNativeTickMinMs || cfg.nativeTickMinMs || cfg.tickMs || 120) || 120);
  }

  function networkQualityExpectedFrameMs(q = ensureNetworkQualityState()) {
    const configured = Number(cfg.networkQualityExpectedFrameMs || 0);
    if (Number.isFinite(configured) && configured > 0) return Math.max(20, configured);
    const base = networkQualityBaseFrameMs();
    const minGap = Number(q.frameIntervalMinMs || 0);
    const emaGap = Number(q.frameIntervalEmaMs || 0);
    const learned = Number.isFinite(minGap) && minGap > 0
      ? Math.min(emaGap > 0 ? emaGap : minGap, minGap * 1.35)
      : (emaGap > 0 ? emaGap : base);
    return Math.max(20, Math.min(Math.max(base * 2.5, 250), learned || base));
  }

  function pruneNetworkQualityFrameSamples(q, t = Date.now()) {
    const cutoff = t - networkQualityWindowMs();
    q.frameSamples = (Array.isArray(q.frameSamples) ? q.frameSamples : []).filter(sample => Number(sample.at || 0) >= cutoff);
    let lost = 0;
    let expected = 0;
    let maxGap = 0;
    for (const sample of q.frameSamples) {
      lost += Math.max(0, Number(sample.lost || 0) || 0);
      expected += Math.max(1, Number(sample.expected || 1) || 1);
      maxGap = Math.max(maxGap, Number(sample.gap || 0) || 0);
    }
    q.estimatedLostFrames = lost;
    q.expectedFrames = expected;
    q.lossRate = expected > 0 ? lost / expected : 0;
    q.maxFrameGapMs = maxGap;
  }

  function networkQualityFrameLatencySample(gapMs, expectedMs, lostFrames) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const excess = Math.max(0, gap - expected);
    const base = Math.min(expected, networkQualityBaseFrameMs());
    const lossPenalty = Math.max(0, Number(lostFrames || 0)) * Math.min(expected, 120);
    return Math.max(0, base + excess + lossPenalty);
  }

  function estimateNetworkQualityLostFrames(gapMs, expectedMs) {
    const gap = Math.max(0, Number(gapMs) || 0);
    const expected = Math.max(20, Number(expectedMs) || networkQualityBaseFrameMs());
    const ratio = Math.max(1.25, Number(cfg.networkQualityFrameLossGapRatio || 2.25) || 2.25);
    const extra = Math.max(0, Number(cfg.networkQualityFrameLossGapMinExtraMs || 180) || 180);
    if (gap < expected * ratio && gap < expected + extra) return 0;
    return Math.max(1, Math.round(gap / expected) - 1);
  }

  function observeNativeWsFrame(source = 'native-ws') {
    if (!cfg.networkQualityEnabled) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const previousAt = Number(q.lastFrameAt || 0);
    const gap = previousAt ? Math.max(0, t - previousAt) : 0;
    q.lastFrameAt = t;
    q.lastFrameSource = String(source || 'native-ws');
    q.frameCount = Math.max(0, Number(q.frameCount || 0) || 0) + 1;
    if (gap > 0 && gap < 60000) {
      const expectedBefore = networkQualityExpectedFrameMs(q);
      const lost = estimateNetworkQualityLostFrames(gap, expectedBefore);
      q.frameGapCount = Math.max(0, Number(q.frameGapCount || 0) || 0) + 1;
      q.lastFrameGapMs = Math.round(gap);
      q.frameIntervalEmaMs = networkQualityEma(q.frameIntervalEmaMs, gap, 0.18);
      if (gap >= 20 && gap <= Math.max(1000, expectedBefore * 4) && (!q.frameIntervalMinMs || gap < Number(q.frameIntervalMinMs))) {
        q.frameIntervalMinMs = Math.round(gap);
      }
      const expectedAfter = networkQualityExpectedFrameMs(q);
      q.expectedFrameMs = Math.round(expectedAfter);
      q.jitterEmaMs = networkQualityEma(q.jitterEmaMs, Math.abs(gap - expectedAfter), 0.18);
      q.stateLatencyEmaMs = networkQualityEma(q.stateLatencyEmaMs, networkQualityFrameLatencySample(gap, expectedAfter, lost), 0.22);
      q.frameSamples.push({
        at: t,
        gap: Math.round(gap),
        expected: Math.max(1, lost + 1),
        lost
      });
    }
    pruneNetworkQualityFrameSamples(q, t);
    return summarizeNetworkQuality(t);
  }

  function recordNetworkQualityMovementCommand(dx, dy, self = null, detail = {}) {
    if (!cfg.networkQualityEnabled || !(dx || dy)) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const pending = q.pendingMovement;
    const minMs = Math.max(100, Number(cfg.networkQualityMovementCommandMinMs || 350) || 350);
    if (pending && t - Number(pending.at || 0) < minMs && Number(pending.dx || 0) === Number(dx) && Number(pending.dy || 0) === Number(dy)) {
      return pending;
    }
    const point = networkQualityPoint(self || getSelf());
    if (!point) return null;
    q.movementCommandCount = Math.max(0, Number(q.movementCommandCount || 0) || 0) + 1;
    q.pendingMovement = {
      at: t,
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      origin: point,
      source: detail.source || 'velocity'
    };
    return q.pendingMovement;
  }

  function observeNetworkQualitySelf(self) {
    if (!cfg.networkQualityEnabled || !self) return null;
    const q = ensureNetworkQualityState();
    const t = Date.now();
    const point = networkQualityPoint(self);
    const pending = q.pendingMovement;
    if (pending && point && pending.origin) {
      const elapsed = Math.max(0, t - Number(pending.at || t));
      const moved = networkQualityDistance(point, pending.origin);
      const minMove = Math.max(1, Number(cfg.networkQualityMovementAckMinDistance || 40) || 40);
      const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
      if (moved >= minMove) {
        q.movementAckCount = Math.max(0, Number(q.movementAckCount || 0) || 0) + 1;
        q.lastMovementAckAt = t;
        q.lastMovementAckMs = Math.round(elapsed);
        q.movementAckEmaMs = networkQualityEma(q.movementAckEmaMs, elapsed, 0.28);
        q.actionLatencyEmaMs = networkQualityEma(q.actionLatencyEmaMs, elapsed, 0.24);
        q.lastActionAckAt = t;
        q.lastActionAckSource = 'movement';
        q.pendingMovement = null;
      } else if (elapsed >= timeoutMs) {
        q.movementTimeoutCount = Math.max(0, Number(q.movementTimeoutCount || 0) || 0) + 1;
        q.lastMovementTimeoutAt = t;
        q.lastMovementTimeoutMs = Math.round(elapsed);
        q.pendingMovement = null;
      }
    }
    return summarizeNetworkQuality(t);
  }

  function networkQualityTargetId(target) {
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }

  function recordNetworkQualityShot(self, target, detail = {}) {
    if (!cfg.networkQualityEnabled || !target || !detail.sent || detail.blockedByCadence) return;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId) return;
    const t = Number(detail.at || Date.now());
    q.attackShotCount = Math.max(0, Number(q.attackShotCount || 0) || 0) + 1;
    q.pendingShots.push({
      at: t,
      targetId,
      targetName: target.name || target.label || '',
      targetHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null
    });
    const timeoutMs = Math.max(1000, Number(cfg.networkQualityActionAckTimeoutMs || 5000) || 5000);
    const cutoff = Date.now() - timeoutMs;
    const expired = q.pendingShots.filter(shot => Number(shot.at || 0) < cutoff);
    if (expired.length) q.attackTimeoutCount = Math.max(0, Number(q.attackTimeoutCount || 0) || 0) + expired.length;
    q.pendingShots = q.pendingShots.filter(shot => Number(shot.at || 0) >= cutoff).slice(-20);
  }

  function recordNetworkQualityAttackDamage(target, damageAmount, t = Date.now()) {
    if (!cfg.networkQualityEnabled || !target) return null;
    const q = ensureNetworkQualityState();
    const targetId = networkQualityTargetId(target);
    if (!targetId || !Array.isArray(q.pendingShots) || !q.pendingShots.length) return null;
    const matching = q.pendingShots.filter(shot => String(shot.targetId || '') === targetId && Number(shot.at || 0) <= t);
    if (!matching.length) return null;
    const first = matching[0];
    const last = matching[matching.length - 1];
    const firstDelayMs = Math.max(0, t - Number(first.at || t));
    const lastDelayMs = Math.max(0, t - Number(last.at || t));
    q.attackAckCount = Math.max(0, Number(q.attackAckCount || 0) || 0) + 1;
    q.lastAttackAckAt = t;
    q.lastAttackAckMs = Math.round(lastDelayMs);
    q.lastAttackAckFirstShotMs = Math.round(firstDelayMs);
    q.lastAttackAckShotCount = matching.length;
    q.lastAttackAckDamage = Number.isFinite(Number(damageAmount)) ? networkQualityRound(damageAmount, 2) : null;
    q.attackAckEmaMs = networkQualityEma(q.attackAckEmaMs, lastDelayMs, 0.22);
    q.pendingShots = q.pendingShots.filter(shot => String(shot.targetId || '') !== targetId || Number(shot.at || 0) > t);
    return {
      targetId,
      firstDelayMs: Math.round(firstDelayMs),
      lastDelayMs: Math.round(lastDelayMs),
      shotCount: matching.length
    };
  }

  function summarizeNetworkQuality(t = Date.now()) {
    if (!cfg.networkQualityEnabled) return { enabled: false };
    const q = ensureNetworkQualityState();
    pruneNetworkQualityFrameSamples(q, t);
    const expectedFrameMs = networkQualityExpectedFrameMs(q);
    const frameAgeMs = q.lastFrameAt ? Math.max(0, t - Number(q.lastFrameAt || t)) : null;
    const stallMs = Math.max(
      Number(cfg.networkQualityLogStallMs || 1000) || 1000,
      expectedFrameMs * 4
    );
    const currentStallMs = frameAgeMs !== null && frameAgeMs > expectedFrameMs * 2
      ? Math.max(0, frameAgeMs - expectedFrameMs)
      : 0;
    const projectedLost = currentStallMs > 0
      ? Math.max(0, Math.floor(frameAgeMs / Math.max(20, expectedFrameMs)) - 1)
      : 0;
    const expectedFrames = Math.max(0, Number(q.expectedFrames || 0) || 0) + projectedLost;
    const lostFrames = Math.max(0, Number(q.estimatedLostFrames || 0) || 0) + projectedLost;
    const lossRate = expectedFrames > 0 ? lostFrames / expectedFrames : null;
    const actionFreshMs = Math.max(1000, Number(cfg.networkQualityDisplayActionFreshMs || 30000) || 30000);
    const actionFresh = Boolean(q.lastActionAckAt && t - Number(q.lastActionAckAt || 0) <= actionFreshMs && Number.isFinite(Number(q.actionLatencyEmaMs)));
    const hasFrameLatency = Number.isFinite(Number(q.stateLatencyEmaMs))
      || Number.isFinite(Number(q.frameIntervalEmaMs))
      || Math.max(0, Number(q.frameGapCount || 0) || 0) > 0;
    const frameLatency = hasFrameLatency ? Number(q.stateLatencyEmaMs || q.frameIntervalEmaMs || expectedFrameMs) : null;
    const displayLatency = actionFresh ? Number(q.actionLatencyEmaMs) : frameLatency;
    const movementAttempts = Math.max(0, Number(q.movementCommandCount || 0) || 0);
    const attackAttempts = Math.max(0, Number(q.attackShotCount || 0) || 0);
    const movementTimeoutRate = movementAttempts > 0 ? Math.max(0, Number(q.movementTimeoutCount || 0) || 0) / movementAttempts : 0;
    const attackTimeoutRate = attackAttempts > 0 ? Math.max(0, Number(q.attackTimeoutCount || 0) || 0) / attackAttempts : 0;
    return {
      enabled: true,
      source: 'native-ws-state',
      displayLatencyMs: Number.isFinite(displayLatency) ? Math.max(0, Math.round(displayLatency)) : null,
      latencySource: actionFresh ? String(q.lastActionAckSource || 'action') : 'ws-frame',
      lossPercent: lossRate === null ? null : networkQualityRound(lossRate * 100, 1),
      lossSource: 'ws-frame-gap',
      windowMs: networkQualityWindowMs(),
      sampleCount: Math.max(0, Number(q.frameGapCount || 0) || 0),
      frameCount: Math.max(0, Number(q.frameCount || 0) || 0),
      lastFrameAt: Number(q.lastFrameAt || 0) || 0,
      lastFrameAgeMs: frameAgeMs === null ? null : Math.round(frameAgeMs),
      lastFrameGapMs: Number.isFinite(Number(q.lastFrameGapMs)) ? Math.round(Number(q.lastFrameGapMs)) : null,
      expectedFrameMs: Math.round(expectedFrameMs),
      frameIntervalEmaMs: Number.isFinite(Number(q.frameIntervalEmaMs)) ? Math.round(Number(q.frameIntervalEmaMs)) : null,
      frameIntervalMinMs: Number.isFinite(Number(q.frameIntervalMinMs)) ? Math.round(Number(q.frameIntervalMinMs)) : null,
      jitterEmaMs: Number.isFinite(Number(q.jitterEmaMs)) ? Math.round(Number(q.jitterEmaMs)) : null,
      maxFrameGapMs: Number.isFinite(Number(q.maxFrameGapMs)) ? Math.round(Number(q.maxFrameGapMs)) : null,
      estimatedLostFrames: lostFrames,
      expectedFrames,
      currentStallMs: Math.round(currentStallMs),
      stalled: Boolean(frameAgeMs !== null && frameAgeMs >= stallMs),
      action: {
        movementAckMs: Number.isFinite(Number(q.movementAckEmaMs)) ? Math.round(Number(q.movementAckEmaMs)) : null,
        lastMovementAckMs: Number.isFinite(Number(q.lastMovementAckMs)) ? Math.round(Number(q.lastMovementAckMs)) : null,
        lastMovementAckAgeMs: q.lastMovementAckAt ? Math.max(0, Math.round(t - Number(q.lastMovementAckAt || t))) : null,
        movementCommands: movementAttempts,
        movementAcks: Math.max(0, Number(q.movementAckCount || 0) || 0),
        movementTimeouts: Math.max(0, Number(q.movementTimeoutCount || 0) || 0),
        movementTimeoutPercent: networkQualityRound(movementTimeoutRate * 100, 1),
        attackAckMs: Number.isFinite(Number(q.attackAckEmaMs)) ? Math.round(Number(q.attackAckEmaMs)) : null,
        lastAttackAckMs: Number.isFinite(Number(q.lastAttackAckMs)) ? Math.round(Number(q.lastAttackAckMs)) : null,
        lastAttackAckFirstShotMs: Number.isFinite(Number(q.lastAttackAckFirstShotMs)) ? Math.round(Number(q.lastAttackAckFirstShotMs)) : null,
        lastAttackAckAgeMs: q.lastAttackAckAt ? Math.max(0, Math.round(t - Number(q.lastAttackAckAt || t))) : null,
        attackShots: attackAttempts,
        attackAcks: Math.max(0, Number(q.attackAckCount || 0) || 0),
        attackTimeouts: Math.max(0, Number(q.attackTimeoutCount || 0) || 0),
        attackTimeoutPercent: networkQualityRound(attackTimeoutRate * 100, 1),
        pendingShots: Array.isArray(q.pendingShots) ? q.pendingShots.length : 0
      }
    };
  }

${importantLogSource()}

  function attackPlayerCategory(target, action = {}) {
    if (!target) return 'unknown';
    const afkProfit = isAfkProfitTarget(target);
    const realActivity = isCurrentlyActive(target) || isMovingThreat(target) || isFiringEntity(target);
    if (action?.combat || target.combat || (!afkProfit && realActivity)) return 'active';
    if (afkProfit || target.afk === true || action?.combat === false) return 'afk';
    return realActivity ? 'active' : 'unknown';
  }

  function rememberAttack(self, target, actionKind, action = {}) {
    if (!target) return;
    const t = Date.now();
    const targetId = target.id ?? target.user_id;
    const targetName = target.name || '';
    const playerCategory = attackPlayerCategory(target, action);
    const currentlyActive = isCurrentlyActive(target);
    const moving = isMovingThreat(target);
    const firing = isFiringEntity(target);
    const currentStaminaSpentMs = importantSessionStaminaSpentMs(bot.session);
    const previousAttack = bot.attackHistory
      .slice()
      .reverse()
      .find(item => t - Number(item?.at || 0) <= Math.max(1000, Number(cfg.killAttributionMergeMs || 120000))
        && attackIdentityMatches(item, targetName, targetId));
    const battleStartedAt = Number(previousAttack?.battleStartedAt || previousAttack?.at || t) || t;
    const battleStaminaSpentStartMs = Number.isFinite(Number(previousAttack?.battleStaminaSpentStartMs))
      ? Number(previousAttack.battleStaminaSpentStartMs)
      : (Number.isFinite(Number(previousAttack?.staminaSpentMs)) ? Number(previousAttack.staminaSpentMs) : currentStaminaSpentMs);
    pushBounded(bot.attackHistory, {
      at: t,
      action: actionKind,
      id: targetId,
      name: targetName,
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      drop: Number(target.drop || 0),
      afk: playerCategory === 'afk',
      active: playerCategory === 'active',
      playerCategory,
      combat: Boolean(action?.combat || target.combat),
      combatIntent: action?.target?.combatIntent || action?.combatIntent || target.combatIntent || '',
      mode: target.mode || target.current_join_mode || '',
      currentlyActive,
      moving,
      firing,
      distance: Number(target.distance || 0),
      staminaSpentMs: currentStaminaSpentMs,
      battleStartedAt,
      battleStaminaSpentStartMs,
      self: summarizeSelf(self)
    }, 80);
  }

  function rememberCombatEngagement(self, target, action) {
    if (!target) return;
    const id = target.id ?? target.user_id;
    if (id === null || id === undefined) return;
    const previous = bot.combatTarget;
    const same = previous && String(previous.id ?? '') === String(id);
    const t = Date.now();
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const intent = action?.target?.combatIntent || action?.combatIntent || target.combatIntent || '';
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
	    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
	    if (damaged) recordNetworkQualityAttackDamage(target, Math.max(0, previousHp - currentHp), t);
	    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
	    const lastInRangeAt = targetDistance <= Number(cfg.combatAttackRange || 0)
	      ? t
	      : (same ? Number(previous.lastInRangeAt || previous.at || t) : t);
	    const motionSamples = combatMotionSamplesWithCurrent(
	      self,
	      target,
	      t,
	      Math.max(Number(cfg.combatMotionHistoryWindowMs || 2000), Number(cfg.combatTradeEstimateWindowMs || 6000))
	    );
    const incomingOwnerId = action?.incomingBullet?.ownerId ?? action?.incomingBullet?.owner_id ?? null;
    const targetOwnsRealBullet = Boolean(
      action?.incomingBullet
      && !action.incomingBullet.synthetic
      && incomingOwnerId !== null
      && incomingOwnerId !== undefined
      && String(incomingOwnerId) === String(id)
    );
	    bot.combatTarget = {
      id,
      at: t,
      firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || t) : t,
      name: target.name || '',
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      hp: currentHp,
      displayHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      drop: Number(target.drop || 0),
      distance: targetDistance,
      reason: action?.reason || '',
      intent,
      originIntent: same ? String(previous.originIntent || previous.intent || intent) : String(intent || ''),
      originReason: same ? String(previous.originReason || previous.reason || '') : String(action?.reason || ''),
      lastDamageAt,
      lastInRangeAt,
	      seenTargetRealBulletAt: targetOwnsRealBullet
	        ? t
	        : (same ? Number(previous.seenTargetRealBulletAt || 0) : 0),
	      lastDamageAmount: damaged ? Math.max(0, previousHp - currentHp) : Number(previous?.lastDamageAmount || 0),
	      noDamageMs: Math.max(0, t - lastDamageAt),
	      motionSamples,
	      self: summarizeSelf(self)
	    };
  }

  function clearCombatEngagement(reason = '') {
    if (!bot.combatTarget) return;
    bot.lastCombatTargetClear = { at: Date.now(), reason };
    bot.combatTarget = null;
    bot.combatAim = null;
    clearCombatDisadvantageObservation(reason || 'combat-engagement-cleared');
  }

  function killIdentityMatches(item, victim, id) {
    if (!item) return false;
    const victimName = String(victim || '').trim();
    const itemName = String(item.victim || item.name || '').trim();
    const idText = id === undefined || id === null ? '' : String(id);
    const itemId = item.id === undefined || item.id === null ? '' : String(item.id);
    if (idText && itemId && idText === itemId) return true;
    return Boolean(victimName && itemName && victimName === itemName);
  }

  function recentKillHistoryIndex(victim, id, t = Date.now(), windowMs = cfg.killAttributionMergeMs) {
    const maxAge = Math.max(1000, Number(windowMs || cfg.killAttributionMergeMs || 120000));
    for (let i = bot.killHistory.length - 1; i >= 0; i -= 1) {
      const item = bot.killHistory[i];
      if (t - Number(item?.at || 0) > maxAge) continue;
      if (killIdentityMatches(item, victim, id)) return i;
    }
    return -1;
  }

  function attackIdentityMatches(item, victim, id) {
    if (!item) return false;
    const victimName = String(victim || '').trim();
    const itemName = String(item.name || item.victim || '').trim();
    const idText = id === undefined || id === null ? '' : String(id);
    const itemId = item.id === undefined || item.id === null ? '' : String(item.id);
    if (idText && itemId && idText === itemId) return true;
    return Boolean(victimName && itemName && victimName === itemName);
  }

  function recentAttackBattleSummary(victim, id, t = Date.now(), windowMs = cfg.killAttributionMergeMs) {
    const maxAge = Math.max(1000, Number(windowMs || cfg.killAttributionMergeMs || 120000));
    const attacks = bot.attackHistory
      .filter(item => t - Number(item?.at || 0) <= maxAge)
      .filter(item => attackIdentityMatches(item, victim, id))
      .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    if (!attacks.length) return null;
    const first = attacks[0];
    const last = attacks[attacks.length - 1];
    const startedAt = Number(first.battleStartedAt || first.at || t) || t;
    const endedAt = t;
    const startStamina = Number(first.battleStaminaSpentStartMs ?? first.staminaSpentMs);
    const endStamina = Number.isFinite(Number(last.staminaSpentMs))
      ? Number(last.staminaSpentMs)
      : importantSessionStaminaSpentMs(bot.session);
    return {
      battleStartedAt: startedAt,
      battleEndedAt: endedAt,
      battleDurationMs: Math.max(0, Math.round(endedAt - startedAt)),
      battleStaminaSpentStartMs: Number.isFinite(startStamina) ? Math.max(0, Math.round(startStamina)) : null,
      battleStaminaSpentEndMs: Number.isFinite(endStamina) ? Math.max(0, Math.round(endStamina)) : null,
      battleStaminaSpentMs: Number.isFinite(startStamina) && Number.isFinite(endStamina) ? Math.max(0, Math.round(endStamina - startStamina)) : null
    };
  }

  function recordKillHistoryItem(kill, seenKey = '') {
    if (!kill || typeof kill !== 'object') return null;
    const t = Number(kill.at || Date.now()) || Date.now();
    const battle = recentAttackBattleSummary(kill.victim || kill.name || '', kill.id, t);
    if (battle) {
      kill = {
        ...kill,
        battleStartedAt: kill.battleStartedAt || battle.battleStartedAt,
        battleEndedAt: kill.battleEndedAt || battle.battleEndedAt,
        battleDurationMs: kill.battleDurationMs || battle.battleDurationMs,
        battleStaminaSpentStartMs: kill.battleStaminaSpentStartMs !== null && kill.battleStaminaSpentStartMs !== undefined && kill.battleStaminaSpentStartMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentStartMs)) ? kill.battleStaminaSpentStartMs : battle.battleStaminaSpentStartMs,
        battleStaminaSpentEndMs: kill.battleStaminaSpentEndMs !== null && kill.battleStaminaSpentEndMs !== undefined && kill.battleStaminaSpentEndMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentEndMs)) ? kill.battleStaminaSpentEndMs : battle.battleStaminaSpentEndMs,
        battleStaminaSpentMs: kill.battleStaminaSpentMs !== null && kill.battleStaminaSpentMs !== undefined && kill.battleStaminaSpentMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentMs)) ? kill.battleStaminaSpentMs : battle.battleStaminaSpentMs
      };
    }
    const index = recentKillHistoryIndex(kill.victim || kill.name || '', kill.id, t);
    let stored = kill;
    if (index >= 0) {
      const previous = bot.killHistory[index] || {};
      const previousDropMatched = Boolean(previous.dropMatched);
      const nextDropMatched = Boolean(kill.dropMatched);
      const rewardConfirmed = Boolean(previous.rewardConfirmed || kill.rewardConfirmed || previousDropMatched || nextDropMatched);
      const previousReward = Math.max(0, Number(previous.rewardCoins || 0) || 0);
      const nextReward = Math.max(0, Number(kill.rewardCoins || 0) || 0);
      const previousBattleStart = Number(previous.battleStartedAt || 0) || 0;
      const nextBattleStart = Number(kill.battleStartedAt || 0) || 0;
      const previousBattleEnd = Number(previous.battleEndedAt || previous.at || 0) || 0;
      const nextBattleEnd = Number(kill.battleEndedAt || kill.at || 0) || 0;
      const battleStartedAt = previousBattleStart && nextBattleStart ? Math.min(previousBattleStart, nextBattleStart) : (previousBattleStart || nextBattleStart || 0);
      const battleEndedAt = Math.max(previousBattleEnd, nextBattleEnd, t);
      const previousBattleStaminaStart = previous.battleStaminaSpentStartMs !== null && previous.battleStaminaSpentStartMs !== undefined && previous.battleStaminaSpentStartMs !== '' ? Number(previous.battleStaminaSpentStartMs) : NaN;
      const nextBattleStaminaStart = kill.battleStaminaSpentStartMs !== null && kill.battleStaminaSpentStartMs !== undefined && kill.battleStaminaSpentStartMs !== '' ? Number(kill.battleStaminaSpentStartMs) : NaN;
      const previousBattleStaminaEnd = previous.battleStaminaSpentEndMs !== null && previous.battleStaminaSpentEndMs !== undefined && previous.battleStaminaSpentEndMs !== '' ? Number(previous.battleStaminaSpentEndMs) : NaN;
      const nextBattleStaminaEnd = kill.battleStaminaSpentEndMs !== null && kill.battleStaminaSpentEndMs !== undefined && kill.battleStaminaSpentEndMs !== '' ? Number(kill.battleStaminaSpentEndMs) : NaN;
      const battleStaminaSpentStartMs = Number.isFinite(previousBattleStaminaStart) && Number.isFinite(nextBattleStaminaStart)
        ? Math.min(previousBattleStaminaStart, nextBattleStaminaStart)
        : (Number.isFinite(previousBattleStaminaStart) ? previousBattleStaminaStart : (Number.isFinite(nextBattleStaminaStart) ? nextBattleStaminaStart : null));
      const battleStaminaSpentEndMs = Number.isFinite(previousBattleStaminaEnd) && Number.isFinite(nextBattleStaminaEnd)
        ? Math.max(previousBattleStaminaEnd, nextBattleStaminaEnd)
        : (Number.isFinite(nextBattleStaminaEnd) ? nextBattleStaminaEnd : (Number.isFinite(previousBattleStaminaEnd) ? previousBattleStaminaEnd : null));
      const targetDrop = Math.max(
        0,
        Number(kill.targetDrop ?? kill.drop ?? kill.reportedRewardCoins ?? 0) || 0,
        Number(previous.targetDrop ?? previous.drop ?? previous.reportedRewardCoins ?? 0) || 0
      );
      stored = {
        ...previous,
        ...kill,
        at: Number(previous.at || kill.at || t) || t,
        time: kill.time || previous.time || '',
        rewardCoins: rewardConfirmed ? Math.max(previousReward, nextReward) : 0,
        reportedRewardCoins: Math.max(
          0,
          Number(kill.reportedRewardCoins ?? kill.rewardCoins ?? 0) || 0,
          Number(previous.reportedRewardCoins ?? previous.rewardCoins ?? 0) || 0
        ),
        drop: targetDrop,
        targetDrop,
        rewardConfirmed,
        matchedAttack: Boolean(previous.matchedAttack || kill.matchedAttack),
        chatConfirmed: Boolean(previous.chatConfirmed || kill.chatConfirmed),
        dropMatched: Boolean(previousDropMatched || nextDropMatched),
        battleStartedAt,
        battleEndedAt,
        battleDurationMs: battleStartedAt && battleEndedAt ? Math.max(0, Math.round(battleEndedAt - battleStartedAt)) : 0,
        battleStaminaSpentStartMs,
        battleStaminaSpentEndMs,
        battleStaminaSpentMs: Number.isFinite(battleStaminaSpentStartMs) && Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs - battleStaminaSpentStartMs)) : null,
        source: previous.source && kill.source && previous.source !== kill.source
          ? previous.source + '+' + kill.source
          : (kill.source || previous.source || '')
      };
      bot.killHistory[index] = stored;
    } else {
      pushBounded(bot.killHistory, stored, 40);
    }
    const playerCategory = importantKillPlayerCategory(stored);
    stored.playerCategory = playerCategory;
    stored.afk = playerCategory === 'afk';
    stored.active = playerCategory === 'active';
    recordImportantKill(stored);
    if (seenKey) {
      bot.seenKillKeys.add(seenKey);
      pushBounded(bot.seenKillKeysList, seenKey, 120);
    }
    return stored;
  }

  function killMessageText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return '';
    return String(raw.text ?? raw.message ?? raw.content ?? raw.body ?? raw.msg ?? raw.value ?? '');
  }

  function killMessageTime(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const value = raw.time ?? raw.created_at ?? raw.createdAt ?? raw.at ?? raw.timestamp ?? '';
    if (typeof value === 'string' && /^\\d{1,2}:\\d{2}:\\d{2}$/.test(value)) return value;
    return '';
  }

  function collectKillMessageRows() {
    const rows = [];
    if (typeof document !== 'undefined' && document?.body) {
      const lines = (document.body.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i += 1) {
        rows.push({
          text: lines[i],
          time: /^\\d{1,2}:\\d{2}:\\d{2}$/.test(lines[i - 1] || '') ? lines[i - 1] : '',
          source: 'chat'
        });
      }
    }
    for (const message of Array.isArray(bot.globalState.messages) ? bot.globalState.messages : []) {
      const text = killMessageText(message).trim();
      if (!text) continue;
      rows.push({
        text,
        time: killMessageTime(message),
        source: 'snapshot'
      });
    }
    return rows;
  }

  function recentAttackForKill(victim, t = Date.now()) {
    const maxAge = Math.max(1000, Number(cfg.killChatAttackMatchMs || 120000));
    return bot.attackHistory
      .slice()
      .reverse()
      .find(item => t - Number(item.at || 0) <= maxAge
        && (item.name === victim || String(item.id) === victim)) || null;
  }

  function findLiveKillVictim(victim, id = null) {
    const victimName = String(victim || '').trim();
    const idText = id === undefined || id === null || id === '' ? '' : String(id);
    if (!victimName && !idText) return null;
    const lists = [];
    const nativeEntities = getNativeEntityList();
    if (Array.isArray(nativeEntities)) lists.push({ source: 'native', entities: nativeEntities });
    const currentEntities = getEntities();
    if (Array.isArray(currentEntities) && currentEntities !== nativeEntities) lists.push({ source: 'current', entities: currentEntities });
    if (Array.isArray(bot.globalState?.entities) && bot.globalState.entities !== currentEntities && bot.globalState.entities !== nativeEntities) {
      lists.push({ source: 'snapshot', entities: bot.globalState.entities });
    }
    for (const list of lists) {
      for (const entity of list.entities || []) {
        if (!entity || typeof entity !== 'object') continue;
        const entityId = entity.user_id ?? entity.userId ?? entity.id;
        const entityName = String(entity.name || '').trim();
        const idMatches = Boolean(idText && entityId !== undefined && entityId !== null && String(entityId) === idText);
        const nameMatches = Boolean(victimName && entityName && entityName === victimName);
        if (!idMatches && !nameMatches) continue;
        if (!isAlive(entity)) continue;
        const hp = firstFiniteNumber(entity.hp, entity.knownHp, entity.displayHp, entity.health, entity.currentHp);
        if (Number.isFinite(hp) && hp <= 0) continue;
        return {
          source: list.source,
          id: entityId ?? null,
          name: entityName,
          hp: Number.isFinite(hp) ? hp : null,
          life: entity.life || ''
        };
      }
    }
    return null;
  }

  function recordDropMatchedKill(target, amount, currentSummary, reason = '') {
    const postAttackTarget = target?.postAttackTarget || null;
    if (!postAttackTarget) return null;
    const reward = Math.max(0, Math.round(Number(amount || 0)));
    const targetDrop = Math.max(0, Math.round(Number(postAttackTarget.drop || 0)));
    if (!reward || !targetDrop || reward !== targetDrop) return null;
    const coinKey = coinTargetKey(target) || ('xy:' + Math.round(Number(target.x) || 0) + ':' + Math.round(Number(target.y) || 0) + ':' + reward);
    const targetKey = postAttackTarget.id !== undefined && postAttackTarget.id !== null && postAttackTarget.id !== ''
      ? 'id:' + String(postAttackTarget.id)
      : 'name:' + String(postAttackTarget.name || '');
    const seenKey = 'drop-coin-match|' + targetKey + '|' + coinKey + '|' + reward;
    if (bot.seenKillKeys.has(seenKey)) return null;
    const t = Date.now();
    const battleStartedAt = Number(postAttackTarget.battleStartedAt || 0) || 0;
    const rawBattleStaminaStart = postAttackTarget.battleStaminaSpentStartMs;
    const battleStaminaSpentStartMs = rawBattleStaminaStart !== null && rawBattleStaminaStart !== undefined && rawBattleStaminaStart !== ''
      ? Number(rawBattleStaminaStart)
      : NaN;
    const battleStaminaSpentEndMs = importantSessionStaminaSpentMs(bot.session);
    return recordKillHistoryItem({
      at: t,
      time: '',
      victim: postAttackTarget.name || '',
      id: postAttackTarget.id ?? null,
      drop: targetDrop,
      rewardCoins: reward,
      reportedRewardCoins: reward,
      playerCategory: postAttackTarget.playerCategory || (postAttackTarget.afk === false ? 'active' : 'afk'),
      afk: postAttackTarget.afk !== false,
      active: postAttackTarget.active === true || postAttackTarget.playerCategory === 'active',
      combat: Boolean(postAttackTarget.combat),
      combatIntent: postAttackTarget.combatIntent || '',
      mode: postAttackTarget.mode || '',
      currentlyActive: Boolean(postAttackTarget.currentlyActive),
      moving: Boolean(postAttackTarget.moving),
      firing: Boolean(postAttackTarget.firing),
      matchedAttack: true,
      dropMatched: true,
      rewardConfirmed: true,
      chatConfirmed: false,
      source: 'drop-coin-match',
      targetDrop,
      attackDistance: Number.isFinite(Number(postAttackTarget.distance)) ? Math.round(Number(postAttackTarget.distance)) : null,
      battleStartedAt,
      battleEndedAt: t,
      battleDurationMs: battleStartedAt ? Math.max(0, Math.round(t - battleStartedAt)) : 0,
      battleStaminaSpentStartMs: Number.isFinite(battleStaminaSpentStartMs) ? Math.max(0, Math.round(battleStaminaSpentStartMs)) : null,
      battleStaminaSpentEndMs: Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs)) : null,
      battleStaminaSpentMs: Number.isFinite(battleStaminaSpentStartMs) && Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs - battleStaminaSpentStartMs)) : null,
      sessionId: bot.session?.importantSessionId || '',
      coin: {
        id: target.id ?? target.drop_id ?? target.coin_id ?? null,
        amount: reward,
        x: Number.isFinite(Number(target.x)) ? Math.round(Number(target.x)) : null,
        y: Number.isFinite(Number(target.y)) ? Math.round(Number(target.y)) : null,
        distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null
      },
      attributionReason: reason || 'coin-pickup',
      self: currentSummary || null
    }, seenKey);
  }

  function updateKillHistory(self) {
    const ownName = self?.name || '';
    if (!ownName) return;
    const rows = collectKillMessageRows();
    for (const row of rows) {
      const match = row.text.match(/^(.+?) killed (.+)$/);
      if (!match || match[1] !== ownName) continue;
      const time = row.time || '';
      const victim = match[2];
      const key = 'chat-kill|' + (row.source || 'chat') + '|' + time + '|' + victim;
      if (bot.seenKillKeys.has(key)) continue;
      const attack = recentAttackForKill(victim);
      const existingIndex = recentKillHistoryIndex(victim, attack?.id ?? null);
      const existing = existingIndex >= 0 ? bot.killHistory[existingIndex] : null;
      if (!attack && !existing) continue;
      const targetDrop = Math.max(0, Math.round(Number(attack ? attack.drop : (existing?.targetDrop ?? existing?.drop ?? 0)) || 0));
      const existingRewardConfirmed = Boolean(existing?.rewardConfirmed || existing?.dropMatched);
      const liveVictim = existingRewardConfirmed ? null : findLiveKillVictim(victim, attack?.id ?? existing?.id ?? null);
      if (liveVictim) {
        bot.importantLogging.lastSkippedChatKill = {
          at: Date.now(),
          victim,
          id: attack?.id ?? existing?.id ?? null,
          reason: 'victim-still-alive',
          liveVictim
        };
        continue;
      }
      const kill = {
        at: Date.now(),
        time,
        victim,
        id: attack ? attack.id : (existing?.id ?? null),
        drop: targetDrop || null,
        targetDrop: targetDrop || null,
        rewardCoins: existingRewardConfirmed ? Math.max(0, Number(existing?.rewardCoins || 0) || 0) : 0,
        reportedRewardCoins: targetDrop || Math.max(0, Number(existing?.reportedRewardCoins ?? existing?.rewardCoins ?? 0) || 0),
        playerCategory: attack ? attack.playerCategory : (existing?.playerCategory ?? ''),
        afk: attack ? attack.afk : (existing?.afk ?? null),
        active: attack ? attack.active : (existing?.active ?? null),
        combat: attack ? attack.combat : (existing?.combat ?? false),
        combatIntent: attack ? attack.combatIntent : (existing?.combatIntent ?? ''),
        mode: attack ? attack.mode : (existing?.mode ?? ''),
        currentlyActive: attack ? attack.currentlyActive : (existing?.currentlyActive ?? false),
        moving: attack ? attack.moving : (existing?.moving ?? false),
        firing: attack ? attack.firing : (existing?.firing ?? false),
        matchedAttack: Boolean(attack || existing?.matchedAttack),
        chatConfirmed: true,
        source: 'chat',
        attackDistance: attack ? attack.distance : (existing?.attackDistance ?? null),
        sessionId: bot.session?.importantSessionId || '',
        coin: existing?.coin || null,
        dropMatched: Boolean(existing?.dropMatched),
        rewardConfirmed: existingRewardConfirmed
      };
      recordKillHistoryItem(kill, key);
    }
  }

  function markRecentMovement(entities) {
    const t = now();
    const sampleMs = Math.max(1, Number(cfg.combatAimMotionSampleMs || 50));
    const decayMs = Math.max(sampleMs, Number(cfg.combatAimRecentMotionDecayMs || 900));
    for (const entity of entities) {
      const id = Number(entity.user_id);
      if (!id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      const previous = bot.seenEntities.get(id);
      let movedAt = previous?.movedAt || 0;
      let activityAt = previous?.activityAt || 0;
      let motionSampleSpeed = 0;
      let motionObservedSpeed = 0;
      const currentSpeed = speed(entity);
      const firing = isFiringEntity(entity);
      const stamina5s = Number(entity?.stamina_5s_remaining_milli ?? entity?.stamina5s ?? entity?.stamina_5s ?? NaN);
      const previousStamina = Number(previous?.stamina5s);
      const staminaDropThreshold = Math.max(0, Number(cfg.opportunityAfkStaminaDropThresholdMs || 100) || 100);
      if (previous
        && Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(Number(previous.x))
        && Number.isFinite(Number(previous.y))) {
        const elapsedMs = Math.max(sampleMs, t - Number(previous.seenAt || t));
        const delta = Math.hypot(x - Number(previous.x), y - Number(previous.y));
        motionSampleSpeed = delta * sampleMs / elapsedMs;
        const retained = Math.max(0, Number(previous.motionObservedSpeed || 0)) * Math.max(0, 1 - elapsedMs / decayMs);
        motionObservedSpeed = Math.max(motionSampleSpeed, retained);
        if (delta >= cfg.activeMoveMin) {
          movedAt = t;
          activityAt = t;
        }
      }
      if (!previous && (Math.abs(Number(entity.vx) || 0) || Math.abs(Number(entity.vy) || 0))) {
        movedAt = t;
        activityAt = t;
      }
      if (currentSpeed >= cfg.activeSpeedMin || firing) activityAt = t;
      if (Number.isFinite(stamina5s) && Number.isFinite(previousStamina) && stamina5s + staminaDropThreshold < previousStamina) activityAt = t;
      const motionAgeMs = movedAt ? Math.max(0, t - movedAt) : null;
      const recentActivityAgeMs = activityAt ? Math.max(0, t - activityAt) : null;
      const afkCooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
      entity.motionSampleSpeed = motionSampleSpeed;
      entity.motionObservedSpeed = motionObservedSpeed;
      entity.motionAgeMs = motionAgeMs;
      entity.recentActivityAgeMs = recentActivityAgeMs;
      entity.recentlyActive = Boolean(recentActivityAgeMs !== null && recentActivityAgeMs <= afkCooldownMs);
      entity.recentlyMoved = Boolean(movedAt && t - movedAt <= cfg.activeSeenMs);
      bot.seenEntities.set(id, {
        x,
        y,
        seenAt: t,
        movedAt,
        activityAt,
        motionSampleSpeed,
        motionObservedSpeed,
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null)
      });
    }
    const seenTtlMs = Math.max(10000, Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0) + 2000);
    for (const [id, seen] of bot.seenEntities.entries()) {
      if (t - seen.seenAt > seenTtlMs) bot.seenEntities.delete(id);
    }
  }

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    bot.globalState.activeRefreshSkippedAt = t;
	    bot.globalState.minimap = null;
	    bot.globalState.error = '';
	    bot.globalState.samplingOutage = null;
	    const completedAt = Date.now();
	    const refreshDiagnostic = {
	      startedAt: t,
	      completedAt,
	      durationMs: 0,
	      force: Boolean(force),
	      skipped: 'passive-snapshot-only-active-game-api-disabled',
	      snapshot: { ok: false, skipped: true, error: '' },
	      minimap: { ok: false, skipped: true, error: '' },
	      error: bot.globalState.error
	    };
	    recordRuntimeDiagnostics({ lastRefresh: refreshDiagnostic });
	  }

	  function wsSend(message) {
	    if (cfg.dryRun) return true;
	    const native = getNativeControl();
	    if (native) {
	      if (!syncNativeControl(native)) {
	        notePageOwnsReconnect();
	        return false;
	      }
	      try {
	        native.ws.send(message);
	        bot.control.lastMessageAt = Date.now();
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'native send: ' + (err.message || String(err));
	        return false;
	      }
	    }
	    if (!ensureControlWs()) return false;
	    return false;
	  }

	  function setNativeKeys(nativeState, dx, dy) {
	    let updated = false;
	    if (nativeState?.keys && typeof nativeState.keys.add === 'function') {
	      for (const key of ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']) {
	        nativeState.keys.delete(key);
	      }
	      if (dx < 0) nativeState.keys.add('a');
	      if (dx > 0) nativeState.keys.add('d');
	      if (dy < 0) nativeState.keys.add('w');
	      if (dy > 0) nativeState.keys.add('s');
	      updated = true;
	    }
	    if (nativeState?.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	      updated = true;
	    }
	    return updated;
	  }

	  function cancelVelocityStopTimer() {
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    cancelDirectVelocityRepeat();
	    bot.velocityPulseToken += 1;
	  }

	  function clearNativeMotionState(nativeState) {
	    if (!nativeState) return false;
	    setNativeKeys(nativeState, 0, 0);
	    const vectorFields = ['currentVel', 'targetVel', 'velocity', 'lastNonZeroVel'];
	    for (const field of vectorFields) {
	      const value = nativeState[field];
	      if (value && typeof value === 'object') {
	        if ('dx' in value) value.dx = 0;
	        if ('dy' in value) value.dy = 0;
	        if ('x' in value) value.x = 0;
	        if ('y' in value) value.y = 0;
	      }
	    }
	    if (nativeState.lastVel && typeof nativeState.lastVel === 'object') {
	      if ('dx' in nativeState.lastVel) nativeState.lastVel.dx = 0;
	      if ('dy' in nativeState.lastVel) nativeState.lastVel.dy = 0;
	      if ('x' in nativeState.lastVel) nativeState.lastVel.x = 0;
	      if ('y' in nativeState.lastVel) nativeState.lastVel.y = 0;
	    } else if (Object.prototype.hasOwnProperty.call(nativeState, 'lastVel')) {
	      nativeState.lastVel = '0 0';
	    }
	    if (nativeState.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	    }
	    const t = now();
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastInputAt')) nativeState.lastInputAt = 0;
	    if (Object.prototype.hasOwnProperty.call(nativeState, 'lastStopAt')) nativeState.lastStopAt = t;
	    return true;
	  }

	  function stopLocalMotionOnly(reason = '') {
	    cancelVelocityStopTimer();
	    const nativeState = getNativeState();
	    if (nativeState) clearNativeMotionState(nativeState);
	    bot.control.lastVelocity = '0 0';
	    bot.control.lastVelocityAt = now();
	    bot.control.nonZeroVelocitySince = 0;
    bot.control.lastNonZeroVelocityAt = 0;
    if (reason !== 'server-position-stalled') resetServerPositionStall(reason || 'local-stop');
    if (reason) bot.control.lastLocalStopReason = reason;
    return true;
  }

	  function stopMotionSafely(reason = '') {
	    const native = getNativeControl();
	    if (native?.wsOpen) {
	      stopLocalMotionOnly(reason);
	      bot.control.lastVelocity = '0 0';
	      bot.control.lastVelocityAt = now();
	      const sent = sendNativeVelocity(0, 0, true);
	      if (sent) scheduleDirectVelocityRepeat(0, 0, true);
	      return Boolean(sent);
	    }
	    return stopLocalMotionOnly(reason);
	  }

	  function stopMotionAfterExit(reason = 'exit-confirmed') {
	    stopMotionSafely(reason);
	    bot.lastExitMotionStopAt = Date.now();
	    bot.lastExitMotionStopReason = reason;
	    clearPostExitTargetState(reason);
	    return true;
	  }

	  function cancelDirectVelocityRepeat() {
	    bot.directVelocityRepeatToken += 1;
	    bot.directVelocityRepeatUntil = 0;
	    bot.directVelocityStopRepeatsLeft = 0;
	    if (bot.directVelocityTimer) {
	      clearTimeout(bot.directVelocityTimer);
	      bot.directVelocityTimer = 0;
	    }
	  }

	  function directWsVelocityMessage(dx, dy) {
	    return 'vel ' + clamp(Math.round(dx), -1, 1) + ' ' + clamp(Math.round(dy), -1, 1);
	  }

	  function sendDirectNativeVelocity(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled) return false;
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (!cfg.directWsServerMarkerProbe) {
	      setNativeKeys(native.state, dx, dy);
	    }
	    const message = directWsVelocityMessage(dx, dy);
	    const t = now();
	    const dedupeMs = Math.max(0, Math.min(45, Number(cfg.directWsVelocityRepeatMs || 50) - 5));
	    if (!force && message === bot.lastDirectVelocity && t - Number(bot.lastDirectVelocityAt || 0) < dedupeMs) return true;
	    try {
	      native.ws.send(message);
	      if (cfg.directWsServerMarkerProbe) {
	        setNativeKeys(native.state, dx, dy);
	      }
	      bot.lastDirectVelocity = message;
	      bot.lastDirectVelocityAt = t;
	      bot.control.lastMessageAt = Date.now();
	      bot.control.transport = 'native-page-direct-ws';
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'direct native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function scheduleDirectVelocityRepeat(dx, dy, force = false) {
	    if (!cfg.directWsControlEnabled || cfg.dryRun) return;
	    const repeatMs = Math.max(20, Number(cfg.directWsVelocityRepeatMs || 50));
	    const holdMs = Math.max(repeatMs, Number(cfg.directWsVelocityRepeatHoldMs || 220));
	    const moving = Boolean(dx || dy);
	    if (!moving) {
	      bot.directVelocityRepeatUntil = 0;
	      bot.directVelocityStopRepeatsLeft = Math.max(0, Math.round(Number(cfg.directWsStopRepeatCount || 0)));
	    } else {
	      bot.directVelocityRepeatUntil = now() + holdMs;
	      bot.directVelocityStopRepeatsLeft = 0;
	    }
	    bot.directVelocityRepeatToken += 1;
	    const token = bot.directVelocityRepeatToken;
	    if (bot.directVelocityTimer) clearTimeout(bot.directVelocityTimer);
	    const run = () => {
	      try {
	        if (bot.directVelocityRepeatToken !== token) return;
	        bot.directVelocityTimer = 0;
	        const keepMoving = moving && now() <= Number(bot.directVelocityRepeatUntil || 0);
	        const keepStopping = !moving && Number(bot.directVelocityStopRepeatsLeft || 0) > 0;
	        if (!keepMoving && !keepStopping) return;
	        if (!moving) bot.directVelocityStopRepeatsLeft = Math.max(0, Number(bot.directVelocityStopRepeatsLeft || 0) - 1);
	        sendDirectNativeVelocity(dx, dy, true);
	        bot.directVelocityTimer = setTimeout(run, repeatMs);
	      } catch (err) {
	        bot.directVelocityTimer = 0;
	        recordUnhandledTickError('direct-velocity-repeat', err);
	      }
	    };
	    bot.directVelocityTimer = setTimeout(run, repeatMs);
	  }

	  function sendNativeVelocity(dx, dy, force = false) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (sendDirectNativeVelocity(dx, dy, force)) return true;
	    setNativeKeys(native.state, dx, dy);
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (typeof sendVelocity !== 'function') return wsSend('vel ' + dx + ' ' + dy);
	    try {
	      sendVelocity(Boolean(force));
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function safeSendVelocity(dx, dy, force = false) {
	    dx = clamp(Math.round(dx), -1, 1);
	    dy = clamp(Math.round(dy), -1, 1);
	    if (cfg.dryRun) return true;
	    const vel = dx + ' ' + dy;
	    const t = now();
	    if (!force && vel === bot.control.lastVelocity && t - bot.control.lastVelocityAt < 100) return true;
	    bot.control.lastVelocity = vel;
	    bot.control.lastVelocityAt = t;
    if (dx || dy) {
      const dt = Date.now();
      if (!bot.control.nonZeroVelocitySince) bot.control.nonZeroVelocitySince = dt;
      bot.control.lastNonZeroVelocityAt = dt;
    } else {
      bot.control.nonZeroVelocitySince = 0;
      bot.control.lastNonZeroVelocityAt = 0;
      if (!bot.serverPositionStall?.stalled || !cfg.serverPositionStallOfflineEnabled) resetServerPositionStall('zero-velocity');
    }
    if (sendNativeVelocity(dx, dy, force)) {
      if (dx || dy) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity' });
      scheduleDirectVelocityRepeat(dx, dy, force);
      return true;
    }
    cancelDirectVelocityRepeat();
    const sent = wsSend('vel ' + vel);
    if (sent && (dx || dy)) recordNetworkQualityMovementCommand(dx, dy, getSelf(), { source: 'velocity-fallback' });
    return sent;
		  }

	  function sendActionVelocity(action) {
	    const lockRemainingMs = exitMotionStopLockRemainingMs();
	    let dx = clamp(Math.round(Number(action?.dx || 0)), -1, 1);
	    let dy = clamp(Math.round(Number(action?.dy || 0)), -1, 1);
	    if (lockRemainingMs > 0) {
	      dx = 0;
	      dy = 0;
	      if (action && typeof action === 'object') {
	        action.exitMotionBlocked = {
	          reason: bot.lastExitMotionStopReason || 'exit-motion-stopped',
	          remainingMs: lockRemainingMs
	        };
	      }
	    }
	    bot.velocityPulseToken += 1;
	    const token = bot.velocityPulseToken;
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    const sent = safeSendVelocity(dx, dy, true);
	    const pulseMs = Number(action?.precisionPulseMs || 0);
	    const canPulse = pulseMs > 0
	      && (dx || dy)
	      && (action?.kind === 'coin' || action?.kind === 'seek-coin');
	    if (canPulse) {
	      const pulseMaxMs = Math.max(110, Number(cfg.precisionPulseMaxMs || 260));
	      bot.velocityStopTimer = setTimeout(() => {
	        try {
	          if (bot.velocityPulseToken !== token) return;
	          bot.velocityStopTimer = 0;
	          stopMotionSafely('precision-pulse');
	        } catch (err) {
	          recordUnhandledTickError('precision-pulse', err);
	        }
	      }, clamp(Math.round(pulseMs), 20, pulseMaxMs));
	    }
	    return sent;
	  }

	  function aimAt(target) {
	    if (!target) return;
	    const x = Math.round(Number(target.x) || 0);
	    const y = Math.round(Number(target.y) || 0);
	    bot.lastAim = { x, y };
	    const nativeState = getNativeState();
	    if (nativeState) {
	      nativeState.pointerWorld = { x, y };
	      nativeState.pointerSeen = true;
	    }
	  }

	  function sendNativeShoot(self, target) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    aimAt(target);
	    if (cfg.directWsControlEnabled && self && target) {
	      const startX = Math.round(Number(self.x) || 0);
	      const startY = Math.round(Number(self.y) || 0);
	      try {
	        native.ws.send('shoot ' + Math.round(Number(target.x) || 0) + ' ' + Math.round(Number(target.y) || 0) + ' ' + startX + ' ' + startY);
	        bot.control.lastMessageAt = Date.now();
	        bot.control.transport = 'native-page-direct-ws';
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'direct native shoot: ' + (err.message || String(err));
	      }
	    }
	    if (typeof shoot !== 'function') return false;
	    try {
	      Promise.resolve(shoot()).catch(err => {
	        bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      });
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      return false;
	    }
	  }

  function recordCombatShotAttempt(self, target, detail = {}) {
    if (!target) return;
    const at = Number(detail.at || Date.now());
    const perfNow = Number(detail.perfNow ?? now());
    const targetDistance = Number.isFinite(Number(target.distance))
      ? Number(target.distance)
      : (self ? dist(self, target) : NaN);
    bot.lastCombatShot = {
      at,
      perfNow: Math.round(perfNow),
      force: Boolean(detail.force),
      shootEveryMs: combatMetricRound(detail.shootEveryMs),
      sent: Boolean(detail.sent),
      blockedByCadence: Boolean(detail.blockedByCadence),
      cadenceRemainingMs: combatMetricRound(detail.cadenceRemainingMs),
      self: self ? {
        id: combatMetricEntityId(self),
        x: combatMetricRound(self.x),
        y: combatMetricRound(self.y),
        hp: combatMetricHp(self)
      } : null,
      target: {
        id: combatMetricEntityId(target),
        name: target.name || target.label || '',
        x: combatMetricRound(target.x),
        y: combatMetricRound(target.y),
        hp: combatMetricHp(target),
        distance: Number.isFinite(targetDistance) ? Math.round(targetDistance) : null
      }
    };
    recordNetworkQualityShot(self, target, { ...detail, at });
  }

  function shootAt(self, target, force = false, options = {}) {
    if (!target) return false;
    const t = now();
    const at = Date.now();
    const shootEveryMs = Math.max(0, Number(options.shootEveryMs ?? cfg.shootEveryMs) || 0);
    const cadenceRemainingMs = Math.max(0, shootEveryMs - (t - Number(bot.lastShotAt || 0)));
    if (!force && cadenceRemainingMs > 0) {
      recordCombatShotAttempt(self, target, {
        at,
        perfNow: t,
        force,
        shootEveryMs,
        sent: false,
        blockedByCadence: true,
        cadenceRemainingMs
      });
      return false;
    }
    bot.lastShotAt = t;
    aimAt(target);
    let sent = sendNativeShoot(self, target);
    const startX = Math.round(Number(self.x) || 0);
    const startY = Math.round(Number(self.y) || 0);
    if (!sent) sent = wsSend('shoot ' + Math.round(target.x) + ' ' + Math.round(target.y) + ' ' + startX + ' ' + startY);
    recordCombatShotAttempt(self, target, {
      at,
      perfNow: t,
      force,
      shootEveryMs,
      sent,
      blockedByCadence: false,
      cadenceRemainingMs: 0
    });
    return sent;
  }

  function directionTo(self, target, tolerance = 250) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance: hypot(dxRaw, dyRaw)
    };
  }

  ${coinMotionNumber.toString()}
  ${coinMotionTolerance.toString()}
  ${coinAxisApproachDirectionCore.toString()}
  ${coinPickupPrecisionPulseMsCore.toString()}
  ${coinAxisLockShouldHoldCore.toString()}
  ${coinNearApproachAxisCore.toString()}
  ${coinDirectionToCore.toString()}
  ${coinMotionMetaCore.toString()}

  function coinMotionCoreOptions(tolerance = cfg.coinPrecisionTolerance, extra = {}) {
    return {
      tolerance,
      coinPrecisionTolerance: cfg.coinPrecisionTolerance,
      coinAxisApproachMinDistance: cfg.coinAxisApproachMinDistance,
      coinAxisApproachRatio: cfg.coinAxisApproachRatio,
      coinAxisApproachLaneTolerance: cfg.coinAxisApproachLaneTolerance,
      coinPickupStopDistance: cfg.coinPickupStopDistance,
      coinPickupStopPulseMs: cfg.coinPickupStopPulseMs,
      coinPickupMicroDistance: cfg.coinPickupMicroDistance,
      coinPickupMicroPulseMs: cfg.coinPickupMicroPulseMs,
      coinPickupFineDistance: cfg.coinPickupFineDistance,
      coinPickupFinePulseMs: cfg.coinPickupFinePulseMs,
      coinPickupBrakeDistance: cfg.coinPickupBrakeDistance,
      coinPickupBrakePulseMs: cfg.coinPickupBrakePulseMs,
      coinPickupSweepDistance: cfg.coinPickupSweepDistance,
      coinPickupSweepPulseMs: cfg.coinPickupSweepPulseMs,
      coinPickupPulseMs: cfg.coinPickupPulseMs,
      coinPickupExactTolerance: cfg.coinPickupExactTolerance,
      coinPickupFailureSlowStepMs: cfg.coinPickupFailureSlowStepMs,
      coinPickupFailureMinPulseMs: cfg.coinPickupFailureMinPulseMs,
      coinApproachBrakeDistance: cfg.coinApproachBrakeDistance,
      coinAxisFlipTolerance: cfg.coinAxisFlipTolerance,
      coinApproachLockMs: cfg.coinApproachLockMs,
      nearCoinStuckDistance: cfg.nearCoinStuckDistance,
      ...extra
    };
  }

  function coinPickupFailureCount(id, t = now()) {
    if (!id && id !== 0) return 0;
    const failure = bot.coinFailures.get(String(id));
    if (!failure) return 0;
    const lastAt = Number(failure.lastAt || 0);
    if (lastAt && t - lastAt > Number(cfg.coinFailureDecayMs || 0)) return 0;
    return Math.max(0, Math.floor(Number(failure.count || 0)));
  }

  function coinPickupAttemptSlowCount(id, distance, t = now()) {
    if (!id && id !== 0) return 0;
    if (Number(distance) > Number(cfg.closeCoinStuckDistance || 0)) return 0;
    const progress = bot.coinProgress;
    if (!progress || String(progress.id) !== String(id)) return 0;
    const lastImprovedAt = Number(progress.lastImprovedAt || progress.startedAt || t);
    const everyMs = Math.max(1, Number(cfg.coinPickupAttemptSlowEveryMs || 2500));
    const maxCount = Math.max(0, Math.floor(Number(cfg.coinPickupAttemptSlowMaxCount || 0)));
    return clamp(Math.floor(Math.max(0, t - lastImprovedAt) / everyMs), 0, maxCount);
  }

  function applyCoinApproachLockUpdate(update) {
    if (!update) return;
    if (update.action === 'set' && update.lock) {
      bot.coinApproachLock = update.lock;
      return;
    }
    if (update.action === 'clear') {
      if (update.all || !bot.coinApproachLock || String(bot.coinApproachLock.id) === String(update.id)) {
        bot.coinApproachLock = null;
      }
    }
  }

  function coinDirectionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const distance = hypot(dxRaw, dyRaw);
    const t = now();
    const id = String(target.drop_id ?? target.id ?? '');
    const result = coinDirectionToCore(self, target, coinMotionCoreOptions(tolerance, {
      nowMs: t,
      lock: bot.coinApproachLock,
      pickupFailureCount: coinPickupFailureCount(id, t),
      pickupAttemptSlowCount: coinPickupAttemptSlowCount(id, distance, t)
    }));
    applyCoinApproachLockUpdate(result.lockUpdate);
    return result.direction;
  }

  function coinMotionMeta(dir) {
    return coinMotionMetaCore(dir);
  }

  function fleeDirection(self, threats) {
    let vx = 0;
    let vy = 0;
    for (const t of threats) {
      const d = Math.max(1, dist(self, t));
      const weight = (cfg.dangerRadius - Math.min(cfg.dangerRadius, d) + 600) / d;
      vx += (Number(self.x) - Number(t.x)) * weight / d;
      vy += (Number(self.y) - Number(t.y)) * weight / d;
    }
    const nearest = threats[0] || null;
    let dx = Math.abs(vx) > 0.02 ? Math.sign(vx) : 0;
    let dy = Math.abs(vy) > 0.02 ? Math.sign(vy) : 0;
    if (!(dx || dy) && nearest) {
      dx = Math.sign(Number(self.x) - Number(nearest.x)) || 0;
      dy = Math.sign(Number(self.y) - Number(nearest.y)) || 0;
    }
    return {
      dx,
      dy,
      score: hypot(vx, vy)
    };
  }

  function lockedFleeDirection(self, threats, reason) {
    const t = now();
    const ids = threats.slice(0, 4).map(item => String(item.user_id ?? item.id ?? ''));
    if (bot.fleeLock && t < bot.fleeLock.until && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      const previousIds = new Set(bot.fleeLock.threatIds || []);
      const overlaps = ids.some(id => previousIds.has(id));
      if (bot.fleeLock.reason === reason && (overlaps || threats.length)) {
        return { dx: bot.fleeLock.dx, dy: bot.fleeLock.dy, score: bot.fleeLock.score || 0, locked: true };
      }
    }

    const flee = fleeDirection(self, threats);
    if (!(flee.dx || flee.dy) && bot.fleeLock && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      flee.dx = bot.fleeLock.dx;
      flee.dy = bot.fleeLock.dy;
    }
    bot.fleeLock = {
      dx: flee.dx,
      dy: flee.dy,
      score: flee.score,
      reason,
      threatIds: ids,
      until: t + cfg.fleeLockMs
    };
    return { ...flee, locked: false };
  }

  function actionMovesTowardThreat(self, threat, action) {
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    if (!(dx || dy)) return false;
    const tx = Number(threat.x) - Number(self.x);
    const ty = Number(threat.y) - Number(self.y);
    return dx * tx + dy * ty > 0;
  }

  function isShortSafeCoinAction(action) {
    if (action?.kind !== 'coin') return false;
    const distance = Number(action.target?.distance ?? action.distance ?? Infinity);
    return Number.isFinite(distance) && distance <= cfg.activeReturnBlockCoinPassDistance;
  }

  function returnBlockRadius(threat) {
    const limit = Math.max(0, Number(cfg.activeAvoidMaxDistance || 0) || Infinity);
    return Math.min(limit, threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin);
  }

  function returnBlockExitRadius(threat) {
    return returnBlockRadius(threat) + cfg.activeReturnBlockExitMargin;
  }

  function returnBlockResumeRadius(threat) {
    return returnBlockExitRadius(threat) + cfg.activeReturnBlockResumeMargin;
  }

  function returnBlockSuppressRadius(threat) {
    return returnBlockResumeRadius(threat) + cfg.activeReturnBlockClearMargin;
  }

  function hasReturnBlockThreat(activeThreats) {
    return Boolean(pickReturnBlockPressure(activeThreats));
  }

  function markReturnBlockPressure(threat, force = false) {
    if (!threat) return;
    bot.returnBlockRecentThreatId = threatKey(threat);
    if (force || threat.distance <= returnBlockSuppressRadius(threat)) {
      bot.returnBlockCooldownUntil = Math.max(Number(bot.returnBlockCooldownUntil || 0), now() + cfg.returnBlockCooldownMs);
    }
  }

  function pickReturnBlockPressure(activeThreats) {
    const t = now();
    const recentId = bot.returnBlockRecentThreatId || bot.returnBlockLock?.id || '';
    if (recentId) {
      const recent = activeThreats.find(threat => threatKey(threat) === String(recentId));
      if (recent && recent.distance <= returnBlockSuppressRadius(recent)) {
        return recent;
      }
      if (t >= Number(bot.returnBlockCooldownUntil || 0)) {
        bot.returnBlockRecentThreatId = '';
      }
    }
    return activeThreats.find(e => e.distance <= returnBlockSuppressRadius(e)) || null;
  }

  function returnBlockScanDirection(self, activeThreats, nearbyHumans) {
    const t = now();
    const threat = pickReturnBlockPressure(activeThreats) || activeThreats[0] || null;
    const key = threatKey(threat);
    const locked = bot.returnBlockScan;
    if (locked && t < Number(locked.until || 0) && (locked.dx || locked.dy)) {
      const moved = Math.hypot(Number(self.x) - Number(locked.x || self.x), Number(self.y) - Number(locked.y || self.y));
      const stale = t - Number(locked.startedAt || t) >= cfg.returnBlockScanStuckMs && moved < cfg.returnBlockScanStuckDistance;
      if (!stale && (!key || String(locked.threatId || '') === key)) {
        return { dx: locked.dx, dy: locked.dy, locked: true, threat };
      }
    }

    const awayX = threat ? Math.sign(Number(self.x) - Number(threat.x)) : 0;
    const awayY = threat ? Math.sign(Number(self.y) - Number(threat.y)) : 0;
    const phase = Math.floor(t / cfg.returnBlockScanHeadingMs) % 8;
    const pattern = [
      { dx: -awayY, dy: awayX },
      { dx: awayY, dy: -awayX },
      { dx: awayX, dy: 0 },
      { dx: 0, dy: awayY },
      { dx: awayX, dy: awayY },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const candidates = pattern
      .map((item, index) => ({ dx: Math.sign(item.dx || 0), dy: Math.sign(item.dy || 0), index }))
      .filter(item => item.dx || item.dy)
      .filter(item => !threat || !actionMovesTowardThreat(self, threat, item));
    const scored = candidates.map(item => {
      let score = item.index === phase ? 500 : 0;
      if (threat) {
        const tx = Number(self.x) - Number(threat.x);
        const ty = Number(self.y) - Number(threat.y);
        score += item.dx * tx + item.dy * ty >= 0 ? 200 : -1000;
      }
      for (const human of (nearbyHumans || []).slice(0, 6)) {
        const hx = Number(self.x) - Number(human.x);
        const hy = Number(self.y) - Number(human.y);
        score += item.dx * hx + item.dy * hy >= 0 ? 5 : -20;
      }
      if (locked && item.dx === -Number(locked.dx || 0) && item.dy === -Number(locked.dy || 0)) score -= 30;
      return { ...item, score };
    }).sort((a, b) => b.score - a.score);
    const next = scored[0] || { dx: awayX || 1, dy: awayY || 0, score: 0 };
    bot.returnBlockScan = {
      threatId: key,
      dx: next.dx,
      dy: next.dy,
      x: Number(self.x) || 0,
      y: Number(self.y) || 0,
      startedAt: t,
      until: t + cfg.returnBlockScanHeadingMs
    };
    return { dx: next.dx, dy: next.dy, locked: false, threat };
  }

  function buildReturnBlockScanAction(self, activeThreats, nearbyHumans) {
    const dir = returnBlockScanDirection(self, activeThreats, nearbyHumans);
    const threat = dir.threat || activeThreats[0] || null;
    markReturnBlockPressure(threat);
    return {
      kind: 'patrol',
      reason: 'return-block-lateral-scan',
      dx: dir.dx,
      dy: dir.dy,
      locked: dir.locked,
      threats: threat ? [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }] : []
    };
  }

  function threatKey(threat) {
    return String(threat?.user_id ?? threat?.id ?? '');
  }

  function mergeThreatLists(...lists) {
    const merged = [];
    const seen = new Set();
    for (const list of lists) {
      for (const threat of list || []) {
        if (!threat) continue;
        const key = threatKey(threat) || ('xy:' + Math.round(Number(threat.x) || 0) + ':' + Math.round(Number(threat.y) || 0));
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(threat);
      }
    }
    return merged.sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity));
  }

  function pickReturnBlockThreat(self, activeThreats, action) {
    const lock = bot.returnBlockLock;
    if (lock?.id) {
      const locked = activeThreats.find(threat => threatKey(threat) === String(lock.id));
      if (locked && locked.distance <= returnBlockExitRadius(locked)) {
        return { threat: locked, locked: true, mode: 'exit' };
      }
      if (locked && locked.distance <= returnBlockResumeRadius(locked) && actionMovesTowardThreat(self, locked, action)) {
        return { threat: locked, locked: true, mode: 'resume-guard' };
      }
      bot.returnBlockLock = null;
    }
    const threat = activeThreats.find(e => e.distance <= returnBlockExitRadius(e));
    if (!threat) {
      const returnThreat = activeThreats.find(e => e.distance <= returnBlockResumeRadius(e) && actionMovesTowardThreat(self, e, action));
      if (!returnThreat) return null;
      bot.returnBlockLock = { id: threatKey(returnThreat), startedAt: now() };
      return { threat: returnThreat, locked: false, mode: 'resume-guard' };
    }
    bot.returnBlockLock = { id: threatKey(threat), startedAt: now() };
    return { threat, locked: false, mode: 'exit' };
  }

  function blockThreatReturnAction(self, activeThreats, action) {
    if (action?.ignoreReturnBlock || action?.combat || action?.kind === 'leave') return action;
    if (isFullHp(self) && !(activeThreats || []).some(isInvulnerableActive)) return action;
    if (!action || action.kind === 'flee' || action.kind === 'recover' || action.kind === 'wait' || action.kind === 'idle') return action;
    const picked = pickReturnBlockThreat(self, activeThreats, action);
    if (!picked) return action;
    const threat = picked.threat;
    if (isShortSafeCoinAction(action) && !actionMovesTowardThreat(self, threat, action)) return action;
    if (action.reason === 'return-block-lateral-scan'
      && threat.distance > returnBlockRadius(threat)
      && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      return action;
    }
    if (threat.distance > threat.threatRadius && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      const dir = returnBlockScanDirection(self, [threat], []);
      return {
        kind: 'patrol',
        reason: 'return-block-lateral-scan',
        dx: dir.dx,
        dy: dir.dy,
        locked: dir.locked,
        blockedAction: {
          kind: action.kind,
          reason: action.reason || '',
          target: action.target || null,
          returnBlockMode: picked.mode || ''
        },
        threats: [{
          id: threat.user_id,
          name: threat.name,
          d: Math.round(threat.distance),
          drop: threat.drop,
          speed: Math.round(threat.speed),
          moving: Boolean(threat.moving),
          r: Math.round(returnBlockRadius(threat)),
          exitR: Math.round(returnBlockExitRadius(threat)),
          resumeR: Math.round(returnBlockResumeRadius(threat))
        }]
      };
    }
    markReturnBlockPressure(threat, true);
    const flee = lockedFleeDirection(self, [threat], 'active-threat-return-block');
    return {
      kind: 'flee',
      reason: 'active-threat-return-block',
      dx: flee.dx,
      dy: flee.dy,
      locked: flee.locked,
      blockedAction: {
        kind: action.kind,
        reason: action.reason || '',
        target: action.target || null,
        returnBlockLocked: Boolean(picked.locked),
        returnBlockMode: picked.mode || ''
      },
      threats: [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }]
    };
  }

  function classify(self) {
    const nativeEntities = getNativeEntityList();
    const nativeMeta = buildNativeEntityMeta(nativeEntities);
    const coinDrops = getCoins(self);
    const bullets = getBullets();
    const localSource = nativeMeta.available ? nativeEntities : [];
    const localEntities = (localSource || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id) && isAlive(e))
      .map(e => ({ ...e, native: Boolean(nativeMeta.available), snapshot: !nativeMeta.available || Boolean(e.snapshot) }));
    markRecentMovement(localEntities);
    const globalById = new Map();
    for (const entity of bot.globalState.entities || []) {
      if (Number(entity.user_id) === Number(self.user_id) || !isAlive(entity)) continue;
      if (!snapshotEntityAllowed(self, entity, nativeMeta)) continue;
      globalById.set(Number(entity.user_id), { ...entity, snapshot: true, native: false });
    }
    for (const entity of localEntities) {
      const previous = globalById.get(Number(entity.user_id)) || {};
      globalById.set(Number(entity.user_id), {
        ...previous,
        ...entity,
        native: Boolean(entity.native || previous.native),
        snapshot: Boolean(entity.snapshot || previous.snapshot)
      });
    }
    const entities = Array.from(globalById.values());
    const offensiveEntities = entities.filter(entityFreshEnoughForOffense);
    const attackableEntities = offensiveEntities.filter(e => !isWhitelistedTarget(e));
    const realtimeEntities = attackableEntities.filter(e => e.native && !e.minimapOnly);
    const activeThreats = entities
      .filter(e => isCurrentlyActive(e))
      .map(e => decorateActiveThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const inactiveTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const realtimeInactiveTargets = realtimeEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const coins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.coinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const allCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeCoins = allCoins.filter(c => !isSnapshotOnlyCoin(c));
    const realtimeNearCoins = coins.filter(c => !isSnapshotOnlyCoin(c));
    const globalTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: true }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const realtimeGlobalTargets = realtimeEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: false }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const minimapDropTargets = (snapshotDataFreshEnough() ? (bot.globalState.minimap?.points || []) : [])
      .filter(p => Number(p.u) !== Number(self.user_id))
      .map(p => ({
        user_id: p.u,
        x: Number(p.x),
        y: Number(p.y),
        drop: Number(p.d || 0),
        distance: dist(self, p),
        global: true,
        minimapOnly: true
      }))
      .filter(p => !isWhitelistedTarget(p))
      .filter(p => p.drop > 0 && p.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const globalCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.globalCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeGlobalCoins = globalCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const patrolCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.patrolCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimePatrolCoins = patrolCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const scanCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.scanCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const realtimeScanCoins = scanCoins.filter(c => !isSnapshotOnlyCoin(c));
	    const nearbyHumans = entities
	      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
	      .sort((a, b) => a.distance - b.distance);
    const combatCandidateRange = combatTargetCandidateRange(self);
    const combatTargets = attackableEntities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.native)
      .filter(e => e.distance <= combatCandidateRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (isCurrentlyActive(a) !== isCurrentlyActive(b)) return isCurrentlyActive(a) ? -1 : 1;
        return a.distance - b.distance;
      });
    const combatDodgeOnlyCandidateRangeValue = combatDodgeOnlyCandidateRange(self);
    const combatDodgeOnlyTargets = attackableEntities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.native)
      .filter(e => e.distance > combatCandidateRange)
      .filter(e => e.distance <= combatDodgeOnlyCandidateRangeValue)
      .map(e => ({ ...e, combatDodgeOnlyCandidate: true }))
      .sort((a, b) => a.distance - b.distance);
	    const snapshotCoins = allCoins.filter(c => isSnapshotOnlyCoin(c) && c.distance <= cfg.snapshotCoinMaxDistance);
	    return {
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
	    };
	  }

  function summarizeOfflineThreat(entity) {
    if (!entity) return null;
    return {
      id: entity.user_id ?? entity.id ?? null,
      name: entity.name || '',
      distance: Number.isFinite(Number(entity.distance)) ? Math.round(Number(entity.distance)) : null,
      drop: Number(entity.drop ?? dropValue(entity) ?? 0) || 0,
      speed: Number.isFinite(Number(entity.speed ?? speed(entity))) ? Math.round(Number(entity.speed ?? speed(entity))) : null,
      moving: Boolean(entity.moving || speed(entity) >= cfg.activeSpeedMin),
      mode: entity.current_join_mode || ''
    };
  }

  function assessOfflineSafety(self) {
    if (!self || !isAlive(self)) {
      return { unsafe: true, reason: 'no-self', nearestActive: null, nearestHuman: null };
    }
    const { activeThreats, nearbyHumans, combatTargets, bullets } = classify(self);
    const bullet = incomingBulletThreat(self, null, bullets);
    const dangerThreat = activeThreats.find(entity => entity.distance <= entity.threatRadius) || null;
    const cautionThreat = activeThreats.find(entity => entity.distance <= entity.cautionRadius + cfg.activeCautionExitMargin) || null;
    const returnBlockThreat = activeThreats.find(entity => entity.distance <= returnBlockRadius(entity)) || null;
    const combatThreat = combatTargets.find(entity => !isAfkProfitTarget(entity) && entity.distance <= cfg.combatAttackRange) || null;
    const passiveDangerRadius = Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0));
    const closeHuman = nearbyHumans.find(entity => entity.distance <= passiveDangerRadius) || null;
    const injury = bot.pendingInjuryLeave;
    const recentInjury = injury && Date.now() - Number(injury.at || 0) <= Math.max(3000, cfg.combatStrafeLockMs * 4);
    const picked = dangerThreat || bullet || recentInjury || combatThreat || cautionThreat || returnBlockThreat || closeHuman || null;
    const reason = dangerThreat ? 'active threat in danger range'
      : bullet ? 'incoming bullet'
        : recentInjury ? 'recent injury'
          : combatThreat ? 'combat target nearby'
            : cautionThreat ? 'active threat in caution range'
              : returnBlockThreat ? 'active return-block pressure'
                : closeHuman ? 'near player'
                  : 'clear';
    const safety = {
      unsafe: Boolean(picked),
      reason,
      passiveDangerRadius,
      nearestActive: summarizeOfflineThreat(activeThreats[0]),
      nearestHuman: summarizeOfflineThreat(nearbyHumans[0]),
      threat: summarizeOfflineThreat(picked && picked.user_id !== undefined ? picked : null),
      incomingBullet: bullet ? {
        id: bullet.id,
        ownerId: bullet.ownerId,
        distance: Math.round(Number(bullet.distance || 0)),
        laneDistance: Math.round(Number(bullet.laneDistance || 0))
      } : null,
      recentInjury: recentInjury ? injury : null
    };
    bot.lastOfflineSafety = safety;
    return safety;
  }

  function pickActiveCombatWaitThreat(self, activeThreats, bullets = []) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    return (activeThreats || [])
      .filter(threat => !isWhitelistedTarget(threat) && !isInvulnerable(threat))
      .filter(threat => hasCombatActivitySignal(threat))
      .filter(threat => !activeCombatRequiresThreatEvidence(self, threat) || activeCombatThreatensSelf(threat, incomingOwnerId, unknownIncoming))
      .filter(threat => {
        const distance = Number(threat.distance || 0);
        if (!(distance > attackRange)) return distance <= attackRange;
        return distance <= dodgeRange && (incomingOwnerMatchesTarget(threat, incomingOwnerId) || (unknownIncoming && isFiringEntity(threat)));
      })
      .sort((a, b) => {
        if (hasCombatActivitySignal(a) !== hasCombatActivitySignal(b)) return hasCombatActivitySignal(a) ? -1 : 1;
        if (isFiringEntity(a) !== isFiringEntity(b)) return isFiringEntity(a) ? -1 : 1;
        return Number(a.distance || Infinity) - Number(b.distance || Infinity);
      })[0] || null;
  }

  function activeCombatThreatWaitAction(threat) {
    return {
      kind: 'wait',
      reason: 'combat-active-threat-wait',
      dx: 0,
      dy: 0,
      shoot: false,
      forceShoot: false,
      activeThreat: threat ? {
        id: threat.user_id ?? threat.id ?? null,
        name: threat.name || '',
        distance: Math.round(Number(threat.distance || 0)),
        drop: Number(threat.drop || 0),
        speed: Math.round(Number(threat.speed || 0)),
        moving: Boolean(threat.moving),
        firing: isFiringEntity(threat),
        mode: threat.current_join_mode || threat.mode || ''
      } : null
    };
  }

	  function coinThreatDangerRadius(threat) {
	    const base = Number(threat?.coinDangerRadius ?? cfg.coinDangerRadius);
	    if (isInvulnerableActive(threat)) return Math.max(base, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	    return base;
	  }

	  function coinHeadingBlockedByInvulnerableThreat(self, coin, threat) {
	    if (!self || !coin || !isInvulnerableActive(threat)) return false;
	    const coinDx = Number(coin.x) - Number(self.x);
	    const coinDy = Number(coin.y) - Number(self.y);
	    const threatDx = Number(threat.x) - Number(self.x);
	    const threatDy = Number(threat.y) - Number(self.y);
	    const coinDistance = Math.hypot(coinDx, coinDy);
	    const threatDistance = Math.hypot(threatDx, threatDy);
	    const minCoinDistance = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingMinDistance || 0));
	    const blockRadius = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingBlockRadius || 0));
	    if (!(coinDistance >= minCoinDistance) || !(threatDistance > 0) || threatDistance > blockRadius) return false;
	    const cos = (coinDx * threatDx + coinDy * threatDy) / Math.max(1, coinDistance * threatDistance);
	    if (cos < Number(cfg.invulnerableActiveCoinHeadingCosMin || 0)) return false;
	    const lane = Math.abs(coinDx * threatDy - coinDy * threatDx) / Math.max(1, threatDistance);
	    return lane <= Math.max(0, Number(cfg.invulnerableActiveCoinHeadingLaneRadius || 0))
	      && coinDistance <= threatDistance + Math.max(0, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
	  }

	  function coinBlockedByThreat(self, coin, threat) {
	    const threatRadius = coinThreatDangerRadius(threat);
	    if (dist(coin, threat) <= threatRadius) {
	      if (!self) return true;
	      const coinDistance = dist(self, coin);
	      const threatDistance = Number.isFinite(Number(threat?.distance)) ? Number(threat.distance) : dist(self, threat);
	      if (!Number.isFinite(coinDistance) || !Number.isFinite(threatDistance)) return true;
	      if (coinDistance <= Math.max(0, Number(cfg.activeReturnBlockCoinPassDistance || 0))) return false;
	      if (isInvulnerableActive(threat)) return true;
	      const coinDx = Number(coin.x) - Number(self.x);
	      const coinDy = Number(coin.y) - Number(self.y);
	      const threatDx = Number(threat.x) - Number(self.x);
	      const threatDy = Number(threat.y) - Number(self.y);
	      const towardThreat = (coinDx * threatDx + coinDy * threatDy) > 0;
	      if (!towardThreat) return false;
	      const stopGap = threatDistance - coinDistance;
	      const stopBuffer = Math.max(0, Number(threat?.threatRadius || cfg.dangerRadius || 0));
	      if (stopGap <= stopBuffer) return true;
	    }
	    return coinHeadingBlockedByInvulnerableThreat(self, coin, threat);
	  }

	  function coinDiagnosticsNearDistance() {
	    return Math.max(0, Number(cfg.coinDiagnosticsNearDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || cfg.nearCoinPriorityDistance || cfg.coinMaxDistance || 0));
	  }

	  function coinDiagnosticsLimit() {
	    return Math.max(1, Math.round(Number(cfg.coinDiagnosticsMaxEntries || 8) || 8));
	  }

	  ${coinDiagnosticsSummary.toString()}

	  function coinThreatDiagnostics(threat) {
	    if (!threat) return null;
	    return {
	      id: threat.user_id ?? threat.id ?? null,
	      name: threat.name || '',
	      distance: Number.isFinite(Number(threat.distance)) ? Math.round(Number(threat.distance)) : null,
	      radius: Math.round(coinThreatDangerRadius(threat)),
	      invulnerable: isInvulnerable(threat),
	      active: isCurrentlyActive(threat)
	    };
	  }

	  ${summarizeCoinDiagnosticsList.toString()}

	  ${addCoinFilterDiagnostic.toString()}

	  ${buildCoinDiagnostics.toString()}

	  function recordCoinFilterDiagnostic(coin, reason, detail = {}) {
	    addCoinFilterDiagnostic(bot.coinDiagnostics, coin, reason, {
	      nearDistance: coinDiagnosticsNearDistance(),
	      limit: coinDiagnosticsLimit(),
	      detail
	    });
	  }

	  function coinStaminaAffordableWithDiagnostic(self, coin, staminaCost = opportunityCoinStaminaCost(coin), reason = 'stamina-unaffordable') {
	    const affordable = opportunityStaminaAffordable(self, staminaCost);
	    if (!affordable) recordCoinFilterDiagnostic(coin, reason, { staminaCost: Math.round(Number(staminaCost) || 0) });
	    return affordable;
	  }

	  function attachCoinDiagnostics(action) {
	    if (!action || !bot.coinDiagnostics) return action;
	    return {
	      ...action,
	      coinDiagnostics: safeJsonClone(bot.coinDiagnostics) || bot.coinDiagnostics
	    };
	  }

	  function safeCoinCandidates(coins, activeThreats, maxDistance, self = null) {
	    const t = now();
	    for (const [id, until] of bot.ignoredCoins.entries()) {
	      if (until <= t) bot.ignoredCoins.delete(id);
	    }
	    return (coins || []).map(c => ({
	      ...c,
	      distance: Number.isFinite(Number(c?.distance)) ? Number(c.distance) : (self ? dist(self, c) : Number(c?.distance))
	    })).filter(c => {
	      if (!(c.distance <= maxDistance)) {
	        if (Number(maxDistance || 0) >= coinDiagnosticsNearDistance()) {
	          recordCoinFilterDiagnostic(c, 'max-distance', { maxDistance: Math.round(Number(maxDistance || 0)) });
	        }
	        return false;
	      }
	      const ignoredUntil = bot.ignoredCoins.get(String(c.drop_id));
	      if (ignoredUntil) {
	        recordCoinFilterDiagnostic(c, 'ignored', { remainingMs: Math.max(0, Math.round(Number(ignoredUntil || 0) - t)) });
	        return false;
	      }
	      const blockingThreat = (activeThreats || []).find(threat => coinBlockedByThreat(self, c, threat));
	      if (blockingThreat) {
	        recordCoinFilterDiagnostic(c, 'threat-blocked', { threat: coinThreatDiagnostics(blockingThreat) });
	        return false;
	      }
	      return true;
	    })
	      .sort(compareCoinOpportunity);
	  }

	  function pickRealtimeLocalCoin(self, coins, activeThreats) {
	    const radius = snapshotCoinLocalSuppressRadius();
	    if (!(radius > 0)) return null;
	    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius, self)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
	  }

	  function nearestRealtimeCoinWithin(self, allCoins, activeThreats, maxDistance) {
	    if (!(Number(maxDistance) > 0)) return null;
	    return safeCoinCandidates((allCoins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance, self)
	      .filter(coin => Number(coin.amount || 0) > 0)
	      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))
	      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
	        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
	  }

	  function fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, fieldCoin = null) {
	    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
	    if (!(blockDistance > 0)) return false;
	    const nearby = nearestRealtimeCoinWithin(self, allCoins, activeThreats, blockDistance);
	    if (!nearby) return false;
	    if (fieldCoin) {
	      const nearbyId = nearby.drop_id ?? nearby.id;
	      const fieldId = fieldCoin.drop_id ?? fieldCoin.id;
	      if (nearbyId !== undefined && fieldId !== undefined && String(nearbyId) === String(fieldId)) return false;
	      const nearbyDistance = Number(nearby.distance ?? dist(self, nearby));
	      const fieldDistance = Number(fieldCoin.distance ?? dist(self, fieldCoin));
	      if (Number.isFinite(nearbyDistance) && Number.isFinite(fieldDistance) && nearbyDistance >= fieldDistance) return false;
	    }
	    return true;
	  }

	  function pickCoin(self, coins, activeThreats, maxDistance) {
	    const candidates = safeCoinCandidates(coins, activeThreats, maxDistance, self);
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) return sticky;
    }
    return candidates[0];
  }

	  function pickCoinField(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance, self)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    const buildFieldItem = coin => {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) return null;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      return {
        ...coin,
        fieldMigration: true,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
    };
    const current = bot.opportunityChoice;
    if (current?.key && current.reason === 'migrate-to-known-field' && now() < Number(current.until || 0)) {
      const heldCoin = candidates.find(c => String(c.drop_id) === String(current.id));
      const held = heldCoin ? buildFieldItem(heldCoin) : null;
      if (held && !fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, held)) return held;
    }
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const item = buildFieldItem(coin);
      if (!item) continue;
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance, self)
      .filter(c => c.distance >= cfg.distantCoinMinDistance)
      .filter(c => coinStaminaAffordableWithDiagnostic(self, c));
    if (!candidates.length) return null;
    return candidates[0];
  }

  function highValueCoinPriorityAmount() {
    const value = Number(cfg.highValueCoinPriorityAmount ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_AMOUNT);
  }

  function highValueCoinPriorityHealthyHp() {
    const value = Number(cfg.highValueCoinPriorityHealthyHp ?? cfg.combatLowHpLeaveThreshold ?? OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
    return Math.max(1, Number.isFinite(value) ? value : OPPORTUNITY_CONSTANTS.HIGH_VALUE_COIN_PRIORITY_HEALTHY_HP);
  }

  function pickHighValueVisibleCoin(self, coins, activeThreats, options = {}) {
    const minAmount = highValueCoinPriorityAmount();
    const maxDistance = Math.max(0, Number(cfg.globalCoinMaxDistance || cfg.opportunityVisibleDistance || cfg.coinMaxDistance || 0));
    const threats = options.ignoreThreats ? [] : activeThreats;
    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), threats, maxDistance, self)
      .filter(coin => Number(coin.amount || 0) >= minAmount)
      .filter(coin => coinStaminaAffordableWithDiagnostic(self, coin))[0] || null;
  }

  function nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId = null, unknownIncoming = false) {
    if (!threat || isWhitelistedTarget(threat)) return false;
    const distance = Number(threat.distance ?? Infinity);
    const radius = Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(threat.cautionRadius || 0) + Number(cfg.activeCautionExitMargin || 0),
      isInvulnerable(threat) ? Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) : 0
    );
    if (!Number.isFinite(distance) || distance > radius) return false;
    if (isInvulnerable(threat)) return false;
    if (isLowValueActiveCombatTarget(threat)) return lowValueActiveThreatensSelf(threat, incomingOwnerId, unknownIncoming);
    return hasCombatActivitySignal(threat) || isCurrentlyActive(threat) || isFiringEntity(threat);
  }

  function canPrioritizeHighValueVisibleCoin(self, coin, context = {}) {
    if (!coin) return false;
    const hp = hpValue(self);
    const healthyHp = highValueCoinPriorityHealthyHp();
    if (hp >= healthyHp) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return false;
    if (context.engagedCombatTarget || context.defensiveCombatTarget) return false;
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    return !(context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId, unknownIncoming));
  }

  function highValueVisibleCoinPriorityNeeded(self, context = {}) {
    if (context.recovery || context.engagedCombatTarget || context.defensiveCombatTarget) return true;
    if ((context.avoidanceThreats || []).length) return true;
    const incoming = incomingBulletThreat(self, null, context.bullets || []);
    if (incoming) return true;
    return false;
  }

  function recentCombatInjuryActive() {
    const injury = bot.pendingInjuryLeave;
    return injury && Date.now() - Number(injury.at || 0) <= Math.max(1000, cfg.combatStrafeLockMs * 3);
  }

  function lowValueActiveDropMax() {
    const value = Number(cfg.combatLowValueActiveDropMax ?? 4);
    return Math.max(0, Number.isFinite(value) ? value : 4);
  }

  function isLowValueActiveCombatTarget(target) {
    if (!target || isAfkProfitTarget(target)) return false;
    return hasCombatActivitySignal(target) && Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax();
  }

  function proactiveActiveKillStaminaBudgetMs() {
    const value = Number(cfg.combatProactiveActiveKillStaminaBudgetMs ?? 100000);
    return Math.max(0, Number.isFinite(value) ? value : 100000);
  }

  function proactiveActiveCombatStaminaAffordable(self) {
    const required = proactiveActiveKillStaminaBudgetMs();
    if (!(required > 0)) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || budget >= required;
  }

  function activeCombatBudgetBlocked(self, target) {
    if (!target || isAfkProfitTarget(target) || !hasCombatActivitySignal(target)) return false;
    if (Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax()) return false;
    return !proactiveActiveCombatStaminaAffordable(self);
  }

  function activeCombatRequiresThreatEvidence(self, target) {
    return isLowValueActiveCombatTarget(target) || activeCombatBudgetBlocked(self, target);
  }

  function incomingOwnerMatchesTarget(target, incomingOwnerId) {
    if (!target || incomingOwnerId === null || incomingOwnerId === undefined) return false;
    const targetId = target.user_id ?? target.id;
    return targetId !== null && targetId !== undefined && String(targetId) === String(incomingOwnerId);
  }

  function activeCombatThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (unknownIncoming && isFiringEntity(target)) return true;
    return Boolean(recentCombatInjuryActive() && (isFiringEntity(target) || isCurrentlyActive(target)));
  }

  function lowValueActiveThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!isLowValueActiveCombatTarget(target)) return true;
    return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
  }

  function combatDodgeThreatRange() {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    return attackRange + Math.max(0, Number(cfg.combatDodgeRangeBuffer || 0));
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isCurrentlyActive(target) ? 200000000 : 0)
      + (recentCombatInjuryActive() && isCurrentlyActive(target) ? 100000000 : 0)
      + (isJoinModeActive(target) ? 75000000 : 0)
      + (isCurrentlyActive(target) ? 50000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }

  function isDefensiveCombatTarget(self, target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkProfitTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (activeCombatRequiresThreatEvidence(self, target)) return activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming);
    if (isFiringEntity(target)) return true;
    if (isCurrentlyActive(target)) return true;
    if (unknownIncoming && isCurrentlyActive(target)) return true;
    return Boolean(recentCombatInjuryActive() && isCurrentlyActive(target));
  }

  function isProfitableCombatTarget(self, target) {
    return Boolean(target
      && !isWhitelistedTarget(target)
      && !isAfkProfitTarget(target)
      && !isInvulnerable(target)
      && isCurrentlyActive(target)
      && Number(target.drop || 0) > lowValueActiveDropMax()
      && proactiveActiveCombatStaminaAffordable(self));
  }
  function combatHpGapDisadvantaged(self, target) {
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    if (knownSelfHp === null || knownTargetHp === null) return false;
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    return Number(knownSelfHp) > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap;
  }
  function profitCombatDisadvantaged(self, target) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    return (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp)
      || combatHpGapDisadvantaged(self, target);
  }

  function pickCombatTarget(self, combatTargets, bullets, options = {}) {
    if (!combatTargets.length) return null;
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (incoming?.ownerId !== null && incoming?.ownerId !== undefined) {
      const shooter = combatTargets.find(target => String(target.user_id) === String(incoming.ownerId) && !isWhitelistedTarget(target) && !isInvulnerable(target));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = combatTargets
      .filter(target => !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target))
      .filter(target => !target.combatDodgeOnlyCandidate || incomingOwnerMatchesTarget(target, incomingOwnerId) || (unknownIncoming && isFiringEntity(target)))
      .filter(target => !combatRetreatIgnoreActive(target));
    if (!eligibleTargets.length) return null;
    const defensiveTargets = eligibleTargets
      .filter(target => isDefensiveCombatTarget(self, target, incomingOwnerId, unknownIncoming))
      .sort((a, b) => combatTargetPriority(b, incomingOwnerId, unknownIncoming) - combatTargetPriority(a, incomingOwnerId, unknownIncoming));
    if (options.mode === 'defensive') return defensiveTargets[0] ? { ...defensiveTargets[0], combatIntent: 'defensive' } : null;
    const profitableTargets = eligibleTargets
      .filter(target => isProfitableCombatTarget(self, target))
      .filter(target => options.mode !== 'profit' || !profitCombatDisadvantaged(self, target))
      .sort((a, b) => {
        const scoreA = scoreEnemyOpportunity(a) ?? -Infinity;
        const scoreB = scoreEnemyOpportunity(b) ?? -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.distance - b.distance;
      });
    if (options.mode === 'profit') return profitableTargets[0] ? { ...profitableTargets[0], combatIntent: 'profit' } : null;
    const sticky = bot.lastTarget?.kind === 'enemy' && now() - bot.lastTargetAt < cfg.targetStickMs
      ? [...defensiveTargets, ...profitableTargets].find(target => String(target.user_id) === String(bot.lastTarget.id))
      : null;
    if (sticky) return sticky;
    if (defensiveTargets[0]) return { ...defensiveTargets[0], combatIntent: 'defensive' };
    if (isFullHp(self) && profitableTargets[0]) return { ...profitableTargets[0], combatIntent: 'profit' };
    return null;
  }

  function combatEngageGraceRange() {
    return Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(cfg.combatDisengageRange || 0),
      Number(cfg.combatEngageGraceRange || 0)
    );
  }

  function combatTargetCandidateRange(self) {
    return Number(cfg.combatAttackRange || 0);
  }

  function combatDodgeOnlyCandidateRange(self) {
    return combatDodgeThreatRange();
  }

  function combatEngagedCandidate(self, raw) {
    if (!raw || !entityFreshEnoughForOffense(raw) || !isAlive(raw) || isWhitelistedTarget(raw) || isInvulnerable(raw)) return null;
    return {
      ...raw,
      distance: dist(self, raw),
      drop: dropValue(raw),
      speed: speed(raw),
      hp: combatHpValue(raw),
      knownHp: knownHpValue(raw)
    };
  }

  function pickEngagedCombatTarget(self, combatTargets, entities, bullets = []) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    if (combatRetreatIgnoreActive({ id: engaged.id })) {
      clearCombatEngagement('target-retreating-ignore');
      return null;
    }
    const t = Date.now();
    const ageMs = Math.max(0, t - Number(engaged.at || 0));
    if (ageMs > Math.max(cfg.targetStickMs, cfg.combatEngageStickMs)) {
      clearCombatEngagement('expired');
      return null;
    }
    const target = (combatTargets || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    if (target && !isWhitelistedTarget(target) && !isInvulnerable(target)) {
      if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(target)) {
        clearCombatEngagement('afk-profit-target');
        return null;
      }
      const incoming = incomingBulletThreat(self, null, bullets);
      const incomingOwnerId = incoming?.ownerId;
      const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
      if (activeCombatRequiresThreatEvidence(self, target) && !activeCombatThreatensSelf(target, incomingOwnerId, unknownIncoming)) {
        clearCombatEngagement(isLowValueActiveCombatTarget(target) ? 'low-value-active-not-threatening' : 'active-combat-stamina-budget');
        return null;
      }
      return {
        ...target,
        combatIntent: 'engaged',
        combatEngagement: {
          ageMs: Math.round(ageMs),
          outOfRangeMs: 0,
          lastReason: engaged.reason || ''
        }
      };
    }
    const raw = (entities || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    const reengageTarget = combatEngagedCandidate(self, raw);
    const graceRange = combatEngageGraceRange();
    const activeReengage = Boolean(reengageTarget && (isCurrentlyActive(reengageTarget) || isFiringEntity(reengageTarget) || isMovingThreat(reengageTarget)));
    const lastInRangeAt = Number(engaged.lastInRangeAt || engaged.at || 0);
    const outOfRangeMs = Math.max(0, t - lastInRangeAt);
    const graceMs = Math.max(0, Number(cfg.combatEngageGraceMs || 0));
    const outOfRangeLimitMs = activeReengage
      ? Math.max(graceMs, Number(cfg.combatEngageStickMs || 0))
      : graceMs;
    if (!outOfRangeLimitMs || outOfRangeMs > outOfRangeLimitMs) {
      clearCombatEngagement('range-grace-expired');
      return null;
    }
    if (reengageTarget && reengageTarget.distance > graceRange) {
      clearCombatEngagement('combat-disengage-range');
      return null;
    }
    if (!reengageTarget) return null;
    if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(reengageTarget)) {
      clearCombatEngagement('afk-profit-target');
      return null;
    }
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (activeCombatRequiresThreatEvidence(self, reengageTarget) && !activeCombatThreatensSelf(reengageTarget, incomingOwnerId, unknownIncoming)) {
      clearCombatEngagement(isLowValueActiveCombatTarget(reengageTarget) ? 'low-value-active-not-threatening' : 'active-combat-stamina-budget');
      return null;
    }
    return {
      ...reengageTarget,
      combatIntent: 'reengage',
      combatEngagement: {
        ageMs: Math.round(ageMs),
        outOfRangeMs: Math.round(outOfRangeMs),
        graceRemainingMs: Math.max(0, Math.round(outOfRangeLimitMs - outOfRangeMs)),
        graceRange: Math.round(graceRange),
        activeReengage,
        outOfRangeLimitMs: Math.round(outOfRangeLimitMs),
        lastReason: engaged.reason || '',
        reengage: true
      }
    };
  }

  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
    if (!incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)) return false;
    const ownerId = defensiveTarget.incomingBullet.ownerId
      ?? defensiveTarget.incomingBullet.owner_id
      ?? defensiveTarget.incomingBullet.source_user_id
      ?? defensiveTarget.incomingBullet.user_id;
    if (ownerId === null || ownerId === undefined) return false;
    const defensiveId = defensiveTarget.user_id ?? defensiveTarget.id;
    const engagedId = engagedTarget.user_id ?? engagedTarget.id;
    return defensiveId !== null && defensiveId !== undefined
      && engagedId !== null && engagedId !== undefined
      && String(defensiveId) !== String(engagedId);
  }

  function incomingBulletRequiresTargetSwitch(incomingBullet) {
    if (!incomingBullet) return false;
    const distance = Number(incomingBullet.distance);
    const timeToImpactMs = Number(incomingBullet.timeToImpactMs);
    const switchDistance = Math.max(0, Number(cfg.combatTargetSwitchIncomingDistance || 0));
    const switchTime = Math.max(0, Number(cfg.combatTargetSwitchIncomingTimeMs || 0));
    if (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance) return true;
    if (switchTime > 0 && Number.isFinite(timeToImpactMs) && timeToImpactMs <= switchTime) return true;
    return false;
  }

  function pickOpportunisticShotTarget(self, entities) {
    const candidates = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(e => e.native)
      .filter(entityFreshEnoughForOffense)
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => attackWorthTaking(self, e) && !isInvulnerable(e))
      .filter(isAfkProfitTarget)
      .map(e => ({
        ...e,
        score: scoreEnemyOpportunity(e) ?? -Infinity,
        staminaCost: opportunityEnemyStaminaCost(e),
        estimatedShots: estimatedKillShots(e)
      }))
      .filter(e => opportunityStaminaAffordable(self, e.staminaCost))
      .sort((a, b) => {
        const stickyA = bot.attackHistory.some(item => String(item.id) === String(a.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        const stickyB = bot.attackHistory.some(item => String(item.id) === String(b.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        if (stickyA !== stickyB) return stickyA ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const target = candidates[0] || null;
    if (!target) return null;
    return {
      id: target.user_id,
      name: target.name || '',
      x: Number(target.x),
      y: Number(target.y),
      hp: combatHpValue(target),
      drop: target.drop,
      distance: Math.round(target.distance),
      score: Math.round(Number(target.score || 0)),
      staminaCost: Math.round(Number(target.staminaCost || 0)),
      estimatedShots: target.estimatedShots,
      mode: target.current_join_mode || '',
      reason: 'opportunistic-afk-drop-shot'
    };
  }

  function actionOpportunityScore(action) {
    const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
    if (Number.isFinite(explicit)) return explicit;
    const target = action?.target || {};
    if (['coin', 'seek-coin'].includes(action?.kind) && Number(target.amount || 0) > 0) {
      return scoreCoinOpportunity({
        amount: Number(target.amount || 0),
        distance: Number(target.distance ?? action?.distance ?? 0),
        opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
      });
    }
    return -Infinity;
  }

  function opportunisticShotBeatsAction(action, shot) {
    const shotScore = Number(shot?.score ?? scoreEnemyOpportunity(shot) ?? -Infinity);
    if (!Number.isFinite(shotScore)) return false;
    const actionScore = actionOpportunityScore(action);
    const minRatio = Math.max(0, Number(cfg.opportunisticShotMinScoreRatio ?? 1));
    return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
  }

  function attachOpportunisticShot(action, self, entities, options = {}) {
    if (!action || !['coin', 'seek-coin'].includes(action.kind) || action.combat) return action;
    if (options.recovery) return action;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return action;
    if (!opportunisticShotBeatsAction(action, shot)) return action;
    return { ...action, opportunisticShot: shot };
  }

  function buildOpportunisticShotWait(self, entities, options = {}) {
    if (options.recovery) return null;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return null;
    return {
      kind: 'wait',
      reason: 'opportunistic-afk-drop-shot',
      dx: 0,
      dy: 0,
      opportunisticShot: shot
    };
  }

  function combatMoveVelocityForDirection(dx, dy) {
    const x = clamp(Math.round(Number(dx) || 0), -1, 1);
    const y = clamp(Math.round(Number(dy) || 0), -1, 1);
    if (!(x || y)) return { vx: 0, vy: 0 };
    const speedPerTick = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const axisSpeed = x && y ? Math.round(speedPerTick / Math.SQRT2) : speedPerTick;
    return { vx: x * axisSpeed, vy: y * axisSpeed };
  }

  function combatBulletThreats(self, target = null, bullets = getBullets()) {
    const selfId = Number(self?.user_id);
    const items = [];
    for (const raw of bullets || []) {
      const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) {
        continue;
      }
      const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const impactTicks = projection / speedValue;
      const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      items.push({
        id: bullet.id,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        distance,
        projection,
        laneDistance,
        signedLaneDistance,
        impactTicks,
        timeToImpactMs,
        hitRadius,
        directHit: laneDistance <= hitRadius,
        score
      });
    }
    return items.sort((a, b) => b.score - a.score || a.timeToImpactMs - b.timeToImpactMs);
  }

  function incomingBulletThreat(self, target = null, bullets = getBullets()) {
    const threats = combatBulletThreats(self, target, bullets);
    const best = threats[0] || null;
    if (!best) return null;
    return {
      ...best,
      threatCount: threats.length,
      threats: threats.slice(0, 6)
    };
  }

  function combatThreatFieldCandidate(self, threats, dx, dy) {
    const move = combatMoveVelocityForDirection(dx, dy);
    let safetyScore = 0;
    let minCpaDistance = Infinity;
    let minTimeToImpactMs = Infinity;
    let directHitCount = 0;
    for (const threat of threats || []) {
      const rx = Number(threat.x) - Number(self.x);
      const ry = Number(threat.y) - Number(self.y);
      const rvx = (Number(threat.vx) || 0) - move.vx;
      const rvy = (Number(threat.vy) || 0) - move.vy;
      const relSpeedSq = rvx * rvx + rvy * rvy;
      const rawImpactTicks = Number(threat.impactTicks);
      const horizonTicks = Math.max(0, Math.min(
        Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
        Number(cfg.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500))
      ));
      const cpaTicks = relSpeedSq > 0.000001
        ? clamp(-(rx * rvx + ry * rvy) / relSpeedSq, 0, horizonTicks)
        : 0;
      const cpaX = rx + rvx * cpaTicks;
      const cpaY = ry + rvy * cpaTicks;
      const cpaDistance = Math.hypot(cpaX, cpaY);
      const hitRadius = Math.max(0, Number(threat.hitRadius ?? cfg.combatBulletHitRadiusCm ?? 90));
      const timeToImpactMs = Number(threat.timeToImpactMs);
      const urgency = Number.isFinite(timeToImpactMs) ? Math.max(0.35, 1.8 - Math.min(1500, timeToImpactMs) / 1500) : 1;
      minCpaDistance = Math.min(minCpaDistance, cpaDistance);
      if (Number.isFinite(timeToImpactMs)) minTimeToImpactMs = Math.min(minTimeToImpactMs, timeToImpactMs);
      if (cpaDistance <= hitRadius) directHitCount += 1;
      safetyScore += Math.min(5000, cpaDistance) * urgency;
      if (cpaDistance <= hitRadius) safetyScore -= (hitRadius - cpaDistance + 1) * 100000 * urgency;
      else if (cpaDistance <= hitRadius * 3) safetyScore -= (hitRadius * 3 - cpaDistance) * 300 * urgency;
    }
    return {
      dx: clamp(Math.round(Number(dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(dy) || 0), -1, 1),
      safetyScore,
      minCpaDistance,
      minTimeToImpactMs,
      directHitCount
    };
  }

  function combatBulletThreatField(self, threats, options = {}) {
    const list = (threats || []).filter(Boolean).slice(0, 6);
    if (!list.length) return null;
    const preferred = options.preferred || {};
    const preferredDx = clamp(Math.round(Number(preferred.dx) || 0), -1, 1);
    const preferredDy = clamp(Math.round(Number(preferred.dy) || 0), -1, 1);
    const target = options.target || null;
    const approachX = target ? Math.sign(Number(target.x) - Number(self.x)) || 0 : 0;
    const approachY = target ? Math.sign(Number(target.y) - Number(self.y)) || 0 : 0;
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    const scored = directions.map(item => {
      const candidate = combatThreatFieldCandidate(self, list, item.dx, item.dy);
      let bias = 0;
      if (candidate.dx === preferredDx && candidate.dy === preferredDy) bias += 120;
      if (options.preferClosing) {
        if (candidate.dx && approachX && candidate.dx === approachX) bias += 40;
        if (candidate.dy && approachY && candidate.dy === approachY) bias += 40;
      }
      return { ...candidate, safetyScore: candidate.safetyScore + bias };
    }).sort((a, b) => {
      if (a.directHitCount !== b.directHitCount) return a.directHitCount - b.directHitCount;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return b.minCpaDistance - a.minCpaDistance;
    });
    const best = scored[0] || null;
    if (!best) return null;
    return best;
  }

  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }

  function combatStrafeKey(target, pressure) {
    const ownerId = pressure?.ownerId;
    if (ownerId !== null && ownerId !== undefined) return 'owner:' + ownerId;
    const targetId = target?.user_id ?? target?.id;
    if (targetId !== null && targetId !== undefined) return 'target:' + targetId;
    return 'combat';
  }

  function combatStrafeMatchesTarget(strafe, target) {
    if (!strafe) return false;
    const targetId = target?.user_id ?? target?.id;
    if (targetId === null || targetId === undefined) return true;
    const key = String(targetId);
    return strafe.targetId === key || strafe.key === 'target:' + key || strafe.key === 'owner:' + key;
  }

  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }

  function selectCombatStrafeSign(existing, key, preciseSign, t = now()) {
    let sign = 0;
    let until = 0;
    let locked = false;
    let lockOverridden = false;
    const existingUntil = Number(existing?.until || 0);
    if (existing && existing.key === key && t < existingUntil) {
      const existingSign = Math.sign(Number(existing.sign || 0));
      const precise = Math.sign(Number(preciseSign || 0));
      if (precise && existingSign && existingSign !== precise) {
        sign = precise;
        until = t + combatStrafeHoldMs();
        lockOverridden = true;
      } else {
        sign = existingSign;
        until = existingUntil;
        locked = Boolean(sign);
      }
    }
    if (!sign) {
      sign = Math.sign(Number(preciseSign || 0)) || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }
    return { sign, until, locked, lockOverridden };
  }

	  function combatStrafeVector(self, target, pressure, sign, options = {}) {
	    let baseX = Number(pressure?.vx) || 0;
	    let baseY = Number(pressure?.vy) || 0;
	    if (!(baseX || baseY) && target) {
      baseX = Number(target.x) - Number(self.x);
      baseY = Number(target.y) - Number(self.y);
    }
    const tangentX = -baseY * sign;
	    const tangentY = baseX * sign;
	    let dx = Math.sign(tangentX || 0);
	    let dy = Math.sign(tangentY || 0);
    let closingBiased = false;
	    if (target) {
	      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
	      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
	      const approachX = Math.sign(Number(target.x) - Number(self.x)) || 0;
	      const approachY = Math.sign(Number(target.y) - Number(self.y)) || 0;
	      const fillX = options.preferClosing ? approachX : awayX;
	      const fillY = options.preferClosing ? approachY : awayY;
	      if (dx && !dy && fillY) dy = fillY;
	      else if (dy && !dx && fillX) dx = fillX;
      if (options.preferClosing && dx && dy) {
        const closesX = Boolean(approachX && Math.sign(dx) === approachX);
        const closesY = Boolean(approachY && Math.sign(dy) === approachY);
        if (!closesX && !closesY) {
          const offsetX = Math.abs(Number(target.x) - Number(self.x));
          const offsetY = Math.abs(Number(target.y) - Number(self.y));
          if (offsetX >= offsetY && approachX) {
            closingBiased = Math.sign(dx) !== approachX;
            dx = approachX;
          } else if (approachY) {
            closingBiased = Math.sign(dy) !== approachY;
            dy = approachY;
          }
        }
      }
	    }
	    if (!(dx || dy) && target) {
	      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
	      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
	    }
	    return { dx: clamp(Math.round(dx), -1, 1), dy: clamp(Math.round(dy), -1, 1), closingBiased };
	  }

  function tangentMoveForBullet(self, target, pressure, options = {}) {
    const t = now();
    const existing = bot.combatStrafe;
    if (!pressure) {
      if (combatStrafeMatchesTarget(existing, target)
        && t < Number(existing?.carryUntil || 0)
        && (existing.dx || existing.dy)) {
        return {
          dx: clamp(Math.round(Number(existing.dx) || 0), -1, 1),
          dy: clamp(Math.round(Number(existing.dy) || 0), -1, 1),
          locked: true,
          carried: true,
          active: true,
          sign: Number(existing.sign || 0),
          key: existing.key,
          holdRemainingMs: Math.max(0, Math.round(Number(existing.until || 0) - t)),
          carryRemainingMs: Math.max(0, Math.round(Number(existing.carryUntil || 0) - t))
        };
      }
      return { dx: 0, dy: 0, locked: false, carried: false, active: false };
    }

    const key = combatStrafeKey(target, pressure);
    const preciseSign = combatPreciseStrafeSign(pressure);
    const strafeSign = selectCombatStrafeSign(existing, key, preciseSign, t);
    const sign = strafeSign.sign;
    const until = strafeSign.until;

	    let { dx, dy, closingBiased } = combatStrafeVector(self, target, pressure, sign, options);
    const threatField = !pressure.synthetic
      ? combatBulletThreatField(self, pressure.threats || [pressure], {
        preferred: { dx, dy },
        target,
        preferClosing: Boolean(options.preferClosing)
      })
      : null;
    if (threatField) {
      dx = threatField.dx;
      dy = threatField.dy;
    }
    if (!(dx || dy) && existing && (existing.dx || existing.dy)) {
      dx = clamp(Math.round(Number(existing.dx) || 0), -1, 1);
      dy = clamp(Math.round(Number(existing.dy) || 0), -1, 1);
    }
    const carryMs = Math.max(0, Number(cfg.combatStrafeCarryMs) || 0);
    const targetId = target?.user_id ?? target?.id;
    bot.combatStrafe = {
      key,
      targetId: targetId !== null && targetId !== undefined ? String(targetId) : '',
      ownerId: pressure.ownerId !== null && pressure.ownerId !== undefined ? String(pressure.ownerId) : '',
      sign,
      dx,
      dy,
      threatField,
      until,
      carryUntil: t + carryMs
    };
    return {
	      dx,
	      dy,
	      locked: Boolean(strafeSign.locked),
	      lockOverridden: Boolean(strafeSign.lockOverridden),
      closingBiased: Boolean(closingBiased),
	      carried: false,
      threatField,
      active: true,
      sign,
      precise: Boolean(preciseSign),
      key,
      holdRemainingMs: Math.max(0, Math.round(until - t)),
      carryRemainingMs: carryMs
    };
  }

  function combatMoveClosesDistance(self, target, move) {
    const dx = clamp(Math.round(Number(move?.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(move?.dy) || 0), -1, 1);
    if (!(dx || dy) || !self || !target) return false;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    return (toTargetX * dx + toTargetY * dy) > 0;
  }

  function combatSafeCloseMoveOverride(self, target, pressure, closeMove) {
    if (!self || !target || !pressure || pressure.synthetic || !closeMove?.active) return null;
    const dx = clamp(Math.round(Number(closeMove.dx) || 0), -1, 1);
    const dy = clamp(Math.round(Number(closeMove.dy) || 0), -1, 1);
    if (!(dx || dy) || !combatMoveClosesDistance(self, target, { dx, dy })) return null;
    const candidate = combatThreatFieldCandidate(self, pressure.threats || [pressure], dx, dy);
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const minSafeCpa = Math.max(hitRadius * 3, Number(cfg.combatPressureCloseMinCpaCm || 0));
    if (candidate.directHitCount > 0) return null;
    if (Number.isFinite(Number(candidate.minCpaDistance)) && Number(candidate.minCpaDistance) < minSafeCpa) return null;
    return {
      dx,
      dy,
      active: true,
      reason: closeMove.reason || 'safe-close',
      source: closeMove,
      threatField: candidate,
      minSafeCpa
    };
  }

  function combatSpacingVector(self, target, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minRange = Math.max(0, Number(cfg.combatSpacingMinRange || 0));
    const preferredRange = Math.max(minRange, Number(cfg.combatSpacingPreferredRange || minRange));
    if (!(distance > 0) || !minRange) return { active: false, dx: 0, dy: 0 };
    const dxRaw = Number(self.x) - Number(target.x);
    const dyRaw = Number(self.y) - Number(target.y);
    let dx = Math.sign(dxRaw) || 0;
    let dy = Math.sign(dyRaw) || 0;
    if (!(dx || dy)) dx = -Math.sign(Number(target.vx) || 0) || 1;
    const targetVx = Number(target.vx) || 0;
    const targetVy = Number(target.vy) || 0;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    const d = Math.max(1, distance);
    const radialSpeed = (toTargetX / d) * targetVx + (toTargetY / d) * targetVy;
    const tooClose = distance < minRange;
    const closing = radialSpeed <= -cfg.combatStationarySpeed && distance < preferredRange;
    if (!tooClose && !closing) return { active: false, dx: 0, dy: 0, distance, minRange, preferredRange, radialSpeed };
    return {
      active: true,
      dx: clamp(Math.round(dx), -1, 1),
      dy: clamp(Math.round(dy), -1, 1),
      distance,
      minRange,
      preferredRange,
      radialSpeed,
      reason: tooClose ? 'too-close' : 'closing'
    };
  }

  function combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp) {
    if (!spacing?.active || spacing.reason !== 'too-close') return false;
    const distance = Number(spacing.distance);
    const emergencyRange = Math.max(0, Number(cfg.combatSpacingEmergencyRange || 0));
    const lowHpThreshold = Math.max(0, Number(cfg.combatSpacingLowHpThreshold || cfg.combatLowHpLeaveThreshold || 0));
    const hp = Number(selfHp);
    const emergencyClose = emergencyRange > 0 && Number.isFinite(distance) && distance <= emergencyRange;
    const lowHpClose = lowHpThreshold > 0 && Number.isFinite(hp) && hp < lowHpThreshold;
    return Boolean(emergencyClose || lowHpClose);
  }

  function combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0));
    const margin = Math.max(0, Number(cfg.combatLowHpCloseRiskMargin || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    if (!threshold || !margin || !Number.isFinite(hp) || !Number.isFinite(enemyHp)) return null;
    if (!(hp < threshold) || !(hp <= enemyHp + margin)) return null;
    if (!spacing?.active || spacing.reason !== 'too-close') return null;
    if (!realBulletPressure && !combatSpacingShouldOverrideBullet(spacing, hp, enemyHp)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap: enemyHp - hp,
      margin,
      distance: Math.round(Number(spacing.distance || 0)),
      realBulletPressure: Boolean(realBulletPressure)
    };
  }

  function combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatPressureExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureExitHpGap || 0));
    const range = Math.max(0, Number(cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const hpGap = enemyHp - hp;
    if (!threshold || !minGap || !range || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp < threshold) || !(hpGap >= minGap) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      distance: Math.round(distance),
      realBulletPressure: true
    };
  }

  function combatSustainedPressureDisadvantageState(selfHp, targetHp, targetDistance, noDamageMs, targetRealBulletPressure = false) {
    const waitMs = Math.max(0, Number(cfg.combatPressureNoDamageExitMs || 0));
    const threshold = Math.max(0, Number(cfg.combatPressureNoDamageExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureNoDamageExitHpGap || 0));
    const targetHpMin = Math.max(0, Number(cfg.combatPressureNoDamageExitTargetHpMin || 0));
    const range = Math.max(0, Number(cfg.combatPressureNoDamageExitRange || cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hpGap = enemyHp - hp;
    if (!waitMs || !threshold || !minGap || !range || !targetRealBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      targetHpMin,
      noDamageMs: Math.round(elapsed),
      waitMs,
      distance: Math.round(distance),
      targetRealBulletPressure: true
    };
  }

  function combatPressureCloseVector(self, target, targetDistance, noDamageMs, selfHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    if (!thresholdMs || elapsed < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: elapsed,
      reason: 'long-no-damage'
    };
  }

  function combatFarNoDamageCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatFarNoDamageCloseMinHp || cfg.combatPressureCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    if (!thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      reason: 'far-no-damage'
    };
  }

  function combatRetreatingFighterCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatRetreatingFighterCloseMinHp || cfg.combatFarNoDamageCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatRetreatingFighterCloseMaxHpGap || cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    const activeRetreating = Boolean(retreatingTarget?.active && !retreatingTarget?.disengage);
    if (!activeRetreating || !targetRealBulletPressure || !thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, retreatingTarget };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      targetRealBulletPressure: true,
      farNoDamageClose: true,
      reason: 'retreating-fighter-close',
      retreatingTarget
    };
  }

  function combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatFinishPressureTargetHpMax || 0));
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatFinishPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const inAttackRange = attackRange > 0 && distance <= attackRange;
    const retreatingEdge = Boolean(retreatingTarget?.active && retreatingTarget?.reason === 'target-retreating-edge');
    if (!retreatingEdge || !inAttackRange || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      minSelfHp,
      maxTargetHp,
      reason: 'low-hp-retreating-target',
      retreatingTarget
    };
  }

  function combatOutOfRangeFinishPressureState(self, target, targetDistance, selfHp, targetHp, damageState = null, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeFinishPressureRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureTargetHpMax || 0));
    const maxHpGap = Number.isFinite(Number(cfg.combatOutOfRangeFinishPressureMaxHpGap))
      ? Number(cfg.combatOutOfRangeFinishPressureMaxHpGap)
      : 0;
    const recentDamageMs = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureRecentDamageMs || 0));
    const noDamageMs = Math.max(0, Number(damageState?.noDamageMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!recentDamageMs || noDamageMs > recentDamageMs) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp || hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, hpGap, noDamageMs };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs,
      recentDamageMs,
      reason: 'out-of-range-low-hp-finish',
      retreatingTarget
    };
  }

  function combatOutOfRangeReengageState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeReengageRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeReengageMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatOutOfRangeReengageMaxHpGap || 0));
    const pressureMaxHpGap = Math.max(maxHpGap, Number(cfg.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
    const effectiveMaxHpGap = targetRealBulletPressure ? pressureMaxHpGap : maxHpGap;
    const recentInRangeMs = Math.max(0, Number(cfg.combatOutOfRangeReengageRecentInRangeMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    const outOfRangeMs = Math.max(0, Number(target?.combatEngagement?.outOfRangeMs || 0));
    const graceRemainingMs = Math.max(0, Number(target?.combatEngagement?.graceRemainingMs || 0));
    const engagedIntent = /^(engaged|reengage)$/.test(String(target?.combatIntent || ''))
      || Boolean(target?.combatEngagement);
    const freshInRangeContact = Boolean(
      recentInRangeMs
      && outOfRangeMs <= recentInRangeMs
      && !retreatingTarget?.active
    );
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (!engagedIntent) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs
      };
    }
    if (retreatingTarget?.active && !targetRealBulletPressure) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!targetRealBulletPressure && !freshInRangeContact) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        graceRemainingMs,
        retreatingTarget
      };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || hpGap > effectiveMaxHpGap || combatMovementBlockedByStamina(self)) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        minSelfHp,
        maxHpGap: effectiveMaxHpGap,
        baseMaxHpGap: maxHpGap,
        pressureMaxHpGap,
        outOfRangeMs,
        graceRemainingMs,
        targetRealBulletPressure: Boolean(targetRealBulletPressure),
        freshInRangeContact,
        retreatingTarget
      };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      minSelfHp,
      maxHpGap: effectiveMaxHpGap,
      baseMaxHpGap: maxHpGap,
      pressureMaxHpGap,
      outOfRangeMs,
      graceRemainingMs,
      targetRealBulletPressure: Boolean(targetRealBulletPressure),
      freshInRangeContact,
      reason: targetRealBulletPressure ? 'target-real-bullet-pressure' : 'fresh-in-range-contact',
      retreatingTarget
    };
  }

  function combatPassiveRunnerState(self, target, targetDistance, damageState = null, pressure = null, motionScale = 0) {
    const t = Date.now();
    const selfHp = hpValue(self);
    const minSelfHp = Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const minDrop = Math.max(0, Number(cfg.combatPassiveRunnerMinDrop || 0));
    const confirmMs = Math.max(0, Number(cfg.combatPassiveRunnerConfirmMs || 0));
    const targetDrop = Math.max(0, Number(dropValue(target) || target?.drop || 0));
    const active = isCurrentlyActive(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || Number(motionScale || 0) >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const realPressure = Boolean(pressure && !pressure.synthetic);
    const recentlyInjured = bot.pendingInjuryLeave
      && Date.now() - Number(bot.pendingInjuryLeave.at || 0) <= cfg.combatStrafeLockMs * 3;
    const current = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target) ? bot.combatTarget : null;
    const samples = Array.isArray(current?.motionSamples) ? current.motionSamples : [];
    const firstSelfHp = samples.length ? Number(samples[0].selfHp) : null;
    const lastSelfHp = samples.length ? Number(samples[samples.length - 1].selfHp) : null;
    const recentSelfDamage = Number.isFinite(firstSelfHp) && Number.isFinite(lastSelfHp)
      ? Math.max(0, firstSelfHp - lastSelfHp)
      : 0;
    const intent = String(target?.combatIntent || current?.intent || '');
    const originIntent = String(current?.originIntent || current?.intent || intent);
    const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
    const rewarded = targetDrop >= minDrop || runnerIntent;
    const engagedMs = current
      ? Math.max(0, t - Number(current.firstSeenAt || current.at || t))
      : 0;
    const confirmed = engagedMs >= confirmMs;
    const seenTargetRealBulletAt = Number(current?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, t - seenTargetRealBulletAt) : 0;
    const eligible = Boolean(
      active
      && moving
      && runnerIntent
      && rewarded
      && !isFiringEntity(target)
      && !isInvulnerable(target)
      && !realPressure
      && !recentlyInjured
      && confirmed
      && !seenTargetRealBulletAt
      && Number.isFinite(selfHp)
      && selfHp >= minSelfHp
      && recentSelfDamage <= 0.01
    );
    return {
      active: eligible,
      selfHp,
      minSelfHp,
      targetDrop,
      minDrop,
      distance: Number.isFinite(Number(targetDistance)) ? Math.round(Number(targetDistance)) : null,
      moving,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(Number(motionScale).toFixed(2)) : 0,
      recentSelfDamage,
      pressureReason: pressure?.reason || '',
      combatIntent: intent,
      originIntent,
      engagedMs,
      confirmMs,
      confirmed,
      seenTargetRealBulletAt: seenTargetRealBulletAt || 0,
      seenTargetRealBulletMs,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatPassiveRunnerCloseVector(self, target, targetDistance, runnerState) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPassiveRunnerCloseRange || 0)
    );
    if (!runnerState?.active || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, reason: 'passive-runner' };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: Math.max(0, Number(runnerState.noDamageMs || 0)),
      reason: 'passive-runner'
    };
  }

  function mergeCombatMove(primary, spacing, allowSpacingMerge = true) {
    if (!spacing?.active || !allowSpacingMerge) return primary || { dx: 0, dy: 0 };
    const current = primary || { dx: 0, dy: 0 };
    const mergeAxis = (value, spacingValue) => {
      const v = clamp(Math.round(Number(value) || 0), -1, 1);
      const s = clamp(Math.round(Number(spacingValue) || 0), -1, 1);
      if (v && s && Math.sign(v) !== Math.sign(s)) return s;
      return v || s;
    };
    return {
      ...current,
      dx: mergeAxis(current.dx, spacing.dx),
      dy: mergeAxis(current.dy, spacing.dy),
      spacingMerged: true
    };
  }

  function combatPressureThreat(self, target, bullets) {
    const bullet = target.incomingBullet || incomingBulletThreat(self, target, bullets) || incomingBulletThreat(self, null, bullets);
    if (bullet) return { ...bullet, reason: 'incoming-bullet' };
    const injury = bot.pendingInjuryLeave;
    const recentlyInjured = injury && Date.now() - Number(injury.at || 0) <= cfg.combatStrafeLockMs * 3;
    const pressure = recentlyInjured || isFiringEntity(target) || isCurrentlyActive(target);
    if (!pressure) return null;
    const vx = Number(self.x) - Number(target.x);
    const vy = Number(self.y) - Number(target.y);
    const distance = Math.hypot(vx, vy);
    return {
      id: 'pressure:' + (target.user_id ?? target.id ?? ''),
      ownerId: target.user_id ?? null,
      x: Number(target.x),
      y: Number(target.y),
      vx,
      vy,
      distance,
      projection: distance,
      laneDistance: 0,
      synthetic: true,
      reason: recentlyInjured ? 'recent-injury' : 'target-pressure'
    };
  }

  function combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget = null, closeMove = null) {
    if (!pressure || pressure.synthetic) return null;
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const dodgeRange = combatDodgeThreatRange();
    const targetDistance = Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target);
    if (!attackRange || !(targetDistance > attackRange) || !(targetDistance <= dodgeRange)) return null;
    const spacing = combatSpacingVector(self, target, targetDistance);
    const closeOverride = combatSafeCloseMoveOverride(self, target, pressure, closeMove);
    const strafe = closeOverride
      ? {
        dx: closeOverride.dx,
        dy: closeOverride.dy,
        active: true,
        closingBiased: true,
        safeCloseOverride: closeOverride
      }
      : tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const spacingOverride = combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = mergeCombatMove(strafe, spacing, spacingOverride);
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
    return {
      kind: 'attack',
      reason: movementSuppressed ? 'combat-stamina-hold' : (spacingOverride ? 'combat-spacing-dodge' : 'combat-out-of-range-dodge'),
      combat: true,
      combatDodgeOnly: true,
      ignoreReturnBlock: true,
      shoot: false,
      forceShoot: false,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: {
        ...baseTarget,
        combatDodgeOnly: true
      },
      incomingBullet: {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        threatCount: Number(pressure.threatCount || (Array.isArray(pressure.threats) ? pressure.threats.length : 1)),
        synthetic: false,
        reason: pressure.reason || 'incoming-bullet'
      },
      combatState: {
        selfHp,
        targetHp,
        dodgeOnly: {
          distance: Math.round(targetDistance),
          attackRange: Math.round(attackRange),
          dodgeRange: Math.round(dodgeRange),
          buffer: Math.max(0, Math.round(dodgeRange - attackRange)),
          reason: 'incoming-bullet-outside-attack-range'
        },
        strafe: {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
          precise: Boolean(strafe.precise),
          locked: Boolean(strafe.locked),
          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
          safeCloseOverride: closeOverride ? {
            dx: closeOverride.dx,
            dy: closeOverride.dy,
            reason: closeOverride.reason,
            minCpaDistance: Number.isFinite(Number(closeOverride.threatField?.minCpaDistance)) ? Math.round(Number(closeOverride.threatField.minCpaDistance)) : null,
            directHitCount: Number(closeOverride.threatField?.directHitCount || 0)
          } : null,
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
        },
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
        movementSuppressed,
        retreatingTarget: retreatingTarget?.active ? retreatingTarget : null
      }
    };
  }

  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clamp(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clamp(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clamp(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clamp(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clamp(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }

  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clamp(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clamp(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
  }

  function combatMotionSample(self, target, at = Date.now()) {
    if (!target) return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = self ? (Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target)) : Number(target.distance);
    return {
      at,
      x,
      y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      distance: Number.isFinite(distance) ? distance : null,
      hp: knownHpValue(target),
      selfHp: knownHpValue(self)
    };
  }

  function combatMotionSamplesWithCurrent(self, target, t = Date.now(), windowMsOverride = null) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget || null;
    const same = previous && id && String(previous.id ?? '') === id;
    const windowMs = Math.max(250, Number(windowMsOverride || cfg.combatMotionHistoryWindowMs || 2000));
    const maxSamples = Math.max(2, Math.round(Number(cfg.combatMotionHistoryMaxSamples || 80)));
    const samples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples.slice() : [];
    const current = combatMotionSample(self, target, t);
    if (current) samples.push(current);
    return samples
      .filter(sample => sample && Number.isFinite(Number(sample.at)) && t - Number(sample.at) <= windowMs)
      .sort((a, b) => Number(a.at) - Number(b.at))
      .slice(-maxSamples);
  }

  function combatOpponentProfile(self, target, targetDistance = null) {
    const samples = combatMotionSamplesWithCurrent(self, target, Date.now(), Math.max(250, Number(cfg.combatMotionHistoryWindowMs || 2000)));
    const threshold = Math.max(1, Number(cfg.combatStationarySpeed || 5));
    let lateralFlips = 0;
    let previousLateralSign = 0;
    let radialSum = 0;
    let radialCount = 0;
    let speedSum = 0;
    let dotSum = 0;
    let dotCount = 0;
    for (const sample of samples) {
      const sx = Number(sample.x);
      const sy = Number(sample.y);
      const vx = Number(sample.vx) || 0;
      const vy = Number(sample.vy) || 0;
      const dx = sx - Number(self?.x || 0);
      const dy = sy - Number(self?.y || 0);
      const d = Math.max(1, Math.hypot(dx, dy));
      const radial = (dx / d) * vx + (dy / d) * vy;
      const lateral = (dx / d) * vy - (dy / d) * vx;
      const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
      if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
      if (lateralSign) previousLateralSign = lateralSign;
      radialSum += radial;
      radialCount += 1;
      speedSum += Math.hypot(vx, vy);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const av = Math.hypot(Number(a.vx) || 0, Number(a.vy) || 0);
      const bv = Math.hypot(Number(b.vx) || 0, Number(b.vy) || 0);
      if (av >= threshold && bv >= threshold) {
        dotSum += ((Number(a.vx) || 0) * (Number(b.vx) || 0) + (Number(a.vy) || 0) * (Number(b.vy) || 0)) / (av * bv);
        dotCount += 1;
      }
    }
    const durationMs = samples.length >= 2 ? Math.max(0, Number(samples[samples.length - 1].at) - Number(samples[0].at)) : 0;
    const velocityStability = dotCount ? clamp((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
    const avgRadialSpeed = radialCount ? radialSum / radialCount : 0;
    const avgSpeed = samples.length ? speedSum / samples.length : speed(target);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : (Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target));
    const strafePattern = Boolean(samples.length >= 4 && lateralFlips >= 2 && durationMs >= 600);
    const kiting = Boolean(samples.length >= 3
      && avgRadialSpeed >= Math.max(3, threshold)
      && distance >= Math.max(0, Number(cfg.combatSpacingPreferredRange || 0))
      && (isFiringEntity(target) || isCurrentlyActive(target)));
    const maneuverScale = clamp((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45 + (kiting ? 0.2 : 0), 0, 1);
    const aimConfidenceScale = clamp(1.08 - maneuverScale * 0.45, 0.55, 1.08);
    return {
      sampleCount: samples.length,
      durationMs,
      lateralFlips,
      velocityStability,
      avgRadialSpeed,
      avgSpeed,
      strafePattern,
      kiting,
      maneuverScale,
      aimConfidenceScale
    };
  }

  function combatTradeEstimate(self, target) {
    const previous = bot.combatTarget || null;
    const id = combatTargetId(target);
    const same = previous && id && String(previous.id ?? '') === id;
    if (!same) return null;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.combatTradeEstimateWindowMs || 6000));
    const samples = combatMotionSamplesWithCurrent(self, target, t, windowMs)
      .filter(sample => t - Number(sample.at) <= windowMs && Number.isFinite(Number(sample.hp)) && Number.isFinite(Number(sample.selfHp)));
    if (samples.length < 3) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = Math.max(1, Number(last.at) - Number(first.at));
    if (elapsedMs < Math.max(500, Number(cfg.combatTradeEstimateMinWindowMs || 1800))) return null;
    const targetDamage = Math.max(0, Number(first.hp) - Number(last.hp));
    const selfDamage = Math.max(0, Number(first.selfHp) - Number(last.selfHp));
    const myDps = targetDamage / elapsedMs * 1000;
    const enemyDps = selfDamage / elapsedMs * 1000;
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const tKillMs = myDps > 0.05 ? targetHp / myDps * 1000 : Infinity;
    const tDeathMs = enemyDps > 0.05 ? selfHp / enemyDps * 1000 : Infinity;
    const minSelfDamage = Math.max(0, Number(cfg.combatTradeEstimateMinSelfDamage || 6));
    const minEnemyDps = Math.max(0, Number(cfg.combatTradeEstimateMinEnemyDps || 1.5));
    const safetyFactor = Math.max(1, Number(cfg.combatTradeEstimateSafetyFactor || 1.15));
    const noDamageSafeSelfHp = Math.max(0, Number(cfg.combatTradeEstimateNoDamageSafeSelfHp || 75));
    const noDamageUnsafeTDeathMs = Math.max(1000, Number(cfg.combatTradeEstimateNoDamageUnsafeTDeathMs || 30000));
    const zeroDamageWindow = targetDamage <= 0.01;
    const noDamageUnsafe = !zeroDamageWindow
      || selfHp <= noDamageSafeSelfHp
      || tDeathMs <= noDamageUnsafeTDeathMs;
    const disadvantaged = Boolean(
      selfDamage >= minSelfDamage
      && enemyDps >= minEnemyDps
      && tDeathMs < tKillMs * safetyFactor
      && targetHp > 1
      && noDamageUnsafe
    );
    return {
      active: disadvantaged,
      sampleCount: samples.length,
      elapsedMs,
      selfDamage,
      targetDamage,
      myDps,
      enemyDps,
      tKillMs,
      tDeathMs,
      safetyFactor,
      zeroDamageWindow,
      noDamageUnsafe
    };
  }

  function opportunityEffectiveStaminaCost(staminaCost) {
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

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const finishLowThreatDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootFinishLowThreatDodgeReserveMs || hardReserveMs));
    const passiveRunnerDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPassiveRunnerDodgeReserveMs || highHpDodgeReserveMs));
    const pressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPressureDodgeReserveMs || highHpDodgeReserveMs));
    const winningPressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootWinningPressureDodgeReserveMs || pressureDodgeReserveMs));
    const steadyAimDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootSteadyAimDodgeReserveMs || highHpDodgeReserveMs));
    const noDamageDuelDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootNoDamageDuelDodgeReserveMs || highHpDodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const trend = options.trend && typeof options.trend === 'object'
      ? options.trend
      : combatTrendState(self, options);
    const noDamageMs = Math.max(0, Number(trend.noDamageMs || 0));
    const highHpFireWindow = Boolean(trend.highHpFireWindow);
    const passiveRunnerFireWindow = Boolean(trend.passiveRunnerFireWindow);
    const opponentProbeFireWindow = Boolean(trend.opponentProbeFireWindow);
    const finishLowThreatFireWindow = Boolean(trend.finishLowThreatFireWindow);
    const closePressureFireWindow = Boolean(trend.closePressureFireWindow);
	    const winningPressureFireWindow = Boolean(trend.winningPressureFireWindow);
	    const steadyAimFireWindow = Boolean(trend.steadyAimFireWindow);
	    const noDamageDuelFireWindow = Boolean(trend.noDamageDuelFireWindow);
	    const farNoDamageCloseFireWindow = Boolean(trend.farNoDamageCloseFireWindow);
	    const aimConfidence = Number.isFinite(Number(options.aimConfidence))
	      ? Math.max(0, Math.min(1, Number(options.aimConfidence)))
	      : null;
	    const lowConfidenceThreshold = Math.max(0, Math.min(1, Number(cfg.combatAimLowConfidenceThreshold || 0)));
	    const lowConfidenceMinDistance = Math.max(0, Number(cfg.combatAimLowConfidenceMinDistance || 0));
	    const lowConfidenceMotionScale = Math.max(0, Number(cfg.combatAimLowConfidenceMotionScale || 0));
	    const lowConfidenceEveryMs = Math.max(conserveEveryMs, Number(cfg.combatAimLowConfidenceEveryMs || conserveEveryMs));
    const opponentProbeReserveMs = Math.max(
      dodgeReserveMs,
      Number(cfg.combatOpponentProbeReserveMs || reserveMs)
    );
    const opponentProbeEveryMs = Math.max(
      normalEveryMs,
      Number(cfg.combatOpponentProbeEveryMs || lowConfidenceEveryMs)
    );
	    const lowConfidenceWindow = Boolean(
	      aimConfidence !== null
	      && lowConfidenceThreshold > 0
	      && aimConfidence < lowConfidenceThreshold
	      && Number(options.targetDistance || 0) >= lowConfidenceMinDistance
	      && (options.targetMoving || Number(options.motionScale || 0) >= lowConfidenceMotionScale)
	      && !closePressureFireWindow
	      && !steadyAimFireWindow
	    );
    let effectiveDodgeReserveMs = dodgeReserveMs;
    if (opponentProbeFireWindow) {
      effectiveDodgeReserveMs = Math.max(effectiveDodgeReserveMs, opponentProbeReserveMs);
    } else {
      if (highHpFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, highHpDodgeReserveMs);
      if (passiveRunnerFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, passiveRunnerDodgeReserveMs);
    }
    if (finishLowThreatFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, finishLowThreatDodgeReserveMs);
    if (closePressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, pressureDodgeReserveMs);
    if (winningPressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, winningPressureDodgeReserveMs);
    if (steadyAimFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, steadyAimDodgeReserveMs);
    if (noDamageDuelFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, noDamageDuelDodgeReserveMs);
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure || options.pressureClose);
    const base = {
      shoot: true,
      forceShoot: false,
      shootEveryMs: normalEveryMs,
      reason: 'normal',
      stamina5s,
      reserveMs,
      dodgeReserveMs: effectiveDodgeReserveMs,
      standardDodgeReserveMs: dodgeReserveMs,
      highHpDodgeReserveMs,
      passiveRunnerDodgeReserveMs,
      finishLowThreatDodgeReserveMs,
      pressureDodgeReserveMs,
      winningPressureDodgeReserveMs,
      steadyAimDodgeReserveMs,
      noDamageDuelDodgeReserveMs,
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
	      noDamageDuelFireWindow,
	      farNoDamageCloseFireWindow,
      opponentProbeFireWindow,
      opponentProbeReserveMs,
      opponentProbeEveryMs,
	      aimConfidence,
	      lowConfidenceWindow,
	      noDamageMs,
      trend: {
        stance: trend.stance || 'normal',
        hpGap: Number.isFinite(Number(trend.hpGap)) ? Number(trend.hpGap) : null,
        targetDistance: Number.isFinite(Number(trend.targetDistance)) ? Math.round(Number(trend.targetDistance)) : null,
        noDamageMs: Math.round(noDamageMs),
        engagedCombat: Boolean(trend.engagedCombat),
        targetActive: Boolean(trend.targetActive),
        targetMoving: Boolean(trend.targetMoving),
        passiveRunner: Boolean(trend.passiveRunner),
        opponentProbe: Boolean(trend.opponentProbeFireWindow),
        opponentProbeEngagedMs: Math.round(Math.max(0, Number(trend.opponentProbeEngagedMs || 0))),
        realBulletPressure: Boolean(trend.realBulletPressure),
        steadyAim: Boolean(trend.steadyAim),
        farNoDamageClose: Boolean(trend.farNoDamageCloseFireWindow)
      },
      suppressed: false,
      throttled: false
    };
    if (stamina5s !== null && stamina5s < hardReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'stamina-rebuild', suppressed: true };
    }
    if (stamina5s !== null && opponentProbeFireWindow && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
    if (stamina5s !== null && needsMovement && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
	    if (stamina5s !== null && stamina5s < reserveMs) {
	      return { ...base, shootEveryMs: conserveEveryMs, reason: 'burst-fire', throttled: true };
	    }
    if (opponentProbeFireWindow) {
      return { ...base, shootEveryMs: opponentProbeEveryMs, reason: 'opponent-probe', throttled: true };
    }
	    if (lowConfidenceWindow) {
	      return { ...base, shootEveryMs: lowConfidenceEveryMs, reason: 'low-confidence-burst', throttled: true };
	    }
	    return base;
	  }

  function combatAimNoDamageLevel(widenMs) {
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const elapsed = Math.max(0, Number(widenMs) || 0);
    return elapsed > 0 ? Math.min(3, 1 + elapsed / stepMs) : 0;
  }

  function combatAimNoDamageJitterLimit(baseLimit, noDamageLevel) {
    const base = Math.max(0, Number(baseLimit) || 0);
    const level = Math.max(0, Number(noDamageLevel) || 0);
    const maxNoDamageLimit = Math.max(base, Number(cfg.combatAimNoDamageMaxRadians) || base);
    return level ? Math.min(maxNoDamageLimit, base * (1 + level * 0.45)) : base;
  }
  function combatAimSteadyNoDamageState(target, noDamageMs, motionScale = 0) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimSteadyNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    const speedMax = Math.max(0, Number(cfg.combatAimSteadySpeedMax ?? cfg.combatStationarySpeed ?? 0));
    const currentSpeed = speed(target);
    const active = Boolean(thresholdMs && elapsed >= thresholdMs && currentSpeed <= speedMax);
    return {
      active,
      noDamageMs: elapsed,
      thresholdMs,
      currentSpeed,
      speedMax,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(motionScale) : 0
    };
  }

  function combatAimFallbackPrecisionState(noDamageMs) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    return {
      active: Boolean(thresholdMs && elapsed >= thresholdMs),
      noDamageMs: elapsed,
      thresholdMs
    };
  }

  function combatMovementAimMode(self, target, distance) {
    const vx = Number(target.vx) || 0;
    const vy = Number(target.vy) || 0;
    const targetSpeed = Math.hypot(vx, vy);
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const d = Math.max(1, Number(distance) || Math.hypot(dx, dy) || 1);
    const ux = dx / d;
    const uy = dy / d;
    const radialSpeed = ux * vx + uy * vy;
    const lateralSpeed = ux * vy - uy * vx;
    const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
    let mode = 'drift';
    let leadScale = 0.75;
    if (lateralRatio >= 0.55) {
      mode = 'lateral';
      leadScale = 1.1;
    } else if (radialSpeed <= -cfg.combatStationarySpeed) {
      mode = 'closing';
      leadScale = 0.5;
    } else if (radialSpeed >= cfg.combatStationarySpeed) {
      mode = 'retreating';
      leadScale = 0.6;
    }
    if (target.current_join_mode === 'Active') leadScale += 0.15;
    if (isFiringEntity(target)) leadScale += 0.1;
    return {
      mode,
      leadScale,
      lateralSpeed,
      radialSpeed,
      lateralRatio,
      targetSpeed
    };
  }

  function combatInterceptSolution(self, target, distance = null, motionScale = 1) {
    const sx = Number(self?.x);
    const sy = Number(self?.y);
    const px = Number(target?.x);
    const py = Number(target?.y);
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const renderDelayTicks = Math.max(0, Number(cfg.combatRenderDelayTicks ?? 2));
    const compensatedX = px + vx * renderDelayTicks;
    const compensatedY = py + vy * renderDelayTicks;
    const dx = compensatedX - sx;
    const dy = compensatedY - sy;
    const c = dx * dx + dy * dy;
    if (!(c > 0)) return null;
    const targetSpeedSq = vx * vx + vy * vy;
    const a = targetSpeedSq - bulletSpeed * bulletSpeed;
    const b = 2 * (dx * vx + dy * vy);
    const eps = 1e-6;
    const roots = [];
    if (Math.abs(a) < eps) {
      if (Math.abs(b) > eps) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -eps) return null;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
    const maxByRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000) / bulletSpeed);
    const configuredMax = Number(cfg.combatInterceptMaxTicks || 0);
    const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
    const t = roots
      .filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks)
      .sort((aTick, bTick) => aTick - bTick)[0];
    if (!Number.isFinite(t)) return null;
    const x = compensatedX + vx * t;
    const y = compensatedY + vy * t;
    const travelDistance = Math.hypot(x - sx, y - sy);
    const bulletRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000));
    if (travelDistance > bulletRange + Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90))) return null;
    const rawDistance = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : Math.hypot(px - sx, py - sy);
    const targetSpeed = Math.sqrt(targetSpeedSq);
    const maxTargetSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const speedRatio = targetSpeed / maxTargetSpeed;
    const timeFactor = 1 - Math.min(1, t / maxTicks) * 0.35;
    const speedPenalty = Math.max(0, speedRatio - 1) * 0.2;
    const motionPenalty = Math.max(0, Math.min(1, Number(motionScale) || 0)) * 0.08;
    const confidence = Math.max(0.25, Math.min(1, 0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty));
    return {
      x,
      y,
      flightTicks: t,
      flightMs: t * 50,
      travelDistance,
      currentDistance: rawDistance,
      leadDistance: Math.hypot(x - px, y - py),
      renderDelayTicks,
      compensatedX,
      compensatedY,
      targetVx: vx,
      targetVy: vy,
      targetSpeed,
      confidence
    };
  }

  function combatLiveAimTarget(self, target) {
    const targetId = combatTargetId(target);
    const targetName = String(target?.name || '').trim();
    let live = null;
    try {
      const nativeEntities = Array.isArray(bot.testNativeEntities)
        ? bot.testNativeEntities
        : (typeof getNativeEntityList === 'function' ? getNativeEntityList() : []);
      if (Array.isArray(nativeEntities) && nativeEntities.length) {
        live = nativeEntities.find(entity => {
          const id = combatTargetId(entity);
          return targetId && id && String(id) === targetId;
        }) || null;
        if (!live && targetName) live = nativeEntities.find(entity => String(entity?.name || '').trim() === targetName) || null;
      }
    } catch (_) {
      live = null;
    }
    if (!live || !isAlive(live) || isInvulnerable(live)) return target;
    const x = Number(live.x);
    const y = Number(live.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return target;
    return {
      ...target,
      ...live,
      user_id: live.user_id ?? live.id ?? target.user_id ?? target.id,
      id: live.user_id ?? live.id ?? target.id ?? target.user_id,
      hp: combatHpValue(live),
      knownHp: knownHpValue(live),
      drop: dropValue(live) || target.drop,
      distance: dist(self, live),
      speed: speed(live),
      combatIntent: target.combatIntent || live.combatIntent || '',
      nativeAimResolved: true,
      originalAimTarget: target
    };
  }
  function combatAimSourceDivergenceState(aimSource, distance) {
    const original = aimSource?.originalAimTarget;
    const live = Boolean(aimSource?.nativeAimResolved);
    const ax = Number(aimSource?.x);
    const ay = Number(aimSource?.y);
    const ox = Number(original?.x);
    const oy = Number(original?.y);
    const divergence = live
      && Number.isFinite(ax)
      && Number.isFinite(ay)
      && Number.isFinite(ox)
      && Number.isFinite(oy)
      ? Math.hypot(ax - ox, ay - oy)
      : null;
    const baseThreshold = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionCm || 0));
    const ratio = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionRatio || 0));
    const ratioThreshold = Number.isFinite(Number(distance)) ? Math.round(Math.max(0, Number(distance)) * ratio) : 0;
    const threshold = Math.max(baseThreshold, ratioThreshold);
    return {
      active: Boolean(live && divergence !== null && threshold > 0 && divergence >= threshold),
      divergenceCm: divergence !== null ? Math.round(divergence) : null,
      thresholdCm: Math.round(threshold),
      baseThresholdCm: Math.round(baseThreshold),
      ratioThresholdCm: Math.round(ratioThreshold)
    };
  }

  function combatAimServerStallState() {
    const stall = typeof summarizeServerPositionStall === 'function'
      ? summarizeServerPositionStall()
      : bot.serverPositionStall;
    return stall && typeof stall === 'object' ? stall : {};
  }

  function combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, options = {}) {
    const fallbackPrecision = combatAimFallbackPrecisionState(damage?.noDamageMs);
    const sourceDivergence = combatAimSourceDivergenceState(aimSource, distance);
    const serverStall = combatAimServerStallState();
    const live = Boolean(aimSource?.nativeAimResolved);
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const radialMax = Math.max(0, Number(cfg.combatAimRadialPrecisionLateralRatio || 0));
    const realBulletPrecision = Boolean(live
      && moving
      && options.realBulletPressure
      && (!attackRange || Number(distance) <= attackRange));
    const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
    const passiveRunnerIntercept = Boolean(live
      && moving
      && movement
      && options.passiveRunner
      && (!attackRange || Number(distance) <= attackRange));
    const liveIntercept = Boolean(live
      && moving
      && movement
      && (
        passiveRunnerIntercept
        || (lateralRatio > radialMax && (
          realBulletPrecision
          || (serverStall.stalled && (!attackRange || Number(distance) <= attackRange))
        ))
      ));
    const radialPrecision = Boolean(live
      && moving
      && radialMax > 0
      && movement
      && Number(movement.targetSpeed || 0) >= Number(cfg.combatStationarySpeed || 0)
      && lateralRatio <= radialMax
      && (!attackRange || Number(distance) <= attackRange));
    let mode = moving ? 'intercept' : 'exact';
    let strategy = moving ? 'intercept' : 'exact';
    let reason = moving ? (movement?.mode || 'moving') : 'stationary';
    let precision = false;
    let steady = false;
    let passiveRunnerAim = false;
    if (sourceDivergence.active) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'coordinate-divergence';
      precision = true;
    } else if (passiveRunnerIntercept) {
      strategy = 'live-intercept';
      reason = 'passive-runner-intercept';
      passiveRunnerAim = true;
    } else if (realBulletPrecision && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'real-bullet-pressure-intercept';
    } else if (realBulletPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'real-bullet-pressure';
      precision = true;
    } else if (live && serverStall.stalled && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'server-stall-live-intercept';
    } else if (live && serverStall.stalled) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'server-stall-live';
      precision = true;
    } else if (radialPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'radial-motion';
      precision = true;
    } else if (fallbackPrecision.active) {
      mode = 'precision';
      strategy = 'fallback-precision';
      reason = 'no-damage-fallback';
      precision = true;
    } else if (steadyAim?.active && moving) {
      mode = 'steady';
      strategy = 'steady';
      reason = 'steady-no-damage';
      steady = true;
    }
    return {
      mode,
      strategy,
      reason,
      precision,
      steady,
      bypassJitter: Boolean(!moving || precision || steady),
      sourceDivergence,
      serverStall: Boolean(serverStall.stalled),
      liveIntercept,
      realBulletPrecision,
      radialPrecision,
      fallbackPrecision: Boolean(fallbackPrecision.active),
      passiveRunner: Boolean(passiveRunnerAim),
      movementMode: precision ? strategy : (steady ? 'steady' : (movement?.mode || ''))
    };
  }

  function combatAimTarget(self, target, options = {}) {
    const nativeAimSource = combatLiveAimTarget(self, target);
    const preliminaryDamage = combatAimDamageState(nativeAimSource);
    const aimSource = nativeAimSource;
	    const motionScale = combatAimMotionScale(aimSource);
	    const moving = speed(aimSource) >= cfg.combatStationarySpeed
	      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
	    const targetDistance = Number(aimSource.distance);
	    const distance = Number.isFinite(targetDistance) ? targetDistance : dist(self, aimSource);
    const opponentProfile = combatOpponentProfile(self, aimSource, distance);
	    const damage = preliminaryDamage;
    const steadyAim = combatAimSteadyNoDamageState(aimSource, damage.noDamageMs, motionScale);
    const movement = moving
      ? combatMovementAimMode(self, aimSource, distance)
      : { mode: '', targetSpeed: 0, lateralRatio: 0, lateralSpeed: 0, radialSpeed: 0 };
    const aimStrategy = combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, {
      realBulletPressure: Boolean(options.realBulletPressure),
      passiveRunner: Boolean(options.passiveRunner)
    });
    const exact = {
      x: Number(aimSource.x),
      y: Number(aimSource.y),
      mode: aimStrategy.mode,
      moving,
      distance,
      motionScale,
      movementMode: aimStrategy.movementMode,
      jitterLimit: 0,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: false,
      precisionAim: Boolean(aimStrategy.precision),
      steadyAim: Boolean(aimStrategy.steady),
      lockedAim: false,
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.reason,
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      aimConfidence: aimStrategy.bypassJitter ? 1 : null,
      opponentProfile,
    };
    if (aimStrategy.bypassJitter) return exact;
    const dx = Number(aimSource.x) - Number(self.x);
    const dy = Number(aimSource.y) - Number(self.y);
    const baseLimit = combatAimJitterLimit(distance, motionScale);
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const noDamageLevel = combatAimNoDamageLevel(damage.widenMs);
    const jitterLimit = combatAimNoDamageJitterLimit(baseLimit, noDamageLevel);
    const targetId = combatTargetId(aimSource);
    const previousAim = bot.combatAim;
    let sign = Math.sign(movement.lateralSpeed || 0);
    if (!sign && previousAim && String(previousAim.targetId || '') === targetId) sign = Math.sign(Number(previousAim.sign || 0));
    if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
    const noDamageBucket = noDamageLevel ? Math.floor(damage.widenMs / stepMs) + 1 : 0;
    const motionBucket = Math.round(motionScale * 10);
    const intercept = combatInterceptSolution(self, aimSource, distance, motionScale);
    const lockCompatible = previousAim
      && String(previousAim.targetId || '') === targetId
      && String(previousAim.movementMode || '') === movement.mode
      && String(previousAim.strategy || '') === String(aimStrategy.strategy || '')
      && Boolean(previousAim.passiveRunner) === Boolean(aimStrategy.passiveRunner)
      && Number(previousAim.noDamageBucket || 0) === noDamageBucket
      && Number(previousAim.motionBucket ?? motionBucket) === motionBucket
      && now() < Number(previousAim.until || 0);
    if (intercept) {
      const interceptStrategyReason = aimStrategy.passiveRunner
        ? (aimStrategy.reason || 'passive-runner-intercept')
        : (aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : 'quadratic-intercept');
      const interceptConfidence = clamp(Number(intercept.confidence || 0) * Number(opponentProfile.aimConfidenceScale || 1), 0.1, 1);
      let spreadAngle = 0;
      const locked = lockCompatible && Number.isFinite(Number(previousAim.spreadAngle));
      if (locked) {
        spreadAngle = Number(previousAim.spreadAngle);
        sign = Math.sign(Number(previousAim.sign || sign)) || sign;
      } else {
        const spreadScale = Math.max(0, Number(cfg.combatInterceptSpreadScale ?? 0.18))
          * (aimStrategy.passiveRunner
            ? Math.max(0, Number(cfg.combatPassiveRunnerInterceptSpreadScale ?? 0))
            : (aimStrategy.liveIntercept ? 0.35 : 1));
        const uncertainty = 1 - Math.max(0, Math.min(1, interceptConfidence));
        const randomLimit = jitterLimit * spreadScale * (0.35 + uncertainty) * (noDamageLevel ? 1.35 : 1);
        spreadAngle = (Math.random() * 2 - 1) * randomLimit;
        bot.combatAim = {
          targetId,
          angle: spreadAngle,
          spreadAngle,
          sign,
          movementMode: movement.mode,
          strategy: aimStrategy.strategy,
          passiveRunner: Boolean(aimStrategy.passiveRunner),
          noDamageBucket,
          motionBucket,
          intercept: true,
          until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
        };
      }
      const interceptDx = Number(intercept.x) - Number(self.x);
      const interceptDy = Number(intercept.y) - Number(self.y);
      const cos = Math.cos(spreadAngle);
      const sin = Math.sin(spreadAngle);
      const currentAngle = Math.atan2(dy, dx);
      const predictedAngle = Math.atan2(interceptDy, interceptDx);
      let relativeAngle = predictedAngle - currentAngle + spreadAngle;
      while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
      while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
      return {
        x: Number(self.x) + interceptDx * cos - interceptDy * sin,
        y: Number(self.y) + interceptDx * sin + interceptDy * cos,
        mode: 'intercept',
        moving,
        angle: relativeAngle,
        jitterLimit,
        distance,
        motionScale,
        movementMode: movement.mode,
        radialSpeed: movement.radialSpeed,
        lateralSpeed: movement.lateralSpeed,
        noDamageMs: damage.noDamageMs,
        noDamageWidened: Boolean(noDamageLevel),
        precisionAim: false,
        steadyAim: false,
        lockedAim: Boolean(locked),
        liveAim: Boolean(aimSource.nativeAimResolved),
        liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
        aimStrategy: aimStrategy.strategy,
        aimStrategyReason: interceptStrategyReason,
        sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
        sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
        serverStallAim: Boolean(aimStrategy.serverStall),
        liveInterceptAim: Boolean(aimStrategy.liveIntercept),
        realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
        radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
        fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
        passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
        interceptAim: true,
        interceptFlightTicks: intercept.flightTicks,
        interceptFlightMs: intercept.flightMs,
        interceptLeadDistance: intercept.leadDistance,
	        interceptConfidence,
	        aimConfidence: interceptConfidence,
	        opponentProfile
	      };
	    }
    let angle = 0;
    const locked = lockCompatible && Number.isFinite(Number(previousAim.angle));
    if (locked) {
      angle = Number(previousAim.angle);
      sign = Math.sign(Number(previousAim.sign || sign)) || sign;
    } else {
      const aimScale = clamp(Math.max(0.2, motionScale), 0.2, 1);
      const spreadScale = clamp(Math.max(0.35, motionScale), 0.35, 1);
      const minLead = Math.min(jitterLimit, Math.max(0, Number(cfg.combatAimLeadMinRadians) || 0) * aimScale);
      const lead = Math.min(jitterLimit, Math.max(minLead, jitterLimit * movement.leadScale * aimScale));
      const randomSpread = jitterLimit * (noDamageLevel ? 0.35 : 0.22) * spreadScale;
      angle = sign * lead + (Math.random() * 2 - 1) * randomSpread;
      if (Math.abs(angle) < minLead && minLead > 0) angle = sign * minLead;
      angle = clamp(angle, -jitterLimit, jitterLimit);
      bot.combatAim = {
        targetId,
        angle,
        sign,
        movementMode: movement.mode,
        strategy: aimStrategy.strategy,
        passiveRunner: Boolean(aimStrategy.passiveRunner),
        noDamageBucket,
        motionBucket,
        intercept: false,
        until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
      };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: Number(self.x) + dx * cos - dy * sin,
      y: Number(self.y) + dx * sin + dy * cos,
      mode: 'jitter',
      moving,
      angle,
      jitterLimit,
      distance,
      motionScale,
      movementMode: movement.mode,
      radialSpeed: movement.radialSpeed,
      lateralSpeed: movement.lateralSpeed,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: Boolean(noDamageLevel),
      precisionAim: false,
      steadyAim: false,
      lockedAim: Boolean(locked),
      liveAim: Boolean(aimSource.nativeAimResolved),
      liveDistance: aimSource.nativeAimResolved ? Math.round(distance) : null,
      aimStrategy: aimStrategy.strategy,
      aimStrategyReason: aimStrategy.liveIntercept
        ? (aimStrategy.reason || 'live-intercept')
        : (aimStrategy.passiveRunner ? (aimStrategy.reason || 'passive-runner-intercept') : 'intercept-fallback'),
      sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
      sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
      serverStallAim: Boolean(aimStrategy.serverStall),
      liveInterceptAim: Boolean(aimStrategy.liveIntercept),
      realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision),
      radialPrecisionAim: Boolean(aimStrategy.radialPrecision),
      fallbackPrecisionAim: Boolean(aimStrategy.fallbackPrecision),
      passiveRunnerAim: Boolean(aimStrategy.passiveRunner),
      interceptAim: false,
	      aimConfidence: Math.max(0.2, Math.min(0.7, Number(opponentProfile.aimConfidenceScale || 1) * (1 - Math.min(0.65, motionScale * 0.35)))),
	      opponentProfile
	    };
	  }

  function combatLeaveCoverAction(self, target, bullets, targetDistance = null) {
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

  function targetSwitchHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.targetSwitchDiagnosticsHistoryLimit || 24) || 24));
  }

  function targetSwitchOscillationWindowMs() {
    return Math.max(1000, Math.round(Number(cfg.targetSwitchOscillationWindowMs || 10000) || 10000));
  }

  function roundedNullable(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  ${actionPriorityBand.toString()}

  ${actionFocusTargetType.toString()}

  ${actionFocusId.toString()}

  ${actionFocusSummary.toString()}

  function ensureTargetSwitchDiagnostics() {
    if (!bot.targetSwitchDiagnostics || typeof bot.targetSwitchDiagnostics !== 'object') {
      bot.targetSwitchDiagnostics = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
    }
    if (!Array.isArray(bot.targetSwitchDiagnostics.events)) bot.targetSwitchDiagnostics.events = [];
    return bot.targetSwitchDiagnostics;
  }

  ${actionSwitchPairKey.toString()}

  ${buildPreviousDecisionSummary.toString()}

  ${recordActionSwitchDiagnosticsCore.toString()}

  function recordActionSwitchDiagnostics(action, source = '') {
    const state = ensureTargetSwitchDiagnostics();
    return recordActionSwitchDiagnosticsCore(action, state, {
      source,
      tickCount: bot.tickCount,
      previousDecision: bot.lastDecision,
      historyLimit: targetSwitchHistoryLimit(),
      oscillationWindowMs: targetSwitchOscillationWindowMs(),
      clone: safeJsonClone
    }).action;
  }

  function finalActionArbitrationHoldMs() {
    return Math.max(0, Math.round(Number(cfg.finalActionArbitrationHoldMs || 0) || 0));
  }

  function finalActionArbitrationHistoryLimit() {
    return Math.max(4, Math.round(Number(cfg.finalActionArbitrationHistoryLimit || 24) || 24));
  }

  function ensureFinalActionArbitration() {
    if (!bot.finalActionArbitration || typeof bot.finalActionArbitration !== 'object') {
      bot.finalActionArbitration = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
    }
    if (!Array.isArray(bot.finalActionArbitration.history)) bot.finalActionArbitration.history = [];
    return bot.finalActionArbitration;
  }

  ${finalActionBandRank.toString()}

  ${finalActionReusable.toString()}

  ${shouldHoldPreviousFinalAction.toString()}

  ${applyFinalActionArbitrationCore.toString()}

  function applyFinalActionArbitration(action, source = '') {
    const state = ensureFinalActionArbitration();
    return applyFinalActionArbitrationCore(action, state, {
      source,
      holdMs: finalActionArbitrationHoldMs(),
      historyLimit: finalActionArbitrationHistoryLimit(),
      clone: safeJsonClone
    }).action;
  }

  function setLastTarget(kind, id) {
    if (!id && id !== 0) return;
    if (!bot.lastTarget || bot.lastTarget.kind !== kind || String(bot.lastTarget.id) !== String(id)) {
      bot.lastTarget = { kind, id };
    }
    bot.lastTargetAt = now();
  }

  function clearCoinTracking(reason = '') {
    bot.coinProgress = null;
    bot.coinAttempts.clear();
    bot.coinApproachLock = null;
    bot.staleCoinEscape = null;
	    if (bot.lastTarget?.kind === 'coin') {
	      bot.lastTarget = null;
	      bot.lastTargetAt = 0;
	    }
	    clearOpportunityChoiceFor('coin');
	    bot.lastCoinClearReason = reason;
	  }

  ${coinTargetKeyCore.toString()}
  ${coinTargetDistance.toString()}
  ${coinMatchesTrackedTargetCore.toString()}
  ${trackedCoinTargetForCollectionCore.toString()}
  ${buildNativeCoinSnapshotCore.toString()}
  ${pointToSegmentDistanceCore.toString()}
  ${pickIncidentalCoinPickupsCore.toString()}
  ${snapshotCoinWorthLongTravelCore.toString()}
  ${snapshotCoinNavigationReasonCore.toString()}

  function coinTargetCoreOptions(extra = {}) {
    return {
      dist,
      coinCollectedPruneRadius: cfg.coinCollectedPruneRadius,
      coinCollectedConfirmDistance: cfg.coinCollectedConfirmDistance,
      incidentalCoinPickupMemoryMs: cfg.incidentalCoinPickupMemoryMs,
      snapshotCoinClusterMinCoins: cfg.snapshotCoinClusterMinCoins,
      snapshotSingleCoinMaxDistance: cfg.snapshotSingleCoinMaxDistance,
      snapshotSingleCoinDistancePerAmount: cfg.snapshotSingleCoinDistancePerAmount,
      globalCoinMaxDistance: cfg.globalCoinMaxDistance,
      coinMaxDistance: cfg.coinMaxDistance,
      isSnapshotOnlyCoin,
      ...extra
    };
  }

  function trackedCoinTargetForCollection(self) {
    return trackedCoinTargetForCollectionCore({
      lastDecision: bot.lastDecision,
      lastTarget: bot.lastTarget,
      coinProgress: bot.coinProgress
    }, self, coinTargetCoreOptions());
  }

  function coinTargetKey(target) {
    return coinTargetKeyCore(target);
  }

  function coinMatchesTrackedTarget(coin, target) {
    return coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions());
  }

  function trackedCoinStillVisible(target) {
    const nativeCoinList = getNativeCoinList();
    if (!Array.isArray(nativeCoinList)) return null;
    return nativeCoinList
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean)
      .some(coin => coinMatchesTrackedTarget(coin, target));
  }

  function nativeCoinSnapshot() {
    const nativeCoinList = getNativeCoinList();
    if (!Array.isArray(nativeCoinList)) return null;
    const coins = nativeCoinList
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean);
    return buildNativeCoinSnapshotCore(coins, coinTargetCoreOptions({ nowMs: Date.now() }));
  }

  function rememberNativeCoinSnapshot(snapshot = null) {
    const next = Array.isArray(snapshot) ? snapshot : nativeCoinSnapshot();
    if (Array.isArray(next)) bot.lastNativeCoinSnapshot = next.slice(-160);
    return next;
  }

  function recordSessionCoinPickup(target, amount, currentSummary, previousCoins, reason) {
    const value = Math.max(0, Math.round(Number(amount || 0)));
    if (!value) return false;
    updateSessionStats(currentSummary);
    const session = bot.session || (bot.session = {});
    const t = Date.now();
    const key = coinTargetKey(target);
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    session.coinPickupKeys = session.coinPickupKeys
      .filter(item => item && t - Number(item.at || 0) <= 60000)
      .slice(-80);
    if (key && session.coinPickupKeys.some(item => String(item.key || '') === key && t - Number(item.at || 0) <= 5000)) {
      return false;
    }
    if (key) pushBounded(session.coinPickupKeys, { key, at: t, amount: value, reason: reason || '' }, 80);
    recordDropMatchedKill(target, value, currentSummary, reason);
    session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + value;
    const coinDiff = Math.max(0, Math.round(Number(currentSummary?.coins || 0) - Number(previousCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    upsertImportantSessionRecord(session, currentSummary, { at: t });
    return true;
  }

  function recordIncidentalCoinPickups(self, currentSummary, previousSelf, previousCoins) {
    const previousSnapshot = Array.isArray(bot.lastNativeCoinSnapshot) ? bot.lastNativeCoinSnapshot : [];
    const currentSnapshot = nativeCoinSnapshot();
    if (!Array.isArray(currentSnapshot)) return false;
    const t = Date.now();
    let recorded = false;
    const incidentalPickups = pickIncidentalCoinPickupsCore(
      previousSnapshot,
      currentSnapshot,
      currentSummary,
      previousSelf,
      coinTargetCoreOptions({ nowMs: t })
    );
    for (const pickup of incidentalPickups) {
      const coin = pickup.coin;
      const currentDistance = pickup.currentDistance;
      const sessionRecorded = recordSessionCoinPickup({
        id: coin.id || coin.key,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: currentDistance
      }, coin.amount, currentSummary, previousCoins, 'incidental-coin-disappeared');
      recorded = Boolean(recorded || sessionRecorded);
      if (sessionRecorded) {
        bot.lastCoinCollected = {
          id: coin.id || coin.key,
          amount: coin.amount,
          distance: Number.isFinite(currentDistance) ? Math.round(currentDistance) : null,
          previousCoins,
          currentCoins: Number(currentSummary?.coins || 0),
          pruned: 0,
          confirmReason: 'incidental-coin-disappeared',
          sessionRecorded,
          at: t
        };
      }
    }
    rememberNativeCoinSnapshot(currentSnapshot);
    return recorded;
  }

  function pruneCollectedSnapshotCoin(target) {
    const id = target?.id === undefined || target?.id === null ? '' : String(target.id);
    const x = Number(target?.x);
    const y = Number(target?.y);
    const hasPoint = Number.isFinite(x) && Number.isFinite(y);
    if (!id && !hasPoint) return 0;
	    const before = arrayCount(bot.globalState.coinDrops);
	    bot.globalState.coinDrops = (Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : []).filter(raw => {
      const coin = normalizeCoinDrop(raw, 'snapshot');
      if (!coin) return false;
      if (id && String(coin.drop_id) === id) return false;
      if (hasPoint && dist({ x, y }, coin) <= Number(cfg.coinCollectedPruneRadius || 0)) return false;
      return true;
    });
	    return before - arrayCount(bot.globalState.coinDrops);
  }

  function markCoinCollected(self, currentSummary, previousCoins) {
    const target = trackedCoinTargetForCollection(self);
    if (!target) return false;
    const id = target.id === undefined || target.id === null ? '' : String(target.id);
    const distance = Number(target.distance);
    if (Number.isFinite(distance) && distance > Number(cfg.coinCollectedConfirmDistance || 0)) return false;
    const currentCoins = Number(currentSummary?.coins || 0);
    const coinDelta = Math.max(0, Math.round(currentCoins - Number(previousCoins || 0)));
    const visible = trackedCoinStillVisible(target);
    const confirmed = coinDelta > 0 || visible === false;
    if (!confirmed) return false;
    const amount = Math.max(0, Math.round(Number(target.amount || 0))) || coinDelta;
    if (!amount) return false;
    const t = now();
    if (id) {
      bot.ignoredCoins.set(id, t + Number(cfg.coinCollectedIgnoreMs || 0));
      bot.coinAttempts.delete(id);
    }
    const pruned = pruneCollectedSnapshotCoin(target);
    const confirmReason = coinDelta > 0 ? 'coins-increased' : 'coin-disappeared';
    const sessionRecorded = recordSessionCoinPickup(target, amount, currentSummary, previousCoins, confirmReason);
    bot.lastCoinCollected = {
      id,
      amount,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      previousCoins,
      currentCoins,
      pruned,
      confirmReason,
      sessionRecorded,
      at: Date.now()
    };
    clearCoinTracking(confirmReason);
    rememberNativeCoinSnapshot();
    return true;
  }

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
