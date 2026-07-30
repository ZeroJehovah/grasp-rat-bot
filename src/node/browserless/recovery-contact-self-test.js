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
    stamina_5s_remaining_milli: Number(options.stamina5s ?? 10000)
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
    current_join_mode: 'Active',
    firing: options.targetFiring === true,
    stamina_5s_remaining_milli: 10000,
    drop: 20
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

function confirmOuterGuard(decide, stateful, extra = {}) {
  decide(state({ nowMs: 1000, tick: 100, targetX: 19000, targetVx: -50, ...extra }), stateful, decisionOptions(1000));
  return decide(
    state({ nowMs: 1050, tick: 101, targetX: 18800, targetVx: -50, ...extra }),
    stateful,
    decisionOptions(1050)
  );
}

function runRecoveryContactSelfTest() {
  const cases = [];

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    const decision = confirmOuterGuard(buildBrowserlessDecision, stateful);
    assert.strictEqual(decision.reason, 'recovery-contact-guard-retreat');
    assert.strictEqual(decision.action.kind, 'flee');
    assert.strictEqual(decision.action.shouldLeave, false);
    assert.strictEqual(nonZeroDirection(decision.action), true);
    cases.push('committed-recovery-direct-closing-selects-retreat');
  }

  {
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, targetX: 10000, targetVx: -50, targetFiring: true }),
      {},
      decisionOptions(1000)
    );
    assert.strictEqual(decision.reason, 'combat-live-realtime');
    assert.notStrictEqual(decision.reason, 'recovery-contact-threat-leave');
    cases.push('ordinary-combat-without-recovery-commitment-is-unchanged');
  }

  {
    const decisionState = {
      lastDecisionAction: {
        kind: 'wait',
        band: 'recover',
        reason: 'outside-center-profit-wait'
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
      state({ nowMs: 1000, tick: 100, targetX: 19000, targetVx: 0, targetVy: 50 }),
      stateful,
      decisionOptions(1000)
    );
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1050, tick: 101, targetX: 19000, targetY: 100, targetVx: 0, targetVy: 50 }),
      stateful,
      decisionOptions(1050)
    );
    assert.notStrictEqual(decision.reason, 'recovery-contact-guard-retreat');
    assert.notStrictEqual(decision.reason, 'recovery-contact-threat-leave');
    assert.strictEqual(Boolean(stateful.recoveryContactGuard?.active), false);
    cases.push('tangential-active-player-does-not-trigger');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    confirmOuterGuard(buildBrowserlessDecision, stateful);
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1100, tick: 102, targetX: 14000, targetVx: -50 }),
      stateful,
      decisionOptions(1100)
    );
    assert.strictEqual(decision.reason, 'recovery-contact-threat-leave');
    assert.strictEqual(decision.action.shouldLeave, true);
    assert.strictEqual(nonZeroDirection(decision.action), true);
    cases.push('confirmed-contact-entering-attack-range-leaves-with-cover');
  }

  {
    const stateful = { lastDecisionAction: recoveryAction() };
    buildBrowserlessDecision(
      state({ nowMs: 1000, tick: 100, targetX: 19000, targetVx: -50, stamina5s: 3000 }),
      stateful,
      decisionOptions(1000)
    );
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1050, tick: 101, targetX: 18800, targetVx: -50, stamina5s: 3000 }),
      stateful,
      decisionOptions(1050)
    );
    assert.strictEqual(decision.reason, 'recovery-contact-no-dodge-budget-leave');
    assert.strictEqual(decision.action.shouldLeave, true);
    assert.strictEqual(nonZeroDirection(decision.action), true);
    cases.push('confirmed-contact-without-dodge-budget-leaves');
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
    const stateful = { lastDecisionAction: recoveryAction() };
    confirmOuterGuard(buildBrowserlessDecision, stateful);
    const decision = buildBrowserlessDecision(
      state({ nowMs: 1100, tick: 102, hp: 100, targetX: 18800, targetVx: -50 }),
      stateful,
      decisionOptions(1100)
    );
    assert.notStrictEqual(decision.reason, 'recovery-contact-guard-retreat');
    assert.strictEqual(stateful.recoveryContactGuard, null);
    cases.push('full-hp-releases-recovery-contact-guard');
  }

  {
    const self = state().realtime.self;
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
    const first = updateRecoveryContactGuardCore(null, {
      nowMs: 1000,
      observationKey: 100,
      self,
      targets: [target],
      recovering: true,
      previousAction: recoveryAction()
    });
    const confirmed = updateRecoveryContactGuardCore(first.state, {
      nowMs: 1050,
      observationKey: 101,
      self,
      targets: [{ ...target, x: 18800, distance: 18800 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    const missingOnce = updateRecoveryContactGuardCore(confirmed.state, {
      nowMs: 1100,
      observationKey: 102,
      self,
      targets: [],
      recovering: true,
      previousAction: recoveryAction()
    });
    const released = updateRecoveryContactGuardCore(missingOnce.state, {
      nowMs: 2600,
      observationKey: 103,
      self,
      targets: [],
      recovering: true,
      previousAction: recoveryAction()
    });
    assert.strictEqual(missingOnce.decision.reason, 'recovery-contact-guard-retreat');
    assert.strictEqual(missingOnce.decision.retained, true);
    assert.strictEqual(released.decision, null);
    assert.strictEqual(released.state, null);
    cases.push('missing-target-hysteresis-retains-then-releases');
  }

  {
    const self = state().realtime.self;
    const target = {
      user_id: 8,
      x: 19000,
      y: 0,
      vx: -50,
      vy: 0,
      distance: 19000,
      active: true,
      authority: 'realtime'
    };
    const first = updateRecoveryContactGuardCore(null, {
      nowMs: 1000,
      observationKey: 100,
      self,
      targets: [target],
      recovering: true,
      previousAction: recoveryAction()
    });
    const confirmed = updateRecoveryContactGuardCore(first.state, {
      nowMs: 1050,
      observationKey: 101,
      self,
      targets: [{ ...target, x: 18800, distance: 18800 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    const outsideOnce = updateRecoveryContactGuardCore(confirmed.state, {
      nowMs: 1100,
      observationKey: 102,
      self,
      targets: [{ ...target, x: 22000, distance: 22000 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    const duplicate = updateRecoveryContactGuardCore(outsideOnce.state, {
      nowMs: 1200,
      observationKey: 102,
      self,
      targets: [{ ...target, x: 22000, distance: 22000 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    const released = updateRecoveryContactGuardCore(duplicate.state, {
      nowMs: 2600,
      observationKey: 103,
      self,
      targets: [{ ...target, x: 22000, distance: 22000 }],
      recovering: true,
      previousAction: recoveryAction()
    });
    assert.strictEqual(outsideOnce.state.clearConfirmations, 1);
    assert.strictEqual(duplicate.state.clearConfirmations, 1);
    assert.strictEqual(duplicate.decision.reason, 'recovery-contact-guard-retreat');
    assert.strictEqual(released.state, null);
    cases.push('release-radius-needs-two-fresh-clear-observations');
  }

  {
    const fullState = { lastDecisionAction: recoveryAction() };
    const realtimeState = { lastDecisionAction: recoveryAction() };
    const full = confirmOuterGuard(buildBrowserlessDecision, fullState);
    const realtime = confirmOuterGuard(buildBrowserlessRealtimeControlDecision, realtimeState);
    assert.strictEqual(full.reason, 'recovery-contact-guard-retreat');
    assert.strictEqual(realtime.reason, 'recovery-contact-guard-retreat');
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
