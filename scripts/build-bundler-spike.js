#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'bundler-spike', 'runtime-entry.mjs');

function parseArgs(args) {
  const out = {
    outFile: path.join(ROOT, 'dist', 'spikes', 'bundler-spike.js'),
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-file') out.outFile = path.resolve(args[++i] || out.outFile);
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/build-bundler-spike.js [options]

Builds a non-production esbuild IIFE spike for browser-module migration.

Options:
  --out-file <file>       Output file. Default: dist/spikes/bundler-spike.js
  --self-test             Build into a temp directory and verify the output shape
`);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function buildSpike(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    globalName: '__graspRatBundlerSpikeBundle',
    platform: 'browser',
    target: ['es2020'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent'
  });
  const source = fs.readFileSync(outFile, 'utf8');
  return {
    outFile,
    bytes: Buffer.byteLength(source),
    sha256: sha256Hex(source)
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSpikeOutput(source, globals = {}, rootSelector = context => context) {
  const context = {
    console,
    Date,
    BigInt,
    ...globals
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 1000 });
  const root = rootSelector(context);
  return root?.__graspRatBundlerSpike?.status?.();
}

async function selfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-bundler-spike-'));
  const outFile = path.join(tempRoot, 'bundler-spike.js');
  const result = await buildSpike(outFile);
  const source = fs.readFileSync(outFile, 'utf8');
  assert(source.includes('__graspRatBundlerSpike'), 'spike global key is not present');
  assert(source.includes('__graspRatBundlerSpikeBundle'), 'IIFE globalName wrapper is not present');
  assert(source.includes('function resolvePageGlobal'), 'page-global adapter was not bundled');
  assert(source.includes('function installPageGlobal'), 'page-global installer was not bundled');
  assert(source.includes('function readPageGlobal'), 'page-global reader was not bundled');
  assert(source.includes('function readPageLocalStorageJson'), 'localStorage JSON adapter was not bundled');
  assert(!/require\(['"]\.\.?\//.test(source), 'bundled browser output still contains unresolved relative require()');
  assert(!/\bfrom\s+['"]\.\.?\//.test(source), 'bundled browser output still contains unresolved relative import');
  assert(source.includes('function safeStringify'), 'shared runtime helper was not bundled');
  assert(source.includes('function formatDistance'), 'display helper was not bundled');
  assert(source.includes('function offlineLeaveSummaryText'), 'exit-summary helper was not bundled');
  assert(source.includes('function readPersistentExitStateCore'), 'persistent-exit read helper was not bundled');
  assert(source.includes('function writePersistentExitStateCore'), 'persistent-exit write helper was not bundled');
  assert(source.includes('function readPersistentLastSelfStateCore'), 'persistent-last-self read helper was not bundled');
  assert(source.includes('function writePersistentLastSelfStateCore'), 'persistent-last-self write helper was not bundled');
  assert(source.includes('function clearPersistentStorageKey'), 'persistent-clear helper was not bundled');
  assert(source.includes('function normalizePendingExitStateForStorageCore'), 'pending-exit persistence helper was not bundled');
  assert(source.includes('function refreshExitDetailCore'), 'refresh-exit-detail helper was not bundled');
  assert(source.includes('function restoredCoinFailuresCore'), 'restored coin failures helper was not bundled');
  assert(source.includes('function restoreRuntimeStateCore'), 'restored runtime state helper was not bundled');
  assert(source.includes('function normalizeLoginSnapshotGateStateCore'), 'login snapshot gate helper was not bundled');
  assert(source.includes('function recordRuntimeDiagnosticsCore'), 'runtime diagnostics helper was not bundled');
  assert(source.includes('function leaveWaitDisplayCore'), 'exit-relogin display helper was not bundled');
  assert(source.includes('function normalizeEnemyActorCore'), 'exit-relogin actor helper was not bundled');
  assert(source.includes('function readEnemyLeaveStreakCore'), 'exit-relogin streak helper was not bundled');
  assert(source.includes('function combatExitSummaryCore'), 'exit-relogin summary helper was not bundled');
  assert(source.includes('function isExitLoginSuppressReasonCore'), 'exit-relogin hold helper was not bundled');
  assert(source.includes('function enemyReloginHoldRemainingMsCore'), 'exit-relogin hold read helper was not bundled');
  assert(source.includes('function clearEnemyReloginHoldCore'), 'exit-relogin hold clear helper was not bundled');
  assert(source.includes('function buildBrowserPreservedState'), 'preserved-state helper was not bundled');
  assert(source.includes('function buildRuntimeDefaults'), 'runtime-defaults helper was not bundled');
  assert(source.includes('function actionFocusSummary'), 'strategy helper was not bundled');
  assert(source.includes('function applyFinalActionArbitrationCore'), 'action-arbitration helper was not bundled');
  assert(source.includes('function recordActionSwitchDiagnosticsCore'), 'action-switch diagnostics helper was not bundled');
  assert(source.includes('function attackWorthTakingCore'), 'attack-worth helper was not bundled');
  assert(source.includes('function exitMotionStopLockRemainingMsCore'), 'exit-motion lock helper was not bundled');
  assert(source.includes('function postExitDecisionWithoutTargetCore'), 'exit-motion decision helper was not bundled');
  assert(source.includes('function buildCoinDiagnostics'), 'coin diagnostics helper was not bundled');
  assert(source.includes('function coinDirectionToCore'), 'coin motion helper was not bundled');
  assert(source.includes('function coinTargetKeyCore'), 'coin target helper was not bundled');
  assert(source.includes('function coinFailureIgnoreCore'), 'coin progress helper was not bundled');
  assert(source.includes('function coinRouteKey'), 'coin route helper was not bundled');
  assert(source.includes('function chooseStableOpportunityCore'), 'opportunity choice helper was not bundled');
  assert(source.includes('function buildOpportunityCandidatesCore'), 'opportunity candidate helper was not bundled');
  assert(source.includes('function pickBestOpportunityCore'), 'opportunity pick helper was not bundled');
  assert(source.includes('function patrolDirectionCore'), 'patrol helper was not bundled');
  assert(source.includes('function pickPostAttackDropCoinCore'), 'post-attack drop helper was not bundled');
  assert(source.includes('function dailyStaminaBudgetIsLimitingCore'), 'stamina budget helper was not bundled');
  assert(source.includes('function calculateOpportunityROI'), 'opportunity constants helper was not bundled');
  assert(source.includes('function arrayCount'), 'browser runtime helper was not bundled');
  new vm.Script(source, { filename: outFile });
  const status = runSpikeOutput(source, {
    __GRASP_RAT_BUNDLER_SPIKE_CONFIG__: { version: 'self-test' },
    localStorage: {
      getItem(key) {
        return key === 'graspRatBundlerSpikeProbe' ? '{"ok":true,"scope":"globalThis"}' : null;
      },
      removeItem(key) {
        this.removedKey = key;
      }
    }
  });
  assert(status?.version === 'self-test', 'spike status did not read runtime config');
  assert(status.distance === '123米', 'spike did not execute bundled display helper');
  assert(Array.isArray(status.names) && status.names.length === 2, 'spike did not execute target whitelist helper');
  assert(status.nameCount === 2, 'spike did not execute browser runtime helper');
  assert(status.actionFocus?.type === 'coin', 'spike did not execute action focus helper');
  assert(status.finalActionHeld === true, 'spike did not execute final action arbitration helper');
  assert(status.actionSwitch?.type === 'target-switch', 'spike did not execute action-switch diagnostics helper');
  assert(status.attackWorthResult === true, 'spike did not execute attack-worth helper');
  assert(status.exitMotionLock === 6500, 'spike did not execute exit-motion lock helper');
  assert(status.exitMotionDecisionReason === 'previous', 'spike did not preserve exit-motion decision reason');
  assert(status.exitMotionDecisionTargetless === true, 'spike did not execute exit-motion targetless decision helper');
  assert(status.coinDiagnosticsIgnored === 1, 'spike did not execute ignored coin diagnostics helper');
  assert(status.coinDiagnosticsSnapshotOnly === 1, 'spike did not execute snapshot-only coin diagnostics helper');
  assert(status.coinMotionDirection?.axisApproach === 'x', 'spike did not execute coin motion direction helper');
  assert(status.coinMotionRouteMode === 'axis-approach-x', 'spike did not execute coin motion metadata helper');
  assert(status.coinTargetKey === 'id:target-spike', 'spike did not execute coin target key helper');
  assert(status.coinTargetSnapshotCount === 2, 'spike did not execute native coin snapshot helper');
  assert(status.coinTargetMatched === true, 'spike did not execute coin target matcher helper');
  assert(status.coinProgressIgnoreMs === 800, 'spike did not execute coin progress failure helper');
  assert(status.coinProgressAttemptId === 'progress-spike', 'spike did not execute coin progress attempt helper');
  assert(status.coinProgressIntent === true, 'spike did not execute coin progress intent helper');
  assert(status.coinRouteKey === 'route-spike', 'spike did not execute coin route key helper');
  assert(status.coinRouteLegCount === 2, 'spike did not execute coin route action metadata helper');
  assert(status.coinRouteFirstDistance === 123, 'spike did not execute coin route distance rounding helper');
  assert(status.opportunityChoiceKey === 'coin:choice-held', 'spike did not execute opportunity choice key helper');
  assert(status.opportunityChoiceHeld === true, 'spike did not execute stable opportunity hold helper');
  assert(status.opportunityChoiceHoldRemainingMs === 500, 'spike did not execute opportunity choice persistence helper');
  assert(status.opportunityClearExact === true, 'spike did not execute opportunity clear positive helper');
  assert(status.opportunityClearMismatch === false, 'spike did not execute opportunity clear mismatch helper');
  assert(status.opportunityCandidateCount === 2, 'spike did not execute opportunity candidate combiner helper');
  assert(status.opportunityCandidateCoinReason === 'candidate-coin', 'spike did not execute coin opportunity candidate helper');
  assert(status.opportunityBestCoinScore === 4, 'spike did not execute best coin opportunity score helper');
  assert(status.opportunityPickId === 'pick-coin', 'spike did not execute opportunity pick helper');
  assert(status.opportunityPickKind === 'coin', 'spike did not execute opportunity pick action builder');
  assert(status.patrolReason === 'scan-toward-distant-coin', 'spike did not execute patrol helper');
  assert(status.patrolClearHeading === false, 'spike did not preserve patrol scan heading behavior');
  assert(status.postAttackVisibleCoinExists === true, 'spike did not execute post-attack visible coin helper');
  assert(status.postAttackDropSelectedId === 'post-attack-coin', 'spike did not execute post-attack drop picker helper');
  assert(status.staminaBudgetDailyLimited === true, 'spike did not execute daily stamina budget helper');
  assert(status.staminaBudgetExitShortageMs === 50, 'spike did not execute nearest coin stamina budget helper');
  assert(status.opportunityConstantHighValue === 10, 'spike did not read opportunity constants');
  assert(status.opportunityConstantRoi === 5, 'spike did not execute opportunity constants helper');
  assert(String(status.offlineSummary || '').includes('网络采样超时'), 'spike did not execute exit-summary helper');
  assert(status.persistentLastSelfId === 'last-self-spike', 'spike did not execute persistent-last-self read helper');
  assert(status.persistentLastSelfWrite === true, 'spike did not execute persistent-last-self write helper');
  assert(status.persistentLastSelfWrittenAt === 2000, 'spike did not write persistent-last-self timestamp');
  assert(status.persistentExitReadRestored === true, 'spike did not execute persistent-exit read helper');
  assert(status.persistentExitReadReloginUntil === 0, 'spike did not clear expired persistent-exit relogin hold');
  assert(status.persistentExitWrite === true, 'spike did not execute persistent-exit write helper');
  assert(status.persistentExitWrittenReason === 'offline-leave', 'spike did not write persistent-exit reason');
  assert(status.persistentExitWrittenHoldMs === 1000, 'spike did not refresh persistent-exit hold');
  assert(status.persistentClearRemoved === true, 'spike did not execute persistent-clear helper');
  assert(status.pendingExitDisplayReason === 'display:offline summary', 'spike did not normalize pending-exit display reason');
  assert(status.pendingExitRetryMs === 450, 'spike did not fill pending-exit retry duration');
  assert(status.pendingExitReloadRestored === true, 'spike did not mark restored pending-exit reload confirmation');
  assert(status.pendingExitReloadAt === 1500, 'spike did not stamp restored pending-exit reload time');
  assert(status.pendingExitReadReason === 'stored-leave', 'spike did not read persisted pending-exit state');
  assert(status.pendingExitWrittenReason === 'offline-leave', 'spike did not write pending-exit state');
  assert(status.pendingExitChosenReason === 'stored-leave', 'spike did not choose newer pending-exit state');
  assert(status.refreshExitHoldRemainingMs === 1400, 'spike did not refresh exit hold remaining time');
  assert(status.refreshExitSummary === 'summary:stamina budget coin leave', 'spike did not refresh stamina-budget exit summary');
  assert(status.refreshExitDisplayReason === 'summary:stamina budget coin leave', 'spike did not finalize refreshed exit display reason');
  assert(status.restoredFailureCount === 2, 'spike did not filter restored near coin failures');
  assert(status.restoredFailureHardIgnoreUntil === 1600, 'spike did not extend restored hard coin failure ignore window');
  assert(status.restoredFailureStaleIgnoreUntil === 1200, 'spike did not preserve stale restored coin failure ignore window');
  assert(status.restoredRuntimeFailureCount === 2, 'spike did not restore runtime coin failures');
  assert(status.restoredRuntimeEnemyReason === 'restored:enemy-leave-key', 'spike did not restore enemy leave state');
  assert(status.restoredRuntimeOfflineReason === 'restored:offline-leave-key', 'spike did not restore offline leave state');
  assert(status.restoredRuntimePendingReason === 'stored-pending', 'spike did not restore pending exit state');
  assert(status.restoredRuntimeInitialReason === 'stored-pending', 'spike did not choose initial pending exit state');
  assert(status.restoredRuntimeInitialAt === 2100, 'spike did not preserve restored runtime state call order');
  assert(status.restoredRuntimeMarked === true, 'spike did not preserve first-load pending-exit reload marker');
  assert(status.loginSnapshotRequired === 0, 'spike did not execute login snapshot required helper');
  assert(status.loginSnapshotStreak === 3, 'spike did not round login snapshot gate streak');
  assert(status.loginSnapshotLastSampleAt === 900, 'spike did not preserve login snapshot last-sample fallback');
  assert(status.loginSnapshotResetReason === 'spike-reset', 'spike did not preserve login snapshot reset reason');
  assert(status.runtimeDiagnosticsTickMs === 12.3, 'spike did not merge runtime diagnostics values');
  assert(status.runtimeDiagnosticsSource === 'bundler-spike', 'spike did not preserve runtime diagnostics source');
  assert(status.exitReloginDisplay === '离线退出，等待3秒', 'spike did not append exit relogin wait display');
  assert(status.exitReloginSummary === '离线退出', 'spike did not preserve exit relogin summary');
  assert(status.exitReloginDisplayReason === '离线退出，等待2秒', 'spike did not finalize exit relogin display reason');
  assert(status.exitReloginActorKey === 'id:42', 'spike did not normalize exit relogin actor id');
  assert(status.exitReloginActorLabel === '追击者', 'spike did not preserve exit relogin actor label');
  assert(status.exitReloginFallbackActorKey === 'name:fallback-enemy', 'spike did not resolve exit relogin fallback actor');
  assert(status.exitReloginRepeatDelay === 5000, 'spike did not calculate exit relogin repeat delay');
  assert(status.exitReloginReadStreakCount === 1, 'spike did not read exit relogin streak');
  assert(status.exitReloginUpdatedStreakCount === 2, 'spike did not update exit relogin streak');
  assert(status.exitReloginUpdatedRepeatDelay === 2000, 'spike did not attach exit relogin repeat delay');
  assert(status.exitReloginWrittenStreakCount === 2, 'spike did not write exit relogin streak');
  assert(status.exitReloginBotStreakKey === 'id:42', 'spike did not update bot exit relogin streak');
  assert(String(status.exitReloginCombatSummary || '').includes('近身弹压'), 'spike did not execute exit relogin combat summary');
  assert(status.exitReloginCombatActionDx === 1, 'spike did not clamp exit relogin combat leave action dx');
  assert(status.exitReloginCombatActionShoot === true, 'spike did not preserve exit relogin combat leave shooting');
  assert(String(status.exitReloginPursuitSummary || '').includes('持续追击'), 'spike did not execute exit relogin pursuit summary');
  assert(String(status.exitReloginInjurySummary || '').includes('血量从90HP降到55HP'), 'spike did not execute exit relogin injury summary');
  assert(String(status.exitReloginOfflineSummary || '').includes('移动/开火结算卡死'), 'spike did not execute exit relogin offline summary');
  assert(String(status.exitReloginOfflineDisplay || '').includes('等待3秒'), 'spike did not preserve exit relogin offline display reason');
  assert(status.exitReloginHpDelayMs === 6000, 'spike did not honor exit relogin repeat minimum delay');
  assert(status.exitReloginHpDelayRepeatMinMs === 6000, 'spike did not preserve exit relogin repeat minimum metadata');
  assert(status.exitReloginSuppressMatch === true, 'spike did not execute exit relogin suppress reason matcher');
  assert(status.exitReloginUnsafeMin === 1234, 'spike did not execute exit relogin unsafe minimum delay helper');
  assert(status.exitReloginPendingReason === 'pending unsafe hostile exit', 'spike did not execute exit relogin pending suppress reason helper');
  assert(status.exitReloginBudgetHoldUntil === 4000, 'spike did not execute exit relogin stamina budget hold helper');
  assert(status.exitReloginStaminaHoldReason === 'stamina reset', 'spike did not execute exit relogin stamina hold selector');
  assert(status.exitReloginOfflineUnsafe === true, 'spike did not execute exit relogin unsafe offline delay predicate');
  assert(status.exitReloginEnemyHoldRemaining === 2000, 'spike did not execute exit relogin enemy hold reader');
  assert(status.exitReloginEnemyHoldBotUntil === 3000, 'spike did not update bot enemy relogin hold');
  assert(status.exitReloginOfflineHoldRemaining === 3500, 'spike did not execute exit relogin offline hold reader');
  assert(status.exitReloginOfflineHoldBotUntil === 4500, 'spike did not update bot offline relogin hold');
  assert(status.exitReloginClearedSuppress === true, 'spike did not execute exit relogin suppress clear helper');
  assert(status.exitReloginClearRemovedCount === 2, 'spike did not remove both exit relogin suppress keys');
  assert(status.exitReloginEnemyClearUntil === 0, 'spike did not clear enemy relogin hold');
  assert(status.exitReloginEnemyClearPendingReason === 'keep-offline', 'spike did not preserve offline pending exit during enemy hold clear');
  assert(status.exitReloginEnemyClearDetailAt === 6000, 'spike did not stamp enemy hold recovery detail');
  assert(status.exitReloginEnemyClearDetailHold === 0, 'spike did not clear enemy hold detail wait fields');
  assert(status.exitReloginEnemyClearEventCount === 7, 'spike did not execute all enemy hold clear side effects');
  assert(status.exitReloginOfflineClearUntil === 0, 'spike did not clear offline relogin hold');
  assert(status.exitReloginOfflineClearPendingReason === 'keep-enemy', 'spike did not preserve non-offline pending exit during offline hold clear');
  assert(status.exitReloginOfflineClearDetailAt === 7000, 'spike did not stamp offline hold recovery detail');
  assert(status.exitReloginOfflineClearDetailHold === 0, 'spike did not clear offline hold detail wait fields');
  assert(status.exitReloginOfflineClearEventCount === 3, 'spike did not execute all offline hold clear side effects');
  assert(status.preservedKills === 3, 'spike did not execute preserved-state helper');
  assert(status.defaultStatusEvery === 0, 'spike did not execute runtime-defaults helper');
  assert(status.storageProbe?.scope === 'globalThis', 'spike did not read globalThis localStorage through adapter');
  assert(String(status.json || '').includes('"bigint":"7"'), 'spike did not execute safeStringify helper');
  const windowRoot = {
    __GRASP_RAT_BUNDLER_SPIKE_CONFIG__: { version: 'window-self-test' },
    localStorage: {
      getItem(key) {
        return key === 'graspRatBundlerSpikeProbe' ? '{"ok":true,"scope":"window"}' : null;
      },
      removeItem(key) {
        this.removedKey = key;
      }
    }
  };
  const windowStatus = runSpikeOutput(source, { window: windowRoot }, context => context.window);
  assert(windowStatus?.version === 'window-self-test', 'spike status did not read window runtime config');
  assert(windowStatus.storageProbe?.scope === 'window', 'spike did not read window localStorage through adapter');
  assert(windowRoot.__graspRatBundlerSpike, 'spike did not install on window root');
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.selfTest
    ? await selfTest()
    : await buildSpike(options.outFile);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
