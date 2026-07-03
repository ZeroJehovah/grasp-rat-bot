'use strict';

const {
  staminaExhaustedWindowLabel,
  combatLogExitSummaryFromDecision
} = require('../shared/exit-summary');
const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('../shared/runtime-utils');
const {
  escapeHtml,
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('../shared/display-format');
const { runtimeBootstrapSource } = require('./runtime-bootstrap-source');
const { targetOverlaySource } = require('./target-overlay-source');
const { targetWhitelistSource } = require('./target-whitelist-source');
const { statusPanelSource } = require('./status-panel-source');
const { arrayCountSource } = require('./array-count-source');
const { combatLogSource } = require('./combat-log-source');
const { tickSafetySource } = require('./tick-safety-source');
const { importantLogSource } = require('./important-log-source');
const { combatHistorySource } = require('./combat-history-source');
const { entityRefreshSource } = require('./entity-refresh-source');
const { classifySource } = require('./classify-source');
const { coinSafetySource } = require('./coin-safety-source');
const { targetSelectionSource } = require('./target-selection-source');
const { combatMovementSource } = require('./combat-movement-source');
const { combatAimSource } = require('./combat-aim-source');
const { combatStateSource } = require('./combat-state-source');
const { combatFireSource } = require('./combat-fire-source');
const { combatLeaveCoverSource } = require('./combat-leave-cover-source');
const { combatActionSource } = require('./combat-action-source');
const { opportunityStaminaSource } = require('./opportunity-stamina-source');
const { opportunitySnapshotSource } = require('./opportunity-snapshot-source');
const { postAttackSource } = require('./post-attack-source');
const { opportunityActionsSource } = require('./opportunity-actions-source');
const { opportunityCandidateSource } = require('./opportunity-candidate-source');
const { opportunityChoiceSource } = require('./opportunity-choice-source');
const { opportunityPickSource } = require('./opportunity-pick-source');
const { patrolSource } = require('./patrol-source');
const { opportunityClearSource } = require('./opportunity-clear-source');
const { coinProgressRuntimeSource } = require('./coin-progress-runtime-source');
const { coinTargetRuntimeSource } = require('./coin-target-runtime-source');
const { chooseActionSource } = require('./choose-action-source');
const { tickSource } = require('./tick-source');
const { startupSource } = require('./startup-source');
const { botObjectSource } = require('./bot-object-source');
const { controlLoginSource } = require('./control-login-source');
const { nativeStateSource } = require('./native-state-source');
const { nativeControlSource } = require('./native-control-source');
const { coinMotionRuntimeSource } = require('./coin-motion-runtime-source');
const { returnBlockSource } = require('./return-block-source');
const { entityActivitySource } = require('./entity-activity-source');
const { staminaRuntimeSource } = require('./stamina-runtime-source');
const { attackWorthSource } = require('./attack-worth-source');
const { exitMotionSource } = require('./exit-motion-source');
const { persistentLastSelfSource } = require('./persistent-last-self-source');
const { persistentExitSource } = require('./persistent-exit-source');
const { persistentClearSource } = require('./persistent-clear-source');
const { pendingExitPersistenceSource } = require('./pending-exit-persistence-source');
const { refreshExitDetailSource } = require('./refresh-exit-detail-source');
const { restoredCoinFailuresSource } = require('./restored-coin-failures-source');
const { loginSnapshotGateSource } = require('./login-snapshot-gate-source');
const { runtimeDiagnosticsSource } = require('./runtime-diagnostics-source');
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
function browserBotSource(config) {
  return `
(() => {${runtimeBootstrapSource(config)}${persistentLastSelfSource()}
${persistentExitSource()}
${persistentClearSource()}
${pendingExitPersistenceSource()}
${refreshExitDetailSource()}
${restoredCoinFailuresSource()}

			  const restoredFailures = restoredCoinFailures();
			  const restoredEnemyLeaveState = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
			  const restoredOfflineLeaveState = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
			  const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot });
			  const initialPendingExitState = chooseInitialPendingExitState(preserved.pendingExit, restoredPendingExitState, Date.now(), { markReloaded: !previousBot });
${loginSnapshotGateSource()}
${runtimeDiagnosticsSource()}

${botObjectSource()}

${entityActivitySource()}
${targetWhitelistSource()}
${staminaRuntimeSource()}
${attackWorthSource()}
${exitMotionSource()}

${targetOverlaySource()}

${statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay })}

      ${safeStringify.toString()}
${arrayCountSource()}

      ${safeJsonClone.toString()}

      ${sanitizeCombatLogIdPart.toString()}

${combatLogSource({ combatLogExitSummaryFromDecision })}
${tickSafetySource()}

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
	${coinSafetySource()}${targetSelectionSource()}${combatMovementSource()}${combatAimSource()}${opportunityStaminaSource()}
${combatStateSource()}${combatFireSource()}${combatLeaveCoverSource()}${combatActionSource()}${opportunitySnapshotSource()}${opportunityCandidateSource()}${postAttackSource()}${opportunityActionsSource()}${opportunityChoiceSource()}${opportunityPickSource()}${patrolSource()}${opportunityClearSource()}

${coinProgressRuntimeSource()}
${actionArbitrationSource()}
${coinTargetRuntimeSource()}
${chooseActionSource()}

${tickSource()}

${startupSource()}
	})()
`;
}

module.exports = {
  browserBotSource
};
