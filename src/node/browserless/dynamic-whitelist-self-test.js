'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDynamicWhitelist } = require('./dynamic-whitelist');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const {
  buildBrowserlessDecision,
  buildBrowserlessRealtimeControlDecision,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter
} = require('./decision-adapter');
const { createBrowserlessDecisionWorker } = require('./decision-worker');

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

function decisionState(options = {}) {
  const tick = options.tick ?? 62;
  const self = {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x: 0,
    y: 0,
    hp: options.hp ?? 60,
    max_hp: options.maxHp ?? 100,
    stamina_5s_remaining_milli: options.stamina5s ?? 10000
  };
  const target = options.target === null
    ? null
    : {
        entity_id: 2,
        user_id: options.targetId ?? 8,
        name: options.targetName ?? 'friendly',
        x: options.targetX ?? options.targetDistance ?? 5000,
        y: options.targetY ?? 0,
        vx: options.targetVx ?? 0,
        vy: options.targetVy ?? 0,
        hp: options.targetHp ?? 100,
        max_hp: 100,
        current_join_mode: options.targetMode ?? 'Passive',
        firing: options.targetFiring === true,
        stamina_5s_remaining_milli: options.targetStamina5s ?? 10000,
        drop: options.targetDrop ?? 100
      };
  const extraTargets = (options.extraTargets || []).map((item, index) => ({
    entity_id: item.entity_id ?? 10 + index,
    hp: 100,
    max_hp: 100,
    stamina_5s_remaining_milli: 10000,
    ...item
  }));
  const bullets = options.bullets === undefined
    ? (options.withBullet === false ? [] : [{
        bullet_id: options.bulletId ?? 21,
        owner_user_id: options.bulletOwnerId ?? options.targetId ?? 8,
        start_x: options.bulletStartX ?? 5000,
        start_y: options.bulletStartY ?? 0,
        target_x: options.bulletTargetX ?? 0,
        target_y: options.bulletTargetY ?? 0,
        created_tick: tick - 1,
        expire_tick: tick + 29,
        speed_per_tick: 500
      }])
    : options.bullets;
  return {
    userId: 7,
    realtime: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: options.nowMs ?? 2000,
      self,
      entities: [self, target, ...extraTargets].filter(Boolean),
      bullets,
      coinDrops: []
    },
    fallback: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: options.nowMs ?? 2000,
      entities: [],
      coinDrops: options.snapshotCoins || [],
      messages: []
    }
  };
}

function decisionOptions(extra = {}) {
  return {
    nowMs: extra.nowMs ?? 2000,
    controlMode: 'profit-live',
    combatEnabled: true,
    combatAttackRange: 14500,
    dynamicProfitThresholdEnabled: false,
    dynamicWhitelistMemberUserIds: [8],
    dynamicWhitelistEnabledUserIds: [8],
    ...extra
  };
}

function nonZeroDirection(action) {
  return Boolean(Number(action?.dx || 0) || Number(action?.dy || 0));
}

async function runDynamicWhitelistSelfTest() {
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

    {
      const state = decisionState({ hp: 60, targetHp: 50 });
      const options = decisionOptions();
      const full = buildBrowserlessDecision(state, {}, options);
      const realtime = buildBrowserlessRealtimeControlDecision(state, {}, options);
      assert.strictEqual(full.reason, 'incoming-bullet-dodge');
      assert.strictEqual(realtime.reason, 'incoming-bullet-dodge');
      assert.strictEqual(nonZeroDirection(full.action), true);
      assert.strictEqual(nonZeroDirection(realtime.action), true);
      assert.strictEqual(full.whitelistSafety.incoming.combatMovementCovered, false);
      assert.strictEqual(realtime.whitelistSafety.incoming.combatMovementCovered, false);
      assert.strictEqual(full.action.dx, full.whitelistSafety.incoming.cover.dx);
      assert.strictEqual(full.action.dy, full.whitelistSafety.incoming.cover.dy);
      const safeCover = buildBrowserlessDecision(
        decisionState({ hp: 60, targetHp: 50, targetDistance: 9000, bulletStartX: 9000 }),
        {},
        options
      );
      assert.strictEqual(safeCover.whitelistSafety.incoming.cover.directHits, 0);
      assert.strictEqual(safeCover.action.dx, safeCover.whitelistSafety.incoming.cover.dx);
      assert.strictEqual(safeCover.action.dy, safeCover.whitelistSafety.incoming.cover.dy);
      cases.push('first-incoming-bullet-dodge-full-and-realtime');
    }

    {
      const low = buildBrowserlessDecision(decisionState({ hp: 40 }), {}, decisionOptions());
      const extendedRecovery = buildBrowserlessDecision(
        decisionState({ hp: 40, withBullet: false, targetDistance: 20000 }),
        {},
        decisionOptions()
      );
      const critical = buildBrowserlessDecision(decisionState({ hp: 30 }), {}, decisionOptions());
      const establishedCriticalState = {
        combatTarget: {
          id: '8',
          at: 1000,
          firstSeenAt: 1000,
          lastInRangeAt: 1950,
          hp: 100,
          intent: 'defensive',
          originIntent: 'defensive',
          active: true
        },
        combatMetrics: {
          targetId: '8',
          startedAt: 1000,
          lastObservedAt: 1950,
          acceptedShots: 2,
          lastTargetHp: 100
        }
      };
      const establishedCritical = buildBrowserlessDecision(
        decisionState({ hp: 30 }),
        establishedCriticalState,
        decisionOptions()
      );
      assert.strictEqual(low.reason, 'dynamic-whitelist-low-hp-contact-leave');
      assert.strictEqual(low.action.shouldLeave, true);
      assert.strictEqual(low.action.stopMotion, false);
      assert.strictEqual(nonZeroDirection(low.action), true);
      assert.strictEqual(extendedRecovery.reason, 'dynamic-whitelist-low-hp-contact-leave');
      assert.strictEqual(critical.reason, 'combat-critical-hp-leave');
      assert.strictEqual(critical.action.shouldLeave, true);
      assert.strictEqual(critical.action.stopMotion, false);
      assert.strictEqual(nonZeroDirection(critical.action), true);
      assert.strictEqual(establishedCritical.reason, 'combat-critical-hp-leave');
      assert.strictEqual(establishedCritical.whitelistSafety.incoming.combatWasEstablished, true);
      assert.strictEqual(establishedCritical.action.stopMotion, false);
      assert.strictEqual(nonZeroDirection(establishedCritical.action), true);
      cases.push('low-and-critical-hp-incoming-contact-exits-use-cover');
    }

    {
      const creatorOptions = decisionOptions({
        creatorUserIds: [8],
        targetWhitelistUserIds: [8],
        dynamicWhitelistMemberUserIds: [],
        dynamicWhitelistEnabledUserIds: []
      });
      const creator = buildBrowserlessDecision(decisionState({ hp: 60 }), {}, creatorOptions);
      assert.strictEqual(creator.reason, 'incoming-bullet-dodge');
      assert.strictEqual(creator.combat.target, null);
      assert.strictEqual(creator.action.target.creatorProtected, true);
      assert.notStrictEqual(creator.action.kind, 'combat-live');
      const legacy = buildBrowserlessDecision(
        decisionState({ hp: 60 }),
        {},
        decisionOptions({
          creatorUserIds: [],
          targetWhitelistUserIds: [8],
          dynamicWhitelistMemberUserIds: [],
          dynamicWhitelistEnabledUserIds: []
        })
      );
      assert.strictEqual(legacy.reason, 'incoming-bullet-dodge');
      assert.strictEqual(legacy.combat.target, null);
      assert.strictEqual(legacy.action.target.legacyWhitelistProtected, true);
      assert.notStrictEqual(legacy.action.kind, 'combat-live');
      cases.push('creator-and-static-whitelist-incoming-dodge-never-offensive');
    }

    {
      const outside = buildBrowserlessDecision(decisionState({ hp: 60, targetDistance: 16000 }), {}, decisionOptions());
      assert.strictEqual(outside.reason, 'incoming-bullet-dodge');
      assert.strictEqual(outside.combat.target, null);
      assert.strictEqual(outside.action.kind, 'flee');
      cases.push('outside-range-incoming-is-dodge-only');
    }

    {
      const stateful = {
        combatTarget: {
          id: '9',
          at: 1000,
          firstSeenAt: 1000,
          lastInRangeAt: 1950,
          hp: 100,
          intent: 'defensive',
          originIntent: 'defensive',
          active: true
        },
        combatMetrics: {
          targetId: '9',
          startedAt: 1000,
          lastObservedAt: 1950,
          acceptedShots: 5,
          lastTargetHp: 100
        }
      };
      const state = decisionState({
        hp: 80,
        targetDistance: 7000,
        extraTargets: [{
          user_id: 9,
          name: 'existing-target',
          x: 5000,
          y: 0,
          current_join_mode: 'Active',
          firing: true,
          drop: 10,
          hp: 70
        }]
      });
      const decision = buildBrowserlessDecision(state, stateful, decisionOptions());
      const threatOwners = new Set((decision.combat.movement?.dodge?.threatField || [])
        .flatMap(item => item.dangerousBullets || [])
        .map(item => String(item.ownerId ?? '')));
      assert.strictEqual(decision.reason, 'combat-live-realtime');
      assert.strictEqual(String(decision.combat.target.userId), '9');
      assert.strictEqual(decision.whitelistSafety.incoming.combatMovementCovered, true);
      assert.strictEqual(threatOwners.has('8'), true);
      cases.push('established-combat-owns-third-party-whitelist-bullet');
    }

    {
      const stateful = {
        combatTarget: {
          id: '9',
          at: 1000,
          firstSeenAt: 1000,
          lastInRangeAt: 1950,
          hp: 0,
          intent: 'engaged',
          originIntent: 'defensive'
        }
      };
      const released = buildBrowserlessDecision(
        decisionState({ hp: 60, targetDistance: 16000 }),
        stateful,
        decisionOptions()
      );
      assert.strictEqual(released.reason, 'incoming-bullet-dodge');
      assert.strictEqual(released.combat.target, null);
      assert.strictEqual(released.whitelistSafety.incoming.combatMovementCovered, false);
      cases.push('released-target-does-not-erase-surviving-bullet');
    }

    {
      const offLane = buildBrowserlessDecision(decisionState({
        hp: 60,
        targetDistance: 16000,
        bulletStartX: 5000,
        bulletStartY: 5000,
        bulletTargetX: 0,
        bulletTargetY: 5000
      }), {}, decisionOptions());
      assert.notStrictEqual(offLane.reason, 'incoming-bullet-dodge');
      assert.strictEqual(offLane.whitelistSafety?.incoming?.collisionBulletCount || 0, 0);
      cases.push('off-lane-bullet-does-not-trigger-emergency-dodge');
    }

    {
      const crossfire = buildBrowserlessDecision(decisionState({
        hp: 60,
        targetHp: 50,
        extraTargets: [{ user_id: 9, name: 'crossfire-bystander', x: -1000, y: 0, drop: 1 }]
      }), {}, decisionOptions());
      assert.strictEqual(crossfire.reason, 'incoming-bullet-dodge');
      assert.strictEqual(nonZeroDirection(crossfire.action), true);
      cases.push('crossfire-bystander-does-not-delay-incoming-dodge');
    }

    {
      const lowStaminaContact = buildBrowserlessDecision(
        decisionState({ hp: 80, stamina5s: 2399, withBullet: false, targetDistance: 9000 }),
        {},
        decisionOptions()
      );
      const rolledBack = buildBrowserlessDecision(
        decisionState({ hp: 80, stamina5s: 2399, withBullet: false, targetDistance: 9000 }),
        {},
        decisionOptions({ dynamicWhitelistProximitySafetyEnabled: false })
      );
      const rollbackLowHp = buildBrowserlessDecision(
        decisionState({ hp: 40, withBullet: false, targetDistance: 9000 }),
        {},
        decisionOptions({ dynamicWhitelistProximitySafetyEnabled: false })
      );
      assert.strictEqual(lowStaminaContact.reason, 'combat-live-realtime');
      assert.strictEqual(String(lowStaminaContact.combat.target.userId), '8');
      assert.notStrictEqual(rolledBack.reason, 'dynamic-whitelist-contact-no-dodge-budget-leave');
      assert.strictEqual(rollbackLowHp.reason, 'dynamic-whitelist-low-hp-contact-leave');
      cases.push('low-stamina-contact-engages-and-low-hp-exit-survives-proximity-rollback');
    }

    {
      const observedContacts = [
        { name: 'huaming song', distance: 12727, stamina5s: 3582, targetHp: 97 },
        { name: 'Haskell', distance: 14444, stamina5s: 5492, targetHp: 100 },
        { name: 'yongren', distance: 13496, stamina5s: 3270, targetHp: 88 }
      ];
      for (const contact of observedContacts) {
        const decision = buildBrowserlessDecision(
          decisionState({
            hp: 100,
            stamina5s: contact.stamina5s,
            targetDistance: contact.distance,
            targetHp: contact.targetHp,
            targetMode: 'Active',
            targetName: contact.name,
            withBullet: false
          }),
          {},
          decisionOptions({ dailyDamageUserIds: [8] })
        );
        assert.strictEqual(decision.reason, 'combat-live-realtime', contact.name);
        assert.strictEqual(String(decision.combat.target.userId), '8', contact.name);
        assert.notStrictEqual(decision.action?.kind, 'safety-exit', contact.name);
      }
      cases.push('observed-low-stamina-dynamic-contacts-remain-in-combat');
    }

    {
      const lowHpWithCoin = buildBrowserlessDecision(decisionState({
        hp: 40,
        withBullet: false,
        targetDistance: 5000,
        snapshotCoins: [{ drop_id: 'large', amount: 999, x: 100, y: 0 }]
      }), {}, decisionOptions());
      const suppressedState = {
        profitPursuitSuppressions: {
          8: { economicStopLoss: true, until: 60000, reason: 'test-suppression' }
        }
      };
      const proximity = buildBrowserlessDecision(
        decisionState({ hp: 80, targetHp: 70, withBullet: false, targetDistance: 9000 }),
        suppressedState,
        decisionOptions()
      );
      assert.strictEqual(lowHpWithCoin.reason, 'dynamic-whitelist-low-hp-contact-leave');
      assert.strictEqual(proximity.reason, 'combat-live-realtime');
      assert.strictEqual(proximity.combat.target.combatIntent, 'whitelist-proximity');
      assert.strictEqual(proximity.combat.profitPursuitSuppression, null);
      cases.push('coin-and-economic-stop-loss-cannot-suppress-whitelist-safety');
    }

    {
      const input = buildBrowserlessStrategyInput(
        decisionState({ hp: 100, withBullet: false, targetDistance: 20000 }),
        decisionOptions(),
        {}
      );
      const ordinary = buildBrowserlessDecision(
        decisionState({ hp: 100, withBullet: false, targetDistance: 5000, targetMode: 'Active', targetVx: 50 }),
        {},
        decisionOptions({ dynamicWhitelistMemberUserIds: [], dynamicWhitelistEnabledUserIds: [] })
      );
      assert.strictEqual(input.visibleTargets[0].whitelisted, true);
      assert.strictEqual(input.afkTargets.length, 0);
      assert.strictEqual(ordinary.reason, 'combat-live-realtime');
      assert.strictEqual(ordinary.combat.target.dynamicWhitelistMember, false);
      cases.push('profit-protection-remains-and-ordinary-combat-is-unchanged');
    }

    {
      const damageFile = path.join(directory, 'daily-damage.json');
      const baseMs = Date.parse('2026-07-30T04:00:00.000Z');
      const damageTracker = createDailyDamagePlayerTracker({ file: damageFile, now: () => baseMs });
      damageTracker.recordDamage({ userId: 8, name: 'old-name' }, { atMs: baseMs, tick: 10, hpLost: 3 });
      const { whitelist } = createFixture(directory, 'daily-persistence');
      disableDirectly(whitelist);
      whitelist.observeBattles(battleState(), {
        atMs: baseMs + 1000,
        decisionState: { combatTarget: { id: 8 } }
      });
      whitelist.observeBattles(battleState({ target: null }), {
        atMs: baseMs + 2000,
        decisionState: { combatTarget: { id: 8 } }
      });
      const current = buildBrowserlessDecision(
        decisionState({ hp: 80, targetHp: 70, withBullet: false, targetDistance: 14500, targetName: 'renamed' }),
        {},
        decisionOptions({
          nowMs: baseMs + 3000,
          dailyDamageUserIds: damageTracker.status(baseMs + 3000).userIds
        })
      );
      const stableIdMatched = damageTracker.hasUserId({ user_id: 8, name: 'renamed' }, baseMs + 3000);
      const nextDayStatus = damageTracker.status(baseMs + 24 * 60 * 60 * 1000);
      assert.strictEqual(stableIdMatched, true);
      assert.strictEqual(whitelist.isMember({ userId: 8 }), true);
      assert.strictEqual(whitelist.isEnabled({ userId: 8 }), true);
      assert.strictEqual(current.combat.target.whitelistContactPolicy.damagedSelfToday, true);
      assert.strictEqual(current.combat.target.whitelistContactPolicy.proactiveCombatRangeCm, 14500);
      assert.strictEqual(nextDayStatus.playerCount, 0);
      cases.push('daily-damage-stable-id-override-persists-after-battle-and-resets-utc8');
    }

    {
      const options = decisionOptions({
        nowMs: 3000,
        dailyDamageUserIds: [8]
      });
      const state = decisionState({ hp: 80, targetHp: 70, withBullet: false, targetDistance: 14500, nowMs: 3000 });
      const directAdapter = createBrowserlessDecisionAdapter(options);
      const worker = createBrowserlessDecisionWorker(options);
      try {
        await worker.ready();
        const direct = directAdapter.decide(state, options);
        const remote = await worker.decide(state, options, {
          damageStatus: { userIds: [8], players: [{ userId: 8 }] }
        });
        const directPolicy = direct.combat.target.whitelistContactPolicy;
        const workerPolicy = remote.decision.combat.target.whitelistContactPolicy;
        assert.strictEqual(direct.reason, remote.decision.reason);
        assert.strictEqual(directPolicy.reason, workerPolicy.reason);
        assert.strictEqual(directPolicy.proactiveCombatRangeCm, workerPolicy.proactiveCombatRangeCm);
        assert.strictEqual(workerPolicy.damagedSelfToday, true);
      } finally {
        await worker.close();
      }
      cases.push('main-worker-whitelist-policy-consistency');
    }

    return { ok: true, cases };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runDynamicWhitelistSelfTest()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}

module.exports = { runDynamicWhitelistSelfTest };
