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
  const re = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*${escapeRegExp(String(value))}(?![0-9.])`);
  return re.test(text);
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
  const botSourceModule = readText('src/browser/bot-source.js');
  const nodeSelfTestSource = readText('src/node/run-self-test.js');
  const buildRemoteSource = readText('scripts/build-remote-bot.js');
  const remoteBundleSource = readText('scripts/remote-bot-bundle.js');
  const bundlerSpikeBuildSource = readText('scripts/build-bundler-spike.js');
  const remoteBundledBuildSource = readText('scripts/build-remote-bot-bundled.js');
  const bundlerSpikeEntrySource = readText('src/bundler-spike/runtime-entry.mjs');
  const browserPageGlobalCoreSource = readText('src/browser/page-global-core.js');
  const strategyActionArbitrationSource = readText('src/strategy/action-arbitration.js');
  const strategyActionPrioritySource = readText('src/strategy/action-priority.js');
  const strategyActionSwitchDiagnosticsSource = readText('src/strategy/action-switch-diagnostics.js');
  const strategyCoinDiagnosticsSource = readText('src/strategy/coin-diagnostics.js');
  const strategyCoinMotionSource = readText('src/strategy/coin-motion.js');
  const strategyCoinTargetSource = readText('src/strategy/coin-target.js');
  const strategyCoinProgressSource = readText('src/strategy/coin-progress.js');
  const strategyCoinRouteSource = readText('src/strategy/coin-route.js');
  const strategyOpportunityChoiceSource = readText('src/strategy/opportunity-choice.js');
  const strategyOpportunityCandidatesSource = readText('src/strategy/opportunity-candidates.js');
  const strategyPostAttackDropSource = readText('src/strategy/post-attack-drop.js');
  const strategyStaminaBudgetSource = readText('src/strategy/stamina-budget.js');
  const targetOverlaySourceModule = readText('src/browser/target-overlay-source.js');
  const statusPanelSourceModule = readText('src/browser/status-panel-source.js');
  const combatLogSourceModule = readText('src/browser/combat-log-source.js');
  const importantLogSourceModule = readText('src/browser/important-log-source.js');
  const controlLoginSourceModule = readText('src/browser/control-login-source.js');
  const nativeStateSourceModule = readText('src/browser/native-state-source.js');
  const runtimeSummarySourceModule = readText('src/browser/runtime-summary-source.js');
  const sharedRuntimeUtilsSource = readText('src/shared/runtime-utils.js');
  const sharedDisplayFormatSource = readText('src/shared/display-format.js');
  const sharedPreservedStateSource = readText('src/shared/browser-preserved-state.js');
  const sharedRuntimeDefaultsSource = readText('src/shared/runtime-defaults.js');
  const sharedTargetWhitelistSource = readText('src/shared/target-whitelist.js');
  const sourceRuntimeText = [
    sourceBot,
    runtimeSourceModule,
    botSourceModule,
    browserPageGlobalCoreSource,
    targetOverlaySourceModule,
    statusPanelSourceModule,
    combatLogSourceModule,
    importantLogSourceModule,
    controlLoginSourceModule,
    nativeStateSourceModule,
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
    assert(!distSource.includes('module.exports'), 'bundled production dist still contains CommonJS exports');
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
    assert(runtimeSourceModule.includes("const { browserBotSource } = require('./bot-source')"), 'runtime source boundary does not own the browser source builder dependency');
    assert(runtimeSourceModule.includes('function browserRuntimeConfig(options = {})'), 'browser runtime config adapter not found');
    assert(runtimeSourceModule.includes('function browserRuntimeSource(options = {})'), 'browser runtime source adapter not found');
    assert(runtimeSourceModule.includes('function remoteBrowserRuntimeSource(options = {})'), 'remote browser runtime source adapter not found');
    assert(runtimeSourceModule.includes('module.exports = {\n  browserRuntimeConfig,\n  browserRuntimeSource,\n  remoteBrowserRuntimeSource'), 'runtime source boundary exports not found');
    assert(botSourceModule.includes("require('../shared/exit-summary')"), 'exit-summary module import not found');
    assert(botSourceModule.includes("require('../shared/runtime-utils')"), 'runtime-utils module import not found');
    assert(botSourceModule.includes("require('../shared/display-format')"), 'display-format module import not found');
    assert(botSourceModule.includes("require('../shared/browser-preserved-state')"), 'browser-preserved-state module import not found');
    assert(botSourceModule.includes("require('../shared/runtime-defaults')"), 'runtime-defaults module import not found');
    assert(botSourceModule.includes("require('./page-global-core')"), 'page-global core module import not found');
    assert(botSourceModule.includes("require('../shared/target-whitelist')"), 'target-whitelist module import not found');
    assert(botSourceModule.includes("require('./target-overlay-source')"), 'target-overlay source module import not found');
    assert(botSourceModule.includes("require('./status-panel-source')"), 'status-panel source module import not found');
    assert(botSourceModule.includes("require('./combat-log-source')"), 'combat-log source module import not found');
    assert(botSourceModule.includes("require('./important-log-source')"), 'important-log source module import not found');
    assert(botSourceModule.includes("require('./control-login-source')"), 'control-login source module import not found');
    assert(botSourceModule.includes("require('./native-state-source')"), 'native-state source module import not found');
    assert(botSourceModule.includes("require('./runtime-summary-source')"), 'runtime-summary source module import not found');
    assert(botSourceModule.includes('function browserBotSource(config)'), 'browserBotSource factory not found');
    assert(botSourceModule.includes('module.exports = {\n  browserBotSource'), 'browserBotSource module export not found');
    assert(botSourceModule.includes('${browserPageGlobalSource()}'), 'page-global adapter source is not injected into browser runtime');
    assert(botSourceModule.includes("const value = readPageGlobal('__graspRatBotRuntimeConfig', {}, pageGlobal);"), 'runtime config is not read through page-global adapter');
    assert(botSourceModule.includes('const previousBot = readPageGlobal(BOT_KEY, null, pageGlobal);'), 'previous bot is not read through page-global adapter');
    assert(botSourceModule.includes('installPageGlobal(BOT_KEY, bot, pageGlobal);'), 'bot is not installed through page-global adapter');
    assert(browserPageGlobalCoreSource.includes('function browserPageGlobalSource()'), 'page-global browser source builder not found');
    assert(browserPageGlobalCoreSource.includes('pageGlobalObject.toString()'), 'page-global source builder does not inline object helper');
    assert(browserPageGlobalCoreSource.includes('installPageGlobal.toString()'), 'page-global source builder does not inline installer');
    assert(botSourceModule.includes('${safeStringify.toString()}'), 'safeStringify is not injected from the shared module');
    assert(botSourceModule.includes('${buildRuntimeDefaults.toString()}'), 'runtime defaults are not injected from the shared module');
    assert(botSourceModule.includes('${normalizeTargetWhitelistName.toString()}'), 'target whitelist name normalizer is not injected from the shared module');
    assert(botSourceModule.includes('${parseTargetWhitelistNames.toString()}'), 'target whitelist parser is not injected from the shared module');
    assert(botSourceModule.includes('${deriveTargetWhitelistUrl.toString()}'), 'target whitelist URL derivation is not injected from the shared module');
    assert(botSourceModule.includes('${targetOverlaySource()}'), 'target-overlay module is not injected into browser runtime');
    assert(botSourceModule.includes('${statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay })}'), 'status-panel module is not injected into browser runtime');
    assert(botSourceModule.includes('${combatLogSource({ combatLogExitSummaryFromDecision })}'), 'combat-log module is not injected into browser runtime');
    assert(botSourceModule.includes('${importantLogSource()}'), 'important-log module is not injected into browser runtime');
    assert(botSourceModule.includes('${controlLoginSource({ staminaExhaustedWindowLabel })}'), 'control-login module is not injected into browser runtime');
    assert(botSourceModule.includes('${nativeStateSource()}'), 'native-state module is not injected into browser runtime');
    assert(botSourceModule.includes('${runtimeSummarySource()}'), 'runtime-summary module is not injected into browser runtime');
    assert(generatedRuntimeSource.includes('function safeStringify') && generatedRuntimeSource.includes('function formatDistance') && generatedRuntimeSource.includes('function buildRuntimeDefaults'), 'generated runtime does not inline shared helper functions');
    assert(generatedRuntimeSource.includes('function resolvePageGlobal') && generatedRuntimeSource.includes('function installPageGlobal'), 'generated runtime does not inline page-global adapter helpers');
    assert(generatedRuntimeSource.includes('function normalizeTargetWhitelistName') && generatedRuntimeSource.includes('function parseTargetWhitelistNames') && generatedRuntimeSource.includes('function deriveTargetWhitelistUrl'), 'generated runtime does not inline target whitelist helpers');
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

  check('browser UI source modules export overlay, status panel, combat-log, important-log, and control-login runtime fragments', () => {
    assert(targetOverlaySourceModule.includes('function targetOverlaySource() {'), 'target-overlay source factory not found');
    assert(targetOverlaySourceModule.includes('module.exports = {\n  targetOverlaySource'), 'target-overlay module export not found');
    assert(functionBody(targetOverlaySourceModule, 'targetOverlaySource').includes('String.raw`'), 'target-overlay source factory does not return raw browser source');
    assert(statusPanelSourceModule.includes('function statusPanelSource(helpers = {}) {'), 'status-panel source factory not found');
    assert(statusPanelSourceModule.includes('module.exports = {\n  statusPanelSource'), 'status-panel module export not found');
    assert(functionBody(statusPanelSourceModule, 'statusPanelSource').includes('typeof escapeHtml === \'function\' ? escapeHtml.toString() : \'\''), 'status-panel source factory does not inline shared display helpers');
    assert(functionBody(statusPanelSourceModule, 'statusPanelSource').includes('typeof formatDistance === \'function\' ? formatDistance.toString() : \'\''), 'status-panel source factory does not inline distance formatter');
    assert(combatLogSourceModule.includes('function combatLogSource(helpers = {}) {'), 'combat-log source factory not found');
    assert(combatLogSourceModule.includes('module.exports = {\n  combatLogSource'), 'combat-log module export not found');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('String.raw`'), 'combat-log source factory does not return raw browser source');
    assert(functionBody(combatLogSourceModule, 'combatLogSource').includes('const combatLogExitSummaryFromDecision = ${combatLogExitSummaryFromDecision.toString()};'), 'combat-log source factory does not inline exit-summary helper');
    assert(importantLogSourceModule.includes('function importantLogSource() {'), 'important-log source factory not found');
    assert(importantLogSourceModule.includes('module.exports = {\n  importantLogSource'), 'important-log module export not found');
    assert(functionBody(importantLogSourceModule, 'importantLogSource').includes('String.raw`'), 'important-log source factory does not return raw browser source');
    assert(controlLoginSourceModule.includes('function controlLoginSource(helpers = {}) {'), 'control-login source factory not found');
    assert(controlLoginSourceModule.includes('module.exports = {\n  controlLoginSource'), 'control-login module export not found');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('String.raw`'), 'control-login source factory does not return raw browser source');
    assert(functionBody(controlLoginSourceModule, 'controlLoginSource').includes('typeof staminaExhaustedWindowLabel === \'function\' ? staminaExhaustedWindowLabel.toString() : \'\''), 'control-login source factory does not inline stamina window helper');
    assert(nativeStateSourceModule.includes('function nativeStateSource() {'), 'native-state source factory not found');
    assert(nativeStateSourceModule.includes('module.exports = {\n  nativeStateSource'), 'native-state module export not found');
    assert(functionBody(nativeStateSourceModule, 'nativeStateSource').includes('String.raw`'), 'native-state source factory does not return raw browser source');
    assert(functionBody(nativeStateSourceModule, 'nativeStateSource').includes('function getNativeState()'), 'native-state source factory does not include native state helpers');
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
    assert(bundlerSpikeEntrySource.includes("import * as runtimeUtils from '../shared/runtime-utils.js'"), 'bundler spike does not import shared runtime utils as a module');
    assert(bundlerSpikeEntrySource.includes("import * as displayFormat from '../shared/display-format.js'"), 'bundler spike does not import display helpers as a module');
    assert(bundlerSpikeEntrySource.includes("import * as targetWhitelist from '../shared/target-whitelist.js'"), 'bundler spike does not import target whitelist helpers as a module');
    assert(bundlerSpikeEntrySource.includes("import * as actionPriority from '../strategy/action-priority.js'"), 'bundler spike does not import strategy helpers as a module');
    assert(bundlerSpikeEntrySource.includes("import pageAdapter from '../browser/page-global-core.js'"), 'bundler spike does not import the shared page-global adapter');
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
    assert(remoteBundledBuildSource.includes("!source.includes('module.exports')"), 'remote bundled candidate self-test does not reject CommonJS exports');
    assert(remoteBundledBuildSource.includes("/require\\(['\"]\\.\\.?\\//"), 'remote bundled candidate does not reject unresolved relative require calls');
    assert(remoteBundledBuildSource.includes("/\\bfrom\\s+['\"]\\.\\.?\\//"), 'remote bundled candidate does not reject unresolved relative import calls');
  });

  for (const file of REMOTE_BOT_FILES) {
    const text = file === 'grasp-rat-bot.js' ? sourceRuntimeText : generatedRuntimeSource;
    const defaultConfigSource = file === 'grasp-rat-bot.js' ? sharedRuntimeDefaultsSource : text;
    for (const invariant of NUMERIC_INVARIANTS) {
      check(`${file} has ${invariant.key}=${invariant.value}`, () => {
        assert(expectObjectNumber(defaultConfigSource, invariant.key, invariant.value), `${invariant.key}: ${invariant.value} not found`);
      });
    }
    check(`${file} accepts injected sourceHash`, () => {
      assert(defaultConfigSource.includes('sourceHash: String(config.sourceHash || \'\')'), 'sourceHash config field not found');
    });
    check(`${file} uses remote username-only target whitelist`, () => {
      const whitelistSource = file === 'grasp-rat-bot.js' ? sharedTargetWhitelistSource : text;
      assert(defaultConfigSource.includes('targetWhitelistUrl: String(config.targetWhitelistUrl || \'\')'), 'targetWhitelistUrl config field not found');
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
      assert(defaultConfigSource.includes('statusEvery: Number(config.statusEvery) === 0 ? 0 : Math.max(1000, Number(config.statusEvery) || 30000)'), 'runtime statusEvery default/disable logic not found');
      assert(text.includes('if (cfg.statusEvery > 0 && Date.now() - bot.lastStatusAt >= cfg.statusEvery)'), 'status log cannot be disabled with statusEvery=0');
    });
    check(`${file} formats display distances in meters`, () => {
      const displayFormatSource = file === 'grasp-rat-bot.js' ? sharedDisplayFormatSource : text;
      const distanceBody = functionBody(displayFormatSource, 'formatDistance');
      assert(distanceBody.includes('const meters = n / 100'), 'formatDistance does not convert cm to meters');
      assert(distanceBody.includes("+ '米'"), 'formatDistance does not append meter unit');
      const staminaSummaryBody = functionBody(text, 'staminaBudgetCoinLeaveSummary');
      assert(staminaSummaryBody.includes("最近金币距离' + formatDistance(detail.distance)"), 'stamina budget leave summary does not use meter distance formatting');
      const pursuitSummaryBody = functionBody(text, 'pursuitLeaveSummary');
      assert(pursuitSummaryBody.includes("'，距离' + formatDistance(distance)"), 'pursuit leave summary does not use meter distance formatting');
    });
    check(`${file} displays relogin wait using remaining hold before original delay`, () => {
      const body = functionBody(text, 'leaveWaitDisplay');
      assert(body.includes('detail?.holdRemainingMs ?? detail?.reloginDelayMs'), 'leave wait display does not prefer remaining hold time');
    });
    check(`${file} keeps shared runtime utility helpers available`, () => {
      const runtimeUtilsSource = file === 'grasp-rat-bot.js' ? sharedRuntimeUtilsSource : text;
      assert(functionBody(runtimeUtilsSource, 'safeStringify').includes('new WeakSet()'), 'safeStringify circular guard not found');
      assert(functionBody(runtimeUtilsSource, 'safeJsonClone').includes('JSON.parse(safeStringify(value))'), 'safeJsonClone does not use safeStringify');
      assert(functionBody(runtimeUtilsSource, 'sanitizeCombatLogIdPart').includes("replace(/[^\\w.-]+/g, '_')"), 'combat log id sanitizer not found');
    });
    check(`${file} keeps shared display formatting helpers available`, () => {
      const displayFormatSource = file === 'grasp-rat-bot.js' ? sharedDisplayFormatSource : text;
      assert(functionBody(displayFormatSource, 'escapeHtml').includes('&amp;'), 'escapeHtml entity map not found');
      assert(functionBody(displayFormatSource, 'formatDurationMs').includes("+ '小时'"), 'duration formatter does not handle hours');
      assert(functionBody(displayFormatSource, 'actorLabel').includes('actor.targetId'), 'actorLabel does not include targetId fallback');
      assert(functionBody(displayFormatSource, 'hpDisplay').includes('Math.round(n)'), 'hpDisplay does not round numeric HP');
    });
    check(`${file} keeps shared browser initialization helpers available`, () => {
      const preservedSource = file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : text;
      const defaultsSource = file === 'grasp-rat-bot.js' ? sharedRuntimeDefaultsSource : text;
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
      assert(functionBody(text, 'offlineLeaveSummary').includes('offlineSafety?.samplingOutage'), 'runtime offline leave summary does not mention sampling outage');
      assert(functionBody(text, 'offlineLeaveSummary').includes('offlineSafety?.combatTickGap'), 'runtime offline leave summary does not mention combat tick gap');
      assert(functionBody(text, 'offlineLeaveSummary').includes('offlineSafety?.actionSettlementStall'), 'runtime offline leave summary does not mention action settlement stall');
      const leaveOfflineBody = functionBody(text, 'leaveOffline');
      assert(leaveOfflineBody.includes('const summary = offlineLeaveSummary(reason, offlineSafety);'), 'offline leave retry cooldown does not compute the current offline summary');
      assert(leaveOfflineBody.includes('summary: summary || active?.summary'), 'offline leave retry cooldown can still prefer a stale active summary over the current reason');
      assert(functionBody(text, 'setOfflineLeaveSuppress').includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now()))'), 'ordinary unsafe offline exits still require a defensive relogin delay');
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
      assert(text.includes('function nativeCoinSnapshot'), 'native coin snapshot helper not found');
      assert(text.includes('function recordIncidentalCoinPickups'), 'incidental coin pickup recorder not found');
      const incidentalBody = functionBody(text, 'recordIncidentalCoinPickups');
      assert(incidentalBody.includes('nativeCoinSnapshot()'), 'incidental pickup recorder does not read native coin state');
      assert(incidentalBody.includes('pickIncidentalCoinPickupsCore('), 'incidental pickup recorder does not use strategy core');
      assert(incidentalBody.includes('previousSnapshot') && incidentalBody.includes('currentSnapshot'), 'incidental pickup recorder does not compare disappeared coins');
      assert(text.includes('pointToSegmentDistanceCore'), 'incidental pickup movement path core not found');
      assert(incidentalBody.includes("'incidental-coin-disappeared'"), 'incidental pickup reason not recorded');
      assert(incidentalBody.includes('rememberNativeCoinSnapshot(currentSnapshot)'), 'incidental pickup recorder does not refresh native snapshot');
      assert(functionBody(text, 'markCoinCollected').includes('rememberNativeCoinSnapshot();'), 'tracked pickup path does not refresh native snapshot');
      const preservedBody = functionBody(file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : text, 'buildBrowserPreservedState');
      assert(preservedBody.includes('lastNativeCoinSnapshot'), 'preserved-state helper does not preserve native coin snapshots');
      const tickBody = functionBody(text, 'tick');
      assert(tickBody.includes('coinMarked = markCoinCollected(self, currentSummary, previousCoins)'), 'tick does not record tracked coin pickups first');
      assert(tickBody.includes('coinMarked = recordIncidentalCoinPickups(self, currentSummary, bot.lastSelf, previousCoins)'), 'tick does not record incidental coin pickups');
      assert(tickBody.includes('rememberNativeCoinSnapshot();'), 'tick does not seed native coin snapshots without previous self');
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
      assert(chooseBody.includes('pickPostAttackDropCoin(self, realtimeCoins'), 'post-attack pickup is not limited to realtime coins');
      assert(chooseBody.includes('{ coins: realtimeGlobalCoins, maxDistance: cfg.globalCoinMaxDistance }'), 'normal opportunity coin pool is not limited to realtime coins');
      assert(chooseBody.includes('realtimeGlobalTargets.filter(isAfkProfitTarget)'), 'normal AFK opportunity pool is not limited to realtime targets');
      const visibleOpportunityIndex = chooseBody.indexOf('const opportunity = pickBestOpportunity(');
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
      const routeBody = functionBody(text, 'pickCoinRouteOpportunity');
      const routeCoreSource = file === 'grasp-rat-bot.js' ? strategyCoinRouteSource : text;
      const routeCoreBody = functionBody(routeCoreSource, 'pickCoinRouteOpportunityCore');
      const bestBody = functionBody(text, 'bestCoinOpportunityScore');
      const pickBody = functionBody(text, 'pickBestOpportunity');
      const opportunityCandidateSource = file === 'grasp-rat-bot.js' ? strategyOpportunityCandidatesSource : text;
      const coinCandidateBody = functionBody(opportunityCandidateSource, 'buildCoinOpportunityCandidatesCore');
      assert(text.includes('function pickCoinRouteOpportunity'), 'coin route planner not found');
      assert(strategyCoinRouteSource.includes('function pickCoinRouteOpportunityCore'), 'strategy coin route planner core not found');
      assert(strategyCoinRouteSource.includes('function buildCoinRouteFromAnchorCore'), 'strategy coin route builder core not found');
      assert(strategyCoinRouteSource.includes('function coinRouteLegClearCore'), 'strategy coin route leg safety core not found');
      assert(text.includes('function coinRouteLegClear'), 'coin route leg safety checker not found');
      assert(text.includes('function coinRouteSkipsCloserFirstCoin'), 'coin route closer-first guard not found');
      assert(text.includes('function currentHeldCoinChoice'), 'coin route held single-coin choice helper not found');
      assert(text.includes('function coinRouteSkipsHeldSingleCoin'), 'coin route held single-coin skip guard not found');
      assert(text.includes('function currentHeldCoinRouteChoice'), 'coin route held-choice stabilizer not found');
      assert(text.includes('function heldCoinRouteBeatsSwitch'), 'coin route switch hysteresis helper not found');
      assert(routeCoreSource.includes('function coinRoutePoints'), 'coin route point metadata helper not found');
      assert(text.includes('best-opportunity-coin-route'), 'coin route decision reason not found');
      assert(routeCoreSource.includes('points: coinRoutePoints(bestRoute)'), 'coin route action metadata does not expose route points');
      assert(routeCoreBody.includes('.filter(coin => !isSnapshotOnlyCoin(coin))'), 'coin route planner can include snapshot-only coins');
      assert(text.includes('poolLimit: cfg.coinRoutePoolLimit') || routeCoreBody.includes('options.poolLimit'), 'coin route planner is not pool bounded');
      assert(text.includes('anchorLimit: cfg.coinRouteAnchorLimit') || routeCoreBody.includes('options.anchorLimit'), 'coin route planner is not anchor bounded');
      assert(routeCoreBody.includes('coinRouteLegClearCore(self, anchor, activeThreats, options)'), 'coin route planner does not safety-check first leg');
      assert(routeCoreBody.includes('coinRouteSkipsCloserFirstCoinCore(self, route, candidates, options)'), 'coin route planner can skip much closer local coins');
      assert(text.includes('heldChoice: currentHeldCoinChoice()') && routeCoreBody.includes('coinRouteSkipsHeldSingleCoinCore(self, route, heldChoice, options)'), 'coin route planner can skip the held nearby single coin');
      assert(text.includes('heldRouteChoice: currentHeldCoinRouteChoice()') && routeCoreBody.includes('heldCoinRouteBeatsSwitchCore(heldRoute, best, options)'), 'coin route planner does not stabilize held route first coin');
      assert(bestBody.includes('pickCoinRouteOpportunity') && bestBody.includes('bestCoinOpportunityScoreCore'), 'profitable combat comparison does not include coin route score');
      assert(pickBody.includes('pickCoinRouteOpportunity'), 'visible opportunity selection does not include coin route');
      assert(pickBody.includes('buildOpportunityCandidatesCore'), 'visible opportunity selection does not use opportunity candidate core');
      assert(coinCandidateBody.includes('mergeCoinRouteDisplayCore(previous, routeCoin)'), 'same-first-coin route metadata is not preserved for overlay display');
      assert(coinCandidateBody.includes('routeHeld: Boolean(coin.routeHeld)'), 'coin route held metadata is not propagated to opportunity choice');
      assert(coinCandidateBody.includes("actionKind = Number(coin.distance || Infinity) <= Number(options.maxCoinDistance") && coinCandidateBody.includes('seek-coin'), 'coin route action kind does not preserve coin/seek-coin split');
    });
    check(`${file} lets high-value combat drops interrupt recovery`, () => {
      const body = functionBody(text, 'pickPostAttackDropCoin');
      const coinCoreSource = file === 'grasp-rat-bot.js' ? strategyPostAttackDropSource : text;
      assert(body.includes('options.maxDistance ?? cfg.postAttackDropCoinMaxDistance'), 'post-attack drop picker does not accept maxDistance override');
      assert(body.includes('options.minScore ?? 0'), 'post-attack drop picker does not accept minScore override');
      assert(body.includes('if (score < minScore) continue') || coinCoreSource.includes('if (score < minScore) continue'), 'post-attack drop picker does not filter by recovery ROI score');
      assert(text.includes('maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance'), 'recovery post-attack drop max distance not wired');
      assert(text.includes('minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0'), 'recovery post-attack drop min score not wired');
    });
    check(`${file} locks oscillating opportunity target pairs`, () => {
      const body = functionBody(strategyOpportunityChoiceSource, 'applyOpportunityOscillationLockCore');
      const choiceMetadataSource = file === 'grasp-rat-bot.js' ? strategyOpportunityChoiceSource : text;
      assert(text.includes('oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit'), 'oscillation lock limit config not used');
      assert(body.includes('switchCount > limit'), 'oscillation lock does not wait until the switch limit is exceeded');
      assert(body.includes('lockedKey: fromKey'), 'oscillation lock does not pin the current target');
      assert(text.includes('resetOpportunitySwitchLock()'), 'opportunity switch lock reset helper not found');
      assert(choiceMetadataSource.includes('oscillationLocked: Boolean'), 'opportunity choice does not expose oscillation lock state');
    });
    check(`${file} waits at killed high-drop target position before drop refresh`, () => {
      const body = functionBody(text, 'pickPostAttackDropWaitTarget');
      const waitCoreSource = file === 'grasp-rat-bot.js' ? strategyPostAttackDropSource : text;
      assert(body.includes('cfg.postAttackDropWaitMs'), 'post-attack wait window not used');
      assert(body.includes('cfg.postAttackDropResolveMaxMs'), 'post-attack wait resolve window not used');
      assert(body.includes('cfg.postAttackDropWaitMinDrop'), 'post-attack wait minimum drop not used');
      assert(body.includes('postAttackDropResolvedAt'), 'post-attack wait is not anchored to target resolution');
      assert(body.includes('postAttackVisibleCoinExists') || waitCoreSource.includes('postAttackVisibleCoinExistsCore'), 'post-attack wait does not skip already-visible drops');
      assert((body.includes("item.action === 'attack'") && body.includes("item.action === 'opportunistic-shot'"))
        || (waitCoreSource.includes("item.action === 'attack'") && waitCoreSource.includes("item.action === 'opportunistic-shot'")),
      'post-attack wait can trigger without a recent shot/attack');
      assert(body.includes('postAttackDropResolvedAt') || body.includes('!recentAttackTargetStillAttackable') || body.includes("!(entities || []).some(e => String(e.user_id ?? e.id ?? '') === String(item.id) && isAlive(e))"), 'post-attack wait does not require target resolution');
      assert(text.includes("reason: 'post-attack-drop-wait-position'"), 'post-attack wait action reason not found');
      const actionBody = functionBody(text, 'buildPostAttackDropWaitAction');
      assert(!actionBody.includes('\n      target: {'), 'post-attack wait should move without selecting a decision target');
      assert(actionBody.includes('postAttackTarget'), 'post-attack wait should keep metadata for the killed target position');
    });
    check(`${file} keeps post-login zoom-out scheduling flow`, () => {
      const preservedSource = file === 'grasp-rat-bot.js' ? sharedPreservedStateSource : text;
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
      const choiceMetadataSource = file === 'grasp-rat-bot.js' ? strategyOpportunityChoiceSource : text;
      assert(text.includes('function isHighValueCoinOpportunity(item)'), 'high-value opportunity helper not found');
      assert(text.includes('function highValueCoinHoldBlocksEnemySwitch(held, best)'), 'high-value coin hold switch blocker not found');
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
        : functionBody(text, 'combatLogExitSummaryFromDecision');
      assert(body.includes("leaveReason !== 'cooldown'"), 'cooldown leave detail can override specific exit reason');
      assert(body.includes('exitishDecisionReason'), 'decision exit reason fallback not found for cooldown leave detail');
      assert(body.includes('control-(?:ws|global|combat|action)'), 'control outage decision reasons are not all treated as exit summaries');
      assert(body.includes("pendingExit ? 'pending-exit-active'"), 'pending exit fallback not found for active pending exit frames');
      assert(body.includes('safeReloginAllowed: Boolean(detail.safeReloginAllowed || decision?.safeReloginAllowed)'), 'safe relogin marker not included in top-level exit summary');
      assert(body.includes('offlineSafety: detail.offlineSafety || decision?.offlineSafety || null'), 'offline safety not included in top-level exit summary');
    });
    check(`${file} keeps longest exit suppress delay`, () => {
      const confirmedBody = functionBody(text, 'setExitReloginSuppress');
      assert(
        confirmedBody.includes('const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'confirmed exit suppress does not take max(delay, minimum)'
      );
      const pendingBody = functionBody(text, 'primePendingUnsafeExitLoginSuppress');
      assert(
        pendingBody.includes('const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'pending unsafe exit suppress does not take max(delay, minimum)'
      );
      assert(
        functionBody(text, 'setExitReloginSuppress').includes('detail.defensiveReloginDelaySkipped = true'),
        'zero defensive relogin delay path is not recorded'
      );
    });
    check(`${file} records exit audit events and blocks login/reload until flushed`, () => {
      assert(text.includes('EXIT_AUDIT_PENDING_LOGS_KEY'), 'exit audit persistence key not found');
      assert(text.includes("type: 'exit-audit'"), 'exit audit event type not found');
      assert(text.includes("recordExitAuditEvent('exit-trigger'"), 'exit trigger audit event not recorded');
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
      assert(text.includes('recordDropMatchedKill(target, value'), 'picked post-attack drop coins are not attributed as kill rewards');
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
      assert(text.includes('function normalizePendingExitStateForStorage'), 'pending exit storage normalizer not found');
      assert(text.includes('function readPersistedPendingExitState'), 'pending exit storage reader not found');
      assert(text.includes('const restoredPendingExitState = readPersistedPendingExitState(Date.now(), { markReloaded: !previousBot })'), 'pending exit state is not restored with reload marker on cold page load');
      assert(text.includes('pendingExit: initialPendingExitState'), 'bot startup does not use restored pending exit state');
      assert(text.includes('restorePersistedCombatLogPendingEntries();'), 'ordinary pending combat logs are not restored at startup');
      assert(defaultConfigSource.includes('combatLogBatchMaxEntries: 12'), 'combat log default batch size is not bounded for low-latency flushes');
      assert(defaultConfigSource.includes('combatLogMaxPersistedEntries: 160'), 'combat log persisted-entry cap is not configured');
      assert(defaultConfigSource.includes('combatLogPendingPersistMinMs: 5000'), 'combat log failed-persist throttle is not configured');
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
      assert(reloadBody.includes('writePersistentPendingExitState(pending)'), 'leave-success confirmation reload does not persist pending exit before refresh');
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
      assert(updateBody.includes('writePersistentPendingExitState(bot.pendingExit)'), 'pending exit last result updates are not durable');
      const retryBody = functionBody(text, 'retryPendingExit');
      assert(retryBody.includes('writePersistentPendingExitState(bot.pendingExit)') && retryBody.includes('writePersistentPendingExitState(next)'), 'pending exit retry state is not durable');
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
	      assert(tickBody.includes('postExitDecisionWithoutTarget({'), 'main tick does not publish a targetless post-exit wait decision');
	      assert(defaultConfigSource.includes('exitMotionStopLockMs: 8000'), 'exit motion stop lock duration not configured');
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
      assert(combatBody.includes("combatLeaveAction('combat-hp-disadvantage-leave', baseTarget"), 'combat action does not leave on close-pressure HP disadvantage');
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
      assert(clearBody.includes('clearLoginSuppressMatching'), '403 snapshot recovery does not clear login suppress');
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
      assert(passiveSnapshotErrorBody.includes('noteLoginSnapshotProbe(false'), 'page-native snapshot failure does not reset login-point safety probe');
      assert(passiveSnapshotObserverBody.includes('window.Response') && passiveSnapshotObserverBody.includes('Response.prototype'), 'page-native snapshot observer does not inspect parsed fetch responses passively');
      assert(passiveSnapshotObserverBody.includes('originalResponseJson') && passiveSnapshotObserverBody.includes('originalResponseText'), 'page-native snapshot observer does not hook response body parsing');
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
      const triggerBody = functionBody(text, 'startExitAudit');
      assert(triggerBody.includes('resetLoginSnapshotGate') && triggerBody.includes("'exit-trigger:'"), 'exit trigger does not reset login snapshot gate');
      assert(triggerBody.includes('loginPointSafetyExitSelfForDetail(detail, meta, bot.lastSelf)'), 'exit trigger does not pass self HP into login-point safety reset');
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
      assert(takeoverBody.includes('enemyReloginHoldRemainingMs()') && takeoverBody.includes('offlineReloginHoldRemainingMs()'), 'live session takeover does not block active relogin holds');
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
      const body = functionBody(text, 'setOfflineLeaveSuppress');
      assert(
        body.includes('if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now()))'),
        'offline zero-hold path still depends on unsafe-delay classification'
      );
      assert(body.includes('const unsafeOfflineExit = offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)'), 'offline zero-hold path does not preserve unsafe classification');
      assert(body.includes('detail.safeReloginAllowed = !unsafeOfflineExit'), 'safe offline relogin marker is not limited to safe exits');
      assert(body.includes('if (unsafeOfflineExit) detail.defensiveReloginDelaySkipped = true'), 'unsafe offline zero-hold path is not marked');
      assert(body.includes('writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail)'), 'safe offline path does not preserve last exit detail');
      assert(body.includes('return 0'), 'safe offline path does not return without suppress');
    });
    check(`${file} clears stale enemy relogin hold after online recovery`, () => {
      const clearBody = functionBody(text, 'clearEnemyReloginHold');
      assert(clearBody.includes('bot.pursuitReloginUntil = 0'), 'enemy online recovery does not clear enemy hold until');
      assert(clearBody.includes('bot.lastEnemyLeaveWaitMs = 0'), 'enemy online recovery does not clear stale wait duration');
      assert(clearBody.includes('clearPersistentExitState(ENEMY_LEAVE_STATE_KEY)'), 'enemy online recovery does not clear persistent hold state');
      assert(clearBody.includes('clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i)'), 'enemy online recovery does not clear matching login suppress');
      const manualBody = functionBody(text, 'clearCurrentReloginHold');
      assert(manualBody.includes('bot.lastEnemyLeaveWaitMs = 0'), 'manual login hold clear leaves stale enemy wait duration');
      assert(manualBody.includes('bot.lastOfflineLeaveWaitMs = 0'), 'manual login hold clear leaves stale offline wait duration');
      assert(text.includes("clearEnemyReloginHold('online self restored during enemy hold')"), 'main tick does not clear stale enemy hold after online recovery');
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
    assert(sourceRuntimeText.indexOf('const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoin') > 0 && sourceRuntimeText.indexOf('const dailyStaminaFinalCoin = pickNearestDailyStaminaFinalCoin') < sourceRuntimeText.indexOf('const localRealtimeCoin = pickRealtimeLocalCoin'), 'daily stamina final-run does not run before ordinary ROI opportunity selection');
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
    assert(strategyCoinDiagnosticsSource.includes("reason: 'snapshot-only'"), 'strategy snapshot-only coin diagnostics not exposed');
    assert(generatedRuntimeSource.includes('function buildCoinDiagnostics'), 'generated runtime does not inline coin diagnostics builder');
    assert(generatedRuntimeSource.includes('function addCoinFilterDiagnostic'), 'generated runtime does not inline coin filter diagnostic recorder');
    assert(generatedRuntimeSource.includes("reason: 'snapshot-only'"), 'generated runtime snapshot-only coin diagnostics not exposed');
    assert(sourceRuntimeText.includes('buildCoinDiagnostics.toString()'), 'coin diagnostics builder is not injected from module');
    assert(sourceRuntimeText.includes('function recordCoinFilterDiagnostic'), 'coin filter diagnostic recorder not found');
    assert(sourceRuntimeText.includes("recordCoinFilterDiagnostic(c, 'ignored'"), 'ignored coin diagnostics not recorded');
    assert(sourceRuntimeText.includes("recordCoinFilterDiagnostic(c, 'threat-blocked'"), 'threat-blocked coin diagnostics not recorded');
    assert(sourceRuntimeText.includes("reason = 'stamina-unaffordable'") && sourceRuntimeText.includes('coinStaminaAffordableWithDiagnostic'), 'stamina-unaffordable coin diagnostics not recorded');
    assert(strategyCoinDiagnosticsSource.includes("reason: 'snapshot-only'") && generatedRuntimeSource.includes("reason: 'snapshot-only'"), 'snapshot-only coin diagnostics not exposed');
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
    assert(botSourceModule.includes("require('../strategy/coin-motion')"), 'source bot does not import coin motion strategy module');
    assert(sourceRuntimeText.includes('coinDirectionToCore.toString()'), 'source bot does not inject coin direction core');
    assert(sourceRuntimeText.includes('coinMotionMetaCore.toString()'), 'source bot does not inject coin motion metadata core');
    assert(sourceRuntimeText.includes('function coinMotionCoreOptions'), 'source bot coin motion runtime wrapper options not found');
    assert(sourceRuntimeText.includes('function applyCoinApproachLockUpdate'), 'source bot coin approach lock wrapper not found');
    assert(sourceRuntimeText.includes('coinDirectionToCore(self, target, coinMotionCoreOptions'), 'source bot coin direction wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('applyCoinApproachLockUpdate(result.lockUpdate)'), 'source bot coin direction wrapper does not apply lock updates');
    assert(sourceRuntimeText.includes('return coinMotionMetaCore(dir);'), 'source bot coin motion metadata wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes('function coinDirectionToCore'), 'generated runtime does not inline coin direction core');
    assert(generatedRuntimeSource.includes('function coinPickupPrecisionPulseMsCore'), 'generated runtime does not inline coin pickup pulse core');
    assert(generatedRuntimeSource.includes('function coinMotionCoreOptions'), 'generated runtime coin motion wrapper options not found');
    assert(generatedRuntimeSource.includes('function applyCoinApproachLockUpdate'), 'generated runtime coin approach lock wrapper not found');
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
    assert(botSourceModule.includes("require('../strategy/coin-target')"), 'source bot does not import coin target strategy module');
    assert(sourceRuntimeText.includes('coinTargetKeyCore.toString()'), 'source bot does not inject coin target key core');
    assert(sourceRuntimeText.includes('coinMatchesTrackedTargetCore.toString()'), 'source bot does not inject coin target matcher core');
    assert(sourceRuntimeText.includes('trackedCoinTargetForCollectionCore.toString()'), 'source bot does not inject tracked coin target core');
    assert(sourceRuntimeText.includes('buildNativeCoinSnapshotCore.toString()'), 'source bot does not inject native coin snapshot core');
    assert(sourceRuntimeText.includes('pointToSegmentDistanceCore.toString()'), 'source bot does not inject point-to-segment distance core');
    assert(sourceRuntimeText.includes('pickIncidentalCoinPickupsCore.toString()'), 'source bot does not inject incidental pickup core');
    assert(sourceRuntimeText.includes('snapshotCoinWorthLongTravelCore.toString()'), 'source bot does not inject snapshot coin worth core');
    assert(sourceRuntimeText.includes('snapshotCoinNavigationReasonCore.toString()'), 'source bot does not inject snapshot coin reason core');
    assert(sourceRuntimeText.includes('function coinTargetCoreOptions'), 'source bot coin target runtime wrapper options not found');
    assert(sourceRuntimeText.includes('trackedCoinTargetForCollectionCore({'), 'source bot tracked coin target wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return coinTargetKeyCore(target);'), 'source bot coin target key wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return coinMatchesTrackedTargetCore(coin, target'), 'source bot coin target matcher wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return buildNativeCoinSnapshotCore(coins'), 'source bot native coin snapshot wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickIncidentalCoinPickupsCore('), 'source bot incidental pickup wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return snapshotCoinWorthLongTravelCore(coin, members, totalAmount'), 'source bot snapshot coin worth wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('return snapshotCoinNavigationReasonCore(coin'), 'source bot snapshot coin reason wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes('function coinTargetKeyCore'), 'generated runtime does not inline coin target key core');
    assert(generatedRuntimeSource.includes('function coinMatchesTrackedTargetCore'), 'generated runtime does not inline coin target matcher core');
    assert(generatedRuntimeSource.includes('function trackedCoinTargetForCollectionCore'), 'generated runtime does not inline tracked coin target core');
    assert(generatedRuntimeSource.includes('function buildNativeCoinSnapshotCore'), 'generated runtime does not inline native coin snapshot core');
    assert(generatedRuntimeSource.includes('function pointToSegmentDistanceCore'), 'generated runtime does not inline point-to-segment distance core');
    assert(generatedRuntimeSource.includes('function pickIncidentalCoinPickupsCore'), 'generated runtime does not inline incidental pickup core');
    assert(generatedRuntimeSource.includes('function snapshotCoinWorthLongTravelCore'), 'generated runtime does not inline snapshot coin worth core');
    assert(generatedRuntimeSource.includes('function snapshotCoinNavigationReasonCore'), 'generated runtime does not inline snapshot coin reason core');
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
    assert(botSourceModule.includes("require('../strategy/coin-progress')"), 'source bot does not import coin progress strategy module');
    assert(sourceRuntimeText.includes('coinFailureIgnoreCore.toString()'), 'source bot does not inject coin failure ignore core');
    assert(sourceRuntimeText.includes('staleCoinEscapeDirectionCore.toString()'), 'source bot does not inject stale coin escape core');
    assert(sourceRuntimeText.includes('coinProgressIntentCore.toString()'), 'source bot does not inject coin progress intent core');
    assert(sourceRuntimeText.includes('coinAttemptExpiredCore.toString()'), 'source bot does not inject coin attempt expiry core');
    assert(sourceRuntimeText.includes('updateCoinAttemptCore.toString()'), 'source bot does not inject coin attempt update core');
    assert(sourceRuntimeText.includes('updateCoinProgressRecordCore.toString()'), 'source bot does not inject coin progress record core');
    assert(sourceRuntimeText.includes('buildIgnoredCoinProgressCore.toString()'), 'source bot does not inject ignored coin progress core');
    assert(sourceRuntimeText.includes('buildIgnoredCoinPatrolActionCore.toString()'), 'source bot does not inject ignored coin patrol action core');
    assert(sourceRuntimeText.includes('coinIgnoreCleanupIntentCore.toString()'), 'source bot does not inject coin ignore cleanup intent core');
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
    assert(generatedRuntimeSource.includes('function coinFailureIgnoreCore'), 'generated runtime does not inline coin failure ignore core');
    assert(generatedRuntimeSource.includes('function staleCoinEscapeDirectionCore'), 'generated runtime does not inline stale coin escape core');
    assert(generatedRuntimeSource.includes('function coinProgressIntentCore'), 'generated runtime does not inline coin progress intent core');
    assert(generatedRuntimeSource.includes('function coinAttemptExpiredCore'), 'generated runtime does not inline coin attempt expiry core');
    assert(generatedRuntimeSource.includes('function updateCoinAttemptCore'), 'generated runtime does not inline coin attempt update core');
    assert(generatedRuntimeSource.includes('function updateCoinProgressRecordCore'), 'generated runtime does not inline coin progress record core');
    assert(generatedRuntimeSource.includes('function buildIgnoredCoinProgressCore'), 'generated runtime does not inline ignored coin progress core');
    assert(generatedRuntimeSource.includes('function buildIgnoredCoinPatrolActionCore'), 'generated runtime does not inline ignored coin patrol action core');
    assert(generatedRuntimeSource.includes('function coinIgnoreCleanupIntentCore'), 'generated runtime does not inline coin ignore cleanup intent core');
  });

  check('coin route planner uses strategy module core', () => {
    assert(strategyCoinRouteSource.includes('function pickCoinRouteOpportunityCore'), 'strategy coin route picker core not found');
    assert(strategyCoinRouteSource.includes('function buildCoinRouteFromAnchorCore'), 'strategy coin route builder core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteLegClearCore'), 'strategy coin route safety core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteSkipsCloserFirstCoinCore'), 'strategy coin route closer-first core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteSkipsHeldSingleCoinCore'), 'strategy coin route held single-coin core not found');
    assert(strategyCoinRouteSource.includes('function coinRouteActionMetaCore'), 'strategy coin route action metadata core not found');
    assert(botSourceModule.includes("require('../strategy/coin-route')"), 'source bot does not import coin route strategy module');
    assert(sourceRuntimeText.includes('pickCoinRouteOpportunityCore.toString()'), 'source bot does not inject coin route picker core');
    assert(sourceRuntimeText.includes('coinRouteActionMetaCore.toString()'), 'source bot does not inject coin route action metadata core');
    assert(sourceRuntimeText.includes('coinRouteActionMetaCore(coin?.coinRoute || null, dir.distance)'), 'source bot coin action does not call route metadata core');
    assert(sourceRuntimeText.includes('function coinRouteCoreOptions'), 'source bot coin route runtime wrapper options not found');
    assert(generatedRuntimeSource.includes('function pickCoinRouteOpportunityCore'), 'generated runtime does not inline coin route picker core');
    assert(generatedRuntimeSource.includes('function coinRouteActionMetaCore'), 'generated runtime does not inline coin route action metadata core');
    assert(generatedRuntimeSource.includes('function coinRouteCoreOptions'), 'generated runtime coin route wrapper options not found');
  });

  check('opportunity choice stability uses strategy module core', () => {
    assert(strategyOpportunityChoiceSource.includes('function chooseStableOpportunityCore'), 'strategy opportunity choice stable picker core not found');
    assert(strategyOpportunityChoiceSource.includes('function applyOpportunityOscillationLockCore'), 'strategy opportunity oscillation lock core not found');
    assert(strategyOpportunityChoiceSource.includes('function opportunityMatchesChoiceCore'), 'strategy opportunity choice matcher core not found');
    assert(strategyOpportunityChoiceSource.includes('function highValueCoinHoldBlocksEnemySwitchCore'), 'strategy high-value coin hold core not found');
    assert(strategyOpportunityChoiceSource.includes('function rememberOpportunityChoiceCore'), 'strategy opportunity choice persistence core not found');
    assert(strategyOpportunityChoiceSource.includes('function buildMissingHeldOpportunityCore'), 'strategy missing-held opportunity core not found');
    assert(botSourceModule.includes("require('../strategy/opportunity-choice')"), 'source bot does not import opportunity choice strategy module');
    assert(sourceRuntimeText.includes('chooseStableOpportunityCore.toString()'), 'source bot does not inject opportunity choice stable picker core');
    assert(sourceRuntimeText.includes('rememberOpportunityChoiceCore.toString()'), 'source bot does not inject opportunity choice persistence core');
    assert(sourceRuntimeText.includes('buildMissingHeldOpportunityCore.toString()'), 'source bot does not inject missing-held opportunity core');
    assert(sourceRuntimeText.includes('buildMissingHeldOpportunityCore(bot.opportunityChoice'), 'source bot missing-held wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('function opportunityChoiceCoreOptions'), 'source bot opportunity choice runtime wrapper options not found');
    assert(sourceRuntimeText.includes('switchHoldMs: cfg.opportunitySwitchHoldMs'), 'source bot opportunity choice persistence hold config not wired');
    assert(generatedRuntimeSource.includes('function chooseStableOpportunityCore'), 'generated runtime does not inline opportunity choice stable picker core');
    assert(generatedRuntimeSource.includes('function rememberOpportunityChoiceCore'), 'generated runtime does not inline opportunity choice persistence core');
    assert(generatedRuntimeSource.includes('function buildMissingHeldOpportunityCore'), 'generated runtime does not inline missing-held opportunity core');
    assert(generatedRuntimeSource.includes('function opportunityChoiceCoreOptions'), 'generated runtime opportunity choice wrapper options not found');
  });

  check('opportunity candidate construction uses strategy module core', () => {
    assert(strategyOpportunityCandidatesSource.includes('function buildOpportunityCandidatesCore'), 'strategy opportunity candidate combiner core not found');
    assert(strategyOpportunityCandidatesSource.includes('function buildCoinOpportunityCandidatesCore'), 'strategy coin opportunity candidate core not found');
    assert(strategyOpportunityCandidatesSource.includes('function buildEnemyOpportunityCandidatesCore'), 'strategy enemy opportunity candidate core not found');
    assert(strategyOpportunityCandidatesSource.includes('function bestCoinOpportunityScoreCore'), 'strategy best coin opportunity score core not found');
    assert(strategyOpportunityCandidatesSource.includes('function opportunityValueScoreCore'), 'strategy opportunity value score core not found');
    assert(botSourceModule.includes("require('../strategy/opportunity-candidates')"), 'source bot does not import opportunity candidate strategy module');
    assert(sourceRuntimeText.includes('buildOpportunityCandidatesCore.toString()'), 'source bot does not inject opportunity candidate core');
    assert(sourceRuntimeText.includes('function opportunityCandidateCoreOptions'), 'source bot opportunity candidate runtime wrapper options not found');
    assert(generatedRuntimeSource.includes('function buildOpportunityCandidatesCore'), 'generated runtime does not inline opportunity candidate core');
    assert(generatedRuntimeSource.includes('function opportunityCandidateCoreOptions'), 'generated runtime opportunity candidate wrapper options not found');
  });

  check('post-attack drop wait uses strategy module core', () => {
    assert(strategyPostAttackDropSource.includes('function postAttackVisibleCoinExistsCore'), 'strategy post-attack visible coin core not found');
    assert(strategyPostAttackDropSource.includes('function resolvedRecentPostAttackDropsCore'), 'strategy post-attack resolved attack core not found');
    assert(strategyPostAttackDropSource.includes('function pickPostAttackDropCoinCore'), 'strategy post-attack drop coin picker core not found');
    assert(strategyPostAttackDropSource.includes('function pickPostAttackDropWaitTargetCore'), 'strategy post-attack wait picker core not found');
    assert(botSourceModule.includes("require('../strategy/post-attack-drop')"), 'source bot does not import post-attack drop strategy module');
    assert(sourceRuntimeText.includes('postAttackVisibleCoinExistsCore.toString()'), 'source bot does not inject post-attack visible coin core');
    assert(sourceRuntimeText.includes('resolvedRecentPostAttackDropsCore.toString()'), 'source bot does not inject post-attack resolved attack core');
    assert(sourceRuntimeText.includes('buildPostAttackDropCoinCandidateCore.toString()'), 'source bot does not inject post-attack drop coin metadata core');
    assert(sourceRuntimeText.includes('pickPostAttackDropCoinCore.toString()'), 'source bot does not inject post-attack drop coin picker core');
    assert(sourceRuntimeText.includes('pickPostAttackDropWaitTargetCore.toString()'), 'source bot does not inject post-attack wait picker core');
    assert(sourceRuntimeText.includes('pickPostAttackDropCoinCore(bot.attackHistory'), 'source bot post-attack drop coin wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickPostAttackDropWaitTargetCore(bot.attackHistory'), 'source bot post-attack wait wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes('function postAttackVisibleCoinExistsCore'), 'generated runtime does not inline post-attack visible coin core');
    assert(generatedRuntimeSource.includes('function pickPostAttackDropCoinCore'), 'generated runtime does not inline post-attack drop coin picker core');
    assert(generatedRuntimeSource.includes('function pickPostAttackDropWaitTargetCore'), 'generated runtime does not inline post-attack wait picker core');
  });

  check('stamina budget helpers use strategy module core', () => {
    assert(strategyStaminaBudgetSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'strategy daily stamina budget core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeBlockedStaminaOpportunityCore'), 'strategy blocked stamina summary core not found');
    assert(strategyStaminaBudgetSource.includes('function summarizeNearestCoinStaminaBudgetExitCore'), 'strategy nearest coin stamina exit core not found');
    assert(strategyStaminaBudgetSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'strategy daily final coin picker core not found');
    assert(botSourceModule.includes("require('../strategy/stamina-budget')"), 'source bot does not import stamina budget strategy module');
    assert(sourceRuntimeText.includes('dailyStaminaBudgetIsLimitingCore.toString()'), 'source bot does not inject daily stamina budget core');
    assert(sourceRuntimeText.includes('summarizeBlockedStaminaOpportunityCore.toString()'), 'source bot does not inject blocked stamina summary core');
    assert(sourceRuntimeText.includes('summarizeNearestCoinStaminaBudgetExitCore.toString()'), 'source bot does not inject nearest stamina exit core');
    assert(sourceRuntimeText.includes('pickNearestDailyStaminaFinalCoinCore.toString()'), 'source bot does not inject daily final coin picker core');
    assert(sourceRuntimeText.includes('dailyStaminaBudgetIsLimitingCore('), 'source bot daily stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeBlockedStaminaOpportunityCore(coins, targets'), 'source bot blocked stamina wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('summarizeNearestCoinStaminaBudgetExitCore(self, coins'), 'source bot nearest stamina exit wrapper does not call strategy core');
    assert(sourceRuntimeText.includes('pickNearestDailyStaminaFinalCoinCore('), 'source bot daily final coin wrapper does not call strategy core');
    assert(generatedRuntimeSource.includes('function dailyStaminaBudgetIsLimitingCore'), 'generated runtime does not inline daily stamina budget core');
    assert(generatedRuntimeSource.includes('function summarizeBlockedStaminaOpportunityCore'), 'generated runtime does not inline blocked stamina summary core');
    assert(generatedRuntimeSource.includes('function summarizeNearestCoinStaminaBudgetExitCore'), 'generated runtime does not inline nearest stamina exit core');
    assert(generatedRuntimeSource.includes('function pickNearestDailyStaminaFinalCoinCore'), 'generated runtime does not inline daily final coin picker core');
  });

  check('target switch diagnostics expose final action focus changes', () => {
    assert(sourceRuntimeText.includes('function recordActionSwitchDiagnostics'), 'target switch diagnostic wrapper not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('function recordActionSwitchDiagnosticsCore'), 'strategy target switch diagnostic core not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('function actionSwitchPairKey'), 'strategy target switch pair key helper not found');
    assert(strategyActionSwitchDiagnosticsSource.includes('targetSwitch: snapshot'), 'strategy target switch event is not attached to decisions');
    assert(generatedRuntimeSource.includes('function recordActionSwitchDiagnosticsCore'), 'generated runtime does not inline target switch diagnostic core');
    assert(generatedRuntimeSource.includes('targetSwitch: snapshot'), 'generated runtime target switch event is not attached to decisions');
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
    assert(generatedRuntimeSource.includes('function finalActionBandRank'), 'generated runtime does not inline final action priority band rank helper');
    assert(generatedRuntimeSource.includes('function applyFinalActionArbitrationCore'), 'generated runtime does not inline final action arbitration core');
    assert(generatedRuntimeSource.includes('higher-priority-band-stick'), 'final action hysteresis reason not found in generated runtime');
    assert(sourceRuntimeText.includes('action = applyFinalActionArbitration(action, source);'), 'final action path does not run arbitration before diagnostics');
    assert(sourceRuntimeText.indexOf('action = applyFinalActionArbitration(action, source);') < sourceRuntimeText.indexOf('action = recordActionSwitchDiagnostics(action, source);'), 'final action arbitration must run before target-switch diagnostics');
    assert(sourceRuntimeText.includes('finalActionArbitration: this.finalActionArbitration'), 'status does not expose final action arbitration state');
    assert(sourceRuntimeText.includes('preserved.finalActionArbitration?.lastAction'), 'runtime does not restore final action arbitration state');
    assert(sharedPreservedStateSource.includes('finalActionArbitration: previousBot?.finalActionArbitration'), 'hot-update preserved state omits final action arbitration');
    assert(sharedRuntimeDefaultsSource.includes('finalActionArbitrationHoldMs: 480'), 'final action arbitration hold default not found');
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
