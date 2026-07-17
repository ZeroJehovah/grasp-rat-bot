'use strict';

/**
 * Strategy Module Self-Tests
 *
 * Tests for the extracted strategy modules to ensure correctness.
 */

const { ACTION_PRIORITY_BANDS, getActionPriorityBand, buildActionFocus } = require('./action-priority');
const { applyFinalActionArbitration } = require('./action-arbitration');
const { buildFinalActionCandidate, selectFinalActionCandidateCore } = require('./final-candidate-selection');
const { quadraticInterceptCore } = require('./combat-aim');
const {
  applyCombatMovementModifiers,
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore
} = require('./combat-movement');
const { recordActionSwitchDiagnosticsCore } = require('./action-switch-diagnostics');
const { attackWorthTakingCore } = require('./attack-worth');
const {
  exitMotionStopLockRemainingMsCore,
  postExitDecisionWithoutTargetCore
} = require('./exit-motion');
const {
  pendingExitRetryMsCore,
  pendingExitDisplayReasonCore,
  summarizePendingExitCore,
  leaveRequestHasHttp403Core,
  leaveDetailHasHttp403Core,
  leaveDetailSucceededCore,
  leaveResponseConfirmsExitCore,
  leaveSuccessReloadConfirmationForDetailCore,
  leaveSuccessReloadConfirmationSatisfiedCore,
  pendingExitWaitReasonCore
} = require('./pending-exit');
const {
  leaveCommandFailureMessageCore,
  summarizeLeaveCommandResultCore,
  leaveDetailFailedForClashRescueCore,
  clashLeaveRescueAttemptsCore,
  nextClashLeaveRescueStageCore,
  summarizeClashLeaveRescueResultCore,
  clashLeaveRescueRetryDetailCore,
  resetClashLeaveRescueRoundCore
} = require('./leave-command');
const { buildCoinDiagnostics, addCoinFilterDiagnostic } = require('./coin-diagnostics');
const { activeCoinCompetitionCore } = require('./coin-competition');
const {
  coinAxisLockShouldHoldCore,
  coinDirectionToCore,
  coinMotionMetaCore,
  coinPickupPrecisionPulseMsCore
} = require('./coin-motion');
const {
  coinTargetKeyCore,
  coinMatchesTrackedTargetCore,
  trackedCoinTargetForCollectionCore,
  buildNativeCoinSnapshotCore,
  pointToSegmentDistanceCore,
  pickIncidentalCoinPickupsCore,
  snapshotCoinWorthLongTravelCore,
  snapshotCoinNavigationReasonCore
} = require('./coin-target');
const {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore,
  coinProgressIntentCore,
  coinAttemptExpiredCore,
  updateCoinAttemptCore,
  updateCoinProgressRecordCore,
  buildIgnoredCoinProgressCore,
  buildIgnoredCoinPatrolActionCore,
  coinIgnoreCleanupIntentCore
} = require('./coin-progress');
const {
  buildCoinRouteFromAnchorCore,
  coinRouteActionMetaCore,
  coinRouteSkipsCloserFirstCoinCore,
  coinRouteSkipsCloserRoutePointCore,
  closerCoinRouteForFirstTargetCore,
  pickCoinRouteOpportunityCore
} = require('./coin-route');
const {
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityMatchesChoiceCore,
  chooseStableOpportunityCore,
  buildMissingHeldOpportunityCore,
  rememberOpportunityChoiceCore
} = require('./opportunity-choice');
const {
  burstCadenceMetricsCore,
  opponentResponsePolicyCore,
  updateOpponentBehaviorStateCore
} = require('./opponent-behavior');
const {
  opportunityPriorityTierCore,
  buildOpportunityCandidatesCore,
  bestCoinOpportunityScoreCore
} = require('./opportunity-candidates');
const { pickBestOpportunityCore } = require('./opportunity-pick');
const {
  singleCoinBaitOtherOpportunityCore,
  singleCoinBaitPolicyCore
} = require('./single-coin-bait');
const { updateOutsideCenterIdleCore } = require('./outside-center-idle');
const { patrolDirectionCore } = require('./patrol');
const {
  postAttackVisibleCoinExistsCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./post-attack-drop');
const { updatePostKillSettlementCore } = require('./post-kill-settlement');
const { buildDropMatchedKillCore } = require('./drop-matched-kill');
const {
  dailyStaminaBudgetIsLimitingCore,
  summarizeBlockedStaminaOpportunityCore,
  summarizeNearestCoinStaminaBudgetExitCore,
  pickNearestDailyStaminaFinalCoinCore
} = require('./stamina-budget');
const {
  aggregateChaseCandidates,
  buildChaseSourceListsCore,
  chaseKilledCandidateSuppressionDecision,
  chaseLowDropClearDecision,
  chooseChaseTarget,
  decorateChaseTargets,
  normalizeChaseCandidate,
  normalizeChaseModeState,
  selectPanelCandidates
} = require('./chase-mode');
const { COMBAT_CONSTANTS, validateCombatConstants } = require('./combat-constants');
const {
  combatEdgePressureDecisionCore,
  combatEscapeDecisionCore,
  incomingBulletHasCollisionRiskCore,
  incomingBulletRequiresTargetSwitchCore,
  pickEngagedCombatTargetCore
} = require('./combat-target-selection');
const {
  combatHpExitThresholdsCore,
  evaluateCombatExchangeStopLossCore,
  evaluateConfirmedCombatHpExitCore,
  evaluateCombatHpExitCore,
  evaluatePredictedLeaveHpCore
} = require('./combat-exit');
const { OPPORTUNITY_CONSTANTS, calculateOpportunityROI, validateOpportunityConstants } = require('./opportunity-constants');
const {
  buildDynamicProfitThresholdCore,
  filterProfitCandidatesCore,
  nextDailyProfitResetAtCore,
  profitTargetEligibleCore
} = require('./profit-threshold');

function runStrategyModuleSelfTests() {
  const results = [];

  const headingCompetition = activeCoinCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'far', amount: 10, x: 40000, y: 0, distance: 40000 },
    [{ user_id: 2, name: 'runner', x: 30000, y: 0, vx: 50, vy: 0, active: true, alive: true }]
  );
  const uncertainCompetition = activeCoinCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'far', amount: 10, x: 40000, y: 0, distance: 40000 },
    [{ user_id: 3, name: 'stationary', x: 29000, y: 0, vx: 0, vy: 0, active: true, alive: true }]
  );
  const weakAwayCompetition = activeCoinCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'far', amount: 10, x: 40000, y: 0, distance: 40000 },
    [{ user_id: 4, name: 'away', x: 6000, y: 0, vx: -50, vy: 0, active: true, alive: true }]
  );
  const nearCoinCompetition = activeCoinCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'near', amount: 10, x: 15000, y: 0, distance: 15000 },
    [{ user_id: 5, name: 'nearer', x: 14000, y: 0, vx: 50, vy: 0, active: true, alive: true }]
  );
  results.push({
    name: 'active-player-far-coin-competition-requires-credible-arrival-lead',
    passed: headingCompetition?.reason === 'active-player-heading-to-coin'
      && headingCompetition.competitorDistanceCm === 10000
      && headingCompetition.distanceLeadCm === 30000
      && uncertainCompetition?.reason === 'active-player-large-distance-lead'
      && weakAwayCompetition === null
      && nearCoinCompetition === null
  });

  const threshold = { rewardCoins: 1, staminaMilli: 10000 };
  results.push({
    name: 'profit-threshold-ratio-boundaries-and-invalid-values',
    passed: profitTargetEligibleCore(1, 9000, threshold) === true
      && profitTargetEligibleCore(1, 10000, threshold) === true
      && profitTargetEligibleCore(1, 11000, threshold) === false
      && profitTargetEligibleCore(1, 0, threshold) === true
      && profitTargetEligibleCore(0, 0, threshold) === false
      && profitTargetEligibleCore(1, NaN, threshold) === false
  });
  const utc8EightAm = Date.parse('2026-07-12T00:00:00.000Z');
  const activeThreshold = buildDynamicProfitThresholdCore({ nowMs: utc8EightAm, remaining1dMilli: 20000000 }, {});
  const relaxedThreshold = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T09:00:00.000Z'), remaining1dMilli: 20000000 }, {});
  const equalBoundary = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T11:00:00.000Z'), remaining1dMilli: 3000000 }, {});
  results.push({
    name: 'profit-threshold-utc8-reset-reserve-and-burn-window',
    passed: nextDailyProfitResetAtCore(utc8EightAm) === Date.parse('2026-07-12T16:00:00.000Z')
      && activeThreshold.active === true
      && activeThreshold.reserveMs === 14400000
      && Math.round(activeThreshold.burnCapacityMilli) === 36000000
      && relaxedThreshold.active === false
      && relaxedThreshold.reason === 'insufficient-burn-window'
      && equalBoundary.active === true
  });
  results.push({
    name: 'profit-threshold-unknown-daily-stamina-restores-old-selection',
    passed: buildDynamicProfitThresholdCore({ nowMs: utc8EightAm, remaining1dMilli: null }, {}).reason === 'daily-stamina-unknown'
      && buildDynamicProfitThresholdCore({ nowMs: utc8EightAm, remaining1dMilli: 1 }, { enabled: false }).reason === 'feature-disabled'
  });
  const aggregateRoute = filterProfitCandidatesCore([
    { type: 'coin', id: 'route', reward: 3, staminaCost: 25000 },
    { type: 'coin', id: 'single', reward: 1, staminaCost: 11000 }
  ], activeThreshold);
  results.push({
    name: 'profit-threshold-filters-by-aggregate-route-reward',
    passed: aggregateRoute.rawCount === 2
      && aggregateRoute.eligibleCount === 1
      && aggregateRoute.candidates[0]?.id === 'route'
  });

  const intercept = quadraticInterceptCore(
    { x: 0, y: 0 },
    { x: 1000, y: 0, vx: 100, vy: 0 },
    { bulletSpeed: 500, renderDelayTicks: 2, bulletRange: 15000 }
  );
  results.push({
    name: 'quadratic-intercept-meets-moving-target',
    passed: Boolean(intercept
      && Math.abs(intercept.x - (1000 + 100 * (2 + intercept.flightTicks))) < 0.001
      && intercept.flightTicks > 0)
  });

  const dodge = calculateDodgeDirection(
    { x: 0, y: 0 },
    [{ incoming: true, x: -5000, y: 0, distance: 5000, cpa: 0, timeToImpact: 500, speed: 500, direction: { dx: 1, dy: 0 } }],
    { moveSpeedPerTick: 50, tickMs: 50, hitRadius: 200 }
  );
  const dodgeMinimumHits = Math.min(...dodge.threatField.map(item => item.directHits));
  results.push({
    name: 'future-position-threat-field-improves-old-fixed-cpa-hit',
    passed: dodge.directHits === undefined
      ? dodge.threatField.find(item => item.dx === dodge.dx && item.dy === dodge.dy)?.directHits === dodgeMinimumHits && dodgeMinimumHits < 1
      : false
  });
  const fullFlightDodge = calculateDodgeDirection(
    { x: 0, y: 0, vx: 0, vy: 0 },
    [{
      incoming: true,
      x: -5000,
      y: 0,
      distance: 5000,
      cpa: 0,
      timeToImpact: 100,
      speed: 500,
      direction: { dx: 1, dy: 0 },
      remainingTicks: 20
    }],
    { moveSpeedPerTick: 50, tickMs: 50, hitRadius: 200, commandDelayTicks: 5 }
  );
  const fullFlightStop = fullFlightDodge.threatField.find(item => item.dx === 0 && item.dy === 0);
  results.push({
    name: 'dodge-full-flight-cpa-continues-beyond-old-static-tti-until-bullet-expiry',
    passed: fullFlightStop?.directHits === 1
      && fullFlightStop?.minCPA === 0
      && fullFlightStop?.commandDelayTicks === 5
  });
  const safeClosingDodge = pickSafeClosingDodgeCore([
    { dx: 0, dy: 1, directHits: 0, minCPA: 800, targetDistanceChange: 150 },
    { dx: -1, dy: 1, directHits: 0, minCPA: 760, targetDistanceChange: -350 },
    { dx: -1, dy: 0, directHits: 0, minCPA: 500, targetDistanceChange: -650 }
  ], { hitRadius: 200, minimumCpaRatio: 0.75 });
  results.push({
    name: 'safe-closing-dodge-preserves-zero-hit-cpa-margin-while-reducing-distance',
    passed: safeClosingDodge?.dx === -1
      && safeClosingDodge?.dy === 1
      && safeClosingDodge?.directHits === 0
      && safeClosingDodge?.targetDistanceChange < 0
  });
  const dodgeBeforeSpacing = applyCombatMovementModifiers(
    { dx: 0, dy: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { dodge: { dx: 1, dy: -1 }, backAway: true }
  );
  const ordinaryBackAway = applyCombatMovementModifiers(
    { dx: 0, dy: 0 },
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { backAway: true }
  );
  results.push({
    name: 'incoming-dodge-keeps-both-axes-before-close-spacing-back-away',
    passed: dodgeBeforeSpacing.dx === 1
      && dodgeBeforeSpacing.dy === -1
      && dodgeBeforeSpacing.modifiers.includes('dodge')
      && dodgeBeforeSpacing.modifiers.includes('back-away-deferred')
      && !dodgeBeforeSpacing.modifiers.includes('back-away-mixed')
      && ordinaryBackAway.dx === -1
      && ordinaryBackAway.dy === -1
      && ordinaryBackAway.modifiers.includes('back-away')
  });
  const contactSelf = { user_id: 1, x: 0, y: 0, vx: 0, vy: 0, stamina_5s_remaining_milli: 10000 };
  const contactTarget = { user_id: 2, x: 15500, y: 0, vx: -50, vy: 0, distance: 15500, active: true };
  const contactRisk = contactEntryRiskCore(contactSelf, contactTarget, null);
  const movingContactRisk = contactEntryRiskCore({ ...contactSelf, vx: 35, vy: 35 }, contactTarget, null);
  const tangentialContactRisk = contactEntryRiskCore(contactSelf, { ...contactTarget, vx: 0, vy: 50 }, null);
  const retreatingContactRisk = contactEntryRiskCore(contactSelf, { ...contactTarget, vx: 50, vy: 0 }, null);
  const lowStaminaContactRisk = contactEntryRiskCore({ ...contactSelf, stamina_5s_remaining_milli: 3000 }, contactTarget, null);
  const recoveryContactRisk = contactEntryRiskCore({ ...contactSelf, hp: 90, max_hp: 100 }, contactTarget, null);
  const trustedContactRisk = contactEntryRiskCore(contactSelf, { ...contactTarget, easyKillThreatExempt: true }, null);
  const trustedFiringRisk = contactEntryRiskCore(contactSelf, { ...contactTarget, easyKillThreatExempt: true, firing: true }, null);
  const recoveryBulletRisk = contactEntryRiskCore({ ...contactSelf, hp: 90, max_hp: 100 }, {
    ...contactTarget,
    easyKillThreatExempt: true
  }, null, { realBullet: true });
  results.push({
    name: 'contact-entry-risk-arms-stationary-direct-approach-with-firing-trust-override',
    passed: contactRisk.eligible === true
      && contactRisk.trigger === 'direct-closing-entry'
      && contactRisk.closingAlignment === 1
      && movingContactRisk.blockedReason === 'self-already-moving'
      && tangentialContactRisk.blockedReason === 'no-direct-closing-evidence'
      && retreatingContactRisk.blockedReason === 'no-direct-closing-evidence'
      && lowStaminaContactRisk.blockedReason === 'stamina-insufficient'
      && recoveryContactRisk.blockedReason === 'recovery-policy-owned'
      && trustedContactRisk.blockedReason === 'trusted-target-no-fire'
      && trustedFiringRisk.eligible === true
      && trustedFiringRisk.trigger === 'target-firing'
      && recoveryBulletRisk.eligible === true
      && recoveryBulletRisk.trigger === 'target-real-bullet'
  });
  const contactSyntheticBullet = contactEntrySyntheticBulletCore(contactSelf, contactTarget);
  const contactDodge = calculateDodgeDirection(contactSelf, [contactSyntheticBullet], {
    target: contactTarget,
    moveSpeedPerTick: 50,
    tickMs: 50,
    hitRadius: 200,
    commandDelayTicks: 5
  });
  const contactSelected = contactDodge.threatField.find(item => item.dx === contactDodge.dx && item.dy === contactDodge.dy);
  const contactStationary = contactDodge.threatField.find(item => item.dx === 0 && item.dy === 0);
  results.push({
    name: 'contact-entry-synthetic-shot-turns-stationary-first-hit-into-lateral-safe-cpa',
    passed: Boolean(contactSyntheticBullet?.synthetic
      && (contactDodge.dx !== 0 || contactDodge.dy !== 0)
      && contactStationary?.directHits === 1
      && contactSelected?.directHits === 0
      && contactSelected?.minCPA >= 200)
  });

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

  const combatFocus = buildActionFocus({ kind: 'combat-live', band: 'combat', target: { user_id: 8, name: 'target' } }, { nowMs: 1000 });
  const returnFocus = buildActionFocus({ kind: 'patrol', band: 'recover', reason: 'return-to-center-activity-radius' }, { nowMs: 1000 });
  results.push({
    name: 'action-priority-prefers-standard-explicit-band-and-normalizes-legacy-kinds',
    passed: combatFocus.band === 'combat'
      && returnFocus.band === 'recover'
      && getActionPriorityBand({ kind: 'combat-live' }) === 'combat'
      && getActionPriorityBand({ kind: 'combat-candidate' }) === 'combat'
      && getActionPriorityBand({ kind: 'safety-exit' }) === 'safety'
      && getActionPriorityBand({ kind: 'patrol', reason: 'return-to-center-activity-radius' }) === 'recover'
      && [combatFocus.band, returnFocus.band].every(value => Object.values(ACTION_PRIORITY_BANDS).includes(value))
  });

  const selectedCombatCandidate = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'patrol', band: 'recover', reason: 'return-to-center-activity-radius' }, { order: 190 }),
    buildFinalActionCandidate({ kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime', target: { user_id: 8 } }, { order: 60 })
  ]);
  const selectedHardSafetyCandidate = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'combat-live', band: 'combat', target: { user_id: 8 } }, { order: 60 }),
    buildFinalActionCandidate({ kind: 'safety-exit', band: 'safety', reason: 'combat-critical-hp-leave' }, { order: 30, hardGate: true })
  ]);
  results.push({
    name: 'final-candidate-selection-keeps-combat-over-recovery-but-never-blocks-hard-safety',
    passed: selectedCombatCandidate?.action?.kind === 'combat-live'
      && selectedCombatCandidate?.action?.finalCandidate?.priorityBand === 'combat'
      && selectedHardSafetyCandidate?.action?.reason === 'combat-critical-hp-leave'
      && selectedHardSafetyCandidate?.hardGate === true
  });
  const selectedProfitRoi = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'coin', band: 'profit', target: { id: 'near' }, reward: 2, staminaCost: 1000 }, { order: 10 }),
    buildFinalActionCandidate({ kind: 'seek-enemy', band: 'profit', target: { userId: 88 }, expectedReward: 20, staminaCost: 20000, riskScore: 50 }, { order: 1 })
  ]);
  results.push({
    name: 'final-candidate-profit-band-uses-risk-adjusted-net-roi-and-camelcase-user-id',
    passed: selectedProfitRoi?.targetKey === 'coin:near'
      && buildActionFocus({ kind: 'seek-enemy', band: 'profit', target: { userId: 88 } }).key === 'enemy:88'
  });
  const selectedCommittedProfit = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'coin', band: 'profit', reason: 'single-coin-bait-release', target: { id: 'bait' }, reward: 1, staminaCost: 900 }, { order: 150, commitmentRank: 10 }),
    buildFinalActionCandidate({ kind: 'seek-enemy', band: 'profit', target: { userId: 88 }, expectedReward: 1703, staminaCost: 28000 }, { order: 180 })
  ]);
  const selectedPostAttackCommitment = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'coin', band: 'profit', reason: 'post-attack-drop-coin', target: { id: 'drop' }, reward: 6, staminaCost: 1000 }, { order: 80, commitmentRank: 20 }),
    buildFinalActionCandidate({ kind: 'coin', band: 'profit', reason: 'single-coin-bait-release', target: { id: 'bait' }, reward: 1, staminaCost: 900 }, { order: 150, commitmentRank: 10 })
  ]);
  results.push({
    name: 'final-candidate-profit-commitment-beats-roi-without-bypassing-stronger-profit-commitments',
    passed: selectedCommittedProfit?.action?.reason === 'single-coin-bait-release'
      && selectedCommittedProfit?.commitmentRank === 10
      && selectedPostAttackCommitment?.action?.reason === 'post-attack-drop-coin'
      && selectedPostAttackCommitment?.commitmentRank === 20
  });

  const switchOpportunities = [
    { type: 'coin', id: 'new', x: -1000, y: 0, reward: 3, staminaCost: 1000, score: 1400, priorityTier: 1 },
    { type: 'coin', id: 'old', x: 1000, y: 0, reward: 1, staminaCost: 1000, score: 1000, priorityTier: 1 }
  ];
  const switchCurrent = { key: 'coin:old', type: 'coin', id: 'old', x: 1000, y: 0, until: 0 };
  const switch1 = chooseStableOpportunityCore(switchOpportunities, switchCurrent, null, { self: { x: 0, y: 0 }, switchConfirmFrames: 3, switchMargin: 0, switchRelativeMargin: 0, nowMs: 1000 });
  const switch2 = chooseStableOpportunityCore(switchOpportunities, switchCurrent, switch1.switchLock, { self: { x: 0, y: 0 }, switchConfirmFrames: 3, switchMargin: 0, switchRelativeMargin: 0, nowMs: 1100 });
  const switch3 = chooseStableOpportunityCore(switchOpportunities, switchCurrent, switch2.switchLock, { self: { x: 0, y: 0 }, switchConfirmFrames: 3, switchMargin: 0, switchRelativeMargin: 0, nowMs: 1200 });
  results.push({
    name: 'opportunity-switch-cost-requires-sustained-net-advantage',
    passed: switch1.chosen?.id === 'old'
      && switch1.switchDiagnostics?.bestRejectedReason === 'confirmation'
      && switch2.chosen?.id === 'old'
      && switch3.chosen?.id === 'new'
      && Number(switch1.switchDiagnostics?.switchCost) > 0
  });

  let behavior = null;
  for (let index = 0; index < 8; index += 1) {
    behavior = updateOpponentBehaviorStateCore(behavior, {
      at: 1000 + index * 200,
      selfX: index * 20,
      selfY: 0,
      x: 8000 + index * 120,
      y: 0,
      vx: 50,
      vy: 0,
      distance: 8000 + index * 100,
      firing: false,
      realBulletPressure: false,
      hitRate: 0.05
    });
  }
  const retreatPolicy = opponentResponsePolicyCore('retreat-kite', { distance: 9000, hitRate: 0.05, targetPressure: false, noProgressMs: 11000, nowMs: 3000 });
  results.push({
    name: 'opponent-behavior-hysteresis-enters-retreat-kite-and-pauses-inefficient-fire',
    passed: behavior?.mode === 'retreat-kite'
      && behavior?.confidence > 0.4
      && behavior?.dimensions?.controlStyle?.state === 'human-like'
      && behavior?.dimensions?.controlStyle?.provisional === true
      && behavior?.responsePolicy?.name === 'retreat-kite-close-first'
      && retreatPolicy.suppressFire === true
      && retreatPolicy.reassessProfit === true
  });
  const edgeSelf = { user_id: 1, x: 0, y: 0, hp: 94 };
  const edgeTarget = {
    user_id: 2,
    x: 15178,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 88,
    distance: 15178,
    active: false,
    current_join_mode: 'Active'
  };
  const edgeEngaged = {
    id: 2,
    at: 9500,
    lastInRangeAt: 8000,
    opponentBehaviorState: {
      mode: 'retreat-kite',
      confidence: 0.83,
      noProgressMs: 5200,
      metrics: { netDistanceChange: 1676 }
    }
  };
  const edgeEscape = combatEscapeDecisionCore(edgeSelf, edgeTarget, edgeEngaged, {
    nowMs: 10000,
    combatAttackRange: 14500
  });
  const edgePressure = combatEdgePressureDecisionCore(edgeSelf, edgeTarget, edgeEngaged, edgeEscape, {
    nowMs: 10000,
    combatAttackRange: 14500,
    combatAdvantageReengageRange: 16000,
    combatAdvantageReengageRecentInRangeMs: 3000
  });
  const edgeState = { combatTarget: { ...edgeEngaged } };
  const retainedEdgeTarget = pickEngagedCombatTargetCore(edgeSelf, [], [edgeTarget], [], edgeState, {
    nowMs: 10000,
    targetStickMs: 30000,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 17000,
    combatDisengageRange: 17000,
    combatAttackRange: 14500,
    combatAdvantageReengageRange: 16000,
    combatAdvantageReengageRecentInRangeMs: 3000
  });
  results.push({
    name: 'engaged-edge-hp-advantage-reengages-when-escape-is-not-confirmed',
    passed: edgeEscape.confirmed === false
      && edgePressure.active === true
      && retainedEdgeTarget?.user_id === 2
      && retainedEdgeTarget?.combatIntent === 'reengage'
      && retainedEdgeTarget?.combatEngagement?.edgePressure?.active === true
  });
  const escapingTarget = {
    ...edgeTarget,
    x: 15000,
    vx: 50,
    hp: 31,
    distance: 15000,
    active: true
  };
  const escapingEngaged = {
    ...edgeEngaged,
    at: 10500,
    lastInRangeAt: 10000,
    opponentBehaviorState: {
      mode: 'retreat-kite',
      confidence: 1,
      noProgressMs: 13368,
      metrics: { netDistanceChange: 7727 }
    }
  };
  const confirmedEscape = combatEscapeDecisionCore({ ...edgeSelf, hp: 91 }, escapingTarget, escapingEngaged, {
    nowMs: 11000,
    combatAttackRange: 14500
  });
  const escapeState = { combatTarget: { ...escapingEngaged, escapeDecision: confirmedEscape } };
  const heldEscapeTarget = pickEngagedCombatTargetCore({ ...edgeSelf, hp: 91 }, [], [escapingTarget], [], escapeState, {
    nowMs: 11000,
    targetStickMs: 30000,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 17000,
    combatDisengageRange: 17000,
    combatAttackRange: 14500,
    combatEscapeHoldMs: 1500
  });
  const expiredEscapeState = { combatTarget: { ...escapingEngaged, escapeDecision: confirmedEscape } };
  const expiredEscapeTarget = pickEngagedCombatTargetCore({ ...edgeSelf, hp: 91 }, [], [escapingTarget], [], expiredEscapeState, {
    nowMs: 12000,
    targetStickMs: 30000,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 17000,
    combatDisengageRange: 17000,
    combatAttackRange: 14500,
    combatEscapeHoldMs: 1500
  });
  results.push({
    name: 'confirmed-escape-holds-briefly-without-reengage-then-releases-target',
    passed: confirmedEscape.confirmed === true
      && confirmedEscape.radialAwaySpeed === 50
      && heldEscapeTarget?.combatEngagement?.escapeHold === true
      && heldEscapeTarget?.combatEngagement?.edgePressure?.active === false
      && expiredEscapeTarget === null
      && expiredEscapeState.combatTarget === null
  });
  let composite = null;
  for (let index = 0; index < 50; index += 1) {
    composite = updateOpponentBehaviorStateCore(composite, {
      at: 1000 + index * 200,
      selfX: 0,
      selfY: 0,
      x: 8000 + index * 20,
      y: 0,
      vx: 50,
      vy: 0,
      distance: 8000 + index * 20,
      firing: true,
      realBulletPressure: true,
      newBulletCount: 1,
      newShotEvents: [{ bulletId: `shot-${index}`, createdTick: 100 + index * 4 }],
      currentTick: 100 + index * 4,
      commandDelayP90Ticks: 5,
      targetStamina5s: 6000 - index * 50
    });
  }
  results.push({
    name: 'opponent-behavior-exposes-simultaneous-movement-shooting-stamina-and-control-dimensions',
    passed: Boolean(composite?.dimensions?.movementIntent?.state)
      && ['burst', 'sustained'].includes(composite?.dimensions?.shootingPhase?.state)
      && Boolean(composite?.dimensions?.staminaPhase?.state)
      && composite?.dimensions?.controlStyle?.sampleMs >= 8000
      && composite?.dimensions?.controlStyle?.state === 'periodic-script'
      && composite?.dimensions?.controlStyle?.evidenceWeight >= 0.6
      && Number.isFinite(composite?.automationLikelihood)
      && composite?.metrics?.movementTransitions?.currentState === 'east'
      && composite?.metrics?.movementTransitions?.next?.[0]?.state === 'east'
      && composite?.metrics?.movementTransitions?.transitionCount >= 40
  });
  const splitBurstCadence = burstCadenceMetricsCore([6, 6, 6, 24, 6, 6, 6]);
  const irregularCadence = burstCadenceMetricsCore([4, 9, 17, 6]);
  const droppedFrameCadence = burstCadenceMetricsCore([6, 6, 12, 6]);
  results.push({
    name: 'opponent-burst-cadence-separates-gaps-rejects-irregular-and-tolerates-dropped-events',
    passed: splitBurstCadence.burstIntervalMedianTicks === 6
      && splitBurstCadence.burstIntervalMadTicks === 0
      && splitBurstCadence.burstSampleCount === 6
      && splitBurstCadence.interBurstGapMedianTicks === 24
      && splitBurstCadence.currentBurstShotCount === 4
      && splitBurstCadence.burstPredictable === true
      && irregularCadence.burstPredictable === false
      && irregularCadence.burstConfidence < 0.55
      && droppedFrameCadence.burstIntervalMedianTicks === 6
      && droppedFrameCadence.interBurstGaps.length === 0
      && droppedFrameCadence.burstPredictable === true
  });
  let createdTickCadence = null;
  for (let index = 0; index < 4; index += 1) {
    createdTickCadence = updateOpponentBehaviorStateCore(createdTickCadence, {
      at: 1000 + index * 400,
      selfX: 0,
      selfY: 0,
      x: 9000,
      y: 0,
      vx: 0,
      vy: 0,
      distance: 9000,
      firing: true,
      realBulletPressure: true,
      newBulletCount: 1,
      newShotEvents: [{ bulletId: `cadence-${index}`, createdTick: 100 + index * 8 }],
      currentTick: 100 + index * 8,
      commandDelayP90Ticks: 5
    });
  }
  createdTickCadence = updateOpponentBehaviorStateCore(createdTickCadence, {
    at: 2650,
    selfX: 0,
    selfY: 0,
    x: 9000,
    y: 0,
    vx: 0,
    vy: 0,
    distance: 9000,
    firing: false,
    realBulletPressure: true,
    newBulletCount: 0,
    newShotEvents: [],
    currentTick: 131,
    commandDelayP90Ticks: 5
  });
  const combinedPolicy = opponentResponsePolicyCore('retreat-kite', {
    movementIntent: 'zigzag',
    shootingPhase: 'preparing',
    lateralFlips: 4,
    distanceChangeRate: 12,
    distance: 11000,
    hitRate: 0.05,
    targetPressure: false
  });
  results.push({
    name: 'opponent-created-tick-phase-separates-old-bullets-and-detects-combined-pressure',
    passed: createdTickCadence?.dimensions?.shootingPhase?.state === 'preparing'
      && createdTickCadence?.dimensions?.shootingPhase?.shootingPhaseSource === 'predicted-created-tick-window'
      && createdTickCadence?.dimensions?.shootingPhase?.lastCreatedTick === 124
      && createdTickCadence?.dimensions?.shootingPhase?.intervalMedianTicks === 8
      && createdTickCadence?.dimensions?.shootingPhase?.burstIntervalMedianTicks === 8
      && createdTickCadence?.dimensions?.shootingPhase?.burstSampleCount === 3
      && createdTickCadence?.dimensions?.shootingPhase?.currentBurstShotCount === 4
      && createdTickCadence?.dimensions?.shootingPhase?.burstPredictable === true
      && createdTickCadence?.dimensions?.shootingPhase?.oldBulletPressure === true
      && combinedPolicy.name === 'zigzag-retreat-pressure'
      && combinedPolicy.suppressFire === true
      && combinedPolicy.closeIn === true
  });
  let burstWarmup = null;
  const burstEvent = (index, createdTick) => {
    burstWarmup = updateOpponentBehaviorStateCore(burstWarmup, {
      at: 1000 + index * 300,
      selfX: 0,
      selfY: 0,
      x: 9000,
      y: 0,
      vx: 0,
      vy: 0,
      distance: 9000,
      firing: true,
      realBulletPressure: true,
      newBulletCount: 1,
      newShotEvents: [{ bulletId: `burst-warmup-${index}`, createdTick }],
      currentTick: createdTick,
      commandDelayP90Ticks: 5
    });
  };
  [100, 106, 112, 118, 142].forEach((tick, index) => burstEvent(index, tick));
  const afterFirstBurstShot = updateOpponentBehaviorStateCore(burstWarmup, {
    at: 2250,
    selfX: 0,
    selfY: 0,
    x: 9000,
    y: 0,
    vx: 0,
    vy: 0,
    distance: 9000,
    firing: false,
    realBulletPressure: false,
    newBulletCount: 0,
    newShotEvents: [],
    currentTick: 143,
    commandDelayP90Ticks: 5
  });
  burstWarmup = afterFirstBurstShot;
  burstEvent(6, 148);
  burstEvent(7, 154);
  const afterThirdBurstShot = updateOpponentBehaviorStateCore(burstWarmup, {
    at: 3450,
    selfX: 0,
    selfY: 0,
    x: 9000,
    y: 0,
    vx: 0,
    vy: 0,
    distance: 9000,
    firing: false,
    realBulletPressure: false,
    newBulletCount: 0,
    newShotEvents: [],
    currentTick: 159,
    commandDelayP90Ticks: 5
  });
  results.push({
    name: 'opponent-burst-prediction-waits-for-two-current-burst-intervals',
    passed: afterFirstBurstShot?.dimensions?.shootingPhase?.state !== 'preparing'
      && afterFirstBurstShot?.dimensions?.shootingPhase?.predictedCreatedTick === null
      && afterFirstBurstShot?.dimensions?.shootingPhase?.currentBurstShotCount === 1
      && afterThirdBurstShot?.dimensions?.shootingPhase?.state === 'preparing'
      && afterThirdBurstShot?.dimensions?.shootingPhase?.predictedCreatedTick === 160
      && afterThirdBurstShot?.dimensions?.shootingPhase?.currentBurstShotCount === 3
  });
  const exhausted = updateOpponentBehaviorStateCore(composite, {
    at: 11200,
    selfX: 0,
    selfY: 0,
    x: 9000,
    y: 0,
    vx: 50,
    vy: 0,
    distance: 9000,
    firing: false,
    realBulletPressure: false,
    hasThreateningBullet: false,
    newBulletCount: 0,
    targetStamina5s: 1000
  });
  results.push({
    name: 'opponent-behavior-enters-exhausted-window-only-after-old-bullets-clear',
    passed: exhausted?.dimensions?.staminaPhase?.state === 'exhausted-likely'
      && exhausted?.responsePolicy?.name === 'opponent-exhausted-window'
      && exhausted?.responsePolicy?.closeIn === true
      && exhausted?.responsePolicy?.maximumCadenceMs === 160
  });

  const exchangeFirst = evaluateCombatExchangeStopLossCore({
    nowMs: 10000,
    engagedMs: 10000,
    acceptedShots: 12,
    damageObservations: 5,
    selfHp: 60,
    targetHp: 80,
    windowMs: 10000,
    windowSelfDamage: 18,
    windowTargetDamage: 3,
    longWindowSelfDamage: 18,
    longWindowTargetDamage: 3,
    recentTargetDamage: 0
  });
  const exchangeConfirmed = evaluateCombatExchangeStopLossCore({
    nowMs: 13000,
    engagedMs: 13000,
    acceptedShots: 16,
    damageObservations: 6,
    selfHp: 55,
    targetHp: 79,
    windowMs: 10000,
    windowSelfDamage: 21,
    windowTargetDamage: 4,
    longWindowSelfDamage: 21,
    longWindowTargetDamage: 4,
    degradationSinceAt: exchangeFirst.degradationSinceAt
  });
  const protectedFinish = evaluateCombatExchangeStopLossCore({
    nowMs: 13000,
    engagedMs: 13000,
    acceptedShots: 16,
    damageObservations: 6,
    selfHp: 45,
    targetHp: 15,
    windowSelfDamage: 21,
    windowTargetDamage: 4,
    recentTargetDamage: 3
  });
  results.push({
    name: 'combat-exchange-stop-loss-confirms-degradation-but-protects-low-hp-finish',
    passed: exchangeFirst.active === true
      && exchangeFirst.triggered === false
      && exchangeConfirmed.triggered === true
      && protectedFinish.lowHpFinishProtected === true
      && protectedFinish.triggered === false
  });

  const attackWorthOptions = {
    isWhitelistedTarget: target => target?.whitelisted === true,
    dropValue: actor => Number(actor?.drop || 0),
    isAfkProfitTarget: target => target?.afk === true,
    attackMinDrop: 3,
    attackMinAfkDrop: 2,
    attackMinRewardRatio: 1.5
  };
  results.push({
    name: 'attack-worth-core-blocks-whitelisted-target',
    passed: attackWorthTakingCore({ drop: 0 }, { drop: 99, whitelisted: true }, attackWorthOptions) === false
  });
  results.push({
    name: 'attack-worth-core-uses-afk-drop-threshold',
    passed: attackWorthTakingCore({ drop: 0 }, { drop: 2, afk: true }, attackWorthOptions) === true
      && attackWorthTakingCore({ drop: 0 }, { drop: 1, afk: true }, attackWorthOptions) === false
  });
  results.push({
    name: 'attack-worth-core-uses-reward-ratio-for-active-target',
    passed: attackWorthTakingCore({ drop: 4 }, { drop: 5 }, attackWorthOptions) === false
      && attackWorthTakingCore({ drop: 4 }, { drop: 6 }, attackWorthOptions) === true
  });

  results.push({
    name: 'exit-motion-core-computes-stop-lock',
    passed: exitMotionStopLockRemainingMsCore(1000, 8000, 2500) === 6500
      && exitMotionStopLockRemainingMsCore(1000, -1, 2500) === 0
      && exitMotionStopLockRemainingMsCore(0, 8000, 2500) === 0
  });
  const postExitPreviousDecision = postExitDecisionWithoutTargetCore({
    kind: 'combat',
    reason: 'previous-reason',
    dx: 1,
    dy: -1,
    target: { id: 'enemy' },
    aimTarget: { id: 'enemy' },
    opportunisticShot: { id: 'enemy' },
    combat: true,
    shoot: true,
    forceShoot: true,
    combatCover: { id: 'cover' }
  }, '', {
    lastExitMotionStopReason: 'last-stop',
    exitMotionLockRemainingMs: () => 123
  });
  results.push({
    name: 'exit-motion-core-sanitizes-targeted-decision',
    passed: postExitPreviousDecision.kind === 'wait'
      && postExitPreviousDecision.reason === 'previous-reason'
      && postExitPreviousDecision.dx === 0
      && postExitPreviousDecision.dy === 0
      && postExitPreviousDecision.target === null
      && postExitPreviousDecision.aimTarget === null
      && postExitPreviousDecision.opportunisticShot === null
      && postExitPreviousDecision.combat === false
      && postExitPreviousDecision.shoot === false
      && postExitPreviousDecision.forceShoot === false
      && postExitPreviousDecision.combatCover === null
      && postExitPreviousDecision.exitMotionStopped === true
      && postExitPreviousDecision.exitMotionStopReason === 'last-stop'
      && postExitPreviousDecision.exitMotionLockRemainingMs === 123
  });
  const postExitExplicitReason = postExitDecisionWithoutTargetCore(null, 'exit-confirmed', {
    lastExitMotionStopReason: 'last-stop',
    exitMotionLockRemainingMs: 0
  });
  results.push({
    name: 'exit-motion-core-explicit-reason-overrides-fallbacks',
    passed: postExitExplicitReason.reason === 'exit-confirmed'
      && postExitExplicitReason.exitMotionStopReason === 'exit-confirmed'
      && postExitExplicitReason.exitMotionLockRemainingMs === 0
  });

  const pendingExitRetryOptions = {
    leaveRetryMinMs: 10000,
    leaveCommandTimeoutMs: 3000,
    offlineLeaveRetryMs: 12000,
    combatLeaveRetryMs: 4000,
    pursuitLeaveRetryMs: 16000
  };
  results.push({
    name: 'pending-exit-retry-core-applies-source-specific-floors',
    passed: pendingExitRetryMsCore({ scope: 'offline', source: 'offline' }, pendingExitRetryOptions) === 12000
      && pendingExitRetryMsCore({ scope: 'enemy', source: 'pursuit' }, pendingExitRetryOptions) === 16000
      && pendingExitRetryMsCore({ scope: 'enemy', source: 'combat' }, pendingExitRetryOptions) === 10000
  });
  results.push({
    name: 'pending-exit-display-core-uses-summary-fallback',
    passed: pendingExitDisplayReasonCore('追击退出') === '追击退出，等待退出确认，未退出会继续补发'
      && pendingExitDisplayReasonCore('') === '退出请求已发送，等待退出确认，未退出会继续补发'
  });
  const pendingExitSummary = summarizePendingExitCore({
    scope: 'enemy',
    source: 'combat',
    reason: 'combat leave',
    summary: '战斗退出',
    displayReason: '战斗退出等待',
    at: 1000,
    lastAttemptAt: 1500,
    retryCount: 2,
    userId: 'self-1',
    combatCover: { reason: 'cover', dx: 2, dy: -2, shoot: true },
    lastResult: { leaveRequestPending: true, error: 'timeout' }
  }, {
    nowMs: 2500,
    retryMs: 3000,
    reloadConfirmation: {
      required: true,
      requestedAt: 1800,
      reloadedAt: 2200,
      restoredAfterReload: true,
      count: 1,
      reason: 'leave-success'
    }
  });
  results.push({
    name: 'pending-exit-summary-core-normalizes-runtime-status',
    passed: pendingExitSummary.ageMs === 1500
      && pendingExitSummary.lastAttemptAgeMs === 1000
      && pendingExitSummary.retryRemainingMs === 2000
      && pendingExitSummary.leaveRequestPending === true
      && pendingExitSummary.reloadConfirmation?.ageAfterReloadMs === 300
      && pendingExitSummary.combatCover?.dx === 1
      && pendingExitSummary.combatCover?.dy === -1
      && pendingExitSummary.lastError === 'timeout'
  });
  results.push({
    name: 'pending-exit-leave-request-http-403-core-detects-status-and-text',
    passed: leaveRequestHasHttp403Core({ status: 403 }) === true
      && leaveRequestHasHttp403Core({ result: { statusCode: 403 } }) === true
      && leaveRequestHasHttp403Core({ message: 'HTTP 403 Forbidden' }) === true
      && leaveRequestHasHttp403Core({ message: 'HTTP 4030' }) === false
  });
  results.push({
    name: 'pending-exit-leave-detail-http-403-core-scans-request-history',
    passed: leaveDetailHasHttp403Core({ lastLeaveRequest: { statusCode: 403 } }) === true
      && leaveDetailHasHttp403Core({ leaveRequests: [{ status: 500 }, { statusText: 'Forbidden' }] }) === true
      && leaveDetailHasHttp403Core({ leaveRequests: [{ status: 500 }] }) === false
  });
  results.push({
    name: 'pending-exit-leave-response-confirmation-core-requires-explicit-left-state',
    passed: leaveResponseConfirmsExitCore({ ok: true, event: 'left', joined: 'UserRecordOnly', current_join_mode: 'None', life: 'Alive' }) === true
      && leaveResponseConfirmsExitCore({ ok: true, left: true }) === true
      && leaveResponseConfirmsExitCore({ ok: true, joined: 'UserRecordOnly', current_join_mode: 'None' }) === true
      && leaveResponseConfirmsExitCore({ ok: true }) === false
      && leaveResponseConfirmsExitCore({ ok: true, joined: 'Joined', current_join_mode: 'Active' }) === false
      && leaveResponseConfirmsExitCore(undefined) === false
  });
  results.push({
    name: 'pending-exit-leave-detail-success-core-rejects-error-pending-403-and-ambiguous-completion',
    passed: leaveDetailSucceededCore({ attempted: true, method: 'leave', lastLeaveRequest: { completedAt: 1000 } }) === false
      && leaveDetailSucceededCore({ attempted: true, method: 'leave', lastLeaveRequest: { completedAt: 1000, result: { ok: true, event: 'left', joined: 'UserRecordOnly', current_join_mode: 'None' } } }) === true
      && leaveDetailSucceededCore({ attempted: true, leaveRequestPending: true, method: 'leave' }) === false
      && leaveDetailSucceededCore({ attempted: true, error: 'timeout', method: 'leave' }) === false
      && leaveDetailSucceededCore({ attempted: true, method: 'leave', lastLeaveRequest: { status: 403 } }) === false
  });
  const existingReloadConfirmation = {
    required: true,
    requestedAt: 1100,
    count: 2,
    restoredAfterReload: true
  };
  const normalizeReloadConfirmation = value => value?.required ? value : null;
  const leaveSuccessReloadConfirmation = leaveSuccessReloadConfirmationForDetailCore({
    attempted: true,
    at: 900,
    lastLeaveRequest: {
      completedAt: 1000,
      requestId: 'leave-request-1',
      result: { ok: true, event: 'left', joined: 'UserRecordOnly', current_join_mode: 'None' }
    }
  }, {
    reloadConfirmation: existingReloadConfirmation
  }, 1200, {
    normalizeReloadConfirmation
  });
  results.push({
    name: 'pending-exit-leave-success-reload-confirmation-core-preserves-existing-state',
    passed: leaveSuccessReloadConfirmation.required === true
      && leaveSuccessReloadConfirmation.reason === 'leave-success'
      && leaveSuccessReloadConfirmation.leaveSucceededAt === 1000
      && leaveSuccessReloadConfirmation.requestId === 'leave-request-1'
      && leaveSuccessReloadConfirmation.requestedAt === 1100
      && leaveSuccessReloadConfirmation.count === 2
      && leaveSuccessReloadConfirmationForDetailCore({ attempted: false }, {
        reloadConfirmation: existingReloadConfirmation
      }, 1200, { normalizeReloadConfirmation }) === existingReloadConfirmation
  });
  results.push({
    name: 'pending-exit-leave-success-reload-confirmation-satisfied-core-checks-reload-marker',
    passed: leaveSuccessReloadConfirmationSatisfiedCore({ restoredAfterReload: true }) === true
      && leaveSuccessReloadConfirmationSatisfiedCore({ reloadedAt: 1200 }) === true
      && leaveSuccessReloadConfirmationSatisfiedCore({ requestedAt: 1100 }) === false
  });
  results.push({
    name: 'pending-exit-wait-reason-core-preserves-source-reasons',
    passed: pendingExitWaitReasonCore({ scope: 'offline', source: 'offline' }, false) === 'offline-leave'
      && pendingExitWaitReasonCore({ scope: 'offline', source: 'offline' }, true) === 'offline-leave-wait'
      && pendingExitWaitReasonCore({ scope: 'enemy', source: 'pursuit' }, false) === 'pursuit-leave-retry'
      && pendingExitWaitReasonCore({ scope: 'enemy', source: 'combat' }, true) === 'enemy-leave-wait'
  });
  results.push({
    name: 'leave-command-failure-message-core-classifies-result-errors',
    passed: leaveCommandFailureMessageCore(false) === 'leave request returned false'
      && leaveCommandFailureMessageCore({ ok: false, message: 'blocked' }) === 'blocked'
      && leaveCommandFailureMessageCore({ error: 'network' }) === 'network'
      && leaveCommandFailureMessageCore({ status: 500, statusText: 'server' }) === 'server'
      && leaveCommandFailureMessageCore({ ok: true }) === ''
  });
  const summarizedLeaveResult = summarizeLeaveCommandResultCore({
    ok: false,
    statusCode: 403,
    statusText: 'Forbidden',
    message: 'blocked',
    error: 'denied'
  });
  const summarizedLeaveSuccess = summarizeLeaveCommandResultCore({
    ok: true,
    event: 'left',
    joined: 'UserRecordOnly',
    current_join_mode: 'None'
  });
  results.push({
    name: 'leave-command-result-summary-core-normalizes-primitive-and-object-results',
    passed: summarizeLeaveCommandResultCore(undefined).type === 'undefined'
      && summarizeLeaveCommandResultCore(false).value === false
      && summarizeLeaveCommandResultCore('abc').value === 'abc'
      && summarizedLeaveResult.type === 'object'
      && summarizedLeaveResult.status === 403
      && summarizedLeaveResult.error === 'denied'
      && summarizedLeaveSuccess.leaveConfirmed === true
      && summarizedLeaveSuccess.response.current_join_mode === 'None'
  });
  results.push({
    name: 'leave-command-clash-rescue-failure-core-gates-hook-enabled-failed-detail',
    passed: leaveDetailFailedForClashRescueCore({
      attempted: true,
      error: 'timeout'
    }, {
      clashLeaveRescueEnabled: true,
      hasClashLeaveRescueHook: true
    }) === true
      && leaveDetailFailedForClashRescueCore({
        attempted: true,
        error: 'timeout'
      }, {
        clashLeaveRescueEnabled: true,
        hasClashLeaveRescueHook: false
      }) === false
      && leaveDetailFailedForClashRescueCore({
        attempted: true,
        method: 'leave',
        lastLeaveRequest: { completedAt: 1000 }
      }, {
        clashLeaveRescueEnabled: true,
        hasClashLeaveRescueHook: true
      }) === false
  });
  const clashAttemptsDetail = {
    clashLeaveRescueAttempts: [
      null,
      { stage: 'auto' },
      'bad',
      { stage: 'direct' }
    ]
  };
  results.push({
    name: 'leave-command-clash-rescue-stage-core-filters-attempts-and-picks-next',
    passed: clashLeaveRescueAttemptsCore(clashAttemptsDetail).length === 2
      && nextClashLeaveRescueStageCore(clashAttemptsDetail) === 'manual'
      && nextClashLeaveRescueStageCore({ clashLeaveRescueAttempts: [{ stage: 'auto' }] }, {
        stageOrder: ['auto', 'manual']
      }) === 'manual'
  });
  const clashResultSummary = summarizeClashLeaveRescueResultCore({
    ok: false,
    target: 'proxy',
    closeConnections: {
      ok: false,
      status: 599,
      error: 'close failed'
    }
  }, 'direct', '', { nowMs: 2000 });
  results.push({
    name: 'leave-command-clash-rescue-result-core-summarizes-proxy-result',
    passed: clashResultSummary.stage === 'direct'
      && clashResultSummary.ok === false
      && clashResultSummary.target === 'proxy'
      && clashResultSummary.at === 2000
      && clashResultSummary.closeConnections?.status === 599
  });
  const clashRetryDetail = clashLeaveRescueRetryDetailCore({
    at: 1000,
    attempted: true,
    method: 'leave',
    error: '403',
    leaveRequestPending: true,
    lastLeaveRequest: { requestId: 'old' },
    leaveRequests: [{ requestId: 'old' }],
    reason: 'leave-http-403',
    clashLeaveRescueAttempts: [{ stage: 'auto' }]
  }, 'direct', {
    nowMs: 3000,
    cloneForPendingExit: value => ({ ...value, cloned: true }),
    pendingExitDisplayReason: summary => 'display:' + summary
  });
  results.push({
    name: 'leave-command-clash-rescue-retry-detail-core-clears-stale-request-state',
    passed: clashRetryDetail.cloned === true
      && clashRetryDetail.at === 3000
      && clashRetryDetail.attempted === false
      && clashRetryDetail.method === ''
      && clashRetryDetail.error === ''
      && clashRetryDetail.leaveRequestPending === false
      && Array.isArray(clashRetryDetail.leaveRequests)
      && clashRetryDetail.leaveRequests.length === 0
      && clashRetryDetail.clashLeaveRescueStage === 'direct'
      && clashRetryDetail.displayReason === 'display:leave-http-403'
  });
  const clashResetDetail = resetClashLeaveRescueRoundCore({
    clashLeaveRescueAttempts: [{ stage: 'auto' }],
    clashLeaveRescue: { stage: 'auto' },
    clashLeaveRescueStage: 'auto',
    clashLeaveRescueRetry: true
  });
  results.push({
    name: 'leave-command-clash-rescue-reset-core-clears-round-state',
    passed: Array.isArray(clashResetDetail.clashLeaveRescueAttempts)
      && clashResetDetail.clashLeaveRescueAttempts.length === 0
      && clashResetDetail.clashLeaveRescue === null
      && clashResetDetail.clashLeaveRescueStage === ''
      && clashResetDetail.clashLeaveRescueRetry === false
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
  const stalePlayerFocus = buildActionFocus({
    kind: 'patrol',
    reason: 'leave-stale-coin',
    target: { userId: 27821, hp: 100, drop: 5 }
  });
  const staleCoinFocus = buildActionFocus({
    kind: 'patrol',
    reason: 'leave-stale-coin',
    target: { drop_id: 27821, amount: 1 }
  });
  results.push({
    name: 'action-focus-prefers-structured-identity-over-patrol-reason',
    passed: stalePlayerFocus?.key === 'enemy:27821'
      && staleCoinFocus?.key === 'coin:27821'
  });
  const staleEscapeFocus = buildActionFocus({
    kind: 'patrol',
    reason: 'leave-stale-coin',
    staleCoinEscape: { id: 'id:27821' }
  });
  results.push({
    name: 'action-focus-uses-dedicated-stale-coin-escape-key',
    passed: staleEscapeFocus?.key === 'escape:id:27821'
      && staleEscapeFocus?.targeted === false
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

  const nonUrgentSafety = { kind: 'flee', band: 'safety', reason: 'active-threat-return-block', threatEvidence: { firing: false } };
  const combatState = {
    lastAction: { ...combatAction, band: 'combat' },
    lastFocus: buildActionFocus({ ...combatAction, band: 'combat' }),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };
  const heldCombat = applyFinalActionArbitration(nonUrgentSafety, combatState.lastAction, combatState, { finalActionArbitrationHoldMs: 1800 });
  results.push({
    name: 'arbitration-engaged-combat-holds-over-nonurgent-active-evidence',
    passed: heldCombat.held && heldCombat.action.band === 'combat'
  });

  const urgentCombatState = {
    lastAction: { ...combatAction, band: 'combat' },
    lastFocus: buildActionFocus({ ...combatAction, band: 'combat' }),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };
  const urgentSafety = { ...nonUrgentSafety, urgent: true, threatEvidence: { firing: true } };
  const urgentResult = applyFinalActionArbitration(urgentSafety, urgentCombatState.lastAction, urgentCombatState, { finalActionArbitrationHoldMs: 1800 });
  results.push({
    name: 'arbitration-urgent-firing-threat-preempts-combat',
    passed: !urgentResult.held && urgentResult.action.band === 'safety'
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

  const ordinaryProfitAction = {
    kind: 'seek-enemy',
    band: 'profit',
    reason: 'best-opportunity',
    target: { userId: 88 },
    finalCandidate: { commitmentRank: 0, netROI: 0.05 }
  };
  const baitReleaseAction = {
    kind: 'coin',
    band: 'profit',
    reason: 'single-coin-bait-release',
    target: { id: 'bait' },
    finalCandidate: { commitmentRank: 10, netROI: 0.001 }
  };
  const postAttackAction = {
    kind: 'coin',
    band: 'profit',
    reason: 'post-attack-drop-coin',
    target: { id: 'drop' },
    finalCandidate: { commitmentRank: 20, netROI: 0.002 }
  };
  const ordinaryProfitState = {
    lastAction: ordinaryProfitAction,
    lastFocus: buildActionFocus(ordinaryProfitAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };
  const postAttackState = {
    lastAction: postAttackAction,
    lastFocus: buildActionFocus(postAttackAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };
  const committedProfitResult = applyFinalActionArbitration(
    baitReleaseAction,
    ordinaryProfitAction,
    ordinaryProfitState,
    { finalActionArbitrationHoldMs: 480 }
  );
  const strongerCommitmentResult = applyFinalActionArbitration(
    baitReleaseAction,
    postAttackAction,
    postAttackState,
    { finalActionArbitrationHoldMs: 480 }
  );
  results.push({
    name: 'arbitration-profit-commitment-preempts-ordinary-roi-but-keeps-stronger-commitment',
    passed: !committedProfitResult.held
      && committedProfitResult.action.reason === 'single-coin-bait-release'
      && strongerCommitmentResult.held
      && strongerCommitmentResult.action.reason === 'post-attack-drop-coin'
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

  // Test coin motion
  const coinMotionOptions = {
    tolerance: 60,
    coinPrecisionTolerance: 60,
    coinAxisApproachMinDistance: 5000,
    coinAxisApproachRatio: 4,
    coinAxisApproachLaneTolerance: 1800,
    coinPickupStopDistance: 30,
    coinPickupStopPulseMs: 45,
    coinPickupMicroDistance: 120,
    coinPickupMicroPulseMs: 60,
    coinPickupFineDistance: 320,
    coinPickupFinePulseMs: 75,
    coinPickupBrakeDistance: 650,
    coinPickupBrakePulseMs: 90,
    coinPickupSweepDistance: 900,
    coinPickupSweepPulseMs: 150,
    coinPickupPulseMs: 180,
    coinPickupExactTolerance: 0,
    coinPickupFailureSlowStepMs: 10,
    coinPickupFailureMinPulseMs: 35,
    coinApproachBrakeDistance: 700,
    coinApproachLockMs: 900,
    nearCoinStuckDistance: 5000,
    nowMs: 1000
  };
  const axisCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'axis', x: 15000, y: 500 },
    coinMotionOptions
  );
  results.push({
    name: 'coin-motion-axis-approach-dominant-gap',
    passed: axisCoinMotion.direction.dx === 1
      && axisCoinMotion.direction.dy === 0
      && axisCoinMotion.direction.axisApproach === 'x'
      && axisCoinMotion.lockUpdate?.lock?.id === 'axis'
  });

  const laneAlignCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'lane-align', x: 500, y: 15000 },
    { ...coinMotionOptions, coinAlignNearAxisFirst: true }
  );
  const laneFollowCoinMotion = coinDirectionToCore(
    { x: 500, y: 0 },
    { drop_id: 'lane-align', x: 500, y: 15000 },
    { ...coinMotionOptions, coinAlignNearAxisFirst: true }
  );
  results.push({
    name: 'coin-motion-follows-long-lane-without-short-axis-oscillation',
    passed: laneAlignCoinMotion.direction.dx === 0
      && laneAlignCoinMotion.direction.dy === 1
      && laneAlignCoinMotion.direction.laneAligned === 'x'
      && laneFollowCoinMotion.direction.dx === 0
      && laneFollowCoinMotion.direction.dy === 1
      && laneFollowCoinMotion.direction.laneAligned === 'x'
  });

  const nearCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'near-axis', x: 4800, y: 500 },
    coinMotionOptions
  );
  results.push({
    name: 'coin-motion-near-stuck-uses-single-axis',
    passed: nearCoinMotion.direction.dx === 1
      && nearCoinMotion.direction.dy === 0
      && !nearCoinMotion.direction.axisApproach
      && nearCoinMotion.lockUpdate?.action === 'set'
  });

  results.push({
    name: 'coin-motion-axis-lock-release-threshold',
    passed: coinAxisLockShouldHoldCore({ dx: 1, dy: 0 }, 500, 0, coinMotionOptions) === false
      && coinAxisLockShouldHoldCore({ dx: 1, dy: 0 }, 1200, 0, coinMotionOptions) === true
  });

  results.push({
    name: 'coin-motion-pickup-pulse-tiers',
    passed: (() => {
      const stop = coinPickupPrecisionPulseMsCore(20, 0, coinMotionOptions);
      const micro = coinPickupPrecisionPulseMsCore(80, 0, coinMotionOptions);
      const fine = coinPickupPrecisionPulseMsCore(250, 0, coinMotionOptions);
      const brake = coinPickupPrecisionPulseMsCore(500, 0, coinMotionOptions);
      const sweep = coinPickupPrecisionPulseMsCore(800, 0, coinMotionOptions);
      return stop === 45 && micro === 60 && fine === 75 && brake === 90 && sweep === 150;
    })()
  });

  results.push({
    name: 'coin-motion-pickup-failures-reduce-pulse',
    passed: coinPickupPrecisionPulseMsCore(500, 3, coinMotionOptions) < coinPickupPrecisionPulseMsCore(500, 0, coinMotionOptions)
      && coinPickupPrecisionPulseMsCore(500, 100, coinMotionOptions) === coinMotionOptions.coinPickupFailureMinPulseMs
  });

  const closeCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'close', x: 40, y: 0 },
    { ...coinMotionOptions, pickupFailureCount: 2, pickupAttemptSlowCount: 1 }
  );
  results.push({
    name: 'coin-motion-close-pickup-pushes-through',
    passed: closeCoinMotion.direction.dx === 1
      && closeCoinMotion.direction.dy === 0
      && closeCoinMotion.direction.exactTarget === true
      && closeCoinMotion.direction.pickupMicro === true
      && closeCoinMotion.direction.precisionPulseMs === 35
      && closeCoinMotion.lockUpdate?.lock?.until === 1180
  });

  const exactCoinMotion = coinDirectionToCore(
    { x: 10, y: -5 },
    { drop_id: 'exact', x: 10, y: -5 },
    { ...coinMotionOptions, lock: { id: 'exact', dx: 1, dy: 0, until: 2000 } }
  );
  results.push({
    name: 'coin-motion-exact-coordinate-stops-and-clears-own-lock',
    passed: exactCoinMotion.direction.dx === 0
      && exactCoinMotion.direction.dy === 0
      && exactCoinMotion.direction.exactTarget === true
      && exactCoinMotion.lockUpdate?.action === 'clear'
      && exactCoinMotion.lockUpdate?.id === 'exact'
      && exactCoinMotion.lockUpdate?.all === false
  });

  const diagonalCoinMotion = coinDirectionToCore(
    { x: 0, y: 0 },
    { drop_id: 'diagonal', x: 15000, y: 6000 },
    { ...coinMotionOptions, lock: { id: 'other', dx: 1, dy: 0, until: 2000 } }
  );
  results.push({
    name: 'coin-motion-diagonal-fallback-clears-stale-lock',
    passed: diagonalCoinMotion.direction.dx === 1
      && diagonalCoinMotion.direction.dy === 1
      && !diagonalCoinMotion.direction.axisApproach
      && diagonalCoinMotion.lockUpdate?.action === 'clear'
      && diagonalCoinMotion.lockUpdate?.all === true
  });

  const motionMeta = coinMotionMetaCore({
    pickupSweep: true,
    pickupFine: true,
    pickupFailureCount: 2,
    pickupAttemptSlowCount: 1,
    precisionPulseMs: 70.6,
    locked: true,
    pushThrough: true
  });
  results.push({
    name: 'coin-motion-meta-summarizes-pickup-state',
    passed: motionMeta.pickupMode === 'fine'
      && motionMeta.pickupSlowCount === 3
      && motionMeta.pickupFailureCount === 2
      && motionMeta.pickupAttemptSlowCount === 1
      && motionMeta.precisionPulseMs === 71
      && motionMeta.motionLocked === true
      && motionMeta.pushThrough === true
  });

  // Test coin target identity and collection matching
  results.push({
    name: 'coin-target-key-prefers-id-and-falls-back-to-coordinate',
    passed: coinTargetKeyCore({ id: 'coin-a', x: 10, y: 20, amount: 2 }) === 'id:coin-a'
      && coinTargetKeyCore({ x: 10.4, y: 20.6, amount: 2.2 }) === 'xy:10:21:2'
      && coinTargetKeyCore({ amount: 1 }) === ''
  });

  results.push({
    name: 'coin-target-matches-id-or-prune-radius',
    passed: coinMatchesTrackedTargetCore(
      { drop_id: 7, x: 1000, y: 0 },
      { id: '7', x: 9000, y: 0 },
      { coinCollectedPruneRadius: 100 }
    ) === true
      && coinMatchesTrackedTargetCore(
        { x: 1040, y: 0 },
        { x: 1000, y: 0 },
        { coinCollectedPruneRadius: 50 }
      ) === true
      && coinMatchesTrackedTargetCore(
        { x: 1100, y: 0 },
        { x: 1000, y: 0 },
        { coinCollectedPruneRadius: 50 }
      ) === false
  });

  const decisionTrackedCoin = trackedCoinTargetForCollectionCore({
    lastDecision: {
      kind: 'coin',
      target: { x: 300, y: 400, amount: 3 },
      postAttackTarget: { id: 'enemy-1', name: 'Enemy' }
    },
    lastTarget: { kind: 'coin', id: 'last-coin' },
    coinProgress: { id: 'progress-coin' }
  }, { x: 0, y: 0 });
  results.push({
    name: 'coin-target-tracked-decision-fills-id-distance-and-post-attack',
    passed: decisionTrackedCoin?.id === 'last-coin'
      && decisionTrackedCoin?.distance === 500
      && decisionTrackedCoin?.postAttackTarget?.id === 'enemy-1'
  });

  const fallbackTrackedCoin = trackedCoinTargetForCollectionCore({
    lastTarget: { kind: 'coin', id: 'held-coin' },
    coinProgress: { id: 'progress-coin', lastDistance: 42, amount: 5, x: 10, y: 20, postAttackTarget: { id: 'enemy-2' } }
  });
  results.push({
    name: 'coin-target-tracked-fallback-uses-last-target-and-progress',
    passed: fallbackTrackedCoin?.id === 'held-coin'
      && fallbackTrackedCoin?.distance === 42
      && fallbackTrackedCoin?.amount === 5
      && fallbackTrackedCoin?.postAttackTarget?.id === 'enemy-2'
  });

  const nativeSnapshot = buildNativeCoinSnapshotCore([
    { drop_id: 'a', amount: 2.4, x: '10', y: '20' },
    { amount: 3, x: 30, y: 40 },
    { drop_id: 'zero', amount: 0, x: 50, y: 60 },
    { drop_id: 'bad', amount: 1, x: NaN, y: 60 }
  ], { nowMs: 1234 });
  results.push({
    name: 'coin-target-native-snapshot-normalizes-and-filters',
    passed: nativeSnapshot.length === 2
      && nativeSnapshot[0].key === 'id:a'
      && nativeSnapshot[0].amount === 2
      && nativeSnapshot[0].at === 1234
      && nativeSnapshot[1].key === 'xy:30:40:3'
  });

  results.push({
    name: 'coin-target-point-to-segment-distance',
    passed: pointToSegmentDistanceCore({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === 3
      && pointToSegmentDistanceCore({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }) === 5
      && pointToSegmentDistanceCore({ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }) === Infinity
  });

  const currentIncidentalPickups = pickIncidentalCoinPickupsCore([
    { id: 'picked', key: 'id:picked', amount: 2, x: 10, y: 0, at: 900 },
    { id: 'still-visible', key: 'id:still-visible', amount: 3, x: 100, y: 0, at: 900 },
    { id: 'old', key: 'id:old', amount: 4, x: 10, y: 0, at: 0 }
  ], [
    { id: 'still-visible', key: 'id:still-visible', amount: 3, x: 100, y: 0, at: 1000 }
  ], { x: 0, y: 0 }, null, {
    nowMs: 1000,
    incidentalCoinPickupMemoryMs: 500,
    coinCollectedConfirmDistance: 20
  });
  results.push({
    name: 'coin-target-incidental-pickup-current-radius',
    passed: currentIncidentalPickups.length === 1
      && currentIncidentalPickups[0].coin.id === 'picked'
      && currentIncidentalPickups[0].currentDistance === 10
  });

  const pathIncidentalPickups = pickIncidentalCoinPickupsCore([
    { id: 'path', key: 'id:path', amount: 1, x: 50, y: 5, at: 1000 },
    { id: 'far', key: 'id:far', amount: 1, x: 50, y: 30, at: 1000 }
  ], [], { x: 100, y: 0 }, { x: 0, y: 0 }, {
    nowMs: 1200,
    incidentalCoinPickupMemoryMs: 1000,
    coinCollectedConfirmDistance: 10
  });
  results.push({
    name: 'coin-target-incidental-pickup-self-path',
    passed: pathIncidentalPickups.length === 1
      && pathIncidentalPickups[0].coin.id === 'path'
      && pathIncidentalPickups[0].pathDistance === 5
  });

  const snapshotHelperOptions = {
    snapshotCoinClusterMinCoins: 3,
    snapshotSingleCoinMaxDistance: 1000,
    snapshotSingleCoinDistancePerAmount: 300,
    globalCoinMaxDistance: 500,
    coinMaxDistance: 800,
    isSnapshotOnlyCoin: coin => Boolean(coin?.snapshotOnly)
  };
  results.push({
    name: 'coin-target-snapshot-worth-cluster-beats-distance',
    passed: snapshotCoinWorthLongTravelCore({ distance: 100000, amount: 1 }, 3, 3, snapshotHelperOptions) === true
  });

  results.push({
    name: 'coin-target-snapshot-worth-single-distance-scales-by-amount',
    passed: snapshotCoinWorthLongTravelCore({ distance: 1500, amount: 5 }, 1, 5, snapshotHelperOptions) === true
      && snapshotCoinWorthLongTravelCore({ distance: 1501, amount: 5 }, 1, 5, snapshotHelperOptions) === false
      && snapshotCoinWorthLongTravelCore({ distance: Infinity, amount: 99 }, 1, 99, snapshotHelperOptions) === false
  });

  results.push({
    name: 'coin-target-snapshot-navigation-reason-priority',
    passed: snapshotCoinNavigationReasonCore({ snapshotIdleFallback: true }, snapshotHelperOptions) === 'snapshot-coin-idle-timeout'
      && snapshotCoinNavigationReasonCore({ fieldMigration: true }, snapshotHelperOptions) === 'migrate-to-known-field'
      && snapshotCoinNavigationReasonCore({ snapshotOnly: true, snapshotMembers: 3 }, snapshotHelperOptions) === 'snapshot-coin-field'
      && snapshotCoinNavigationReasonCore({ snapshotOnly: true, snapshotMembers: 1 }, snapshotHelperOptions) === 'snapshot-coin-target'
  });

  results.push({
    name: 'coin-target-snapshot-navigation-visible-distance',
    passed: snapshotCoinNavigationReasonCore({ distance: 800 }, snapshotHelperOptions) === 'best-opportunity-coin'
      && snapshotCoinNavigationReasonCore({ distance: 801 }, snapshotHelperOptions) === 'best-opportunity-visible-coin'
  });

  const dropMatchedKill = buildDropMatchedKillCore({
    id: 'drop-coin-1',
    amount: 5,
    x: 10.4,
    y: 20.6,
    distance: 33.3,
    postAttackTarget: {
      id: 'enemy-1',
      name: 'Enemy One',
      drop: 5,
      playerCategory: 'active',
      active: true,
      combat: true,
      battleStartedAt: 1000,
      battleStaminaSpentStartMs: 200
    }
  }, 5, { id: 'self', coins: 12 }, 'post-attack-drop-visible', {
    nowMs: 2500,
    sessionId: 'session-1',
    sessionStaminaSpentMs: 650,
    seenKillKeys: new Set(),
    coinTargetKey: coinTargetKeyCore
  });
  results.push({
    name: 'drop-matched-kill-core-builds-confirmed-kill',
    passed: dropMatchedKill?.seenKey === 'drop-coin-match|id:enemy-1|id:drop-coin-1|5'
      && dropMatchedKill?.kill?.victim === 'Enemy One'
      && dropMatchedKill?.kill?.rewardConfirmed === true
      && dropMatchedKill?.kill?.dropMatched === true
      && dropMatchedKill?.kill?.active === true
      && dropMatchedKill?.kill?.battleDurationMs === 1500
      && dropMatchedKill?.kill?.battleStaminaSpentMs === 450
      && dropMatchedKill?.kill?.sessionId === 'session-1'
      && dropMatchedKill?.kill?.coin?.x === 10
      && dropMatchedKill?.kill?.coin?.y === 21
      && dropMatchedKill?.kill?.attributionReason === 'post-attack-drop-visible'
  });
  results.push({
    name: 'drop-matched-kill-core-rejects-mismatch-and-seen-key',
    passed: buildDropMatchedKillCore({ postAttackTarget: { id: 'enemy', drop: 6 } }, 5, null, '', {}) === null
      && buildDropMatchedKillCore({ id: 'drop-coin-1', amount: 5, x: 10, y: 20, postAttackTarget: { id: 'enemy-1', drop: 5 } }, 5, null, '', {
        seenKillKeys: new Set(['drop-coin-match|id:enemy-1|id:drop-coin-1|5']),
        coinTargetKey: coinTargetKeyCore
      }) === null
  });

  // Test coin progress/failure helpers
  const coinProgressOptions = {
    coinIgnoreMs: 100,
    coinProgressMinGain: 100,
    coinNearStuckResetGain: 5,
    closeCoinStuckDistance: 50,
    nearCoinStuckDistance: 200,
    closeCoinStuckMs: 400,
    nearCoinStuckMs: 900,
    coinNoProgressMs: 1500,
    coinFailureDecayMs: 1000,
    coinCloseFailureIgnoreMs: 200,
    coinNearFailureIgnoreMs: 300,
    coinNoProgressIgnoreMs: 400,
    coinFailureMaxIgnoreMs: 1000,
    staleCoinEscapeMs: 750
  };
  const closeFailure = coinFailureIgnoreCore({ count: 2, lastAt: 900 }, 'close', 1000, coinProgressOptions);
  results.push({
    name: 'coin-progress-failure-ignore-increments-and-caps',
    passed: closeFailure.count === 3
      && closeFailure.ignoreMs === 600
      && closeFailure.ignoreUntil === 1600
      && coinFailureIgnoreCore({ count: 9, lastAt: 950 }, 'close', 1000, coinProgressOptions).ignoreMs === 1000
  });

  results.push({
    name: 'coin-progress-failure-ignore-decays-and-picks-reason-base',
    passed: coinFailureIgnoreCore({ count: 5, lastAt: 500 }, 'near', 2000, coinProgressOptions).count === 1
      && coinFailureIgnoreCore({}, 'near', 1000, coinProgressOptions).ignoreMs === 300
      && coinFailureIgnoreCore({}, 'progress', 1000, coinProgressOptions).ignoreMs === 400
  });

  const escapeAway = staleCoinEscapeDirectionCore(
    { target: { id: 'coin', x: 10, y: 0 }, dx: 1, dy: 0 },
    { x: 0, y: 0 },
    5000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-stale-escape-moves-away-from-target',
    passed: escapeAway.dx === -1
      && escapeAway.dy === 0
      && escapeAway.state.id === 'coin'
      && escapeAway.state.until === 5750
  });

  const escapeFallback = staleCoinEscapeDirectionCore(
    { target: { id: 'same', x: 0, y: 0 }, dx: 0, dy: 0 },
    { x: 0, y: 0 },
    3000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-stale-escape-fallback-phase',
    passed: escapeFallback.dx === 0
      && escapeFallback.dy === -1
      && escapeFallback.state.until === 3750
  });

  results.push({
    name: 'coin-progress-intent-and-attempt-expiry',
    passed: coinProgressIntentCore({ kind: 'coin', target: { id: 'a' } })
      && coinProgressIntentCore({ kind: 'seek-coin', target: { id: 'b' } })
      && coinProgressIntentCore({ kind: 'patrol', reason: 'coin sweep', target: { id: 'c' } })
      && !coinProgressIntentCore({ kind: 'patrol', reason: 'walk', target: { id: 'c' } })
      && coinAttemptExpiredCore({ startedAt: 0, lastSeenAt: 100 }, 500, coinProgressOptions)
      && !coinAttemptExpiredCore({ startedAt: 0, lastSeenAt: 250 }, 500, coinProgressOptions)
  });

  const improvedAttempt = updateCoinAttemptCore(
    { id: 'coin', startedAt: 100, lastImprovedAt: 100, bestDistance: 1000, lastDistance: 1000, amount: 1, x: 0, y: 0 },
    { kind: 'coin', target: { id: 'coin', distance: 850, amount: 2, x: 5, y: 6, postAttackTarget: { id: 'enemy' } } },
    1000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-attempt-updates-improvement-and-target',
    passed: improvedAttempt.attempt.bestDistance === 850
      && improvedAttempt.attempt.lastImprovedAt === 1000
      && improvedAttempt.attempt.lastDistance === 850
      && improvedAttempt.attempt.amount === 2
      && improvedAttempt.attempt.x === 5
      && improvedAttempt.attempt.y === 6
      && improvedAttempt.attempt.postAttackTarget.id === 'enemy'
      && !improvedAttempt.closeStuck
      && !improvedAttempt.nearStuck
  });

  const closeStuckAttempt = updateCoinAttemptCore(
    { id: 'coin', startedAt: 500, lastImprovedAt: 500, bestDistance: 40, lastDistance: 40, amount: 1, x: 0, y: 0, closeStartedAt: 1000, nearStartedAt: 0 },
    { kind: 'coin', target: { id: 'coin', distance: 40, amount: 1, x: 1, y: 1 } },
    1500,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-attempt-detects-close-stale',
    passed: closeStuckAttempt.closeStuck
      && !closeStuckAttempt.nearStuck
      && closeStuckAttempt.attempt.closeStartedAt === 1000
      && closeStuckAttempt.attempt.nearStartedAt === 1500
  });

  const newProgress = updateCoinProgressRecordCore(
    null,
    { id: 'coin', amount: 3, x: 1, y: 2, postAttackTarget: { id: 'drop' } },
    500,
    1000,
    coinProgressOptions
  );
  const improvedProgress = updateCoinProgressRecordCore(
    { id: 'coin', startedAt: 0, lastImprovedAt: 0, bestDistance: 1000, lastDistance: 1000, postAttackTarget: { id: 'old' } },
    { id: 'coin', amount: 3, x: 2, y: 3 },
    850,
    1000,
    coinProgressOptions
  );
  const staleProgress = updateCoinProgressRecordCore(
    { id: 'coin', startedAt: 100, lastImprovedAt: 100, bestDistance: 1000, lastDistance: 1000, postAttackTarget: { id: 'old' } },
    { id: 'coin', amount: 4, x: 4, y: 5 },
    950,
    2000,
    coinProgressOptions
  );
  results.push({
    name: 'coin-progress-record-initial-improved-and-stale',
    passed: newProgress.progress.startedAt === 1000
      && newProgress.progress.bestDistance === 500
      && newProgress.progress.postAttackTarget.id === 'drop'
      && improvedProgress.improved
      && improvedProgress.progress.bestDistance === 850
      && improvedProgress.progress.lastImprovedAt === 1000
      && staleProgress.stale
      && staleProgress.progress.lastDistance === 950
      && staleProgress.progress.postAttackTarget.id === 'old'
  });

  const ignoredStuckProgress = buildIgnoredCoinProgressCore('coin', closeStuckAttempt.attempt, 40, 1500, 1700, 'stuck');
  const ignoredStuckAction = buildIgnoredCoinPatrolActionCore(
    { kind: 'coin', target: { id: 'coin' } },
    'coin',
    40,
    closeStuckAttempt.attempt,
    { ignoreMs: 200, count: 2 },
    { dx: -1, dy: 0 },
    1500,
    'ignore-close-stale-coin',
    true
  );
  results.push({
    name: 'coin-progress-ignored-stuck-record-and-action',
    passed: ignoredStuckProgress.ignoredAt === 1500
      && ignoredStuckProgress.ignoreUntil === 1700
      && ignoredStuckProgress.bestDistance === 40
      && ignoredStuckAction.kind === 'patrol'
      && ignoredStuckAction.dx === -1
      && ignoredStuckAction.ignoredCoin.closeAgeMs === 500
      && ignoredStuckAction.ignoredCoin.nearAgeMs === 0
      && ignoredStuckAction.ignoredCoin.ageMs === 1000
      && ignoredStuckAction.ignoredCoin.failureCount === 2
  });

  const ignoredProgressRecord = buildIgnoredCoinProgressCore('coin', staleProgress.progress, 950, 2000, 2400, 'progress');
  const ignoredProgressAction = buildIgnoredCoinPatrolActionCore(
    { kind: 'coin', target: { id: 'coin' } },
    'coin',
    950,
    staleProgress.progress,
    { ignoreMs: 400, count: 3 },
    { dx: 0, dy: 1 },
    2000,
    'ignore-stale-coin-no-progress'
  );
  results.push({
    name: 'coin-progress-ignored-no-progress-record-and-action',
    passed: ignoredProgressRecord.ignoredAt === 2000
      && ignoredProgressRecord.ignoreUntil === 2400
      && ignoredProgressRecord.lastDistance === 950
      && ignoredProgressAction.reason === 'ignore-stale-coin-no-progress'
      && ignoredProgressAction.dy === 1
      && ignoredProgressAction.ignoredCoin.bestDistance === 1000
      && ignoredProgressAction.ignoredCoin.ignoreMs === 400
      && ignoredProgressAction.ignoredCoin.failureCount === 3
      && !Object.prototype.hasOwnProperty.call(ignoredProgressAction.ignoredCoin, 'ageMs')
  });

  results.push({
    name: 'coin-progress-ignore-cleanup-intent',
    passed: coinIgnoreCleanupIntentCore({ kind: 'coin', id: 12 }, { id: '12' }, '12').clearLastTarget
      && coinIgnoreCleanupIntentCore({ kind: 'enemy', id: '12' }, { id: '12' }, '12').clearLastTarget === false
      && coinIgnoreCleanupIntentCore({ kind: 'coin', id: '12' }, { id: '12' }, '12').clearCoinApproachLock
      && coinIgnoreCleanupIntentCore({ kind: 'coin', id: '12' }, { id: 12 }, '12').clearCoinApproachLock === false
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
    beamWidth: 4,
    nearbyFirstCoinDistance: 22000,
    firstCoinDistanceRatio: 1.45,
    firstCoinDistanceSlack: 6000,
    firstRoutePointDistanceRatio: 1.15,
    firstRoutePointDistanceSlack: 2500,
    firstRoutePointCosMin: 0.9,
    firstRoutePointLaneRadius: 3000,
    firstRouteDistanceRatio: 1.25,
    firstRouteDistanceSlack: 3000,
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

  const routeActionMeta = coinRouteActionMetaCore({
    ids: ['a', 'b'],
    points: [{ id: 'a' }],
    value: 2.5,
    staminaCost: 123.6,
    legCount: 2.2,
    totalDistance: 456.7,
    kind: 'short'
  }, 321.4);
  const routeActionMetaFallback = coinRouteActionMetaCore({ ids: ['x'] }, 321.4);
  results.push({
    name: 'coin-route-action-meta-rounds-and-falls-back',
    passed: routeActionMeta?.ids?.join(',') === 'a,b'
      && routeActionMeta.points?.length === 1
      && routeActionMeta.value === 2.5
      && routeActionMeta.staminaCost === 124
      && routeActionMeta.legCount === 2.2
      && routeActionMeta.totalDistance === 457
      && routeActionMeta.firstDistance === 321
      && routeActionMeta.kind === 'short'
      && routeActionMetaFallback.firstDistance === 321
      && routeActionMetaFallback.points === null
      && coinRouteActionMetaCore(null, 999) === null
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

  const beamRoute = buildCoinRouteFromAnchorCore(routeSelf, { drop_id: 'a', amount: 1, x: 10000, y: 0, distance: 10000 }, [
    { drop_id: 'a', amount: 1, x: 10000, y: 0, distance: 10000 },
    { drop_id: 'bad', amount: 1, x: 12000, y: 0, distance: 12000 },
    { drop_id: 'b', amount: 1, x: 10000, y: 2200, distance: 10239 },
    { drop_id: 'c', amount: 1, x: 10000, y: 4400, distance: 10926 }
  ], [], { ...routeOptions, beamWidth: 2, staminaAffordable: cost => cost <= 20000 });
  results.push({
    name: 'coin-route-beam-keeps-non-greedy-branch',
    passed: beamRoute?.coinRoute?.ids?.join(',') === 'a,b,c'
  });

  const farPointRoute = {
    drop_id: 'far',
    amount: 1,
    x: 18000,
    y: 0,
    distance: 18000,
    coinRoute: {
      firstDistance: 18000,
      points: [
        { id: 'far', x: 18000, y: 0, amount: 1 },
        { id: 'near', x: 12000, y: 200, amount: 1 },
        { id: 'next', x: 19000, y: 0, amount: 1 }
      ]
    }
  };
  results.push({
    name: 'coin-route-rejects-route-that-passes-closer-route-point',
    passed: coinRouteSkipsCloserRoutePointCore(routeSelf, farPointRoute, routeOptions) === true
  });

  const nearComparableRoute = {
    drop_id: 'near-route',
    x: 14000,
    y: 0,
    distance: 14000,
    opportunityScore: 18750,
    coinRoute: { firstDistance: 14000 }
  };
  const farComparableRoute = {
    drop_id: 'far-route',
    x: 19000,
    y: 0,
    distance: 19000,
    opportunityScore: 19050,
    coinRoute: { firstDistance: 19000 }
  };
  results.push({
    name: 'coin-route-prefers-closer-comparable-first-target',
    passed: closerCoinRouteForFirstTargetCore(farComparableRoute, [nearComparableRoute, farComparableRoute], {
      ...routeOptions,
      switchMargin: 0,
      switchRelativeMargin: 0.1
    })?.drop_id === 'near-route'
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

  const rememberedChoice = rememberOpportunityChoiceCore(
    {
      type: 'coin',
      id: 'coin-a',
      amount: 2,
      x: 100,
      y: 200,
      distance: 345.6,
      staminaCost: 789.2,
      score: 123.7,
      actionKind: 'coin',
      priorityTier: 1,
      held: true,
      competingScore: 140.2
    },
    { kind: 'coin', reason: 'best-opportunity-coin' },
    { key: 'coin:coin-a', type: 'coin', id: 'coin-a', at: 900, until: 1200 },
    { nowMs: 1000, switchHoldMs: 500, sameCoinRadius: 50 }
  );
  results.push({
    name: 'opportunity-choice-remember-builds-choice-and-action-metadata',
    passed: rememberedChoice.choice?.key === 'coin:coin-a'
      && rememberedChoice.choice?.at === 900
      && rememberedChoice.choice?.until === 1500
      && rememberedChoice.choice?.score === 124
      && rememberedChoice.choice?.staminaCost === 789
      && rememberedChoice.action?.opportunityChoice?.held === true
      && rememberedChoice.action?.opportunityChoice?.competingScore === 140
      && rememberedChoice.action?.opportunityChoice?.holdRemainingMs === 500
  });

  const rememberedRouteMissing = rememberOpportunityChoiceCore(
    {
      type: 'coin',
      id: 'route-a',
      amount: 5,
      x: 100,
      y: 200,
      distance: 1000,
      staminaCost: 500,
      score: 200,
      actionKind: 'seek-coin',
      priorityTier: 1,
      maxDistance: 50000,
      missingHold: true,
      holdUntil: 1800,
      routeHeld: true,
      competingRouteScore: 199.6,
      coinRoute: { ids: ['route-a', 'route-b'], value: 7.4, legCount: 2.2 }
    },
    { kind: 'seek-coin', reason: 'best-opportunity-coin-route' },
    { key: 'coin:route-a', type: 'coin', id: 'route-a', at: 700, lastSeenAt: 800, until: 2200, missingSince: 900 },
    { nowMs: 1000, switchHoldMs: 500, sameCoinRadius: 50 }
  );
  results.push({
    name: 'opportunity-choice-remember-preserves-missing-route-metadata',
    passed: rememberedRouteMissing.choice?.until === 1800
      && rememberedRouteMissing.choice?.lastSeenAt === 800
      && rememberedRouteMissing.choice?.missingSince === 900
      && rememberedRouteMissing.choice?.coinRouteIds?.join(',') === 'route-a,route-b'
      && rememberedRouteMissing.choice?.coinRouteValue === 7
      && rememberedRouteMissing.choice?.coinRouteLegs === 2
      && rememberedRouteMissing.action?.opportunityChoice?.routeHeld === true
      && rememberedRouteMissing.action?.opportunityChoice?.competingRouteScore === 200
  });

  const missingHeldOptions = {
    nowMs: 1500,
    self: { x: 0, y: 0 },
    dist: (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)),
    sameCoinRadius: 50,
    missingHoldMs: 2000,
    switchHoldMs: 500,
    nativeCoinAuthoritativeRadius: 50000,
    snapshotCoinMaxDistance: 0,
    globalCoinMaxDistance: 50000,
    coinMaxDistance: 200,
    visibleSourcesConfirmMissing: false,
    ignoredCoin: () => false,
    coinBlockedByThreat: () => false,
    coinStaminaCost: coin => Number(coin.distance || 0) + 10,
    coinStaminaAffordable: (self, coin, cost) => Number(cost || 0) <= 10000,
    scoreCoinOpportunity: coin => Number(coin.amount || 0) * 1000 / Math.max(1, Number(coin.distance || 0)),
    priorityTier: item => Number(item.distance || Infinity) <= 500 ? 1 : 0
  };
  const missingHeldBuilt = buildMissingHeldOpportunityCore(
    { key: 'coin:held', type: 'coin', id: 'held', amount: 3, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000 },
    [{ type: 'coin', id: 'other', amount: 1, x: 400, y: 0, score: 20, priorityTier: 1 }],
    missingHeldOptions
  );
  results.push({
    name: 'opportunity-choice-missing-held-builds-candidate',
    passed: missingHeldBuilt.opportunity?.id === 'held'
      && missingHeldBuilt.opportunity?.actionKind === 'coin'
      && missingHeldBuilt.opportunity?.missingHold === true
      && missingHeldBuilt.opportunity?.holdUntil === 3000
      && missingHeldBuilt.opportunity?.staminaCost === 110
      && missingHeldBuilt.opportunity?.score === 30
      && missingHeldBuilt.opportunity?.priorityTier === 1
  });

  const missingHeldClear = buildMissingHeldOpportunityCore(
    { key: 'coin:gone', type: 'coin', id: 'gone', amount: 1, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000, reason: 'best-opportunity-coin' },
    [],
    { ...missingHeldOptions, visibleSourcesConfirmMissing: true }
  );
  results.push({
    name: 'opportunity-choice-missing-held-requests-visible-clear',
    passed: missingHeldClear.clearMissing === true
      && missingHeldClear.clearReason === 'visible-coin-disappeared'
      && missingHeldClear.coin?.drop_id === 'gone'
  });

  const missingHeldSnapshot = buildMissingHeldOpportunityCore(
    { key: 'coin:snapshot', type: 'coin', id: 'snapshot', amount: 1, x: 100, y: 0, at: 1000, lastSeenAt: 1000, until: 3000, reason: 'snapshot-coin-target' },
    [],
    { ...missingHeldOptions, visibleSourcesConfirmMissing: true }
  );
  results.push({
    name: 'opportunity-choice-missing-held-keeps-snapshot-choice',
    passed: missingHeldSnapshot.clearMissing === false
      && missingHeldSnapshot.opportunity?.id === 'snapshot'
      && missingHeldSnapshot.opportunity?.actionKind === 'coin'
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
      && routeDisplayCandidate[0]?.reason === 'best-opportunity-coin'
      && routeDisplayCandidate[0]?.coinRoute === null
      && routeDisplayCandidate[0]?.sourceCoin?.routeDisplayOnly === true
      && routeDisplayCandidate[0]?.sourceCoin?.coinRoute === undefined
      && routeDisplayCandidate[0]?.coinRoutePreview?.ids?.join(',') === 'display,near'
      && routeDisplayCandidate[0]?.sourceCoin?.coinRoutePreview?.ids?.join(',') === 'display,near'
      && routeDisplayCandidate[0]?.routeValue === null
      && routeDisplayCandidate[0]?.staminaCost === 700
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

  const baitCoin = { drop_id: 'bait', key: 'id:bait', amount: 1, x: 900, y: 0, distance: 900, native: true, authority: 'realtime' };
  const baitOpportunity = { type: 'coin', id: 'bait', amount: 1, sourceCoin: baitCoin, profitThresholdEligible: true };
  const baitEntered = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: baitOpportunity,
    opportunities: [baitOpportunity],
    realtimeCoins: [baitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  results.push({
    name: 'single-coin-bait-enters-hold-only-for-lone-realtime-one-coin',
    passed: baitEntered.phase === 'hold'
      && baitEntered.entered === true
      && baitEntered.state?.id === 'bait'
      && baitEntered.state?.amount === 1
      && baitEntered.state?.distance === 900
  });

  const snapshotBaitCoin = {
    ...baitCoin,
    drop_id: 'snapshot-bait',
    key: 'id:snapshot-bait',
    authority: 'snapshot',
    native: false,
    snapshotOnly: true
  };
  const snapshotBaitOpportunity = {
    ...baitOpportunity,
    id: 'snapshot-bait',
    sourceCoin: snapshotBaitCoin
  };
  const snapshotBaitEntered = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: snapshotBaitOpportunity,
    opportunities: [snapshotBaitOpportunity],
    entryCoins: [snapshotBaitCoin],
    visibleCoins: [snapshotBaitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  results.push({
    name: 'single-coin-bait-allows-selected-snapshot-fallback-coin',
    passed: snapshotBaitEntered.phase === 'hold'
      && snapshotBaitEntered.entered === true
      && snapshotBaitEntered.state?.id === 'snapshot-bait'
      && snapshotBaitEntered.state?.authority === 'snapshot'
  });

  const baitFar = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: { ...baitOpportunity, sourceCoin: { ...baitCoin, x: 1001, distance: 1001 } },
    opportunities: [{ ...baitOpportunity, sourceCoin: { ...baitCoin, x: 1001, distance: 1001 } }],
    realtimeCoins: [{ ...baitCoin, x: 1001, distance: 1001 }]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  const baitRoute = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: {
      ...baitOpportunity,
      sourceCoin: {
        ...baitCoin,
        coinRoute: { ids: ['bait', 'next'], value: 2, legCount: 2 }
      }
    },
    opportunities: [baitOpportunity],
    realtimeCoins: [baitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  const baitDisplayRouteOpportunity = {
    ...baitOpportunity,
    sourceCoin: {
      ...baitCoin,
      routeDisplayOnly: true,
      coinRoute: { ids: ['bait', 'filtered-next'], value: 2, legCount: 2 }
    }
  };
  const baitDisplayRoute = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: baitDisplayRouteOpportunity,
    opportunities: [baitDisplayRouteOpportunity],
    realtimeCoins: [baitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  results.push({
    name: 'single-coin-bait-rejects-far-coins-and-multi-coin-routes',
    passed: baitFar.state === null && baitRoute.state === null
  });
  results.push({
    name: 'single-coin-bait-ignores-display-only-route-decoration',
    passed: baitDisplayRoute.phase === 'hold'
      && baitDisplayRoute.entered === true
      && baitDisplayRoute.state?.id === 'bait'
  });
  const eligibleResidualRouteBait = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: {
      ...baitDisplayRouteOpportunity,
      residualRouteContinuation: { profitThresholdEligible: true }
    },
    opportunities: [baitDisplayRouteOpportunity],
    realtimeCoins: [baitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  const ineligibleResidualRouteBait = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 1000,
    previous: null,
    selectedOpportunity: {
      ...baitDisplayRouteOpportunity,
      residualRouteContinuation: { profitThresholdEligible: false }
    },
    opportunities: [baitDisplayRouteOpportunity],
    realtimeCoins: [baitCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  results.push({
    name: 'single-coin-bait-yields-to-eligible-residual-route-only',
    passed: eligibleResidualRouteBait.state === null
      && ineligibleResidualRouteBait.phase === 'hold'
      && ineligibleResidualRouteBait.state?.id === 'bait'
  });

  const outsideIdleStarted = updateOutsideCenterIdleCore(null, {
    nowMs: 1000,
    self: { x: 100001, y: 0 },
    action: { kind: 'wait', reason: 'outside-center-profit-wait' }
  }, { centerRadiusCm: 100000, timeoutMs: 180000 });
  const outsideIdleBeforeTimeout = updateOutsideCenterIdleCore(outsideIdleStarted.state, {
    nowMs: 180999,
    self: { x: 100001, y: 0 },
    action: { kind: 'wait', reason: 'single-coin-bait-hold' }
  }, { centerRadiusCm: 100000, timeoutMs: 180000 });
  const outsideIdleTimedOut = updateOutsideCenterIdleCore(outsideIdleBeforeTimeout.state, {
    nowMs: 181000,
    self: { x: 100001, y: 0 },
    action: { kind: 'wait', reason: 'dynamic-profit-threshold-wait' }
  }, { centerRadiusCm: 100000, timeoutMs: 180000 });
  const outsideIdleProfitReset = updateOutsideCenterIdleCore(outsideIdleTimedOut.state, {
    nowMs: 181100,
    self: { x: 100001, y: 0 },
    action: { kind: 'coin', band: 'profit', reason: 'high-value-visible-coin-priority' }
  }, { centerRadiusCm: 100000, timeoutMs: 180000 });
  const outsideIdleCenterReset = updateOutsideCenterIdleCore(outsideIdleTimedOut.state, {
    nowMs: 181100,
    self: { x: 99999, y: 0 },
    action: { kind: 'wait', reason: 'no-profitable-candidate' }
  }, { centerRadiusCm: 100000, timeoutMs: 180000 });
  results.push({
    name: 'outside-center-idle-waits-three-minutes-and-resets-on-profit-or-center-return',
    passed: outsideIdleStarted.state?.startedAt === 1000
      && outsideIdleBeforeTimeout.summary.ageMs === 179999
      && outsideIdleBeforeTimeout.shouldExit === false
      && outsideIdleTimedOut.summary.ageMs === 180000
      && outsideIdleTimedOut.shouldExit === true
      && outsideIdleProfitReset.state === null
      && outsideIdleProfitReset.resetReason === 'protected-or-active-action'
      && outsideIdleCenterReset.state === null
      && outsideIdleCenterReset.resetReason === 'inside-center'
  });

  const nextCoinOpportunity = {
    type: 'coin',
    id: 'next',
    amount: 3,
    sourceCoin: { drop_id: 'next', key: 'id:next', amount: 3, x: 950, y: 0, distance: 950, native: true },
    profitThresholdEligible: true,
    reason: 'visible-coin'
  };
  const baitReleased = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 2000,
    previous: baitEntered.state,
    selectedOpportunity: baitOpportunity,
    opportunities: [baitOpportunity, nextCoinOpportunity],
    realtimeCoins: [baitCoin, nextCoinOpportunity.sourceCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  const baitAfkOpportunity = {
    type: 'enemy',
    id: 'afk-profit',
    sourceTarget: { user_id: 'afk-profit', drop: 10, distance: 5000, active: false },
    profitThresholdEligible: true
  };
  results.push({
    name: 'single-coin-bait-commits-release-when-other-profit-appears',
    passed: baitReleased.phase === 'release'
      && baitReleased.transitioned === true
      && baitReleased.state?.trigger?.id === 'next'
      && singleCoinBaitOtherOpportunityCore([baitOpportunity, nextCoinOpportunity], baitCoin, { sameCoinRadiusCm: 1200 })?.id === 'next'
      && singleCoinBaitOtherOpportunityCore([baitOpportunity, baitAfkOpportunity], baitCoin, { sameCoinRadiusCm: 1200 })?.id === 'afk-profit'
  });

  const baitReturn = singleCoinBaitPolicyCore({
    self: { x: -700, y: 0 },
    nowMs: 3000,
    previous: baitEntered.state,
    selectedOpportunity: baitOpportunity,
    opportunities: [baitOpportunity],
    realtimeCoins: [{ ...baitCoin, distance: 1600 }]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  const baitMissing = singleCoinBaitPolicyCore({
    self: { x: 0, y: 0 },
    nowMs: 3000,
    previous: baitReleased.state,
    selectedOpportunity: nextCoinOpportunity,
    opportunities: [nextCoinOpportunity],
    realtimeCoins: [nextCoinOpportunity.sourceCoin]
  }, { enabled: true, holdRadiusCm: 1000, sameCoinRadiusCm: 1200 });
  results.push({
    name: 'single-coin-bait-returns-after-combat-displacement-and-clears-when-taken',
    passed: baitReturn.phase === 'return'
      && baitReturn.state?.distance === 1600
      && baitMissing.state === null
      && baitMissing.clearReason === 'bait-missing'
  });

  let flattenedEnemyCount = 0;
  const pickCoreBaseOptions = {
    enemyOpportunityCandidates: (origin, targets) => {
      flattenedEnemyCount = targets.length;
      return targets;
    },
    uniqueVisibleRouteCoins: groups => (groups || []).flatMap(group => group.coins || []),
    pickCoinRouteOpportunity: () => null,
    opportunityCandidateCoreOptions: () => candidateOptions,
    buildCoinAction: (origin, coin, reason, kind) => ({
      kind,
      reason,
      target: { id: coin.drop_id, amount: coin.amount }
    }),
    buildEnemyAction: (origin, target, reason) => ({
      kind: 'attack',
      reason,
      target: { id: target.user_id }
    }),
    buildMissingHeldOpportunity: () => null,
    chooseStableOpportunity: opportunities => opportunities.slice().sort((a, b) => b.score - a.score)[0] || null,
    rememberOpportunityChoice: (item, action) => ({
      ...action,
      pickedType: item.type,
      pickedId: item.id
    })
  };
  const pickedOpportunity = pickBestOpportunityCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'pick-coin', amount: 5, distance: 500, score: 15 }]
  }], [[{ user_id: 'pick-enemy', distance: 900, score: 8, staminaCost: 100, afk: true }]], {
    ...pickCoreBaseOptions,
    disableMissingHold: true
  });
  results.push({
    name: 'opportunity-pick-core-builds-and-remembers-best-action',
    passed: flattenedEnemyCount === 1
      && pickedOpportunity?.kind === 'coin'
      && pickedOpportunity?.pickedType === 'coin'
      && pickedOpportunity?.pickedId === 'pick-coin'
  });

  const pickedMissingHeldOpportunity = pickBestOpportunityCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'pick-coin', amount: 5, distance: 500, score: 15 }]
  }], [[]], {
    ...pickCoreBaseOptions,
    buildMissingHeldOpportunity: () => ({
      type: 'coin',
      id: 'missing-pick',
      amount: 9,
      distance: 400,
      score: 99,
      priorityTier: 1,
      action: () => ({ kind: 'coin', reason: 'missing-held', target: { id: 'missing-pick' } })
    })
  });
  results.push({
    name: 'opportunity-pick-core-includes-missing-held-opportunity',
    passed: pickedMissingHeldOpportunity?.pickedId === 'missing-pick'
      && pickedMissingHeldOpportunity?.reason === 'missing-held'
  });

  const patrolScan = patrolDirectionCore({ x: 0, y: 0 }, [], [], { x: 200, y: 0 }, {
    patrolPrecisionTolerance: 10,
    patrolCoinMaxDistance: 500
  });
  results.push({
    name: 'patrol-direction-core-scans-toward-distant-coin',
    passed: patrolScan.direction?.dx === 1
      && patrolScan.direction?.dy === 0
      && patrolScan.direction?.reason === 'scan-toward-distant-coin'
      && patrolScan.clearPatrolHeading === false
  });

  const patrolSpacing = patrolDirectionCore({ x: 0, y: 0 }, [{ x: 1000, y: 0 }], [{ x: 0, y: 1000 }], null, {
    dangerRadius: 3000,
    activeAvoidMaxDistance: 3000,
    activeCautionRadius: 2000
  });
  results.push({
    name: 'patrol-direction-core-maintains-safe-spacing',
    passed: patrolSpacing.direction?.dx === -1
      && patrolSpacing.direction?.dy === -1
      && patrolSpacing.direction?.reason === 'maintain-safe-spacing'
      && patrolSpacing.clearPatrolHeading === true
  });

  const patrolWait = patrolDirectionCore({ x: 0, y: 0 }, [{ x: 9000, y: 0 }], [{ x: 60000, y: 0 }], null, {
    dangerRadius: 3000,
    activeAvoidMaxDistance: 3000,
    activeCautionRadius: 2000
  });
  results.push({
    name: 'patrol-direction-core-waits-without-visible-profit',
    passed: patrolWait.direction?.dx === 0
      && patrolWait.direction?.dy === 0
      && patrolWait.direction?.reason === 'wait-for-visible-coin-refresh'
      && patrolWait.clearPatrolHeading === true
  });

  const postAttackDist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  results.push({
    name: 'post-attack-drop-visible-coin-exists-core',
    passed: postAttackVisibleCoinExistsCore(
      [{ x: 1010, y: 0, amount: 1 }, { x: 9000, y: 0, amount: 20 }],
      { x: 1000, y: 0 },
      { dist: postAttackDist, dropCoinRadius: 50 }
    ) === true
      && postAttackVisibleCoinExistsCore(
        [{ x: 1010, y: 0, amount: 0 }],
        { x: 1000, y: 0 },
        { dist: postAttackDist, dropCoinRadius: 50 }
      ) === false
  });

  const postAttackCoinOptions = {
    nowMs: 10000,
    dist: postAttackDist,
    priorityMs: 5000,
    includeSingle: false,
    minAmount: 1,
    minScore: 10,
    dropCoinRadius: 3500,
    resolveAttack: item => Number(item.resolvedAt || 0),
    scoreCoin: coin => Number(coin.score || 0)
  };
  const postAttackCoinPicked = pickPostAttackDropCoinCore([
    { id: 'old', x: 2000, y: 0, at: 4000, resolvedAt: 9700, drop: 50, afk: true, action: 'attack' },
    { id: 'target-low', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 12, afk: true, action: 'attack' },
    {
      id: 'target-high',
      name: 'HighDrop',
      x: 2100,
      y: 0,
      at: 9100,
      resolvedAt: 9800,
      drop: 20,
      afk: true,
      action: 'opportunistic-shot',
      combat: true,
      battleStaminaSpentStartMs: 123.4,
      staminaSpentMs: 567.8
    }
  ], [
    { drop_id: 'coin-a', x: 2050, y: 0, amount: 3, distance: 2050, score: 30 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-picks-matched-visible-drop',
    passed: postAttackCoinPicked.selected?.drop_id === 'coin-a'
      && postAttackCoinPicked.selected?.postAttackTarget?.id === 'target-high'
      && postAttackCoinPicked.selected?.postAttackTarget?.name === 'HighDrop'
      && postAttackCoinPicked.selected?.postAttackTarget?.action === 'opportunistic-shot'
      && postAttackCoinPicked.selected?.postAttackTarget?.coinDistanceToTarget === 50
      && postAttackCoinPicked.selected?.postAttackTarget?.battleStaminaSpentStartMs === 123
      && postAttackCoinPicked.selected?.postAttackTarget?.staminaSpentMs === 568
      && postAttackCoinPicked.candidates.length === 1
  });

  const postAttackCoinFiltered = pickPostAttackDropCoinCore([
    { id: 'target', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [
    { drop_id: 'single', x: 2000, y: 0, amount: 1, distance: 2000, score: 100 },
    { drop_id: 'low-score', x: 2100, y: 0, amount: 2, distance: 2100, score: 5 },
    { drop_id: 'far', x: 9000, y: 0, amount: 4, distance: 9000, score: 100 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-filters-amount-score-radius',
    passed: postAttackCoinFiltered.selected === null
      && postAttackCoinFiltered.candidates.length === 0
  });

  const postAttackCoinBest = pickPostAttackDropCoinCore([
    { id: 'target', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [
    { drop_id: 'score-win', x: 2100, y: 0, amount: 2, distance: 2100, score: 50 },
    { drop_id: 'lower-score', x: 2050, y: 0, amount: 2, distance: 2050, score: 20 },
    { drop_id: 'amount-win', x: 2500, y: 0, amount: 3, distance: 2500, score: 10 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-selects-amount-before-score',
    passed: postAttackCoinBest.selected?.drop_id === 'amount-win'
      && postAttackCoinBest.candidates.length === 3
  });

  const postAttackWaitOptions = {
    nowMs: 10000,
    self: { x: 0, y: 0 },
    dist: postAttackDist,
    waitMs: 1000,
    resolveMaxMs: 5000,
    minDrop: 8,
    maxDistance: 50000,
    stopDistance: 900,
    dropCoinRadius: 3500,
    resolveAttack: item => Number(item.resolvedAt || 0),
    coinBlockedByThreat: () => false
  };
  const postAttackPicked = pickPostAttackDropWaitTargetCore([
    { id: 'low', x: 1200, y: 0, at: 9000, resolvedAt: 9700, drop: 7, afk: true, action: 'attack' },
    { id: 'near', x: 850, y: 0, at: 9000, resolvedAt: 9700, drop: 30, afk: true, action: 'attack' },
    { id: 'best', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'opportunistic-shot' },
    { id: 'older', x: 1200, y: 0, at: 9000, resolvedAt: 9700, drop: 12, afk: true, action: 'attack' }
  ], [], [], postAttackWaitOptions);
  results.push({
    name: 'post-attack-drop-wait-picks-resolved-target',
    passed: postAttackPicked?.id === 'best'
      && postAttackPicked?.postAttackDropResolvedAt === 9700
      && Math.round(postAttackPicked?.distance || 0) === 2200
  });

  const postAttackChaseActivePicked = pickPostAttackDropWaitTargetCore([
    { id: 'active-chase', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: false, active: true, chase: true, action: 'attack' },
    { id: 'active-normal', x: 1800, y: 0, at: 9000, resolvedAt: 9700, drop: 25, afk: false, active: true, action: 'attack' }
  ], [], [], postAttackWaitOptions);
  results.push({
    name: 'post-attack-drop-wait-allows-active-chase-targets',
    passed: postAttackChaseActivePicked?.id === 'active-chase'
  });

  const postAttackCombatPicked = pickPostAttackDropWaitTargetCore([
    { id: 'combat-target', x: 1900, y: 0, at: 9000, resolvedAt: 9700, drop: 32, afk: false, combat: true, action: 'opportunistic-shot' }
  ], [], [], postAttackWaitOptions);
  results.push({
    name: 'post-attack-drop-wait-allows-combat-live-targets',
    passed: postAttackCombatPicked?.id === 'combat-target'
  });

  const postKillTail = updatePostKillSettlementCore(null, {
    nowMs: 1600,
    previousCombatTarget: { id: 9667, name: 'target', drop: 32 },
    currentCombatTarget: null,
    combatMetrics: { targetId: '9667', targetName: 'target', acceptedShots: 35, actualLastShotAt: 1200 },
    visibleTargets: [],
    selfKillEvidence: [],
    playerDropCoins: [],
    snapshotTick: 1101435
  });
  const postKillDrop = updatePostKillSettlementCore(postKillTail.state, {
    nowMs: 2000,
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 9667, tick: 1101443 }],
    playerDropCoins: [{ drop_id: 7336, source_user_id: 9667, amount: 32 }],
    snapshotTick: 1101455
  });
  const postKillPicked = updatePostKillSettlementCore(postKillDrop.state, {
    nowMs: 2400,
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 9667, tick: 1101443 }],
    playerDropCoins: [],
    snapshotTick: 1101470
  });
  results.push({
    name: 'post-kill-settlement-tail-confirm-drop-and-clear',
    passed: postKillTail.state?.phase === 'unconfirmed-tail'
      && postKillDrop.state?.phase === 'drop-visible'
      && postKillDrop.state?.matchedCoinAmount === 32
      && postKillPicked.state === null
      && postKillPicked.reason === 'matched-player-drop-disappeared'
  });

  const postKillZeroDrop = updatePostKillSettlementCore(null, {
    nowMs: 2600,
    previousCombatTarget: { id: 30672, name: '颓废咸鱼1号', drop: 0, dropKnown: true },
    currentCombatTarget: null,
    combatMetrics: { targetId: '30672', targetName: '颓废咸鱼1号', acceptedShots: 1, actualLastShotAt: 2500 },
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 30672 }],
    playerDropCoins: [],
    snapshotTick: 1200
  });
  results.push({
    name: 'post-kill-settlement-skips-known-zero-drop-target',
    passed: postKillZeroDrop.state === null
      && postKillZeroDrop.cleared === true
      && postKillZeroDrop.reason === 'non-positive-target-drop'
  });

  const postKillCrossTarget = updatePostKillSettlementCore(null, {
    nowMs: 1784220520546,
    previousCombatTarget: { userId: 36176, name: 'Victor8886', drop: 91, firstSeenTick: 55700 },
    currentCombatTarget: null,
    combatMetrics: {
      targetId: '2889',
      targetName: 'Wbh',
      startedAt: 1784220520140,
      startedTick: 57179,
      acceptedShots: 1,
      actualLastShotAt: 1784220520393,
      actualLastShotTick: 57179
    },
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 36176, tick: 30783 }],
    playerDropCoins: [],
    snapshotTick: 57178
  });
  results.push({
    name: 'post-kill-settlement-binds-recent-shot-metrics-to-target-id',
    passed: postKillCrossTarget.state?.targetId === '2889'
      && postKillCrossTarget.state?.targetName === 'Wbh'
      && postKillCrossTarget.state?.phase === 'unconfirmed-tail'
      && postKillCrossTarget.state?.confirmedAt === 0
  });

  const postKillStaleEvidence = updatePostKillSettlementCore(null, {
    nowMs: 1784220520546,
    previousCombatTarget: { userId: 2889, name: 'Wbh', drop: 133, firstSeenTick: 57179 },
    currentCombatTarget: null,
    combatMetrics: {
      targetId: '2889',
      targetName: 'Wbh',
      startedAt: 1784220520140,
      startedTick: 57179,
      acceptedShots: 1,
      actualLastShotAt: 1784220520393,
      actualLastShotTick: 57179
    },
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 2889, tick: 30783 }],
    playerDropCoins: [{ drop_id: 90, source_user_id: 2889, amount: 11, created_tick: 30790 }],
    snapshotTick: 57187
  });
  const postKillFreshEvidence = updatePostKillSettlementCore(postKillStaleEvidence.state, {
    nowMs: 1784220520746,
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 2889, tick: 57190 }],
    playerDropCoins: [{ drop_id: 90, source_user_id: 2889, amount: 11, created_tick: 30790 }],
    snapshotTick: 57191
  });
  const postKillFreshDrop = updatePostKillSettlementCore(postKillFreshEvidence.state, {
    nowMs: 1784220520946,
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 2889, tick: 57190 }],
    playerDropCoins: [
      { drop_id: 90, source_user_id: 2889, amount: 11, created_tick: 30790 },
      { drop_id: 91, source_user_id: 2889, amount: 32, created_tick: 57192 }
    ],
    snapshotTick: 57193
  });
  results.push({
    name: 'post-kill-settlement-rejects-stale-kill-and-drop-generations',
    passed: postKillStaleEvidence.state?.phase === 'unconfirmed-tail'
      && postKillStaleEvidence.state?.matchedCoinKey === ''
      && postKillFreshEvidence.state?.phase === 'drop-pending'
      && postKillFreshEvidence.state?.matchedCoinKey === ''
      && postKillFreshDrop.state?.phase === 'drop-visible'
      && postKillFreshDrop.state?.matchedCoinKey === '91'
      && postKillFreshDrop.state?.matchedCoinCreatedTick === 57192
  });

  const postAttackCovered = pickPostAttackDropWaitTargetCore([
    { id: 'covered', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [{ x: 2200, y: 100, amount: 1 }], [], postAttackWaitOptions);
  const postAttackThreatBlocked = pickPostAttackDropWaitTargetCore([
    { id: 'blocked', x: 2200, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack' }
  ], [], [{ x: 2000, y: 0 }], {
    ...postAttackWaitOptions,
    coinBlockedByThreat: () => true
  });
  results.push({
    name: 'post-attack-drop-wait-skips-covered-or-threat-blocked',
    passed: postAttackCovered === null && postAttackThreatBlocked === null
  });

  results.push({
    name: 'stamina-budget-daily-limit-core',
    passed: dailyStaminaBudgetIsLimitingCore(800, 1000, 700) === true
      && dailyStaminaBudgetIsLimitingCore(1200, 1000, 700) === false
      && dailyStaminaBudgetIsLimitingCore(800, Infinity, 700) === true
      && dailyStaminaBudgetIsLimitingCore(800, 1000, Infinity) === false
  });

  const blockedStaminaSummary = summarizeBlockedStaminaOpportunityCore([
    { drop_id: 'expensive-coin', amount: 2, distance: 300, staminaCost: 1500, snapshot: true },
    { drop_id: 'cheap-coin', amount: 1, distance: 100, staminaCost: 900 }
  ], [
    { user_id: 'enemy', name: 'Enemy', drop: 4, distance: 200, staminaCost: 1200 }
  ], {
    budget: 1000,
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    enemyStaminaCost: target => Number(target.staminaCost || 0)
  });
  results.push({
    name: 'stamina-budget-blocked-summary-picks-smallest-shortage',
    passed: blockedStaminaSummary?.type === 'enemy'
      && blockedStaminaSummary?.id === 'enemy'
      && blockedStaminaSummary?.requiredMs === 1200
      && blockedStaminaSummary?.shortageMs === 200
      && blockedStaminaSummary?.distance === 200
  });

  const nearestCoinExit = summarizeNearestCoinStaminaBudgetExitCore({ x: 0, y: 0 }, [
    { drop_id: 'far', x: 500, y: 0, amount: 5, staminaCost: 2000, native: true },
    { drop_id: 'near', x: 100, y: 0, amount: 1, staminaCost: 1500, snapshot: true }
  ], {
    budget: 1000,
    dist: postAttackDist,
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    reloginDelayMs: 1800000
  });
  results.push({
    name: 'stamina-budget-nearest-coin-exit-summary',
    passed: nearestCoinExit?.id === 'near'
      && nearestCoinExit?.distance === 100
      && nearestCoinExit?.requiredMs === 1500
      && nearestCoinExit?.reloginDelayMs === 1800000
      && nearestCoinExit?.snapshot === true
  });

  const dailyFinalCoin = pickNearestDailyStaminaFinalCoinCore([
    { drop_id: 'snapshot', amount: 10, distance: 50, staminaCost: 600, snapshotOnly: true },
    { drop_id: 'far', amount: 5, distance: 500, staminaCost: 600 },
    { drop_id: 'near', amount: 1, distance: 100, staminaCost: 600 },
    { drop_id: 'affordable', amount: 20, distance: 10, staminaCost: 300 }
  ], {
    coinStaminaCost: coin => Number(coin.staminaCost || 0),
    oneHourBudget: 1000,
    oneDayBudget: 500,
    isSnapshotOnlyCoin: coin => Boolean(coin.snapshotOnly)
  });
  results.push({
    name: 'stamina-budget-daily-final-picks-nearest-visible-limiting-coin',
    passed: dailyFinalCoin?.drop_id === 'near'
  });

  const chaseSelf = { user_id: 'self', x: 0, y: 0 };
  const chaseDist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const chaseCandidates = aggregateChaseCandidates([
    {
      source: 'snapshot',
      items: [
        { user_id: 'a', name: 'A-old', x: 10000, y: 0, drop: 15, hp: 80, snapshot: true, observedAt: 1000 },
        { user_id: 'b', name: 'B', x: 4000, y: 0, drop: 11, hp: 60, snapshot: true, observedAt: 1000 }
      ]
    },
    {
      source: 'native',
      items: [
        { user_id: 'a', name: 'A-live', x: 2000, y: 0, drop: 12, hp: 70, native: true, observedAt: 1200 }
      ]
    },
    {
      source: 'minimap',
      items: [
        { user_id: 'c', x: 1000, y: 0, drop: 20, minimapOnly: true, observedAt: 1200 }
      ]
    }
  ], { self: chaseSelf, dist: chaseDist, nowMs: 1200 });
  const chaseA = chaseCandidates.find(item => item.id === 'a');
  const chaseC = chaseCandidates.find(item => item.id === 'c');
  results.push({
    name: 'chase-mode-aggregation-prefers-native-position-and-preserves-drop-metadata',
    passed: chaseA?.name === 'A-live'
      && chaseA?.x === 2000
      && chaseA?.visible === true
      && chaseA?.drop === 15
      && chaseA?.latestDrop === 12
      && chaseC?.minimapOnly === true
      && chaseC?.visible === false
  });

  const chaseInvulnerableCandidate = normalizeChaseCandidate({
    user_id: 'shielded',
    name: 'Shielded',
    x: 3000,
    y: 0,
    drop: 20,
    hp: 100,
    native: true,
    invulnerable_remaining_ticks: 50
  }, { self: chaseSelf, dist: chaseDist, nowMs: 1300 });
  const chaseInvulnerableTargets = decorateChaseTargets(
    normalizeChaseModeState({ targets: [{ id: 'shielded', dropAtMark: 20, lastDrop: 20 }] }),
    [{ ...chaseInvulnerableCandidate, seekableNow: true, attackableNow: false }],
    { nowMs: 1300 }
  );
  const chaseInvulnerablePicked = chooseChaseTarget(chaseInvulnerableTargets, null, {
    nowMs: 1300,
    stickMs: 0,
    minDrop: 10
  });
  results.push({
    name: 'chase-mode-invulnerable-target-keeps-remaining-time-and-remains-seekable',
    passed: chaseInvulnerableCandidate?.invulnerable === true
      && chaseInvulnerableCandidate?.invulnerableRemainingTicks === 50
      && chaseInvulnerableCandidate?.invulnerableRemainingMs === 2500
      && chaseInvulnerableTargets[0]?.seekableNow === true
      && chaseInvulnerableTargets[0]?.attackableNow === false
      && chaseInvulnerablePicked?.id === 'shielded'
  });

  const chasePanelPool = [];
  for (let i = 0; i < 12; i += 1) {
    chasePanelPool.push({ id: 'drop-' + i, name: 'D' + i, drop: 30 - i, distance: 100000 + i, marked: false });
  }
  for (let i = 0; i < 12; i += 1) {
    chasePanelPool.push({ id: 'near-' + i, name: 'N' + i, drop: 10 + i, distance: i + 1, marked: false });
  }
  const chasePanel = selectPanelCandidates(chasePanelPool, [{ id: 'marked' }], {
    minDrop: 10,
    topDropLimit: 10,
    nearestLimit: 10,
    maxCandidates: 20
  });
  results.push({
    name: 'chase-mode-panel-candidates-use-top-drop-nearest-union-cap',
    passed: chasePanel.length === 20
      && chasePanel.some(item => item.id === 'drop-0')
      && chasePanel.some(item => item.id === 'near-0')
      && !chasePanel.some(item => item.id === 'drop-11')
  });

  const chaseState = normalizeChaseModeState({
    targets: [
      { id: 'far', name: 'Far', dropAtMark: 18, lastDrop: 18, markedAt: 100 },
      { id: 'near', name: 'Near', dropAtMark: 16, lastDrop: 16, markedAt: 100 }
    ]
  });
  const decoratedChaseTargets = decorateChaseTargets(chaseState, [
    { id: 'far', name: 'Far', drop: 18, distance: 5000, seekableNow: true },
    { id: 'near', name: 'Near', drop: 16, distance: 1000, seekableNow: true }
  ], { nowMs: 500 });
  const chaseSticky = chooseChaseTarget(decoratedChaseTargets, { id: 'far', at: 100 }, {
    nowMs: 500,
    stickMs: 1000,
    minDrop: 10
  });
  const chaseNearest = chooseChaseTarget(decoratedChaseTargets, { id: 'far', at: 100 }, {
    nowMs: 2000,
    stickMs: 1000,
    minDrop: 10
  });
  results.push({
    name: 'chase-mode-target-selection-sticks-then-picks-nearest',
    passed: chaseSticky?.id === 'far' && chaseNearest?.id === 'near'
  });

  const lowDropDecorated = decorateChaseTargets(
    normalizeChaseModeState({ targets: [{ id: 'low', dropAtMark: 14, lastDrop: 14 }] }),
    [{ id: 'low', drop: 7, latestDrop: 7, distance: 1000, seekableNow: true, source: 'snapshot', observedAt: 1000, explicitFreshDropLow: true }],
    { nowMs: 1100 }
  );
  const minimapOnlyDecorated = decorateChaseTargets(
    normalizeChaseModeState({ targets: [{ id: 'mini', dropAtMark: 20, lastDrop: 20 }] }),
    [{ id: 'mini', drop: 20, distance: 500, seekableNow: true, visible: false, minimapOnly: true, source: 'minimap' }],
    { nowMs: 1100 }
  );
  results.push({
    name: 'chase-mode-state-retains-targets-but-exposes-low-drop-and-minimap-status',
    passed: lowDropDecorated[0]?.explicitFreshDropLow === true
      && minimapOnlyDecorated[0]?.visible === false
      && minimapOnlyDecorated[0]?.seekableNow === true
  });
  const visibleLowDropCandidate = {
    id: 'visible-low',
    drop: 0,
    latestDrop: 0,
    visible: true,
    native: true,
    explicitFreshDropLow: true
  };
  const visibleLowDropFirst = chaseLowDropClearDecision(visibleLowDropCandidate, null, {
    nowMs: 1000,
    visibleGraceMs: 1500
  });
  const visibleLowDropPending = chaseLowDropClearDecision(visibleLowDropCandidate, visibleLowDropFirst.observation, {
    nowMs: 2200,
    visibleGraceMs: 1500
  });
  const visibleLowDropMature = chaseLowDropClearDecision(visibleLowDropCandidate, visibleLowDropFirst.observation, {
    nowMs: 2600,
    visibleGraceMs: 1500
  });
  const snapshotLowDropClear = chaseLowDropClearDecision({
    id: 'snapshot-low',
    drop: 0,
    latestDrop: 0,
    snapshot: true,
    source: 'snapshot',
    explicitFreshDropLow: true
  }, null, { nowMs: 1000, visibleGraceMs: 1500 });
  results.push({
    name: 'chase-mode-visible-low-drop-clear-waits-for-grace-window',
    passed: visibleLowDropFirst.pending === true
      && visibleLowDropFirst.clear === false
      && visibleLowDropFirst.observation?.since === 1000
      && visibleLowDropPending.clear === false
      && visibleLowDropMature.clear === true
      && snapshotLowDropClear.clear === true
      && snapshotLowDropClear.pending === false
  });

  const killedSuppression = { id: 'killed', killedAt: 5000 };
  const staleKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    observedAt: 4900
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const liveResidualKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    native: true
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const freshKilledCandidate = normalizeChaseCandidate({
    user_id: 'killed',
    name: 'Killed',
    drop: 20,
    x: 1000,
    y: 0,
    observedAt: 5100
  }, { self: chaseSelf, dist: chaseDist, nowMs: 6000 });
  const staleSuppressionDecision = chaseKilledCandidateSuppressionDecision(staleKilledCandidate, killedSuppression);
  const liveResidualSuppressionDecision = chaseKilledCandidateSuppressionDecision(liveResidualKilledCandidate, killedSuppression);
  const freshSuppressionDecision = chaseKilledCandidateSuppressionDecision(freshKilledCandidate, killedSuppression);
  const nativeGlobalResidualCandidate = aggregateChaseCandidates(buildChaseSourceListsCore({
    globalTargets: [{
      user_id: 'killed',
      name: 'Killed',
      drop: 20,
      x: 1000,
      y: 0,
      native: true,
      global: true
    }]
  }, { snapshotRefreshedAt: 5100 }), { self: chaseSelf, dist: chaseDist, nowMs: 6000 })[0];
  const nativeGlobalSuppressionDecision = chaseKilledCandidateSuppressionDecision(nativeGlobalResidualCandidate, killedSuppression);
  results.push({
    name: 'chase-mode-killed-target-suppression-waits-for-explicit-new-observation',
    passed: staleSuppressionDecision.suppress === true
      && liveResidualSuppressionDecision.suppress === true
      && liveResidualSuppressionDecision.observedAt === 0
      && nativeGlobalSuppressionDecision.suppress === true
      && nativeGlobalSuppressionDecision.observedAt === 0
      && freshSuppressionDecision.release === true
      && freshSuppressionDecision.observedAt === 5100
  });

  // Test combat constants validation
  const combatErrors = validateCombatConstants();
  results.push({
    name: 'combat-constants-valid',
    passed: combatErrors.length === 0,
    errors: combatErrors
  });

  const hpExitThresholds = combatHpExitThresholdsCore();
  results.push({
    name: 'combat-exit-static-hp-boundaries',
    passed: hpExitThresholds.criticalHp === 20
      && hpExitThresholds.lowHp === 50
      && hpExitThresholds.disadvantageHpGap === 20
      && evaluateCombatHpExitCore({ selfHp: 19, targetHp: 10 })?.rule === 'critical-hp'
      && evaluateCombatHpExitCore({ selfHp: 20, targetHp: 20 }) === null
      && evaluateCombatHpExitCore({ selfHp: 49, targetHp: 50 })?.rule === 'low-hp-behind'
      && evaluateCombatHpExitCore({ selfHp: 49, targetHp: 49 }) === null
      && evaluateCombatHpExitCore({ selfHp: 80, targetHp: 100 })?.rule === 'clear-hp-gap'
      && evaluateCombatHpExitCore({ selfHp: 80, targetHp: 99 }) === null
  });

  results.push({
    name: 'combat-exit-does-not-leave-winning-or-unattributed-healthy-fight',
    passed: evaluateCombatHpExitCore({ selfHp: 94, targetHp: 46 }) === null
      && evaluateCombatHpExitCore({ selfHp: 65, targetHp: null }) === null
      && evaluateCombatHpExitCore({ selfHp: 19, targetHp: null })?.reason === 'combat-critical-hp-leave'
  });

  const predictedCritical = evaluatePredictedLeaveHpCore({
    selfHp: 21,
    directHits: 1,
    unavoidableHits: 1,
    recentDamage: 0,
    recentDamageWindowMs: 0,
    commandDelayMs: 250
  });
  const predictedRateLoss = evaluatePredictedLeaveHpCore({
    selfHp: 73,
    directHits: 0,
    unavoidableHits: 0,
    recentDamage: 27,
    recentDamageWindowMs: 600,
    commandDelayMs: 250
  });
  const predictedSafe = evaluatePredictedLeaveHpCore({
    selfHp: 94,
    directHits: 0,
    unavoidableHits: 0,
    recentDamage: 3,
    recentDamageWindowMs: 1000,
    commandDelayMs: 250
  });
  results.push({
    name: 'combat-exit-predicts-leave-window-damage-with-one-hit-uncertainty',
    passed: predictedCritical.shouldLeave === true
      && predictedCritical.windowMs === 1250
      && predictedCritical.predictedDamage === 3
      && predictedCritical.riskAdjustedHp === 15
      && predictedRateLoss.shouldLeave === true
      && predictedRateLoss.predictedDamage >= 56
      && predictedSafe.shouldLeave === false
  });

  results.push({
    name: 'combat-incoming-shooter-switch-requires-hit-corridor-and-urgency',
    passed: incomingBulletHasCollisionRiskCore({ cpa: 90 })
      && !incomingBulletHasCollisionRiskCore({ cpa: 91 })
      && !incomingBulletHasCollisionRiskCore({ cpa: null })
      && incomingBulletRequiresTargetSwitchCore({ cpa: 50, distance: 6500, timeToImpact: 1200 }, {
        combatTargetSwitchIncomingDistance: 6500,
        combatTargetSwitchIncomingTimeMs: 900
      })
      && !incomingBulletRequiresTargetSwitchCore({ cpa: 1000, distance: 1000, timeToImpact: 100 }, {
        combatTargetSwitchIncomingDistance: 6500,
        combatTargetSwitchIncomingTimeMs: 900
      })
  });

  const pendingDisadvantage = evaluateConfirmedCombatHpExitCore({
    selfHp: 64,
    targetHp: 100,
    nowMs: 1057,
    disadvantageSinceAt: 1000,
    combatStartedAt: 1000,
    sampleCount: 1
  });
  const confirmedDisadvantage = evaluateConfirmedCombatHpExitCore({
    selfHp: 70,
    targetHp: 90,
    nowMs: 4500,
    disadvantageSinceAt: 1000,
    combatStartedAt: 1000,
    sampleCount: 4
  });
  const damageConfirmedDisadvantage = evaluateConfirmedCombatHpExitCore({
    selfHp: 64,
    targetHp: 100,
    nowMs: 1057,
    disadvantageSinceAt: 1000,
    combatStartedAt: 1000,
    sampleCount: 1,
    confirmedSelfDamage: 3
  });
  results.push({
    name: 'combat-clear-hp-gap-confirms-new-target-but-preserves-immediate-damage-exit',
    passed: pendingDisadvantage.exit === null
      && pendingDisadvantage.disadvantageObservation?.ready === false
      && confirmedDisadvantage.exit?.reason === 'combat-hp-disadvantage-leave'
      && confirmedDisadvantage.disadvantageObservation?.ready === true
      && damageConfirmedDisadvantage.exit?.reason === 'combat-hp-disadvantage-leave'
      && damageConfirmedDisadvantage.disadvantageObservation?.kind === 'confirmed-target-damage'
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
