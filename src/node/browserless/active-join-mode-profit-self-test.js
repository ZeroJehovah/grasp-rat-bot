'use strict';

const { createBrowserlessStateStore } = require('./state-store');
const { buildBrowserlessDecision, buildOpportunityDecision } = require('./decision-adapter');

const HELD_NOW_MS = 100000;

function frameSelf() {
  return {
    entity_id: 1,
    user_id: 7,
    name: 'self',
    x: 0,
    y: 0,
    hp: 100,
    max_hp: 100,
    life: 'Alive',
    stamina_1d_remaining_milli: 20000000,
    stamina_1d_limit_milli: 20000000,
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000
  };
}

// The nearby panel ships compact tuples; these are the display slots this test
// asserts on. See the player row builder in decision-adapter.js.
const NEARBY_ROW_NAME = 0;
const NEARBY_ROW_MODE = 7;
const NEARBY_ROW_AFK = 10;

function nearbyPlayerRow(decision, name) {
  return (decision.input?.nearby?.p || []).find(row => (
    Array.isArray(row) && String(row[NEARBY_ROW_NAME] || '') === name
  )) || null;
}

function idlePlayer(overrides = {}) {
  return {
    hp: 80,
    max_hp: 100,
    life: 'Alive',
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000,
    ...overrides
  };
}

// A stationary, non-firing Active-mode player with full 5s stamina used to look
// like a deterministic AFK reward. It must lose to a lower-drop Passive player.
function runActiveJoinModeAfkExclusionCheck() {
  const store = createBrowserlessStateStore({ userId: 7 });
  store.ingestFrame({
    type: 'pos',
    tick: 101,
    entities: [
      frameSelf(),
      idlePlayer({ entity_id: 2, user_id: 8, name: 'active-idle-far', x: 48000, y: 0, current_join_mode: 'Active', drop: 30 }),
      idlePlayer({ entity_id: 3, user_id: 9, name: 'passive-idle-near', x: 20000, y: 0, current_join_mode: 'Passive', drop: 12 })
    ],
    bullets: [],
    coin_drops: []
  }, { receivedAtMs: 1000 });
  const decision = buildBrowserlessDecision(store.getState(1200), {}, {
    nowMs: 1200,
    controlMode: 'profit-live',
    combatEnabled: true
  });
  const row = nearbyPlayerRow(decision, 'active-idle-far');
  return {
    name: 'active-join-mode-idle-player-is-not-an-afk-profit-target',
    passed: decision.action?.target?.userId === 9
      && (decision.input?.dataGaps || []).includes('active-join-mode-afk-candidate-excluded')
      && row !== null
      && String(row[NEARBY_ROW_MODE] || '') === 'Active'
      && row[NEARBY_ROW_AFK] === 0,
    detail: {
      targetUserId: decision.action?.target?.userId ?? null,
      dataGapPresent: (decision.input?.dataGaps || []).includes('active-join-mode-afk-candidate-excluded'),
      nearbyMode: row ? row[NEARBY_ROW_MODE] : null,
      nearbyAfk: row ? row[NEARBY_ROW_AFK] : null
    }
  };
}

// The same frame without the Active join mode must still admit the far, higher
// drop player, so the exclusion cannot be read as a distance or drop change.
function runPassiveJoinModeAfkAdmissionCheck() {
  const store = createBrowserlessStateStore({ userId: 7 });
  store.ingestFrame({
    type: 'pos',
    tick: 102,
    entities: [
      frameSelf(),
      idlePlayer({ entity_id: 2, user_id: 8, name: 'passive-idle-far', x: 48000, y: 0, current_join_mode: 'Passive', drop: 30 }),
      idlePlayer({ entity_id: 3, user_id: 9, name: 'passive-idle-near', x: 20000, y: 0, current_join_mode: 'Passive', drop: 12 })
    ],
    bullets: [],
    coin_drops: []
  }, { receivedAtMs: 1000 });
  const decision = buildBrowserlessDecision(store.getState(1200), {}, {
    nowMs: 1200,
    controlMode: 'profit-live',
    combatEnabled: true
  });
  const row = nearbyPlayerRow(decision, 'passive-idle-far');
  return {
    name: 'passive-join-mode-idle-player-remains-an-afk-profit-target',
    passed: decision.action?.target?.userId === 8
      && !(decision.input?.dataGaps || []).includes('active-join-mode-afk-candidate-excluded')
      && row !== null
      && row[NEARBY_ROW_AFK] === 1,
    detail: {
      targetUserId: decision.action?.target?.userId ?? null,
      dataGapPresent: (decision.input?.dataGaps || []).includes('active-join-mode-afk-candidate-excluded'),
      nearbyAfk: row ? row[NEARBY_ROW_AFK] : null
    }
  };
}

// Refusing the AFK reward model must not orphan the player: an in-range Active
// player with a real drop still has to be reachable as an ordinary active profit
// target, priced by the active completion model rather than skipped entirely.
function runInRangeActivePlayerStaysReachableCheck() {
  const store = createBrowserlessStateStore({ userId: 7 });
  store.ingestFrame({
    type: 'pos',
    tick: 103,
    entities: [
      frameSelf(),
      idlePlayer({ entity_id: 2, user_id: 8, name: 'active-idle-near', x: 1000, y: 0, current_join_mode: 'Active', drop: 20 })
    ],
    bullets: [],
    coin_drops: []
  }, { receivedAtMs: 1000 });
  const decision = buildBrowserlessDecision(store.getState(1200), {}, {
    nowMs: 1200,
    controlMode: 'profit-live',
    combatEnabled: true
  });
  const effective = decision.action?.effectiveProfitReward || null;
  return {
    name: 'in-range-active-player-stays-a-profit-target-under-the-active-reward-model',
    passed: decision.action?.target?.userId === 8
      && effective !== null
      && effective.modelSource !== 'deterministic-afk-target'
      && Number(effective.expectedReward) < 20,
    detail: {
      kind: decision.kind ?? null,
      targetUserId: decision.action?.target?.userId ?? null,
      modelSource: effective?.modelSource ?? null,
      expectedReward: effective?.expectedReward ?? null
    }
  };
}

// The reward model must not swing on a transient stamina reading: the same
// Active player priced on a full-stamina frame and on a spent-stamina frame
// yields the same expected reward. The pricing is read off the profit candidate
// rather than the chosen action, because a spent-stamina Active player is also a
// live threat and correctly moves the band to combat.
function runActiveRewardModelIsStaminaIndependentCheck() {
  const price = staminaMilli => {
    const store = createBrowserlessStateStore({ userId: 7 });
    store.ingestFrame({
      type: 'pos',
      tick: 104,
      entities: [
        frameSelf(),
        idlePlayer({
          entity_id: 2,
          user_id: 8,
          name: 'active-idle-near',
          x: 1000,
          y: 0,
          current_join_mode: 'Active',
          drop: 20,
          stamina_5s_remaining_milli: staminaMilli
        })
      ],
      bullets: [],
      coin_drops: []
    }, { receivedAtMs: 1000 });
    const decision = buildBrowserlessDecision(store.getState(1200), {}, {
      nowMs: 1200,
      controlMode: 'profit-live',
      combatEnabled: true
    });
    const candidate = (decision.profit?.candidates || []).find(item => String(item?.id ?? '') === '8') || null;
    return candidate?.effectiveProfitReward || null;
  };
  const full = price(10000);
  const spent = price(5000);
  return {
    name: 'active-player-reward-model-does-not-depend-on-transient-5s-stamina',
    passed: full !== null
      && spent !== null
      && full.modelSource === spent.modelSource
      && Number(full.expectedReward) === Number(spent.expectedReward),
    detail: {
      fullModelSource: full?.modelSource ?? null,
      spentModelSource: spent?.modelSource ?? null,
      fullExpectedReward: full?.expectedReward ?? null,
      spentExpectedReward: spent?.expectedReward ?? null
    }
  };
}

function heldSelf() {
  return {
    x: 0,
    y: 0,
    hp: 100,
    max_hp: 100,
    stamina_5s_remaining_milli: 10000,
    stamina_1h_remaining_milli: 3000000,
    stamina_1d_remaining_milli: 10000000
  };
}

function heldSubject(overrides = {}) {
  return {
    entity_id: 2,
    user_id: 8,
    name: 'mission-subject',
    x: 48000,
    y: 0,
    hp: 80,
    max_hp: 100,
    alive: true,
    authority: 'realtime',
    drop: 30,
    dropKnown: true,
    distance: 48000,
    current_join_mode: 'Active',
    joinModeActive: true,
    active: true,
    moving: true,
    firing: false,
    invulnerable: false,
    fullStamina5s: false,
    stamina_5s_remaining_milli: 9600,
    stamina_5s_limit_milli: 10000,
    ...overrides
  };
}

function heldAlternative() {
  return {
    entity_id: 3,
    user_id: 9,
    name: 'steady-afk',
    x: 20000,
    y: 0,
    hp: 80,
    max_hp: 100,
    alive: true,
    authority: 'realtime',
    drop: 12,
    dropKnown: true,
    distance: 20000,
    current_join_mode: 'Passive',
    joinModeActive: false,
    active: false,
    moving: false,
    firing: false,
    invulnerable: false,
    fullStamina5s: true,
    stamina_5s_remaining_milli: 10000,
    stamina_5s_limit_milli: 10000
  };
}

function heldMissionSelectionSource() {
  return {
    entity_id: 2,
    user_id: 8,
    name: 'mission-subject',
    x: 48000,
    y: 0,
    hp: 80,
    max_hp: 100,
    alive: true,
    authority: 'realtime',
    drop: 30,
    dropKnown: true,
    distance: 48000,
    joinModeActive: true,
    active: false,
    moving: false,
    firing: false,
    invulnerable: false,
    fullStamina5s: true
  };
}

function heldMission(overrides = {}) {
  return {
    active: true,
    key: 'enemy:8',
    missionKey: 'enemy:8',
    type: 'enemy',
    subjectId: '8',
    targetId: '8',
    navigationTarget: { x: 48000, y: 0 },
    choice: {
      type: 'enemy',
      id: '8',
      sourceTarget: heldMissionSelectionSource(),
      heldCandidateSource: 'realtime-visible'
    },
    score: 245817,
    reward: 30,
    expectedReward: 30,
    staminaCost: 50000,
    priorityTier: 1,
    highValue: true,
    heldCandidateSource: 'realtime-visible',
    heldRewardSource: 'deterministic-afk-target',
    heldRewardKnown: true,
    heldRewardObservedAt: HELD_NOW_MS - 100,
    heldProvenanceExpiresAt: HELD_NOW_MS + 1700,
    lastSeenAt: HELD_NOW_MS - 100,
    lastConfirmedAt: HELD_NOW_MS - 100,
    selectedAt: HELD_NOW_MS - 1000,
    expiresAt: HELD_NOW_MS + 180000,
    currentDistanceCm: 48000,
    ...overrides
  };
}

function heldInput(overrides = {}) {
  return {
    self: heldSelf(),
    nowMs: HELD_NOW_MS,
    profitCoins: [],
    visibleTargets: [heldSubject(), heldAlternative()],
    afkTargets: [heldAlternative()],
    easyKillTargets: [],
    activeThreats: [],
    avoidanceThreats: [],
    bullets: [],
    realtime: { tick: 100 },
    stamina: {},
    profitCoinSource: 'realtime',
    realtimeObservedCoins: [],
    snapshotVisibleCoins: [],
    ...overrides
  };
}

function runHeldMission(inputOverrides = {}, statefulOverrides = {}) {
  const stateful = { profitMission: heldMission(), ...statefulOverrides };
  const decision = buildOpportunityDecision(heldInput(inputOverrides), stateful, {
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchRelativeMargin: 0
  });
  const held = (decision.opportunities || []).find(item => item.missionHold === true) || null;
  return { decision, held, stateful };
}

// The frozen selection-time reward model must not survive a live activity
// change: the same subject observed Active is worth the active completion model,
// so the held candidate has to lose to a better live AFK candidate immediately.
function runHeldMissionActiveDowngradeCheck() {
  const { decision, held } = runHeldMission();
  return {
    name: 'held-mission-reward-is-revalidated-against-live-active-state',
    passed: held !== null
      && held.missionHoldRewardRevalidated === true
      && held.missionHoldFrozenExpectedReward === 30
      && Number(held.expectedReward) < 30
      && Number(held.score) < 245817
      && held.effectiveProfitReward?.modelSource === 'conservative-prior'
      && String(decision.choice?.id ?? '') === '9',
    detail: {
      heldScore: held ? Math.round(Number(held.score)) : null,
      heldExpectedReward: held?.expectedReward ?? null,
      chosenId: decision.choice?.id ?? null
    }
  };
}

// No live realtime observation is not evidence of a smaller reward: an ordinary
// candidate refresh must not be able to reprice a high-value mission.
function runHeldMissionWithoutLiveObservationCheck() {
  const { decision, held } = runHeldMission({ visibleTargets: [heldAlternative()] });
  return {
    name: 'held-mission-without-live-observation-keeps-frozen-reward',
    passed: held !== null
      && held.missionHoldRewardRevalidated !== true
      && Number(held.expectedReward) === 30
      && Math.round(Number(held.score)) === 245817
      && String(decision.choice?.id ?? '') === '8',
    detail: {
      heldScore: held ? Math.round(Number(held.score)) : null,
      chosenId: decision.choice?.id ?? null
    }
  };
}

// A frame without usable drop metadata is not evidence of a smaller reward.
function runHeldMissionUnknownDropCheck() {
  const { decision, held } = runHeldMission({
    visibleTargets: [heldSubject({ drop: 0, dropKnown: false }), heldAlternative()]
  });
  return {
    name: 'held-mission-with-unknown-live-drop-keeps-frozen-reward',
    passed: held !== null
      && held.missionHoldRewardRevalidated !== true
      && Number(held.expectedReward) === 30
      && String(decision.choice?.id ?? '') === '8',
    detail: {
      heldExpectedReward: held?.expectedReward ?? null,
      chosenId: decision.choice?.id ?? null
    }
  };
}

// A live subject that is still AFK keeps the deterministic model, so the
// revalidation cannot silently penalise an unchanged AFK mission.
function runHeldMissionStillAfkCheck() {
  const { decision, held } = runHeldMission({
    visibleTargets: [
      heldSubject({
        current_join_mode: 'Passive',
        joinModeActive: false,
        active: false,
        moving: false,
        fullStamina5s: true,
        stamina_5s_remaining_milli: 10000
      }),
      heldAlternative()
    ]
  });
  return {
    name: 'held-mission-with-live-afk-subject-keeps-frozen-reward',
    passed: held !== null
      && held.missionHoldRewardRevalidated !== true
      && Number(held.expectedReward) === 30
      && String(decision.choice?.id ?? '') === '8',
    detail: {
      heldExpectedReward: held?.expectedReward ?? null,
      chosenId: decision.choice?.id ?? null
    }
  };
}

// An established escort target keeps its own continuity pricing: a target that
// is already engaged must not be repriced mid-engagement.
function runEscortContinuityHoldNotRepricedCheck() {
  const { held } = runHeldMission({}, {
    profitEscortContinuity: {
      active: true,
      missionKey: 'enemy:8',
      combatTargetId: '8',
      expiresAt: HELD_NOW_MS + 60000,
      startedAt: HELD_NOW_MS - 5000
    }
  });
  return {
    name: 'escort-continuity-hold-is-not-repriced-by-live-revalidation',
    passed: held !== null
      && held.reason === 'profit-escort-mission-hold'
      && held.missionHoldRewardRevalidated !== true,
    detail: {
      reason: held?.reason ?? null,
      revalidated: held?.missionHoldRewardRevalidated ?? null
    }
  };
}

function runActiveJoinModeProfitSelfTest() {
  const checks = [
    runActiveJoinModeAfkExclusionCheck(),
    runPassiveJoinModeAfkAdmissionCheck(),
    runInRangeActivePlayerStaysReachableCheck(),
    runActiveRewardModelIsStaminaIndependentCheck(),
    runHeldMissionActiveDowngradeCheck(),
    runHeldMissionWithoutLiveObservationCheck(),
    runHeldMissionUnknownDropCheck(),
    runHeldMissionStillAfkCheck(),
    runEscortContinuityHoldNotRepricedCheck()
  ];
  const failed = checks.filter(check => !check.passed);
  return {
    ok: failed.length === 0,
    passed: checks.length - failed.length,
    failed: failed.length,
    total: checks.length,
    checks
  };
}

if (require.main === module) {
  const result = runActiveJoinModeProfitSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = { runActiveJoinModeProfitSelfTest };
