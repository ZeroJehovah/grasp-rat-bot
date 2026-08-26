'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_OBSERVED_DEATH_MAX_AGE_MS, createDynamicWhitelist } = require('./dynamic-whitelist');
const { createDailyDamagePlayerTracker } = require('./daily-damage-player-tracker');
const {
  buildBrowserlessDecision,
  buildBrowserlessRealtimeControlDecision,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter
} = require('./decision-adapter');
const { createBrowserlessDecisionWorker } = require('./decision-worker');
const { createBrowserlessRealtimeControlWorker } = require('./realtime-control-worker');

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
        ...(options.targetInvulnerableMs
          ? { invulnerable_remaining_ms: options.targetInvulnerableMs }
          : {}),
        stamina_5s_remaining_milli: options.targetStamina5s ?? 10000,
        ...(options.targetStamina1h === undefined ? {} : {
          stamina_1h_remaining_milli: options.targetStamina1h,
          stamina_1h_limit_milli: options.targetStamina1hLimit ?? 600000
        }),
        ...(options.targetStamina1d === undefined ? {} : {
          stamina_1d_remaining_milli: options.targetStamina1d,
          stamina_1d_limit_milli: options.targetStamina1dLimit ?? 3600000
        }),
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
      assert.strictEqual(whitelist.hasPendingBattleObservation(), false);
      disableDirectly(whitelist);
      assert.strictEqual(whitelist.hasPendingBattleObservation(), true);
      const status = whitelist.status();
      const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.strictEqual(status.playerCount, 1);
      assert.strictEqual(status.enabledPlayerCount, 0);
      assert.strictEqual(status.temporarilyDisabledCount, 1);
      assert.strictEqual(Object.keys(persisted.players).length, 1);
      cases.push('persistent-entry');
    }

    {
      // 面板手动移除: 条目、临时禁用态与伤害窗口一并清除, 并立即落盘。
      const { file, whitelist } = createFixture(directory, 'manual-remove');
      disableDirectly(whitelist);
      assert.strictEqual(whitelist.remove({ userId: 99 }, 3000).removed, false);
      const removed = whitelist.remove({ userId: 8 }, 3000);
      assert.strictEqual(removed.ok, true);
      assert.strictEqual(removed.removed, true);
      assert.strictEqual(removed.player?.name, 'friendly');
      const afterStatus = whitelist.status();
      assert.strictEqual(afterStatus.playerCount, 0);
      assert.strictEqual(afterStatus.temporarilyDisabledCount, 0);
      assert.strictEqual(whitelist.isMember({ userId: 8 }), false);
      assert.strictEqual(whitelist.isWhitelistedTarget({ userId: 8 }), false);
      assert.strictEqual(whitelist.hasPendingBattleObservation(), false);
      assert.strictEqual(whitelist.remove({}, 3000).ok, false);
      const persistedAfter = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.strictEqual(Object.keys(persistedAfter.players).length, 0);
      cases.push('manual-remove-clears-entry-and-disabled-state');
    }

    {
      // 聊天击杀记录观察到成员死亡: 仅接受入表之后且在时效窗口内的证据, 避免补拉重放的历史击杀误删成员。
      const { file, whitelist } = createFixture(directory, 'observed-death');
      disableDirectly(whitelist);
      const missingId = whitelist.removeObservedDeath({}, { atMs: 3000 });
      const notMember = whitelist.removeObservedDeath({ userId: 99 }, { atMs: 3000, observedAtMs: 2900 });
      const beforeMembership = whitelist.removeObservedDeath({ userId: 8 }, { atMs: 3000, observedAtMs: 500 });
      const tooOld = whitelist.removeObservedDeath({ userId: 8 }, {
        atMs: 3000 + DEFAULT_OBSERVED_DEATH_MAX_AGE_MS,
        observedAtMs: 2999
      });
      assert.strictEqual(missingId.ok, false);
      assert.strictEqual(missingId.reason, 'missing-user-id');
      assert.strictEqual(notMember.removed, false);
      assert.strictEqual(notMember.reason, 'not-a-member');
      assert.strictEqual(beforeMembership.removed, false);
      assert.strictEqual(beforeMembership.reason, 'death-before-membership');
      assert.strictEqual(tooOld.removed, false);
      assert.strictEqual(tooOld.reason, 'death-observation-too-old');
      assert.strictEqual(whitelist.isMember({ userId: 8 }), true);

      const removed = whitelist.removeObservedDeath({ userId: 8 }, {
        atMs: 3000,
        observedAtMs: 2900,
        killerUserId: 7,
        selfKill: true,
        source: 'chat-kill-record',
        tick: 640,
        evidenceKey: 'kill:41'
      });
      assert.strictEqual(removed.ok, true);
      assert.strictEqual(removed.removed, true);
      assert.strictEqual(removed.reason, 'observed-death');
      assert.strictEqual(removed.name, 'friendly');
      assert.strictEqual(removed.killerUserId, 7);
      assert.strictEqual(removed.selfKill, true);
      assert.strictEqual(removed.source, 'chat-kill-record');
      assert.strictEqual(removed.tick, 640);
      assert.strictEqual(removed.evidenceKey, 'kill:41');
      assert.strictEqual(removed.observedAt, '1970-01-01T00:00:02.900Z');
      assert.strictEqual(removed.player?.name, 'friendly');
      assert.strictEqual(whitelist.isMember({ userId: 8 }), false);
      assert.strictEqual(whitelist.hasPendingBattleObservation(), false);
      assert.strictEqual(whitelist.status().observedDeathMaxAgeMs, DEFAULT_OBSERVED_DEATH_MAX_AGE_MS);
      assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).players).length, 0);
      const repeated = whitelist.removeObservedDeath({ userId: 8 }, { atMs: 3100, observedAtMs: 2900 });
      assert.strictEqual(repeated.removed, false);
      assert.strictEqual(repeated.reason, 'not-a-member');
      cases.push('observed-death-removes-member-only-with-fresh-post-membership-evidence');
    }

    {
      const { file, whitelist } = createFixture(directory, 'renamed-player');
      const sameName = whitelist.observePlayerNames([
        { user_id: 8, name: 'friendly' }
      ], { atMs: 2000, tick: 100, source: 'gap-http' });
      const renamed = whitelist.observePlayerNames([
        { user_id: 8, name: 'renamed' },
        { user_id: 9, name: 'not-a-member' }
      ], { atMs: 3000, tick: 120, source: 'gap-http' });
      const stale = whitelist.observePlayerNames([
        { user_id: 8, name: 'friendly', nameObservedAt: '1970-01-01T00:00:02.500Z' }
      ], { atMs: 4000, tick: 110, source: 'stale-snapshot' });
      const tickResetRename = whitelist.observePlayerNames([
        { user_id: 8, name: 'renamed-after-tick-reset' }
      ], { atMs: 5000, tick: 10, source: 'new-session-gap-http' });
      const sameNameRefresh = whitelist.observePlayerNames([
        { user_id: 8, name: 'renamed-after-tick-reset' }
      ], { atMs: 6000, tick: 11, source: 'new-session-gap-http' });
      const persisted = JSON.parse(fs.readFileSync(file, 'utf8')).players['user:8'];
      const reloaded = createDynamicWhitelist({ file, now: () => 7000 });
      const staleAfterReload = reloaded.observePlayerNames([{
        user_id: 8,
        name: 'stale-after-reload',
        nameObservedAt: '1970-01-01T00:00:05.500Z'
      }], { atMs: 7000, tick: 1000, source: 'stale-snapshot' });
      assert.strictEqual(sameName.updated, 0);
      assert.strictEqual(sameNameRefresh.updated, 0);
      assert.strictEqual(renamed.updated, 1);
      assert.deepStrictEqual(renamed.updates[0], {
        type: 'name-updated',
        at: '1970-01-01T00:00:03.000Z',
        source: 'gap-http',
        userId: 8,
        oldName: 'friendly',
        name: 'renamed'
      });
      assert.strictEqual(stale.updated, 0);
      assert.strictEqual(tickResetRename.updated, 1);
      assert.strictEqual(tickResetRename.updates[0].oldName, 'renamed');
      assert.strictEqual(tickResetRename.updates[0].name, 'renamed-after-tick-reset');
      assert.strictEqual(staleAfterReload.updated, 0);
      assert.strictEqual(persisted.name, 'renamed-after-tick-reset');
      assert.strictEqual(persisted.nameObservedAt, '1970-01-01T00:00:06.000Z');
      assert.strictEqual(persisted.nameObservedTick, 11);
      assert.strictEqual(reloaded.status().players[0].name, 'renamed-after-tick-reset');
      assert.strictEqual(reloaded.isMember({ user_id: 8, name: 'anything' }), true);
      cases.push('stable-id-name-refresh-uses-observation-time-across-session-tick-reset');
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
      assert.strictEqual(whitelist.hasPendingBattleObservation(), false);
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
      const healthyPassThrough = buildBrowserlessDecision(
        decisionState({ hp: 81, withBullet: false, targetDistance: 1 }),
        {},
        decisionOptions({ dailyDamageUserIds: [8], dynamicWhitelistEnabledUserIds: [] })
      );
      const proximityState = {};
      const boundaryContact = buildBrowserlessDecision(
        decisionState({ hp: 80, withBullet: false, targetDistance: 9000 }),
        proximityState,
        decisionOptions()
      );
      const proximityReleased = buildBrowserlessDecision(
        decisionState({
          hp: 80,
          withBullet: false,
          targetDistance: 9701,
          nowMs: 2050,
          tick: 63
        }),
        proximityState,
        decisionOptions({ nowMs: 2050 })
      );
      const healthyIncoming = buildBrowserlessDecision(
        decisionState({ hp: 100, targetHp: 50, targetDistance: 5000 }),
        {},
        decisionOptions()
      );
      const defensiveState = {
        combatTarget: {
          id: '8',
          at: 2000,
          firstSeenAt: 2000,
          lastInRangeAt: 2000,
          hp: 50,
          intent: 'secondary',
          originIntent: 'secondary',
          combatRole: 'secondary',
          secondaryTarget: true,
          lastFiringAt: 2000,
          active: true
        },
        combatMetrics: {
          targetId: '8',
          startedAt: 2000,
          lastObservedAt: 2000,
          acceptedShots: 0,
          lastTargetHp: 50
        }
      };
      const continuedDefense = buildBrowserlessDecision(
        decisionState({ hp: 100, targetHp: 50, targetDistance: 5000, nowMs: 2050, tick: 63, withBullet: false }),
        defensiveState,
        decisionOptions({ nowMs: 2050 })
      );
      const retainedStateRole = defensiveState.combatTarget?.combatRole;
      const retainedStateOriginIntent = defensiveState.combatTarget?.originIntent;
      defensiveState.combatAim = { targetId: '8', x: 1, y: 1 };
      defensiveState.combatHpObservationTargetId = '8';
      defensiveState.combatHpObservationBuffer = { observations: [{ atMs: 2050 }] };
      defensiveState.combatHpLossAttributionPending = { hpLoss: 1 };
      defensiveState.combatExecutionLedger = { engagementGeneration: 'test', eventIds: ['test'] };
      defensiveState.combatMovementStability = { targetId: '8' };
      defensiveState.combatTargetSwitchGate = { targetId: '8' };
      defensiveState.combatTargetSwitchHistory = { toTargetId: '8' };
      const releasedDefense = buildBrowserlessDecision(
        decisionState({
          hp: 100,
          targetHp: 50,
          targetDistance: 5000,
          targetVx: -50,
          targetMode: 'Active',
          nowMs: 7101,
          tick: 164,
          withBullet: false
        }),
        defensiveState,
        decisionOptions({ nowMs: 7101 })
      );
      const movementOnlyState = {};
      buildBrowserlessDecision(
        decisionState({
          hp: 100,
          targetDistance: 5000,
          targetVx: -50,
          targetMode: 'Active',
          nowMs: 8000,
          tick: 180,
          withBullet: false
        }),
        movementOnlyState,
        decisionOptions({ nowMs: 8000 })
      );
      const movementOnlySecond = buildBrowserlessDecision(
        decisionState({
          hp: 100,
          targetDistance: 4500,
          targetVx: -50,
          targetMode: 'Active',
          nowMs: 8050,
          tick: 181,
          withBullet: false
        }),
        movementOnlyState,
        decisionOptions({ nowMs: 8050 })
      );
      assert.strictEqual(healthyPassThrough.combat.target, null);
      assert.strictEqual(healthyPassThrough.whitelistSafety.targets[0].policy.reason, 'dynamic-whitelist-healthy-pass-through');
      assert.strictEqual(healthyPassThrough.whitelistSafety.targets[0].policy.proactiveCombatHpEligible, false);
      assert.strictEqual(boundaryContact.reason, 'combat-live-realtime');
      assert.strictEqual(boundaryContact.combat.target.combatRole, 'secondary');
      assert.strictEqual(boundaryContact.combat.target.whitelistContactPolicy.proactiveCombatEligible, true);
      assert.strictEqual(boundaryContact.combat.contactEntryGuard.active, false);
      assert.strictEqual(proximityReleased.combat.target, null);
      assert.strictEqual(
        proximityReleased.combat.secondaryTargetRelease.reason,
        'secondary-defensive-evidence-cleared'
      );
      assert.strictEqual(proximityState.combatTarget, null);
      assert.strictEqual(proximityState.combatEngagements?.['8'], undefined);
      assert.strictEqual(healthyIncoming.reason, 'incoming-bullet-dodge');
      assert.strictEqual(healthyIncoming.combat.target.combatRole, 'secondary');
      assert.strictEqual(healthyIncoming.combat.target.whitelisted, true);
      assert.strictEqual(healthyIncoming.whitelistSafety.incoming.collisionBulletCount > 0, true);
      assert.strictEqual(continuedDefense.reason, 'combat-live-realtime');
      assert.strictEqual(String(continuedDefense.combat.target.userId), '8');
      assert.strictEqual(continuedDefense.combat.target.combatRole, 'secondary');
      assert.strictEqual(continuedDefense.combat.shooting.wouldShoot, false);
      assert.strictEqual(continuedDefense.combat.shooting.secondaryPolicy.reason, 'secondary-five-second-shot-quota');
      assert.strictEqual(retainedStateRole, 'secondary');
      assert.strictEqual(retainedStateOriginIntent, 'secondary');
      assert.strictEqual(releasedDefense.combat.target, null);
      assert.strictEqual(releasedDefense.combat.secondaryTargetRelease.reason, 'secondary-defensive-evidence-cleared');
      assert.strictEqual(defensiveState.combatTarget, null);
      assert.strictEqual(defensiveState.combatEngagements?.['8'], undefined);
      assert.strictEqual(defensiveState.combatMetrics, null);
      assert.strictEqual(defensiveState.combatMetricsByTarget?.['8'], undefined);
      assert.strictEqual(defensiveState.combatAim, null);
      assert.strictEqual(defensiveState.combatHpObservationTargetId, '');
      assert.strictEqual(defensiveState.combatHpObservationBuffer, null);
      assert.strictEqual(defensiveState.combatHpLossAttributionPending, null);
      assert.strictEqual(defensiveState.combatExecutionLedger, null);
      assert.strictEqual(defensiveState.combatMovementStability, null);
      assert.strictEqual(defensiveState.combatTargetSwitchGate, null);
      assert.strictEqual(defensiveState.combatTargetSwitchHistory, null);
      assert.strictEqual(movementOnlySecond.combat.target, null);
      assert.strictEqual(movementOnlySecond.combat.contactEntryGuard.active, false);
      assert.strictEqual(
        movementOnlySecond.combat.contactEntryGuard.assessment?.blockedReason,
        'dynamic-whitelist-movement-authority-disabled'
      );
      assert.strictEqual(movementOnlySecond.combat.contactEntryGuard.assessment?.trigger, '');
      cases.push('whitelist-distance-or-attack-entry-and-bounded-secondary-release');
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
      assert.strictEqual(creator.combat.target.combatRole, 'secondary');
      assert.strictEqual(creator.combat.target.whitelisted, true);
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
      assert.strictEqual(legacy.combat.target.combatRole, 'secondary');
      assert.strictEqual(legacy.combat.target.whitelisted, true);
      assert.strictEqual(legacy.action.target.legacyWhitelistProtected, true);
      assert.notStrictEqual(legacy.action.kind, 'combat-live');
      cases.push('creator-and-static-whitelist-contacts-are-secondary-dodge-first-defense');
    }

    {
      const invulnerableSecondary = buildBrowserlessDecision(
        decisionState({ hp: 80, targetInvulnerableMs: 10000, targetFiring: true }),
        {},
        decisionOptions()
      );
      assert.strictEqual(invulnerableSecondary.combat.target.combatRole, 'secondary');
      assert.strictEqual(invulnerableSecondary.combat.shooting.secondaryPolicy.invulnerable, true);
      assert.strictEqual(invulnerableSecondary.combat.shooting.wouldShoot, false);
      assert.strictEqual(
        invulnerableSecondary.combat.shooting.secondaryPolicy.reason,
        'secondary-invulnerable-dodge-only'
      );
      assert.strictEqual(invulnerableSecondary.reason, 'incoming-bullet-dodge');
      cases.push('invulnerable-secondary-is-dodge-only');
    }

    {
      const outside = buildBrowserlessDecision(decisionState({ hp: 60, targetDistance: 16000 }), {}, decisionOptions());
      assert.strictEqual(outside.reason, 'incoming-bullet-dodge');
      assert.strictEqual(outside.combat.target.combatRole, 'secondary');
      assert.strictEqual(outside.combat.target.combatIntent, 'defensive');
      assert.strictEqual(outside.action.kind, 'flee');
      cases.push('outside-range-incoming-retains-secondary-and-dodges');
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
      assert.strictEqual(released.combat.target.combatRole, 'secondary');
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
      assert.strictEqual(lowStaminaContact.combat.target.combatRole, 'secondary');
      assert.strictEqual(
        lowStaminaContact.combat.target.whitelistContactPolicy.proactiveCombatEligible,
        true
      );
      assert.strictEqual(lowStaminaContact.combat.contactEntryGuard.active, false);
      assert.notStrictEqual(rolledBack.reason, 'dynamic-whitelist-contact-no-dodge-budget-leave');
      assert.strictEqual(rolledBack.combat.target, null);
      assert.strictEqual(rollbackLowHp.reason, 'dynamic-whitelist-low-hp-contact-leave');
      cases.push('low-stamina-distance-contact-initiates-and-low-hp-exit-survives');
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
        assert.notStrictEqual(decision.reason, 'combat-live-realtime', contact.name);
        assert.strictEqual(decision.combat.target, null, contact.name);
        assert.strictEqual(
          decision.whitelistSafety.targets[0].policy.reason,
          'dynamic-whitelist-healthy-pass-through',
          contact.name
        );
        assert.notStrictEqual(decision.action?.kind, 'safety-exit', contact.name);
      }
      cases.push('observed-healthy-dynamic-contacts-pass-through-despite-daily-damage');
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
      assert.strictEqual(proximity.combat.target.combatRole, 'secondary');
      assert.strictEqual(proximity.combat.target.whitelistContactPolicy.proactiveCombatEligible, true);
      assert.strictEqual(proximity.combat.profitPursuitSuppression, null);
      cases.push('low-hp-whitelist-exit-and-healthy-distance-contact-bypass-profit-suppression');
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
      // 视野内观察到成员 1h 或 1d 体力 100% 满时解除保护, 允许设为目标;
      // 创建者、静态白名单与配置开关仍然优先, 差一点满也不触发豁免。
      const visible = (state, options) => buildBrowserlessStrategyInput(state, options, {}).visibleTargets[0];
      const base = { hp: 100, withBullet: false, targetDistance: 20000 };
      const guarded = visible(decisionState(base), decisionOptions());
      const partial1h = visible(decisionState({ ...base, targetStamina1h: 300000 }), decisionOptions());
      // 边界: 少 1 milli 与通用 staminaFullRatio=0.98 的阈值都必须保持保护。0.98 曾让一个正在
      // 对射的成员(1h 余量 98.0%)被判成挂机并设为主目标, 这两条断言是该缺陷的回归门。
      const oneBelow1h = visible(decisionState({ ...base, targetStamina1h: 599999 }), decisionOptions());
      const ratio1h = visible(decisionState({ ...base, targetStamina1h: 588000 }), decisionOptions());
      const oneBelow1d = visible(decisionState({ ...base, targetStamina1d: 3599999 }), decisionOptions());
      const ratio1d = visible(decisionState({ ...base, targetStamina1d: 3528000 }), decisionOptions());
      const full1h = visible(decisionState({ ...base, targetStamina1h: 600000 }), decisionOptions());
      const full1d = visible(decisionState({ ...base, targetStamina1d: 3600000 }), decisionOptions());
      const rolledBack = visible(
        decisionState({ ...base, targetStamina1h: 600000 }),
        decisionOptions({ dynamicWhitelistStaminaExemptionEnabled: false })
      );
      const creator = visible(
        decisionState({ ...base, targetStamina1h: 600000 }),
        decisionOptions({ creatorUserIds: [8] })
      );
      const staticWhitelisted = visible(
        decisionState({ ...base, targetStamina1h: 600000 }),
        decisionOptions({ targetWhitelistUserIds: [8] })
      );
      for (const [label, entity] of [
        ['guarded', guarded],
        ['partial-1h', partial1h],
        ['one-below-1h', oneBelow1h],
        ['ratio-098-1h', ratio1h],
        ['one-below-1d', oneBelow1d],
        ['ratio-098-1d', ratio1d],
        ['rolled-back', rolledBack]
      ]) {
        assert.strictEqual(entity.dynamicWhitelistMember, true, label);
        assert.strictEqual(entity.dynamicWhitelistStaminaExempt, false, label);
        assert.strictEqual(entity.dynamicWhitelistStaminaExemptWindow, '', label);
        assert.strictEqual(entity.whitelisted, true, label);
        // 成员即使没被豁免也要带上诊断字段, 否则事后无法从日志判断豁免为什么没成立。
        assert.strictEqual(entity.whitelistContactPolicy.dynamicWhitelistRawMember, true, label);
        assert.strictEqual(entity.whitelistContactPolicy.dynamicWhitelistStaminaExempt, false, label);
      }
      for (const [label, entity, window] of [['full-1h', full1h, '1h'], ['full-1d', full1d, '1d']]) {
        assert.strictEqual(entity.dynamicWhitelistRawMember, true, label);
        assert.strictEqual(entity.dynamicWhitelistMember, false, label);
        assert.strictEqual(entity.dynamicWhitelistStaminaExempt, true, label);
        assert.strictEqual(entity.dynamicWhitelistStaminaExemptWindow, window, label);
        assert.strictEqual(entity.legacyWhitelistProtected, false, label);
        assert.strictEqual(entity.profitProtected, false, label);
        assert.strictEqual(entity.whitelisted, false, label);
        assert.strictEqual(entity.whitelistContactPolicy.dynamicWhitelistStaminaExempt, true, label);
        assert.strictEqual(entity.whitelistContactPolicy.dynamicWhitelistStaminaExemptWindow, window, label);
      }
      assert.strictEqual(creator.creatorProtected, true);
      assert.strictEqual(creator.dynamicWhitelistStaminaExempt, false);
      assert.strictEqual(creator.whitelisted, true);
      assert.strictEqual(staticWhitelisted.dynamicWhitelistStaminaExempt, true);
      assert.strictEqual(staticWhitelisted.legacyWhitelistProtected, true);
      assert.strictEqual(staticWhitelisted.whitelisted, true);

      const engagement = { hp: 100, withBullet: false, targetDistance: 5000, targetMode: 'Active', targetVx: 50 };
      const guardedCombat = buildBrowserlessDecision(decisionState(engagement), {}, decisionOptions());
      const exemptCombat = buildBrowserlessDecision(
        decisionState({ ...engagement, targetStamina1h: 600000 }),
        {},
        decisionOptions()
      );
      assert.strictEqual(guardedCombat.combat.target, null);
      assert.strictEqual(exemptCombat.reason, 'combat-live-realtime');
      assert.strictEqual(exemptCombat.combat.target.combatRole, 'primary');
      assert.strictEqual(Number(exemptCombat.combat.target.userId ?? exemptCombat.combat.target.user_id), 8);
      assert.strictEqual(exemptCombat.combat.target.dynamicWhitelistMember, false);
      cases.push('full-1h-or-1d-stamina-exempts-visible-dynamic-whitelist-members-from-targeting');
    }

    {
      // 成员一动(哪怕一次射击的 500 milli)长周期体力就不再是满值, 豁免立刻失效, 保护立刻恢复:
      // 有攻击证据时降级为防御副目标, 没有攻击证据时释放战斗目标, 并且旧的玩家收益任务必须一起
      // 释放 —— 否则 sameAsProfitMission/primaryTargetId 会继续指向受保护成员并围着他规划移动。
      const engagement = { hp: 100, withBullet: false, targetDistance: 5000, targetMode: 'Active', targetVx: 50 };
      const statefulWithMission = () => ({
        profitMission: {
          active: true,
          key: 'enemy:8',
          missionKey: 'enemy:8',
          type: 'enemy',
          subjectId: '8',
          targetId: '8',
          selectedAt: 1000,
          expiresAt: 200000,
          navigationTarget: { user_id: 8, entity_id: 2, x: 5000, y: 0, hp: 100 },
          choice: { type: 'enemy', id: 8 }
        }
      });
      const exemptStateful = statefulWithMission();
      const exemptHold = buildBrowserlessDecision(
        decisionState({ ...engagement, targetStamina1h: 600000 }),
        exemptStateful,
        decisionOptions()
      );
      const revokedWithEvidenceStateful = statefulWithMission();
      const revokedWithEvidence = buildBrowserlessDecision(
        decisionState({
          ...engagement,
          targetStamina1h: 599500,
          targetFiring: true,
          withBullet: true,
          bulletOwnerId: 8
        }),
        revokedWithEvidenceStateful,
        decisionOptions()
      );
      const revokedStateful = statefulWithMission();
      const revoked = buildBrowserlessDecision(
        decisionState({ ...engagement, targetStamina1h: 599500 }),
        revokedStateful,
        decisionOptions()
      );

      // 满值仍然豁免: 任务与主目标都保留, 不能被新的释放逻辑误伤。
      assert.strictEqual(exemptHold.combat.target.combatRole, 'primary');
      assert.strictEqual(exemptHold.profit.mission.targetId, '8');
      assert.strictEqual(exemptStateful.profitMission.targetId, '8');

      assert.strictEqual(revokedWithEvidence.combat.target.combatRole, 'secondary');
      assert.strictEqual(revokedWithEvidence.combat.target.combatIntent, 'defensive');
      assert.strictEqual(revokedWithEvidence.combat.target.dynamicWhitelistMember, true);
      assert.strictEqual(
        revokedWithEvidence.combat.target.whitelistContactPolicy.dynamicWhitelistStaminaExempt,
        false
      );
      assert.strictEqual(revokedWithEvidence.profit.mission, null);
      assert.strictEqual(revokedWithEvidenceStateful.profitMission, null);

      assert.strictEqual(revoked.combat.target, null);
      assert.strictEqual(revoked.profit.mission, null);
      assert.strictEqual(revokedStateful.profitMission, null);
      cases.push('stamina-exemption-revocation-downgrades-to-defensive-secondary-and-releases-profit-mission');
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
      assert.strictEqual(current.reason, 'combat-live-realtime');
      assert.strictEqual(current.combat.target.combatRole, 'secondary');
      assert.strictEqual(current.combat.target.whitelistContactPolicy.proactiveCombatEligible, true);
      assert.strictEqual(current.whitelistSafety.targets[0].policy.damagedSelfToday, true);
      assert.strictEqual(current.whitelistSafety.targets[0].policy.proactiveCombatRangeCm, 14500);
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
        const directPolicy = direct.whitelistSafety.targets[0].policy;
        const workerPolicy = remote.decision.whitelistSafety.targets[0].policy;
        assert.strictEqual(direct.combat.target.combatRole, 'secondary');
        assert.strictEqual(remote.decision.combat.target.combatRole, 'secondary');
        assert.strictEqual(direct.reason, remote.decision.reason);
        assert.strictEqual(direct.reason, 'combat-live-realtime');
        assert.strictEqual(directPolicy.reason, workerPolicy.reason);
        assert.strictEqual(directPolicy.proactiveCombatRangeCm, workerPolicy.proactiveCombatRangeCm);
        assert.strictEqual(workerPolicy.damagedSelfToday, true);
      } finally {
        await worker.close();
      }
      cases.push('main-worker-whitelist-policy-consistency');
    }

    {
      const nowMs = 4000;
      const baseOptions = decisionOptions({
        nowMs,
        dynamicWhitelistMemberUserIds: undefined,
        dynamicWhitelistEnabledUserIds: undefined
      });
      const state = decisionState({
        hp: 100,
        nowMs,
        targetDistance: 13000,
        targetMode: 'Active',
        targetVx: 35,
        targetStamina5s: 4609,
        bulletStartX: 13000,
        bulletStartY: 0,
        bulletTargetX: 13000,
        bulletTargetY: 10000
      });
      const worker = createBrowserlessRealtimeControlWorker(baseOptions);
      try {
        await worker.ready();
        const remote = await worker.evaluate(state, baseOptions, {
          damageStatus: { userIds: [], players: [] },
          dynamicWhitelistStatus: {
            memberUserIds: [8],
            userIds: [8]
          }
        });
        const control = remote.control;
        const policy = control.whitelistSafety.targets[0].policy;
        assert.strictEqual(control.action, null);
        assert.strictEqual(control.combat.target, null);
        assert.strictEqual(control.combat.candidates.length, 0);
        assert.strictEqual(control.whitelistSafety.incoming.collisionBulletCount, 0);
        assert.strictEqual(policy.dynamicWhitelistMember, true);
        assert.strictEqual(policy.dynamicWhitelistEnabled, true);
        assert.strictEqual(policy.damagedSelfToday, false);
        assert.strictEqual(policy.proactiveCombatRangeCm, 6500);
        assert.strictEqual(policy.distanceCm, 13000);
        assert.strictEqual(policy.reason, 'dynamic-whitelist-healthy-pass-through');
      } finally {
        await worker.close();
      }
      cases.push('realtime-worker-restores-dynamic-whitelist-context');
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
