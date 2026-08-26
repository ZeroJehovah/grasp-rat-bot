'use strict';

const assert = require('assert');
const {
  buildBrowserlessDecision,
  buildBrowserlessRealtimeControlDecision,
  createBrowserlessDecisionAdapter
} = require('./decision-adapter');
const {
  recoveryEngagedThreatPolicy,
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

// 2026-08-26 14:39 与 mango 的交战: 主目标只是一个 1 金币, mango 只作为副目标防御
// 交战。对方火力间歇 2562ms 时旧逻辑放掉交战, 当轮 recover 硬门候选原地站桩,
// 我们在攻击距离内白吃伤害并被迫重新接触三次。
function engagedSecondaryScenario(nowMs, options = {}) {
  const self = {
    entity_id: 106,
    user_id: 7,
    name: 'self',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: Number(options.hp ?? 94),
    max_hp: 100,
    drop: 11702,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 2239,
    stamina_5s_limit_milli: 10000,
    stamina_1h_remaining_milli: 2462603,
    stamina_1h_limit_milli: 3600000,
    stamina_1d_remaining_milli: 7131632,
    stamina_1d_limit_milli: 10000000
  };
  const target = {
    entity_id: 207,
    user_id: 8,
    name: 'mango',
    x: Number(options.targetX ?? 2385),
    y: 0,
    vx: 0,
    vy: 0,
    hp: 52,
    max_hp: 100,
    drop: 4,
    current_join_mode: 'Active',
    firing: false,
    stamina_5s_remaining_milli: 2350,
    stamina_5s_limit_milli: 10000
  };
  return {
    input: {
      userId: 7,
      realtime: {
        tick: 6100,
        frameAgeMs: 0,
        receivedAtMs: nowMs,
        self,
        entities: [self, target],
        bullets: [],
        coinDrops: []
      },
      fallback: {
        tick: 6100,
        frameAgeMs: 0,
        receivedAtMs: nowMs,
        entities: [],
        coinDrops: [],
        messages: []
      }
    },
    stateful: {
      lastDecisionAction: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime' },
      combatTarget: {
        id: '8',
        at: nowMs - 120,
        firstSeenAt: nowMs - 22000,
        name: 'mango',
        x: target.x,
        y: target.y,
        hp: 52,
        firstHp: 100,
        minHp: 52,
        damageFromStart: 48,
        lastDamageAmount: 3,
        lastDamageAt: nowMs - 494,
        distance: target.x,
        drop: 4,
        active: true,
        firing: false,
        intent: 'defensive',
        originIntent: 'defensive',
        combatRole: 'secondary',
        secondaryTarget: true,
        lastFiringAt: nowMs - 2562,
        lastThreatAt: nowMs - 2562,
        lastIncomingBulletAt: 0,
        hasDamagedSelf: true,
        lastSelfDamageAt: nowMs - 2658,
        lastInRangeAt: nowMs - 120,
        reason: 'realtime-defensive-evidence'
      }
    }
  };
}

function candidateKeys(decision) {
  return (decision?.finalSelection?.candidates || []).map(item => `${item.kind}:${item.reason}`);
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
    assert.strictEqual(decision.recoveryEngagedThreat, null);
    cases.push('high-hp-recovery-contact-without-attack-evidence-keeps-waiting');
  }

  {
    const nowMs = 1000000;
    const held = engagedSecondaryScenario(nowMs);
    const heldDecision = buildBrowserlessDecision(held.input, held.stateful, decisionOptions(nowMs));
    const released = engagedSecondaryScenario(nowMs);
    const releasedDecision = buildBrowserlessDecision(
      released.input,
      released.stateful,
      decisionOptions(nowMs, { secondaryOwnDamageRetentionEnabled: false })
    );
    assert.strictEqual(heldDecision.reason, 'combat-live-realtime');
    assert.strictEqual(heldDecision.combat.target.userId, 8);
    assert.strictEqual(heldDecision.combat.secondaryRetention.retained, true);
    assert.strictEqual(heldDecision.combat.secondaryRetention.latestEvidenceType, 'own-damage-progress');
    assert.strictEqual(heldDecision.combat.secondaryRetention.reason, 'secondary-own-damage-progress-grace');
    assert.strictEqual(heldDecision.combat.secondaryRetention.ageMs, 494);
    assert.strictEqual(Boolean(heldDecision.action.stopMotion), false);
    assert.strictEqual(releasedDecision.reason, 'wait-for-full-stamina-and-hp');
    assert.strictEqual(releasedDecision.combat.target, null);
    assert.strictEqual(releasedDecision.combat.secondaryRetention.retained, false);
    assert.strictEqual(
      releasedDecision.combat.secondaryRetention.ownDamageProgress.reason,
      'own-damage-retention-disabled'
    );
    assert.strictEqual(releasedDecision.action.stopMotion, true);
    cases.push('own-damage-progress-keeps-secondary-engagement-through-hostile-fire-gap');
  }

  {
    const nowMs = 1000000;
    const guarded = engagedSecondaryScenario(nowMs);
    const guardedDecision = buildBrowserlessDecision(guarded.input, guarded.stateful, decisionOptions(nowMs));
    const ungated = engagedSecondaryScenario(nowMs);
    const ungatedDecision = buildBrowserlessDecision(
      ungated.input,
      ungated.stateful,
      decisionOptions(nowMs, { recoveryEngagedThreatHoldSuppressionEnabled: false })
    );
    assert.strictEqual(guardedDecision.recoveryEngagedThreat.suppressed, true);
    assert.strictEqual(guardedDecision.recoveryEngagedThreat.evidence.trigger, 'established-engagement');
    assert.strictEqual(guardedDecision.recoveryEngagedThreat.evidence.distance, 2385);
    assert.strictEqual(guardedDecision.recoveryEngagedThreat.evidence.attackRange, 14500);
    assert.strictEqual(
      candidateKeys(guardedDecision).includes('recover:wait-for-full-stamina-and-hp'),
      false
    );
    assert.strictEqual(ungatedDecision.recoveryEngagedThreat, null);
    assert.strictEqual(
      candidateKeys(ungatedDecision).includes('recover:wait-for-full-stamina-and-hp'),
      true
    );
    assert.strictEqual(guardedDecision.reason, ungatedDecision.reason);
    cases.push('engaged-threat-in-attack-range-drops-the-recovery-hold-candidate');
  }

  {
    const nowMs = 1000000;
    const outOfRange = engagedSecondaryScenario(nowMs, { targetX: 14501 });
    const outOfRangeDecision = buildBrowserlessDecision(
      outOfRange.input,
      outOfRange.stateful,
      decisionOptions(nowMs)
    );
    const lowHp = engagedSecondaryScenario(nowMs, { hp: 50 });
    const lowHpDecision = buildBrowserlessDecision(lowHp.input, lowHp.stateful, decisionOptions(nowMs));
    assert.strictEqual(outOfRangeDecision.recoveryEngagedThreat, null);
    assert.strictEqual(outOfRangeDecision.combat.secondaryRetention.retained, false);
    assert.strictEqual(
      outOfRangeDecision.combat.secondaryRetention.ownDamageProgress.reason,
      'target-outside-attack-range'
    );
    assert.strictEqual(lowHpDecision.recoveryEngagedThreat, null);
    assert.strictEqual(lowHpDecision.combat.secondaryRetention.retained, false);
    assert.strictEqual(
      lowHpDecision.combat.secondaryRetention.ownDamageProgress.reason,
      'self-hp-at-or-below-leave-threshold'
    );
    cases.push('own-damage-retention-grants-no-chase-and-no-low-hp-hold');
  }

  {
    const nowMs = 1000000;
    const self = { user_id: 7, x: 0, y: 0, hp: 94 };
    const engagedTarget = {
      user_id: 8,
      name: 'mango',
      x: 2385,
      y: 0,
      distance: 2385,
      active: true,
      firing: false,
      authority: 'realtime'
    };
    const context = {
      self,
      recovering: true,
      nowMs,
      targets: [engagedTarget],
      engagedTargetId: '8'
    };
    const suppressed = recoveryEngagedThreatPolicy(context);
    const idle = recoveryEngagedThreatPolicy({ ...context, engagedTargetId: '' });
    const firingOnly = recoveryEngagedThreatPolicy({
      ...context,
      engagedTargetId: '',
      targets: [{ ...engagedTarget, firing: true }]
    });
    const outOfRange = recoveryEngagedThreatPolicy({
      ...context,
      targets: [{ ...engagedTarget, x: 14501, distance: 14501 }]
    });
    const whitelisted = recoveryEngagedThreatPolicy({
      ...context,
      targets: [{ ...engagedTarget, whitelisted: true }]
    });
    const snapshotOnly = recoveryEngagedThreatPolicy({
      ...context,
      targets: [{ ...engagedTarget, authority: 'snapshot' }]
    });
    const lowHp = recoveryEngagedThreatPolicy({ ...context, self: { ...self, hp: 50 } });
    const notRecovering = recoveryEngagedThreatPolicy({ ...context, recovering: false });
    const disabled = recoveryEngagedThreatPolicy(context, {
      recoveryEngagedThreatHoldSuppressionEnabled: false
    });
    assert.strictEqual(suppressed.suppressed, true);
    assert.strictEqual(suppressed.reason, 'engaged-threat-in-attack-range');
    assert.strictEqual(suppressed.evidence.trigger, 'established-engagement');
    assert.strictEqual(idle.suppressed, false);
    assert.strictEqual(idle.reason, 'no-engaged-threat-in-attack-range');
    assert.strictEqual(firingOnly.suppressed, true);
    assert.strictEqual(firingOnly.evidence.trigger, 'target-firing');
    assert.strictEqual(outOfRange.suppressed, false);
    assert.strictEqual(whitelisted.suppressed, false);
    assert.strictEqual(snapshotOnly.suppressed, false);
    assert.strictEqual(lowHp.suppressed, false);
    assert.strictEqual(lowHp.reason, 'low-hp-recovery-owns-contact');
    assert.strictEqual(notRecovering.suppressed, false);
    assert.strictEqual(notRecovering.reason, 'not-recovering');
    assert.strictEqual(disabled.suppressed, false);
    assert.strictEqual(disabled.reason, 'engaged-threat-hold-suppression-disabled');
    cases.push('engaged-threat-hold-suppression-requires-realtime-hostile-contact');
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
