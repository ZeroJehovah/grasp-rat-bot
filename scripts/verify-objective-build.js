#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bundledRemoteSourceFor } = require('./remote-bot-bundle');

const ROOT = path.resolve(__dirname, '..');

const RUNTIME_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js',
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const REMOTE_BOT_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js'
];

const BOOTSTRAP_FILES = [
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const NUMERIC_INVARIANTS = [
  { key: 'postLoginZoomOutClicks', value: 5 },
  { key: 'postLoginZoomFitRadiusCm', value: 50000 },
  { key: 'postLoginZoomFitTargetRatio', value: 0.96 },
  { key: 'postLoginZoomFitTolerance', value: 0.05 },
  { key: 'postLoginZoomFitPaddingPx', value: 16 },
  { key: 'postLoginZoomFitMaxSteps', value: 24 },
  { key: 'postLoginZoomWheelDeltaY', value: 100 },
  { key: 'postLoginZoomStartDelayMs', value: 350 },
  { key: 'postLoginZoomOutIntervalMs', value: 80 },
  { key: 'postLoginZoomArmMissingMs', value: 1000 },
  { key: 'unsafeExitReloginMinDelayMs', value: 0 },
  { key: 'staminaBudgetReloginDelayMs', value: 1800000 },
  { key: 'leaveRetryMinMs', value: 10000 },
  { key: 'leaveCommandTimeoutMs', value: 3000 },
  { key: 'leave403ReloginDelayMs', value: 3600000 },
  { key: 'leave403SnapshotSuccessRequired', value: 5 },
  { key: 'sessionMismatchRecoveryReloadMaxAgeMs', value: 120000 },
  { key: 'pendingExitPersistMaxMs', value: 3600000 },
  { key: 'leaveSuccessReloadUnknownGraceMs', value: 12000 },
  { key: 'loginPointSafetySuccessRequired', value: 3 },
  { key: 'loginPointSafetyRadius', value: 30000 },
  { key: 'loginPointSafetyHealthyRadius', value: 17000 },
  { key: 'loginPointSafetyHealthyHpThreshold', value: 80 },
  { key: 'gameSessionNoSelfLeaveMs', value: 30000 },
  { key: 'nativeCoinAuthoritativeRadius', value: 50000 },
  { key: 'opportunityVisibleDistance', value: 50000 },
  { key: 'opportunityNearbyPriorityDistance', value: 50000 },
  { key: 'afkRecentActivityCooldownMs', value: 12000 },
  { key: 'opportunityOscillationSwitchLimit', value: 5 },
  { key: 'attackApproachRange', value: 50000 },
  { key: 'globalAttackMaxDistance', value: 50000 },
  { key: 'globalCoinMaxDistance', value: 50000 },
  { key: 'coinDiagnosticsNearDistance', value: 50000 },
  { key: 'coinDiagnosticsMaxEntries', value: 8 },
  { key: 'postAttackRecoveryDropMaxDistance', value: 50000 },
  { key: 'postAttackRecoveryDropMinScore', value: 60000 },
  { key: 'postAttackDropWaitMs', value: 1000 },
  { key: 'postAttackDropResolveMaxMs', value: 5000 },
  { key: 'postAttackDropWaitMinDrop', value: 8 },
  { key: 'postAttackDropWaitMaxDistance', value: 50000 },
  { key: 'postAttackDropWaitStopDistance', value: 900 },
  { key: 'killChatAttackMatchMs', value: 120000 },
  { key: 'killAttributionMergeMs', value: 120000 },
  { key: 'page403ErrorReloadMs', value: 600000 },
  { key: 'combatAttackRange', value: 14500 },
  { key: 'combatDisengageRange', value: 17000 },
  { key: 'combatLowValueActiveDropMax', value: 4 },
  { key: 'combatProactiveActiveKillStaminaBudgetMs', value: 100000 },
  { key: 'highValueCoinPriorityAmount', value: 10 },
  { key: 'highValueCoinPriorityHealthyHp', value: 50 },
  { key: 'combatRetreatEdgeRange', value: 13800 },
  { key: 'combatRetreatRadialSpeedMin', value: 5 },
  { key: 'combatRetreatDistanceDeltaMin', value: 600 },
  { key: 'combatRetreatIgnoreMs', value: 15000 },
  { key: 'combatFinishPressureSelfHpMin', value: 90 },
  { key: 'combatFinishPressureTargetHpMax', value: 55 },
  { key: 'combatFinishPressureCloseRange', value: 6500 },
  { key: 'combatFinishPressureShootEveryMs', value: 360 },
  { key: 'combatLowHpCloseRiskMargin', value: 5 },
  { key: 'combatDisadvantageConfirmMs', value: 2500 },
  { key: 'combatDisadvantageMinEngageMs', value: 3500 },
  { key: 'combatDisadvantageMinSamples', value: 4 },
  { key: 'combatTradeEstimateNoDamageSafeSelfHp', value: 75 },
  { key: 'combatTradeEstimateNoDamageUnsafeTDeathMs', value: 30000 },
  { key: 'combatSpacingEmergencyRange', value: 3000 },
  { key: 'combatSpacingLowHpThreshold', value: 70 },
  { key: 'combatPressureCloseMinHp', value: 60 },
  { key: 'combatFarNoDamageCloseMs', value: 6000 },
  { key: 'combatFarNoDamageCloseStartRange', value: 10000 },
  { key: 'combatFarNoDamageCloseRange', value: 7500 },
  { key: 'combatFarNoDamageCloseMinHp', value: 60 },
  { key: 'combatFarNoDamageCloseMaxHpGap', value: 10 },
  { key: 'combatRetreatingFighterCloseMinHp', value: 60 },
  { key: 'combatRetreatingFighterCloseMaxHpGap', value: 10 },
  { key: 'combatOutOfRangeFinishPressureRange', value: 16000 },
  { key: 'combatOutOfRangeFinishPressureSelfHpMin', value: 55 },
  { key: 'combatOutOfRangeFinishPressureTargetHpMax', value: 55 },
  { key: 'combatOutOfRangeFinishPressureMaxHpGap', value: 0 },
  { key: 'combatOutOfRangeFinishPressureRecentDamageMs', value: 10000 },
  { key: 'combatOutOfRangeReengageRange', value: 15000 },
  { key: 'combatOutOfRangeReengageMinHp', value: 60 },
  { key: 'combatOutOfRangeReengageMaxHpGap', value: 10 },
  { key: 'combatOutOfRangePressureReengageMaxHpGap', value: 20 },
  { key: 'combatOutOfRangeReengageRecentInRangeMs', value: 2500 },
  { key: 'combatPassiveRunnerCloseRange', value: 4500 },
  { key: 'combatOpponentProbeMs', value: 6000 },
  { key: 'combatOpponentProbeReserveMs', value: 5600 },
  { key: 'combatOpponentProbeEveryMs', value: 520 },
  { key: 'combatShootEveryMs', value: 160 },
  { key: 'combatShootReserveMs', value: 5600 },
  { key: 'combatShootDodgeReserveMs', value: 3800 },
  { key: 'combatShootHighHpDodgeReserveMs', value: 3000 },
  { key: 'combatShootHighHpMinHp', value: 90 },
  { key: 'combatShootPassiveRunnerDodgeReserveMs', value: 1800 },
  { key: 'combatShootFinishLowThreatDodgeReserveMs', value: 1800 },
  { key: 'combatShootFinishLowThreatMinHp', value: 90 },
  { key: 'combatShootFinishLowThreatTargetHpMax', value: 55 },
  { key: 'combatShootFinishLowThreatMaxHpGap', value: 0 },
  { key: 'combatShootFinishLowThreatRange', value: 8500 },
  { key: 'combatShootWinningPressureDodgeReserveMs', value: 1800 },
  { key: 'combatShootWinningPressureMinHp', value: 60 },
  { key: 'combatShootWinningPressureTargetHpMax', value: 75 },
  { key: 'combatShootWinningPressureLeadHp', value: 5 },
  { key: 'combatShootWinningPressureRange', value: 11000 },
  { key: 'combatShootWinningPressureNoDamageMs', value: 6000 },
  { key: 'combatShootSteadyAimDodgeReserveMs', value: 3000 },
  { key: 'combatShootSteadyAimNoDamageMs', value: 6000 },
  { key: 'combatShootSteadyAimMinHp', value: 75 },
  { key: 'combatShootSteadyAimMaxHpGap', value: 15 },
  { key: 'combatShootHardReserveMs', value: 1800 },
  { key: 'combatShootConserveEveryMs', value: 360 },
  { key: 'combatShootRecoveryEveryMs', value: 700 },
  { key: 'combatNativeTickMinMs', value: 80 },
  { key: 'globalSamplingOutageMinErrors', value: 1 },
  { key: 'globalSamplingOutageMinAgeMs', value: 0 },
  { key: 'combatTickGapOfflineMs', value: 5000 },
  { key: 'directWsVelocityRepeatMs', value: 50 },
  { key: 'directWsVelocityRepeatHoldMs', value: 220 },
  { key: 'directWsStopRepeatCount', value: 3 },
  { key: 'combatAimFallbackPrecisionNoDamageMs', value: 25000 },
  { key: 'combatAimLiveDivergencePrecisionCm', value: 1200 },
  { key: 'combatAimLiveDivergencePrecisionRatio', value: 0.08 },
  { key: 'combatAimRadialPrecisionLateralRatio', value: 0.35 },
  { key: 'combatServerStallNoDamagePrecisionGraceMs', value: 10000 },
  { key: 'combatPressureNoDamageExitHpThreshold', value: 80 },
  { key: 'combatPressureNoDamageExitTargetHpMin', value: 75 },
  { key: 'combatAimSteadyNoDamageMs', value: 6000 },
  { key: 'combatAimSteadySpeedMax', value: 5 },
  { key: 'targetWhitelistPollMs', value: 10000 },
  { key: 'targetWhitelistTimeoutMs', value: 7000 },
  { key: 'targetWhitelistMaxNames', value: 100 }
];

const results = [];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail: detail || '' });
  } catch (err) {
    results.push({ ok: false, name, detail: err && err.message ? err.message : String(err) });
  }
}

function expectObjectNumber(text, key, value) {
  const re = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)`, 'i');
  const match = re.exec(text);
  if (!match) return false;
  return Number(match[1]) === Number(value);
}

function stringFromCodes(codes) {
  return String.fromCharCode(...codes);
}

function functionBody(text, name) {
  const marker = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`);
  const match = marker.exec(text);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} function not found`);
  const paren = text.indexOf('(', start);
  assert(paren >= 0, `${name} parameter list not found`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = paren; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = i + 1;
        break;
      }
    }
  }
  assert(bodyStart >= 0, `${name} parameter list not closed`);
  const open = text.indexOf('{', bodyStart);
  assert(open >= 0, `${name} function body not found`);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`${name} function body not closed`);
}

function countMatches(text, re) {
  const matches = String(text || '').match(re);
  return matches ? matches.length : 0;
}

function generateRemoteBuild(manifest) {
  const statusEvery = Number(manifest.statusEvery) === 0
    ? 0
    : Number(manifest.statusEvery || 1000);
  return bundledRemoteSourceFor({
    statusEvery,
    version: String(manifest.version || ''),
  });
}

function extractSingle(text, re, label) {
  const match = String(text || '').match(re);
  assert(match && match[1], `${label} missing`);
  return String(match[1]);
}

function main() {
  const rootPackage = readJson('package.json');
  const manifest = readJson('dist/manifest.json');
  const targetWhitelistConfig = readJson('dist/target-whitelist.json');
  const distSource = readText('dist/grasp-rat-remote-bot.js');
  const sourceBot = readText('grasp-rat-bot.js');
  const runtimeSourceModule = readText('src/browser/runtime-source.js');
  const runtimeFragmentsSourceModule = readText('src/browser/runtime-fragments-source.js');
  const runtimeBootstrapSourceModule = readText('src/browser/runtime-bootstrap-source.js');
  const nodeSelfTestSource = readText('src/node/run-self-test.js');
  const buildRemoteSource = readText('scripts/build-remote-bot.js');
  const remoteBundleSource = readText('scripts/remote-bot-bundle.js');
  const bundlerSpikeBuildSource = readText('scripts/build-bundler-spike.js');
  const remoteBundledBuildSource = readText('scripts/build-remote-bot-bundled.js');
  const bundlerSpikeEntrySource = readText('src/bundler-spike/runtime-entry.mjs');
  const browserPageGlobalCoreSource = readText('src/browser/page-global-core.js');
  const targetWhitelistRuntimeModule = readText('src/browser/runtime/target-whitelist.js');
  const exitSummaryRuntimeModule = readText('src/browser/runtime/exit-summary.js');
  const browserPreservedStateRuntimeModule = readText('src/browser/runtime/browser-preserved-state.js');
  const persistentExitRuntimeModule = readText('src/browser/runtime/persistent-exit.js');
  const persistentLastSelfRuntimeModule = readText('src/browser/runtime/persistent-last-self.js');
  const persistentClearRuntimeModule = readText('src/browser/runtime/persistent-clear.js');
  const pendingExitPersistenceRuntimeModule = readText('src/browser/runtime/pending-exit-persistence.js');
  const refreshExitDetailRuntimeModule = readText('src/browser/runtime/refresh-exit-detail.js');
  const restoredCoinFailuresRuntimeModule = readText('src/browser/runtime/restored-coin-failures.js');
  const restoredRuntimeStateRuntimeModule = readText('src/browser/runtime/restored-runtime-state.js');
  const loginSnapshotGateRuntimeModule = readText('src/browser/runtime/login-snapshot-gate.js');
  const runtimeDiagnosticsRuntimeModule = readText('src/browser/runtime/runtime-diagnostics.js');
  const exitReloginRuntimeModule = readText('src/browser/runtime/exit-relogin.js');
  const runtimeDefaultsRuntimeModule = readText('src/browser/runtime/runtime-defaults.js');
  const actionPriorityRuntimeModule = readText('src/browser/runtime/action-priority.js');
  const actionArbitrationRuntimeModule = readText('src/browser/runtime/action-arbitration.js');
  const actionSwitchDiagnosticsRuntimeModule = readText('src/browser/runtime/action-switch-diagnostics.js');
  const attackWorthRuntimeModule = readText('src/browser/runtime/attack-worth.js');
  const exitMotionRuntimeModule = readText('src/browser/runtime/exit-motion.js');
  const coinDiagnosticsRuntimeModule = readText('src/browser/runtime/coin-diagnostics.js');
  const coinMotionRuntimeModule = readText('src/browser/runtime/coin-motion.js');
  const coinTargetRuntimeModule = readText('src/browser/runtime/coin-target.js');
  const coinProgressRuntimeModule = readText('src/browser/runtime/coin-progress.js');
  const coinRouteRuntimeModule = readText('src/browser/runtime/coin-route.js');
  const opportunityChoiceRuntimeModule = readText('src/browser/runtime/opportunity-choice.js');
  const opportunityClearRuntimeModule = readText('src/browser/runtime/opportunity-clear.js');
  const opportunityCandidatesRuntimeModule = readText('src/browser/runtime/opportunity-candidates.js');
  const opportunityPickRuntimeModule = readText('src/browser/runtime/opportunity-pick.js');
  const patrolRuntimeModule = readText('src/browser/runtime/patrol.js');
  const postAttackDropRuntimeModule = readText('src/browser/runtime/post-attack-drop.js');
  const staminaBudgetRuntimeModule = readText('src/browser/runtime/stamina-budget.js');
  const opportunityConstantsRuntimeModule = readText('src/browser/runtime/opportunity-constants.js');
  const strategyActionArbitrationSource = readText('src/strategy/action-arbitration.js');
  const strategyActionPrioritySource = readText('src/strategy/action-priority.js');
  const strategyActionSwitchDiagnosticsSource = readText('src/strategy/action-switch-diagnostics.js');
  const strategyAttackWorthSource = readText('src/strategy/attack-worth.js');
  const strategyExitMotionSource = readText('src/strategy/exit-motion.js');
  const strategyCoinDiagnosticsSource = readText('src/strategy/coin-diagnostics.js');
  const strategyCoinMotionSource = readText('src/strategy/coin-motion.js');
  const strategyCoinTargetSource = readText('src/strategy/coin-target.js');
  const strategyCoinProgressSource = readText('src/strategy/coin-progress.js');
  const strategyCoinRouteSource = readText('src/strategy/coin-route.js');
  const strategyOpportunityChoiceSource = readText('src/strategy/opportunity-choice.js');
  const strategyOpportunityClearSource = readText('src/strategy/opportunity-clear.js');
  const strategyOpportunityCandidatesSource = readText('src/strategy/opportunity-candidates.js');
  const strategyOpportunityPickSource = readText('src/strategy/opportunity-pick.js');
  const strategyPatrolSource = readText('src/strategy/patrol.js');
  const strategyPostAttackDropSource = readText('src/strategy/post-attack-drop.js');
  const strategyStaminaBudgetSource = readText('src/strategy/stamina-budget.js');
  const strategyOpportunityConstantsSource = readText('src/strategy/opportunity-constants.js');
  const targetOverlaySourceModule = readText('src/browser/target-overlay-source.js');
  const targetWhitelistSourceModule = readText('src/browser/target-whitelist-source.js');
  const statusPanelSourceModule = readText('src/browser/status-panel-source.js');
  const statusPanelRuntimeSourceModule = readText('src/browser/status-panel-runtime-source.js');
  const displayFormatRuntimeModule = readText('src/browser/runtime/display-format.js');
  const arrayCountSourceModule = readText('src/browser/array-count-source.js');
  const arrayCountRuntimeModule = readText('src/browser/runtime/array-count.js');
  const runtimeUtilsSourceModule = readText('src/browser/runtime-utils-source.js');
  const runtimeUtilsRuntimeModule = readText('src/browser/runtime/runtime-utils.js');
  const combatLogSourceModule = readText('src/browser/combat-log-source.js');
  const combatLogRuntimeSourceModule = readText('src/browser/combat-log-runtime-source.js');
  const tickSafetySourceModule = readText('src/browser/tick-safety-source.js');
  const importantLogSourceModule = readText('src/browser/important-log-source.js');
  const combatHistorySourceModule = readText('src/browser/combat-history-source.js');
  const entityRefreshSourceModule = readText('src/browser/entity-refresh-source.js');
  const classifySourceModule = readText('src/browser/classify-source.js');
  const coinSafetySourceModule = readText('src/browser/coin-safety-source.js');
  const targetSelectionSourceModule = readText('src/browser/target-selection-source.js');
  const combatMovementSourceModule = readText('src/browser/combat-movement-source.js');
  const combatAimSourceModule = readText('src/browser/combat-aim-source.js');
  const combatStateSourceModule = readText('src/browser/combat-state-source.js');
  const combatFireSourceModule = readText('src/browser/combat-fire-source.js');
  const combatLeaveCoverSourceModule = readText('src/browser/combat-leave-cover-source.js');
  const combatActionSourceModule = readText('src/browser/combat-action-source.js');
  const opportunityStaminaSourceModule = readText('src/browser/opportunity-stamina-source.js');
  const opportunitySnapshotSourceModule = readText('src/browser/opportunity-snapshot-source.js');
  const postAttackSourceModule = readText('src/browser/post-attack-source.js');
  const opportunityActionsSourceModule = readText('src/browser/opportunity-actions-source.js');
  const opportunityCandidateSourceModule = readText('src/browser/opportunity-candidate-source.js');
  const opportunityRouteSourceModule = readText('src/browser/opportunity-route-source.js');
  const opportunityChoiceSourceModule = readText('src/browser/opportunity-choice-source.js');
  const opportunityPickSourceModule = readText('src/browser/opportunity-pick-source.js');
  const patrolSourceModule = readText('src/browser/patrol-source.js');
  const opportunityClearSourceModule = readText('src/browser/opportunity-clear-source.js');
  const opportunityClearCallSourceModule = readText('src/browser/opportunity-clear-call-source.js');
  const coinProgressRuntimeSourceModule = readText('src/browser/coin-progress-runtime-source.js');
  const coinTargetRuntimeSourceModule = readText('src/browser/coin-target-runtime-source.js');
  const chooseActionSourceModule = readText('src/browser/choose-action-source.js');
  const tickSourceModule = readText('src/browser/tick-source.js');
  const startupSourceModule = readText('src/browser/startup-source.js');
  const botObjectSourceModule = readText('src/browser/bot-object-source.js');
  const controlLoginSourceModule = readText('src/browser/control-login-source.js');
  const controlLoginRuntimeSourceModule = readText('src/browser/control-login-runtime-source.js');
  const exitReloginDisplayCallSourceModule = readText('src/browser/exit-relogin-display-call-source.js');
  const exitReloginHoldReadCallSourceModule = readText('src/browser/exit-relogin-hold-read-call-source.js');
  const nativeStateSourceModule = readText('src/browser/native-state-source.js');
  const nativeControlSourceModule = readText('src/browser/native-control-source.js');
  const coinMotionRuntimeSourceModule = readText('src/browser/coin-motion-runtime-source.js');
  const returnBlockSourceModule = readText('src/browser/return-block-source.js');
  const entityActivitySourceModule = readText('src/browser/entity-activity-source.js');
  const staminaRuntimeSourceModule = readText('src/browser/stamina-runtime-source.js');
  const attackWorthSourceModule = readText('src/browser/attack-worth-source.js');
  const exitMotionSourceModule = readText('src/browser/exit-motion-source.js');
  const persistentLastSelfSourceModule = readText('src/browser/persistent-last-self-source.js');
  const persistentExitSourceModule = readText('src/browser/persistent-exit-source.js');
  const persistentClearSourceModule = readText('src/browser/persistent-clear-source.js');
  const pendingExitPersistenceSourceModule = readText('src/browser/pending-exit-persistence-source.js');
  const pendingExitPersistenceCallSourceModule = readText('src/browser/pending-exit-persistence-call-source.js');
  const refreshExitDetailSourceModule = readText('src/browser/refresh-exit-detail-source.js');
  const restoredCoinFailuresSourceModule = readText('src/browser/restored-coin-failures-source.js');
  const restoredRuntimeStateSourceModule = readText('src/browser/restored-runtime-state-source.js');
  const loginSnapshotGateSourceModule = readText('src/browser/login-snapshot-gate-source.js');
  const runtimeDiagnosticsSourceModule = readText('src/browser/runtime-diagnostics-source.js');
  const exitReloginSourceModule = readText('src/browser/exit-relogin-source.js');
  const pendingExitSourceModule = readText('src/browser/pending-exit-source.js');
  const leaveCommandSourceModule = readText('src/browser/leave-command-source.js');
  const autoLoginSourceModule = readText('src/browser/auto-login-source.js');
  const leaveFlowSourceModule = readText('src/browser/leave-flow-source.js');
  const offlineSafetySourceModule = readText('src/browser/offline-safety-source.js');
  const pageNativeSnapshotSourceModule = readText('src/browser/page-native-snapshot-source.js');
  const actionArbitrationSourceModule = readText('src/browser/action-arbitration-source.js');
  const networkQualitySourceModule = readText('src/browser/network-quality-source.js');
  const networkQualitySummarySourceModule = readText('src/browser/network-quality-summary-source.js');
  const runtimeSummarySourceModule = readText('src/browser/runtime-summary-source.js');
  const sharedRuntimeUtilsSource = readText('src/shared/runtime-utils.js');
  const sharedDisplayFormatSource = readText('src/shared/display-format.js');
  const sharedPreservedStateSource = readText('src/shared/browser-preserved-state.js');
  const sharedRuntimeDefaultsSource = readText('src/shared/runtime-defaults.js');
  const sharedTargetWhitelistSource = readText('src/shared/target-whitelist.js');
  const sourceRuntimeText = [
    sourceBot,
    runtimeSourceModule,
    runtimeFragmentsSourceModule,
    runtimeBootstrapSourceModule,
    browserPageGlobalCoreSource,
    targetWhitelistRuntimeModule,
    exitSummaryRuntimeModule,
    browserPreservedStateRuntimeModule,
    persistentExitRuntimeModule,
    persistentLastSelfRuntimeModule,
    persistentClearRuntimeModule,
    pendingExitPersistenceRuntimeModule,
    refreshExitDetailRuntimeModule,
    restoredCoinFailuresRuntimeModule,
    restoredRuntimeStateRuntimeModule,
    loginSnapshotGateRuntimeModule,
    runtimeDiagnosticsRuntimeModule,
    exitReloginRuntimeModule,
    runtimeDefaultsRuntimeModule,
    actionPriorityRuntimeModule,
    actionArbitrationRuntimeModule,
    actionSwitchDiagnosticsRuntimeModule,
    attackWorthRuntimeModule,
    exitMotionRuntimeModule,
    coinDiagnosticsRuntimeModule,
    coinMotionRuntimeModule,
    coinTargetRuntimeModule,
    coinProgressRuntimeModule,
    coinRouteRuntimeModule,
    opportunityChoiceRuntimeModule,
    opportunityClearRuntimeModule,
    opportunityCandidatesRuntimeModule,
    postAttackDropRuntimeModule,
    staminaBudgetRuntimeModule,
    opportunityConstantsRuntimeModule,
    targetOverlaySourceModule,
    targetWhitelistSourceModule,
    statusPanelSourceModule,
    statusPanelRuntimeSourceModule,
    displayFormatRuntimeModule,
    arrayCountSourceModule,
    arrayCountRuntimeModule,
    runtimeUtilsSourceModule,
    runtimeUtilsRuntimeModule,
    combatLogSourceModule,
    combatLogRuntimeSourceModule,
    tickSafetySourceModule,
    importantLogSourceModule,
    combatHistorySourceModule,
    entityRefreshSourceModule,
    classifySourceModule,
    coinSafetySourceModule,
    targetSelectionSourceModule,
    combatMovementSourceModule,
    combatAimSourceModule,
    combatStateSourceModule,
    combatFireSourceModule,
    combatLeaveCoverSourceModule,
    combatActionSourceModule,
    opportunityStaminaSourceModule,
    opportunitySnapshotSourceModule,
    postAttackSourceModule,
    opportunityActionsSourceModule,
    opportunityCandidateSourceModule,
    opportunityRouteSourceModule,
    opportunityChoiceSourceModule,
    opportunityPickSourceModule,
    patrolSourceModule,
    opportunityClearSourceModule,
    opportunityClearCallSourceModule,
    coinProgressRuntimeSourceModule,
    coinTargetRuntimeSourceModule,
    chooseActionSourceModule,
    tickSourceModule,
    startupSourceModule,
    botObjectSourceModule,
    controlLoginSourceModule,
    controlLoginRuntimeSourceModule,
    nativeStateSourceModule,
    nativeControlSourceModule,
    coinMotionRuntimeSourceModule,
    returnBlockSourceModule,
    entityActivitySourceModule,
    staminaRuntimeSourceModule,
    attackWorthSourceModule,
    exitMotionSourceModule,
    persistentLastSelfSourceModule,
    persistentExitSourceModule,
    persistentClearSourceModule,
    pendingExitPersistenceSourceModule,
    refreshExitDetailSourceModule,
    restoredCoinFailuresSourceModule,
    restoredRuntimeStateSourceModule,
    loginSnapshotGateSourceModule,
    runtimeDiagnosticsSourceModule,
    exitReloginSourceModule,
    pendingExitSourceModule,
    leaveCommandSourceModule,
    autoLoginSourceModule,
    leaveFlowSourceModule,
    offlineSafetySourceModule,
    pageNativeSnapshotSourceModule,
    actionArbitrationSourceModule,
    networkQualitySourceModule,
    networkQualitySummarySourceModule,
    runtimeSummarySourceModule
  ].join('\n');
  const generatedBuild = generateRemoteBuild(manifest);
  const generatedSource = generatedBuild.bundledSource;
  const generatedRuntimeSource = generatedBuild.directSource;
  const distHash = sha256Hex(distSource);
  const generatedHash = sha256Hex(generatedSource);

  check('manifest version is a bootstrap release', () => {
    assert(/^bootstrap-\d+\.\d+\.\d+$/.test(String(manifest.version || '')), `unexpected version ${manifest.version || '(empty)'}`);
    return manifest.version;
  });

  check('manifest sha256 is valid hex', () => {
    assert(/^[0-9a-f]{64}$/.test(String(manifest.sha256 || '')), `unexpected sha256 ${manifest.sha256 || '(empty)'}`);
    return manifest.sha256;
  });

  check('manifest sha256 matches dist remote bot', () => {
    assert(String(manifest.sha256 || '') === distHash, `manifest=${manifest.sha256 || '(empty)'} dist=${distHash}`);
    return distHash;
  });

  check('dist remote bot is generated from current source', () => {
    assert(generatedSource === distSource, `generated hash ${generatedHash} differs from dist hash ${distHash}`);
    return `${manifest.version} ${generatedHash}`;
  });

  check('generated remote bot hash matches manifest', () => {
    assert(String(manifest.sha256 || '') === generatedHash, `manifest=${manifest.sha256 || '(empty)'} generated=${generatedHash}`);
    return generatedHash;
  });

  check('production remote bot is generated through esbuild bundling', () => {
    assert(manifest.production === true, 'production manifest does not mark the bundled build as production');
    assert(manifest.bundler?.name === 'esbuild', 'production manifest does not record esbuild');
    assert(manifest.bundler?.mode === 'production-full-generated-remote', 'production manifest mode is not the production bundle mode');
    assert(manifest.bundler?.directSha256 === generatedBuild.directSha256, `direct source hash mismatch: manifest=${manifest.bundler?.directSha256 || '(empty)'} generated=${generatedBuild.directSha256}`);
    assert(manifest.bundler?.format === 'iife', 'production manifest bundler format is not iife');
    assert(manifest.bundler?.platform === 'browser', 'production manifest bundler platform is not browser');
    assert(manifest.bundler?.target === 'es2020', 'production manifest bundler target is not es2020');
    assert(distSource.includes('__graspRatBot'), 'bundled production dist does not contain the bot global key');
    assert(distSource.includes('function installPageGlobal'), 'bundled production dist does not contain the page-global installer');
    assert(distSource.includes('installPageGlobal(BOT_KEY, bot, pageGlobal)'), 'bundled production dist does not install the bot through the page-global adapter');
    assert(!/require\(['"]\.\.?\//.test(distSource), 'bundled production dist still contains unresolved relative require()');
    assert(!/\bfrom\s+['"]\.\.?\//.test(distSource), 'bundled production dist still contains unresolved relative import');
    assert(distSource.includes('var require_array_count = __commonJS'), 'bundled production dist does not bundle the array-count runtime module through esbuild');
    assert(distSource.includes('const { arrayCount } = require_array_count();'), 'bundled production dist does not use the bundled array-count runtime module');
    assert(distSource.includes('var require_runtime_utils = __commonJS'), 'bundled production dist does not bundle the runtime-utils module through esbuild');
    assert(distSource.includes('safeStringify, safeJsonClone, sanitizeCombatLogIdPart'), 'bundled production dist does not use the bundled runtime-utils helpers');
    assert(distSource.includes('var require_display_format = __commonJS'), 'bundled production dist does not bundle the display-format runtime module through esbuild');
    assert(distSource.includes('escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay'), 'bundled production dist does not use the bundled display-format helpers');
    assert(distSource.includes('var require_browser_preserved_state = __commonJS'), 'bundled production dist does not bundle the preserved-state runtime module through esbuild');
    assert(distSource.includes('var require_runtime_defaults = __commonJS'), 'bundled production dist does not bundle the runtime-defaults module through esbuild');
    assert(distSource.includes('var require_target_whitelist = __commonJS'), 'bundled production dist does not bundle the target-whitelist runtime module through esbuild');
    assert(distSource.includes('var require_exit_summary = __commonJS'), 'bundled production dist does not bundle the exit-summary runtime module through esbuild');
    assert(distSource.includes('var require_persistent_exit = __commonJS'), 'bundled production dist does not bundle the persistent-exit runtime module through esbuild');
    assert(distSource.includes('var require_persistent_last_self = __commonJS'), 'bundled production dist does not bundle the persistent-last-self runtime module through esbuild');
    assert(distSource.includes('var require_persistent_clear = __commonJS'), 'bundled production dist does not bundle the persistent-clear runtime module through esbuild');
    assert(distSource.includes('var require_pending_exit_persistence = __commonJS'), 'bundled production dist does not bundle the pending-exit-persistence runtime module through esbuild');
    assert(distSource.includes('var require_refresh_exit_detail = __commonJS'), 'bundled production dist does not bundle the refresh-exit-detail runtime module through esbuild');
    assert(distSource.includes('var require_restored_coin_failures = __commonJS'), 'bundled production dist does not bundle the restored-coin-failures runtime module through esbuild');
    assert(distSource.includes('var require_restored_runtime_state = __commonJS'), 'bundled production dist does not bundle the restored-runtime-state runtime module through esbuild');
    assert(distSource.includes('var require_login_snapshot_gate = __commonJS'), 'bundled production dist does not bundle the login-snapshot-gate runtime module through esbuild');
    assert(distSource.includes('var require_runtime_diagnostics = __commonJS'), 'bundled production dist does not bundle the runtime-diagnostics runtime module through esbuild');
    assert(distSource.includes('var require_exit_relogin = __commonJS'), 'bundled production dist does not bundle the exit-relogin runtime module through esbuild');
    assert(distSource.includes('var require_action_priority = __commonJS'), 'bundled production dist does not bundle the action-priority runtime module through esbuild');
    assert(distSource.includes('var require_action_arbitration = __commonJS'), 'bundled production dist does not bundle the action-arbitration runtime module through esbuild');
    assert(distSource.includes('var require_action_switch_diagnostics = __commonJS'), 'bundled production dist does not bundle the action-switch-diagnostics runtime module through esbuild');
    assert(distSource.includes('var require_attack_worth = __commonJS'), 'bundled production dist does not bundle the attack-worth runtime module through esbuild');
    assert(distSource.includes('var require_exit_motion = __commonJS'), 'bundled production dist does not bundle the exit-motion runtime module through esbuild');
    assert(distSource.includes('var require_coin_motion = __commonJS'), 'bundled production dist does not bundle the coin-motion runtime module through esbuild');
    assert(distSource.includes('var require_coin_target = __commonJS'), 'bundled production dist does not bundle the coin-target runtime module through esbuild');
    assert(distSource.includes('var require_coin_progress = __commonJS'), 'bundled production dist does not bundle the coin-progress runtime module through esbuild');
    assert(distSource.includes('var require_coin_route = __commonJS'), 'bundled production dist does not bundle the coin-route runtime module through esbuild');
    assert(distSource.includes('var require_opportunity_candidates = __commonJS'), 'bundled production dist does not bundle the opportunity-candidates runtime module through esbuild');
    assert(distSource.includes('var require_opportunity_choice = __commonJS'), 'bundled production dist does not bundle the opportunity-choice runtime module through esbuild');
    assert(distSource.includes('var require_opportunity_pick = __commonJS'), 'bundled production dist does not bundle the opportunity-pick runtime module through esbuild');
    assert(distSource.includes('var require_patrol = __commonJS'), 'bundled production dist does not bundle the patrol runtime module through esbuild');
    assert(distSource.includes('var require_opportunity_clear = __commonJS'), 'bundled production dist does not bundle the opportunity-clear runtime module through esbuild');
    assert(distSource.includes('var require_coin_diagnostics = __commonJS'), 'bundled production dist does not bundle the coin-diagnostics runtime module through esbuild');
    assert(distSource.includes('var require_stamina_budget = __commonJS'), 'bundled production dist does not bundle the stamina-budget runtime module through esbuild');
    assert(distSource.includes('var require_post_attack_drop = __commonJS'), 'bundled production dist does not bundle the post-attack-drop runtime module through esbuild');
    new vm.Script(distSource, { filename: 'dist/grasp-rat-remote-bot.js' });
    assert(buildRemoteSource.includes("require('./remote-bot-bundle')"), 'production build does not use the shared remote bundler');
    assert(buildRemoteSource.includes('writeRemoteBotBundle'), 'production build does not write through the shared remote bundler');
    assert(!buildRemoteSource.includes('browserBotSource'), 'production build should not bypass the shared remote bundler');
    assert(remoteBundleSource.includes("const esbuild = require('esbuild')"), 'shared remote bundler does not use esbuild');
    assert(remoteBundleSource.includes("const { remoteBrowserRuntimeSource } = require('../src/browser/runtime-source')"), 'shared remote bundler does not use the browser runtime source boundary');
    assert(remoteBundleSource.includes('remoteBrowserRuntimeSource(options)'), 'shared remote bundler does not get direct source through the runtime source boundary');
    assert(!remoteBundleSource.includes("require('../src/browser/bot-source')"), 'shared remote bundler should not depend directly on the old browser source builder');
    assert(remoteBundleSource.includes('write: false'), 'shared remote bundler should generate source through esbuild outputFiles');
    assert(remoteBundleSource.includes("format: BUNDLER_INFO.format"), 'shared remote bundler does not centralize IIFE format');
    assert(remoteBundleSource.includes("platform: BUNDLER_INFO.platform"), 'shared remote bundler does not centralize browser platform');
    assert(remoteBundleSource.includes("target: [BUNDLER_INFO.target]"), 'shared remote bundler does not centralize es2020 target');
  });

  check('source modules split browser source generation while generated runtime stays single file', () => {
    assert(sourceBot.includes("require('./src/browser/runtime-source')"), 'main bot runtime source boundary import not found');
    assert(sourceBot.includes('browserRuntimeSource({'), 'main bot does not use the runtime source boundary for injection/print-source');
    assert(!sourceBot.includes("require('./src/browser/bot-source')"), 'main bot should not import the old browser source builder directly');
    assert(!fs.existsSync(path.join(ROOT, 'src/browser/bot-source.js')), 'legacy bot-source.js should no longer exist');
    assert(!fs.existsSync(path.join(ROOT, 'src/browser/runtime-assembly-source.js')), 'legacy runtime-assembly-source.js should no longer exist');
    assert(runtimeSourceModule.includes("const { browserRuntimeFragments } = require('./runtime-fragments-source')"), 'runtime source boundary does not own the runtime fragment registry dependency');
    assert(runtimeSourceModule.includes('return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));'), 'runtime source boundary does not render the runtime fragment registry');
    assert(runtimeSourceModule.includes('function browserRuntimeConfig(options = {})'), 'browser runtime config adapter not found');
    assert(runtimeSourceModule.includes('if (options.bundledRuntime) config.bundledRuntime = true;'), 'browser runtime config does not gate bundled-runtime mode');
    assert(runtimeSourceModule.includes('function browserRuntimeSource(options = {})'), 'browser runtime source adapter not found');
    assert(runtimeSourceModule.includes('function remoteBrowserRuntimeSource(options = {})'), 'remote browser runtime source adapter not found');
    assert(functionBody(runtimeSourceModule, 'remoteBrowserRuntimeSource').includes('bundledRuntime: true'), 'remote browser runtime source does not enable bundled-runtime fragments');
    assert(runtimeSourceModule.includes('module.exports = {\n  browserRuntimeConfig,\n  browserRuntimeSource,\n  remoteBrowserRuntimeSource'), 'runtime source boundary exports not found');
    assert(runtimeSourceModule.includes('function renderRuntimeFragment(fragment)'), 'single-fragment renderer not found');
    assert(runtimeSourceModule.includes("typeof fragment.name !== 'string'"), 'runtime source renderer does not require named fragment objects');
    assert(runtimeSourceModule.includes("Object.prototype.hasOwnProperty.call(fragment, 'source')"), 'runtime source renderer does not require fragment source objects');
    assert(!runtimeSourceModule.includes(': fragment;'), 'runtime source renderer should not fall back to bare fragment values');
    assert(runtimeSourceModule.includes('return fragments.map(renderRuntimeFragment).join'), 'runtime source renderer does not render through the single-fragment adapter');
    assert(runtimeSourceModule.includes('if (!Array.isArray(fragments))'), 'runtime source renderer does not validate the fragment registry shape');
    assert(runtimeSourceModule.includes('function renderRuntimeFragments(fragments)'), 'runtime source fragment renderer not found');
    assert(!runtimeSourceModule.includes('browserRuntimeAssemblySource'), 'runtime source boundary should not depend on the removed assembly adapter');
    assert(runtimeUtilsSourceModule.includes("require('./runtime/runtime-utils')"), 'runtime-utils source module does not import the browser runtime helper module');
    assert(runtimeUtilsRuntimeModule.includes("require('../../shared/runtime-utils')"), 'browser runtime-utils helper module does not reuse shared runtime utilities');
    assert(runtimeUtilsRuntimeModule.includes('safeStringify') && runtimeUtilsRuntimeModule.includes('safeJsonClone') && runtimeUtilsRuntimeModule.includes('sanitizeCombatLogIdPart'), 'browser runtime-utils helper module exports are incomplete');
    assert(statusPanelRuntimeSourceModule.includes("require('./runtime/display-format')"), 'status-panel runtime source does not import the browser display-format helper module');
    assert(displayFormatRuntimeModule.includes("require('../../shared/display-format')"), 'browser display-format helper module does not reuse shared display helpers');
    assert(displayFormatRuntimeModule.includes('escapeHtml') && displayFormatRuntimeModule.includes('formatDistance') && displayFormatRuntimeModule.includes('formatDurationMs') && displayFormatRuntimeModule.includes('actorLabel') && displayFormatRuntimeModule.includes('hpDisplay'), 'browser display-format helper module exports are incomplete');
    assert(statusPanelRuntimeSourceModule.includes("require('./status-panel-source')"), 'status-panel runtime source module import not found');
    assert(exitSummaryRuntimeModule.includes("require('../../shared/exit-summary')"), 'browser exit-summary helper module does not reuse shared exit-summary helpers');
    assert(exitSummaryRuntimeModule.includes('staminaExhaustedLongWindows') && exitSummaryRuntimeModule.includes('staminaExhaustedWindowLabel') && exitSummaryRuntimeModule.includes('staminaEvidenceRemaining') && exitSummaryRuntimeModule.includes('staminaHoldContradictedByStaminaEvidence') && exitSummaryRuntimeModule.includes('offlineLeaveSummaryText') && exitSummaryRuntimeModule.includes('combatLogExitSummaryFromDecision'), 'browser exit-summary helper module exports are incomplete');
    assert(combatLogRuntimeSourceModule.includes("require('./runtime/exit-summary')"), 'combat-log runtime source does not import the browser exit-summary helper module');
    assert(combatLogRuntimeSourceModule.includes("require('./combat-log-source')"), 'combat-log runtime source module import not found');
    assert(controlLoginRuntimeSourceModule.includes("require('./runtime/exit-summary')"), 'control-login runtime source does not import the browser exit-summary helper module');
    assert(controlLoginRuntimeSourceModule.includes("require('./control-login-source')"), 'control-login runtime source module import not found');
    assert(runtimeBootstrapSourceModule.includes("require('./runtime/exit-summary')"), 'runtime bootstrap source does not import the browser exit-summary helper module');
    assert(runtimeBootstrapSourceModule.includes("require('./runtime/browser-preserved-state')"), 'runtime bootstrap source does not import the browser preserved-state helper module');
    assert(browserPreservedStateRuntimeModule.includes("require('../../shared/browser-preserved-state')"), 'browser preserved-state helper module does not reuse shared preserved-state helper');
    assert(browserPreservedStateRuntimeModule.includes('buildBrowserPreservedState'), 'browser preserved-state helper module export is incomplete');
    assert(runtimeBootstrapSourceModule.includes("require('./runtime/runtime-defaults')"), 'runtime bootstrap source does not import the browser runtime-defaults helper module');
    assert(runtimeDefaultsRuntimeModule.includes("require('../../shared/runtime-defaults')"), 'browser runtime-defaults helper module does not reuse shared runtime defaults helper');
    assert(runtimeDefaultsRuntimeModule.includes('buildRuntimeDefaults'), 'browser runtime-defaults helper module export is incomplete');
    assert(runtimeBootstrapSourceModule.includes("require('./page-global-core')"), 'page-global core module import not found');
    assert(runtimeBootstrapSourceModule.includes("require('./runtime/target-whitelist')"), 'runtime bootstrap source does not import the browser target-whitelist helper module');
    assert(targetWhitelistRuntimeModule.includes("require('../../shared/target-whitelist')"), 'browser target-whitelist helper module does not reuse shared target-whitelist helpers');
    assert(targetWhitelistRuntimeModule.includes('normalizeTargetWhitelistName') && targetWhitelistRuntimeModule.includes('parseTargetWhitelistNames') && targetWhitelistRuntimeModule.includes('deriveTargetWhitelistUrl'), 'browser target-whitelist helper module exports are incomplete');
    assert(runtimeFragmentsSourceModule.includes("require('./target-overlay-source')"), 'target-overlay source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./target-whitelist-source')"), 'target-whitelist source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./status-panel-runtime-source')"), 'status-panel runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./runtime-utils-source')"), 'runtime-utils source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-log-runtime-source')"), 'combat-log runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./important-log-source')"), 'important-log source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-history-source')"), 'combat-history source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-aim-source')"), 'combat-aim source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-state-source')"), 'combat-state source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-fire-source')"), 'combat-fire source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-leave-cover-source')"), 'combat-leave-cover source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./combat-action-source')"), 'combat-action source module import not found');
    assert(runtimeFragmentsSourceModule.includes("['persistent-last-self', () => persistentLastSelfSource(config)]"), 'persistent-last-self source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['persistent-exit', () => persistentExitSource(config)]"), 'persistent-exit source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['persistent-clear', () => persistentClearSource(config)]"), 'persistent-clear source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['pending-exit-persistence', () => pendingExitPersistenceSource(config)]"), 'pending-exit-persistence source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['refresh-exit-detail', () => refreshExitDetailSource(config)]"), 'refresh-exit-detail source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['restored-coin-failures', () => restoredCoinFailuresSource(config)]"), 'restored-coin-failures source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['login-snapshot-gate', () => loginSnapshotGateSource(config)]"), 'login-snapshot-gate source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['combat-action', () => combatActionSource(config)]"), 'combat-action source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['attack-worth', () => attackWorthSource(config)]"), 'attack-worth source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['exit-motion', () => exitMotionSource(config)]"), 'exit-motion source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("require('./opportunity-stamina-source')"), 'opportunity-stamina source module import not found');
    assert(runtimeFragmentsSourceModule.includes("['opportunity-stamina', () => opportunityStaminaSource(config)]"), 'opportunity-stamina source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("require('./opportunity-snapshot-source')"), 'opportunity-snapshot source module import not found');
    assert(runtimeFragmentsSourceModule.includes("['opportunity-candidate', () => opportunityCandidateSource(config)]"), 'opportunity-candidate source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['opportunity-choice', () => opportunityChoiceSource(config)]"), 'opportunity-choice source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['opportunity-pick', () => opportunityPickSource(config)]"), 'opportunity-pick source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['patrol', () => patrolSource(config)]"), 'patrol source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['opportunity-clear', () => opportunityClearSource(config)]"), 'opportunity-clear source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['post-attack', () => postAttackSource(config)]"), 'post-attack source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("require('./coin-target-runtime-source')"), 'coin-target runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./choose-action-source')"), 'choose-action source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./tick-source')"), 'tick source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./startup-source')"), 'startup source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./bot-object-source')"), 'bot-object source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./control-login-runtime-source')"), 'control-login runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./native-state-source')"), 'native-state source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./native-control-source')"), 'native-control source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./coin-motion-runtime-source')"), 'coin-motion runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./return-block-source')"), 'return-block source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./entity-activity-source')"), 'entity-activity source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./stamina-runtime-source')"), 'stamina-runtime source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./exit-motion-source')"), 'exit-motion source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./persistent-last-self-source')"), 'persistent-last-self source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./persistent-exit-source')"), 'persistent-exit source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./exit-relogin-source')"), 'exit-relogin source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./pending-exit-source')"), 'pending-exit source module import not found');
    assert(runtimeFragmentsSourceModule.includes("['pending-exit', () => pendingExitSource(config)]"), 'pending-exit source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("['leave-command', () => leaveCommandSource(config)]"), 'leave-command source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("require('./restored-runtime-state-source')"), 'restored runtime state source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./page-native-snapshot-source')"), 'page-native snapshot source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./action-arbitration-source')"), 'action-arbitration source module import not found');
    assert(runtimeFragmentsSourceModule.includes("['action-arbitration', () => actionArbitrationSource(config)]"), 'action-arbitration source is not invoked with runtime config');
    assert(runtimeFragmentsSourceModule.includes("require('./network-quality-source')"), 'network-quality source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./network-quality-summary-source')"), 'network-quality summary source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./runtime-summary-source')"), 'runtime-summary source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./runtime-bootstrap-source')"), 'runtime-bootstrap source module import not found');
    assert(runtimeFragmentsSourceModule.includes('function materializeRuntimeFragments(entries)'), 'runtime fragment materializer not found');
    assert(runtimeFragmentsSourceModule.includes('function browserRuntimeFragmentEntries(config)'), 'runtime fragment entries factory not found');
    assert(runtimeFragmentsSourceModule.includes('function browserRuntimeFragments(config)'), 'runtime fragments source factory not found');
    assert(runtimeFragmentsSourceModule.includes('module.exports = {\n  runtimeFragment,\n  materializeRuntimeFragments,\n  browserRuntimeFragmentEntries,\n  browserRuntimeFragments'), 'runtime fragments source export not found');
    const runtimeSourceBody = functionBody(runtimeSourceModule, 'browserRuntimeSource');
    const fragmentRegistryBody = functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragments');
    const fragmentEntriesBody = functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragmentEntries');
    const fragmentMaterializerBody = functionBody(runtimeFragmentsSourceModule, 'materializeRuntimeFragments');
    assert(runtimeSourceBody.includes('return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));'), 'runtime source does not render the fragment registry');
    assert(fragmentEntriesBody.includes('return ['), 'runtime fragments source does not use an explicit fragment entries registry');
    assert(fragmentMaterializerBody.includes('return entries.map(([name, source]) => runtimeFragment(name, source));'), 'runtime fragment materializer does not convert explicit entries to named fragment objects');
    assert(fragmentRegistryBody.includes('return materializeRuntimeFragments(browserRuntimeFragmentEntries(config));'), 'runtime fragments source does not materialize the explicit entries registry');
    assert(runtimeFragmentsSourceModule.includes('function runtimeFragment(name, source)'), 'runtime fragment metadata helper not found');
    assert(runtimeFragmentsSourceModule.includes("typeof name !== 'string'"), 'runtime fragment helper does not validate explicit names');
    assert(runtimeFragmentsSourceModule.includes('source === undefined || source === null'), 'runtime fragment helper does not validate sources');
    assert(!runtimeFragmentsSourceModule.includes('function runtimeFragmentName('), 'runtime fragment names should be explicit, not inferred');
    assert(fragmentEntriesBody.includes("['runtime-bootstrap', () => runtimeBootstrapSource(config)]"), 'runtime-bootstrap fragment is not explicitly named');
    assert(fragmentEntriesBody.includes("['runtime-utility-prelude', () => runtimeUtilityPreludeSource(config)]"), 'runtime-utility-prelude fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['status-panel-runtime', () => statusPanelRuntimeSource(config)]"), 'status-panel-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['array-count', () => arrayCountSource(config)]"), 'array-count fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['runtime-utility-clone', () => runtimeUtilityCloneSource(config)]"), 'runtime-utility-clone fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['combat-log-runtime', () => combatLogRuntimeSource(config)]"), 'combat-log-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['control-login-runtime', () => controlLoginRuntimeSource(config)]"), 'control-login-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['coin-motion-runtime', () => coinMotionRuntimeSource(config)]"), 'coin-motion-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['coin-target-runtime', () => coinTargetRuntimeSource(config)]"), 'coin-target-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['coin-progress-runtime', () => coinProgressRuntimeSource(config)]"), 'coin-progress-runtime fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['coin-safety', () => coinSafetySource(config)]"), 'coin-safety fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['restored-runtime-state', () => restoredRuntimeStateSource(config)]"), 'restored-runtime-state fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['runtime-diagnostics', () => runtimeDiagnosticsSource(config)]"), 'runtime-diagnostics fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['tick-safety', () => tickSafetySource(config)]"), 'tick-safety fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['page-native-snapshot', () => pageNativeSnapshotSource(config)]"), 'page-native-snapshot fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['entity-refresh', () => entityRefreshSource(config)]"), 'entity-refresh fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['exit-relogin', () => exitReloginSource(config)]"), 'exit-relogin fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['leave-flow', () => leaveFlowSource(config)]"), 'leave-flow fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['choose-action', () => chooseActionSource(config)]"), 'choose-action fragment is not config-aware for bundled runtime migration');
    assert(fragmentEntriesBody.includes("['startup', startupSource]"), 'startup fragment is not explicitly named');
    assert(fragmentEntriesBody.includes('() => runtimeBootstrapSource(config)'), 'runtime-bootstrap module is not injected into browser runtime');
    assert(restoredRuntimeStateSourceModule.includes('function restoredRuntimeStateInlineSource() {'), 'restored runtime state inline source factory not found');
    assert(restoredRuntimeStateSourceModule.includes('function bundledRestoredRuntimeStateSource() {'), 'restored runtime state bundled source factory not found');
    assert(restoredRuntimeStateSourceModule.includes('function restoredRuntimeStateSource(options = {})'), 'restored runtime state source selector not found');
    assert(restoredRuntimeStateSourceModule.includes('restoredRuntimeStateInlineSource,\n  bundledRestoredRuntimeStateSource,\n  restoredRuntimeStateSource'), 'restored runtime state source module exports not found');
    const restoredRuntimeStateInlineBody = functionBody(restoredRuntimeStateSourceModule, 'restoredRuntimeStateInlineSource');
    assert(restoredRuntimeStateInlineBody.includes('const restoredFailures = restoredCoinFailures();'), 'restored runtime state inline source does not restore coin failures');
    assert(restoredRuntimeStateInlineBody.includes('const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot });'), 'restored runtime state inline source does not restore pending exit state');
    assert(restoredRuntimeStateInlineBody.includes('const initialPendingExitState = chooseInitialPendingExitState(preserved.pendingExit, restoredPendingExitState, Date.now(), { markReloaded: !previousBot });'), 'restored runtime state inline source does not choose initial pending exit state');
    const restoredRuntimeStateBundledBody = functionBody(restoredRuntimeStateSourceModule, 'bundledRestoredRuntimeStateSource');
    assert(restoredRuntimeStateBundledBody.includes("require('./src/browser/runtime/restored-runtime-state')"), 'restored runtime state bundled source does not hand restore helper to the bundler');
    assert(restoredRuntimeStateBundledBody.includes("require('./src/browser/runtime/restored-coin-failures')"), 'restored runtime state bundled source does not hand coin-failure restore helper to the bundler');
    assert(restoredRuntimeStateBundledBody.includes('restoreRuntimeStateCore(preserved, previousBot'), 'restored runtime state bundled source does not bind preserved/previousBot state');
    assert(restoredRuntimeStateBundledBody.includes('restoredCoinFailures') && restoredRuntimeStateBundledBody.includes('readPersistentExitState'), 'restored runtime state bundled source does not bind runtime restore dependencies');
    assert(restoredRuntimeStateBundledBody.includes('restoredCoinFailuresForRestoredRuntimeStateCore(preserved.coinFailures, cfg, performance.now())'), 'restored runtime state bundled source does not bind coin-failure restore core directly');
    assert(restoredRuntimeStateBundledBody.includes('readPersistedPendingExitStateForRestoredRuntimeStateCore(localStorage, PENDING_EXIT_STATE_KEY') && restoredRuntimeStateBundledBody.includes('chooseInitialPendingExitStateForRestoredRuntimeStateCore(memoryState, storedState, t, options'), 'restored runtime state bundled source does not bind pending-exit restore cores directly');
    assert(restoredRuntimeStateBundledBody.includes('enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY'), 'restored runtime state bundled source does not bind enemy leave key');
    assert(restoredRuntimeStateBundledBody.includes('offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY'), 'restored runtime state bundled source does not bind offline leave key');
    assert(functionBody(restoredRuntimeStateSourceModule, 'restoredRuntimeStateSource').includes('options.bundledRuntime'), 'restored runtime state source selector does not switch on bundled runtime mode');
    assert(statusPanelRuntimeSourceModule.includes('function bundledStatusPanelRuntimeSource()'), 'bundled status-panel runtime source factory not found');
    assert(statusPanelRuntimeSourceModule.includes('function statusPanelRuntimeSource(options = {})'), 'status-panel runtime source factory not found');
    assert(statusPanelRuntimeSourceModule.includes('module.exports = {\n  bundledStatusPanelRuntimeSource,\n  statusPanelRuntimeSource\n}'), 'status-panel runtime source export not found');
    assert(statusPanelRuntimeSourceModule.includes("require('./src/browser/runtime/display-format')"), 'status-panel runtime source does not expose a bundler-owned display-format require');
    assert(statusPanelRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledStatusPanelRuntimeSource();'), 'status-panel runtime source factory does not switch to bundler-owned source in remote builds');
    assert(statusPanelRuntimeSourceModule.includes('return statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay });'), 'status-panel runtime source does not bind display helpers');
    assert(combatLogRuntimeSourceModule.includes('function bundledCombatLogRuntimeSource()'), 'bundled combat-log runtime source factory not found');
    assert(combatLogRuntimeSourceModule.includes('function combatLogRuntimeSource(options = {})'), 'combat-log runtime source factory not found');
    assert(combatLogRuntimeSourceModule.includes('module.exports = {\n  bundledCombatLogRuntimeSource,\n  combatLogRuntimeSource\n}'), 'combat-log runtime source export not found');
    assert(combatLogRuntimeSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'combat-log runtime source does not expose a bundler-owned exit-summary require');
    assert(combatLogRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledCombatLogRuntimeSource();'), 'combat-log runtime source factory does not switch to bundler-owned source in remote builds');
    assert(combatLogRuntimeSourceModule.includes('return combatLogSource({ combatLogExitSummaryFromDecision });'), 'combat-log runtime source does not bind exit-summary helper');
    assert(combatLogRuntimeSourceModule.includes('combatLogSource({ bundledRuntime: true })'), 'combat-log bundled runtime source does not pass bundled-runtime mode into source factory');
    assert(controlLoginRuntimeSourceModule.includes('function bundledControlLoginRuntimeSource()'), 'bundled control-login runtime source factory not found');
    assert(controlLoginRuntimeSourceModule.includes('function controlLoginRuntimeSource(options = {})'), 'control-login runtime source factory not found');
    assert(controlLoginRuntimeSourceModule.includes('module.exports = {\n  bundledControlLoginRuntimeSource,\n  controlLoginRuntimeSource\n}'), 'control-login runtime source export not found');
    assert(controlLoginRuntimeSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'control-login runtime source does not expose a bundler-owned exit-summary require');
    assert(controlLoginRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledControlLoginRuntimeSource();'), 'control-login runtime source factory does not switch to bundler-owned source in remote builds');
    assert(controlLoginRuntimeSourceModule.includes('return controlLoginSource({ staminaExhaustedWindowLabel });'), 'control-login runtime source does not bind stamina helper');
    assert(controlLoginRuntimeSourceModule.includes('controlLoginSource({ bundledRuntime: true })'), 'control-login bundled runtime source does not pass bundled-runtime mode into source factory');
    assert(runtimeBootstrapSourceModule.includes('function bundledRuntimeBootstrapHelperSource()'), 'bundled runtime-bootstrap helper source factory not found');
    assert(runtimeBootstrapSourceModule.includes('function inlineRuntimeBootstrapHelperSource()'), 'inline runtime-bootstrap helper source factory not found');
    assert(runtimeBootstrapSourceModule.includes('function runtimeBootstrapSource(config)'), 'runtime-bootstrap source factory not found');
    assert(runtimeBootstrapSourceModule.includes('module.exports = {\n  bundledRuntimeBootstrapHelperSource,\n  inlineRuntimeBootstrapHelperSource,\n  runtimeBootstrapSource\n}'), 'runtime-bootstrap source module export not found');
    assert(runtimeBootstrapSourceModule.includes('${browserPageGlobalSource()}'), 'page-global adapter source is not injected into browser runtime');
    assert(runtimeBootstrapSourceModule.includes('config?.bundledRuntime'), 'runtime-bootstrap source factory does not switch on bundled runtime mode');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/browser-preserved-state')"), 'runtime-bootstrap bundled source does not require preserved-state runtime module');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/runtime-defaults')"), 'runtime-bootstrap bundled source does not require runtime-defaults runtime module');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/target-whitelist')"), 'runtime-bootstrap bundled source does not require target-whitelist runtime module');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'runtime-bootstrap bundled source does not require exit-summary runtime module');
    assert(runtimeBootstrapSourceModule.includes("const value = readPageGlobal('__graspRatBotRuntimeConfig', {}, pageGlobal);"), 'runtime config is not read through page-global adapter');
    assert(runtimeBootstrapSourceModule.includes('const previousBot = readPageGlobal(BOT_KEY, null, pageGlobal);'), 'previous bot is not read through page-global adapter');
    assert(sourceRuntimeText.includes('installPageGlobal(BOT_KEY, bot, pageGlobal);'), 'bot is not installed through page-global adapter');
    assert(autoLoginSourceModule.includes("const currentStartLinuxDoLogin = readPageGlobal('startLinuxDoLogin', null, pageGlobal);"), 'login availability does not read startLinuxDoLogin through page-global adapter');
    assert(autoLoginSourceModule.includes("readPageGlobal('__graspRatBotRawStartLinuxDoLogin', null, pageGlobal)"), 'manual login does not read raw startLinuxDoLogin through page-global adapter');
    assert(autoLoginSourceModule.includes("const startLinuxDoLoginFn = readPageGlobal('startLinuxDoLogin', null, pageGlobal);"), 'manual login does not read guarded startLinuxDoLogin through page-global adapter');
    assert(autoLoginSourceModule.includes('const result = startLoginFn.call(pageGlobal);'), 'manual login does not call page-global login function with page-global this');
    assert(!autoLoginSourceModule.includes('window.__graspRatBotRawStartLinuxDoLogin'), 'manual login still reads raw startLinuxDoLogin directly from window');
    assert(!autoLoginSourceModule.includes('typeof startLinuxDoLogin ==='), 'login availability still checks bare startLinuxDoLogin instead of page-global adapter');
    assert(browserPageGlobalCoreSource.includes('function browserPageGlobalSource()'), 'page-global browser source builder not found');
    assert(browserPageGlobalCoreSource.includes('pageGlobalObject.toString()'), 'page-global source builder does not inline object helper');
    assert(browserPageGlobalCoreSource.includes('installPageGlobal.toString()'), 'page-global source builder does not inline installer');
    assert(runtimeUtilsSourceModule.includes('function bundledRuntimeUtilityPreludeSource()'), 'bundled runtime utility prelude source factory not found');
    assert(runtimeUtilsSourceModule.includes('function runtimeUtilityPreludeSource(options = {})'), 'runtime utility prelude source factory not found');
    assert(runtimeUtilsSourceModule.includes('function runtimeUtilityCloneSource(options = {})'), 'runtime utility clone source factory not found');
    assert(runtimeUtilsSourceModule.includes('module.exports = {\n  runtimeUtilityPreludeSource,\n  runtimeUtilityCloneSource\n}'), 'runtime utility source module exports not found');
    assert(runtimeUtilsSourceModule.includes("require('./src/browser/runtime/runtime-utils')"), 'runtime utility source factory does not expose a bundler-owned runtime helper require');
    assert(runtimeUtilsSourceModule.includes('if (options.bundledRuntime) return bundledRuntimeUtilityPreludeSource();'), 'runtime utility prelude source factory does not switch to bundler-owned source in remote builds');
    assert(runtimeUtilsSourceModule.includes('if (options.bundledRuntime)'), 'runtime utility clone source factory does not account for bundled runtime mode');
    assert(runtimeUtilsSourceModule.includes('${safeStringify.toString()}'), 'safeStringify is not injected from the runtime utility source module');
    assert(runtimeUtilsSourceModule.includes('${safeJsonClone.toString()}'), 'safeJsonClone is not injected from the runtime utility source module');
    assert(runtimeUtilsSourceModule.includes('${sanitizeCombatLogIdPart.toString()}'), 'sanitizeCombatLogIdPart is not injected from the runtime utility source module');
    assert(runtimeBootstrapSourceModule.includes('${buildBrowserPreservedState.toString()}'), 'preserved-state helper is not injected from the inline runtime-bootstrap helper source');
    assert(runtimeBootstrapSourceModule.includes('${buildRuntimeDefaults.toString()}'), 'runtime defaults are not injected from the inline runtime-bootstrap helper source');
    assert(runtimeBootstrapSourceModule.includes('${normalizeTargetWhitelistName.toString()}'), 'target whitelist name normalizer is not injected from the inline runtime-bootstrap helper source');
    assert(runtimeBootstrapSourceModule.includes('${parseTargetWhitelistNames.toString()}'), 'target whitelist parser is not injected from the inline runtime-bootstrap helper source');
    assert(runtimeBootstrapSourceModule.includes('${deriveTargetWhitelistUrl.toString()}'), 'target whitelist URL derivation is not injected from the inline runtime-bootstrap helper source');
    [
      'targetOverlaySource',
      'targetWhitelistSource',
      'statusPanelRuntimeSource',
      'arrayCountSource',
      'runtimeUtilityPreludeSource',
      'runtimeUtilityCloneSource',
      'combatLogRuntimeSource',
      'tickSafetySource',
      'importantLogSource',
      'combatHistorySource',
      'entityRefreshSource',
      'classifySource',
      'coinSafetySource',
      'targetSelectionSource',
      'combatMovementSource',
      'combatAimSource',
      'combatStateSource',
      'combatFireSource',
      'combatLeaveCoverSource',
      'combatActionSource',
      'opportunityStaminaSource',
      'opportunitySnapshotSource',
      'postAttackSource',
      'opportunityActionsSource',
      'opportunityCandidateSource',
      'opportunityChoiceSource',
      'opportunityPickSource',
      'patrolSource',
      'opportunityClearSource',
      'coinProgressRuntimeSource',
      'entityActivitySource',
      'staminaRuntimeSource',
      'attackWorthSource',
      'exitMotionSource',
      'persistentLastSelfSource',
      'persistentExitSource',
      'persistentClearSource',
      'pendingExitPersistenceSource',
      'refreshExitDetailSource',
      'restoredCoinFailuresSource',
      'restoredRuntimeStateSource',
      'loginSnapshotGateSource',
      'runtimeDiagnosticsSource',
      'exitReloginSource',
      'pendingExitSource',
      'leaveCommandSource',
      'autoLoginSource',
      'leaveFlowSource',
      'offlineSafetySource',
      'coinTargetRuntimeSource',
      'chooseActionSource',
      'tickSource',
      'startupSource',
      'botObjectSource',
      'controlLoginRuntimeSource',
      'nativeStateSource',
      'nativeControlSource',
      'coinMotionRuntimeSource',
      'returnBlockSource',
      'pageNativeSnapshotSource',
      'actionArbitrationSource',
      'networkQualitySource',
      'networkQualitySummarySource',
      'runtimeSummarySource'
    ].forEach(name => {
      assert(fragmentEntriesBody.includes(name), `${name} is not listed in the runtime fragment entries registry`);
    });
    const generatedRuntimeHasBundledBootstrapHelpers = generatedRuntimeSource.includes("require('./src/browser/runtime/browser-preserved-state')")
      && generatedRuntimeSource.includes("require('./src/browser/runtime/runtime-defaults')")
      && generatedRuntimeSource.includes("require('./src/browser/runtime/target-whitelist')")
      && generatedRuntimeSource.includes("require('./src/browser/runtime/exit-summary')");
    assert((generatedRuntimeSource.includes('function safeStringify') || generatedRuntimeSource.includes("require('./src/browser/runtime/runtime-utils')")) && (generatedRuntimeSource.includes('function formatDistance') || generatedRuntimeSource.includes("require('./src/browser/runtime/display-format')")) && (generatedRuntimeSource.includes('function buildRuntimeDefaults') || generatedRuntimeHasBundledBootstrapHelpers), 'generated runtime does not expose shared helper functions');
    assert(generatedRuntimeSource.includes('function resolvePageGlobal') && generatedRuntimeSource.includes('function installPageGlobal'), 'generated runtime does not inline page-global adapter helpers');
    assert((generatedRuntimeSource.includes('function normalizeTargetWhitelistName') && generatedRuntimeSource.includes('function parseTargetWhitelistNames') && generatedRuntimeSource.includes('function deriveTargetWhitelistUrl')) || generatedRuntimeHasBundledBootstrapHelpers, 'generated runtime does not expose target whitelist helpers');
    assert(generatedRuntimeSource.includes('const now = () => performance.now();'), 'generated runtime does not include entity clock helper');
    assert(generatedRuntimeSource.includes('function recentlyActionedForAfk'), 'generated runtime does not include recent-activity helper');
    assert(generatedRuntimeSource.includes('const isAfkProfitTarget'), 'generated runtime does not include AFK profit target helper');
    assert(generatedRuntimeSource.includes('function summarizeStamina'), 'generated runtime does not include stamina summary helper');
    assert(generatedRuntimeSource.includes('function staminaResetHoldUntil'), 'generated runtime does not include stamina reset hold helper');
    assert(generatedRuntimeSource.includes('function staleOfflineStaminaHoldContradicted'), 'generated runtime does not include stale offline stamina contradiction helper');
    assert(
      generatedRuntimeSource.includes('setExitReloginSuppressBoundCore')
        && generatedRuntimeSource.includes("require('./src/browser/runtime/exit-relogin')"),
      'generated runtime does not include exit relogin suppress runtime helpers'
    );
    assert(
      generatedRuntimeSource.includes('function clearOfflineReloginHold')
        || generatedRuntimeSource.includes('clearOfflineReloginHoldBoundCore'),
      'generated runtime does not include offline relogin hold cleanup helper'
    );
    assert(generatedRuntimeSource.includes('function summarizePendingExit'), 'generated runtime does not include pending-exit summary helper');
    assert(generatedRuntimeSource.includes('async function handlePendingExit'), 'generated runtime does not include pending-exit handler');
    assert(generatedRuntimeSource.includes('function updatePursuitTracking'), 'generated runtime does not include pursuit tracking helper');
    assert(generatedRuntimeSource.includes('function waitWithTimeout'), 'generated runtime does not include wait-with-timeout helper');
    assert(generatedRuntimeSource.includes('function leaveCommandFailureMessage'), 'generated runtime does not include leave command failure helper');
    assert(generatedRuntimeSource.includes('function summarizeLeaveCommandResult'), 'generated runtime does not include leave command result summary helper');
    assert(generatedRuntimeSource.includes('function clashLeaveRescueHook'), 'generated runtime does not include Clash rescue hook helper');
    assert(generatedRuntimeSource.includes('function scheduleClashLeaveRescueRetry'), 'generated runtime does not include Clash rescue scheduler');
    assert(generatedRuntimeSource.includes('function completeLeaveRequest'), 'generated runtime does not include leave request completion helper');
    assert(generatedRuntimeSource.includes('async function issueLeaveCommand'), 'generated runtime does not include leave command issuer');
    assert(generatedRuntimeSource.includes('function summarizeOfflineThreat'), 'generated runtime does not include offline threat summary helper');
    assert(generatedRuntimeSource.includes('function assessOfflineSafety'), 'generated runtime does not include offline safety assessment helper');
    assert(generatedRuntimeSource.includes('function pickActiveCombatWaitThreat'), 'generated runtime does not include active combat wait picker');
    assert(!generatedRuntimeSource.includes("require('./src/shared/"), 'generated runtime still contains CommonJS shared-module imports');
  });

  check('dist target whitelist is a standalone username list', () => {
    assert(targetWhitelistConfig && typeof targetWhitelistConfig === 'object' && !Array.isArray(targetWhitelistConfig), 'target whitelist JSON must be an object');
    assert(Array.isArray(targetWhitelistConfig.names), 'target whitelist names array not found');
    assert(targetWhitelistConfig.names.length === 2, `expected 2 whitelist names, got ${targetWhitelistConfig.names.length}`);
    assert(targetWhitelistConfig.names[0] === '文月' && targetWhitelistConfig.names[1] === 'Firefox', `unexpected whitelist names: ${targetWhitelistConfig.names.join(',')}`);
    assert(!Object.prototype.hasOwnProperty.call(targetWhitelistConfig, 'ids'), 'target whitelist must not contain ids');
    assert(!Object.prototype.hasOwnProperty.call(targetWhitelistConfig, 'userIds'), 'target whitelist must not contain userIds');
  });

  check('target whitelist helper parses usernames and derives same-directory remote URL', () => {
    assert(functionBody(sharedTargetWhitelistSource, 'normalizeTargetWhitelistName').includes('.trim()'), 'target whitelist names are not trimmed');
    assert(functionBody(sharedTargetWhitelistSource, 'normalizeTargetWhitelistName').includes('\\u200B-\\u200F'), 'target whitelist names do not strip zero-width/bidi controls');
    assert(functionBody(sharedTargetWhitelistSource, 'parseTargetWhitelistNames').includes('payload?.names'), 'target whitelist parser does not accept names');
    assert(functionBody(sharedTargetWhitelistSource, 'parseTargetWhitelistNames').includes('payload?.usernames'), 'target whitelist parser does not accept usernames alias');
    assert(!functionBody(sharedTargetWhitelistSource, 'parseTargetWhitelistNames').includes('ids'), 'target whitelist parser still accepts ids');
    const deriveBody = functionBody(sharedTargetWhitelistSource, 'deriveTargetWhitelistUrl');
    assert(deriveBody.includes("url.pathname = url.pathname.replace(/[^/]*$/, 'target-whitelist.json')"), 'target whitelist URL is not derived from remote script directory');
    assert(deriveBody.includes("return source.replace(/[^/?#]*([?#].*)?$/, 'target-whitelist.json')"), 'target whitelist URL does not handle non-URL source paths');
  });

  check('browser UI source modules export overlay, whitelist, status panel, combat-log, important-log, network-quality, and control-login runtime fragments', () => {
    assert(targetOverlaySourceModule.includes('function targetOverlaySource() {'), 'target-overlay source factory not found');
    assert(targetOverlaySourceModule.includes('module.exports = {\n  targetOverlaySource'), 'target-overlay module export not found');
    assert(functionBody(targetOverlaySourceModule, 'targetOverlaySource').includes('String.raw`'), 'target-overlay source factory does not return raw browser source');
    assert(targetWhitelistSourceModule.includes('function targetWhitelistSource() {'), 'target-whitelist source factory not found');
    assert(targetWhitelistSourceModule.includes('module.exports = {\n  targetWhitelistSource'), 'target-whitelist module export not found');
    assert(functionBody(targetWhitelistSourceModule, 'targetWhitelistSource').includes('String.raw`'), 'target-whitelist source factory does not return raw browser source');
    assert(functionBody(targetWhitelistSourceModule, 'targetWhitelistSource').includes('function refreshTargetWhitelist'), 'target-whitelist source factory does not include refresh helper');
    assert(functionBody(targetWhitelistSourceModule, 'targetWhitelistSource').includes('function startTargetWhitelistPolling'), 'target-whitelist source factory does not include polling helper');
    assert(statusPanelSourceModule.includes('function statusPanelSource(helpers = {}) {'), 'status-panel source factory not found');
    assert(statusPanelSourceModule.includes('module.exports = {\n  statusPanelSource'), 'status-panel module export not found');
    assert(functionBody(statusPanelSourceModule, 'statusPanelSource').includes('typeof escapeHtml === \'function\' ? escapeHtml.toString() : \'\''), 'status-panel source factory does not inline shared display helpers');
    assert(functionBody(statusPanelSourceModule, 'statusPanelSource').includes('typeof formatDistance === \'function\' ? formatDistance.toString() : \'\''), 'status-panel source factory does not inline distance formatter');
    assert(combatLogSourceModule.includes('function combatLogSource(helpers = {}) {'), 'combat-log source factory not found');
    assert(combatLogSourceModule.includes('module.exports = {\n  combatLogSource'), 'combat-log module export not found');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('String.raw`'), 'combat-log source factory does not return raw browser source');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('combatLogExitSummarySource'), 'combat-log source factory does not support optional exit-summary helper injection');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('combatLogExitSummaryFromDecision.toString()'), 'combat-log source factory does not inline exit-summary helper');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('recordRuntimeDiagnosticsCore(bot, ${values})'), 'combat-log source factory does not route bundled runtime diagnostics through core');
    assert(importantLogSourceModule.includes('function importantLogSource() {'), 'important-log source factory not found');
    assert(importantLogSourceModule.includes('module.exports = {\n  importantLogSource'), 'important-log module export not found');
    assert(functionBody(importantLogSourceModule, 'importantLogSource').includes('String.raw`'), 'important-log source factory does not return raw browser source');
    assert(combatHistorySourceModule.includes('function combatHistorySource() {'), 'combat-history source factory not found');
    assert(combatHistorySourceModule.includes('module.exports = {\n  combatHistorySource'), 'combat-history module export not found');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('String.raw`'), 'combat-history source factory does not return raw browser source');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('function rememberAttack'), 'combat-history source factory does not include attack history tracking');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('function rememberCombatEngagement'), 'combat-history source factory does not include combat engagement tracking');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('function recordKillHistoryItem'), 'combat-history source factory does not include kill history storage');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('function recordDropMatchedKill'), 'combat-history source factory does not include drop matched kill attribution');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('function updateKillHistory'), 'combat-history source factory does not include kill history update');
    assert(entityRefreshSourceModule.includes('function entityRefreshSource(options = {}) {'), 'entity-refresh source factory not found');
    assert(entityRefreshSourceModule.includes('module.exports = {\n  entityRefreshSource'), 'entity-refresh source module export not found');
    assert(functionBody(entityRefreshSourceModule, 'entityRefreshSource').includes('String.raw`'), 'entity-refresh source factory does not return raw browser source');
    assert(functionBody(entityRefreshSourceModule, 'entityRefreshSource').includes('recordRuntimeDiagnosticsCore(bot, ${values})'), 'entity-refresh source factory does not route bundled runtime diagnostics through core');
    assert(functionBody(entityRefreshSourceModule, 'entityRefreshSource').includes('function markRecentMovement'), 'entity-refresh source factory does not include recent movement marker');
    assert(functionBody(entityRefreshSourceModule, 'entityRefreshSource').includes('async function refreshGlobalState'), 'entity-refresh source factory does not include global refresh helper');
    assert(functionBody(entityRefreshSourceModule, 'entityRefreshSource').includes('passive-snapshot-only-active-game-api-disabled'), 'entity-refresh source factory does not preserve passive snapshot skip diagnostic');
    assert(classifySourceModule.includes('function classifySource() {'), 'classify source factory not found');
    assert(classifySourceModule.includes('module.exports = {\n  classifySource'), 'classify source module export not found');
    assert(functionBody(classifySourceModule, 'classifySource').includes('String.raw`'), 'classify source factory does not return raw browser source');
    assert(functionBody(classifySourceModule, 'classifySource').includes('function classify(self)'), 'classify source factory does not include classify helper');
    assert(functionBody(classifySourceModule, 'classifySource').includes('markRecentMovement(localEntities)'), 'classify source factory does not preserve recent movement marking');
    assert(functionBody(classifySourceModule, 'classifySource').includes('const combatTargets = attackableEntities'), 'classify source factory does not preserve combat target classification');
    assert(functionBody(classifySourceModule, 'classifySource').includes('const combatDodgeOnlyTargets = attackableEntities'), 'classify source factory does not preserve combat dodge-only classification');
    assert(functionBody(classifySourceModule, 'classifySource').includes('const snapshotCoins = allCoins.filter'), 'classify source factory does not preserve snapshot coin classification');
    assert(coinSafetySourceModule.includes('function bundledCoinSafetySource()'), 'bundled coin-safety source factory not found');
    assert(coinSafetySourceModule.includes('function coinSafetyInlineSource(helpers = {}, options = {})'), 'inline coin-safety source factory not found');
    assert(coinSafetySourceModule.includes('function coinSafetySource(options = {})'), 'coin-safety source factory not found');
    assert(coinSafetySourceModule.includes('module.exports = {\n  bundledCoinSafetySource,\n  coinSafetyInlineSource,\n  coinSafetySource\n}'), 'coin-safety source module export not found');
    assert(coinSafetySourceModule.includes("require('./src/browser/runtime/coin-diagnostics')"), 'coin-safety source does not expose a bundler-owned coin-diagnostics require');
    assert(coinSafetySourceModule.includes('if (options.bundledRuntime) return bundledCoinSafetySource();'), 'coin-safety source factory does not switch to bundler-owned source in remote builds');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('String.raw`'), 'coin-safety inline source factory does not return raw browser source');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('coinDiagnosticsSummarySource'), 'coin-safety inline source factory does not support diagnostics summary injection');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('coinDiagnosticsHelperSource'), 'coin-safety inline source factory does not support diagnostics helper injection');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('function coinThreatDangerRadius'), 'coin-safety source factory does not include threat radius helper');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('function safeCoinCandidates'), 'coin-safety source factory does not include safe coin candidate filter');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('function pickRealtimeLocalCoin'), 'coin-safety source factory does not include realtime local coin picker');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('function pickCoinField'), 'coin-safety source factory does not include field coin picker');
    assert(functionBody(coinSafetySourceModule, 'coinSafetyInlineSource').includes('function pickDistantCoin'), 'coin-safety source factory does not include distant coin picker');
    assert(targetSelectionSourceModule.includes('function targetSelectionSource() {'), 'target-selection source factory not found');
    assert(targetSelectionSourceModule.includes('module.exports = {\n  targetSelectionSource'), 'target-selection source module export not found');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('String.raw`'), 'target-selection source factory does not return raw browser source');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function highValueCoinPriorityAmount'), 'target-selection source factory does not include high-value coin threshold helper');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function pickHighValueVisibleCoin'), 'target-selection source factory does not include high-value visible coin picker');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function isDefensiveCombatTarget'), 'target-selection source factory does not include defensive combat classifier');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function pickCombatTarget'), 'target-selection source factory does not include combat target picker');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function pickEngagedCombatTarget'), 'target-selection source factory does not include engaged combat picker');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function defensiveTargetOverridesEngaged'), 'target-selection source factory does not include defensive override helper');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function attachOpportunisticShot'), 'target-selection source factory does not include opportunistic shot attachment');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('function buildOpportunisticShotWait'), 'target-selection source factory does not include opportunistic shot wait builder');
    assert(combatMovementSourceModule.includes('function combatMovementSource() {'), 'combat-movement source factory not found');
    assert(combatMovementSourceModule.includes('module.exports = {\n  combatMovementSource'), 'combat-movement source module export not found');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('String.raw`'), 'combat-movement source factory does not return raw browser source');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatMoveVelocityForDirection'), 'combat-movement source factory does not include velocity helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatBulletThreats'), 'combat-movement source factory does not include bullet threat classifier');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatThreatFieldCandidate'), 'combat-movement source factory does not include threat-field candidate scorer');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function tangentMoveForBullet'), 'combat-movement source factory does not include tangent dodge helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatSpacingVector'), 'combat-movement source factory does not include spacing vector helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatPressureDisadvantageState'), 'combat-movement source factory does not include pressure disadvantage helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatOutOfRangeReengageState'), 'combat-movement source factory does not include out-of-range reengage helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatPassiveRunnerState'), 'combat-movement source factory does not include passive runner helper');
    assert(functionBody(combatMovementSourceModule, 'combatMovementSource').includes('function combatOutOfRangeDodgeAction'), 'combat-movement source factory does not include out-of-range dodge action');
    assert(combatAimSourceModule.includes('function combatAimSource() {'), 'combat-aim source factory not found');
    assert(combatAimSourceModule.includes('module.exports = { combatAimSource }'), 'combat-aim source module export not found');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('String.raw`'), 'combat-aim source factory does not return raw browser source');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('function combatAimJitterLimit'), 'combat-aim source factory does not include jitter helper');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('function combatAimMotionScale'), 'combat-aim source factory does not include motion scale helper');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('function combatMotionSamplesWithCurrent'), 'combat-aim source factory does not include motion history helper');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('function combatOpponentProfile'), 'combat-aim source factory does not include opponent profile helper');
    assert(functionBody(combatAimSourceModule, 'combatAimSource').includes('function combatTradeEstimate'), 'combat-aim source factory does not include trade estimate helper');
    assert(combatStateSourceModule.includes('function combatStateSource(options = {}) {'), 'combat-state source factory not found');
    assert(combatStateSourceModule.includes('module.exports = { combatStateSource }'), 'combat-state source module export not found');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('String.raw`'), 'combat-state source factory does not return raw browser source');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('currentOfflineDisplayReasonCore: currentOfflineDisplayReasonForCombatStateCore'), 'combat-state source factory does not import bundled offline display core alias');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('currentOfflineDisplayReasonForCombatStateCore(${reason}, ${offlineSafety}, ${leaveResult}, ${offlineDetail}, ${fallback}, { offlineLeaveSummary })'), 'combat-state source factory does not bind bundled offline display core directly');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function combatTargetId'), 'combat-state source factory does not include target id helper');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function combatDisadvantageObservationState'), 'combat-state source factory does not include disadvantage observation helper');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function combatTrendState'), 'combat-state source factory does not include trend state helper');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function globalSamplingOutageOfflineState'), 'combat-state source factory does not include sampling outage offline helper');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function combatTickGapOfflineState'), 'combat-state source factory does not include combat tick gap helper');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('async function handleTickReentryCombatGap'), 'combat-state source factory does not include tick reentry handler');
    assert(functionBody(combatStateSourceModule, 'combatStateSource').includes('function nativeTickMinIntervalMs'), 'combat-state source factory does not include native tick interval helper');
    assert(combatFireSourceModule.includes('function combatFireSource() {'), 'combat-fire source factory not found');
    assert(combatFireSourceModule.includes('module.exports = { combatFireSource }'), 'combat-fire source module export not found');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('String.raw`'), 'combat-fire source factory does not return raw browser source');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatShootingPlan'), 'combat-fire source factory does not include shooting plan helper');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatAimNoDamageLevel'), 'combat-fire source factory does not include no-damage aim level helper');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatMovementAimMode'), 'combat-fire source factory does not include movement aim mode helper');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatInterceptSolution'), 'combat-fire source factory does not include intercept solver');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatLiveAimTarget'), 'combat-fire source factory does not include live aim target helper');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatAimDynamicStrategyState'), 'combat-fire source factory does not include dynamic aim strategy helper');
    assert(functionBody(combatFireSourceModule, 'combatFireSource').includes('function combatAimTarget'), 'combat-fire source factory does not include combat aim target helper');
    assert(combatLeaveCoverSourceModule.includes('function combatLeaveCoverSource() {'), 'combat-leave-cover source factory not found');
    assert(combatLeaveCoverSourceModule.includes('module.exports = { combatLeaveCoverSource }'), 'combat-leave-cover source module export not found');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('String.raw`'), 'combat-leave-cover source factory does not return raw browser source');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('function combatLeaveCoverAction'), 'combat-leave-cover source factory does not include leave cover action builder');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('combatPressureThreat'), 'combat-leave-cover source factory does not include pressure threat wiring');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('combatAimTarget'), 'combat-leave-cover source factory does not include aim target wiring');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('combatShootingPlan'), 'combat-leave-cover source factory does not include shooting plan wiring');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('combat-stamina-hold'), 'combat-leave-cover source factory does not include stamina hold reason');
    assert(functionBody(combatLeaveCoverSourceModule, 'combatLeaveCoverSource').includes('combat-leave-cover'), 'combat-leave-cover source factory does not include leave cover reason');
    assert(combatActionSourceModule.includes('function combatActionSource(options = {}) {'), 'combat-action source factory not found');
    assert(combatActionSourceModule.includes('module.exports = { combatActionSource }'), 'combat-action source module export not found');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('String.raw`'), 'combat-action source factory does not return raw browser source');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatLeaveActionCore: combatLeaveActionForCombatActionCore'), 'combat-action source factory does not import bundled combat leave action core alias');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatExitSummaryCore: combatExitSummaryForCombatActionCore'), 'combat-action source factory does not import bundled combat summary core alias');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatLeaveActionForCombatActionCore(${reason}, ${baseTarget}, ${combatState}, ${cover},'), 'combat-action source factory does not bind bundled combat leave action core directly');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('function buildCombatAction'), 'combat-action source factory does not include combat action builder');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatLeaveCoverAction'), 'combat-action source factory does not include leave cover action wiring');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatOutOfRangeDodgeAction'), 'combat-action source factory does not include out-of-range dodge wiring');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatTrendState'), 'combat-action source factory does not include combat trend wiring');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatShootingPlan'), 'combat-action source factory does not include shooting plan wiring');
    assert(functionBody(combatActionSourceModule, 'combatActionSource').includes('combatState'), 'combat-action source factory does not include combat state logging');
    assert(opportunityStaminaSourceModule.includes('function opportunityStaminaInlineSource(helpers = {}, options = {}) {'), 'opportunity-stamina inline source factory not found');
    assert(opportunityStaminaSourceModule.includes('function bundledOpportunityStaminaSource() {'), 'opportunity-stamina bundled source factory not found');
    assert(opportunityStaminaSourceModule.includes('function opportunityStaminaSource(options = {}) {'), 'opportunity-stamina source selector not found');
    assert(opportunityStaminaSourceModule.includes('bundledOpportunityStaminaSource') && opportunityStaminaSourceModule.includes('opportunityStaminaInlineSource') && opportunityStaminaSourceModule.includes('opportunityStaminaSource'), 'opportunity-stamina source module exports are incomplete');
    const opportunityStaminaInlineBody = functionBody(opportunityStaminaSourceModule, 'opportunityStaminaInlineSource');
    assert(opportunityStaminaInlineBody.includes('String.raw`'), 'opportunity-stamina inline source factory does not return raw browser source');
    assert(opportunityStaminaInlineBody.includes('function opportunityEffectiveStaminaCost'), 'opportunity-stamina inline source factory does not include effective stamina helper');
    assert(opportunityStaminaInlineBody.includes('staminaBudgetHelperSource'), 'opportunity-stamina inline source factory does not inject stamina budget helpers');
    assert(opportunityStaminaInlineBody.includes('function dailyStaminaFinalCoinAction'), 'opportunity-stamina inline source factory does not include daily final coin action');
    assert(opportunityStaminaInlineBody.includes('function staminaBudgetCoinLeaveAction'), 'opportunity-stamina inline source factory does not include stamina budget leave action');
    assert(opportunityStaminaInlineBody.includes('function mergeCoinRouteDisplay'), 'opportunity-stamina inline source factory does not include coin route display wrapper');
    assert(functionBody(opportunityStaminaSourceModule, 'bundledOpportunityStaminaSource').includes("require('./src/browser/runtime/stamina-budget')"), 'opportunity-stamina bundled source does not hand stamina-budget helpers to the bundler');
    assert(opportunitySnapshotSourceModule.includes('function opportunitySnapshotSource(options = {}) {'), 'opportunity-snapshot source factory not found');
    assert(opportunitySnapshotSourceModule.includes('module.exports = { opportunitySnapshotSource }'), 'opportunity-snapshot source module export not found');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('String.raw`'), 'opportunity-snapshot source factory does not return raw browser source');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function snapshotCoinAgeMs'), 'opportunity-snapshot source factory does not include snapshot coin age helper');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function pickSnapshotCoinDestination'), 'opportunity-snapshot source factory does not include snapshot coin picker');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('snapshotCoinWorthLongTravelCore'), 'opportunity-snapshot source factory does not include snapshot worth wrapper');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function scoreCoinOpportunity'), 'opportunity-snapshot source factory does not include coin opportunity scorer');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function updateOpportunityAfkStaminaObservations'), 'opportunity-snapshot source factory does not include AFK stamina observation updater');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function afkOpportunityBlockedByStaminaCooldown'), 'opportunity-snapshot source factory does not include AFK cooldown gate');
    assert(functionBody(opportunitySnapshotSourceModule, 'opportunitySnapshotSource').includes('function scoreEnemyOpportunity'), 'opportunity-snapshot source factory does not include enemy opportunity scorer');
    assert(postAttackSourceModule.includes('function postAttackInlineSource(helpers = {}, options = {}) {'), 'post-attack inline source factory not found');
    assert(postAttackSourceModule.includes('function bundledPostAttackSource() {'), 'post-attack bundled source factory not found');
    assert(postAttackSourceModule.includes('function postAttackSource(options = {}) {'), 'post-attack source selector not found');
    assert(postAttackSourceModule.includes('bundledPostAttackSource') && postAttackSourceModule.includes('postAttackInlineSource') && postAttackSourceModule.includes('postAttackSource'), 'post-attack source module exports are incomplete');
    const postAttackInlineBody = functionBody(postAttackSourceModule, 'postAttackInlineSource');
    assert(postAttackInlineBody.includes('String.raw`'), 'post-attack inline source factory does not return raw browser source');
    assert(postAttackInlineBody.includes('function pickPostAttackDropCoin'), 'post-attack inline source factory does not include drop coin picker');
    assert(postAttackInlineBody.includes('function pickPostAttackDropWaitTarget'), 'post-attack inline source factory does not include wait target picker');
    assert(postAttackInlineBody.includes('function buildPostAttackDropWaitAction'), 'post-attack inline source factory does not include wait action builder');
    assert(postAttackInlineBody.includes('postAttackDropHelperSource'), 'post-attack inline source factory does not inject drop helpers');
    assert(postAttackInlineBody.includes('coinMotionMetaCore(dir)'), 'post-attack source factory does not use coin motion metadata core directly');
    assert(functionBody(postAttackSourceModule, 'bundledPostAttackSource').includes("require('./src/browser/runtime/post-attack-drop')"), 'post-attack bundled source does not hand post-attack-drop helpers to the bundler');
    assert(opportunityActionsSourceModule.includes('function opportunityActionsSource(options = {}) {'), 'opportunity-actions source factory not found');
    assert(opportunityActionsSourceModule.includes('module.exports = { opportunityActionsSource }'), 'opportunity-actions source module export not found');
    assert(functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('String.raw`'), 'opportunity-actions source factory does not return raw browser source');
    assert(functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('localEnemyOpportunityCandidatesSource'), 'opportunity-actions source factory does not keep local enemy candidate fallback');
    assert(functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('function buildCoinAction'), 'opportunity-actions source factory does not include coin action builder');
    assert(functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('coinMotionMetaCore(dir)'), 'opportunity-actions source factory does not use coin motion metadata core directly');
    assert(functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('function buildEnemyAction'), 'opportunity-actions source factory does not include enemy action builder');
    assert(opportunityCandidateSourceModule.includes('function opportunityCandidateInlineSource(helpers = {}, options = {}) {'), 'opportunity-candidate inline source factory not found');
    assert(opportunityCandidateSourceModule.includes('function bundledOpportunityCandidateSource(options = {}) {'), 'opportunity-candidate bundled source factory not found');
    assert(opportunityCandidateSourceModule.includes('function opportunityCandidateSource(options = {}) {'), 'opportunity-candidate source selector not found');
    assert(opportunityCandidateSourceModule.includes('bundledOpportunityCandidateSource') && opportunityCandidateSourceModule.includes('opportunityCandidateInlineSource') && opportunityCandidateSourceModule.includes('opportunityCandidateSource'), 'opportunity-candidate source module exports are incomplete');
    const opportunityCandidateInlineBody = functionBody(opportunityCandidateSourceModule, 'opportunityCandidateInlineSource');
    assert(opportunityCandidateInlineBody.includes('String.raw`'), 'opportunity-candidate inline source factory does not return raw browser source');
    assert(opportunityCandidateInlineBody.includes('${opportunityRouteSource(options)}'), 'opportunity-candidate inline source factory does not inject route source with runtime options');
    assert(opportunityCandidateInlineBody.includes('opportunityCandidateHelperSource'), 'opportunity-candidate inline source factory does not inject candidate helpers');
    assert(opportunityCandidateInlineBody.includes('function opportunityCandidateCoreOptions'), 'opportunity-candidate inline source factory does not include core options wrapper');
    assert(opportunityCandidateInlineBody.includes('function pickProfitableCombatTarget'), 'opportunity-candidate inline source factory does not include profitable combat comparison wrapper');
    assert(functionBody(opportunityCandidateSourceModule, 'bundledOpportunityCandidateSource').includes("require('./src/browser/runtime/opportunity-candidates')"), 'opportunity-candidate bundled source does not hand candidate helpers to the bundler');
    assert(opportunityChoiceSourceModule.includes('function opportunityChoiceInlineSource(helpers = {}, options = {}) {'), 'opportunity-choice inline source factory not found');
    assert(opportunityChoiceSourceModule.includes('function bundledOpportunityChoiceSource() {'), 'opportunity-choice bundled source factory not found');
    assert(opportunityChoiceSourceModule.includes('function opportunityChoiceSource(options = {}) {'), 'opportunity-choice source selector not found');
    assert(opportunityChoiceSourceModule.includes('bundledOpportunityChoiceSource') && opportunityChoiceSourceModule.includes('opportunityChoiceInlineSource') && opportunityChoiceSourceModule.includes('opportunityChoiceSource'), 'opportunity-choice source module exports are incomplete');
    const opportunityChoiceInlineBody = functionBody(opportunityChoiceSourceModule, 'opportunityChoiceInlineSource');
    assert(opportunityChoiceInlineBody.includes('String.raw`'), 'opportunity-choice inline source factory does not return raw browser source');
    assert(opportunityChoiceInlineBody.includes('opportunityChoiceHelperSource'), 'opportunity-choice inline source factory does not inject choice helpers');
    assert(opportunityChoiceInlineBody.includes('fn.toString()'), 'opportunity-choice inline source factory does not inline helper functions');
    assert(opportunityChoiceInlineBody.includes('function opportunityChoiceCoreOptions'), 'opportunity-choice inline source factory does not include core options wrapper');
    assert(opportunityChoiceInlineBody.includes('function buildMissingHeldOpportunity'), 'opportunity-choice inline source factory does not include missing-held wrapper');
    assert(functionBody(opportunityChoiceSourceModule, 'bundledOpportunityChoiceSource').includes("require('./src/browser/runtime/opportunity-choice')"), 'opportunity-choice bundled source does not hand choice helpers to the bundler');
    assert(opportunityPickSourceModule.includes('function opportunityPickInlineSource() {'), 'opportunity-pick inline source factory not found');
    assert(opportunityPickSourceModule.includes('function bundledOpportunityPickSource() {'), 'opportunity-pick bundled source factory not found');
    assert(opportunityPickSourceModule.includes('function opportunityPickSource(options = {}) {'), 'opportunity-pick source selector not found');
    assert(opportunityPickSourceModule.includes('bundledOpportunityPickSource') && opportunityPickSourceModule.includes('opportunityPickInlineSource') && opportunityPickSourceModule.includes('opportunityPickSource'), 'opportunity-pick source module exports are incomplete');
    const opportunityPickInlineBody = functionBody(opportunityPickSourceModule, 'opportunityPickInlineSource');
    assert(opportunityPickInlineBody.includes('String.raw`'), 'opportunity-pick inline source factory does not return raw browser source');
    assert(opportunityPickInlineBody.includes('function pickBestOpportunity'), 'opportunity-pick inline source factory does not include pickBestOpportunity');
    assert(opportunityPickInlineBody.includes('pickCoinRouteOpportunity'), 'opportunity-pick inline source factory does not include route opportunity selection');
    assert(opportunityPickInlineBody.includes('buildOpportunityCandidatesCore'), 'opportunity-pick inline source factory does not include candidate core call');
    assert(functionBody(opportunityPickSourceModule, 'bundledOpportunityPickSource').includes("require('./src/browser/runtime/opportunity-pick')"), 'opportunity-pick bundled source does not hand picker core to the bundler');
    assert(patrolSourceModule.includes('function patrolInlineSource() {'), 'patrol inline source factory not found');
    assert(patrolSourceModule.includes('function bundledPatrolSource() {'), 'patrol bundled source factory not found');
    assert(patrolSourceModule.includes('function patrolSource(options = {}) {'), 'patrol source selector not found');
    assert(patrolSourceModule.includes('bundledPatrolSource') && patrolSourceModule.includes('patrolInlineSource') && patrolSourceModule.includes('patrolSource'), 'patrol source module exports are incomplete');
    const patrolInlineBody = functionBody(patrolSourceModule, 'patrolInlineSource');
    assert(patrolInlineBody.includes('String.raw`'), 'patrol inline source factory does not return raw browser source');
    assert(patrolInlineBody.includes('function patrolDirection'), 'patrol inline source factory does not include patrolDirection');
    assert(patrolInlineBody.includes('scan-toward-distant-coin'), 'patrol inline source factory does not include distant coin patrol branch');
    assert(patrolInlineBody.includes('maintain-safe-spacing'), 'patrol inline source factory does not include safe spacing patrol branch');
    assert(functionBody(patrolSourceModule, 'bundledPatrolSource').includes("require('./src/browser/runtime/patrol')"), 'patrol bundled source does not hand patrol core to the bundler');
    assert(opportunityClearSourceModule.includes('function opportunityClearInlineSource() {'), 'opportunity-clear inline source factory not found');
    assert(opportunityClearSourceModule.includes('function bundledOpportunityClearSource() {'), 'opportunity-clear bundled source factory not found');
    assert(opportunityClearSourceModule.includes('function opportunityClearSource(options = {}) {'), 'opportunity-clear source selector not found');
    assert(opportunityClearSourceModule.includes('bundledOpportunityClearSource') && opportunityClearSourceModule.includes('opportunityClearInlineSource') && opportunityClearSourceModule.includes('opportunityClearSource'), 'opportunity-clear source module exports are incomplete');
    const opportunityClearInlineBody = functionBody(opportunityClearSourceModule, 'opportunityClearInlineSource');
    assert(opportunityClearInlineBody.includes('String.raw`'), 'opportunity-clear inline source factory does not return raw browser source');
    assert(opportunityClearInlineBody.includes('function clearOpportunityChoiceFor'), 'opportunity-clear inline source factory does not include clearOpportunityChoiceFor');
    assert(opportunityClearInlineBody.includes('bot.opportunityChoice = null'), 'opportunity-clear inline source factory does not clear opportunity choice');
    assert(opportunityClearInlineBody.includes('resetOpportunitySwitchLock()'), 'opportunity-clear inline source factory does not reset switch lock');
    const opportunityClearBundledBody = functionBody(opportunityClearSourceModule, 'bundledOpportunityClearSource');
    assert(opportunityClearBundledBody.includes("require('./src/browser/runtime/opportunity-clear')"), 'opportunity-clear bundled source does not hand clear helper to the bundler');
    assert(!opportunityClearBundledBody.includes('function clearOpportunityChoiceFor'), 'opportunity-clear bundled source still keeps clear wrapper');
    assert(opportunityClearCallSourceModule.includes('function clearOpportunityChoiceForCall'), 'opportunity-clear direct call source helper not found');
    assert(opportunityClearCallSourceModule.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice'), 'opportunity-clear direct call helper does not call clear core');
    assert(opportunityClearCallSourceModule.includes('bot.opportunityChoice = null'), 'opportunity-clear direct call helper does not clear choice state');
    assert(opportunityClearCallSourceModule.includes('resetOpportunitySwitchLock()'), 'opportunity-clear direct call helper does not reset switch lock');
    assert(opportunityRouteSourceModule.includes('function opportunityRouteInlineSource(helpers = {}, options = {}) {'), 'opportunity-route inline source factory not found');
    assert(opportunityRouteSourceModule.includes('function bundledOpportunityRouteSource() {'), 'opportunity-route bundled source factory not found');
    assert(opportunityRouteSourceModule.includes('function opportunityRouteSource(options = {}) {'), 'opportunity-route source selector not found');
    assert(opportunityRouteSourceModule.includes('bundledOpportunityRouteSource') && opportunityRouteSourceModule.includes('opportunityRouteInlineSource') && opportunityRouteSourceModule.includes('opportunityRouteSource'), 'opportunity-route source module exports are incomplete');
    const opportunityRouteInlineBody = functionBody(opportunityRouteSourceModule, 'opportunityRouteInlineSource');
    assert(opportunityRouteInlineBody.includes('String.raw`'), 'opportunity-route inline source factory does not return raw browser source');
    assert(opportunityRouteInlineBody.includes('coinRouteHelperSource'), 'opportunity-route inline source factory does not inject coin route helpers');
    assert(opportunityRouteInlineBody.includes('function coinRouteCoreOptions'), 'opportunity-route inline source factory does not include core options wrapper');
    assert(opportunityRouteInlineBody.includes('function currentHeldCoinRouteChoice'), 'opportunity-route inline source factory does not include held route helper');
    assert(functionBody(opportunityRouteSourceModule, 'bundledOpportunityRouteSource').includes("require('./src/browser/runtime/coin-route')"), 'opportunity-route bundled source does not hand coin-route helpers to the bundler');
    assert(coinTargetRuntimeSourceModule.includes('function bundledCoinTargetRuntimeSource()'), 'bundled coin-target runtime source factory not found');
    assert(coinTargetRuntimeSourceModule.includes('function coinTargetRuntimeInlineSource(helpers = {}, options = {})'), 'inline coin-target runtime source factory not found');
    assert(coinTargetRuntimeSourceModule.includes('function coinTargetRuntimeSource(options = {})'), 'coin-target runtime source factory not found');
    assert(coinTargetRuntimeSourceModule.includes('module.exports = {\n  bundledCoinTargetRuntimeSource,\n  coinTargetRuntimeInlineSource,\n  coinTargetRuntimeSource,\n  rememberNativeCoinSnapshotCall\n}'), 'coin-target runtime module export not found');
    assert(coinTargetRuntimeSourceModule.includes("require('./src/browser/runtime/coin-target')"), 'coin-target runtime source does not expose a bundler-owned coin-target require');
    assert(coinTargetRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledCoinTargetRuntimeSource();'), 'coin-target runtime source factory does not switch to bundler-owned source in remote builds');
    assert(functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeInlineSource').includes('String.raw`'), 'coin-target inline runtime source factory does not return raw browser source');
    assert(functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeInlineSource').includes('coinTargetHelperSource'), 'coin-target inline runtime source factory does not inject helper source');
    assert(functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeInlineSource').includes('function markCoinCollected'), 'coin-target runtime source factory does not include tracked pickup recorder');
    assert(functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeInlineSource').includes('function recordIncidentalCoinPickups'), 'coin-target runtime source factory does not include incidental pickup recorder');
    assert(chooseActionSourceModule.includes('function chooseActionSource(options = {}) {'), 'choose-action source factory not found');
    assert(chooseActionSourceModule.includes('module.exports = { chooseActionSource }'), 'choose-action source module export not found');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('String.raw`'), 'choose-action source factory does not return raw browser source');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('function chooseAction(self)'), 'choose-action source factory does not include chooseAction');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('buildCoinDiagnostics'), 'choose-action source factory does not preserve coin diagnostics');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('coinMotionMetaCore(dir)'), 'choose-action source factory does not use coin motion metadata core directly');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('highValueVisibleCoinPriorityNeeded'), 'choose-action source factory does not preserve high-value visible coin priority');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('pickPostAttackDropCoin'), 'choose-action source factory does not preserve post-attack drop coin handling');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('summarizeNearestCoinStaminaBudgetExit'), 'choose-action source factory does not preserve stamina-budget exit handling');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('pickBestOpportunity'), 'choose-action source factory does not preserve opportunity selection');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes("'wait-for-visible-coin-refresh'"), 'choose-action source factory does not preserve visible-coin wait reason');
    assert(tickSourceModule.includes('function tickSource(options = {}) {'), 'tick source factory not found');
    assert(tickSourceModule.includes('module.exports = { tickSource }'), 'tick source module export not found');
    assert(functionBody(tickSourceModule, 'tickSource').includes('String.raw`'), 'tick source factory does not return raw browser source');
    assert(functionBody(tickSourceModule, 'tickSource').includes('clearEnemyReloginHoldBoundCore: clearEnemyReloginHoldForTickBoundCore') && functionBody(tickSourceModule, 'tickSource').includes('clearOfflineReloginHoldBoundCore: clearOfflineReloginHoldForTickBoundCore'), 'tick source factory does not import bundled relogin hold cleanup bound cores');
    assert(functionBody(tickSourceModule, 'tickSource').includes('clearEnemyReloginHoldForTickBoundCore(bot, localStorage') && functionBody(tickSourceModule, 'tickSource').includes('clearOfflineReloginHoldForTickBoundCore(bot, localStorage'), 'tick source factory does not bind bundled relogin hold cleanup through runtime bound cores');
    assert(functionBody(tickSourceModule, 'tickSource').includes('currentOfflineDisplayReasonCore: currentOfflineDisplayReasonForTickCore'), 'tick source factory does not import bundled offline display core alias');
    assert(functionBody(tickSourceModule, 'tickSource').includes('currentOfflineDisplayReasonForTickCore(${reason}, ${offlineSafety}, ${leaveResult}, ${offlineDetail}, ${fallback}, { offlineLeaveSummary: (summaryReason, summarySafety) => offlineLeaveSummaryForTickCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }) })'), 'tick source factory does not bind bundled offline display core directly');
    assert(functionBody(tickSourceModule, 'tickSource').includes('offlineLeaveSummaryCore: offlineLeaveSummaryForTickCore'), 'tick source factory does not import bundled offline summary core alias');
    assert(functionBody(tickSourceModule, 'tickSource').includes('offlineLeaveSummaryForTickCore(${reason}, ${offlineSafety}, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })'), 'tick source factory does not bind bundled offline summary core directly');
    assert(functionBody(tickSourceModule, 'tickSource').includes('injuryLeaveSummaryCore: injuryLeaveSummaryForTickCore'), 'tick source factory does not import bundled injury summary core alias');
    assert(functionBody(tickSourceModule, 'tickSource').includes('injuryLeaveSummaryForTickCore(${injury}, { actorLabel, hpDisplay })'), 'tick source factory does not bind bundled injury summary core directly');
    assert(functionBody(tickSourceModule, 'tickSource').includes('pursuitLeaveSummaryCore: pursuitLeaveSummaryForTickCore'), 'tick source factory does not import bundled pursuit summary core alias');
    assert(functionBody(tickSourceModule, 'tickSource').includes('pursuitLeaveSummaryForTickCore(${pursuit}, { actorLabel, formatDurationMs, formatDistance })'), 'tick source factory does not bind bundled pursuit summary core directly');
    assert(functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragmentEntries').includes("['combat-state', () => combatStateSource(config)]"), 'runtime fragment registry does not pass config into combat-state source');
    assert(functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragmentEntries').includes("['tick', () => tickSource(config)]"), 'runtime fragment registry does not pass config into tick source');
    assert(functionBody(tickSourceModule, 'tickSource').includes("async function tick(source = 'timer')"), 'tick source factory does not include tick');
    assert(functionBody(tickSourceModule, 'tickSource').includes('handlePendingExit(self)'), 'tick source factory does not preserve pending-exit handling');
    assert(functionBody(tickSourceModule, 'tickSource').includes('maybeStartAutoLogin'), 'tick source factory does not preserve login handling');
    assert(functionBody(tickSourceModule, 'tickSource').includes('leaveOffline'), 'tick source factory does not preserve offline leave handling');
    assert(functionBody(tickSourceModule, 'tickSource').includes('chooseAction(self)'), 'tick source factory does not preserve action selection');
    assert(functionBody(tickSourceModule, 'tickSource').includes("trackCoinProgressCall('action', 'self', options)"), 'tick source factory does not preserve coin progress tracking');
    assert(functionBody(tickSourceModule, 'tickSource').includes('applyFinalActionArbitration(action, source)'), 'tick source factory does not preserve final action arbitration');
    assert(functionBody(tickSourceModule, 'tickSource').includes('recordImportantCombatTick(source, bot.lastDecision)'), 'tick source factory does not preserve important combat tick logging');
    assert(functionBody(tickSourceModule, 'tickSource').includes('recordCombatLogTick(source, bot.lastDecision)'), 'tick source factory does not preserve combat-log tick logging');
    assert(startupSourceModule.includes('function startupSource() {'), 'startup source factory not found');
    assert(startupSourceModule.includes('module.exports = { startupSource }'), 'startup source module export not found');
    assert(functionBody(startupSourceModule, 'startupSource').includes('String.raw`'), 'startup source factory does not return raw browser source');
    assert(functionBody(startupSourceModule, 'startupSource').includes('restorePersistedExitAuditLogs()'), 'startup source factory does not preserve exit audit restore');
    assert(functionBody(startupSourceModule, 'startupSource').includes('restorePersistedCombatLogPendingEntries()'), 'startup source factory does not preserve combat-log pending restore');
    assert(functionBody(startupSourceModule, 'startupSource').includes('restoreImportantLogsForRemote()'), 'startup source factory does not preserve important-log restore');
    assert(functionBody(startupSourceModule, 'startupSource').includes('installNativeLoginGateInterceptors()'), 'startup source factory does not preserve native login gate install');
    assert(functionBody(startupSourceModule, 'startupSource').includes('installPageGlobal(BOT_KEY, bot, pageGlobal)'), 'startup source factory does not preserve bot page-global install');
    assert(functionBody(startupSourceModule, 'startupSource').includes('previousBot.stop'), 'startup source factory does not preserve previous bot shutdown');
    assert(functionBody(startupSourceModule, 'startupSource').includes('installPageNativeSnapshotObserver()'), 'startup source factory does not preserve page-native observer install');
    assert(functionBody(startupSourceModule, 'startupSource').includes('startTargetWhitelistPolling()'), 'startup source factory does not preserve target whitelist polling');
    assert(functionBody(startupSourceModule, 'startupSource').includes("tick('startup')"), 'startup source factory does not preserve startup tick');
    assert(functionBody(startupSourceModule, 'startupSource').includes("runTickSafely('timer')"), 'startup source factory does not preserve timer tick safety');
    assert(botObjectSourceModule.includes('function botObjectSource(options = {}) {'), 'bot-object source factory not found');
    assert(botObjectSourceModule.includes('module.exports = { botObjectSource }'), 'bot-object source module export not found');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('String.raw`'), 'bot-object source factory does not return raw browser source');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('readEnemyLeaveStreakBoundCore(localStorage, bot, cfg, Date.now()') && functionBody(botObjectSourceModule, 'botObjectSource').includes('enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY'), 'bot-object source factory does not bind bundled enemy streak status through runtime bound core');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes("? 'loginSnapshotSuccessRequiredCore()'"), 'bot-object source factory does not route bundled login snapshot required count through core');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('normalizeLoginSnapshotGateStateCore(${state}, ${loginSnapshotSuccessRequiredCall})'), 'bot-object source factory does not route bundled login snapshot normalization through core');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('postExitDecisionWithoutTargetForStatusCore'), 'bot-object source factory does not route bundled post-exit display through core alias');
    assert(functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragmentEntries').includes("['bot-object', () => botObjectSource(config)]"), 'runtime fragment registry does not pass config into bot-object source');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('const bot = {'), 'bot-object source factory does not include bot object');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('pendingExit: initialPendingExitState'), 'bot-object source factory does not preserve pending exit initialization');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('combatLogging: {'), 'bot-object source factory does not preserve combat logging state');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('importantLogging: {'), 'bot-object source factory does not preserve important logging state');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('postLoginZoom: {'), 'bot-object source factory does not preserve post-login zoom state');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes("stop(reason = 'manual')"), 'bot-object source factory does not preserve stop method');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes("setPaused(paused, reason = 'external')"), 'bot-object source factory does not preserve pause method');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('status()'), 'bot-object source factory does not preserve status method');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('summarizeNetworkQuality()'), 'bot-object source factory does not preserve network quality status');
    assert(functionBody(botObjectSourceModule, 'botObjectSource').includes('summarizePendingExit(this.pendingExit)'), 'bot-object source factory does not preserve pending exit status');
    assert(controlLoginSourceModule.includes('function controlLoginSource(helpers = {}) {'), 'control-login source factory not found');
    assert(controlLoginSourceModule.includes('module.exports = {\n  controlLoginSource'), 'control-login module export not found');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('String.raw`'), 'control-login source factory does not return raw browser source');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('typeof staminaExhaustedWindowLabel === \'function\' ? staminaExhaustedWindowLabel.toString() : \'\''), 'control-login source factory does not inline stamina window helper');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes("? 'loginSnapshotSuccessRequiredCore()'"), 'control-login source does not route bundled login snapshot required count through core');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('normalizeLoginSnapshotGateStateCore(${state}, ${loginSnapshotSuccessRequiredCall})'), 'control-login source does not route bundled login snapshot normalization through core');
    assert(controlLoginSourceModule.includes('function currentBotIsInstalled()'), 'control-login source does not expose current bot helper');
    assert(controlLoginSourceModule.includes('readPageGlobal(BOT_KEY, null, pageGlobal) === bot'), 'control-login source does not read bot identity through page-global adapter');
    assert(controlLoginSourceModule.includes("readPageGlobal('__graspRatBotPauseReason', '', pageGlobal)"), 'control-login source does not read pause reason through page-global adapter');
    assert(controlLoginSourceModule.includes("readPageGlobal('__graspRatBotPaused', false, pageGlobal) === true"), 'control-login source does not read paused state through page-global adapter');
    assert(controlLoginSourceModule.includes("installPageGlobal('__graspRatManualLoginBypassUntil'"), 'control-login source does not install manual login bypass through page-global adapter');
    assert(controlLoginSourceModule.includes("readPageGlobal('__graspRatManualLoginBypassUntil', 0, pageGlobal)"), 'control-login source does not read manual login bypass through page-global adapter');
    assert(controlLoginSourceModule.includes("readPageGlobal('__graspRatBotStartLinuxDoLoginGateVersion', '', pageGlobal)"), 'control-login source does not read startLinuxDoLogin gate version through page-global adapter');
    assert(controlLoginSourceModule.includes("const current = readPageGlobal('startLinuxDoLogin', null, pageGlobal);"), 'control-login source does not read startLinuxDoLogin through page-global adapter');
    assert(controlLoginSourceModule.includes("installPageGlobal('__graspRatBotRawStartLinuxDoLogin', previous, pageGlobal);"), 'control-login source does not preserve raw startLinuxDoLogin through page-global adapter');
    assert(controlLoginSourceModule.includes("installPageGlobal('startLinuxDoLogin', guardedStartLinuxDoLogin, pageGlobal);"), 'control-login source does not install guarded startLinuxDoLogin through page-global adapter');
    assert(!controlLoginSourceModule.includes('window[BOT_KEY]'), 'control-login source still reads bot identity directly from window');
    assert(!controlLoginSourceModule.includes('window.__graspRatBotPauseReason'), 'control-login source still reads pause reason directly from window');
    assert(!controlLoginSourceModule.includes('window.__graspRatBotPaused'), 'control-login source still reads paused state directly from window');
    assert(!controlLoginSourceModule.includes('window.__graspRatManualLoginBypass'), 'control-login source still accesses manual login bypass directly on window');
    assert(!controlLoginSourceModule.includes('window.__graspRatStartLinuxDoLoginGateInstalled'), 'control-login source still reads startLinuxDoLogin installed flag directly from window');
    assert(!controlLoginSourceModule.includes('window.__graspRatBotStartLinuxDoLoginGateVersion'), 'control-login source still reads startLinuxDoLogin version directly from window');
    assert(!controlLoginSourceModule.includes('window.__graspRatBotRawStartLinuxDoLogin'), 'control-login source still reads raw startLinuxDoLogin directly from window');
    assert(!controlLoginSourceModule.includes('window.startLinuxDoLogin'), 'control-login source still accesses startLinuxDoLogin directly on window');
    assert(nativeStateSourceModule.includes('function nativeStateSource() {'), 'native-state source factory not found');
    assert(nativeStateSourceModule.includes('module.exports = {\n  nativeStateSource'), 'native-state module export not found');
    assert(functionBody(nativeStateSourceModule, 'nativeStateSource').includes('String.raw`'), 'native-state source factory does not return raw browser source');
    assert(functionBody(nativeStateSourceModule, 'nativeStateSource').includes('function getNativeState()'), 'native-state source factory does not include native state helpers');
    assert(nativeControlSourceModule.includes('function nativeControlSource() {'), 'native-control source factory not found');
    assert(nativeControlSourceModule.includes('module.exports = {\n  nativeControlSource'), 'native-control module export not found');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('String.raw`'), 'native-control source factory does not return raw browser source');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('function sendDirectNativeVelocity'), 'native-control source factory does not include direct velocity sender');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('function scheduleDirectVelocityRepeat'), 'native-control source factory does not include velocity repeat scheduler');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('function stopMotionSafely'), 'native-control source factory does not include safe stop helper');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('function sendNativeShoot'), 'native-control source factory does not include native shoot helper');
    assert(functionBody(nativeControlSourceModule, 'nativeControlSource').includes('function shootAt'), 'native-control source factory does not include shoot cadence wrapper');
    assert(coinMotionRuntimeSourceModule.includes('function bundledCoinMotionRuntimeSource()'), 'bundled coin-motion runtime source factory not found');
    assert(coinMotionRuntimeSourceModule.includes('function coinMotionRuntimeInlineSource(helpers = {}, options = {})'), 'inline coin-motion runtime source factory not found');
    assert(coinMotionRuntimeSourceModule.includes('function coinMotionRuntimeSource(options = {})'), 'coin-motion runtime source factory not found');
    assert(coinMotionRuntimeSourceModule.includes('module.exports = {\n  bundledCoinMotionRuntimeSource,\n  coinDirectionToCall,\n  coinMotionRuntimeInlineSource,\n  coinMotionRuntimeSource\n}'), 'coin-motion runtime module export not found');
    assert(coinMotionRuntimeSourceModule.includes("require('./src/browser/runtime/coin-motion')"), 'coin-motion runtime source does not expose a bundler-owned coin-motion require');
    assert(coinMotionRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledCoinMotionRuntimeSource();'), 'coin-motion runtime source factory does not switch to bundler-owned source in remote builds');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeInlineSource').includes('String.raw`'), 'coin-motion inline runtime source factory does not return raw browser source');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeInlineSource').includes('coinMotionHelperSource'), 'coin-motion inline runtime source factory does not inject helper source');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeInlineSource').includes('function coinMotionCoreOptions'), 'coin-motion runtime source factory does not include core options wrapper');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeInlineSource').includes('function applyCoinApproachLockUpdate'), 'coin-motion runtime source factory does not include lock update wrapper');
    assert(returnBlockSourceModule.includes('function returnBlockSource() {'), 'return-block source factory not found');
    assert(returnBlockSourceModule.includes('module.exports = {\n  returnBlockSource'), 'return-block source module export not found');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('String.raw`'), 'return-block source factory does not return raw browser source');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('function fleeDirection'), 'return-block source factory does not include flee direction helper');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('function lockedFleeDirection'), 'return-block source factory does not include locked flee helper');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('function returnBlockScanDirection'), 'return-block source factory does not include scan direction helper');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('function buildReturnBlockScanAction'), 'return-block source factory does not include scan action builder');
    assert(functionBody(returnBlockSourceModule, 'returnBlockSource').includes('function blockThreatReturnAction'), 'return-block source factory does not include threat return-block helper');
    assert(entityActivitySourceModule.includes('function entityActivitySource() {'), 'entity-activity source factory not found');
    assert(entityActivitySourceModule.includes('module.exports = {\n  entityActivitySource'), 'entity-activity source module export not found');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('String.raw`'), 'entity-activity source factory does not return raw browser source');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('const now = () => performance.now();'), 'entity-activity source factory does not include clock helper');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('const dist = (a, b)'), 'entity-activity source factory does not include distance helper');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('const isInvulnerable = e => anyPositiveNumber'), 'entity-activity source factory does not include invulnerability helper');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('function recentlyActionedForAfk'), 'entity-activity source factory does not include recent-activity helper');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('function isIdleInvulnerableTarget'), 'entity-activity source factory does not include idle invulnerable helper');
    assert(functionBody(entityActivitySourceModule, 'entityActivitySource').includes('const isAfkProfitTarget'), 'entity-activity source factory does not include AFK profit helper');
    assert(staminaRuntimeSourceModule.includes('function staminaRuntimeSource() {'), 'stamina-runtime source factory not found');
    assert(staminaRuntimeSourceModule.includes('module.exports = {\n  staminaRuntimeSource'), 'stamina-runtime source module export not found');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('String.raw`'), 'stamina-runtime source factory does not return raw browser source');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('const hpValue = e =>'), 'stamina-runtime source factory does not include HP helper');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('const decorateActiveThreat'), 'stamina-runtime source factory does not include active threat decoration helper');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('function summarizeStamina'), 'stamina-runtime source factory does not include stamina summary helper');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('function staminaResetHoldUntil'), 'stamina-runtime source factory does not include reset hold helper');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('function deferredStaminaExhaustionLeave'), 'stamina-runtime source factory does not include deferred leave helper');
    assert(functionBody(staminaRuntimeSourceModule, 'staminaRuntimeSource').includes('function staleOfflineStaminaHoldContradicted'), 'stamina-runtime source factory does not include stale offline contradiction helper');
    assert(attackWorthSourceModule.includes('function attackWorthInlineSource() {'), 'attack-worth inline source factory not found');
    assert(attackWorthSourceModule.includes('function bundledAttackWorthSource() {'), 'attack-worth bundled source factory not found');
    assert(attackWorthSourceModule.includes('function attackWorthSource(options = {}) {'), 'attack-worth source selector not found');
    assert(attackWorthSourceModule.includes('attackWorthInlineSource') && attackWorthSourceModule.includes('bundledAttackWorthSource') && attackWorthSourceModule.includes('attackWorthSource'), 'attack-worth source module exports are incomplete');
    const attackWorthInlineBody = functionBody(attackWorthSourceModule, 'attackWorthInlineSource');
    assert(attackWorthInlineBody.includes('String.raw`'), 'attack-worth inline source factory does not return raw browser source');
    assert(attackWorthInlineBody.includes('const attackWorthTaking = (self, target) =>'), 'attack-worth inline source factory does not include attack worth wrapper');
    assert(attackWorthInlineBody.includes('isWhitelistedTarget(target)'), 'attack-worth inline source factory does not preserve whitelist guard');
    assert(attackWorthInlineBody.includes('isAfkProfitTarget(target)'), 'attack-worth inline source factory does not preserve AFK profit target handling');
    assert(attackWorthInlineBody.includes('cfg.attackMinRewardRatio'), 'attack-worth inline source factory does not preserve reward ratio guard');
    const attackWorthBundledBody = functionBody(attackWorthSourceModule, 'bundledAttackWorthSource');
    assert(attackWorthBundledBody.includes("require('./src/browser/runtime/attack-worth')"), 'attack-worth bundled source does not hand attack-worth core to the bundler');
    assert(!attackWorthBundledBody.includes('const attackWorthTaking ='), 'attack-worth bundled source still keeps attack-worth wrapper');
    assert(exitMotionSourceModule.includes('function exitMotionInlineSource() {'), 'exit-motion inline source factory not found');
    assert(exitMotionSourceModule.includes('function bundledExitMotionSource() {'), 'exit-motion bundled source factory not found');
    assert(exitMotionSourceModule.includes('function exitMotionSource(options = {}) {'), 'exit-motion source selector not found');
    assert(exitMotionSourceModule.includes('exitMotionInlineSource') && exitMotionSourceModule.includes('bundledExitMotionSource') && exitMotionSourceModule.includes('exitMotionSource'), 'exit-motion source module exports are incomplete');
    const exitMotionInlineBody = functionBody(exitMotionSourceModule, 'exitMotionInlineSource');
    assert(exitMotionInlineBody.includes('String.raw`'), 'exit-motion inline source factory does not return raw browser source');
    assert(exitMotionInlineBody.includes('function exitMotionStopLockRemainingMs'), 'exit-motion inline source factory does not include motion stop lock helper');
    assert(!exitMotionInlineBody.includes('function exitMotionStopActive'), 'exit-motion inline source still keeps stop-active alias');
    assert(exitMotionInlineBody.includes('function postExitDecisionWithoutTarget'), 'exit-motion inline source factory does not include post-exit decision helper');
    assert(exitMotionInlineBody.includes('function clearPostExitTargetState'), 'exit-motion inline source factory does not include post-exit target cleanup helper');
    assert(exitMotionInlineBody.includes('removeTargetOverlay()'), 'exit-motion inline source factory does not clear target overlay');
    const exitMotionBundledBody = functionBody(exitMotionSourceModule, 'bundledExitMotionSource');
    assert(exitMotionBundledBody.includes("require('./src/browser/runtime/exit-motion')"), 'exit-motion bundled source does not hand exit-motion core to the bundler');
    assert(exitMotionBundledBody.includes('exitMotionStopLockRemainingMsCore(bot.lastExitMotionStopAt, cfg.exitMotionStopLockMs, t)'), 'exit-motion bundled source does not call lock core with runtime state/config');
    assert(!exitMotionBundledBody.includes('function exitMotionStopActive'), 'exit-motion bundled source still keeps stop-active alias');
    assert(!exitMotionBundledBody.includes('function postExitDecisionWithoutTarget('), 'exit-motion bundled source still keeps post-exit decision wrapper');
    assert(exitMotionBundledBody.includes('postExitDecisionWithoutTargetCore(bot.lastDecision, reason'), 'exit-motion bundled cleanup does not sanitize last decision through core directly');
    assert(exitMotionBundledBody.includes('removeTargetOverlay()'), 'exit-motion bundled source does not retain target overlay cleanup');
    assert(functionBody(targetOverlaySourceModule, 'targetOverlaySuppressedAfterExit').includes('exitMotionStopLockRemainingMs() > 0'), 'target overlay still relies on exit-motion stop-active alias');
    assert(functionBody(tickSourceModule, 'tickSource').includes('postExitDecisionWithoutTargetForTickCore'), 'tick source does not route bundled post-exit decision through core alias');
    assert(arrayCountSourceModule.includes('function arrayCountSource(options = {}) {'), 'array-count source factory not found');
    assert(arrayCountSourceModule.includes('function bundledArrayCountSource()'), 'bundled array-count source factory not found');
    assert(arrayCountSourceModule.includes('module.exports = { arrayCountSource }'), 'array-count source module export not found');
    assert(arrayCountSourceModule.includes("require('./runtime/array-count')"), 'array-count source factory does not import the runtime helper module');
    assert(arrayCountSourceModule.includes("require('./src/browser/runtime/array-count')"), 'array-count source factory does not expose a bundler-owned runtime helper require');
    assert(arrayCountSourceModule.includes('if (options.bundledRuntime) return bundledArrayCountSource();'), 'array-count source factory does not switch to bundler-owned source in remote builds');
    assert(arrayCountSourceModule.includes('function indentSource(source, spaces)'), 'array-count source factory does not preserve generated indentation');
    assert(functionBody(arrayCountSourceModule, 'arrayCountSource').includes('arrayCount.toString()'), 'array-count source factory does not inline the runtime helper module');
    assert(arrayCountRuntimeModule.includes('function arrayCount(value)'), 'array-count runtime helper not found');
    assert(arrayCountRuntimeModule.includes('Array.isArray(value) ? value.length : 0'), 'array-count runtime helper does not preserve array length fallback');
    assert(arrayCountRuntimeModule.includes('module.exports = {\n  arrayCount\n}'), 'array-count runtime helper export not found');
    assert(tickSafetySourceModule.includes('function tickSafetySource(options = {}) {'), 'tick-safety source factory not found');
    assert(tickSafetySourceModule.includes('module.exports = { tickSafetySource }'), 'tick-safety source module export not found');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('String.raw`'), 'tick-safety source factory does not return raw browser source');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('recordRuntimeDiagnosticsCore(bot, ${values})'), 'tick-safety source factory does not route bundled runtime diagnostics through core');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('function recordUnhandledTickError'), 'tick-safety source factory does not include unhandled tick recorder');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes("console.error('[grasp-rat-bot:unhandled-tick]', err)"), 'tick-safety source factory does not preserve console error logging');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('function runTickSafely'), 'tick-safety source factory does not include tick safety wrapper');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('recordRuntimeDiagnostics'), 'tick-safety source factory does not preserve runtime diagnostics recording');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes('function runCallbackSafely'), 'tick-safety source factory does not include callback safety wrapper');
    assert(functionBody(tickSafetySourceModule, 'tickSafetySource').includes("result.catch(err => recordUnhandledTickError(label, err))"), 'tick-safety source factory does not preserve async callback error capture');
    assert(persistentLastSelfSourceModule.includes('function persistentLastSelfInlineSource() {'), 'persistent-last-self inline source factory not found');
    assert(persistentLastSelfSourceModule.includes('function bundledPersistentLastSelfSource() {'), 'persistent-last-self bundled source factory not found');
    assert(persistentLastSelfSourceModule.includes('function persistentLastSelfSource(options = {}) {'), 'persistent-last-self source selector not found');
    assert(persistentLastSelfSourceModule.includes('persistentLastSelfInlineSource') && persistentLastSelfSourceModule.includes('bundledPersistentLastSelfSource') && persistentLastSelfSourceModule.includes('persistentLastSelfSource'), 'persistent-last-self source module exports are incomplete');
    const persistentLastSelfInlineBody = functionBody(persistentLastSelfSourceModule, 'persistentLastSelfInlineSource');
    assert(persistentLastSelfInlineBody.includes('String.raw`'), 'persistent-last-self inline source factory does not return raw browser source');
    assert(persistentLastSelfInlineBody.includes('function readPersistentLastSelfState'), 'persistent-last-self inline source factory does not include read helper');
    assert(persistentLastSelfInlineBody.includes('function writePersistentLastSelfState'), 'persistent-last-self inline source factory does not include write helper');
    assert(persistentLastSelfInlineBody.includes('LAST_SELF_STATE_KEY'), 'persistent-last-self inline source factory does not use last-self storage key');
    const persistentLastSelfBundledBody = functionBody(persistentLastSelfSourceModule, 'bundledPersistentLastSelfSource');
    assert(persistentLastSelfBundledBody.includes("require('./src/browser/runtime/persistent-last-self')"), 'persistent-last-self bundled source does not hand helpers to the bundler');
    assert(persistentLastSelfBundledBody.includes('readPersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, cfg.lastSelfPersistMaxMs, t)'), 'persistent-last-self bundled source does not call read core with runtime config');
    assert(persistentLastSelfBundledBody.includes('writePersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, selfSummary, t)'), 'persistent-last-self bundled source does not call write core with runtime key');
    assert(persistentExitSourceModule.includes('function persistentExitInlineSource() {'), 'persistent-exit inline source factory not found');
    assert(persistentExitSourceModule.includes('function bundledPersistentExitSource() {'), 'persistent-exit bundled source factory not found');
    assert(persistentExitSourceModule.includes('function persistentExitSource(options = {}) {'), 'persistent-exit source selector not found');
    assert(persistentExitSourceModule.includes('persistentExitInlineSource') && persistentExitSourceModule.includes('bundledPersistentExitSource') && persistentExitSourceModule.includes('persistentExitSource'), 'persistent-exit source module exports are incomplete');
    const persistentExitInlineBody = functionBody(persistentExitSourceModule, 'persistentExitInlineSource');
    assert(persistentExitInlineBody.includes('String.raw`'), 'persistent-exit inline source factory does not return raw browser source');
    assert(persistentExitInlineBody.includes('function readPersistentExitState'), 'persistent-exit inline source factory does not include read helper');
    assert(persistentExitInlineBody.includes('function writePersistentExitState'), 'persistent-exit inline source factory does not include write helper');
    assert(persistentExitInlineBody.includes('refreshExitDetail'), 'persistent-exit inline source factory does not refresh exit detail');
    const persistentExitBundledBody = functionBody(persistentExitSourceModule, 'bundledPersistentExitSource');
    assert(persistentExitBundledBody.includes("require('./src/browser/runtime/persistent-exit')"), 'persistent-exit bundled source does not hand helpers to the bundler');
    assert(persistentExitBundledBody.includes('readPersistentExitStateCore(localStorage, key, refreshExitDetail, t)'), 'persistent-exit bundled source does not call read core with refresh detail');
    assert(persistentExitBundledBody.includes('writePersistentExitStateCore(localStorage, key, detail, refreshExitDetail)'), 'persistent-exit bundled source does not call write core with refresh detail');
    assert(persistentClearSourceModule.includes('function persistentClearInlineSource() {'), 'persistent-clear inline source factory not found');
    assert(persistentClearSourceModule.includes('function bundledPersistentClearSource() {'), 'persistent-clear bundled source factory not found');
    assert(persistentClearSourceModule.includes('function persistentClearSource(options = {}) {'), 'persistent-clear source selector not found');
    assert(persistentClearSourceModule.includes('persistentClearInlineSource') && persistentClearSourceModule.includes('bundledPersistentClearSource') && persistentClearSourceModule.includes('persistentClearSource'), 'persistent-clear source module exports are incomplete');
    const persistentClearInlineBody = functionBody(persistentClearSourceModule, 'persistentClearInlineSource');
    assert(persistentClearInlineBody.includes('String.raw`'), 'persistent-clear inline source factory does not return raw browser source');
    assert(persistentClearInlineBody.includes('function clearPersistentExitState'), 'persistent-clear inline source factory does not include exit clear helper');
    assert(persistentClearInlineBody.includes('function clearPersistentPendingExitState'), 'persistent-clear inline source factory does not include pending-exit clear helper');
    assert(persistentClearInlineBody.includes('PENDING_EXIT_STATE_KEY'), 'persistent-clear inline source factory does not clear pending-exit storage key');
    const persistentClearBundledBody = functionBody(persistentClearSourceModule, 'bundledPersistentClearSource');
    assert(persistentClearBundledBody.includes("require('./src/browser/runtime/persistent-clear')"), 'persistent-clear bundled source does not hand clear helper to the bundler');
    assert(persistentClearBundledBody.includes('clearPersistentStorageKey(key)'), 'persistent-clear bundled source does not clear provided exit key');
    assert(persistentClearBundledBody.includes('clearPersistentStorageKey(PENDING_EXIT_STATE_KEY)'), 'persistent-clear bundled source does not clear pending-exit storage key');
    assert(pendingExitPersistenceSourceModule.includes('function pendingExitPersistenceInlineSource() {'), 'pending-exit persistence inline source factory not found');
    assert(pendingExitPersistenceSourceModule.includes('function bundledPendingExitPersistenceSource() {'), 'pending-exit persistence bundled source factory not found');
    assert(pendingExitPersistenceSourceModule.includes('function pendingExitPersistenceSource(options = {})'), 'pending-exit persistence source selector not found');
    assert(pendingExitPersistenceSourceModule.includes('pendingExitPersistenceInlineSource,\n  bundledPendingExitPersistenceSource,\n  pendingExitPersistenceSource'), 'pending-exit persistence source module exports not found');
    const pendingExitPersistenceInlineBody = functionBody(pendingExitPersistenceSourceModule, 'pendingExitPersistenceInlineSource');
    assert(pendingExitPersistenceInlineBody.includes('String.raw`'), 'pending-exit persistence inline source factory does not return raw browser source');
    assert(pendingExitPersistenceInlineBody.includes('function normalizePendingExitReloadConfirmation'), 'pending-exit persistence inline source factory does not include reload confirmation normalizer');
    assert(pendingExitPersistenceInlineBody.includes('function normalizePendingExitStateForStorage'), 'pending-exit persistence inline source factory does not include storage normalizer');
    assert(pendingExitPersistenceInlineBody.includes('function readPersistedPendingExitState'), 'pending-exit persistence inline source factory does not include storage reader');
    assert(pendingExitPersistenceInlineBody.includes('function writePersistentPendingExitState'), 'pending-exit persistence inline source factory does not include storage writer');
    assert(pendingExitPersistenceInlineBody.includes('function chooseInitialPendingExitState'), 'pending-exit persistence inline source factory does not include initial-state chooser');
    assert(pendingExitPersistenceInlineBody.includes('PENDING_EXIT_STATE_KEY'), 'pending-exit persistence inline source factory does not use pending-exit storage key');
    const pendingExitPersistenceBundledBody = functionBody(pendingExitPersistenceSourceModule, 'bundledPendingExitPersistenceSource');
    assert(pendingExitPersistenceBundledBody.includes("require('./src/browser/runtime/pending-exit-persistence')"), 'pending-exit persistence bundled source does not hand helpers to the bundler');
    assert(pendingExitPersistenceBundledBody.includes('pendingExitPersistMaxMs: cfg.pendingExitPersistMaxMs'), 'pending-exit persistence bundled source does not bind config max age');
    assert(pendingExitPersistenceBundledBody.includes('cloneForPendingExit') && pendingExitPersistenceBundledBody.includes('pendingExitDisplayReason') && pendingExitPersistenceBundledBody.includes('pendingExitRetryMs'), 'pending-exit persistence bundled source does not bind runtime helper dependencies');
    assert(pendingExitPersistenceCallSourceModule.includes('function writePersistentPendingExitStateCall') && pendingExitPersistenceCallSourceModule.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY'), 'pending-exit persistence call source does not generate direct writer core calls');
    assert(pendingExitPersistenceCallSourceModule.includes('function writePersistentPendingExitStateCallback') && pendingExitPersistenceCallSourceModule.includes('pending => writePersistentPendingExitStateCore'), 'pending-exit persistence call source does not generate direct writer callbacks');
    assert(!pendingExitPersistenceBundledBody.includes('function normalizePendingExitReloadConfirmation('), 'pending-exit persistence bundled source still keeps reload-confirmation wrapper');
    assert(!pendingExitPersistenceBundledBody.includes('function normalizePendingExitStateForStorage('), 'pending-exit persistence bundled source still keeps storage-normalizer wrapper');
    assert(!pendingExitPersistenceBundledBody.includes('function readPersistedPendingExitState('), 'pending-exit persistence bundled source still keeps storage-reader wrapper');
    assert(!pendingExitPersistenceBundledBody.includes('function writePersistentPendingExitState('), 'pending-exit persistence bundled source still keeps storage-writer wrapper');
    assert(!pendingExitPersistenceBundledBody.includes('function chooseInitialPendingExitState('), 'pending-exit persistence bundled source still keeps initial-state chooser wrapper');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes("writePersistentPendingExitStateCall(pending, { bundledRuntime })"), 'control-login source does not route pending-exit writes through direct core call helper');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('writePersistentPendingExitStateCall(pending, options)'), 'pending-exit source does not route pending-exit writes through direct core call helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('writePersistentPendingExitStateCall(pending, options)'), 'leave-command source does not route pending-exit writes through direct core call helper');
    assert(tickSourceModule.includes('writePersistentPendingExitStateCallback(options)'), 'tick source does not route relogin-hold cleanup writes through direct core callback helper');
    assert(exitReloginHoldReadCallSourceModule.includes('writePersistentPendingExitStateCallback({ bundledRuntime: true })'), 'exit-relogin hold-read call source does not route clear callbacks through direct core writer');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('const normalizePendingExitReloadConfirmationCall') && functionBody(controlLoginSourceModule, 'controlLoginSource').includes('normalizePendingExitReloadConfirmationCore(${args})'), 'control-login source does not route reload-confirmation normalization directly to core for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('const normalizePendingExitReloadConfirmationCall') && functionBody(pendingExitSourceModule, 'pendingExitSource').includes('normalizePendingExitReloadConfirmationCore(${args})'), 'pending-exit source does not route reload-confirmation normalization directly to core for bundled builds');
    assert(functionBody(pendingExitPersistenceSourceModule, 'pendingExitPersistenceSource').includes('options.bundledRuntime'), 'pending-exit persistence source selector does not switch on bundled runtime mode');
    assert(pendingExitPersistenceRuntimeModule.includes('function normalizePendingExitReloadConfirmationCore'), 'pending-exit persistence runtime reload-confirmation core not found');
    assert(pendingExitPersistenceRuntimeModule.includes('function normalizePendingExitStateForStorageCore'), 'pending-exit persistence runtime storage-normalizer core not found');
    assert(pendingExitPersistenceRuntimeModule.includes('function readPersistedPendingExitStateCore'), 'pending-exit persistence runtime storage-reader core not found');
    assert(pendingExitPersistenceRuntimeModule.includes('function writePersistentPendingExitStateCore'), 'pending-exit persistence runtime storage-writer core not found');
    assert(pendingExitPersistenceRuntimeModule.includes('function chooseInitialPendingExitStateCore'), 'pending-exit persistence runtime initial-state chooser core not found');
    assert(pendingExitPersistenceRuntimeModule.includes('Math.max(60000, Number(resolved.pendingExitPersistMaxMs || 3600000) || 3600000)'), 'pending-exit persistence runtime core does not enforce minimum max age');
    assert(pendingExitPersistenceRuntimeModule.includes('restoredAfterReload && requestedAt && !reloadedAt'), 'pending-exit persistence runtime core does not mark reload restoration');
    assert(pendingExitPersistenceRuntimeModule.includes('storage.setItem(key, resolved.stringify(normalized))'), 'pending-exit persistence runtime core does not write normalized state');
    assert(pendingExitPersistenceRuntimeModule.includes('return storedStamp > memoryStamp ? stored : memory;'), 'pending-exit persistence runtime core does not choose newest state');
    assert(pendingExitPersistenceRuntimeModule.includes('normalizePendingExitReloadConfirmationCore,\n  normalizePendingExitStateForStorageCore,\n  readPersistedPendingExitStateCore,\n  writePersistentPendingExitStateCore,\n  chooseInitialPendingExitStateCore'), 'pending-exit persistence runtime exports are incomplete');
    assert(!distSource.includes('function normalizePendingExitReloadConfirmation('), 'dist remote bot still keeps pending-exit reload-confirmation wrapper');
    assert(!distSource.includes('function normalizePendingExitStateForStorage('), 'dist remote bot still keeps pending-exit storage-normalizer wrapper');
    assert(!distSource.includes('function readPersistedPendingExitState('), 'dist remote bot still keeps pending-exit storage-reader wrapper');
    assert(!distSource.includes('function writePersistentPendingExitState('), 'dist remote bot still keeps pending-exit storage-writer wrapper');
    assert(!distSource.includes('function chooseInitialPendingExitState('), 'dist remote bot still keeps pending-exit initial-state chooser wrapper');
    assert(refreshExitDetailSourceModule.includes('function refreshExitDetailInlineSource() {'), 'refresh-exit-detail inline source factory not found');
    assert(refreshExitDetailSourceModule.includes('function bundledRefreshExitDetailSource() {'), 'refresh-exit-detail bundled source factory not found');
    assert(refreshExitDetailSourceModule.includes('function refreshExitDetailSource(options = {})'), 'refresh-exit-detail source selector not found');
    assert(refreshExitDetailSourceModule.includes('refreshExitDetailInlineSource,\n  bundledRefreshExitDetailSource,\n  refreshExitDetailSource'), 'refresh-exit-detail source module exports not found');
    const refreshExitDetailInlineBody = functionBody(refreshExitDetailSourceModule, 'refreshExitDetailInlineSource');
    assert(refreshExitDetailInlineBody.includes('String.raw`'), 'refresh-exit-detail inline source factory does not return raw browser source');
    assert(refreshExitDetailInlineBody.includes('function refreshExitDetail'), 'refresh-exit-detail inline source factory does not include refresh helper');
    assert(refreshExitDetailInlineBody.includes('holdRemainingMs'), 'refresh-exit-detail inline source factory does not refresh relogin hold remaining time');
    assert(refreshExitDetailInlineBody.includes('staminaBudgetExit'), 'refresh-exit-detail inline source factory does not refresh stamina-budget exit summary');
    assert(refreshExitDetailInlineBody.includes('finalizeLeaveDisplayReason'), 'refresh-exit-detail inline source factory does not finalize display reason');
    const refreshExitDetailBundledBody = functionBody(refreshExitDetailSourceModule, 'bundledRefreshExitDetailSource');
    assert(refreshExitDetailBundledBody.includes("require('./src/browser/runtime/refresh-exit-detail')"), 'refresh-exit-detail bundled source does not hand refresh helper to the bundler');
    assert(refreshExitDetailBundledBody.includes('finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForRefreshExitDetailCore'), 'refresh-exit-detail bundled source does not import display finalizer core alias');
    assert(refreshExitDetailBundledBody.includes('leaveWaitDisplayCore: leaveWaitDisplayForRefreshExitDetailCore'), 'refresh-exit-detail bundled source does not import wait-display core alias');
    assert(refreshExitDetailBundledBody.includes('offlineLeaveSummaryCore: offlineLeaveSummaryForRefreshExitDetailCore'), 'refresh-exit-detail bundled source does not import offline summary core alias');
    assert(refreshExitDetailBundledBody.includes('offlineLeaveSummaryForRefreshExitDetailCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })'), 'refresh-exit-detail bundled source does not bind runtime offline summary core directly');
    assert(refreshExitDetailBundledBody.includes("value => ${finalizeLeaveDisplayReasonCoreCall('value', 'finalizeLeaveDisplayReasonForRefreshExitDetailCore', 'leaveWaitDisplayForRefreshExitDetailCore')}"), 'refresh-exit-detail bundled source does not bind display finalizer core directly');
    assert(functionBody(refreshExitDetailSourceModule, 'refreshExitDetailSource').includes('options.bundledRuntime'), 'refresh-exit-detail source selector does not switch on bundled runtime mode');
    assert(refreshExitDetailRuntimeModule.includes('function refreshExitDetailCore(detail, offlineLeaveSummary, finalizeLeaveDisplayReason'), 'refresh-exit-detail runtime core not found');
    assert(refreshExitDetailRuntimeModule.includes('detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));'), 'refresh-exit-detail runtime core does not refresh relogin hold remaining time');
    assert(refreshExitDetailRuntimeModule.includes('detail.offlineSafety?.staminaBudgetExit'), 'refresh-exit-detail runtime core does not refresh stamina-budget exit summary');
    assert(refreshExitDetailRuntimeModule.includes('detail.offlineSafety?.staminaExhausted'), 'refresh-exit-detail runtime core does not refresh stamina-exhausted exit summary');
    assert(refreshExitDetailRuntimeModule.includes('return finalizeLeaveDisplayReason(detail);'), 'refresh-exit-detail runtime core does not finalize display reason');
    assert(refreshExitDetailRuntimeModule.includes('module.exports = { refreshExitDetailCore }'), 'refresh-exit-detail runtime core export not found');
    assert(restoredCoinFailuresSourceModule.includes('function restoredCoinFailuresInlineSource() {'), 'restored-coin-failures inline source factory not found');
    assert(restoredCoinFailuresSourceModule.includes('function bundledRestoredCoinFailuresSource() {'), 'restored-coin-failures bundled source factory not found');
    assert(restoredCoinFailuresSourceModule.includes('function restoredCoinFailuresSource(options = {})'), 'restored-coin-failures source selector not found');
    assert(restoredCoinFailuresSourceModule.includes('restoredCoinFailuresInlineSource,\n  bundledRestoredCoinFailuresSource,\n  restoredCoinFailuresSource'), 'restored-coin-failures source module exports not found');
    const restoredCoinFailuresInlineBody = functionBody(restoredCoinFailuresSourceModule, 'restoredCoinFailuresInlineSource');
    assert(restoredCoinFailuresInlineBody.includes('String.raw`'), 'restored-coin-failures inline source factory does not return raw browser source');
    assert(restoredCoinFailuresInlineBody.includes('function restoredCoinFailures'), 'restored-coin-failures inline source factory does not include restore helper');
    assert(restoredCoinFailuresInlineBody.includes('preserved.coinFailures'), 'restored-coin-failures inline source factory does not read preserved failures');
    assert(restoredCoinFailuresInlineBody.includes('coinFailureSevereIgnoreCount'), 'restored-coin-failures inline source factory does not restore severe ignore windows');
    assert(restoredCoinFailuresInlineBody.includes('coinFailureHardIgnoreCount'), 'restored-coin-failures inline source factory does not restore hard ignore windows');
    const restoredCoinFailuresBundledBody = functionBody(restoredCoinFailuresSourceModule, 'bundledRestoredCoinFailuresSource');
    assert(restoredCoinFailuresBundledBody.includes("return '';"), 'restored-coin-failures bundled source should be empty after direct runtime-state core binding');
    assert(!restoredCoinFailuresBundledBody.includes('function restoredCoinFailures('), 'restored-coin-failures bundled source still keeps restore wrapper');
    assert(functionBody(restoredCoinFailuresSourceModule, 'restoredCoinFailuresSource').includes('options.bundledRuntime'), 'restored-coin-failures source selector does not switch on bundled runtime mode');
    assert(restoredCoinFailuresRuntimeModule.includes('function restoredCoinFailuresCore(preservedCoinFailures, cfg, t)'), 'restored-coin-failures runtime core not found');
    assert(restoredCoinFailuresRuntimeModule.includes('preservedCoinFailures || []'), 'restored-coin-failures runtime core does not read provided failures');
    assert(restoredCoinFailuresRuntimeModule.includes("next.reason === 'near' || next.reason === 'close'"), 'restored-coin-failures runtime core does not filter single near/close failures');
    assert(restoredCoinFailuresRuntimeModule.includes('coinFailureSevereIgnoreCount'), 'restored-coin-failures runtime core does not restore severe ignore windows');
    assert(restoredCoinFailuresRuntimeModule.includes('coinFailureHardIgnoreCount'), 'restored-coin-failures runtime core does not restore hard ignore windows');
    assert(restoredCoinFailuresRuntimeModule.includes('module.exports = { restoredCoinFailuresCore }'), 'restored-coin-failures runtime core export not found');
    assert(restoredRuntimeStateRuntimeModule.includes('function restoreRuntimeStateCore(preserved, previousBot, helpers = {})'), 'restored runtime state runtime core not found');
    assert(restoredRuntimeStateRuntimeModule.includes('const restoredFailures = helpers.restoredCoinFailures();'), 'restored runtime state runtime core does not restore coin failures first');
    assert(restoredRuntimeStateRuntimeModule.includes('helpers.readPersistentExitState(helpers.enemyLeaveStateKey)'), 'restored runtime state runtime core does not restore enemy leave state');
    assert(restoredRuntimeStateRuntimeModule.includes('helpers.readPersistentExitState(helpers.offlineLeaveStateKey)'), 'restored runtime state runtime core does not restore offline leave state');
    assert(restoredRuntimeStateRuntimeModule.includes('const restoreOptions = { markReloaded: !previousBot };'), 'restored runtime state runtime core does not preserve first-load reload marker');
    assert(restoredRuntimeStateRuntimeModule.includes('helpers.readPersistedPendingExitState(nowMs(), restoreOptions)'), 'restored runtime state runtime core does not restore persisted pending exit state');
    assert(restoredRuntimeStateRuntimeModule.includes('helpers.chooseInitialPendingExitState('), 'restored runtime state runtime core does not choose initial pending exit state');
    assert(!distSource.includes('function restoredCoinFailures('), 'dist remote bot still keeps restored coin failures wrapper');
    assert(restoredRuntimeStateRuntimeModule.includes('module.exports = { restoreRuntimeStateCore }'), 'restored runtime state runtime core export not found');
    assert(loginSnapshotGateSourceModule.includes('function loginSnapshotGateInlineSource() {'), 'login-snapshot-gate inline source factory not found');
    assert(loginSnapshotGateSourceModule.includes('function bundledLoginSnapshotGateSource() {'), 'login-snapshot-gate bundled source factory not found');
    assert(loginSnapshotGateSourceModule.includes('function loginSnapshotGateSource(options = {})'), 'login-snapshot-gate source selector not found');
    assert(loginSnapshotGateSourceModule.includes('loginSnapshotGateInlineSource,\n  bundledLoginSnapshotGateSource,\n  loginSnapshotGateSource'), 'login-snapshot-gate source module exports not found');
    const loginSnapshotGateInlineBody = functionBody(loginSnapshotGateSourceModule, 'loginSnapshotGateInlineSource');
    assert(loginSnapshotGateInlineBody.includes('String.raw`'), 'login-snapshot-gate inline source factory does not return raw browser source');
    assert(loginSnapshotGateInlineBody.includes('function loginSnapshotSuccessRequired'), 'login-snapshot-gate inline source factory does not include required-count helper');
    assert(loginSnapshotGateInlineBody.includes('function normalizeLoginSnapshotGateState'), 'login-snapshot-gate inline source factory does not include state normalizer');
    assert(loginSnapshotGateInlineBody.includes('lastSampleAt'), 'login-snapshot-gate inline source factory does not preserve last sample timestamp');
    assert(loginSnapshotGateInlineBody.includes('resetReason'), 'login-snapshot-gate inline source factory does not preserve reset reason');
    const loginSnapshotGateBundledBody = functionBody(loginSnapshotGateSourceModule, 'bundledLoginSnapshotGateSource');
    assert(loginSnapshotGateBundledBody.includes("require('./src/browser/runtime/login-snapshot-gate')"), 'login-snapshot-gate bundled source does not hand gate helpers to the bundler');
    assert(loginSnapshotGateBundledBody.includes('loginSnapshotSuccessRequiredCore'), 'login-snapshot-gate bundled source does not hand required-count core to the bundler');
    assert(!loginSnapshotGateBundledBody.includes('function loginSnapshotSuccessRequired('), 'login-snapshot-gate bundled source still keeps required-count wrapper');
    assert(!distSource.includes('function loginSnapshotSuccessRequired('), 'dist remote bot still keeps login snapshot required-count wrapper');
    assert(!loginSnapshotGateBundledBody.includes('function normalizeLoginSnapshotGateState('), 'login-snapshot-gate bundled source still keeps state normalizer wrapper');
    assert(!distSource.includes('function normalizeLoginSnapshotGateState('), 'dist remote bot still keeps login snapshot state normalizer wrapper');
    assert(functionBody(loginSnapshotGateSourceModule, 'loginSnapshotGateSource').includes('options.bundledRuntime'), 'login-snapshot-gate source selector does not switch on bundled runtime mode');
    assert(loginSnapshotGateRuntimeModule.includes('function loginSnapshotSuccessRequiredCore()'), 'login-snapshot-gate runtime required-count core not found');
    assert(loginSnapshotGateRuntimeModule.includes('function normalizeLoginSnapshotGateStateCore(state = null'), 'login-snapshot-gate runtime state normalizer core not found');
    assert(loginSnapshotGateRuntimeModule.includes('lastSampleAt: Number(state?.lastSampleAt || state?.lastOkAt || state?.lastErrorAt || 0) || 0'), 'login-snapshot-gate runtime core does not preserve last sample fallback');
    assert(loginSnapshotGateRuntimeModule.includes("resetReason: String(state?.resetReason || '')"), 'login-snapshot-gate runtime core does not preserve reset reason');
    assert(loginSnapshotGateRuntimeModule.includes('loginSnapshotSuccessRequiredCore,\n  normalizeLoginSnapshotGateStateCore'), 'login-snapshot-gate runtime core exports not found');
    assert(runtimeDiagnosticsSourceModule.includes('function runtimeDiagnosticsInlineSource() {'), 'runtime-diagnostics inline source factory not found');
    assert(runtimeDiagnosticsSourceModule.includes('function bundledRuntimeDiagnosticsSource() {'), 'runtime-diagnostics bundled source factory not found');
    assert(runtimeDiagnosticsSourceModule.includes('function runtimeDiagnosticsSource(options = {})'), 'runtime-diagnostics source selector not found');
    assert(runtimeDiagnosticsSourceModule.includes('runtimeDiagnosticsInlineSource,\n  bundledRuntimeDiagnosticsSource,\n  runtimeDiagnosticsSource'), 'runtime-diagnostics source module exports not found');
    const runtimeDiagnosticsInlineBody = functionBody(runtimeDiagnosticsSourceModule, 'runtimeDiagnosticsInlineSource');
    assert(runtimeDiagnosticsInlineBody.includes('String.raw`'), 'runtime-diagnostics inline source factory does not return raw browser source');
    assert(runtimeDiagnosticsInlineBody.includes('function recordRuntimeDiagnostics'), 'runtime-diagnostics inline source factory does not include runtime diagnostics recorder');
    assert(runtimeDiagnosticsInlineBody.includes('bot.runtimeDiagnostics'), 'runtime-diagnostics inline source factory does not update bot runtime diagnostics');
    assert(runtimeDiagnosticsInlineBody.includes('Object.assign(bot.runtimeDiagnostics, values)'), 'runtime-diagnostics inline source factory does not merge diagnostic values');
    assert(runtimeDiagnosticsInlineBody.includes('catch (_) {}'), 'runtime-diagnostics inline source factory does not preserve error swallowing');
    const runtimeDiagnosticsBundledBody = functionBody(runtimeDiagnosticsSourceModule, 'bundledRuntimeDiagnosticsSource');
    assert(runtimeDiagnosticsBundledBody.includes("require('./src/browser/runtime/runtime-diagnostics')"), 'runtime-diagnostics bundled source does not hand recorder to the bundler');
    assert(!runtimeDiagnosticsBundledBody.includes('function recordRuntimeDiagnostics('), 'runtime-diagnostics bundled source still keeps recorder wrapper');
    assert(!distSource.includes('function recordRuntimeDiagnostics('), 'dist remote bot still keeps runtime diagnostics recorder wrapper');
    assert(functionBody(runtimeDiagnosticsSourceModule, 'runtimeDiagnosticsSource').includes('options.bundledRuntime'), 'runtime-diagnostics source selector does not switch on bundled runtime mode');
    assert(runtimeDiagnosticsRuntimeModule.includes('function recordRuntimeDiagnosticsCore(bot, values = {})'), 'runtime-diagnostics runtime core not found');
    assert(runtimeDiagnosticsRuntimeModule.includes("if (!bot.runtimeDiagnostics || typeof bot.runtimeDiagnostics !== 'object') bot.runtimeDiagnostics = {};"), 'runtime-diagnostics runtime core does not initialize diagnostics object');
    assert(runtimeDiagnosticsRuntimeModule.includes('Object.assign(bot.runtimeDiagnostics, values);'), 'runtime-diagnostics runtime core does not merge diagnostic values');
    assert(runtimeDiagnosticsRuntimeModule.includes('catch (_) {}'), 'runtime-diagnostics runtime core does not preserve error swallowing');
    assert(runtimeDiagnosticsRuntimeModule.includes('module.exports = { recordRuntimeDiagnosticsCore }'), 'runtime-diagnostics runtime core export not found');
    assert(exitReloginSourceModule.includes('function exitReloginDisplayInlineSource() {'), 'exit-relogin display inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginDisplaySource() {'), 'exit-relogin display bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginActorInlineSource() {'), 'exit-relogin actor inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginActorSource() {'), 'exit-relogin actor bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginStreakInlineSource() {'), 'exit-relogin streak inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginStreakSource() {'), 'exit-relogin streak bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginSummaryInlineSource() {'), 'exit-relogin summary inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginSummarySource() {'), 'exit-relogin summary bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginHoldInlineSource() {'), 'exit-relogin hold inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginHoldSource() {'), 'exit-relogin hold bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginHoldReadInlineSource() {'), 'exit-relogin hold-read inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginHoldReadSource() {'), 'exit-relogin hold-read bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginClearInlineSource() {'), 'exit-relogin clear inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginClearSource() {'), 'exit-relogin clear bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginRemainderPrefixInlineSource() {'), 'exit-relogin remainder prefix inline source factory not found');
    assert(exitReloginSourceModule.includes('function bundledExitReloginRemainderPrefixSource() {'), 'exit-relogin remainder prefix bundled source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginRemainderSource() {'), 'exit-relogin remainder source factory not found');
    assert(exitReloginSourceModule.includes('function exitReloginSource(options = {})'), 'exit-relogin source selector not found');
    assert(exitReloginSourceModule.includes('module.exports = {'), 'exit-relogin source module exports not found');
    for (const exportedName of [
      'exitReloginDisplayInlineSource',
      'bundledExitReloginDisplaySource',
      'exitReloginActorInlineSource',
      'bundledExitReloginActorSource',
      'exitReloginStreakInlineSource',
      'bundledExitReloginStreakSource',
      'exitReloginSummaryInlineSource',
      'bundledExitReloginSummarySource',
      'exitReloginHoldInlineSource',
      'bundledExitReloginHoldSource',
      'exitReloginHoldReadInlineSource',
      'bundledExitReloginHoldReadSource',
      'exitReloginClearInlineSource',
      'bundledExitReloginClearSource',
      'exitReloginRemainderPrefixInlineSource',
      'bundledExitReloginRemainderPrefixSource',
      'exitReloginRemainderSource',
      'exitReloginSource'
    ]) {
      assert(exitReloginSourceModule.includes(`  ${exportedName}`), `exit-relogin source module does not export ${exportedName}`);
    }
    const exitReloginDisplayInlineBody = functionBody(exitReloginSourceModule, 'exitReloginDisplayInlineSource');
    assert(exitReloginDisplayInlineBody.includes('String.raw`'), 'exit-relogin display inline source factory does not return raw browser source');
    assert(exitReloginDisplayInlineBody.includes('function leaveWaitDisplay'), 'exit-relogin display inline source does not include wait display helper');
    assert(exitReloginDisplayInlineBody.includes('function finalizeLeaveDisplayReason'), 'exit-relogin display inline source does not include display finalizer');
    assert(exitReloginDisplayInlineBody.includes('formatDurationMs(waitMs)'), 'exit-relogin display inline source does not preserve wait duration formatting');
    const exitReloginDisplayBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginDisplaySource');
    assert(exitReloginDisplayBundledBody.includes("return '';"), 'exit-relogin display bundled source should be empty after finalizer handoff');
    assert(!exitReloginDisplayBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin display bundled source should not keep unused runtime import');
    assert(!exitReloginDisplayBundledBody.includes('function leaveWaitDisplay'), 'exit-relogin display bundled source still keeps wait-display wrapper');
    assert(!exitReloginDisplayBundledBody.includes('function finalizeLeaveDisplayReason'), 'exit-relogin display bundled source still keeps display finalizer wrapper');
    assert(exitReloginDisplayCallSourceModule.includes('finalizeLeaveDisplayReasonCoreCall') && exitReloginDisplayCallSourceModule.includes('${waitName}(base, value, formatDurationMs)'), 'display call source does not bind formatDurationMs directly');
    assert(refreshExitDetailSourceModule.includes('finalizeLeaveDisplayReasonForRefreshExitDetailCore'), 'refresh-exit-detail source does not bind display finalizer directly in bundled mode');
    assert(pendingExitSourceModule.includes('finalizeLeaveDisplayReasonForPendingExitCore'), 'pending-exit source does not bind display finalizer directly in bundled mode');
    assert(leaveFlowSourceModule.includes('finalizeLeaveDisplayReasonForLeaveFlowCore'), 'leave-flow source does not bind display finalizer directly in bundled mode');
    assert(controlLoginSourceModule.includes('finalizeLeaveDisplayReasonForControlLoginCore'), 'control-login source does not bind display finalizer directly in bundled mode');
    const exitReloginActorInlineBody = functionBody(exitReloginSourceModule, 'exitReloginActorInlineSource');
    assert(exitReloginActorInlineBody.includes('function normalizeEnemyActor'), 'exit-relogin actor inline source does not include actor normalizer');
    assert(exitReloginActorInlineBody.includes('function enemyActorFromLeaveDetail'), 'exit-relogin actor inline source does not include detail actor resolver');
    assert(exitReloginActorInlineBody.includes('function enemyRepeatDelayMsForCount'), 'exit-relogin actor inline source does not include repeat delay helper');
    assert(exitReloginActorInlineBody.includes('actor.user_id ?? actor.id ?? actor.targetId'), 'exit-relogin actor inline source does not preserve id fallback');
    assert(exitReloginActorInlineBody.includes('enemyReloginRepeatThirdMaxMs'), 'exit-relogin actor inline source does not preserve third repeat delay');
    const exitReloginActorBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginActorSource');
    assert(exitReloginActorBundledBody.includes("return '';"), 'exit-relogin actor bundled source should be empty after bound-core handoff');
    assert(!exitReloginActorBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin actor bundled source should not keep unused runtime import');
    assert(!exitReloginActorBundledBody.includes('function normalizeEnemyActor'), 'exit-relogin actor bundled source should not keep normalizer wrapper');
    assert(!exitReloginActorBundledBody.includes('function enemyActorFromLeaveDetail'), 'exit-relogin actor bundled source should not keep actor resolver wrapper');
    assert(!exitReloginActorBundledBody.includes('function enemyRepeatDelayMsForCount'), 'exit-relogin actor bundled source should not keep repeat-delay wrapper');
    const exitReloginStreakInlineBody = functionBody(exitReloginSourceModule, 'exitReloginStreakInlineSource');
    assert(exitReloginStreakInlineBody.includes('function readEnemyLeaveStreak'), 'exit-relogin streak inline source does not include enemy streak reader');
    assert(exitReloginStreakInlineBody.includes('function writeEnemyLeaveStreak'), 'exit-relogin streak inline source does not include enemy streak writer');
    assert(exitReloginStreakInlineBody.includes('function updateEnemyLeaveStreak'), 'exit-relogin streak inline source does not include enemy streak updater');
    assert(exitReloginStreakInlineBody.includes('localStorage.getItem(ENEMY_LEAVE_STREAK_KEY)'), 'exit-relogin streak inline source does not read streak storage');
    assert(exitReloginStreakInlineBody.includes('localStorage.removeItem(ENEMY_LEAVE_STREAK_KEY)'), 'exit-relogin streak inline source does not remove expired streak storage');
    assert(exitReloginStreakInlineBody.includes('localStorage.setItem(ENEMY_LEAVE_STREAK_KEY'), 'exit-relogin streak inline source does not write streak storage');
    assert(exitReloginStreakInlineBody.includes('bot.enemyLeaveStreak = normalized'), 'exit-relogin streak inline source does not preserve normalized bot state');
    assert(exitReloginStreakInlineBody.includes('detail.reloginRepeatDelayMs = streak.reloginMinMs'), 'exit-relogin streak inline source does not preserve repeat delay metadata');
    const exitReloginStreakBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginStreakSource');
    assert(exitReloginStreakBundledBody.includes("return '';"), 'exit-relogin streak bundled source should be empty after bound-core handoff');
    assert(!exitReloginStreakBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin streak bundled source should not keep unused runtime import');
    assert(!exitReloginStreakBundledBody.includes('function readEnemyLeaveStreak'), 'exit-relogin streak bundled source should not keep reader wrapper');
    assert(!exitReloginStreakBundledBody.includes('function writeEnemyLeaveStreak'), 'exit-relogin streak bundled source should not keep writer wrapper');
    assert(!exitReloginStreakBundledBody.includes('function updateEnemyLeaveStreak'), 'exit-relogin streak bundled source should not keep updater wrapper');
    const exitReloginSummaryInlineBody = functionBody(exitReloginSourceModule, 'exitReloginSummaryInlineSource');
    assert(exitReloginSummaryInlineBody.includes('function combatExitSummary'), 'exit-relogin summary inline source does not include combat summary helper');
    assert(exitReloginSummaryInlineBody.includes('function combatLeaveAction'), 'exit-relogin summary inline source does not include combat leave action helper');
    assert(exitReloginSummaryInlineBody.includes('function pursuitLeaveSummary'), 'exit-relogin summary inline source does not include pursuit summary helper');
    assert(exitReloginSummaryInlineBody.includes('function injuryLeaveSummary'), 'exit-relogin summary inline source does not include injury summary helper');
    assert(exitReloginSummaryInlineBody.includes('function offlineLeaveSummary'), 'exit-relogin summary inline source does not include offline summary helper');
    assert(exitReloginSummaryInlineBody.includes('function currentOfflineDisplayReason'), 'exit-relogin summary inline source does not include offline display helper');
    assert(exitReloginSummaryInlineBody.includes('function reloginDelayForHp'), 'exit-relogin summary inline source does not include relogin HP delay helper');
    assert(exitReloginSummaryInlineBody.includes('combatState?.pressureDisadvantage'), 'exit-relogin summary inline source does not preserve pressure disadvantage branch');
    assert(exitReloginSummaryInlineBody.includes('staminaExhaustedWindowLabel'), 'exit-relogin summary inline source does not preserve stamina label helper');
    assert(exitReloginSummaryInlineBody.includes('repeatMinMs'), 'exit-relogin summary inline source does not preserve repeat relogin delay minimum');
    const exitReloginSummaryBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginSummarySource');
    assert(exitReloginSummaryBundledBody.includes("return '';"), 'exit-relogin summary bundled source should be empty after summary/action wrapper handoff');
    assert(!exitReloginSummaryBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin summary bundled source should not keep unused runtime import');
    assert(!exitReloginSummaryBundledBody.includes('function combatExitSummary'), 'exit-relogin summary bundled source still keeps combat summary wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function combatLeaveAction'), 'exit-relogin summary bundled source still keeps combat leave action wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function pursuitLeaveSummary'), 'exit-relogin summary bundled source still keeps pursuit summary wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function injuryLeaveSummary'), 'exit-relogin summary bundled source still keeps injury summary wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function offlineLeaveSummary'), 'exit-relogin summary bundled source still keeps offline summary wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function currentOfflineDisplayReason'), 'exit-relogin summary bundled source still keeps offline display wrapper');
    assert(!exitReloginSummaryBundledBody.includes('function reloginDelayForHp'), 'exit-relogin summary bundled source still keeps HP relogin delay wrapper');
    const exitReloginHoldInlineBody = functionBody(exitReloginSourceModule, 'exitReloginHoldInlineSource');
    assert(exitReloginHoldInlineBody.includes('function isExitLoginSuppressReason'), 'exit-relogin hold inline source does not include suppress reason matcher');
    assert(exitReloginHoldInlineBody.includes('function setExitReloginSuppress'), 'exit-relogin hold inline source does not include suppress writer');
    assert(exitReloginHoldInlineBody.includes('function unsafeExitReloginMinDelayMs'), 'exit-relogin hold inline source does not include unsafe minimum helper');
    assert(exitReloginHoldInlineBody.includes('function pendingExitSuppressReason'), 'exit-relogin hold inline source does not include pending suppress helper');
    assert(exitReloginHoldInlineBody.includes('function startExitAudit'), 'exit-relogin hold inline source does not include start exit audit helper');
    assert(exitReloginHoldInlineBody.includes('function primePendingUnsafeExitLoginSuppress'), 'exit-relogin hold inline source does not include pending unsafe suppress helper');
    assert(exitReloginHoldInlineBody.includes('function staminaBudgetExitHoldUntil'), 'exit-relogin hold inline source does not include stamina budget hold helper');
    assert(exitReloginHoldInlineBody.includes('function staminaExitHoldUntilForDetail'), 'exit-relogin hold inline source does not include stamina hold selector');
    assert(exitReloginHoldInlineBody.includes('function offlineExitRequiresUnsafeReloginDelay'), 'exit-relogin hold inline source does not include offline unsafe predicate');
    assert(exitReloginHoldInlineBody.includes('offlineSafety.samplingOutage || offlineSafety.combatTickGap'), 'exit-relogin hold inline source does not preserve sampling/tick unsafe branches');
    assert(exitReloginHoldInlineBody.includes('pending unsafe hostile exit'), 'exit-relogin hold inline source does not preserve pending hostile suppress reason');
    const exitReloginHoldBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginHoldSource');
    assert(exitReloginHoldBundledBody.includes("return '';"), 'exit-relogin hold bundled source should be empty after suppress writer handoff');
    assert(!exitReloginHoldBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin hold bundled source should not keep unused runtime import');
    assert(!exitReloginHoldBundledBody.includes('isExitLoginSuppressReason: isExitLoginSuppressReasonCore'), 'exit-relogin hold bundled source should not bind suppress reason matcher after suppress writer handoff');
    assert(!exitReloginHoldBundledBody.includes('function isExitLoginSuppressReason'), 'exit-relogin hold bundled source should not keep unused suppress reason wrapper');
    assert(!exitReloginHoldBundledBody.includes('unsafeExitReloginMinDelayMsCore,'), 'exit-relogin hold bundled source should not import unused unsafe minimum helper');
    assert(!exitReloginHoldBundledBody.includes('pendingExitSuppressReasonCore,'), 'exit-relogin hold bundled source should not import unused pending suppress helper');
    assert(!exitReloginHoldBundledBody.includes('function unsafeExitReloginMinDelayMs'), 'exit-relogin hold bundled source should not keep unused unsafe minimum wrapper');
    assert(!exitReloginHoldBundledBody.includes('function pendingExitSuppressReason'), 'exit-relogin hold bundled source should not keep unused pending suppress wrapper');
    assert(!exitReloginHoldBundledBody.includes('startExitAuditBoundCore'), 'exit-relogin hold bundled source should not keep unused start exit audit bound core import');
    assert(!exitReloginHoldBundledBody.includes('function startExitAudit'), 'exit-relogin hold bundled source should not keep unused start exit audit wrapper');
    assert(!exitReloginHoldBundledBody.includes('lastSelf: bot.lastSelf'), 'exit-relogin hold bundled source should not bind lastSelf outside the runtime bound core');
    assert(!exitReloginHoldBundledBody.includes('primePendingUnsafeExitLoginSuppressBoundCore'), 'exit-relogin hold bundled source should not keep unused pending unsafe suppress bound core import');
    assert(!exitReloginHoldBundledBody.includes('function primePendingUnsafeExitLoginSuppress'), 'exit-relogin hold bundled source should not keep unused pending unsafe suppress wrapper');
    assert(!exitReloginHoldBundledBody.includes('setEnemyLeaveSuppressCore'), 'exit-relogin hold bundled source should not keep unused enemy suppress wrapper core');
    assert(!exitReloginHoldBundledBody.includes('staminaBudgetExitHoldUntilCore,'), 'exit-relogin hold bundled source should not import unused stamina budget wrapper helper');
    assert(!exitReloginHoldBundledBody.includes('function staminaBudgetExitHoldUntil'), 'exit-relogin hold bundled source should not keep unused stamina budget wrapper');
    assert(!exitReloginHoldBundledBody.includes('staminaExitHoldUntilForDetailBoundCore'), 'exit-relogin hold bundled source should not keep unused stamina hold selector bound core import');
    assert(!exitReloginHoldBundledBody.includes('function staminaExitHoldUntilForDetail'), 'exit-relogin hold bundled source should not keep unused stamina hold selector wrapper');
    assert(!exitReloginHoldBundledBody.includes('offlineExitRequiresUnsafeReloginDelayCore'), 'exit-relogin hold bundled source should not keep unused offline unsafe predicate core');
    assert(!exitReloginHoldBundledBody.includes('function offlineExitRequiresUnsafeReloginDelay'), 'exit-relogin hold bundled source should not keep unused offline unsafe predicate wrapper');
    assert(!exitReloginHoldBundledBody.includes('function setExitReloginSuppress'), 'exit-relogin hold bundled source should not keep suppress writer wrapper');
    assert(!exitReloginHoldBundledBody.includes('setExitReloginSuppressCore'), 'exit-relogin hold bundled source should not bind suppress writer core directly');
    const exitReloginRemainderPrefixInlineBody = functionBody(exitReloginSourceModule, 'exitReloginRemainderPrefixInlineSource');
    assert(exitReloginRemainderPrefixInlineBody.includes('function setOfflineLeaveSuppress'), 'exit-relogin remainder prefix inline source does not include offline suppress helper');
    assert(exitReloginRemainderPrefixInlineBody.includes('function primePendingStaminaExitLoginSuppress'), 'exit-relogin remainder prefix inline source does not include pending stamina suppress helper');
    assert(exitReloginRemainderPrefixInlineBody.includes('staminaExitHoldUntilForDetail(detail)'), 'exit-relogin remainder prefix inline source does not preserve stamina hold lookup');
    assert(exitReloginRemainderPrefixInlineBody.includes('offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)'), 'exit-relogin remainder prefix inline source does not preserve unsafe offline predicate call');
    const exitReloginRemainderPrefixBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginRemainderPrefixSource');
    assert(exitReloginRemainderPrefixBundledBody.includes("return '';"), 'exit-relogin remainder prefix bundled source should be empty after wrapper handoff');
    assert(!exitReloginRemainderPrefixBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin remainder prefix bundled source should not keep unused runtime import');
    assert(!exitReloginRemainderPrefixBundledBody.includes('setOfflineLeaveSuppressCore'), 'exit-relogin remainder prefix bundled source should not keep unused offline suppress core import');
    assert(!exitReloginRemainderPrefixBundledBody.includes('setOfflineLeaveSuppressBoundCore'), 'exit-relogin remainder prefix bundled source should not keep unused offline suppress bound core import');
    assert(!exitReloginRemainderPrefixBundledBody.includes('function setOfflineLeaveSuppress'), 'exit-relogin remainder prefix bundled source should not keep unused offline suppress wrapper');
    assert(!exitReloginRemainderPrefixBundledBody.includes('primePendingStaminaExitLoginSuppressBoundCore'), 'exit-relogin remainder prefix bundled source should not keep unused pending stamina suppress bound core import');
    assert(!exitReloginRemainderPrefixBundledBody.includes('function primePendingStaminaExitLoginSuppress'), 'exit-relogin remainder prefix bundled source should not keep unused pending stamina suppress wrapper');
    const exitReloginHoldReadInlineBody = functionBody(exitReloginSourceModule, 'exitReloginHoldReadInlineSource');
    assert(exitReloginHoldReadInlineBody.includes('function enemyReloginHoldRemainingMs'), 'exit-relogin hold-read inline source does not include enemy hold reader');
    assert(exitReloginHoldReadInlineBody.includes('function offlineReloginHoldRemainingMs'), 'exit-relogin hold-read inline source does not include offline hold reader');
    assert(exitReloginHoldReadInlineBody.includes('function clearLoginSuppressMatching'), 'exit-relogin hold-read inline source does not include login suppress clear helper');
    assert(exitReloginHoldReadInlineBody.includes('readPersistentExitState(ENEMY_LEAVE_STATE_KEY)'), 'exit-relogin hold-read inline source does not read persistent enemy leave state');
    assert(exitReloginHoldReadInlineBody.includes('readPersistentExitState(OFFLINE_LEAVE_STATE_KEY)'), 'exit-relogin hold-read inline source does not read persistent offline leave state');
    assert(exitReloginHoldReadInlineBody.includes('staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)'), 'exit-relogin hold-read inline source does not preserve stale offline contradiction check');
    assert(exitReloginHoldReadInlineBody.includes('localStorage.removeItem(LOGIN_SUPPRESS_KEY)'), 'exit-relogin hold-read inline source does not clear login suppress key');
    const exitReloginHoldReadBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginHoldReadSource');
    assert(exitReloginHoldReadBundledBody.includes("return '';"), 'exit-relogin hold-read bundled source should be empty after wrapper handoff');
    assert(!exitReloginHoldReadBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin hold-read bundled source should not keep unused runtime import');
    assert(!exitReloginHoldReadBundledBody.includes('enemyReloginHoldRemainingMsBoundCore(bot, localStorage'), 'exit-relogin hold-read bundled source should not keep enemy hold reader wrapper binding');
    assert(!exitReloginHoldReadBundledBody.includes('offlineReloginHoldRemainingMsBoundCore(bot, localStorage'), 'exit-relogin hold-read bundled source should not keep offline hold reader wrapper binding');
    assert(!exitReloginHoldReadBundledBody.includes('function enemyReloginHoldRemainingMs'), 'exit-relogin hold-read bundled source still keeps enemy hold reader wrapper');
    assert(!exitReloginHoldReadBundledBody.includes('function offlineReloginHoldRemainingMs'), 'exit-relogin hold-read bundled source still keeps offline hold reader wrapper');
    assert(!exitReloginHoldReadBundledBody.includes('function clearLoginSuppressMatching'), 'exit-relogin hold-read bundled source should not keep suppress clear wrapper');
    assert(!exitReloginHoldReadBundledBody.includes('clearLoginSuppressMatchingBoundCore'), 'exit-relogin hold-read bundled source should not keep unused suppress clear import');
    assert(tickSourceModule.includes('enemyReloginHoldRemainingMsForTickBoundCore') && tickSourceModule.includes('offlineReloginHoldRemainingMsForTickBoundCore'), 'tick source does not bind hold readers directly in bundled mode');
    assert(pendingExitSourceModule.includes('enemyReloginHoldRemainingMsForPendingExitBoundCore') && pendingExitSourceModule.includes('offlineReloginHoldRemainingMsForPendingExitBoundCore'), 'pending-exit source does not bind hold readers directly in bundled mode');
    assert(leaveFlowSourceModule.includes('enemyReloginHoldRemainingMsForLeaveFlowBoundCore'), 'leave-flow source does not bind enemy hold reader directly in bundled mode');
    assert(combatLogSourceModule.includes('enemyReloginHoldRemainingMsForCombatLogBoundCore') && combatLogSourceModule.includes('offlineReloginHoldRemainingMsForCombatLogBoundCore'), 'combat-log source does not bind hold readers directly in bundled mode');
    assert(controlLoginSourceModule.includes('enemyReloginHoldRemainingMsForControlLoginBoundCore') && controlLoginSourceModule.includes('offlineReloginHoldRemainingMsForControlLoginBoundCore'), 'control-login source does not bind hold readers directly in bundled mode');
    assert(exitReloginHoldReadCallSourceModule.includes('readPersistentExitState') && exitReloginHoldReadCallSourceModule.includes('staleOfflineStaminaHoldContradicted') && exitReloginHoldReadCallSourceModule.includes('clearOfflineReloginHold'), 'direct bundled hold reader calls do not pass required runtime helper bindings');
    const exitReloginClearInlineBody = functionBody(exitReloginSourceModule, 'exitReloginClearInlineSource');
    assert(exitReloginClearInlineBody.includes('function clearEnemyReloginHold'), 'exit-relogin clear inline source does not include enemy hold cleanup helper');
    assert(exitReloginClearInlineBody.includes('function clearOfflineReloginHold'), 'exit-relogin clear inline source does not include offline hold cleanup helper');
    assert(exitReloginClearInlineBody.includes("bot.pendingExit = bot.pendingExit?.scope === 'offline' ? bot.pendingExit : null;"), 'exit-relogin clear inline source does not preserve enemy pending-exit scope rule');
    assert(exitReloginClearInlineBody.includes("bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;"), 'exit-relogin clear inline source does not preserve offline pending-exit scope rule');
    assert(exitReloginClearInlineBody.includes('clearExitHoldDetail(detail, reason, t);'), 'exit-relogin clear inline source does not clear enemy detail hold fields');
    assert(exitReloginClearInlineBody.includes('clearPersistentExitState(ENEMY_LEAVE_STATE_KEY)'), 'exit-relogin clear inline source does not clear persistent enemy leave state');
    assert(exitReloginClearInlineBody.includes('clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY)'), 'exit-relogin clear inline source does not clear persistent offline leave state');
    assert(exitReloginClearInlineBody.includes('clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i)'), 'exit-relogin clear inline source does not clear enemy login suppress');
    assert(exitReloginClearInlineBody.includes('clearLoginSuppressMatching(/offline.*leave/i)'), 'exit-relogin clear inline source does not clear offline login suppress');
    const exitReloginClearBundledBody = functionBody(exitReloginSourceModule, 'bundledExitReloginClearSource');
    assert(exitReloginClearBundledBody.includes("return '';"), 'exit-relogin clear bundled source should be empty after bound-core handoff');
    assert(!exitReloginClearBundledBody.includes("require('./src/browser/runtime/exit-relogin')"), 'exit-relogin clear bundled source should not keep unused runtime import');
    assert(!exitReloginClearBundledBody.includes('function clearEnemyReloginHold'), 'exit-relogin clear bundled source should not keep enemy hold cleanup wrapper');
    assert(!exitReloginClearBundledBody.includes('function clearOfflineReloginHold'), 'exit-relogin clear bundled source should not keep offline hold cleanup wrapper');
    const exitReloginRemainderBody = functionBody(exitReloginSourceModule, 'exitReloginRemainderSource');
    assert(!exitReloginRemainderBody.includes('function combatExitSummary'), 'exit-relogin remainder source still owns combat summary helper');
    assert(!exitReloginRemainderBody.includes('function setExitReloginSuppress'), 'exit-relogin remainder source still owns suppress helper');
    assert(!exitReloginRemainderBody.includes('function enemyReloginHoldRemainingMs'), 'exit-relogin remainder source still owns enemy hold reader');
    assert(!exitReloginRemainderBody.includes('function clearEnemyReloginHold'), 'exit-relogin remainder source still owns enemy hold cleanup helper');
    assert(!exitReloginRemainderBody.includes('function clearOfflineReloginHold'), 'exit-relogin remainder source still owns offline hold cleanup helper');
    assert(functionBody(exitReloginSourceModule, 'exitReloginSource').includes('options.bundledRuntime'), 'exit-relogin source selector does not switch on bundled runtime mode');
    assert(exitReloginRuntimeModule.includes('function leaveWaitDisplayCore(base, detail, formatDurationMs)'), 'exit-relogin display runtime core not found');
    assert(exitReloginRuntimeModule.includes('return summary + \'，等待\' + formatDurationMs(waitMs);'), 'exit-relogin display runtime core does not append wait duration');
    assert(exitReloginRuntimeModule.includes('function finalizeLeaveDisplayReasonCore(detail, leaveWaitDisplay)'), 'exit-relogin display finalizer runtime core not found');
    assert(exitReloginRuntimeModule.includes('detail.summary = base;'), 'exit-relogin display finalizer runtime core does not write summary');
    assert(exitReloginRuntimeModule.includes('detail.displayReason = leaveWaitDisplay(base, detail);'), 'exit-relogin display finalizer runtime core does not write display reason');
    assert(exitReloginRuntimeModule.includes('function normalizeEnemyActorCore(actor)'), 'exit-relogin actor runtime normalizer core not found');
    assert(exitReloginRuntimeModule.includes('actor.user_id ?? actor.id ?? actor.targetId'), 'exit-relogin actor runtime core does not preserve id fallback');
    assert(exitReloginRuntimeModule.includes("const key = id ? 'id:' + id : (name ? 'name:' + name : '');"), 'exit-relogin actor runtime core does not preserve key construction');
    assert(exitReloginRuntimeModule.includes('function enemyActorFromLeaveDetailCore(detail, normalizeEnemyActor)'), 'exit-relogin actor runtime resolver core not found');
    assert(exitReloginRuntimeModule.includes('detail?.injury?.nearestHuman'), 'exit-relogin actor runtime resolver does not preserve injury fallback');
    assert(exitReloginRuntimeModule.includes('function enemyRepeatDelayMsForCountCore(count, cfg)'), 'exit-relogin repeat delay runtime core not found');
    assert(exitReloginRuntimeModule.includes('enemyReloginRepeatSecondMaxMs') && exitReloginRuntimeModule.includes('enemyReloginRepeatThirdMaxMs'), 'exit-relogin repeat delay runtime core does not preserve config delays');
    assert(exitReloginRuntimeModule.includes('function readEnemyLeaveStreakCore(storage, key, bot, cfg, t, enemyRepeatDelayMsForCount)'), 'exit-relogin streak reader runtime core not found');
    assert(exitReloginRuntimeModule.includes('storage.getItem(key)'), 'exit-relogin streak reader runtime core does not read storage key');
    assert(exitReloginRuntimeModule.includes('storage.removeItem(key)'), 'exit-relogin streak reader runtime core does not remove expired storage key');
    assert(exitReloginRuntimeModule.includes('bot.enemyLeaveStreak = normalized;'), 'exit-relogin streak reader runtime core does not write normalized bot state');
    assert(exitReloginRuntimeModule.includes('function writeEnemyLeaveStreakCore(storage, key, bot, streak)'), 'exit-relogin streak writer runtime core not found');
    assert(exitReloginRuntimeModule.includes('storage.setItem(key, JSON.stringify(streak))'), 'exit-relogin streak writer runtime core does not persist streak JSON');
    assert(exitReloginRuntimeModule.includes('function updateEnemyLeaveStreakCore(detail, t, helpers)'), 'exit-relogin streak updater runtime core not found');
    assert(exitReloginRuntimeModule.includes('helpers.readEnemyLeaveStreak(t)'), 'exit-relogin streak updater runtime core does not read previous streak through helper');
    assert(exitReloginRuntimeModule.includes('helpers.writeEnemyLeaveStreak(streak)'), 'exit-relogin streak updater runtime core does not write streak through helper');
    assert(exitReloginRuntimeModule.includes('detail.reloginRepeatDelayMs = streak.reloginMinMs'), 'exit-relogin streak updater runtime core does not preserve repeat delay metadata');
    assert(exitReloginRuntimeModule.includes('function readEnemyLeaveStreakBoundCore(storage, bot, cfg, t, helpers)'), 'exit-relogin streak reader bound core not found');
    assert(exitReloginRuntimeModule.includes('function writeEnemyLeaveStreakBoundCore(storage, bot, streak, helpers)'), 'exit-relogin streak writer bound core not found');
    assert(exitReloginRuntimeModule.includes('function updateEnemyLeaveStreakBoundCore(detail, t, storage, bot, cfg, helpers)'), 'exit-relogin streak updater bound core not found');
    assert(exitReloginRuntimeModule.includes('enemyActorFromLeaveDetail: value => enemyActorFromLeaveDetailCore(value, normalizeEnemyActorCore)') && exitReloginRuntimeModule.includes('readEnemyLeaveStreak: readAt => readEnemyLeaveStreakBoundCore(storage, bot, cfg, readAt, helpers)'), 'exit-relogin streak updater bound core does not bind actor/read helpers');
    assert(exitReloginRuntimeModule.includes('function combatExitSummaryCore(reason, target, combatState = {}, helpers)'), 'exit-relogin summary runtime combat summary core not found');
    assert(exitReloginRuntimeModule.includes('combatState?.pressureDisadvantage'), 'exit-relogin summary runtime core does not preserve pressure disadvantage branch');
    assert(exitReloginRuntimeModule.includes('helpers.formatDurationMs(estimate.tDeathMs)'), 'exit-relogin summary runtime core does not bind duration formatting');
    assert(exitReloginRuntimeModule.includes('function combatLeaveActionCore(reason, baseTarget, combatState = {}, cover = null, helpers)'), 'exit-relogin summary runtime combat action core not found');
    assert(exitReloginRuntimeModule.includes('helpers.clamp(Math.round(Number(normalizedCover.dx) || 0), -1, 1)'), 'exit-relogin summary runtime core does not clamp cover dx');
    assert(exitReloginRuntimeModule.includes('combatCover: normalizedCover'), 'exit-relogin summary runtime core does not preserve combat cover metadata');
    assert(exitReloginRuntimeModule.includes('function pursuitLeaveSummaryCore(pursuit, helpers)'), 'exit-relogin summary runtime pursuit core not found');
    assert(exitReloginRuntimeModule.includes('function injuryLeaveSummaryCore(injury, helpers)'), 'exit-relogin summary runtime injury core not found');
    assert(exitReloginRuntimeModule.includes('function offlineLeaveSummaryCore(reason, offlineSafety, helpers)'), 'exit-relogin summary runtime offline core not found');
    assert(exitReloginRuntimeModule.includes('helpers.staminaBudgetCoinLeaveSummary(offlineSafety.staminaBudgetExit)'), 'exit-relogin summary runtime offline core does not preserve stamina budget branch');
    assert(exitReloginRuntimeModule.includes('function currentOfflineDisplayReasonCore(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = \'\', helpers)'), 'exit-relogin summary runtime offline display core not found');
    assert(exitReloginRuntimeModule.includes('leaveDisplay.includes(currentSummary)'), 'exit-relogin summary runtime offline display core does not preserve display reuse rule');
    assert(exitReloginRuntimeModule.includes('function reloginDelayForHpCore(selfLike, detail, helpers)'), 'exit-relogin summary runtime HP delay core not found');
    assert(exitReloginRuntimeModule.includes('const repeatMinMs = Math.max(0, Number(detail?.enemyLeaveStreak?.reloginMinMs ?? detail?.reloginRepeatDelayMs ?? 0) || 0);'), 'exit-relogin summary runtime HP delay core does not preserve repeat minimum');
    assert(exitReloginRuntimeModule.includes('function isExitLoginSuppressReasonCore(reason)'), 'exit-relogin hold runtime suppress reason core not found');
    assert(exitReloginRuntimeModule.includes('/enemy leave|offline.*leave|combat leave|pursuit leave/i.test'), 'exit-relogin hold runtime suppress matcher does not preserve reason pattern');
    assert(exitReloginRuntimeModule.includes('function unsafeExitReloginMinDelayMsCore(cfg)'), 'exit-relogin hold runtime unsafe minimum core not found');
    assert(exitReloginRuntimeModule.includes('function pendingExitSuppressReasonCore(storageReason)'), 'exit-relogin hold runtime pending suppress core not found');
    assert(exitReloginRuntimeModule.includes('pending unsafe hostile exit'), 'exit-relogin hold runtime pending suppress core does not preserve hostile reason');
    assert(exitReloginRuntimeModule.includes('function startExitAuditCore(detail, meta = {}, helpers)'), 'exit-relogin hold runtime start exit audit core not found');
    assert(exitReloginRuntimeModule.includes("'exit-trigger:' + (meta.reason || detail.reason || '')"), 'exit-relogin hold runtime start exit audit core does not preserve reset reason');
    assert(exitReloginRuntimeModule.includes('helpers.loginPointSafetyExitSelfForDetail(detail, meta, helpers.lastSelf)'), 'exit-relogin hold runtime start exit audit core does not pass self HP into login-point safety reset');
    assert(exitReloginRuntimeModule.includes("helpers.recordExitAuditEvent('exit-trigger', detail"), 'exit-relogin hold runtime start exit audit core does not record trigger event');
    assert(exitReloginRuntimeModule.includes('function startExitAuditBoundCore(detail, meta = {}, bot, helpers)'), 'exit-relogin hold runtime start exit audit bound core not found');
    assert(exitReloginRuntimeModule.includes('return startExitAuditCore(detail, meta, {') && exitReloginRuntimeModule.includes('lastSelf: bot?.lastSelf'), 'exit-relogin hold runtime start exit audit bound core does not preserve bot lastSelf binding');
    assert(exitReloginRuntimeModule.includes('function setExitReloginSuppressCore(bot, storage, storageReason, reason, detail, selfLike, options = {}, helpers)'), 'exit-relogin hold runtime suppress writer core not found');
    assert(exitReloginRuntimeModule.includes('storage.getItem(helpers.loginSuppressReasonKey)'), 'exit-relogin hold runtime suppress writer does not read suppress reason storage');
    assert(exitReloginRuntimeModule.includes('storage.getItem(helpers.loginSuppressKey)'), 'exit-relogin hold runtime suppress writer does not read suppress until storage');
    assert(exitReloginRuntimeModule.includes('const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'), 'exit-relogin hold runtime suppress writer does not preserve longest-delay rule');
    assert(exitReloginRuntimeModule.includes('detail.reusedExitSuppress = true;'), 'exit-relogin hold runtime suppress writer does not mark reused suppress details');
    assert(exitReloginRuntimeModule.includes('helpers.updateEnemyLeaveStreak(detail, t);'), 'exit-relogin hold runtime suppress writer does not update enemy streak before new holds');
    assert(exitReloginRuntimeModule.includes('detail.defensiveReloginDelaySkipped = true;'), 'exit-relogin hold runtime suppress writer does not record zero-delay defensive skip');
    assert(exitReloginRuntimeModule.includes('helpers.setLoginSuppress(storageReason, reloginDelayMs);'), 'exit-relogin hold runtime suppress writer does not set login suppress');
    assert(exitReloginRuntimeModule.includes('helpers.writePersistentExitState(helpers.enemyLeaveStateKey, detail);'), 'exit-relogin hold runtime suppress writer does not persist enemy leave detail');
    assert(exitReloginRuntimeModule.includes('helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);'), 'exit-relogin hold runtime suppress writer does not persist offline leave detail');
    assert(exitReloginRuntimeModule.includes('function setExitReloginSuppressBoundCore(bot, storage, storageReason, reason, detail, selfLike, options = {}, helpers)'), 'exit-relogin hold runtime suppress writer bound core not found');
    assert(exitReloginRuntimeModule.includes('return setExitReloginSuppressCore(bot, storage, storageReason, reason, detail, selfLike, options, {') && exitReloginRuntimeModule.includes('isExitLoginSuppressReason: isExitLoginSuppressReasonCore'), 'exit-relogin hold runtime suppress writer bound core does not preserve helper binding');
    assert(exitReloginRuntimeModule.includes('updateEnemyLeaveStreak: (detail, t) => updateEnemyLeaveStreakBoundCore(detail, t, storage, bot, helpers.cfg') && exitReloginRuntimeModule.includes('enemyLeaveStreakKey: helpers.enemyLeaveStreakKey'), 'exit-relogin hold runtime suppress writer bound core does not bind streak updater internally');
    assert(exitReloginRuntimeModule.includes('function primePendingUnsafeExitLoginSuppressCore(storageReason, reason, detail, selfLike = null, options = {}, helpers)'), 'exit-relogin hold runtime pending unsafe suppress core not found');
    assert(exitReloginRuntimeModule.includes('const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'), 'exit-relogin hold runtime pending unsafe suppress core does not preserve longest-delay rule');
    assert(exitReloginRuntimeModule.includes('detail.pendingLoginSuppressReason = suppressReason;'), 'exit-relogin hold runtime pending unsafe suppress core does not write suppress reason');
    assert(exitReloginRuntimeModule.includes('detail.pendingLoginSuppressHpDelayMs = delay.hpDelayMs || 0;'), 'exit-relogin hold runtime pending unsafe suppress core does not preserve HP delay metadata');
    assert(exitReloginRuntimeModule.includes('function primePendingUnsafeExitLoginSuppressBoundCore(storageReason, reason, detail, selfLike = null, options = {}, helpers)'), 'exit-relogin hold runtime pending unsafe suppress bound core not found');
    assert(exitReloginRuntimeModule.includes('return primePendingUnsafeExitLoginSuppressCore(storageReason, reason, detail, selfLike, options, {') && exitReloginRuntimeModule.includes('unsafeExitReloginMinDelayMs: () => unsafeExitReloginMinDelayMsCore(helpers.cfg)') && exitReloginRuntimeModule.includes('pendingExitSuppressReason: pendingExitSuppressReasonCore'), 'exit-relogin hold runtime pending unsafe suppress bound core does not preserve helper binding');
    assert(!exitReloginRuntimeModule.includes('function setEnemyLeaveSuppressCore'), 'exit-relogin hold runtime should not keep unused enemy suppress core');
    assert(exitReloginRuntimeModule.includes('function staminaBudgetExitHoldUntilCore(staminaBudgetExit, t, staminaBudgetReloginDelayMs)'), 'exit-relogin hold runtime stamina budget core not found');
    assert(exitReloginRuntimeModule.includes("reason: 'stamina budget'"), 'exit-relogin hold runtime stamina budget core does not preserve reason');
    assert(exitReloginRuntimeModule.includes('function staminaExitHoldUntilForDetailCore(detail, t, helpers)'), 'exit-relogin hold runtime stamina selector core not found');
    assert(exitReloginRuntimeModule.includes('helpers.staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted, t)'), 'exit-relogin hold runtime stamina selector does not preserve reset hold branch');
    assert(exitReloginRuntimeModule.includes('function staminaExitHoldUntilForDetailBoundCore(detail, t, helpers)'), 'exit-relogin hold runtime bound stamina selector core not found');
    assert(exitReloginRuntimeModule.includes('staminaBudgetExitHoldUntilCore(') && exitReloginRuntimeModule.includes('helpers.staminaBudgetReloginDelayMs'), 'exit-relogin hold runtime bound stamina selector does not preserve budget delay binding');
    assert(exitReloginRuntimeModule.includes('function offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety)'), 'exit-relogin hold runtime offline unsafe core not found');
    assert(exitReloginRuntimeModule.includes('offlineSafety.samplingOutage || offlineSafety.combatTickGap'), 'exit-relogin hold runtime offline unsafe core does not preserve sampling/tick branches');
    assert(exitReloginRuntimeModule.includes('function enemyReloginHoldRemainingMsCore(bot, storage, helpers)'), 'exit-relogin hold-read runtime enemy reader core not found');
    assert(exitReloginRuntimeModule.includes('helpers.readPersistentExitState(helpers.enemyLeaveStateKey)'), 'exit-relogin hold-read runtime enemy reader does not read persistent state');
    assert(exitReloginRuntimeModule.includes("suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave'"), 'exit-relogin hold-read runtime enemy reader does not preserve suppress reasons');
    assert(exitReloginRuntimeModule.includes('function offlineReloginHoldRemainingMsCore(bot, storage, helpers)'), 'exit-relogin hold-read runtime offline reader core not found');
    assert(exitReloginRuntimeModule.includes('helpers.staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)'), 'exit-relogin hold-read runtime offline reader does not preserve stale hold check');
    assert(exitReloginRuntimeModule.includes("helpers.clearOfflineReloginHold('stale offline suppress contradicted by known stamina')"), 'exit-relogin hold-read runtime offline reader does not preserve stale suppress cleanup');
    assert(exitReloginRuntimeModule.includes('function clearLoginSuppressMatchingCore(storage, suppressKey, suppressReasonKey, pattern)'), 'exit-relogin hold-read runtime suppress clear core not found');
    assert(exitReloginRuntimeModule.includes('storage.removeItem(suppressKey)') && exitReloginRuntimeModule.includes('storage.removeItem(suppressReasonKey)'), 'exit-relogin hold-read runtime suppress clear core does not remove both keys');
    assert(exitReloginRuntimeModule.includes('function enemyReloginHoldRemainingMsBoundCore(bot, storage, helpers)'), 'exit-relogin hold-read runtime enemy bound reader core not found');
    assert(exitReloginRuntimeModule.includes('return enemyReloginHoldRemainingMsCore(bot, storage, {') && exitReloginRuntimeModule.includes('enemyLeaveStateKey: helpers.enemyLeaveStateKey'), 'exit-relogin hold-read runtime enemy bound reader does not preserve helper binding');
    assert(exitReloginRuntimeModule.includes('function offlineReloginHoldRemainingMsBoundCore(bot, storage, helpers)'), 'exit-relogin hold-read runtime offline bound reader core not found');
    assert(exitReloginRuntimeModule.includes('return offlineReloginHoldRemainingMsCore(bot, storage, {') && exitReloginRuntimeModule.includes('clearOfflineReloginHold: helpers.clearOfflineReloginHold'), 'exit-relogin hold-read runtime offline bound reader does not preserve helper binding');
    assert(exitReloginRuntimeModule.includes('function clearLoginSuppressMatchingBoundCore(storage, pattern, helpers)'), 'exit-relogin hold-read runtime suppress clear bound core not found');
    assert(exitReloginRuntimeModule.includes('helpers.loginSuppressKey') && exitReloginRuntimeModule.includes('helpers.loginSuppressReasonKey'), 'exit-relogin hold-read runtime suppress clear bound core does not preserve suppress key binding');
    assert(exitReloginRuntimeModule.includes('function setOfflineLeaveSuppressCore(bot, reason, detail, selfLike = null, options = {}, helpers)'), 'exit-relogin prefix runtime offline suppress core not found');
    assert(exitReloginRuntimeModule.includes('const staminaHold = helpers.staminaExitHoldUntilForDetail(detail);'), 'exit-relogin prefix runtime offline suppress core does not read stamina hold');
    assert(exitReloginRuntimeModule.includes('detail.safeReloginAllowed = !unsafeOfflineExit;'), 'exit-relogin prefix runtime offline suppress core does not preserve safe marker');
    assert(exitReloginRuntimeModule.includes('helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);'), 'exit-relogin prefix runtime offline suppress core does not persist zero-hold detail');
    assert(exitReloginRuntimeModule.includes("return helpers.setExitReloginSuppress('offline leave', reason, detail, selfLike"), 'exit-relogin prefix runtime offline suppress core does not call suppress writer');
    assert(exitReloginRuntimeModule.includes('minimumUntil: Math.max(Number(options.minimumUntil || 0) || 0, staminaHold?.until || 0)'), 'exit-relogin prefix runtime offline suppress core does not preserve minimumUntil selection');
    assert(exitReloginRuntimeModule.includes('function setOfflineLeaveSuppressBoundCore(bot, storage, reason, detail, selfLike = null, options = {}, helpers)'), 'exit-relogin prefix runtime offline suppress bound core not found');
    assert(exitReloginRuntimeModule.includes('staminaExitHoldUntilForDetailBoundCore(holdDetail, nowFn()') && exitReloginRuntimeModule.includes('offlineExitRequiresUnsafeReloginDelay: offlineExitRequiresUnsafeReloginDelayCore'), 'exit-relogin prefix runtime offline suppress bound core does not preserve helper binding');
    assert(exitReloginRuntimeModule.includes('setExitReloginSuppress: (storageReason, suppressReason, suppressDetail, suppressSelfLike, suppressOptions) => setExitReloginSuppressBoundCore(') && exitReloginRuntimeModule.includes('storage,') && exitReloginRuntimeModule.includes('suppressOptions,'), 'exit-relogin prefix runtime offline suppress bound core does not route through bound suppress writer');
    assert(exitReloginRuntimeModule.includes('function primePendingStaminaExitLoginSuppressCore(detail, helpers)'), 'exit-relogin prefix runtime pending stamina core not found');
    assert(exitReloginRuntimeModule.includes("const until = helpers.setLoginSuppress('stamina leave pending', delayMs);"), 'exit-relogin prefix runtime pending stamina core does not set login suppress');
    assert(exitReloginRuntimeModule.includes('detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - now));'), 'exit-relogin prefix runtime pending stamina core does not preserve pending delay');
    assert(exitReloginRuntimeModule.includes('if (hold.staminaBudgetExit) detail.staminaBudgetHold = hold;'), 'exit-relogin prefix runtime pending stamina core does not preserve budget hold metadata');
    assert(exitReloginRuntimeModule.includes('function primePendingStaminaExitLoginSuppressBoundCore(detail, helpers)'), 'exit-relogin prefix runtime pending stamina bound core not found');
    assert(exitReloginRuntimeModule.includes('return primePendingStaminaExitLoginSuppressCore(detail, {') && exitReloginRuntimeModule.includes('staminaExitHoldUntilForDetailBoundCore(holdDetail, nowFn()'), 'exit-relogin prefix runtime pending stamina bound core does not preserve helper binding');
    assert(exitReloginRuntimeModule.includes('function clearEnemyReloginHoldCore(bot, reason = \'online self restored\', helpers)'), 'exit-relogin clear runtime enemy core not found');
    assert(exitReloginRuntimeModule.includes('helpers.activeEnemyLeaveDetail(t)'), 'exit-relogin clear runtime enemy core does not read active leave detail');
    assert(exitReloginRuntimeModule.includes("bot.pendingExit = bot.pendingExit?.scope === 'offline' ? bot.pendingExit : null;"), 'exit-relogin clear runtime enemy core does not preserve pending-exit scope rule');
    assert(exitReloginRuntimeModule.includes('helpers.clearExitHoldDetail(detail, reason, t);'), 'exit-relogin clear runtime enemy core does not clear detail hold fields');
    assert(exitReloginRuntimeModule.includes('helpers.clearPersistentExitState(helpers.enemyLeaveStateKey)'), 'exit-relogin clear runtime enemy core does not clear persistent enemy state');
    assert(exitReloginRuntimeModule.includes('helpers.clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i)'), 'exit-relogin clear runtime enemy core does not clear enemy login suppress');
    assert(exitReloginRuntimeModule.includes('function clearOfflineReloginHoldCore(bot, reason = \'online self restored\', helpers)'), 'exit-relogin clear runtime offline core not found');
    assert(exitReloginRuntimeModule.includes("bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;"), 'exit-relogin clear runtime offline core does not preserve pending-exit scope rule');
    assert(exitReloginRuntimeModule.includes('bot.lastOfflineLeaveResult.reloginUntil = 0;'), 'exit-relogin clear runtime offline core does not clear reloginUntil');
    assert(exitReloginRuntimeModule.includes('helpers.clearPersistentExitState(helpers.offlineLeaveStateKey)'), 'exit-relogin clear runtime offline core does not clear persistent offline state');
    assert(exitReloginRuntimeModule.includes('helpers.clearLoginSuppressMatching(/offline.*leave/i)'), 'exit-relogin clear runtime offline core does not clear offline login suppress');
    assert(exitReloginRuntimeModule.includes('function clearEnemyReloginHoldBoundCore(bot, storage, reason = \'online self restored\', helpers)'), 'exit-relogin clear runtime enemy bound core not found');
    assert(exitReloginRuntimeModule.includes('return clearEnemyReloginHoldCore(bot, reason, {') && exitReloginRuntimeModule.includes('clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(storage, pattern'), 'exit-relogin clear runtime enemy bound core does not preserve cleanup binding');
    assert(exitReloginRuntimeModule.includes('function clearOfflineReloginHoldBoundCore(bot, storage, reason = \'online self restored\', helpers)'), 'exit-relogin clear runtime offline bound core not found');
    assert(exitReloginRuntimeModule.includes('return clearOfflineReloginHoldCore(bot, reason, {') && exitReloginRuntimeModule.includes('offlineLeaveStateKey: helpers.offlineLeaveStateKey'), 'exit-relogin clear runtime offline bound core does not preserve cleanup binding');
    for (const exportedName of [
      'leaveWaitDisplayCore',
      'finalizeLeaveDisplayReasonCore',
      'normalizeEnemyActorCore',
      'enemyActorFromLeaveDetailCore',
      'enemyRepeatDelayMsForCountCore',
      'readEnemyLeaveStreakCore',
      'writeEnemyLeaveStreakCore',
      'updateEnemyLeaveStreakCore',
      'readEnemyLeaveStreakBoundCore',
      'writeEnemyLeaveStreakBoundCore',
      'updateEnemyLeaveStreakBoundCore',
      'combatExitSummaryCore',
      'combatLeaveActionCore',
      'pursuitLeaveSummaryCore',
      'injuryLeaveSummaryCore',
      'offlineLeaveSummaryCore',
      'currentOfflineDisplayReasonCore',
      'reloginDelayForHpCore',
      'isExitLoginSuppressReasonCore',
      'unsafeExitReloginMinDelayMsCore',
      'pendingExitSuppressReasonCore',
      'startExitAuditCore',
      'startExitAuditBoundCore',
      'setExitReloginSuppressCore',
      'setExitReloginSuppressBoundCore',
      'primePendingUnsafeExitLoginSuppressCore',
      'primePendingUnsafeExitLoginSuppressBoundCore',
      'staminaBudgetExitHoldUntilCore',
      'staminaExitHoldUntilForDetailCore',
      'staminaExitHoldUntilForDetailBoundCore',
      'offlineExitRequiresUnsafeReloginDelayCore',
      'enemyReloginHoldRemainingMsCore',
      'offlineReloginHoldRemainingMsCore',
      'clearLoginSuppressMatchingCore',
      'enemyReloginHoldRemainingMsBoundCore',
      'offlineReloginHoldRemainingMsBoundCore',
      'clearLoginSuppressMatchingBoundCore',
      'setOfflineLeaveSuppressCore',
      'setOfflineLeaveSuppressBoundCore',
      'primePendingStaminaExitLoginSuppressCore',
      'primePendingStaminaExitLoginSuppressBoundCore',
      'clearEnemyReloginHoldCore',
      'clearOfflineReloginHoldCore',
      'clearEnemyReloginHoldBoundCore',
      'clearOfflineReloginHoldBoundCore'
    ]) {
      assert(exitReloginRuntimeModule.includes(`  ${exportedName}`), `exit-relogin runtime module does not export ${exportedName}`);
    }
    assert(pendingExitSourceModule.includes('function pendingExitSource(options = {}) {'), 'pending-exit source factory not found');
    assert(pendingExitSourceModule.includes('module.exports = {\n  pendingExitSource'), 'pending-exit source module export not found');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('String.raw`'), 'pending-exit source factory does not return raw browser source');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('function summarizePendingExit'), 'pending-exit source factory does not include summary helper');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('async function handlePendingExit'), 'pending-exit source factory does not include handler');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('function updatePursuitTracking'), 'pending-exit source factory does not include pursuit tracking helper');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("options.bundledRuntime"), 'pending-exit source does not select bundled enemy suppress call from runtime config');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('setExitReloginSuppressBoundCore'), 'pending-exit source does not import runtime suppress writer bound core for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('setOfflineLeaveSuppressBoundCore'), 'pending-exit source does not import runtime offline suppress bound core for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('clearLoginSuppressMatchingBoundCore'), 'pending-exit source does not import runtime suppress clear bound core for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("setOfflineLeaveSuppressBoundCore(bot, localStorage, detail.reason || 'websocket offline'"), 'pending-exit source does not pass storage into bundled offline suppress bound core');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY'), 'pending-exit source does not bind cfg/streak key for bundled offline suppress');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('const clearLoginSuppressMatchingBinding') && functionBody(pendingExitSourceModule, 'pendingExitSource').includes('clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(localStorage, pattern'), 'pending-exit source does not bind suppress writer cleanup through bound core');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('const reloginDelayForHpBinding') && functionBody(pendingExitSourceModule, 'pendingExitSource').includes('reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp })'), 'pending-exit source does not bind HP relogin delay through runtime core for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('${clearLoginSuppressMatchingBinding}'), 'pending-exit source does not pass bound suppress cleanup into bundled suppress writers');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('${reloginDelayForHpBinding}'), 'pending-exit source does not pass runtime HP relogin delay binding into bundled suppress writers');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('const finalizeLeaveDisplayReasonBinding = options.bundledRuntime'), 'pending-exit source does not select display finalizer binding for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("finalizeLeaveDisplayReasonCoreBinding('finalizeLeaveDisplayReasonForPendingExitCore', 'leaveWaitDisplayForPendingExitCore')"), 'pending-exit source does not bind display finalizer through direct runtime core');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('${finalizeLeaveDisplayReasonBinding}, writePersistentExitState, setLoginSuppress, staminaBudgetReloginDelayMs, staminaResetHoldUntil, now: Date.now'), 'pending-exit source does not bind offline suppress writer helpers for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("setOfflineLeaveSuppress(detail.reason || 'websocket offline'"), 'pending-exit source does not preserve inline offline suppress wrapper call');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("setExitReloginSuppressBoundCore(bot, localStorage, 'enemy leave', detail.reason || 'enemy leave'"), 'pending-exit source does not write bundled enemy leave suppress through bound runtime writer');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('cfg, loginSuppressKey: LOGIN_SUPPRESS_KEY, loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY, enemyLeaveStreakKey: ENEMY_LEAVE_STREAK_KEY, enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY, offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY'), 'pending-exit source does not bind suppress writer storage keys for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes('${finalizeLeaveDisplayReasonBinding}, writePersistentExitState, setLoginSuppress, now: Date.now'), 'pending-exit source does not bind suppress writer helpers for bundled builds');
    assert(functionBody(pendingExitSourceModule, 'pendingExitSource').includes("setEnemyLeaveSuppress(detail.reason || 'enemy leave'"), 'pending-exit source does not preserve inline enemy suppress wrapper call');
    assert(leaveCommandSourceModule.includes('function leaveCommandSource(options = {}) {'), 'leave-command source factory not found');
    assert(leaveCommandSourceModule.includes('module.exports = {\n  leaveCommandSource'), 'leave-command source module export not found');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('String.raw`'), 'leave-command source factory does not return raw browser source');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function waitWithTimeout'), 'leave-command source factory does not include timeout helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function leaveCommandFailureMessage'), 'leave-command source factory does not include failure helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function summarizeLeaveCommandResult'), 'leave-command source factory does not include result summary helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function clashLeaveRescueHook'), 'leave-command source factory does not include Clash rescue hook helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function scheduleClashLeaveRescueRetry'), 'leave-command source factory does not include Clash rescue scheduler');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('async function runClashLeaveRescueRetry'), 'leave-command source factory does not include Clash rescue retry runner');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function updatePendingExitLastResult'), 'leave-command source factory does not include pending-exit result update helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function maybeConfirmPendingExitFromLeaveDetail'), 'leave-command source factory does not include pending-exit confirmation helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('function completeLeaveRequest'), 'leave-command source factory does not include leave request completion helper');
    assert(functionBody(leaveCommandSourceModule, 'leaveCommandSource').includes('async function issueLeaveCommand'), 'leave-command source factory does not include leave command issuer');
    assert(autoLoginSourceModule.includes('function autoLoginSource() {'), 'auto-login source factory not found');
    assert(autoLoginSourceModule.includes('module.exports = {\n  autoLoginSource'), 'auto-login source module export not found');
    assert(functionBody(autoLoginSourceModule, 'autoLoginSource').includes('String.raw`'), 'auto-login source factory does not return raw browser source');
    assert(functionBody(autoLoginSourceModule, 'autoLoginSource').includes('async function maybeStartAutoLogin'), 'auto-login source factory does not include auto login starter');
    assert(functionBody(autoLoginSourceModule, 'autoLoginSource').includes('async function forceLoginNow'), 'auto-login source factory does not include manual login starter');
    assert(functionBody(autoLoginSourceModule, 'autoLoginSource').includes('allowLiveSessionTakeoverBypass'), 'auto-login source factory does not preserve live-session takeover bypass handling');
    assert(leaveFlowSourceModule.includes('function leaveFlowSource(options = {}) {'), 'leave-flow source factory not found');
    assert(leaveFlowSourceModule.includes('module.exports = {\n  leaveFlowSource'), 'leave-flow source module export not found');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('String.raw`'), 'leave-flow source factory does not return raw browser source');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('async function leaveOffline'), 'leave-flow source factory does not include offline leave wrapper');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('async function leaveForInjury'), 'leave-flow source factory does not include injury leave wrapper');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('async function leaveForPursuit'), 'leave-flow source factory does not include pursuit leave wrapper');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('async function leaveForCombat'), 'leave-flow source factory does not include combat leave wrapper');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('async function leaveDuringEnemyHold'), 'leave-flow source factory does not include enemy-hold leave wrapper');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('pendingExitSkipNewLeave'), 'leave-flow source factory does not preserve pending-exit duplicate leave guard');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('options.bundledRuntime'), 'leave-flow source does not select offline unsafe predicate call from runtime config');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes("require('./src/browser/runtime/exit-relogin')"), 'leave-flow source does not import runtime offline unsafe predicate for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('combatExitSummaryCore: combatExitSummaryForLeaveFlowCore'), 'leave-flow source does not import bundled combat summary core alias');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('combatExitSummaryForLeaveFlowCore(${reason}, ${target}, ${combatState}, { cfg, actorLabel, hpDisplay, formatDurationMs })'), 'leave-flow source does not bind bundled combat summary core directly');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('injuryLeaveSummaryCore: injuryLeaveSummaryForLeaveFlowCore'), 'leave-flow source does not import bundled injury summary core alias');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('injuryLeaveSummaryForLeaveFlowCore(${injury}, { actorLabel, hpDisplay })'), 'leave-flow source does not bind bundled injury summary core directly');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('offlineLeaveSummaryCore: offlineLeaveSummaryForLeaveFlowCore'), 'leave-flow source does not import bundled offline summary core alias');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('offlineLeaveSummaryForLeaveFlowCore(${reason}, ${offlineSafety}, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })'), 'leave-flow source does not bind bundled offline summary core directly');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('pursuitLeaveSummaryCore: pursuitLeaveSummaryForLeaveFlowCore'), 'leave-flow source does not import bundled pursuit summary core alias');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('pursuitLeaveSummaryForLeaveFlowCore(${pursuit}, { actorLabel, formatDurationMs, formatDistance })'), 'leave-flow source does not bind bundled pursuit summary core directly');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety)'), 'leave-flow source does not call runtime offline unsafe predicate core for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety)'), 'leave-flow source does not preserve inline offline unsafe predicate wrapper call');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('primePendingStaminaExitLoginSuppressBoundCore'), 'leave-flow source does not import runtime pending stamina suppress bound core for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('primePendingStaminaExitLoginSuppressBoundCore(detail, { now: Date.now, staminaBudgetReloginDelayMs, staminaResetHoldUntil, setLoginSuppress })'), 'leave-flow source does not bind pending stamina suppress helpers for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes("primePendingStaminaExitLoginSuppress(detail)'"), 'leave-flow source does not preserve inline pending stamina suppress wrapper call');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('primePendingUnsafeExitLoginSuppressBoundCore'), 'leave-flow source does not import runtime pending unsafe suppress bound core for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('const reloginDelayForHpBinding') && functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('reloginDelayForHp: (selfLike, detail) => reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp })'), 'leave-flow source does not bind HP relogin delay through runtime core for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('hpInfoForRelogin, ${reloginDelayForHpBinding}, cfg, setLoginSuppress, now: Date.now'), 'leave-flow source does not pass runtime HP relogin delay binding into bundled pending unsafe suppress');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('`primePendingUnsafeExitLoginSuppress(${storageReason}, ${reason}, ${detail}, ${selfLike})`'), 'leave-flow source does not preserve inline pending unsafe suppress wrapper call template');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('startExitAuditBoundCore'), 'leave-flow source does not import runtime start exit audit bound core for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('resetLoginSnapshotGate, loginPointSafetyExitSelfForDetail, ensureExitAuditDetail, recordExitAuditEvent, now: Date.now'), 'leave-flow source does not bind start exit audit helpers for bundled builds');
    assert(functionBody(leaveFlowSourceModule, 'leaveFlowSource').includes('`startExitAudit(${detail}, ${meta})`'), 'leave-flow source does not preserve inline start exit audit wrapper call template');
    assert(offlineSafetySourceModule.includes('function offlineSafetySource() {'), 'offline-safety source factory not found');
    assert(offlineSafetySourceModule.includes('module.exports = {\n  offlineSafetySource'), 'offline-safety source module export not found');
    assert(functionBody(offlineSafetySourceModule, 'offlineSafetySource').includes('String.raw`'), 'offline-safety source factory does not return raw browser source');
    assert(functionBody(offlineSafetySourceModule, 'offlineSafetySource').includes('function summarizeOfflineThreat'), 'offline-safety source factory does not include offline threat summary helper');
    assert(functionBody(offlineSafetySourceModule, 'offlineSafetySource').includes('function assessOfflineSafety'), 'offline-safety source factory does not include offline safety assessment helper');
    assert(functionBody(offlineSafetySourceModule, 'offlineSafetySource').includes('function pickActiveCombatWaitThreat'), 'offline-safety source factory does not include active combat wait picker');
    assert(pageNativeSnapshotSourceModule.includes('function pageNativeSnapshotSource(options = {}) {'), 'page-native snapshot source factory not found');
    assert(pageNativeSnapshotSourceModule.includes('module.exports = {\n  pageNativeSnapshotSource'), 'page-native snapshot module export not found');
    assert(functionBody(pageNativeSnapshotSourceModule, 'pageNativeSnapshotSource').includes('String.raw`'), 'page-native snapshot source factory does not return raw browser source');
    assert(functionBody(pageNativeSnapshotSourceModule, 'pageNativeSnapshotSource').includes('recordRuntimeDiagnosticsCore(bot, ${values})'), 'page-native snapshot source factory does not route bundled runtime diagnostics through core');
    assert(functionBody(pageNativeSnapshotSourceModule, 'pageNativeSnapshotSource').includes('function installPageNativeSnapshotObserver()'), 'page-native snapshot source does not include observer installer');
    assert(actionArbitrationSourceModule.includes('function actionArbitrationInlineSource(helpers = {}) {'), 'action-arbitration inline source factory not found');
    assert(actionArbitrationSourceModule.includes('function bundledActionArbitrationSource() {'), 'action-arbitration bundled source factory not found');
    assert(actionArbitrationSourceModule.includes('function actionArbitrationSource(options = {}) {'), 'action-arbitration source selector not found');
    assert(actionArbitrationSourceModule.includes('module.exports = {\n  actionArbitrationInlineSource,\n  bundledActionArbitrationSource,\n  actionArbitrationSource'), 'action-arbitration module exports are incomplete');
    assert(actionArbitrationSourceModule.includes("require('./runtime/action-priority')"), 'action-arbitration source does not import action-priority through the browser runtime helper module');
    assert(actionArbitrationSourceModule.includes("require('./runtime/action-arbitration')"), 'action-arbitration source does not import action-arbitration through the browser runtime helper module');
    assert(!actionArbitrationSourceModule.includes("require('../strategy/action-arbitration')"), 'action-arbitration source still imports final action arbitration directly from strategy');
    assert(actionArbitrationSourceModule.includes("require('./runtime/action-switch-diagnostics')"), 'action-arbitration source does not import action-switch diagnostics through the browser runtime helper module');
    assert(!actionArbitrationSourceModule.includes("require('../strategy/action-switch-diagnostics')"), 'action-arbitration source still imports action-switch diagnostics directly from strategy');
    assert(actionPriorityRuntimeModule.includes("require('../../strategy/action-priority')"), 'browser action-priority helper module does not reuse the strategy action-priority helpers');
    assert(actionPriorityRuntimeModule.includes('actionPriorityBand') && actionPriorityRuntimeModule.includes('actionFocusSummary') && actionPriorityRuntimeModule.includes('getActionTargetKey'), 'browser action-priority helper module exports are incomplete');
    assert(actionArbitrationRuntimeModule.includes("require('../../strategy/action-arbitration')"), 'browser action-arbitration helper module does not reuse the strategy action-arbitration helpers');
    assert(actionArbitrationRuntimeModule.includes('finalActionBandRank') && actionArbitrationRuntimeModule.includes('applyFinalActionArbitrationCore') && actionArbitrationRuntimeModule.includes('buildArbitrationStatus'), 'browser action-arbitration helper module exports are incomplete');
    assert(actionSwitchDiagnosticsRuntimeModule.includes("require('../../strategy/action-switch-diagnostics')"), 'browser action-switch diagnostics helper module does not reuse the strategy action-switch diagnostics helpers');
    assert(actionSwitchDiagnosticsRuntimeModule.includes('actionSwitchPairKey') && actionSwitchDiagnosticsRuntimeModule.includes('buildPreviousDecisionSummary') && actionSwitchDiagnosticsRuntimeModule.includes('recordActionSwitchDiagnosticsCore'), 'browser action-switch diagnostics helper module exports are incomplete');
    const actionArbitrationInlineBody = functionBody(actionArbitrationSourceModule, 'actionArbitrationInlineSource');
    assert(actionArbitrationInlineBody.includes('String.raw`'), 'action-arbitration inline source factory does not return raw browser source');
    assert(actionArbitrationInlineBody.includes('function recordActionSwitchDiagnostics'), 'action-arbitration inline source factory does not include target switch diagnostics wrapper');
    assert(actionArbitrationInlineBody.includes('function applyFinalActionArbitration'), 'action-arbitration inline source factory does not include final action arbitration wrapper');
    assert(actionArbitrationInlineBody.includes('actionPriorityHelperSource') && actionArbitrationInlineBody.includes('actionSwitchHelperSource') && actionArbitrationInlineBody.includes('finalActionHelperSource'), 'action-arbitration inline source factory does not inject helper groups');
    assert(actionArbitrationInlineBody.includes('fn.toString()'), 'action-arbitration inline source factory does not inline helper functions');
    const actionArbitrationBundledBody = functionBody(actionArbitrationSourceModule, 'bundledActionArbitrationSource');
    assert(actionArbitrationBundledBody.includes("require('./src/browser/runtime/action-priority')"), 'action-arbitration bundled source does not hand action-priority helpers to the bundler');
    assert(actionArbitrationBundledBody.includes("require('./src/browser/runtime/action-switch-diagnostics')"), 'action-arbitration bundled source does not hand action-switch diagnostics helpers to the bundler');
    assert(actionArbitrationBundledBody.includes("require('./src/browser/runtime/action-arbitration')"), 'action-arbitration bundled source does not hand final action arbitration helpers to the bundler');
    assert(networkQualitySourceModule.includes('function networkQualitySource() {'), 'network-quality source factory not found');
    assert(networkQualitySourceModule.includes('module.exports = {\n  networkQualitySource'), 'network-quality module export not found');
    assert(functionBody(networkQualitySourceModule, 'networkQualitySource').includes('String.raw`'), 'network-quality source factory does not return raw browser source');
    assert(functionBody(networkQualitySourceModule, 'networkQualitySource').includes('function observeNativeWsFrame'), 'network-quality source factory does not include native frame observer');
    assert(functionBody(networkQualitySourceModule, 'networkQualitySource').includes('function recordNetworkQualityMovementCommand'), 'network-quality source factory does not include movement command tracking');
    assert(functionBody(networkQualitySourceModule, 'networkQualitySource').includes('function recordNetworkQualityShot'), 'network-quality source factory does not include attack shot tracking');
    assert(functionBody(networkQualitySourceModule, 'networkQualitySource').includes('function recordNetworkQualityAttackDamage'), 'network-quality source factory does not include attack damage ACK tracking');
    assert(networkQualitySummarySourceModule.includes('function networkQualitySummarySource() {'), 'network-quality summary source factory not found');
    assert(networkQualitySummarySourceModule.includes('module.exports = {\n  networkQualitySummarySource'), 'network-quality summary module export not found');
    assert(functionBody(networkQualitySummarySourceModule, 'networkQualitySummarySource').includes('String.raw`'), 'network-quality summary source factory does not return raw browser source');
    assert(functionBody(networkQualitySummarySourceModule, 'networkQualitySummarySource').includes('function summarizeNetworkQuality'), 'network-quality summary source factory does not include summarizeNetworkQuality');
    assert(functionBody(networkQualitySummarySourceModule, 'networkQualitySummarySource').includes("source: 'native-ws-state'"), 'network-quality summary source does not preserve native WS source');
    assert(runtimeSummarySourceModule.includes('function runtimeSummarySource() {'), 'runtime-summary source factory not found');
    assert(runtimeSummarySourceModule.includes('module.exports = {\n  runtimeSummarySource'), 'runtime-summary module export not found');
    assert(functionBody(runtimeSummarySourceModule, 'runtimeSummarySource').includes('String.raw`'), 'runtime-summary source factory does not return raw browser source');
    assert(functionBody(runtimeSummarySourceModule, 'runtimeSummarySource').includes('function summarizeSelf(self)'), 'runtime-summary source factory does not include self summary helper');
    assert(functionBody(runtimeSummarySourceModule, 'runtimeSummarySource').includes('function assessServerPositionStall(self)'), 'runtime-summary source factory does not include server-position stall helper');
  });

  check('bundler scripts are wired without coupling spike and production entrypoints', () => {
    assert(rootPackage.private === true, 'root package must stay private for the spike dependency');
    assert(rootPackage.type === 'commonjs', 'root package type should keep existing CommonJS scripts unchanged');
    assert(rootPackage.devDependencies?.esbuild === '0.25.11', 'esbuild dependency is not pinned');
    assert(rootPackage.scripts?.['build:bundler-spike'] === 'node scripts/build-bundler-spike.js', 'bundler spike build script not found');
    assert(rootPackage.scripts?.['test:bundler-spike'] === 'node scripts/build-bundler-spike.js --self-test', 'bundler spike self-test script not found');
    assert(rootPackage.scripts?.['build:remote-bundled'] === 'node scripts/build-remote-bot-bundled.js', 'remote bundled candidate build script not found');
    assert(rootPackage.scripts?.['test:remote-bundled'] === 'node scripts/build-remote-bot-bundled.js --self-test', 'remote bundled candidate self-test script not found');
    assert(!buildRemoteSource.includes('build-bundler-spike') && !buildRemoteSource.includes('build-remote-bot-bundled'), 'production remote build is coupled to spike/candidate scripts instead of the shared bundler');
    assert(bundlerSpikeBuildSource.includes("const esbuild = require('esbuild')"), 'small bundler spike build does not use esbuild independently');
    assert(remoteBundledBuildSource.includes("require('./remote-bot-bundle')"), 'remote bundled candidate does not use the shared remote bundler');
  });

  check('bundler spike bundles shared and strategy helpers into a browser IIFE', () => {
    assert(bundlerSpikeEntrySource.includes("import runtimeUtils from '../browser/runtime/runtime-utils.js'"), 'bundler spike does not import runtime utils through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import displayFormat from '../browser/runtime/display-format.js'"), 'bundler spike does not import display helpers through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import targetWhitelist from '../browser/runtime/target-whitelist.js'"), 'bundler spike does not import target whitelist helpers through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import exitSummary from '../browser/runtime/exit-summary.js'"), 'bundler spike does not import exit-summary helpers through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import preservedState from '../browser/runtime/browser-preserved-state.js'"), 'bundler spike does not import preserved-state helper through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import runtimeDefaults from '../browser/runtime/runtime-defaults.js'"), 'bundler spike does not import runtime-defaults helper through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import actionPriority from '../browser/runtime/action-priority.js'"), 'bundler spike does not import action-priority through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import actionArbitration from '../browser/runtime/action-arbitration.js'"), 'bundler spike does not import action-arbitration through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import actionSwitchDiagnostics from '../browser/runtime/action-switch-diagnostics.js'"), 'bundler spike does not import action-switch diagnostics through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import coinDiagnostics from '../browser/runtime/coin-diagnostics.js'"), 'bundler spike does not import coin diagnostics through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import coinMotion from '../browser/runtime/coin-motion.js'"), 'bundler spike does not import coin motion through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import coinTarget from '../browser/runtime/coin-target.js'"), 'bundler spike does not import coin target through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import opportunityClear from '../browser/runtime/opportunity-clear.js'"), 'bundler spike does not import opportunity clear through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import postAttackDrop from '../browser/runtime/post-attack-drop.js'"), 'bundler spike does not import post-attack drop through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import staminaBudget from '../browser/runtime/stamina-budget.js'"), 'bundler spike does not import stamina budget through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import opportunityConstants from '../browser/runtime/opportunity-constants.js'"), 'bundler spike does not import opportunity constants through the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("import pageAdapter from '../browser/page-global-core.js'"), 'bundler spike does not import the shared page-global adapter');
    assert(bundlerSpikeEntrySource.includes("import arrayCountRuntime from '../browser/runtime/array-count.js'"), 'bundler spike does not import the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes('nameCount: arrayCountRuntime.arrayCount(names)'), 'bundler spike does not execute the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("offlineSummary: exitSummary.offlineLeaveSummaryText('sampling outage', { samplingOutage: true })"), 'bundler spike does not execute the exit-summary helper module');
    assert(bundlerSpikeEntrySource.includes('preservedKills: arrayCountRuntime.arrayCount(preservedState.buildBrowserPreservedState({'), 'bundler spike does not execute the preserved-state helper module');
    assert(bundlerSpikeEntrySource.includes('defaultStatusEvery: runtimeDefaults.buildRuntimeDefaults({ statusEvery: 0 }, false).statusEvery'), 'bundler spike does not execute the runtime-defaults helper module');
    assert(bundlerSpikeEntrySource.includes('actionArbitration.applyFinalActionArbitrationCore(sampleAction, arbitrationState, { nowMs: 1000, holdMs: 1000 })'), 'bundler spike does not execute the action-arbitration helper module');
    assert(bundlerSpikeEntrySource.includes('actionSwitchDiagnostics.recordActionSwitchDiagnosticsCore(sampleAction, switchState, { nowMs: 1000 })'), 'bundler spike does not execute the action-switch diagnostics helper module');
    assert(bundlerSpikeEntrySource.includes('coinDiagnostics.buildCoinDiagnostics({ x: 0, y: 0 }, {'), 'bundler spike does not execute the coin diagnostics helper module');
    assert(bundlerSpikeEntrySource.includes('coinMotion.coinDirectionToCore({ x: 0, y: 0 }, {'), 'bundler spike does not execute the coin motion helper module');
    assert(bundlerSpikeEntrySource.includes("coinTarget.coinTargetKeyCore({ drop_id: 'target-spike'"), 'bundler spike does not execute the coin target helper module');
    assert(bundlerSpikeEntrySource.includes('opportunityClear.shouldClearOpportunityChoiceCore('), 'bundler spike does not execute the opportunity clear helper module');
    assert(bundlerSpikeEntrySource.includes('postAttackDrop.pickPostAttackDropCoinCore('), 'bundler spike does not execute the post-attack drop helper module');
    assert(bundlerSpikeEntrySource.includes('staminaBudget.dailyStaminaBudgetIsLimitingCore('), 'bundler spike does not execute the stamina budget helper module');
    assert(bundlerSpikeEntrySource.includes('opportunityConstants.calculateOpportunityROI('), 'bundler spike does not execute the opportunity constants helper module');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.setExitReloginSuppressCore('), 'bundler spike does not execute the exit-relogin suppress writer core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.setExitReloginSuppressBoundCore('), 'bundler spike does not execute the exit-relogin bound suppress writer core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.primePendingUnsafeExitLoginSuppressBoundCore('), 'bundler spike does not execute the exit-relogin bound pending unsafe suppress core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.startExitAuditBoundCore('), 'bundler spike does not execute the exit-relogin bound start audit core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.staminaExitHoldUntilForDetailBoundCore('), 'bundler spike does not execute the exit-relogin bound stamina hold selector core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.enemyReloginHoldRemainingMsBoundCore('), 'bundler spike does not execute the exit-relogin bound enemy hold reader core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.offlineReloginHoldRemainingMsBoundCore('), 'bundler spike does not execute the exit-relogin bound offline hold reader core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.clearLoginSuppressMatchingBoundCore('), 'bundler spike does not execute the exit-relogin bound suppress clear core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.setOfflineLeaveSuppressBoundCore('), 'bundler spike does not execute the exit-relogin bound offline suppress core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.primePendingStaminaExitLoginSuppressBoundCore('), 'bundler spike does not execute the exit-relogin bound pending stamina suppress core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.clearEnemyReloginHoldBoundCore('), 'bundler spike does not execute the exit-relogin bound enemy hold cleanup core');
    assert(bundlerSpikeEntrySource.includes('exitRelogin.clearOfflineReloginHoldBoundCore('), 'bundler spike does not execute the exit-relogin bound offline hold cleanup core');
    assert(bundlerSpikeEntrySource.includes("const SPIKE_KEY = '__graspRatBundlerSpike'"), 'bundler spike global key not found');
    assert(bundlerSpikeEntrySource.includes("const CONFIG_KEY = '__GRASP_RAT_BUNDLER_SPIKE_CONFIG__'"), 'bundler spike config key not found');
    assert(bundlerSpikeEntrySource.includes('pageAdapter.installPageGlobal(SPIKE_KEY, installed);'), 'bundler spike does not install through the page-global adapter');
    assert(bundlerSpikeEntrySource.includes('pageAdapter.readPageGlobal(CONFIG_KEY, {})'), 'bundler spike does not read config through the page-global adapter');
    assert(bundlerSpikeEntrySource.includes("pageAdapter.readPageLocalStorageJson('graspRatBundlerSpikeProbe'"), 'bundler spike does not exercise localStorage adapter behavior');
    assert(!bundlerSpikeEntrySource.includes('typeof window'), 'bundler spike entry still resolves window directly');
    assert(!bundlerSpikeEntrySource.includes('typeof globalThis'), 'bundler spike entry still resolves globalThis directly');
    assert(browserPageGlobalCoreSource.includes('function resolvePageGlobal'), 'page-global adapter resolver not found');
    assert(browserPageGlobalCoreSource.includes('function readPageGlobal'), 'page-global adapter reader not found');
    assert(browserPageGlobalCoreSource.includes('function installPageGlobal'), 'page-global adapter installer not found');
    assert(browserPageGlobalCoreSource.includes('function readPageLocalStorageJson'), 'page-global adapter localStorage reader not found');
    assert(browserPageGlobalCoreSource.includes("typeof window !== 'undefined'"), 'page-global adapter does not handle window');
    assert(browserPageGlobalCoreSource.includes("typeof globalThis !== 'undefined'"), 'page-global adapter does not handle globalThis');
    assert(browserPageGlobalCoreSource.includes('storage.getItem(key)'), 'page-global adapter does not read localStorage through getItem');
    assert(browserPageGlobalCoreSource.includes('JSON.parse(raw)'), 'page-global adapter does not parse JSON localStorage values');
    assert(bundlerSpikeEntrySource.includes('installBundlerSpike(runtimeConfig);'), 'bundler spike entry does not install itself');
    assert(bundlerSpikeBuildSource.includes("const esbuild = require('esbuild')"), 'bundler spike build does not use esbuild');
    assert(bundlerSpikeBuildSource.includes("format: 'iife'"), 'bundler spike does not build an IIFE');
    assert(bundlerSpikeBuildSource.includes("globalName: '__graspRatBundlerSpikeBundle'"), 'bundler spike IIFE globalName not found');
    assert(bundlerSpikeBuildSource.includes("platform: 'browser'"), 'bundler spike platform is not browser');
    assert(bundlerSpikeBuildSource.includes('minify: false'), 'bundler spike should keep readable output while evaluating migration');
    assert(bundlerSpikeBuildSource.includes('vm.runInContext(source, context'), 'bundler spike self-test does not execute the browser output');
    assert(bundlerSpikeBuildSource.includes("assert(source.includes('__graspRatBundlerSpike')"), 'bundler spike self-test does not assert the global key positively');
    assert(!bundlerSpikeBuildSource.includes("!source.includes('require("), 'bundler spike still uses obsolete blanket require assertion');
    assert(bundlerSpikeBuildSource.includes("assert(source.includes('function resolvePageGlobal')"), 'bundler spike self-test does not verify adapter bundling');
    assert(bundlerSpikeBuildSource.includes("assert(source.includes('function arrayCount')"), 'bundler spike self-test does not verify browser runtime helper bundling');
    assert(bundlerSpikeBuildSource.includes('status.nameCount === 2'), 'bundler spike self-test does not verify browser runtime helper execution');
    assert(bundlerSpikeBuildSource.includes("status.postAttackDropSelectedId === 'post-attack-coin'"), 'bundler spike self-test does not assert post-attack drop execution');
    assert(bundlerSpikeBuildSource.includes('status.opportunityClearExact === true'), 'bundler spike self-test does not assert opportunity clear execution');
    assert(bundlerSpikeBuildSource.includes('status.staminaBudgetExitShortageMs === 50'), 'bundler spike self-test does not assert stamina budget execution');
    assert(bundlerSpikeBuildSource.includes('status.opportunityConstantRoi === 5'), 'bundler spike self-test does not assert opportunity constants execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressReuseUntil === 9000'), 'bundler spike self-test does not assert suppress reuse execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressZeroSkipped === true'), 'bundler spike self-test does not assert suppress zero-delay execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressNewUntil === 7000'), 'bundler spike self-test does not assert suppress new-hold execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressBoundUntil === 6000'), 'bundler spike self-test does not assert bound suppress writer execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginBoundStreakCount === 3'), 'bundler spike self-test does not assert bound streak updater execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressBoundStreakCount === 1'), 'bundler spike self-test does not assert bound suppress writer streak execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginSuppressEventCount === 8'), 'bundler spike self-test does not assert suppress writer side-effect count');
    assert(bundlerSpikeBuildSource.includes("status.exitReloginStaminaHoldBoundReason === 'stamina reset'"), 'bundler spike self-test does not assert bound stamina hold selector execution');
    assert(bundlerSpikeBuildSource.includes('status.exitReloginOfflineSuppressBoundReturn === 4000'), 'bundler spike self-test does not assert bound offline suppress execution');
    assert(bundlerSpikeBuildSource.includes("version: 'window-self-test'"), 'bundler spike self-test does not cover window runtime globals');
    assert(bundlerSpikeBuildSource.includes('context => context.window'), 'bundler spike self-test does not read installed window global');
    assert(bundlerSpikeBuildSource.includes("storageProbe?.scope === 'globalThis'"), 'bundler spike self-test does not cover globalThis localStorage');
    assert(bundlerSpikeBuildSource.includes("storageProbe?.scope === 'window'"), 'bundler spike self-test does not cover window localStorage');
    assert(bundlerSpikeBuildSource.includes("/require\\(['\"]\\.\\.?\\//"), 'bundler spike does not reject unresolved relative require calls');
    assert(bundlerSpikeBuildSource.includes("/\\bfrom\\s+['\"]\\.\\.?\\//"), 'bundler spike does not reject unresolved relative import calls');
  });

  check('remote bundled candidate parses the full generated runtime through esbuild', () => {
    assert(remoteBundleSource.includes('function bundleRemoteSource(directSource)'), 'shared remote bundler does not expose source bundling');
    assert(remoteBundleSource.includes("stdin: {\n      contents: directSource"), 'shared remote bundler does not feed generated runtime source to esbuild stdin');
    assert(remoteBundleSource.includes('function writeRemoteBotBundle'), 'shared remote bundler does not write bundle outputs');
    assert(remoteBundledBuildSource.includes('writeRemoteBotBundle(options'), 'remote bundled candidate does not write through the shared bundler');
    assert(remoteBundledBuildSource.includes('production: false'), 'remote bundled candidate manifest must stay non-production');
    assert(remoteBundledBuildSource.includes("mode: 'full-generated-remote-candidate'"), 'remote bundled candidate manifest mode not found');
    assert(remoteBundleSource.includes('directSha256'), 'shared remote bundler does not record direct source hash');
    assert(remoteBundledBuildSource.includes('verifyBundledCandidate(source, manifest, result);'), 'remote bundled candidate self-test does not verify the built output');
    assert(remoteBundledBuildSource.includes("new vm.Script(source"), 'remote bundled candidate self-test does not parse the bundled output');
    assert(remoteBundledBuildSource.includes("source.includes('__graspRatBot')"), 'remote bundled candidate self-test does not check the bot global key');
    assert(remoteBundledBuildSource.includes("source.includes('installPageGlobal(BOT_KEY, bot, pageGlobal)')"), 'remote bundled candidate self-test does not check adapter bot installation');
    assert(remoteBundledBuildSource.includes("source.includes('function buildRuntimeDefaults')"), 'remote bundled candidate self-test does not check runtime defaults preservation');
    assert(remoteBundledBuildSource.includes("source.includes('function updateBotPanel')"), 'remote bundled candidate self-test does not check status panel preservation');
    assert(remoteBundledBuildSource.includes("source.includes('function getNativeState')"), 'remote bundled candidate self-test does not check native state preservation');
    assert(remoteBundledBuildSource.includes("/require\\(['\"]\\.\\.?\\//"), 'remote bundled candidate does not reject unresolved relative require calls');
    assert(remoteBundledBuildSource.includes("/\\bfrom\\s+['\"]\\.\\.?\\//"), 'remote bundled candidate does not reject unresolved relative import calls');
  });

  for (const file of REMOTE_BOT_FILES) {
    const text = file === 'grasp-rat-bot.js' ? sourceRuntimeText : generatedRuntimeSource;
    const finalRuntimeText = file === 'grasp-rat-bot.js' ? text : distSource;
    const defaultConfigSource = file === 'grasp-rat-bot.js' ? sharedRuntimeDefaultsSource : finalRuntimeText;
    for (const invariant of NUMERIC_INVARIANTS) {
      check(`${file} has ${invariant.key}=${invariant.value}`, () => {
        assert(expectObjectNumber(defaultConfigSource, invariant.key, invariant.value), `${invariant.key}: ${invariant.value} not found`);
      });
    }
    check(`${file} accepts injected sourceHash`, () => {
      assert(/\bsourceHash\s*:\s*String\(config\w*\.sourceHash\s*\|\|\s*['"]['"]\)/.test(defaultConfigSource), 'sourceHash config field not found');
    });
    check(`${file} uses remote username-only target whitelist`, () => {
      const whitelistSource = file === 'grasp-rat-bot.js' ? sharedTargetWhitelistSource : finalRuntimeText;
      assert(/\btargetWhitelistUrl\s*:\s*String\(config\w*\.targetWhitelistUrl\s*\|\|\s*['"]['"]\)/.test(defaultConfigSource), 'targetWhitelistUrl config field not found');
      assert(!defaultConfigSource.includes('targetWhitelistNames:'), 'runtime defaults still include built-in target whitelist names');
      assert(!defaultConfigSource.includes('targetWhitelistIds:'), 'runtime defaults still include built-in target whitelist ids');
      assert(!text.includes('targetWhitelistIds'), 'runtime still references targetWhitelistIds');
      assert(text.includes('const targetWhitelistUrl = deriveTargetWhitelistUrl(cfg.sourceUrl, cfg.targetWhitelistUrl)'), 'runtime does not derive target whitelist URL from source URL');
      assert(text.includes('targetWhitelist: targetWhitelistState'), 'bot status/state does not attach target whitelist state');
      assert(functionBody(text, 'summarizeTargetWhitelistStatus').includes('loaded: Boolean(state?.lastOkAt)'), 'target whitelist status does not expose loaded state');
      assert(functionBody(text, 'targetWhitelistFetchUrl').includes("_graspRatWhitelistTs"), 'target whitelist fetch URL is not cache-busted');
      const refreshBody = functionBody(text, 'refreshTargetWhitelist');
      assert(refreshBody.includes('fetchJsonNoStore(targetWhitelistFetchUrl(url), cfg.targetWhitelistTimeoutMs)'), 'target whitelist refresh does not use configured timeout');
      assert(refreshBody.includes('Array.isArray(payload?.names)') && refreshBody.includes('Array.isArray(payload?.usernames)'), 'target whitelist refresh does not validate username arrays');
      assert(refreshBody.includes('const names = parseTargetWhitelistNames(payload, cfg.targetWhitelistMaxNames)'), 'target whitelist refresh does not parse/cap names');
      assert(refreshBody.includes('state.names = names') && refreshBody.includes('state.nameSet = new Set(names)'), 'target whitelist success does not replace the name set');
      assert(refreshBody.includes("state.lastReason = String(reason || 'refresh') + '-failed'"), 'target whitelist failure reason is not recorded');
      assert(!/catch\s*\([^)]*\)\s*\{[\s\S]{0,600}state\.names\s*=/.test(refreshBody), 'target whitelist failure can clear names');
      assert(!/catch\s*\([^)]*\)\s*\{[\s\S]{0,600}state\.nameSet\s*=/.test(refreshBody), 'target whitelist failure can clear nameSet');
      const startBody = functionBody(text, 'startTargetWhitelistPolling');
      assert(startBody.includes("refreshTargetWhitelist('startup')"), 'target whitelist is not fetched on startup');
      assert(startBody.includes("refreshTargetWhitelist('interval')"), 'target whitelist is not refreshed by interval');
      assert(startBody.includes('cfg.targetWhitelistPollMs'), 'target whitelist polling interval config not used');
      const matcherBody = functionBody(text, 'isWhitelistedTarget');
      assert(matcherBody.includes('normalizeTargetWhitelistName(e.name)'), 'target whitelist matcher does not use username');
      assert(matcherBody.includes('bot.targetWhitelist?.nameSet?.has(name)'), 'target whitelist matcher does not use the remote name set');
      assert(!matcherBody.includes('user_id') && !matcherBody.includes('target_id') && !matcherBody.includes(' id') && !matcherBody.includes('.id'), 'target whitelist matcher still checks ids');
      assert(functionBody(whitelistSource, 'parseTargetWhitelistNames').includes('seen.has(name)'), 'target whitelist parser does not de-duplicate names');
      assert(!functionBody(whitelistSource, 'parseTargetWhitelistNames').includes('ids'), 'target whitelist parser still includes id fields');
    });
    check(`${file} reduces routine browser status logging`, () => {
      assert(/\bstatusEvery\s*:\s*Number\(config\w*\.statusEvery\)\s*===\s*0\s*\?\s*0\s*:\s*Math\.max\((?:1000|1e3),\s*Number\(config\w*\.statusEvery\)\s*\|\|\s*(?:30000|3e4)\)/.test(defaultConfigSource), 'runtime statusEvery default/disable logic not found');
      assert(text.includes('if (cfg.statusEvery > 0 && Date.now() - bot.lastStatusAt >= cfg.statusEvery)'), 'status log cannot be disabled with statusEvery=0');
    });
    check(`${file} formats display distances in meters`, () => {
      const displayFormatSource = file === 'grasp-rat-bot.js' ? sharedDisplayFormatSource : finalRuntimeText;
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(displayFormatSource.includes('function formatDistance'), 'bundled formatDistance helper not found');
        assert(displayFormatSource.includes('const meters = n / 100'), 'formatDistance does not convert cm to meters');
        assert(displayFormatSource.includes('+ "\\u7C73"'), 'formatDistance does not append meter unit');
      } else {
        const distanceBody = functionBody(displayFormatSource, 'formatDistance');
        assert(distanceBody.includes('const meters = n / 100'), 'formatDistance does not convert cm to meters');
        assert(distanceBody.includes("+ '米'"), 'formatDistance does not append meter unit');
      }
      const staminaSummaryBody = functionBody(text, 'staminaBudgetCoinLeaveSummary');
      assert(staminaSummaryBody.includes("最近金币距离' + formatDistance(detail.distance)"), 'stamina budget leave summary does not use meter distance formatting');
      const pursuitSummarySource = file === 'dist/grasp-rat-remote-bot.js'
        ? `${text}\n${finalRuntimeText}`
        : `${functionBody(text, 'pursuitLeaveSummary')}\n${finalRuntimeText}`;
      assert(
        pursuitSummarySource.includes("'，距离' + formatDistance(distance)") || pursuitSummarySource.includes('helpers.formatDistance(distance)'),
        'pursuit leave summary does not use meter distance formatting'
      );
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(!text.includes('function pursuitLeaveSummary('), 'dist remote bot still keeps pursuitLeaveSummary wrapper');
      }
    });
    check(`${file} displays relogin wait using remaining hold before original delay`, () => {
      const reloginDisplaySource = file === 'dist/grasp-rat-remote-bot.js'
        ? `${text}\n${finalRuntimeText}`
        : `${functionBody(text, 'leaveWaitDisplay')}\n${finalRuntimeText}`;
      assert(reloginDisplaySource.includes('detail?.holdRemainingMs ?? detail?.reloginDelayMs'), 'leave wait display does not prefer remaining hold time');
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(!text.includes('function leaveWaitDisplay('), 'dist remote bot still keeps leaveWaitDisplay wrapper');
        assert(!text.includes('function finalizeLeaveDisplayReason('), 'dist remote bot still keeps finalizeLeaveDisplayReason wrapper');
        assert(!text.includes('function enemyReloginHoldRemainingMs('), 'dist remote bot still keeps enemyReloginHoldRemainingMs wrapper');
        assert(!text.includes('function offlineReloginHoldRemainingMs('), 'dist remote bot still keeps offlineReloginHoldRemainingMs wrapper');
      }
    });
    check(`${file} keeps shared runtime utility helpers available`, () => {
      const runtimeUtilsSource = file === 'grasp-rat-bot.js' ? sharedRuntimeUtilsSource : text;
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(distSource.includes('var require_runtime_utils = __commonJS'), 'bundled runtime-utils module wrapper not found');
        assert(distSource.includes('safeStringify') && distSource.includes('new WeakSet()'), 'bundled safeStringify helper not found');
        assert(distSource.includes('safeJsonClone') && distSource.includes('JSON.parse(safeStringify(value))'), 'bundled safeJsonClone helper not found');
        assert(distSource.includes('sanitizeCombatLogIdPart') && distSource.includes('replace(/[^\\w.-]+/g, "_")'), 'bundled combat log id sanitizer not found');
      } else {
        assert(functionBody(runtimeUtilsSource, 'safeStringify').includes('new WeakSet()'), 'safeStringify circular guard not found');
        assert(functionBody(runtimeUtilsSource, 'safeJsonClone').includes('JSON.parse(safeStringify(value))'), 'safeJsonClone does not use safeStringify');
        assert(functionBody(runtimeUtilsSource, 'sanitizeCombatLogIdPart').includes("replace(/[^\\w.-]+/g, '_')"), 'combat log id sanitizer not found');
      }
    });
    check(`${file} keeps shared display formatting helpers available`, () => {
      const displayFormatSource = file === 'grasp-rat-bot.js' ? sharedDisplayFormatSource : finalRuntimeText;
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(distSource.includes('var require_display_format = __commonJS'), 'bundled display-format module wrapper not found');
        assert(distSource.includes('escapeHtml') && distSource.includes('&amp;'), 'bundled escapeHtml helper not found');
        assert(distSource.includes('formatDurationMs') && distSource.includes('+ "\\u5C0F\\u65F6"'), 'bundled duration formatter does not handle hours');
        assert(distSource.includes('actorLabel') && distSource.includes('actor.targetId'), 'bundled actorLabel does not include targetId fallback');
        assert(distSource.includes('hpDisplay') && distSource.includes('Math.round(n)'), 'bundled hpDisplay does not round numeric HP');
      } else {
        assert(functionBody(displayFormatSource, 'escapeHtml').includes('&amp;'), 'escapeHtml entity map not found');
        assert(functionBody(displayFormatSource, 'formatDurationMs').includes("+ '小时'"), 'duration formatter does not handle hours');
        assert(functionBody(displayFormatSource, 'actorLabel').includes('actor.targetId'), 'actorLabel does not include targetId fallback');
        assert(functionBody(displayFormatSource, 'hpDisplay').includes('Math.round(n)'), 'hpDisplay does not round numeric HP');
      }
    });
    check(`${file} keeps shared browser initialization helpers available`, () => {
      const preservedSource = file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : finalRuntimeText;
      const defaultsSource = file === 'grasp-rat-bot.js' ? sharedRuntimeDefaultsSource : finalRuntimeText;
      assert(functionBody(preservedSource, 'buildBrowserPreservedState').includes('combatRetreatIgnore instanceof Map'), 'preserved-state helper does not preserve combat retreat maps');
      assert(functionBody(preservedSource, 'buildBrowserPreservedState').includes('combatDisadvantageObservation'), 'preserved-state helper does not preserve combat disadvantage observation');
      assert(functionBody(preservedSource, 'buildBrowserPreservedState').includes('preBuffer: Array.isArray'), 'preserved-state helper does not bound combat prebuffer');
      assert(functionBody(preservedSource, 'buildBrowserPreservedState').includes('lastLoginAt: Number(previousBot?.lastLoginAt || 0) || 0'), 'preserved-state helper does not preserve lastLoginAt');
      assert(text.includes('lastLoginAt: Number(preserved.lastLoginAt || 0) || 0'), 'browser runtime does not restore preserved lastLoginAt');
      assert(functionBody(defaultsSource, 'buildRuntimeDefaults').includes('allowNativeReconnect: false'), 'runtime defaults do not keep native reconnect disabled');
      assert(functionBody(defaultsSource, 'buildRuntimeDefaults').includes('allowBotWebSocketFallback: false'), 'runtime defaults do not keep bot websocket fallback disabled');
    });
    check(`${file} disables active game API polling and keeps tick/frame gaps as offline network risk`, () => {
      assert(defaultConfigSource.includes('globalSamplingOutageOfflineEnabled: true'), 'sampling outage offline gate is not enabled by default');
      assert(defaultConfigSource.includes('globalSamplingOutageCombatOnly: true'), 'sampling outage offline gate is not combat-only by default');
      assert(expectObjectNumber(defaultConfigSource, 'globalRefreshTimeoutMs', 3000), 'global refresh timeout is not configured at 3000ms');
      assert(defaultConfigSource.includes('combatTickGapOfflineEnabled: true'), 'combat tick gap offline gate is not enabled by default');
      assert(defaultConfigSource.includes('actionSettlementStallOfflineEnabled: true'), 'action settlement stall offline gate is not enabled by default');
      assert(expectObjectNumber(defaultConfigSource, 'actionSettlementStallMs', 15000), 'action settlement stall threshold is not configured at 15000ms');
      assert(expectObjectNumber(defaultConfigSource, 'actionSettlementStallAckStaleMs', 15000), 'action settlement stale ack threshold is not configured at 15000ms');
      const refreshBody = functionBody(text, 'refreshGlobalState');
      assert(!refreshBody.includes("'/snapshot'") && !refreshBody.includes('"/snapshot"'), 'active global refresh still fetches snapshot');
      assert(!refreshBody.includes("'/minimap'") && !refreshBody.includes('"/minimap"'), 'active global refresh still fetches minimap');
      assert(refreshBody.includes("skipped: 'passive-snapshot-only-active-game-api-disabled'"), 'active global refresh does not expose disabled game API diagnostics');
      assert(refreshBody.includes('bot.globalState.minimap = null'), 'active global refresh does not clear stale minimap data');
      assert(refreshBody.includes('bot.globalState.samplingOutage = null'), 'active global refresh does not clear stale sampling outage state');
      assert(refreshBody.includes('snapshot: { ok: false, skipped: true') && refreshBody.includes('minimap: { ok: false, skipped: true'), 'active global refresh skip diagnostics do not cover both game APIs');
      const outageBody = functionBody(text, 'globalSamplingOutageOfflineState');
      assert(outageBody.includes("reason: 'global sampling outage'"), 'sampling outage offline state does not expose the canonical reason');
      assert(outageBody.includes('combatTickActiveFromState({'), 'sampling outage gate does not reuse combat activity state');
      assert(outageBody.includes('cfg.globalSamplingOutageCombatOnly && !combatActive'), 'sampling outage gate does not preserve combat-only behavior');
      assert(outageBody.includes('refreshDurationMs') && outageBody.includes('lastCombatLogBuildMs'), 'sampling outage offline state does not expose timing diagnostics');
      const gapBody = functionBody(text, 'combatTickGapOfflineState');
      assert(gapBody.includes("reason: 'combat tick gap'"), 'combat tick gap offline state does not expose the canonical reason');
      assert(gapBody.includes("'tick-reentry-gap'") && gapBody.includes("'main-loop-gap'") && gapBody.includes("'combat-log-gap-with-active-tick'"), 'combat tick gap diagnosis does not distinguish reentry, main-loop, and log-gating gaps');
      assert(gapBody.includes("'main-loop-stuck-or-awaiting-async'") && gapBody.includes("'js-or-main-loop-paused'") && gapBody.includes("'combat-state-or-log-gating-gap'"), 'combat tick gap likely cause does not distinguish stuck async, JS pause, and state/log gating');
      assert(gapBody.includes('previousCombatActive') && gapBody.includes('currentCombatActive') && gapBody.includes('combatLogActive'), 'combat tick gap state does not preserve combat-context evidence');
      assert(gapBody.includes('recentCombatFrameContext') && gapBody.includes('recentCombatContextMs'), 'combat tick gap state does not preserve recent combat-frame context after decision clearing');
      assert(gapBody.includes('liveCombatContext') && gapBody.includes('liveCombatContext && combatFrameGapMs'), 'combat frame gap can still trigger from stale recent-frame context alone');
      const reentryBody = functionBody(text, 'handleTickReentryCombatGap');
      assert(reentryBody.includes('combatTickGapOfflineState(self') && reentryBody.includes('reentry: true'), 'tick reentry gap handler does not reuse combat tick gap state');
      assert(reentryBody.includes("await leaveOffline('combat tick gap'"), 'tick reentry gap handler does not leave through combat tick gap offline path');
      const tickBody = functionBody(text, 'tick');
      assert(tickBody.includes('await handleTickReentryCombatGap(source)'), 'main tick does not evaluate reentry combat gap while a tick is already running');
      assert(tickBody.includes('const samplingOutage = globalSamplingOutageOfflineState(self)'), 'main tick does not evaluate sampling outage offline state');
      assert(tickBody.includes('const combatTickGap = combatTickGapOfflineState(self'), 'main tick does not evaluate combat tick gap offline state');
      assert(tickBody.includes('const actionSettlementStall = assessActionSettlementStall(self, bot.lastDecision)'), 'main tick does not evaluate action settlement stall state');
      assert(tickBody.includes('!bot.control.wsOpen || serverPositionStallOffline || actionSettlementStallOffline || reconnectChurn || Boolean(samplingOutage) || Boolean(combatTickGap)'), 'action settlement / sampling outage / combat tick gap is not part of the offline branch gate');
      assert(tickBody.includes('leaveDelayMs = reconnectChurn || samplingOutage || combatTickGap ? 0'), 'sampling outage / combat tick gap offline leave is not immediate');
      assert(tickBody.includes("offlineLeaveReason = samplingOutage") && tickBody.includes("'global sampling outage'"), 'sampling outage leave reason is not canonical');
      assert(tickBody.includes("? 'combat tick gap'"), 'combat tick gap leave reason is not canonical');
      assert(tickBody.includes("? 'action settlement stalled'"), 'action settlement stall leave reason is not canonical');
      assert(tickBody.includes("'control-global-sampling-outage'"), 'sampling outage wait reason is not exposed');
      assert(tickBody.includes("'control-combat-tick-gap'"), 'combat tick gap wait reason is not exposed');
      assert(tickBody.includes("'control-action-settlement-stalled'"), 'action settlement wait reason is not exposed');
      assert(text.includes('actionSettlementStall: summarizeActionSettlementStall()'), 'status does not expose action settlement stall state');
      assert(functionBody(text, 'assessActionSettlementStall').includes('lastMovementAckAgeMs'), 'action settlement stall does not check movement ack staleness');
      assert(functionBody(text, 'assessActionSettlementStall').includes('action-settlement-stalled'), 'action settlement stall does not expose the canonical reason');
      assert(text.includes('samplingOutage: this.globalState.samplingOutage || null'), 'status does not expose global sampling outage state');
      assert(text.includes('combatTickGap: this.lastCombatTickGap || null'), 'status does not expose combat tick gap state');
      assert(text.includes('lastTickGapMs: this.lastTickGapMs'), 'status does not expose last tick gap');
      assert(text.includes('lastTickReentryGapAt: this.lastTickReentryGapAt || 0'), 'status does not expose tick reentry gap timestamp');
      const offlineSummarySource = finalRuntimeText.includes('function offlineLeaveSummaryCore')
        ? finalRuntimeText
        : `${functionBody(text, 'offlineLeaveSummary')}\n${finalRuntimeText}`;
      assert(offlineSummarySource.includes('offlineSafety?.samplingOutage'), 'runtime offline leave summary does not mention sampling outage');
      assert(offlineSummarySource.includes('offlineSafety?.combatTickGap'), 'runtime offline leave summary does not mention combat tick gap');
      assert(offlineSummarySource.includes('offlineSafety?.actionSettlementStall'), 'runtime offline leave summary does not mention action settlement stall');
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(!text.includes('function offlineLeaveSummary('), 'dist remote bot still keeps offlineLeaveSummary wrapper');
      }
      const leaveOfflineBody = functionBody(text, 'leaveOffline');
      assert(
        leaveOfflineBody.includes('const summary =')
          && (
            leaveOfflineBody.includes('offlineLeaveSummary(reason, offlineSafety)')
              || leaveOfflineBody.includes('offlineLeaveSummaryForLeaveFlowCore(reason, offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel })')
              || leaveOfflineBody.includes("offlineLeaveSummaryCall('reason', 'offlineSafety')")
          ),
        'offline leave retry cooldown does not compute the current offline summary'
      );
      assert(leaveOfflineBody.includes('summary: summary || active?.summary'), 'offline leave retry cooldown can still prefer a stale active summary over the current reason');
      const offlineSuppressSource = finalRuntimeText.includes('function setOfflineLeaveSuppressCore')
        ? finalRuntimeText
        : text;
      const offlineSuppressBody = offlineSuppressSource.includes('function setOfflineLeaveSuppressCore')
        ? functionBody(offlineSuppressSource, 'setOfflineLeaveSuppressCore')
        : functionBody(offlineSuppressSource, 'setOfflineLeaveSuppress');
      assert(
        offlineSuppressBody.includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now()))')
          || offlineSuppressBody.includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > now))'),
        'ordinary unsafe offline exits still require a defensive relogin delay'
      );
      assert(text.includes('function combatLogRuntimeSummary'), 'combat log runtime diagnostic summary not found');
      assert(text.includes('runtime: combatLogRuntimeSummary'), 'exit audit logs do not include runtime diagnostics');
      assert(functionBody(text, 'buildCombatLogEntry').includes('const runtime = combatLogRuntimeSummary(entryAt, decision || {})'), 'combat frames do not compute runtime diagnostics');
      assert(functionBody(text, 'buildCombatLogEntry').includes('bot.combatLogging.lastBuiltFrameAt = entryAt'), 'combat frames do not record built-frame timestamps');
      assert(functionBody(text, 'combatLogRuntimeSummary').includes('reentryGapOverThreshold'), 'combat log runtime diagnostics do not expose tick reentry gaps');
      assert(functionBody(text, 'combatLogRuntimeSummary').includes('recordedDiagnosis'), 'combat log runtime diagnostics do not preserve the triggering combat tick gap diagnosis');
      assert(functionBody(text, 'combatLogRuntimeSummary').includes('recentCombatFrameContext'), 'combat log runtime diagnostics do not expose recent combat-frame context');
      assert(functionBody(text, 'combatLogRuntimeSummary').includes('lastRefreshSummary'), 'combat log runtime diagnostics do not expose refresh timing');
      assert(functionBody(text, 'combatLogRuntimeSummary').includes('lastTickDurationMs') && functionBody(text, 'combatLogRuntimeSummary').includes('lastCombatLogRecordMs'), 'combat log runtime diagnostics do not expose tick/log timing');
      assert(functionBody(text, 'recordCombatLogTick').includes('buildTimedCombatLogEntry'), 'combat log frame builds are not timed');
      assert(functionBody(text, 'queueCombatLogEntry').includes("queued.type === 'combat-frame'"), 'combat frame queue timestamps are not tracked');
    });
    check(`${file} sends movement and shots through the native page WebSocket`, () => {
      assert(defaultConfigSource.includes('directWsControlEnabled: true'), 'direct WebSocket control is not enabled by default');
      assert(defaultConfigSource.includes('directWsServerMarkerProbe: false'), 'server-marker probe must be disabled by default');
      assert(text.includes('function sendDirectNativeVelocity'), 'direct WebSocket velocity sender not found');
      assert(text.includes('function scheduleDirectVelocityRepeat'), 'direct WebSocket velocity repeat scheduler not found');
      const directVelocityBody = functionBody(text, 'sendDirectNativeVelocity');
      const nativeVelocityBody = functionBody(text, 'sendNativeVelocity');
      assert(directVelocityBody.includes('if (!cfg.directWsServerMarkerProbe)'), 'direct velocity does not guard normal key sync behind probe mode');
      assert(directVelocityBody.includes('setNativeKeys(native.state, dx, dy)'), 'direct WebSocket velocity no longer keeps local page prediction in sync');
      const directSendIndex = nativeVelocityBody.indexOf('if (sendDirectNativeVelocity(dx, dy, force)) return true');
      const fallbackKeySyncIndex = nativeVelocityBody.indexOf('setNativeKeys(native.state, dx, dy)');
      assert(directSendIndex !== -1, 'native velocity does not prefer direct WebSocket sends');
      assert(fallbackKeySyncIndex === -1 || fallbackKeySyncIndex > directSendIndex, 'native velocity syncs local keys before direct WebSocket send');
      assert(functionBody(text, 'safeSendVelocity').includes('scheduleDirectVelocityRepeat(dx, dy, force)'), 'safe velocity path does not schedule direct repeat sends');
      assert(functionBody(text, 'stopMotionSafely').includes('scheduleDirectVelocityRepeat(0, 0, true)'), 'stop path does not repeat direct zero velocity');
      assert(functionBody(text, 'cancelVelocityStopTimer').includes('cancelDirectVelocityRepeat()'), 'precision/stop cleanup does not cancel direct repeat sends');
      assert(functionBody(text, 'sendNativeShoot').includes("native.ws.send('shoot '"), 'shooting does not prefer direct native WebSocket sends');
      assert(functionBody(text, 'summarizeControl').includes('directWsControl: Boolean(cfg.directWsControlEnabled)'), 'control status does not expose direct WebSocket control');
      assert(functionBody(text, 'summarizeControl').includes('directWsServerMarkerProbe: Boolean(cfg.directWsServerMarkerProbe)'), 'control status does not expose server-marker probe mode');
    });
    check(`${file} freezes session uptime while self is missing`, () => {
      const sessionBody = functionBody(text, 'summarizeSessionStats');
      assert(sessionBody.includes('const stoppedAt = Number(session.missingSince || 0) || 0'), 'session stopped-at marker not used');
      assert(sessionBody.includes('uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0'), 'session uptime does not freeze at missingSince');
      assert(sessionBody.includes('uptimeStoppedAt: stoppedAt'), 'session uptime stopped-at status is not exposed');
    });
    check(`${file} records incidental native coin pickups in session stats`, () => {
      assert(text.includes('lastNativeCoinSnapshot'), 'native coin pickup snapshot state not found');
      assert(text.includes('function nativeCoinSnapshot') || text.includes('buildNativeCoinSnapshotCore'), 'native coin snapshot helper/core not found');
      assert(text.includes('function recordIncidentalCoinPickups'), 'incidental coin pickup recorder not found');
      const incidentalBody = functionBody(text, 'recordIncidentalCoinPickups');
      assert(incidentalBody.includes('nativeCoinSnapshot()') || incidentalBody.includes('buildNativeCoinSnapshotCore(') || incidentalBody.includes('nativeCoinSnapshotCall(options)'), 'incidental pickup recorder does not read native coin state');
      assert(incidentalBody.includes('pickIncidentalCoinPickupsCore('), 'incidental pickup recorder does not use strategy core');
      assert(incidentalBody.includes('previousSnapshot') && incidentalBody.includes('currentSnapshot'), 'incidental pickup recorder does not compare disappeared coins');
      assert(text.includes('pointToSegmentDistanceCore'), 'incidental pickup movement path core not found');
      assert(incidentalBody.includes("'incidental-coin-disappeared'"), 'incidental pickup reason not recorded');
      assert(incidentalBody.includes('rememberNativeCoinSnapshot(currentSnapshot)') || incidentalBody.includes('const rememberedSnapshot = currentSnapshot') || incidentalBody.includes("rememberNativeCoinSnapshotCall('currentSnapshot'"), 'incidental pickup recorder does not refresh native snapshot');
      const markCoinBody = functionBody(text, 'markCoinCollected');
      assert(markCoinBody.includes('rememberNativeCoinSnapshot();') || markCoinBody.includes('const rememberedSnapshot = null') || markCoinBody.includes("rememberNativeCoinSnapshotCall('null'"), 'tracked pickup path does not refresh native snapshot');
      const preservedBody = functionBody(file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : finalRuntimeText, 'buildBrowserPreservedState');
      assert(preservedBody.includes('lastNativeCoinSnapshot'), 'preserved-state helper does not preserve native coin snapshots');
      const tickBody = functionBody(text, 'tick');
      assert(tickBody.includes('coinMarked = markCoinCollected(self, currentSummary, previousCoins)'), 'tick does not record tracked coin pickups first');
      assert(tickBody.includes('coinMarked = recordIncidentalCoinPickups(self, currentSummary, bot.lastSelf, previousCoins)'), 'tick does not record incidental coin pickups');
      assert(tickBody.includes('rememberNativeCoinSnapshot();') || tickBody.includes('const rememberedSnapshot = null') || tickBody.includes("rememberNativeCoinSnapshotCall('null'"), 'tick does not seed native coin snapshots without previous self');
    });
    check(`${file} limits ordinary profit to realtime/native visible state`, () => {
      const classifyBody = functionBody(text, 'classify');
      const chooseBody = functionBody(text, 'chooseAction');
      assert(text.includes('function pickRealtimeLocalCoin'), 'realtime local coin picker not found');
      assert(text.includes('.filter(coin => !isSnapshotOnlyCoin(coin))'), 'realtime local coin picker can include snapshot-only coins');
      assert(classifyBody.includes('const realtimeCoins = allCoins.filter(c => !isSnapshotOnlyCoin(c))'), 'classification does not split realtime coins');
      assert(classifyBody.includes('const realtimeEntities = attackableEntities.filter(e => e.native && !e.minimapOnly)'), 'classification does not split realtime/native entities');
      assert(classifyBody.includes('const realtimeGlobalTargets = realtimeEntities'), 'classification does not split realtime AFK targets');
      assert(classifyBody.includes('.filter(e => e.native)'), 'combat targets can still include snapshot-only entities');
      assert(chooseBody.includes('const nearCoin = pickCoin(self, realtimeNearCoins'), 'near coin priority is not limited to realtime coins');
      assert(
        chooseBody.includes('pickPostAttackDropCoin(self, realtimeCoins')
          || text.includes('pickPostAttackDropCoin(self, realtimeCoins')
          || (file === 'grasp-rat-bot.js' && chooseActionSourceModule.includes("pickPostAttackDropCoinCall('self', 'realtimeCoins', 'coinThreats', 'entities'"))
          || (chooseBody.includes('safeCoinCandidates(realtimeCoins, coinThreats') && chooseBody.includes('pickPostAttackDropCoinCore(bot.attackHistory')),
        'post-attack pickup is not limited to realtime coins'
      );
      assert(chooseBody.includes('{ coins: realtimeGlobalCoins, maxDistance: cfg.globalCoinMaxDistance }'), 'normal opportunity coin pool is not limited to realtime coins');
      assert(chooseBody.includes('realtimeGlobalTargets.filter(isAfkProfitTarget)'), 'normal AFK opportunity pool is not limited to realtime targets');
      const visibleOpportunityIndex = chooseBody.indexOf('const opportunity = typeof pickBestOpportunityCore');
      const distantCoinIndex = chooseBody.indexOf('const distantCoin = pickDistantCoin(self, realtimeCoins');
      const localRealtimeIndex = chooseBody.indexOf('if (localRealtimeCoin) {');
      const shotWaitIndex = chooseBody.indexOf('const shotWait = buildOpportunisticShotWait(self, realtimeEntities');
      const snapshotCoinIndex = chooseBody.indexOf('const snapshotCoin = pickSnapshotCoinDestination(self, snapshotCoins');
      const snapshotOpportunityIndex = chooseBody.indexOf('const snapshotOpportunity = pickBestOpportunity(');
      assert(visibleOpportunityIndex >= 0, 'visible opportunity selection not found');
      assert(distantCoinIndex > visibleOpportunityIndex, 'distant realtime coin is not after visible opportunities');
      assert(localRealtimeIndex > distantCoinIndex, 'local realtime coin fallback is not after distant realtime coin');
      assert(shotWaitIndex > localRealtimeIndex, 'visible opportunistic AFK shot wait is not after realtime profit paths');
      assert(snapshotCoinIndex === -1, 'ordinary profit still has a snapshot coin fallback');
      assert(snapshotOpportunityIndex === -1, 'ordinary profit still has a snapshot/minimap opportunity fallback');
      assert(!chooseBody.includes('{ disableMissingHold: true }'), 'ordinary profit still carries the old snapshot fallback missing-hold bypass');
    });
    check(`${file} prices player drops with full pickup travel cost`, () => {
      const body = functionBody(text, 'opportunityEnemyStaminaCost');
      assert(body.includes('const moveCost = opportunityMoveStaminaCost(target?.distance, 0)'), 'enemy opportunity movement cost still stops at shooting range');
      assert(body.includes('estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500))'), 'enemy opportunity shooting cost missing');
    });
    check(`${file} plans bounded native visible coin routes inside opportunity scoring`, () => {
      const routeCoreSource = file === 'grasp-rat-bot.js' ? strategyCoinRouteSource : finalRuntimeText;
      const routeCoreBody = functionBody(routeCoreSource, 'pickCoinRouteOpportunityCore');
      const bestBody = file === 'grasp-rat-bot.js' ? functionBody(text, 'bestCoinOpportunityScore') : '';
      const pickBody = file === 'grasp-rat-bot.js' ? functionBody(text, 'pickBestOpportunity') : '';
      const pickCoreSource = file === 'grasp-rat-bot.js' ? strategyOpportunityPickSource : finalRuntimeText;
      const pickCoreBody = functionBody(pickCoreSource, 'pickBestOpportunityCore');
      const opportunityCandidateCoreSource = file === 'grasp-rat-bot.js' ? strategyOpportunityCandidatesSource : finalRuntimeText;
      const coinCandidateBody = functionBody(opportunityCandidateCoreSource, 'buildCoinOpportunityCandidatesCore');
      assert(strategyCoinRouteSource.includes('function pickCoinRouteOpportunityCore'), 'strategy coin route planner core not found');
      assert(strategyCoinRouteSource.includes('function buildCoinRouteFromAnchorCore'), 'strategy coin route builder core not found');
      assert(strategyCoinRouteSource.includes('function coinRouteLegClearCore'), 'strategy coin route leg safety core not found');
      assert(text.includes('function currentHeldCoinChoice'), 'coin route held single-coin choice helper not found');
      assert(text.includes('function currentHeldCoinRouteChoice'), 'coin route held-choice stabilizer not found');
      assert(routeCoreSource.includes('function coinRoutePoints'), 'coin route point metadata helper not found');
      assert(text.includes('best-opportunity-coin-route'), 'coin route decision reason not found');
      assert(routeCoreSource.includes('points: coinRoutePoints(bestRoute)'), 'coin route action metadata does not expose route points');
      assert(routeCoreBody.includes('.filter(coin => !isSnapshotOnlyCoin(coin))') || routeCoreBody.includes('.filter((coin) => !isSnapshotOnlyCoin(coin))'), 'coin route planner can include snapshot-only coins');
      assert(text.includes('poolLimit: cfg.coinRoutePoolLimit') || routeCoreBody.includes('options.poolLimit'), 'coin route planner is not pool bounded');
      assert(text.includes('anchorLimit: cfg.coinRouteAnchorLimit') || routeCoreBody.includes('options.anchorLimit'), 'coin route planner is not anchor bounded');
      assert(routeCoreBody.includes('coinRouteLegClearCore(self, anchor, activeThreats, options)'), 'coin route planner does not safety-check first leg');
      assert(routeCoreBody.includes('coinRouteSkipsCloserFirstCoinCore(self, route, candidates, options)'), 'coin route planner can skip much closer local coins');
      assert(text.includes('heldChoice: currentHeldCoinChoice()') || text.includes('heldChoice: currentHeldCoinChoice(),') || text.includes('heldChoice: currentHeldCoinChoice()'), 'coin route direct call does not pass held single-coin choice');
      assert(text.includes('heldRouteChoice: currentHeldCoinRouteChoice()'), 'coin route direct call does not pass held route choice');
      assert(routeCoreBody.includes('coinRouteSkipsHeldSingleCoinCore(self, route, heldChoice, options)'), 'coin route planner can skip the held nearby single coin');
      assert(routeCoreBody.includes('heldCoinRouteBeatsSwitchCore(heldRoute, best, options)'), 'coin route planner does not stabilize held route first coin');
      if (file === 'grasp-rat-bot.js') {
        assert(text.includes('function pickCoinRouteOpportunity'), 'local coin route planner wrapper not found');
        assert(text.includes('function coinRouteLegClear'), 'local coin route leg safety checker not found');
        assert(text.includes('function coinRouteSkipsCloserFirstCoin'), 'local coin route closer-first guard not found');
        assert(text.includes('function coinRouteSkipsHeldSingleCoin'), 'local coin route held single-coin skip guard not found');
        assert(text.includes('function heldCoinRouteBeatsSwitch'), 'local coin route switch hysteresis helper not found');
        assert(bestBody.includes('pickCoinRouteOpportunity') && bestBody.includes('bestCoinOpportunityScoreCore'), 'profitable combat comparison does not include coin route score');
      } else {
        for (const wrapperName of [
          'coinRouteLegStaminaCost',
          'coinRouteLegClear',
          'coinRoutePointLimit',
          'coinRouteSummary',
          'buildCoinRouteFromAnchor',
          'coinRouteSkipsCloserFirstCoin',
          'coinRouteSkipsHeldSingleCoin',
          'coinRouteMatchesHeldChoice',
          'heldCoinRouteBeatsSwitch',
          'pickCoinRouteOpportunity'
        ]) {
          assert(!text.includes(`function ${wrapperName}(`), `generated runtime still declares unused ${wrapperName} wrapper`);
          assert(!finalRuntimeText.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
        }
        assert(text.includes('pickCoinRouteOpportunityCore(self, uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey }), activeThreats, {'), 'generated profitable combat comparison does not call coin route core directly');
        assert(text.includes('pickCoinRouteOpportunityCore(routeSelf, routeCoins, routeThreats, {'), 'generated opportunity pick option does not bind coin route core directly');
        assert(finalRuntimeText.includes('pickCoinRouteOpportunityCore(self, uniqueVisibleRouteCoinsCore(coinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey }), activeThreats, {'), 'bundled dist profitable combat comparison does not call coin route core directly');
        assert(finalRuntimeText.includes('pickCoinRouteOpportunityCore(routeSelf, routeCoins, routeThreats, {'), 'bundled dist opportunity pick option does not bind coin route core directly');
        for (const wrapperName of ['uniqueVisibleRouteCoins', 'bestCoinOpportunityScore']) {
          assert(!text.includes(`function ${wrapperName}(`), `generated runtime still declares unused ${wrapperName} wrapper`);
          assert(!finalRuntimeText.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
        }
      }
      assert(pickBody.includes('pickCoinRouteOpportunity') || pickCoreBody.includes('pickCoinRouteOpportunity'), 'visible opportunity selection does not include coin route');
      assert(pickBody.includes('buildOpportunityCandidatesCore') || pickCoreBody.includes('buildOpportunityCandidatesCore'), 'visible opportunity selection does not use opportunity candidate core');
      if (file !== 'grasp-rat-bot.js') {
        assert(text.includes('pickBestOpportunityCore(self, coinThreats, opportunityCoinGroups, opportunityEnemyGroups'), 'bundled visible opportunity selection does not call opportunity pick core directly');
      }
      assert(coinCandidateBody.includes('mergeCoinRouteDisplayCore(previous, routeCoin)'), 'same-first-coin route metadata is not preserved for overlay display');
      assert(coinCandidateBody.includes('routeHeld: Boolean(coin.routeHeld)'), 'coin route held metadata is not propagated to opportunity choice');
      assert(coinCandidateBody.includes("actionKind = Number(coin.distance || Infinity) <= Number(options.maxCoinDistance") && coinCandidateBody.includes('seek-coin'), 'coin route action kind does not preserve coin/seek-coin split');
    });
    check(`${file} lets high-value combat drops interrupt recovery`, () => {
      const body = file === 'grasp-rat-bot.js' ? functionBody(text, 'pickPostAttackDropCoin') : functionBody(text, 'chooseAction');
      const coinCoreSource = file === 'grasp-rat-bot.js' ? strategyPostAttackDropSource : finalRuntimeText;
      assert(body.includes('options.maxDistance ?? cfg.postAttackDropCoinMaxDistance'), 'post-attack drop picker does not accept maxDistance override');
      assert(body.includes('options.minScore ?? 0'), 'post-attack drop picker does not accept minScore override');
      assert(body.includes('if (score < minScore) continue') || coinCoreSource.includes('if (score < minScore) continue'), 'post-attack drop picker does not filter by recovery ROI score');
      assert(text.includes('maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance'), 'recovery post-attack drop max distance not wired');
      assert(text.includes('minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0'), 'recovery post-attack drop min score not wired');
    });
    check(`${file} locks oscillating opportunity target pairs`, () => {
      const body = functionBody(strategyOpportunityChoiceSource, 'applyOpportunityOscillationLockCore');
      const choiceMetadataSource = file === 'grasp-rat-bot.js' ? strategyOpportunityChoiceSource : finalRuntimeText;
      assert(text.includes('oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit'), 'oscillation lock limit config not used');
      assert(body.includes('switchCount > limit'), 'oscillation lock does not wait until the switch limit is exceeded');
      assert(body.includes('lockedKey: fromKey'), 'oscillation lock does not pin the current target');
      assert(text.includes('resetOpportunitySwitchLock()'), 'opportunity switch lock reset helper not found');
      assert(choiceMetadataSource.includes('oscillationLocked: Boolean'), 'opportunity choice does not expose oscillation lock state');
    });
    check(`${file} waits at killed high-drop target position before drop refresh`, () => {
      const body = file === 'grasp-rat-bot.js' ? functionBody(text, 'pickPostAttackDropWaitTarget') : functionBody(text, 'chooseAction');
      const waitCoreSource = file === 'grasp-rat-bot.js' ? strategyPostAttackDropSource : finalRuntimeText;
      assert(body.includes('cfg.postAttackDropWaitMs'), 'post-attack wait window not used');
      assert(body.includes('cfg.postAttackDropResolveMaxMs'), 'post-attack wait resolve window not used');
      assert(body.includes('cfg.postAttackDropWaitMinDrop'), 'post-attack wait minimum drop not used');
      assert(body.includes('postAttackDropResolvedAt'), 'post-attack wait is not anchored to target resolution');
      assert(body.includes('postAttackVisibleCoinExists') || body.includes('pickPostAttackDropWaitTargetCore') || waitCoreSource.includes('postAttackVisibleCoinExistsCore'), 'post-attack wait does not skip already-visible drops');
      const waitCoreHasAttackAction = (waitCoreSource.includes("item.action === 'attack'") || waitCoreSource.includes('item.action === "attack"'))
        && (waitCoreSource.includes("item.action === 'opportunistic-shot'") || waitCoreSource.includes('item.action === "opportunistic-shot"'));
      assert((body.includes("item.action === 'attack'") && body.includes("item.action === 'opportunistic-shot'"))
        || body.includes('pickPostAttackDropWaitTargetCore')
        || waitCoreHasAttackAction,
      'post-attack wait can trigger without a recent shot/attack');
      assert(body.includes('postAttackDropResolvedAt') || body.includes('!recentAttackTargetStillAttackable') || body.includes("!(entities || []).some(e => String(e.user_id ?? e.id ?? '') === String(item.id) && isAlive(e))"), 'post-attack wait does not require target resolution');
      assert(text.includes("reason: 'post-attack-drop-wait-position'"), 'post-attack wait action reason not found');
      const actionBody = functionBody(text, 'buildPostAttackDropWaitAction');
      assert(!actionBody.includes('\n      target: {'), 'post-attack wait should move without selecting a decision target');
      assert(actionBody.includes('postAttackTarget'), 'post-attack wait should keep metadata for the killed target position');
    });
    check(`${file} keeps post-login zoom-out scheduling flow`, () => {
      const preservedSource = file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : finalRuntimeText;
      assert(preservedSource.includes('postLoginZoom: previousBot?.postLoginZoom'), 'post-login zoom state is not preserved across bot updates');
      assert(text.includes('armed: preserved.postLoginZoom ? Boolean(preserved.postLoginZoom.armed) : true'), 'post-login zoom armed state does not reuse preserved state');
      assert(text.includes("appliedKey: String(preserved.postLoginZoom?.appliedKey || '')"), 'post-login zoom applied key is not preserved');
      assert(text.includes("scheduledKey: String(preserved.postLoginZoom?.scheduledKey || '')"), 'post-login zoom scheduled key is not preserved');
      const keyBody = functionBody(text, 'postLoginZoomSessionKey');
      assert(keyBody.includes("return String(userId) + ':token:' + String(token).slice(0, 24)"), 'token-based zoom session key not found');
      assert(keyBody.includes("return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0)"), 'generation-based zoom session key not found');

      const unavailableBody = functionBody(text, 'noteSelfUnavailableForPostLoginZoom');
      assert(unavailableBody.includes('cfg.postLoginZoomArmMissingMs'), 'missing-self arm delay config not used');
      assert(unavailableBody.includes('state.generation = Number(state.generation || 0) + 1'), 'zoom generation increment not found');
      assert(unavailableBody.includes('state.armed = true'), 'zoom re-arm state not found');
      assert(unavailableBody.includes("state.scheduledKey = ''"), 'scheduled key reset not found');

      const scheduleBody = functionBody(text, 'schedulePostLoginZoomOut');
      assert(scheduleBody.includes('state.lastSeenSelfAt = t'), 'last seen self timestamp not updated');
      assert(scheduleBody.includes('state.missingSince = 0'), 'missing-self timer not cleared on self detection');
      assert(scheduleBody.includes('cfg.postLoginZoomOutClicks'), 'fallback zoom click count config not used');
      assert(scheduleBody.includes('postLoginZoomFitBounds()'), 'zoom fit bounds are not recorded');
      assert(scheduleBody.includes('postLoginZoomTargetRadiusCm()'), 'zoom target radius is not recorded');
      assert(scheduleBody.includes("mode: 'fit-visible-range'"), 'post-login zoom does not run in visible-range fit mode');
      assert(scheduleBody.includes('if (!state.armed) return null'), 'zoom armed guard not found');
      assert(scheduleBody.includes('state.appliedKey === key || state.scheduledKey === key'), 'duplicate session zoom guard not found');
      assert(scheduleBody.includes('state.armed = false'), 'zoom not disarmed after scheduling');
      assert(scheduleBody.includes('fallbackRequestedClicks: clicks'), 'fallback click count not recorded');
      assert(scheduleBody.includes('cfg.postLoginZoomStartDelayMs'), 'zoom start delay config not used');
      assert(scheduleBody.includes('requestNativeViewportResize'), 'zoom scheduling does not request native viewport resize');
      assert(scheduleBody.includes('schedulePostLoginZoomFitStep(selfSummary, 0, state.lastResult.startDelayMs)'), 'zoom fit loop is not scheduled');

      const measureBody = functionBody(text, 'postLoginZoomFitMeasurement');
      assert(measureBody.includes('postLoginZoomTargetRadiusCm()'), 'fit measurement does not use configured blue-circle radius');
      assert(measureBody.includes('circleRadiusPx = radiusCm / units'), 'fit measurement does not convert circle radius to pixels');
      assert(measureBody.includes('availablePx') && measureBody.includes('fitRatio'), 'fit measurement does not compare circle radius with available viewport room');
      const decisionBody = functionBody(text, 'postLoginZoomFitDecision');
      assert(decisionBody.includes("ratio > maxRatio") && decisionBody.includes("direction: 'out'"), 'fit decision does not zoom out when the blue circle is clipped');
      assert(decisionBody.includes("reason: 'visible-range-fit'"), 'fit decision does not finish once the visible range fits');
      assert(!decisionBody.includes("direction: 'in'") && !decisionBody.includes('circle-too-small'), 'fit decision must not zoom back in after the visible range fits');
      const wheelBody = functionBody(text, 'dispatchPostLoginZoomWheel');
      assert(wheelBody.includes("new WheelEvent('wheel'"), 'post-login zoom does not use wheel events for fine adjustment');
      assert(wheelBody.includes('cfg.postLoginZoomWheelDeltaY'), 'wheel delta config not used');
      const stepBody = functionBody(text, 'schedulePostLoginZoomFitStep');
      assert(stepBody.includes('cfg.postLoginZoomFitMaxSteps'), 'fit loop max-step config not used');
      assert(stepBody.includes('postLoginZoomStepImproved(before, after, decision.direction)'), 'fit loop does not verify wheel progress');
      assert(stepBody.includes('clickZoomControl(decision.direction)'), 'fit loop does not fall back to native zoom buttons');
      assert(stepBody.includes('latest.wheelSteps') && stepBody.includes('current.completedClicks'), 'zoom fit result counters not updated');
      const improvedBody = functionBody(text, 'postLoginZoomStepImproved');
      assert(improvedBody.includes("String(direction || 'out') !== 'in'") && !improvedBody.includes('afterRatio >= beforeRatio'), 'zoom progress check should only accept zoom-out progress');

      const findBody = functionBody(text, 'findZoomControl');
      assert(findBody.includes('#zoomOutBtn') && findBody.includes('[data-testid="zoom-out"]'), 'native zoom-out selectors not found');
      assert(findBody.includes('#zoomInBtn') && findBody.includes('[data-testid="zoom-in"]'), 'native zoom-in selectors not found');
      assert(findBody.includes('缩小') && findBody.includes('放大'), 'localized zoom text fallback not found');
      const clickBody = functionBody(text, 'clickZoomControl');
      assert(clickBody.includes('control.click()'), 'zoom control click not found');
      assert(text.includes('function findZoomControl'), 'bidirectional native zoom control helper not found');
      assert(text.includes('postLoginZoom: this.postLoginZoom'), 'status does not expose postLoginZoom state');
    });
    check(`${file} ignores join-mode-only Active for defensive combat`, () => {
      const expectedMin = 1;
      assert(
        countMatches(text, /const isJoinModeActive = e => e\?\.current_join_mode === 'Active' \|\| e\?\.mode === 'Active';/g) >= expectedMin,
        'join-mode Active helper not found'
      );
      assert(
        countMatches(text, /const isAfkTarget = e => !recentlyActionedForAfk\(e\) && !isJoinModeActive\(e\) && !is(?:Currently)?Active\(e\) && !isMovingThreat\(e\);/g) >= expectedMin,
        'AFK target filter does not exclude recent activity or join-mode Active'
      );
      assert(
        countMatches(text, /const isAfkProfitTarget = e => !recentlyActionedForAfk\(e\) && \(isAfkTarget\(e\) \|\| \(isJoinModeActive\(e\) && !is(?:Currently)?Active\(e\) && !isMovingThreat\(e\) && !isFiringEntity\(e\)\)\);/g) >= expectedMin,
        'recent-activity gated passive Active profit target helper not found'
      );
      assert(
        countMatches(text, /function recentlyActionedForAfk\(e\)/g) >= expectedMin
          && countMatches(text, /cfg\.afkRecentActivityCooldownMs/g) >= expectedMin
          && countMatches(text, /recentActivityAgeMs/g) >= expectedMin,
        'AFK recent activity cooldown helper not found'
      );
      assert(
        countMatches(text, /if \(isJoinModeActive\(target\)\) return true;/g) === 0,
        'join-mode-only Active can still force defensive combat'
      );
      assert(
        countMatches(text, /if \(isFiringEntity\(target\)\) return true;/g) >= expectedMin,
        'defensive combat target no longer accepts firing targets'
      );
      assert(
        countMatches(text, /if \(is(?:Currently)?Active\(target\)\) return true;/g) >= expectedMin,
        'defensive combat target no longer accepts real active targets'
      );
      assert(
        countMatches(text, /\+ \(isJoinModeActive\(target\) \? [0-9]+ : 0\)/g) >= expectedMin,
        'combat target priority does not include join-mode Active'
      );
      assert(
        countMatches(text, /function isProfitableCombatTarget\(self, target\)/g) >= expectedMin
          && countMatches(text, /Number\(target\.drop \|\| 0\) > lowValueActiveDropMax\(\)/g) >= expectedMin
          && countMatches(text, /proactiveActiveCombatStaminaAffordable\(self\)/g) >= expectedMin,
        'profitable combat can still select low-value, passive, or long-stamina-unaffordable Active targets'
      );
      assert(
        countMatches(text, /filter\(isAfkProfitTarget\)/g) >= expectedMin,
        'ordinary profit opportunities do not include passive Active targets'
      );
    });
    check(`${file} protects held high-value coins from AFK drop target switches`, () => {
      const choiceMetadataSource = file === 'grasp-rat-bot.js' ? strategyOpportunityChoiceSource : finalRuntimeText;
      assert(strategyOpportunityChoiceSource.includes('function isHighValueCoinOpportunityCore'), 'high-value opportunity core not found');
      assert(strategyOpportunityChoiceSource.includes('function highValueCoinHoldBlocksEnemySwitchCore'), 'high-value coin hold switch blocker core not found');
      if (file !== 'grasp-rat-bot.js') {
        assert(finalRuntimeText.includes('function highValueCoinHoldBlocksEnemySwitchCore'), 'bundled runtime does not contain high-value coin hold switch blocker core');
        assert(!text.includes('function isHighValueCoinOpportunity(item)'), 'bundled runtime still declares unused high-value opportunity wrapper');
        assert(!text.includes('function highValueCoinHoldBlocksEnemySwitch(held, best)'), 'bundled runtime still declares unused high-value switch blocker wrapper');
      }
      assert(strategyOpportunityChoiceSource.includes("isHighValueCoinOpportunityCore(held, options) && String(best?.type || '') === 'enemy'"), 'high-value hold does not specifically block enemy switches');
      assert(text.includes('highValueCoinHold: true') || strategyOpportunityChoiceSource.includes('highValueCoinHold: true'), 'held high-value coin decision marker not found');
      assert(text.includes('opportunityChoice.highValueCoinHold') || choiceMetadataSource.includes('highValueCoinHold: Boolean(item.highValueCoinHold)'), 'high-value hold metadata is not exposed');
    });
	    check(`${file} ends combat logs on relogin wait/manual states`, () => {
	      const body = functionBody(text, 'combatLogSuspendReason');
	      assert(body.includes('login-suppressed'), 'login-suppressed suspend reason not found');
	      assert(body.includes('login-snapshot-gate'), 'login-snapshot-gate suspend reason not found');
	      assert(body.includes('manual-login'), 'manual-login suspend reason not found');
    });
    check(`${file} keeps specific exit reason during leave cooldown`, () => {
      const body = file === 'grasp-rat-bot.js'
        ? readText('src/shared/exit-summary.js')
        : functionBody(finalRuntimeText, 'combatLogExitSummaryFromDecision');
      assert(body.includes("leaveReason !== 'cooldown'") || body.includes('leaveReason !== "cooldown"'), 'cooldown leave detail can override specific exit reason');
      assert(body.includes('exitishDecisionReason'), 'decision exit reason fallback not found for cooldown leave detail');
      assert(body.includes('control-(?:ws|global|combat|action)'), 'control outage decision reasons are not all treated as exit summaries');
      assert(body.includes("pendingExit ? 'pending-exit-active'") || body.includes('pendingExit ? "pending-exit-active"'), 'pending exit fallback not found for active pending exit frames');
      assert(body.includes('safeReloginAllowed: Boolean(detail.safeReloginAllowed || decision?.safeReloginAllowed)'), 'safe relogin marker not included in top-level exit summary');
      assert(body.includes('offlineSafety: detail.offlineSafety || decision?.offlineSafety || null'), 'offline safety not included in top-level exit summary');
    });
    check(`${file} keeps longest exit suppress delay`, () => {
      const confirmedSource = finalRuntimeText.includes('function setExitReloginSuppressCore')
        ? finalRuntimeText
        : (exitReloginRuntimeModule.includes('function setExitReloginSuppressCore') ? exitReloginRuntimeModule : text);
      const confirmedBody = confirmedSource.includes('function setExitReloginSuppressCore')
        ? functionBody(confirmedSource, 'setExitReloginSuppressCore')
        : functionBody(confirmedSource, 'setExitReloginSuppress');
      assert(
        confirmedBody.includes('const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'confirmed exit suppress does not take max(delay, minimum)'
      );
      const pendingSource = finalRuntimeText.includes('function primePendingUnsafeExitLoginSuppressCore')
        ? finalRuntimeText
        : text;
      const pendingBody = pendingSource.includes('function primePendingUnsafeExitLoginSuppressCore')
        ? functionBody(pendingSource, 'primePendingUnsafeExitLoginSuppressCore')
        : functionBody(pendingSource, 'primePendingUnsafeExitLoginSuppress');
      assert(
        pendingBody.includes('Math.max(Number(')
          && pendingBody.includes('delayMs || 0')
          && pendingBody.includes('minimumDelayMs'),
        'pending unsafe exit suppress does not take max(delay, minimum)'
      );
      assert(
        confirmedBody.includes('detail.defensiveReloginDelaySkipped = true'),
        'zero defensive relogin delay path is not recorded'
      );
    });
    check(`${file} records exit audit events and blocks login/reload until flushed`, () => {
      const auditTriggerSource = `${text}\n${finalRuntimeText}`;
      assert(text.includes('EXIT_AUDIT_PENDING_LOGS_KEY'), 'exit audit persistence key not found');
      assert(text.includes("type: 'exit-audit'"), 'exit audit event type not found');
      assert(
        auditTriggerSource.includes('recordExitAuditEvent')
          && auditTriggerSource.includes('exit-trigger'),
        'exit trigger audit event not recorded'
      );
      assert(text.includes("recordExitAuditEvent('leave-request'"), 'leave request audit event not recorded');
      assert(text.includes("recordExitAuditEvent('exit-confirmed'"), 'exit confirmation audit event not recorded');
      const queueBody = functionBody(text, 'queueCombatLogEntry');
      assert(queueBody.includes('const critical = Boolean(options.critical || snapshot.exitAuditLogId)'), 'critical exit audit queue marker not found');
      assert(
        queueBody.includes('(!state.enabled && !critical && !important)')
          || queueBody.includes('(!state.enabled && !critical)'),
        'critical exit audit logs still depend on combat logging enabled'
      );
      assert(queueBody.includes('persistExitAuditLogEntry(queued)'), 'critical exit audit logs are not persisted before flush');
      const pendingIdsBody = functionBody(text, 'pendingExitAuditLogIds');
      assert(pendingIdsBody.includes('if (!state.endpoint) return []'), 'unconfigured log endpoint can still block on persisted exit audit logs');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('removePersistedExitAuditLogs(exitAuditIds)'), 'persisted exit audit logs are not cleared on successful flush');
      assert(text.includes('failedEntryKeys'), 'remote log failed entries are not tracked by entry key');
      assert(flushBody.includes('markCombatLogEntriesSent(entries)'), 'successful remote log retry does not clear failed entry count');
      assert(flushBody.includes('markCombatLogEntriesFailed(entries)'), 'remote log send failure does not mark failed entry count');
      const recordBody = functionBody(text, 'recordCombatLogTick');
      assert(
        /state\.lastSkipReason = suspendedReason;[\s\S]{0,120}flushCombatLogs\(false\);[\s\S]{0,120}return;/.test(recordBody),
        'suspended combat-log ticks do not retry pending remote logs'
      );
      const reloadBody = functionBody(text, 'requestReload');
      assert(reloadBody.includes('if (exitAuditFlushPending())'), 'requestReload does not block on pending exit audit logs');
      const loginBody = functionBody(text, 'maybeStartAutoLogin');
      assert(loginBody.includes('exitAuditFlushPending() && !manualOverride'), 'auto login does not block on pending exit audit logs');
      assert(loginBody.includes("reason: 'exit-log-flush-pending'"), 'blocked login reason not reported');
      const manualLoginBody = functionBody(text, 'forceLoginNow');
      assert(manualLoginBody.includes('cleared.exitAuditFlush = exitAuditFlushBlockDetail'), 'manual login does not record exit-audit bypass detail');
      assert(manualLoginBody.includes('bot.exitAudit.lastManualLoginBypass'), 'manual login does not preserve exit-audit bypass evidence');
    });
    check(`${file} persists important daily summary logs locally and remotely`, () => {
      assert(text.includes('IMPORTANT_LOGS_KEY'), 'important local log key not found');
      assert(text.includes("'graspRatImportantLogs'"), 'important logs are not stored under the expected localStorage key');
      assert(text.includes("recordImportantEvent('session-start'"), 'session-start important log not recorded');
      assert(text.includes("recordImportantEvent('session-end'"), 'session-end important log not recorded');
      assert(text.includes("recordImportantEvent('kill'"), 'kill important log not recorded');
      assert(text.includes("recordImportantEvent('combat-summary'"), 'combat-summary important log not recorded');
      const queueBody = functionBody(text, 'queueCombatLogEntry');
      assert(queueBody.includes('const important = Boolean('), 'important log queue marker not found');
      assert(queueBody.includes('!state.enabled && !critical && !important'), 'important logs cannot flush while combat logging is disabled');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('const hasImportant ='), 'flush does not detect important logs');
      assert(flushBody.includes('markImportantLogsRemoteSent(importantLogIds'), 'important logs are not marked sent after remote flush');
      assert(functionBody(text, 'markImportantLogsRemoteSent').includes("bot.importantLogging.lastRemoteError = ''"), 'successful important remote sends do not clear stale error state');
      assert(text.includes('restoreImportantLogsForRemote();'), 'unsent important logs are not restored for remote flush');
      assert(text.includes('pureRefreshCoins'), 'session logs do not include pure refreshed coin totals');
      assert(text.includes('staminaSpentMs'), 'session logs do not include stamina spent');
      assert(text.includes('playerCategory'), 'kill summaries do not include AFK/active player category');
      assert(text.includes('afkKillRewardCoins') && text.includes('activeKillRewardCoins'), 'session logs do not include AFK/active kill reward buckets');
      assert(text.includes('rewardConfirmed') && text.includes('unconfirmedDropCoins'), 'kill summaries do not separate confirmed rewards from unconfirmed drops');
      assert(text.includes('battleStartedAt') && text.includes('battleStaminaSpentMs'), 'kill summaries do not include battle window/stamina fields');
      assert(text.includes('staminaSpentStartMs') && text.includes('staminaSpentEndMs'), 'combat summaries do not include combat stamina range');
      assert(text.includes('selfHpDelta') && text.includes('enemyHpDelta'), 'combat summaries do not include HP deltas');
      const importantCombatHpBody = functionBody(text, 'updateImportantCombatHp');
      assert(importantCombatHpBody.includes('const previousStart = importantHpValue(record[startKey])'), 'important combat HP start does not use strict HP parsing');
      assert(importantCombatHpBody.includes('if (previousStart === null) record[startKey] = value'), 'important combat HP start cannot backfill first observed HP');
      assert(!importantCombatHpBody.includes('Number.isFinite(Number(record[startKey]))'), 'important combat HP start still treats null as numeric zero');
      assert(functionBody(text, 'importantCombatSampleFromDecision').includes('selfHp: importantHpValue(knownHpValue(self))'), 'important combat self HP sampling does not use known HP aliases');
      assert(text.includes('closeOpenImportantSessionsBeforeStart(session'), 'unclosed important sessions are not closed before the next login');
      assert(text.includes('function importantCombatDecisionIsExitOnly'), 'important combat exit-only classifier not found');
      assert(text.includes('if (sample.exitOnly) return;'), 'exit-only combat samples can still start combat summaries');
      assert(text.includes('!importantCombatHasActualEngagement(record)'), 'empty combat summaries are not discarded');
      assert(text.includes("exitReason = 'session-interrupted-before-next-login'"), 'next-login interrupted sessions are not explicitly marked');
      assert(text.includes('recordDropMatchedKill(candidate') && text.includes("'post-attack-drop-visible'"), 'post-attack visible drop coins are not attributed as kill rewards');
      assert(text.includes('recordDropMatchedKill(target, value') || text.includes('recordDropMatchedKill(sessionTarget, sessionValue'), 'picked post-attack drop coins are not attributed as kill rewards');
      assert(text.includes('dropMatched') && text.includes('chatConfirmed'), 'kill summaries do not include attribution/confirmation flags');
      assert(functionBody(text, 'updateKillHistory').includes('rewardCoins: existingRewardConfirmed') && functionBody(text, 'updateKillHistory').includes('reportedRewardCoins: targetDrop'), 'chat-confirmed kills still treat target Drop as confirmed reward');
      assert(text.includes('function findLiveKillVictim') && functionBody(text, 'updateKillHistory').includes('findLiveKillVictim') && text.includes('victim-still-alive'), 'chat-confirmed kills are not blocked while the victim is still alive');
      assert(text.includes('bot.globalState.messages'), 'snapshot chat kill messages are not inspected');
    });
    check(`${file} blocks relogin and reload until session-end important logs flush`, () => {
      assert(text.includes('function importantSessionEndFlushPending'), 'session-end important flush pending helper not found');
      assert(text.includes('function importantSessionEndFlushBlockDetail'), 'session-end important flush block detail helper not found');
      assert(text.includes("event.importantType === 'session-end'") && text.includes('flushCombatLogs(true)'), 'session-end important logs are not force-flushed');
      assert(functionBody(text, 'maybeStartAutoLogin').includes('closeCurrentImportantSessionBeforeLogin'), 'auto login does not close the current important session before relogin');
      assert(functionBody(text, 'maybeStartAutoLogin').includes('importantSessionEndFlushPending()'), 'auto login does not block on unsent session-end important logs');
      assert(functionBody(text, 'maybeStartAutoLogin').includes("reason: 'important-log-flush-pending'"), 'auto login does not report the session-end log flush block reason');
      assert(functionBody(text, 'forceLoginNow').includes('closeCurrentImportantSessionBeforeLogin'), 'manual login does not close the current important session before relogin');
      assert(functionBody(text, 'forceLoginNow').includes('cleared.importantLogFlush = importantSessionEndFlushBlockDetail'), 'manual login does not record session-end log bypass detail');
      assert(functionBody(text, 'forceLoginNow').includes('bot.importantLogging.lastManualLoginBypass'), 'manual login does not preserve session-end log bypass evidence');
      assert(functionBody(text, 'requestReload').includes('closeCurrentImportantSessionBeforeReload'), 'requestReload does not close the current important session before refresh');
      assert(functionBody(text, 'requestReload').includes('importantSessionEndFlushPending()'), 'requestReload does not block on unsent session-end important logs');
      assert(functionBody(text, 'maybeReloadCloudflareError').includes('importantSessionEndFlushPending()'), 'error-page reload does not block on unsent session-end important logs');
      assert(functionBody(text, 'combatLogSuspendReason').includes('important-log-flush-pending'), 'combat log suspension does not understand session-end flush waits');
      assert(text.includes('等待会话结束日志发送完成'), 'session-end flush wait is not exposed with a Chinese display reason');
      assert(text.includes('下一次登录时发现上一局已结束，按下一次登录时间收口'), 'next-login inferred session closure still uses the old missing-exit wording');
    });
    check(`${file} confirms leave success through reload and durable pending state`, () => {
      assert(text.includes("const COMBAT_LOG_PENDING_ENTRIES_KEY = 'graspRatCombatLogPendingEntries'"), 'ordinary combat pending log storage key not found');
      assert(text.includes("const PENDING_EXIT_STATE_KEY = 'graspRatPendingExitState'"), 'pending exit storage key not found');
      const pendingExitNormalizerSource = `${text}\n${finalRuntimeText}`;
      assert(pendingExitNormalizerSource.includes('function normalizePendingExitStateForStorage') || pendingExitNormalizerSource.includes('function normalizePendingExitStateForStorageCore'), 'pending exit storage normalizer not found');
      assert(pendingExitNormalizerSource.includes('function readPersistedPendingExitState') || pendingExitNormalizerSource.includes('function readPersistedPendingExitStateCore'), 'pending exit storage reader not found');
      const pendingExitRestoreSource = `${text}\n${finalRuntimeText}`;
      const restoresPendingExitWithReloadMarker = pendingExitRestoreSource.includes('const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot })')
        || (
          pendingExitRestoreSource.includes('restoreRuntimeStateCore(preserved, previousBot')
          && pendingExitRestoreSource.includes('const restoreOptions = { markReloaded: !previousBot };')
          && pendingExitRestoreSource.includes('helpers.readPersistedPendingExitState(nowMs(), restoreOptions)')
          && pendingExitRestoreSource.includes('helpers.chooseInitialPendingExitState(')
        );
      assert(restoresPendingExitWithReloadMarker, 'pending exit state is not restored with reload marker on cold page load');
      assert(text.includes('pendingExit: initialPendingExitState'), 'bot startup does not use restored pending exit state');
      assert(text.includes('restorePersistedCombatLogPendingEntries();'), 'ordinary pending combat logs are not restored at startup');
      assert(expectObjectNumber(defaultConfigSource, 'combatLogBatchMaxEntries', 12), 'combat log default batch size is not bounded for low-latency flushes');
      assert(expectObjectNumber(defaultConfigSource, 'combatLogMaxPersistedEntries', 160), 'combat log persisted-entry cap is not configured');
      assert(expectObjectNumber(defaultConfigSource, 'combatLogPendingPersistMinMs', 5000), 'combat log failed-persist throttle is not configured');
      assert(text.includes('function combatLogMaxPersistedEntries'), 'combat log persisted-entry cap helper not found');
      const queueBody = functionBody(text, 'queueCombatLogEntry');
      assert(queueBody.includes('shouldPersistCombatLogPendingEntry(queued)') && queueBody.includes('state.pendingPersistenceDirty = true'), 'ordinary combat log entries are not marked dirty when queued');
      assert(!queueBody.includes('persistCombatLogPendingEntries('), 'ordinary combat log queueing still performs hot-path localStorage persistence');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('configuredBatchMax') && flushBody.includes('Number(cfg.combatLogBatchMaxEntries) || 12'), 'combat log flush does not use the bounded batch fallback');
      assert(flushBody.includes('removePersistedCombatLogPendingEntries(entries)'), 'persisted ordinary combat logs are not cleared after successful flush');
      assert(flushBody.includes('persistCombatLogPendingEntries()'), 'failed combat log flushes do not keep pending entries durable');
      const reloadBody = functionBody(text, 'requestLeaveConfirmationReload');
      assert(reloadBody.includes('persistCombatLogPendingEntries({ force: true })'), 'leave-success confirmation reload does not force-persist ordinary pending logs before refresh');
      assert(!reloadBody.includes('closeCurrentImportantSessionBeforeReload'), 'leave-success confirmation reload can prematurely close the important session');
      assert(
        reloadBody.includes('writePersistentPendingExitState(pending)')
          || reloadBody.includes("writePendingExit('pending')")
          || reloadBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, pending || bot.pendingExit')
          || reloadBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (pending) || bot.pendingExit'),
        'leave-success confirmation reload does not persist pending exit before refresh'
      );
      assert(reloadBody.includes("reason: 'leave-success-refresh-confirmation'"), 'leave-success confirmation reload reason not exposed');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes('leaveSuccessReloadConfirmationSatisfied(reloadConfirmation)'), 'pending exit handler does not require leave-success reload marker');
      assert(pendingBody.includes("requestLeaveConfirmationReload('leave-success', pending)"), 'pending exit handler does not request confirmation reload for successful leave');
      assert(pendingBody.includes("source: 'leave-success-refresh-confirmed'"), 'pending exit handler does not confirm from refreshed offline state');
      assert(pendingBody.includes("source: 'leave-success-refresh-still-online'"), 'pending exit handler does not retry when refreshed state is still online');
      assert(pendingBody.includes("source: 'leave-success-refresh-unknown-timeout'"), 'pending exit handler does not retry after unknown refreshed state');
      assert(!pendingBody.includes("source: 'leave-success',"), 'pending exit handler still directly confirms plain leave success');
      const maybeBody = functionBody(text, 'maybeConfirmPendingExitFromLeaveDetail');
      assert(maybeBody.includes("requestPendingExitLeaveSuccessReload(detail, 'leave-success')"), 'leave success completion does not route to confirmation reload');
      assert(!/leaveDetailSucceeded\(detail\)[\s\S]{0,180}confirmPendingExit/.test(maybeBody), 'leave success completion still directly confirms pending exit');
      const completeBody = functionBody(text, 'completeLeaveRequest');
      assert(completeBody.includes('const http403 = leaveDetailHasHttp403(detail)'), 'leave completion does not isolate HTTP 403 state');
      assert(completeBody.includes('const clashRescuePending = http403 && leaveDetailFailedForClashRescue(detail) && Boolean(nextClashLeaveRescueStage(detail))'), 'leave completion does not suppress 403 session-end logging while Clash rescue is pending');
      assert(completeBody.includes('if (http403 && !clashRescuePending)'), 'leave completion can still close the session before exhausting Clash 403 rescue');
      assert(!completeBody.includes("noteImportantSessionExit((leaveDetailHasHttp403(detail) ? 'leave-http-403:' : 'leave-success:')"), 'normal leave success still writes session-end important log before reload confirmation');
      assert(completeBody.includes("requestPendingExitLeaveSuccessReload(detail, 'leave-success')"), 'async leave completion does not request confirmation reload');
      const rememberBody = functionBody(text, 'rememberPendingExit');
      assert(rememberBody.includes("requestPendingExitLeaveSuccessReload(detail, 'leave-success')"), 'sync leave pending creation does not request confirmation reload');
      const updateBody = functionBody(text, 'updatePendingExitLastResult');
      assert(
        updateBody.includes('writePersistentPendingExitState(bot.pendingExit)')
          || updateBody.includes("writePendingExit('bot.pendingExit')")
          || updateBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, bot.pendingExit || bot.pendingExit')
          || updateBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit'),
        'pending exit last result updates are not durable'
      );
      const retryBody = functionBody(text, 'retryPendingExit');
      assert(
        (
          retryBody.includes('writePersistentPendingExitState(bot.pendingExit)')
          || retryBody.includes("writePendingExit('bot.pendingExit')")
          || retryBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, bot.pendingExit || bot.pendingExit')
          || retryBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit')
        ) && (
          retryBody.includes('writePersistentPendingExitState(next)')
          || retryBody.includes("writePendingExit('next')")
          || retryBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, next || bot.pendingExit')
          || retryBody.includes('writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (next) || bot.pendingExit')
        ),
        'pending exit retry state is not durable'
      );
      const confirmBody = functionBody(text, 'confirmPendingExit');
      assert(confirmBody.includes('clearPersistentPendingExitState()'), 'confirmed pending exit does not clear persisted pending exit state');
      const clearBody = functionBody(text, 'clearCurrentReloginHold');
      assert(clearBody.includes('clearPersistentPendingExitState()'), 'manual relogin hold clear does not clear persisted pending exit state');
    });
    check(`${file} keeps failed leave attempts pending until confirmed`, () => {
      assert(countMatches(text, /if \(detail\.attempted \|\| detail\.exitAuditId\)/g) >= 4, 'failed/non-attempted exit audit leaves are not remembered as pending exits');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes('const lastError = String(pending.lastResult?.error || \'\')'), 'pending exit does not inspect last leave error');
      assert(pendingBody.includes('weakConfirmation'), 'pending exit does not mark weak auth-page confirmations');
      assert(pendingBody.includes('ignoredBecauseLastLeaveError'), 'pending exit may confirm auth/login page after leave error');
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('detail.leaveRequestPending = true'), 'async leave requests are not marked pending');
      assert(issueBody.includes('setTimeout(() =>'), 'async leave requests do not have a timeout gate');
      assert(issueBody.includes('detail.leaveRequestTimeoutMs'), 'leave timeout metadata is not recorded');
	      const completeBody = functionBody(text, 'completeLeaveRequest');
	      assert(completeBody.includes('request.durationMs'), 'leave request duration is not recorded');
	      assert(completeBody.includes('detail.leaveRequests.push(request)'), 'leave request history is not stored on leave detail');
	    });
	    check(`${file} stops native motion immediately after confirmed exits`, () => {
	      const completeBody = functionBody(text, 'completeLeaveRequest');
	      assert(
	        completeBody.includes("stopMotionAfterExit(http403 ? 'leave-http-403' : 'leave-success')"),
	        'successful/403 leave completion does not stop motion immediately'
	      );
	      const confirmBody = functionBody(text, 'confirmPendingExit');
	      assert(confirmBody.includes("stopMotionAfterExit('exit-confirmed')"), 'pending exit confirmation does not stop motion');
	      assert(confirmBody.includes("clearCombatEngagement('exit-confirmed')"), 'pending exit confirmation does not clear combat engagement');
	      const clearBody = functionBody(text, 'clearNativeMotionState');
	      assert(clearBody.includes("nativeState.lastVel = '0 0'"), 'native lastVel is not cleared on stop');
	      assert(clearBody.includes("const vectorFields = ['currentVel', 'targetVel', 'velocity', 'lastNonZeroVel']"), 'native velocity vector fields are not fully cleared on stop');
	      assert(clearBody.includes("nativeState.lastInputAt = 0"), 'native lastInputAt is not cleared on stop');
	      assert(clearBody.includes("nativeState.lastStopAt = t"), 'native lastStopAt is not refreshed on stop');
	      const stopBody = functionBody(text, 'stopMotionSafely');
	      assert(stopBody.includes('const sent = sendNativeVelocity(0, 0, true);'), 'stopMotionSafely does not send forced zero velocity');
	      assert(stopBody.includes('stopLocalMotionOnly(reason);'), 'stopMotionSafely does not clear local motion after native stop');
	      const exitStopBody = functionBody(text, 'stopMotionAfterExit');
	      assert(exitStopBody.includes('clearPostExitTargetState(reason)'), 'exit stop does not clear post-exit target state');
	      const clearTargetBody = functionBody(text, 'clearPostExitTargetState');
	      assert(clearTargetBody.includes('removeTargetOverlay()'), 'post-exit target cleanup does not remove target overlay');
	      assert(clearTargetBody.includes('bot.opportunityChoice = null'), 'post-exit target cleanup does not clear held opportunity');
	      assert(clearTargetBody.includes('postExitDecisionWithoutTarget'), 'post-exit target cleanup does not sanitize last decision');
	      const waitBody = functionBody(text, 'pendingExitWaitDecision');
	      assert(waitBody.includes("target: confirmed ? null : (cover?.target || pending.target || null)"), 'confirmed pending-exit wait can still expose a target');
	      assert(waitBody.includes('combatCover: confirmed ? null : (cover || null)'), 'confirmed pending-exit wait can still expose combat cover');
	      const overlayBody = file === 'grasp-rat-bot.js'
	        ? functionBody(targetOverlaySourceModule, 'targetOverlaySource')
	        : functionBody(text, 'renderTargetOverlay');
	      assert(overlayBody.includes('targetOverlaySuppressedAfterExit(decision)'), 'target overlay is not suppressed after exit');
	      assert(overlayBody.includes("String(decision?.reason || '') === 'paused'"), 'target overlay is not suppressed while paused');
	      assert(/setPaused\s*\([^)]*\)\s*\{[\s\S]{0,2500}removeTargetOverlay\(\)/.test(text), 'manual pause does not remove target overlay');
	      const actionVelocityBody = functionBody(text, 'sendActionVelocity');
	      assert(actionVelocityBody.includes('const lockRemainingMs = exitMotionStopLockRemainingMs()'), 'action velocity does not check exit motion lock');
	      assert(actionVelocityBody.includes('action.exitMotionBlocked'), 'exit motion lock is not exposed on blocked actions');
	      const tickBody = functionBody(text, 'tick');
	      assert(tickBody.includes('const exitMotionLockRemainingMs = exitMotionStopLockRemainingMs()'), 'main tick does not check post-exit motion lock before choosing actions');
	      assert((tickBody.includes('postExitDecisionWithoutTarget(') || tickBody.includes('postExitDecisionWithoutTargetForTickCore(') || tickBody.includes('postExitDecisionWithoutTargetCall(')) && tickBody.includes('holdRemainingMs: exitMotionLockRemainingMs'), 'main tick does not publish a targetless post-exit wait decision');
	      assert(expectObjectNumber(defaultConfigSource, 'exitMotionStopLockMs', 8000), 'exit motion stop lock duration not configured');
	    });
    check(`${file} confirms exits from local evidence and throttles live pending retries`, () => {
      const localBody = functionBody(text, 'pendingExitLocalConfirmationState');
      assert(localBody.includes('tokenCleared && chatLeftUser && ownEntity.disappeared && !sessionMismatch'), 'token/chat/self-missing exit confirmation does not reject active session mismatch');
      assert(localBody.includes('controlHasAuthoritativeSessionMismatch(control)'), 'local exit confirmation does not inspect authoritative session mismatch');
      assert(text.includes("'token-chat-left-user-self-missing'"), 'local exit confirmation source not logged');
      assert(text.includes("'local-exit-session-mismatch'"), 'local exit session-mismatch source not logged');
      const chatBody = functionBody(text, 'chatLeftUserMessageSeen');
      assert(/left\\{2,4}s\+user/.test(chatBody), 'left user chat message matcher not found');
      const ownBody = functionBody(text, 'ownEntityDisappearedState');
      assert(ownBody.includes('getOwnEntity') && ownBody.includes('native-entities') && ownBody.includes('snapshot'), 'own entity disappearance does not check native and snapshot sources');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes('if (state.known && state.alive)'), 'alive pending exit does not have a non-blocking path');
      assert(pendingBody.includes('schedulePendingExitRetry(pending, self, state)'), 'alive pending exit does not schedule retry in background');
      assert(pendingBody.includes('return null'), 'alive pending exit does not return to normal action selection');
      const retryBody = functionBody(text, 'pendingExitRetryMs');
      assert(retryBody.includes('cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000'), 'pending exit retry floor does not use 10s leave timeout');
      assert(text.includes('const pendingExitAlive = Boolean(bot.pendingExit && self && isAlive(self))'), 'pending alive exit guard not found before offline branch');
      assert(text.includes('controlOffline && !pendingExitAlive'), 'offline branch can still block live pending exits');
      assert(text.includes("pendingExitIntent:") && text.includes("reason: 'injury-leave'"), 'injury leave no longer preserves normal control action');
    });
    check(`${file} suppresses ordinary injury leave while combat state is active`, () => {
      const body = functionBody(text, 'isCombatStateForInjuryLeave');
      assert(body.includes('action?.combat'), 'combat action does not suppress ordinary injury leave');
      assert(body.includes('bot.pendingCombatLeave'), 'pending combat leave does not suppress ordinary injury leave');
      assert(body.includes('bot.lastSafety?.engagedCombat'), 'engaged combat safety state does not suppress ordinary injury leave');
      assert(body.includes('hasRecentCombatEngagementForInjuryLeave()'), 'recent combat engagement does not suppress ordinary injury leave');
      assert(text.includes('bot.pendingInjuryLeave && isCombatStateForInjuryLeave(action)'), 'main loop does not use combat-state injury suppression');
      assert(text.includes("suppressedReason: 'combat-state'"), 'combat-state injury suppression is not logged');
    });
    check(`${file} keeps non-invulnerable active combat above avoidance`, () => {
      const body = functionBody(text, 'chooseAction');
      const recordImportantBody = functionBody(text, 'recordImportantCombatTick');
      assert(body.includes('const recoveryCombatAction = buildCombatAction(self, recoveryCombatTarget, bullets)'), 'recovery combat action is not built in chooseAction');
      assert(body.includes('const avoidanceThreats = activeThreats.filter(isAvoidanceThreat)'), 'ordinary active threats can still enter the avoidance set');
      assert(text.includes('function isIdleInvulnerableTarget(e)'), 'idle invulnerable helper not found');
      assert(text.includes('const isAvoidanceThreat = e => isInvulnerable(e) && !isIdleInvulnerableTarget(e)'), 'idle invulnerable players can still enter active avoidance');
      assert(text.includes('const anyPositiveNumber = (...values) => values.some(value => Number(value) > 0);'), 'invulnerable numeric aliases are not checked independently');
      assert(text.includes('invulnerableRemainingMs') && text.includes('invulnerable_remaining_ms'), 'invulnerable millisecond aliases are not recognized');
      assert(text.includes('function mergeThreatLists'), 'threat-list merge helper not found');
      assert(body.includes('const highValueCoinThreats = mergeThreatLists('), 'high-value coin threat list is not kept separate from ordinary coin threats');
      assert(body.includes('const coinThreats = highValueCoinThreats'), 'ordinary Active players can still enter coin threat filtering');
      assert(!body.includes('ordinaryActiveCoinThreats'), 'ordinary Active coin threat list is still present in chooseAction');
      assert(body.includes('pickHighValueVisibleCoin(self, realtimeCoins, highValueCoinThreats'), 'high-value coin priority no longer uses the narrower threat list');
      assert(!text.includes('context.ordinaryCoinThreats'), 'high-value coin priority still contains ordinary Active coin-threat bypass logic');
      assert(body.includes('bot.actionThreats = coinThreats'), 'action threat diagnostics do not use merged coin threats');
      assert(body.includes('activeAvoidanceThreats: avoidanceThreats.length'), 'active avoidance threat count is not exposed separately');
      assert(body.includes('nearbyAvoidanceThreats: nearbyAvoidanceThreats.length'), 'nearby invulnerable avoidance count is not exposed');
      assert(!body.includes('const coinThreats = avoidanceThreats;'), 'ordinary coin safety still uses only active avoidance threats');
      assert(body.includes('if (recoveryCombatAction) {'), 'recovery combat can still fall through to non-combat avoidance');
      assert(body.includes('const nearbyAvoidanceThreats = nearbyHumans.filter(e => e.distance <= nearbyAvoidanceRadius && isAvoidanceThreat(e))'), 'nearby safety avoidance is not limited to non-idle invulnerable players');
      assert(body.includes("const reason = 'avoid-invulnerable-target'"), 'nearby invulnerable avoidance does not use the non-combat safety reason');
      assert(text.includes('function importantCombatReasonIsPostCombatObservation'), 'important combat logging does not classify post-combat observation reasons');
      assert(recordImportantBody.includes('importantCombatReasonIsPostCombatObservation(reason)'), 'important combat logging can still close immediately on recovery wait');
      assert(!body.includes('const recoveryLeave = buildCombatAction(self, recoveryCombatTarget, bullets)'), 'old recovery-leave-only combat branch is still present');
      const classifyBody = functionBody(text, 'classify');
      assert(classifyBody.includes('const combatCandidateRange = combatTargetCandidateRange(self)'), 'combat target classification does not use configured candidate range');
      assert(classifyBody.includes('e.distance <= combatCandidateRange'), 'combat targets do not use the configured candidate range');
      const candidateBody = functionBody(text, 'combatTargetCandidateRange');
      assert(candidateBody.includes('Number(cfg.combatAttackRange || 0)'), 'new combat target candidate range is not limited to attack range');
      assert(!candidateBody.includes('isFullHp(self)'), 'new combat target selection still expands outside attack range when damaged');
      assert(text.includes('function combatDodgeThreatRange'), 'dodge threat range helper not found');
      assert(expectObjectNumber(defaultConfigSource, 'combatDodgeRangeBuffer', 1000), 'combat dodge range buffer is not configured at 10m');
      assert(classifyBody.includes('const combatDodgeOnlyTargets = attackableEntities'), 'out-of-range dodge-only target pool not found');
      assert(classifyBody.includes('e.distance > combatCandidateRange') && classifyBody.includes('e.distance <= combatDodgeOnlyCandidateRangeValue'), 'dodge-only target pool is not limited to the buffered range beyond attack range');
      assert(body.includes('[...combatTargets, ...combatDodgeOnlyTargets]'), 'defensive combat selection does not include dodge-only targets');
      assert(text.includes("'combat-out-of-range-dodge'"), 'out-of-range incoming bullet dodge action not found');
      assert(text.includes('combatDodgeOnly: true'), 'out-of-range dodge action does not mark dodge-only combat');
      assert(text.includes('const activeReengage = Boolean(reengageTarget'), 'engaged active reengage state is not computed');
      assert(text.includes('Math.max(graceMs, Number(cfg.combatEngageStickMs || 0))'), 'active reengage does not extend out-of-range grace to combat stick window');
      assert(text.includes('outOfRangeLimitMs'), 'engaged reengage does not expose/use the active out-of-range limit');
      assert(text.includes("clearCombatEngagement('combat-disengage-range')"), 'engaged targets beyond disengage range do not clear combat state');
      const tickBody = functionBody(text, 'tick');
      assert(tickBody.includes("if (action.kind === 'attack' && action.target)"), 'combat attack tracking still requires shoot=true');
      assert(tickBody.includes('if (action.shoot) {'), 'attack shooting is not separated from combat engagement tracking');
      assert(tickBody.includes('if (action.combat && !action.combatDodgeOnly) rememberCombatEngagement(self, action.target, action)'), 'dodge-only combat can still refresh ordinary combat engagement');
      assert(tickBody.includes("action.kind === 'wait' && action.combat && action.target"), 'out-of-range combat hold does not refresh engagement tracking');
    });
    check(`${file} uses stamina-aware combat fire discipline`, () => {
      const shootingBody = functionBody(text, 'combatShootingPlan');
      assert(shootingBody.includes("staminaRemaining(self, '5s')"), 'combat shooting plan does not read 5s stamina');
      assert(shootingBody.includes('reserve-for-dodge'), 'combat shooting plan does not reserve stamina for dodge');
      assert(text.includes('function combatTrendState'), 'combat trend state helper not found');
      assert(shootingBody.includes('const trend = options.trend'), 'combat shooting plan does not accept precomputed trend state');
      assert(shootingBody.includes('combatTrendState(self, options)'), 'combat shooting plan cannot compute trend state fallback');
      assert(shootingBody.includes("stance: trend.stance || 'normal'"), 'combat shooting plan does not expose trend stance');
      assert(shootingBody.includes('highHpFireWindow'), 'combat shooting plan does not expose high-HP fire window');
      assert(shootingBody.includes('combatShootHighHpDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for high HP');
      assert(shootingBody.includes('passiveRunnerFireWindow'), 'combat shooting plan does not expose passive-runner fire window');
      assert(shootingBody.includes('combatShootPassiveRunnerDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for passive runners');
      assert(shootingBody.includes('closePressureFireWindow'), 'combat shooting plan does not expose close-pressure fire window');
      assert(shootingBody.includes('combatShootPressureDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve under close bullet pressure');
      assert(shootingBody.includes('winningPressureFireWindow'), 'combat shooting plan does not expose winning pressure fire window');
      assert(shootingBody.includes('combatShootWinningPressureDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for winning pressure finish');
      assert(shootingBody.includes('steadyAimFireWindow'), 'combat shooting plan does not expose steady-aim fire window');
      assert(shootingBody.includes('combatShootSteadyAimDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for steady aim');
      assert(shootingBody.includes('noDamageDuelFireWindow'), 'combat shooting plan does not expose long no-damage duel fire window');
      assert(shootingBody.includes('combatShootNoDamageDuelDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for long no-damage duels');
      assert(shootingBody.includes('stamina-rebuild'), 'combat shooting plan does not stop fire for stamina rebuild');
      assert(shootingBody.includes('forceShoot: false'), 'combat shooting plan can still force-shoot');
      const combatBody = functionBody(text, 'buildCombatAction');
      const aimBody = functionBody(text, 'combatAimTarget');
      const chooseActionBody = functionBody(text, 'chooseAction');
      assert(text.includes('function combatAimFallbackPrecisionState'), 'fallback precision aim helper not found');
      assert(text.includes('function combatAimDynamicStrategyState'), 'dynamic combat aim strategy helper not found');
      assert(text.includes('function combatAimSourceDivergenceState'), 'combat aim source divergence helper not found');
      assert(text.includes('function combatLiveAimTarget'), 'live/native combat aim helper not found');
      assert(text.includes('function realtimeEntityWorldPoint'), 'render/realtime entity coordinate helper not found');
      assert(text.includes('function mergeCombatEntitySource'), 'combat log realtime/snapshot merge helper not found');
      const realtimePointBody = functionBody(text, 'realtimeEntityWorldPoint');
      const nativeEntityBody = functionBody(text, 'getNativeEntityList');
      const combatLogMergeBody = functionBody(text, 'mergeCombatEntitySource');
      assert(realtimePointBody.includes('preferRender') && realtimePointBody.includes('visual_x') && realtimePointBody.includes('render_x'), 'render entity coordinate resolution does not prefer visual/render coordinates');
      assert(nativeEntityBody.includes('targetOverlayRenderEntities()'), 'combat realtime entity list does not read render-visible entities');
      assert(nativeEntityBody.includes("add(entity, entity?.overlaySource || 'render', { render: true })"), 'render-visible entities are not merged with render source metadata');
      assert(nativeEntityBody.includes('mergeRealtimeEntity(byKey.get(key), entity)'), 'realtime entity list does not dedupe/merge native and render entities');
      assert(combatLogMergeBody.includes('incomingSnapshotOnly'), 'combat log merge does not detect snapshot-only overwrites');
      assert(combatLogMergeBody.includes('...entity') && combatLogMergeBody.includes('...previous') && combatLogMergeBody.includes('snapshot: true'), 'combat log merge does not preserve realtime coordinates while keeping snapshot evidence');
      assert(text.includes('function combatAimSteadyNoDamageState'), 'steady no-damage aim helper not found');
      assert(aimBody.includes('combatAimDynamicStrategyState(self, target, aimSource'), 'combat aim does not use dynamic strategy state');
      assert(text.includes('function combatAimTarget(self, target, options = {})'), 'combat aim target cannot receive pressure options');
	      assert(combatBody.includes('combatAimTarget(self, target, { realBulletPressure'), 'combat action does not pass real bullet pressure into aim');
      assert(text.includes('combatAimTarget(self, target, { realBulletPressure })'), 'leave cover does not pass real bullet pressure into aim');
      assert(aimBody.includes('realBulletPressure: Boolean(options.realBulletPressure)'), 'combat aim does not pass real bullet pressure into dynamic strategy');
      assert(text.includes("reason = 'coordinate-divergence'"), 'combat aim does not switch on live/source coordinate divergence');
      assert(text.includes("reason = 'real-bullet-pressure'"), 'combat aim does not switch to live precision under real bullet pressure');
      assert(text.includes("reason = 'real-bullet-pressure-intercept'"), 'combat aim does not keep intercept under real bullet pressure for lateral targets');
      assert(text.includes("reason = 'server-stall-live'"), 'combat aim does not switch to server-stall live precision');
      assert(text.includes("reason = 'server-stall-live-intercept'"), 'combat aim does not keep intercept under server stall for lateral targets');
      assert(text.includes("reason = 'radial-motion'"), 'combat aim does not switch on target radial movement');
      assert(text.includes("reason = 'no-damage-fallback'"), 'combat aim fallback precision reason not found');
      assert(aimBody.includes('liveInterceptAim: Boolean(aimStrategy.liveIntercept)'), 'combat logs do not expose live-intercept aim state');
	      assert(aimBody.includes('const interceptStrategyReason') && aimBody.includes('aimStrategy.liveIntercept'), 'combat intercept aim does not preserve strategy reason');
      assert(aimBody.includes('mode: aimStrategy.mode'), 'combat aim does not use dynamic strategy mode');
      assert(aimBody.includes('precisionAim: Boolean(aimStrategy.precision)'), 'combat logs do not expose dynamic precision aim state');
      assert(aimBody.includes('liveAim: Boolean(aimSource.nativeAimResolved)'), 'combat logs do not expose live aim state');
      assert(!aimBody.includes('snapshotAim:'), 'combat logs still expose snapshot aim state');
      assert(aimBody.includes('aimStrategyReason: aimStrategy.reason'), 'combat logs do not expose aim strategy reason');
      assert(aimBody.includes('sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm'), 'combat logs do not expose aim source divergence');
      assert(aimBody.includes('realBulletPrecisionAim: Boolean(aimStrategy.realBulletPrecision)'), 'combat logs do not expose real-bullet precision aim state');
      assert(aimBody.includes('if (aimStrategy.bypassJitter) return exact'), 'dynamic precision/steady aim does not bypass jitter');
      assert(text.includes('function pickActiveCombatWaitThreat'), 'active combat wait threat helper not found');
      assert(text.includes('function activeCombatThreatWaitAction'), 'active combat wait action helper not found');
      assert(text.includes("reason: 'combat-active-threat-wait'"), 'active combat wait action reason not found');
      assert(chooseActionBody.includes('const activeCombatWaitThreat = pickActiveCombatWaitThreat(self, activeThreats, bullets)'), 'chooseAction does not compute active combat wait threat with bullet context');
      assert(chooseActionBody.includes('return activeCombatThreatWaitAction(activeCombatWaitThreat)'), 'chooseAction does not wait instead of taking coins near active combat threats');
      assert(!shootingBody.includes('authorityOutOfRange'), 'combat shooting plan still accepts authority out-of-range state');
      assert(!shootingBody.includes("reason: 'authority-target-out-of-range'"), 'combat shooting plan still suppresses out-of-authority-range fire');
      assert(text.includes('function combatSpacingShouldOverrideBullet'), 'combat spacing cannot override real bullet dodge when too close');
      assert(text.includes('function combatLowHpCloseRiskState'), 'low-HP close-risk exit helper not found');
      assert(text.includes('function combatPressureDisadvantageState'), 'close-pressure HP disadvantage exit helper not found');
      assert(text.includes('function combatServerStallNoDamageLeaveState'), 'server-stall no-damage exit helper not found');
      assert(text.includes('function combatRetreatingTargetState'), 'retreating combat target helper not found');
      assert(text.includes('function combatFinishPressureState'), 'finish-pressure retreating target helper not found');
      assert(text.includes('function combatRetreatingFighterCloseVector'), 'retreating fighter close helper not found');
      assert(text.includes('function combatOutOfRangeFinishPressureState'), 'out-of-range finish reengage helper not found');
      assert(text.includes('function combatSafeCloseMoveOverride'), 'safe close movement override helper not found');
      assert(text.includes('combatOutOfRangeDodgeAction(self, target, pressure, baseTarget, selfHp, targetHp, retreatingTarget, outOfRangeCloseMove)'), 'out-of-range dodge does not receive safe close move candidate');
      assert(functionBody(text, 'combatOutOfRangeDodgeAction').includes('combatSafeCloseMoveOverride(self, target, pressure, closeMove)'), 'out-of-range dodge does not use safe close override');
      assert(text.includes('safeCloseOverride: safePressureCloseOverride'), 'combat logs do not expose safe close override evidence');
      assert(text.includes('function combatRetreatIgnoreActive'), 'retreat-ignore helper not found');
      assert(text.includes('function rememberCombatRetreatIgnore'), 'retreat-ignore writer not found');
      assert(text.includes('function combatSustainedPressureDisadvantageState'), 'sustained pressure stop-loss helper not found');
      assert(expectObjectNumber(defaultConfigSource, 'combatServerStallNoDamageLeaveMs', 25000), 'server-stall no-damage exit wait is not configured');
      assert(expectObjectNumber(defaultConfigSource, 'combatServerStallNoDamagePrecisionGraceMs', 10000), 'server-stall no-damage exit does not allow precision aim grace');
      assert(expectObjectNumber(defaultConfigSource, 'combatServerStallNoDamageHpGap', 5), 'server-stall no-damage HP gap is not configured');
      assert(expectObjectNumber(defaultConfigSource, 'combatPressureNoDamageExitHpThreshold', 80), 'sustained pressure stop-loss HP threshold is not configured at 80');
      assert(expectObjectNumber(defaultConfigSource, 'combatPressureNoDamageExitTargetHpMin', 75), 'sustained pressure stop-loss target HP floor is not configured at 75');
      assert(expectObjectNumber(defaultConfigSource, 'combatOutOfRangePressureReengageMaxHpGap', 20), 'target-owned pressure out-of-range reengage HP gap is not configured at 20');
      assert(functionBody(text, 'combatServerStallNoDamageLeaveState').includes('effectiveWaitMs'), 'server-stall no-damage exit does not use an effective precision-grace wait');
      assert(combatBody.includes('const closeRisk = combatLowHpCloseRiskState'), 'combat action does not evaluate low-HP close-risk exit');
      assert(combatBody.includes('const pressureDisadvantage = combatPressureDisadvantageState'), 'combat action does not evaluate close-pressure HP disadvantage exit');
      assert(
        combatBody.includes("combatLeaveAction('combat-hp-disadvantage-leave', baseTarget")
          || combatBody.includes("combatLeaveActionForCombatActionCore('combat-hp-disadvantage-leave', baseTarget")
          || combatBody.includes('combatLeaveActionForCombatActionCore("combat-hp-disadvantage-leave", baseTarget')
          || combatBody.includes('combatLeaveActionCall("\'combat-hp-disadvantage-leave\'", \'baseTarget\''),
        'combat action does not leave on close-pressure HP disadvantage'
      );
      if (file === 'dist/grasp-rat-remote-bot.js') {
        assert(!text.includes('function combatExitSummary('), 'dist remote bot still keeps combatExitSummary wrapper');
        assert(!text.includes('function combatLeaveAction('), 'dist remote bot still keeps combatLeaveAction wrapper');
      }
      assert(combatBody.includes('const sustainedPressureDisadvantage = combatSustainedPressureDisadvantageState'), 'combat action does not evaluate sustained pressure stop-loss');
      assert(combatBody.includes('const serverStallNoDamage = combatServerStallNoDamageLeaveState'), 'combat action does not evaluate server-stall no-damage disadvantage');
      assert(combatBody.includes('const retreatingTarget = combatRetreatingTargetState'), 'combat action does not evaluate retreating target state');
      assert(combatBody.includes('const finishPressure = combatFinishPressureState'), 'combat action does not evaluate low-HP retreating finish pressure');
      assert(combatBody.includes('const outOfRangeFinishPressure = combatOutOfRangeFinishPressureState'), 'combat action does not evaluate out-of-range finish reengage');
      assert(combatBody.includes("reason: 'combat-finish-reengage'"), 'out-of-range finish reengage action reason not found');
      assert(combatBody.includes('serverStallNoDamage && !retreatingTarget.disengage'), 'retreating out-of-range target can still trigger server-stall no-damage exit');
      assert(combatBody.includes('if (retreatingTarget.disengage)'), 'combat action does not disengage targets beyond disengage range');
      assert(combatBody.includes("reason: 'combat-disengage-range'"), 'disengage-range action reason not found');
      assert(combatBody.includes("reason: 'combat-out-of-range-hold'"), 'out-of-range combat hold action reason not found');
      assert(combatBody.includes('outOfRangeHold'), 'out-of-range combat hold evidence is not logged');
      assert(!combatBody.includes('rememberCombatRetreatIgnore(target)'), 'disengage-range exit still installs retreat-ignore instead of allowing later re-entry');
      assert(combatBody.includes('summarizeServerPositionStall()'), 'server-stall no-damage exit does not read stall state');
      assert(combatBody.includes('serverStallNoDamage'), 'combat action does not log server-stall no-damage evidence');
      assert(combatBody.includes('!realBulletPressure || spacingOverride'), 'combat action does not merge spacing during emergency real-bullet pressure');
      assert(combatBody.includes('overrideBullet: Boolean(spacingOverride)'), 'combat logs do not expose bullet spacing override');
      assert(combatBody.includes('finishPressure.active') && combatBody.includes('combatPressureCloseVector'), 'retreating low-HP targets cannot trigger finish-pressure chase');
      assert(combatBody.includes('const trend = combatTrendState(self'), 'combat action does not precompute combat trend state');
      assert(combatBody.includes('let shooting = combatShootingPlan(self'), 'combat action does not use mutable shooting plan');
      assert(combatBody.includes('const retreatingFighterClose = combatRetreatingFighterCloseVector'), 'combat action does not evaluate retreating fighter close');
      assert(combatBody.includes('retreatingFighterClose.active'), 'combat action does not expose the retreating fighter close exception');
      assert(combatBody.includes('if (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active)'), 'combat action does not suppress fire against ordinary retreating edge targets');
      assert(combatBody.includes("reason: 'finish-pressure'"), 'finish-pressure shooting reason not found');
      assert(combatBody.includes("combat-finish-pressure"), 'finish-pressure action reason not found');
      assert(combatBody.includes("combat-retreating-fighter-close"), 'retreating fighter close action reason not found');
      assert(combatBody.includes("reason: 'target-retreating-edge'"), 'retreating edge fire suppression reason not found');
      assert(combatBody.includes('trend,'), 'combat action does not pass trend state into shooting plan');
      assert(combatBody.includes('shoot: shooting.shoot'), 'combat action does not expose planned shoot flag');
      assert(combatBody.includes('forceShoot: shooting.forceShoot'), 'combat action does not expose planned force flag');
      assert(combatBody.includes('shootEveryMs: shooting.shootEveryMs'), 'combat action does not expose planned cadence');
      assert(combatBody.includes('steadyAim: Boolean(aim.steadyAim)'), 'combat action does not pass steady aim to shooting plan');
      assert(combatBody.includes("engagedCombat: target.combatIntent === 'engaged'"), 'combat action does not pass engaged state to shooting plan');
      assert(combatBody.includes('targetActive: isCurrentlyActive(target)'), 'combat action does not pass active target state to shooting plan');
      assert(combatBody.includes('targetMoving'), 'combat action does not pass moving target state to shooting plan');
      assert(combatBody.includes('steady: Boolean(aim.steadyAim)'), 'combat logs do not expose steady aim state');
      assert(!combatBody.includes('snapshot: Boolean(aim.snapshotAim)'), 'combat logs still expose snapshot aim state');
      assert(!combatBody.includes('authority: aim.authority || null'), 'combat logs still expose aim authority evidence');
      assert(combatBody.includes("shooting.suppressed ? 'combat-stamina-conserve'"), 'combat action does not report fire suppression reason');
      assert(combatBody.includes("retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active ? 'combat-target-retreating'"), 'retreating edge action reason does not preserve finish-pressure and fighter-close exceptions');
      assert(combatBody.includes("shooting.throttled && shooting.reason !== 'opponent-probe' ? 'combat-burst-fire'"), 'combat action does not preserve movement reason for opponent-probe throttling');
      assert(!combatBody.includes("combat-low-hp-no-damage-leave', baseTarget"), 'low no-damage can still trigger combat leave');
      assert(!text.includes('forceShoot: true'), 'force shooting is still present');
      const switchBody = functionBody(text, 'defensiveTargetOverridesEngaged');
      assert(text.includes('function incomingBulletRequiresTargetSwitch'), 'target switch immediate-bullet helper not found');
      assert(switchBody.includes('incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)'), 'defensive target switch can still override engaged target for distant bullets');
      const pickBody = functionBody(text, 'pickCombatTarget');
      const incomingBranchIndex = pickBody.includes('if (incoming?.ownerId')
        ? pickBody.indexOf('if (incoming?.ownerId')
        : pickBody.indexOf('if (incoming)');
      assert(incomingBranchIndex >= 0 && pickBody.indexOf('combatRetreatIgnoreActive(') > incomingBranchIndex, 'incoming bullet shooter no longer bypasses retreat-ignore filtering');
      assert(pickBody.includes('!combatRetreatIgnoreActive(target)') || pickBody.includes('!combatRetreatIgnoreActive(e)'), 'ordinary combat target selection does not filter retreat-ignored targets');
      assert(text.includes("clearCombatEngagement('target-retreating-ignore')"), 'engaged retreat-ignored target is not cleared');
      const passiveRunnerCloseBody = functionBody(text, 'combatPassiveRunnerCloseVector');
      assert(expectObjectNumber(defaultConfigSource, 'combatPassiveRunnerCloseRange', 4500), 'passive runner close range is not configured at 45m');
      assert(passiveRunnerCloseBody.includes('Number(cfg.combatSpacingMinRange || 0)'), 'passive runner close range is still bounded by preferred spacing instead of minimum spacing');
      assert(!passiveRunnerCloseBody.includes('Number(cfg.combatSpacingPreferredRange || 0)'), 'passive runner close range still uses preferred combat spacing');
      const pursuitBody = functionBody(text, 'updatePursuitTracking');
      assert(text.includes('function pursuitLeaveSuppressedByCombatAction'), 'same-target combat pursuit suppression helper not found');
      assert(pursuitBody.includes('pursuitLeaveSuppressedByCombatAction(picked, action)'), 'pursuit tracking does not check same-target combat suppression');
      assert(pursuitBody.includes('const startedAt = combatSuppressed ? t'), 'pursuit timer is not reset while fighting the same target');
      assert(functionBody(text, 'summarizePursuit').includes('combatSuppressed'), 'pursuit summary does not expose combat suppression');
      const nativeTickBody = functionBody(text, 'triggerNativeTick');
      assert(text.includes('function combatTickActiveFromState'), 'combat tick active helper not found');
      assert(text.includes('function nativeTickMinIntervalMs'), 'native tick interval helper not found');
      assert(nativeTickBody.includes('nativeTickMinIntervalMs({'), 'native tick trigger does not use dynamic interval helper');
      assert(nativeTickBody.includes('combatTarget: bot.combatTarget'), 'native tick interval does not consider active combat target');
      assert(nativeTickBody.includes('pendingExit: bot.pendingExit'), 'native tick interval does not consider pending combat exit');
    });
    check(`${file} blocks new leave triggers while pending exit is active`, () => {
      const skipBody = functionBody(text, 'pendingExitSkipNewLeave');
      assert(skipBody.includes('if (!pending) return null'), 'pending-exit skip helper can run without pending exit');
      assert(skipBody.includes('skippedNewLeave: true'), 'pending-exit skip helper does not mark skipped new leave');
      assert(skipBody.includes('pendingExit: summarizePendingExit(pending)'), 'pending-exit skip helper does not preserve pending exit summary');
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('bot.pendingExit && !detail?.pendingExitRetry'), 'leave command can send non-retry leave while pending exit is active');
      assert(issueBody.includes('pendingExitSkipNewLeave'), 'leave command does not delegate pending-exit skip result');
      assert(functionBody(text, 'retryPendingExit').includes('detail.pendingExitRetry = true'), 'pending exit retry is not explicitly allowed through leave command lock');
      assert(functionBody(text, 'leaveOffline').includes("pendingExitSkipNewLeave('offline'"), 'offline leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForInjury').includes("pendingExitSkipNewLeave('injury'"), 'injury leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForPursuit').includes("pendingExitSkipNewLeave('pursuit'"), 'pursuit leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForCombat').includes("pendingExitSkipNewLeave('combat'"), 'combat leave does not skip during active pending exit');
      assert(text.includes('staminaState.mustLeave && !bot.pendingExit'), 'stamina exit can still start a new leave during active pending exit');
      assert(text.includes("pendingExitIntentForSkippedLeave('injury'"), 'injury skip intent is not logged on normal action');
      assert(text.includes("pendingExitIntentForSkippedLeave('pursuit'"), 'pursuit skip intent is not logged on normal action');
    });
    check(`${file} rescues leave HTTP 403 before risk-control fallback`, () => {
      const requestBody = functionBody(text, 'leaveRequestHasHttp403');
      assert(requestBody.includes('status === 403'), 'leave 403 status detector not found');
      const rescueBody = functionBody(text, 'leaveDetailFailedForClashRescue');
      assert(!/leaveDetailSucceeded\(detail\)\s*\|\|\s*leaveDetailHasHttp403\(detail\)/.test(rescueBody), 'Clash leave rescue still excludes HTTP 403 after success check');
      assert(!/if\s*\(\s*leaveDetailHasHttp403\(detail\)\s*\)\s*return false/.test(rescueBody), 'Clash leave rescue still returns false for HTTP 403');
      assert(rescueBody.includes('const http403 = leaveDetailHasHttp403(detail)'), 'Clash leave rescue does not detect HTTP 403 as a first-class failure');
      assert(rescueBody.includes('if (!detail.error && !http403) return false'), 'Clash leave rescue still requires a generic error even for HTTP 403');
      assert(rescueBody.includes('if (leaveDetailSucceeded(detail)) return false'), 'Clash leave rescue does not reject successful leaves');
      const rescueHookBody = functionBody(text, 'clashLeaveRescueHook');
      assert(rescueHookBody.includes('readPageGlobal') && rescueHookBody.includes('__graspRatBotClashLeaveRescue'), 'Clash rescue hook is not read through page-global adapter');
      assert(!rescueHookBody.includes('window.__graspRatBotClashLeaveRescue'), 'Clash rescue hook still reads directly from window');
      assert(text.includes("const CLASH_LEAVE_RESCUE_STAGE_ORDER = ['auto', 'direct', 'manual']"), 'Clash leave rescue order is not auto -> direct -> manual');
      const nextStageBody = functionBody(text, 'nextClashLeaveRescueStage');
      assert(nextStageBody.includes('CLASH_LEAVE_RESCUE_STAGE_ORDER'), 'Clash leave rescue stage selection does not use the ordered stage list');
      const defaultProxyBody = functionBody(text, 'prepareDefaultClashLeaveProxy');
      assert(defaultProxyBody.includes("const stage = 'auto'"), 'default leave proxy preparation does not start with auto');
      assert(defaultProxyBody.includes('appendClashLeaveRescueAttempt(detail, attempt)'), 'default leave proxy preparation does not persist the auto stage attempt');
      const retryDetailBody = functionBody(text, 'clashLeaveRescueRetryDetail');
      assert(retryDetailBody.includes('retryDetail.leaveRequests = []'), 'Clash rescue retry does not clear stale 403 leave history before retrying');
      const pendingRetryBody = functionBody(text, 'retryPendingExit');
      assert(pendingRetryBody.includes('resetClashLeaveRescueRound(detail)'), 'pending exit retry does not restart the Clash rescue order from auto');
      const rescueRunBody = functionBody(text, 'runClashLeaveRescueRetry');
      assert(rescueRunBody.includes('await issueLeaveCommand(retryDetail)'), 'Clash rescue does not retry leave after switching proxy');
      assert(rescueRunBody.includes('updatePendingExitLastResult(detail)'), 'Clash rescue stage attempts are not persisted before fallback/next stage');
      assert(rescueRunBody.includes('nextClashLeaveRescueStage(retryDetail)'), 'Clash rescue does not continue to the next proxy stage after synchronous retry failure');
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('await prepareDefaultClashLeaveProxy(detail)'), 'leave command does not switch to the default auto proxy before the first request in a round');
      const completeBody = functionBody(text, 'completeLeaveRequest');
      assert(completeBody.includes('const rescueScheduled = scheduleClashLeaveRescueRetry(detail)'), 'completed failed leave does not schedule Clash rescue');
      assert(completeBody.includes('if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail)'), 'completed failed leave can confirm before Clash rescue scheduling');
      assert(completeBody.includes('const clashRescuePending = http403 && leaveDetailFailedForClashRescue(detail) && Boolean(nextClashLeaveRescueStage(detail))'), 'HTTP 403 leave completion is not gated by Clash rescue availability');
      const maybeBody = functionBody(text, 'maybeConfirmPendingExitFromLeaveDetail');
      assert(
        maybeBody.indexOf('scheduleClashLeaveRescueRetry(detail)') >= 0
          && maybeBody.indexOf('scheduleClashLeaveRescueRetry(detail)') < maybeBody.indexOf("source: 'leave-http-403'"),
        'HTTP 403 pending-exit confirmation does not try Clash rescue first'
      );
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(
        pendingBody.indexOf('scheduleClashLeaveRescueRetry(lastDetail)') >= 0
          && pendingBody.indexOf('scheduleClashLeaveRescueRetry(lastDetail)') < pendingBody.indexOf("source: 'leave-http-403'"),
        'pending HTTP 403 exit does not schedule Clash rescue before fallback confirmation'
      );
      assert(pendingBody.includes("source: bot.clashLeaveRescue.running ? 'leave-http-403-clash-rescue-running' : 'leave-http-403-clash-rescue-scheduled'"), 'pending HTTP 403 rescue state is not exposed while Clash rescue runs');
      const confirmBody = functionBody(text, 'confirmPendingExit');
      assert(confirmBody.includes('leave403ReloginDelayMs()'), '403 confirmation does not keep one hour fallback helper');
      assert(confirmBody.includes("minimumReason: 'leave HTTP 403 risk control'"), '403 risk-control minimum reason not recorded');
      assert(confirmBody.includes('detail.http403RiskControl = true'), '403 risk-control marker not recorded');
      assert(pendingBody.includes("source: 'leave-http-403'"), 'pending exit does not confirm on leave HTTP 403');
      const refreshBody = functionBody(text, 'refreshGlobalState');
      assert(!refreshBody.includes("'/snapshot'") && !refreshBody.includes('"/snapshot"'), '403 recovery still actively fetches snapshot through global refresh');
      const passiveSnapshotBody = functionBody(text, 'pageNativeSnapshotPayload');
      const passiveSnapshotErrorBody = functionBody(text, 'pageNativeSnapshotError');
      assert(passiveSnapshotBody.includes('noteLeave403SnapshotProbe(true'), 'page-native snapshot success does not update 403 recovery probe');
      assert(passiveSnapshotErrorBody.includes('noteLeave403SnapshotProbe(false'), 'page-native snapshot failure does not reset 403 recovery probe');
      const probeBody = functionBody(text, 'noteLeave403SnapshotProbe');
      assert(probeBody.includes('clearLeave403RiskHolds'), 'snapshot success streak does not clear 403 hold');
      assert(probeBody.includes('leave403SnapshotSuccessRequired()'), 'snapshot success threshold helper not used');
      const clearBody = functionBody(text, 'clearLeave403RiskHolds');
      assert(
        clearBody.includes('clearLoginSuppressMatching')
          || clearBody.includes('clearLoginSuppressMatchingBoundCore'),
        '403 snapshot recovery does not clear login suppress'
      );
      assert(clearBody.includes('clearPersistentExitState'), '403 snapshot recovery does not clear persistent hold state');
    });
    check(`${file} gates relogin on learned login-point safety`, () => {
      const gateBody = functionBody(text, 'ensureLoginSnapshotGate');
      assert(!gateBody.includes('await refreshGlobalState(true)'), 'login snapshot gate still actively probes snapshot');
      assert(gateBody.includes('status.passiveSnapshotOnly = true'), 'login snapshot gate does not expose passive snapshot-only mode');
      assert(!gateBody.includes('session-mismatch-recovery'), 'login snapshot gate still has a reason-based session mismatch bypass');
      assert(!gateBody.includes('recoveryBypass'), 'login snapshot gate exposes the old recovery bypass');
      assert(gateBody.includes('options.allowLiveSessionTakeoverBypass'), 'login snapshot gate does not require an explicit live-session takeover bypass option');
      assert(gateBody.includes('options.liveSessionTakeover?.allowed'), 'login snapshot gate bypass is not tied to allowed live-session takeover state');
      assert(gateBody.includes('status.liveSessionTakeoverBypass = true'), 'login snapshot gate does not mark explicit live-session takeover bypasses');
      assert(gateBody.includes('allowTakeoverBypass && status.pointSafety?.satisfied'), 'login snapshot gate can mark takeover bypass before login-point safety is satisfied');
      const statusBody = functionBody(text, 'snapshotLoginGateStatus');
      assert(statusBody.includes('const snapshotConnectivitySatisfied = true'), 'snapshot connectivity streak can still block relogin');
      assert(statusBody.includes('satisfied: loginPointSafetySatisfied'), 'login gate is not satisfied solely by login-point safety');
      const allowLoginBody = functionBody(text, 'loginSnapshotGateAllowsLogin');
      assert(allowLoginBody.includes('gate.pointSafety?.satisfied'), 'login gate bypass can skip login-point safety');
      const refreshBody = functionBody(text, 'refreshGlobalState');
      assert(!refreshBody.includes('noteLoginSnapshotProbe('), 'active snapshot refresh still updates login-point safety probe');
      assert(!refreshBody.includes("'/snapshot'") && !refreshBody.includes('"/snapshot"'), 'login/global refresh still actively fetches snapshot');
      assert(!refreshBody.includes("'/minimap'") && !refreshBody.includes('"/minimap"'), 'login/global refresh still actively fetches minimap');
      assert(refreshBody.includes("skipped: 'passive-snapshot-only-active-game-api-disabled'"), 'global refresh does not expose passive-only active API disabled diagnostics');
      const passiveSnapshotBody = functionBody(text, 'pageNativeSnapshotPayload');
      const passiveSnapshotErrorBody = functionBody(text, 'pageNativeSnapshotError');
      const passiveSnapshotObserverBody = functionBody(text, 'installPageNativeSnapshotObserver');
      assert(passiveSnapshotBody.includes('noteLoginSnapshotProbe(true'), 'page-native snapshot success does not update login-point safety probe');
      assert(passiveSnapshotBody.includes('Array.isArray(payload?.entities)') && passiveSnapshotBody.includes('/snapshot invalid payload'), 'page-native snapshot success can advance without a valid entities array');
      assert(generatedRuntimeSource.includes('replace(/^;\\s*/'), 'page-native snapshot error cleanup lost whitespace regex');
      assert(!generatedRuntimeSource.includes('replace(/^;\\\\s*/'), 'page-native snapshot error cleanup regex was double-escaped');
      assert(passiveSnapshotErrorBody.includes('noteLoginSnapshotProbe(false'), 'page-native snapshot failure does not reset login-point safety probe');
      assert(passiveSnapshotObserverBody.includes('readPageGlobal') && passiveSnapshotObserverBody.includes('ResponseCtor') && passiveSnapshotObserverBody.includes('ResponseCtor.prototype'), 'page-native snapshot observer does not read Response through page-global adapter');
      assert(passiveSnapshotObserverBody.includes('XMLHttpRequestCtor') && passiveSnapshotObserverBody.includes('XMLHttpRequestCtor.prototype'), 'page-native snapshot observer does not read XMLHttpRequest through page-global adapter');
      assert(passiveSnapshotObserverBody.includes('installPageGlobal') && passiveSnapshotObserverBody.includes('__graspRatPageNativeSnapshotObserver'), 'page-native snapshot observer state is not stored through page-global adapter');
      assert(passiveSnapshotObserverBody.includes('originalResponseJson') && passiveSnapshotObserverBody.includes('originalResponseText'), 'page-native snapshot observer does not hook response body parsing');
      assert(!passiveSnapshotObserverBody.includes('window[key]'), 'page-native snapshot observer still stores state directly on window');
      assert(!passiveSnapshotObserverBody.includes('window.Response'), 'page-native snapshot observer still reads Response directly from window');
      assert(!passiveSnapshotObserverBody.includes('window.XMLHttpRequest'), 'page-native snapshot observer still reads XMLHttpRequest directly from window');
      assert(!passiveSnapshotObserverBody.includes('window.fetch ='), 'page-native snapshot observer still wraps fetch and can alter request initiators');
      assert(!passiveSnapshotObserverBody.includes('originalFetch'), 'page-native snapshot observer still stores original fetch');
      assert(!passiveSnapshotObserverBody.includes('proto.send ='), 'page-native snapshot observer still wraps XHR send and can alter request initiators');
      assert(!passiveSnapshotObserverBody.includes('originalXhrSend'), 'page-native snapshot observer still stores original XHR send');
      assert(text.includes('installPageNativeSnapshotObserver()'), 'page-native snapshot observer is not installed');
      assert(text.includes('function loginPointSafetyStatus'), 'login-point safety status helper not found');
      assert(text.includes('function evaluateLoginPointSafety'), 'login-point safety evaluator not found');
      assert(text.includes('function loginPointSafetyRadiusInfo'), 'login-point safety dynamic radius helper not found');
      assert(text.includes('function loginPointSafetyExitSelfHpFrom'), 'login-point safety exit HP extractor not found');
      assert(text.includes('function maybeRecordLoginPoint'), 'post-login point recorder not found');
      assert(text.includes('LOGIN_POINT_SAFETY_KEY'), 'login-point safety persistence key not found');
      const pointMergeBody = functionBody(text, 'mergeLoginPointSafetyState');
      assert(pointMergeBody.includes('storedHasPoint && (!memoryHasPoint || loginPointPointStamp(stored) > loginPointPointStamp(memory))'), 'persisted login point can be overwritten by empty/stale memory state');
      assert(pointMergeBody.includes('stored.lastExitSelfHpAt') && pointMergeBody.includes('lastExitSelfHp: stored.lastExitSelfHp'), 'persisted login-point exit HP can be overwritten by stale memory state');
      const pointReadBody = functionBody(text, 'readLoginPointSafetyState');
      assert(pointReadBody.includes('mergeLoginPointSafetyState(bot.loginPointSafety, stored, t)'), 'login-point safety state does not merge localStorage with memory');
      const pointProbeBody = functionBody(text, 'noteLoginPointSafetyProbe');
      assert(pointProbeBody.includes('evaluateLoginPointSafety'), 'login-point safety probe does not evaluate snapshot entities');
      assert(pointProbeBody.includes('state.streak = 0'), 'unsafe login-point sample does not reset streak');
      assert(pointProbeBody.includes('if (!loginPointHasPoint(state))'), 'login-point probe can advance without a persisted point');
      const pointStatusBody = functionBody(text, 'loginPointSafetyStatus');
      assert(pointStatusBody.includes('missingPoint: !hasPoint && required > 0'), 'login-point safety status does not expose missing point');
      assert(pointStatusBody.includes('satisfied: required <= 0 || (hasPoint && state.streak >= required)'), 'missing login point can satisfy safety gate');
      const pointNormalizeBody = functionBody(text, 'normalizeLoginPointSafetyState');
      assert(pointNormalizeBody.includes('resetAt: Number(source.resetAt || 0)') && pointNormalizeBody.includes("resetReason: String(source.resetReason || '')"), 'login-point safety reset context is not persisted through reload');
      assert(pointNormalizeBody.includes('lastExitSelfHp') && pointNormalizeBody.includes('healthyHpThreshold'), 'login-point safety does not persist last exit HP/radius context');
      const pointRadiusBody = functionBody(text, 'loginPointSafetyRadiusInfo');
      assert(pointRadiusBody.includes('lastExitSelfHp >= healthyHpThreshold'), 'login-point safety radius is not reduced only for healthy last-exit HP');
      assert(pointRadiusBody.includes('healthyRadius') && pointRadiusBody.includes('lowHpRadius'), 'login-point safety radius helper does not expose healthy/low HP radii');
      const recordPointBody = functionBody(text, 'maybeRecordLoginPoint');
      assert(recordPointBody.includes('const loginAt = inferLoginPointLoginAt(t)'), 'login point recorder still requires only tracked bot login time');
      assert(recordPointBody.includes('bot.lastLoginAt = loginAt'), 'login point recorder does not repair missing login time after OAuth/callback recovery');
      const inferLoginPointBody = functionBody(text, 'inferLoginPointLoginAt');
      assert(inferLoginPointBody.includes('bot.session?.startedAt'), 'login point timestamp inference does not use active session start');
      assert(inferLoginPointBody.includes("localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY)") && inferLoginPointBody.includes('/oauth|callback|login/i'), 'login point timestamp inference does not handle OAuth/callback login suppress evidence');
      assert(inferLoginPointBody.includes('return 0'), 'login point timestamp inference can update without login/session evidence');
      const resetGateBody = functionBody(text, 'resetLoginSnapshotGate');
      assert(resetGateBody.includes('resetLoginPointSafetyGate(reason, exitSelfLike)'), 'exit snapshot gate reset does not reset login-point safety streak with exit HP context');
      assert(!functionBody(text, 'resetLoginPointSafetyGate').includes('point = null'), 'login-point reset clears persisted point');
      assert(functionBody(text, 'resetLoginPointSafetyGate').includes('state.lastExitSelfHp = Number.isFinite(exitHp) ? exitHp : null'), 'login-point reset does not record unknown exit HP as unknown');
      const pointDangerBody = functionBody(text, 'loginPointDangerReason');
      const activeModeDangerBody = functionBody(text, 'loginPointActiveModeDangerReason');
      const pointEvaluateBody = functionBody(text, 'evaluateLoginPointSafety');
      const damageEvidenceBody = functionBody(text, 'loginPointDamageEvidence');
      const rememberDamageBody = functionBody(text, 'rememberLoginPointDamageThreat');
      assert(pointDangerBody.includes("'damaged-self-today'"), 'login-point safety does not block known same-day damage actors');
      assert(pointDangerBody.includes('loginPointActiveModeDangerReason(state, entity, t)'), 'login-point safety does not route Active mode through evidence-gated danger helper');
      assert(activeModeDangerBody.includes('if (!isJoinModeActive(entity)) return'), 'login-point Active-mode helper can block non-Active players');
      assert(activeModeDangerBody.includes('loginPointEntityMoved(state, entity, t)'), 'login-point Active-mode helper does not observe movement before blocking');
      assert(activeModeDangerBody.includes('isFiringEntity(entity)') && activeModeDangerBody.includes('isMovingThreat(entity)') && activeModeDangerBody.includes('loginPointActiveModeStaminaSpent(entity)'), 'login-point Active-mode blocks are not limited to observed activity evidence');
      assert(!activeModeDangerBody.includes("return 'active-mode';"), 'login-point Active-mode can still block solely by mode');
      assert(damageEvidenceBody.includes('incoming-bullet-owner'), 'login-point damage actor evidence does not use incoming bullet ownership');
      assert(damageEvidenceBody.includes('firing-near-self-hp-drop'), 'login-point damage actor evidence does not require firing evidence');
      assert(rememberDamageBody.includes('loginPointDamageEvidence(candidate, injury)'), 'login-point damage actor recording still accepts unevidenced nearby actors');
      assert(rememberDamageBody.includes('evidence'), 'login-point damage actor recording does not persist evidence reason');
      assert(!pointDangerBody.includes('dropValue(') && !pointDangerBody.includes("'drop'"), 'login-point safety still blocks by Drop value');
      assert(!pointDangerBody.includes("return 'recent-movement'"), 'login-point safety still blocks recent movement');
      assert(!pointDangerBody.includes("return 'stamina-not-full'"), 'login-point safety still blocks non-full 5s stamina');
      assert(!pointDangerBody.includes("return 'firing'"), 'login-point safety still blocks firing evidence');
      assert(!pointEvaluateBody.includes('loginPointEntityMoved'), 'login-point safety still samples movement outside the Active-mode evidence gate');
      assert(!pointEvaluateBody.includes('stamina5s'), 'login-point safety still attaches stamina evidence to danger blocks');
      assert(pointProbeBody.includes('state.lastDanger = null'), 'snapshot failure does not clear stale player-danger block');
      const loginBody = functionBody(text, 'maybeStartAutoLogin');
      assert(loginBody.includes('await ensureLoginSnapshotGate(reason, {'), 'auto login does not pass explicit options to snapshot gate');
      assert(loginBody.includes('allowLiveSessionTakeoverBypass'), 'auto login does not thread live-session takeover bypass state');
      assert(loginBody.includes('!loginSnapshotGateAllowsLogin(snapshotGate)'), 'auto login does not use the combined snapshot/login-point gate helper');
      assert(!loginBody.includes('!snapshotGate.satisfied && !snapshotGate.liveSessionTakeoverBypass'), 'auto login can still bypass login-point safety directly');
      assert(loginBody.includes("reason: 'snapshot-gate'"), 'snapshot gate block reason not reported');
      const manualBody = functionBody(text, 'forceLoginNow');
      assert(manualBody.includes('manualLoginBypass: true'), 'manual login does not mark snapshot/login-point bypass');
      assert(manualBody.includes('markManualLoginBypass(manualReason)'), 'manual login does not mark native login bypass');
      assert(manualBody.includes('manualOverride: true'), 'manual login does not pass override into login start');
      assert(!manualBody.includes("skipReason: 'snapshot-gate'"), 'manual login is still blocked by snapshot/login-point gate');
      assert(!text.includes('function unsafeReloginEntryGateStatus'), 'post-login login-point safety entry gate is still present');
      assert(functionBody(text, 'loginSnapshotGateDisplayReason').includes('等待登录点坐标'), 'missing login point is not displayed explicitly');
      assert(text.includes('function installNativeLoginGateInterceptors'), 'remote bot native login event interceptors not found');
      assert(text.includes('function installStartLinuxDoLoginGate'), 'remote bot startLinuxDoLogin gate not found');
      assert(text.includes('blockNativeLoginEventIfNeeded'), 'remote bot native login event blocker not found');
      assert(text.includes('function markManualLoginBypass'), 'remote bot manual login bypass marker not found');
      assert(text.includes('function manualLoginBypassActive'), 'remote bot manual login bypass state not found');
      assert(functionBody(text, 'blockNativeLoginEventIfNeeded').includes('event?.isTrusted'), 'trusted native manual login events can still be blocked');
      assert(functionBody(text, 'installStartLinuxDoLoginGate').includes('manualLoginBypassActive()'), 'startLinuxDoLogin gate does not honor manual login bypass');
      assert(text.includes('installNativeLoginGateInterceptors();'), 'remote bot does not install native login gate interceptors on startup');
      const startExitAuditWrapperBody = text.includes('function startExitAudit')
        ? functionBody(text, 'startExitAudit')
        : '';
      const triggerSource = finalRuntimeText.includes('function startExitAuditCore')
        ? `${startExitAuditWrapperBody}\n${functionBody(finalRuntimeText, 'startExitAuditCore')}`
        : `${startExitAuditWrapperBody}\n${exitReloginRuntimeModule}`;
      const triggerBody = triggerSource;
      assert(triggerBody.includes('resetLoginSnapshotGate') && triggerBody.includes('exit-trigger:'), 'exit trigger does not reset login snapshot gate');
      assert(
        triggerBody.includes('loginPointSafetyExitSelfForDetail(detail, meta, bot.lastSelf)')
          || triggerBody.includes('helpers.loginPointSafetyExitSelfForDetail(detail, meta, helpers.lastSelf)'),
        'exit trigger does not pass self HP into login-point safety reset'
      );
      const confirmBody = functionBody(text, 'confirmPendingExit');
      assert(confirmBody.includes('resetLoginSnapshotGate') && confirmBody.includes("'exit-confirmed:'"), 'exit confirmation does not reset login snapshot gate');
      assert(confirmBody.includes('loginPointSafetyExitSelfForDetail(detail, { self: pending.self || state?.self || null }, bot.lastSelf)'), 'exit confirmation does not pass self HP into login-point safety reset');
      assert(text.includes('loginSnapshotGate: snapshotLoginGateStatus()'), 'status/logs do not expose login snapshot gate');
      assert(text.includes('reloginGate: summarizeReloginGateStatus()'), 'status does not expose relogin gate summary');
      const reloginGateBody = functionBody(text, 'summarizeReloginGateStatus');
      assert(reloginGateBody.includes('cooldown') && reloginGateBody.includes('snapshot') && reloginGateBody.includes('loginPointSafety'), 'relogin gate summary does not include all gate dimensions');
      assert(reloginGateBody.includes('snapshotLoginGateStatus(t)') && reloginGateBody.includes('loginPointSafetyStatus(t)'), 'relogin gate summary does not reuse login snapshot / point safety gates');
      assert(!reloginGateBody.includes('snapshotRequired <= 0 || snapshotStreak >= snapshotRequired'), 'relogin gate summary still requires the old snapshot connectivity streak');
    });
    check(`${file} leaves broken no-self game sessions`, () => {
      const snapshotSelfBody = functionBody(text, 'snapshotSelfPresenceState');
      assert(snapshotSelfBody.includes('snapshotSelfFreshEnough') && snapshotSelfBody.includes('snapshotDataAgeMs'), 'snapshot self takeover evidence does not use fresh snapshot age gates');
      assert(snapshotSelfBody.includes('bot.globalState.entities'), 'snapshot self takeover evidence does not inspect snapshot entities');
      assert(snapshotSelfBody.includes('isAlive(entity)'), 'snapshot self takeover evidence does not require alive self');
      const takeoverBody = functionBody(text, 'liveSessionMismatchTakeoverState');
      assert(takeoverBody.includes('noSelfExit?.sessionMismatch') && takeoverBody.includes('noSelfExit?.mismatchTimedOut'), 'live session takeover does not require a timed-out session mismatch');
      assert(takeoverBody.includes('controlHasAuthoritativeSessionMismatch(control)'), 'live session takeover does not require authoritative mismatch evidence');
      assert(takeoverBody.includes('snapshotSelf') && takeoverBody.includes('snapshotSelf.present'), 'live session takeover does not include fresh snapshot-self evidence');
      assert(takeoverBody.includes('liveSessionEvidence') && takeoverBody.includes('nativeWsOpenOrConnecting || snapshotSelf.present'), 'live session takeover does not require native websocket or snapshot-self live evidence');
      assert(takeoverBody.includes('bot.pendingExit'), 'live session takeover does not block active pending exits');
      assert(takeoverBody.includes('loginSuppressRemainingMs()'), 'live session takeover does not block login suppress context');
      assert(takeoverBody.includes('exit-trigger:') && takeoverBody.includes('exit-confirmed:'), 'live session takeover does not block exit-reset snapshot gates');
      assert(takeoverBody.includes('noSelfExit?.reconnectChurn') && takeoverBody.includes('control?.nativeReconnectChurn'), 'live session takeover does not block reconnect churn');
      assert(takeoverBody.includes('noSelfExit?.wsOfflineish'), 'live session takeover does not block offline-ish websocket state');
      assert(
        (takeoverBody.includes('enemyReloginHoldRemainingMs()') || takeoverBody.includes('enemyReloginHoldRemainingMsForControlLoginBoundCore') || takeoverBody.includes('${enemyHoldRemainingMsCall}'))
          && (takeoverBody.includes('offlineReloginHoldRemainingMs()') || takeoverBody.includes('offlineReloginHoldRemainingMsForControlLoginBoundCore') || takeoverBody.includes('${offlineHoldRemainingMsCall}')),
        'live session takeover does not block active relogin holds'
      );
      assert(takeoverBody.includes('recentUnsafeExitContext(bot.lastOfflineLeaveResult'), 'live session takeover does not block recent unsafe offline exits');
      assert(text.includes('SESSION_MISMATCH_RECOVERY_KEY'), 'session mismatch recovery persistence key not found');
      assert(text.includes("'graspRatSessionMismatchRecovery'"), 'session mismatch recovery state is not stored under the expected localStorage key');
      const recoveryReloadBody = functionBody(text, 'requestSessionMismatchRecoveryReload');
      assert(recoveryReloadBody.includes('liveSessionTakeover?.allowed'), 'session mismatch refresh can run without allowed takeover state');
      assert(recoveryReloadBody.includes("reason: 'session-mismatch-refresh'"), 'session mismatch refresh wait reason not reported');
      assert(recoveryReloadBody.includes('persistCombatLogPendingEntries({ force: true })'), 'session mismatch refresh does not force-persist pending combat logs');
      assert(recoveryReloadBody.includes('writeSessionMismatchRecoveryState'), 'session mismatch refresh does not persist recovery state');
      const recoverySatisfiedBody = functionBody(text, 'sessionMismatchRecoveryReloadSatisfied');
      assert(recoverySatisfiedBody.includes('sessionMismatchRecoveryStateMatches') && recoverySatisfiedBody.includes('sessionMismatchRecoveryPageReloadedAfter'), 'session mismatch takeover does not require same-user post-refresh state');
      const mismatchBody = functionBody(text, 'controlHasAuthoritativeSessionMismatch');
      assert(mismatchBody.includes('controlHasNativeGameSession(control)'), 'authoritative session mismatch helper does not use native session evidence');
      assert(mismatchBody.includes('snapshotSelfPresenceState') && mismatchBody.includes('snapshotSelfState?.present'), 'authoritative session mismatch helper does not use fresh snapshot-self evidence');
      assert(mismatchBody.includes('Boolean(control.hasToken)'), 'authoritative session mismatch helper does not check cleared token state');
      const noSelfBody = functionBody(text, 'noSelfGameSessionExitState');
      assert(noSelfBody.includes('controlHasNativeGameSession(control)'), 'no-self session detection does not use native session evidence');
      assert(noSelfBody.includes('snapshotSelfPresenceState(userId)') && noSelfBody.includes('snapshotSelf.present'), 'no-self session detection does not use fresh snapshot-self evidence');
      assert(noSelfBody.includes('control?.nativeReconnectChurn'), 'no-self session detection does not detect reconnect churn');
      assert(noSelfBody.includes('cfg.gameSessionNoSelfLeaveMs'), 'no-self session detection does not use timeout');
      assert(noSelfBody.includes('sessionMismatch'), 'no-self session detection does not track session mismatch');
      assert(noSelfBody.includes('mismatchTimedOut'), 'no-self session detection does not produce mismatch timeout');
      assert(noSelfBody.includes('shouldLeave'), 'no-self helper does not return leave decision');
      const tickBody = functionBody(text, 'tick');
      assert(!tickBody.includes('unsafeReloginEntryGateStatus'), 'main loop still checks login-point safety after alive-self entry');
      assert(!tickBody.includes("leaveOffline('login point safety gate'"), 'alive-self entry can still leave through login-point safety gate');
      assert(!tickBody.includes('login-point-safety-entry-gate'), 'alive-self entry can still stop motion for login-point safety');
      assert(tickBody.includes('maybeRecordLoginPoint(currentSummary)'), 'main loop no longer records the post-login point');
      assert(tickBody.includes('noSelfGameSessionExitState(control, noSelfAgeMs)'), 'main loop does not evaluate no-self session exit');
      assert(tickBody.includes('liveSessionMismatchTakeoverState(control, noSelfExit)'), 'main loop does not evaluate guarded live-session takeover state');
      assert(tickBody.includes('if (!cfg.dryRun && liveSessionTakeover?.allowed)'), 'main loop does not require allowed takeover state before fast recovery');
      assert(tickBody.includes('sessionMismatchRecoveryReloadSatisfied(control, noSelfExit)'), 'session mismatch recovery does not check whether a controlled refresh already happened');
      assert(tickBody.includes('requestSessionMismatchRecoveryReload(control, noSelfExit, liveSessionTakeover)'), 'session mismatch recovery does not request a controlled refresh before takeover');
      assert(tickBody.includes("'session-mismatch-refresh'"), 'session mismatch refresh reason is not exposed in main loop');
      assert(!tickBody.includes('const reloadPending'), 'session mismatch recovery can still fall through to takeover when refresh was not satisfied');
      assert(tickBody.includes('sessionMismatchRecoveryReload: reload || null'), 'session mismatch recovery wait state does not preserve refresh request result');
      assert(tickBody.includes("stopMotionSafely(noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session')"), 'no-self session exit does not stop motion with explicit reason');
      assert(tickBody.includes('await leaveOffline(noSelfExit.reason, bot.lastSelf, offlineSafety)'), 'no-self session exit does not issue offline leave');
      assert(tickBody.includes("await maybeStartAutoLogin('session-mismatch-recovery'"), 'session mismatch recovery does not route through auto login');
      assert(tickBody.includes('allowLiveSessionTakeoverBypass: true'), 'session mismatch recovery can call auto login without explicit takeover bypass option');
      assert(tickBody.includes('liveSessionTakeover,'), 'session mismatch recovery does not log/pass takeover detail');
      assert(tickBody.includes("login?.reason === 'snapshot-gate'"), 'session mismatch recovery does not surface snapshot-gate waits');
      assert(tickBody.includes('const sessionMismatchLoginPending = Boolean(login?.attempted || (login?.needed && !login?.error))'), 'session mismatch recovery does not treat gated login waits as pending');
      assert(tickBody.includes('if (!sessionMismatchLoginPending && Date.now() - bot.waitSince >'), 'session mismatch recovery can reload while login gate is pending');
      assert(!text.includes('等待立即重登'), 'session mismatch recovery still exposes immediate relogin text');
      assert(!text.includes('立即恢复接管'), 'session mismatch recovery panel still exposes immediate recovery text');
      assert(text.includes("'session-mismatch-recovery'"), 'session mismatch recovery reason is not exposed');
      assert(text.includes("control-ws-no-self-game-session"), 'no-self session exit reason is not exposed');
    });
    check(`${file} logs combat target mode and safety fields`, () => {
      const body = functionBody(text, 'buildCombatAction');
      assert(body.includes("mode: target.current_join_mode || target.mode || ''"), 'combat target mode not logged');
      assert(body.includes("life: target.life || ''"), 'combat target life not logged');
      assert(body.includes('active: isCurrentlyActive(target)'), 'combat target active flag not logged');
      assert(body.includes('firing: isFiringEntity(target)'), 'combat target firing flag not logged');
      assert(body.includes('invulnerable: isInvulnerable(target)'), 'combat target invulnerable flag not logged');
    });
    check(`${file} logs per-frame combat metrics`, () => {
      assert(text.includes('function combatLogFrameMetrics'), 'combat metrics helper not found');
      const buildBody = functionBody(text, 'buildCombatLogEntry');
      assert(buildBody.includes('const combatMetrics = combatLogFrameMetrics('), 'combat log entry does not compute metrics');
      assert(buildBody.includes('combatMetrics,'), 'combat log entry does not include combatMetrics');
      const metricsBody = functionBody(text, 'combatLogFrameMetrics');
      assert(metricsBody.includes('selfDamageTaken'), 'combat metrics do not expose self damage delta');
      assert(metricsBody.includes('targetDamageTaken'), 'combat metrics do not expose target damage delta');
      assert(metricsBody.includes('shotSincePreviousFrame'), 'combat metrics do not expose per-frame shot timing');
      assert(metricsBody.includes('combatMetricBulletStats(bullets)'), 'combat metrics do not include bullet stats');
      assert(functionBody(text, 'combatMetricBulletStats').includes('threatBulletCount'), 'combat bullet stats do not expose bullet threat count');
      assert(metricsBody.includes('serverPositionStall: serverPositionStall ?'), 'combat metrics do not expose server-position stall state');
      const shotBody = functionBody(text, 'recordCombatShotAttempt');
      assert(shotBody.includes('blockedByCadence'), 'shot telemetry does not record cadence-blocked attempts');
      assert(shotBody.includes('sent: Boolean(detail.sent)'), 'shot telemetry does not record sent status');
      assert(functionBody(text, 'shootAt').includes('recordCombatShotAttempt(self, target'), 'shootAt does not record shot attempts');
      assert(text.includes('lastCombatLogMetric: preserved.lastCombatLogMetric'), 'combat metric frame state is not attached to bot');
      assert(text.includes('lastCombatShot: preserved.lastCombatShot'), 'shot telemetry state is not attached to bot');
      assert(functionBody(text, 'startCombatLogSession').includes('combatMetrics: entry.combatMetrics || null'), 'combat-start does not include combatMetrics');
      assert(functionBody(text, 'endCombatLogSession').includes('combatMetrics: entry?.combatMetrics || null'), 'combat-end does not include combatMetrics');
    });
    check(`${file} logs source hash on combat session boundaries`, () => {
      assert(functionBody(text, 'startCombatLogSession').includes('sourceHash: cfg.sourceHash'), 'combat-start does not include sourceHash');
      assert(functionBody(text, 'endCombatLogSession').includes('sourceHash: cfg.sourceHash'), 'combat-end does not include sourceHash');
    });
    check(`${file} allows immediate relogin after safe or ordinary unsafe offline exits`, () => {
      const offlineSuppressSource = finalRuntimeText.includes('function setOfflineLeaveSuppressCore')
        ? finalRuntimeText
        : text;
      const body = offlineSuppressSource.includes('function setOfflineLeaveSuppressCore')
        ? functionBody(offlineSuppressSource, 'setOfflineLeaveSuppressCore')
        : functionBody(offlineSuppressSource, 'setOfflineLeaveSuppress');
      assert(
        body.includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now()))')
          || body.includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > now))'),
        'offline zero-hold path still depends on unsafe-delay classification'
      );
      assert(
        body.includes('const unsafeOfflineExit = offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)')
          || body.includes('const unsafeOfflineExit = helpers.offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)'),
        'offline zero-hold path does not preserve unsafe classification'
      );
      assert(body.includes('detail.safeReloginAllowed = !unsafeOfflineExit'), 'safe offline relogin marker is not limited to safe exits');
      assert(body.includes('if (unsafeOfflineExit) detail.defensiveReloginDelaySkipped = true'), 'unsafe offline zero-hold path is not marked');
      assert(
        body.includes('writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail)')
          || body.includes('helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail)'),
        'safe offline path does not preserve last exit detail'
      );
      assert(body.includes('return 0'), 'safe offline path does not return without suppress');
    });
    check(`${file} clears stale enemy relogin hold after online recovery`, () => {
      const clearCoreSource = text.includes('function clearEnemyReloginHoldCore')
        ? text
        : (finalRuntimeText.includes('function clearEnemyReloginHoldCore') ? finalRuntimeText : '');
      if (clearCoreSource) {
        const clearCoreBody = functionBody(clearCoreSource, 'clearEnemyReloginHoldCore');
        assert(clearCoreBody.includes('bot.pursuitReloginUntil = 0'), 'enemy online recovery does not clear enemy hold until');
        assert(clearCoreBody.includes('bot.lastEnemyLeaveWaitMs = 0'), 'enemy online recovery does not clear stale wait duration');
        assert(clearCoreBody.includes('helpers.clearPersistentExitState(helpers.enemyLeaveStateKey)'), 'enemy online recovery does not clear persistent hold state');
        assert(clearCoreBody.includes('helpers.clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i)'), 'enemy online recovery does not clear matching login suppress');
      } else {
        const clearBody = functionBody(text, 'clearEnemyReloginHold');
        if (clearBody.includes('clearEnemyReloginHoldBoundCore')) {
          assert(clearBody.includes('clearEnemyReloginHoldBoundCore(bot, localStorage, reason'), 'enemy online recovery wrapper does not call bound clear core');
          assert(clearBody.includes('enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY'), 'enemy online recovery bound wrapper does not bind persistent hold cleanup');
          assert(clearBody.includes('loginSuppressKey: LOGIN_SUPPRESS_KEY') && clearBody.includes('loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY'), 'enemy online recovery bound wrapper does not bind login suppress keys');
        } else if (clearBody.includes('clearEnemyReloginHoldCore')) {
          assert(clearBody.includes('clearEnemyReloginHoldCore(bot, reason'), 'enemy online recovery wrapper does not call clear core');
          assert(clearBody.includes('clearPersistentExitState') && clearBody.includes('enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY'), 'enemy online recovery wrapper does not bind persistent hold cleanup');
          assert(clearBody.includes('clearLoginSuppressMatching'), 'enemy online recovery wrapper does not bind login suppress cleanup');
        } else {
          assert(clearBody.includes('bot.pursuitReloginUntil = 0'), 'enemy online recovery does not clear enemy hold until');
          assert(clearBody.includes('bot.lastEnemyLeaveWaitMs = 0'), 'enemy online recovery does not clear stale wait duration');
          assert(clearBody.includes('clearPersistentExitState(ENEMY_LEAVE_STATE_KEY)'), 'enemy online recovery does not clear persistent hold state');
          assert(clearBody.includes('clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i)'), 'enemy online recovery does not clear matching login suppress');
        }
      }
      const manualBody = functionBody(text, 'clearCurrentReloginHold');
      assert(manualBody.includes('bot.lastEnemyLeaveWaitMs = 0'), 'manual login hold clear leaves stale enemy wait duration');
      assert(manualBody.includes('bot.lastOfflineLeaveWaitMs = 0'), 'manual login hold clear leaves stale offline wait duration');
      assert(
        text.includes("clearEnemyReloginHold('online self restored during enemy hold')")
          || text.includes("clearEnemyReloginHoldBoundCore(bot, localStorage, 'online self restored during enemy hold'")
          || text.includes("clearEnemyReloginHoldForTickBoundCore(bot, localStorage, 'online self restored during enemy hold'"),
        'main tick does not clear stale enemy hold after online recovery'
      );
      assert(text.includes('enemyHoldRemainingMs > 0 && self && isAlive(self) && enemyHoldControl.wsOpen'), 'enemy hold recovery is not gated on alive self and online websocket');
    });
  }

  check('combat-log daily summary merges all daily JSONL important logs', () => {
    const dailySummary = readText('combat-log-service/daily-summary.js');
    assert(dailySummary.includes('listJsonlFiles(dayDir)'), 'daily summary does not scan the day directory');
    assert(dailySummary.includes('function walk(dir)') && dailySummary.includes("item.name.endsWith('.jsonl')"), 'daily summary does not recursively read all JSONL files');
    assert(dailySummary.includes("item.type === 'important-log'") || dailySummary.includes("entry.type === 'important-log'"), 'daily summary does not filter important logs');
    assert(dailySummary.includes('importantEventsById'), 'daily summary does not dedupe important logs by id');
    assert(dailySummary.includes('sessions.set(sessionPayload.sessionId, mergeSession(sessions.get(sessionPayload.sessionId), sessionPayload))'), 'daily summary does not merge session-start/end records');
    assert(dailySummary.includes('staminaSpentMs === 123000'), 'daily summary self-test does not cover cross-file stamina merge');
    assert(dailySummary.includes("event.importantType === 'combat-summary'"), 'daily summary does not consume combat-summary events');
    assert(dailySummary.includes('## 登录统计') && dailySummary.includes('## 活跃玩家战斗统计'), 'daily summary does not print both required report dimensions');
    assert(dailySummary.includes('## 实际战斗收益统计') && dailySummary.includes('buildBattleOutcomes'), 'daily summary does not print actual battle profit outcomes');
    assert(dailySummary.includes('formatStaminaSpent(session.staminaSpentMs)') && dailySummary.includes('formatStaminaSpent(combat.staminaSpentMs)'), 'daily summary stamina columns are not formatted through unitless helper');
    assert(!dailySummary.includes('staminaSpentMs) / 1000)}s') && !dailySummary.includes('combatStaminaSpentMs / 1000)}s'), 'daily summary stamina output still includes seconds unit');
    assert(dailySummary.includes('activeKillCount === 2') && dailySummary.includes('afkKillCount === 1') && dailySummary.includes('activeUnconfirmedKillCount === 1') && dailySummary.includes('activeUnconfirmedDropCoins === 30'), 'daily summary self-test does not cover AFK/active confirmed and unconfirmed kill buckets');
    assert(dailySummary.includes('actualDailyStaminaTotals.staminaSpentMs === 20000'), 'daily summary self-test does not cover actual 1d stamina delta totals');
    assert(dailySummary.includes('report.combats[0].staminaSpentMs === 2500'), 'daily summary self-test does not cover combat stamina');
    assert(dailySummary.includes('report.battleOutcomes.length === 6') && dailySummary.includes('battleOutcomeKills === 5') && dailySummary.includes('battleOutcomeFailures === 1') && dailySummary.includes('chat-confirmed unpicked kill'), 'daily summary self-test does not cover actual battle profit outcomes');
    assert(dailySummary.includes('combatHasActualEngagement(combat)'), 'daily summary does not filter non-engaged combat summaries');
    assert(dailySummary.includes('engaged enemy-leave-wait combat was incorrectly filtered out'), 'daily summary self-test does not cover engaged immediate exit combats');
    assert(dailySummary.includes('combatIsNonCombatSafetyClosure(combat)'), 'daily summary does not filter non-combat safety avoidance closures');
    assert(dailySummary.includes('safety avoidance was incorrectly counted as combat'), 'daily summary self-test does not cover safety avoidance filtering');
    assert(dailySummary.includes("const DEFAULT_REPORT_ROOT = path.join(__dirname, '..', 'docs', 'reports')"), 'daily summary default report root is not docs/reports');
    assert(dailySummary.includes('function defaultDailyReportPath(day)') && dailySummary.includes('`daily-${day}.md`'), 'daily summary default output path helper is missing');
    assert(dailySummary.includes('--stdout') && dailySummary.includes('process.stdout.write(markdown)'), 'daily summary cannot print markdown explicitly after default file output change');
    assert(dailySummary.includes('default daily report path is not under docs/reports/YYYY-MM'), 'daily summary self-test does not cover default report path');
  });

  check('coin balance reports default to unified reports directory', () => {
    const coinReport = readText('scripts/coin-balance-report.js');
    assert(coinReport.includes("const DEFAULT_REPORT_ROOT = path.join(ROOT, 'docs', 'reports')"), 'coin report default root is not docs/reports');
    assert(coinReport.includes('function defaultMonthlyReportPath(month)') && coinReport.includes('`monthly-${month}.md`'), 'coin report default monthly output helper is missing');
    assert(coinReport.includes('docs/reports/YYYY-MM/monthly-YYYY-MM.md'), 'coin report help text does not mention unified monthly path');
    assert(coinReport.includes("defaultMonthlyReportPath('2026-06')"), 'coin report self-test does not cover unified monthly path');
  });

  check('combat-log daily summary exposes incomplete exits and no-self text', () => {
    const dailySummary = readText('combat-log-service/daily-summary.js');
    assert(dailySummary.includes('日志尚未收口：下一次登录在'), 'daily summary does not show next-login context for open sessions');
    assert(dailySummary.includes('inferredExit') && dailySummary.includes('推断收口：${verboseExitText(session.exitReason, session.exitSummary, session.exitEvidence)}'), 'daily summary does not keep inferred exits visible');
    assert(dailySummary.includes('已登录但自身实体不可见，退出等待重连'), 'daily summary does not explain no-self exits');
    assert(dailySummary.includes('!item.inferredExit'), 'inferred exits still count as completed sessions');
    assert(dailySummary.includes('日期：${report.day') && dailySummary.includes('登录合计：明确退出'), 'daily summary top-level report text is not Chinese');
    assert(dailySummary.includes('互斥一级类别') && dailySummary.includes('胜利、失败、我方主动退出、敌方逃离、目标切换'), 'daily summary does not explain mutually exclusive top-level outcomes');
    assert(dailySummary.includes('combatReasonText') && dailySummary.includes('敌方逃离：目标脱离交火范围') && dailySummary.includes('敌方逃离：目标消失或脱离交火范围'), 'daily summary does not fold target loss into enemy flee text');
    assert(dailySummary.includes('HP-disadvantage exit result text is not exclusive') && dailySummary.includes('low-HP exit result text is not exclusive') && dailySummary.includes('critical-HP exit result text is not exclusive'), 'daily summary self-test does not cover exclusive self-exit labels');
    assert(dailySummary.includes('recovery wait result text is not folded into enemy flee') && dailySummary.includes('post-combat timeout result text is not folded into enemy flee') && dailySummary.includes('target-switched combat result text is not exclusive') && dailySummary.includes('enemy leave wait result text does not include concrete exit evidence'), 'daily summary self-test does not cover exclusive combat result labels');
    assert(dailySummary.includes('避开无敌目标属于安全移动，不计入本表'), 'daily summary does not explain safety avoidance exclusion');
    assert(!dailySummary.includes('恢复期遇到附近玩家'), 'daily summary still implies ordinary nearby-player recovery flee behavior');
    assert(!dailySummary.includes('恢复期安全撤开'), 'daily summary still exposes safety avoidance as a combat result label');
    assert(!dailySummary.includes('战后恢复：停止交战'), 'daily summary still exposes post-combat recovery as a combat result');
    assert(!dailySummary.includes('交火停止'), 'daily summary still exposes post-combat timeout as a combat result');
    assert(!dailySummary.includes('主动退出本局'), 'daily summary still uses the old self-exit top-level label');
    assert(!dailySummary.includes('战斗劣势主动退出'), 'daily summary still uses a competing self-exit top-level label');
    assert(dailySummary.includes('疑似表示只有聊天或掉落值线索') && dailySummary.includes('unconfirmedDropCoins'), 'daily summary does not separate confirmed kill rewards from unconfirmed drops');
    assert(!dailySummary.includes('登录合计: completed='), 'daily summary still prints English aggregate field names');
  });

  check('combat-log package exposes daily summary commands', () => {
    const pkg = readJson('combat-log-service/package.json');
    assert(pkg.scripts && pkg.scripts.cleanup === 'node cleanup-logs.js', 'combat-log cleanup npm script missing');
    assert(pkg.scripts && pkg.scripts['cleanup:self-test'] === 'node cleanup-logs.js --self-test', 'combat-log cleanup self-test npm script missing');
    assert(pkg.scripts && pkg.scripts.daily === 'node daily-summary.js', 'daily summary npm script missing');
    assert(pkg.scripts && pkg.scripts['daily:self-test'] === 'node daily-summary.js --self-test', 'daily summary self-test npm script missing');
    assert(pkg.scripts && pkg.scripts.replay === 'node replay-combat.js', 'combat replay npm script missing');
    assert(pkg.scripts && pkg.scripts['replay:self-test'] === 'node replay-combat.js --self-test', 'combat replay self-test npm script missing');
    assert(String(pkg.scripts.test || '').includes('server.js --self-test'), 'npm test does not run collector self-test');
    assert(String(pkg.scripts.test || '').includes('cleanup-logs.js --self-test'), 'npm test does not run cleanup self-test');
    assert(String(pkg.scripts.test || '').includes('daily-summary.js --self-test'), 'npm test does not run daily summary self-test');
    assert(String(pkg.scripts.test || '').includes('replay-combat.js --self-test'), 'npm test does not run combat replay self-test');
  });

  check('combat-log collector splits large logs by kind', () => {
    const server = readText('combat-log-service/server.js');
    assert(server.includes('splitFiles: true'), 'collector split-files default is not enabled');
    assert(server.includes("if (entry?.criticalLog || entry?.exitAuditLogId || /audit|critical/.test(type)) return 'audit'"), 'collector does not split audit logs');
    assert(server.includes("if (entry?.importantLog || type === 'important-log') return 'important'"), 'collector does not split important logs');
    assert(server.includes("if (/^combat(?:-|$)/.test(type)) return 'combat'"), 'collector does not split combat logs');
    assert(server.includes('path.join(rootDir, day, logKind(payload, entry), `${combatId}.jsonl`)'), 'collector does not write kind subdirectories');
    assert(server.includes('--flat-files'), 'collector does not expose legacy flat-file switch');
    assert(server.includes('missing split file'), 'collector self-test does not cover split files');
  });

  check('combat-log service schedules detailed-log retention cleanup', () => {
    const server = readText('combat-log-service/server.js');
    const cleanup = readText('combat-log-service/cleanup-logs.js');
    assert(server.includes("const { cleanupDetailedLogs } = require('./cleanup-logs');"), 'collector does not import cleanup helper');
    assert(server.includes('cleanupRetentionDays: 3'), 'collector default detailed-log retention is not 3 days');
    assert(server.includes("cleanupAt: '03:30'"), 'collector default daily cleanup time is not 03:30');
    assert(server.includes('--no-cleanup'), 'collector does not expose cleanup disable switch');
    assert(server.includes('scheduleDailyCleanup(options)'), 'collector does not schedule daily cleanup');
    assert(server.includes("runCleanupOnce(options, 'startup')"), 'collector does not run cleanup on startup');
    assert(cleanup.includes("const SPLIT_DETAIL_DIRS = new Set(['combat', 'misc']);"), 'cleanup does not target detailed split directories');
    assert(cleanup.includes("return !/^(?:important|audit)(?:[-_.]|$)/i.test(entry.name);"), 'cleanup does not retain legacy important/audit JSONL');
    assert(cleanup.includes('daily Markdown reports should be retained'), 'cleanup self-test does not retain daily reports');
  });

  check('combat replay tool verifies reference combat improvement', () => {
    const replay = readText('combat-log-service/replay-combat.js');
    assert(replay.includes('function dynamicAimForShot'), 'combat replay tool does not emulate dynamic aim strategy');
    assert(replay.includes('liveDivergencePrecisionCm: 1200'), 'combat replay tool does not use live-divergence threshold');
    assert(replay.includes('dynamic replay did not improve hits'), 'combat replay self-test does not require hit improvement');
    assert(replay.includes('startLine: 12167') && replay.includes('endLine: 12351'), 'combat replay self-test does not cover the xmsthc reference fight');
    assert(replay.includes('2026-06-15-xmsthc-authority-divergence') && replay.includes('startLine: 5570') && replay.includes('endLine: 6237'), 'combat replay self-test does not cover the 2026-06-15 xmsthc authority-divergence fight');
    assert(replay.includes('2026-06-15-raf-authority-divergence') && replay.includes('startLine: 4421') && replay.includes('endLine: 5469'), 'combat replay self-test does not cover the 2026-06-15 raf authority-divergence fight');
    assert(replay.includes('2026-06-16-mango-out-of-range-authority') && replay.includes('expectExtraSuppression'), 'combat replay self-test does not cover immediate out-of-range authority suppression');
  });

  check('source bot delegates self-test coverage to the extracted node self-test module', () => {
    assert(sourceBot.includes("require('./src/node/run-self-test')"), 'run-self-test module import not found');
    assert(sourceBot.includes('if (options.selfTest) {') && sourceBot.includes('runSelfTest();'), 'self-test entrypoint no longer delegates to runSelfTest');
    assert(nodeSelfTestSource.includes('function runSelfTest() {'), 'run-self-test module does not export a runSelfTest function');
    assert(nodeSelfTestSource.includes("module.exports = {\n  runSelfTest"), 'run-self-test module does not export runSelfTest');
  });

  check('run-self-test module covers stationary full-stamina Active non-combat profit self-tests', () => {
    assert(
      /name: 'stationary full-stamina active zero drop does not beat coin pickup'[\s\S]*current_join_mode: 'Active'[\s\S]*stamina_5s_remaining_milli: 10000[\s\S]*coins: \[\{ drop_id: 2, x: 5000, y: 0, amount: 1 \}\][\s\S]*want: 'coin'/.test(nodeSelfTestSource),
      'stationary full-stamina Active zero-drop no-combat self-test not found'
    );
    assert(
      /name: 'stationary full-stamina active with drop is non-combat profit attack'[\s\S]*current_join_mode: 'Active'[\s\S]*death_reward_preview: 20[\s\S]*want: 'attack:false:best-opportunity-afk-drop-target'/.test(nodeSelfTestSource),
      'stationary full-stamina Active profit attack non-combat self-test not found'
    );
  });

  check('run-self-test module covers visible invulnerable coin blocking self-tests', () => {
    assert(nodeSelfTestSource.includes("name: 'invulnerable aliases detect positive field despite earlier zero alias'"), 'invulnerable alias precedence self-test not found');
    assert(nodeSelfTestSource.includes('invulnerableRemainingMs: 5000'), 'invulnerableRemainingMs self-test field not found');
    assert(nodeSelfTestSource.includes("name: 'full hp ignores idle invulnerable active in caution range'"), 'idle invulnerable non-avoidance self-test not found');
    assert(nodeSelfTestSource.includes("name: 'full hp avoids moving invulnerable active in caution range'"), 'moving invulnerable avoidance self-test not found');
    assert(
      /name: 'full hp ignores idle invulnerable active in caution range'[\s\S]*invulnerable_remaining_ticks: 5[\s\S]*want: 'coin'/.test(nodeSelfTestSource),
      'idle invulnerable self-test does not keep ordinary coin action'
    );
    assert(
      /name: 'full hp avoids moving invulnerable active in caution range'[\s\S]*vx: -10[\s\S]*invulnerable_remaining_ticks: 5[\s\S]*want: 'flee'/.test(nodeSelfTestSource),
      'moving invulnerable self-test does not preserve avoidance'
    );
    assert(nodeSelfTestSource.includes("name: 'visible invulnerable player blocks nearby ordinary coin before avoidance flee'"), 'visible invulnerable coin block self-test not found');
    assert(
      /name: 'visible invulnerable player blocks nearby ordinary coin before avoidance flee'[\s\S]*x: 25500[\s\S]*native: true[\s\S]*invulnerableRemainingMs: 5000[\s\S]*x: 12300[\s\S]*amount: 1[\s\S]*want: 'wait-for-visible-coin-refresh'/.test(nodeSelfTestSource),
      'visible invulnerable coin block self-test does not model the screenshot distance'
    );
    assert(nodeSelfTestSource.includes("name: 'snapshot-only invulnerable player does not block visible ordinary coin'"), 'snapshot-only invulnerable non-blocking self-test not found');
    assert(nodeSelfTestSource.includes('.filter(e => e.native)\n        .filter(isAvoidanceThreat)'), 'coin threat self-test path does not require native visible invulnerable players');
  });

  check('run-self-test module covers low-value active and high-value coin priority self-tests', () => {
    assert(sourceRuntimeText.includes('function isLowValueActiveCombatTarget'), 'low-value Active combat gate not found');
    assert(sourceRuntimeText.includes('function proactiveActiveCombatStaminaAffordable'), 'active combat long-stamina budget gate not found');
    assert(sourceRuntimeText.includes('function highValueVisibleCoinPriorityNeeded'), 'high-value coin priority gate not found');
    assert(sourceRuntimeText.includes("'high-value-visible-coin-priority'"), 'high-value visible coin action reason not found');
    assert(nodeSelfTestSource.includes("name: 'low-drop active incoming bullet beats low-value coin inside attack range'"), 'low-drop incoming bullet combat self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low-drop active in range does not beat foot coin without incoming fire'"), 'low-drop no-incoming coin self-test not found');
    assert(nodeSelfTestSource.includes("name: 'active combat waits for long stamina budget before proactive fight'"), 'active combat long-stamina budget self-test not found');
    assert(nodeSelfTestSource.includes("name: 'active combat long stamina budget still allows incoming bullet defense'"), 'active combat budget defensive exception self-test not found');
    assert(nodeSelfTestSource.includes("name: 'ordinary one coin near realtime active remains selectable'"), 'ordinary 1-coin Active non-blocking self-test not found');
    assert(nodeSelfTestSource.includes("name: 'healthy high-value coin near realtime active uses normal opportunity path'"), 'high-value coin ordinary Active normal-path self-test not found');
    assert(nodeSelfTestSource.includes("name: 'healthy high-value visible coin beats active combat state'"), 'healthy high-value coin combat override self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low hp existing combat is not interrupted by high-value coin'"), 'low-HP combat high-value coin guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low hp no-threat high-value visible coin beats recovery wait'"), 'low-HP no-threat high-value coin self-test not found');
    assert(nodeSelfTestSource.includes("name: 'healthy high-value coin away from invulnerable active beats flee'"), 'high-value coin invulnerable flee override self-test not found');
    assert(nodeSelfTestSource.includes("name: 'healthy high-value coin overrides incoming bullet pressure'"), 'healthy high-value coin incoming-bullet override self-test not found');
  });

  check('run-self-test module covers visible opportunity ROI self-tests', () => {
    assert(nodeSelfTestSource.includes("name: 'higher roi 200m coin beats 150m coin inside visible pool'"), 'visible coin ROI self-test not found');
    assert(nodeSelfTestSource.includes("name: 'visible high afk drop beats opposite one coin by stamina roi'"), 'visible AFK-vs-coin ROI self-test not found');
    assert(nodeSelfTestSource.includes("name: 'near afk drop target beats far snapshot cluster by yield'"), 'visible AFK-vs-snapshot self-test not found');
    assert(nodeSelfTestSource.includes("name: 'visible afk target ignores richer snapshot-only coins'"), 'explicit visible AFK-before-snapshot self-test not found');
    assert(nodeSelfTestSource.includes("name: '500m drop five afk loses to 100m one coin by pickup travel cost'"), 'full pickup travel cost self-test not found');
    assert(nodeSelfTestSource.includes("name: 'same distance ten coin beats drop ten after kill pickup cost'"), 'same-distance coin-vs-drop pickup cost self-test not found');
    assert(nodeSelfTestSource.includes("name: 'high roi post combat drop at visible edge beats recovery wait'"), 'high-value post-combat recovery pickup self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low roi far post combat drop waits for recovery'"), 'low-ROI post-combat recovery wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low long stamina target-only budget block waits for visible coin refresh'"), 'target-only stamina budget wait reason self-test not found');
    assert(sourceRuntimeText.includes('function dailyStaminaBudgetIsLimiting'), 'daily stamina final-run budget helper not found');
    assert(sourceRuntimeText.includes('function pickNearestDailyStaminaFinalCoin'), 'daily stamina final-run coin picker not found');
    assert(sourceRuntimeText.includes("'daily-stamina-final-visible-coin'"), 'daily stamina final-run action reason not found');
    assert(sourceRuntimeText.includes('!isSnapshotOnlyCoin(coin)') || sourceRuntimeText.includes('filter(coin => !isSnapshotOnlyCoin(coin))'), 'daily stamina final-run does not exclude snapshot-only coins');
    const dailyFinalWrapperIndex = sourceRuntimeText.indexOf('const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoin');
    const dailyFinalCoreIndex = sourceRuntimeText.indexOf('const dailyStaminaFinalCoin = ${pickNearestDailyStaminaFinalCoinCall}');
    const dailyFinalIndex = dailyFinalWrapperIndex > 0 ? dailyFinalWrapperIndex : dailyFinalCoreIndex;
    assert(dailyFinalIndex > 0 && dailyFinalIndex < sourceRuntimeText.indexOf('const localRealtimeCoin = pickRealtimeLocalCoin'), 'daily stamina final-run does not run before ordinary ROI opportunity selection');
    assert(nodeSelfTestSource.includes("name: 'low daily stamina goes to nearest visible coin instead of waiting for roi'"), 'low daily stamina final-run visible coin self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low daily stamina does not use snapshot-only final coin'"), 'low daily stamina snapshot-only exclusion self-test not found');
	    assert(nodeSelfTestSource.includes("name: 'oscillating opportunity pair locks after repeated switches'"), 'opportunity oscillation lock self-test not found');
	    assert(sourceRuntimeText.includes('function visibleCoinSourcesConfirmTargetMissing'), 'visible missing coin confirmation helper not found');
	    assert(sourceRuntimeText.includes('function clearMissingVisibleCoinTarget'), 'visible missing coin clear helper not found');
	    assert(sourceRuntimeText.includes("'visible-coin-disappeared'"), 'visible missing coin clear reason not found');
	    assert(nodeSelfTestSource.includes("name: 'visible missing held coin switches to current visible coin'"), 'visible missing held coin switch self-test not found');
	    assert(nodeSelfTestSource.includes("name: 'high drop kill waits at last target position before coin refresh'"), 'post-kill drop wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'delayed high drop kill waits after target resolution'"), 'delayed post-kill drop wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'zero reward residual high drop target still triggers post kill wait'"), 'residual target post-kill wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'expired high drop post kill wait resumes normal profit'"), 'expired post-kill wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'alive high drop target does not trigger post kill wait'"), 'alive-target no-wait self-test not found');
    assert(nodeSelfTestSource.includes("name: 'unshot high drop target disappearance does not trigger post kill wait'"), 'unshot-target no-wait self-test not found');
    assert(nodeSelfTestSource.includes("want: 'seek-enemy:approach-afk-drop-target'"), 'visible AFK-vs-coin expected action not found');
  });

  check('run-self-test module covers native visible coin route self-tests', () => {
    assert(nodeSelfTestSource.includes("name: 'visible coin route beats closer single coin by route roi'"), 'coin route ROI self-test not found');
    assert(nodeSelfTestSource.includes("name: 'held coin route keeps first coin through near tie replans'"), 'coin route first-target hold self-test not found');
    assert(nodeSelfTestSource.includes("name: 'held coin route switches first coin when route score is clearly better'"), 'coin route first-target clear-switch self-test not found');
    assert(nodeSelfTestSource.includes("name: 'held nearby single coin blocks farther coin route first target'"), 'held single coin route-block self-test not found');
    assert(nodeSelfTestSource.includes("name: 'held nearby single coin can become same-first coin route'"), 'held single coin same-first route self-test not found');
    assert(nodeSelfTestSource.includes("name: 'same first coin route keeps overlay metadata when single coin roi is higher'"), 'same-first-coin route overlay self-test not found');
    assert(nodeSelfTestSource.includes("name: 'coin route does not skip much closer local coin'"), 'coin route closer-first self-test not found');
    assert(nodeSelfTestSource.includes("name: 'visible afk drop still beats weaker coin route by stamina roi'"), 'AFK-vs-coin-route ROI self-test not found');
    assert(nodeSelfTestSource.includes("name: 'coin route leg threat block rejects path through invulnerable danger'"), 'coin route invulnerable threat-block self-test not found');
    assert(nodeSelfTestSource.includes("name: 'coin route rejects unaffordable whole route'"), 'coin route stamina budget self-test not found');
      assert(nodeSelfTestSource.includes("name: 'near realtime coin remains first target before known field route'"), 'near realtime coin first-target route self-test not found');
      assert(nodeSelfTestSource.includes('coinRoute?.legCount'), 'coin route metadata self-test assertion not found');
      assert(nodeSelfTestSource.includes('coinRoute?.points?.length'), 'coin route point metadata self-test assertion not found');
  });

  check('target overlay renders selected coin route points', () => {
    assert(targetOverlaySourceModule.includes('function targetOverlayRoutePoints'), 'target overlay route point resolver not found');
    assert(targetOverlaySourceModule.includes('function targetOverlayRoutePointKey'), 'target overlay route target-key helper not found');
    assert(targetOverlaySourceModule.includes('const renderX = firstFiniteNumber(value.visual_x, value.visualX, value.render_x, value.renderX)'), 'target overlay does not read visual/render x coordinates');
    assert(targetOverlaySourceModule.includes('const renderY = firstFiniteNumber(value.visual_y, value.visualY, value.render_y, value.renderY)'), 'target overlay does not read visual/render y coordinates');
    assert(targetOverlaySourceModule.includes('const x = firstFiniteNumber(\n      renderX,'), 'target overlay does not prefer visual/render x coordinates');
    assert(targetOverlaySourceModule.includes('const y = firstFiniteNumber(\n      renderY,'), 'target overlay does not prefer visual/render y coordinates');
    assert(targetOverlaySourceModule.includes('decision?.coinRoute || target?.coinRoute'), 'target overlay does not read route metadata from decisions');
    assert(targetOverlaySourceModule.includes('if (targetKey && firstKey && targetKey !== firstKey) return [];'), 'target overlay does not suppress stale/mismatched coin routes');
    assert(targetOverlaySourceModule.includes('for (const point of routePoints) ctx.lineTo(point.x, point.y);'), 'target overlay does not connect route points');
    assert(targetOverlaySourceModule.includes('function targetOverlayProjection'), 'target overlay projection resolver not found');
    assert(targetOverlaySourceModule.includes('function targetOverlayPageViewParams'), 'target overlay does not read native page view params');
    assert(targetOverlaySourceModule.includes("typeof viewParams === 'function' ? viewParams : win?.viewParams"), 'target overlay does not prefer the native viewParams projection');
    assert(targetOverlaySourceModule.includes('targetOverlayScaleTextRadiusCm()'), 'target overlay does not use native scaleText radius fallback');
    assert(targetOverlaySourceModule.includes("window.matchMedia?.('(max-aspect-ratio: 1/1)')"), 'target overlay fallback does not mirror native screenCenter aspect rule');
    assert(targetOverlaySourceModule.includes('Math.min(368, Math.max(0, width - 320))'), 'target overlay fallback does not mirror native reserved-left screen center');
    assert(targetOverlaySourceModule.includes('worldOffsetX: worldRect.left - shellRect.left'), 'target overlay does not preserve world-to-shell x offset');
    assert(targetOverlaySourceModule.includes('worldWidth: worldRect.width'), 'target overlay does not preserve native world canvas width for projection');
  });

  check('target overlay renders logged-out login-point safety range', () => {
    assert(targetOverlaySourceModule.includes('function targetOverlayLoginPointState'), 'login-point overlay state resolver not found');
    assert(targetOverlaySourceModule.includes('function drawLoginPointOverlay'), 'login-point overlay draw helper not found');
    assert(targetOverlaySourceModule.includes('targetOverlayHasAliveSelf()'), 'login-point overlay is not gated to logged-out/no-self states');
    assert(targetOverlaySourceModule.includes('loginPointSafetyStatus()'), 'login-point overlay does not reuse login-point safety status');
    assert(targetOverlaySourceModule.includes('LOGIN_POINT_SAFETY_KEY'), 'login-point overlay does not fall back to persisted safety state');
    assert(targetOverlaySourceModule.includes('ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2)'), 'login-point overlay does not draw the safety radius');
    assert(targetOverlaySourceModule.includes('drawLoginPointOverlay(ctx, view, loginPointOverlay)'), 'target overlay render path does not draw login-point overlay');
  });

  check('coin diagnostics expose filtered visible coin candidates', () => {
    assert(strategyCoinDiagnosticsSource.includes('function buildCoinDiagnostics'), 'strategy coin diagnostics builder not found');
    assert(strategyCoinDiagnosticsSource.includes('function addCoinFilterDiagnostic'), 'strategy coin filter diagnostic recorder not found');
    assert(coinSafetySourceModule.includes("require('./runtime/coin-diagnostics')"), 'coin-safety source does not import coin diagnostics through the browser runtime helper module');
    assert(!coinSafetySourceModule.includes("require('../strategy/coin-diagnostics')"), 'coin-safety source still imports coin diagnostics directly from strategy');
    assert(coinDiagnosticsRuntimeModule.includes("require('../../strategy/coin-diagnostics')"), 'browser coin diagnostics helper module does not reuse the strategy coin diagnostics helpers');
    assert(coinDiagnosticsRuntimeModule.includes('coinDiagnosticsSummary') && coinDiagnosticsRuntimeModule.includes('addCoinFilterDiagnostic') && coinDiagnosticsRuntimeModule.includes('buildCoinDiagnostics'), 'browser coin diagnostics helper module exports are incomplete');
    assert(strategyCoinDiagnosticsSource.includes("reason: 'snapshot-only'"), 'strategy snapshot-only coin diagnostics not exposed');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-diagnostics')"), 'generated remote runtime does not hand coin diagnostics helpers to the bundler');
    assert(distSource.includes('function buildCoinDiagnostics'), 'bundled dist does not contain coin diagnostics builder');
    assert(distSource.includes('function addCoinFilterDiagnostic'), 'bundled dist does not contain coin filter diagnostic recorder');
    assert(distSource.includes("reason: 'snapshot-only'") || distSource.includes('reason: "snapshot-only"'), 'bundled dist snapshot-only coin diagnostics not exposed');
    assert(coinSafetySourceModule.includes('buildCoinDiagnostics') && coinSafetySourceModule.includes('fn.toString()'), 'coin diagnostics builder is not wired for local helper injection');
    assert(sourceRuntimeText.includes('function recordCoinFilterDiagnostic'), 'coin filter diagnostic recorder not found');
    assert(sourceRuntimeText.includes("recordCoinFilterDiagnostic(c, 'ignored'"), 'ignored coin diagnostics not recorded');
    assert(sourceRuntimeText.includes("recordCoinFilterDiagnostic(c, 'threat-blocked'"), 'threat-blocked coin diagnostics not recorded');
    assert(sourceRuntimeText.includes("reason = 'stamina-unaffordable'") && sourceRuntimeText.includes('coinStaminaAffordableWithDiagnostic'), 'stamina-unaffordable coin diagnostics not recorded');
    assert(strategyCoinDiagnosticsSource.includes("reason: 'snapshot-only'") && (distSource.includes("reason: 'snapshot-only'") || distSource.includes('reason: "snapshot-only"')), 'snapshot-only coin diagnostics not exposed');
    assert(sourceRuntimeText.includes('coinDiagnostics: action.coinDiagnostics || safeJsonClone(bot.coinDiagnostics)'), 'last decision does not carry coin diagnostics');
    assert(combatLogSourceModule.includes('coinDiagnostics: decision?.coinDiagnostics || bot.coinDiagnostics || null'), 'combat logs do not expose coin diagnostics');
    assert(combatLogSourceModule.includes("type: 'coin-diagnostics'"), 'standalone coin diagnostic log entry not found');
    assert(combatLogSourceModule.includes('recordCoinDiagnosticsLog(source, decision || {})'), 'coin diagnostics are not recorded on each log tick');
    assert(combatLogSourceModule.includes('coinDiagnosticsHasLoggableEntry'), 'coin diagnostics log gate not found');
  });

  check('coin motion uses strategy module core', () => {
    assert(strategyCoinMotionSource.includes('function coinDirectionToCore'), 'strategy coin direction core not found');
    assert(strategyCoinMotionSource.includes('function coinPickupPrecisionPulseMsCore'), 'strategy coin pickup pulse core not found');
    assert(strategyCoinMotionSource.includes('function coinAxisLockShouldHoldCore'), 'strategy coin axis lock core not found');
    assert(strategyCoinMotionSource.includes('function coinMotionMetaCore'), 'strategy coin motion metadata core not found');
    const coinMotionRuntimeBody = functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeInlineSource');
    const coinDirectionToCallBody = functionBody(coinMotionRuntimeSourceModule, 'coinDirectionToCall');
    assert(coinMotionRuntimeSourceModule.includes("require('./runtime/coin-motion')"), 'coin-motion runtime source does not import coin motion through the browser runtime helper module');
    assert(!coinMotionRuntimeSourceModule.includes("require('../strategy/coin-motion')"), 'coin-motion runtime source still imports coin motion directly from strategy');
    assert(coinMotionRuntimeModule.includes("require('../../strategy/coin-motion')"), 'browser coin motion helper module does not reuse the strategy coin motion helpers');
    assert(coinMotionRuntimeModule.includes('coinDirectionToCore') && coinMotionRuntimeModule.includes('coinPickupPrecisionPulseMsCore') && coinMotionRuntimeModule.includes('coinMotionMetaCore'), 'browser coin motion helper module exports are incomplete');
    assert(coinMotionRuntimeSourceModule.includes('coinDirectionToCore') && coinMotionRuntimeSourceModule.includes('coinMotionMetaCore'), 'coin-motion runtime source does not wire coin motion helpers');
    assert(coinMotionRuntimeBody.includes('fn.toString()'), 'coin-motion runtime source does not inline coin motion helper text for local builds');
    assert(coinMotionRuntimeBody.includes('function coinMotionCoreOptions'), 'coin-motion runtime wrapper options not found');
    assert(coinMotionRuntimeBody.includes('function applyCoinApproachLockUpdate'), 'coin-motion runtime coin approach lock wrapper not found');
    assert(coinMotionRuntimeBody.includes('coinDirectionToCore(self, target, coinMotionCoreOptions'), 'coin-motion runtime coin direction wrapper does not call strategy core');
    assert(coinMotionRuntimeBody.includes('applyCoinApproachLockUpdate(result.lockUpdate)'), 'coin-motion runtime coin direction wrapper does not apply lock updates');
    assert(coinMotionRuntimeBody.includes("options.bundledRuntime ? ''"), 'coin-motion bundled runtime does not suppress the local coin direction wrapper');
    assert(coinDirectionToCallBody.includes('coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions'), 'coin direction direct-call helper does not call strategy core directly');
    assert(coinDirectionToCallBody.includes('applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate)'), 'coin direction direct-call helper does not apply lock updates');
    assert(opportunityActionsSourceModule.includes("coinDirectionToCall('self', 'coin'"), 'opportunity action source does not use direct coin direction call generator');
    assert(postAttackSourceModule.includes("coinDirectionToCall('self', 'target', 'cfg.patrolPrecisionTolerance'"), 'post-attack source does not use direct coin direction call generator');
    assert(chooseActionSourceModule.includes("coinDirectionToCall('self', 'nearCoin'") && chooseActionSourceModule.includes("coinDirectionToCall('self', 'distantCoin'"), 'choose-action source does not use direct coin direction call generator');
    assert(!coinMotionRuntimeBody.includes('function coinMotionMeta('), 'coin-motion runtime source still keeps metadata wrapper');
    assert(!distSource.includes('function coinMotionMeta('), 'dist remote bot still keeps coin motion metadata wrapper');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-motion')"), 'generated remote runtime does not hand coin motion helpers to the bundler');
    assert(distSource.includes('function coinDirectionToCore'), 'bundled dist does not contain coin direction core');
    assert(distSource.includes('function coinPickupPrecisionPulseMsCore'), 'bundled dist does not contain coin pickup pulse core');
    assert(distSource.includes('function coinMotionCoreOptions'), 'bundled dist coin motion wrapper options not found');
    assert(distSource.includes('function applyCoinApproachLockUpdate'), 'bundled dist coin approach lock wrapper not found');
    assert(!generatedRuntimeSource.includes('function coinDirectionTo('), 'generated remote runtime still keeps coin direction wrapper');
    assert(!distSource.includes('function coinDirectionTo('), 'dist remote bot still keeps coin direction wrapper');
  });

  check('coin target identity uses strategy module core', () => {
    assert(strategyCoinTargetSource.includes('function coinTargetKeyCore'), 'strategy coin target key core not found');
    assert(strategyCoinTargetSource.includes('function coinMatchesTrackedTargetCore'), 'strategy coin target matcher core not found');
    assert(strategyCoinTargetSource.includes('function trackedCoinTargetForCollectionCore'), 'strategy tracked coin target core not found');
    assert(strategyCoinTargetSource.includes('function buildNativeCoinSnapshotCore'), 'strategy native coin snapshot core not found');
    assert(strategyCoinTargetSource.includes('function pointToSegmentDistanceCore'), 'strategy point-to-segment distance core not found');
    assert(strategyCoinTargetSource.includes('function pickIncidentalCoinPickupsCore'), 'strategy incidental pickup core not found');
    assert(strategyCoinTargetSource.includes('function snapshotCoinWorthLongTravelCore'), 'strategy snapshot coin worth core not found');
    assert(strategyCoinTargetSource.includes('function snapshotCoinNavigationReasonCore'), 'strategy snapshot coin reason core not found');
    const coinTargetRuntimeBody = functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeInlineSource');
    assert(coinTargetRuntimeSourceModule.includes("require('./runtime/coin-target')"), 'coin-target runtime source does not import coin target through the browser runtime helper module');
    assert(!coinTargetRuntimeSourceModule.includes("require('../strategy/coin-target')"), 'coin-target runtime source still imports coin target directly from strategy');
    assert(coinTargetRuntimeModule.includes("require('../../strategy/coin-target')"), 'browser coin target helper module does not reuse the strategy coin target helpers');
    assert(coinTargetRuntimeModule.includes('coinTargetKeyCore') && coinTargetRuntimeModule.includes('coinMatchesTrackedTargetCore') && coinTargetRuntimeModule.includes('buildNativeCoinSnapshotCore') && coinTargetRuntimeModule.includes('snapshotCoinNavigationReasonCore'), 'browser coin target helper module exports are incomplete');
    assert(coinTargetRuntimeSourceModule.includes('coinTargetKeyCore') && coinTargetRuntimeSourceModule.includes('snapshotCoinNavigationReasonCore'), 'coin-target runtime source does not wire coin target helpers');
    assert(coinTargetRuntimeBody.includes('fn.toString()'), 'coin-target runtime source does not inline coin target helper text for local builds');
    assert(coinTargetRuntimeBody.includes('function coinTargetCoreOptions'), 'coin-target runtime wrapper options not found');
    assert(!coinTargetRuntimeBody.includes('function trackedCoinTargetForCollection('), 'coin-target runtime source still keeps tracked target wrapper');
    assert(coinTargetRuntimeBody.includes('const target = trackedCoinTargetForCollectionCore({'), 'coin-target runtime collection marker does not call tracked target core directly');
    assert(!coinTargetRuntimeBody.includes('function coinTargetKey('), 'coin-target runtime source still keeps coin target key wrapper');
    assert(!coinTargetRuntimeBody.includes('function coinMatchesTrackedTarget('), 'coin-target runtime source still keeps coin target matcher wrapper');
    assert(coinTargetRuntimeBody.includes('const key = coinTargetKeyCore(target);'), 'coin-target runtime recorder does not call coin target key core directly');
    assert(coinTargetRuntimeBody.includes('coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions())'), 'coin-target runtime visibility check does not call matcher core directly');
    assert(functionBody(combatHistorySourceModule, 'combatHistorySource').includes('const coinKey = coinTargetKeyCore(target)'), 'combat-history source does not call coin target key core directly');
    assert(functionBody(opportunityChoiceSourceModule, 'opportunityChoiceInlineSource').includes('coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions())'), 'opportunity-choice source does not call coin target matcher core directly');
    assert(!distSource.includes('function coinTargetKey('), 'dist remote bot still keeps coin target key wrapper');
    assert(!distSource.includes('function coinMatchesTrackedTarget('), 'dist remote bot still keeps coin target matcher wrapper');
    assert(!distSource.includes('function trackedCoinTargetForCollection('), 'dist remote bot still keeps tracked coin target wrapper');
    for (const wrapperName of ['trackedCoinStillVisible', 'nativeCoinSnapshot', 'rememberNativeCoinSnapshot', 'recordSessionCoinPickup', 'pruneCollectedSnapshotCoin']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still keeps ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still keeps ${wrapperName} wrapper`);
    }
    assert(coinTargetRuntimeBody.includes('return buildNativeCoinSnapshotCore(coins'), 'coin-target runtime native coin snapshot wrapper does not call strategy core');
    assert(coinTargetRuntimeBody.includes('pickIncidentalCoinPickupsCore('), 'coin-target runtime incidental pickup wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return snapshotCoinWorthLongTravelCore(coin, members, totalAmount'), 'source bot snapshot coin worth wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return snapshotCoinNavigationReasonCore(coin'), 'source bot snapshot coin reason wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-target')"), 'generated remote runtime does not hand coin target helpers to the bundler');
    for (const wrapperName of ['snapshotCoinWorthLongTravel', 'snapshotCoinNavigationReason']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('snapshotCoinWorthLongTravelCore(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount, coinTargetCoreOptions())'), 'generated snapshot sticky path does not call snapshot worth core directly');
    assert(generatedRuntimeSource.includes('snapshotCoinNavigationReasonCore(localRealtimeCoin, coinTargetCoreOptions())'), 'generated local realtime coin fallback does not call snapshot reason core directly');
    assert(distSource.includes('snapshotCoinWorthLongTravelCore(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount, coinTargetCoreOptions())'), 'bundled dist snapshot sticky path does not call snapshot worth core directly');
    assert(distSource.includes('snapshotCoinNavigationReasonCore(localRealtimeCoin, coinTargetCoreOptions())'), 'bundled dist local realtime coin fallback does not call snapshot reason core directly');
    assert(distSource.includes('function coinTargetKeyCore'), 'bundled dist does not contain coin target key core');
    assert(distSource.includes('function coinMatchesTrackedTargetCore'), 'bundled dist does not contain coin target matcher core');
    assert(distSource.includes('function trackedCoinTargetForCollectionCore'), 'bundled dist does not contain tracked coin target core');
    assert(distSource.includes('function buildNativeCoinSnapshotCore'), 'bundled dist does not contain native coin snapshot core');
    assert(distSource.includes('function pointToSegmentDistanceCore'), 'bundled dist does not contain point-to-segment distance core');
    assert(distSource.includes('function pickIncidentalCoinPickupsCore'), 'bundled dist does not contain incidental pickup core');
    assert(distSource.includes('function snapshotCoinWorthLongTravelCore'), 'bundled dist does not contain snapshot coin worth core');
    assert(distSource.includes('function snapshotCoinNavigationReasonCore'), 'bundled dist does not contain snapshot coin reason core');
  });

  check('coin progress failure helpers use strategy module core', () => {
    assert(strategyCoinProgressSource.includes('function coinFailureIgnoreCore'), 'strategy coin failure ignore core not found');
    assert(strategyCoinProgressSource.includes('function staleCoinEscapeDirectionCore'), 'strategy stale coin escape core not found');
    assert(strategyCoinProgressSource.includes('function coinProgressIntentCore'), 'strategy coin progress intent core not found');
    assert(strategyCoinProgressSource.includes('function coinAttemptExpiredCore'), 'strategy coin attempt expiry core not found');
    assert(strategyCoinProgressSource.includes('function updateCoinAttemptCore'), 'strategy coin attempt update core not found');
    assert(strategyCoinProgressSource.includes('function updateCoinProgressRecordCore'), 'strategy coin progress record core not found');
    assert(strategyCoinProgressSource.includes('function buildIgnoredCoinProgressCore'), 'strategy ignored coin progress core not found');
    assert(strategyCoinProgressSource.includes('function buildIgnoredCoinPatrolActionCore'), 'strategy ignored coin patrol action core not found');
    assert(strategyCoinProgressSource.includes('function coinIgnoreCleanupIntentCore'), 'strategy coin ignore cleanup intent core not found');
    assert(coinProgressRuntimeSourceModule.includes('function bundledCoinProgressRuntimeSource()'), 'bundled coin-progress runtime source factory not found');
    assert(coinProgressRuntimeSourceModule.includes('function coinProgressRuntimeInlineSource(helpers = {}, options = {})'), 'inline coin-progress runtime source factory not found');
    assert(coinProgressRuntimeSourceModule.includes('function coinProgressRuntimeSource(options = {})'), 'coin-progress runtime source factory not found');
    assert(coinProgressRuntimeSourceModule.includes('module.exports = {\n  bundledCoinProgressRuntimeSource,\n  coinProgressRuntimeInlineSource,\n  coinProgressRuntimeSource,\n  trackCoinProgressCall\n}'), 'coin-progress runtime source module export not found');
    assert(coinProgressRuntimeSourceModule.includes("require('./src/browser/runtime/coin-progress')"), 'coin-progress runtime source does not expose a bundler-owned coin-progress require');
    assert(coinProgressRuntimeSourceModule.includes('if (options.bundledRuntime) return bundledCoinProgressRuntimeSource();'), 'coin-progress runtime source factory does not switch to bundler-owned source in remote builds');
    assert(functionBody(coinProgressRuntimeSourceModule, 'coinProgressRuntimeInlineSource').includes('String.raw`'), 'coin-progress inline runtime source factory does not return raw browser source');
    assert(coinProgressRuntimeSourceModule.includes("require('./runtime/coin-progress')"), 'coin-progress runtime source does not import coin progress through browser runtime adapter');
    assert(!coinProgressRuntimeSourceModule.includes("require('../strategy/coin-progress')"), 'coin-progress runtime source still imports coin progress directly from strategy');
    assert(coinProgressRuntimeModule.includes("require('../../strategy/coin-progress')"), 'coin-progress runtime adapter does not reuse strategy module core');
    assert(coinProgressRuntimeModule.includes('coinFailureIgnoreCore') && coinProgressRuntimeModule.includes('coinIgnoreCleanupIntentCore'), 'coin-progress runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/coin-progress.js'"), 'bundler spike does not import coin progress runtime adapter');
    assert(bundlerSpikeEntrySource.includes('coinProgress.coinFailureIgnoreCore('), 'bundler spike does not execute coin progress failure helper');
    assert(bundlerSpikeBuildSource.includes('status.coinProgressIgnoreMs === 800'), 'bundler spike self-test does not assert coin progress failure execution');
    const coinProgressRuntimeBody = functionBody(coinProgressRuntimeSourceModule, 'coinProgressRuntimeInlineSource');
    const trackCoinProgressCallBody = functionBody(coinProgressRuntimeSourceModule, 'trackCoinProgressCall');
    assert(coinProgressRuntimeBody.includes('fn.toString()'), 'coin-progress runtime source does not inline coin progress helper text for local builds');
    assert(coinProgressRuntimeBody.includes('function trackCoinProgress'), 'coin-progress runtime source factory does not include trackCoinProgress wrapper');
    assert(coinProgressRuntimeBody.includes("options.bundledRuntime ? ''"), 'coin-progress bundled runtime does not suppress local progress wrappers');
    assert(trackCoinProgressCallBody.includes('coinProgressIntentCore(progressAction)'), 'coin-progress direct-call helper does not call progress intent core');
    assert(trackCoinProgressCallBody.includes('coinFailureIgnoreCore(bot.coinFailures.get(progressId)'), 'coin-progress direct-call helper does not call failure ignore core');
    assert(trackCoinProgressCallBody.includes('staleCoinEscapeDirectionCore(progressAction, progressSelf'), 'coin-progress direct-call helper does not call stale escape core');
    assert(trackCoinProgressCallBody.includes('coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId)'), 'coin-progress direct-call helper does not call cleanup core');
    assert(coinProgressRuntimeSourceModule.includes('coinFailureIgnoreCore'), 'coin-progress source does not wire coin failure ignore core');
    assert(coinProgressRuntimeSourceModule.includes('staleCoinEscapeDirectionCore'), 'coin-progress source does not wire stale coin escape core');
    assert(coinProgressRuntimeSourceModule.includes('coinProgressIntentCore'), 'coin-progress source does not wire coin progress intent core');
    assert(coinProgressRuntimeSourceModule.includes('coinAttemptExpiredCore'), 'coin-progress source does not wire coin attempt expiry core');
    assert(coinProgressRuntimeSourceModule.includes('updateCoinAttemptCore'), 'coin-progress source does not wire coin attempt update core');
    assert(coinProgressRuntimeSourceModule.includes('updateCoinProgressRecordCore'), 'coin-progress source does not wire coin progress record core');
    assert(coinProgressRuntimeSourceModule.includes('buildIgnoredCoinProgressCore'), 'coin-progress source does not wire ignored coin progress core');
    assert(coinProgressRuntimeSourceModule.includes('buildIgnoredCoinPatrolActionCore'), 'coin-progress source does not wire ignored coin patrol action core');
    assert(coinProgressRuntimeSourceModule.includes('coinIgnoreCleanupIntentCore'), 'coin-progress source does not wire coin ignore cleanup intent core');
    assert(sourceRuntimeText.includes('function coinProgressCoreOptions'), 'source bot coin progress runtime wrapper options not found');
    assert(sourceRuntimeText.includes('coinFailureIgnoreCore(bot.coinFailures.get(id)'), 'source bot coin failure wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('staleCoinEscapeDirectionCore(action, self'), 'source bot stale coin escape wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('coinAttemptExpiredCore(attempt, t, options)'), 'source bot coin attempt cleanup does not call strategy core');
    assert(sourceRuntimeText.includes('coinProgressIntentCore(action)'), 'source bot coin intent wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('updateCoinAttemptCore(bot.coinAttempts.get'), 'source bot coin attempt wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('updateCoinProgressRecordCore(previous, attempt, distance, t, options)'), 'source bot coin progress wrapper does not call strategy core');
    assert(sourceRuntimeText.includes("buildIgnoredCoinProgressCore(id, attempt, distance, t, ignoreUntil, 'stuck')"), 'source bot stuck ignored progress does not call strategy core');
    assert(sourceRuntimeText.includes("buildIgnoredCoinProgressCore(id, bot.coinProgress, distance, t, ignoreUntil, 'progress')"), 'source bot no-progress ignored progress does not call strategy core');
    assert(sourceRuntimeText.includes('buildIgnoredCoinPatrolActionCore('), 'source bot ignored coin action does not call strategy core');
    assert(sourceRuntimeText.includes('function clearIgnoredCoinRuntimeState'), 'source bot ignored coin cleanup wrapper not found');
    assert(sourceRuntimeText.includes('coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, id)'), 'source bot ignored coin cleanup wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('clearIgnoredCoinRuntimeState(id)'), 'source bot ignored coin branches do not call cleanup wrapper');
    assert(sourceRuntimeText.includes('bot.coinFailures.set(id') && sourceRuntimeText.includes('bot.ignoredCoins.set(id'), 'source bot coin failure wrapper does not retain runtime state writes');
    assert(sourceRuntimeText.includes('bot.staleCoinEscape = result.state'), 'source bot stale coin escape wrapper does not retain runtime state write');
    assert(sourceRuntimeText.includes('bot.coinAttempts.set(id, attempt)'), 'source bot coin attempt wrapper does not retain runtime map write');
    assert(sourceRuntimeText.includes('bot.coinProgress = progressResult.progress'), 'source bot coin progress wrapper does not retain runtime state write');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-progress')"), 'generated remote runtime does not hand coin progress helpers to the bundler');
    assert(distSource.includes('function coinFailureIgnoreCore'), 'bundled dist does not contain coin failure ignore core');
    assert(distSource.includes('function staleCoinEscapeDirectionCore'), 'bundled dist does not contain stale coin escape core');
    assert(distSource.includes('function coinProgressIntentCore'), 'bundled dist does not contain coin progress intent core');
    assert(distSource.includes('function coinAttemptExpiredCore'), 'bundled dist does not contain coin attempt expiry core');
    assert(distSource.includes('function updateCoinAttemptCore'), 'bundled dist does not contain coin attempt update core');
    assert(distSource.includes('function updateCoinProgressRecordCore'), 'bundled dist does not contain coin progress record core');
    assert(distSource.includes('function buildIgnoredCoinProgressCore'), 'bundled dist does not contain ignored coin progress core');
    assert(distSource.includes('function buildIgnoredCoinPatrolActionCore'), 'bundled dist does not contain ignored coin patrol action core');
    assert(distSource.includes('function coinIgnoreCleanupIntentCore'), 'bundled dist does not contain coin ignore cleanup intent core');
    assert(!generatedRuntimeSource.includes('function coinFailureIgnore('), 'generated remote runtime still keeps coin failure wrapper');
    assert(!generatedRuntimeSource.includes('function staleCoinEscapeDirection('), 'generated remote runtime still keeps stale coin escape wrapper');
    assert(!generatedRuntimeSource.includes('function clearIgnoredCoinRuntimeState('), 'generated remote runtime still keeps ignored coin cleanup wrapper');
    assert(!generatedRuntimeSource.includes('function trackCoinProgress('), 'generated remote runtime still keeps coin progress wrapper');
    assert(!distSource.includes('function coinFailureIgnore('), 'dist remote bot still keeps coin failure wrapper');
    assert(!distSource.includes('function staleCoinEscapeDirection('), 'dist remote bot still keeps stale coin escape wrapper');
    assert(!distSource.includes('function clearIgnoredCoinRuntimeState('), 'dist remote bot still keeps ignored coin cleanup wrapper');
    assert(!distSource.includes('function trackCoinProgress('), 'dist remote bot still keeps coin progress wrapper');
  });

  check('coin route planner uses strategy module core', () => {
    assert(strategyCoinRouteSource.includes('function pickCoinRouteOpportunityCore'), 'strategy coin route picker core not found');
    assert(strategyCoinRouteSource.includes('function buildCoinRouteFromAnchorCore'), 'strategy coin route builder core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteLegClearCore'), 'strategy coin route safety core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteSkipsCloserFirstCoinCore'), 'strategy coin route closer-first core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteSkipsHeldSingleCoinCore'), 'strategy coin route held single-coin core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteActionMetaCore'), 'strategy coin route action metadata core not found');
    assert(opportunityRouteSourceModule.includes("require('./runtime/coin-route')"), 'opportunity-route source does not import coin route through browser runtime adapter');
    assert(!opportunityRouteSourceModule.includes("require('../strategy/coin-route')"), 'opportunity-route source still imports coin route directly from strategy');
    assert(coinRouteRuntimeModule.includes("require('../../strategy/coin-route')"), 'coin-route runtime adapter does not reuse strategy module core');
    assert(coinRouteRuntimeModule.includes('coinRouteKey') && coinRouteRuntimeModule.includes('pickCoinRouteOpportunityCore'), 'coin-route runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/coin-route.js'"), 'bundler spike does not import coin route runtime adapter');
    assert(bundlerSpikeEntrySource.includes('coinRoute.coinRouteActionMetaCore('), 'bundler spike does not execute coin route metadata helper');
    assert(bundlerSpikeBuildSource.includes("status.coinRouteKey === 'route-spike'"), 'bundler spike self-test does not assert coin route execution');
    assert(opportunityRouteSourceModule.includes('coinRouteHelperSource') && opportunityRouteSourceModule.includes('fn.toString()'), 'source modules do not wire local coin route helper injection');
    assert(sourceRuntimeText.includes('coinRouteActionMetaCore(coin?.coinRoute || null, dir.distance)'), 'source bot coin action does not call route metadata core');
    assert(sourceRuntimeText.includes('function coinRouteCoreOptions'), 'source bot coin route runtime wrapper options not found');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-route')"), 'generated remote runtime does not hand coin route helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function pickCoinRouteOpportunityCore'), 'generated remote runtime still inlines coin route picker core before bundling');
    assert(distSource.includes('function pickCoinRouteOpportunityCore'), 'bundled dist does not contain coin route picker core');
    assert(distSource.includes('function coinRouteActionMetaCore'), 'bundled dist does not contain coin route action metadata core');
    assert(distSource.includes('function buildCoinRouteFromAnchorCore'), 'bundled dist does not contain coin route builder core');
    assert(generatedRuntimeSource.includes('function coinRouteCoreOptions'), 'generated runtime coin route wrapper options not found');
  });

  check('opportunity choice stability uses strategy module core', () => {
    assert(strategyOpportunityChoiceSource.includes('function chooseStableOpportunityCore'), 'strategy opportunity choice stable picker core not found');
    assert(strategyOpportunityChoiceSource.includes('function applyOpportunityOscillationLockCore'), 'strategy opportunity oscillation lock core not found');
    assert(strategyOpportunityChoiceSource.includes('function opportunityMatchesChoiceCore'), 'strategy opportunity choice matcher core not found');
    assert(strategyOpportunityChoiceSource.includes('function highValueCoinHoldBlocksEnemySwitchCore'), 'strategy high-value coin hold core not found');
    assert(strategyOpportunityChoiceSource.includes('function rememberOpportunityChoiceCore'), 'strategy opportunity choice persistence core not found');
    assert(strategyOpportunityChoiceSource.includes('function buildMissingHeldOpportunityCore'), 'strategy missing-held opportunity core not found');
    assert(opportunityChoiceSourceModule.includes("require('./runtime/opportunity-choice')"), 'opportunity-choice source does not import opportunity choice through browser runtime adapter');
    assert(!opportunityChoiceSourceModule.includes("require('../strategy/opportunity-choice')"), 'opportunity-choice source still imports opportunity choice directly from strategy');
    assert(opportunityChoiceRuntimeModule.includes("require('../../strategy/opportunity-choice')"), 'opportunity-choice runtime adapter does not reuse strategy module core');
    assert(opportunityChoiceRuntimeModule.includes('chooseStableOpportunityCore') && opportunityChoiceRuntimeModule.includes('rememberOpportunityChoiceCore'), 'opportunity-choice runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-choice.js'"), 'bundler spike does not import opportunity choice runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityChoice.chooseStableOpportunityCore('), 'bundler spike does not execute opportunity choice stable helper');
    assert(bundlerSpikeBuildSource.includes("status.opportunityChoiceKey === 'coin:choice-held'"), 'bundler spike self-test does not assert opportunity choice execution');
    assert(opportunityChoiceSourceModule.includes('opportunityChoiceHelperSource') && opportunityChoiceSourceModule.includes('fn.toString()'), 'source modules do not wire local opportunity choice helper injection');
    assert(sourceRuntimeText.includes('buildMissingHeldOpportunityCore(bot.opportunityChoice'), 'source bot missing-held wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('function opportunityChoiceCoreOptions'), 'source bot opportunity choice runtime wrapper options not found');
    assert(sourceRuntimeText.includes('switchHoldMs: cfg.opportunitySwitchHoldMs'), 'source bot opportunity choice persistence hold config not wired');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/opportunity-choice')"), 'generated remote runtime does not hand opportunity choice helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function chooseStableOpportunityCore'), 'generated remote runtime still inlines opportunity choice stable picker core before bundling');
    assert(!generatedRuntimeSource.includes('function rememberOpportunityChoiceCore'), 'generated remote runtime still inlines opportunity choice persistence core before bundling');
    assert(!generatedRuntimeSource.includes('function buildMissingHeldOpportunityCore'), 'generated remote runtime still inlines missing-held opportunity core before bundling');
    assert(!generatedRuntimeSource.includes('function isHighValueCoinOpportunity(item)'), 'generated remote runtime still declares unused high-value opportunity wrapper');
    assert(!generatedRuntimeSource.includes('function highValueCoinHoldBlocksEnemySwitch(held, best)'), 'generated remote runtime still declares unused high-value switch blocker wrapper');
    for (const wrapperName of [
      'lockedOpportunityChoice',
      'applyOpportunityOscillationLock',
      'opportunityMatchesChoice',
      'opportunityMissingHoldUntil',
      'missingHeldCoinCoveredByVisibleAuthority',
      'buildMissingHeldOpportunity',
      'rememberOpportunityChoice',
      'chooseStableOpportunity'
    ]) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('buildMissingHeldOpportunityCore(bot.opportunityChoice, opportunities, opportunityChoiceCoreOptions({'), 'generated opportunity pick option does not bind missing-held core directly');
    assert(generatedRuntimeSource.includes('chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions())'), 'generated opportunity pick option does not bind stable-choice core directly');
    assert(generatedRuntimeSource.includes('rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions())'), 'generated opportunity pick option does not bind choice persistence core directly');
    assert(distSource.includes('buildMissingHeldOpportunityCore(bot.opportunityChoice, opportunities, opportunityChoiceCoreOptions({'), 'bundled dist opportunity pick option does not bind missing-held core directly');
    assert(distSource.includes('chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions())'), 'bundled dist opportunity pick option does not bind stable-choice core directly');
    assert(distSource.includes('rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions())'), 'bundled dist opportunity pick option does not bind choice persistence core directly');
    assert(distSource.includes('function chooseStableOpportunityCore'), 'bundled dist does not contain opportunity choice stable picker core');
    assert(distSource.includes('function rememberOpportunityChoiceCore'), 'bundled dist does not contain opportunity choice persistence core');
    assert(distSource.includes('function buildMissingHeldOpportunityCore'), 'bundled dist does not contain missing-held opportunity core');
    assert(distSource.includes('function applyOpportunityOscillationLockCore'), 'bundled dist does not contain opportunity oscillation lock core');
    assert(distSource.includes('function opportunityMatchesChoiceCore'), 'bundled dist does not contain opportunity choice matcher core');
    assert(distSource.includes('function highValueCoinHoldBlocksEnemySwitchCore'), 'bundled dist does not contain high-value coin hold switch blocker core');
    assert(!distSource.includes('function isHighValueCoinOpportunity(item)'), 'bundled dist still declares unused high-value opportunity wrapper');
    assert(!distSource.includes('function highValueCoinHoldBlocksEnemySwitch(held, best)'), 'bundled dist still declares unused high-value switch blocker wrapper');
    for (const wrapperName of [
      'lockedOpportunityChoice',
      'applyOpportunityOscillationLock',
      'opportunityMatchesChoice',
      'opportunityMissingHoldUntil',
      'missingHeldCoinCoveredByVisibleAuthority',
      'buildMissingHeldOpportunity',
      'rememberOpportunityChoice',
      'chooseStableOpportunity'
    ]) {
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('function opportunityChoiceCoreOptions'), 'generated runtime opportunity choice wrapper options not found');
  });

  check('opportunity pick uses strategy module core', () => {
    assert(strategyOpportunityPickSource.includes('function pickBestOpportunityCore'), 'strategy opportunity pick core not found');
    assert(strategyOpportunityPickSource.includes("require('./opportunity-candidates')"), 'strategy opportunity pick core does not reuse candidate core module');
    assert(strategyOpportunityPickSource.includes('enemyGroups.flat()'), 'strategy opportunity pick core does not preserve enemy group flattening');
    assert(opportunityPickSourceModule.includes("require('./src/browser/runtime/opportunity-pick')"), 'opportunity-pick bundled source does not require the browser runtime helper module');
    assert(!opportunityPickSourceModule.includes("require('../strategy/opportunity-pick')"), 'opportunity-pick source still imports opportunity pick directly from strategy');
    assert(opportunityPickRuntimeModule.includes("require('../../strategy/opportunity-pick')"), 'opportunity-pick runtime adapter does not reuse strategy module core');
    assert(opportunityPickRuntimeModule.includes('pickBestOpportunityCore'), 'opportunity-pick runtime adapter does not export expected helper');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-pick.js'"), 'bundler spike does not import opportunity pick runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityPick.pickBestOpportunityCore('), 'bundler spike does not execute opportunity pick helper');
    assert(bundlerSpikeBuildSource.includes("status.opportunityPickId === 'pick-coin'"), 'bundler spike self-test does not assert opportunity pick execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/opportunity-pick')"), 'generated remote runtime does not hand opportunity pick helper to the bundler');
    assert(!generatedRuntimeSource.includes('function pickBestOpportunityCore'), 'generated remote runtime still inlines opportunity pick core before bundling');
    assert(distSource.includes('function pickBestOpportunityCore'), 'bundled dist does not contain opportunity pick core');
    assert(!functionBody(opportunityPickSourceModule, 'bundledOpportunityPickSource').includes('function pickBestOpportunity('), 'opportunity-pick bundled source still keeps pick wrapper');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('const opportunity = typeof pickBestOpportunityCore'), 'choose-action source does not select opportunity through direct core path');
    assert(functionBody(chooseActionSourceModule, 'chooseActionSource').includes('pickBestOpportunityCore(self, coinThreats, opportunityCoinGroups, opportunityEnemyGroups'), 'choose-action source does not call opportunity pick core directly');
    assert(distSource.includes('pickBestOpportunityCore(self, coinThreats, opportunityCoinGroups, opportunityEnemyGroups'), 'bundled dist choose-action does not call opportunity pick core directly');
    assert(!distSource.includes('function pickBestOpportunity('), 'dist remote bot still keeps opportunity pick wrapper');
  });

  check('patrol direction uses strategy module core', () => {
    assert(strategyPatrolSource.includes('function patrolDirectionCore'), 'strategy patrol direction core not found');
    assert(strategyPatrolSource.includes("reason: 'scan-toward-distant-coin'"), 'strategy patrol core does not preserve scan coin reason');
    assert(strategyPatrolSource.includes("reason: 'maintain-safe-spacing'"), 'strategy patrol core does not preserve safe-spacing reason');
    assert(strategyPatrolSource.includes("reason: 'wait-for-visible-coin-refresh'"), 'strategy patrol core does not preserve wait reason');
    assert(patrolSourceModule.includes("require('./src/browser/runtime/patrol')"), 'patrol bundled source does not require the browser runtime helper module');
    assert(!patrolSourceModule.includes("require('../strategy/patrol')"), 'patrol source still imports patrol directly from strategy');
    assert(patrolRuntimeModule.includes("require('../../strategy/patrol')"), 'patrol runtime adapter does not reuse strategy module core');
    assert(patrolRuntimeModule.includes('patrolDirectionCore'), 'patrol runtime adapter does not export expected helper');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/patrol.js'"), 'bundler spike does not import patrol runtime adapter');
    assert(bundlerSpikeEntrySource.includes('patrol.patrolDirectionCore('), 'bundler spike does not execute patrol helper');
    assert(bundlerSpikeBuildSource.includes("status.patrolReason === 'scan-toward-distant-coin'"), 'bundler spike self-test does not assert patrol execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/patrol')"), 'generated remote runtime does not hand patrol helper to the bundler');
    assert(!generatedRuntimeSource.includes('function patrolDirectionCore'), 'generated remote runtime still inlines patrol core before bundling');
    assert(distSource.includes('function patrolDirectionCore'), 'bundled dist does not contain patrol direction core');
    assert(!functionBody(patrolSourceModule, 'bundledPatrolSource').includes('function patrolDirection('), 'patrol bundled source still keeps patrol direction wrapper');
    assert(!distSource.includes('function patrolDirection('), 'dist remote bot still keeps patrol direction wrapper');
  });

  check('attack worth uses strategy module core', () => {
    assert(strategyAttackWorthSource.includes('function attackWorthTakingCore'), 'strategy attack-worth core not found');
    assert(strategyAttackWorthSource.includes('isWhitelistedTarget(target)'), 'strategy attack-worth core does not preserve whitelist guard');
    assert(strategyAttackWorthSource.includes('isAfkProfitTarget(target)'), 'strategy attack-worth core does not preserve AFK profit target handling');
    assert(strategyAttackWorthSource.includes('attackMinRewardRatio'), 'strategy attack-worth core does not preserve reward ratio guard');
    assert(attackWorthSourceModule.includes("require('./src/browser/runtime/attack-worth')"), 'attack-worth bundled source does not require the browser runtime helper module');
    assert(!attackWorthSourceModule.includes("require('../strategy/attack-worth')"), 'attack-worth source still imports attack-worth directly from strategy');
    assert(attackWorthRuntimeModule.includes("require('../../strategy/attack-worth')"), 'attack-worth runtime adapter does not reuse strategy module core');
    assert(attackWorthRuntimeModule.includes('attackWorthTakingCore'), 'attack-worth runtime adapter does not export expected helper');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/attack-worth.js'"), 'bundler spike does not import attack-worth runtime adapter');
    assert(bundlerSpikeEntrySource.includes('attackWorth.attackWorthTakingCore('), 'bundler spike does not execute attack-worth helper');
    assert(bundlerSpikeBuildSource.includes('status.attackWorthResult === true'), 'bundler spike self-test does not assert attack-worth execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/attack-worth')"), 'generated remote runtime does not hand attack-worth helper to the bundler');
    assert(!generatedRuntimeSource.includes('function attackWorthTakingCore'), 'generated remote runtime still inlines attack-worth core before bundling');
    assert(distSource.includes('function attackWorthTakingCore'), 'bundled dist does not contain attack-worth core');
    assert(functionBody(targetSelectionSourceModule, 'targetSelectionSource').includes('attackWorthTakingCore(self, e, {'), 'target-selection source does not call attack-worth core directly');
    assert(
      functionBody(opportunityActionsSourceModule, 'opportunityActionsSource').includes('attackWorthTakingCore(self, { ...raw, drop }, {')
        || functionBody(chooseActionSourceModule, 'chooseActionSource').includes('attackWorthTakingCore(candidateSelf, { ...raw, drop }, {'),
      'opportunity-actions/choose-action source does not call attack-worth core directly'
    );
    assert(distSource.includes('attackWorthTakingCore(self, e, {'), 'bundled dist target-selection does not call attack-worth core directly');
    assert(
      distSource.includes('attackWorthTakingCore(self, { ...raw, drop }, {')
        || distSource.includes('attackWorthTakingCore(candidateSelf, { ...raw, drop }, {'),
      'bundled dist opportunity candidate path does not call attack-worth core directly'
    );
    assert(!distSource.includes('const attackWorthTaking ='), 'dist remote bot still keeps attack-worth wrapper');
  });

  check('exit motion uses strategy module core', () => {
    assert(strategyExitMotionSource.includes('function exitMotionStopLockRemainingMsCore'), 'strategy exit-motion lock core not found');
    assert(strategyExitMotionSource.includes('function postExitDecisionWithoutTargetCore'), 'strategy exit-motion decision core not found');
    assert(strategyExitMotionSource.includes("reason || previous.reason || 'exit-motion-stopped'"), 'strategy exit-motion core does not preserve reason fallback');
    assert(strategyExitMotionSource.includes('exitMotionStopReason: reason || options.lastExitMotionStopReason'), 'strategy exit-motion core does not preserve stop reason fallback');
    assert(exitMotionSourceModule.includes("require('./src/browser/runtime/exit-motion')"), 'exit-motion bundled source does not require the browser runtime helper module');
    assert(!exitMotionSourceModule.includes("require('../strategy/exit-motion')"), 'exit-motion source still imports exit-motion directly from strategy');
    assert(exitMotionRuntimeModule.includes("require('../../strategy/exit-motion')"), 'exit-motion runtime adapter does not reuse strategy module core');
    assert(exitMotionRuntimeModule.includes('exitMotionStopLockRemainingMsCore') && exitMotionRuntimeModule.includes('postExitDecisionWithoutTargetCore'), 'exit-motion runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/exit-motion.js'"), 'bundler spike does not import exit-motion runtime adapter');
    assert(bundlerSpikeEntrySource.includes('exitMotion.exitMotionStopLockRemainingMsCore('), 'bundler spike does not execute exit-motion lock helper');
    assert(bundlerSpikeEntrySource.includes('exitMotion.postExitDecisionWithoutTargetCore('), 'bundler spike does not execute exit-motion decision helper');
    assert(bundlerSpikeBuildSource.includes('status.exitMotionLock === 6500'), 'bundler spike self-test does not assert exit-motion lock execution');
    assert(bundlerSpikeBuildSource.includes('status.exitMotionDecisionTargetless === true'), 'bundler spike self-test does not assert exit-motion decision execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/exit-motion')"), 'generated remote runtime does not hand exit-motion helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function exitMotionStopLockRemainingMsCore'), 'generated remote runtime still inlines exit-motion lock core before bundling');
    assert(!generatedRuntimeSource.includes('function postExitDecisionWithoutTargetCore'), 'generated remote runtime still inlines exit-motion decision core before bundling');
    assert(distSource.includes('function exitMotionStopLockRemainingMsCore'), 'bundled dist does not contain exit-motion lock core');
    assert(distSource.includes('function postExitDecisionWithoutTargetCore'), 'bundled dist does not contain exit-motion decision core');
    assert(distSource.includes('exitMotionStopLockRemainingMsCore(bot.lastExitMotionStopAt, cfg.exitMotionStopLockMs, t)'), 'bundled dist exit-motion lock wrapper does not call strategy core');
    assert(!distSource.includes('function postExitDecisionWithoutTarget('), 'bundled dist still keeps post-exit decision wrapper');
    assert(distSource.includes('postExitDecisionWithoutTargetForStatusCore(this.lastDecision'), 'bundled dist bot status does not call decision core alias directly');
    assert(distSource.includes('postExitDecisionWithoutTargetCore(bot.lastDecision, reason'), 'bundled dist exit-motion cleanup does not call decision core directly');
    assert(distSource.includes('postExitDecisionWithoutTargetForTickCore({'), 'bundled dist tick does not call decision core alias directly');
    assert(!distSource.includes('function exitMotionStopActive('), 'dist remote bot still keeps exit-motion stop-active alias');
  });

  check('persistent exit uses browser runtime adapter', () => {
    assert(persistentExitRuntimeModule.includes('function readPersistentExitStateCore'), 'persistent-exit read runtime helper not found');
    assert(persistentExitRuntimeModule.includes('function persistentExitStateFromDetail'), 'persistent-exit state builder helper not found');
    assert(persistentExitRuntimeModule.includes('function writePersistentExitStateCore'), 'persistent-exit write runtime helper not found');
    assert(persistentExitRuntimeModule.includes('JSON.parse(storage.getItem(key)'), 'persistent-exit read helper does not read storage JSON');
    assert(persistentExitRuntimeModule.includes('storage.setItem(key, JSON.stringify(state))'), 'persistent-exit write helper does not write storage JSON');
    assert(persistentExitRuntimeModule.includes('return refreshExitDetail({ ...state, restored: true }, t);'), 'persistent-exit read helper does not refresh restored state');
    assert(persistentExitRuntimeModule.includes('module.exports = {\n  readPersistentExitStateCore,\n  persistentExitStateFromDetail,\n  writePersistentExitStateCore\n}'), 'persistent-exit runtime helper export not found');
    assert(persistentExitSourceModule.includes("require('./src/browser/runtime/persistent-exit')"), 'persistent-exit bundled source does not require the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/persistent-exit.js'"), 'bundler spike does not import persistent-exit runtime adapter');
    assert(bundlerSpikeEntrySource.includes('persistentExit.readPersistentExitStateCore('), 'bundler spike does not execute persistent-exit read helper');
    assert(bundlerSpikeEntrySource.includes('persistentExit.writePersistentExitStateCore('), 'bundler spike does not execute persistent-exit write helper');
    assert(bundlerSpikeBuildSource.includes('status.persistentExitReadRestored === true'), 'bundler spike self-test does not assert persistent-exit read execution');
    assert(bundlerSpikeBuildSource.includes('status.persistentExitWrite === true'), 'bundler spike self-test does not assert persistent-exit write execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/persistent-exit')"), 'generated remote runtime does not hand persistent-exit helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function readPersistentExitStateCore'), 'generated remote runtime still inlines persistent-exit read helper before bundling');
    assert(!generatedRuntimeSource.includes('function writePersistentExitStateCore'), 'generated remote runtime still inlines persistent-exit write helper before bundling');
    assert(distSource.includes('function readPersistentExitStateCore'), 'bundled dist does not contain persistent-exit read helper');
    assert(distSource.includes('function writePersistentExitStateCore'), 'bundled dist does not contain persistent-exit write helper');
    assert(distSource.includes('readPersistentExitStateCore(localStorage, key, refreshExitDetail, t)'), 'bundled dist persistent-exit read wrapper does not call runtime core');
    assert(distSource.includes('writePersistentExitStateCore(localStorage, key, detail, refreshExitDetail)'), 'bundled dist persistent-exit write wrapper does not call runtime core');
  });

  check('persistent last self uses browser runtime adapter', () => {
    assert(persistentLastSelfRuntimeModule.includes('function readPersistentLastSelfStateCore'), 'persistent-last-self read runtime helper not found');
    assert(persistentLastSelfRuntimeModule.includes('function writePersistentLastSelfStateCore'), 'persistent-last-self write runtime helper not found');
    assert(persistentLastSelfRuntimeModule.includes('JSON.parse(storage.getItem(key)'), 'persistent-last-self read helper does not read storage JSON');
    assert(persistentLastSelfRuntimeModule.includes('storage.setItem(key, JSON.stringify({'), 'persistent-last-self write helper does not write storage JSON');
    assert(persistentLastSelfRuntimeModule.includes('module.exports = {\n  readPersistentLastSelfStateCore,\n  writePersistentLastSelfStateCore\n}'), 'persistent-last-self runtime helper export not found');
    assert(persistentLastSelfSourceModule.includes("require('./src/browser/runtime/persistent-last-self')"), 'persistent-last-self bundled source does not require the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/persistent-last-self.js'"), 'bundler spike does not import persistent-last-self runtime adapter');
    assert(bundlerSpikeEntrySource.includes('persistentLastSelf.readPersistentLastSelfStateCore('), 'bundler spike does not execute persistent-last-self read helper');
    assert(bundlerSpikeEntrySource.includes('persistentLastSelf.writePersistentLastSelfStateCore('), 'bundler spike does not execute persistent-last-self write helper');
    assert(bundlerSpikeBuildSource.includes("status.persistentLastSelfId === 'last-self-spike'"), 'bundler spike self-test does not assert persistent-last-self read execution');
    assert(bundlerSpikeBuildSource.includes('status.persistentLastSelfWrite === true'), 'bundler spike self-test does not assert persistent-last-self write execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/persistent-last-self')"), 'generated remote runtime does not hand persistent-last-self helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function readPersistentLastSelfStateCore'), 'generated remote runtime still inlines persistent-last-self read helper before bundling');
    assert(!generatedRuntimeSource.includes('function writePersistentLastSelfStateCore'), 'generated remote runtime still inlines persistent-last-self write helper before bundling');
    assert(distSource.includes('function readPersistentLastSelfStateCore'), 'bundled dist does not contain persistent-last-self read helper');
    assert(distSource.includes('function writePersistentLastSelfStateCore'), 'bundled dist does not contain persistent-last-self write helper');
    assert(distSource.includes('readPersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, cfg.lastSelfPersistMaxMs, t)'), 'bundled dist persistent-last-self read wrapper does not call runtime core');
    assert(distSource.includes('writePersistentLastSelfStateCore(localStorage, LAST_SELF_STATE_KEY, selfSummary, t)'), 'bundled dist persistent-last-self write wrapper does not call runtime core');
  });

  check('persistent clear uses browser runtime adapter', () => {
    assert(persistentClearRuntimeModule.includes('function clearPersistentStorageKey'), 'persistent-clear runtime helper not found');
    assert(persistentClearRuntimeModule.includes('localStorage.removeItem(key)'), 'persistent-clear runtime helper does not remove storage keys');
    assert(persistentClearRuntimeModule.includes('module.exports = {\n  clearPersistentStorageKey\n}'), 'persistent-clear runtime helper export not found');
    assert(persistentClearSourceModule.includes("require('./src/browser/runtime/persistent-clear')"), 'persistent-clear bundled source does not require the browser runtime helper module');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/persistent-clear.js'"), 'bundler spike does not import persistent-clear runtime adapter');
    assert(bundlerSpikeEntrySource.includes("persistentClear.clearPersistentStorageKey('persistent-clear-spike')"), 'bundler spike does not execute persistent-clear helper');
    assert(bundlerSpikeBuildSource.includes('status.persistentClearRemoved === true'), 'bundler spike self-test does not assert persistent-clear execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/persistent-clear')"), 'generated remote runtime does not hand persistent-clear helper to the bundler');
    assert(!generatedRuntimeSource.includes('function clearPersistentStorageKey'), 'generated remote runtime still inlines persistent-clear helper before bundling');
    assert(distSource.includes('function clearPersistentStorageKey'), 'bundled dist does not contain persistent-clear helper');
    assert(distSource.includes('clearPersistentStorageKey(key)'), 'bundled dist persistent clear wrapper does not clear provided exit key');
    assert(distSource.includes('clearPersistentStorageKey(PENDING_EXIT_STATE_KEY)'), 'bundled dist persistent clear wrapper does not clear pending-exit storage key');
  });

  check('opportunity clear uses strategy module core', () => {
    assert(strategyOpportunityClearSource.includes('function shouldClearOpportunityChoiceCore'), 'strategy opportunity clear core not found');
    assert(strategyOpportunityClearSource.includes("require('./opportunity-choice')"), 'strategy opportunity clear core does not reuse choice identity helpers');
    assert(opportunityClearSourceModule.includes("require('./src/browser/runtime/opportunity-clear')"), 'opportunity-clear bundled source does not require the browser runtime helper module');
    assert(!opportunityClearSourceModule.includes("require('../strategy/opportunity-clear')"), 'opportunity-clear source still imports opportunity clear directly from strategy');
    assert(opportunityClearRuntimeModule.includes("require('../../strategy/opportunity-clear')"), 'opportunity-clear runtime adapter does not reuse strategy module core');
    assert(opportunityClearRuntimeModule.includes('shouldClearOpportunityChoiceCore'), 'opportunity-clear runtime adapter does not export expected helper');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-clear.js'"), 'bundler spike does not import opportunity clear runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityClear.shouldClearOpportunityChoiceCore('), 'bundler spike does not execute opportunity clear helper');
    assert(bundlerSpikeBuildSource.includes('status.opportunityClearExact === true'), 'bundler spike self-test does not assert opportunity clear execution');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/opportunity-clear')"), 'generated remote runtime does not hand opportunity clear helper to the bundler');
    assert(!generatedRuntimeSource.includes('function shouldClearOpportunityChoiceCore'), 'generated remote runtime still inlines opportunity clear core before bundling');
    assert(!generatedRuntimeSource.includes('function clearOpportunityChoiceFor('), 'generated remote runtime still declares opportunity clear wrapper');
    assert(generatedRuntimeSource.includes("shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'enemy', postAttackCoin.postAttackTarget?.id)"), 'generated choose-action post-attack coin path does not clear opportunity choice through core directly');
    assert(generatedRuntimeSource.includes("shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'enemy', postAttackWaitTarget.id)"), 'generated choose-action post-attack wait path does not clear opportunity choice through core directly');
    assert(generatedRuntimeSource.includes("shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', null)"), 'generated runtime does not clear all coin opportunity choices through core directly');
    assert(generatedRuntimeSource.includes("shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', idText || null)"), 'generated opportunity-choice visible-missing path does not clear opportunity choice through core directly');
    assert(generatedRuntimeSource.includes("shouldClearOpportunityChoiceCore(bot.opportunityChoice, 'coin', progressId)"), 'generated coin-progress ignored-coin path does not clear opportunity choice through core directly');
    assert(distSource.includes('function shouldClearOpportunityChoiceCore'), 'bundled dist does not contain opportunity clear core');
    assert(!distSource.includes('function clearOpportunityChoiceFor('), 'bundled dist still declares opportunity clear wrapper');
    assert(distSource.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice, "enemy", postAttackCoin.postAttackTarget?.id)'), 'bundled dist choose-action post-attack coin path does not clear opportunity choice through core directly');
    assert(distSource.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice, "enemy", postAttackWaitTarget.id)'), 'bundled dist choose-action post-attack wait path does not clear opportunity choice through core directly');
    assert(distSource.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice, "coin", null)'), 'bundled dist does not clear all coin opportunity choices through core directly');
    assert(distSource.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice, "coin", idText || null)'), 'bundled dist opportunity-choice visible-missing path does not clear opportunity choice through core directly');
    assert(distSource.includes('shouldClearOpportunityChoiceCore(bot.opportunityChoice, "coin", progressId)'), 'bundled dist coin-progress ignored-coin path does not clear opportunity choice through core directly');
  });

  check('opportunity candidate construction uses strategy module core', () => {
    assert(strategyOpportunityCandidatesSource.includes('function buildOpportunityCandidatesCore'), 'strategy opportunity candidate combiner core not found');
    assert(strategyOpportunityCandidatesSource.includes('function buildCoinOpportunityCandidatesCore'), 'strategy coin opportunity candidate core not found');
    assert(strategyOpportunityCandidatesSource.includes('function buildEnemyOpportunityCandidatesCore'), 'strategy enemy opportunity candidate core not found');
    assert(strategyOpportunityCandidatesSource.includes('function bestCoinOpportunityScoreCore'), 'strategy best coin opportunity score core not found');
    assert(strategyOpportunityCandidatesSource.includes('function opportunityValueScoreCore'), 'strategy opportunity value score core not found');
    assert(opportunityCandidateSourceModule.includes("require('./runtime/opportunity-candidates')"), 'opportunity-candidate source does not import opportunity candidates through browser runtime adapter');
    assert(!opportunityCandidateSourceModule.includes("require('../strategy/opportunity-candidates')"), 'opportunity-candidate source still imports opportunity candidates directly from strategy');
    assert(opportunityCandidatesRuntimeModule.includes("require('../../strategy/opportunity-candidates')"), 'opportunity-candidates runtime adapter does not reuse strategy module core');
    assert(opportunityCandidatesRuntimeModule.includes('buildOpportunityCandidatesCore') && opportunityCandidatesRuntimeModule.includes('bestCoinOpportunityScoreCore'), 'opportunity-candidates runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-candidates.js'"), 'bundler spike does not import opportunity candidates runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityCandidates.buildOpportunityCandidatesCore('), 'bundler spike does not execute opportunity candidate combiner helper');
    assert(bundlerSpikeBuildSource.includes('status.opportunityCandidateCount === 2'), 'bundler spike self-test does not assert opportunity candidate execution');
    assert(opportunityCandidateSourceModule.includes('opportunityCandidateHelperSource') && opportunityCandidateSourceModule.includes('fn.toString()'), 'source modules do not wire local opportunity candidate helper injection');
    assert(sourceRuntimeText.includes('function opportunityCandidateCoreOptions'), 'source bot opportunity candidate runtime wrapper options not found');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/opportunity-candidates')"), 'generated remote runtime does not hand opportunity candidate helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function buildOpportunityCandidatesCore'), 'generated remote runtime still inlines opportunity candidate core before bundling');
    for (const wrapperName of ['uniqueVisibleRouteCoins', 'bestCoinOpportunityScore', 'enemyOpportunityCandidates']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('uniqueVisibleRouteCoinsCore(routeCoinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey })'), 'generated opportunity pick options do not bind route coin core directly');
    assert(generatedRuntimeSource.includes('bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self))'), 'generated profitable combat comparison does not bind best coin score core directly');
    assert(generatedRuntimeSource.includes('attackWorthTakingCore(candidateSelf, { ...raw, drop }, {'), 'generated opportunity pick options do not bind enemy candidate filter directly');
    assert(distSource.includes('uniqueVisibleRouteCoinsCore(routeCoinGroups, { isSnapshotOnlyCoin, coinKey: coinRouteKey })'), 'bundled dist opportunity pick options do not bind route coin core directly');
    assert(distSource.includes('bestCoinOpportunityScoreCore(self, coinGroups, activeThreats, route, opportunityCandidateCoreOptions(self))'), 'bundled dist profitable combat comparison does not bind best coin score core directly');
    assert(distSource.includes('attackWorthTakingCore(candidateSelf, { ...raw, drop }, {'), 'bundled dist opportunity pick options do not bind enemy candidate filter directly');
    assert(distSource.includes('function buildOpportunityCandidatesCore'), 'bundled dist does not contain opportunity candidate combiner core');
    assert(distSource.includes('function buildCoinOpportunityCandidatesCore'), 'bundled dist does not contain coin opportunity candidate core');
    assert(distSource.includes('function buildEnemyOpportunityCandidatesCore'), 'bundled dist does not contain enemy opportunity candidate core');
    assert(distSource.includes('function bestCoinOpportunityScoreCore'), 'bundled dist does not contain best coin opportunity score core');
    assert(generatedRuntimeSource.includes('function opportunityCandidateCoreOptions'), 'generated runtime opportunity candidate wrapper options not found');
  });

  check('post-attack drop wait uses strategy module core', () => {
    assert(strategyPostAttackDropSource.includes('function postAttackVisibleCoinExistsCore'), 'strategy post-attack visible coin core not found');
    assert(strategyPostAttackDropSource.includes('function resolvedRecentPostAttackDropsCore'), 'strategy post-attack resolved attack core not found');
    assert(strategyPostAttackDropSource.includes('function pickPostAttackDropCoinCore'), 'strategy post-attack drop coin picker core not found');
    assert(strategyPostAttackDropSource.includes('function pickPostAttackDropWaitTargetCore'), 'strategy post-attack wait picker core not found');
    assert(postAttackSourceModule.includes("require('./runtime/post-attack-drop')"), 'post-attack source does not import post-attack drop through browser runtime adapter');
    assert(!postAttackSourceModule.includes("require('../strategy/post-attack-drop')"), 'post-attack source still imports post-attack drop directly from strategy');
    assert(postAttackDropRuntimeModule.includes("require('../../strategy/post-attack-drop')"), 'post-attack drop runtime adapter does not reuse strategy module core');
    assert(postAttackDropRuntimeModule.includes('postAttackVisibleCoinExistsCore') && postAttackDropRuntimeModule.includes('pickPostAttackDropCoinCore') && postAttackDropRuntimeModule.includes('pickPostAttackDropWaitTargetCore'), 'post-attack drop runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/post-attack-drop.js'"), 'bundler spike does not import post-attack drop runtime adapter');
    assert(bundlerSpikeEntrySource.includes('postAttackDrop.pickPostAttackDropCoinCore('), 'bundler spike does not execute post-attack drop picker helper');
    assert(bundlerSpikeBuildSource.includes("status.postAttackDropSelectedId === 'post-attack-coin'"), 'bundler spike self-test does not assert post-attack drop execution');
    assert(postAttackSourceModule.includes('postAttackDropHelperSource') && postAttackSourceModule.includes('fn.toString()'), 'source modules do not wire local post-attack drop helper injection');
    assert(sourceRuntimeText.includes('pickPostAttackDropCoinCore(bot.attackHistory'), 'source bot post-attack drop coin wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory'), 'source bot post-attack wait wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/post-attack-drop')"), 'generated remote runtime does not hand post-attack drop helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function pickPostAttackDropCoinCore'), 'generated remote runtime still inlines post-attack drop coin core before bundling');
    assert(!generatedRuntimeSource.includes('function postAttackVisibleCoinExists('), 'generated remote runtime still declares unused postAttackVisibleCoinExists wrapper');
    assert(!distSource.includes('function postAttackVisibleCoinExists('), 'bundled dist still declares unused postAttackVisibleCoinExists wrapper');
    for (const wrapperName of ['pickPostAttackDropCoin', 'pickPostAttackDropWaitTarget']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {'), 'generated choose-action does not call post-attack drop coin core directly');
    assert(generatedRuntimeSource.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {'), 'generated choose-action does not call post-attack wait core directly');
    assert(distSource.includes('pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {'), 'bundled dist choose-action does not call post-attack drop coin core directly');
    assert(distSource.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {'), 'bundled dist choose-action does not call post-attack wait core directly');
    assert(distSource.includes('function postAttackVisibleCoinExistsCore'), 'bundled dist does not contain post-attack visible coin core');
    assert(distSource.includes('function resolvedRecentPostAttackDropsCore'), 'bundled dist does not contain post-attack resolved attack core');
    assert(distSource.includes('function buildPostAttackDropCoinCandidateCore'), 'bundled dist does not contain post-attack drop coin metadata core');
    assert(distSource.includes('function pickPostAttackDropCoinCore'), 'bundled dist does not contain post-attack drop coin picker core');
    assert(distSource.includes('function pickPostAttackDropWaitTargetCore'), 'bundled dist does not contain post-attack wait picker core');
  });

  check('stamina budget helpers use strategy module core', () => {
    assert(strategyStaminaBudgetSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'strategy daily stamina budget core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeBlockedStaminaOpportunityCore'), 'strategy blocked stamina summary core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeNearestCoinStaminaBudgetExitCore'), 'strategy nearest coin stamina exit core not found');
    assert(strategyStaminaBudgetSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'strategy daily final coin picker core not found');
    assert(opportunityStaminaSourceModule.includes("require('./runtime/stamina-budget')"), 'opportunity-stamina source does not import stamina budget through browser runtime adapter');
    assert(!opportunityStaminaSourceModule.includes("require('../strategy/stamina-budget')"), 'opportunity-stamina source still imports stamina budget directly from strategy');
    assert(staminaBudgetRuntimeModule.includes("require('../../strategy/stamina-budget')"), 'stamina-budget runtime adapter does not reuse strategy module core');
    assert(staminaBudgetRuntimeModule.includes('dailyStaminaBudgetIsLimitingCore') && staminaBudgetRuntimeModule.includes('summarizeNearestCoinStaminaBudgetExitCore') && staminaBudgetRuntimeModule.includes('pickNearestDailyStaminaFinalCoinCore'), 'stamina-budget runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/stamina-budget.js'"), 'bundler spike does not import stamina-budget runtime adapter');
    assert(bundlerSpikeEntrySource.includes('staminaBudget.dailyStaminaBudgetIsLimitingCore('), 'bundler spike does not execute stamina budget helper');
    assert(bundlerSpikeBuildSource.includes('status.staminaBudgetExitShortageMs === 50'), 'bundler spike self-test does not assert stamina budget execution');
    assert(opportunityStaminaSourceModule.includes('staminaBudgetHelperSource') && opportunityStaminaSourceModule.includes('fn.toString()'), 'source modules do not wire local stamina budget helper injection');
    assert(sourceRuntimeText.includes('dailyStaminaBudgetIsLimitingCore('), 'source bot daily stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeBlockedStaminaOpportunityCore(coins, targets'), 'source bot blocked stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeNearestCoinStaminaBudgetExitCore(self, coins'), 'source bot nearest stamina exit wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickNearestDailyStaminaFinalCoinCore('), 'source bot daily final coin wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/stamina-budget')"), 'generated remote runtime does not hand stamina budget helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'generated remote runtime still inlines daily stamina budget core before bundling');
    for (const wrapperName of [
      'opportunityEffectiveStaminaCost',
      'dailyStaminaBudgetIsLimiting',
      'summarizeBlockedStaminaOpportunity',
      'summarizeNearestCoinStaminaBudgetExit',
      'pickNearestDailyStaminaFinalCoin',
      'opportunityValueScore',
      'mergeCoinRouteDisplay'
    ]) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExitCore('), 'generated choose-action stamina exit path does not call nearest coin stamina core directly');
    assert(generatedRuntimeSource.includes('const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoinCore('), 'generated choose-action daily final coin path does not call daily final core directly');
    assert(generatedRuntimeSource.includes('summarizeBlockedStaminaOpportunityCore(realtimeCoins, [], {'), 'generated choose-action stamina wait path does not call blocked stamina core directly');
    assert(generatedRuntimeSource.includes('opportunityValueScoreCore(totalAmount, staminaCost, {'), 'generated opportunity ROI scoring does not call value score core directly');
    assert(distSource.includes('const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExitCore('), 'bundled dist stamina exit path does not call nearest coin stamina core directly');
    assert(distSource.includes('const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoinCore('), 'bundled dist daily final coin path does not call daily final core directly');
    assert(distSource.includes('summarizeBlockedStaminaOpportunityCore(realtimeCoins, [], {'), 'bundled dist stamina wait path does not call blocked stamina core directly');
    assert(distSource.includes('opportunityValueScoreCore(totalAmount, staminaCost, {'), 'bundled dist opportunity ROI scoring does not call value score core directly');
    assert(distSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'bundled dist does not contain daily stamina budget core');
    assert(distSource.includes('function summarizeBlockedStaminaOpportunityCore'), 'bundled dist does not contain blocked stamina summary core');
    assert(distSource.includes('function summarizeNearestCoinStaminaBudgetExitCore'), 'bundled dist does not contain nearest stamina exit core');
    assert(distSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'bundled dist does not contain daily final coin picker core');
  });

  check('opportunity constants use browser runtime adapter', () => {
    assert(strategyOpportunityConstantsSource.includes('const OPPORTUNITY_CONSTANTS = {'), 'strategy opportunity constants object not found');
    assert(strategyOpportunityConstantsSource.includes('function calculateOpportunityROI'), 'strategy opportunity ROI helper not found');
    assert(runtimeBootstrapSourceModule.includes("require('./runtime/opportunity-constants')"), 'runtime bootstrap source does not import opportunity constants through browser runtime adapter');
    assert(!runtimeBootstrapSourceModule.includes("require('../strategy/opportunity-constants')"), 'runtime bootstrap source still imports opportunity constants directly from strategy');
    assert(opportunityConstantsRuntimeModule.includes("require('../../strategy/opportunity-constants')"), 'opportunity-constants runtime adapter does not reuse strategy module core');
    assert(opportunityConstantsRuntimeModule.includes('OPPORTUNITY_CONSTANTS') && opportunityConstantsRuntimeModule.includes('calculateOpportunityROI') && opportunityConstantsRuntimeModule.includes('validateOpportunityConstants'), 'opportunity-constants runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-constants.js'"), 'bundler spike does not import opportunity constants runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityConstants.calculateOpportunityROI('), 'bundler spike does not execute opportunity constants helper');
    assert(bundlerSpikeBuildSource.includes('status.opportunityConstantRoi === 5'), 'bundler spike self-test does not assert opportunity constants execution');
    assert(sourceRuntimeText.includes('const OPPORTUNITY_CONSTANTS = ${JSON.stringify(OPPORTUNITY_CONSTANTS)}'), 'source modules do not inject opportunity constants object');
    assert(generatedRuntimeSource.includes('const OPPORTUNITY_CONSTANTS = {'), 'generated runtime does not inline opportunity constants object');
  });

  check('target switch diagnostics expose final action focus changes', () => {
    assert(sourceRuntimeText.includes('function recordActionSwitchDiagnostics'), 'target switch diagnostic wrapper not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('function recordActionSwitchDiagnosticsCore'), 'strategy target switch diagnostic core not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('function actionSwitchPairKey'), 'strategy target switch pair key helper not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('targetSwitch: snapshot'), 'strategy target switch event is not attached to decisions');
    assert(actionArbitrationSourceModule.includes('actionSwitchHelperSource') && actionArbitrationSourceModule.includes('fn.toString()'), 'source modules do not wire local action switch helper injection');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-switch-diagnostics')"), 'generated remote runtime does not hand action switch diagnostics helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function recordActionSwitchDiagnosticsCore'), 'generated remote runtime still inlines target switch diagnostic core before bundling');
    assert(distSource.includes('function recordActionSwitchDiagnosticsCore'), 'bundled dist does not contain target switch diagnostic core');
    assert(distSource.includes('targetSwitch: snapshot'), 'bundled dist target switch event is not attached to decisions');
    assert(sourceRuntimeText.includes('targetSwitchDiagnostics: this.targetSwitchDiagnostics'), 'status does not expose target switch diagnostics');
    assert(sourceRuntimeText.includes('action = recordActionSwitchDiagnostics(action, source);'), 'final action path does not record target switch diagnostics');
    assert(combatLogSourceModule.includes("type: 'target-switch'"), 'standalone target-switch log entry not found');
    assert(combatLogSourceModule.includes('recordTargetSwitchLog(source, decision || {})'), 'target switch diagnostics are not recorded on each log tick');
    assert(combatLogSourceModule.includes('targetSwitchDiagnosticSignature'), 'target switch log throttle signature not found');
  });

  check('final action arbitration gates cross-band focus steals', () => {
    assert(sourceRuntimeText.includes('function applyFinalActionArbitration'), 'final action arbitration wrapper not found');
    assert(strategyActionArbitrationSource.includes('function finalActionBandRank'), 'strategy final action priority band rank helper not found');
    assert(strategyActionArbitrationSource.includes('function applyFinalActionArbitrationCore'), 'strategy final action arbitration core not found');
    assert(strategyActionPrioritySource.includes('function actionFocusSummary'), 'strategy action focus summary helper not found');
    assert(actionArbitrationSourceModule.includes('actionPriorityHelperSource') && actionArbitrationSourceModule.includes('finalActionHelperSource'), 'source modules do not wire local final action arbitration helper injection');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-priority')"), 'generated remote runtime does not hand action priority helpers to the bundler');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-arbitration')"), 'generated remote runtime does not hand final action arbitration helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function finalActionBandRank'), 'generated remote runtime still inlines final action priority band rank helper before bundling');
    assert(!generatedRuntimeSource.includes('function applyFinalActionArbitrationCore'), 'generated remote runtime still inlines final action arbitration core before bundling');
    assert(distSource.includes('function finalActionBandRank'), 'bundled dist does not contain final action priority band rank helper');
    assert(distSource.includes('function applyFinalActionArbitrationCore'), 'bundled dist does not contain final action arbitration core');
    assert(distSource.includes('higher-priority-band-stick'), 'final action hysteresis reason not found in bundled dist');
    assert(sourceRuntimeText.includes('action = applyFinalActionArbitration(action, source);'), 'final action path does not run arbitration before diagnostics');
    assert(sourceRuntimeText.indexOf('action = applyFinalActionArbitration(action, source);') < sourceRuntimeText.indexOf('action = recordActionSwitchDiagnostics(action, source);'), 'final action arbitration must run before target-switch diagnostics');
    assert(sourceRuntimeText.includes('finalActionArbitration: this.finalActionArbitration'), 'status does not expose final action arbitration state');
    assert(sourceRuntimeText.includes('preserved.finalActionArbitration?.lastAction'), 'runtime does not restore final action arbitration state');
    assert(sharedPreservedStateSource.includes('finalActionArbitration: previousBot?.finalActionArbitration'), 'hot-update preserved state omits final action arbitration');
    assert(sharedRuntimeDefaultsSource.includes('finalActionArbitrationHoldMs: 480'), 'final action arbitration hold default not found');
    assert(generatedRuntimeSource.includes('function blockThreatReturnAction'), 'generated runtime does not include return-block helper');
    assert(generatedRuntimeSource.includes("'active-threat-return-block'"), 'generated runtime does not include active threat return-block action');
    assert(generatedRuntimeSource.includes("'return-block-lateral-scan'"), 'generated runtime does not include return-block lateral scan action');
    assert(sourceRuntimeText.includes('action.ignoreReturnBlock = true;') && sourceRuntimeText.includes("'high-value-visible-coin-priority'"), 'high-value coin priority does not bypass return-block rewrite');
    assert(nodeSelfTestSource.includes("name: 'final arbitration keeps recent safety action over profit'"), 'final arbitration safety/profit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'final arbitration keeps recent combat action over recovery'"), 'final arbitration combat/recover self-test not found');
    assert(nodeSelfTestSource.includes("name: 'final arbitration does not keep profit over new combat'"), 'final arbitration combat override self-test not found');
  });

  check('run-self-test module covers combat fire discipline self-tests', () => {
    assert(nodeSelfTestSource.includes("name: 'recovering combat gap at threshold keeps fighting'"), 'recovery combat keep-fighting self-test not found');
    assert(nodeSelfTestSource.includes("name: 'recovering fights non-invulnerable moving enemy already in range'"), 'recovery non-invulnerable active combat self-test not found');
    assert(nodeSelfTestSource.includes("name: 'non-full active outside attack range does not enter combat'"), 'outside-range non-entry self-test not found');
    assert(nodeSelfTestSource.includes("name: 'non-full invulnerable active still flees'"), 'invulnerable active flee self-test not found');
    assert(nodeSelfTestSource.includes("name: 'full hp nearby invulnerable target still flees'"), 'full-HP invulnerable safety flee self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low hp no-damage combat keeps fighting without disadvantage'"), 'no-damage non-exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat preserves dodge stamina by pausing fire'"), 'dodge stamina reserve self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat reserve band uses burst fire without force shooting'"), 'burst fire self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat close pressure fire window keeps mid hp shooting'"), 'close-pressure fire window self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat long no-damage active duel resumes reserve-band fire'"), 'long no-damage duel fire self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat coordinate divergence immediately uses live precision aim'"), 'coordinate-divergence live precision self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat radial live target uses precision aim without waiting'"), 'radial-motion live precision self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat trend classifies long no-damage duel stance'"), 'combat trend stance self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat native tick interval tightens only during combat'"), 'combat-only native tick self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat action suppresses same-target pursuit leave'"), 'same-target pursuit suppression self-test not found');
    assert(nodeSelfTestSource.includes("name: 'defensive target switch requires immediate incoming bullet'"), 'defensive target switch self-test not found');
    assert(nodeSelfTestSource.includes("name: 'high hp combat gap observes before leaving'"), 'combat disadvantage observation self-test not found');
    assert(nodeSelfTestSource.includes("name: 'confirmed high hp combat gap leaves after observation'"), 'confirmed HP-gap exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat trade estimate observes losing exchange before exit'"), 'trade-estimate observation self-test not found');
    assert(nodeSelfTestSource.includes("name: 'confirmed combat trade estimate exits losing exchange'"), 'confirmed trade-estimate exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat zero damage trade estimate stays in fight while hp remains safe'"), 'zero-damage safe trade-estimate self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat zero damage trade estimate still exits when danger horizon is near'"), 'zero-damage unsafe trade-estimate self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat close pressure hp disadvantage exits before low hp threshold'"), 'close-pressure HP disadvantage self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat server stall no-damage waits for precision aim grace'"), 'server-stall precision grace self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat server stall long no-damage exits before broad hp disadvantage'"), 'server-stall no-damage exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat emergency close spacing overrides incoming bullet strafe'"), 'emergency close spacing override self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat low hp close risk exits before losing hp disadvantage'"), 'low-HP close-risk exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'engaged out-of-range combat target waits instead of chasing'"), 'out-of-range combat hold self-test not found');
    assert(nodeSelfTestSource.includes("name: 'out-of-range incoming bullet dodges without shooting'"), 'out-of-range incoming bullet dodge self-test not found');
    assert(nodeSelfTestSource.includes("name: 'engaged slight out-of-range bullet pressure dodges without shooting'"), 'engaged out-of-range pressure dodge self-test not found');
    assert(nodeSelfTestSource.includes("name: 'target-owned recoverable out-of-range pressure dodges with safe close bias'"), 'target-owned pressure safe-close dodge self-test not found');
    assert(nodeSelfTestSource.includes("name: 'losing out-of-range pressure keeps pure dodge without safe close bias'"), 'losing pressure pure-dodge guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'non-pressure out-of-range reengage keeps base hp gap guard'"), 'non-pressure reengage HP-gap guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'retreating slight out-of-range target still holds without pressure'"), 'out-of-range retreat-only hold self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low hp out-of-range finish target reengages without shooting'"), 'out-of-range finish reengage self-test not found');
    assert(nodeSelfTestSource.includes("name: 'engaged beyond disengage range exits combat state'"), 'disengage-range combat exit self-test not found');
    assert(nodeSelfTestSource.includes("name: 'retreating edge combat target suppresses fire'"), 'retreating edge fire suppression self-test not found');
    assert(nodeSelfTestSource.includes("name: 'low hp retreating edge target gets finish pressure'"), 'low-HP retreating finish-pressure self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat far no-damage retreating fighter pressure closes under real bullet'"), 'retreating fighter close self-test not found');
    assert(nodeSelfTestSource.includes("name: 'retreat ignored target is not reselected without incoming bullet'"), 'retreat-ignore target selection self-test not found');
    assert(nodeSelfTestSource.includes("name: 'incoming bullet can reengage retreat ignored target'"), 'retreat-ignore incoming override self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat log exit summary covers pending exit decisions'"), 'pending-exit log summary self-test not found');
    assert(nodeSelfTestSource.includes("name: 'leave success requests refresh before confirmation'"), 'leave-success refresh request self-test not found');
    assert(nodeSelfTestSource.includes("name: 'restored leave success pending exit marks reload confirmation'"), 'restored pending exit reload marker self-test not found');
    assert(nodeSelfTestSource.includes("name: 'refreshed leave success still online retries original pending exit'"), 'refreshed still-online retry self-test not found');
    assert(nodeSelfTestSource.includes("name: 'refreshed leave success offline confirms exit'"), 'refreshed offline confirmation self-test not found');
    assert(nodeSelfTestSource.includes("name: 'offline sampling outage summary is explicit'"), 'sampling outage summary self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat sampling outage triggers offline leave gate'"), 'combat sampling outage trigger self-test not found');
    assert(nodeSelfTestSource.includes("name: 'non-combat sampling outage does not trigger by default'"), 'non-combat sampling outage guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'offline combat tick gap summary is explicit'"), 'combat tick gap summary self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat tick gap triggers offline leave gate'"), 'combat tick gap trigger self-test not found');
    assert(nodeSelfTestSource.includes("name: 'non-combat tick gap does not trigger by default'"), 'non-combat tick gap guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'recent combat frame gap alone does not leave during coin route'"), 'recent combat-frame stale-context guard self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat frame gap with active tick records gating diagnosis'"), 'combat frame gap diagnosis self-test not found');
    assert(nodeSelfTestSource.includes("name: 'combat tick reentry gap records stuck async diagnosis'"), 'combat tick reentry diagnosis self-test not found');
  });

  const obsoleteReason = ['wait', 'for', 'clear', 'opportunity'].join('-');
  const obsoleteDisplayText = String.fromCharCode(0x6536, 0x76ca, 0x63a5, 0x8fd1);
  const obsoletePatterns = [
    { label: 'obsolete ambiguous wait reason', text: obsoleteReason },
    { label: 'obsolete ambiguous wait display text', text: obsoleteDisplayText }
  ];

  for (const pattern of obsoletePatterns) {
    check(`${pattern.label} is absent from runtime files`, () => {
      const offenders = RUNTIME_FILES.filter(file => readText(file).includes(pattern.text));
      assert(offenders.length === 0, `found in ${offenders.join(', ')}`);
    });
  }

  for (const file of BOOTSTRAP_FILES) {
    const text = readText(file);
    check(`${file} passes manifest sha256 as sourceHash`, () => {
      assert(text.includes('sourceHash: String(manifest.sha256 || \'\')'), 'manifest sha256 sourceHash injection not found');
    });
    check(`${file} resets embedded workspace layout`, () => {
      assert(/\.workspace\{[^'"\r\n]*inset:auto!important[^'"\r\n]*transform:none!important[^'"\r\n]*flex:1 1 0!important/.test(text), 'workspace inset/transform/flex reset not found');
      assert(/\.workspace>\.map-shell\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important/.test(text), 'map-shell fill rule not found');
      assert(/\.workspace #world\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important[^'"\r\n]*display:block!important/.test(text), 'world fill rule not found');
      assert(/@media \(min-aspect-ratio:1\/1\)\{body\.grasp-rat-bot-sidebar-embedded \.workspace #world\{[^'"\r\n]*width:calc\(100% \+ 368px\)!important[^'"\r\n]*max-width:none!important[^'"\r\n]*margin-left:-368px!important/.test(text), 'landscape world crop offset rule not found');
      assert(functionBody(text, 'dispatchNativeViewportResize').includes("window.dispatchEvent(new Event('resize'))"), 'native resize dispatch helper not found');
      const syncBody = functionBody(text, 'syncNativeSidebarStructure');
      assert(syncBody.includes("scheduleNativeViewportResize('sidebar-structure')"), 'sidebar layout changes do not schedule native resize');
      const placeBody = functionBody(text, 'placeBootstrapPanel');
      assert(placeBody.includes("scheduleNativeViewportResize('panel-insert')"), 'panel insertion does not schedule native resize');
    });
    check(`${file} uses compact dot panel controls`, () => {
      assert(text.includes('const statusDot = createDot(statusTitle, statusColor, statusHalo, statusGlow'), 'BOT status dot not found');
      assert(text.includes("label: 'BOT'"), 'BOT status dot visible label not found');
      assert(text.includes("onClick: () => setPaused(!isPaused(), 'panel bot dot')"), 'BOT status dot pause toggle not found');
      assert(text.includes("statusDot.setAttribute('aria-pressed', String(paused))"), 'BOT status dot aria-pressed not found');
      assert(text.includes('actions.appendChild(createDot(wsTitle, wsColor'), 'WS state dot not found');
      assert(text.includes("label: 'WS'"), 'WS state dot visible label not found');
      assert(text.includes('combatLogEndpointConfigured'), 'combat log endpoint configured flag not found');
      assert(text.includes('const remoteLogVisible = Boolean(cfg.combatLogEndpointConfigured)'), 'remote-log visibility gate not found');
      assert(text.includes('if (remoteLogVisible) {'), 'remote-log dot is not hidden before endpoint configuration');
      assert(text.includes('const logDot = createDot(remoteLogTitle, remoteLogColor, remoteLogHalo, remoteLogGlow'), 'remote-log dot not found');
      assert(text.includes("label: 'Log'"), 'remote-log dot visible label not found');
      assert(text.includes("const REPOSITORY_URL = 'https://github.com/ZeroJehovah/grasp-rat-bot'"), 'GitHub repository URL constant not found');
      assert(text.includes('const createRepositoryLink = () => {'), 'GitHub repository panel link helper not found');
      assert(text.includes("link.setAttribute('aria-label', 'Open Grasp Rat Bot GitHub repository')"), 'GitHub repository link aria label not found');
      assert(text.includes("header.appendChild(createRepositoryLink())"), 'GitHub repository link is not appended to the panel header');
      assert(text.includes('justify-content:space-between'), 'panel header does not place the GitHub link on the right');
      const loginBody = functionBody(text, 'syncEntityControlLogin');
      assert(text.includes('function reloginHoldRemainingFromStatus'), 'relogin hold inline-login helper not found');
      assert(text.includes('function shouldShowInlineLogin'), 'inline login visibility helper not found');
      assert(text.includes('function waitReasonPrefersLastExit'), 'relogin wait reason helper not found');
      assert(text.includes('function panelReasonDetail'), 'panel reason detail helper not found');
      assert(text.includes('function staminaExhaustedReasonDetail'), 'panel stamina exhaustion reason helper not found');
      assert(loginBody.includes('!shouldShowInlineLogin(status)'), 'inline login is still hidden solely by logged-in state');
      assert(functionBody(text, 'shouldShowInlineLogin').includes('waitReasonPrefersLastExit(status)'), 'inline login is not visible during relogin/no-self safety waits');
      assert(loginBody.includes('跳过重连等待并立即登录/加入游戏'), 'inline login title does not reflect relogin hold bypass');
      assert(text.includes('function bootstrapLoginPointSafetyBlock'), 'bootstrap login-point safety block helper not found');
      assert(text.includes('LOGIN_POINT_SAFETY_KEY'), 'bootstrap cannot read persisted login-point safety');
      assert(text.includes('function installNativeLoginGateInterceptors'), 'bootstrap native login event interceptors not found');
      assert(text.includes('function installStartLinuxDoLoginGate'), 'bootstrap startLinuxDoLogin gate not found');
      assert(text.includes('blockNativeLoginEventIfNeeded'), 'bootstrap native login event blocker not installed');
      assert(loginBody.includes('bootstrapLoginPointSafetyBlock(status)'), 'inline login button does not consult login-point safety gate');
      assert(loginBody.includes('手动登录优先'), 'inline login button does not expose manual priority while safety gate is blocked');
      assert(loginBody.includes("loginButton.disabled = loginButton.dataset.graspRatLoginPending === 'true'"), 'inline login button can still be disabled by safety gate');
      assert(loginBody.includes('manualBypassed: true'), 'inline login does not record manual safety-gate bypass evidence');
      const fallbackLoginBody = functionBody(text, 'maybeStartGameLogin');
      assert(fallbackLoginBody.includes('bootstrapLoginPointSafetyBlock(status)'), 'bootstrap fallback login can bypass login-point safety gate');
      assert(fallbackLoginBody.includes('paused && !force'), 'bootstrap manual login is still blocked while paused');
      assert(fallbackLoginBody.includes('loginGateBlock && !force'), 'bootstrap automatic login no longer honors login-point safety gate');
      assert(fallbackLoginBody.includes('loginGateBlock && force'), 'bootstrap manual login does not record safety-gate bypass');
      assert(fallbackLoginBody.includes('__graspRatBotRawStartLinuxDoLogin'), 'bootstrap manual login does not bypass old remote startLinuxDoLogin guards');
      assert(fallbackLoginBody.includes('markManualLoginBypass(reason)'), 'bootstrap fallback manual login does not mark native bypass');
      const forceBody = functionBody(text, 'forceLoginNow');
      assert(forceBody.includes('markManualLoginBypass(text)'), 'bootstrap force login does not mark manual bypass');
      assert(forceBody.includes('result?.login?.attempted'), 'bootstrap force login still clears relogin holds without a login attempt');
      assert(forceBody.includes('result.manualFallbackLogin = fallbackLogin'), 'bootstrap force login does not fallback when old remote returns snapshot-gate');
      assert(forceBody.includes('manualBypassed: true'), 'bootstrap force login does not record manual safety-gate bypass evidence');
      assert(text.includes('function markManualLoginBypass'), 'bootstrap manual login bypass marker not found');
      assert(text.includes('function manualLoginBypassActive'), 'bootstrap manual login bypass state not found');
      assert(functionBody(text, 'blockNativeLoginEventIfNeeded').includes('event?.isTrusted'), 'bootstrap trusted native manual login events can still be blocked');
      assert(functionBody(text, 'installStartLinuxDoLoginGate').includes('manualLoginBypassActive()'), 'bootstrap startLinuxDoLogin gate does not honor manual login bypass');
      assert(text.includes('const remoteLogHasFailure = remoteLogFailed > 0'), 'remote-log failure state not found');
      assert(text.includes('const remoteLogColor = remoteLogHasFailure'), 'remote-log color does not depend on outstanding failed count');
      assert(text.includes('pending: remoteLogPending > 0 && !remoteLogHasFailure'), 'remote-log pending blink state not found');
      assert(text.includes('onClick: () => configureCombatLogging({ enabled: !remoteLogEnabled })'), 'remote-log dot toggle not found');
      assert(text.includes("logDot.setAttribute('aria-pressed', String(remoteLogEnabled))"), 'remote-log dot aria-pressed not found');
    });
    check(`${file} displays network quality latency/loss in the header pill`, () => {
      assert(text.includes('const networkQuality = status?.networkQuality || {}'), 'status.networkQuality source not found');
      assert(text.includes('function networkQualityLatencyText'), 'network latency formatter not found');
      assert(text.includes('function networkQualityLossText'), 'network loss formatter not found');
      assert(text.includes('function networkQualitySummaryText'), 'combined network quality formatter not found');
      assert(text.includes("return networkQualityLatencyText(summary) + '/' + networkQualityLossText(summary)"), 'combined network quality text does not use latency/loss slash format');
      assert(text.includes('function networkQualityLatencyTitle'), 'network latency tooltip not found');
      assert(text.includes('function networkQualityLossTitle'), 'network loss tooltip not found');
      assert(text.includes('function networkQualitySummaryTitle'), 'combined network quality tooltip not found');
      assert(text.includes('const appendClockNetworkLine = () => {'), 'clock/network row helper not found');
      assert(text.includes("time.textContent = '当前时间：' + formatClockTime()"), 'current clock text is not rendered in the network row');
      assert(text.includes('const createNetworkQualityPill = () => {'), 'header network quality pill helper not found');
      assert(text.includes('actions.appendChild(createNetworkQualityPill())'), 'network quality pill is not rendered after header status controls');
      assert(text.includes('height:24px') && text.includes('border-radius:999px') && text.includes('background:rgba(15,23,42,.50)'), 'network quality pill does not match compact header control styling');
      assert(text.includes("latency.textContent = networkQualityLatencyText(networkQuality)"), 'network latency text is not rendered in the header pill');
      assert(text.includes("latency.style.cssText = 'color:' + networkQualityLatencyColor(networkQuality)"), 'network latency color is not independent');
      assert(text.includes("slash.textContent = '/'") && text.includes("slash.style.cssText = 'color:#fff'"), 'network slash is not rendered in white');
      assert(text.includes("loss.textContent = networkQualityLossText(networkQuality)"), 'network loss text is not rendered in the header pill');
      assert(text.includes("loss.style.cssText = 'color:' + networkQualityLossColor(networkQuality)"), 'network loss color is not independent');
      assert(!text.includes('networkText.textContent = networkQualitySummaryText(networkQuality)'), 'network quality still renders in the clock row');
      assert(!text.includes('flex:0 0 96px;min-width:96px'), 'network quality still reserves a fixed width');
      assert(!text.includes("appendNetworkMetric('延迟'"), 'latency metric still renders a visible label');
      assert(!text.includes("appendNetworkMetric('丢包'"), 'loss metric still renders a visible label');
      assert(!text.includes('label: networkQualityLatencyText(networkQuality)'), 'network latency is still rendered as a header dot label');
      assert(!text.includes('label: networkQualityLossText(networkQuality)'), 'network loss is still rendered as a header dot label');
      assert(!text.includes("label: '延迟 ' + networkQualityLatencyText(networkQuality)"), 'network latency visible label still includes text prefix');
      assert(!text.includes("label: '丢包 ' + networkQualityLossText(networkQuality)"), 'network loss visible label still includes text prefix');
      assert(text.includes("'??ms'"), 'network latency unknown placeholder is not ??ms');
      assert(text.includes("'??.??%'"), 'network loss unknown placeholder is not ??.??%');
      assert(text.includes("toFixed(2) + '%'"), 'network loss label does not reserve 00.00% precision');
      assert(text.includes('等待运行时网络质量样本'), 'latency no-sample tooltip not found');
      assert(text.includes('等待 WS 状态帧样本'), 'loss no-sample tooltip not found');
    });
    check(`${file} suppresses routine bootstrap console noise`, () => {
      assert(text.includes('function shouldLogBootstrap'), 'bootstrap log filter not found');
      assert(text.includes('debugBootstrapLogging'), 'bootstrap verbose logging switch not found');
      assert(text.includes('statusEvery: 30000'), 'bootstrap statusEvery default is not reduced');
      assert(text.includes('Number(storedStatusEveryRaw) === 1000 ? DEFAULTS.statusEvery'), 'bootstrap does not migrate old 1000ms statusEvery default');
      assert(text.includes('storedStatusEvery === 0 ? 0 : Math.max(1000'), 'bootstrap cannot disable status logging with statusEvery=0');
      assert(text.includes('watchdog ok|watchdog skipped: busy|poll skipped: busy|poll ok: bot current'), 'routine watchdog/poll logs are not filtered');
      assert(text.includes('manifest fetch start|manifest fetch try|manifest fetch ok|manifest fetch complete'), 'routine manifest fetch logs are not filtered');
    });
    check(`${file} keeps panel section titles removed`, () => {
      const removedText = [
        stringFromCodes([0x72b6, 0x6001, 0xff1a]),
        stringFromCodes([0x811a, 0x672c, 0x4fe1, 0x606f]),
        stringFromCodes([0x7edf, 0x8ba1, 0x4fe1, 0x606f]),
        'BOT' + stringFromCodes([0x884c, 0x4e3a])
      ];
      const offenders = removedText.filter(value => text.includes(value));
      assert(offenders.length === 0, `removed visible text found: ${offenders.join(', ')}`);
      assert(!/appendLine\(['"]\s*remote log/i.test(text), 'visible remote log append line found');
    });
    check(`${file} uses tooltip-only metric labels`, () => {
      assert(text.includes("item.title = String(metric.label ?? '')"), 'metric item title not found');
      assert(text.includes("item.setAttribute('aria-label', String(metric.label ?? ''))"), 'metric item aria-label not found');
      assert(text.includes("value.textContent = String(metric.value ?? '-')"), 'metric value-only text not found');
      assert(!/textContent\s*=\s*String\(metric\.label/.test(text), 'metric label appears as visible textContent');
      assert(!/appendChild\(label\)/.test(text), 'metric label element append found');
      assert(text.includes("const todaySession = status?.todaySession || {}"), 'today/session metric source not found');
      assert(!text.includes('function formatMetricPair'), 'old a(b) metric formatter is still present');
      assert(text.includes("label: '今日统计：登录时间'"), 'today login-time metric label not found');
      assert(text.includes("label: '今日统计：金币收益'"), 'today coin-profit metric label not found');
      assert(text.includes("label: '今日统计：击杀次数'"), 'today kill-count metric label not found');
      assert(text.includes("label: '本次登录统计：登录时间'"), 'current-login time metric label not found');
      assert(text.includes("label: '本次登录统计：金币收益'"), 'current-login coin-profit metric label not found');
      assert(text.includes("label: '本次登录统计：击杀次数'"), 'current-login kill-count metric label not found');
      assert(text.includes('value: formatDuration(todayUptimeMs)') && text.includes('value: formatDuration(sessionUptimeMs)'), 'today/current login time metrics are not split');
      assert(!text.includes("value: '+' + formatNumber(coinsGained"), 'coin-profit metric still renders a plus sign');
      assert(text.includes('status?.lastSelf || lastDailyStaminaSelf(status)'), 'panel stamina line does not fall back to last/today self state');
    });
    check(`${file} formats stamina as second-scale remaining/limit values`, () => {
      const body = functionBody(text, 'formatStamina');
      assert(countMatches(body, /\bpairText\(/g) === 3, 'formatStamina should use exactly three pairText calls');
      assert(body.includes("Math.max(0, Math.round(r / 1000)) + '/' + Math.round(l / 1000)"), 'second-scale remaining/limit pair formatting not found');
      assert(!body.includes('%'), 'percent stamina formatting found');
      assert(text.includes("staminaPill.textContent = '") && text.includes("' + formatStamina(self)"), 'stamina line does not render formatStamina output');
    });
    check(`${file} keeps compact panel spacing and wait countdown inline`, () => {
      assert(text.includes('padding:10px 16px 9px'), 'first panel section does not use 16px horizontal padding');
      assert(text.includes('padding:9px 16px'), 'panel sections do not use 16px horizontal padding');
      assert(text.includes("appendLine('当前行为：' + behaviorText(decision, status) + (hold > 0 ? '，等待重连：' + formatDuration(hold) : ''))"), 'relogin countdown is not inline with current behavior');
      assert(!text.includes("appendLine('等待重连：' + formatDuration(hold))"), 'standalone relogin countdown line is still present');
    });
    check(`${file} renders relogin gate conditions in the panel`, () => {
      assert(text.includes('function reloginGateFromStatus(status)'), 'relogin gate status normalizer not found');
      assert(text.includes('function formatReloginGateDuration(ms)'), 'relogin gate duration formatter not found');
      assert(text.includes("text: '冷却时间: ' + formatReloginGateDuration(gate.cooldown.remainingMs) + ' / ' + formatReloginGateDuration(gate.cooldown.totalMs)"), 'cooldown gate row not rendered');
      assert(!text.includes("text: '快照接口连通性: ' + gate.snapshot.streak + ' / ' + gate.snapshot.required"), 'snapshot connectivity gate row is still rendered');
      assert(text.includes("text: '登录点安全: ' + gate.loginPointSafety.streak + ' / ' + gate.loginPointSafety.required"), 'login point safety gate row not rendered');
      assert(text.includes('if (reloginGateVisible(status, hold))'), 'relogin gate rows are not guarded by relogin visibility');
    });
    check(`${file} displays current clock and distinct action reason labels`, () => {
      assert(text.includes('function formatClockTime'), 'clock formatter not found');
      assert(text.includes('appendClockNetworkLine()'), 'current clock/network line not rendered');
      const requiredMappings = {
        'best-opportunity-coin-route': '综合收益最高：金币路线',
        'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
        'near-coin-priority': '近处安全金币优先',
        'safe-distant-coin': '前往远处安全金币',
        'high-value-visible-coin-priority': '高价值可见金币优先',
        'avoid-invulnerable-target': '避开无敌/危险目标',
        'post-attack-drop-wait-position': '战斗后等待掉落刷新',
        'combat-disengage-range': '战斗：目标远离，脱离观察',
        'target-whitelisted': '目标在白名单内，跳过攻击',
        'control-combat-tick-gap': '战斗主循环断档，按 WebSocket 离线处理',
        'control-action-settlement-stalled': '移动/开火结算卡死，按 WebSocket 离线处理'
      };
      for (const [reason, label] of Object.entries(requiredMappings)) {
        assert(text.includes(`'${reason}': '${label}'`), `${reason} mapping missing`);
      }
      assert(requiredMappings['best-opportunity-coin-route'] !== requiredMappings['best-opportunity-visible-coin'], 'route and visible coin labels are not distinct');
    });
    check(`${file} scopes panel reason to current decision`, () => {
      const detailBody = functionBody(text, 'decisionReasonDetail');
      const currentDetailBody = functionBody(text, 'currentDecisionExitDetail');
      const allowsBody = functionBody(text, 'decisionAllowsCurrentExitDetail');
      const panelBody = functionBody(text, 'panelReasonDetail');
      const exitTextBody = functionBody(text, 'exitDetailText');
      const waitOnlyBody = functionBody(text, 'waitOnlyExitDetailText');
      assert(detailBody.includes("if (!decision) return '';"), 'reason detail does not return empty without a current decision');
      assert(detailBody.includes('decisionAllowsCurrentExitDetail(decision)'), 'reason detail does not gate exit details by current decision kind');
      assert(detailBody.includes('currentDecisionExitDetail(decision)'), 'reason detail does not read current decision exit detail');
      assert(detailBody.includes('return reason ? reasonText(reason) : \'\';'), 'reason detail does not fall back only to current reason mapping');
      assert(!detailBody.includes('activePersistentExitDetail(status)'), 'reason detail can still read persistent historical exits');
      assert(!detailBody.includes('status?.enemyLeave') && !detailBody.includes('status?.offlineLeave'), 'reason detail can still read status exit summaries');
      assert(!detailBody.includes('session?.exit') && !detailBody.includes('lastExitReasonDetail'), 'reason detail can still read older session/last-exit summaries');
      assert(currentDetailBody.includes('decision?.displayReason') && currentDetailBody.includes('decision?.leave?.displayReason'), 'current decision detail helper does not read current decision fields');
      assert(!currentDetailBody.includes('status') && !currentDetailBody.includes('localStorage'), 'current decision detail helper can read non-current state');
      assert(allowsBody.includes("return kind === 'leave' || kind === 'wait' || kind === 'idle';"), 'exit detail scope is not limited to current wait/leave/idle decisions');
      assert(text.includes('function exitDetailText'), 'panel has no shared exit detail text helper');
      assert(text.includes('function waitOnlyExitDetailText'), 'panel has no wait-only exit detail filter');
      assert(waitOnlyBody.includes('登录点安全快照') && waitOnlyBody.includes('game-session-connecting'), 'wait-only exit detail filter misses relogin gate reasons');
      assert(exitTextBody.indexOf('detail?.summary') >= 0 && exitTextBody.indexOf('detail?.summary') < exitTextBody.indexOf('detail?.displayReason'), 'panel exit detail still prefers display wait text over exit summary');
      assert(exitTextBody.includes('!waitOnlyExitDetailText(text)'), 'panel exit detail does not filter duplicated wait/gate text');
      assert(panelBody.includes('waitReasonPrefersLastExit(status)'), 'panel reason does not detect relogin/no-self wait states');
      assert(panelBody.includes('exitDetailText(activePersistentExitDetail(status))'), 'panel reason does not prefer preserved exit detail during relogin/no-self waits');
      assert(panelBody.includes('return decisionReasonDetail(decision, status);') && !panelBody.includes('lastExitReasonDetail'), 'panel reason fallback is not scoped to current decision detail');
      assert(text.includes("const reasonDetail = state.cloudflareError?.displayReason || panelReasonDetail(decision, status) || '';"), 'panel reason still has a reasonText fallback');
      assert(!text.includes("const reasonDetail = state.cloudflareError?.displayReason || panelReasonDetail(decision, status) || reasonText(decision?.reason);"), 'panel reason still falls back to reasonText directly');
      assert(text.includes('if (reasonDetail) {') && text.includes("{ text: '原因：'"), 'panel still renders an empty reason row');
    });
    check(`${file} renders combat HP as a full-width fight panel`, () => {
      const body = functionBody(text, 'appendCombatHpPanel');
      assert(body.includes("'width:100%'"), 'combat HP panel is not full width');
      assert(body.includes("'background:rgba(24,24,27,.96)'"), 'combat HP panel does not use its own background');
      assert(body.includes("'grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)'"), 'combat HP panel does not use symmetric VS columns');
      assert(body.includes("box.appendChild(sideBlock(hp.selfName, hp.selfHp, hp.selfMaxHp, 'right', '#86efac'))"), 'self side is not right-aligned left of VS');
      assert(body.includes("box.appendChild(sideBlock(hp.targetName, hp.targetHp, hp.targetMaxHp, 'left', '#fca5a5'))"), 'target side is not left-aligned right of VS');
      assert(body.includes("'width:' + combatHpPercent(value, maxValue) + '%'"), 'combat HP bar width is not driven by HP percent');
      assert(body.includes("right ? 'right:0' : 'left:0'"), 'combat HP bar fill is not mirrored by side');
      assert(text.includes('function entityNameText(entity)'), 'combat HP display does not prefer entity names');
      assert(text.includes('selfName: entityNameText(selfEntity)') && text.includes('targetName: entityNameText(target)'), 'combat HP summary does not expose names');
      assert(text.includes('appendCombatHpPanel(panel, hp)'), 'combat HP panel is not appended as its own panel block');
      assert(!text.includes('combatHpComparisonParts'), 'old inline combat HP comparison renderer is still present');
    });
    check(`${file} shows script versions without v prefix`, () => {
      assert(!text.includes('远程脚本 v'), 'remote script visible version still has v prefix');
      assert(!text.includes('加载器 篡改猴 v'), 'userscript visible version still has v prefix');
      assert(!text.includes('加载器 扩展 v'), 'extension visible version still has v prefix');
    });
  }

  check('status-panel source carries distinct action reason labels', () => {
    const requiredMappings = {
      'best-opportunity-coin-route': '综合收益最高：金币路线',
      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
      'near-coin-priority': '近处安全金币优先',
      'safe-distant-coin': '前往远处安全金币',
      'high-value-visible-coin-priority': '高价值可见金币优先',
      'avoid-invulnerable-target': '避开无敌/危险目标',
      'post-attack-drop-wait-position': '战斗后等待掉落刷新',
      'combat-disengage-range': '战斗：目标远离，脱离观察',
      'target-whitelisted': '目标在白名单内，跳过攻击'
    };
    for (const [reason, label] of Object.entries(requiredMappings)) {
      assert(statusPanelSourceModule.includes(`'${reason}': '${label}'`), `${reason} mapping missing`);
    }
    assert(requiredMappings['best-opportunity-coin-route'] !== requiredMappings['best-opportunity-visible-coin'], 'route and visible coin labels are not distinct');
  });

  const userscriptText = readText('userscript/grasp-rat-bootstrap.user.js');
  check('userscript metadata version matches runtime constant', () => {
    const metaVersion = extractSingle(userscriptText, /^\s*\/\/\s*@version\s+([^\s]+)/m, 'userscript @version');
    const constantVersion = extractSingle(userscriptText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'userscript BOOTSTRAP_VERSION');
    assert(metaVersion === constantVersion, `metadata=${metaVersion} constant=${constantVersion}`);
    return metaVersion;
  });

  const extensionManifest = readJson('extension/manifest.json');
  const extensionBootstrapText = readText('extension/page-bootstrap.js');
  check('extension manifest version matches page bootstrap constant', () => {
    const constantVersion = extractSingle(extensionBootstrapText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'extension BOOTSTRAP_VERSION');
    assert(String(extensionManifest.version || '') === constantVersion, `manifest=${extensionManifest.version || '(empty)'} constant=${constantVersion}`);
    return constantVersion;
  });

  for (const result of results) {
    const prefix = result.ok ? 'ok' : 'FAIL';
    const detail = result.detail ? ` - ${result.detail}` : '';
    console.log(`${prefix} ${result.name}${detail}`);
  }

  const failures = results.filter(result => !result.ok);
  if (failures.length) {
    console.error(`verify-objective-build failed: ${failures.length} issue(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`objective build verification ok (${results.length} checks)`);
}

main();
