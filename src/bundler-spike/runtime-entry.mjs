'use strict';

import runtimeUtils from '../browser/runtime/runtime-utils.js';
import * as displayFormat from '../shared/display-format.js';
import * as targetWhitelist from '../shared/target-whitelist.js';
import * as actionPriority from '../strategy/action-priority.js';
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
  const names = targetWhitelist.parseTargetWhitelistNames({
    names: [' Firefox\u200e ', 'Firefox', '文月']
  }, 10);
  return {
    version: String(config.version || 'bundler-spike'),
    distance: displayFormat.formatDistance(12345),
    names,
    nameCount: arrayCountRuntime.arrayCount(names),
    actionFocus: actionPriority.actionFocusSummary(sampleAction),
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
