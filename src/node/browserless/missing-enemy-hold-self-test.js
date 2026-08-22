'use strict';

const {
  buildOpportunityDecision,
  clearIneligibleFinalProfitHold
} = require('./decision-adapter');
const { applyFinalActionArbitrationCore } = require('../../strategy/action-arbitration');

function baseSelf() {
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

function baseInput(nowMs, overrides = {}) {
  return {
    self: baseSelf(),
    nowMs,
    profitCoins: [{
      drop_id: 'eligible-coin',
      x: 100,
      y: 0,
      amount: 1,
      distance: 100,
      authority: 'realtime'
    }],
    afkTargets: [],
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

function cachedEnemy(nowMs, overrides = {}) {
  return {
    type: 'enemy',
    id: 'missing-enemy',
    x: 1000,
    y: 0,
    score: 100000000,
    priorityTier: 2,
    staminaCost: 17000,
    reward: 10,
    expectedReward: 10,
    profitThresholdEligible: true,
    profitThresholdReason: 'eligible',
    at: nowMs - 100,
    lastSeenAt: nowMs - 100,
    until: nowMs + 1000,
    heldCandidateSource: 'realtime-visible',
    heldRewardSource: 'deterministic-afk-target',
    heldRewardKnown: true,
    heldRewardObservedAt: nowMs - 100,
    heldProvenanceExpiresAt: nowMs + 1700,
    targetHp: 50,
    targetActive: false,
    ...overrides
  };
}

function decisionOptions() {
  return {
    profitThresholdContext: {
      active: true,
      threshold: { rewardCoins: 1, staminaMilli: 10000 }
    },
    enemyMissingHoldMs: 1800,
    opportunitySwitchConfirmFrames: 1,
    opportunitySwitchHoldMs: 1800
  };
}

function runMissingEnemyHoldSelfTest() {
  const nowMs = 100000;
  const checks = [];
  const qualified = buildOpportunityDecision(
    baseInput(nowMs),
    { currentOpportunity: cachedEnemy(nowMs) },
    decisionOptions()
  );
  checks.push({
    name: 'fresh-qualified-missing-enemy-retains-bounded-hold',
    passed: qualified.choice?.type === 'enemy'
      && qualified.action?.reason === 'missing-realtime-enemy-hold'
      && qualified.action?.profitThresholdEligible === true
      && qualified.action?.reward === 10
      && qualified.missingEnemyHold?.heldThresholdEligible === true
      && qualified.missingEnemyHold?.heldProvenanceComplete === true
      && qualified.missingEnemyHold?.releaseReason === ''
  });

  const unknownReward = buildOpportunityDecision(
    baseInput(nowMs),
    { currentOpportunity: cachedEnemy(nowMs, {
      reward: null,
      expectedReward: null,
      heldRewardKnown: false,
      heldRewardSource: ''
    }) },
    decisionOptions()
  );
  checks.push({
    name: 'unknown-held-reward-releases-to-current-eligible-coin',
    passed: unknownReward.choice?.type === 'coin'
      && unknownReward.action?.profitThresholdEligible === true
      && unknownReward.missingEnemyHold?.releaseReason === 'held-reward-unknown'
      && unknownReward.missingEnemyHold?.replacementCandidate?.type === 'coin'
      && unknownReward.missingEnemyHold?.replacementCandidate?.profitThresholdEligible === true
  });

  const expired = buildOpportunityDecision(
    baseInput(nowMs),
    { currentOpportunity: cachedEnemy(nowMs, {
      lastSeenAt: nowMs - 1801,
      heldRewardObservedAt: nowMs - 1801,
      heldProvenanceExpiresAt: nowMs - 1
    }) },
    decisionOptions()
  );
  checks.push({
    name: 'expired-missing-enemy-releases-immediately',
    passed: expired.choice?.type === 'coin'
      && expired.missingEnemyHold?.releaseReason === 'missing-hold-expired'
  });

  const belowThreshold = buildOpportunityDecision(
    baseInput(nowMs),
    { currentOpportunity: cachedEnemy(nowMs, { reward: 1, expectedReward: 1 }) },
    decisionOptions()
  );
  checks.push({
    name: 'fresh-held-enemy-is-rechecked-against-current-threshold',
    passed: belowThreshold.choice?.type === 'coin'
      && belowThreshold.missingEnemyHold?.heldThresholdEligible === false
      && belowThreshold.missingEnemyHold?.releaseReason === 'held-below-current-profit-threshold'
  });

  const visibleTarget = {
    user_id: 'missing-enemy',
    x: 800,
    y: 0,
    distance: 800,
    hp: 20,
    max_hp: 100,
    drop: 50,
    dropKnown: true,
    active: false,
    alive: true,
    authority: 'realtime'
  };
  const reappeared = buildOpportunityDecision(
    baseInput(nowMs, { afkTargets: [visibleTarget] }),
    { currentOpportunity: cachedEnemy(nowMs) },
    decisionOptions()
  );
  checks.push({
    name: 'reappeared-realtime-enemy-uses-visible-candidate-not-cache',
    passed: reappeared.opportunities.some(item => item.type === 'enemy'
      && item.sourceTarget === visibleTarget
      && item.sourceTarget.cachedNavigationOnly !== true)
      && reappeared.missingEnemyHold === null
  });

  const legacyMissionSource = {
    userId: 'legacy-mission-target',
    x: 1000,
    y: 0,
    hp: 50,
    max_hp: 100,
    drop: 100,
    active: true,
    alive: true
  };
  const legacyMission = {
    active: true,
    key: 'enemy:legacy-mission-target',
    missionKey: 'enemy:legacy-mission-target',
    type: 'enemy',
    subjectId: 'legacy-mission-target',
    targetId: 'legacy-mission-target',
    navigationTarget: legacyMissionSource,
    choice: {
      type: 'enemy',
      id: 'legacy-mission-target',
      sourceTarget: legacyMissionSource
    },
    highValue: true,
    selectedAt: nowMs - 3201,
    expiresAt: nowMs + 180000
  };
  const legacyMissionState = { profitMission: legacyMission };
  const releasedLegacyMission = buildOpportunityDecision(
    baseInput(nowMs, { profitCoins: [] }),
    legacyMissionState,
    { ...decisionOptions(), activeProfitTargetMissingHoldMs: 3000 }
  );
  checks.push({
    name: 'high-value-mission-lock-releases-after-bounded-active-missing-window',
    passed: legacyMissionState.profitMission === null
      && releasedLegacyMission.action === null
  });

  const arbitration = {
    lastAction: {
      kind: 'seek-enemy',
      band: 'profit',
      reason: 'missing-realtime-enemy-hold',
      profitThresholdEligible: false,
      profitThresholdReason: 'below-profit-threshold',
      target: { userId: 'missing-enemy', cachedNavigationOnly: true }
    },
    lastFocus: { targetKey: 'enemy:missing-enemy' },
    lastSelectedAt: nowMs - 100,
    history: []
  };
  const releaseState = { finalActionArbitration: arbitration };
  const released = clearIneligibleFinalProfitHold(releaseState, {
    active: true,
    threshold: { rewardCoins: 1, staminaMilli: 10000 }
  }, {
    rawOpportunities: [],
    choice: { type: 'coin', id: 'eligible-coin', reason: 'visible-coin', profitThresholdEligible: true }
  }, nowMs);
  const hardAction = { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime' };
  const arbitrated = applyFinalActionArbitrationCore(hardAction, arbitration, {
    nowMs,
    holdMs: 1800,
    clone: value => JSON.parse(JSON.stringify(value))
  });
  checks.push({
    name: 'invalid-final-profit-hold-is-cleared-without-gating-hard-band',
    passed: released === true
      && arbitration.lastRelease?.replacementCandidate?.type === 'coin'
      && arbitrated.action.band === 'combat'
      && arbitrated.action.reason === 'combat-live-realtime'
  });

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
  const result = runMissingEnemyHoldSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = { runMissingEnemyHoldSelfTest };
