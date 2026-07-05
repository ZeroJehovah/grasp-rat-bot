#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const {
  BUNDLER_INFO,
  RUNTIME_ENTRY_LABEL,
  RUNTIME_ENTRY_POINT,
  browserRuntimeEvalSourceFor,
  bundledRemoteSourceFor,
  remoteSourceFor,
  runtimeDefineFor
} = require('./remote-bot-bundle');

const ROOT = path.resolve(__dirname, '..');
const results = [];

const OBSOLETE_BROWSER_SOURCE_FILES = [
  'src/browser/runtime-fragment-registry.js',
  'src/browser/runtime-source.js',
  'src/browser/runtime-entry-source.js'
];

const REQUIRED_DIST_TOKENS = [
  '__graspRatBot',
  'function installPageGlobal',
  'installPageGlobal(BOT_KEY, bot, pageGlobal)',
  'function createRuntimeBootstrapBindings',
  'function createRuntimeStateBindings',
  'function updateBotPanel',
  'function getNativeState',
  'function chooseAction',
  'async function tick',
  'function safeStringify',
  'function combatShootingPlan',
  'function pickCombatTarget',
  'function buildOpportunityCandidatesCore',
  'function applyFinalActionArbitrationCore',
  'function recordActionSwitchDiagnosticsCore'
];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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

function extractSingle(text, re, label) {
  const match = String(text || '').match(re);
  assert(match && match[1], `${label} missing`);
  return String(match[1]);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function sourceGenerationFiles() {
  return fs.readdirSync(path.join(ROOT, 'src', 'browser'))
    .filter(name => name.endsWith('source.js') || name === 'runtime-fragment-registry.js')
    .map(name => `src/browser/${name}`)
    .sort();
}

function runtimeModuleFiles() {
  return fs.readdirSync(path.join(ROOT, 'src', 'browser', 'runtime'))
    .filter(name => name.endsWith('.js'))
    .map(name => `src/browser/runtime/${name}`)
    .sort();
}

async function buildEntryMetafile(manifest) {
  return esbuild.build({
    entryPoints: [RUNTIME_ENTRY_POINT],
    bundle: true,
    format: BUNDLER_INFO.format,
    platform: BUNDLER_INFO.platform,
    target: [BUNDLER_INFO.target],
    define: runtimeDefineFor({
      statusEvery: Number(manifest.statusEvery) === 0 ? 0 : Number(manifest.statusEvery || 1000),
      version: String(manifest.version || '')
    }),
    metafile: true,
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    write: false
  });
}

async function main() {
  const manifest = readJson('dist/manifest.json');
  const distSource = readText('dist/grasp-rat-remote-bot.js');
  const sourceBot = readText('grasp-rat-bot.js');
  const remoteBundleSource = readText('scripts/remote-bot-bundle.js');
  const buildRemoteSource = readText('scripts/build-remote-bot.js');
  const remoteBundledBuildSource = readText('scripts/build-remote-bot-bundled.js');
  const runtimeEntrySource = readText(RUNTIME_ENTRY_LABEL);
  const runtimeShellSource = readText('src/browser/runtime/runtime-shell.js');
  const runtimeBotStateSource = readText('src/browser/runtime/runtime-bot-state.js');
  const runtimeTargetWhitelistSource = readText('src/browser/runtime/target-whitelist.js');
  const runtimeStaminaStatusSource = readText('src/browser/runtime/stamina-status.js');
  const runtimeTargetOverlaySource = readText('src/browser/runtime/target-overlay.js');
  const runtimeStatusPanelSource = readText('src/browser/runtime/status-panel.js');
  const runtimeCombatLogSource = readText('src/browser/runtime/combat-log-runtime.js');
  const runtimeImportantLoggingSource = readText('src/browser/runtime/important-logging-runtime.js');
  const runtimeTickSafetySource = readText('src/browser/runtime/tick-safety.js');
  const runtimeControlFlowSource = readText('src/browser/runtime/control-flow-runtime.js');
  const runtimeNativeStateSource = readText('src/browser/runtime/native-state-runtime.js');
  const runtimeProfitSource = readText('src/browser/runtime/profit-runtime.js');
  const userscriptText = readText('userscript/grasp-rat-bootstrap.user.js');
  const extensionBootstrapText = readText('extension/page-bootstrap.js');
  const extensionManifest = readJson('extension/manifest.json');
  const generatedBuild = await bundledRemoteSourceFor({
    statusEvery: Number(manifest.statusEvery) === 0 ? 0 : Number(manifest.statusEvery || 1000),
    version: String(manifest.version || '')
  });
  const generatedEvalSource = await browserRuntimeEvalSourceFor({
    dryRun: true,
    once: true,
    statusEvery: 0,
    version: String(manifest.version || '')
  });
  const generatedHash = sha256Hex(generatedBuild.bundledSource);
  const distHash = sha256Hex(distSource);
  const entryMetafileBuild = await buildEntryMetafile(manifest);
  const entryInputs = new Set(Object.keys(entryMetafileBuild.metafile.inputs));

  check('manifest version is a bootstrap release', () => {
    assert(/^bootstrap-\d+\.\d+\.\d+$/.test(String(manifest.version || '')), `unexpected version ${manifest.version || '(empty)'}`);
    return manifest.version;
  });

  check('manifest sha256 matches dist remote bot', () => {
    assert(String(manifest.sha256 || '') === distHash, `manifest=${manifest.sha256 || '(empty)'} dist=${distHash}`);
    return distHash;
  });

  check('dist remote bot is generated from current runtime entry', () => {
    assert(generatedBuild.bundledSource === distSource, `generated hash ${generatedHash} differs from dist hash ${distHash}`);
    assert(String(manifest.sha256 || '') === generatedHash, `manifest=${manifest.sha256 || '(empty)'} generated=${generatedHash}`);
    return `${manifest.version} ${generatedHash}`;
  });

  check('production manifest records direct runtime-entry bundling', () => {
    assert(manifest.production === true, 'production manifest does not mark itself as production');
    assert(manifest.bundler?.name === 'esbuild', 'manifest does not record esbuild');
    assert(manifest.bundler?.mode === 'production-runtime-entry', `unexpected bundler mode ${manifest.bundler?.mode || '(empty)'}`);
    assert(manifest.bundler?.entry === RUNTIME_ENTRY_LABEL, `unexpected bundler entry ${manifest.bundler?.entry || '(empty)'}`);
    assert(manifest.bundler?.directSha256 === generatedBuild.directSha256, `direct source hash mismatch: manifest=${manifest.bundler?.directSha256 || '(empty)'} generated=${generatedBuild.directSha256}`);
    assert(manifest.bundler?.format === BUNDLER_INFO.format, 'manifest bundler format mismatch');
    assert(manifest.bundler?.platform === BUNDLER_INFO.platform, 'manifest bundler platform mismatch');
    assert(manifest.bundler?.target === BUNDLER_INFO.target, 'manifest bundler target mismatch');
    return manifest.bundler.directSha256;
  });

  check('runtime entry is executable code, not a source-fragment adapter', () => {
    assert(runtimeEntrySource.includes('const __graspRatRuntimeStartup = (() => {'), 'runtime entry does not execute the browser startup IIFE');
    assert(runtimeEntrySource.includes('createRuntimeShellContext(__GRASP_RAT_RUNTIME_CONFIG__'), 'runtime entry does not pass build-time runtime config into the shell context');
    assert(runtimeEntrySource.includes("require('./runtime/runtime-shell')"), 'runtime entry does not import the runtime shell module');
    assert(runtimeEntrySource.includes("require('./runtime/runtime-bot-state')"), 'runtime entry does not import the runtime bot-state module');
    assert(runtimeEntrySource.includes('...createRuntimeBotState({'), 'runtime entry does not create bot state through the extracted module');
    assert(runtimeEntrySource.includes('module.exports.default = __graspRatRuntimeStartup'), 'runtime entry does not expose startup result for local eval');
    assert(!runtimeEntrySource.includes("require('./runtime/runtime-bootstrap-bindings')"), 'runtime entry still imports bootstrap bindings directly');
    assert(!runtimeEntrySource.includes("require('./runtime/runtime-state-bindings')"), 'runtime entry still imports state bindings directly');
    assert(!runtimeEntrySource.includes('ignoredCoins: new Map(restoredFailures'), 'runtime entry still owns bot-state coin failure initialization');
    assert(!runtimeEntrySource.includes("require('./src/browser/runtime/"), 'runtime entry still uses virtual-root runtime helper paths');
    assert(!/function\s+[A-Za-z0-9_$]*(?:InlineSource|RuntimeSource|PreludeSource)\s*\(/.test(runtimeEntrySource), 'runtime entry still declares obsolete source factory functions');
    assert(!runtimeEntrySource.includes('browserRuntimeFragmentEntries'), 'runtime entry still references the fragment registry');
    assert(!runtimeEntrySource.includes('renderRuntimeFragments'), 'runtime entry still renders source fragments');
  });

  check('runtime shell owns bootstrap, state binding, and bot-state setup', () => {
    assert(runtimeShellSource.includes("require('./runtime-bootstrap-bindings')"), 'runtime shell does not import bootstrap bindings');
    assert(runtimeShellSource.includes("require('./runtime-state-bindings')"), 'runtime shell does not import state bindings');
    assert(runtimeShellSource.includes('createRuntimeBootstrapBindings(baseConfig, options)'), 'runtime shell does not create bootstrap bindings from the injected config');
    assert(runtimeShellSource.includes('createRuntimeStateBindings({'), 'runtime shell does not create state bindings');
    assert(runtimeShellSource.includes('botStatusCores'), 'runtime shell does not expose bot status core helpers');
    assert(runtimeBotStateSource.includes('function createRuntimeBotState'), 'runtime bot-state module does not expose createRuntimeBotState');
    assert(runtimeBotStateSource.includes('running: true'), 'runtime bot-state module does not own base running state');
    assert(runtimeBotStateSource.includes('combatLogging: {'), 'runtime bot-state module does not own combat logging state initialization');
    assert(runtimeBotStateSource.includes('ignoredCoins: new Map(restoredFailures'), 'runtime bot-state module does not own restored coin failure initialization');
  });

  check('ui status runtime modules own whitelist stamina overlay and panel bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/target-whitelist')"), 'runtime entry does not import target whitelist runtime module');
    assert(runtimeEntrySource.includes('createTargetWhitelistRuntime({'), 'runtime entry does not create target whitelist runtime bindings');
    assert(runtimeEntrySource.includes("require('./runtime/stamina-status')"), 'runtime entry does not import stamina status runtime module');
    assert(runtimeEntrySource.includes('createStaminaStatusRuntime({'), 'runtime entry does not create stamina status runtime bindings');
    assert(runtimeEntrySource.includes("require('./runtime/target-overlay')"), 'runtime entry does not import target overlay runtime module');
    assert(runtimeEntrySource.includes('createTargetOverlayRuntime({'), 'runtime entry does not create target overlay runtime bindings');
    assert(runtimeEntrySource.includes("require('./runtime/status-panel')"), 'runtime entry does not import status panel runtime module');
    assert(runtimeEntrySource.includes('createStatusPanelRuntime({'), 'runtime entry does not create status panel runtime bindings');
    assert(!/function\s+targetWhitelistFetchUrl\s*\(/.test(runtimeEntrySource), 'runtime entry still owns target whitelist URL cache-busting');
    assert(!/function\s+summarizeStamina\s*\(/.test(runtimeEntrySource), 'runtime entry still owns stamina summary body');
    assert(!/function\s+renderTargetOverlay\s*\(/.test(runtimeEntrySource), 'runtime entry still owns target overlay renderer');
    assert(!/function\s+targetOverlayWorldPoint\s*\(/.test(runtimeEntrySource), 'runtime entry still owns target overlay coordinate extraction');
    assert(!/function\s+formatStaminaDisplay\s*\(/.test(runtimeEntrySource), 'runtime entry still owns status panel stamina formatter');
    assert(!/function\s+updateBotPanel\s*\(/.test(runtimeEntrySource), 'runtime entry still owns status panel renderer');
    assert(runtimeTargetWhitelistSource.includes('function createTargetWhitelistRuntime'), 'target whitelist runtime factory missing');
    assert(runtimeTargetWhitelistSource.includes('async function refreshTargetWhitelist'), 'target whitelist refresh body missing from module');
    assert(runtimeStaminaStatusSource.includes('function createStaminaStatusRuntime'), 'stamina status runtime factory missing');
    assert(runtimeStaminaStatusSource.includes('function summarizeStamina'), 'stamina summary body missing from module');
    assert(runtimeTargetOverlaySource.includes('function createTargetOverlayRuntime'), 'target overlay runtime factory missing');
    assert(runtimeTargetOverlaySource.includes('function renderTargetOverlay'), 'target overlay renderer missing from module');
    assert(runtimeTargetOverlaySource.includes('function targetOverlayLoginPointState'), 'target overlay login-point state body missing from module');
    assert(runtimeStatusPanelSource.includes('function createStatusPanelRuntime'), 'status panel runtime factory missing');
    assert(runtimeStatusPanelSource.includes('function updateBotPanel'), 'status panel renderer missing from module');
    assert(runtimeStatusPanelSource.includes('function reasonText'), 'status reason text formatter missing from module');
  });

  check('logging history runtime modules own combat logs important logs and tick safety', () => {
    assert(runtimeEntrySource.includes("require('./runtime/combat-log-runtime')"), 'runtime entry does not import combat log runtime module');
    assert(runtimeEntrySource.includes('createCombatLogRuntime({'), 'runtime entry does not create combat log runtime bindings');
    assert(runtimeEntrySource.includes("require('./runtime/important-logging-runtime')"), 'runtime entry does not import important logging runtime module');
    assert(runtimeEntrySource.includes('createImportantLoggingRuntime({'), 'runtime entry does not create important logging runtime bindings');
    assert(runtimeEntrySource.includes("require('./runtime/tick-safety')"), 'runtime entry does not import tick safety runtime module');
    assert(runtimeEntrySource.includes('createTickSafetyRuntime({'), 'runtime entry does not create tick safety runtime bindings');
    assert(!/function\s+combatLogEntryFailureKey\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat log entry failure keys');
    assert(!/function\s+recordCombatLogTick\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat log tick recording');
    assert(!/function\s+importantLogDay\s*\(/.test(runtimeEntrySource), 'runtime entry still owns important log store helpers');
    assert(!/function\s+recordImportantCombatTick\s*\(/.test(runtimeEntrySource), 'runtime entry still owns active combat summary ticks');
    assert(!/function\s+recordKillHistoryItem\s*\(/.test(runtimeEntrySource), 'runtime entry still owns kill history attribution');
    assert(!/function\s+updateKillHistory\s*\(/.test(runtimeEntrySource), 'runtime entry still owns chat kill history updates');
    assert(!/function\s+recordUnhandledTickError\s*\(/.test(runtimeEntrySource), 'runtime entry still owns tick error recording');
    assert(!/function\s+runTickSafely\s*\(/.test(runtimeEntrySource), 'runtime entry still owns tick safety wrapper');
    assert(runtimeCombatLogSource.includes('function createCombatLogRuntime'), 'combat log runtime factory missing');
    assert(runtimeCombatLogSource.includes('function recordCombatLogTick'), 'combat log tick body missing from module');
    assert(runtimeCombatLogSource.includes('function recordExitAuditEvent'), 'exit audit logging body missing from module');
    assert(runtimeImportantLoggingSource.includes('function createImportantLoggingRuntime'), 'important logging runtime factory missing');
    assert(runtimeImportantLoggingSource.includes('function recordImportantCombatTick'), 'important combat summary body missing from module');
    assert(runtimeImportantLoggingSource.includes('function recordKillHistoryItem'), 'kill history attribution body missing from module');
    assert(runtimeImportantLoggingSource.includes('function updateKillHistory'), 'chat kill history body missing from module');
    assert(runtimeTickSafetySource.includes('function createTickSafetyRuntime'), 'tick safety runtime factory missing');
    assert(runtimeTickSafetySource.includes('function runTickSafely'), 'tick safety wrapper missing from module');
    assert(runtimeTickSafetySource.includes('function runCallbackSafely'), 'callback safety wrapper missing from module');
  });

  check('control flow runtime owns login exit pending exit and leave flow bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/control-flow-runtime')"), 'runtime entry does not import control flow runtime module');
    assert(runtimeEntrySource.includes('createControlFlowRuntime({'), 'runtime entry does not create control flow runtime bindings');
    assert(!/function\s+requestReload\s*\(/.test(runtimeEntrySource), 'runtime entry still owns reload request body');
    assert(!/function\s+handlePendingExit\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pending exit body');
    assert(!/async\s+function\s+maybeStartAutoLogin\s*\(/.test(runtimeEntrySource), 'runtime entry still owns auto-login body');
    assert(!/async\s+function\s+leaveOffline\s*\(/.test(runtimeEntrySource), 'runtime entry still owns offline leave body');
    assert(!/function\s+loginPointSafetyStatus\s*\(/.test(runtimeEntrySource), 'runtime entry still owns login-point safety body');
    assert(!/function\s+updatePursuitTracking\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pursuit tracking body');
    assert(!/async\s+function\s+issueLeaveCommand\s*\(/.test(runtimeEntrySource), 'runtime entry still owns leave command body');
    assert(runtimeControlFlowSource.includes('function createControlFlowRuntime'), 'control flow runtime factory missing');
    assert(runtimeControlFlowSource.includes('function requestReload'), 'reload request body missing from control flow module');
    assert(runtimeControlFlowSource.includes('async function handlePendingExit'), 'pending exit body missing from control flow module');
    assert(runtimeControlFlowSource.includes('async function maybeStartAutoLogin'), 'auto-login body missing from control flow module');
    assert(runtimeControlFlowSource.includes('async function leaveOffline'), 'offline leave body missing from control flow module');
    assert(runtimeControlFlowSource.includes('function loginPointSafetyStatus'), 'login-point safety body missing from control flow module');
    assert(runtimeControlFlowSource.includes('function updatePursuitTracking'), 'pursuit tracking body missing from control flow module');
    assert(runtimeControlFlowSource.includes('async function issueLeaveCommand'), 'leave command body missing from control flow module');
  });

  check('native state runtime owns snapshot state transport session and network bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/native-state-runtime')"), 'runtime entry does not import native state runtime module');
    assert(runtimeEntrySource.includes('createNativeStateRuntime({'), 'runtime entry does not create native state runtime bindings');
    assert(!/function\s+installPageNativeSnapshotObserver\s*\(/.test(runtimeEntrySource), 'runtime entry still owns page-native snapshot observer');
    assert(!/function\s+getNativeState\s*\(/.test(runtimeEntrySource), 'runtime entry still owns native state access');
    assert(!/function\s+getNativeControl\s*\(/.test(runtimeEntrySource), 'runtime entry still owns native control access');
    assert(!/function\s+getCoins\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin normalization/merge');
    assert(!/function\s+getBullets\s*\(/.test(runtimeEntrySource), 'runtime entry still owns bullet normalization/merge');
    assert(!/function\s+summarizeSessionStats\s*\(/.test(runtimeEntrySource), 'runtime entry still owns session summary body');
    assert(!/function\s+summarizeNetworkQuality\s*\(/.test(runtimeEntrySource), 'runtime entry still owns network quality summary body');
    assert(!/async\s+function\s+refreshGlobalState\s*\(/.test(runtimeEntrySource), 'runtime entry still owns global state refresh body');
    assert(!/function\s+stopMotionSafely\s*\(/.test(runtimeEntrySource), 'runtime entry still owns safe stop body');
    assert(!/function\s+sendActionVelocity\s*\(/.test(runtimeEntrySource), 'runtime entry still owns action velocity body');
    assert(!/function\s+shootAt\s*\(/.test(runtimeEntrySource), 'runtime entry still owns shoot transport body');
    assert(runtimeNativeStateSource.includes('function createNativeStateRuntime'), 'native state runtime factory missing');
    assert(runtimeNativeStateSource.includes('function installPageNativeSnapshotObserver'), 'page-native snapshot observer missing from native state module');
    assert(runtimeNativeStateSource.includes('function getNativeState'), 'native state access body missing from native state module');
    assert(runtimeNativeStateSource.includes('function getNativeControl'), 'native control access body missing from native state module');
    assert(runtimeNativeStateSource.includes('function getCoins'), 'coin normalization/merge body missing from native state module');
    assert(runtimeNativeStateSource.includes('function getBullets'), 'bullet normalization/merge body missing from native state module');
    assert(runtimeNativeStateSource.includes('function summarizeSessionStats'), 'session summary body missing from native state module');
    assert(runtimeNativeStateSource.includes('function summarizeNetworkQuality'), 'network quality summary body missing from native state module');
    assert(runtimeNativeStateSource.includes('async function refreshGlobalState'), 'global state refresh body missing from native state module');
    assert(runtimeNativeStateSource.includes('function stopMotionSafely'), 'safe stop body missing from native state module');
    assert(runtimeNativeStateSource.includes('function sendActionVelocity'), 'action velocity body missing from native state module');
    assert(runtimeNativeStateSource.includes('function shootAt'), 'shoot transport body missing from native state module');
  });

  check('profit runtime owns coin opportunity progress and arbitration bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/profit-runtime')"), 'runtime entry does not import profit runtime module');
    assert(runtimeEntrySource.includes('createProfitRuntime({'), 'runtime entry does not create profit runtime bindings');
    assert(!/function\s+coinThreatDangerRadius\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin threat radius body');
    assert(!/function\s+safeCoinCandidates\s*\(/.test(runtimeEntrySource), 'runtime entry still owns safe coin candidate body');
    assert(!/function\s+pickRealtimeLocalCoin\s*\(/.test(runtimeEntrySource), 'runtime entry still owns realtime local coin picker');
    assert(!/function\s+pickCoinField\s*\(/.test(runtimeEntrySource), 'runtime entry still owns field coin picker');
    assert(!/function\s+scoreCoinOpportunity\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin opportunity scoring');
    assert(!/function\s+scoreEnemyOpportunity\s*\(/.test(runtimeEntrySource), 'runtime entry still owns enemy opportunity scoring');
    assert(!/function\s+buildCoinAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin action builder');
    assert(!/function\s+buildEnemyAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns enemy action builder');
    assert(!/function\s+markCoinCollected\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin collection tracking');
    assert(!/function\s+coinProgressCoreOptions\s*\(/.test(runtimeEntrySource), 'runtime entry still owns coin progress options');
    assert(!/const\s+progressAttemptResult\s*=/.test(runtimeEntrySource), 'runtime entry still owns coin progress update state machine');
    assert(!/function\s+ensureFinalActionArbitration\s*\(/.test(runtimeEntrySource), 'runtime entry still owns final action arbitration state');
    assert(!/applyFinalActionArbitrationCore\s*\(\s*action\s*,/.test(runtimeEntrySource), 'runtime entry still applies final action arbitration directly');
    assert(!/recordActionSwitchDiagnosticsCore\s*\(\s*action\s*,/.test(runtimeEntrySource), 'runtime entry still records target-switch diagnostics directly');
    assert(runtimeProfitSource.includes('function createProfitRuntime'), 'profit runtime factory missing');
    assert(runtimeProfitSource.includes('function coinThreatDangerRadius'), 'coin threat radius body missing from profit module');
    assert(runtimeProfitSource.includes('function safeCoinCandidates'), 'safe coin candidate body missing from profit module');
    assert(runtimeProfitSource.includes('function scoreCoinOpportunity'), 'coin opportunity scoring missing from profit module');
    assert(runtimeProfitSource.includes('function scoreEnemyOpportunity'), 'enemy opportunity scoring missing from profit module');
    assert(runtimeProfitSource.includes('function buildCoinAction'), 'coin action builder missing from profit module');
    assert(runtimeProfitSource.includes('function buildEnemyAction'), 'enemy action builder missing from profit module');
    assert(runtimeProfitSource.includes('function markCoinCollected'), 'coin collection tracking missing from profit module');
    assert(runtimeProfitSource.includes('function coinProgressCoreOptions'), 'coin progress options missing from profit module');
    assert(runtimeProfitSource.includes('function applyCoinProgressAction'), 'coin progress action state machine missing from profit module');
    assert(runtimeProfitSource.includes('function ensureFinalActionArbitration'), 'final action arbitration state missing from profit module');
    assert(runtimeProfitSource.includes('function applyFinalActionArbitration'), 'final action arbitration wrapper missing from profit module');
    assert(runtimeProfitSource.includes('function recordActionSwitchDiagnostics'), 'target-switch diagnostics wrapper missing from profit module');
  });

  check('obsolete source-fragment files are absent', () => {
    const remaining = sourceGenerationFiles();
    assert(remaining.length === 0, `obsolete browser source-generation files remain: ${remaining.join(', ')}`);
    for (const relPath of OBSOLETE_BROWSER_SOURCE_FILES) {
      assert(!fs.existsSync(path.join(ROOT, relPath)), `${relPath} still exists`);
    }
  });

  check('remote bundler uses the real runtime entry module', () => {
    assert(remoteBundleSource.includes('RUNTIME_ENTRY_POINT'), 'remote bundler does not define the runtime entry point');
    assert(remoteBundleSource.includes("entryPoints: [RUNTIME_ENTRY_POINT]"), 'remote bundler does not bundle the real entry point');
    assert(remoteBundleSource.includes('define: runtimeDefineFor(options)'), 'remote bundler does not inject runtime config with esbuild define');
    assert(remoteBundleSource.includes('function browserRuntimeConfig(options = {})'), 'remote bundler does not own runtime config normalization');
    assert(remoteBundleSource.includes('function bundleRuntimeEntry(options = {}, bundleOptions = {})'), 'remote bundler does not expose direct entry bundling');
    assert(!remoteBundleSource.includes('virtualEntryPlugin'), 'remote bundler still contains the old virtual source-entry plugin');
    assert(!remoteBundleSource.includes('VIRTUAL_ENTRY_NAMESPACE'), 'remote bundler still declares a virtual entry namespace');
    assert(!remoteBundleSource.includes("require('../src/browser/runtime-entry-source')"), 'remote bundler still imports runtime-entry-source');
    assert(!remoteBundleSource.includes("require('../src/browser/runtime-source')"), 'remote bundler still imports runtime-source');
    assert(!remoteBundleSource.includes('remoteRuntimeEntrySource'), 'remote bundler still calls source entry generation');
    assert(!remoteBundleSource.includes('runtimeEvalEntrySource'), 'remote bundler still calls eval source generation');
    assert(!remoteBundleSource.includes('stdin: {'), 'remote bundler should not feed generated source through stdin');
    assert(buildRemoteSource.includes("mode: 'production-runtime-entry'"), 'production build does not record the direct runtime-entry mode');
    assert(remoteBundledBuildSource.includes("mode: 'runtime-entry-candidate'"), 'candidate build does not record the direct runtime-entry mode');
  });

  check('local CDP and print-source use the bundled runtime entry', () => {
    assert(sourceBot.includes("require('./scripts/remote-bot-bundle')"), 'main bot does not import the shared remote bundler');
    assert(sourceBot.includes('await browserRuntimeEvalSourceFor({'), 'main bot does not await the runtime eval bundle');
    assert(!sourceBot.includes("require('./src/browser/runtime-source')"), 'main bot still imports runtime-source');
    assert(generatedEvalSource.includes('__graspRatBotRuntimeEvalBundle'), 'eval source does not contain the eval bundle wrapper');
    assert(generatedEvalSource.includes('return __graspRatBotRuntimeEvalBundle.default || __graspRatBotRuntimeEvalBundle;'), 'eval source does not return the startup result');
    assert(!/require\(['"]\.\.?\//.test(generatedEvalSource), 'eval source contains unresolved relative require()');
    assert(!/\bfrom\s+['"]\.\.?\//.test(generatedEvalSource), 'eval source contains unresolved relative import');
    new vm.Script(generatedEvalSource, { filename: 'grasp-rat-runtime-eval.generated.js' });
  });

  check('esbuild module graph contains all browser runtime modules', () => {
    const missing = runtimeModuleFiles().filter(relPath => !entryInputs.has(relPath));
    assert(missing.length === 0, `runtime modules missing from entry graph: ${missing.join(', ')}`);
    assert(entryInputs.has('src/browser/runtime-entry.js'), 'runtime entry is missing from esbuild inputs');
    assert(entryInputs.has('src/browser/page-global-core.js'), 'page-global adapter is missing from esbuild inputs');
    assert(entryInputs.has('src/shared/runtime-utils.js'), 'shared runtime utils are missing from esbuild inputs');
    return `${runtimeModuleFiles().length} runtime modules`;
  });

  check('bundled dist is browser-safe single-file output', () => {
    for (const token of REQUIRED_DIST_TOKENS) {
      assert(distSource.includes(token), `dist missing ${token}`);
    }
    assert(!distSource.includes('createRuntimeBootstrapBindings(__GRASP_RAT_RUNTIME_CONFIG__)'), 'dist still contains an unresolved runtime config call');
    assert(!/require\(['"]\.\.?\//.test(distSource), 'dist contains unresolved relative require()');
    assert(!/\bfrom\s+['"]\.\.?\//.test(distSource), 'dist contains unresolved relative import');
    new vm.Script(distSource, { filename: 'dist/grasp-rat-remote-bot.js' });
  });

  check('combat target, aim, and fire stay native/realtime-visible only', () => {
    const pickCombatTargetBody = functionBody(runtimeEntrySource, 'pickCombatTarget');
    const combatAimTargetBody = functionBody(runtimeEntrySource, 'combatAimTarget');
    const combatShootingPlanBody = functionBody(runtimeEntrySource, 'combatShootingPlan');
    assert(!/snapshot/i.test(pickCombatTargetBody), 'pickCombatTarget mentions snapshot data');
    assert(!/snapshot/i.test(combatAimTargetBody), 'combatAimTarget mentions snapshot data');
    assert(!/snapshot/i.test(combatShootingPlanBody), 'combatShootingPlan mentions snapshot data');
  });

  check('ordinary profit flow keeps visible/native priority before snapshot fallback', () => {
    const chooseActionBody = functionBody(runtimeEntrySource, 'chooseAction');
    const visibleCoinIndex = chooseActionBody.indexOf('pickHighValueVisibleCoin');
    const visibleOpportunityIndex = chooseActionBody.indexOf('const opportunityCoinGroups');
    const snapshotIndex = chooseActionBody.indexOf('snapshotCoinNavigationReasonCore');
    assert(visibleCoinIndex >= 0, 'chooseAction does not check high-value visible coins');
    assert(visibleOpportunityIndex >= 0, 'chooseAction does not build visible/native opportunity coin groups');
    assert(snapshotIndex >= 0, 'chooseAction does not retain snapshot fallback wait/report path');
    assert(visibleCoinIndex < snapshotIndex, 'snapshot fallback appears before high-value visible coin priority');
    assert(visibleOpportunityIndex < snapshotIndex, 'snapshot fallback appears before visible opportunity groups');
    assert(chooseActionBody.includes('wait-for-visible-coin-refresh'), 'visible-refresh wait fallback is missing');
  });

  check('generated direct-source hash includes runtime config and entry text', () => {
    const directSource = remoteSourceFor({
      statusEvery: Number(manifest.statusEvery) === 0 ? 0 : Number(manifest.statusEvery || 1000),
      version: String(manifest.version || '')
    });
    assert(directSource.includes(`// entry: ${RUNTIME_ENTRY_LABEL}`), 'direct source hash input does not name the entry');
    assert(directSource.includes('// runtimeConfig: '), 'direct source hash input does not include runtime config');
    assert(sha256Hex(directSource) === generatedBuild.directSha256, 'direct source hash helper mismatch');
  });

  check('userscript metadata version matches runtime constant', () => {
    const metaVersion = extractSingle(userscriptText, /^\s*\/\/\s*@version\s+([^\s]+)/m, 'userscript @version');
    const constantVersion = extractSingle(userscriptText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'userscript BOOTSTRAP_VERSION');
    assert(metaVersion === constantVersion, `metadata=${metaVersion} constant=${constantVersion}`);
    return metaVersion;
  });

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
