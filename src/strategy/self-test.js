'use strict';

/**
 * Strategy Module Self-Tests
 *
 * Tests for the extracted strategy modules to ensure correctness.
 */

const { ACTION_PRIORITY_BANDS, getActionPriorityBand, buildActionFocus } = require('./action-priority');
const { applyFinalActionArbitration } = require('./action-arbitration');
const { recordActionSwitchDiagnosticsCore } = require('./action-switch-diagnostics');
const { buildCoinDiagnostics, addCoinFilterDiagnostic } = require('./coin-diagnostics');
const {
  buildCoinRouteFromAnchorCore,
  coinRouteSkipsCloserFirstCoinCore,
  pickCoinRouteOpportunityCore
} = require('./coin-route');
const {
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityMatchesChoiceCore,
  chooseStableOpportunityCore
} = require('./opportunity-choice');
const {
  opportunityPriorityTierCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./opportunity-candidates');
const { COMBAT_CONSTANTS, validateCombatConstants } = require('./combat-constants');
const { OPPORTUNITY_CONSTANTS, calculateOpportunityROI, validateOpportunityConstants } = require('./opportunity-constants');

function runStrategyModuleSelfTests() {
  const results = [];

  // Test action priority bands
  results.push({
    name: 'action-priority-exit',
    passed: getActionPriorityBand({ kind: 'leave' }) === ACTION_PRIORITY_BANDS.exit
  });

  results.push({
    name: 'action-priority-safety',
    passed: getActionPriorityBand({ kind: 'flee' }) === ACTION_PRIORITY_BANDS.safety
  });

  results.push({
    name: 'action-priority-combat',
    passed: getActionPriorityBand({ kind: 'combat' }) === ACTION_PRIORITY_BANDS.combat
  });

  results.push({
    name: 'action-priority-profit',
    passed: getActionPriorityBand({ kind: 'coin' }) === ACTION_PRIORITY_BANDS.profit
  });

  // Test action focus building
  const testAction = {
    kind: 'coin',
    reason: 'test-coin',
    target: { id: 'test123', x: 1000, y: 2000 }
  };
  const focus = buildActionFocus(testAction);
  results.push({
    name: 'action-focus-build',
    passed: focus && focus.kind === 'coin' && focus.targetKey === 'test123'
  });

  // Test arbitration - safety over profit
  const safetyAction = { kind: 'flee', reason: 'test-flee' };
  const profitAction = { kind: 'coin', reason: 'test-coin' };

  const state1 = {
    lastAction: safetyAction,
    lastFocus: buildActionFocus(safetyAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb1 = applyFinalActionArbitration(
    profitAction,
    safetyAction,
    state1,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-safety-holds-over-profit',
    passed: arb1.held && arb1.action.kind === 'flee'
  });

  // Test arbitration - combat over profit (should hold)
  const combatAction = { kind: 'combat', reason: 'test-combat' };
  const state2 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb2 = applyFinalActionArbitration(
    profitAction,
    combatAction,
    state2,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-combat-holds-over-profit',
    passed: arb2.held && arb2.action.kind === 'combat'
  });

  // Test arbitration - profit does not hold over combat
  const state3 = {
    lastAction: profitAction,
    lastFocus: buildActionFocus(profitAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb3 = applyFinalActionArbitration(
    combatAction,
    profitAction,
    state3,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-profit-does-not-hold-over-combat',
    passed: !arb3.held && arb3.action.kind === 'combat'
  });

  // Test arbitration - exit never held
  const exitAction = { kind: 'leave', reason: 'test-exit' };
  const state4 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb4 = applyFinalActionArbitration(
    exitAction,
    combatAction,
    state4,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-exit-never-held',
    passed: !arb4.held && arb4.action.kind === 'leave'
  });

  // Test target switch diagnostics
  const switchState = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
  recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-a', amount: 1 } },
    switchState,
    { nowMs: 1000, historyLimit: 24, oscillationWindowMs: 10000 }
  );
  const switchResult = recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-b', amount: 1 } },
    switchState,
    {
      nowMs: 1120,
      historyLimit: 24,
      oscillationWindowMs: 10000,
      tickCount: 7,
      source: 'self-test',
      previousDecision: { kind: 'coin', reason: 'previous', score: 1.6, staminaCost: 9.2 }
    }
  );
  results.push({
    name: 'target-switch-diagnostic-records-event',
    passed: switchResult.event
      && switchResult.action.targetSwitch
      && switchResult.event.type === 'target-switch'
      && switchResult.event.pairSwitchCount === 1
      && switchResult.event.previousDecision.score === 2
      && switchResult.event.previousDecision.staminaCost === 9
  });

  const oscillationResult = recordActionSwitchDiagnosticsCore(
    { kind: 'coin', reason: 'best-opportunity-coin', target: { id: 'coin-a', amount: 1 } },
    switchState,
    { nowMs: 1240, historyLimit: 24, oscillationWindowMs: 10000 }
  );
  results.push({
    name: 'target-switch-diagnostic-detects-reversal',
    passed: oscillationResult.event
      && oscillationResult.event.pairSwitchCount === 2
      && oscillationResult.event.oscillating === true
  });

  // Test coin diagnostics
  const coinDiag = buildCoinDiagnostics(
    { x: 10.2, y: 20.6 },
    {
      realtimeNearCoins: [{ drop_id: 'near', amount: 1, distance: 100 }],
      realtimeCoins: [
        { drop_id: 'ignored', amount: 2, distance: 300, x: 10, y: 20, native: true },
        { drop_id: 'far', amount: 9, distance: 20000 }
      ],
      realtimeGlobalCoins: [{ drop_id: 'global', amount: 1, distance: 400 }],
      realtimePatrolCoins: [],
      snapshotCoins: [{ drop_id: 'snap', amount: 5, distance: 500, snapshot: true }]
    },
    {
      nearDistance: 1000,
      limit: 4,
      nowMs: 1000,
      ignoredCoinUntil: coin => coin?.drop_id === 'ignored' ? 2500 : 0
    }
  );
  results.push({
    name: 'coin-diagnostics-builds-near-summaries',
    passed: coinDiag
      && coinDiag.nearDistance === 1000
      && coinDiag.realtimeNearCount === 1
      && coinDiag.realtimeCount === 2
      && coinDiag.ignoredNearCoins[0]?.id === 'ignored'
      && coinDiag.ignoredNearCoins[0]?.remainingMs === 1500
      && coinDiag.snapshotOnlyNearCoins[0]?.id === 'snap'
      && coinDiag.nearestRealtimeCoins[0]?.id === 'ignored'
  });

  addCoinFilterDiagnostic(coinDiag, { drop_id: 'blocked', amount: 1, distance: 900 }, 'threat-blocked', {
    nearDistance: 1000,
    limit: 4,
    detail: { threat: { id: 7 } }
  });
  addCoinFilterDiagnostic(coinDiag, { drop_id: 'blocked', amount: 1, distance: 700 }, 'threat-blocked', {
    nearDistance: 1000,
    limit: 4,
    detail: { threat: { id: 7 } }
  });
  addCoinFilterDiagnostic(coinDiag, { drop_id: 'too-far', amount: 1, distance: 3000 }, 'max-distance', {
    nearDistance: 1000,
    limit: 4
  });
  results.push({
    name: 'coin-diagnostics-filter-entries-dedupe',
    passed: coinDiag.filteredNearCoins.length === 1
      && coinDiag.filteredNearCoins[0].id === 'blocked'
      && coinDiag.filteredNearCoins[0].distance === 700
      && coinDiag.filteredNearCoins[0].threat.id === 7
  });

  // Test coin route planning
  const routeSelf = { x: 0, y: 0 };
  const routeCoins = [
    { drop_id: '1', amount: 1, x: 1000, y: 0, distance: 1000 },
    { drop_id: '2', amount: 1, x: 2000, y: 0, distance: 2000 },
    { drop_id: '3', amount: 1, x: 3000, y: 0, distance: 3000 }
  ];
  const routeOptions = {
    dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)),
    moveStaminaCost: distance => Number(distance || 0),
    pickupStaminaMs: 0,
    valueScore: (value, cost) => cost > 0 ? value * 100000 / cost : Infinity,
    staminaAffordable: cost => cost <= 10000,
    coinOpportunityValue: 100000,
    sampleDistance: 10000,
    clusterRadius: 5000,
    maxPointsDense: 6,
    maxPointsMid: 4,
    maxPointsSparse: 3,
    linkDistance: 1500,
    maxLinkDistance: 2500,
    nearbyFirstCoinDistance: 22000,
    firstCoinDistanceRatio: 1.45,
    firstCoinDistanceSlack: 6000,
    choiceType: choice => String(choice?.type || ''),
    choiceId: choice => String(choice?.id ?? ''),
    heldMinOverlap: 2,
    switchMargin: 3000,
    switchRelativeMargin: 0.1,
    maxDistance: 50000,
    poolLimit: 72,
    anchorLimit: 22,
    safeCoinCandidates: (coins, threats, maxDistance, self) => (coins || [])
      .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : Math.hypot(Number(self.x) - Number(coin.x), Number(self.y) - Number(coin.y)) }))
      .filter(coin => coin.distance <= maxDistance),
    isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly)
  };
  const builtRoute = buildCoinRouteFromAnchorCore(routeSelf, routeCoins[0], routeCoins, [], routeOptions);
  results.push({
    name: 'coin-route-builds-metadata',
    passed: builtRoute
      && builtRoute.coinRoute?.legCount === 3
      && builtRoute.coinRoute?.points?.length === 3
      && builtRoute.coinRoute?.ids?.join(',') === '1,2,3'
      && builtRoute.routeKind === 'short'
  });

  results.push({
    name: 'coin-route-closer-first-guard',
    passed: coinRouteSkipsCloserFirstCoinCore(
      routeSelf,
      { drop_id: 'far-route', amount: 3, x: 30000, y: 0, distance: 30000, coinRoute: { firstDistance: 30000 } },
      [{ drop_id: 'near', amount: 1, x: 10000, y: 0, distance: 10000 }],
      routeOptions
    ) === true
  });

  const heldRouteChoice = {
    type: 'coin',
    id: '1',
    reason: 'best-opportunity-coin-route',
    until: 10000,
    coinRouteIds: ['1', '2', '3']
  };
  const pickedRoute = pickCoinRouteOpportunityCore(routeSelf, [
    ...routeCoins,
    { drop_id: '4', amount: 10, x: 9000, y: 0, distance: 9000 },
    { drop_id: '5', amount: 10, x: 10000, y: 0, distance: 10000 },
    { drop_id: '6', amount: 10, x: 11000, y: 0, distance: 11000 }
  ], [], {
    ...routeOptions,
    nearbyFirstCoinDistance: 0,
    staminaAffordable: cost => cost <= 20000,
    heldChoice: heldRouteChoice,
    heldRouteChoice
  });
  results.push({
    name: 'coin-route-pick-stabilizes-held-route',
    passed: pickedRoute
      && pickedRoute.drop_id === '1'
      && pickedRoute.routeHeld === true
      && pickedRoute.coinRoute?.ids?.join(',') === '1,2,3'
  });

  // Test opportunity choice/stability
  const opportunityChoice = { key: 'coin:abc', x: 100, y: 100, amount: 2 };
  results.push({
    name: 'opportunity-choice-key-parsing',
    passed: opportunityChoiceType(opportunityChoice) === 'coin'
      && opportunityChoiceId(opportunityChoice) === 'abc'
      && opportunityChoiceKey({ type: 'enemy', id: 7 }) === 'enemy:7'
  });

  results.push({
    name: 'opportunity-choice-coordinate-match',
    passed: opportunityMatchesChoiceCore(
      { type: 'coin', id: 'new-id', amount: 2, x: 120, y: 100 },
      { type: 'coin', id: 'old-id', amount: 2, x: 100, y: 100 },
      {
        sameCoinRadius: 50,
        dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y))
      }
    ) === true
  });

  const heldChoice = { key: 'coin:a', type: 'coin', id: 'a', until: 2000, score: 100 };
  const holdResult = chooseStableOpportunityCore([
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 105, priorityTier: 1 },
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], heldChoice, null, {
    nowMs: 1000,
    sameCoinRadius: 50,
    switchMargin: 10,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-holds-with-margin',
    passed: holdResult.chosen?.id === 'a'
      && holdResult.chosen?.held === true
      && holdResult.chosen?.competingScore === 105
  });

  const highValueResult = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 100, score: 500, priorityTier: 1 },
    { type: 'coin', id: 'coin', amount: 10, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], { key: 'coin:coin', type: 'coin', id: 'coin', until: 2000 }, null, {
    nowMs: 1000,
    highValueCoinPriorityAmount: 10,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-high-value-coin-holds-enemy-switch',
    passed: highValueResult.chosen?.id === 'coin'
      && highValueResult.chosen?.held === true
      && highValueResult.chosen?.highValueCoinHold === true
  });

  const opportunityOscillationResult = chooseStableOpportunityCore([
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 120, priorityTier: 1 },
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], { key: 'coin:a', type: 'coin', id: 'a', until: 0 }, {
    pairKey: 'coin:a|coin:b',
    lastKey: 'coin:a',
    switchCount: 1,
    lockedKey: '',
    blockedKey: '',
    lockedAt: 0,
    updatedAt: 900
  }, {
    nowMs: 1000,
    sameCoinRadius: 50,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 1
  });
  results.push({
    name: 'opportunity-choice-oscillation-locks-current',
    passed: opportunityOscillationResult.chosen?.id === 'a'
      && opportunityOscillationResult.chosen?.oscillationLocked === true
      && opportunityOscillationResult.switchLock?.lockedKey === 'coin:a'
      && opportunityOscillationResult.switchLock?.blockedKey === 'coin:b'
  });

  // Test opportunity candidate construction
  const candidateOptions = {
    safeCoinCandidates: (coins, threats, maxDistance) => (coins || []).filter(coin => Number(coin.distance || 0) <= maxDistance),
    coinStaminaCost: coin => Number(coin.staminaCost ?? coin.distance ?? 0),
    coinStaminaAffordable: (coin, cost) => Number(cost ?? coin.staminaCost ?? 0) <= 10000,
    scoreCoinOpportunity: coin => Number(coin.score ?? coin.opportunityScore ?? 0),
    snapshotCoinNavigationReason: coin => Number(coin.distance || 0) <= 1500 ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
    maxCoinDistance: 1500,
    routeMaxDistance: 50000,
    scoreEnemyOpportunity: target => target.blocked ? null : Number(target.score || 0),
    enemyStaminaCost: target => Number(target.staminaCost || 0),
    opportunityStaminaAffordable: cost => cost <= 5000,
    isAfkProfitTarget: target => Boolean(target.afk),
    attackRange: 1000,
    attackEngageRange: 5000,
    priorityTier: item => opportunityPriorityTierCore(item, { visibleDistance: 2000 })
  };

  const dedupedCoinCandidates = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [
      { drop_id: 'same', amount: 1, distance: 500, score: 10 },
      { drop_id: 'same', amount: 3, distance: 800, score: 10 },
      { drop_id: 'other', amount: 1, distance: 400, score: 9 }
    ]
  }], [], null, candidateOptions);
  results.push({
    name: 'opportunity-candidates-dedupes-coin-by-score-amount-distance',
    passed: dedupedCoinCandidates.length === 2
      && dedupedCoinCandidates.find(item => item.id === 'same')?.amount === 3
      && dedupedCoinCandidates.find(item => item.id === 'same')?.actionKind === 'coin'
  });

  const routeCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'route', amount: 1, distance: 900, score: 10 }]
  }], [], {
    drop_id: 'route',
    amount: 4,
    distance: 900,
    score: 12,
    route: true,
    routeValue: 4,
    routeHeld: true,
    competingRouteScore: 11,
    coinRoute: { ids: ['route', 'next'], value: 4, legCount: 2 }
  }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-route-winner-preserves-metadata',
    passed: routeCandidate[0]?.reason === 'best-opportunity-coin-route'
      && routeCandidate[0]?.coinRoute?.ids?.join(',') === 'route,next'
      && routeCandidate[0]?.routeHeld === true
      && routeCandidate[0]?.competingRouteScore === 11
  });

  const routeDisplayCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'display', amount: 5, distance: 700, score: 12 }]
  }], [], {
    drop_id: 'display',
    amount: 2,
    distance: 700,
    score: 12,
    route: true,
    routeValue: 2,
    routeKind: 'short',
    coinRoute: { ids: ['display', 'near'], value: 2, legCount: 2 }
  }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-route-display-merge-keeps-base-coin',
    passed: routeDisplayCandidate[0]?.amount === 5
      && routeDisplayCandidate[0]?.reason === 'best-opportunity-coin-route'
      && routeDisplayCandidate[0]?.sourceCoin?.routeDisplayOnly === true
      && routeDisplayCandidate[0]?.coinRoute?.ids?.join(',') === 'display,near'
  });

  const enemyCandidate = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [], [
    { user_id: 'afk', distance: 900, score: 8, staminaCost: 100, afk: true },
    { user_id: 'active-far', distance: 6000, score: 9, staminaCost: 100, afk: false },
    { user_id: 'blocked', distance: 500, score: 20, staminaCost: 100, blocked: true }
  ], null, candidateOptions);
  results.push({
    name: 'opportunity-candidates-builds-enemy-action-kind',
    passed: enemyCandidate.length === 2
      && enemyCandidate.find(item => item.id === 'afk')?.actionKind === 'attack'
      && enemyCandidate.find(item => item.id === 'active-far')?.actionKind === 'seek-enemy'
  });

  const bestCoinRouteScore = bestCoinOpportunityScoreCore({ x: 0, y: 0 }, [{
    maxDistance: 5000,
    coins: [{ drop_id: 'coin', amount: 1, distance: 500, score: 5, staminaCost: 100 }]
  }], [], { drop_id: 'route-score', amount: 2, distance: 900, score: 9, staminaCost: 100 }, candidateOptions);
  results.push({
    name: 'opportunity-candidates-best-coin-score-includes-route',
    passed: bestCoinRouteScore === 9
  });

  // Test combat constants validation
  const combatErrors = validateCombatConstants();
  results.push({
    name: 'combat-constants-valid',
    passed: combatErrors.length === 0,
    errors: combatErrors
  });

  // Test opportunity constants validation
  const opportunityErrors = validateOpportunityConstants();
  results.push({
    name: 'opportunity-constants-valid',
    passed: opportunityErrors.length === 0,
    errors: opportunityErrors
  });

  // Test opportunity ROI calculation
  const roi1 = calculateOpportunityROI(10, 1000);
  results.push({
    name: 'opportunity-roi-basic',
    passed: Math.abs(roi1 - 0.01) < 0.001
  });

  const roi2 = calculateOpportunityROI(10, 0);
  results.push({
    name: 'opportunity-roi-zero-cost',
    passed: roi2 === Infinity
  });

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    passed,
    failed,
    total: results.length,
    results,
    success: failed === 0
  };
}

module.exports = {
  runStrategyModuleSelfTests
};
