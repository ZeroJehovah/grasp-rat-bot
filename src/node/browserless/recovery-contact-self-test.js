'use strict';

const assert = require('assert');
const {
  buildBrowserlessDecision,
  buildBrowserlessRealtimeControlDecision,
  createBrowserlessDecisionAdapter
} = require('./decision-adapter');
const {
  updateRecoveryContactGuardCore
} = require('../../strategy/recovery-contact-guard');
const {
  recoveryContactExitReasonTextCore
} = require('./web-panel');

function recoveryAction() {
  return {
    kind: 'recover',
    band: 'recover',
    reason: 'wait-for-full-stamina-and-hp'
  };
}

function state(options = {}) {
  const nowMs = Number(options.nowMs ?? 1000);
  const tick = Number(options.tick ?? 100);
  const self = {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: Number(options.hp ?? 98),
    max_hp: 100,
    stamina_5s_remaining_milli: Number(options.stamina5s ?? 10000),
    stamina_5s_limit_milli: Number(options.stamina5sLimit ?? 10000),
    stamina_1h_remaining_milli: Number(options.stamina1h ?? 1000000),
    stamina_1h_limit_milli: 1000000,
    stamina_1d_remaining_milli: Number(options.stamina1d ?? 10000000),
    stamina_1d_limit_milli: 10000000
  };
  const target = options.target === null ? null : {
    entity_id: 2,
    user_id: 8,
    name: 'ordinary-active',
    x: Number(options.targetX ?? 19000),
    y: Number(options.targetY ?? 0),
    vx: Number(options.targetVx ?? -50),
    vy: Number(options.targetVy ?? 0),
    hp: 100,
    max_hp: 100,
    current_join_mode: options.targetMode ?? 'Active',
    firing: options.targetFiring === true,
    stamina_5s_remaining_milli: 10000,
    drop: Number(options.targetDrop ?? 20)
  };
  const bullets = options.withBullet ? [{
    bullet_id: 21,
    owner_user_id: 8,
    start_x: 5000,
    start_y: 0,
    target_x: 0,
    target_y: 0,
    created_tick: tick - 1,
    expire_tick: tick + 29,
    speed_per_tick: 500
  }] : [];
  return {
    userId: 7,
    realtime: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: nowMs,
      self,
      entities: [self, target].filter(Boolean),
      bullets,
      coinDrops: []
    },
    fallback: {
      tick,
      frameAgeMs: 0,
      receivedAtMs: nowMs,
      entities: [],
      coinDrops: [],
      messages: []
    }
  };
}

function decisionOptions(nowMs, extra = {}) {
  return {
    nowMs,
    controlMode: 'profit-live',
    combatEnabled: true,
    combatAttackRange: 14500,
    dynamicProfitThresholdEnabled: false,
    creatorUserIds: [],
    targetWhitelistUserIds: [],
    targetWhitelistNames: [],
    dynamicWhitelistMemberUserIds: [],
    dynamicWhitelistEnabledUserIds: [],
    ...extra
  };
}

function nonZeroDirection(action) {
  return Boolean(Number(action?.dx || 0) || Number(action?.dy || 0));
}

function confirmLowHpContact(decide, stateful, extra = {}) {
  decide(state({ nowMs: 1000, tick: 100, hp: 50, targetX: 19000, targetVx: -50, ...extra }), stateful, decisionOptions(1000));
  return decide(
    state({ nowMs: 1050, tick: 101, hp: 50, targetX: 18800, targetVx: -50, ...extra }),
    stateful,
    decisionOptions(1050)
  );
}

function runRecoveryContactSelfTest() {
  const cases = [];

  {
    const recoveryWins = buildBrowserlessDecision(
      state({
        nowMs: 1000,
        hp: 80,
        targetX: 30000,
        targetVx: 0,
        targetMode: 'Passive',
        targetDrop: 39
      }),
      {},
      decisionOptions(1000)
    );
    const profitWins = buildBrowserlessDecision(
      state({
        nowMs: 1000,
        hp: 50,
        targetX: 30000,
        targetVx: 0,
        targetMode: 'Passive',
        targetDrop: 101
      }),
      {},
      decisionOptions(1000)
    );
    assert.strictEqual(recoveryWins.reason, 'wait-for-full-stamina-and-hp');
    assert.strictEqual(recoveryWins.action.recoveryPriority.equivalentDrop, 40);
    assert.strictEqual(recoveryWins.action.recoveryPriority.profitDrop, 39);
    assert.strictEqual(profitWins.action.kind, 'seek-enemy');
    assert.strictEqual(profitWins.action.target.userId, 8);
    cases.push('recovery-priority-yields-to-higher-equivalent-drop-profit');
  }

  {
    // 低血量长途接近一旦被第三方打断, 已投入的体力全额沉没且没有任何收益,
    // 所以超出血量对应的接近预算时先恢复; 血量回到高位后不再限制。
    const farProfit = {
      nowMs: 1000,
      targetX: 100000,
      targetVx: 0,
      targetMode: 'Passive',
      targetDrop: 101
    };
    const gated = buildBrowserlessDecision(state({ ...farProfit, hp: 50 }), {}, decisionOptions(1000));
    const ungated = buildBrowserlessDecision(state({ ...farProfit, hp: 85 }), {}, decisionOptions(1000));
    assert.strictEqual(gated.action.kind, 'recover');
    assert.strictEqual(gated.action.recoveryPriority.reason, 'recovery-priority-low-hp-approach-cost');
    assert.strictEqual(gated.action.recoveryPriority.approachStaminaBudget, 75000);
    assert.strictEqual(gated.action.recoveryPriority.approachStaminaCost > 75000, true);
    assert.strictEqual(ungated.action.kind, 'seek-enemy');
    assert.strictEqual(ungated.action.target.userId, 8);
    cases.push('recovery-priority-blocks-low-hp-long-approach');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = confirmLowHpContact(buildBrowserlessDecision, stateful);
    assert.strictEqual(decision.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(decision.action.kind, 'safety-exit');
    assert.strictEqual(decision.action.shouldLeave, true);
    assert.strictEqual(nonZeroDirection(decision.action), true);
    assert.strictEqual(decision.action.recoveryContact.evidence.selfHp, 50);
    assert.strictEqual(decision.action.recoveryContact.evidence.lowHpThreshold, 50);
    cases.push('low-hp-recovery-direct-closing-leaves-before-contact');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const outside = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, hp: 98, targetX: 19600, targetVx: -50 }),
      stateful,
      decisionOptions(1000)
    );
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1050, tick: 101, hp: 98, targetX: 14000, targetVx: -50 }),
      stateful,
      decisionOptions(1050)
    );
    assert.strictEqual(outside.reason, 'wait-for-full-stamina-and-hp');
    assert.notStrictEqual(outside.action.kind, 'flee');
    assert.strictEqual(decision.reason, 'wait-for-full-stamina-and-hp');
    assert.strictEqual(decision.combat.target, null);
    assert.notStrictEqual(decision.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(stateful.recoveryContactGuard, null);
    cases.push('high-hp-recovery-contact-without-attack-evidence-keeps-waiting');
  }

  {
    const decisionState = {
      lastDecisionAction: {
        kind: 'wait',
        band: 'wait',
        reason: 'no-profitable-candidate'
      }
    };
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, targetX: 10000, targetVx: -50, targetFiring: true }),
      decisionState,
      decisionOptions(1000)
    );
    assert.strictEqual(decision.reason, 'combat-live-realtime');
    assert.strictEqual(decisionState.recoveryContactGuard, null);
    cases.push('non-hp-recover-band-does-not-arm-guard');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, hp: 50, targetX: 19000, targetVx: 0, targetVy: 50 }),
      stateful,
      decisionOptions(1000)
    );
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1050, tick: 101, hp: 50, targetX: 19000, targetY: 100, targetVx: 0, targetVy: 50 }),
      stateful,
      decisionOptions(1050)
    );
    assert.notStrictEqual(decision.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(Boolean(stateful.recoveryContactGuard?.active), false);
    cases.push('low-hp-tangential-active-player-does-not-trigger');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, hp: 98, targetX: 14000, targetVx: -50 }),
      stateful,
      decisionOptions(1000, {
        easyKillPlayerTracker: {
          status: () => ({ players: [{ userId: 8, score: 3 }] })
        }
      })
    );
    assert.strictEqual(decision.reason, 'combat-live-realtime');
    assert.strictEqual(decision.combat.target.userId, 8);
    assert.strictEqual(decision.combat.target.easyKillProfitTarget, true);
    cases.push('healthy-recovery-allows-selected-easy-kill-into-combat');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, hp: 98, targetX: 6800, targetVx: -50, targetDrop: 1 }),
      stateful,
      decisionOptions(1000, {
        dynamicWhitelistMemberUserIds: [8],
        dynamicWhitelistEnabledUserIds: [8]
      })
    );
    assert.strictEqual(decision.reason, 'wait-for-full-stamina-and-hp');
    assert.strictEqual(decision.combat.target, null);
    assert.strictEqual(
      decision.whitelistSafety.targets[0].policy.reason,
      'dynamic-whitelist-healthy-pass-through'
    );
    cases.push('healthy-recovery-allows-dynamic-whitelist-pass-through');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = confirmLowHpContact(buildBrowserlessDecision, stateful, { stamina5s: 3000 });
    assert.strictEqual(decision.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(decision.action.shouldLeave, true);
    assert.strictEqual(nonZeroDirection(decision.action), true);
    cases.push('low-hp-contact-leave-does-not-depend-on-dodge-budget');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, targetX: 16000, targetVx: -50, withBullet: true }),
      stateful,
      decisionOptions(1000)
    );
    assert.strictEqual(decision.reason, 'incoming-bullet-dodge');
    assert.strictEqual(nonZeroDirection(decision.action), true);
    cases.push('incoming-collision-bullet-dodge-keeps-higher-priority');
  }

  {
    const stateful = {
      lastDecisionAction: recoveryAction(),
      recoveryContactGuard: { armedByRecovery: true, active: true, targetId: '8', observedAt: 1000 }
    };
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1100, tick: 102, hp: 98, targetX: 18800, targetVx: -50 }),
      stateful,
      decisionOptions(1100)
    );
    assert.notStrictEqual(decision.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(stateful.recoveryContactGuard, null);
    cases.push('healthy-recovery-clears-legacy-contact-guard-state');
  }

  {
    const healthySelf = state().realtime.self;
    const lowHpSelf = { ...healthySelf, hp: 50 };
    const target = {
      user_id: 8,
      name: 'ordinary-active',
      x: 19000,
      y: 0,
      vx: -50,
      vy: 0,
      distance: 19000,
      active: true,
      authority: 'realtime'
    };
    const healthy = updateRecoveryContactGuardCore(null, {
      nowMs: 1000,
      observationKey: 100,
      self: healthySelf,
      targets: [target],
      recovering: true,
      previousAction: recoveryAction()
    });
    const first = updateRecoveryContactGuardCore(null, {
      nowMs: 1000,
      observationKey: 100,
      self: lowHpSelf,
      targets: [target],
      recovering: true,
      previousAction: recoveryAction()
    });
    const confirmed = updateRecoveryContactGuardCore(first.state, {
      nowMs: 1050,
      observationKey: 101,
      self: lowHpSelf,
      targets: [{ ...target, x: 18800, distance: 18800 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    assert.strictEqual(healthy.reason, 'healthy-recovery-contact-no-guard');
    assert.strictEqual(healthy.state, null);
    assert.strictEqual(first.decision, null);
    assert.strictEqual(confirmed.decision.reason, 'recovery-low-hp-contact-leave');
    cases.push('core-only-arms-low-hp-recovery-contact');
  }

  {
    const fullState = { lastDecisionAction: recoveryAction() };
    const realtimeState = { lastDecisionAction: recoveryAction() };
    const full = confirmLowHpContact(buildBrowserlessDecision, fullState);
    const realtime = confirmLowHpContact(buildBrowserlessRealtimeControlDecision, realtimeState);
    assert.strictEqual(full.reason, 'recovery-low-hp-contact-leave');
    assert.strictEqual(realtime.reason, 'recovery-low-hp-contact-leave');
    assert.deepStrictEqual(
      { kind: full.action.kind, shouldLeave: full.action.shouldLeave },
      { kind: realtime.action.kind, shouldLeave: realtime.action.shouldLeave }
    );
    cases.push('full-and-realtime-arbitration-are-consistent');
  }

  {
    const adapter = createBrowserlessDecisionAdapter();
    adapter.patchState({
      lastDecisionAction: recoveryAction(),
      recoveryContactGuard: { active: true, targetId: '8', observedAt: 2000 }
    });
    const persistence = adapter.getRealtimePersistenceState();
    const synced = adapter.syncPlannerDecision({
      action: recoveryAction(),
      stateful: {
        lastDecisionAction: recoveryAction(),
        opportunityChoice: null,
        switchLock: null,
        recoveryContactGuard: { active: false, targetId: '8', observedAt: 1000 }
      }
    });
    assert.strictEqual(persistence.lastDecisionAction.reason, 'wait-for-full-stamina-and-hp');
    assert.strictEqual(persistence.recoveryContactGuard.observedAt, 2000);
    assert.strictEqual(synced, true);
    assert.strictEqual(adapter.getState().recoveryContactGuard.observedAt, 2000);
    cases.push('worker-state-patch-preserves-newer-realtime-guard');
  }

  {
    const status = {
      recentExit: {
        recoveryContact: {
          evidence: { trigger: 'real-collision-bullet' }
        }
      }
    };
    assert.strictEqual(
      recoveryContactExitReasonTextCore(status, 'recovery-low-hp-contact-leave'),
      '低血量恢复时检测到碰撞路径来弹，主动退出'
    );
    assert.strictEqual(
      recoveryContactExitReasonTextCore({ recentExit: { recoveryContact: { evidence: { trigger: 'direct-closing-confirmed' } } } }, 'recovery-low-hp-contact-leave'),
      '低血量恢复时确认活动玩家持续接近，主动退出'
    );
    cases.push('panel-recovery-contact-reason-follows-structured-trigger');
  }

  return { ok: true, cases };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(runRecoveryContactSelfTest(), null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = { runRecoveryContactSelfTest };
