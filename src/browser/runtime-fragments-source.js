'use strict';

const { runtimeBootstrapSource } = require('./runtime-bootstrap-source');
const { targetOverlaySource } = require('./target-overlay-source');
const { targetWhitelistSource } = require('./target-whitelist-source');
const { statusPanelRuntimeSource } = require('./status-panel-runtime-source');
const { arrayCountSource } = require('./array-count-source');
const {
  runtimeUtilityPreludeSource,
  runtimeUtilityCloneSource
} = require('./runtime-utils-source');
const { combatLogRuntimeSource } = require('./combat-log-runtime-source');
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
const { controlLoginRuntimeSource } = require('./control-login-runtime-source');
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
const { restoredRuntimeStateSource } = require('./restored-runtime-state-source');
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

function runtimeFragment(name, source) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('runtime fragment name must be a non-empty string');
  }
  if (source === undefined || source === null) {
    throw new TypeError(`runtime fragment ${name} source is required`);
  }
  return { name, source };
}

function materializeRuntimeFragments(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('runtime fragment entries must be an array');
  }
  return entries.map(([name, source]) => runtimeFragment(name, source));
}

function browserRuntimeFragmentEntries(config) {
  return [
    ['runtime-iife-open',
    `
(() => {`],
    ['runtime-bootstrap', () => runtimeBootstrapSource(config)],
    ['persistent-last-self', persistentLastSelfSource],
    ['separator-after-persistent-last-self',
    `
`],
    ['persistent-exit', persistentExitSource],
    ['separator-after-persistent-exit',
    `
`],
    ['persistent-clear', persistentClearSource],
    ['separator-after-persistent-clear',
    `
`],
    ['pending-exit-persistence', pendingExitPersistenceSource],
    ['separator-after-pending-exit-persistence',
    `
`],
    ['refresh-exit-detail', refreshExitDetailSource],
    ['separator-after-refresh-exit-detail',
    `
`],
    ['restored-coin-failures', restoredCoinFailuresSource],
    ['restored-runtime-state', restoredRuntimeStateSource],
    ['login-snapshot-gate', loginSnapshotGateSource],
    ['separator-after-login-snapshot-gate',
    `
`],
    ['runtime-diagnostics', runtimeDiagnosticsSource],
    ['separator-after-runtime-diagnostics',
    `

`],
    ['bot-object', botObjectSource],
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
    ['attack-worth', attackWorthSource],
    ['separator-after-attack-worth',
    `
`],
    ['exit-motion', exitMotionSource],
    ['separator-after-exit-motion',
    `

`],
    ['target-overlay', targetOverlaySource],
    ['separator-after-target-overlay',
    `

`],
    ['status-panel-runtime', () => statusPanelRuntimeSource(config)],
    ['runtime-utility-prelude', () => runtimeUtilityPreludeSource(config)],
    ['array-count', () => arrayCountSource(config)],
    ['runtime-utility-clone', () => runtimeUtilityCloneSource(config)],
    ['combat-log-runtime', () => combatLogRuntimeSource(config)],
    ['separator-after-combat-log-runtime',
    `
`],
    ['tick-safety', tickSafetySource],
    ['separator-before-control-login-runtime',
    `

			`],
    ['control-login-runtime', () => controlLoginRuntimeSource(config)],
    ['separator-after-control-login-runtime',
    `

`],
    ['page-native-snapshot', pageNativeSnapshotSource],
    ['separator-after-page-native-snapshot',
    `

`],
    ['exit-relogin', exitReloginSource],
    ['separator-after-exit-relogin',
    `
`],
    ['pending-exit', pendingExitSource],
    ['leave-command', leaveCommandSource],
    ['auto-login', autoLoginSource],
    ['leave-flow', leaveFlowSource],
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
    ['combat-history', combatHistorySource],
    ['separator-after-combat-history',
    `
`],
    ['entity-refresh', entityRefreshSource],
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
    ['opportunity-stamina', opportunityStaminaSource],
    ['separator-after-opportunity-stamina',
    `
`],
    ['combat-state', combatStateSource],
    ['combat-fire', combatFireSource],
    ['combat-leave-cover', combatLeaveCoverSource],
    ['combat-action', combatActionSource],
    ['opportunity-snapshot', opportunitySnapshotSource],
    ['opportunity-candidate', opportunityCandidateSource],
    ['post-attack', postAttackSource],
    ['opportunity-actions', opportunityActionsSource],
    ['opportunity-choice', opportunityChoiceSource],
    ['opportunity-pick', opportunityPickSource],
    ['patrol', patrolSource],
    ['opportunity-clear', opportunityClearSource],
    ['separator-after-opportunity-clear',
    `

`],
    ['coin-progress-runtime', () => coinProgressRuntimeSource(config)],
    ['separator-after-coin-progress-runtime',
    `
`],
    ['action-arbitration', actionArbitrationSource],
    ['separator-after-action-arbitration',
    `
`],
    ['coin-target-runtime', () => coinTargetRuntimeSource(config)],
    ['separator-after-coin-target-runtime',
    `
`],
    ['choose-action', chooseActionSource],
    ['separator-after-choose-action',
    `

`],
    ['tick', tickSource],
    ['separator-after-tick',
    `

`],
    ['startup', startupSource],
    ['runtime-iife-close',
    `
	})()
`
    ]
  ];
}

function browserRuntimeFragments(config) {
  return materializeRuntimeFragments(browserRuntimeFragmentEntries(config));
}

module.exports = {
  runtimeFragment,
  materializeRuntimeFragments,
  browserRuntimeFragmentEntries,
  browserRuntimeFragments
};
