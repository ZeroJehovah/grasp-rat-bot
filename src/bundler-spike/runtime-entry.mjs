'use strict';

import runtimeUtils from '../browser/runtime/runtime-utils.js';
import displayFormat from '../browser/runtime/display-format.js';
import targetWhitelist from '../browser/runtime/target-whitelist.js';
import exitSummary from '../browser/runtime/exit-summary.js';
import preservedState from '../browser/runtime/browser-preserved-state.js';
import runtimeDefaults from '../browser/runtime/runtime-defaults.js';
import actionPriority from '../browser/runtime/action-priority.js';
import actionArbitration from '../browser/runtime/action-arbitration.js';
import actionSwitchDiagnostics from '../browser/runtime/action-switch-diagnostics.js';
import coinDiagnostics from '../browser/runtime/coin-diagnostics.js';
import pageAdapter from '../browser/page-global-core.js';
import arrayCountRuntime from '../browser/runtime/array-count.js';

const SPIKE_KEY = '__graspRatBundlerSpike';
const CONFIG_KEY = '__GRASP_RAT_BUNDLER_SPIKE_CONFIG__';

function normalizeConfig(value) {
  return value && typeof value === 'object' ? value : {};
}

function helperStatus(config = {}) {
  const sampleAction = {
    kind: 'coin',
    reason: 'bundler-spike',
    target: { id: 'coin-spike', x: 100, y: 200 },
    coin: { id: 'coin-spike', amount: 3 }
  };
  const nextAction = {
    kind: 'coin',
    reason: 'bundler-spike-next',
    target: { id: 'coin-spike-next', x: 300, y: 400 },
    coin: { id: 'coin-spike-next', amount: 4 }
  };
  const switchState = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
  actionSwitchDiagnostics.recordActionSwitchDiagnosticsCore(sampleAction, switchState, { nowMs: 1000 });
  const switchResult = actionSwitchDiagnostics.recordActionSwitchDiagnosticsCore(nextAction, switchState, { nowMs: 1200 });
  const arbitrationState = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  actionArbitration.applyFinalActionArbitrationCore(sampleAction, arbitrationState, { nowMs: 1000, holdMs: 1000 });
  const arbitrationResult = actionArbitration.applyFinalActionArbitrationCore(nextAction, arbitrationState, { nowMs: 1200, holdMs: 1000 });
  const coinDiagnosticResult = coinDiagnostics.buildCoinDiagnostics({ x: 0, y: 0 }, {
    realtimeNearCoins: [{ drop_id: 'coin-spike', amount: 3, distance: 100, x: 100, y: 0, native: true }],
    realtimeCoins: [
      { drop_id: 'coin-spike', amount: 3, distance: 100, x: 100, y: 0, native: true },
      { drop_id: 'ignored-spike', amount: 1, distance: 120, x: 120, y: 0, native: true }
    ],
    realtimeGlobalCoins: [],
    realtimePatrolCoins: [],
    snapshotCoins: [{ drop_id: 'snapshot-spike', amount: 2, distance: 150, x: 150, y: 0, snapshot: true }]
  }, {
    nearDistance: 200,
    limit: 4,
    nowMs: 1000,
    ignoredCoinUntil: coin => String(coin?.drop_id || '') === 'ignored-spike' ? 1800 : 0
  });
  const names = targetWhitelist.parseTargetWhitelistNames({
    names: [' Firefox\u200e ', 'Firefox', '文月']
  }, 10);
  return {
    version: String(config.version || 'bundler-spike'),
    distance: displayFormat.formatDistance(12345),
    names,
    nameCount: arrayCountRuntime.arrayCount(names),
    actionFocus: actionPriority.actionFocusSummary(sampleAction),
    finalActionHeld: arbitrationResult.held,
    actionSwitch: switchResult.event,
    coinDiagnosticsIgnored: arrayCountRuntime.arrayCount(coinDiagnosticResult.ignoredNearCoins),
    coinDiagnosticsSnapshotOnly: arrayCountRuntime.arrayCount(coinDiagnosticResult.snapshotOnlyNearCoins),
    offlineSummary: exitSummary.offlineLeaveSummaryText('sampling outage', { samplingOutage: true }),
    preservedKills: arrayCountRuntime.arrayCount(preservedState.buildBrowserPreservedState({
      killHistory: ['a', 'b', 'c']
    }).killHistory),
    defaultStatusEvery: runtimeDefaults.buildRuntimeDefaults({ statusEvery: 0 }, false).statusEvery,
    storageProbe: pageAdapter.readPageLocalStorageJson('graspRatBundlerSpikeProbe', { ok: false }),
    json: runtimeUtils.safeStringify({
      ok: true,
      bigint: BigInt(7)
    })
  };
}

function installBundlerSpike(config = {}) {
  const installed = {
    installedAt: Date.now(),
    status() {
      return helperStatus(config);
    },
    stop(reason = 'manual') {
      this.stopped = true;
      this.stopReason = String(reason || 'manual');
      return this.status();
    }
  };
  pageAdapter.installPageGlobal(SPIKE_KEY, installed);
  return installed.status();
}

const runtimeConfig = normalizeConfig(pageAdapter.readPageGlobal(CONFIG_KEY, {}));

installBundlerSpike(runtimeConfig);

export {
  SPIKE_KEY,
  helperStatus,
  installBundlerSpike
};
