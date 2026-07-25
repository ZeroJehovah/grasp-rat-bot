'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDynamicWhitelist } = require('./dynamic-whitelist');

function battleState(options = {}) {
  const self = options.self === null
    ? null
    : { user_id: 7, x: 0, y: 0, hp: options.selfHp ?? 97 };
  const target = options.target === null
    ? null
    : { user_id: 8, name: 'friendly', x: options.targetX ?? 5000, y: 0, hp: options.targetHp ?? 100, drop: 20 };
  return {
    userId: 7,
    realtime: {
      self,
      entities: [self, target].filter(Boolean)
    }
  };
}

function createFixture(directory, name) {
  const file = path.join(directory, `${name}.json`);
  const whitelist = createDynamicWhitelist({ file, now: () => 1000 });
  whitelist.add({ userId: 8, name: 'friendly' }, 1000);
  return { file, whitelist };
}

function disableDirectly(whitelist) {
  const result = whitelist.observeDamage({ userId: 8 }, battleState(), { atMs: 2000, hpLost: 3 });
  assert.strictEqual(result.newlyDisabled, true);
  assert.strictEqual(whitelist.isWhitelistedTarget({ userId: 8 }), false);
}

function runDynamicWhitelistSelfTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-dynamic-whitelist-self-test-'));
  const cases = [];
  try {
    {
      const { file, whitelist } = createFixture(directory, 'persistence');
      disableDirectly(whitelist);
      const status = whitelist.status();
      const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.strictEqual(typeof whitelist.remove, 'undefined');
      assert.strictEqual(status.playerCount, 1);
      assert.strictEqual(status.enabledPlayerCount, 0);
      assert.strictEqual(status.temporarilyDisabledCount, 1);
      assert.strictEqual(Object.keys(persisted.players).length, 1);
      cases.push('persistent-entry-no-remove-api');
    }

    {
      const { whitelist } = createFixture(directory, 'crossfire');
      const state = battleState();
      state.realtime.entities.push({ user_id: 9, x: -1000, y: 0, hp: 100, drop: 1 });
      const exact = whitelist.observeDamage({ userId: 8 }, state, { atMs: 2000, hpLost: 10 });
      const expired = whitelist.observeDamage({ userId: 8 }, state, { atMs: 62001, hpLost: 1 });
      const exceeded = whitelist.observeDamage({ userId: 8 }, state, { atMs: 62002, hpLost: 10 });
      assert.strictEqual(exact.deferred, true);
      assert.strictEqual(exact.thresholdExceeded, false);
      assert.strictEqual(exact.damageInWindow, 10);
      assert.strictEqual(expired.damageInWindow, 1);
      assert.strictEqual(exceeded.newlyDisabled, true);
      assert.strictEqual(exceeded.damageInWindow, 11);
      cases.push('crossfire-strict-rolling-threshold');
    }

    const terminalCases = [
      ['target-dead', battleState({ targetHp: 0 }), {}, 'target-dead'],
      ['self-dead', battleState({ selfHp: 0 }), {}, 'self-dead'],
      ['target-left', battleState({ target: null }), {}, 'target-left-realtime'],
      ['self-left', battleState({ self: null }), {}, 'self-left-realtime'],
      ['out-of-range', battleState({ targetX: 17001 }), {}, 'target-out-of-combat-range'],
      ['combat-released', battleState(), { decisionState: {} }, 'combat-state-ended'],
      ['combat-switched', battleState(), { decisionState: { combatTarget: { id: 9 } } }, 'combat-state-ended']
    ];
    for (const [name, terminalState, terminalDetail, expectedReason] of terminalCases) {
      const { file, whitelist } = createFixture(directory, name);
      disableDirectly(whitelist);
      assert.deepStrictEqual(whitelist.observeBattles(battleState(), { atMs: 2050, decisionState: {} }), []);
      assert.deepStrictEqual(whitelist.observeBattles(battleState(), {
        atMs: 2100,
        decisionState: { combatTarget: { id: 8 } }
      }), []);
      const restored = whitelist.observeBattles(terminalState, {
        atMs: 2200,
        decisionState: terminalDetail.decisionState ?? { combatTarget: { id: 8 } },
        disengageRangeCm: 17000
      });
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].reason, expectedReason);
      assert.strictEqual(whitelist.isWhitelistedTarget({ userId: 8 }), true);
      assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).players).length, 1);
      cases.push(name);
    }

    {
      const { whitelist } = createFixture(directory, 'session-end');
      disableDirectly(whitelist);
      const restored = whitelist.restoreAll('websocket-closed', 2200);
      assert.strictEqual(restored[0]?.reason, 'websocket-closed');
      assert.strictEqual(whitelist.isWhitelistedTarget({ userId: 8 }), true);
      cases.push('session-end');
    }

    return { ok: true, cases };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  console.log(JSON.stringify(runDynamicWhitelistSelfTest(), null, 2));
}

module.exports = { runDynamicWhitelistSelfTest };
