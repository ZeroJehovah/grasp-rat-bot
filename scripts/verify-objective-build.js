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
  'function createBotApiRuntime',
  'function createEntityStateRuntime',
  'function createExitDetailRuntime',
  'function createEntryGlueRuntime',
  'function createPostLoginZoomRuntime',
  'function createLoginPointSafetyRuntime',
  'function createControlLoginRuntime',
  'function createPendingExitRuntime',
  'function createClashLeaveRescueRuntime',
  'function createLeaveFlowRuntime',
  'function createNativeDataRuntime',
  'function createNativeTransportRuntime',
  'function createSessionStatsRuntime',
  'function createStallDiagnosticsRuntime',
  'function createNetworkQualityRuntime',
  'function updateBotPanel',
  'function getNativeState',
  'function createOrchestrationRuntime',
  'function chooseAction',
  'async function tick',
  'function safeStringify',
  'function createCombatRuntime',
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
  const runtimeBotApiSource = readText('src/browser/runtime/bot-api-runtime.js');
  const runtimeEntityStateSource = readText('src/browser/runtime/entity-state-runtime.js');
  const runtimeExitDetailSource = readText('src/browser/runtime/exit-detail-runtime.js');
  const runtimeEntryGlueSource = readText('src/browser/runtime/entry-glue-runtime.js');
  const runtimePostLoginZoomSource = readText('src/browser/runtime/post-login-zoom-runtime.js');
  const runtimeLoginPointSafetySource = readText('src/browser/runtime/login-point-safety-runtime.js');
  const runtimeControlLoginSource = readText('src/browser/runtime/control-login-runtime.js');
  const runtimePendingExitSource = readText('src/browser/runtime/pending-exit-runtime.js');
  const runtimeClashLeaveRescueSource = readText('src/browser/runtime/clash-leave-rescue-runtime.js');
  const runtimeLeaveFlowSource = readText('src/browser/runtime/leave-flow-runtime.js');
  const runtimeTargetWhitelistSource = readText('src/browser/runtime/target-whitelist.js');
  const runtimeStaminaStatusSource = readText('src/browser/runtime/stamina-status.js');
  const runtimeTargetOverlaySource = readText('src/browser/runtime/target-overlay.js');
  const runtimeStatusPanelSource = readText('src/browser/runtime/status-panel.js');
  const runtimeCombatLogSource = readText('src/browser/runtime/combat-log-runtime.js');
  const runtimeImportantLoggingSource = readText('src/browser/runtime/important-logging-runtime.js');
  const runtimeTickSafetySource = readText('src/browser/runtime/tick-safety.js');
  const runtimeControlFlowSource = readText('src/browser/runtime/control-flow-runtime.js');
  const runtimeNativeStateSource = readText('src/browser/runtime/native-state-runtime.js');
  const runtimeNativeDataSource = readText('src/browser/runtime/native-data-runtime.js');
  const runtimeNativeTransportSource = readText('src/browser/runtime/native-transport-runtime.js');
  const runtimeSessionStatsSource = readText('src/browser/runtime/session-stats-runtime.js');
  const runtimeStallDiagnosticsSource = readText('src/browser/runtime/stall-diagnostics-runtime.js');
  const runtimeNetworkQualitySource = readText('src/browser/runtime/network-quality-runtime.js');
  const runtimeProfitSource = readText('src/browser/runtime/profit-runtime.js');
  const runtimeCombatSource = readText('src/browser/runtime/combat-runtime.js');
  const runtimeOrchestrationSource = readText('src/browser/runtime/orchestration-runtime.js');
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
    assert(runtimeEntrySource.includes("require('./runtime/bot-api-runtime')"), 'runtime entry does not import the bot API runtime module');
    assert(runtimeEntrySource.includes("require('./runtime/entity-state-runtime')"), 'runtime entry does not import the entity-state runtime module');
    assert(runtimeEntrySource.includes("require('./runtime/exit-detail-runtime')"), 'runtime entry does not import the exit-detail runtime module');
    assert(runtimeEntrySource.includes("require('./runtime/entry-glue-runtime')"), 'runtime entry does not import the entry-glue runtime module');
    assert(runtimeEntrySource.includes('const bot = createRuntimeBotState({'), 'runtime entry does not create bot state through the extracted module');
    assert(runtimeEntrySource.includes('createBotApiRuntime({'), 'runtime entry does not install public bot APIs through the extracted module');
    assert(runtimeEntrySource.includes('createEntityStateRuntime({'), 'runtime entry does not create shared entity-state helpers through the extracted module');
    assert(runtimeEntrySource.includes('createExitDetailRuntime({'), 'runtime entry does not create exit-detail helpers through the extracted module');
    assert(runtimeEntrySource.includes('createEntryGlueRuntime({'), 'runtime entry does not create entry glue helpers through the extracted module');
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

  check('bot api runtime owns public API and status bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/bot-api-runtime')"), 'runtime entry does not import bot API runtime');
    assert(runtimeEntrySource.includes('Object.assign(bot, createBotApiRuntime({'), 'runtime entry does not assign extracted bot API methods');
    assert(!/stop\s*\(\s*reason\s*=\s*['"]manual['"]\s*\)\s*\{/.test(runtimeEntrySource), 'runtime entry still owns bot.stop body');
    assert(!/setPaused\s*\(\s*paused\s*,\s*reason\s*=\s*['"]external['"]\s*\)\s*\{/.test(runtimeEntrySource), 'runtime entry still owns bot.setPaused body');
    assert(!/configureClashLeaveRescue\s*\(\s*options\s*=\s*\{\}\s*\)\s*\{/.test(runtimeEntrySource), 'runtime entry still owns Clash rescue API body');
    assert(!/status\s*\(\s*\)\s*\{/.test(runtimeEntrySource), 'runtime entry still owns bot.status body');
    assert(!/pendingExitSummaryPending/.test(runtimeEntrySource), 'runtime entry still owns pending-exit status summary body');
    assert(runtimeBotApiSource.includes('function createBotApiRuntime'), 'bot API runtime factory missing');
    assert(runtimeBotApiSource.includes("stop(reason = 'manual')"), 'bot.stop body missing from bot API module');
    assert(runtimeBotApiSource.includes("setPaused(paused, reason = 'external')"), 'bot.setPaused body missing from bot API module');
    assert(runtimeBotApiSource.includes('configureClashLeaveRescue(options = {})'), 'Clash rescue API body missing from bot API module');
    assert(runtimeBotApiSource.includes('statusPendingExit'), 'pending-exit status helper missing from bot API module');
    assert(runtimeBotApiSource.includes('status()'), 'bot.status body missing from bot API module');
  });

  check('entity state runtime owns shared entity HP stamina and activity predicates', () => {
    assert(runtimeEntrySource.includes("require('./runtime/entity-state-runtime')"), 'runtime entry does not import entity-state runtime');
    assert(runtimeEntrySource.includes('createEntityStateRuntime({'), 'runtime entry does not create entity-state runtime helpers');
    assert(!/const\s+isInvulnerable\s*=/.test(runtimeEntrySource), 'runtime entry still owns invulnerability predicate');
    assert(!/const\s+isFiringEntity\s*=/.test(runtimeEntrySource), 'runtime entry still owns firing predicate');
    assert(!/const\s+isCurrentlyActive\s*=/.test(runtimeEntrySource), 'runtime entry still owns active predicate');
    assert(!/function\s+recentlyActionedForAfk\s*\(/.test(runtimeEntrySource), 'runtime entry still owns AFK recent-activity predicate');
    assert(!/function\s+isIdleInvulnerableTarget\s*\(/.test(runtimeEntrySource), 'runtime entry still owns idle invulnerable predicate');
    assert(!/const\s+hpValue\s*=/.test(runtimeEntrySource), 'runtime entry still owns HP value helper');
    assert(!/const\s+staminaRemaining\s*=/.test(runtimeEntrySource), 'runtime entry still owns stamina remaining helper');
    assert(!/const\s+decorateActiveThreat\s*=/.test(runtimeEntrySource), 'runtime entry still owns active threat decoration');
    assert(!/const\s+isRecovering\s*=/.test(runtimeEntrySource), 'runtime entry still owns recovery predicate');
    assert(runtimeEntityStateSource.includes('function createEntityStateRuntime'), 'entity-state runtime factory missing');
    assert(runtimeEntityStateSource.includes('const isInvulnerable ='), 'invulnerability predicate missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const isFiringEntity ='), 'firing predicate missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const isCurrentlyActive ='), 'active predicate missing from entity-state module');
    assert(runtimeEntityStateSource.includes('function recentlyActionedForAfk'), 'AFK recent-activity predicate missing from entity-state module');
    assert(runtimeEntityStateSource.includes('function isIdleInvulnerableTarget'), 'idle invulnerable predicate missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const hpValue ='), 'HP helper missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const staminaRemaining ='), 'stamina helper missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const decorateActiveThreat ='), 'active threat decoration missing from entity-state module');
    assert(runtimeEntityStateSource.includes('const isRecovering ='), 'recovery predicate missing from entity-state module');
  });

  check('exit detail and entry glue runtimes own remaining entry helpers', () => {
    assert(runtimeEntrySource.includes("require('./runtime/exit-detail-runtime')"), 'runtime entry does not import exit-detail runtime');
    assert(runtimeEntrySource.includes("require('./runtime/entry-glue-runtime')"), 'runtime entry does not import entry-glue runtime');
    assert(runtimeEntrySource.includes('createExitDetailRuntime({'), 'runtime entry does not create exit-detail runtime bindings');
    assert(runtimeEntrySource.includes('createEntryGlueRuntime({'), 'runtime entry does not create entry-glue runtime bindings');
    assert(!/function\s+activeEnemyLeaveDetail\s*\(/.test(runtimeEntrySource), 'runtime entry still owns active enemy leave detail body');
    assert(!/function\s+activeOfflineLeaveDetail\s*\(/.test(runtimeEntrySource), 'runtime entry still owns active offline leave detail body');
    assert(!/function\s+latestEnemyLeaveResult\s*\(/.test(runtimeEntrySource), 'runtime entry still owns latest enemy leave result body');
    assert(!/function\s+latestEnemyLeaveSummary\s*\(/.test(runtimeEntrySource), 'runtime entry still owns latest enemy leave summary body');
    assert(!/function\s+latestEnemyLeaveDisplayReason\s*\(/.test(runtimeEntrySource), 'runtime entry still owns latest enemy leave display reason body');
    assert(!/function\s+clearPostExitTargetState\s*\(/.test(runtimeEntrySource), 'runtime entry still owns post-exit target cleanup body');
    assert(!/function\s+readPauseReason\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pause reason body');
    assert(!/function\s+syncPausedFromPage\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pause sync body');
    assert(!/function\s+getOwnEntity\s*\(/.test(runtimeEntrySource), 'runtime entry still owns own-entity helper body');
    assert(!/function\s+logStatus\s*\(/.test(runtimeEntrySource), 'runtime entry still owns status logging body');
    assert(runtimeExitDetailSource.includes('function createExitDetailRuntime'), 'exit-detail runtime factory missing');
    assert(runtimeExitDetailSource.includes('function activeEnemyLeaveDetail'), 'active enemy leave detail missing from exit-detail module');
    assert(runtimeExitDetailSource.includes('function activeOfflineLeaveDetail'), 'active offline leave detail missing from exit-detail module');
    assert(runtimeExitDetailSource.includes('function latestEnemyLeaveResult'), 'latest enemy leave result missing from exit-detail module');
    assert(runtimeExitDetailSource.includes('function latestEnemyLeaveSummary'), 'latest enemy leave summary missing from exit-detail module');
    assert(runtimeExitDetailSource.includes('function latestEnemyLeaveDisplayReason'), 'latest enemy leave display reason missing from exit-detail module');
    assert(runtimeEntryGlueSource.includes('function createEntryGlueRuntime'), 'entry-glue runtime factory missing');
    assert(runtimeEntryGlueSource.includes('function clearPostExitTargetState'), 'post-exit target cleanup missing from entry-glue module');
    assert(runtimeEntryGlueSource.includes('function readPauseReason'), 'pause reason helper missing from entry-glue module');
    assert(runtimeEntryGlueSource.includes('function syncPausedFromPage'), 'pause sync helper missing from entry-glue module');
    assert(runtimeEntryGlueSource.includes('function getOwnEntity'), 'own-entity helper missing from entry-glue module');
    assert(runtimeEntryGlueSource.includes('function logStatus'), 'status logging helper missing from entry-glue module');
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

  check('control login gate runtimes own extracted login safety bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/control-flow-runtime')"), 'runtime entry does not import control flow runtime module');
    assert(runtimeEntrySource.includes('createControlFlowRuntime({'), 'runtime entry does not create control flow runtime bindings');
    assert(runtimeControlFlowSource.includes("require('./post-login-zoom-runtime')"), 'control flow runtime does not import post-login zoom runtime');
    assert(runtimeControlFlowSource.includes("require('./login-point-safety-runtime')"), 'control flow runtime does not import login-point safety runtime');
    assert(runtimeControlFlowSource.includes("require('./control-login-runtime')"), 'control flow runtime does not import control-login runtime');
    assert(runtimeControlFlowSource.includes('createPostLoginZoomRuntime({'), 'control flow runtime does not create post-login zoom bindings');
    assert(runtimeControlFlowSource.includes('createLoginPointSafetyRuntime({'), 'control flow runtime does not create login-point safety bindings');
    assert(runtimeControlFlowSource.includes('createControlLoginRuntime({'), 'control flow runtime does not create control-login bindings');
    assert(!/function\s+schedulePostLoginZoomOut\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns post-login zoom scheduling body');
    assert(!/function\s+noteSelfUnavailableForPostLoginZoom\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns post-login zoom self-unavailable body');
    assert(!/function\s+loginPointSafetyStatus\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login-point safety status body');
    assert(!/function\s+resetLoginPointSafetyGate\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login-point safety reset body');
    assert(!/function\s+maybeRecordLoginPoint\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login-point recording body');
    assert(!/function\s+noteLoginSnapshotProbe\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login snapshot probe body');
    assert(!/function\s+snapshotLoginGateStatus\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login snapshot gate status body');
    assert(!/function\s+loginSnapshotGateAllowsLogin\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login snapshot allow body');
    assert(!/function\s+loginSnapshotGateDisplayReason\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns login snapshot display reason body');
    assert(!/function\s+markManualLoginBypass\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns manual login bypass body');
    assert(!/function\s+manualLoginBypassActive\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns manual login bypass active body');
    assert(!/function\s+installStartLinuxDoLoginGate\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns startLinuxDoLogin gate body');
    assert(!/function\s+installNativeLoginGateInterceptors\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns native login interceptor body');
    assert(runtimePostLoginZoomSource.includes('function createPostLoginZoomRuntime'), 'post-login zoom runtime factory missing');
    assert(runtimePostLoginZoomSource.includes('function schedulePostLoginZoomOut'), 'post-login zoom scheduling body missing from module');
    assert(runtimePostLoginZoomSource.includes('function noteSelfUnavailableForPostLoginZoom'), 'post-login zoom self-unavailable body missing from module');
    assert(runtimeLoginPointSafetySource.includes('function createLoginPointSafetyRuntime'), 'login-point safety runtime factory missing');
    assert(runtimeLoginPointSafetySource.includes('function loginPointSafetyStatus'), 'login-point safety status body missing from module');
    assert(runtimeLoginPointSafetySource.includes('function resetLoginPointSafetyGate'), 'login-point safety reset body missing from module');
    assert(runtimeLoginPointSafetySource.includes('function maybeRecordLoginPoint'), 'login-point recording body missing from module');
    assert(runtimeLoginPointSafetySource.includes('function noteLoginPointSafetyProbe'), 'login-point safety probe body missing from module');
    assert(runtimeLoginPointSafetySource.includes('function inferLoginPointLoginAt'), 'login-point login-time inference missing from module');
    assert(runtimeLoginPointSafetySource.includes('loginSuppressKey'), 'login-point safety module does not receive login suppress key dependency');
    assert(runtimeControlLoginSource.includes('function createControlLoginRuntime'), 'control-login runtime factory missing');
    assert(runtimeControlLoginSource.includes('function findLoginControl'), 'login control finder missing from module');
    assert(runtimeControlLoginSource.includes('function hasLoginRequiredText'), 'login required text detector missing from module');
    assert(runtimeControlLoginSource.includes('function setLoginSuppress'), 'login suppress body missing from module');
    assert(runtimeControlLoginSource.includes('function snapshotLoginGateStatus'), 'login snapshot gate status body missing from module');
    assert(runtimeControlLoginSource.includes('function noteLoginSnapshotProbe'), 'login snapshot probe body missing from module');
    assert(runtimeControlLoginSource.includes('function ensureLoginSnapshotGate'), 'login snapshot gate ensure body missing from module');
    assert(runtimeControlLoginSource.includes('function markManualLoginBypass'), 'manual login bypass body missing from module');
    assert(runtimeControlLoginSource.includes('function installStartLinuxDoLoginGate'), 'startLinuxDoLogin gate body missing from module');
    assert(runtimeControlLoginSource.includes('function installNativeLoginGateInterceptors'), 'native login interceptor body missing from module');
  });

  check('control exit flow runtimes own extracted pending exit leave and rescue bodies', () => {
    assert(runtimeControlFlowSource.includes("require('./pending-exit-runtime')"), 'control flow runtime does not import pending-exit runtime');
    assert(runtimeControlFlowSource.includes("require('./clash-leave-rescue-runtime')"), 'control flow runtime does not import Clash leave rescue runtime');
    assert(runtimeControlFlowSource.includes("require('./leave-flow-runtime')"), 'control flow runtime does not import leave-flow runtime');
    assert(runtimeControlFlowSource.includes('createPendingExitRuntime({'), 'control flow runtime does not create pending-exit bindings');
    assert(runtimeControlFlowSource.includes('createClashLeaveRescueRuntime({'), 'control flow runtime does not create Clash leave rescue bindings');
    assert(runtimeControlFlowSource.includes('createLeaveFlowRuntime({'), 'control flow runtime does not create leave-flow bindings');
    assert(!/function\s+pendingExitSkipNewLeave\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns pending-exit skip body');
    assert(!/function\s+rememberPendingExit\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns pending-exit recording body');
    assert(!/function\s+noteLeave403SnapshotProbe\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns leave-403 snapshot probe body');
    assert(!/async\s+function\s+handlePendingExit\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns pending-exit handler body');
    assert(!/async\s+function\s+issueLeaveCommand\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns leave command body');
    assert(!/function\s+scheduleClashLeaveRescueRetry\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns Clash leave rescue retry body');
    assert(!/async\s+function\s+maybeStartAutoLogin\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns auto-login body');
    assert(!/async\s+function\s+forceLoginNow\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns force-login body');
    assert(!/async\s+function\s+leaveOffline\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns offline leave body');
    assert(!/async\s+function\s+leaveForInjury\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns injury leave body');
    assert(!/async\s+function\s+leaveForPursuit\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns pursuit leave body');
    assert(!/async\s+function\s+leaveForCombat\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns combat leave body');
    assert(!/async\s+function\s+leaveDuringEnemyHold\s*\(/.test(runtimeControlFlowSource), 'control flow runtime still owns enemy-hold leave body');
    assert(runtimePendingExitSource.includes('function createPendingExitRuntime'), 'pending-exit runtime factory missing');
    assert(runtimePendingExitSource.includes('function pendingExitSkipNewLeave'), 'pending-exit skip body missing from module');
    assert(runtimePendingExitSource.includes('function rememberPendingExit'), 'pending-exit recording body missing from module');
    assert(runtimePendingExitSource.includes('function noteLeave403SnapshotProbe'), 'leave-403 snapshot probe body missing from pending-exit module');
    assert(runtimePendingExitSource.includes('async function handlePendingExit'), 'pending-exit handler body missing from module');
    assert(runtimeClashLeaveRescueSource.includes('function createClashLeaveRescueRuntime'), 'Clash leave rescue runtime factory missing');
    assert(runtimeClashLeaveRescueSource.includes('function scheduleClashLeaveRescueRetry'), 'Clash leave rescue retry body missing from module');
    assert(runtimeClashLeaveRescueSource.includes('async function issueLeaveCommand'), 'leave command body missing from Clash leave rescue module');
    assert(runtimeLeaveFlowSource.includes('function createLeaveFlowRuntime'), 'leave-flow runtime factory missing');
    assert(runtimeLeaveFlowSource.includes('async function maybeStartAutoLogin'), 'auto-login body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function forceLoginNow'), 'force-login body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function leaveOffline'), 'offline leave body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function leaveForInjury'), 'injury leave body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function leaveForPursuit'), 'pursuit leave body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function leaveForCombat'), 'combat leave body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('async function leaveDuringEnemyHold'), 'enemy-hold leave body missing from leave-flow module');
    assert(runtimeLeaveFlowSource.includes('function updatePursuitTracking'), 'pursuit tracking body missing from leave-flow module');
  });

  check('control flow runtime owns remaining reload session and relogin gate bodies', () => {
    assert(!/function\s+requestReload\s*\(/.test(runtimeEntrySource), 'runtime entry still owns reload request body');
    assert(!/function\s+handlePendingExit\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pending exit body');
    assert(!/async\s+function\s+maybeStartAutoLogin\s*\(/.test(runtimeEntrySource), 'runtime entry still owns auto-login body');
    assert(!/async\s+function\s+leaveOffline\s*\(/.test(runtimeEntrySource), 'runtime entry still owns offline leave body');
    assert(!/function\s+updatePursuitTracking\s*\(/.test(runtimeEntrySource), 'runtime entry still owns pursuit tracking body');
    assert(!/async\s+function\s+issueLeaveCommand\s*\(/.test(runtimeEntrySource), 'runtime entry still owns leave command body');
    assert(runtimeControlFlowSource.includes('function createControlFlowRuntime'), 'control flow runtime factory missing');
    assert(runtimeControlFlowSource.includes('function requestReload'), 'reload request body missing from control flow module');
    assert(runtimeControlFlowSource.includes('function hasNativeGameSession'), 'native game-session body missing from control flow module');
    assert(runtimeControlFlowSource.includes('function summarizeReloginGateStatus'), 'relogin gate summary body missing from control flow module');
    assert(runtimeControlFlowSource.includes('function clearCurrentReloginHold'), 'manual relogin-hold clear body missing from control flow module');
  });

  check('native data and transport runtimes own extracted state transport bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/native-state-runtime')"), 'runtime entry does not import native state runtime module');
    assert(runtimeEntrySource.includes('createNativeStateRuntime({'), 'runtime entry does not create native state runtime bindings');
    assert(runtimeNativeStateSource.includes("require('./native-data-runtime')"), 'native state runtime does not import native data runtime');
    assert(runtimeNativeStateSource.includes("require('./native-transport-runtime')"), 'native state runtime does not import native transport runtime');
    assert(runtimeNativeStateSource.includes('createNativeDataRuntime({'), 'native state runtime does not create native data bindings');
    assert(runtimeNativeStateSource.includes('createNativeTransportRuntime({'), 'native state runtime does not create native transport bindings');
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
    assert(!/function\s+installPageNativeSnapshotObserver\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns page-native snapshot observer');
    assert(!/function\s+getNativeState\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns native state access');
    assert(!/function\s+getNativeControl\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns native control access');
    assert(!/function\s+getCoins\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns coin normalization/merge');
    assert(!/function\s+getBullets\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns bullet normalization/merge');
    assert(!/async\s+function\s+refreshGlobalState\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns global state refresh body');
    assert(!/function\s+stopMotionSafely\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns safe stop body');
    assert(!/function\s+sendActionVelocity\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns action velocity body');
    assert(!/function\s+shootAt\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns shoot transport body');
    assert(runtimeNativeDataSource.includes('function createNativeDataRuntime'), 'native data runtime factory missing');
    assert(runtimeNativeDataSource.includes('function installPageNativeSnapshotObserver'), 'page-native snapshot observer missing from native data module');
    assert(runtimeNativeDataSource.includes('function getNativeState'), 'native state access body missing from native data module');
    assert(runtimeNativeDataSource.includes('function getNativeControl'), 'native control access body missing from native data module');
    assert(runtimeNativeDataSource.includes('function getCoins'), 'coin normalization/merge body missing from native data module');
    assert(runtimeNativeDataSource.includes('function getBullets'), 'bullet normalization/merge body missing from native data module');
    assert(runtimeNativeDataSource.includes('async function refreshGlobalState'), 'global state refresh body missing from native data module');
    assert(runtimeNativeTransportSource.includes('function createNativeTransportRuntime'), 'native transport runtime factory missing');
    assert(runtimeNativeTransportSource.includes('function triggerNativeTick'), 'native tick trigger missing from native transport module');
    assert(runtimeNativeTransportSource.includes('function ensureNativeMessagePump'), 'native message pump missing from native transport module');
    assert(runtimeNativeTransportSource.includes('function stopMotionSafely'), 'safe stop body missing from native transport module');
    assert(runtimeNativeTransportSource.includes('function sendActionVelocity'), 'action velocity body missing from native transport module');
    assert(runtimeNativeTransportSource.includes('function shootAt'), 'shoot transport body missing from native transport module');
  });

  check('native session stall and network runtimes own extracted bodies', () => {
    assert(runtimeNativeStateSource.includes('function createNativeStateRuntime'), 'native state runtime factory missing');
    assert(runtimeNativeStateSource.includes("require('./session-stats-runtime')"), 'native state runtime does not import session stats runtime');
    assert(runtimeNativeStateSource.includes("require('./stall-diagnostics-runtime')"), 'native state runtime does not import stall diagnostics runtime');
    assert(runtimeNativeStateSource.includes("require('./network-quality-runtime')"), 'native state runtime does not import network quality runtime');
    assert(runtimeNativeStateSource.includes('createSessionStatsRuntime({'), 'native state runtime does not create session stats bindings');
    assert(runtimeNativeStateSource.includes('createStallDiagnosticsRuntime({'), 'native state runtime does not create stall diagnostics bindings');
    assert(runtimeNativeStateSource.includes('createNetworkQualityRuntime({'), 'native state runtime does not create network quality bindings');
    assert(!/function\s+summarizeServerPositionStall\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns server-position stall summary');
    assert(!/function\s+assessServerPositionStall\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns server-position stall assessment');
    assert(!/function\s+summarizeActionSettlementStall\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns action-settlement stall summary');
    assert(!/function\s+assessActionSettlementStall\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns action-settlement stall assessment');
    assert(!/function\s+summarizeSessionStats\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns session summary body');
    assert(!/function\s+summarizeTodaySessionStats\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns today-session summary body');
    assert(!/function\s+summarizeNetworkQuality\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns network quality summary body');
    assert(!/function\s+observeNativeWsFrame\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns native WS frame observation');
    assert(!/function\s+recordNetworkQualityMovementCommand\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns network quality movement command body');
    assert(!/function\s+recordNetworkQualityShot\s*\(/.test(runtimeNativeStateSource), 'native state runtime still owns network quality shot body');
    assert(runtimeSessionStatsSource.includes('function createSessionStatsRuntime'), 'session stats runtime factory missing');
    assert(runtimeSessionStatsSource.includes('function resetSessionStaminaStats'), 'session stamina reset missing from session stats module');
    assert(runtimeSessionStatsSource.includes('function updateSessionStats'), 'session update body missing from session stats module');
    assert(runtimeSessionStatsSource.includes('function summarizeSessionStats'), 'session summary body missing from session stats module');
    assert(runtimeSessionStatsSource.includes('function summarizeTodaySessionStats'), 'today-session summary body missing from session stats module');
    assert(runtimeStallDiagnosticsSource.includes('function createStallDiagnosticsRuntime'), 'stall diagnostics runtime factory missing');
    assert(runtimeStallDiagnosticsSource.includes('function summarizeServerPositionStall'), 'server-position stall summary missing from stall diagnostics module');
    assert(runtimeStallDiagnosticsSource.includes('function assessServerPositionStall'), 'server-position stall assessment missing from stall diagnostics module');
    assert(runtimeStallDiagnosticsSource.includes('function summarizeActionSettlementStall'), 'action-settlement stall summary missing from stall diagnostics module');
    assert(runtimeStallDiagnosticsSource.includes('function assessActionSettlementStall'), 'action-settlement stall assessment missing from stall diagnostics module');
    assert(runtimeNetworkQualitySource.includes('function createNetworkQualityRuntime'), 'network quality runtime factory missing');
    assert(runtimeNetworkQualitySource.includes('function summarizeNetworkQuality'), 'network quality summary body missing from network quality module');
    assert(runtimeNetworkQualitySource.includes('function observeNativeWsFrame'), 'native WS frame observation missing from network quality module');
    assert(runtimeNetworkQualitySource.includes('function recordNetworkQualityMovementCommand'), 'network quality movement command body missing from network quality module');
    assert(runtimeNetworkQualitySource.includes('function recordNetworkQualityShot'), 'network quality shot body missing from network quality module');
    assert(runtimeNetworkQualitySource.includes('function recordNetworkQualityAttackDamage'), 'network quality attack-damage body missing from network quality module');
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

  check('combat runtime owns target movement aim fire state and action bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/combat-runtime')"), 'runtime entry does not import combat runtime module');
    assert(runtimeEntrySource.includes('createCombatRuntime({'), 'runtime entry does not create combat runtime bindings');
    assert(!/function\s+rememberCombatEngagement\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat engagement body');
    assert(!/function\s+pickCombatTarget\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat target picker');
    assert(!/function\s+incomingBulletThreat\s*\(/.test(runtimeEntrySource), 'runtime entry still owns bullet threat picker');
    assert(!/function\s+combatShootingPlan\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat shooting plan');
    assert(!/function\s+combatAimTarget\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat aim target');
    assert(!/function\s+combatLeaveCoverAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat leave cover action');
    assert(!/function\s+buildCombatAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat action builder');
    assert(!/function\s+combatTickActiveFromState\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat tick active state');
    assert(!/function\s+nativeTickMinIntervalMs\s*\(/.test(runtimeEntrySource), 'runtime entry still owns native tick combat interval');
    assert(!/async\s+function\s+handleTickReentryCombatGap\s*\(/.test(runtimeEntrySource), 'runtime entry still owns combat tick reentry gap handler');
    assert(runtimeCombatSource.includes('function createCombatRuntime'), 'combat runtime factory missing');
    assert(runtimeCombatSource.includes('function rememberCombatEngagement'), 'combat engagement body missing from combat module');
    assert(runtimeCombatSource.includes('function pickCombatTarget'), 'combat target picker missing from combat module');
    assert(runtimeCombatSource.includes('function incomingBulletThreat'), 'incoming bullet threat missing from combat module');
    assert(runtimeCombatSource.includes('function combatShootingPlan'), 'combat shooting plan missing from combat module');
    assert(runtimeCombatSource.includes('function combatAimTarget'), 'combat aim target missing from combat module');
    assert(runtimeCombatSource.includes('function combatLeaveCoverAction'), 'combat leave cover action missing from combat module');
    assert(runtimeCombatSource.includes('function buildCombatAction'), 'combat action builder missing from combat module');
    assert(runtimeCombatSource.includes('function combatTickActiveFromState'), 'combat tick active state missing from combat module');
    assert(runtimeCombatSource.includes('function nativeTickMinIntervalMs'), 'native tick combat interval missing from combat module');
    assert(runtimeCombatSource.includes('async function handleTickReentryCombatGap'), 'combat tick reentry gap handler missing from combat module');
  });

  check('orchestration runtime owns classify chooseAction tick and startup bodies', () => {
    assert(runtimeEntrySource.includes("require('./runtime/orchestration-runtime')"), 'runtime entry does not import orchestration runtime module');
    assert(runtimeEntrySource.includes('createOrchestrationRuntime({'), 'runtime entry does not create orchestration runtime bindings');
    assert(runtimeEntrySource.includes('return orchestrationRuntime.startRuntime();'), 'runtime entry does not delegate startup to orchestration runtime');
    assert(!/function\s+markRecentMovement\s*\(/.test(runtimeEntrySource), 'runtime entry still owns recent movement marker');
    assert(!/function\s+returnBlockRadius\s*\(/.test(runtimeEntrySource), 'runtime entry still owns return-block radius body');
    assert(!/function\s+buildReturnBlockScanAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns return-block scan action body');
    assert(!/function\s+classify\s*\(/.test(runtimeEntrySource), 'runtime entry still owns classify body');
    assert(!/function\s+chooseAction\s*\(/.test(runtimeEntrySource), 'runtime entry still owns chooseAction body');
    assert(!/async\s+function\s+tick\s*\(/.test(runtimeEntrySource), 'runtime entry still owns tick body');
    assert(!/function\s+startRuntime\s*\(/.test(runtimeEntrySource), 'runtime entry still owns startup body');
    assert(runtimeOrchestrationSource.includes('function createOrchestrationRuntime'), 'orchestration runtime factory missing');
    assert(runtimeOrchestrationSource.includes('function markRecentMovement'), 'recent movement marker missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('function returnBlockRadius'), 'return-block radius missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('function buildReturnBlockScanAction'), 'return-block scan action missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('function classify'), 'classify body missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('function chooseAction'), 'chooseAction body missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('async function tick'), 'tick body missing from orchestration module');
    assert(runtimeOrchestrationSource.includes('function startRuntime'), 'startup body missing from orchestration module');
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
    const pickCombatTargetBody = functionBody(runtimeCombatSource, 'pickCombatTarget');
    const combatAimTargetBody = functionBody(runtimeCombatSource, 'combatAimTarget');
    const combatShootingPlanBody = functionBody(runtimeCombatSource, 'combatShootingPlan');
    assert(!/snapshot/i.test(pickCombatTargetBody), 'pickCombatTarget mentions snapshot data');
    assert(!/snapshot/i.test(combatAimTargetBody), 'combatAimTarget mentions snapshot data');
    assert(!/snapshot/i.test(combatShootingPlanBody), 'combatShootingPlan mentions snapshot data');
  });

  check('ordinary profit flow keeps visible/native priority before snapshot fallback', () => {
    const chooseActionBody = functionBody(runtimeOrchestrationSource, 'chooseAction');
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
