'use strict';

const { createBrowserlessActionAdapter } = require('./action-adapter');
const { buildBrowserlessRealtimeControlDecision } = require('./decision-adapter');
const { rememberBrowserlessCombatEngagement } = require('./combat-adapter');
const { pickEngagedCombatTargetCore } = require('../../strategy/combat-target-selection');

function runCombatTargetFrameGapSelfTest() {
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`combat target frame-gap self-test failed: ${name}`);
  };

  const targetId = 32551;
  const nowMs = Date.parse('2026-08-08T01:34:28.574Z');
  const self = {
    user_id: 28886,
    name: 'self',
    x: 1575,
    y: -3248,
    hp: 91,
    max_hp: 100,
    stamina_5s_remaining_milli: 3350,
    current_join_mode: 'Active'
  };
  const target = {
    user_id: targetId,
    name: 'dynamic-target',
    x: 4089,
    y: 346,
    hp: 97,
    drop: 2424,
    current_join_mode: 'Active'
  };
  const rememberedTarget = {
    id: targetId,
    at: nowMs,
    firstSeenAt: nowMs - 1073,
    name: target.name,
    x: target.x,
    y: target.y,
    hp: target.hp,
    firstHp: target.hp,
    minHp: target.hp,
    distance: 3898,
    intent: 'profit',
    originIntent: 'defensive',
    reason: 'combat-live-realtime',
    lastInRangeAt: nowMs,
    self: { ...self }
  };
  const decisionState = {
    combatTarget: { ...rememberedTarget },
    combatEngagements: { [String(targetId)]: { ...rememberedTarget } },
    combatMetrics: {
      targetId: String(targetId),
      targetName: target.name,
      startedAt: rememberedTarget.firstSeenAt,
      acceptedShots: 0,
      targetDamage: 0,
      totalStaminaSpent: 0
    }
  };
  const options = {
    controlMode: 'profit-live',
    combatEnabled: true,
    combatAttackRange: 14500,
    combatDisengageRange: 17000,
    combatEngageGraceRange: 17000,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 30000,
    targetStickMs: 5000,
    combatControlIntervalMs: 50,
    combatTargetFrameGapHoldMs: 250,
    dynamicWhitelistMemberUserIds: [targetId],
    dynamicWhitelistEnabledUserIds: [targetId],
    dailyDamageUserIds: [targetId]
  };
  const frame = (tick, receivedAtMs, entities) => ({
    userId: self.user_id,
    realtime: {
      tick,
      receivedAtMs,
      frameAgeMs: 0,
      self,
      entities: [self, ...entities],
      bullets: []
    },
    fallback: {
      tick: tick - 1,
      receivedAtMs: receivedAtMs - 50,
      frameAgeMs: 50,
      entities: [],
      coinDrops: []
    }
  });

  const visibleRetainedState = { combatTarget: { ...rememberedTarget } };
  const visibleRetained = pickEngagedCombatTargetCore(
    self,
    [{ ...target, authority: 'realtime', active: true, distance: 3898, dynamicWhitelistMember: true,
      whitelistContactPolicy: { dynamicWhitelistMember: true, proactiveCombatEligible: false } }],
    [{ ...target, authority: 'realtime', active: true, distance: 3898, dynamicWhitelistMember: true,
      whitelistContactPolicy: { dynamicWhitelistMember: true, proactiveCombatEligible: false } }],
    [],
    visibleRetainedState,
    {
      ...options,
      nowMs: nowMs + 25,
      defensiveEngagementTargetId: String(targetId),
      incomingBullet: null
    }
  );
  assert('defensive origin survives a current profit intent',
    visibleRetained?.combatIntent === 'engaged'
      && visibleRetainedState.combatTarget?.originIntent === 'defensive');

  const missingDecision = buildBrowserlessRealtimeControlDecision(
    frame(685275, nowMs + 49, []),
    decisionState,
    { ...options, nowMs: nowMs + 49 }
  );
  assert('single missing frame keeps realtime combat ownership',
    missingDecision.action?.kind === 'combat-live'
      && missingDecision.action?.band === 'combat'
      && missingDecision.action?.reason === 'combat-target-frame-gap-hold'
      && missingDecision.combat?.target === null
      && missingDecision.combat?.targetFrameGapHold?.active === true
      && missingDecision.combat?.targetFrameGapHold?.targetId === String(targetId)
      && decisionState.combatTarget?.originIntent === 'defensive');
  assert('missing-frame hold does not aim or request fire',
    missingDecision.combat?.aim === null
      && missingDecision.combat?.shooting?.wouldShoot === false);

  let velocitySends = 0;
  let shootSends = 0;
  const actionAdapter = createBrowserlessActionAdapter({
    transport: {
      sendVelocity() { velocitySends += 1; },
      sendShoot() { shootSends += 1; }
    },
    now: () => nowMs + 49,
    commandIntervalMs: 0
  });
  const holdActionResult = actionAdapter.applyDecision(
    frame(685275, nowMs + 49, []),
    missingDecision
  );
  assert('missing-frame hold sends neither stop nor stale combat commands',
    holdActionResult.ok === true
      && holdActionResult.skipped === true
      && holdActionResult.reason === 'combat-target-frame-gap-hold'
      && velocitySends === 0
      && shootSends === 0);

  const restoredDecision = buildBrowserlessRealtimeControlDecision(
    frame(685276, nowMs + 100, [target]),
    decisionState,
    { ...options, nowMs: nowMs + 100 }
  );
  assert('same defensive target resumes as secondary on the next visible frame',
    restoredDecision.action?.kind === 'combat-live'
      && restoredDecision.action?.reason === 'combat-live-realtime'
      && restoredDecision.combat?.target?.userId === targetId
      && restoredDecision.combat?.target?.combatIntent === 'secondary'
      && restoredDecision.combat?.target?.combatRole === 'secondary'
      && decisionState.combatTarget?.originIntent === 'defensive');

  const sparseMetadataState = {};
  const metadataOptions = {
    nowMs,
    currentTick: 685274,
    commandShooting: { controlGeneration: 'metadata-test', lastConfirmationSequence: 0, lastRequestSequence: 0 }
  };
  rememberBrowserlessCombatEngagement(
    sparseMetadataState,
    self,
    { ...target, name: 'metadata-target', drop: 2424, combatIntent: 'profit' },
    metadataOptions
  );
  rememberBrowserlessCombatEngagement(
    sparseMetadataState,
    self,
    {
      user_id: targetId,
      x: target.x + 10,
      y: target.y + 10,
      hp: target.hp,
      combatIntent: 'profit'
    },
    { ...metadataOptions, nowMs: nowMs + 50, currentTick: 685275 }
  );
  assert('sparse realtime metadata preserves the last known Drop and name',
    sparseMetadataState.combatTarget?.drop === 2424
      && sparseMetadataState.combatTarget?.dropKnown === true
      && sparseMetadataState.combatTarget?.name === 'metadata-target');

  buildBrowserlessRealtimeControlDecision(
    frame(685282, nowMs + 149, []),
    decisionState,
    { ...options, nowMs: nowMs + 149 }
  );
  const expiredDecision = buildBrowserlessRealtimeControlDecision(
    frame(685283, nowMs + 451, []),
    decisionState,
    { ...options, nowMs: nowMs + 451 }
  );
  assert('sustained target absence releases after the bounded hold',
    expiredDecision.action === null
      && expiredDecision.combat?.targetFrameGapHold === null
      && expiredDecision.combat?.targetFrameGapReset?.reason === 'combat-target-frame-gap-reset'
      && decisionState.combatTarget === null
      && decisionState.combatMetrics === null
      && !decisionState.combatEngagements[String(targetId)]);

  const reappearingState = {
    combatTarget: {
      ...rememberedTarget,
      drop: 2424,
      dropKnown: true,
      at: nowMs
    },
    combatEngagements: { [String(targetId)]: { ...rememberedTarget, drop: 2424, dropKnown: true, at: nowMs } },
    combatMetrics: {
      targetId: String(targetId),
      targetName: target.name,
      startedAt: nowMs - 5000,
      acceptedShots: 84,
      targetDamage: 0,
      totalStaminaSpent: 20000,
      engagementGeneration: 'old-segment'
    },
    combatAim: { targetId },
    combatHpObservationTargetId: String(targetId),
    combatHpObservationBuffer: { observations: [{ atMs: nowMs }] }
  };
  const farSparseTarget = {
    user_id: targetId,
    x: self.x + 32836,
    y: self.y,
    hp: 100,
    current_join_mode: 'Active'
  };
  buildBrowserlessRealtimeControlDecision(
    frame(685283, nowMs + 49, []),
    reappearingState,
    { ...options, nowMs: nowMs + 49 }
  );
  const reappearanceDecision = buildBrowserlessRealtimeControlDecision(
    frame(685284, nowMs + 451, [farSparseTarget]),
    reappearingState,
    { ...options, nowMs: nowMs + 451 }
  );
  assert('post-gap reappearance does not reuse the old close-pressure segment',
    reappearanceDecision.combat?.target === null
      && reappearanceDecision.combat?.exit === null
      && reappearingState.combatTarget === null
      && reappearingState.combatMetrics === null
      && !reappearingState.combatEngagements[String(targetId)]
      && reappearingState.combatAim === null
      && reappearingState.combatHpObservationTargetId === '');

  const invulnerableState = {
    combatTarget: { ...rememberedTarget },
    combatEngagements: { [String(targetId)]: { ...rememberedTarget } }
  };
  const invulnerableDecision = buildBrowserlessRealtimeControlDecision(
    frame(685276, nowMs + 100, [{ ...target, invulnerable: true, invulnerable_remaining_ms: 1000 }]),
    invulnerableState,
    { ...options, nowMs: nowMs + 100 }
  );
  assert('visible invulnerability is not treated as a missing-frame hold',
    invulnerableDecision.combat?.targetFrameGapHold === null
      && invulnerableDecision.action?.reason !== 'combat-target-frame-gap-hold');

  return {
    ok: cases.every(item => item.ok),
    passed: cases.filter(item => item.ok).length,
    total: cases.length,
    cases
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(runCombatTargetFrameGapSelfTest(), null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = { runCombatTargetFrameGapSelfTest };
