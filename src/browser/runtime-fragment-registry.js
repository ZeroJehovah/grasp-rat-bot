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

function browserRuntimeFragmentEntries(config) {
  return [
    ['runtime-bootstrap', () => runtimeBootstrapSource(config)],
    ['runtime-state-bindings', () => runtimeStateBindingsSource(config)],
    ['separator-after-runtime-state-bindings',
    `

`],
    ['bot-object', () => botObjectSource(config)],
    ['separator-after-bot-object',
    `

`],
    ['entity-activity', entityActivitySource],
    ['separator-after-entity-activity',
    `
`],
    ['target-whitelist', targetWhitelistSource],
    ['separator-after-target-whitelist',
    `
`],
    ['stamina-runtime', staminaRuntimeSource],
    ['separator-after-stamina-runtime',
    `
`],
    ['attack-worth', () => attackWorthSource(config)],
    ['separator-after-attack-worth',
    `
`],
    ['exit-motion', () => exitMotionSource(config)],
    ['separator-after-exit-motion',
    `

`],
    ['target-overlay', targetOverlaySource],
    ['separator-after-target-overlay',
    `

    `],
    ['status-panel-runtime', () => statusPanelSource(config)],
    ['runtime-utility-prelude', () => runtimeUtilityPreludeSource(config)],
    ['combat-log-runtime', () => combatLogSource(config)],
    ['separator-after-combat-log-runtime',
    `
`],
    ['tick-safety', () => tickSafetySource(config)],
    ['separator-before-control-login-runtime',
    `

			`],
    ['control-login-runtime', () => controlLoginSource(config)],
    ['separator-after-control-login-runtime',
    `

`],
    ['page-native-snapshot', () => pageNativeSnapshotSource(config)],
    ['separator-after-page-native-snapshot',
    `

`],
    ['exit-relogin', () => exitReloginSource(config)],
    ['separator-after-exit-relogin',
    `
`],
    ['pending-exit', () => pendingExitSource(config)],
    ['leave-command', () => leaveCommandSource(config)],
    ['auto-login', autoLoginSource],
    ['leave-flow', () => leaveFlowSource(config)],
    ['native-state', nativeStateSource],
    ['separator-after-native-state',
    `

`],
    ['runtime-summary', runtimeSummarySource],
    ['separator-after-runtime-summary',
    `

`],
    ['network-quality', networkQualitySource],
    ['separator-after-network-quality',
    `

`],
    ['network-quality-summary', networkQualitySummarySource],
    ['separator-after-network-quality-summary',
    `

`],
    ['important-log', importantLogSource],
    ['separator-after-important-log',
    `
`],
    ['combat-history', () => combatHistorySource(config)],
    ['separator-after-combat-history',
    `
`],
    ['entity-refresh', () => entityRefreshSource(config)],
    ['native-control', nativeControlSource],
    ['separator-after-native-control',
    `

`],
    ['coin-motion-runtime', () => coinMotionRuntimeSource(config)],
    ['separator-after-coin-motion-runtime',
    `

`],
    ['return-block', returnBlockSource],
    ['separator-after-return-block',
    `

`],
    ['classify', classifySource],
    ['offline-safety', offlineSafetySource],
    ['separator-after-offline-safety',
    `
	`],
    ['coin-safety', () => coinSafetySource(config)],
    ['target-selection', targetSelectionSource],
    ['combat-movement', combatMovementSource],
    ['combat-aim', combatAimSource],
    ['opportunity-stamina', () => opportunityStaminaSource(config)],
    ['separator-after-opportunity-stamina',
    `
`],
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
    ['separator-after-opportunity-clear',
    `

`],
    ['coin-progress-runtime', () => coinProgressRuntimeSource(config)],
    ['separator-after-coin-progress-runtime',
    `
`],
    ['action-arbitration', () => actionArbitrationSource(config)],
    ['separator-after-action-arbitration',
    `
`],
    ['coin-target-runtime', () => coinTargetRuntimeSource(config)],
    ['separator-after-coin-target-runtime',
    `
`],
    ['choose-action', () => chooseActionSource(config)],
    ['separator-after-choose-action',
    `

`],
    ['tick', () => tickSource(config)],
    ['separator-after-tick',
    `

`],
    ['startup', startupSource]
  ];
}

module.exports = {
  browserRuntimeFragmentEntries
};
