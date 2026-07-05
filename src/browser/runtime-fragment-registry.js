'use strict';

const { runtimeBootstrapSource } = require('./runtime-bootstrap-source');
const { targetOverlaySource } = require('./target-overlay-source');
const { targetWhitelistSource } = require('./target-whitelist-source');
const { statusPanelSource } = require('./status-panel-source');
const {
  runtimeUtilityPreludeSource
} = require('./runtime-utils-source');
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
const { runtimeStateBindingsSource } = require('./runtime-state-bindings-source');
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

function browserRuntimeFragmentEntries(config) {
  return [
    ['runtime-bootstrap', () => runtimeBootstrapSource(config)],
    ['runtime-state-bindings', () => runtimeStateBindingsSource(config)],
    ['bot-object', () => botObjectSource(config)],
    ['entity-activity', entityActivitySource],
    ['target-whitelist', targetWhitelistSource],
    ['stamina-runtime', staminaRuntimeSource],
    ['attack-worth', () => attackWorthSource(config)],
    ['exit-motion', () => exitMotionSource(config)],
    ['target-overlay', targetOverlaySource],
    ['status-panel-runtime', () => statusPanelSource(config)],
    ['runtime-utility-prelude', () => runtimeUtilityPreludeSource(config)],
    ['combat-log-runtime', () => combatLogSource(config)],
    ['tick-safety', () => tickSafetySource(config)],
    ['control-login-runtime', () => controlLoginSource(config)],
    ['page-native-snapshot', () => pageNativeSnapshotSource(config)],
    ['pending-exit', () => pendingExitSource(config)],
    ['leave-command', () => leaveCommandSource(config)],
    ['auto-login', autoLoginSource],
    ['leave-flow', () => leaveFlowSource(config)],
    ['native-state', nativeStateSource],
    ['runtime-summary', runtimeSummarySource],
    ['network-quality', networkQualitySource],
    ['network-quality-summary', networkQualitySummarySource],
    ['important-log', importantLogSource],
    ['combat-history', () => combatHistorySource(config)],
    ['entity-refresh', () => entityRefreshSource(config)],
    ['native-control', nativeControlSource],
    ['coin-motion-runtime', () => coinMotionRuntimeSource(config)],
    ['return-block', returnBlockSource],
    ['classify', classifySource],
    ['offline-safety', offlineSafetySource],
    ['coin-safety', () => coinSafetySource(config)],
    ['target-selection', targetSelectionSource],
    ['combat-movement', combatMovementSource],
    ['combat-aim', combatAimSource],
    ['opportunity-stamina', () => opportunityStaminaSource(config)],
    ['combat-state', () => combatStateSource(config)],
    ['combat-fire', combatFireSource],
    ['combat-leave-cover', combatLeaveCoverSource],
    ['combat-action', () => combatActionSource(config)],
    ['opportunity-snapshot', () => opportunitySnapshotSource(config)],
    ['opportunity-candidate', () => opportunityCandidateSource(config)],
    ['post-attack', () => postAttackSource(config)],
    ['opportunity-actions', () => opportunityActionsSource(config)],
    ['opportunity-choice', () => opportunityChoiceSource(config)],
    ['opportunity-pick', () => opportunityPickSource(config)],
    ['patrol', () => patrolSource(config)],
    ['opportunity-clear', () => opportunityClearSource(config)],
    ['coin-progress-runtime', () => coinProgressRuntimeSource(config)],
    ['action-arbitration', () => actionArbitrationSource(config)],
    ['coin-target-runtime', () => coinTargetRuntimeSource(config)],
    ['choose-action', () => chooseActionSource(config)],
    ['tick', () => tickSource(config)],
    ['startup', startupSource]
  ];
}

module.exports = {
  browserRuntimeFragmentEntries
};
