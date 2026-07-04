#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  browserRuntimeEvalSourceFor,
  bundledRemoteSourceFor
} = require('./remote-bot-bundle');

const ROOT = path.resolve(__dirname, '..');

const RUNTIME_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js',
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const REMOTE_BOT_FILES = [
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

function assertBundledOnlySourceModule(text, label) {
  assert(!/function\s+[A-Za-z0-9_$]*InlineSource\s*\(/.test(text), `${label} still exposes an inline source factory`);
  assert(!/function\s+bundled[A-Z][A-Za-z0-9_$]*Source\s*\(/.test(text), `${label} still exposes a bundled selector factory`);
  assert(!text.includes('options.bundledRuntime'), `${label} still branches on optional bundledRuntime`);
  assert(!text.includes('config?.bundledRuntime'), `${label} still branches on optional bundledRuntime config`);
}

async function generateRemoteBuild(manifest) {
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

async function main() {
  const rootPackage = readJson('package.json');
  const manifest = readJson('dist/manifest.json');
  const targetWhitelistConfig = readJson('dist/target-whitelist.json');
  const distSource = readText('dist/grasp-rat-remote-bot.js');
  const sourceBot = readText('grasp-rat-bot.js');
  const runtimeEntrySourceModule = readText('src/browser/runtime-entry-source.js');
  const runtimeSourceModule = readText('src/browser/runtime-source.js');
  const runtimeFragmentsSourceModule = readText('src/browser/runtime-fragments-source.js');
  const runtimeFragmentRegistryModule = readText('src/browser/runtime-fragment-registry.js');
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
  const pendingExitRuntimeModule = readText('src/browser/runtime/pending-exit.js');
  const leaveCommandRuntimeModule = readText('src/browser/runtime/leave-command.js');
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
  const dropMatchedKillRuntimeModule = readText('src/browser/runtime/drop-matched-kill.js');
  const staminaBudgetRuntimeModule = readText('src/browser/runtime/stamina-budget.js');
  const opportunityConstantsRuntimeModule = readText('src/browser/runtime/opportunity-constants.js');
  const strategyActionArbitrationSource = readText('src/strategy/action-arbitration.js');
  const strategyActionPrioritySource = readText('src/strategy/action-priority.js');
  const strategyActionSwitchDiagnosticsSource = readText('src/strategy/action-switch-diagnostics.js');
  const strategyAttackWorthSource = readText('src/strategy/attack-worth.js');
  const strategyExitMotionSource = readText('src/strategy/exit-motion.js');
  const strategyPendingExitSource = readText('src/strategy/pending-exit.js');
  const strategyLeaveCommandSource = readText('src/strategy/leave-command.js');
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
  const strategyDropMatchedKillSource = readText('src/strategy/drop-matched-kill.js');
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
  const pendingExitSummaryCallSourceModule = readText('src/browser/pending-exit-summary-call-source.js');
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
    runtimeEntrySourceModule,
    runtimeSourceModule,
    runtimeFragmentsSourceModule,
    runtimeFragmentRegistryModule,
    runtimeBootstrapSourceModule,
    browserPageGlobalCoreSource,
    targetWhitelistRuntimeModule,
    exitSummaryRuntimeModule,
    browserPreservedStateRuntimeModule,
    persistentExitRuntimeModule,
    persistentLastSelfRuntimeModule,
    persistentClearRuntimeModule,
    pendingExitPersistenceRuntimeModule,
    pendingExitRuntimeModule,
    leaveCommandRuntimeModule,
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
    dropMatchedKillRuntimeModule,
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
    strategyPendingExitSource,
    strategyLeaveCommandSource,
    strategyDropMatchedKillSource,
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
  const generatedBuild = await generateRemoteBuild(manifest);
  const generatedSource = generatedBuild.bundledSource;
  const generatedRuntimeSource = generatedBuild.directSource;
  const generatedEvalSource = await browserRuntimeEvalSourceFor({
    dryRun: true,
    once: true,
    statusEvery: 0,
    version: String(manifest.version || ''),
  });
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
    assert(manifest.bundler?.mode === 'production-runtime-entry-source', 'production manifest mode is not the production runtime entry-source mode');
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
    assert(distSource.includes('var require_pending_exit = __commonJS'), 'bundled production dist does not bundle the pending-exit runtime module through esbuild');
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
    assert(distSource.includes('var require_drop_matched_kill = __commonJS'), 'bundled production dist does not bundle the drop-matched-kill runtime module through esbuild');
    new vm.Script(distSource, { filename: 'dist/grasp-rat-remote-bot.js' });
    assert(buildRemoteSource.includes("require('./remote-bot-bundle')"), 'production build does not use the shared remote bundler');
    assert(buildRemoteSource.includes('writeRemoteBotBundle'), 'production build does not write through the shared remote bundler');
    assert(!buildRemoteSource.includes('browserBotSource'), 'production build should not bypass the shared remote bundler');
    assert(remoteBundleSource.includes("const esbuild = require('esbuild')"), 'shared remote bundler does not use esbuild');
    assert(remoteBundleSource.includes("require('../src/browser/runtime-entry-source')"), 'shared remote bundler does not use the browser runtime entry-source boundary');
    assert(remoteBundleSource.includes('remoteRuntimeEntrySource(options)'), 'shared remote bundler does not get direct source through the runtime entry-source boundary');
    assert(remoteBundleSource.includes("const VIRTUAL_ENTRY_NAMESPACE = 'grasp-rat-virtual-entry'"), 'shared remote bundler does not define the virtual entry namespace');
    assert(remoteBundleSource.includes("const REMOTE_RUNTIME_ENTRY = 'grasp-rat-remote-runtime-entry.js'"), 'shared remote bundler does not name the remote runtime virtual entry');
    assert(remoteBundleSource.includes("const RUNTIME_EVAL_ENTRY = 'grasp-rat-runtime-eval-entry.js'"), 'shared remote bundler does not name the runtime eval virtual entry');
    assert(remoteBundleSource.includes('function virtualEntryPlugin(entryPath, contents)'), 'shared remote bundler does not expose the virtual entry plugin');
    assert(remoteBundleSource.includes('build.onResolve({ filter: entryFilter }'), 'virtual entry plugin does not resolve the generated entry');
    assert(remoteBundleSource.includes('build.onLoad({ filter: entryFilter, namespace: VIRTUAL_ENTRY_NAMESPACE }'), 'virtual entry plugin does not load the generated entry source');
    assert(remoteBundleSource.includes('resolveDir: ROOT'), 'virtual entry plugin does not resolve generated runtime imports from the repo root');
    assert(remoteBundleSource.includes('function bundleVirtualEntry(entryPath, contents, options = {})'), 'shared remote bundler does not expose virtual entry bundling');
    assert(remoteBundleSource.includes('entryPoints: [entryPath]'), 'shared remote bundler does not build through explicit entryPoints');
    assert(remoteBundleSource.includes('plugins: [virtualEntryPlugin(entryPath, contents)]'), 'shared remote bundler does not install the virtual entry plugin');
    assert(!remoteBundleSource.includes('stdin: {'), 'shared remote bundler still feeds generated runtime source through esbuild stdin');
    assert(remoteBundleSource.includes('function bundleRuntimeEvalSource(entrySource)'), 'shared remote bundler does not expose the CDP/runtime eval bundle path');
    assert(runtimeEntrySourceModule.includes('function runtimeEvalEntrySource(options = {})'), 'runtime eval entry-source factory not found');
    assert(runtimeEntrySourceModule.includes('return `export default ${directSource};`;'), 'runtime eval entry-source does not preserve startup result as a default export');
    assert(remoteBundleSource.includes('return ${globalName}.default;'), 'runtime eval bundle does not return the default startup result');
    assert(!remoteBundleSource.includes("require('../src/browser/bot-source')"), 'shared remote bundler should not depend directly on the old browser source builder');
    assert(!remoteBundleSource.includes("require('../src/browser/runtime-source')"), 'shared remote bundler should not bypass runtime entry-source');
    assert(remoteBundleSource.includes('write: false'), 'shared remote bundler should generate source through esbuild outputFiles');
    assert(remoteBundleSource.includes("format: BUNDLER_INFO.format"), 'shared remote bundler does not centralize IIFE format');
    assert(remoteBundleSource.includes("platform: BUNDLER_INFO.platform"), 'shared remote bundler does not centralize browser platform');
    assert(remoteBundleSource.includes("target: [BUNDLER_INFO.target]"), 'shared remote bundler does not centralize es2020 target');
  });

  check('local CDP and print-source use the esbuild runtime eval bundle', () => {
    assert(sourceBot.includes("require('./scripts/remote-bot-bundle')"), 'main bot does not import the shared remote bundler');
    assert(sourceBot.includes('await browserRuntimeEvalSourceFor({'), 'main bot does not await the runtime eval bundle for injection/print-source');
    assert(!sourceBot.includes("require('./src/browser/runtime-source')"), 'main bot still imports direct runtime-source generation');
    assert(!sourceBot.includes('browserRuntimeSource({'), 'main bot still injects direct runtime source');
    assert(generatedEvalSource.includes('__graspRatBotRuntimeEvalBundle'), 'generated eval source does not contain the eval bundle wrapper');
    assert(generatedEvalSource.includes('return __graspRatBotRuntimeEvalBundle.default;'), 'generated eval source does not return the startup default export');
    assert(generatedEvalSource.includes('function installPageGlobal'), 'generated eval source does not bundle the page-global helper');
    assert(generatedEvalSource.includes('function leaveCommandFailureMessageCore'), 'generated eval source does not bundle runtime helper modules');
    assert(!/require\(['"]\.\.?\//.test(generatedEvalSource), 'generated eval source still contains unresolved relative require()');
    assert(!/\bfrom\s+['"]\.\.?\//.test(generatedEvalSource), 'generated eval source still contains unresolved relative import');
    new vm.Script(generatedEvalSource, { filename: 'grasp-rat-runtime-eval.generated.js' });
  });

  check('source modules split browser source generation while generated runtime stays single file', () => {
    assert(!sourceBot.includes("require('./src/browser/bot-source')"), 'main bot should not import the old browser source builder directly');
    assert(!fs.existsSync(path.join(ROOT, 'src/browser/bot-source.js')), 'legacy bot-source.js should no longer exist');
    assert(!fs.existsSync(path.join(ROOT, 'src/browser/runtime-assembly-source.js')), 'legacy runtime-assembly-source.js should no longer exist');
    assert(runtimeEntrySourceModule.includes("require('./runtime-source')"), 'runtime entry-source boundary does not own the runtime-source dependency');
    assert(runtimeEntrySourceModule.includes('function remoteRuntimeEntrySource(options = {})'), 'remote runtime entry-source factory not found');
    assert(runtimeEntrySourceModule.includes('return remoteBrowserRuntimeSource(options);'), 'remote runtime entry-source does not delegate to runtime source');
    assert(runtimeEntrySourceModule.includes('function runtimeEvalEntrySource(options = {})'), 'runtime eval entry-source factory not found');
    assert(runtimeEntrySourceModule.includes('browserRuntimeSource({'), 'runtime eval entry-source does not build local runtime source');
    assert(runtimeEntrySourceModule.includes('bundledRuntime: true'), 'runtime eval entry-source does not force bundled-runtime fragments');
    assert(runtimeSourceModule.includes("const { browserRuntimeFragments } = require('./runtime-fragments-source')"), 'runtime source boundary does not own the runtime fragment registry dependency');
    assert(runtimeSourceModule.includes('return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));'), 'runtime source boundary does not render the runtime fragment registry');
    assert(runtimeSourceModule.includes('function browserRuntimeConfig(options = {})'), 'browser runtime config adapter not found');
    assert(runtimeSourceModule.includes('bundledRuntime: true'), 'browser runtime config does not default to bundled-runtime mode');
    assert(!runtimeSourceModule.includes('if (options.bundledRuntime) config.bundledRuntime = true;'), 'browser runtime config still treats bundled-runtime as optional');
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
    assert(runtimeUtilsSourceModule.includes("require('./src/browser/runtime/runtime-utils')"), 'runtime-utils source module does not expose a bundler-owned runtime helper require');
    assert(!runtimeUtilsSourceModule.includes("require('./runtime/runtime-utils')"), 'runtime-utils source module still imports helper for inline injection');
    assert(runtimeUtilsRuntimeModule.includes("require('../../shared/runtime-utils')"), 'browser runtime-utils helper module does not reuse shared runtime utilities');
    assert(runtimeUtilsRuntimeModule.includes('safeStringify') && runtimeUtilsRuntimeModule.includes('safeJsonClone') && runtimeUtilsRuntimeModule.includes('sanitizeCombatLogIdPart'), 'browser runtime-utils helper module exports are incomplete');
    assert(statusPanelRuntimeSourceModule.includes("require('./src/browser/runtime/display-format')"), 'status-panel runtime source does not expose a bundler-owned display-format require');
    assert(displayFormatRuntimeModule.includes("require('../../shared/display-format')"), 'browser display-format helper module does not reuse shared display helpers');
    assert(displayFormatRuntimeModule.includes('escapeHtml') && displayFormatRuntimeModule.includes('formatDistance') && displayFormatRuntimeModule.includes('formatDurationMs') && displayFormatRuntimeModule.includes('actorLabel') && displayFormatRuntimeModule.includes('hpDisplay'), 'browser display-format helper module exports are incomplete');
    assert(statusPanelRuntimeSourceModule.includes("require('./status-panel-source')"), 'status-panel runtime source module import not found');
    assert(exitSummaryRuntimeModule.includes("require('../../shared/exit-summary')"), 'browser exit-summary helper module does not reuse shared exit-summary helpers');
    assert(exitSummaryRuntimeModule.includes('staminaExhaustedLongWindows') && exitSummaryRuntimeModule.includes('staminaExhaustedWindowLabel') && exitSummaryRuntimeModule.includes('staminaEvidenceRemaining') && exitSummaryRuntimeModule.includes('staminaHoldContradictedByStaminaEvidence') && exitSummaryRuntimeModule.includes('offlineLeaveSummaryText') && exitSummaryRuntimeModule.includes('combatLogExitSummaryFromDecision'), 'browser exit-summary helper module exports are incomplete');
    assert(combatLogRuntimeSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'combat-log runtime source does not expose a bundler-owned exit-summary require');
    assert(combatLogRuntimeSourceModule.includes("require('./combat-log-source')"), 'combat-log runtime source module import not found');
    assert(controlLoginRuntimeSourceModule.includes("require('./control-login-source')"), 'control-login runtime source module import not found');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'runtime bootstrap source does not expose a bundler-owned exit-summary require');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/browser-preserved-state')"), 'runtime bootstrap source does not expose a bundler-owned preserved-state require');
    assert(browserPreservedStateRuntimeModule.includes("require('../../shared/browser-preserved-state')"), 'browser preserved-state helper module does not reuse shared preserved-state helper');
    assert(browserPreservedStateRuntimeModule.includes('buildBrowserPreservedState'), 'browser preserved-state helper module export is incomplete');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/runtime-defaults')"), 'runtime bootstrap source does not expose a bundler-owned runtime-defaults require');
    assert(runtimeDefaultsRuntimeModule.includes("require('../../shared/runtime-defaults')"), 'browser runtime-defaults helper module does not reuse shared runtime defaults helper');
    assert(runtimeDefaultsRuntimeModule.includes('buildRuntimeDefaults'), 'browser runtime-defaults helper module export is incomplete');
    assert(runtimeBootstrapSourceModule.includes("require('./page-global-core')"), 'page-global core module import not found');
    assert(runtimeBootstrapSourceModule.includes("require('./src/browser/runtime/target-whitelist')"), 'runtime bootstrap source does not expose a bundler-owned target-whitelist require');
    assert(targetWhitelistRuntimeModule.includes("require('../../shared/target-whitelist')"), 'browser target-whitelist helper module does not reuse shared target-whitelist helpers');
    assert(targetWhitelistRuntimeModule.includes('normalizeTargetWhitelistName') && targetWhitelistRuntimeModule.includes('parseTargetWhitelistNames') && targetWhitelistRuntimeModule.includes('deriveTargetWhitelistUrl'), 'browser target-whitelist helper module exports are incomplete');
    assert(runtimeFragmentRegistryModule.includes("require('./target-overlay-source')"), 'target-overlay source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./target-whitelist-source')"), 'target-whitelist source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./status-panel-runtime-source')"), 'status-panel runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./runtime-utils-source')"), 'runtime-utils source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-log-runtime-source')"), 'combat-log runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./important-log-source')"), 'important-log source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-history-source')"), 'combat-history source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-aim-source')"), 'combat-aim source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-state-source')"), 'combat-state source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-fire-source')"), 'combat-fire source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-leave-cover-source')"), 'combat-leave-cover source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./combat-action-source')"), 'combat-action source module import not found');
    assert(runtimeFragmentRegistryModule.includes("['persistent-last-self', () => persistentLastSelfSource(config)]"), 'persistent-last-self source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['persistent-exit', () => persistentExitSource(config)]"), 'persistent-exit source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['persistent-clear', () => persistentClearSource(config)]"), 'persistent-clear source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['pending-exit-persistence', () => pendingExitPersistenceSource(config)]"), 'pending-exit-persistence source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['refresh-exit-detail', () => refreshExitDetailSource(config)]"), 'refresh-exit-detail source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['restored-coin-failures', () => restoredCoinFailuresSource(config)]"), 'restored-coin-failures source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['login-snapshot-gate', () => loginSnapshotGateSource(config)]"), 'login-snapshot-gate source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['combat-action', () => combatActionSource(config)]"), 'combat-action source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['attack-worth', () => attackWorthSource(config)]"), 'attack-worth source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['exit-motion', () => exitMotionSource(config)]"), 'exit-motion source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("require('./opportunity-stamina-source')"), 'opportunity-stamina source module import not found');
    assert(runtimeFragmentRegistryModule.includes("['opportunity-stamina', () => opportunityStaminaSource(config)]"), 'opportunity-stamina source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("require('./opportunity-snapshot-source')"), 'opportunity-snapshot source module import not found');
    assert(runtimeFragmentRegistryModule.includes("['opportunity-candidate', () => opportunityCandidateSource(config)]"), 'opportunity-candidate source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['opportunity-choice', () => opportunityChoiceSource(config)]"), 'opportunity-choice source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['opportunity-pick', () => opportunityPickSource(config)]"), 'opportunity-pick source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['patrol', () => patrolSource(config)]"), 'patrol source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['opportunity-clear', () => opportunityClearSource(config)]"), 'opportunity-clear source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['post-attack', () => postAttackSource(config)]"), 'post-attack source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("require('./coin-target-runtime-source')"), 'coin-target runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./choose-action-source')"), 'choose-action source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./tick-source')"), 'tick source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./startup-source')"), 'startup source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./bot-object-source')"), 'bot-object source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./control-login-runtime-source')"), 'control-login runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./native-state-source')"), 'native-state source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./native-control-source')"), 'native-control source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./coin-motion-runtime-source')"), 'coin-motion runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./return-block-source')"), 'return-block source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./entity-activity-source')"), 'entity-activity source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./stamina-runtime-source')"), 'stamina-runtime source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./exit-motion-source')"), 'exit-motion source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./persistent-last-self-source')"), 'persistent-last-self source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./persistent-exit-source')"), 'persistent-exit source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./exit-relogin-source')"), 'exit-relogin source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./pending-exit-source')"), 'pending-exit source module import not found');
    assert(runtimeFragmentRegistryModule.includes("['pending-exit', () => pendingExitSource(config)]"), 'pending-exit source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("['leave-command', () => leaveCommandSource(config)]"), 'leave-command source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("require('./restored-runtime-state-source')"), 'restored runtime state source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./page-native-snapshot-source')"), 'page-native snapshot source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./action-arbitration-source')"), 'action-arbitration source module import not found');
    assert(runtimeFragmentRegistryModule.includes("['action-arbitration', () => actionArbitrationSource(config)]"), 'action-arbitration source is not invoked with runtime config');
    assert(runtimeFragmentRegistryModule.includes("require('./network-quality-source')"), 'network-quality source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./network-quality-summary-source')"), 'network-quality summary source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./runtime-summary-source')"), 'runtime-summary source module import not found');
    assert(runtimeFragmentRegistryModule.includes("require('./runtime-bootstrap-source')"), 'runtime-bootstrap source module import not found');
    assert(runtimeFragmentsSourceModule.includes("require('./runtime-fragment-registry')"), 'runtime fragments materializer does not import the provider registry');
    assert(!runtimeFragmentsSourceModule.includes("require('./runtime-bootstrap-source')"), 'runtime fragments materializer still owns provider imports');
    assert(runtimeFragmentsSourceModule.includes('function materializeRuntimeFragments(entries)'), 'runtime fragment materializer not found');
    assert(runtimeFragmentRegistryModule.includes('function browserRuntimeFragmentEntries(config)'), 'runtime fragment entries factory not found');
    assert(runtimeFragmentsSourceModule.includes('function browserRuntimeFragments(config)'), 'runtime fragments source factory not found');
    assert(runtimeFragmentsSourceModule.includes('module.exports = {\n  runtimeFragment,\n  materializeRuntimeFragments,\n  browserRuntimeFragmentEntries,\n  browserRuntimeFragments'), 'runtime fragments source export not found');
    assert(runtimeFragmentRegistryModule.includes('module.exports = {\n  browserRuntimeFragmentEntries\n};'), 'runtime fragment registry export not found');
    const runtimeSourceBody = functionBody(runtimeSourceModule, 'browserRuntimeSource');
    const fragmentRegistryBody = functionBody(runtimeFragmentsSourceModule, 'browserRuntimeFragments');
    const fragmentEntriesBody = functionBody(runtimeFragmentRegistryModule, 'browserRuntimeFragmentEntries');
    const fragmentMaterializerBody = functionBody(runtimeFragmentsSourceModule, 'materializeRuntimeFragments');
    assert(runtimeSourceBody.includes('return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));'), 'runtime source does not render the fragment registry');
    assert(fragmentEntriesBody.includes('return ['), 'runtime fragment registry does not use an explicit fragment entries registry');
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
    assert(fragmentEntriesBody.includes("['combat-history', () => combatHistorySource(config)]"), 'combat-history fragment is not config-aware for bundled runtime migration');
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
    [
      ['runtime-bootstrap', runtimeBootstrapSourceModule],
      ['runtime-utils', runtimeUtilsSourceModule],
      ['status-panel-runtime', statusPanelRuntimeSourceModule],
      ['combat-log-runtime', combatLogRuntimeSourceModule],
      ['control-login-runtime', controlLoginRuntimeSourceModule],
      ['array-count', arrayCountSourceModule],
      ['combat-history', combatHistorySourceModule],
      ['entity-refresh', entityRefreshSourceModule],
      ['coin-safety', coinSafetySourceModule],
      ['combat-state', combatStateSourceModule],
      ['combat-action', combatActionSourceModule],
      ['opportunity-stamina', opportunityStaminaSourceModule],
      ['opportunity-snapshot', opportunitySnapshotSourceModule],
      ['post-attack', postAttackSourceModule],
      ['opportunity-actions', opportunityActionsSourceModule],
      ['opportunity-candidate', opportunityCandidateSourceModule],
      ['opportunity-choice', opportunityChoiceSourceModule],
      ['opportunity-route', opportunityRouteSourceModule],
      ['coin-target-runtime', coinTargetRuntimeSourceModule],
      ['choose-action', chooseActionSourceModule],
      ['tick', tickSourceModule],
      ['bot-object', botObjectSourceModule],
      ['control-login', controlLoginSourceModule],
      ['coin-motion-runtime', coinMotionRuntimeSourceModule],
      ['tick-safety', tickSafetySourceModule],
      ['pending-exit-persistence', pendingExitPersistenceSourceModule],
      ['exit-relogin', exitReloginSourceModule],
      ['pending-exit', pendingExitSourceModule],
      ['leave-command', leaveCommandSourceModule],
      ['leave-flow', leaveFlowSourceModule],
      ['page-native-snapshot', pageNativeSnapshotSourceModule],
      ['action-arbitration', actionArbitrationSourceModule],
      ['coin-progress-runtime', coinProgressRuntimeSourceModule]
    ].forEach(([label, text]) => assertBundledOnlySourceModule(text, label));
    assert(restoredRuntimeStateSourceModule.includes('function restoredRuntimeStateSource()'), 'restored runtime state source factory not found');
    assert(!restoredRuntimeStateSourceModule.includes('restoredRuntimeStateInlineSource'), 'restored runtime state inline source factory should be removed');
    assert(!restoredRuntimeStateSourceModule.includes('bundledRestoredRuntimeStateSource'), 'restored runtime state bundled selector wrapper should be removed');
    assert(restoredRuntimeStateSourceModule.includes('module.exports = {\n  restoredRuntimeStateSource\n}'), 'restored runtime state source module export not found');
    const restoredRuntimeStateSourceBody = functionBody(restoredRuntimeStateSourceModule, 'restoredRuntimeStateSource');
    assert(restoredRuntimeStateSourceBody.includes("require('./src/browser/runtime/restored-runtime-state')"), 'restored runtime state source does not hand restore helper to the bundler');
    assert(restoredRuntimeStateSourceBody.includes("require('./src/browser/runtime/restored-coin-failures')"), 'restored runtime state source does not hand coin-failure restore helper to the bundler');
    assert(restoredRuntimeStateSourceBody.includes('restoreRuntimeStateCore(preserved, previousBot'), 'restored runtime state source does not bind preserved/previousBot state');
    assert(restoredRuntimeStateSourceBody.includes('restoredCoinFailures') && restoredRuntimeStateSourceBody.includes('readPersistentExitState'), 'restored runtime state source does not bind runtime restore dependencies');
    assert(restoredRuntimeStateSourceBody.includes('restoredCoinFailuresForRestoredRuntimeStateCore(preserved.coinFailures, cfg, performance.now())'), 'restored runtime state source does not bind coin-failure restore core directly');
    assert(restoredRuntimeStateSourceBody.includes('readPersistedPendingExitStateForRestoredRuntimeStateCore(localStorage, PENDING_EXIT_STATE_KEY') && restoredRuntimeStateSourceBody.includes('chooseInitialPendingExitStateForRestoredRuntimeStateCore(memoryState, storedState, t, options'), 'restored runtime state source does not bind pending-exit restore cores directly');
    assert(restoredRuntimeStateSourceBody.includes('enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY'), 'restored runtime state source does not bind enemy leave key');
    assert(restoredRuntimeStateSourceBody.includes('offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY'), 'restored runtime state source does not bind offline leave key');
    assert(statusPanelRuntimeSourceModule.includes('function statusPanelRuntimeSource()'), 'status-panel runtime source factory not found');
    assert(!statusPanelRuntimeSourceModule.includes('bundledStatusPanelRuntimeSource'), 'status-panel runtime bundled selector wrapper should be removed');
    assert(!statusPanelRuntimeSourceModule.includes("require('./runtime/display-format')"), 'status-panel runtime should not import display helpers for inline injection');
    assert(statusPanelRuntimeSourceModule.includes('module.exports = {\n  statusPanelRuntimeSource\n}'), 'status-panel runtime source export not found');
    assert(statusPanelRuntimeSourceModule.includes("require('./src/browser/runtime/display-format')"), 'status-panel runtime source does not expose a bundler-owned display-format require');
    assert(!statusPanelRuntimeSourceModule.includes('return statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay });'), 'status-panel runtime still keeps inline display helper binding');
    assert(combatLogRuntimeSourceModule.includes('function combatLogRuntimeSource()'), 'combat-log runtime source factory not found');
    assert(!combatLogRuntimeSourceModule.includes('bundledCombatLogRuntimeSource'), 'combat-log runtime bundled selector wrapper should be removed');
    assert(!combatLogRuntimeSourceModule.includes("require('./runtime/exit-summary')"), 'combat-log runtime should not import exit summary for inline injection');
    assert(combatLogRuntimeSourceModule.includes('module.exports = {\n  combatLogRuntimeSource\n}'), 'combat-log runtime source export not found');
    assert(combatLogRuntimeSourceModule.includes("require('./src/browser/runtime/exit-summary')"), 'combat-log runtime source does not expose a bundler-owned exit-summary require');
    assert(!combatLogRuntimeSourceModule.includes('return combatLogSource({ combatLogExitSummaryFromDecision });'), 'combat-log runtime still keeps inline exit-summary binding');
    assert(combatLogRuntimeSourceModule.includes('combatLogSource()'), 'combat-log runtime source does not use bundled-only source factory');
    assert(controlLoginRuntimeSourceModule.includes('function controlLoginRuntimeSource()'), 'control-login runtime source factory not found');
    assert(!controlLoginRuntimeSourceModule.includes('bundledControlLoginRuntimeSource'), 'control-login runtime bundled selector wrapper should be removed');
    assert(!controlLoginRuntimeSourceModule.includes("require('./runtime/exit-summary')"), 'control-login runtime should not import stamina helper for inline injection');
    assert(controlLoginRuntimeSourceModule.includes('module.exports = {\n  controlLoginRuntimeSource\n}'), 'control-login runtime source export not found');
    assert(!controlLoginRuntimeSourceModule.includes('return controlLoginSource({ staminaExhaustedWindowLabel });'), 'control-login runtime still keeps inline stamina helper binding');
    assert(controlLoginRuntimeSourceModule.includes('controlLoginSource()'), 'control-login runtime source does not use bundled-only source factory');
    assert(runtimeBootstrapSourceModule.includes('function runtimeBootstrapHelperSource()'), 'runtime-bootstrap helper source factory not found');
    assert(!runtimeBootstrapSourceModule.includes('function bundledRuntimeBootstrapHelperSource()'), 'runtime-bootstrap source still exposes bundled selector helper');
    assert(!runtimeBootstrapSourceModule.includes('function inlineRuntimeBootstrapHelperSource()'), 'runtime-bootstrap source still exposes inline helper');
    assert(runtimeBootstrapSourceModule.includes('function runtimeBootstrapSource(config)'), 'runtime-bootstrap source factory not found');
    assert(runtimeBootstrapSourceModule.includes('module.exports = {\n  runtimeBootstrapHelperSource,\n  runtimeBootstrapSource\n}'), 'runtime-bootstrap source module export not found');
    assert(runtimeBootstrapSourceModule.includes('${browserPageGlobalSource()}'), 'page-global adapter source is not injected into browser runtime');
    assert(!runtimeBootstrapSourceModule.includes('config?.bundledRuntime'), 'runtime-bootstrap source still switches on bundled runtime mode');
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
    assert(runtimeUtilsSourceModule.includes('function runtimeUtilityPreludeSource()'), 'runtime utility prelude source factory not found');
    assert(runtimeUtilsSourceModule.includes('function runtimeUtilityCloneSource()'), 'runtime utility clone source factory not found');
    assert(runtimeUtilsSourceModule.includes('module.exports = {\n  runtimeUtilityPreludeSource,\n  runtimeUtilityCloneSource\n}'), 'runtime utility source module exports not found');
    assert(runtimeUtilsSourceModule.includes("require('./src/browser/runtime/runtime-utils')"), 'runtime utility source factory does not expose a bundler-owned runtime helper require');
    assert(!runtimeUtilsSourceModule.includes('safeStringify.toString()'), 'runtime utility source still inlines shared helper text');
    assert(!runtimeBootstrapSourceModule.includes('buildBrowserPreservedState.toString()'), 'runtime-bootstrap source still inlines preserved-state helper text');
    assert(!runtimeBootstrapSourceModule.includes('buildRuntimeDefaults.toString()'), 'runtime-bootstrap source still inlines runtime-default helper text');
    assert(!runtimeBootstrapSourceModule.includes('normalizeTargetWhitelistName.toString()'), 'runtime-bootstrap source still inlines target whitelist helper text');
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
    assert(generatedRuntimeSource.includes('summarizePendingExitCore'), 'generated runtime does not include pending-exit summary core');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/pending-exit')"), 'generated runtime does not bind pending-exit runtime helper module');
    assert(generatedRuntimeSource.includes('pendingExitRetryMsCore(pending, pendingExitRetryCoreOptions())'), 'generated runtime does not route pending-exit retry durations through core');
    assert(generatedRuntimeSource.includes('pendingExitDisplayReasonCore(summary)'), 'generated runtime does not route pending-exit display reasons through core');
    assert(generatedRuntimeSource.includes('leaveDetailHasHttp403Core(lastDetail)'), 'generated runtime does not route pending-exit 403 detection through core');
    assert(generatedRuntimeSource.includes('leaveSuccessReloadConfirmationForDetailCore(detail, pending, t, { normalizeReloadConfirmation: normalizePendingExitReloadConfirmationCore })'), 'generated runtime does not route leave-success reload confirmation through core');
    assert(generatedRuntimeSource.includes('pendingExitWaitReasonCore(pending, confirmed)'), 'generated runtime does not route pending-exit wait reason through core');
    assert(!generatedRuntimeSource.includes('function pendingExitRetryMs('), 'generated runtime still keeps pendingExitRetryMs wrapper');
    assert(!generatedRuntimeSource.includes('function pendingExitDisplayReason('), 'generated runtime still keeps pendingExitDisplayReason wrapper');
    assert(!generatedRuntimeSource.includes('function summarizePendingExit('), 'generated runtime still keeps summarizePendingExit wrapper');
    assert(!generatedRuntimeSource.includes('function leaveRequestHasHttp403('), 'generated runtime still keeps leaveRequestHasHttp403 wrapper');
    assert(!generatedRuntimeSource.includes('function leaveDetailHasHttp403('), 'generated runtime still keeps leaveDetailHasHttp403 wrapper');
    assert(!generatedRuntimeSource.includes('function leaveDetailSucceeded('), 'generated runtime still keeps leaveDetailSucceeded wrapper');
    assert(!generatedRuntimeSource.includes('function leaveSuccessReloadConfirmationForDetail('), 'generated runtime still keeps leaveSuccessReloadConfirmationForDetail wrapper');
    assert(!generatedRuntimeSource.includes('function leaveSuccessReloadConfirmationSatisfied('), 'generated runtime still keeps leaveSuccessReloadConfirmationSatisfied wrapper');
    assert(!generatedRuntimeSource.includes('function pendingExitWaitReason('), 'generated runtime still keeps pendingExitWaitReason wrapper');
    assert(generatedRuntimeSource.includes('async function handlePendingExit'), 'generated runtime does not include pending-exit handler');
    assert(generatedRuntimeSource.includes('function updatePursuitTracking'), 'generated runtime does not include pursuit tracking helper');
    assert(generatedRuntimeSource.includes('function waitWithTimeout'), 'generated runtime does not include wait-with-timeout helper');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/leave-command')"), 'generated runtime does not bind leave-command runtime helper module');
    assert(generatedRuntimeSource.includes('leaveCommandFailureMessageCore(rawResult)'), 'generated runtime does not route leave command failure checks through core');
    assert(generatedRuntimeSource.includes('summarizeLeaveCommandResultCore(rawResult)'), 'generated runtime does not route leave command result summaries through core');
    assert(generatedRuntimeSource.includes('nextClashLeaveRescueStageCore(detail)'), 'generated runtime does not route Clash rescue stage selection through core');
    [
      'leaveCommandFailureMessage',
      'summarizeLeaveCommandResult',
      'leaveDetailFailedForClashRescue',
      'clashLeaveRescueAttempts',
      'nextClashLeaveRescueStage',
      'summarizeClashLeaveRescueResult',
      'clashLeaveRescueRetryDetail',
      'resetClashLeaveRescueRound'
    ].forEach(wrapperName => {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated runtime still keeps ${wrapperName} wrapper`);
    });
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

  check('browser source modules are bundled-only runtime fragments', () => {
    const rawFactories = [
      ['target-overlay', targetOverlaySourceModule, 'targetOverlaySource'],
      ['target-whitelist', targetWhitelistSourceModule, 'targetWhitelistSource'],
      ['status-panel', statusPanelSourceModule, 'statusPanelSource'],
      ['status-panel-runtime', statusPanelRuntimeSourceModule, 'statusPanelRuntimeSource'],
      ['combat-log', combatLogSourceModule, 'combatLogSource'],
      ['combat-log-runtime', combatLogRuntimeSourceModule, 'combatLogRuntimeSource'],
      ['important-log', importantLogSourceModule, 'importantLogSource'],
      ['combat-history', combatHistorySourceModule, 'combatHistorySource'],
      ['entity-refresh', entityRefreshSourceModule, 'entityRefreshSource'],
      ['classify', classifySourceModule, 'classifySource'],
      ['coin-safety', coinSafetySourceModule, 'coinSafetySource'],
      ['target-selection', targetSelectionSourceModule, 'targetSelectionSource'],
      ['combat-movement', combatMovementSourceModule, 'combatMovementSource'],
      ['combat-aim', combatAimSourceModule, 'combatAimSource'],
      ['combat-state', combatStateSourceModule, 'combatStateSource'],
      ['combat-fire', combatFireSourceModule, 'combatFireSource'],
      ['combat-leave-cover', combatLeaveCoverSourceModule, 'combatLeaveCoverSource'],
      ['combat-action', combatActionSourceModule, 'combatActionSource'],
      ['opportunity-stamina', opportunityStaminaSourceModule, 'opportunityStaminaSource'],
      ['opportunity-snapshot', opportunitySnapshotSourceModule, 'opportunitySnapshotSource'],
      ['post-attack', postAttackSourceModule, 'postAttackSource'],
      ['opportunity-actions', opportunityActionsSourceModule, 'opportunityActionsSource'],
      ['opportunity-candidate', opportunityCandidateSourceModule, 'opportunityCandidateSource'],
      ['opportunity-route', opportunityRouteSourceModule, 'opportunityRouteSource'],
      ['opportunity-choice', opportunityChoiceSourceModule, 'opportunityChoiceSource'],
      ['opportunity-pick', opportunityPickSourceModule, 'opportunityPickSource'],
      ['patrol', patrolSourceModule, 'patrolSource'],
      ['opportunity-clear', opportunityClearSourceModule, 'opportunityClearSource'],
      ['coin-progress-runtime', coinProgressRuntimeSourceModule, 'coinProgressRuntimeSource'],
      ['coin-target-runtime', coinTargetRuntimeSourceModule, 'coinTargetRuntimeSource'],
      ['choose-action', chooseActionSourceModule, 'chooseActionSource'],
      ['tick', tickSourceModule, 'tickSource'],
      ['startup', startupSourceModule, 'startupSource'],
      ['bot-object', botObjectSourceModule, 'botObjectSource'],
      ['control-login', controlLoginSourceModule, 'controlLoginSource'],
      ['control-login-runtime', controlLoginRuntimeSourceModule, 'controlLoginRuntimeSource'],
      ['native-state', nativeStateSourceModule, 'nativeStateSource'],
      ['native-control', nativeControlSourceModule, 'nativeControlSource'],
      ['coin-motion-runtime', coinMotionRuntimeSourceModule, 'coinMotionRuntimeSource'],
      ['return-block', returnBlockSourceModule, 'returnBlockSource'],
      ['entity-activity', entityActivitySourceModule, 'entityActivitySource'],
      ['stamina-runtime', staminaRuntimeSourceModule, 'staminaRuntimeSource'],
      ['attack-worth', attackWorthSourceModule, 'attackWorthSource'],
      ['exit-motion', exitMotionSourceModule, 'exitMotionSource'],
      ['persistent-last-self', persistentLastSelfSourceModule, 'persistentLastSelfSource'],
      ['persistent-exit', persistentExitSourceModule, 'persistentExitSource'],
      ['persistent-clear', persistentClearSourceModule, 'persistentClearSource'],
      ['pending-exit-persistence', pendingExitPersistenceSourceModule, 'pendingExitPersistenceSource'],
      ['refresh-exit-detail', refreshExitDetailSourceModule, 'refreshExitDetailSource'],
      ['restored-coin-failures', restoredCoinFailuresSourceModule, 'restoredCoinFailuresSource'],
      ['restored-runtime-state', restoredRuntimeStateSourceModule, 'restoredRuntimeStateSource'],
      ['login-snapshot-gate', loginSnapshotGateSourceModule, 'loginSnapshotGateSource'],
      ['runtime-diagnostics', runtimeDiagnosticsSourceModule, 'runtimeDiagnosticsSource'],
      ['exit-relogin', exitReloginSourceModule, 'exitReloginSource'],
      ['pending-exit', pendingExitSourceModule, 'pendingExitSource'],
      ['leave-command', leaveCommandSourceModule, 'leaveCommandSource'],
      ['auto-login', autoLoginSourceModule, 'autoLoginSource'],
      ['leave-flow', leaveFlowSourceModule, 'leaveFlowSource'],
      ['offline-safety', offlineSafetySourceModule, 'offlineSafetySource'],
      ['page-native-snapshot', pageNativeSnapshotSourceModule, 'pageNativeSnapshotSource'],
      ['action-arbitration', actionArbitrationSourceModule, 'actionArbitrationSource'],
      ['network-quality', networkQualitySourceModule, 'networkQualitySource'],
      ['network-quality-summary', networkQualitySummarySourceModule, 'networkQualitySummarySource'],
      ['runtime-summary', runtimeSummarySourceModule, 'runtimeSummarySource']
    ];
    for (const [label, moduleSource, factoryName] of rawFactories) {
      assert(moduleSource.includes('function ' + factoryName + '('), label + ' source factory not found');
      assert(moduleSource.includes(factoryName), label + ' source module export not found');
      assertBundledOnlySourceModule(moduleSource, label);
    }

    const runtimeRequires = [
      [statusPanelRuntimeSourceModule, "require('./src/browser/runtime/display-format')", 'status-panel display-format'],
      [combatLogRuntimeSourceModule, "require('./src/browser/runtime/exit-summary')", 'combat-log exit-summary'],
      [runtimeUtilsSourceModule, "require('./src/browser/runtime/runtime-utils')", 'runtime utils'],
      [arrayCountSourceModule, "require('./src/browser/runtime/array-count')", 'array count'],
      [combatHistorySourceModule, "require('./src/browser/runtime/drop-matched-kill')", 'drop matched kill'],
      [coinSafetySourceModule, "require('./src/browser/runtime/coin-diagnostics')", 'coin diagnostics'],
      [combatStateSourceModule, "require('./src/browser/runtime/exit-relogin')", 'combat-state exit relogin'],
      [combatActionSourceModule, "require('./src/browser/runtime/exit-relogin')", 'combat-action exit relogin'],
      [opportunityStaminaSourceModule, "require('./src/browser/runtime/stamina-budget')", 'stamina budget'],
      [postAttackSourceModule, "require('./src/browser/runtime/post-attack-drop')", 'post attack drop'],
      [opportunityCandidateSourceModule, "require('./src/browser/runtime/opportunity-candidates')", 'opportunity candidates'],
      [opportunityChoiceSourceModule, "require('./src/browser/runtime/opportunity-choice')", 'opportunity choice'],
      [opportunityRouteSourceModule, "require('./src/browser/runtime/coin-route')", 'coin route'],
      [opportunityPickSourceModule, "require('./src/browser/runtime/opportunity-pick')", 'opportunity pick'],
      [patrolSourceModule, "require('./src/browser/runtime/patrol')", 'patrol'],
      [opportunityClearSourceModule, "require('./src/browser/runtime/opportunity-clear')", 'opportunity clear'],
      [coinProgressRuntimeSourceModule, "require('./src/browser/runtime/coin-progress')", 'coin progress'],
      [coinTargetRuntimeSourceModule, "require('./src/browser/runtime/coin-target')", 'coin target'],
      [coinMotionRuntimeSourceModule, "require('./src/browser/runtime/coin-motion')", 'coin motion'],
      [attackWorthSourceModule, "require('./src/browser/runtime/attack-worth')", 'attack worth'],
      [exitMotionSourceModule, "require('./src/browser/runtime/exit-motion')", 'exit motion'],
      [persistentLastSelfSourceModule, "require('./src/browser/runtime/persistent-last-self')", 'persistent last self'],
      [persistentExitSourceModule, "require('./src/browser/runtime/persistent-exit')", 'persistent exit'],
      [persistentClearSourceModule, "require('./src/browser/runtime/persistent-clear')", 'persistent clear'],
      [pendingExitPersistenceSourceModule, "require('./src/browser/runtime/pending-exit-persistence')", 'pending exit persistence'],
      [pendingExitSourceModule, "require('./src/browser/runtime/pending-exit')", 'pending exit'],
      [leaveCommandSourceModule, "require('./src/browser/runtime/leave-command')", 'leave command'],
      [leaveFlowSourceModule, "require('./src/browser/runtime/exit-relogin')", 'leave-flow exit relogin'],
      [pageNativeSnapshotSourceModule, 'recordRuntimeDiagnosticsCore(bot, ', 'page native diagnostics'],
      [actionArbitrationSourceModule, "require('./src/browser/runtime/action-arbitration')", 'action arbitration'],
      [actionArbitrationSourceModule, "require('./src/browser/runtime/action-switch-diagnostics')", 'action switch diagnostics']
    ];
    for (const [moduleSource, needle, label] of runtimeRequires) {
      assert(moduleSource.includes(needle), label + ' runtime adapter wiring not found');
    }

    assert(functionBody(targetWhitelistSourceModule, 'targetWhitelistSource').includes('function refreshTargetWhitelist'), 'target-whitelist source factory does not include refresh helper');
    assert(functionBody(targetWhitelistSourceModule, 'targetWhitelistSource').includes('function startTargetWhitelistPolling'), 'target-whitelist source factory does not include polling helper');
    assert(functionBody(combatHistorySourceModule, 'recordDropMatchedKillCall').includes('buildDropMatchedKillCore'), 'combat-history drop-matched kill call does not route through core');
    assert(functionBody(coinSafetySourceModule, 'coinSafetySource').includes('function safeCoinCandidates'), 'coin-safety source factory does not include safe coin candidate filter');
    assert(functionBody(coinSafetySourceModule, 'coinSafetySource').includes('function pickRealtimeLocalCoin'), 'coin-safety source factory does not include realtime local coin picker');
    assert(functionBody(opportunityStaminaSourceModule, 'opportunityStaminaSource').includes('function dailyStaminaFinalCoinAction'), 'opportunity-stamina source factory does not include daily final coin action');
    assert(functionBody(opportunityStaminaSourceModule, 'opportunityStaminaSource').includes('function staminaBudgetCoinLeaveAction'), 'opportunity-stamina source factory does not include stamina budget leave action');
    assert(functionBody(postAttackSourceModule, 'postAttackSource').includes('function buildPostAttackDropWaitAction'), 'post-attack source factory does not include wait action builder');
    assert(functionBody(opportunityCandidateSourceModule, 'opportunityCandidateSource').includes('function opportunityCandidateCoreOptions'), 'opportunity-candidate source factory does not include core options wrapper');
    assert(functionBody(opportunityChoiceSourceModule, 'opportunityChoiceSource').includes('function opportunityChoiceCoreOptions'), 'opportunity-choice source factory does not include core options wrapper');
    assert(functionBody(opportunityRouteSourceModule, 'opportunityRouteSource').includes('function coinRouteCoreOptions'), 'opportunity-route source factory does not include core options wrapper');
    assert(functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeSource').includes('function recordIncidentalCoinPickups'), 'coin-target runtime source factory does not include incidental pickup recorder');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeSource').includes('function coinMotionCoreOptions'), 'coin-motion runtime source factory does not include core options wrapper');
    assert(functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeSource').includes('function applyCoinApproachLockUpdate'), 'coin-motion runtime source factory does not include lock update wrapper');
    assert(functionBody(coinProgressRuntimeSourceModule, 'coinProgressRuntimeSource').includes('function coinProgressCoreOptions'), 'coin-progress runtime source factory does not include core options wrapper');
    assert(functionBody(tickSourceModule, 'tickSource').includes("trackCoinProgressCall('action', 'self')"), 'tick source factory does not preserve coin progress tracking');
    assert(functionBody(tickSourceModule, 'tickSource').includes("applyFinalActionArbitrationCall('action', 'source')"), 'tick source factory does not preserve final action arbitration');
    assert(functionBody(tickSourceModule, 'tickSource').includes("recordActionSwitchDiagnosticsCall('action', 'source')"), 'tick source factory does not preserve target switch diagnostics');
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
    assert(bundlerSpikeEntrySource.includes("import dropMatchedKill from '../browser/runtime/drop-matched-kill.js'"), 'bundler spike does not import drop-matched kill through the browser runtime helper module');
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
    assert(bundlerSpikeEntrySource.includes('dropMatchedKill.buildDropMatchedKillCore({'), 'bundler spike does not execute the drop-matched kill helper module');
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
    assert(bundlerSpikeEntrySource.includes("import pendingExit from '../browser/runtime/pending-exit.js'"), 'bundler spike entry does not import pending-exit runtime adapter');
    assert(bundlerSpikeBuildSource.includes('status.pendingExitCoreRetryMs === 4500'), 'bundler spike self-test does not assert pending-exit retry core execution');
    assert(bundlerSpikeBuildSource.includes('status.pendingExitCoreCombatDx === 1'), 'bundler spike self-test does not assert pending-exit summary core execution');
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
    assert(remoteBundleSource.includes('return bundleVirtualEntry(REMOTE_RUNTIME_ENTRY, directSource);'), 'shared remote bundler does not feed generated runtime source through the remote virtual entry');
    assert(remoteBundleSource.includes('const output = await bundleVirtualEntry(RUNTIME_EVAL_ENTRY'), 'runtime eval bundle does not use the eval virtual entry');
    assert(remoteBundleSource.includes('function writeRemoteBotBundle'), 'shared remote bundler does not write bundle outputs');
    assert(remoteBundledBuildSource.includes('writeRemoteBotBundle(options'), 'remote bundled candidate does not write through the shared bundler');
    assert(remoteBundledBuildSource.includes('production: false'), 'remote bundled candidate manifest must stay non-production');
    assert(remoteBundledBuildSource.includes("mode: 'runtime-entry-source-candidate'"), 'remote bundled candidate manifest mode not found');
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
    const text = generatedRuntimeSource;
    const finalRuntimeText = distSource;
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
      if (file === 'grasp-rat-bot.js') {
        assert(postAttackSourceModule.includes("recordDropMatchedKillCall('candidate', 'candidate.amount'") && postAttackSourceModule.includes("'post-attack-drop-visible'"), 'post-attack visible drop coins are not attributed as kill rewards through drop-matched call helper');
        assert(coinTargetRuntimeSourceModule.includes("recordDropMatchedKillCall('sessionTarget', 'sessionValue'") && coinTargetRuntimeSourceModule.includes("recordDropMatchedKillCall('target', 'value'"), 'picked post-attack drop coins are not attributed as kill rewards through drop-matched call helper');
      } else {
        assert(text.includes('buildDropMatchedKillCore(candidate') && text.includes("'post-attack-drop-visible'"), 'post-attack visible drop coins are not attributed as kill rewards through drop-matched core');
        assert(text.includes('buildDropMatchedKillCore(sessionTarget') || text.includes('buildDropMatchedKillCore(target'), 'picked post-attack drop coins are not attributed as kill rewards through drop-matched core');
      }
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
      assert(
        pendingBody.includes('leaveSuccessReloadConfirmationSatisfied(reloadConfirmation)')
          || pendingBody.includes('leaveSuccessReloadConfirmationSatisfiedCore(reloadConfirmation)')
          || pendingBody.includes("leaveSuccessReloadConfirmationSatisfiedCall('reloadConfirmation')"),
        'pending exit handler does not require leave-success reload marker'
      );
      assert(pendingBody.includes("requestLeaveConfirmationReload('leave-success', pending)"), 'pending exit handler does not request confirmation reload for successful leave');
      assert(pendingBody.includes("source: 'leave-success-refresh-confirmed'"), 'pending exit handler does not confirm from refreshed offline state');
      assert(pendingBody.includes("source: 'leave-success-refresh-still-online'"), 'pending exit handler does not retry when refreshed state is still online');
      assert(pendingBody.includes("source: 'leave-success-refresh-unknown-timeout'"), 'pending exit handler does not retry after unknown refreshed state');
      assert(!pendingBody.includes("source: 'leave-success',"), 'pending exit handler still directly confirms plain leave success');
      const maybeBody = functionBody(text, 'maybeConfirmPendingExitFromLeaveDetail');
      assert(maybeBody.includes("requestPendingExitLeaveSuccessReload(detail, 'leave-success')"), 'leave success completion does not route to confirmation reload');
      assert(!/leaveDetailSucceeded\(detail\)[\s\S]{0,180}confirmPendingExit/.test(maybeBody), 'leave success completion still directly confirms pending exit');
      const completeBody = functionBody(text, 'completeLeaveRequest');
      assert(
        completeBody.includes('const http403 =') && completeBody.includes('leaveDetailHasHttp403'),
        'leave completion does not isolate HTTP 403 state'
      );
      assert(
        completeBody.includes('const clashRescuePending = http403 &&')
          && completeBody.includes('leaveDetailFailedForClashRescue')
          && completeBody.includes('nextClashLeaveRescueStage'),
        'leave completion does not suppress 403 session-end logging while Clash rescue is pending'
      );
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
      const retryBody = /function\s+pendingExitRetryMs\s*\(/.test(text) ? functionBody(text, 'pendingExitRetryMs') : '';
      if (retryBody) {
        assert(
          retryBody.includes('pendingExitRetryMsCore(pending, pendingExitRetryCoreOptions())')
            || retryBody.includes('cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000'),
          'pending exit retry wrapper does not delegate to core or preserve the old floor'
        );
      }
      const retryCoreText = file === 'grasp-rat-bot.js' ? strategyPendingExitSource : finalRuntimeText;
      assert(
        /Number\(options\.leaveRetryMinMs\s*\?\?\s*options\.leaveCommandTimeoutMs\s*\?\?\s*(?:10000|1e4)\)/.test(retryCoreText),
        'pending exit retry core does not use 10s leave timeout'
      );
      if (file !== 'grasp-rat-bot.js') {
        assert(finalRuntimeText.includes('pendingExitRetryMsCore(pending, pendingExitRetryCoreOptions())'), 'pending exit retry path does not call core directly');
        assert(!finalRuntimeText.includes('function pendingExitRetryMs('), 'pending exit retry wrapper should not be emitted in production dist');
      }
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
      assert(
        skipBody.includes("pendingExit: ${summarizePendingExitExpr('pending')}")
          || skipBody.includes('const pendingExitSummaryPending = pending;'),
        'pending-exit skip helper does not preserve pending exit summary'
      );
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
      const leave403DetectorSource = `${strategyPendingExitSource}\n${text}\n${finalRuntimeText}`;
      assert(leave403DetectorSource.includes('function leaveRequestHasHttp403Core') && leave403DetectorSource.includes('status === 403'), 'leave 403 status detector not found');
      const rescueCoreBody = functionBody(`${strategyLeaveCommandSource}\n${finalRuntimeText}`, 'leaveDetailFailedForClashRescueCore');
      assert(!/leaveDetailSucceeded\(detail\)\s*\|\|\s*leaveDetailHasHttp403\(detail\)/.test(rescueCoreBody), 'Clash leave rescue still excludes HTTP 403 after success check');
      assert(!/if\s*\(\s*leaveDetailHasHttp403\(detail\)\s*\)\s*return false/.test(rescueCoreBody), 'Clash leave rescue still returns false for HTTP 403');
      assert(rescueCoreBody.includes('hasHttp403') && rescueCoreBody.includes('leaveDetailHasHttp403Core'), 'Clash leave rescue does not detect HTTP 403 as a first-class failure');
      assert(rescueCoreBody.includes('if (!detail.error && !hasHttp403) return false'), 'Clash leave rescue still requires a generic error even for HTTP 403');
      assert(rescueCoreBody.includes('leaveDetailSucceededCore') && rescueCoreBody.includes('if (succeeded) return false'), 'Clash leave rescue does not reject successful leaves');
      const rescueHookBody = functionBody(text, 'clashLeaveRescueHook');
      assert(rescueHookBody.includes('readPageGlobal') && rescueHookBody.includes('__graspRatBotClashLeaveRescue'), 'Clash rescue hook is not read through page-global adapter');
      assert(!rescueHookBody.includes('window.__graspRatBotClashLeaveRescue'), 'Clash rescue hook still reads directly from window');
      assert(
        strategyLeaveCommandSource.includes("Object.freeze(['auto', 'direct', 'manual'])")
          || finalRuntimeText.includes('"auto", "direct", "manual"')
          || finalRuntimeText.includes("'auto', 'direct', 'manual'"),
        'Clash leave rescue order is not auto -> direct -> manual'
      );
      const nextStageCoreBody = functionBody(`${strategyLeaveCommandSource}\n${finalRuntimeText}`, 'nextClashLeaveRescueStageCore');
      assert(nextStageCoreBody.includes("'auto', 'direct', 'manual'") || nextStageCoreBody.includes('"auto", "direct", "manual"'), 'Clash leave rescue stage selection does not use the ordered stage list');
      const defaultProxyBody = functionBody(text, 'prepareDefaultClashLeaveProxy');
      assert(defaultProxyBody.includes("const stage = 'auto'"), 'default leave proxy preparation does not start with auto');
      assert(defaultProxyBody.includes('appendClashLeaveRescueAttempt(detail, attempt)'), 'default leave proxy preparation does not persist the auto stage attempt');
      const retryDetailCoreBody = functionBody(`${strategyLeaveCommandSource}\n${finalRuntimeText}`, 'clashLeaveRescueRetryDetailCore');
      assert(retryDetailCoreBody.includes('retryDetail.leaveRequests = []'), 'Clash rescue retry does not clear stale 403 leave history before retrying');
      const pendingRetryBody = functionBody(text, 'retryPendingExit');
      assert(pendingRetryBody.includes('resetClashLeaveRescueRound') || pendingRetryBody.includes('resetClashLeaveRescueRoundForPendingExitCore'), 'pending exit retry does not restart the Clash rescue order from auto');
      const rescueRunBody = functionBody(text, 'runClashLeaveRescueRetry');
      assert(rescueRunBody.includes('await issueLeaveCommand(retryDetail)'), 'Clash rescue does not retry leave after switching proxy');
      assert(rescueRunBody.includes('updatePendingExitLastResult(detail)'), 'Clash rescue stage attempts are not persisted before fallback/next stage');
      assert(
        rescueRunBody.includes('nextClashLeaveRescueStage(retryDetail)')
          || rescueRunBody.includes('nextClashLeaveRescueStageCore(retryDetail)')
          || rescueRunBody.includes("nextClashLeaveRescueStageCall('retryDetail')"),
        'Clash rescue does not continue to the next proxy stage after synchronous retry failure'
      );
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('await prepareDefaultClashLeaveProxy(detail)'), 'leave command does not switch to the default auto proxy before the first request in a round');
      const completeBody = functionBody(text, 'completeLeaveRequest');
      assert(completeBody.includes('const rescueScheduled = scheduleClashLeaveRescueRetry(detail)'), 'completed failed leave does not schedule Clash rescue');
      assert(completeBody.includes('if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail)'), 'completed failed leave can confirm before Clash rescue scheduling');
      assert(completeBody.includes('const clashRescuePending = http403 &&') && completeBody.includes('leaveDetailFailedForClashRescue') && completeBody.includes('nextClashLeaveRescueStage'), 'HTTP 403 leave completion is not gated by Clash rescue availability');
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
    assert(strategyStaminaBudgetSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'daily stamina final-run budget core not found');
    assert(strategyStaminaBudgetSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'daily stamina final-run coin picker core not found');
    assert(opportunityStaminaSourceModule.includes("'daily-stamina-final-visible-coin'"), 'daily stamina final-run action reason not found');
    assert(chooseActionSourceModule.includes('isSnapshotOnlyCoin') && chooseActionSourceModule.includes('pickNearestDailyStaminaFinalCoinCore'), 'daily stamina final-run does not exclude snapshot-only coins through the core picker');
    const chooseActionSourceBody = functionBody(chooseActionSourceModule, 'chooseActionSource');
    const dailyFinalIndex = chooseActionSourceBody.indexOf('const dailyStaminaFinalCoin = ${pickNearestDailyStaminaFinalCoinCall}');
    assert(dailyFinalIndex > 0 && dailyFinalIndex < chooseActionSourceBody.indexOf('const localRealtimeCoin = pickRealtimeLocalCoin'), 'daily stamina final-run does not run before ordinary ROI opportunity selection');
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
    assert(coinSafetySourceModule.includes("require('./src/browser/runtime/coin-diagnostics')"), 'coin-safety source does not import coin diagnostics through the browser runtime helper module');
    assert(!coinSafetySourceModule.includes("require('../strategy/coin-diagnostics')"), 'coin-safety source still imports coin diagnostics directly from strategy');
    assert(coinDiagnosticsRuntimeModule.includes("require('../../strategy/coin-diagnostics')"), 'browser coin diagnostics helper module does not reuse the strategy coin diagnostics helpers');
    assert(coinDiagnosticsRuntimeModule.includes('coinDiagnosticsSummary') && coinDiagnosticsRuntimeModule.includes('addCoinFilterDiagnostic') && coinDiagnosticsRuntimeModule.includes('buildCoinDiagnostics'), 'browser coin diagnostics helper module exports are incomplete');
    assert(strategyCoinDiagnosticsSource.includes("reason: 'snapshot-only'"), 'strategy snapshot-only coin diagnostics not exposed');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/coin-diagnostics')"), 'generated remote runtime does not hand coin diagnostics helpers to the bundler');
    assert(distSource.includes('function buildCoinDiagnostics'), 'bundled dist does not contain coin diagnostics builder');
    assert(distSource.includes('function addCoinFilterDiagnostic'), 'bundled dist does not contain coin filter diagnostic recorder');
    assert(distSource.includes("reason: 'snapshot-only'") || distSource.includes('reason: "snapshot-only"'), 'bundled dist snapshot-only coin diagnostics not exposed');
    assert(coinSafetySourceModule.includes('buildCoinDiagnostics') && coinSafetySourceModule.includes('addCoinFilterDiagnostic'), 'coin diagnostics builder is not wired through the bundled runtime adapter');
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
    const coinMotionRuntimeBody = functionBody(coinMotionRuntimeSourceModule, 'coinMotionRuntimeSource');
    const coinDirectionToCallBody = functionBody(coinMotionRuntimeSourceModule, 'coinDirectionToCall');
    assert(coinMotionRuntimeSourceModule.includes("require('./src/browser/runtime/coin-motion')"), 'coin-motion runtime source does not import coin motion through the browser runtime helper module');
    assert(!coinMotionRuntimeSourceModule.includes("require('../strategy/coin-motion')"), 'coin-motion runtime source still imports coin motion directly from strategy');
    assert(coinMotionRuntimeModule.includes("require('../../strategy/coin-motion')"), 'browser coin motion helper module does not reuse the strategy coin motion helpers');
    assert(coinMotionRuntimeModule.includes('coinDirectionToCore') && coinMotionRuntimeModule.includes('coinPickupPrecisionPulseMsCore') && coinMotionRuntimeModule.includes('coinMotionMetaCore'), 'browser coin motion helper module exports are incomplete');
    assert(coinMotionRuntimeSourceModule.includes('coinDirectionToCore') && coinMotionRuntimeSourceModule.includes('coinMotionMetaCore'), 'coin-motion runtime source does not wire coin motion helpers');
    assert(coinMotionRuntimeBody.includes('function coinMotionCoreOptions'), 'coin-motion runtime wrapper options not found');
    assert(coinMotionRuntimeBody.includes('function applyCoinApproachLockUpdate'), 'coin-motion runtime coin approach lock wrapper not found');
    assert(coinDirectionToCallBody.includes('coinDirectionToCore(coinDirectionSelf, coinDirectionTarget, coinMotionCoreOptions'), 'coin-motion direct-call helper does not call strategy core');
    assert(coinDirectionToCallBody.includes('applyCoinApproachLockUpdate(coinDirectionResult.lockUpdate)'), 'coin-motion direct-call helper does not apply lock updates');
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
    const coinTargetRuntimeBody = functionBody(coinTargetRuntimeSourceModule, 'coinTargetRuntimeSource');
    assert(coinTargetRuntimeSourceModule.includes("require('./src/browser/runtime/coin-target')"), 'coin-target runtime source does not import coin target through the browser runtime helper module');
    assert(!coinTargetRuntimeSourceModule.includes("require('../strategy/coin-target')"), 'coin-target runtime source still imports coin target directly from strategy');
    assert(coinTargetRuntimeModule.includes("require('../../strategy/coin-target')"), 'browser coin target helper module does not reuse the strategy coin target helpers');
    assert(coinTargetRuntimeModule.includes('coinTargetKeyCore') && coinTargetRuntimeModule.includes('coinMatchesTrackedTargetCore') && coinTargetRuntimeModule.includes('buildNativeCoinSnapshotCore') && coinTargetRuntimeModule.includes('snapshotCoinNavigationReasonCore'), 'browser coin target helper module exports are incomplete');
    assert(coinTargetRuntimeSourceModule.includes('coinTargetKeyCore') && coinTargetRuntimeSourceModule.includes('snapshotCoinNavigationReasonCore'), 'coin-target runtime source does not wire coin target helpers');
    assert(coinTargetRuntimeBody.includes('function coinTargetCoreOptions'), 'coin-target runtime wrapper options not found');
    assert(!coinTargetRuntimeBody.includes('function trackedCoinTargetForCollection('), 'coin-target runtime source still keeps tracked target wrapper');
    assert(coinTargetRuntimeBody.includes('const target = trackedCoinTargetForCollectionCore({'), 'coin-target runtime collection marker does not call tracked target core directly');
    assert(!coinTargetRuntimeBody.includes('function coinTargetKey('), 'coin-target runtime source still keeps coin target key wrapper');
    assert(!coinTargetRuntimeBody.includes('function coinMatchesTrackedTarget('), 'coin-target runtime source still keeps coin target matcher wrapper');
    assert(coinTargetRuntimeSourceModule.includes('const sessionKey = coinTargetKeyCore(sessionTarget);'), 'coin-target runtime recorder does not call coin target key core directly');
    assert(coinTargetRuntimeSourceModule.includes('coinMatchesTrackedTargetCore(coin, visibleTarget, coinTargetCoreOptions())'), 'coin-target runtime visibility check does not call matcher core directly');
    assert(functionBody(combatHistorySourceModule, 'recordDropMatchedKillCall').includes('coinTargetKey: coinTargetKeyCore'), 'combat-history drop-matched kill call does not bind coin target key core');
    assert(strategyDropMatchedKillSource.includes('function buildDropMatchedKillCore') && strategyDropMatchedKillSource.includes('coinTargetKey(target)'), 'drop-matched kill strategy core does not use coin target key callback');
    assert(dropMatchedKillRuntimeModule.includes("require('../../strategy/drop-matched-kill')") && dropMatchedKillRuntimeModule.includes('buildDropMatchedKillCore'), 'browser drop-matched kill runtime adapter is incomplete');
    assert(functionBody(opportunityChoiceSourceModule, 'opportunityChoiceSource').includes('coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions())'), 'opportunity-choice source does not call coin target matcher core directly');
    assert(!distSource.includes('function coinTargetKey('), 'dist remote bot still keeps coin target key wrapper');
    assert(!distSource.includes('function coinMatchesTrackedTarget('), 'dist remote bot still keeps coin target matcher wrapper');
    assert(!distSource.includes('function trackedCoinTargetForCollection('), 'dist remote bot still keeps tracked coin target wrapper');
    for (const wrapperName of ['trackedCoinStillVisible', 'nativeCoinSnapshot', 'rememberNativeCoinSnapshot', 'recordSessionCoinPickup', 'pruneCollectedSnapshotCoin']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still keeps ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still keeps ${wrapperName} wrapper`);
    }
    assert(coinTargetRuntimeSourceModule.includes('return buildNativeCoinSnapshotCore(nativeSnapshotCoins'), 'coin-target runtime native coin snapshot wrapper does not call strategy core');
    assert(coinTargetRuntimeBody.includes('pickIncidentalCoinPickupsCore('), 'coin-target runtime incidental pickup wrapper does not call strategy core');
    assert(opportunitySnapshotSourceModule.includes('snapshotCoinWorthLongTravelCore('), 'source bot snapshot coin worth wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('snapshotCoinNavigationReasonCore(localRealtimeCoin, coinTargetCoreOptions())'), 'source bot snapshot coin reason wrapper does not call strategy core');
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
    assert(coinProgressRuntimeSourceModule.includes('function coinProgressRuntimeSource()'), 'coin-progress runtime source factory not found');
    assert(coinProgressRuntimeSourceModule.includes('module.exports = {\n  coinProgressRuntimeSource,\n  trackCoinProgressCall\n}'), 'coin-progress runtime source module export not found');
    assert(coinProgressRuntimeSourceModule.includes("require('./src/browser/runtime/coin-progress')"), 'coin-progress runtime source does not expose a bundler-owned coin-progress require');
    assert(!coinProgressRuntimeSourceModule.includes('coinProgressRuntimeInlineSource'), 'coin-progress runtime source still exposes inline runtime generation');
    assert(!coinProgressRuntimeSourceModule.includes('bundledCoinProgressRuntimeSource'), 'coin-progress runtime source still exposes bundled selector generation');
    assert(!coinProgressRuntimeSourceModule.includes("require('../strategy/coin-progress')"), 'coin-progress runtime source still imports coin progress directly from strategy');
    assert(coinProgressRuntimeModule.includes("require('../../strategy/coin-progress')"), 'coin-progress runtime adapter does not reuse strategy module core');
    assert(coinProgressRuntimeModule.includes('coinFailureIgnoreCore') && coinProgressRuntimeModule.includes('coinIgnoreCleanupIntentCore'), 'coin-progress runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/coin-progress.js'"), 'bundler spike does not import coin progress runtime adapter');
    assert(bundlerSpikeEntrySource.includes('coinProgress.coinFailureIgnoreCore('), 'bundler spike does not execute coin progress failure helper');
    assert(bundlerSpikeBuildSource.includes('status.coinProgressIgnoreMs === 800'), 'bundler spike self-test does not assert coin progress failure execution');
    const coinProgressRuntimeBody = functionBody(coinProgressRuntimeSourceModule, 'coinProgressRuntimeSource');
    const trackCoinProgressCallBody = functionBody(coinProgressRuntimeSourceModule, 'trackCoinProgressCall');
    assert(coinProgressRuntimeBody.includes('function coinProgressCoreOptions'), 'coin-progress runtime wrapper options not found');
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
    assert(sourceRuntimeText.includes('coinFailureIgnoreCore(bot.coinFailures.get(progressId)'), 'source bot coin failure wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('staleCoinEscapeDirectionCore(progressAction, progressSelf'), 'source bot stale coin escape wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('coinAttemptExpiredCore(progressAttempt, progressAt, progressOptions)'), 'source bot coin attempt cleanup does not call strategy core');
    assert(sourceRuntimeText.includes('coinProgressIntentCore(progressAction)'), 'source bot coin intent wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('updateCoinAttemptCore(bot.coinAttempts.get'), 'source bot coin attempt wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('updateCoinProgressRecordCore(previousProgress, progressAttemptRecord, progressDistance, progressAt, progressOptions)'), 'source bot coin progress wrapper does not call strategy core');
    assert(sourceRuntimeText.includes("buildIgnoredCoinProgressCore(progressId, progressAttemptRecord, progressDistance, progressAt, progressFailure.ignoreUntil, 'stuck')"), 'source bot stuck ignored progress does not call strategy core');
    assert(sourceRuntimeText.includes("buildIgnoredCoinProgressCore(progressId, bot.coinProgress, progressDistance, progressAt, staleFailure.ignoreUntil, 'progress')"), 'source bot no-progress ignored progress does not call strategy core');
    assert(sourceRuntimeText.includes('buildIgnoredCoinPatrolActionCore('), 'source bot ignored coin action does not call strategy core');
    assert(sourceRuntimeText.includes('coinIgnoreCleanupIntentCore(bot.lastTarget, bot.coinApproachLock, progressId)'), 'source bot ignored coin cleanup wrapper does not call strategy core');
    assert(coinProgressRuntimeSourceModule.includes('clearOpportunityChoiceForCall("\'coin\'", \'progressId\''), 'source bot ignored coin branches do not clear held opportunity choice');
    assert(sourceRuntimeText.includes('bot.coinFailures.set(progressId') && sourceRuntimeText.includes('bot.ignoredCoins.set(progressId'), 'source bot coin failure wrapper does not retain runtime state writes');
    assert(sourceRuntimeText.includes('bot.staleCoinEscape = progressEscapeResult.state'), 'source bot stale coin escape wrapper does not retain runtime state write');
    assert(sourceRuntimeText.includes('bot.coinAttempts.set(progressId, progressAttemptRecord)'), 'source bot coin attempt wrapper does not retain runtime map write');
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
    assert(opportunityRouteSourceModule.includes("require('./src/browser/runtime/coin-route')"), 'opportunity-route source does not import coin route through browser runtime adapter');
    assert(!opportunityRouteSourceModule.includes("require('../strategy/coin-route')"), 'opportunity-route source still imports coin route directly from strategy');
    assert(coinRouteRuntimeModule.includes("require('../../strategy/coin-route')"), 'coin-route runtime adapter does not reuse strategy module core');
    assert(coinRouteRuntimeModule.includes('coinRouteKey') && coinRouteRuntimeModule.includes('pickCoinRouteOpportunityCore'), 'coin-route runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/coin-route.js'"), 'bundler spike does not import coin route runtime adapter');
    assert(bundlerSpikeEntrySource.includes('coinRoute.coinRouteActionMetaCore('), 'bundler spike does not execute coin route metadata helper');
    assert(bundlerSpikeBuildSource.includes("status.coinRouteKey === 'route-spike'"), 'bundler spike self-test does not assert coin route execution');
    assert(opportunityRouteSourceModule.includes('pickCoinRouteOpportunityCore') && opportunityRouteSourceModule.includes('function coinRouteCoreOptions'), 'source module does not wire bundled coin route helpers');
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
    assert(opportunityChoiceSourceModule.includes("require('./src/browser/runtime/opportunity-choice')"), 'opportunity-choice source does not import opportunity choice through browser runtime adapter');
    assert(!opportunityChoiceSourceModule.includes("require('../strategy/opportunity-choice')"), 'opportunity-choice source still imports opportunity choice directly from strategy');
    assert(opportunityChoiceRuntimeModule.includes("require('../../strategy/opportunity-choice')"), 'opportunity-choice runtime adapter does not reuse strategy module core');
    assert(opportunityChoiceRuntimeModule.includes('chooseStableOpportunityCore') && opportunityChoiceRuntimeModule.includes('rememberOpportunityChoiceCore'), 'opportunity-choice runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-choice.js'"), 'bundler spike does not import opportunity choice runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityChoice.chooseStableOpportunityCore('), 'bundler spike does not execute opportunity choice stable helper');
    assert(bundlerSpikeBuildSource.includes("status.opportunityChoiceKey === 'coin:choice-held'"), 'bundler spike self-test does not assert opportunity choice execution');
    assert(opportunityChoiceSourceModule.includes('chooseStableOpportunityCore') && opportunityChoiceSourceModule.includes('function opportunityChoiceCoreOptions'), 'source module does not wire bundled opportunity choice helpers');
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
    assert(!functionBody(opportunityPickSourceModule, 'opportunityPickSource').includes('function pickBestOpportunity('), 'opportunity-pick source still keeps pick wrapper');
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
    assert(!functionBody(patrolSourceModule, 'patrolSource').includes('function patrolDirection('), 'patrol source still keeps patrol direction wrapper');
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
    assert(opportunityCandidateSourceModule.includes("require('./src/browser/runtime/opportunity-candidates')"), 'opportunity-candidate source does not import opportunity candidates through browser runtime adapter');
    assert(!opportunityCandidateSourceModule.includes("require('../strategy/opportunity-candidates')"), 'opportunity-candidate source still imports opportunity candidates directly from strategy');
    assert(opportunityCandidatesRuntimeModule.includes("require('../../strategy/opportunity-candidates')"), 'opportunity-candidates runtime adapter does not reuse strategy module core');
    assert(opportunityCandidatesRuntimeModule.includes('buildOpportunityCandidatesCore') && opportunityCandidatesRuntimeModule.includes('bestCoinOpportunityScoreCore'), 'opportunity-candidates runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/opportunity-candidates.js'"), 'bundler spike does not import opportunity candidates runtime adapter');
    assert(bundlerSpikeEntrySource.includes('opportunityCandidates.buildOpportunityCandidatesCore('), 'bundler spike does not execute opportunity candidate combiner helper');
    assert(bundlerSpikeBuildSource.includes('status.opportunityCandidateCount === 2'), 'bundler spike self-test does not assert opportunity candidate execution');
    assert(opportunityCandidateSourceModule.includes('buildOpportunityCandidatesCore') && opportunityCandidateSourceModule.includes('function opportunityCandidateCoreOptions'), 'source module does not wire bundled opportunity candidate helpers');
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
    assert(strategyDropMatchedKillSource.includes('function buildDropMatchedKillCore'), 'strategy drop-matched kill core not found');
    assert(postAttackSourceModule.includes("require('./src/browser/runtime/post-attack-drop')"), 'post-attack source does not import post-attack drop through browser runtime adapter');
    assert(chooseActionSourceModule.includes("require('./combat-history-source')"), 'choose-action source does not import drop-matched kill call helper');
    assert(!postAttackSourceModule.includes("require('../strategy/post-attack-drop')"), 'post-attack source still imports post-attack drop directly from strategy');
    assert(postAttackDropRuntimeModule.includes("require('../../strategy/post-attack-drop')"), 'post-attack drop runtime adapter does not reuse strategy module core');
    assert(postAttackDropRuntimeModule.includes('postAttackVisibleCoinExistsCore') && postAttackDropRuntimeModule.includes('pickPostAttackDropCoinCore') && postAttackDropRuntimeModule.includes('pickPostAttackDropWaitTargetCore'), 'post-attack drop runtime adapter does not export expected helpers');
    assert(dropMatchedKillRuntimeModule.includes("require('../../strategy/drop-matched-kill')") && dropMatchedKillRuntimeModule.includes('buildDropMatchedKillCore'), 'drop-matched kill runtime adapter does not export expected helper');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/post-attack-drop.js'"), 'bundler spike does not import post-attack drop runtime adapter');
    assert(bundlerSpikeEntrySource.includes('postAttackDrop.pickPostAttackDropCoinCore('), 'bundler spike does not execute post-attack drop picker helper');
    assert(bundlerSpikeBuildSource.includes("status.postAttackDropSelectedId === 'post-attack-coin'"), 'bundler spike self-test does not assert post-attack drop execution');
    assert(bundlerSpikeBuildSource.includes("status.dropMatchedKillVictim === 'Post Target'") && bundlerSpikeBuildSource.includes('status.dropMatchedKillStaminaMs === 150'), 'bundler spike self-test does not assert drop-matched kill execution');
    assert(postAttackSourceModule.includes('pickPostAttackDropCoinCore') && postAttackSourceModule.includes('pickPostAttackDropWaitTargetCore'), 'source module does not wire bundled post-attack drop helpers');
    assert(sourceRuntimeText.includes('pickPostAttackDropCoinCore(bot.attackHistory'), 'source bot post-attack drop coin wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory'), 'source bot post-attack wait wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/post-attack-drop')"), 'generated remote runtime does not hand post-attack drop helpers to the bundler');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/drop-matched-kill')"), 'generated remote runtime does not hand drop-matched kill helper to the bundler');
    assert(!generatedRuntimeSource.includes('function pickPostAttackDropCoinCore'), 'generated remote runtime still inlines post-attack drop coin core before bundling');
    assert(!generatedRuntimeSource.includes('function recordDropMatchedKill('), 'generated remote runtime still declares drop-matched kill wrapper');
    assert(!distSource.includes('function recordDropMatchedKill('), 'bundled dist still declares drop-matched kill wrapper');
    assert(!generatedRuntimeSource.includes('function postAttackVisibleCoinExists('), 'generated remote runtime still declares unused postAttackVisibleCoinExists wrapper');
    assert(!distSource.includes('function postAttackVisibleCoinExists('), 'bundled dist still declares unused postAttackVisibleCoinExists wrapper');
    for (const wrapperName of ['pickPostAttackDropCoin', 'pickPostAttackDropWaitTarget']) {
      assert(!generatedRuntimeSource.includes(`function ${wrapperName}(`), `generated remote runtime still declares unused ${wrapperName} wrapper`);
      assert(!distSource.includes(`function ${wrapperName}(`), `bundled dist still declares unused ${wrapperName} wrapper`);
    }
    assert(generatedRuntimeSource.includes('pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {'), 'generated choose-action does not call post-attack drop coin core directly');
    assert(generatedRuntimeSource.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {'), 'generated choose-action does not call post-attack wait core directly');
    assert(generatedRuntimeSource.includes('buildDropMatchedKillCore(candidate') && generatedRuntimeSource.includes('buildDropMatchedKillCore(sessionTarget'), 'generated runtime does not call drop-matched kill core directly');
    assert(distSource.includes('pickPostAttackDropCoinCore(bot.attackHistory, candidateCoins, {'), 'bundled dist choose-action does not call post-attack drop coin core directly');
    assert(distSource.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory, realtimeCoins, coinThreats, {'), 'bundled dist choose-action does not call post-attack wait core directly');
    assert(distSource.includes('buildDropMatchedKillCore(candidate') && distSource.includes('buildDropMatchedKillCore(sessionTarget'), 'bundled dist does not call drop-matched kill core directly');
    assert(distSource.includes('function postAttackVisibleCoinExistsCore'), 'bundled dist does not contain post-attack visible coin core');
    assert(distSource.includes('function resolvedRecentPostAttackDropsCore'), 'bundled dist does not contain post-attack resolved attack core');
    assert(distSource.includes('function buildPostAttackDropCoinCandidateCore'), 'bundled dist does not contain post-attack drop coin metadata core');
    assert(distSource.includes('function pickPostAttackDropCoinCore'), 'bundled dist does not contain post-attack drop coin picker core');
    assert(distSource.includes('function pickPostAttackDropWaitTargetCore'), 'bundled dist does not contain post-attack wait picker core');
    assert(distSource.includes('function buildDropMatchedKillCore'), 'bundled dist does not contain drop-matched kill core');
  });

  check('stamina budget helpers use strategy module core', () => {
    assert(strategyStaminaBudgetSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'strategy daily stamina budget core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeBlockedStaminaOpportunityCore'), 'strategy blocked stamina summary core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeNearestCoinStaminaBudgetExitCore'), 'strategy nearest coin stamina exit core not found');
    assert(strategyStaminaBudgetSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'strategy daily final coin picker core not found');
    assert(opportunityStaminaSourceModule.includes("require('./src/browser/runtime/stamina-budget')"), 'opportunity-stamina source does not import stamina budget through browser runtime adapter');
    assert(!opportunityStaminaSourceModule.includes("require('../strategy/stamina-budget')"), 'opportunity-stamina source still imports stamina budget directly from strategy');
    assert(staminaBudgetRuntimeModule.includes("require('../../strategy/stamina-budget')"), 'stamina-budget runtime adapter does not reuse strategy module core');
    assert(staminaBudgetRuntimeModule.includes('dailyStaminaBudgetIsLimitingCore') && staminaBudgetRuntimeModule.includes('summarizeNearestCoinStaminaBudgetExitCore') && staminaBudgetRuntimeModule.includes('pickNearestDailyStaminaFinalCoinCore'), 'stamina-budget runtime adapter does not export expected helpers');
    assert(bundlerSpikeEntrySource.includes("from '../browser/runtime/stamina-budget.js'"), 'bundler spike does not import stamina-budget runtime adapter');
    assert(bundlerSpikeEntrySource.includes('staminaBudget.dailyStaminaBudgetIsLimitingCore('), 'bundler spike does not execute stamina budget helper');
    assert(bundlerSpikeBuildSource.includes('status.staminaBudgetExitShortageMs === 50'), 'bundler spike self-test does not assert stamina budget execution');
    assert(opportunityStaminaSourceModule.includes('dailyStaminaBudgetIsLimitingCore') && opportunityStaminaSourceModule.includes('pickNearestDailyStaminaFinalCoinCore'), 'source module does not wire bundled stamina budget helpers');
    assert(sourceRuntimeText.includes('dailyStaminaBudgetIsLimitingCore('), 'source bot daily stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeBlockedStaminaOpportunityCore(realtimeCoins, []'), 'source bot blocked stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeNearestCoinStaminaBudgetExitCore(') && sourceRuntimeText.includes('safeCoinCandidates(realtimeCoins, coinThreats, cfg.globalCoinMaxDistance, self)'), 'source bot nearest stamina exit wrapper does not call strategy core');
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
    assert(actionArbitrationSourceModule.includes('function recordActionSwitchDiagnosticsCall') && actionArbitrationSourceModule.includes('targetSwitchState = ensureTargetSwitchDiagnostics()'), 'source modules do not wire direct action switch diagnostic call generation');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-switch-diagnostics')"), 'generated remote runtime does not hand action switch diagnostics helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function recordActionSwitchDiagnosticsCore'), 'generated remote runtime still inlines target switch diagnostic core before bundling');
    assert(!generatedRuntimeSource.includes('function recordActionSwitchDiagnostics(action'), 'generated remote runtime still keeps target switch diagnostic wrapper');
    assert(!distSource.includes('function recordActionSwitchDiagnostics(action'), 'bundled dist still keeps target switch diagnostic wrapper');
    assert(distSource.includes('function recordActionSwitchDiagnosticsCore'), 'bundled dist does not contain target switch diagnostic core');
    assert(distSource.includes('targetSwitch: snapshot'), 'bundled dist target switch event is not attached to decisions');
    assert(sourceRuntimeText.includes('targetSwitchDiagnostics: this.targetSwitchDiagnostics'), 'status does not expose target switch diagnostics');
    assert(functionBody(tickSourceModule, 'tickSource').includes("recordActionSwitchDiagnosticsCall('action', 'source')"), 'tick source does not generate direct target switch diagnostics call');
    assert(generatedRuntimeSource.includes('recordActionSwitchDiagnosticsCore(action, targetSwitchState'), 'generated runtime does not record target switch diagnostics directly');
    assert(combatLogSourceModule.includes("type: 'target-switch'"), 'standalone target-switch log entry not found');
    assert(combatLogSourceModule.includes('recordTargetSwitchLog(source, decision || {})'), 'target switch diagnostics are not recorded on each log tick');
    assert(combatLogSourceModule.includes('targetSwitchDiagnosticSignature'), 'target switch log throttle signature not found');
  });

  check('final action arbitration gates cross-band focus steals', () => {
    assert(sourceRuntimeText.includes('function applyFinalActionArbitration'), 'final action arbitration wrapper not found');
    assert(strategyActionArbitrationSource.includes('function finalActionBandRank'), 'strategy final action priority band rank helper not found');
    assert(strategyActionArbitrationSource.includes('function applyFinalActionArbitrationCore'), 'strategy final action arbitration core not found');
    assert(strategyActionPrioritySource.includes('function actionFocusSummary'), 'strategy action focus summary helper not found');
    assert(actionArbitrationSourceModule.includes('function applyFinalActionArbitrationCall') && actionArbitrationSourceModule.includes('finalActionState = ensureFinalActionArbitration()'), 'source modules do not wire direct final action arbitration call generation');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-priority')"), 'generated remote runtime does not hand action priority helpers to the bundler');
    assert(generatedRuntimeSource.includes("require('./src/browser/runtime/action-arbitration')"), 'generated remote runtime does not hand final action arbitration helpers to the bundler');
    assert(!generatedRuntimeSource.includes('function finalActionBandRank'), 'generated remote runtime still inlines final action priority band rank helper before bundling');
    assert(!generatedRuntimeSource.includes('function applyFinalActionArbitrationCore'), 'generated remote runtime still inlines final action arbitration core before bundling');
    assert(!generatedRuntimeSource.includes('function applyFinalActionArbitration(action'), 'generated remote runtime still keeps final action arbitration wrapper');
    assert(!distSource.includes('function applyFinalActionArbitration(action'), 'bundled dist still keeps final action arbitration wrapper');
    assert(distSource.includes('function finalActionBandRank'), 'bundled dist does not contain final action priority band rank helper');
    assert(distSource.includes('function applyFinalActionArbitrationCore'), 'bundled dist does not contain final action arbitration core');
    assert(distSource.includes('higher-priority-band-stick'), 'final action hysteresis reason not found in bundled dist');
    assert(functionBody(tickSourceModule, 'tickSource').includes("applyFinalActionArbitrationCall('action', 'source')"), 'tick source does not generate direct final action arbitration call');
    assert(generatedRuntimeSource.includes('applyFinalActionArbitrationCore(action, finalActionState'), 'generated runtime does not run final action arbitration directly');
    assert(generatedRuntimeSource.indexOf('applyFinalActionArbitrationCore(action, finalActionState') < generatedRuntimeSource.indexOf('recordActionSwitchDiagnosticsCore(action, targetSwitchState'), 'final action arbitration must run before target-switch diagnostics');
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

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
